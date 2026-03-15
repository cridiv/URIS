import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GetObjectCommand, S3Client } from '@aws-sdk/client-s3';
import FormData = require('form-data');
import fetch from 'node-fetch';
import { Readable } from 'stream';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { S3StorageService } from '../aws/s3.storage';
import { PolicyService } from '../policy/policy.service';

interface AgentReasoningEvent {
  type: 'agent_start' | 'agent_data' | 'agent_complete';
  agent: string;
  ts?: number;
  payload?: Record<string, unknown>;
}

@Injectable()
export class AgentsService {
  private readonly agentsUrl: string;
  private readonly s3Client: S3Client;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly storage: S3StorageService,
    private readonly policyService: PolicyService,
  ) {
    this.agentsUrl = config.get<string>('app.agentsUrl') ?? 'https://uris-agent.onrender.com';
    this.s3Client = new S3Client({
      region: config.get<string>('app.s3.region') ?? 'us-east-1',
      tls: true,
      ...(config.get('app.s3.accessKeyId') && {
        credentials: {
          accessKeyId: config.get<string>('app.s3.accessKeyId')!,
          secretAccessKey: config.get<string>('app.s3.secretAccessKey')!,
        },
      }),
    });
  }

  /**
   * Get all agent runs for a specific dataset
   */
  async getDatasetRuns(userId: string, datasetId: string) {
    // Verify dataset exists
    const dataset = await this.prisma.dataset.findUnique({
      where: { id: datasetId },
      include: {
        runs: {
          orderBy: { createdAt: 'desc' },
          take: 10, // Get last 10 runs
        },
      },
    });

    if (!dataset) {
      throw new NotFoundException(`Dataset ${datasetId} not found`);
    }

    if (dataset.userId !== userId) {
      throw new NotFoundException(`Dataset ${datasetId} not found`);
    }

    // Return formatted dataset + runs for frontend consumption
    return {
      dataset: {
        id: dataset.id,
        userId: dataset.userId,
        name: dataset.name,
        rowCount: dataset.rowCount,
        columnCount: dataset.columnCount,
        sizeBytes: dataset.sizeBytes.toString(),
        profileMeta: dataset.profileMeta,
        status: dataset.status,
      },
      runs: dataset.runs,
    };
  }

  /**
   * Start agent orchestration for a dataset
   * Returns immediately with the run ID (202 Accepted)
   * Pipeline execution happens in background
   */
  async orchestrateAgents(userId: string, datasetId: string, backendUrl?: string) {
    // Verify dataset exists and is ready
    const dataset = await this.prisma.dataset.findUnique({
      where: { id: datasetId },
    });

    if (!dataset) {
      throw new NotFoundException(`Dataset ${datasetId} not found`);
    }

    if (dataset.userId !== userId) {
      throw new NotFoundException(`Dataset ${datasetId} not found`);
    }

    if (dataset.status !== 'ready') {
      throw new Error(`Dataset ${datasetId} is not ready for orchestration. Current status: ${dataset.status}`);
    }

    // Create run record
    const run = await this.prisma.agentRun.create({
      data: {
        datasetId,
        status: 'analyzing',
        task: `${dataset.name.replace(/\.[^/.]+$/, '')}_analysis`,
      },
    });

    // Start pipeline execution in background (don't await)
    this.executePipelineInBackground(dataset, run.id, backendUrl);

    // Return immediately with run ID (202 Accepted pattern)
    return {
      run: {
        id: run.id,
        status: 'analyzing',
        datasetId,
      },
      message: 'Orchestration started',
    };
  }

  /**
   * Execute pipeline in background without blocking response
   */
  private async executePipelineInBackground(dataset: any, runId: string, overrideBackendUrl?: string) {
    try {
      console.log(`[AgentsService] Starting background execution for run ${runId}...`);
      const object = await this.s3Client.send(
        new GetObjectCommand({
          Bucket: dataset.s3Bucket,
          Key: dataset.s3Key,
        }),
      );

      const fileBuffer = await this.streamToBuffer(object.Body as Readable);
      const form = new FormData();
      form.append('file', fileBuffer, {
        filename: dataset.name,
        contentType: dataset.mimeType,
      });
      form.append('task_type', 'classification');
      form.append(
        'user_goal',
        `Analyze dataset ${dataset.name} and run full URIS orchestration.`,
      );
      form.append('target_column', 'None');

      // Attach latest policy config for this dataset (if present) so
      // evaluation/compliance receives directives during the actual run.
      const policyConfig = this.policyService.getPolicyConfig(dataset.id);
      if (policyConfig) {
        form.append('policy_config', JSON.stringify(policyConfig));
        console.log(
          `[AgentsService] Attached policy config (${policyConfig.resolved_directives.length} directives)`,
        );
      }

      // Get base URL for callback (use override from header if provided)
      const backendUrl = overrideBackendUrl ?? this.config.get<string>('app.backendUrl') ?? 'https://uris.onrender.com';

      console.log(`[AgentsService] Sending file to Python backend: ${this.agentsUrl}/pipeline/run`);
      console.log(`[AgentsService] Event callback URL: ${backendUrl}`);

      const response = await fetch(`${this.agentsUrl}/pipeline/run`, {
        method: 'POST',
        headers: {
          ...form.getHeaders(),
          'X-Dataset-Id': dataset.id,
          'X-Run-Id': runId,
          'X-Backend-Url': backendUrl,
        },
        body: form,
      });

      if (!response.ok) {
        const error = await response.text();
        console.error(`[AgentsService] Python backend error: ${error}`);
        throw new Error(`Agents service error: ${error}`);
      }

      console.log(`[AgentsService] ✅ Pipeline execution completed for run ${runId}`);
      const result = (await response.json()) as Record<string, unknown>;
      const pipelineResult =
        (result.pipeline_result as Record<string, unknown> | undefined) ?? result;
      const pipelineStatusRaw =
        (typeof pipelineResult.status === 'string' && pipelineResult.status) ||
        (typeof result.status === 'string' && result.status) ||
        'success';
      const pipelineStatus = pipelineStatusRaw.toLowerCase();
      const evaluation =
        (pipelineResult.evaluation as Record<string, unknown> | undefined) ?? {};
      const compliance =
        (pipelineResult.compliance as Record<string, unknown> | undefined) ?? {};
      const validation =
        (pipelineResult.validation as Record<string, unknown> | undefined) ?? {};
      const validationVerdict =
        typeof validation.verdict === 'string' ? validation.verdict.toLowerCase() : null;

      const adfiRaw = evaluation.adfi;
      const adfiScore =
        typeof adfiRaw === 'number'
          ? adfiRaw
          : typeof adfiRaw === 'string'
            ? Number(adfiRaw)
            : null;

      const privacyRisk = compliance.privacy_risk_score;
      const privacyRiskScore =
        typeof privacyRisk === 'number'
          ? privacyRisk
          : typeof privacyRisk === 'string'
            ? Number(privacyRisk)
            : null;
      const complianceStatusRaw =
        (typeof compliance.status === 'string' && compliance.status) ||
        (typeof (compliance.privacy_report as Record<string, unknown> | undefined)?.status === 'string'
          ? ((compliance.privacy_report as Record<string, unknown>).status as string)
          : null) ||
        (typeof (compliance.correlation_report as Record<string, unknown> | undefined)?.status === 'string'
          ? ((compliance.correlation_report as Record<string, unknown>).status as string)
          : null);
      const normalizedComplianceStatus = complianceStatusRaw?.toLowerCase();

      const runFailed =
        pipelineStatus.includes('error') ||
        pipelineStatus.includes('failed') ||
        validationVerdict === 'reject';

      const syntheticDataS3Key = runFailed
        ? null
        : await this.persistSyntheticArtifact(result, dataset.id, runId);

      await this.prisma.agentRun.update({
        where: { id: runId },
        data: {
          status: runFailed ? 'failed' : 'completed',
          adfiScore,
          complianceStatus:
            normalizedComplianceStatus === 'pass' || normalizedComplianceStatus === 'passed'
              ? 'passed'
              : normalizedComplianceStatus === 'fail' || normalizedComplianceStatus === 'failed'
                ? 'failed'
                : privacyRiskScore === null
                  ? null
                  : privacyRiskScore <= 0.35
                    ? 'passed'
                    : 'failed',
          syntheticDataS3Key,
          result: result as object,
        },
      });
    } catch (error) {
      await this.prisma.agentRun.update({
        where: { id: runId },
        data: {
          status: 'failed',
          errorMsg:
            error instanceof Error ? error.message : 'Failed to orchestrate agents',
        },
      });
    }
  }

  /**
   * Get a specific agent run result
   */
  async getRunResult(userId: string, datasetId: string, runId: string) {
    // Verify dataset exists
    const dataset = await this.prisma.dataset.findUnique({
      where: { id: datasetId },
    });

    if (!dataset) {
      throw new NotFoundException(`Dataset ${datasetId} not found`);
    }

    if (dataset.userId !== userId) {
      throw new NotFoundException(`Dataset ${datasetId} not found`);
    }

    // Retrieve specific run result
    const run = await this.prisma.agentRun.findFirst({
      where: {
        id: runId,
        datasetId: datasetId,
      },
    });

    if (!run) {
      throw new NotFoundException(`Run ${runId} not found for dataset ${datasetId}`);
    }

    return run;
  }

  /**
   * Persist every agent event so audit log can render full payload history,
   * not only the compact pipeline trace.
   */
  async recordRunEvent(
    datasetId: string,
    runId: string,
    event: AgentReasoningEvent,
  ): Promise<void> {
    const run = await this.prisma.agentRun.findFirst({
      where: {
        id: runId,
        datasetId,
      },
      select: {
        id: true,
        analysis: true,
      },
    });

    if (!run) {
      return;
    }

    const analysis =
      run.analysis && typeof run.analysis === 'object' && !Array.isArray(run.analysis)
        ? { ...(run.analysis as Record<string, unknown>) }
        : {};

    const existingEventsRaw = analysis.audit_events;
    const existingEvents = Array.isArray(existingEventsRaw)
      ? [...existingEventsRaw]
      : [];

    const tsIso =
      typeof event.ts === 'number' && Number.isFinite(event.ts)
        ? new Date(event.ts).toISOString()
        : new Date().toISOString();

    const normalizedEvent: Record<string, unknown> = {
      type: event.type,
      agent: event.agent,
      ts: tsIso,
      payload: event.payload ?? {},
    };

    const MAX_AUDIT_EVENTS = 5000;
    const nextEvents = [...existingEvents, normalizedEvent].slice(-MAX_AUDIT_EVENTS);
    analysis.audit_events = nextEvents;

    await this.prisma.agentRun.update({
      where: { id: runId },
      data: {
        analysis: analysis as Prisma.InputJsonValue,
        updatedAt: new Date(),
      },
    });
  }

  private async streamToBuffer(stream: Readable): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const chunks: Buffer[] = [];
      stream.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
      stream.on('end', () => resolve(Buffer.concat(chunks)));
      stream.on('error', reject);
    });
  }

  private extractDownloadUrl(result: Record<string, unknown>): string | null {
    if (typeof result.download_url === 'string') {
      return result.download_url;
    }

    if (
      result.pipeline_result &&
      typeof (result.pipeline_result as Record<string, unknown>).download_url === 'string'
    ) {
      return (result.pipeline_result as Record<string, unknown>).download_url as string;
    }

    return null;
  }

  private async persistSyntheticArtifact(
    result: Record<string, unknown>,
    datasetId: string,
    runId: string,
  ): Promise<string | null> {
    const relDownloadUrl = this.extractDownloadUrl(result);

    if (!relDownloadUrl) {
      return null;
    }

    const downloadUrl = relDownloadUrl.startsWith('http')
      ? relDownloadUrl
      : `${this.agentsUrl}${relDownloadUrl.startsWith('/') ? '' : '/'}${relDownloadUrl}`;

    const csvResponse = await fetch(downloadUrl);
    if (!csvResponse.ok) {
      throw new Error(
        `Failed to download synthetic CSV from ${downloadUrl}: ${csvResponse.status} ${csvResponse.statusText}`,
      );
    }

    const csvBuffer = await (csvResponse.buffer() as Promise<Buffer>);
    if (!csvBuffer || csvBuffer.length === 0) {
      throw new Error('Downloaded CSV file is empty');
    }

    const syntheticS3Key = `synthetic/${datasetId}/${runId}/augmented_dataset.csv`;
    const { s3Key: uploadedKey } = await this.storage.upload(
      csvBuffer,
      syntheticS3Key,
      'text/csv',
    );

    return uploadedKey;
  }

  /**
   * Generate synthetic data based on synthesis agent results
   */
  async generateSyntheticData(userId: string, datasetId: string, runId: string) {
    // Verify run exists
    const run = await this.prisma.agentRun.findFirst({
      where: {
        id: runId,
        datasetId: datasetId,
      },
    });

    if (!run) {
      throw new NotFoundException(`Run ${runId} not found for dataset ${datasetId}`);
    }

    // Allow synthetic generation if:
    // - status is 'completed' OR
    // - status is 'analyzing' but result has pipeline data (synthesis completed)
    const hasResult = run.result && typeof run.result === 'object' && Object.keys(run.result).length > 0;
    if (run.status === 'analyzing' && !hasResult) {
      throw new Error(`Run ${runId} is still analyzing. Synthesis has not completed yet. Current status: ${run.status}`);
    }

    const dataset = await this.prisma.dataset.findUnique({
      where: { id: datasetId },
    });

    if (!dataset) {
      throw new NotFoundException(`Dataset ${datasetId} not found`);
    }

    if (dataset.userId !== userId) {
      throw new NotFoundException(`Dataset ${datasetId} not found`);
    }

    if (run.syntheticDataS3Key) {
      const downloadUrl = await this.storage.getPresignedDownloadUrl(
        run.syntheticDataS3Key,
        3600,
      );

      return {
        status: 'success',
        message: 'Stored synthetic data loaded successfully',
        downloadUrl,
        syntheticDataS3Key: run.syntheticDataS3Key,
        runId,
        datasetId,
      };
    }

    const existingRunResult =
      run.result && typeof run.result === 'object'
        ? (run.result as Record<string, unknown>)
        : null;

    if (existingRunResult && this.extractDownloadUrl(existingRunResult)) {
      try {
        const uploadedKey = await this.persistSyntheticArtifact(
          existingRunResult,
          datasetId,
          runId,
        );

        if (uploadedKey) {
          await this.prisma.agentRun.update({
            where: { id: runId },
            data: {
              syntheticDataS3Key: uploadedKey,
              updatedAt: new Date(),
            },
          });

          const downloadUrl = await this.storage.getPresignedDownloadUrl(uploadedKey, 3600);

          return {
            status: 'success',
            message: 'Synthetic data loaded from the completed orchestration run',
            downloadUrl,
            syntheticDataS3Key: uploadedKey,
            runId,
            datasetId,
          };
        }
      } catch (error) {
        console.warn(
          `[generateSyntheticData] Failed to reuse original synthetic artifact for run ${runId}:`,
          error,
        );
      }
    }

    const runResult = (run.result as Record<string, unknown> | null) ?? {};
    const runPipelineResult =
      (runResult.pipeline_result as Record<string, unknown> | undefined) ?? runResult;
    const plan = (runPipelineResult.plan as Record<string, unknown> | undefined) ?? {};

    const targetColumn =
      typeof plan.target_column === 'string' && plan.target_column.trim().length > 0
        ? plan.target_column
        : undefined;
    const userGoal =
      typeof plan.objective === 'string' && plan.objective.trim().length > 0
        ? plan.objective
        : `Generate synthetic dataset for ${dataset.name}`;

    const object = await this.s3Client.send(
      new GetObjectCommand({
        Bucket: dataset.s3Bucket,
        Key: dataset.s3Key,
      }),
    );

    const fileBuffer = await this.streamToBuffer(object.Body as Readable);
    const form = new FormData();
    form.append('file', fileBuffer, {
      filename: dataset.name,
      contentType: dataset.mimeType,
    });
    form.append('task_type', 'classification');
    form.append('user_goal', userGoal);
    form.append('target_column', targetColumn ?? 'None');
    form.append('validate_synthesis', 'true');

    const response = await fetch(`${this.agentsUrl}/pipeline/run`, {
      method: 'POST',
      headers: {
        ...form.getHeaders(),
      },
      body: form,
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Synthetic generation failed: ${error}`);
    }

    const result = (await response.json()) as Record<string, unknown>;
    const pipelineResult =
      (result.pipeline_result as Record<string, unknown> | undefined) ?? result;
    const pipelineStatusRaw =
      (typeof pipelineResult.status === 'string' && pipelineResult.status) ||
      (typeof result.status === 'string' && result.status) ||
      'success';
    const pipelineStatus = pipelineStatusRaw.toLowerCase();

    if (pipelineStatus.includes('failed') || pipelineStatus.includes('error')) {
      const validation =
        (pipelineResult.validation as Record<string, unknown> | undefined) ?? {};
      const validationInner =
        (validation.validation as Record<string, unknown> | undefined) ?? validation;
      const rejectionReasons = Array.isArray(validationInner.rejection_reasons)
        ? (validationInner.rejection_reasons as Array<unknown>)
            .map((r) => (typeof r === 'string' ? r : JSON.stringify(r)))
            .filter((r) => r.length > 0)
        : [];

      const failureReason =
        rejectionReasons[0] ||
        (typeof pipelineResult.message === 'string' ? pipelineResult.message : '') ||
        (typeof (pipelineResult as Record<string, unknown>).warning === 'string'
          ? ((pipelineResult as Record<string, unknown>).warning as string)
          : '') ||
        'Validation rejected synthetic output; returning original dataset.';

      const originalPresignedUrl = await this.storage.getPresignedDownloadUrl(
        dataset.s3Key,
        3600,
      );

      await this.prisma.agentRun.update({
        where: { id: runId },
        data: {
          status: 'failed',
          errorMsg: failureReason,
          syntheticDataS3Key: null,
          updatedAt: new Date(),
        },
      });

      return {
        status: 'failed',
        message: 'Validation failed. Returning original dataset.',
        failureReason,
        isFallback: true,
        downloadUrl: originalPresignedUrl,
        runId,
        datasetId,
      };
    }
    
    // Handle both direct download_url and nested in pipeline_result
    const relDownloadUrl = this.extractDownloadUrl(result);

    if (!relDownloadUrl) {
      console.error('Python response:', JSON.stringify(result, null, 2));
      throw new Error('Synthetic generation completed but no downloadable CSV was produced');
    }

    const downloadUrl = relDownloadUrl.startsWith('http')
      ? relDownloadUrl
      : `${this.agentsUrl}${relDownloadUrl.startsWith('/') ? '' : '/'}${relDownloadUrl}`;

    console.log('[generateSyntheticData] Attempting to download from:', downloadUrl);

    // Download the synthetic CSV from Python backend
    const csvResponse = await fetch(downloadUrl);
    if (!csvResponse.ok) {
      console.error(`[generateSyntheticData] Download failed - Status: ${csvResponse.status} ${csvResponse.statusText}, URL: ${downloadUrl}`);
      throw new Error(`Failed to download synthetic CSV from ${downloadUrl}: ${csvResponse.status} ${csvResponse.statusText}`);
    }

    const csvBuffer = await (csvResponse.buffer() as Promise<Buffer>);
    
    if (!csvBuffer || csvBuffer.length === 0) {
      throw new Error('Downloaded CSV file is empty');
    }

    console.log(`[generateSyntheticData] Successfully downloaded ${csvBuffer.length} bytes`);

    // Upload to S3
    const syntheticS3Key = `synthetic/${datasetId}/${runId}/augmented_dataset.csv`;
    const { s3Key: uploadedKey } = await this.storage.upload(
      csvBuffer,
      syntheticS3Key,
      'text/csv',
    );

    // Generate presigned URL for frontend download (expires in 1 hour)
    const presignedUrl = await this.storage.getPresignedDownloadUrl(uploadedKey, 3600);

    // Update run with synthetic data reference
    await this.prisma.agentRun.update({
      where: { id: runId },
      data: {
        status: 'completed',
        errorMsg: null,
        syntheticDataS3Key: uploadedKey,
        updatedAt: new Date(),
      },
    });

    return {
      status: 'success',
      message: 'Synthetic data generated successfully',
      downloadUrl: presignedUrl, // Return S3 presigned URL, not Python endpoint
      syntheticDataS3Key: uploadedKey,
      runId,
      datasetId,
    };
  }

  /**
   * Save analysis state to database
   * Stores evaluation, compliance, synthesis, validation results
   */
  async saveAnalysis(
    userId: string,
    datasetId: string,
    runId: string,
    analysisData: Record<string, unknown>,
  ) {
    const dataset = await this.prisma.dataset.findUnique({
      where: { id: datasetId },
      select: { id: true, userId: true },
    });

    if (!dataset || dataset.userId !== userId) {
      throw new NotFoundException(`Dataset ${datasetId} not found`);
    }

    // Verify run exists
    const run = await this.prisma.agentRun.findFirst({
      where: {
        id: runId,
        datasetId: datasetId,
      },
    });

    if (!run) {
      throw new NotFoundException(`Run ${runId} for dataset ${datasetId} not found`);
    }

    const existingAnalysis =
      run.analysis && typeof run.analysis === 'object' && !Array.isArray(run.analysis)
        ? { ...(run.analysis as Record<string, unknown>) }
        : {};

    const mergedAnalysis: Record<string, unknown> = {
      ...existingAnalysis,
      ...analysisData,
    };

    // Preserve and accumulate persisted audit history unless caller explicitly
    // provides a richer audit stream. This prevents sparse save-analysis calls
    // from wiping real-time event context collected during orchestration.
    const existingEventsRaw = existingAnalysis.audit_events;
    const incomingEventsRaw = analysisData.audit_events;
    const existingEvents = Array.isArray(existingEventsRaw) ? existingEventsRaw : [];
    const incomingEvents = Array.isArray(incomingEventsRaw) ? incomingEventsRaw : [];
    if (incomingEvents.length === 0 && existingEvents.length > 0) {
      mergedAnalysis.audit_events = existingEvents;
    } else if (incomingEvents.length > 0 && existingEvents.length > 0) {
      const MAX_AUDIT_EVENTS = 5000;
      mergedAnalysis.audit_events = [...existingEvents, ...incomingEvents].slice(-MAX_AUDIT_EVENTS);
    }

    // Update run with merged analysis
    const updated = await this.prisma.agentRun.update({
      where: { id: runId },
      data: {
        analysis: mergedAnalysis as Prisma.InputJsonValue,
        updatedAt: new Date(),
      },
    });

    return {
      status: 'success',
      message: 'Analysis saved successfully',
      run: updated,
    };
  }

  /**
   * Retrieve saved analysis state from database
   */
  async getAnalysis(
    userId: string,
    datasetId: string,
    runId: string,
  ) {
    const dataset = await this.prisma.dataset.findUnique({
      where: { id: datasetId },
      select: { id: true, userId: true },
    });

    if (!dataset || dataset.userId !== userId) {
      throw new NotFoundException(`Dataset ${datasetId} not found`);
    }

    // Verify run exists
    const run = await this.prisma.agentRun.findFirst({
      where: {
        id: runId,
        datasetId: datasetId,
      },
    });

    if (!run) {
      throw new NotFoundException(`Run ${runId} for dataset ${datasetId} not found`);
    }

    return {
      status: 'success',
      analysis: run.analysis,
      syntheticDataS3Key: run.syntheticDataS3Key,
      run,
    };
  }

  /**
   * Return a presigned URL for previously generated synthetic data.
   */
  async getSyntheticDownload(
    userId: string,
    datasetId: string,
    runId: string,
  ) {
    const dataset = await this.prisma.dataset.findUnique({
      where: { id: datasetId },
      select: { id: true, userId: true },
    });

    if (!dataset || dataset.userId !== userId) {
      throw new NotFoundException(`Dataset ${datasetId} not found`);
    }

    const run = await this.prisma.agentRun.findFirst({
      where: {
        id: runId,
        datasetId,
      },
    });

    if (!run) {
      throw new NotFoundException(`Run ${runId} for dataset ${datasetId} not found`);
    }

    if (!run.syntheticDataS3Key) {
      throw new BadRequestException(
        `No stored synthetic dataset found for run ${runId}`,
      );
    }

    const downloadUrl = await this.storage.getPresignedDownloadUrl(
      run.syntheticDataS3Key,
      3600,
    );

    return {
      status: 'success',
      runId,
      datasetId,
      syntheticDataS3Key: run.syntheticDataS3Key,
      downloadUrl,
    };
  }
}


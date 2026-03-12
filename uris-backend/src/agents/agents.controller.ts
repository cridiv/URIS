import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  HttpStatus,
  HttpCode,
  Headers,
} from '@nestjs/common';
import { AgentsService } from './agents.service';
import { AgentsGateway } from './agents.gateway';

interface AgentReasoningEventDTO {
  type: 'agent_start' | 'agent_data' | 'agent_complete';
  agent: string;
  ts?: number;
  payload?: Record<string, unknown>;
}

@Controller('agents')
export class AgentsController {
  constructor(
    private readonly agentsService: AgentsService,
    private readonly agentsGateway: AgentsGateway,
  ) {}

  /**
   * GET /agents/:datasetId
   * Get all agent runs for a specific dataset
   */
  @Get(':datasetId')
  async getDatasetRuns(@Param('datasetId') datasetId: string) {
    return this.agentsService.getDatasetRuns(datasetId);
  }

  /**
   * POST /agents/:datasetId/orchestrate
   * Start agent orchestration for a dataset (returns immediately with runId)
   * Pipeline executes in background, WebSocket streams updates to frontend
   */
  @Post(':datasetId/orchestrate')
  @HttpCode(HttpStatus.ACCEPTED)
  async orchestrateAgents(
    @Param('datasetId') datasetId: string,
    @Headers('x-backend-url') backendUrl?: string,
  ) {
    return this.agentsService.orchestrateAgents(datasetId, backendUrl);
  }

  /**
   * GET /agents/:datasetId/runs/:runId
   * Get a specific agent run result
   */
  @Get(':datasetId/runs/:runId')
  async getRunResult(
    @Param('datasetId') datasetId: string,
    @Param('runId') runId: string,
  ) {
    return this.agentsService.getRunResult(datasetId, runId);
  }

  /**
   * POST /agents/:datasetId/runs/:runId/events
   * Receive reasoning events from Python agents and broadcast via WebSocket
   * Called by Python backend during orchestration
   */
  @Post(':datasetId/runs/:runId/events')
  @HttpCode(HttpStatus.ACCEPTED)
  async receiveAgentEvent(
    @Param('datasetId') datasetId: string,
    @Param('runId') runId: string,
    @Body() event: AgentReasoningEventDTO,
  ) {
    console.log(`[AgentsController] Received event for run ${runId}:`, event);
    await this.agentsService.recordRunEvent(datasetId, runId, event);
    // Broadcast event to all connected WebSocket clients watching this run
    this.agentsGateway.emitToRun(datasetId, runId, event);
    return { ok: true, message: 'Event received and broadcasted' };
  }

  /**
   * POST /agents/:datasetId/runs/:runId/generate-synthetic
   * Generate synthetic data based on synthesis agent results
   */
  @Post(':datasetId/runs/:runId/generate-synthetic')
  @HttpCode(HttpStatus.OK)
  async generateSyntheticData(
    @Param('datasetId') datasetId: string,
    @Param('runId') runId: string,
  ) {
    return this.agentsService.generateSyntheticData(datasetId, runId);
  }

  /**
   * POST /agents/:datasetId/runs/:runId/save-analysis
   * Save the current analysis state (evaluation, compliance, synthesis, validation) to database
   */
  @Post(':datasetId/runs/:runId/save-analysis')
  @HttpCode(HttpStatus.OK)
  async saveAnalysis(
    @Param('datasetId') datasetId: string,
    @Param('runId') runId: string,
    @Body() analysisData: Record<string, unknown>,
  ) {
    return this.agentsService.saveAnalysis(datasetId, runId, analysisData);
  }

  /**
   * GET /agents/:datasetId/runs/:runId/analysis
   * Retrieve saved analysis state from database
   */
  @Get(':datasetId/runs/:runId/analysis')
  @HttpCode(HttpStatus.OK)
  async getAnalysis(
    @Param('datasetId') datasetId: string,
    @Param('runId') runId: string,
  ) {
    return this.agentsService.getAnalysis(datasetId, runId);
  }

  /**
   * GET /agents/:datasetId/runs/:runId/download-synthetic
   * Retrieve a download URL for an already-generated synthetic dataset.
   */
  @Get(':datasetId/runs/:runId/download-synthetic')
  @HttpCode(HttpStatus.OK)
  async getSyntheticDownload(
    @Param('datasetId') datasetId: string,
    @Param('runId') runId: string,
  ) {
    return this.agentsService.getSyntheticDownload(datasetId, runId);
  }
}

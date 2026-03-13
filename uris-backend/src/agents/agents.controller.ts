import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Req,
  UseGuards,
  HttpStatus,
  HttpCode,
  Headers,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { AgentsService } from './agents.service';
import { AgentsGateway } from './agents.gateway';
import type { Request } from 'express';

interface AuthenticatedRequest extends Request {
  user: { id: string; email?: string };
}

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
  @UseGuards(AuthGuard('jwt'))
  async getDatasetRuns(
    @Req() req: AuthenticatedRequest,
    @Param('datasetId') datasetId: string,
  ) {
    return this.agentsService.getDatasetRuns(req.user.id, datasetId);
  }

  /**
   * POST /agents/:datasetId/orchestrate
   * Start agent orchestration for a dataset (returns immediately with runId)
   * Pipeline executes in background, WebSocket streams updates to frontend
   */
  @Post(':datasetId/orchestrate')
  @HttpCode(HttpStatus.ACCEPTED)
  @UseGuards(AuthGuard('jwt'))
  async orchestrateAgents(
    @Req() req: AuthenticatedRequest,
    @Param('datasetId') datasetId: string,
    @Headers('x-backend-url') backendUrl?: string,
  ) {
    return this.agentsService.orchestrateAgents(req.user.id, datasetId, backendUrl);
  }

  /**
   * GET /agents/:datasetId/runs/:runId
   * Get a specific agent run result
   */
  @Get(':datasetId/runs/:runId')
  @UseGuards(AuthGuard('jwt'))
  async getRunResult(
    @Req() req: AuthenticatedRequest,
    @Param('datasetId') datasetId: string,
    @Param('runId') runId: string,
  ) {
    return this.agentsService.getRunResult(req.user.id, datasetId, runId);
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
  @UseGuards(AuthGuard('jwt'))
  async generateSyntheticData(
    @Req() req: AuthenticatedRequest,
    @Param('datasetId') datasetId: string,
    @Param('runId') runId: string,
  ) {
    return this.agentsService.generateSyntheticData(req.user.id, datasetId, runId);
  }

  /**
   * POST /agents/:datasetId/runs/:runId/save-analysis
   * Save the current analysis state (evaluation, compliance, synthesis, validation) to database
   */
  @Post(':datasetId/runs/:runId/save-analysis')
  @HttpCode(HttpStatus.OK)
  @UseGuards(AuthGuard('jwt'))
  async saveAnalysis(
    @Req() req: AuthenticatedRequest,
    @Param('datasetId') datasetId: string,
    @Param('runId') runId: string,
    @Body() analysisData: Record<string, unknown>,
  ) {
    return this.agentsService.saveAnalysis(req.user.id, datasetId, runId, analysisData);
  }

  /**
   * GET /agents/:datasetId/runs/:runId/analysis
   * Retrieve saved analysis state from database
   */
  @Get(':datasetId/runs/:runId/analysis')
  @HttpCode(HttpStatus.OK)
  @UseGuards(AuthGuard('jwt'))
  async getAnalysis(
    @Req() req: AuthenticatedRequest,
    @Param('datasetId') datasetId: string,
    @Param('runId') runId: string,
  ) {
    return this.agentsService.getAnalysis(req.user.id, datasetId, runId);
  }

  /**
   * GET /agents/:datasetId/runs/:runId/download-synthetic
   * Retrieve a download URL for an already-generated synthetic dataset.
   */
  @Get(':datasetId/runs/:runId/download-synthetic')
  @HttpCode(HttpStatus.OK)
  @UseGuards(AuthGuard('jwt'))
  async getSyntheticDownload(
    @Req() req: AuthenticatedRequest,
    @Param('datasetId') datasetId: string,
    @Param('runId') runId: string,
  ) {
    return this.agentsService.getSyntheticDownload(req.user.id, datasetId, runId);
  }
}

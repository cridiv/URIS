import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayInit,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Injectable, Logger } from '@nestjs/common';

/**
 * AgentReasoningEvent: Event emitted by Python agents during execution
 * - type: "agent_start" | "agent_data" | "agent_complete"
 * - agent: agent name (evaluation, planner, compliance, synthesis, validation)
 * - payload: agent-specific data
 */
interface AgentReasoningEvent {
  type: 'agent_start' | 'agent_data' | 'agent_complete';
  agent: string;
  ts?: number;
  payload?: Record<string, unknown>;
}

interface AgentSession {
  runId: string;
  datasetId: string;
  socket: Socket;
  startedAt: Date;
}

@Injectable()
@WebSocketGateway({
  namespace: 'agents',
  cors: {
    origin: process.env.CORS_ORIGINS?.split(',') ?? 'http://localhost:3000',
    credentials: true,
  },
})
export class AgentsGateway implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private logger = new Logger('AgentsGateway');
  private sessions = new Map<string, AgentSession>();

  afterInit(server: Server) {
    this.logger.log('WebSocket Gateway initialized');
  }

  handleConnection(client: Socket) {
    this.logger.log(`Client connected: ${client.id}`);
  }

  handleDisconnect(client: Socket) {
    this.logger.log(`Client disconnected: ${client.id}`);
    // Clean up session
    for (const [key, session] of this.sessions) {
      if (session.socket.id === client.id) {
        this.sessions.delete(key);
        break;
      }
    }
  }

  /**
   * Called by frontend to subscribe to agent reasoning for a specific run
   * runId: agent run ID
   * datasetId: dataset ID
   */
  @SubscribeMessage('subscribe_to_run')
  handleSubscribeToRun(
    client: Socket,
    data: { runId: string; datasetId: string },
  ) {
    const room = `run:${data.datasetId}:${data.runId}`;
    const sessionKey = `${data.datasetId}:${data.runId}`;
    
    client.join(room);
    this.sessions.set(sessionKey, {
      runId: data.runId,
      datasetId: data.datasetId,
      socket: client,
      startedAt: new Date(),
    });
    
    this.logger.log(`Client subscribed to run ${sessionKey} (room: ${room})`);
    client.emit('subscribed', { runId: data.runId, datasetId: data.datasetId });
  }

  /**
   * Broadcast agent reasoning event to all clients watching this run
   * Called by agents.service.ts when it receives events from Python backend
   */
  broadcastAgentEvent(
    datasetId: string,
    runId: string,
    event: AgentReasoningEvent,
  ) {
    const room = `run:${datasetId}:${runId}`;
    this.server.to(room).emit('agent_event', event);
  }

  /**
   * Helper to emit event to all clients watching a specific run
   */
  emitToRun(
    datasetId: string,
    runId: string,
    event: AgentReasoningEvent,
  ) {
    const room = `run:${datasetId}:${runId}`;
    this.server.to(room).emit('agent_event', event);
    this.logger.debug(`Emitted to ${room}:`, event);
  }
}

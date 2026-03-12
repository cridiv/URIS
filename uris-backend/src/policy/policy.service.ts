import { Injectable, Logger } from '@nestjs/common';
import { AttachPolicyDto } from './policy.controller';

export interface StoredPolicyConfig {
  resolved_directives: Array<{
    verb: string;
    target: string;
    scope: string;
    condition: string | null;
    source: string;
    priority: string;
  }>;
  frameworks_attached: Array<{ id: string; name: string; jurisdiction: string }>;
  custom_policies_attached: Array<{ id: string; name: string; description: string | null }>;
}

@Injectable()
export class PolicyService {
  private readonly logger = new Logger(PolicyService.name);
  private readonly policyByDataset = new Map<string, StoredPolicyConfig>();

  /**
   * attachPolicyConfig
   *
   * Persist the validated policy payload in backend memory. This endpoint is
   * intentionally decoupled from pipeline execution; AgentsService pulls the
   * latest policy by dataset_id and forwards it when a run is orchestrated.
   */
  attachPolicyConfig(dto: AttachPolicyDto): StoredPolicyConfig {
    const policyConfig: StoredPolicyConfig = {
      resolved_directives: dto.resolved_directives.map((d) => ({
        verb: d.verb,
        target: d.target,
        scope: d.scope,
        condition: d.condition ?? null,
        source: d.source,
        priority: d.priority,
      })),
      frameworks_attached: dto.frameworks.map((f) => ({
        id: f.id,
        name: f.name,
        jurisdiction: f.jurisdiction,
      })),
      custom_policies_attached: dto.custom_policies.map((p) => ({
        id: p.id,
        name: p.name,
        description: p.description ?? null,
      })),
    };

    this.policyByDataset.set(dto.dataset_id, policyConfig);
    this.logger.log(
      `Policy config attached for dataset ${dto.dataset_id} (${policyConfig.resolved_directives.length} directives)`,
    );
    return policyConfig;
  }

  getPolicyConfig(datasetId: string): StoredPolicyConfig | null {
    return this.policyByDataset.get(datasetId) ?? null;
  }
}
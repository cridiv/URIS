import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
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
export class PolicyService implements OnModuleInit {
  private readonly logger = new Logger(PolicyService.name);

  // In-memory cache — populated on startup from DB and kept in sync on write.
  // This ensures zero DB latency on the hot path (pipeline run) while still
  // surviving backend restarts through DB persistence.
  private readonly cache = new Map<string, StoredPolicyConfig>();

  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit() {
    // Warm the in-memory cache from DB on startup
    try {
      const rows = await this.prisma.policyConfig.findMany();
      for (const row of rows) {
        this.cache.set(row.datasetId, row.config as unknown as StoredPolicyConfig);
      }
      this.logger.log(`Policy cache warmed — ${rows.length} config(s) loaded from DB`);
    } catch (err) {
      this.logger.warn(`Could not warm policy cache from DB: ${err}`);
    }
  }

  /**
   * attachPolicyConfig
   *
   * Persist the validated policy payload to the database and update in-memory
   * cache. AgentsService pulls the latest policy by dataset_id and forwards it
   * when a run is orchestrated.
   */
  async attachPolicyConfig(dto: AttachPolicyDto): Promise<StoredPolicyConfig> {
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

    // Upsert into DB — create on first attach, overwrite on subsequent attaches
    await this.prisma.policyConfig.upsert({
      where:  { datasetId: dto.dataset_id },
      create: { datasetId: dto.dataset_id, config: policyConfig as any },
      update: { config: policyConfig as any },
    });

    // Keep in-memory cache in sync
    this.cache.set(dto.dataset_id, policyConfig);

    if (dto.dataset_id === 'global') {
      this.logger.log(
        `Global policy attached and persisted — applies to all datasets ` +
        `(${policyConfig.resolved_directives.length} directives, ` +
        `frameworks: [${policyConfig.frameworks_attached.map(f => f.id).join(', ')}], ` +
        `custom: [${policyConfig.custom_policies_attached.map(p => p.name).join(', ')}])`,
      );
    } else {
      this.logger.log(
        `Policy config attached and persisted for dataset ${dto.dataset_id} ` +
        `(${policyConfig.resolved_directives.length} directives)`,
      );
    }

    return policyConfig;
  }

  /**
   * getPolicyConfig
   *
   * Retrieve the policy config for a specific dataset from the in-memory cache
   * (populated from DB on startup). If no dataset-specific policy exists, fall
   * back to the global policy (key = "global").
   */
  getPolicyConfig(datasetId: string): StoredPolicyConfig | null {
    // Dataset-specific first
    if (this.cache.has(datasetId)) {
      const cfg = this.cache.get(datasetId)!;
      this.logger.debug(
        `Policy hit for dataset ${datasetId} (${cfg.resolved_directives.length} directives)`,
      );
      return cfg;
    }

    // Fall back to global
    const globalPolicy = this.cache.get('global');
    if (globalPolicy) {
      this.logger.log(
        `No dataset-specific policy for ${datasetId}; using global policy ` +
        `(${globalPolicy.resolved_directives.length} directives, ` +
        `custom: [${globalPolicy.custom_policies_attached.map(p => p.name).join(', ')}])`,
      );
      return globalPolicy;
    }

    this.logger.warn(`No policy config found for dataset ${datasetId} and no global policy set`);
    return null;
  }
}
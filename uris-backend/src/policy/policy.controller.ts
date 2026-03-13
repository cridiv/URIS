import {
  Controller, Post, Body, HttpCode, HttpStatus, Logger, UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import {
  IsString, IsArray, IsOptional, IsIn, ValidateNested, IsNotEmpty,
} from 'class-validator';
import { Type } from 'class-transformer';
import { PolicyService } from './policy.service';

// ── DTOs ──────────────────────────────────────────────────────────────────────
// These mirror the shape buildPolicyPayload() produces on the frontend.
// class-validator decorators reject malformed payloads before they reach
// the service — keeps bad data out of the Python service entirely.

export class FrameworkEnforcementDto {
  @IsIn(['BLOCK', 'MASK', 'FLAG', 'GENERALISE', 'DROP'])
  verb: 'BLOCK' | 'MASK' | 'FLAG' | 'GENERALISE' | 'DROP';

  @IsString() @IsNotEmpty()
  target: string;          // e.g. "col:Name" or "direct_identifiers"

  @IsOptional() @IsString()
  condition: string | null; // e.g. "pii_type IS direct_identifier"
}

export class CustomDirectiveDto extends FrameworkEnforcementDto {
  @IsIn(['column', 'dataset'])
  scope: 'column' | 'dataset';
}

export class ResolvedDirectiveDto extends CustomDirectiveDto {

  @IsString() @IsNotEmpty()
  source: string;           // policy name that produced this directive

  @IsIn(['custom', 'framework'])
  priority: 'custom' | 'framework';
}

export class FrameworkDto {
  @IsString() @IsNotEmpty()
  id: string;               // "gdpr" | "ccpa" | "hipaa"

  @IsString() @IsNotEmpty()
  name: string;

  @IsString() @IsNotEmpty()
  jurisdiction: string;

  @IsArray() @ValidateNested({ each: true }) @Type(() => FrameworkEnforcementDto)
  enforcement: FrameworkEnforcementDto[];
}

export class CustomPolicyDto {
  @IsString() @IsNotEmpty()
  id: string;

  @IsString() @IsNotEmpty()
  name: string;

  @IsOptional() @IsString()
  description: string | null;

  @IsArray() @ValidateNested({ each: true }) @Type(() => CustomDirectiveDto)
  directives: CustomDirectiveDto[];
}

export class AttachPolicyDto {
  @IsString() @IsNotEmpty()
  dataset_id: string;

  @IsString() @IsNotEmpty()
  attached_at: string;      // ISO timestamp from frontend

  @IsArray() @ValidateNested({ each: true }) @Type(() => FrameworkDto)
  frameworks: FrameworkDto[];

  @IsArray() @ValidateNested({ each: true }) @Type(() => CustomPolicyDto)
  custom_policies: CustomPolicyDto[];

  // This is the key field — the flat list the compliance agent iterates.
  // Custom directives come first (higher specificity), frameworks second.
  @IsArray() @ValidateNested({ each: true }) @Type(() => ResolvedDirectiveDto)
  resolved_directives: ResolvedDirectiveDto[];
}

// ── Controller ────────────────────────────────────────────────────────────────

@Controller('policy')
@UseGuards(AuthGuard('jwt'))
export class PolicyController {
  private readonly logger = new Logger(PolicyController.name);

  constructor(private readonly policyService: PolicyService) {}

  /**
   * POST /policy/attach
   *
   * Receives the policy config from the frontend, validates it,
    * and stores it for the next orchestrated run of this dataset.
   */
  @Post('attach')
    @HttpCode(HttpStatus.ACCEPTED)  // 202 — accepted and attached for next run
  async attach(@Body() dto: AttachPolicyDto) {
    this.logger.log(
      `Policy attach — dataset: ${dto.dataset_id} | ` +
      `frameworks: ${dto.frameworks.map(f => f.id).join(', ')} | ` +
      `custom: ${dto.custom_policies.length} | ` +
      `directives: ${dto.resolved_directives.length}`,
    );

    const policyConfig = await this.policyService.attachPolicyConfig(dto);

    return {
      status:     'accepted',
      dataset_id: dto.dataset_id,
      directives: policyConfig.resolved_directives.length,
      message:    'Policy config attached to evaluation context for the next pipeline run.',
    };
  }
}
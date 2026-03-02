import { Injectable, Logger, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import FormData = require('form-data');
import fetch from 'node-fetch';

export interface ColumnMeta {
  name: string;
  dtype: string;
  nullCount: number;
  uniqueCount: number;
}

export interface ProfileResult {
  rowCount: number;
  columnCount: number;
  columns: ColumnMeta[];
  profileMeta: Record<string, unknown>; // any extra stats from the profiler
}

@Injectable()
export class ProfilerService {
  private readonly agentsUrl: string;
  private readonly logger = new Logger(ProfilerService.name);

  constructor(private readonly config: ConfigService) {
    this.agentsUrl = config.get<string>('app.agentsUrl') ?? 'http://localhost:8000';
  }

  async profile(
    buffer: Buffer,
    originalName: string,
    mimeType: string,
  ): Promise<ProfileResult> {
    const form = new FormData();
    form.append('file', buffer, { filename: originalName, contentType: mimeType });

    let res: import('node-fetch').Response;

    try {
      res = await fetch(`${this.agentsUrl}/analysis/profile`, {
        method: 'POST',
        body: form,
        headers: form.getHeaders(),
      });
    } catch (err) {
      this.logger.error(`Could not reach profiler: ${String(err)}`);
      throw new InternalServerErrorException(
        'Profiler service is unreachable. Is uris-agents running?',
      );
    }

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      this.logger.error(`Profiler ${res.status}: ${text}`);
      throw new InternalServerErrorException(
        `Profiler returned ${res.status}: ${text || 'unknown error'}`,
      );
    }

    const raw = (await res.json()) as {
      status: string;
      dataset_summary: {
        row_count?: number;
        column_count?: number;
        columns?: Array<{
          name: string;
          dtype: string;
          null_count?: number;
          unique_count?: number;
        }>;
        [key: string]: unknown;
      };
    };

    const summary = raw.dataset_summary ?? {};

    // Normalise Python snake_case → camelCase
    return {
      rowCount: summary.row_count ?? 0,
      columnCount: summary.column_count ?? 0,
      columns: (summary.columns ?? []).map((c) => ({
        name: c.name,
        dtype: c.dtype,
        nullCount: c.null_count ?? 0,
        uniqueCount: c.unique_count ?? 0,
      })),
      profileMeta: summary, // keep the full raw summary too
    };
  }
}
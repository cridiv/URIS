import {
  Injectable,
  Logger,
  BadRequestException,
  InternalServerErrorException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { S3Client, GetObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3';
import { Readable } from 'stream';
import { PrismaService } from '../prisma/prisma.service';
import { S3StorageService } from '../aws/s3.storage';
import { ProfilerService } from './profiler/profiler.service';
import { ImportFromS3Dto, ALLOWED_EXTENSIONS, DatasetResponse } from './dto/dataset.dto';
import { Dataset } from '@prisma/client';
import * as path from 'path';
import * as crypto from 'crypto';

@Injectable()
export class DatasetService {
  private readonly logger = new Logger(DatasetService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: S3StorageService,
    private readonly profiler: ProfilerService,
    private readonly config: ConfigService,
  ) {}

  // ── Upload from local file (multipart form) ───────────────────────────────

  async ingestUpload(file: Express.Multer.File): Promise<DatasetResponse> {
    this.validateExtension(file.originalname);

    const s3Key = this.buildS3Key(file.originalname);

    // 1. Create a pending record so we have an ID immediately
    const record = await this.prisma.dataset.create({
      data: {
        name: file.originalname,
        s3Key,
        s3Bucket: this.storage.getBucket(),
        mimeType: file.mimetype,
        sizeBytes: BigInt(file.size),
        source: 'upload',
        status: 'profiling',
      },
    });

    return this.profileThenStore(record.id, file.buffer, file.originalname, file.mimetype, s3Key);
  }

  // ── Import from user's own S3 bucket ─────────────────────────────────────

  async ingestFromS3(dto: ImportFromS3Dto): Promise<DatasetResponse> {
    this.validateExtension(dto.key);

    // Build a temporary client scoped to the user's bucket
    const userClient = new S3Client({
      region: dto.region,
      credentials: {
        accessKeyId: dto.accessKeyId,
        secretAccessKey: dto.secretAccessKey,
      },
      tls: true,
    });

    let buffer: Buffer;
    let mimeType: string;
    let sizeBytes: number;
    const fileName = dto.key.split('/').pop() ?? dto.key;

    try {
      // Get metadata first
      const head = await userClient.send(
        new HeadObjectCommand({ Bucket: dto.bucket, Key: dto.key }),
      );
      mimeType = head.ContentType ?? 'application/octet-stream';
      sizeBytes = head.ContentLength ?? 0;

      // Stream the file into a buffer
      const response = await userClient.send(
        new GetObjectCommand({ Bucket: dto.bucket, Key: dto.key }),
      );
      buffer = await this.streamToBuffer(response.Body as Readable);
    } catch (err) {
      this.logger.error(`Failed to fetch from user S3: ${String(err)}`);
      throw new BadRequestException(
        'Could not retrieve file from the provided S3 bucket. Check credentials and key.',
      );
    } finally {
      userClient.destroy();
    }

    const s3Key = this.buildS3Key(fileName);

    const record = await this.prisma.dataset.create({
      data: {
        name: fileName,
        s3Key,
        s3Bucket: this.storage.getBucket(),
        mimeType,
        sizeBytes: BigInt(sizeBytes),
        source: 's3',
        sourceKey: dto.key,
        status: 'profiling',
      },
    });

    return this.profileThenStore(record.id, buffer, fileName, mimeType, s3Key);
  }

  // ── Core pipeline: profile → upload to app S3 → update DB ────────────────

  private async profileThenStore(
    datasetId: string,
    buffer: Buffer,
    originalName: string,
    mimeType: string,
    s3Key: string,
  ): Promise<DatasetResponse> {

    let profile: Awaited<ReturnType<ProfilerService['profile']>>;

    // Step 1 — Profile the file via Python agents
    try {
      profile = await this.profiler.profile(buffer, originalName, mimeType);
    } catch (err) {
      // Mark as error and rethrow — don't upload a file we couldn't profile
      await this.prisma.dataset.update({
        where: { id: datasetId },
        data: { status: 'error', errorMsg: String(err) },
      });
      throw err;
    }

    // Step 2 — Upload raw file to app S3 bucket
    try {
      await this.storage.upload(buffer, s3Key, mimeType);
    } catch (err) {
      await this.prisma.dataset.update({
        where: { id: datasetId },
        data: { status: 'error', errorMsg: 'S3 upload failed' },
      });
      throw err;
    }

    // Step 3 — Persist full metadata to Supabase
    const updated = await this.prisma.dataset.update({
      where: { id: datasetId },
      data: {
        status: 'ready',
        rowCount: profile.rowCount,
        columnCount: profile.columnCount,
        columns: profile.columns as object,
        profileMeta: profile.profileMeta as object,
      },
    });

    this.logger.log(
      `Dataset ${datasetId} ready — ${profile.rowCount} rows, ${profile.columnCount} columns`,
    );

    return this.serialize(updated);
  }

  // ── List all datasets ─────────────────────────────────────────────────────

  async findAll(): Promise<DatasetResponse[]> {
    const datasets = await this.prisma.dataset.findMany({
      orderBy: { createdAt: 'desc' },
    });
    return datasets.map(this.serialize);
  }

  // ── Get one ───────────────────────────────────────────────────────────────

  async findOne(id: string): Promise<DatasetResponse> {
    const dataset = await this.prisma.dataset.findUniqueOrThrow({
      where: { id },
    });
    return this.serialize(dataset);
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  /** Build a namespaced S3 key: datasets/<timestamp>-<hash>-<filename> */
  private buildS3Key(originalName: string): string {
    const hash = crypto.randomBytes(6).toString('hex');
    const ts = Date.now();
    const safe = path.basename(originalName).replace(/[^a-zA-Z0-9.\-_]/g, '_');
    return `datasets/${ts}-${hash}-${safe}`;
  }

  private validateExtension(filename: string): void {
    const ext = ('.' + filename.split('.').pop()).toLowerCase();
    if (!ALLOWED_EXTENSIONS.includes(ext)) {
      throw new BadRequestException(
        `Unsupported file type "${ext}". Allowed: ${ALLOWED_EXTENSIONS.join(', ')}`,
      );
    }
  }

  private streamToBuffer(stream: Readable): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const chunks: Buffer[] = [];
      stream.on('data', (chunk: Buffer) => chunks.push(chunk));
      stream.on('end', () => resolve(Buffer.concat(chunks)));
      stream.on('error', reject);
    });
  }

  /** BigInt can't be JSON-serialised by default — convert to string */
  private serialize(d: Dataset): DatasetResponse {
    return {
      id: d.id,
      name: d.name,
      s3Key: d.s3Key,
      sizeBytes: d.sizeBytes.toString(),
      mimeType: d.mimeType,
      rowCount: d.rowCount,
      columnCount: d.columnCount,
      columns: d.columns,
      status: d.status,
      source: d.source,
      createdAt: d.createdAt.toISOString(),
    };
  }
}
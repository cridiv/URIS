import {
  Injectable,
  Logger,
  UnauthorizedException,
  NotFoundException,
  BadRequestException,
  InternalServerErrorException,
} from '@nestjs/common';
import {
  S3Client,
  ListObjectsV2Command,
  GetObjectCommand,
  HeadObjectCommand,
  S3ServiceException,
} from '@aws-sdk/client-s3';
import { Readable } from 'stream';
import {
  ConnectS3Dto,
  ConnectResult,
  S3ObjectInfo,
  ImportedObject,
} from './dto/s3.dto';

@Injectable()
export class S3Service {
  private readonly logger = new Logger(S3Service.name);

  // ── Build a one-off S3Client from user-supplied credentials ──────────────
  // Each request gets its own client scoped to the user's bucket.
  // Nothing is stored server-side between requests.
  private buildClient(dto: ConnectS3Dto): S3Client {
    return new S3Client({
      region: dto.region,
      credentials: {
        accessKeyId: dto.accessKeyId,
        secretAccessKey: dto.secretAccessKey,
      },
      tls: true,
      // Hard cap: 10 s connect + 30 s socket — prevents hung imports
      requestHandler: {
        connectionTimeout: 10_000,
        socketTimeout: 30_000,
      } as never,
    });
  }

  // ── Test connection + return a quick summary ─────────────────────────────
  async connect(dto: ConnectS3Dto): Promise<ConnectResult> {
    const client = this.buildClient(dto);

    try {
      const response = await client.send(
        new ListObjectsV2Command({
          Bucket: dto.bucket,
          MaxKeys: 1, // just enough to verify access
        }),
      );

      // A second call to get an approximate count (capped for speed)
      const countResponse = await client.send(
        new ListObjectsV2Command({ Bucket: dto.bucket, MaxKeys: 1000 }),
      );

      return {
        connected: true,
        bucket: dto.bucket,
        region: dto.region,
        objectCount: countResponse.KeyCount ?? 0,
      };
    } catch (err) {
      this.handleS3Error(err, 'connect');
    } finally {
      client.destroy();
    }
  }

  // ── List objects / "folders" inside the bucket ───────────────────────────
  async listObjects(
    dto: ConnectS3Dto,
    prefix?: string,
    maxKeys = 100,
  ): Promise<S3ObjectInfo[]> {
    const client = this.buildClient(dto);

    try {
      const response = await client.send(
        new ListObjectsV2Command({
          Bucket: dto.bucket,
          Prefix: prefix || undefined,
          Delimiter: '/', // treat / as folder separator
          MaxKeys: maxKeys,
        }),
      );

      const folders: S3ObjectInfo[] = (response.CommonPrefixes ?? []).map((p) => ({
        key: p.Prefix!,
        size: 0,
        lastModified: '',
        isFolder: true,
      }));

      const files: S3ObjectInfo[] = (response.Contents ?? [])
        // filter out the prefix "folder" entry itself
        .filter((obj) => obj.Key !== prefix)
        .map((obj) => ({
          key: obj.Key!,
          size: obj.Size ?? 0,
          lastModified: obj.LastModified?.toISOString() ?? '',
          isFolder: false,
        }));

      return [...folders, ...files];
    } catch (err) {
      this.handleS3Error(err, 'list objects');
    } finally {
      client.destroy();
    }
  }

  // ── Fetch metadata for a single object ───────────────────────────────────
  async getObjectMeta(dto: ConnectS3Dto, key: string): Promise<S3ObjectInfo> {
    const client = this.buildClient(dto);

    try {
      const head = await client.send(
        new HeadObjectCommand({ Bucket: dto.bucket, Key: key }),
      );

      return {
        key,
        size: head.ContentLength ?? 0,
        lastModified: head.LastModified?.toISOString() ?? '',
        contentType: head.ContentType,
        isFolder: false,
      };
    } catch (err) {
      if (this.isNotFound(err)) throw new NotFoundException(`Object not found: ${key}`);
      this.handleS3Error(err, `head ${key}`);
    } finally {
      client.destroy();
    }
  }

  // ── Import a single file — stream it from S3 into the app ────────────────
  // This is just a test endpoint - the real import logic is in DatasetService.ingestFromS3
  // which properly saves to the database. This endpoint should be deprecated in favor of
  // POST /dataset/import-s3 which uses the dataset service.
  async importObject(dto: ConnectS3Dto, key: string): Promise<ImportedObject> {
    const client = this.buildClient(dto);

    try {
      const head = await client.send(
        new HeadObjectCommand({ Bucket: dto.bucket, Key: key }),
      );

      const response = await client.send(
        new GetObjectCommand({ Bucket: dto.bucket, Key: key }),
      );

      // Drain stream so the connection closes cleanly
      const stream = response.Body as Readable;
      await this.consumeStream(stream);

      this.logger.log(`Imported s3://${dto.bucket}/${key} (${head.ContentLength} bytes)`);
      this.logger.warn('⚠️  This import was not saved to the database. Use POST /dataset/import-s3 instead.');

      return {
        key,
        size: head.ContentLength ?? 0,
        contentType: head.ContentType ?? 'application/octet-stream',
        importedAt: new Date().toISOString(),
      };
    } catch (err) {
      if (this.isNotFound(err)) throw new NotFoundException(`Object not found: ${key}`);
      this.handleS3Error(err, `import ${key}`);
    } finally {
      client.destroy();
    }
  }

  // ── Import all files under a prefix (a "folder") ─────────────────────────
  async importPrefix(
    dto: ConnectS3Dto,
    prefix: string,
    maxKeys = 100,
  ): Promise<ImportedObject[]> {
    const client = this.buildClient(dto);

    try {
      const listResponse = await client.send(
        new ListObjectsV2Command({
          Bucket: dto.bucket,
          Prefix: prefix,
          MaxKeys: maxKeys,
        }),
      );

      const keys = (listResponse.Contents ?? [])
        .map((obj) => obj.Key!)
        .filter((k) => !k.endsWith('/')); // skip folder markers

      if (keys.length === 0) {
        throw new BadRequestException(`No objects found under prefix: ${prefix}`);
      }

      // Import sequentially to avoid hammering the bucket
      const results: ImportedObject[] = [];

      for (const key of keys) {
        const response = await client.send(
          new GetObjectCommand({ Bucket: dto.bucket, Key: key }),
        );

        const stream = response.Body as Readable;

        // --- Replace with your ingestion logic per file ---
        await this.consumeStream(stream);
        // --------------------------------------------------

        results.push({
          key,
          size: response.ContentLength ?? 0,
          contentType: response.ContentType ?? 'application/octet-stream',
          importedAt: new Date().toISOString(),
        });

        this.logger.log(`Imported s3://${dto.bucket}/${key}`);
      }

      return results;
    } catch (err) {
      if (err instanceof BadRequestException) throw err;
      this.handleS3Error(err, `import prefix ${prefix}`);
    } finally {
      client.destroy();
    }
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  /** Drain a readable stream without storing bytes — replace with real processing */
  private consumeStream(stream: Readable): Promise<void> {
    return new Promise((resolve, reject) => {
      stream.on('data', () => {}); // discard
      stream.on('end', resolve);
      stream.on('error', reject);
    });
  }

  private isNotFound(err: unknown): boolean {
    return (
      err instanceof S3ServiceException &&
      (err.name === 'NotFound' ||
        err.name === 'NoSuchKey' ||
        err.$metadata?.httpStatusCode === 404)
    );
  }

  private handleS3Error(err: unknown, context: string): never {
    this.logger.error(`S3 error [${context}]: ${String(err)}`);

    if (err instanceof S3ServiceException) {
      const status = err.$metadata?.httpStatusCode;
      if (status === 403 || status === 401) {
        throw new UnauthorizedException(
          'Invalid credentials or insufficient permissions for this bucket',
        );
      }
      if (status === 404) throw new NotFoundException('Bucket or object not found');
      throw new InternalServerErrorException(`S3 error: ${err.message}`);
    }

    throw new InternalServerErrorException('Unexpected error communicating with S3');
  }
}
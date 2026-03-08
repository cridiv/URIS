import { Injectable, Logger, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { S3Client, DeleteObjectCommand, S3ServiceException, GetObjectCommand } from '@aws-sdk/client-s3';
import { Upload } from '@aws-sdk/lib-storage';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

@Injectable()
export class S3StorageService {
  private readonly client: S3Client;
  private readonly bucket: string;
  private readonly logger = new Logger(S3StorageService.name);

  constructor(private readonly config: ConfigService) {
    this.bucket = config.get<string>('app.s3.bucket')!;

    this.client = new S3Client({
      region: config.get<string>('app.s3.region')!,
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
   * Upload a file buffer to your app's S3 bucket.
   * Returns the S3 key the file was stored under.
   */
  async upload(
    buffer: Buffer,
    key: string,
    mimeType: string,
  ): Promise<{ s3Key: string; s3Bucket: string }> {
    try {
      const upload = new Upload({
        client: this.client,
        params: {
          Bucket: this.bucket,
          Key: key,
          Body: buffer,
          ContentType: mimeType,
          ServerSideEncryption: 'AES256',
        },
      });

      await upload.done();
      this.logger.log(`Stored: s3://${this.bucket}/${key}`);

      return { s3Key: key, s3Bucket: this.bucket };
    } catch (err) {
      this.logger.error(`Failed to upload ${key}: ${String(err)}`);
      if (err instanceof S3ServiceException) {
        throw new InternalServerErrorException(`S3 upload failed: ${err.message}`);
      }
      throw new InternalServerErrorException('Failed to store file');
    }
  }

  /** Delete a stored file — used on rollback if profiling fails */
  async delete(key: string): Promise<void> {
    try {
      await this.client.send(
        new DeleteObjectCommand({ Bucket: this.bucket, Key: key }),
      );
    } catch {
      // best-effort cleanup, log and move on
      this.logger.warn(`Could not delete s3://${this.bucket}/${key} during rollback`);
    }
  }

  getBucket(): string {
    return this.bucket;
  }

  /**
   * Generate a presigned URL for downloading a file from S3
   * URL expires after the specified time (default 1 hour)
   */
  async getPresignedDownloadUrl(key: string, expiresIn: number = 3600): Promise<string> {
    try {
      const command = new GetObjectCommand({
        Bucket: this.bucket,
        Key: key,
      });

      const url = await getSignedUrl(this.client, command, { expiresIn });
      return url;
    } catch (err) {
      this.logger.error(`Failed to generate presigned URL for ${key}: ${String(err)}`);
      throw new InternalServerErrorException('Failed to generate download URL');
    }
  }
}
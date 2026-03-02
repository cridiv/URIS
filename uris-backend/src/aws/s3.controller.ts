import {
  Controller,
  Post,
  Get,
  Body,
  Query,
  Param,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { S3Service } from './s3.service';
import {
  ConnectS3Dto,
  ListObjectsDto,
  ImportObjectDto,
  ImportPrefixDto,
  ConnectResult,
  S3ObjectInfo,
  ImportedObject,
} from './dto/s3.dto';

@Controller('s3')
export class S3Controller {
  constructor(private readonly s3Service: S3Service) {}

  /**
   * POST /api/s3/connect
   *
   * Verify that the supplied credentials can access the bucket.
   * Returns a connection summary (bucket name, region, object count).
   * Credentials are NOT stored — they must be sent with every request.
   */
  @Post('connect')
  @HttpCode(HttpStatus.OK)
  async connect(@Body() dto: ConnectS3Dto): Promise<ConnectResult> {
    return this.s3Service.connect(dto);
  }

  /**
   * POST /api/s3/objects
   *
   * List objects (files + folders) in the connected bucket.
   * Credentials travel in the request body alongside optional filters.
   *
   * Body: ConnectS3Dto + { prefix?, maxKeys? }
   */
  @Post('objects')
  @HttpCode(HttpStatus.OK)
  async listObjects(
    @Body() body: ConnectS3Dto,
    @Query() query: ListObjectsDto,
  ): Promise<S3ObjectInfo[]> {
    return this.s3Service.listObjects(body, query.prefix, query.maxKeys);
  }

  /**
   * POST /api/s3/objects/:key/meta
   *
   * Fetch metadata for a single object without downloading it.
   * Useful to show file size / type before the user confirms the import.
   */
  @Post('objects/*key/meta')
  @HttpCode(HttpStatus.OK)
  async getObjectMeta(
    @Param('key') key: string,
    @Body() dto: ConnectS3Dto,
  ): Promise<S3ObjectInfo> {
    return this.s3Service.getObjectMeta(dto, key);
  }

  /**
   * POST /api/s3/import/object
   *
   * Import a single file from S3 into the application.
   * Replace the stub in S3Service.importObject() with your real ingestion logic
   * (e.g. parse CSV, write to DB, push to a queue).
   *
   * Body: ConnectS3Dto + { key }
   */
  @Post('import/object')
  async importObject(
    @Body() body: ConnectS3Dto & ImportObjectDto,
  ): Promise<ImportedObject> {
    const { key, ...creds } = body;
    return this.s3Service.importObject(creds, key);
  }

  /**
   * POST /api/s3/import/prefix
   *
   * Import all files under a prefix ("folder") from S3.
   * Body: ConnectS3Dto + { prefix, maxKeys? }
   */
  @Post('import/prefix')
  async importPrefix(
    @Body() body: ConnectS3Dto & ImportPrefixDto,
  ): Promise<ImportedObject[]> {
    const { prefix, maxKeys, ...creds } = body;
    return this.s3Service.importPrefix(creds, prefix, maxKeys);
  }
}
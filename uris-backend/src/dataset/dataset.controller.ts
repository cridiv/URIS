import {
  Controller,
  Post,
  Get,
  Param,
  Body,
  UploadedFile,
  UseInterceptors,
  BadRequestException,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { DatasetService } from './dataset.service';
import { ImportFromS3Dto, DatasetResponse } from './dto/dataset.dto';

// 500 MB cap for server-proxied uploads
const MAX_UPLOAD_BYTES = 500 * 1024 * 1024;

@Controller('dataset')
export class DatasetController {
  constructor(private readonly datasetService: DatasetService) {}

  /**
   * POST /api/dataset/upload
   *
   * User uploads a local file (multipart form-data, field name: "file").
   * Pipeline: validate → profile → store in S3 → save metadata to Supabase
   */
  @Post('upload')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: MAX_UPLOAD_BYTES, files: 1 },
    }),
  )
  async upload(
    @UploadedFile() file: Express.Multer.File,
  ): Promise<DatasetResponse> {
    if (!file) {
      throw new BadRequestException('No file provided. Send the file under the "file" field.');
    }
    return this.datasetService.ingestUpload(file);
  }

  /**
   * POST /api/dataset/import-s3
   *
   * User connects their own S3 bucket and picks a file to import.
   * Backend fetches the file from the user's bucket, profiles it,
   * stores it in the app's bucket, and saves metadata.
   */
  @Post('import-s3')
  @HttpCode(HttpStatus.OK)
  async importFromS3(@Body() dto: ImportFromS3Dto): Promise<DatasetResponse> {
    return this.datasetService.ingestFromS3(dto);
  }

  /**
   * GET /api/dataset
   * List all datasets (most recent first).
   */
  @Get()
  async findAll(): Promise<DatasetResponse[]> {
    return this.datasetService.findAll();
  }

  /**
   * GET /api/dataset/:id
   * Get a single dataset by ID.
   */
  @Get(':id')
  async findOne(@Param('id') id: string): Promise<DatasetResponse> {
    return this.datasetService.findOne(id);
  }
}
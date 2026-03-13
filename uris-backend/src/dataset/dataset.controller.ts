import {
  Controller,
  Post,
  Get,
  Param,
  Body,
  Req,
  UploadedFile,
  UseInterceptors,
  UseGuards,
  BadRequestException,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { DatasetService } from './dataset.service';
import { ImportFromS3Dto, DatasetResponse } from './dto/dataset.dto';
import type { Request } from 'express';

interface AuthenticatedRequest extends Request {
  user: { id: string; email?: string };
}

// 500 MB cap for server-proxied uploads
const MAX_UPLOAD_BYTES = 500 * 1024 * 1024;

@Controller('dataset')
@UseGuards(AuthGuard('jwt'))
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
    @Req() req: AuthenticatedRequest,
    @UploadedFile() file: Express.Multer.File,
  ): Promise<DatasetResponse> {
    if (!file) {
      throw new BadRequestException('No file provided. Send the file under the "file" field.');
    }
    return this.datasetService.ingestUpload(req.user.id, file);
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
  async importFromS3(
    @Req() req: AuthenticatedRequest,
    @Body() dto: ImportFromS3Dto,
  ): Promise<DatasetResponse> {
    return this.datasetService.ingestFromS3(req.user.id, dto);
  }

  /**
   * GET /api/dataset
   * List all datasets (most recent first).
   */
  @Get()
  async findAll(@Req() req: AuthenticatedRequest): Promise<DatasetResponse[]> {
    return this.datasetService.findAll(req.user.id);
  }

  /**
   * GET /api/dataset/:id
   * Get a single dataset by ID.
   */
  @Get(':id')
  async findOne(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
  ): Promise<DatasetResponse> {
    return this.datasetService.findOne(req.user.id, id);
  }
}
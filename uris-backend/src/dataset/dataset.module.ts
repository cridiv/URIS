import { Module } from '@nestjs/common';
import { DatasetController } from './dataset.controller';
import { DatasetService } from './dataset.service';
import { S3StorageService } from '../aws/s3.storage';
import { ProfilerService } from './profiler/profiler.service';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';

@Module({
  controllers: [DatasetController],
  providers: [
    DatasetService, 
    S3StorageService, 
    ProfilerService,
    ConfigService,
    PrismaService,
  ],
})
export class DatasetModule {}
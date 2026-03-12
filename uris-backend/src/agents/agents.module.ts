import { Module } from '@nestjs/common';
import { AgentsController } from './agents.controller';
import { AgentsService } from './agents.service';
import { AgentsGateway } from './agents.gateway';
import { PrismaModule } from '../prisma/prisma.module';
import { ConfigModule } from '@nestjs/config';
import { S3StorageService } from 'src/aws/s3.storage';
import { PolicyModule } from '../policy/policy.module';

@Module({
  imports: [PrismaModule, ConfigModule, PolicyModule],
  controllers: [AgentsController],
  providers: [AgentsService, AgentsGateway, S3StorageService],
  exports: [AgentsService, AgentsGateway],
})
export class AgentsModule {}

import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import appConfig from './config/app.config';
import { S3Module } from './aws/s3.module';
import { DatasetModule } from './dataset/dataset.module';
import { AgentsModule } from './agents/agents.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      load: [appConfig],
    }),
    S3Module,
    DatasetModule,
    AgentsModule,
  ],
})
export class AppModule {}

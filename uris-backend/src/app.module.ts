import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import appConfig from './config/app.config';
import { S3Module } from './aws/s3.module';
import { DatasetModule } from './dataset/dataset.module';
import { AgentsModule } from './agents/agents.module';
import { PolicyModule } from './policy/policy.module';
import { AuthModule } from './auth/auth.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      load: [appConfig],
    }),
    S3Module,
    DatasetModule,
    AgentsModule,
    PolicyModule,
    AuthModule,
  ],
})
export class AppModule {}

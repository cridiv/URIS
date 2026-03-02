import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import appConfig from './config/app.config';
import { S3Module } from './aws/s3.module';
import { DatasetModule } from './dataset/dataset.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      load: [appConfig],
    }),
    S3Module,
    DatasetModule,
  ],
})
export class AppModule {}

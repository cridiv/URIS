import { registerAs } from '@nestjs/config';

export default registerAs('app', () => ({
  port: parseInt(process.env.PORT ?? '5000', 10),
  nodeEnv: process.env.NODE_ENV ?? 'development',
  corsOrigins: (process.env.CORS_ORIGINS ?? 'http://localhost:3000')
    .split(',')
    .map((o) => o.trim()),
  
  // S3 Configuration
  s3: {
    bucket: process.env.AWS_S3_BUCKET ?? '',
    region: process.env.AWS_S3_REGION ?? 'us-east-1',
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },

  // Python Agents Service for profiling
  agentsUrl: process.env.AGENTS_URL ?? 'http://localhost:8000',
}));
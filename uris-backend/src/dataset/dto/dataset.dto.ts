import { IsString, IsNotEmpty, IsOptional, Matches, MaxLength } from 'class-validator';

const ALLOWED_MIME_TYPES = [
  'text/csv',
  'application/json',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/octet-stream', // Parquet
];

export const ALLOWED_EXTENSIONS = ['.csv', '.json', '.xlsx', '.parquet'];

/** Used when the user imports from their own S3 bucket instead of uploading */
export class ImportFromS3Dto {
  @IsString() @IsNotEmpty() @MaxLength(128)
  accessKeyId: string;

  @IsString() @IsNotEmpty() @MaxLength(128)
  secretAccessKey: string;

  @IsString() @IsNotEmpty() @MaxLength(20)
  region: string;

  @IsString() @IsNotEmpty() @MaxLength(63)
  bucket: string;

  /** The S3 key to import */
  @IsString() @IsNotEmpty() @MaxLength(512)
  @Matches(/^[a-zA-Z0-9\-_./]+$/, { message: 'key contains invalid characters' })
  key: string;
}

/** Returned to the frontend after a successful ingest */
export interface DatasetResponse {
  id: string;
  name: string;
  s3Key: string;
  sizeBytes: string; // BigInt serialised as string
  mimeType: string;
  rowCount: number | null;
  columnCount: number | null;
  columns: unknown;
  status: string;
  source: string;
  createdAt: string;
}
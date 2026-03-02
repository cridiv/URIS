import {
  IsString,
  IsNotEmpty,
  IsOptional,
  Matches,
  MaxLength,
  IsIn,
  IsNumber,
  Min,
  Max,
} from 'class-validator';
import { Type } from 'class-transformer';

const AWS_REGIONS = [
  'us-east-1', 'us-east-2', 'us-west-1', 'us-west-2',
  'eu-west-1', 'eu-west-2', 'eu-west-3', 'eu-central-1', 'eu-north-1',
  'ap-southeast-1', 'ap-southeast-2', 'ap-northeast-1', 'ap-south-1',
  'sa-east-1', 'ca-central-1',
];

// Safe key regex — no path traversal
const SAFE_KEY = /^[a-zA-Z0-9\-_./]+$/;

// ── Requests ──────────────────────────────────────────────────────────────────

/** Credentials + bucket the user wants to connect to */
export class ConnectS3Dto {
  @IsString() @IsNotEmpty() @MaxLength(128)
  accessKeyId: string;

  @IsString() @IsNotEmpty() @MaxLength(128)
  secretAccessKey: string;

  @IsString() @IsNotEmpty()
  @IsIn(AWS_REGIONS, { message: `region must be a valid AWS region` })
  region: string;

  @IsString() @IsNotEmpty() @MaxLength(63)
  bucket: string;
}

/** Browse objects inside the connected bucket */
export class ListObjectsDto {
  @IsOptional() @IsString() @MaxLength(512)
  prefix?: string;

  @IsOptional() @Type(() => Number)
  @IsNumber() @Min(1) @Max(1000)
  maxKeys?: number = 100;
}

/** Pull one object into the app */
export class ImportObjectDto {
  @IsString() @IsNotEmpty() @MaxLength(512)
  @Matches(SAFE_KEY, { message: 'key contains invalid characters' })
  key: string;
}

/** Pull all objects under a prefix into the app */
export class ImportPrefixDto {
  @IsString() @IsNotEmpty() @MaxLength(512)
  prefix: string;

  @IsOptional() @Type(() => Number)
  @IsNumber() @Min(1) @Max(500)
  maxKeys?: number = 100;
}

// ── Responses ─────────────────────────────────────────────────────────────────

export interface ConnectResult {
  connected: boolean;
  bucket: string;
  region: string;
  objectCount: number;
}

export interface S3ObjectInfo {
  key: string;
  size: number;
  lastModified: string;
  contentType?: string;
  isFolder: boolean;
}

export interface ImportedObject {
  key: string;
  size: number;
  contentType: string;
  /** In a real app this would be a reference to where the data was stored */
  importedAt: string;
}
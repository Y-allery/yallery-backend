import { plainToClass, Transform } from 'class-transformer';
import { IsString, IsOptional, IsNumber, IsBoolean, validateSync } from 'class-validator';

export class EnvironmentVariables {
  // Database
  @IsString()
  DATABASE_HOST: string;

  @IsNumber()
  @Transform(({ value }) => parseInt(value, 10))
  DATABASE_PORT: number;

  @IsString()
  DATABASE_USER: string;

  @IsString()
  DATABASE_PASSWORD: string;

  @IsString()
  DATABASE_NAME: string;

  // Redis
  @IsString()
  REDIS_HOST: string;

  @IsNumber()
  @Transform(({ value }) => parseInt(value, 10))
  REDIS_PORT: number;

  @IsString()
  REDIS_PASSWORD: string;

  // JWT
  @IsString()
  JWT_SECRET: string;

  @IsString()
  JWT_EXPIRES_IN: string;

  @IsOptional()
  @IsString()
  SETTINGS_ENCRYPTION_KEY?: string;

  // Session
  @IsString()
  SESSION_SECRET: string;

  // External APIs
  @IsString()
  TWITTERAPI_IO_API_KEY: string;

  @IsOptional()
  @IsString()
  TWITTERAPI_IO_API_URL?: string;

  @IsOptional()
  @IsNumber()
  @Transform(({ value }) => parseInt(value, 10))
  TWITTERAPI_IO_RETWEETER_MAX_PAGES?: number;

  @IsOptional()
  @IsNumber()
  @Transform(({ value }) => parseInt(value, 10))
  TWITTERAPI_IO_PAGE_SIZE?: number;

  @IsOptional()
  @IsString()
  TWITTER_ACCOUNT_NAME?: string;

  // Cloudinary
  @IsString()
  CLOUDINARY_CLOUD_NAME: string;

  @IsString()
  CLOUDINARY_API_KEY: string;

  @IsString()
  CLOUDINARY_API_SECRET: string;

  /** Optional: unsigned upload preset for direct video upload from client (avoids 413 via nginx) */
  @IsOptional()
  @IsString()
  CLOUDINARY_VIDEO_UPLOAD_PRESET?: string;

  /** Optional: Cloudinary folder for direct video uploads (e.g. meme_reference_videos) */
  @IsOptional()
  @IsString()
  CLOUDINARY_VIDEO_FOLDER?: string;

  // OpenAI
  @IsString()
  OPENAI_API_KEY: string;

  // Firebase
  @IsString()
  FIREBASE_PROJECT_ID: string;

  @IsString()
  FIREBASE_PRIVATE_KEY: string;

  @IsString()
  FIREBASE_CLIENT_EMAIL: string;

  // SendGrid
  @IsString()
  SENDGRID_API_KEY: string;

  @IsString()
  SENDGRID_FROM_EMAIL: string;

  // App Configuration
  @IsOptional()
  @IsString()
  NODE_ENV?: string;

  @IsOptional()
  @IsNumber()
  @Transform(({ value }) => parseInt(value, 10))
  PORT?: number;

  @IsOptional()
  @IsString()
  FRONTEND_URL?: string;

  @IsOptional()
  @IsString()
  API_URL?: string;

  @IsString()
  HOME_URL: string;

  @IsString()
  BRANCH_KEY: string;

  @IsString()
  APPLE_CLIENT_ID: string;

  // Web App URL for partner referrals
  @IsOptional()
  @IsString()
  WEB_APP_URL?: string; // e.g. https://yallery.web.app

  // RunPod
  @IsOptional()
  @IsString()
  RUNPOD_API_KEY?: string;

  @IsOptional()
  @IsString()
  RUNPOD_FLUX2_KLEIN_ENDPOINT_ID?: string;

  @IsOptional()
  @IsString()
  RUNPOD_SDXL_ENDPOINT_ID?: string;

  @IsOptional()
  @IsString()
  RUNPOD_SDXL_LORA_FINETUNE_ENDPOINT_ID?: string;

  @IsOptional()
  @IsString()
  RUNPOD_SDXL_LORA_GENERATION_ENDPOINT_ID?: string;

  @IsOptional()
  @IsString()
  RUNPOD_QWEN_IMAGE_EDIT_BAKED_ENDPOINT_ID?: string;

  @IsOptional()
  @IsString()
  RUNPOD_MMAUDIO_ENDPOINT_ID?: string;

  @IsOptional()
  @IsString()
  RUNPOD_P_VIDEO_ENDPOINT_ID?: string;

  @IsOptional()
  @IsString()
  RUNPOD_WAN22_ANIMATE_MEME_ENDPOINT_ID?: string;

  @IsOptional()
  @IsString()
  RUNPOD_API_BASE_URL?: string;

  @IsOptional()
  @IsString()
  RUNPOD_FLUX2_KLEIN_ENABLED?: string;

  @IsOptional()
  @IsString()
  RUNPOD_SDXL_ENABLED?: string;

  @IsOptional()
  @IsString()
  RUNPOD_SDXL_LORA_GENERATION_ENABLED?: string;

  @IsOptional()
  @IsString()
  RUNPOD_QWEN_IMAGE_EDIT_BAKED_ENABLED?: string;

  @IsOptional()
  @IsString()
  RUNPOD_MMAUDIO_ENABLED?: string;

  @IsOptional()
  @IsString()
  RUNPOD_P_VIDEO_ENABLED?: string;

  @IsOptional()
  @IsString()
  RUNPOD_WAN22_ANIMATE_MEME_ENABLED?: string;

  @IsOptional()
  @IsNumber()
  @Transform(({ value }) => parseInt(value, 10))
  RUNPOD_POLL_INTERVAL_MS?: number;

  @IsOptional()
  @IsNumber()
  @Transform(({ value }) => parseInt(value, 10))
  RUNPOD_FLUX2_KLEIN_STATUS_TIMEOUT_MS?: number;

  @IsOptional()
  @IsNumber()
  @Transform(({ value }) => parseInt(value, 10))
  RUNPOD_SDXL_STATUS_TIMEOUT_MS?: number;

  @IsOptional()
  @IsNumber()
  @Transform(({ value }) => parseInt(value, 10))
  RUNPOD_SDXL_LORA_GENERATION_STATUS_TIMEOUT_MS?: number;

  @IsOptional()
  @IsNumber()
  @Transform(({ value }) => parseInt(value, 10))
  RUNPOD_P_VIDEO_TEXT_STATUS_TIMEOUT_MS?: number;

  @IsOptional()
  @IsNumber()
  @Transform(({ value }) => parseInt(value, 10))
  RUNPOD_P_VIDEO_IMAGE_STATUS_TIMEOUT_MS?: number;

  @IsOptional()
  @IsNumber()
  @Transform(({ value }) => parseInt(value, 10))
  RUNPOD_MMAUDIO_STATUS_TIMEOUT_MS?: number;

  @IsOptional()
  @IsNumber()
  @Transform(({ value }) => parseInt(value, 10))
  RUNPOD_WAN22_ANIMATE_MEME_STATUS_TIMEOUT_MS?: number;

  @IsOptional()
  @IsNumber()
  @Transform(({ value }) => parseInt(value, 10))
  RUNPOD_REQUEST_TIMEOUT_MS?: number;

  @IsOptional()
  @IsNumber()
  @Transform(({ value }) => parseInt(value, 10))
  RUNPOD_SYNC_REQUEST_TIMEOUT_MS?: number;

  @IsOptional()
  @IsNumber()
  @Transform(({ value }) => parseInt(value, 10))
  RUNPOD_COMPLETED_OUTPUT_RETRY_COUNT?: number;

  @IsOptional()
  @IsNumber()
  @Transform(({ value }) => parseInt(value, 10))
  RUNPOD_COMPLETED_OUTPUT_RETRY_DELAY_MS?: number;
}

export function validate(config: Record<string, unknown>) {
  const validatedConfig = plainToClass(EnvironmentVariables, config, {
    enableImplicitConversion: true,
  });

  const errors = validateSync(validatedConfig, {
    skipMissingProperties: false,
  });

  if (errors.length > 0) {
    const missingVars = errors
      .map((error) => `${error.property}: ${Object.keys(error.constraints || {}).join(', ')}`)
      .join(', ');
    
    throw new Error(
      `Environment validation failed. Missing or invalid variables: ${missingVars}\n` +
      `Please check your .env file and ensure all required variables are set.`
    );
  }

  return validatedConfig;
}

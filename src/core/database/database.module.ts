import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule, ConfigService } from '@nestjs/config';

/**
 * The managed MySQL allows 151 connections. 40 leaves room for the migration
 * runner, the admin client and a second app process during a deploy, while
 * giving the single Node process enough concurrency to survive a launch spike.
 */
const DEFAULT_POOL_SIZE = 40;

export function resolveDatabasePoolSize(raw?: string): number {
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0
    ? Math.floor(parsed)
    : DEFAULT_POOL_SIZE;
}

@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        type: 'mysql',
        host: configService.get<string>('DATABASE_HOST'),
        port: configService.get<number>('DATABASE_PORT'),
        username: configService.get<string>('DATABASE_USER'),
        password: configService.get<string>('DATABASE_PASSWORD'),
        database: configService.get<string>('DATABASE_NAME'),
        entities: [__dirname + '/../../**/*.entity{.ts,.js}'],
        migrations: [__dirname + '/../../../migrations/*{.ts,.js}'],
        synchronize: false,
        poolSize: resolveDatabasePoolSize(
          configService.get<string>('DATABASE_POOL_SIZE'),
        ),
      }),
    }),
  ],
  providers: [],
  exports: [],
})
export class DatabaseModule {}

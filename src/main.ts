import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { ValidationPipe } from '@nestjs/common';
import * as bodyParser from 'body-parser';
import { IoAdapter } from '@nestjs/platform-socket.io';
import './sentry/instrument';
import * as session from 'express-session';
import * as passport from 'passport';
import { RedisStore } from 'connect-redis';
import { createClient } from 'redis';
import { closeBrowser } from './common/puppeteer-browser';

let redisClient: ReturnType<typeof createClient>;

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.useWebSocketAdapter(new IoAdapter(app));
  const expressApp = app.getHttpAdapter().getInstance();

  redisClient = createClient({
    socket: {
      host: process.env.REDIS_HOST,
      port: Number(process.env.REDIS_PORT),
      reconnectStrategy: (retries) => {
        if (retries > 10) {
          console.error('Redis: Max reconnection attempts reached');
          return new Error('Max reconnection attempts reached');
        }
        const delay = Math.min(retries * 100, 3000);
        console.log(`Redis: Reconnecting in ${delay}ms (attempt ${retries})`);
        return delay;
      },
    },
    password: process.env.REDIS_PASSWORD,
  });

  redisClient.on('error', (err) => {
    console.error('Redis Client Error:', err);
  });

  redisClient.on('connect', () => {
    console.log('✅ Redis connected');
  });

  redisClient.on('reconnecting', () => {
    console.log('🔄 Redis reconnecting...');
  });

  try {
  await redisClient.connect();
  } catch (error) {
    console.error('❌ Failed to connect to Redis:', error);
    process.exit(1);
  }

  const redisStore = new RedisStore({
    client: redisClient,
    prefix: 'myapp_sess:',
  });
  const config = new DocumentBuilder()
    .setTitle('Y-app API')
    .setDescription('API for y-allery application')
    .setVersion('1.0')
    .addBearerAuth({
      type: 'http',
      scheme: 'bearer',
      bearerFormat: 'JWT',
    })
    .addSecurityRequirements('bearer')
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api', app, document);

  app.use('/payment/webhook', (req, res, next) => {
    console.log('🔔 ===== WEBHOOK REQUEST RECEIVED =====');
    console.log('🔔 Method:', req.method);
    console.log('🔔 URL:', req.url);
    console.log('🔔 Headers:', JSON.stringify(req.headers, null, 2));
    console.log('🔔 IP:', req.ip || req.connection.remoteAddress);
    console.log('🔔 ====================================');
    next();
  });

  // Increase limits for video/GIF uploads (413). If behind nginx, set client_max_body_size 100m;
  app.use('/payment/webhook', bodyParser.raw({ type: 'application/json', limit: '50mb' }));
  app.use(bodyParser.json({ limit: '50mb' }));
  app.use(bodyParser.urlencoded({ limit: '50mb', extended: true }));

  const allowedOrigins = true;

  app.enableCors({
    origin: allowedOrigins,
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
    preflightContinue: false,
    optionsSuccessStatus: 204,
    credentials: true,
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  app.use(
    session({
      store: redisStore,
      secret: process.env.SESSION_SECRET,
      name: 'sid',
      resave: false,
      saveUninitialized: false,
      cookie: {
        secure: process.env.NODE_ENV === 'production',
        httpOnly: true,
        maxAge: 3600000,
        sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
      },
    }),
  );
  expressApp.set('trust proxy', 1);
  app.use(passport.initialize());
  app.use(passport.session());

  const port = process.env.PORT || 8000;
  try {
  await app.listen(port, '0.0.0.0');
  console.log(`🚀 Application is running on: http://0.0.0.0:${port}`);
  console.log(`📚 Swagger documentation: http://0.0.0.0:${port}/api`);
  console.log(`⏰ Cron jobs are enabled and will run every 10 minutes`);
  } catch (error) {
    console.error(`❌ Failed to start server on port ${port}:`, error);
    if (redisClient) {
      await redisClient.quit().catch(console.error);
    }
    process.exit(1);
  }
}

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
  process.exit(1);
});

  process.on('SIGTERM', async () => {
  console.log('SIGTERM received, shutting down gracefully...');
  await closeBrowser();
  if (redisClient) {
    await redisClient.quit().catch(console.error);
  }
  process.exit(0);
});

  process.on('SIGINT', async () => {
  console.log('SIGINT received, shutting down gracefully...');
  await closeBrowser();
  if (redisClient) {
    await redisClient.quit().catch(console.error);
  }
  process.exit(0);
});

bootstrap().catch((error) => {
  console.error('Failed to start application:', error);
  process.exit(1);
});

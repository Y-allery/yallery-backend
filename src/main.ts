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

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.useWebSocketAdapter(new IoAdapter(app));
  const expressApp = app.getHttpAdapter().getInstance();

  const redisClient = createClient({
    socket: {
      host: process.env.REDIS_HOST,
      port: Number(process.env.REDIS_PORT),
    },
    password: process.env.REDIS_PASSWORD,
  });
  await redisClient.connect();
  const redisStore = new RedisStore({
    client: redisClient,
    prefix: 'myapp_sess:',
  });
  app.use(
    session({
      store: redisStore,
      secret: process.env.SESSION_SECRET || 'your_secret_key',
      name: 'sid',
      resave: false,
      saveUninitialized: false,
      cookie: {
        secure: process.env.NODE_ENV === 'production', // true якщо ви на HTTPS
        httpOnly: true,
        maxAge: 3600000, // 1 година
        // sameSite: 'none', // якщо фронт/бекенд на різних доменах і потрібен cross-site
      },
    }),
  );
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
    .build(); //sdівsdsdsd

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api', app, document);

  app.use('/payment/webhook', bodyParser.raw({ type: 'application/json' }));
  app.use(bodyParser.json());

  app.enableCors({
    origin: true,
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
      secret: process.env.SESSION_SECRET || 'your_secret_key',
      key: 'sid',
      resave: false,
      saveUninitialized: false,
      cookie: {
        secure: process.env.NODE_ENV === 'production' ? true : false, // Використовуйте HTTPS у production
        httpOnly: true,
        maxAge: 3600000,
        sameSite: 'none',
      },
    }),
  );
  expressApp.set('trust proxy', 1);
  app.use(passport.initialize());
  app.use(passport.session());
  //test ghookgasdsdsdsd

  const port = process.env.PORT || 8000;
  await app.listen(port, '0.0.0.0');
}
bootstrap();

import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { AppModule } from './app.module';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { TransformInterceptor } from './common/interceptors/transform.interceptor';
import { default as compression } from 'compression';
import helmet from 'helmet';
import { NestExpressApplication } from '@nestjs/platform-express';
import { join } from 'path';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  const logger = new Logger('Bootstrap');

  app.setGlobalPrefix('api');

  app.useStaticAssets(join(__dirname, '..', 'uploads'), { prefix: '/uploads' });

  const devOrigins = [
    'http://localhost:4200',
    'http://192.168.18.8:4200',
  ];

  const allowedOrigins = [
    ...devOrigins,
    ...(process.env.FRONTEND_URL ?? '')
      .split(',')
      .map((url) => url.trim().replace(/\/+$/, ''))
      .filter(Boolean),
  ];

  app.enableCors({
    origin: (origin, cb) => {
      if (!origin) return cb(null, true);
      const normalized = origin.replace(/\/+$/, '');
      if (allowedOrigins.includes(normalized)) return cb(null, true);
      return cb(new Error(`Origin no permitido por CORS: ${origin}`), false);
    },
    credentials: true,
  });
  logger.log(`CORS habilitado para: ${allowedOrigins.join(', ')}`);

  app.use(helmet({
    crossOriginResourcePolicy: { policy: 'cross-origin' },
  }));

  app.use(compression());

  app.useGlobalPipes(new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
    transformOptions: { enableImplicitConversion: true },
  }));

  app.useGlobalFilters(new HttpExceptionFilter());
  app.useGlobalInterceptors(new TransformInterceptor());

  const port = process.env.PORT ?? 3000;
  await app.listen(port);
  logger.log(`EduAula API corriendo en http://localhost:${port}/api`);
}
bootstrap();
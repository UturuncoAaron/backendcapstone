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

  // ── CORS ────────────────────────────────────────────────────────
  // `FRONTEND_URL` puede ser:
  //   - vacío (usamos el default de dev `http://localhost:4200`),
  //   - una URL única (ej. `https://eduaula.onrender.com`),
  //   - varias URLs separadas por coma (ej. `http://localhost:4200,https://eduaula.onrender.com`).
  // En todos los casos normalizamos: trim + sin slash final, así el header
  // `Access-Control-Allow-Origin` siempre coincide con el `Origin` del
  // navegador (que NUNCA lleva slash final).
  const allowedOrigins = (process.env.FRONTEND_URL ?? 'http://localhost:4200')
    .split(',')
    .map((url) => url.trim().replace(/\/+$/, ''))
    .filter(Boolean);

  app.enableCors({
    origin: (origin, cb) => {
      // Permite herramientas server-to-server (curl/Postman) que no envían Origin.
      if (!origin) return cb(null, true);
      const normalized = origin.replace(/\/+$/, '');
      if (allowedOrigins.includes(normalized)) return cb(null, true);
      return cb(new Error(`Origin no permitido por CORS: ${origin}`), false);
    },
    credentials: true,
  });
  logger.log(`CORS habilitado para: ${allowedOrigins.join(', ')}`);

  // Cabeceras de seguridad por defecto (CSP, X-Frame-Options, etc).
  // crossOriginResourcePolicy se relaja para que el frontend pueda servir
  // /uploads (fotos de perfil, materiales) desde otro origen.
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
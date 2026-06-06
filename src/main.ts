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
  // 1. FORZAR ZONA HORARIA DE PERÚ EN EL PROCESO DEL BACKEND
  process.env.TZ = 'America/Lima';

  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  const logger = new Logger('Bootstrap');

  app.setGlobalPrefix('api');

  // Ajuste para Vercel: Solo mapear la carpeta si existe físicamente (entorno local / VPS futuro)
  if (!process.env.VERCEL) {
    app.useStaticAssets(join(__dirname, '..', 'uploads'), { prefix: '/uploads' });
  }

  // Orígenes permitidos para desarrollo local
  const devOrigins = [
    'http://localhost:4200',
  ];

  // Orígenes permitidos para producción (se leerán de la variable de entorno en Vercel o VPS)
  const allowedOrigins = [
    ...devOrigins,
    ...(process.env.FRONTEND_URL ?? '')
      .split(',')
      .map((url) => url.trim().replace(/\/+$/, ''))
      .filter(Boolean),
  ];

  app.enableCors({
    origin: (origin, cb) => {
      // Permitir peticiones sin origen (como Postman o apps móviles)
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

  // Retornar la instancia Express para que Vercel pueda manejarla en modo Serverless
  return app.getHttpAdapter().getInstance();
}

// Manejador obligatorio para el despliegue Serverless en Vercel
export const handler = async (req: any, res: any) => {
  const instance = await bootstrap();
  return instance(req, res);
};
import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { AppModule } from './app.module';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { TransformInterceptor } from './common/interceptors/transform.interceptor';
import { default as compression } from 'compression';
import helmet from 'helmet';
import { NestExpressApplication } from '@nestjs/platform-express';

// Guardamos la referencia de la app para no reinicializar NestJS en cada petición de Vercel
let cachedApp: any;

async function bootstrap() {
  // 1. FORZAR ZONA HORARIA DE PERÚ
  process.env.TZ = 'America/Lima';

  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  const logger = new Logger('Bootstrap');

  app.setGlobalPrefix('api');

  // Orígenes permitidos para desarrollo local
  const devOrigins = [
    'http://localhost:4200',
  ];

  // Orígenes permitidos para producción (FRONTEND_URL)
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

  // SI ESTAMOS EN LOCAL: Escucha un puerto real
  if (!process.env.VERCEL) {
    const port = process.env.PORT ?? 3000;
    await app.listen(port);
    logger.log(`EduAula API corriendo en local: http://localhost:${port}/api`);
  }

  // Inicializa los componentes internos de Express sin bloquear el puerto en la nube
  await app.init();

  return app.getHttpAdapter().getInstance();
}

// DETERMINAR EL MODO DE EJECUCIÓN
if (!process.env.VERCEL) {
  // Si no es Vercel (es tu PC local), levanta NestJS normalmente al instante
  bootstrap();
}

// Exportación por defecto limpia y optimizada para Vercel Serverless
export default async (req: any, res: any) => {
  if (!cachedApp) {
    cachedApp = await bootstrap();
  }
  return cachedApp(req, res);
};
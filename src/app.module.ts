import 'dotenv/config';
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { APP_GUARD } from '@nestjs/core';
import { Injectable, CanActivate, ExecutionContext } from '@nestjs/common';
import { AuthModule } from './modules/auth/auth.module.js';
import { UsersModule } from './modules/users/users.module.js';
import { JwtAuthGuard } from './modules/auth/guards/jwt-auth.guard.js';
import { AcademicModule } from './modules/academic/academic.module.js';
import { CoursesModule } from './modules/courses/courses.module.js';
import { MaterialsModule } from './modules/materials/materials.module.js';
import { ExamsModule } from './modules/exams/exams.module.js';
import { TasksModule } from './modules/tasks/tasks.module.js';
import { ForumModule } from './modules/forum/forum.module.js';
import { GradesModule } from './modules/grades/grades.module.js';
import { StorageModule } from './modules/storage/storage.module.js';
import { LibretasModule } from './modules/libretas/libretas.module.js';
import { ConfiguracionModule } from './modules/configuracion/configuracion.module.js';

@Injectable()
class DevBypassGuard implements CanActivate {
  canActivate(_ctx: ExecutionContext): boolean {
    return true;
  }
}

const isDev = process.env.NODE_ENV === 'development';
console.log('NODE_ENV:', process.env.NODE_ENV, '| isDev:', isDev);

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (cfg: ConfigService) => ({
        type: 'postgres',
        host: cfg.get('DB_HOST', 'localhost'),
        port: cfg.get<number>('DB_PORT', 5432),
        username: cfg.get('DB_USER', 'postgres'),
        password: cfg.get('DB_PASS', 'postgres'),
        database: cfg.get('DB_NAME', 'eduaula'),
        entities: [__dirname + '/**/*.entity{.ts,.js}'],
        synchronize: false,
        logging: isDev,
        extra: { max: 10, idleTimeoutMillis: 30000 },
      }),
    }),
    AuthModule,
    UsersModule,
    AcademicModule,
    CoursesModule,
    MaterialsModule, ExamsModule, TasksModule, ForumModule, GradesModule, StorageModule, LibretasModule,
    ConfiguracionModule,
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: isDev ? DevBypassGuard : JwtAuthGuard,
    },
  ],
})
export class AppModule { }
import 'dotenv/config';
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { APP_GUARD } from '@nestjs/core';
import { Injectable, CanActivate, ExecutionContext } from '@nestjs/common';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { ScheduleModule as NestScheduleModule } from '@nestjs/schedule';

import { AuthModule } from './modules/auth/auth.module.js';
import { UsersModule } from './modules/users/users.module.js';
import { AcademicModule } from './modules/academic/academic.module.js';
import { CoursesModule } from './modules/courses/courses.module.js';
import { MaterialsModule } from './modules/materials/materials.module.js';
import { TasksModule } from './modules/tasks/tasks.module.js';
import { ForumModule } from './modules/forum/forum.module.js';
import { GradesModule } from './modules/grades/grades.module.js';
import { StorageModule } from './modules/storage/storage.module.js';
import { LibretasModule } from './modules/libretas/libretas.module.js';
import { LiveClassesModule } from './modules/live-classes/live-classes.module.js';
import { AnnouncementsModule } from './modules/announcements/announcements.module.js';
import { ReportsModule } from './modules/reports/reports.module.js';
import { ParentPortalModule } from './modules/parent-portal/parent-portal.module.js';
import { ImportModule } from './modules/import/import.module.js';
import { DashboardModule } from './modules/dashboard/dashboard.module.js';
import { ScheduleModule } from './modules/schedule/schedule.module.js';
import { JwtAuthGuard } from './modules/auth/guards/jwt-auth.guard.js';

// ── New v6 modules ────────────────────────────────────────────
import { PermissionsModule } from './modules/permissions/permissions.module.js';
import { AttachmentsModule } from './modules/attachments/attachments.module.js';
import { PsychologyModule } from './modules/psychology/psychology.module.js';
import { MessagingModule } from './modules/messaging/messaging.module.js';
import { NotificationsModule } from './modules/notifications/notifications.module.js';
import { AssistsModule } from './modules/assists/assists.module.js';
import { AppointmentsModule } from './modules/appointments/appointments.module.js';
import { HistoricoModule } from './modules/historico/historico.module.js';

@Injectable()
class DevBypassGuard implements CanActivate {
  canActivate(_ctx: ExecutionContext): boolean {
    return true;
  }
}

const isDev = process.env.NODE_ENV === 'development';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),

    // ── Infraestructura interna ───────────────────────────────────
    // EventEmitter desacopla productores (citas/comunicados/tareas) de
    // consumidores (NotificationsListener). ScheduleModule habilita los
    // @Cron decorators usados para la limpieza de notificaciones.
    EventEmitterModule.forRoot({
      wildcard: true,
      delimiter: '.',
      maxListeners: 20,
      verboseMemoryLeak: true,
    }),
    NestScheduleModule.forRoot(),

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
        ssl: isDev ? false : { rejectUnauthorized: false },
        extra: { max: 10, idleTimeoutMillis: 30000 },
      }),
    }),

    // ── Auth & Users ──────────────────────────────────────────────
    AuthModule,
    UsersModule,

    // ── Academic ──────────────────────────────────────────────────
    AcademicModule,
    CoursesModule,
    ScheduleModule,
    AssistsModule,

    // ── Educational content ───────────────────────────────────────
    MaterialsModule,
    TasksModule,
    ForumModule,
    GradesModule,
    LiveClassesModule,
    LibretasModule,

    // ── Communication ─────────────────────────────────────────────
    AnnouncementsModule,
    MessagingModule,

    // ── Psychology ────────────────────────────────────────────────
    PsychologyModule,
    AppointmentsModule,

    // ── Parent portal ─────────────────────────────────────────────
    ParentPortalModule,

    // ── Admin ─────────────────────────────────────────────────────
    ImportModule,
    ReportsModule,
    HistoricoModule,

    // ── Permissions & Notifications ───────────────────────────────
    PermissionsModule,
    AttachmentsModule,
    NotificationsModule,

    // ── Infrastructure ────────────────────────────────────────────
    StorageModule,
    DashboardModule,
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: isDev ? DevBypassGuard : JwtAuthGuard,
    },
  ],
})
export class AppModule { }

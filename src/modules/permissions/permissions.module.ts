import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PermissionsService } from './permissions.service.js';
import { PermissionsController } from './permissions.controller.js';
import { PermisoGuard } from '../auth/guards/permiso.guard.js';
import { PermisoExtra } from './entities/permissions.entity.js';

@Module({
    imports: [TypeOrmModule.forFeature([PermisoExtra])],
    controllers: [PermissionsController],
    providers: [PermissionsService, PermisoGuard],
    exports: [PermissionsService, PermisoGuard],
})
export class PermissionsModule {}
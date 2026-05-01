import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PermisoExtra } from './entities/permissions.entity.js';
import { PermissionsService } from './permissions.service.js';
import { PermissionsController } from './permissions.controller.js';

@Module({
    imports: [TypeOrmModule.forFeature([PermisoExtra])],
    controllers: [PermissionsController],
    providers: [PermissionsService],
    exports: [PermissionsService],
})
export class PermissionsModule { }
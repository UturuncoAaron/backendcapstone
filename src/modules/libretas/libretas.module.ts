import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { LibretasController } from './libretas.controller.js';
import { LibretasService } from './libretas.service.js';
import { Libreta } from './entities/libreta.entity.js';
import { LibretaLectura } from './entities/libreta-lectura.entity.js';
import { StorageModule } from '../storage/storage.module.js';
import { PermissionsModule } from '../permissions/permissions.module.js';

@Module({
    imports: [
        TypeOrmModule.forFeature([Libreta, LibretaLectura]),
        StorageModule,
        PermissionsModule,
    ],
    controllers: [LibretasController],
    providers: [LibretasService],
    exports: [LibretasService],
})
export class LibretasModule { }

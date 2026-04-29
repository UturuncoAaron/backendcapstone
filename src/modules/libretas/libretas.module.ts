import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { LibretasController } from './libretas.controller.js';
import { LibretasService } from './libretas.service.js';
import { Libreta } from './entities/libreta.entity.js';
import { StorageModule } from '../storage/storage.module.js';

@Module({
    imports: [
        TypeOrmModule.forFeature([Libreta]),
        StorageModule,
    ],
    controllers: [LibretasController],
    providers: [LibretasService],
    exports: [LibretasService],
})
export class LibretasModule { }

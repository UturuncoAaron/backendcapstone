import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MaterialsController } from './materials.controller.js';
import { MaterialsService } from './materials.service.js';
import { Material } from './entities/material.entity.js';
import { MaterialView } from './entities/material-view.entity.js';
import { StorageModule } from '../storage/storage.module.js';
import { SemanasModule } from '../semanas/semanas.module.js';

@Module({
    imports: [
        TypeOrmModule.forFeature([Material, MaterialView]),
        StorageModule,
        SemanasModule,
    ],
    controllers: [MaterialsController],
    providers: [MaterialsService],
    exports: [MaterialsService],
})
export class MaterialsModule { }

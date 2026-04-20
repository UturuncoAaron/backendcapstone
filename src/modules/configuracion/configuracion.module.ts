import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfiguracionController } from './configuracion.controller.js';
import { ConfiguracionService } from './configuracion.service.js';
import { Configuracion } from './entities/configuracion.entity.js';
 
@Module({
    imports: [TypeOrmModule.forFeature([Configuracion])],
    controllers: [ConfiguracionController],
    providers: [ConfiguracionService],
    exports: [ConfiguracionService],
})
export class ConfiguracionModule { }
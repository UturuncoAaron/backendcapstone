import {
    Injectable, NotFoundException, Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Configuracion } from './entities/configuracion.entity.js';

@Injectable()
export class ConfiguracionService {
    private readonly logger = new Logger(ConfiguracionService.name);

    constructor(
        @InjectRepository(Configuracion)
        private readonly configRepo: Repository<Configuracion>,
    ) { }

    /** Obtener todos los parámetros */
    async findAll(): Promise<Configuracion[]> {
        return this.configRepo.find({ order: { clave: 'ASC' } });
    }

    /** Obtener un parámetro por clave */
    async findOne(clave: string): Promise<Configuracion> {
        const config = await this.configRepo.findOne({ where: { clave } });
        if (!config) throw new NotFoundException(`Parámetro '${clave}' no encontrado`);
        return config;
    }

    /** Obtener solo el valor de un parámetro */
    async getValue(clave: string): Promise<string> {
        const config = await this.findOne(clave);
        return config.valor;
    }

    /** Actualizar un parámetro existente */
    async update(clave: string, valor: string): Promise<Configuracion> {
        const config = await this.findOne(clave);
        config.valor = valor;
        this.logger.log(`Configuración actualizada: ${clave} = ${valor}`);
        return this.configRepo.save(config);
    }

    /** Actualizar múltiples parámetros de una vez */
    async updateMany(params: { clave: string; valor: string }[]): Promise<Configuracion[]> {
        const results: Configuracion[] = [];
        for (const { clave, valor } of params) {
            const config = await this.findOne(clave);
            config.valor = valor;
            results.push(await this.configRepo.save(config));
        }
        this.logger.log(`${results.length} parámetros actualizados`);
        return results;
    }
}

import {
    Injectable,
    Logger,
    OnApplicationBootstrap,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

import { APPOINTMENT_STATUSES } from './appointments.types.js';

/**
 * Sincroniza el esquema de las tablas que maneja el módulo de citas con la
 * forma que esperan las entidades. Corre una sola vez al arrancar la app y
 * todas las sentencias son idempotentes — si la BD ya está al día no hace
 * nada visible.
 *
 * El proyecto no usa migraciones de TypeORM (synchronize: false), así que
 * cualquier evolución del esquema vive acá para que el equipo no tenga que
 * correr SQL a mano en cada entorno.
 *
 * Cambios cubiertos:
 *
 *  1. `citas.citas_estado_check` — la constraint original no incluía el
 *     estado `'rechazada'`, así que `POST /appointments/:id/reject` reventaba
 *     con 500. La rehacemos con la lista actual de
 *     `APPOINTMENT_STATUSES`.
 *
 *  2. `disponibilidad_cuenta.uq_disp_cuenta_dia` — la constraint original
 *     era UNIQUE(cuenta_id, dia_semana), lo que impedía guardar más de un
 *     bloque por día (un docente con 9–10 y 11–12 los lunes choca). La
 *     reemplazamos por UNIQUE(cuenta_id, dia_semana, hora_inicio) para que
 *     un mismo día pueda tener N bloques siempre que no empiecen a la
 *     misma hora.
 */
@Injectable()
export class AppointmentsSchemaSync implements OnApplicationBootstrap {
    private readonly logger = new Logger(AppointmentsSchemaSync.name);

    constructor(
        @InjectDataSource() private readonly dataSource: DataSource,
    ) {}

    async onApplicationBootstrap(): Promise<void> {
        try {
            await this.syncEstadoCheck();
            await this.syncDisponibilidadUnique();
        } catch (err) {
            // No queremos que un fallo de sync tire la app entera; lo
            // logueamos y dejamos que los endpoints normales devuelvan
            // errores claros si la constraint sigue mal.
            this.logger.error(
                'Sincronización de esquema de citas falló — revisar BD manualmente',
                err instanceof Error ? err.stack : String(err),
            );
        }
    }

    /** Reemplaza citas_estado_check con la lista actual de estados. */
    private async syncEstadoCheck(): Promise<void> {
        const allowed = APPOINTMENT_STATUSES.map(s => `'${s}'`).join(', ');
        await this.dataSource.query(`
            ALTER TABLE citas DROP CONSTRAINT IF EXISTS citas_estado_check;
            ALTER TABLE citas
                ADD CONSTRAINT citas_estado_check
                CHECK (estado IN (${allowed}));
        `);
        this.logger.log(
            `citas_estado_check sincronizado (${APPOINTMENT_STATUSES.length} estados)`,
        );
    }

    /**
     * Reemplaza uq_disp_cuenta_dia por uq_disp_cuenta_dia_hora para permitir
     * múltiples bloques por día.
     */
    private async syncDisponibilidadUnique(): Promise<void> {
        await this.dataSource.query(`
            ALTER TABLE disponibilidad_cuenta
                DROP CONSTRAINT IF EXISTS uq_disp_cuenta_dia;
            ALTER TABLE disponibilidad_cuenta
                DROP CONSTRAINT IF EXISTS uq_disp_cuenta_dia_hora;
            ALTER TABLE disponibilidad_cuenta
                ADD CONSTRAINT uq_disp_cuenta_dia_hora
                UNIQUE (cuenta_id, dia_semana, hora_inicio);
        `);
        this.logger.log(
            'uq_disp_cuenta_dia → uq_disp_cuenta_dia_hora aplicado',
        );
    }
}

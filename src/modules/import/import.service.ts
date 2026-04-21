import { Injectable, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { InjectDataSource } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { User } from '../users/entities/user.entity.js';
import { Matricula } from '../academic/entities/matricula.entity.js';
import { ImportQueryDto, CsvRow, ImportResult, ImportError } from './dto/import-query.dto.js';

@Injectable()
export class ImportService {
    constructor(
        @InjectRepository(User)
        private readonly userRepo: Repository<User>,
        @InjectRepository(Matricula)
        private readonly matriculaRepo: Repository<Matricula>,
        @InjectDataSource()
        private readonly dataSource: DataSource,
    ) { }

    /**
     * Parsear CSV a array de objetos
     * Soporta separador coma o punto y coma (Excel peruano usa ;)
     */
    parseCsv(buffer: Buffer): CsvRow[] {
        const text = buffer.toString('utf-8').replace(/^\uFEFF/, ''); // quitar BOM
        const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);

        if (lines.length < 2) {
            throw new BadRequestException('El CSV debe tener encabezado y al menos una fila de datos');
        }

        // Detectar separador automáticamente
        const separator = lines[0].includes(';') ? ';' : ',';
        const headers = lines[0].split(separator).map(h => h.trim().toLowerCase());

        // Validar columnas obligatorias
        const required = ['tipo_documento', 'numero_documento', 'nombre', 'apellido_paterno'];
        for (const col of required) {
            if (!headers.includes(col)) {
                throw new BadRequestException(`Columna obligatoria faltante: "${col}"`);
            }
        }

        const rows: CsvRow[] = [];
        for (let i = 1; i < lines.length; i++) {
            const values = lines[i].split(separator).map(v => v.trim().replace(/^"|"$/g, ''));
            const row: any = {};
            headers.forEach((h, idx) => {
                row[h] = values[idx] ?? '';
            });
            rows.push(row as CsvRow);
        }

        return rows;
    }

    /**
     * Importar alumnos masivamente desde CSV
     * - Crea usuario si no existe (password por defecto = numero_documento)
     * - Matricula al alumno en seccion_id + periodo_id dados
     * - Si ya está matriculado, lo omite sin error
     */
    async importStudents(
        rows: CsvRow[],
        query: ImportQueryDto,
    ): Promise<ImportResult> {
        const result: ImportResult = {
            total: rows.length,
            creados: 0,
            matriculados: 0,
            omitidos: 0,
            errores: [],
        };

        // Verificar que la sección y periodo existen
        const seccion = await this.dataSource.query(
            `SELECT id FROM secciones WHERE id = $1`,
            [query.seccion_id],
        );
        if (!seccion.length) {
            throw new BadRequestException(`Sección ${query.seccion_id} no existe`);
        }

        const periodo = await this.dataSource.query(
            `SELECT id FROM periodos WHERE id = $1`,
            [query.periodo_id],
        );
        if (!periodo.length) {
            throw new BadRequestException(`Periodo ${query.periodo_id} no existe`);
        }

        for (let i = 0; i < rows.length; i++) {
            const row = rows[i];
            const fila = i + 2; // +2 porque fila 1 = encabezado

            try {
                // Validar campos obligatorios
                if (!row.tipo_documento || !row.numero_documento || !row.nombre || !row.apellido_paterno) {
                    result.errores.push({ fila, numero_documento: row.numero_documento ?? '?', motivo: 'Campos obligatorios vacíos' });
                    continue;
                }

                // Validar tipo_documento
                if (!['dni', 'ce', 'pasaporte'].includes(row.tipo_documento.toLowerCase())) {
                    result.errores.push({ fila, numero_documento: row.numero_documento, motivo: `tipo_documento inválido: "${row.tipo_documento}"` });
                    continue;
                }

                // Buscar o crear usuario
                let user = await this.userRepo.findOne({
                    where: {
                        tipo_documento: row.tipo_documento.toLowerCase() as any,
                        numero_documento: row.numero_documento.trim(),
                    },
                });

                if (!user) {
                    // Crear usuario nuevo — password por defecto = numero_documento
                    const password_hash = await bcrypt.hash(row.numero_documento.trim(), 10);

                    user = this.userRepo.create({
                        tipo_documento: row.tipo_documento.toLowerCase() as any,
                        numero_documento: row.numero_documento.trim(),
                        nombre: row.nombre.trim(),
                        apellido_paterno: row.apellido_paterno.trim(),
                        apellido_materno: row.apellido_materno?.trim() || null,
                        email: row.email?.trim() || null,
                        telefono: row.telefono?.trim() || null,
                        codigo_estudiante: row.codigo_estudiante?.trim() || null,
                        fecha_nacimiento: row.fecha_nacimiento ? new Date(row.fecha_nacimiento) : null,
                        rol: 'alumno',
                        activo: true,
                        password_hash,
                    });

                    await this.userRepo.save(user);
                    result.creados++;
                } else {
                    result.omitidos++;
                }

                // Verificar si ya está matriculado en esta sección+periodo
                const yaMatriculado = await this.matriculaRepo.findOne({
                    where: {
                        alumno_id: user.id,
                        seccion_id: query.seccion_id,
                        periodo_id: query.periodo_id,
                    },
                });

                if (!yaMatriculado) {
                    const matricula = this.matriculaRepo.create({
                        alumno_id: user.id,
                        seccion_id: query.seccion_id,
                        periodo_id: query.periodo_id,
                        activo: true,
                    });
                    await this.matriculaRepo.save(matricula);
                    result.matriculados++;
                }

            } catch (err: any) {
                result.errores.push({
                    fila,
                    numero_documento: row.numero_documento ?? '?',
                    motivo: err.message ?? 'Error desconocido',
                });
            }
        }

        return result;
    }
}
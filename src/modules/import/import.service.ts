import { Injectable, BadRequestException } from '@nestjs/common';
import { InjectRepository, InjectDataSource } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { Cuenta } from '../users/entities/cuenta.entity.js';
import { Alumno } from '../users/entities/alumno.entity.js';
import { Matricula } from '../academic/entities/matricula.entity.js';
import { ImportQueryDto, CsvRow, ImportResult } from './dto/import-query.dto.js';

@Injectable()
export class ImportService {
    constructor(
        @InjectRepository(Cuenta)
        private readonly cuentaRepo: Repository<Cuenta>,
        @InjectRepository(Alumno)
        private readonly alumnoRepo: Repository<Alumno>,
        @InjectRepository(Matricula)
        private readonly matriculaRepo: Repository<Matricula>,
        @InjectDataSource()
        private readonly dataSource: DataSource,
    ) { }

    parseCsv(buffer: Buffer): CsvRow[] {
        const text = buffer.toString('utf-8').replace(/^\uFEFF/, '');
        const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);

        if (lines.length < 2) {
            throw new BadRequestException('El CSV debe tener encabezado y al menos una fila de datos');
        }

        const separator = lines[0].includes(';') ? ';' : ',';
        const headers = lines[0].split(separator).map(h => h.trim().toLowerCase());

        const required = ['tipo_documento', 'numero_documento', 'nombre', 'apellido_paterno'];
        for (const col of required) {
            if (!headers.includes(col)) {
                throw new BadRequestException(`Columna obligatoria faltante: "${col}"`);
            }
        }

        return lines.slice(1).map(line => {
            const values = line.split(separator).map(v => v.trim().replace(/^"|"$/g, ''));
            const row: any = {};
            headers.forEach((h, idx) => { row[h] = values[idx] ?? ''; });
            return row as CsvRow;
        });
    }

    async importStudents(rows: CsvRow[], query: ImportQueryDto): Promise<ImportResult> {
        const result: ImportResult = {
            total: rows.length,
            creados: 0,
            matriculados: 0,
            omitidos: 0,
            errores: [],
        };

        // Verificar sección (UUID en v7)
        const seccion = await this.dataSource.query(
            `SELECT id FROM secciones WHERE id = $1`,
            [query.seccion_id],   // string UUID ✓
        );
        if (!seccion.length) {
            throw new BadRequestException(`Sección ${query.seccion_id} no existe`);
        }

        // Verificar periodo (INT en v7)
        const periodo = await this.dataSource.query(
            `SELECT id FROM periodos WHERE id = $1`,
            [query.periodo_id],
        );
        if (!periodo.length) {
            throw new BadRequestException(`Periodo ${query.periodo_id} no existe`);
        }

        for (let i = 0; i < rows.length; i++) {
            const row = rows[i];
            const fila = i + 2;

            try {
                if (!row.tipo_documento || !row.numero_documento || !row.nombre || !row.apellido_paterno) {
                    result.errores.push({ fila, numero_documento: row.numero_documento ?? '?', motivo: 'Campos obligatorios vacíos' });
                    continue;
                }

                if (!['dni', 'ce', 'pasaporte'].includes(row.tipo_documento.toLowerCase())) {
                    result.errores.push({ fila, numero_documento: row.numero_documento, motivo: `tipo_documento inválido: "${row.tipo_documento}"` });
                    continue;
                }

                let cuenta = await this.cuentaRepo.findOne({
                    where: {
                        tipo_documento: row.tipo_documento.toLowerCase() as any,
                        numero_documento: row.numero_documento.trim(),
                    },
                });

                if (!cuenta) {
                    const password_hash = await bcrypt.hash(row.numero_documento.trim(), 10);

                    cuenta = await this.cuentaRepo.save(
                        this.cuentaRepo.create({
                            tipo_documento: row.tipo_documento.toLowerCase() as any,
                            numero_documento: row.numero_documento.trim(),
                            password_hash,
                            rol: 'alumno',
                            activo: true,
                        })
                    );

                    await this.alumnoRepo.save(
                        this.alumnoRepo.create({
                            id: cuenta.id,
                            codigo_estudiante: row.codigo_estudiante?.trim() || `EST-${row.numero_documento.trim()}`,
                            nombre: row.nombre.trim(),
                            apellido_paterno: row.apellido_paterno.trim(),
                            apellido_materno: row.apellido_materno?.trim() || null,
                            email: row.email?.trim() || null,
                            telefono: row.telefono?.trim() || null,
                            // fecha_nacimiento nullable en v7 ✓
                            fecha_nacimiento: row.fecha_nacimiento ? new Date(row.fecha_nacimiento) : null,
                        })
                    );

                    result.creados++;
                } else {
                    if (cuenta.rol !== 'alumno') {
                        result.errores.push({ fila, numero_documento: row.numero_documento, motivo: `La cuenta ya existe pero tiene rol de ${cuenta.rol}` });
                        continue;
                    }
                    result.omitidos++;
                }

                // seccion_id ahora es UUID string en v7 ✓
                const yaMatriculado = await this.matriculaRepo.findOne({
                    where: {
                        alumno_id: cuenta.id,
                        seccion_id: query.seccion_id,
                        periodo_id: query.periodo_id,
                    },
                });

                if (!yaMatriculado) {
                    await this.matriculaRepo.save(
                        this.matriculaRepo.create({
                            alumno_id: cuenta.id,
                            seccion_id: query.seccion_id,
                            periodo_id: query.periodo_id,
                            activo: true,
                        })
                    );
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
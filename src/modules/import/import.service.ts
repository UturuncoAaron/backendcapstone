import { Injectable, BadRequestException } from '@nestjs/common';
import { InjectRepository, InjectDataSource } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import * as bcrypt from 'bcrypt';
import * as ExcelJS from 'exceljs';
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

    async parseFile(originalname: string, buffer: Buffer): Promise<CsvRow[]> {
        const ext = originalname.split('.').pop()?.toLowerCase();
        if (ext === 'csv') {
            return this.parseCsv(buffer);
        }
        return this.parseExcel(buffer);
    }

    async parseExcel(buffer: Buffer): Promise<CsvRow[]> {
        const wb = new ExcelJS.Workbook();
        await wb.xlsx.load(buffer.buffer.slice(
            buffer.byteOffset,
            buffer.byteOffset + buffer.byteLength,
        ) as ArrayBuffer);

        const ws = wb.worksheets[0];
        if (!ws) {
            throw new BadRequestException('El archivo Excel está vacío o no tiene hojas válidas');
        }

        const rows: CsvRow[] = [];
        let headers: string[] = [];

        ws.eachRow((row, rowNumber) => {
            // La fila 1 es el encabezado
            if (rowNumber === 1) {
                // row.values[0] es undefined (ExcelJS indexa desde 1)
                headers = (row.values as ExcelJS.CellValue[])
                    .slice(1)
                    .map(v => String(v ?? '').trim().toLowerCase());
                return;
            }

            // Filas de datos — saltar filas completamente vacías
            const values = (row.values as ExcelJS.CellValue[]).slice(1);
            const allEmpty = values.every(v => v === null || v === undefined || v === '');
            if (allEmpty) return;

            const obj: Record<string, string> = {};
            headers.forEach((h, i) => {
                obj[h] = String(values[i] ?? '').trim();
            });
            rows.push(obj as unknown as CsvRow);
        });

        if (rows.length === 0) {
            throw new BadRequestException('El archivo Excel está vacío o no tiene datos válidos');
        }

        // Validar columnas obligatorias
        const required = ['tipo_documento', 'numero_documento', 'nombre', 'apellido_paterno'];
        for (const col of required) {
            if (!headers.includes(col)) {
                throw new BadRequestException(`Columna obligatoria faltante en Excel: "${col}"`);
            }
        }

        return rows;
    }

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
            const row: Record<string, string> = {};
            headers.forEach((h, idx) => { row[h] = values[idx] ?? ''; });
            return row as unknown as CsvRow;
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
            const fila = i + 2;

            try {
                if (!row.tipo_documento || !row.numero_documento || !row.nombre || !row.apellido_paterno) {
                    result.errores.push({
                        fila,
                        numero_documento: row.numero_documento ?? '?',
                        motivo: 'Campos obligatorios vacíos',
                    });
                    continue;
                }

                if (!['dni', 'ce', 'pasaporte'].includes(row.tipo_documento.toLowerCase())) {
                    result.errores.push({
                        fila,
                        numero_documento: row.numero_documento,
                        motivo: `tipo_documento inválido: "${row.tipo_documento}"`,
                    });
                    continue;
                }

                const dni = row.numero_documento.trim();

                let cuenta = await this.cuentaRepo.findOne({
                    where: {
                        tipo_documento: row.tipo_documento.toLowerCase() as any,
                        numero_documento: dni,
                    },
                });

                if (!cuenta) {
                    const password_hash = await bcrypt.hash(dni, 10);

                    cuenta = await this.cuentaRepo.save(
                        this.cuentaRepo.create({
                            tipo_documento: row.tipo_documento.toLowerCase() as any,
                            numero_documento: dni,
                            password_hash,
                            codigo_acceso: `EST-${dni}`,
                            password_changed: false,
                            rol: 'alumno',
                            activo: true,
                        }),
                    );

                    await this.alumnoRepo.save(
                        this.alumnoRepo.create({
                            id: cuenta.id,
                            codigo_estudiante: row.codigo_estudiante?.trim() || `EST-${dni}`,
                            nombre: row.nombre.trim(),
                            apellido_paterno: row.apellido_paterno.trim(),
                            apellido_materno: row.apellido_materno?.trim() || null,
                            email: row.email?.trim() || null,
                            telefono: row.telefono?.trim() || null,
                            fecha_nacimiento: row.fecha_nacimiento ? new Date(row.fecha_nacimiento) : null,
                        }),
                    );

                    result.creados++;
                } else {
                    if (cuenta.rol !== 'alumno') {
                        result.errores.push({
                            fila,
                            numero_documento: dni,
                            motivo: `La cuenta ya existe pero tiene rol de ${cuenta.rol}`,
                        });
                        continue;
                    }
                    if (!cuenta.codigo_acceso) {
                        cuenta.codigo_acceso = `EST-${dni}`;
                        await this.cuentaRepo.save(cuenta);
                    }
                    result.omitidos++;
                }

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
                        }),
                    );
                    result.matriculados++;
                }

            } catch (err: unknown) {
                result.errores.push({
                    fila,
                    numero_documento: row.numero_documento ?? '?',
                    motivo: (err as Error).message ?? 'Error desconocido',
                });
            }
        }

        return result;
    }
}
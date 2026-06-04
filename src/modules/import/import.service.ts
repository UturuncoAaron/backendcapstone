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
        @InjectRepository(Cuenta) private readonly cuentaRepo: Repository<Cuenta>,
        @InjectRepository(Alumno) private readonly alumnoRepo: Repository<Alumno>,
        @InjectRepository(Matricula) private readonly matriculaRepo: Repository<Matricula>,
        @InjectDataSource() private readonly dataSource: DataSource,
    ) { }

    async parseFile(originalname: string, buffer: Buffer): Promise<CsvRow[]> {
        const ext = originalname.split('.').pop()?.toLowerCase();
        return ext === 'csv' ? this.parseCsv(buffer) : this.parseExcel(buffer);
    }

    async parseExcel(buffer: Buffer): Promise<CsvRow[]> {
        const wb = new ExcelJS.Workbook();
        await wb.xlsx.load(buffer.buffer.slice(
            buffer.byteOffset,
            buffer.byteOffset + buffer.byteLength,
        ) as ArrayBuffer);

        const ws = wb.worksheets[0];
        if (!ws) throw new BadRequestException('El archivo Excel está vacío o no tiene hojas válidas');

        const rows: CsvRow[] = [];
        let headers: string[] = [];

        ws.eachRow((row, rowNumber) => {
            if (rowNumber === 1) {
                headers = (row.values as ExcelJS.CellValue[])
                    .slice(1)
                    .map(v => String(v ?? '').trim().toLowerCase());
                return;
            }
            const values = (row.values as ExcelJS.CellValue[]).slice(1);
            if (values.every(v => v === null || v === undefined || v === '')) return;

            const obj: Record<string, string> = {};
            headers.forEach((h, i) => { obj[h] = String(values[i] ?? '').trim(); });
            rows.push(obj as unknown as CsvRow);
        });

        if (rows.length === 0) throw new BadRequestException('El archivo Excel no tiene datos válidos');

        const required = ['tipo_documento', 'numero_documento', 'nombre', 'apellido_paterno'];
        for (const col of required) {
            if (!headers.includes(col)) throw new BadRequestException(`Columna obligatoria faltante: "${col}"`);
        }
        return rows;
    }

    parseCsv(buffer: Buffer): CsvRow[] {
        const text = buffer.toString('utf-8').replace(/^\uFEFF/, '');
        const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);

        if (lines.length < 2) throw new BadRequestException('El CSV debe tener encabezado y al menos una fila');

        const separator = lines[0].includes(';') ? ';' : ',';
        const headers = lines[0].split(separator).map(h => h.trim().toLowerCase());

        const required = ['tipo_documento', 'numero_documento', 'nombre', 'apellido_paterno'];
        for (const col of required) {
            if (!headers.includes(col)) throw new BadRequestException(`Columna obligatoria faltante: "${col}"`);
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
            total: rows.length, creados: 0, matriculados: 0, omitidos: 0, errores: [],
        };

        const [seccion] = await this.dataSource.query(
            `SELECT id, capacidad FROM secciones WHERE id = $1`,
            [query.seccion_id],
        ) as { id: string; capacidad: number }[];

        if (!seccion) throw new BadRequestException(`Sección ${query.seccion_id} no existe`);

        const anio = Number(query.anio);

        for (let i = 0; i < rows.length; i++) {
            const row = rows[i];
            const fila = i + 2;

            try {
                if (!row.tipo_documento || !row.numero_documento || !row.nombre || !row.apellido_paterno) {
                    result.errores.push({ fila, numero_documento: row.numero_documento ?? '?', motivo: 'Campos obligatorios vacíos' });
                    continue;
                }

                const tipoDoc = row.tipo_documento.toLowerCase();
                if (!['dni', 'ce', 'pasaporte'].includes(tipoDoc)) {
                    result.errores.push({ fila, numero_documento: row.numero_documento, motivo: `tipo_documento inválido: "${row.tipo_documento}"` });
                    continue;
                }

                const dni = row.numero_documento.trim();

                let cuenta = await this.cuentaRepo.findOne({
                    where: { tipo_documento: tipoDoc as any, numero_documento: dni },
                });

                if (!cuenta) {
                    try {
                        await this.dataSource.transaction(async (em) => {
                            const password_hash = await bcrypt.hash(dni, 10);

                            cuenta = await em.save(
                                em.create(Cuenta, {
                                    tipo_documento: tipoDoc as any,
                                    numero_documento: dni,
                                    password_hash,
                                    codigo_acceso: `EST-${dni}`,
                                    password_changed: false,
                                    rol: 'alumno',
                                    activo: true,
                                }),
                            );

                            await em.save(
                                em.create(Alumno, {
                                    id: cuenta!.id,
                                    codigo_estudiante: `EST-${dni}`,
                                    nombre: row.nombre.trim(),
                                    apellido_paterno: row.apellido_paterno.trim(),
                                    apellido_materno: row.apellido_materno?.trim() || null,
                                    email: row.email?.trim() || null,
                                    telefono: row.telefono?.trim() || null,
                                    fecha_nacimiento: row.fecha_nacimiento ? new Date(row.fecha_nacimiento) : null,
                                }),
                            );
                        });

                        result.creados++;
                    } catch (err: unknown) {
                        result.errores.push({
                            fila,
                            numero_documento: dni,
                            motivo: (err as Error).message ?? 'Error al crear cuenta/alumno',
                        });
                        continue;
                    }
                } else {
                    if (cuenta.rol !== 'alumno') {
                        result.errores.push({
                            fila,
                            numero_documento: dni,
                            motivo: `Cuenta existente con rol "${cuenta.rol}"`,
                        });
                        continue;
                    }

                    const alumnoExiste = await this.alumnoRepo.findOne({ where: { id: cuenta.id } });
                    if (!alumnoExiste) {
                        result.errores.push({
                            fila,
                            numero_documento: dni,
                            motivo: 'Cuenta existente pero sin perfil de alumno. Elimina la cuenta y reimporta.',
                        });
                        continue;
                    }

                    result.omitidos++;
                }

                const yaMatriculado = await this.matriculaRepo.findOne({
                    where: { alumno_id: cuenta.id, anio },
                });

                if (!yaMatriculado) {
                    const [{ count }] = await this.dataSource.query(
                        `SELECT COUNT(*)::int AS count FROM matriculas WHERE seccion_id = $1 AND anio = $2 AND activo = TRUE`,
                        [query.seccion_id, anio],
                    ) as { count: number }[];

                    if (count >= seccion.capacidad) {
                        result.errores.push({
                            fila,
                            numero_documento: dni,
                            motivo: `La sección ha alcanzado su capacidad máxima (${seccion.capacidad} alumnos)`,
                        });
                        continue;
                    }

                    await this.matriculaRepo.save(this.matriculaRepo.create({
                        alumno_id: cuenta.id,
                        seccion_id: query.seccion_id,
                        anio,
                        activo: true,
                        condicion_final: 'pendiente',
                    }));
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

    async buildTemplatexlsx(): Promise<Buffer> {
        const wb = new ExcelJS.Workbook();
        const ws = wb.addWorksheet('Alumnos');

        ws.columns = [
            { header: 'tipo_documento', key: 'tipo_documento', width: 18 },
            { header: 'numero_documento', key: 'numero_documento', width: 20 },
            { header: 'nombre', key: 'nombre', width: 20 },
            { header: 'apellido_paterno', key: 'apellido_paterno', width: 22 },
            { header: 'apellido_materno', key: 'apellido_materno', width: 22 },
            { header: 'fecha_nacimiento', key: 'fecha_nacimiento', width: 20 },
            { header: 'email', key: 'email', width: 28 },
            { header: 'telefono', key: 'telefono', width: 16 },
        ];

        ws.addRow({
            tipo_documento: 'dni',
            numero_documento: '12345678',
            nombre: 'Juan',
            apellido_paterno: 'García',
            apellido_materno: 'López',
            fecha_nacimiento: '2010-03-15',
            email: 'juan@mail.com',
            telefono: '999888777',
        });

        const info = wb.addWorksheet('Instrucciones');
        info.getColumn(1).width = 70;
        [
            'INSTRUCCIONES DE IMPORTACIÓN',
            '',
            '• tipo_documento: dni | ce | pasaporte',
            '• numero_documento: se usará como contraseña inicial del alumno',
            '• El código de estudiante se genera automáticamente: EST-{numero_documento}',
            '• fecha_nacimiento: formato YYYY-MM-DD  (ej: 2010-03-15)',
            '• email y telefono son opcionales',
            '• apellido_materno es opcional',
            '',
            'Columnas obligatorias: tipo_documento, numero_documento, nombre, apellido_paterno',
        ].forEach(line => info.addRow([line]));

        const buf = await wb.xlsx.writeBuffer();
        return Buffer.from(buf);
    }
}
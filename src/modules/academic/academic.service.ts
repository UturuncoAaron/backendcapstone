import {
    Injectable, NotFoundException, ConflictException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { GradeLevel } from './entities/grade-level.entity.js';
import { Section } from './entities/section.entity.js';
import { Period } from './entities/period.entity.js';
import { CoursesService } from '../courses/courses.service.js';
import { StorageService } from '../storage/storage.service.js';

interface CreatePeriodoDto {
    nombre: string;
    anio: number;
    bimestre: number;
    fecha_inicio: string;
    fecha_fin: string;
}

@Injectable()
export class AcademicService {
    constructor(
        @InjectRepository(GradeLevel) private readonly gradoRepo: Repository<GradeLevel>,
        @InjectRepository(Section) private readonly seccionRepo: Repository<Section>,
        @InjectRepository(Period) private readonly periodoRepo: Repository<Period>,
        private readonly coursesService: CoursesService,
        private readonly storageService: StorageService,
        private readonly dataSource: DataSource,
    ) { }

    // ── GRADOS ───────────────────────────────────────────────────

    findAllGrados() {
        return this.gradoRepo.find({ order: { orden: 'ASC' } });
    }

    findGradoById(id: number) {
        return this.gradoRepo.findOne({ where: { id }, relations: ['secciones'] });
    }

    // ── SECCIONES ────────────────────────────────────────────────

    findAllSecciones(gradoId?: number) {
        const where: any = {};
        if (gradoId) where.grado_id = gradoId;
        return this.seccionRepo.find({
            where,
            relations: ['grado', 'tutor'],
            order: { nombre: 'ASC' },
        });
    }

    async createSeccion(gradoId: number, nombre: string, capacidad = 35) {
        const grado = await this.gradoRepo.findOne({ where: { id: gradoId } });
        if (!grado) throw new NotFoundException(`Grado ${gradoId} no encontrado`);

        const exists = await this.seccionRepo.findOne({
            where: { grado_id: gradoId, nombre },
        });
        if (exists) throw new ConflictException(`Sección ${nombre} ya existe en ese grado`);

        const seccion = this.seccionRepo.create({ grado_id: gradoId, nombre, capacidad });
        const saved = await this.seccionRepo.save(seccion);

        const periodoActivo = await this.periodoRepo.findOne({ where: { activo: true } });
        const cursosGenerados = periodoActivo
            ? await this.coursesService.generateCoursesFromTemplate(saved.id, periodoActivo.id)
            : null;

        return {
            seccion: saved,
            cursos: cursosGenerados ?? {
                mensaje: 'No hay periodo activo — cursos no generados. Activa un periodo e invoca POST /api/courses/generate/:seccionId/:periodoId',
            },
        };
    }

    async asignarTutor(
        seccionId: number,
        docenteId: string | null,
        force = false,
    ) {
        const seccion = await this.seccionRepo.findOne({ where: { id: seccionId } });
        if (!seccion) throw new NotFoundException(`Sección ${seccionId} no encontrada`);
        if (docenteId === null) {
            seccion.tutor_id = null;
            await this.seccionRepo.save(seccion);
            return this.seccionRepo.findOne({
                where: { id: seccionId },
                relations: ['grado', 'tutor'],
            });
        }

        // Caso 2: asignar / cambiar
        const otra = await this.seccionRepo
            .createQueryBuilder('s')
            .leftJoin('grados', 'g', 'g.id = s.grado_id')
            .select(['s.id AS id', 's.nombre AS nombre', 'g.nombre AS grado_nombre'])
            .where('s.tutor_id = :docId AND s.id <> :seccionId', { docId: docenteId, seccionId })
            .getRawOne();

        if (otra && !force) {
            throw new ConflictException(
                `Este docente ya es tutor de ${otra.grado_nombre} ${otra.nombre}. ` +
                `Confirma para reemplazar.`,
            );
        }

        if (otra && force) {
            await this.seccionRepo.update({ id: otra.id }, { tutor_id: null });
        }

        seccion.tutor_id = docenteId;
        await this.seccionRepo.save(seccion);

        return this.seccionRepo.findOne({
            where: { id: seccionId },
            relations: ['grado', 'tutor'],
        });
    }

    async getTutoriaForDocente(docenteId: string) {
        const seccion = await this.dataSource.query(
            `SELECT
                s.id, s.nombre, s.grado_id, s.capacidad,
                g.nombre AS grado_nombre, g.orden AS grado_orden
             FROM secciones s
             JOIN grados g ON g.id = s.grado_id
             WHERE s.tutor_id = $1
             LIMIT 1`,
            [docenteId],
        );

        if (!seccion.length) return null;

        const sec = seccion[0];
        const periodoActivo = await this.dataSource.query(
            `SELECT id, nombre, anio, bimestre, activo
             FROM periodos WHERE activo = TRUE LIMIT 1`,
        );

        const anio = periodoActivo.length ? periodoActivo[0].anio : new Date().getFullYear();

        const periodos = await this.dataSource.query(
            `SELECT id, nombre, anio, bimestre, activo
             FROM periodos WHERE anio = $1 ORDER BY bimestre ASC`,
            [anio],
        );

        const alumnos = await this.dataSource.query(
            `SELECT DISTINCT
                a.id, a.codigo_estudiante,
                a.nombre, a.apellido_paterno, a.apellido_materno,
                NULL::text AS foto_url
             FROM matriculas m
             JOIN alumnos a ON a.id = m.alumno_id
             JOIN periodos p ON p.id = m.periodo_id
             WHERE m.seccion_id = $1 AND m.activo = TRUE AND p.anio = $2
             ORDER BY a.apellido_paterno, a.nombre`,
            [sec.id, anio],
        );

        const alumnoIds = alumnos.map((a: any) => a.id);
        let libretas: any[] = [];
        if (alumnoIds.length) {
            libretas = await this.dataSource.query(
                `SELECT
                    l.id, l.cuenta_id AS alumno_id, l.periodo_id,
                    p.bimestre,
                    l.storage_key, l.nombre_archivo, l.observaciones, l.created_at
                 FROM libretas l
                 JOIN periodos p ON p.id = l.periodo_id
                 WHERE l.tipo = 'alumno'
                   AND l.cuenta_id = ANY($1::uuid[])
                   AND p.anio = $2`,
                [alumnoIds, anio],
            );

            libretas = await Promise.all(libretas.map(async (l) => ({
                ...l,
                url: await this.storageService.getSignedUrl(l.storage_key),
            })));
        }

        const libretasPorAlumno = new Map<string, any[]>();
        libretas.forEach(l => {
            const arr = libretasPorAlumno.get(l.alumno_id) ?? [];
            arr.push(l);
            libretasPorAlumno.set(l.alumno_id, arr);
        });

        const alumnosConLibretas = alumnos.map((a: any) => ({
            ...a,
            libretas: libretasPorAlumno.get(a.id) ?? [],
        }));

        let padres: any[] = [];
        if (alumnoIds.length) {
            const padresRaw = await this.dataSource.query(
                `SELECT
                    p.id, p.nombre, p.apellido_paterno, p.apellido_materno,
                    p.relacion, p.email, p.telefono,
                    array_agg(pa.alumno_id) AS hijos_ids
                 FROM padre_alumno pa
                 JOIN padres p ON p.id = pa.padre_id
                 WHERE pa.alumno_id = ANY($1::uuid[])
                 GROUP BY p.id
                 ORDER BY p.apellido_paterno, p.nombre`,
                [alumnoIds],
            );
            padres = padresRaw;
        }

        return {
            seccion: {
                id: sec.id,
                nombre: sec.nombre,
                grado_id: sec.grado_id,
                grado_nombre: sec.grado_nombre,
                grado_orden: sec.grado_orden,
                capacidad: sec.capacidad,
            },
            periodo_activo: periodoActivo[0] ?? null,
            periodos,
            alumnos: alumnosConLibretas,
            padres,
        };
    }

    // ── PERIODOS ─────────────────────────────────────────────────

    findAllPeriodos() {
        return this.periodoRepo.find({ order: { anio: 'DESC', bimestre: 'ASC' } });
    }

    findPeriodoActivo() {
        return this.periodoRepo.findOne({ where: { activo: true } });
    }

    async createPeriodo(dto: CreatePeriodoDto) {
        const exists = await this.periodoRepo.findOne({
            where: { anio: dto.anio, bimestre: dto.bimestre },
        });
        if (exists) {
            throw new ConflictException(`Ya existe el bimestre ${dto.bimestre} del año ${dto.anio}`);
        }
        return this.periodoRepo.save(this.periodoRepo.create(dto));
    }

    async activarPeriodo(id: number) {
        await this.periodoRepo
            .createQueryBuilder()
            .update()
            .set({ activo: false })
            .where('1=1')
            .execute();

        await this.periodoRepo.update({ id }, { activo: true });
        return this.periodoRepo.findOne({ where: { id } });
    }
}
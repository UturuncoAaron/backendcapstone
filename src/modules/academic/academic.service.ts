import {
    Injectable, NotFoundException, ConflictException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { GradeLevel } from './entities/grade-level.entity.js';
import { Section } from './entities/section.entity.js';
import { Period } from './entities/period.entity.js';
import { CoursesService } from '../courses/courses.service.js';

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

        // Si hay periodo activo, generar cursos automáticamente
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

    async asignarTutor(seccionId: number, tutorId: string) {
        const seccion = await this.seccionRepo.findOne({ where: { id: seccionId } });
        if (!seccion) throw new NotFoundException(`Sección ${seccionId} no encontrada`);
        seccion.tutor_id = tutorId;
        return this.seccionRepo.save(seccion);
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
        // Desactiva todos en una sola query
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
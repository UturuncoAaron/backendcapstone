import {
    Injectable, NotFoundException, ConflictException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { GradeLevel } from './entities/grade-level.entity.js';
import { Section } from './entities/section.entity.js';
import { Period } from './entities/period.entity.js';
import { CoursesService } from '../courses/courses.service.js';

@Injectable()
export class AcademicService {
    constructor(
        @InjectRepository(GradeLevel) private readonly gradoRepo: Repository<GradeLevel>,
        @InjectRepository(Section) private readonly seccionRepo: Repository<Section>,
        @InjectRepository(Period) private readonly periodoRepo: Repository<Period>,
        private readonly coursesService: CoursesService,
    ) { }

    // ── GRADOS ──────────────────────────────────────────────────────

    findAllGrados() {
        return this.gradoRepo.find({ order: { orden: 'ASC' } });
    }

    findGradoById(id: number) {
        return this.gradoRepo.findOne({ where: { id }, relations: ['secciones'] });
    }

    // ── SECCIONES ───────────────────────────────────────────────────

    findAllSecciones(gradoId?: number) {
        const where: any = {};
        if (gradoId) where.grado_id = gradoId;
        return this.seccionRepo.find({
            where,
            relations: ['grado'],
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

        // 1. Crear la sección
        const seccion = this.seccionRepo.create({ grado_id: gradoId, nombre, capacidad });
        const saved = await this.seccionRepo.save(seccion);

        // 2. Buscar periodo activo
        const periodoActivo = await this.periodoRepo.findOne({ where: { activo: true } });

        // 3. Si hay periodo activo, generar cursos automáticamente desde plantilla CNEB
        let cursosGenerados = null;
        if (periodoActivo) {
            cursosGenerados = await this.coursesService.generateCoursesFromTemplate(
                saved.id,
                periodoActivo.id,
            );
        }

        return {
            seccion: saved,
            cursos: cursosGenerados ?? { mensaje: 'No hay periodo activo — cursos no generados. Activa un periodo e invoca POST /api/courses/generate/:seccionId/:periodoId' },
        };
    }

    // ── PERIODOS ────────────────────────────────────────────────────

    findAllPeriodos() {
        return this.periodoRepo.find({ order: { anio: 'DESC', bimestre: 'ASC' } });
    }

    findPeriodoActivo() {
        return this.periodoRepo.findOne({ where: { activo: true } });
    }

    async createPeriodo(dto: {
        nombre: string;
        anio: number;
        bimestre: number;
        fecha_inicio: string;
        fecha_fin: string;
    }) {
        const exists = await this.periodoRepo.findOne({
            where: { anio: dto.anio, bimestre: dto.bimestre },
        });
        if (exists) throw new ConflictException(`Ya existe el bimestre ${dto.bimestre} del año ${dto.anio}`);

        const periodo = this.periodoRepo.create(dto);
        return this.periodoRepo.save(periodo);
    }

    async activarPeriodo(id: number) {
        // Desactiva todos
        await this.periodoRepo
            .createQueryBuilder()
            .update()
            .set({ activo: false })
            .where('1=1')
            .execute();

        // Activa el seleccionado
        await this.periodoRepo.update({ id }, { activo: true });
        return this.periodoRepo.findOne({ where: { id } });
    }
}
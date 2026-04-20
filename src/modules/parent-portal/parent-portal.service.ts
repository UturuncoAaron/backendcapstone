import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../users/entities/user.entity.js';

@Injectable()
export class ParentPortalService {
    constructor(
        @InjectRepository(User)
        private readonly userRepo: Repository<User>,
    ) { }

    async getChildren(padreId: string) {
        const result = await this.userRepo.query(
            `
      SELECT 
        u.id,
        u.nombre,
        u.apellido_paterno,
        u.apellido_materno,
        u.codigo_estudiante,
        u.foto_url,
        g.nombre AS grado,
        s.nombre AS seccion
      FROM padre_hijo ph
      JOIN usuarios u ON u.id = ph.alumno_id
      LEFT JOIN matriculas m ON m.alumno_id = u.id
      LEFT JOIN secciones s ON s.id = m.seccion_id
      LEFT JOIN grados g ON g.id = s.grado_id
      WHERE ph.padre_id = $1
        AND u.activo = true
      ORDER BY u.nombre
      `,
            [padreId],
        );
        return result;
    }

    async getChildGrades(padreId: string, alumnoId: string) {
        await this.verifyRelation(padreId, alumnoId);

        const result = await this.userRepo.query(
            `
      SELECT
        n.id,
        n.bimestre,
        n.nota_examenes,
        n.nota_tareas,
        n.nota_participacion,
        n.nota_final,
        n.escala,
        n.observaciones,
        c.nombre AS curso,
        p.nombre AS periodo,
        p.anio
      FROM notas n
      JOIN cursos c ON c.id = n.curso_id
      JOIN periodos p ON p.id = n.periodo_id
      WHERE n.alumno_id = $1
      ORDER BY p.anio DESC, n.bimestre ASC, c.nombre ASC
      `,
            [alumnoId],
        );
        return result;
    }

    async getChildAttendance(padreId: string, alumnoId: string) {
        await this.verifyRelation(padreId, alumnoId);

        const result = await this.userRepo.query(
            `
      SELECT
        a.id,
        a.presente,
        a.justificacion,
        a.created_at AS fecha,
        cl.titulo AS clase,
        cl.fecha_hora,
        c.nombre AS curso
      FROM asistencias a
      JOIN clases_vivo cl ON cl.id = a.clase_vivo_id
      JOIN cursos c ON c.id = cl.curso_id
      WHERE a.alumno_id = $1
      ORDER BY cl.fecha_hora DESC
      `,
            [alumnoId],
        );
        return result;
    }

    private async verifyRelation(padreId: string, alumnoId: string) {
        const rel = await this.userRepo.query(
            `SELECT id FROM padre_hijo WHERE padre_id = $1 AND alumno_id = $2`,
            [padreId, alumnoId],
        );
        if (!rel.length) {
            throw new NotFoundException('No tienes acceso a este alumno');
        }
    }
}
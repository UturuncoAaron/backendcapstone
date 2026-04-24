import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { DataSource } from 'typeorm';

@Injectable()
export class ParentPortalService {
    constructor(private readonly dataSource: DataSource) { }

    // Verificar vínculo padre-alumno (privado, reutilizable)
    private async verifyRelation(padreId: string, alumnoId: string) {
        const rel = await this.dataSource.query(
            `SELECT 1 FROM padre_alumno WHERE padre_id = $1 AND alumno_id = $2`,
            [padreId, alumnoId],
        );
        if (!rel.length) {
            throw new ForbiddenException('No tienes acceso a este alumno');
        }
    }

    // Listar hijos del padre con su grado y sección actual
    async getChildren(padreId: string) {
        return this.dataSource.query(`
            SELECT
                a.id,
                a.nombre,
                a.apellido_paterno,
                a.apellido_materno,
                a.codigo_estudiante,
                a.foto_storage_key,
                g.nombre  AS grado,
                s.nombre  AS seccion
            FROM padre_alumno pa
            JOIN alumnos a    ON a.id = pa.alumno_id
            JOIN cuentas c    ON c.id = a.id AND c.activo = true
            LEFT JOIN matriculas m  ON m.alumno_id = a.id AND m.activo = true
            LEFT JOIN secciones s   ON s.id = m.seccion_id
            LEFT JOIN grados g      ON g.id = s.grado_id
            WHERE pa.padre_id = $1
            ORDER BY a.apellido_paterno, a.nombre
        `, [padreId]);
    }

    // Notas de un hijo por bimestre (bimestre viene del JOIN con periodos)
    async getChildGrades(padreId: string, alumnoId: string) {
        await this.verifyRelation(padreId, alumnoId);

        return this.dataSource.query(`
            SELECT
                n.id,
                p.bimestre,
                p.anio,
                p.nombre             AS periodo,
                c.nombre             AS curso,
                n.nota_tareas,
                n.nota_participacion,
                n.nota_final,
                n.escala,
                n.observaciones
            FROM notas n
            JOIN cursos   c ON c.id = n.curso_id
            JOIN periodos p ON p.id = n.periodo_id
            WHERE n.alumno_id = $1
            ORDER BY p.anio DESC, p.bimestre ASC, c.nombre ASC
        `, [alumnoId]);
    }

    // Asistencias de un hijo a clases en vivo
    async getChildAttendance(padreId: string, alumnoId: string) {
        await this.verifyRelation(padreId, alumnoId);

        return this.dataSource.query(`
            SELECT
                a.presente,
                a.justificacion,
                cl.titulo     AS clase,
                cl.fecha_hora,
                c.nombre      AS curso
            FROM asistencias a
            JOIN clases_vivo cl ON cl.id = a.clase_vivo_id
            JOIN cursos      c  ON c.id  = cl.curso_id
            WHERE a.alumno_id = $1
            ORDER BY cl.fecha_hora DESC
        `, [alumnoId]);
    }

    // Libretas del hijo (links firmados los genera LibretasService)
    async getChildLibretas(padreId: string, alumnoId: string) {
        await this.verifyRelation(padreId, alumnoId);

        return this.dataSource.query(`
            SELECT
                l.id,
                l.storage_key,
                l.nombre_archivo,
                l.observaciones,
                l.created_at,
                p.bimestre,
                p.anio,
                p.nombre AS periodo
            FROM libretas l
            JOIN periodos p ON p.id = l.periodo_id
            WHERE l.alumno_id = $1
            ORDER BY p.anio DESC, p.bimestre DESC
        `, [alumnoId]);
    }
}
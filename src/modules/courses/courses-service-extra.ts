

import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { CURSOS_POR_GRADO, COLORES_CURSOS } from '../academic/course-template.js';



export class CoursesServiceExtra {
    constructor(
        @InjectDataSource()
        private readonly dataSource: DataSource,
    ) { }

    /**
     * PATCH /api/courses/:id/assign-teacher
     * Asignar o cambiar el docente de un curso existente
     */
    async assignTeacher(cursoId: string, docenteId: string) {
        // Verificar que el curso existe
        const curso = await this.dataSource.query(
            `SELECT id, nombre FROM cursos WHERE id = $1`,
            [cursoId],
        );
        if (!curso.length) throw new NotFoundException(`Curso ${cursoId} no encontrado`);

        // Verificar que el usuario es docente
        const docente = await this.dataSource.query(
            `SELECT id, nombre, apellido_paterno FROM usuarios WHERE id = $1 AND rol = 'docente' AND activo = true`,
            [docenteId],
        );
        if (!docente.length) throw new NotFoundException(`Docente ${docenteId} no encontrado`);

        // Asignar docente
        await this.dataSource.query(
            `UPDATE cursos SET docente_id = $1, updated_at = NOW() WHERE id = $2`,
            [docenteId, cursoId],
        );

        return {
            curso: curso[0].nombre,
            docente: `${docente[0].nombre} ${docente[0].apellido_paterno}`,
        };
    }

    /**
     * POST /api/courses/generate/:seccionId/:periodoId
     * Generar automáticamente los cursos de una sección
     * basados en la plantilla del grado (CNEB peruano)
     *
     * - Si los cursos ya existen, los omite (idempotente)
     * - El docente queda en NULL hasta ser asignado
     */
    async generateCoursesFromTemplate(seccionId: number, periodoId: number) {
        // Obtener sección con su grado
        const seccion = await this.dataSource.query(
            `SELECT s.id, s.nombre, g.id as grado_id, g.nombre as grado, g.orden
             FROM secciones s
             JOIN grados g ON g.id = s.grado_id
             WHERE s.id = $1`,
            [seccionId],
        );
        if (!seccion.length) throw new NotFoundException(`Sección ${seccionId} no encontrada`);

        const { orden: gradoOrden, grado, nombre: seccionNombre } = seccion[0];

        // Obtener plantilla de cursos para este grado
        const plantilla = CURSOS_POR_GRADO[gradoOrden];
        if (!plantilla) {
            throw new NotFoundException(`No hay plantilla de cursos para el grado con orden ${gradoOrden}`);
        }

        // Obtener cursos ya existentes en esta sección+periodo
        const existentes = await this.dataSource.query(
            `SELECT nombre FROM cursos WHERE seccion_id = $1 AND periodo_id = $2`,
            [seccionId, periodoId],
        );
        const nombresExistentes = new Set(existentes.map((c: any) => c.nombre));

        // Crear los cursos faltantes
        let creados = 0;
        let omitidos = 0;

        for (const nombreCurso of plantilla) {
            if (nombresExistentes.has(nombreCurso)) {
                omitidos++;
                continue;
            }

            const color = COLORES_CURSOS[nombreCurso] ?? '#6B7280';

            await this.dataSource.query(
                `INSERT INTO cursos (nombre, seccion_id, periodo_id, color, activo, created_at, updated_at)
                 VALUES ($1, $2, $3, $4, true, NOW(), NOW())`,
                [nombreCurso, seccionId, periodoId, color],
            );
            creados++;
        }

        return {
            grado,
            seccion: seccionNombre,
            total_plantilla: plantilla.length,
            creados,
            omitidos,
            mensaje: `${creados} cursos creados, ${omitidos} ya existían`,
        };
    }
}
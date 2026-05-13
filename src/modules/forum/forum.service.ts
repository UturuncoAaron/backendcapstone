import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { In } from 'typeorm';
import { Forum } from './entities/forum.entity.js';
import { ForumPost } from './entities/forum-post.entity.js';
import { SemanasService } from '../semanas/semanas.service.js';
import { AttachmentsService } from '../attachments/attachments.service.js';

export interface CreateForumDto {
    titulo: string;
    descripcion?: string;
    bimestre?: number | null;
    semana?: number | null;
}

@Injectable()
export class ForumService {
    constructor(
        @InjectRepository(Forum)
        private readonly forumRepo: Repository<Forum>,
        @InjectRepository(ForumPost)
        private readonly postRepo: Repository<ForumPost>,
        private readonly semanasService: SemanasService,
        private readonly attachments: AttachmentsService,
    ) { }

    /**
     * Lista TODOS los foros visibles para el usuario en una sola consulta.
     * Reemplaza el patrón N+1 que hacía el frontend (1 fetch por curso).
     *
     * Para un alumno: foros de los cursos donde está matriculado en el periodo activo.
     * Para un docente: foros de los cursos que enseña.
     * Para admin: todos los foros activos.
     */
    async getMyForums(userId: string, rol: string): Promise<(Forum & { curso_nombre: string })[]> {
        let courseFilter = '';
        let params: unknown[] = [];

        if (rol === 'alumno') {
            courseFilter = `c.seccion_id IN (
                SELECT m.seccion_id FROM matriculas m
                JOIN periodos p ON p.id = m.periodo_id
                WHERE m.alumno_id = $1 AND m.activo = TRUE AND p.activo = TRUE
            ) AND c.periodo_id IN (SELECT id FROM periodos WHERE activo = TRUE)`;
            params = [userId];
        } else if (rol === 'docente') {
            courseFilter = `c.docente_id = $1 AND c.activo = TRUE`;
            params = [userId];
        } else {
            courseFilter = `c.activo = TRUE`;
        }

        const cursos = await this.forumRepo.manager.query<{ id: string; nombre: string }[]>(
            `SELECT id, nombre FROM cursos c WHERE ${courseFilter}`,
            params,
        );
        if (!cursos.length) return [];

        const cursoIds = cursos.map(c => c.id);
        const forums = await this.forumRepo.find({
            where: { curso_id: In(cursoIds), activo: true },
            order: { bimestre: 'ASC', semana: 'ASC', created_at: 'DESC' },
        });

        const byCurso = new Map(cursos.map(c => [c.id, c.nombre]));
        return forums.map(f => ({ ...f, curso_nombre: byCurso.get(f.curso_id) ?? '' }));
    }

    async getForumsByCourse(cursoId: string, soloVisibles = false) {
        const foros = await this.forumRepo.find({
            where: { curso_id: cursoId, activo: true },
            order: { bimestre: 'ASC', semana: 'ASC', created_at: 'DESC' },
        });
        if (!soloVisibles) return foros;

        const ocultas = new Set(await this.semanasService.getHiddenSemanas(cursoId));
        return foros.filter(
            (f) => !f.oculto && !(f.semana != null && ocultas.has(f.semana)),
        );
    }

    async createForum(cursoId: string, dto: CreateForumDto) {
        return this.forumRepo.save(
            this.forumRepo.create({
                curso_id: cursoId,
                titulo: dto.titulo,
                descripcion: dto.descripcion ?? null,
                bimestre: dto.bimestre ?? null,
                semana: dto.semana ?? null,
            }),
        );
    }

    async toggleVisibility(foroId: string, oculto: boolean) {
        const forum = await this.forumRepo.findOne({ where: { id: foroId } });
        if (!forum) throw new NotFoundException('Foro no encontrado');
        forum.oculto = oculto;
        return this.forumRepo.save(forum);
    }

    async getPostsByForum(foroId: string) {
        const forum = await this.forumRepo.findOne({ where: { id: foroId } });
        if (!forum) throw new NotFoundException('Foro no encontrado');

        // Trae posts (raíz + respuestas) en un solo round-trip con el autor
        // enriquecido (nombre/apellidos/rol) usando LEFT JOINs sobre todas
        // las tablas de rol (alumnos/docentes/padres/psicologas/admins/auxiliares).
        const rows = await this.postRepo.manager.query<{
            id: string; foro_id: string; cuenta_id: string;
            contenido: string; parent_post_id: string | null;
            activo: boolean; created_at: Date; updated_at: Date;
            autor_rol: string;
            autor_nombre: string | null;
            autor_apellido_paterno: string | null;
            autor_apellido_materno: string | null;
        }[]>(
            `SELECT
                fp.id, fp.foro_id, fp.cuenta_id, fp.contenido,
                fp.parent_post_id, fp.activo, fp.created_at, fp.updated_at,
                c.rol AS autor_rol,
                COALESCE(a.nombre, d.nombre, p.nombre, ps.nombre, ad.nombre, ax.nombre)                       AS autor_nombre,
                COALESCE(a.apellido_paterno, d.apellido_paterno, p.apellido_paterno, ps.apellido_paterno, ad.apellido_paterno, ax.apellido_paterno) AS autor_apellido_paterno,
                COALESCE(a.apellido_materno, d.apellido_materno, p.apellido_materno, ps.apellido_materno, ad.apellido_materno, ax.apellido_materno) AS autor_apellido_materno
             FROM foro_posts fp
             JOIN cuentas c       ON c.id = fp.cuenta_id
             LEFT JOIN alumnos    a  ON a.id  = c.id
             LEFT JOIN docentes   d  ON d.id  = c.id
             LEFT JOIN padres     p  ON p.id  = c.id
             LEFT JOIN psicologas ps ON ps.id = c.id
             LEFT JOIN admins     ad ON ad.id = c.id
             LEFT JOIN auxiliares ax ON ax.id = c.id
             WHERE fp.foro_id = $1 AND fp.activo = TRUE
             ORDER BY fp.created_at ASC`,
            [foroId],
        );

        const mapRow = (r: typeof rows[number]) => ({
            id: r.id,
            foro_id: r.foro_id,
            cuenta_id: r.cuenta_id,
            contenido: r.contenido,
            parent_post_id: r.parent_post_id,
            activo: r.activo,
            created_at: r.created_at,
            updated_at: r.updated_at,
            usuario: {
                id: r.cuenta_id,
                nombre: r.autor_nombre ?? '',
                apellido_paterno: r.autor_apellido_paterno ?? '',
                apellido_materno: r.autor_apellido_materno ?? '',
                rol: r.autor_rol,
            },
        });

        const rootRows = rows.filter(r => r.parent_post_id === null);
        const childRows = rows.filter(r => r.parent_post_id !== null);

        const attachmentsMap = await this.attachments.listByOwnersBulk(
            'forum_post', rows.map(r => r.id),
        );

        const posts = rootRows.map(r => ({
            ...mapRow(r),
            attachments: attachmentsMap.get(r.id) ?? [],
            respuestas: childRows
                .filter(c => c.parent_post_id === r.id)
                .map(c => ({ ...mapRow(c), attachments: attachmentsMap.get(c.id) ?? [] })),
        }));

        return { forum, posts };
    }

    async createPost(foroId: string, cuentaId: string, dto: {
        contenido: string;
        parent_post_id?: string;
    }) {
        const forum = await this.forumRepo.findOne({ where: { id: foroId, activo: true } });
        if (!forum) throw new NotFoundException('Foro no encontrado');

        return this.postRepo.save(
            this.postRepo.create({
                foro_id: foroId,
                cuenta_id: cuentaId,
                contenido: dto.contenido,
                parent_post_id: dto.parent_post_id ?? null,
            }),
        );
    }

    async deletePost(postId: string) {
        const post = await this.postRepo.findOne({ where: { id: postId } });
        if (!post) throw new NotFoundException('Post no encontrado');
        post.activo = false;
        await this.postRepo.save(post);
        return { message: 'Post eliminado correctamente' };
    }
}

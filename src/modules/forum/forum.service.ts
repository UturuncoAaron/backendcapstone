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

        // Posts raíz (sin parent)
        const posts = await this.postRepo.find({
            where: { foro_id: foroId, activo: true, parent_post_id: null as any },
            relations: ['cuenta'],
            order: { created_at: 'ASC' },
        });

        // Cargar respuestas de TODOS los posts en una sola consulta (evita N+1).
        const respuestasFlat = posts.length
            ? await this.postRepo.find({
                where: { parent_post_id: In(posts.map(p => p.id)), activo: true },
                relations: ['cuenta'],
                order: { created_at: 'ASC' },
            })
            : [];

        // Adjuntos: bulk loader para todos los posts y respuestas.
        const allPostIds = [
            ...posts.map(p => p.id),
            ...respuestasFlat.map(r => r.id),
        ];
        const attachmentsMap = await this.attachments.listByOwnersBulk('forum_post', allPostIds);

        const postsConRespuestas = posts.map(post => ({
            ...post,
            attachments: attachmentsMap.get(post.id) ?? [],
            respuestas: respuestasFlat
                .filter(r => r.parent_post_id === post.id)
                .map(r => ({ ...r, attachments: attachmentsMap.get(r.id) ?? [] })),
        }));

        return { forum, posts: postsConRespuestas };
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

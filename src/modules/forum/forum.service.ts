import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Forum } from './entities/forum.entity.js';
import { ForumPost } from './entities/forum-post.entity.js';

@Injectable()
export class ForumService {
    constructor(
        @InjectRepository(Forum)
        private readonly forumRepo: Repository<Forum>,
        @InjectRepository(ForumPost)
        private readonly postRepo: Repository<ForumPost>,
    ) { }

    async getForumsByCourse(cursoId: string) {
        return this.forumRepo.find({
            where: { curso_id: cursoId, activo: true },
            order: { created_at: 'DESC' },
        });
    }

    async createForum(cursoId: string, dto: { titulo: string; descripcion?: string }) {
        return this.forumRepo.save(
            this.forumRepo.create({
                curso_id: cursoId,
                titulo: dto.titulo,
                descripcion: dto.descripcion ?? null,
            }),
        );
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

        // Cargar respuestas de cada post
        const postsConRespuestas = await Promise.all(
            posts.map(async (post) => {
                const respuestas = await this.postRepo.find({
                    where: { parent_post_id: post.id, activo: true },
                    relations: ['cuenta'],
                    order: { created_at: 'ASC' },
                });
                return { ...post, respuestas };
            }),
        );

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
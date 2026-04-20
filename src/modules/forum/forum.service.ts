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
        const forum = this.forumRepo.create({
            curso_id: cursoId,
            titulo: dto.titulo,
            descripcion: dto.descripcion ?? null,
        });
        return this.forumRepo.save(forum);
    }

    async getPostsByForum(foroId: string) {
        const forum = await this.forumRepo.findOne({ where: { id: foroId } });
        if (!forum) throw new NotFoundException('Foro no encontrado');

        const posts = await this.postRepo.find({
            where: { foro_id: foroId, activo: true, parent_post_id: null as any },
            relations: ['usuario'],
            order: { created_at: 'ASC' },
        });

        // Cargar respuestas de cada post
        const postsConRespuestas = await Promise.all(
            posts.map(async post => {
                const respuestas = await this.postRepo.find({
                    where: { parent_post_id: post.id, activo: true },
                    relations: ['usuario'],
                    order: { created_at: 'ASC' },
                });
                return { ...post, respuestas };
            })
        );

        return { forum, posts: postsConRespuestas };
    }

    async createPost(foroId: string, usuarioId: string, dto: {
        contenido: string;
        parent_post_id?: string;
    }) {
        const forum = await this.forumRepo.findOne({ where: { id: foroId } });
        if (!forum) throw new NotFoundException('Foro no encontrado');

        const post = this.postRepo.create({
            foro_id: foroId,
            usuario_id: usuarioId,
            contenido: dto.contenido,
            parent_post_id: dto.parent_post_id ?? null,
        });
        return this.postRepo.save(post);
    }

    async deletePost(postId: string) {
        const post = await this.postRepo.findOne({ where: { id: postId } });
        if (!post) throw new NotFoundException('Post no encontrado');
        post.activo = false;
        return this.postRepo.save(post);
    }
}
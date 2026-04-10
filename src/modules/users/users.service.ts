import {
    Injectable, NotFoundException,
    ConflictException, BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, ILike } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { User } from './entities/user.entity.js';
import { CreateUserDto } from './dto/create-user.dto.js';
import { UpdateUserDto } from './dto/update-user.dto.js';

@Injectable()
export class UsersService {
    constructor(
        @InjectRepository(User)
        private readonly userRepo: Repository<User>,
    ) { }

    async create(dto: CreateUserDto): Promise<Omit<User, 'password_hash'>> {
        // Verificar documento único
        const exists = await this.userRepo.findOne({
            where: {
                tipo_documento: dto.tipo_documento as any,
                numero_documento: dto.numero_documento.trim(),
            },
        });

        if (exists) {
            throw new ConflictException(
                `Ya existe un usuario con ${dto.tipo_documento} ${dto.numero_documento}`,
            );
        }

        // Hashear contraseña
        const password_hash = await bcrypt.hash(dto.password, 10);

        const user = this.userRepo.create({
            ...dto,
            tipo_documento: dto.tipo_documento as any,
            numero_documento: dto.numero_documento.trim(),
            rol: dto.rol as any,
            relacion_familiar: dto.relacion_familiar as any,
            password_hash,
        });

        const saved = await this.userRepo.save(user);
        return this.sanitize(saved);
    }

    async findAll(rol?: string): Promise<Omit<User, 'password_hash'>[]> {
        const where: any = { activo: true };
        if (rol) where.rol = rol;

        const users = await this.userRepo.find({
            where,
            order: { apellido_paterno: 'ASC', nombre: 'ASC' },
        });

        return users.map(u => this.sanitize(u));
    }

    async findOne(id: string): Promise<Omit<User, 'password_hash'>> {
        const user = await this.userRepo.findOne({
            where: { id, activo: true },
        });

        if (!user) throw new NotFoundException(`Usuario ${id} no encontrado`);
        return this.sanitize(user);
    }

    async update(id: string, dto: UpdateUserDto): Promise<Omit<User, 'password_hash'>> {
        const user = await this.userRepo.findOne({ where: { id, activo: true } });
        if (!user) throw new NotFoundException(`Usuario ${id} no encontrado`);

        Object.assign(user, dto);
        const saved = await this.userRepo.save(user);
        return this.sanitize(saved);
    }

    async deactivate(id: string): Promise<{ message: string }> {
        const user = await this.userRepo.findOne({ where: { id, activo: true } });
        if (!user) throw new NotFoundException(`Usuario ${id} no encontrado`);

        user.activo = false;
        await this.userRepo.save(user);
        return { message: 'Usuario desactivado correctamente' };
    }

    async resetPassword(id: string, newPassword: string): Promise<{ message: string }> {
        if (newPassword.length < 6) {
            throw new BadRequestException('La contraseña debe tener mínimo 6 caracteres');
        }

        const user = await this.userRepo.findOne({ where: { id, activo: true } });
        if (!user) throw new NotFoundException(`Usuario ${id} no encontrado`);

        user.password_hash = await bcrypt.hash(newPassword, 10);
        await this.userRepo.save(user);
        return { message: 'Contraseña actualizada correctamente' };
    }

    private sanitize(user: User): Omit<User, 'password_hash'> {
        const { password_hash, ...safe } = user as any;
        return safe;
    }
}
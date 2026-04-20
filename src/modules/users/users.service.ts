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
    async getStats() {
        const [alumnos, docentes, padres, cursos] = await Promise.all([
            this.userRepo.count({ where: { rol: 'alumno', activo: true } }),
            this.userRepo.count({ where: { rol: 'docente', activo: true } }),
            this.userRepo.count({ where: { rol: 'padre', activo: true } }),
            this.userRepo.query(`SELECT COUNT(*) FROM cursos WHERE activo = true`),
        ]);

        return {
            alumnos,
            docentes,
            padres,
            cursos: parseInt(cursos[0].count),
        };
    }
    async linkParentChild(padreDoc: string, alumnoDoc: string) {
        const padre = await this.userRepo.findOne({
            where: { numero_documento: padreDoc, rol: 'padre', activo: true },
        });
        if (!padre) throw new NotFoundException(`No se encontró padre con documento ${padreDoc}`);

        const alumno = await this.userRepo.findOne({
            where: { numero_documento: alumnoDoc, rol: 'alumno', activo: true },
        });
        if (!alumno) throw new NotFoundException(`No se encontró alumno con documento ${alumnoDoc}`);

        const existing = await this.userRepo.query(
            `SELECT id FROM padre_hijo WHERE padre_id = $1 AND alumno_id = $2`,
            [padre.id, alumno.id],
        );
        if (existing.length) throw new ConflictException('Este vínculo ya existe');

        await this.userRepo.query(
            `INSERT INTO padre_hijo (padre_id, alumno_id) VALUES ($1, $2)`,
            [padre.id, alumno.id],
        );

        return {
            padre: `${padre.nombre} ${padre.apellido_paterno}`,
            alumno: `${alumno.nombre} ${alumno.apellido_paterno}`,
        };
    }

}
import { IsUUID } from 'class-validator';

export class AssignTeacherDto {
    @IsUUID()
    docente_id: string;
}
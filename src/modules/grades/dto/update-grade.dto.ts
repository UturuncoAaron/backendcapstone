import { PartialType } from '@nestjs/mapped-types';
import { CreateGradeDto } from './create-grade.dto.js';

export class UpdateGradeDto extends PartialType(CreateGradeDto) { }
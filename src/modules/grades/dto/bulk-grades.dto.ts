import { Type } from 'class-transformer';
import {
    IsArray, ValidateNested, ArrayMinSize, ArrayMaxSize,
} from 'class-validator';
import { CreateGradeDto } from './create-grade.dto.js';

export class BulkGradesDto {
    @IsArray()
    @ArrayMinSize(1)
    @ArrayMaxSize(200)
    @ValidateNested({ each: true })
    @Type(() => CreateGradeDto)
    items: CreateGradeDto[];
}
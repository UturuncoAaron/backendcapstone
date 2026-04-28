import { PartialType } from '@nestjs/mapped-types';
import { CreateMaterialDto } from './create-material.dto.js';

export class UpdateMaterialDto extends PartialType(CreateMaterialDto) { }
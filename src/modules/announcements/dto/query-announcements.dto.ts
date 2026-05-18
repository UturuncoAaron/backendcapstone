import { IsOptional, IsString, IsBoolean, IsUUID, IsInt, Min, Max } from 'class-validator';
import { Type, Transform } from 'class-transformer';

export class QueryAnnouncementsDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  size?: number;

  @IsOptional()
  @IsString()
  cursor?: string;

  @IsOptional()
  @IsUUID()
  periodo_id?: string;

  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  importante?: boolean;

  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  no_leidos?: boolean;

  @IsOptional()
  @IsString()
  buscar?: string;

  /** Interno — seteado por el controller con el rol JWT. */
  @IsOptional()
  @IsString()
  rol?: string;

  /** Interno — seteado por el controller con el userId. */
  @IsOptional()
  @IsString()
  userId?: string;
}
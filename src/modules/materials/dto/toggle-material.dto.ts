import { IsBoolean } from 'class-validator';

export class ToggleMaterialDto {
    @IsBoolean()
    oculto: boolean;
}

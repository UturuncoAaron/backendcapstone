import {
    Controller, Get, Patch, Param, Body,
} from '@nestjs/common';
import { ConfiguracionService } from './configuracion.service.js';

@Controller('configuracion')
export class ConfiguracionController {
    constructor(private readonly configService: ConfiguracionService) { }

    // GET /api/configuracion
    @Get()
    findAll() {
        return this.configService.findAll();
    }

    // GET /api/configuracion/:clave
    @Get(':clave')
    findOne(@Param('clave') clave: string) {
        return this.configService.findOne(clave);
    }

    // PATCH /api/configuracion/:clave
    @Patch(':clave')
    update(
        @Param('clave') clave: string,
        @Body() body: { valor: string },
    ) {
        return this.configService.update(clave, body.valor);
    }

    // PATCH /api/configuracion
    // Body: [{ clave: 'nombre_colegio', valor: 'I.E. Amauta' }, ...]
    @Patch()
    updateMany(@Body() body: { clave: string; valor: string }[]) {
        return this.configService.updateMany(body);
    }
}

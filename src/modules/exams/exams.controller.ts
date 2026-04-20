import {
    Controller, Get, Post, Patch,
    Body, Param, ParseUUIDPipe,
} from '@nestjs/common';
import { ExamsService } from './exams.service.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';

@Controller('courses/:courseId/exams')
export class ExamsController {
    constructor(private readonly examsService: ExamsService) { }

    // GET /api/courses/:courseId/exams
    @Get()
    findAll(@Param('courseId', ParseUUIDPipe) courseId: string) {
        return this.examsService.findByCourse(courseId);
    }

    // GET /api/courses/:courseId/exams/:id
    @Get(':id')
    findOne(@Param('id', ParseUUIDPipe) id: string) {
        return this.examsService.findOne(id);
    }

    // POST /api/courses/:courseId/exams
    @Post()
    create(
        @Param('courseId', ParseUUIDPipe) courseId: string,
        @Body() dto: any,
    ) {
        return this.examsService.create({ ...dto, curso_id: courseId });
    }

    // PATCH /api/courses/:courseId/exams/:id/toggle
    @Patch(':id/toggle')
    toggle(@Param('id', ParseUUIDPipe) id: string) {
        return this.examsService.toggleActivo(id);
    }

    // POST /api/courses/:courseId/exams/:id/start
    @Post(':id/start')
    start(
        @Param('id', ParseUUIDPipe) id: string,
        @CurrentUser() user: any,
    ) {
        // En desarrollo usa el UUID del alumno de prueba que creaste
        const alumnoId = user?.sub ?? 'd6657bbc-f998-486e-8a54-8a26ddb26cbc';
        return this.examsService.startAttempt(id, alumnoId);
    }

    // POST /api/courses/:courseId/exams/:id/submit
    @Post(':id/submit')
    submit(
        @Param('id', ParseUUIDPipe) id: string,
        @CurrentUser() user: any,
        @Body() body: {
            attempt_id: string;
            respuestas: Array<{ pregunta_id: string; opcion_id: string }>;
        },
    ) {
        const alumnoId = user?.sub ?? 'd6657bbc-f998-486e-8a54-8a26ddb26cbc';
        return this.examsService.submitAttempt(
            body.attempt_id,
            alumnoId,
            body.respuestas,
        );
    }
    // GET /api/courses/:courseId/exams/:id/results
    @Get(':id/results')
    results(@Param('id', ParseUUIDPipe) id: string) {
        return this.examsService.getResults(id);
    }
}
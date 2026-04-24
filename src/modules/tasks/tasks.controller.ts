import {
    Controller, Get, Post, Patch, Param,
    Body, ParseUUIDPipe, UseGuards,
} from '@nestjs/common';
import { TasksService } from './tasks.service.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { RolesGuard } from '../auth/guards/roles.guard.js';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import {
    CreateTaskDto, SubmitTaskDto,
    SubmitAlternativasDto, GradeTaskDto, ToggleTaskDto,
} from './dto/tasks.dto.js';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller()
export class TasksController {
    constructor(private readonly tasksService: TasksService) { }

    // ── Docente ──────────────────────────────────────────────────

    // GET /api/courses/:id/tasks
    @Get('courses/:id/tasks')
    @Roles('docente', 'admin')
    getCourseTasks(@Param('id', ParseUUIDPipe) cursoId: string) {
        return this.tasksService.getCourseTasks(cursoId);
    }

    // POST /api/courses/:id/tasks
    @Post('courses/:id/tasks')
    @Roles('docente', 'admin')
    createTask(
        @Param('id', ParseUUIDPipe) cursoId: string,
        @Body() dto: CreateTaskDto,
    ) {
        return this.tasksService.createTask(cursoId, dto);
    }

    // PATCH /api/tasks/:id/toggle  (activar/desactivar)
    @Patch('tasks/:id/toggle')
    @Roles('docente', 'admin')
    toggleTask(
        @Param('id', ParseUUIDPipe) taskId: string,
        @Body() dto: ToggleTaskDto,
    ) {
        return this.tasksService.toggleTask(taskId, dto);
    }

    // GET /api/tasks/:id/submissions
    @Get('tasks/:id/submissions')
    @Roles('docente', 'admin')
    getSubmissions(@Param('id', ParseUUIDPipe) taskId: string) {
        return this.tasksService.getSubmissions(taskId);
    }

    // GET /api/submissions/:id
    @Get('submissions/:id')
    @Roles('docente', 'admin')
    getSubmission(@Param('id', ParseUUIDPipe) submissionId: string) {
        return this.tasksService.getSubmissionById(submissionId);
    }

    // PATCH /api/submissions/:id/grade
    @Patch('submissions/:id/grade')
    @Roles('docente', 'admin')
    gradeSubmission(
        @Param('id', ParseUUIDPipe) submissionId: string,
        @Body() dto: GradeTaskDto,
    ) {
        return this.tasksService.gradeSubmission(submissionId, dto);
    }

    // ── Alumno ───────────────────────────────────────────────────

    // GET /api/tasks/:id  (oculta respuestas correctas si no venció)
    @Get('tasks/:id')
    @Roles('alumno', 'docente', 'admin')
    getTask(@Param('id', ParseUUIDPipe) taskId: string) {
        return this.tasksService.getTaskForAlumno(taskId);
    }

    // POST /api/tasks/:id/submit  (archivo o texto)
    @Post('tasks/:id/submit')
    @Roles('alumno')
    submitTask(
        @Param('id', ParseUUIDPipe) taskId: string,
        @Body() dto: SubmitTaskDto,
        @CurrentUser() user: any,
    ) {
        return this.tasksService.submitTask(taskId, user.sub, dto);
    }

    // POST /api/tasks/:id/submit-alternativas
    @Post('tasks/:id/submit-alternativas')
    @Roles('alumno')
    submitAlternativas(
        @Param('id', ParseUUIDPipe) taskId: string,
        @Body() dto: SubmitAlternativasDto,
        @CurrentUser() user: any,
    ) {
        return this.tasksService.submitAlternativas(taskId, user.sub, dto);
    }

    // GET /api/tasks/:id/my-submission
    @Get('tasks/:id/my-submission')
    @Roles('alumno')
    getMySubmission(
        @Param('id', ParseUUIDPipe) taskId: string,
        @CurrentUser() user: any,
    ) {
        return this.tasksService.getMySubmission(taskId, user.sub);
    }
}
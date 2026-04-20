import {
    Controller, Get, Post, Patch, Param, Body, ParseUUIDPipe,
} from '@nestjs/common';
import { TasksService } from './tasks.service.js';
import { CreateTaskDto } from './dto/create-task.dto.js';
import { SubmitTaskDto } from './dto/submit-task.dto.js';
import { GradeTaskDto } from './dto/grade-task.dto.js';

// TODO: agregar JwtAuthGuard + Roles cuando se implemente JWT
@Controller()
export class TasksController {
    constructor(private readonly tasksService: TasksService) { }

    // GET /api/courses/:id/tasks
    @Get('courses/:id/tasks')
    getCourseTasks(@Param('id', ParseUUIDPipe) cursoId: string) {
        return this.tasksService.getCourseTasks(cursoId);
    }

    // POST /api/courses/:id/tasks
    @Post('courses/:id/tasks')
    createTask(
        @Param('id', ParseUUIDPipe) cursoId: string,
        @Body() dto: CreateTaskDto,
    ) {
        return this.tasksService.createTask(cursoId, dto);
    }

    // GET /api/tasks/:id
    @Get('tasks/:id')
    getTask(@Param('id', ParseUUIDPipe) taskId: string) {
        return this.tasksService.getTaskById(taskId);
    }

    // POST /api/tasks/:id/submit
    @Post('tasks/:id/submit')
    submitTask(
        @Param('id', ParseUUIDPipe) taskId: string,
        @Body() dto: SubmitTaskDto,
        // TODO: @CurrentUser() user cuando JWT esté activo
    ) {
        // TODO: reemplazar 'alumno-id-temporal' con user.sub
        return this.tasksService.submitTask(taskId, 'alumno-id-temporal', dto);
    }

    // GET /api/tasks/:id/submissions
    @Get('tasks/:id/submissions')
    getSubmissions(@Param('id', ParseUUIDPipe) taskId: string) {
        return this.tasksService.getSubmissions(taskId);
    }

    // PATCH /api/submissions/:id/grade
    @Patch('submissions/:id/grade')
    gradeSubmission(
        @Param('id', ParseUUIDPipe) submissionId: string,
        @Body() dto: GradeTaskDto,
    ) {
        return this.tasksService.gradeSubmission(submissionId, dto);
    }
}
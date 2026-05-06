import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Body,
  ParseUUIDPipe,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  ParseFilePipe,
  MaxFileSizeValidator,
  FileTypeValidator,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { TasksService } from './tasks.service.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { RolesGuard } from '../auth/guards/roles.guard.js';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import type { AuthUser } from '../auth/types/auth-user.js';
import {
  CreateTaskDto,
  SubmitTaskDto,
  SubmitAlternativasDto,
  GradeTaskDto,
  ToggleTaskDto,
} from './dto/tasks.dto.js';

const MAX_FILE_BYTES = 15 * 1024 * 1024;
const MIME_PERMITIDOS =
  /^(application\/pdf|image\/(png|jpe?g|webp|gif)|application\/(msword|vnd\.openxmlformats-officedocument\.[a-z.]+|vnd\.ms-(excel|powerpoint))|text\/plain)$/;

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller()
export class TasksController {
  constructor(private readonly tasksService: TasksService) {}

  // ── Docente ──────────────────────────────────────────────────

  @Get('courses/:id/tasks')
  @Roles('docente', 'admin', 'alumno')
  getCourseTasks(
    @Param('id', ParseUUIDPipe) cursoId: string,
    @CurrentUser() user: AuthUser,
  ) {
    const incluirInactivas = user?.rol !== 'alumno';
    return this.tasksService.getCourseTasks(cursoId, incluirInactivas);
  }

  @Post('courses/:id/tasks')
  @Roles('docente', 'admin')
  createTask(
    @Param('id', ParseUUIDPipe) cursoId: string,
    @Body() dto: CreateTaskDto,
  ) {
    return this.tasksService.createTask(cursoId, dto);
  }

  @Patch('tasks/:id/toggle')
  @Roles('docente', 'admin')
  toggleTask(
    @Param('id', ParseUUIDPipe) taskId: string,
    @Body() dto: ToggleTaskDto,
  ) {
    return this.tasksService.toggleTask(taskId, dto);
  }

  @Post('tasks/:id/enunciado')
  @Roles('docente', 'admin')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: MAX_FILE_BYTES },
    }),
  )
  uploadEnunciado(
    @Param('id', ParseUUIDPipe) taskId: string,
    @UploadedFile(
      new ParseFilePipe({
        fileIsRequired: true,
        validators: [
          new MaxFileSizeValidator({
            maxSize: MAX_FILE_BYTES,
            message: 'El archivo supera 15 MB',
          }),
          new FileTypeValidator({ fileType: MIME_PERMITIDOS }),
        ],
      }),
    )
    file: Express.Multer.File,
  ) {
    return this.tasksService.attachEnunciado(taskId, file);
  }

  @Get('tasks/:id/enunciado-url')
  @Roles('alumno', 'docente', 'admin')
  getEnunciadoUrl(@Param('id', ParseUUIDPipe) taskId: string) {
    return this.tasksService.getEnunciadoUrl(taskId);
  }

  @Get('tasks/:id/submissions')
  @Roles('docente', 'admin')
  getSubmissions(@Param('id', ParseUUIDPipe) taskId: string) {
    return this.tasksService.getSubmissions(taskId);
  }

  @Get('submissions/:id')
  @Roles('docente', 'admin')
  getSubmission(@Param('id', ParseUUIDPipe) submissionId: string) {
    return this.tasksService.getSubmissionById(submissionId);
  }

  @Get('submissions/:id/file-url')
  @Roles('alumno', 'docente', 'admin')
  getSubmissionFileUrl(@Param('id', ParseUUIDPipe) submissionId: string) {
    return this.tasksService.getSubmissionFileUrl(submissionId);
  }

  @Patch('submissions/:id/grade')
  @Roles('docente', 'admin')
  gradeSubmission(
    @Param('id', ParseUUIDPipe) submissionId: string,
    @Body() dto: GradeTaskDto,
  ) {
    return this.tasksService.gradeSubmission(submissionId, dto);
  }

  // ── Alumno ───────────────────────────────────────────────────

  @Get('my-submissions')
  @Roles('alumno')
  getMySubmissions(@CurrentUser() user: AuthUser) {
    return this.tasksService.getMySubmissions(user.id);
  }

  @Get('tasks/:id')
  @Roles('alumno', 'docente', 'admin')
  getTask(@Param('id', ParseUUIDPipe) taskId: string) {
    return this.tasksService.getTaskForAlumno(taskId);
  }

  @Post('tasks/:id/submit')
  @Roles('alumno')
  submitTask(
    @Param('id', ParseUUIDPipe) taskId: string,
    @Body() dto: SubmitTaskDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.tasksService.submitTask(taskId, user.id, dto);
  }

  @Post('tasks/:id/submit-file')
  @Roles('alumno')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: MAX_FILE_BYTES },
    }),
  )
  submitTaskFile(
    @Param('id', ParseUUIDPipe) taskId: string,
    @CurrentUser() user: AuthUser,
    @UploadedFile(
      new ParseFilePipe({
        fileIsRequired: true,
        validators: [
          new MaxFileSizeValidator({
            maxSize: MAX_FILE_BYTES,
            message: 'El archivo supera 15 MB',
          }),
          new FileTypeValidator({ fileType: MIME_PERMITIDOS }),
        ],
      }),
    )
    file: Express.Multer.File,
  ) {
    return this.tasksService.submitTaskWithFile(taskId, user.id, file);
  }

  @Post('tasks/:id/submit-alternativas')
  @Roles('alumno')
  submitAlternativas(
    @Param('id', ParseUUIDPipe) taskId: string,
    @Body() dto: SubmitAlternativasDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.tasksService.submitAlternativas(taskId, user.id, dto);
  }

  @Get('tasks/:id/my-submission')
  @Roles('alumno')
  getMySubmission(
    @Param('id', ParseUUIDPipe) taskId: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.tasksService.getMySubmission(taskId, user.id);
  }
}
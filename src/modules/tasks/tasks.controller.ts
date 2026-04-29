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
    @CurrentUser() user: any,
  ) {
    const incluirInactivas = user?.rol !== 'alumno';
    return this.tasksService.getCourseTasks(cursoId, 'tarea', incluirInactivas);
  }

  // ── Exámenes (mismo backend, tipo='examen') ─────────────────

  @Get('courses/:id/exams')
  @Roles('docente', 'admin', 'alumno')
  getCourseExams(
    @Param('id', ParseUUIDPipe) cursoId: string,
    @CurrentUser() user: any,
  ) {
    const incluirInactivas = user?.rol !== 'alumno';
    return this.tasksService.getCourseTasks(
      cursoId,
      'examen',
      incluirInactivas,
    );
  }

  @Post('courses/:id/exams')
  @Roles('docente', 'admin')
  createExam(
    @Param('id', ParseUUIDPipe) cursoId: string,
    @Body() dto: CreateTaskDto,
  ) {
    return this.tasksService.createTask(cursoId, { ...dto, tipo: 'examen' });
  }

  @Get('courses/:cursoId/exams/:id')
  @Roles('docente', 'admin', 'alumno')
  getExam(@Param('id', ParseUUIDPipe) examId: string) {
    return this.tasksService.getTaskForAlumno(examId);
  }

  @Patch('courses/:cursoId/exams/:id/toggle')
  @Roles('docente', 'admin')
  toggleExam(
    @Param('id', ParseUUIDPipe) examId: string,
    @Body() dto: ToggleTaskDto,
  ) {
    return this.tasksService.toggleTask(examId, dto);
  }

  @Post('courses/:cursoId/exams/:id/submit')
  @Roles('alumno')
  submitExam(
    @Param('id', ParseUUIDPipe) examId: string,
    @Body() dto: SubmitAlternativasDto,
    @CurrentUser() user: any,
  ) {
    return this.tasksService.submitAlternativas(examId, user.sub, dto);
  }

  @Get('courses/:cursoId/exams/:id/results')
  @Roles('docente', 'admin', 'alumno')
  getExamResults(@Param('id', ParseUUIDPipe) examId: string) {
    return this.tasksService.getSubmissions(examId);
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
  getMySubmissions(@CurrentUser() user: any) {
    return this.tasksService.getMySubmissions(user.sub);
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
    @CurrentUser() user: any,
  ) {
    return this.tasksService.submitTask(taskId, user.sub, dto);
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
    @CurrentUser() user: any,
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
    return this.tasksService.submitTaskWithFile(taskId, user.sub, file);
  }

  @Post('tasks/:id/submit-alternativas')
  @Roles('alumno')
  submitAlternativas(
    @Param('id', ParseUUIDPipe) taskId: string,
    @Body() dto: SubmitAlternativasDto,
    @CurrentUser() user: any,
  ) {
    return this.tasksService.submitAlternativas(taskId, user.sub, dto);
  }

  @Get('tasks/:id/my-submission')
  @Roles('alumno')
  getMySubmission(
    @Param('id', ParseUUIDPipe) taskId: string,
    @CurrentUser() user: any,
  ) {
    return this.tasksService.getMySubmission(taskId, user.sub);
  }
}
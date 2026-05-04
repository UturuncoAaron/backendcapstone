import {
  Controller, Post, Get, Patch,
  Body, UseGuards, HttpCode, HttpStatus,
} from '@nestjs/common';
import { AuthService } from './auth.service.js';
import { LoginDto, ChangePasswordDto } from './dto/login.dto.js';
import { JwtAuthGuard } from './guards/jwt-auth.guard.js';
import { CurrentUser } from './decorators/current-user.decorator.js';
import { Public } from './decorators/public.decorator.js';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) { }

  @Post('login')
  @Public()
  @HttpCode(HttpStatus.OK)
  login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
  }

  @Get('profile')
  @UseGuards(JwtAuthGuard)
  getProfile(@CurrentUser() user: any) {
    // 💡 Aseguramos usar el ID correcto
    const userId = user.id || user.sub;
    return this.authService.getProfile(userId);
  }

  // POST /api/auth/change-password
  @Post('change-password')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  changePasswordPost(
    @CurrentUser() user: any,
    @Body() dto: ChangePasswordDto,
  ) {
    const userId = user.id || user.sub;
    return this.authService.changePassword(userId, dto);
  }

  // PATCH /api/auth/change-password
  @Patch('change-password')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  changePassword(
    @CurrentUser() user: any,
    @Body() dto: ChangePasswordDto,
  ) {
    // 💡 Aseguramos usar el ID correcto
    const userId = user.id || user.sub;
    return this.authService.changePassword(userId, dto);
  }
}
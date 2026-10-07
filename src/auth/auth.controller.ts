import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Patch,
  Req,
} from '@nestjs/common';
import { AuthService } from './auth.service';
import { Public } from './access';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import type { AuthRequest } from './access';
import type { Request } from 'express';
import { PasswordRecoveryService } from './password-recovery.service';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { ProfileService } from './profile.service';
import { ChangePasswordDto, UpdateProfileDto } from './dto/profile.dto';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService, private readonly recovery: PasswordRecoveryService, private readonly profile: ProfileService) {}

  @Get('profile')
  getProfile(@Req() request: AuthRequest) { return this.profile.get(request.user.id); }

  @Patch('profile')
  updateProfile(@Req() request: AuthRequest, @Body() dto: UpdateProfileDto) { return this.profile.update(request.user.id, dto); }

  @Post('change-password')
  @HttpCode(HttpStatus.OK)
  changePassword(@Req() request: AuthRequest, @Body() dto: ChangePasswordDto) { return this.profile.changePassword(request.user.id, dto); }

  @Public()
  @Post('forgot-password')
  @HttpCode(HttpStatus.OK)
  forgotPassword(@Body() dto: ForgotPasswordDto, @Req() request: Request) {
    return this.recovery.request(dto.identifier, request.ip ?? request.socket.remoteAddress ?? 'unknown');
  }

  @Public()
  @Post('reset-password')
  @HttpCode(HttpStatus.OK)
  resetPassword(@Body() dto: ResetPasswordDto, @Req() request: Request) {
    return this.recovery.reset(dto, request.ip ?? request.socket.remoteAddress ?? 'unknown');
  }

  @Public()
  @Post('register')
  register(@Body() dto: RegisterDto) {
    return this.authService.register(dto);
  }

  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
  }

  @Get('me')
  me(@Req() request: AuthRequest) {
    return request.user;
  }
}

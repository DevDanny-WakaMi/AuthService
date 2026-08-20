import { Controller, Post, Get, Body, Req, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { JwtAuthGuard } from './jwt-auth.guard';
import type { Request } from 'express';
import { AuthService } from './auth.service';
import { SignUpDto } from './dto/sign-up.dto';
import { VerifyOtpDto } from './dto/verify-otp.dto';
import { SignInDto } from './dto/sign-in.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBody,
  ApiBearerAuth,
} from '@nestjs/swagger';

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('sign-up')
  @ApiOperation({ summary: 'Register with phone or email — sends OTP' })
  @ApiResponse({ status: 201, description: 'OTP sent to phone/email' })
  @ApiResponse({ status: 400, description: 'Phone/email already in use' })
  signUp(@Body() dto: SignUpDto) {
    return this.authService.signUp(dto);
  }

  @Throttle({ default: { ttl: 60000, limit: 5 } })
  @Post('verify-otp')
  @ApiOperation({
    summary: 'Verify OTP — returns accessToken + refreshToken',
    description:
      'If first-time social sign-in, returns a tempToken instead (use with /complete-profile).',
  })
  @ApiResponse({ status: 200, description: 'Authenticated — tokens returned' })
  @ApiResponse({ status: 400, description: 'Invalid or expired OTP' })
  verifyOtp(@Req() req: Request, @Body() dto: VerifyOtpDto) {
    const ip =
      (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ??
      req.socket?.remoteAddress;
    return this.authService.verifyOtp(dto, ip);
  }

  @Throttle({ default: { ttl: 60000, limit: 5 } })
  @Post('sign-in')
  @ApiOperation({
    summary: 'Sign in with password — returns accessToken + refreshToken',
  })
  @ApiResponse({ status: 200, description: 'Authenticated — tokens returned' })
  @ApiResponse({ status: 401, description: 'Invalid credentials' })
  signIn(@Req() req: Request, @Body() dto: SignInDto) {
    const ip =
      (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ??
      req.socket?.remoteAddress;
    return this.authService.signIn(dto, ip);
  }

  @Post('refresh')
  @ApiOperation({ summary: 'Refresh access token using refresh token' })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['refreshToken'],
      properties: { refreshToken: { type: 'string' } },
    },
  })
  @ApiResponse({
    status: 200,
    description: 'New accessToken + refreshToken returned',
  })
  @ApiResponse({ status: 401, description: 'Invalid or expired refresh token' })
  refreshTokens(@Body() dto: RefreshTokenDto) {
    return this.authService.refreshTokens(dto.refreshToken);
  }

  @Post('logout')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Invalidate refresh token and sign out' })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['refreshToken'],
      properties: { refreshToken: { type: 'string' } },
    },
  })
  @ApiResponse({ status: 200, description: 'Logged out successfully' })
  logout(@Body('refreshToken') refreshToken: string) {
    return this.authService.logout(refreshToken);
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get current user profile' })
  me(@Req() req: Request) {
    return req.user;
  }
}

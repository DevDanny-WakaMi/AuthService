import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsIn, IsOptional, IsString, Matches } from 'class-validator';

// Only allow public signup for these roles (ADMIN excluded for security)
export const ALLOWED_SIGNUP_ROLES = ['RUNNER', 'REQUESTER'] as const;
export type AllowedSignupRole = (typeof ALLOWED_SIGNUP_ROLES)[number];

export class SignUpDto {
  @ApiPropertyOptional({ description: 'User email' })
  @IsOptional()
  @IsEmail()
  email?: string;

  @ApiPropertyOptional({
    description: 'International phone number',
    example: '+2348012345678',
  })
  @IsOptional()
  @Matches(/^\+?[1-9]\d{6,14}$/, {
    message:
      'Phone must be a valid international phone number (e.g. +2348012345678)',
  })
  phone?: string;

  @ApiPropertyOptional({ description: 'Phone extension', example: '+234' })
  @IsOptional()
  @IsString()
  phoneExtension?: string;

  @ApiProperty({
    enum: ALLOWED_SIGNUP_ROLES,
    description: 'User role (ADMIN not allowed via public signup)',
    example: 'REQUESTER',
  })
  @IsIn(ALLOWED_SIGNUP_ROLES, {
    message: 'Role must be either RUNNER or REQUESTER',
  })
  role: AllowedSignupRole;
}

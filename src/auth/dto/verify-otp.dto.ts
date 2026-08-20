import { IsOptional, IsString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class VerifyOtpDto {
  @ApiProperty({ description: 'Email or Phone number' })
  @IsString()
  identifier: string;

  @ApiPropertyOptional({ description: 'Phone extension' })
  @IsOptional()
  @IsString()
  phoneExtension?: string;

  @ApiProperty({ description: 'OTP Code' })
  @IsString()
  code: string;
}

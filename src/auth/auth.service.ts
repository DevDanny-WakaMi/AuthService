import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { SignUpDto } from './dto/sign-up.dto';
import { Prisma } from '@prisma/client';
import { VerifyOtpDto } from './dto/verify-otp.dto';
import { SignInDto } from './dto/sign-in.dto';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { createReferralCode } from './referral-code.util';
import * as crypto from 'crypto';

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
    private configService: ConfigService,
  ) {}

  private generateOtp(): string {
    return crypto.randomInt(100000, 999999).toString();
  }

  /**
   * The database unique index is the final concurrency guard. Checking first
   * avoids surfacing a collision to a user; createUserWithReferralCode retries
   * if another request claims the same code between these two operations.
   */
  private async generateUniqueReferralCode(
    firstName?: string | null,
  ): Promise<string> {
    for (let attempt = 0; attempt < 5; attempt++) {
      const referralCode = createReferralCode(firstName);
      const existing = await this.prisma.user.findUnique({
        where: { referralCode },
        select: { id: true },
      });

      if (!existing) {
        return referralCode;
      }
    }

    throw new BadRequestException(
      'Could not generate a unique referral code. Please try again.',
    );
  }

  private async createUserWithReferralCode(
    data: Omit<Prisma.UserCreateInput, 'referralCode'>,
  ) {
    for (let attempt = 0; attempt < 5; attempt++) {
      const referralCode = await this.generateUniqueReferralCode(
        data.firstName,
      );

      try {
        return await this.prisma.user.create({
          data: { ...data, referralCode },
        });
      } catch (error) {
        // P2002 means a concurrent request claimed this generated code.
        const isReferralCodeCollision =
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === 'P2002' &&
          JSON.stringify(error.meta?.target).includes('referralCode');

        if (!isReferralCodeCollision) {
          throw error;
        }
      }
    }

    throw new BadRequestException(
      'Could not generate a unique referral code. Please try again.',
    );
  }

  private getFullIdentifier(identifier: string, extension?: string): string {
    if (identifier.includes('@')) {
      return identifier;
    }
    return (extension || '') + identifier;
  }

  private parseDate(dateStr: string): Date {
    // Try standard parsing first (e.g., ISO 8601)
    let date = new Date(dateStr);
    if (!isNaN(date.getTime())) return date;

    // Try parsing DD/MM/YY or DD/MM/YYYY
    const parts = dateStr.split('/');
    if (parts.length === 3) {
      const day = parseInt(parts[0], 10);
      const month = parseInt(parts[1], 10);
      let year = parseInt(parts[2], 10);

      if (isNaN(day) || isNaN(month) || isNaN(year)) {
        throw new BadRequestException(
          'Invalid date format. Use YYYY-MM-DD or DD/MM/YYYY',
        );
      }

      // Handle 2-digit year
      if (year < 100) {
        const currentYearTwoDigits = new Date().getFullYear() % 100;
        if (year <= currentYearTwoDigits) {
          year += 2000;
        } else {
          year += 1900;
        }
      }

      const isoDate = `${year}-${month.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`;
      date = new Date(isoDate);
      if (!isNaN(date.getTime())) return date;
    }

    throw new BadRequestException(
      'Invalid date format. Use YYYY-MM-DD or DD/MM/YYYY',
    );
  }

  async signUp(dto: SignUpDto) {
    const identifier = dto.email || dto.phone;
    if (!identifier) {
      throw new BadRequestException('Email or phone is required');
    }

    if (!dto.role) {
      throw new BadRequestException('Role is required');
    }

    // Check if user already exists
    const existingUser = await this.prisma.user.findFirst({
      where: {
        OR: [{ email: identifier }, { phone: identifier }],
      },
    });

    if (existingUser) {
      throw new BadRequestException('User already exists');
    }

    const fullIdentifier = this.getFullIdentifier(
      identifier,
      dto.phoneExtension,
    );
    const code = this.generateOtp();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 mins

    await this.prisma.otp.create({
      data: {
        identifier: fullIdentifier,
        code,
        expiresAt,
        role: dto.role, // Store role
      },
    });

    console.log(`[OTP] ${fullIdentifier} -> ${code}`);
    return { message: 'OTP sent' };
  }

  async verifyOtp(dto: VerifyOtpDto, _ip?: string) {
    const fullIdentifier = this.getFullIdentifier(
      dto.identifier,
      dto.phoneExtension,
    );

    // Brute-force guard: block after 5 failures in the last 30 minutes

    // Apple review accounts: fixed OTP, never expires, never consumed
    const otp = await this.prisma.otp.findFirst({
      where: {
        identifier: fullIdentifier,
        code: dto.code,
        used: false,
        expiresAt: { gt: new Date() },
      },
      orderBy: { createdAt: 'desc' },
    });

    if (!otp) {
      throw new BadRequestException('Invalid or expired OTP');
    }

    await this.prisma.otp.update({
      where: { id: otp.id },
      data: { used: true },
    });

    // Check if user exists, if not create
    let user = await this.prisma.user.findFirst({
      where: {
        OR: [{ email: dto.identifier }, { phone: dto.identifier }],
      },
    });

    if (!user) {
      if (!otp?.role) {
        // This might happen if it was a sign-in OTP or legacy
        // For sign-up flow, role should be present in OTP
        throw new BadRequestException('Role missing for new user creation');
      }

      user = await this.createUserWithReferralCode({
        email: dto.identifier.includes('@') ? dto.identifier : undefined,
        phone: !dto.identifier.includes('@') ? dto.identifier : undefined,
        phoneExtension: !dto.identifier.includes('@')
          ? dto.phoneExtension
          : undefined,
        isEmailVerified: dto.identifier.includes('@'),
        isPhoneVerified: !dto.identifier.includes('@'),
        role: otp.role,
      });
    }

    const tokens = await this.generateTokens(user.id, user.email, user.role);
    return {
      user,
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      token: tokens.accessToken, // Backward compatibility
      needsProfileCompletion: false,
    };
  }

  async signIn(dto: SignInDto, _ip?: string) {
    try {
      const identifier = dto.email || dto.phone;
      if (!identifier) {
        throw new BadRequestException('Email or phone is required');
      }

      // Check if user exists first for sign in
      const user = await this.prisma.user.findFirst({
        where: {
          OR: [{ email: identifier }, { phone: identifier }],
        },
      });

      if (!user) {
        console.log(`Sign-in attempt for non-existent user: ${identifier}`);
        throw new BadRequestException('User not found. Please sign up.');
      }

      const fullIdentifier = this.getFullIdentifier(
        identifier,
        user.phoneExtension || undefined,
      );
      const code = this.generateOtp();
      const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 mins

      // Also create/send OTP to the other contact (email <-> phone) if available
      const otherIdentifier =
        user.email && user.phone
          ? fullIdentifier === user.email
            ? (user.phoneExtension || '') + user.phone
            : user.email
          : null;

      // Create OTP record(s)
      const otpCreates = [
        this.prisma.otp.create({
          data: { identifier: fullIdentifier, code, expiresAt },
        }),
      ];
      if (otherIdentifier && otherIdentifier !== fullIdentifier) {
        otpCreates.push(
          this.prisma.otp.create({
            data: { identifier: otherIdentifier, code, expiresAt },
          }),
        );
      }
      await Promise.all(otpCreates);

      // Send the same code to both channels (if available)
      // No array or promises needed for console.log
      console.log(`[OTP] ${fullIdentifier} -> ${code}`);

      if (otherIdentifier && otherIdentifier !== fullIdentifier) {
        console.log(`[OTP] ${otherIdentifier} -> ${code}`);
      }

      return { otp: 'sent', identifier: identifier };
    } catch (error) {
      console.error('Error in signIn:', error);
      return { error: 'Failed to send OTP' };
    }
  }

  private async generateTokens(
    userId: string,
    email: string | null,
    role: string,
  ) {
    const payload = { sub: userId, email, role };
    const accessToken = this.jwtService.sign(payload, { expiresIn: '1h' });
    const refreshToken = crypto.randomBytes(32).toString('hex');

    await this.storeRefreshToken(userId, refreshToken);

    return {
      accessToken,
      refreshToken,
    };
  }

  private async storeRefreshToken(userId: string, token: string) {
    const hashedToken = crypto.createHash('sha256').update(token).digest('hex');
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7); // 7 days

    await this.prisma.refreshToken.create({
      data: {
        userId,
        token: hashedToken,
        expiresAt,
      },
    });
  }

  async refreshTokens(refreshToken: string) {
    // Find token (we need to hash it first if we store hashed tokens)
    // Check implementation of storeRefreshToken - yes it hashes.
    const hashedToken = crypto
      .createHash('sha256')
      .update(refreshToken)
      .digest('hex');
    const tokenRecord = await this.prisma.refreshToken.findUnique({
      where: { token: hashedToken },
      include: { user: true },
    });

    if (
      !tokenRecord ||
      tokenRecord.revoked ||
      new Date() > tokenRecord.expiresAt
    ) {
      throw new BadRequestException('Invalid or expired refresh token');
    }

    // Rotate token: Revoke old one
    await this.prisma.refreshToken.update({
      where: { id: tokenRecord.id },
      data: { revoked: true },
    });

    // Generate new tokens
    return this.generateTokens(
      tokenRecord.userId,
      tokenRecord.user.email,
      tokenRecord.user.role,
    );
  }

  async logout(refreshToken: string) {
    const hashedToken = crypto
      .createHash('sha256')
      .update(refreshToken)
      .digest('hex');
    await this.prisma.refreshToken.updateMany({
      where: { token: hashedToken, revoked: false },
      data: { revoked: true },
    });
    return { message: 'Logged out successfully' };
  }
}

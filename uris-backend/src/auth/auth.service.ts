import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { JwtService } from '@nestjs/jwt';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
  ) {}

  async validateGoogleUser(googleUser: {
    googleId: string;
    email: string;
    firstName?: string;
    lastName?: string;
    picture?: string;
  }) {
    this.logger.log(
      `validateGoogleUser called (googleId=${googleUser.googleId}, email=${googleUser.email ?? 'missing'})`,
    );

    if (!googleUser.email) {
      this.logger.warn('Google auth payload missing email');
      throw new UnauthorizedException('No email provided by Google');
    }

    // 1. Try to find user by googleId first (most reliable
    let user = await this.prisma.user.findUnique({
      where: { googleId: googleUser.googleId },
    });

    if (user) {
      this.logger.log(`Found existing user by googleId (userId=${user.id})`);
    }

    // 2. If not found by googleId, try by email (for backward compatibility)
    if (!user) {
      this.logger.log('User not found by googleId, checking by email');
      user = await this.prisma.user.findUnique({
        where: { email: googleUser.email },
      });

      if (user) {
        this.logger.log(`Found existing user by email (userId=${user.id})`);
      }
    }

    // 3. If still no user → create new one
    if (!user) {
      this.logger.log('Creating new user from Google payload');
      user = await this.prisma.user.create({
        data: {
          googleId: googleUser.googleId,           // Always save this!
          email: googleUser.email,
          firstName: googleUser.firstName ?? null,
          lastName: googleUser.lastName ?? null,
          picture: googleUser.picture ?? null,
        },
      });
      this.logger.log(`Created new user (userId=${user.id})`);
    } else if (!user.googleId) {
      // 4. Existing user (signed up via email?) → now link their Google account
      this.logger.log(`Linking googleId to existing user (userId=${user.id})`);
      user = await this.prisma.user.update({
        where: { id: user.id },
        data: { googleId: googleUser.googleId },
      });
    }

    return user;
  }

  generateJwt(user: { id: string; email: string }) {
    return this.jwtService.sign(
      { sub: user.id, email: user.email },
      { expiresIn: '7d' }, // optional: set expiry
    );
  }

  async getUserById(userId: string) {
    this.logger.log(`Fetching user profile by id (userId=${userId})`);
    return this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        picture: true,
        createdAt: true,
      },
    });
  }
}
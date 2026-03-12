import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { JwtService } from '@nestjs/jwt';

@Injectable()
export class AuthService {
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
    if (!googleUser.email) {
      throw new UnauthorizedException('No email provided by Google');
    }

    // 1. Try to find user by googleId first (most reliable
    let user = await this.prisma.user.findUnique({
      where: { googleId: googleUser.googleId },
    });

    // 2. If not found by googleId, try by email (for backward compatibility)
    if (!user) {
      user = await this.prisma.user.findUnique({
        where: { email: googleUser.email },
      });
    }

    // 3. If still no user → create new one
    if (!user) {
      user = await this.prisma.user.create({
        data: {
          googleId: googleUser.googleId,           // Always save this!
          email: googleUser.email,
          firstName: googleUser.firstName ?? null,
          lastName: googleUser.lastName ?? null,
          picture: googleUser.picture ?? null,
        },
      });
    } else if (!user.googleId) {
      // 4. Existing user (signed up via email?) → now link their Google account
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
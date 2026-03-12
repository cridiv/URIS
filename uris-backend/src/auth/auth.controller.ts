import {
  Controller,
  Get,
  Req,
  Res,
  UseGuards,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { AuthService } from './auth.service';
import { ConfigService } from '@nestjs/config';
import type { Request, Response } from 'express';

interface GoogleUserPayload {
  googleId: string;
  email: string;
  firstName?: string;
  lastName?: string;
  picture?: string;
}

interface AuthenticatedRequest extends Request {
  user: { id: string; email?: string };
}

interface GoogleAuthRequest extends Request {
  user?: GoogleUserPayload;
}

@Controller('auth')
export class AuthController {
  private readonly logger = new Logger(AuthController.name);

  constructor(private authService: AuthService, private config: ConfigService) {}

  // Step 1 — Google login
  @Get('google')
  @UseGuards(AuthGuard('google'))
  googleAuth() {}

  // Step 2 — Google callback
  @Get('google/callback')
  @UseGuards(AuthGuard('google'))
  async googleCallback(@Req() req: GoogleAuthRequest, @Res() res: Response) {
    const frontendBaseUrl = this.config.get<string>('FRONTEND_URL') ?? 'http://localhost:3000';
    const successRedirect =
      this.config.get<string>('FRONTEND_AUTH_SUCCESS_URL') ??
      `${frontendBaseUrl.replace(/\/$/, '')}/Datasets`;
    const errorRedirect =
      this.config.get<string>('FRONTEND_AUTH_ERROR_URL') ??
      `${frontendBaseUrl.replace(/\/$/, '')}/Signin`;

    try {
      const googleUser = req.user;

      if (!googleUser) {
        return res.redirect(`${errorRedirect}?error=google_user_missing`);
      }

      const user = await this.authService.validateGoogleUser(googleUser);

      if (!user.email) {
        return res.redirect(`${errorRedirect}?error=user_email_missing`);
      }

      const token = this.authService.generateJwt({ id: user.id, email: user.email as string });
      const isProduction = (this.config.get<string>('NODE_ENV') ?? 'development') === 'production';

      // Keep token out of URL by storing it in an HttpOnly cookie.
      res.cookie('uris_access_token', token, {
        httpOnly: true,
        secure: isProduction,
        sameSite: 'lax',
        maxAge: 7 * 24 * 60 * 60 * 1000,
        path: '/',
      });

      return res.redirect(successRedirect);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown auth callback error';
      this.logger.error(`Google callback failed: ${message}`);

      const separator = errorRedirect.includes('?') ? '&' : '?';
      return res.redirect(`${errorRedirect}${separator}error=auth_callback_failed`);
    }
  }
  
  @UseGuards(AuthGuard('jwt'))
  @Get('me')
  async me(@Req() req: AuthenticatedRequest) {
    const userId = req.user.id;
    const user = await this.authService.getUserById(userId);

    if (!user) {
      throw new NotFoundException('User not found');
    }

    return {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      picture: user.picture,
      createdAt: user.createdAt,
    };
  } 
};
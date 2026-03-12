import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import type { Request } from 'express';

function extractTokenFromCookie(req: Request): string | null {
  const cookieHeader = req.headers?.cookie;
  if (!cookieHeader) {
    return null;
  }

  const tokenCookie = cookieHeader
    .split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith('uris_access_token='));

  if (!tokenCookie) {
    return null;
  }

  const rawValue = tokenCookie.substring('uris_access_token='.length);
  return decodeURIComponent(rawValue);
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(private config: ConfigService) {
    super({
      jwtFromRequest: ExtractJwt.fromExtractors([
        ExtractJwt.fromAuthHeaderAsBearerToken(),
        (req: Request) => extractTokenFromCookie(req),
      ]),
      ignoreExpiration: false,
      secretOrKey: config.get<string>('JWT_SECRET') || 'defaultSecret',
    });
  }

  async validate(payload: any) {
    // payload.sub should be the user ID
    return { id: payload.sub, email: payload.email }; // attaches to req.user
  }
}
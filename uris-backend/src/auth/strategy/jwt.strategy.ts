import { Injectable, Logger } from '@nestjs/common';
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
    const hasAnyCookie = Boolean(cookieHeader && cookieHeader.length > 0);
    Logger.debug(
      `JWT cookie extractor: uris_access_token not found (hasAnyCookie=${hasAnyCookie})`,
      'JwtStrategy',
    );
    return null;
  }

  const rawValue = tokenCookie.substring('uris_access_token='.length);
  Logger.debug(
    `JWT cookie extractor: token cookie found (length=${rawValue.length})`,
    'JwtStrategy',
  );
  return decodeURIComponent(rawValue);
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  private readonly logger = new Logger(JwtStrategy.name);

  constructor(private config: ConfigService) {
    const configuredSecret =
      config.get<string>('JWT_SECRET') ?? 'dev-only-jwt-secret-change-me';
    Logger.log(
      `JWT strategy initialized (secretSource=${configuredSecret === 'dev-only-jwt-secret-change-me' ? 'fallback' : 'env'})`,
      'JwtStrategy',
    );

    super({
      jwtFromRequest: ExtractJwt.fromExtractors([
        ExtractJwt.fromAuthHeaderAsBearerToken(),
        (req: Request) => extractTokenFromCookie(req),
      ]),
      ignoreExpiration: false,
      secretOrKey: configuredSecret,
    });
  }

  async validate(payload: any) {
    this.logger.log(`JWT validate success (sub=${payload?.sub ?? 'missing'})`);
    // payload.sub should be the user ID
    return { id: payload.sub, email: payload.email }; // attaches to req.user
  }
}
import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy, StrategyOptions } from 'passport-google-oauth20';
import { Profile } from 'passport';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class GoogleStrategy extends PassportStrategy(Strategy, 'google') {
  constructor(private config: ConfigService) {
    const clientID = config.get<string>('GOOGLE_CLIENT_ID');
    const clientSecret = config.get<string>('GOOGLE_CLIENT_SECRET');
    const callbackURL = config.get<string>('GOOGLE_CALLBACK_URL') ?? 'http://localhost:5000/auth/google/callback';

    if (!clientID || !clientSecret) {
      throw new Error('Missing Google OAuth env vars: GOOGLE_CLIENT_ID/GOOGLE_CLIENT_SECRET');
    }

    const options: StrategyOptions = {
      clientID,
      clientSecret,
      callbackURL,
      scope: ['email', 'profile'],
    };

    super(options);
  }

  async validate(
    accessToken: string,
    refreshToken: string,
    profile: Profile,
    done: (err: any, user?: any, info?: any) => void,
  ): Promise<any> {
    const { id, name, emails, photos } = profile;

    if (!id) {
      return done(new Error('Google user ID is missing'), null);
    }

    const user = {
      googleId: id,
      email: emails?.[0]?.value ?? null,
      firstName: name?.givenName ?? null,
      lastName: name?.familyName ?? null,
      picture: photos?.[0]?.value ?? null,
      accessToken,
    };

    done(null, user);
  }
}
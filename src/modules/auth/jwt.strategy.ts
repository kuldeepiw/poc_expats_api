import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { AuthService } from './auth.service';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    config: ConfigService,
    private readonly auth: AuthService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.get<string>('auth.jwtSecret')!,
    });
  }

  /**
   * The user is loaded from the database on every request rather than trusted
   * from the token, so blocking takes effect immediately instead of when the
   * token happens to expire.
   */
  async validate(payload: { sub: string }) {
    const user = await this.auth.findById(payload.sub);
    if (!user || user.is_blocked || user.deleted_at) {
      throw new UnauthorizedException();
    }
    return { id: user.id, email: user.email, state: user.state };
  }
}

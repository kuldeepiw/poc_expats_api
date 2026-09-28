import { ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import { User } from '../../database/entities';
import { LoginDto, RegisterDto } from './dto/auth.dto';

/**
 * Self-contained auth for the POC.
 *
 * Production uses Firebase Authentication — this service is the seam that
 * makes swapping it a change here rather than in every controller. The guard
 * verifies a token and resolves a user; where the token came from is this
 * service's concern alone.
 */
@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(User) private readonly users: Repository<User>,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  async register(dto: RegisterDto) {
    // Closed on any deployment the public can reach. Accounts for a demo are
    // created by the seed script instead, which bypasses this path.
    if (!this.config.get<boolean>('auth.registrationEnabled')) {
      throw new ForbiddenException(
        'Registration is closed on this demo. Please use the account you were given.',
      );
    }

    const existing = await this.users.findOneBy({ email: dto.email.toLowerCase() });
    if (existing) throw new ForbiddenException('That email is already registered');

    const user = await this.users.save(
      this.users.create({
        email: dto.email.toLowerCase(),
        full_name: dto.fullName ?? null,
        state: dto.state ?? null,
        auth_provider: 'password',
        // POC only. Under Firebase no password is stored here at all.
        firebase_uid: await bcrypt.hash(dto.password, 10),
        is_verified: true,
      }),
    );

    return this.issue(user);
  }

  async login(dto: LoginDto) {
    const user = await this.users.findOneBy({ email: dto.email.toLowerCase() });

    // One generic failure for both cases. Telling the caller which half was
    // wrong hands them a way to enumerate accounts.
    const ok = user?.firebase_uid
      ? await bcrypt.compare(dto.password, user.firebase_uid)
      : false;
    if (!user || !ok) throw new UnauthorizedException('Email or password is incorrect');

    // Blocking is a product rule, not an identity one: the credentials are
    // valid, and we refuse anyway.
    if (user.is_blocked) throw new ForbiddenException('This account is blocked');

    return this.issue(user);
  }

  async findById(id: string): Promise<User | null> {
    return this.users.findOneBy({ id });
  }

  async setState(userId: string, state: string, city?: string) {
    await this.users.update(userId, { state, city: city ?? null });
    return { state, city: city ?? null };
  }

  private issue(user: User) {
    return {
      accessToken: this.jwt.sign({ sub: user.id, email: user.email }),
      user: {
        id: user.id,
        email: user.email,
        fullName: user.full_name,
        state: user.state,
      },
    };
  }
}

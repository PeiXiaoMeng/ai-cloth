import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';

/**
 * Admin guard: validates Authorization: Bearer <token>
 * The token must be issued by the admin login (payload.role === 'admin')
 */
@Injectable()
export class AdminGuard implements CanActivate {
  constructor(private readonly jwtService: JwtService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest();
    const auth: string = req.headers.authorization || '';
    const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
    if (!token) {
      throw new UnauthorizedException('Not authenticated');
    }
    try {
      const payload = await this.jwtService.verifyAsync(token);
      if (payload.role !== 'admin') {
        throw new Error('not admin');
      }
      req.admin = payload;
      return true;
    } catch {
      throw new UnauthorizedException('Session expired, please log in again');
    }
  }
}

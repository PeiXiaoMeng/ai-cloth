import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ExecutionContext } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';

/**
 * Custom JWT guard: resolves the user from Authorization: Bearer <token>
 * On success, attaches userId to the request object
 */
@Injectable()
export class JwtAuthGuard {
  constructor(private readonly jwtService: JwtService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const auth: string = request.headers['authorization'] || '';
    const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
    if (!token) {
      throw new UnauthorizedException('Not authenticated, please log in first');
    }
    try {
      const payload = await this.jwtService.verifyAsync(token);
      request.userId = payload.sub;
      return true;
    } catch {
      throw new UnauthorizedException('Session expired, please log in again');
    }
  }
}

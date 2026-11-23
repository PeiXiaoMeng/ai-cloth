import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';

/**
 * 管理端守卫：校验 Authorization: Bearer <token>
 * token 必须是管理员登录签发的（payload.role === 'admin'）
 */
@Injectable()
export class AdminGuard implements CanActivate {
  constructor(private readonly jwtService: JwtService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest();
    const auth: string = req.headers.authorization || '';
    const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
    if (!token) {
      throw new UnauthorizedException('未登录');
    }
    try {
      const payload = await this.jwtService.verifyAsync(token);
      if (payload.role !== 'admin') {
        throw new Error('not admin');
      }
      req.admin = payload;
      return true;
    } catch {
      throw new UnauthorizedException('登录已失效，请重新登录');
    }
  }
}

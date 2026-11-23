import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ExecutionContext } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';

/**
 * 自定义 JWT 守卫：从 Authorization: Bearer <token> 中解析用户
 * 校验通过后把 userId 挂到 request 上
 */
@Injectable()
export class JwtAuthGuard {
  constructor(private readonly jwtService: JwtService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const auth: string = request.headers['authorization'] || '';
    const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
    if (!token) {
      throw new UnauthorizedException('未登录，请先登录');
    }
    try {
      const payload = await this.jwtService.verifyAsync(token);
      request.userId = payload.sub;
      return true;
    } catch {
      throw new UnauthorizedException('登录已过期，请重新登录');
    }
  }
}

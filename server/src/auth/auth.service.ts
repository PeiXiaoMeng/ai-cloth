import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import axios from 'axios';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
  ) {}

  /**
   * 小程序登录：客户端 wx.login 拿到 code，传到这里
   * 服务端用 code 调微信接口换 openid，然后签发 JWT
   */
  async wxLogin(code: string) {
    if (!code) {
      throw new Error('缺少 code');
    }

    // 开发联调模式：WX_MOCK=true 时跳过微信接口，直接用 code 当 openid
    if ((process.env.WX_MOCK || '').toLowerCase() === 'true') {
      const openid = `mock_${code}`;
      const mockUser = await this.prisma.user.upsert({
        where: { openid },
        update: {},
        create: { openid },
      });
      const token = await this.jwtService.signAsync({ sub: mockUser.id, openid });
      return { token, userId: mockUser.id };
    }

    const appid = process.env.WX_APPID;
    const secret = process.env.WX_SECRET;
    if (!appid || !secret) {
      throw new Error('服务端未配置 WX_APPID / WX_SECRET');
    }

    const { data } = await axios.get(
      'https://api.weixin.qq.com/sns/jscode2session',
      {
        params: {
          appid,
          secret,
          js_code: code,
          grant_type: 'authorization_code',
        },
      },
    );

    if (data.errcode && data.errcode !== 0) {
      throw new Error(`微信登录失败: ${data.errcode} ${data.errmsg}`);
    }

    const openid: string = data.openid;
    const user = await this.prisma.user.upsert({
      where: { openid },
      update: {},
      create: { openid },
    });

    const token = await this.jwtService.signAsync({ sub: user.id, openid });
    return { token, userId: user.id };
  }
}

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
   * Mini-program login: the client gets a code via wx.login and sends it here
   * The server exchanges the code for an openid via the WeChat API, then issues a JWT
   */
  async wxLogin(code: string) {
    if (!code) {
      throw new Error('Missing code');
    }

    // Dev mode: when WX_MOCK=true, skip the WeChat API and use the code as the openid directly
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
      throw new Error('WX_APPID / WX_SECRET are not configured on the server');
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
      throw new Error(`WeChat login failed: ${data.errcode} ${data.errmsg}`);
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

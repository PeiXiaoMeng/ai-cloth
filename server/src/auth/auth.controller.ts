import { Body, Controller, Get, Post, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './jwt-auth.guard';
import { PrismaService } from '../prisma/prisma.service';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly prisma: PrismaService,
  ) {}

  @Post('login')
  async login(@Body() body: { code: string }) {
    return this.authService.wxLogin(body.code);
  }

  // Current user info + remaining try-on quota (including the admin-adjusted bonus)
  @Get('me')
  @UseGuards(JwtAuthGuard)
  async me(@Req() req: Request & { userId: number }) {
    const limit = Number(
      (
        await this.prisma.setting.upsert({
          where: { key: 'TRY_ON_LIMIT' },
          update: {},
          create: { key: 'TRY_ON_LIMIT', value: '3' },
        })
      ).value,
    );
    const user = await this.prisma.user.findUnique({ where: { id: req.userId } });
    const used = await this.prisma.tryOnRecord.count({
      where: { userId: req.userId, status: 'SUCCESS' },
    });
    return {
      userId: req.userId,
      tryOnLimit: limit,
      tryOnUsed: used,
      quotaBonus: user?.quotaBonus ?? 0,
      tryOnLeft: Math.max(0, limit + (user?.quotaBonus ?? 0) - used),
    };
  }
}

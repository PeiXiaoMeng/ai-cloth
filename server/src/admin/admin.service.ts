import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class AdminService {
  constructor(private readonly prisma: PrismaService) {}

  /** 管理员登录（账号密码来自环境变量，默认 admin / admin123456） */
  async login(username: string, password: string) {
    const expectUser = process.env.ADMIN_USERNAME || 'admin';
    const expectPwd = process.env.ADMIN_PASSWORD || 'admin123456';
    if (username !== expectUser || password !== expectPwd) {
      return null;
    }
    return { username: expectUser };
  }

  /** "新上"判断：创建时间在 30 天内 */
  isNewByCreatedAt(createdAt: Date): boolean {
    return Date.now() - new Date(createdAt).getTime() < 30 * 24 * 3600 * 1000;
  }

  /** 商品列表（含动态计算的 isNew） */
  async listItems() {
    const items = await this.prisma.clothingItem.findMany({
      orderBy: [{ sort: 'asc' }, { id: 'asc' }],
    });
    return items.map((item) => ({
      ...item,
      isNew: this.isNewByCreatedAt(item.createdAt),
    }));
  }

  /** 用户列表（含试穿次数统计） */
  async listUsers() {
    const limit = await this.settingsTryOnLimit();
    const users = await this.prisma.user.findMany({
      orderBy: { id: 'desc' },
      include: {
        _count: { select: { tryOnRecords: { where: { status: 'SUCCESS' } } } },
      },
    });
    return users.map((u) => {
      const used = u._count.tryOnRecords;
      const left = Math.max(0, limit + u.quotaBonus - used);
      return {
        id: u.id,
        openid: u.openid,
        createdAt: u.createdAt,
        tryOnLimit: limit,
        tryOnUsed: used,
        quotaBonus: u.quotaBonus,
        tryOnLeft: left,
      };
    });
  }

  /** 管理员调整用户试穿次数：delta 正加负减，单次 |delta| <= 30，剩余次数夹在 0~30 */
  async adjustQuota(userId: number, delta: number) {
    if (!Number.isInteger(delta) || delta === 0) {
      throw new Error('调整次数必须是 非0 整数');
    }
    if (Math.abs(delta) > 30) {
      throw new Error('单次最多只能调整 30 次');
    }
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new Error('用户不存在');
    }
    const limit = await this.settingsTryOnLimit();
    const used = await this.prisma.tryOnRecord.count({
      where: { userId, status: 'SUCCESS' },
    });

    let bonus = user.quotaBonus + delta;
    // 剩余次数限制在 [0, 30] 区间内，防止误操作
    let left = limit + bonus - used;
    if (left > 30) {
      bonus -= left - 30;
      left = 30;
    }
    if (left < 0) {
      bonus -= left;
      left = 0;
    }

    await this.prisma.user.update({
      where: { id: userId },
      data: { quotaBonus: bonus },
    });
    return { tryOnLimit: limit, tryOnUsed: used, quotaBonus: bonus, tryOnLeft: left };
  }

  private async settingsTryOnLimit(): Promise<number> {
    const setting = await this.prisma.setting.upsert({
      where: { key: 'TRY_ON_LIMIT' },
      update: {},
      create: { key: 'TRY_ON_LIMIT', value: '3' },
    });
    return Number(setting.value);
  }
}

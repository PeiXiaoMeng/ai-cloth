import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class AdminService {
  constructor(private readonly prisma: PrismaService) {}

  /** Admin login (credentials come from environment variables, defaults: admin / admin123456) */
  async login(username: string, password: string) {
    const expectUser = process.env.ADMIN_USERNAME || 'admin';
    const expectPwd = process.env.ADMIN_PASSWORD || 'admin123456';
    if (username !== expectUser || password !== expectPwd) {
      return null;
    }
    return { username: expectUser };
  }

  /** "New arrivals" flag: created within the last 30 days */
  isNewByCreatedAt(createdAt: Date): boolean {
    return Date.now() - new Date(createdAt).getTime() < 30 * 24 * 3600 * 1000;
  }

  /** Item list (with dynamically computed isNew) */
  async listItems() {
    const items = await this.prisma.clothingItem.findMany({
      orderBy: [{ sort: 'asc' }, { id: 'asc' }],
    });
    return items.map((item) => ({
      ...item,
      isNew: this.isNewByCreatedAt(item.createdAt),
    }));
  }

  /** User list (with try-on quota stats) */
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

  /** Admin adjusts a user's try-on quota: delta positive to add / negative to subtract, |delta| <= 30 per call, remaining quota clamped to 0~30 */
  async adjustQuota(userId: number, delta: number) {
    if (!Number.isInteger(delta) || delta === 0) {
      throw new Error('Delta must be a non-zero integer');
    }
    if (Math.abs(delta) > 30) {
      throw new Error('A single adjustment can change the quota by at most 30');
    }
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new Error('User not found');
    }
    const limit = await this.settingsTryOnLimit();
    const used = await this.prisma.tryOnRecord.count({
      where: { userId, status: 'SUCCESS' },
    });

    let bonus = user.quotaBonus + delta;
    // Clamp remaining quota to [0, 30] to guard against mis-operation
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

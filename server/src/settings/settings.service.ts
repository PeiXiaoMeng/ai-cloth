import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class SettingsService {
  constructor(private readonly prisma: PrismaService) {}

  // 读取试穿次数上限（默认 3）
  async getTryOnLimit(): Promise<number> {
    const setting = await this.prisma.setting.upsert({
      where: { key: 'TRY_ON_LIMIT' },
      update: {},
      create: { key: 'TRY_ON_LIMIT', value: '3' },
    });
    return Number(setting.value);
  }

  // 修改试穿次数上限（管理员通过接口或直接改数据库配置）
  async setTryOnLimit(value: number): Promise<number> {
    if (!Number.isInteger(value) || value < 0) {
      throw new Error('试穿次数必须是大于等于 0 的整数');
    }
    await this.prisma.setting.upsert({
      where: { key: 'TRY_ON_LIMIT' },
      update: { value: String(value) },
      create: { key: 'TRY_ON_LIMIT', value: String(value) },
    });
    return value;
  }
}

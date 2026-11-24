import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class SettingsService {
  constructor(private readonly prisma: PrismaService) {}

  // Read the try-on quota limit (default: 3)
  async getTryOnLimit(): Promise<number> {
    const setting = await this.prisma.setting.upsert({
      where: { key: 'TRY_ON_LIMIT' },
      update: {},
      create: { key: 'TRY_ON_LIMIT', value: '3' },
    });
    return Number(setting.value);
  }

  // Update the try-on quota limit (admin updates via the API or directly in the database)
  async setTryOnLimit(value: number): Promise<number> {
    if (!Number.isInteger(value) || value < 0) {
      throw new Error('The try-on quota must be an integer greater than or equal to 0');
    }
    await this.prisma.setting.upsert({
      where: { key: 'TRY_ON_LIMIT' },
      update: { value: String(value) },
      create: { key: 'TRY_ON_LIMIT', value: String(value) },
    });
    return value;
  }
}

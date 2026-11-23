import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

const NEW_WINDOW_MS = 30 * 24 * 3600 * 1000; // 30 天内算"新上"

@Injectable()
export class ItemsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll() {
    const items = await this.prisma.clothingItem.findMany({
      orderBy: [{ sort: 'asc' }, { id: 'asc' }],
    });
    // "新上"由服务端按创建时间动态计算：30 天内为新上
    return items.map((item) => ({
      ...item,
      isNew: Date.now() - new Date(item.createdAt).getTime() < NEW_WINDOW_MS,
    }));
  }

  findOne(id: number) {
    return this.prisma.clothingItem.findUnique({ where: { id } });
  }
}

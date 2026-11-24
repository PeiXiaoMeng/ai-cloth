import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

const NEW_WINDOW_MS = 30 * 24 * 3600 * 1000; // items created within 30 days count as "new arrivals"

@Injectable()
export class ItemsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll() {
    const items = await this.prisma.clothingItem.findMany({
      orderBy: [{ sort: 'asc' }, { id: 'asc' }],
    });
    // "New arrivals" is computed dynamically by the server based on creation time: within 30 days
    return items.map((item) => ({
      ...item,
      isNew: Date.now() - new Date(item.createdAt).getTime() < NEW_WINDOW_MS,
    }));
  }

  findOne(id: number) {
    return this.prisma.clothingItem.findUnique({ where: { id } });
  }
}

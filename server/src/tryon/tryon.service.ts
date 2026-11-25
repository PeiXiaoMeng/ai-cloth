import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { SettingsService } from '../settings/settings.service';
import { TryonQueue } from './tryon.queue';

@Injectable()
export class TryonService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settingsService: SettingsService,
    private readonly tryonQueue: TryonQueue,
  ) {}

  /**
   * Async try-on flow:
   * 1. Validate the item and the user's remaining quota (prompt to contact admin when exhausted)
   * 2. Reject when the user already has a task in flight (queue-abuse protection)
   * 3. Create a PENDING record and enqueue the AI job, then return immediately.
   *    The worker later drives the record through PROCESSING to SUCCESS / FAILED.
   *
   * Quota consumption stays implicit: SUCCESS records are counted per (user, item),
   * and only the worker can turn a record into SUCCESS.
   */
  async tryOn(opts: {
    userId: number;
    itemId: number;
    personImageUrl: string; // publicly accessible URL of the user-uploaded photo
    baseUrl: string; // e.g. http://localhost:3000, used to build the garment image URL
  }) {
    const { userId, itemId, personImageUrl, baseUrl } = opts;

    const item = await this.prisma.clothingItem.findUnique({ where: { id: itemId } });
    if (!item) {
      throw new NotFoundException('Item not found');
    }

    // Quota check: base limit + admin-adjusted bonus
    const quota = await this.leftCount(userId);
    if (quota.tryOnLeft <= 0) {
      throw new ForbiddenException('Your try-on quota is exhausted, please contact the administrator');
    }

    // In-flight dedupe: only one active task per user, so a burst of taps
    // cannot flood the queue and burn the AI budget
    const inFlight = await this.prisma.tryOnRecord.count({
      where: { userId, status: { in: ['PENDING', 'PROCESSING'] } },
    });
    if (inFlight >= 1) {
      throw new BadRequestException('You already have a try-on task in progress');
    }

    const record = await this.prisma.tryOnRecord.create({
      data: {
        userId,
        itemId,
        status: 'PENDING',
        inputImg: personImageUrl,
      },
    });

    await this.tryonQueue.enqueue({
      recordId: record.id,
      itemId,
      personImageUrl,
      baseUrl,
    });

    return record;
  }

  // User's remaining quota (base limit + admin-adjusted bonus)
  async leftCount(userId: number) {
    const limit = await this.settingsService.getTryOnLimit();
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    const used = await this.prisma.tryOnRecord.count({
      where: { userId, status: 'SUCCESS' },
    });
    return {
      tryOnLimit: limit,
      tryOnUsed: used,
      quotaBonus: user?.quotaBonus ?? 0,
      tryOnLeft: Math.max(0, limit + (user?.quotaBonus ?? 0) - used),
    };
  }
}

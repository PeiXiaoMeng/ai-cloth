import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ItemIndexQueue } from './item-index.queue';

const POLL_INTERVAL_MS = 2000;
const BATCH_SIZE = 50;

/**
 * Scans ItemIndexOutbox rows and feeds them into the item-index queue.
 * Rows are marked QUEUED right after enqueueing (crash-safe: rows stuck in
 * QUEUED are reset to PENDING on startup). The worker marks DONE / DEAD.
 */
@Injectable()
export class OutboxPoller implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(OutboxPoller.name);
  private timer?: NodeJS.Timeout;
  private ticking = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly queue: ItemIndexQueue,
  ) {}

  onModuleInit() {
    // Recover rows that were queued but never processed (e.g. a crash between enqueue and DONE)
    this.prisma.itemIndexOutbox
      .updateMany({ where: { status: 'QUEUED' }, data: { status: 'PENDING' } })
      .catch((err) => this.logger.warn(`Failed to reset stale QUEUED rows: ${(err as Error).message}`));

    this.timer = setInterval(() => void this.tick(), POLL_INTERVAL_MS);
  }

  private async tick() {
    if (this.ticking) return;
    this.ticking = true;
    try {
      const rows = await this.prisma.itemIndexOutbox.findMany({
        where: { status: 'PENDING' },
        orderBy: { createdAt: 'asc' },
        take: BATCH_SIZE,
      });
      for (const row of rows) {
        try {
          await this.queue.enqueue({
            eventId: row.id,
            itemId: row.itemId,
            op: row.op as 'UPSERT' | 'DELETE',
          });
          await this.prisma.itemIndexOutbox.update({
            where: { id: row.id },
            data: { status: 'QUEUED' },
          });
        } catch (err) {
          // Leave the row PENDING; the next tick retries enqueueing
          this.logger.warn(`Failed to enqueue outbox event ${row.id}: ${(err as Error).message}`);
          break; // queue is likely down, stop this tick
        }
      }
    } catch (err) {
      this.logger.warn(`Outbox poll failed: ${(err as Error).message}`);
    } finally {
      this.ticking = false;
    }
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }
}

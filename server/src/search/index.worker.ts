import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { Job, Worker } from 'bullmq';
import { redisConnection } from '../tryon/tryon.queue';
import { ITEM_INDEX_QUEUE_NAME, ItemIndexJobData } from './item-index.queue';
import { ItemIndexService } from './item-index.service';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Consumes item-index jobs: re-reads the latest DB row by itemId (the queue only
 * carries ids, so out-of-order or duplicated jobs always write the freshest state),
 * then marks the outbox row DONE — or DEAD after the final failed attempt.
 */
@Injectable()
export class IndexWorker implements OnModuleDestroy {
  private readonly logger = new Logger(IndexWorker.name);
  private readonly worker: Worker<ItemIndexJobData>;

  constructor(
    private readonly prisma: PrismaService,
    private readonly itemIndex: ItemIndexService,
  ) {
    this.worker = new Worker<ItemIndexJobData>(
      ITEM_INDEX_QUEUE_NAME,
      (job) => this.handle(job),
      {
        connection: redisConnection(),
        concurrency: 2,
        // attempts/backoff are job-level options, set in ItemIndexQueue.enqueue
        // BullMQ 6 workers only accept KeepJobs objects here; count: 0 keeps no finished jobs.
        // The outbox row is the durable record, not Redis.
        removeOnComplete: { count: 0 },
        removeOnFail: { count: 0 },
      },
    );
  }

  private async handle(job: Job<ItemIndexJobData>) {
    const { eventId, itemId, op } = job.data;
    try {
      if (op === 'DELETE') {
        await this.itemIndex.remove(itemId);
      } else {
        await this.itemIndex.upsert(itemId);
      }
      await this.prisma.itemIndexOutbox.update({ where: { id: eventId }, data: { status: 'DONE' } });
    } catch (err) {
      const attemptsMade = job.attemptsMade + 1;
      const isFinalAttempt = attemptsMade >= (job.opts.attempts ?? 1);
      await this.prisma.itemIndexOutbox
        .update({ where: { id: eventId }, data: { attempts: attemptsMade } })
        .catch(() => {});

      if (isFinalAttempt) {
        await this.prisma.itemIndexOutbox
          .update({ where: { id: eventId }, data: { status: 'DEAD' } })
          .catch(() => {});
        this.logger.error(
          `Outbox event ${eventId} -> DEAD after ${attemptsMade} attempts: ${(err as Error).message}`,
        );
        return; // swallow: the failure is durably recorded, stop BullMQ retries
      }
      throw err; // rethrow so BullMQ retries with backoff
    }
  }

  async onModuleDestroy() {
    await this.worker.close();
  }
}

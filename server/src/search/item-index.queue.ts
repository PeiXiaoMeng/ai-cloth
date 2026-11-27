import { Injectable } from '@nestjs/common';
import { Queue } from 'bullmq';
import { redisConnection } from '../tryon/tryon.queue';

export const ITEM_INDEX_QUEUE_NAME = 'item-index';

/** Payload carried by every index-sync job */
export interface ItemIndexJobData {
  eventId: number; // ItemIndexOutbox row id, marked DONE/DEAD by the worker
  itemId: number;
  op: 'UPSERT' | 'DELETE';
}

/**
 * BullMQ queue for DB -> Elasticsearch index sync.
 * Reuses the same Redis as the try-on queue; the durable state lives in the
 * ItemIndexOutbox table — Redis only orchestrates, like the try-on pipeline.
 */
@Injectable()
export class ItemIndexQueue {
  readonly queue = new Queue<ItemIndexJobData>(ITEM_INDEX_QUEUE_NAME, {
    connection: redisConnection(),
  });

  async enqueue(data: ItemIndexJobData) {
    return this.queue.add('index-sync', data, {
      attempts: 3,
      backoff: { type: 'fixed', delay: 2000 },
      removeOnComplete: true,
      removeOnFail: true,
    });
  }

  async close() {
    await this.queue.close();
  }
}

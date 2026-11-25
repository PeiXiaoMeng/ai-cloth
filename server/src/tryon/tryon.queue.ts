import { Injectable } from '@nestjs/common';
import { Queue } from 'bullmq';

export const TRYON_QUEUE_NAME = 'tryon';

/** Payload carried by every try-on job */
export interface TryonJobData {
  recordId: number;
  itemId: number;
  personImageUrl: string;
  baseUrl: string;
}

/**
 * Shared BullMQ Redis connection options.
 * maxRetriesPerRequest: null is required by BullMQ workers — commands keep retrying
 * instead of failing when Redis is briefly unavailable.
 */
export function redisConnection() {
  const url = process.env.REDIS_URL || 'redis://localhost:6379';
  return { url, maxRetriesPerRequest: null as null };
}

/** Thin wrapper around the BullMQ queue for the async try-on pipeline */
@Injectable()
export class TryonQueue {
  readonly queue = new Queue<TryonJobData>(TRYON_QUEUE_NAME, {
    connection: redisConnection(),
  });

  /** Enqueue one AI try-on job. Task state lives in the database; Redis only orchestrates. */
  async enqueue(data: TryonJobData) {
    return this.queue.add('tryon', data, {
      // One automatic retry with backoff for transient AI failures.
      // The worker marks the record FAILED only after the final attempt.
      attempts: 2,
      backoff: { type: 'fixed', delay: 5000 },
      removeOnComplete: true,
      removeOnFail: true,
    });
  }

  async close() {
    await this.queue.close();
  }
}

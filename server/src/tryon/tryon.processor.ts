import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { Job, Worker } from 'bullmq';
import { PrismaService } from '../prisma/prisma.service';
import { DashscopeService } from './dashscope.service';
import { TRYON_QUEUE_NAME, TryonJobData, redisConnection } from './tryon.queue';

/**
 * BullMQ worker: consumes try-on jobs and drives the record state machine
 *   PENDING -> PROCESSING -> SUCCESS | FAILED
 *
 * Concurrency control: at most `TRYON_CONCURRENCY` AI jobs run at the same time,
 * which pins the instantaneous load on the DashScope API to a constant
 * (protects its rate limit and the paid quota) no matter how deep the queue is.
 */
@Injectable()
export class TryonProcessor implements OnModuleDestroy {
  private readonly logger = new Logger(TryonProcessor.name);
  private readonly worker: Worker<TryonJobData>;

  constructor(
    private readonly prisma: PrismaService,
    private readonly dashscopeService: DashscopeService,
  ) {
    this.worker = new Worker<TryonJobData>(
      TRYON_QUEUE_NAME,
      (job) => this.process(job),
      {
        concurrency: Number(process.env.TRYON_CONCURRENCY || 3),
        connection: redisConnection(),
      },
    );
  }

  async process(job: Job<TryonJobData>) {
    const { recordId, itemId, personImageUrl, baseUrl } = job.data;

    const record = await this.prisma.tryOnRecord.findUnique({ where: { id: recordId } });
    if (!record) return; // record deleted while queued, nothing to do
    if (record.status === 'SUCCESS') return; // duplicate delivery, already done

    const item = await this.prisma.clothingItem.findUnique({ where: { id: itemId } });
    if (!item) {
      await this.markFailed(recordId, 'Item no longer exists');
      return;
    }

    await this.prisma.tryOnRecord.update({
      where: { id: recordId },
      data: { status: 'PROCESSING' },
    });

    try {
      const garmentImageUrl = item.image.startsWith('http')
        ? item.image
        : `${baseUrl}${item.image}`;

      const resultUrl = await this.dashscopeService.tryOn(personImageUrl, garmentImageUrl);

      // Download the result image locally so the mini-program avoids cross-origin image references
      let resultImg = resultUrl;
      if (resultUrl.startsWith('http')) {
        try {
          resultImg = await this.downloadToPublic(resultUrl);
        } catch {
          // Fall back to the original URL if the download fails
        }
      }

      await this.prisma.tryOnRecord.update({
        where: { id: recordId },
        data: { status: 'SUCCESS', resultImg, errorMsg: null },
      });
    } catch (e) {
      const isFinalAttempt = job.attemptsMade + 1 >= (job.opts.attempts ?? 1);
      if (isFinalAttempt) {
        await this.markFailed(recordId, e.message || 'Try-on failed');
      }
      // Non-final attempts keep PROCESSING; BullMQ retries after the backoff delay
      throw e;
    }
  }

  private async markFailed(recordId: number, message: string) {
    await this.prisma.tryOnRecord.update({
      where: { id: recordId },
      data: { status: 'FAILED', errorMsg: message.slice(0, 500) },
    });
  }

  // Download the result image from DashScope into public/uploads and return the local static path
  private async downloadToPublic(url: string): Promise<string> {
    const axios = await import('axios').then((m) => m.default);
    const fs = await import('fs');
    const path = await import('path');
    const dir = path.join(process.cwd(), 'public', 'uploads', 'tryon');
    fs.mkdirSync(dir, { recursive: true });
    const filename = `result_${Date.now()}_${Math.floor(Math.random() * 10000)}.png`;
    const filepath = path.join(dir, filename);
    const res = await axios.get(url, { responseType: 'arraybuffer', timeout: 60000 });
    fs.writeFileSync(filepath, Buffer.from(res.data));
    return `/static/uploads/tryon/${filename}`;
  }

  // Graceful shutdown: stop consuming new jobs and finish the current ones (K8s SIGTERM friendly)
  async onModuleDestroy() {
    await this.worker.close();
  }
}

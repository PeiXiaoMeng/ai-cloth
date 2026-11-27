import { Injectable, Logger } from '@nestjs/common';
import type { ClothingItem } from '@prisma/client';
import {
  ElasticsearchProvider,
  ITEMS_ALIAS,
  ITEMS_MAPPINGS,
  ITEMS_SETTINGS,
} from './elasticsearch.provider';
import { PrismaService } from '../prisma/prisma.service';

const NEW_WINDOW_MS = 30 * 24 * 3600 * 1000; // matches ItemsService: created within 30 days = "new"

@Injectable()
export class ItemIndexService {
  private readonly logger = new Logger(ItemIndexService.name);

  constructor(
    private readonly es: ElasticsearchProvider,
    private readonly prisma: PrismaService,
  ) {}

  /** DB row -> ES document. DB category values stay Chinese; ES uses English. */
  toDoc(item: ClothingItem) {
    return {
      id: item.id,
      title: item.title,
      category:
        item.category === '上衣' ? 'Tops' : item.category === '裤子' ? 'Bottoms' : item.category,
      isNew: Date.now() - new Date(item.createdAt).getTime() < NEW_WINDOW_MS,
      sort: item.sort,
      image: item.image,
      suggest: { input: item.title },
    };
  }

  /** Idempotent upsert: _id is the DB primary key, so repeated jobs just overwrite */
  async upsert(itemId: number) {
    const item = await this.prisma.clothingItem.findUnique({ where: { id: itemId } });
    if (!item) return false; // row vanished between the event and the write
    await this.es.client.index({ index: ITEMS_ALIAS, id: String(itemId), document: this.toDoc(item) });
    return true;
  }

  /** Delete the document; a missing doc is not an error */
  async remove(itemId: number) {
    try {
      await this.es.client.delete({ index: ITEMS_ALIAS, id: String(itemId) });
    } catch (err) {
      const status = (err as { meta?: { statusCode?: number } })?.meta?.statusCode;
      if (status === 404) return;
      throw err;
    }
  }

  /**
   * Full rebuild from the database: write items_v(N+1), bulk index everything,
   * switch the alias atomically, drop the old index. Zero-downtime by design.
   */
  async rebuild(): Promise<{ indexed: number; took: number; index: string }> {
    const start = Date.now();
    const current = await this.resolveCurrentIndex();
    const nextVersion = current ? Number(current.match(/items_v(\d+)/)?.[1] ?? 0) + 1 : 1;
    const nextIndex = `items_v${nextVersion}`;

    await this.es.client.indices.create({
      index: nextIndex,
      settings: ITEMS_SETTINGS,
      mappings: ITEMS_MAPPINGS,
    });

    const items = await this.prisma.clothingItem.findMany({
      orderBy: [{ sort: 'asc' }, { id: 'asc' }],
    });
    if (items.length > 0) {
      const operations = items.flatMap((item) => [
        { index: { _index: nextIndex, _id: String(item.id) } },
        this.toDoc(item),
      ]);
      await this.es.client.bulk({ operations, refresh: true });
    }

    // Swap the alias in one atomic call, then drop the old index
    const actions: Record<string, unknown>[] = [{ add: { index: nextIndex, alias: ITEMS_ALIAS } }];
    if (current && current !== nextIndex) {
      actions.unshift({ remove: { index: current, alias: ITEMS_ALIAS } });
    }
    await this.es.client.indices.updateAliases({ actions: actions as never });
    if (current && current !== nextIndex) {
      await this.es.client.indices.delete({ index: current });
    }

    this.logger.log(`Rebuilt ${items.length} items into ${nextIndex} in ${Date.now() - start}ms`);
    return { indexed: items.length, took: Date.now() - start, index: nextIndex };
  }

  /** Resolve the concrete index name currently behind the alias (null when not set up yet) */
  private async resolveCurrentIndex(): Promise<string | null> {
    try {
      const alias = await this.es.client.indices.getAlias({ name: ITEMS_ALIAS });
      return Object.keys(alias)[0] ?? null;
    } catch {
      return null;
    }
  }
}

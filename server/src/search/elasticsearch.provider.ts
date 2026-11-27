import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Client } from '@elastic/elasticsearch';
import type { IndicesIndexSettings, MappingTypeMapping } from '@elastic/elasticsearch/lib/api/types';

/** Alias used by every read/write; concrete indices are versioned (items_v1, items_v2, ...) */
export const ITEMS_ALIAS = 'items';

/**
 * Index settings: a custom English analyzer for apparel titles.
 * Chain: standard tokenizer -> lowercase -> possessive stemmer -> domain synonyms ->
 * english stemmer, so "Jeans"/"jean", "T-Shirt"/"t shirt", "pants"/"trousers" all match.
 */
export const ITEMS_SETTINGS = {
  analysis: {
    filter: {
      english_possessive_stemmer: { type: 'stemmer', language: 'possessive_english' },
      apparel_synonyms: {
        type: 'synonym',
        synonyms: [
          'pants, trousers, chinos, bottoms',
          'tee, t-shirt, tshirt, tops',
          'coat, jacket, outerwear',
        ],
      },
      english_stemmer: { type: 'stemmer', language: 'english' },
    },
    analyzer: {
      apparel: {
        type: 'custom',
        tokenizer: 'standard',
        filter: ['lowercase', 'english_possessive_stemmer', 'apparel_synonyms', 'english_stemmer'],
      },
    },
  },
} as unknown as IndicesIndexSettings;

export const ITEMS_MAPPINGS = {
  properties: {
    id: { type: 'integer' },
    title: { type: 'text', analyzer: 'apparel', fields: { raw: { type: 'keyword' } } },
    category: { type: 'keyword' }, // Tops | Bottoms (mapped from the Chinese DB values)
    isNew: { type: 'boolean' },
    sort: { type: 'integer' },
    image: { type: 'keyword', index: false }, // display only, never queried
    suggest: { type: 'completion' }, // type-ahead suggestions
  },
} as unknown as MappingTypeMapping;

/**
 * Thin wrapper around the Elasticsearch client.
 * ES is a derived read model: when it is unavailable the API keeps serving,
 * search endpoints just report empty results — never block the main flow.
 */
@Injectable()
export class ElasticsearchProvider implements OnModuleInit {
  private readonly logger = new Logger(ElasticsearchProvider.name);
  readonly client = new Client({
    node: process.env.ELASTICSEARCH_URL || 'http://localhost:9200',
  });

  async onModuleInit() {
    try {
      const info = await this.client.info();
      this.logger.log(`Connected to Elasticsearch ${info.version?.number}`);
      await this.ensureIndex();
    } catch (err) {
      this.logger.warn(
        `Elasticsearch unavailable at startup (${(err as Error).message}); search endpoints will return empty results`,
      );
    }
  }

  /** Ping with a short timeout so request handlers never hang on a dead ES */
  async isAvailable(): Promise<boolean> {
    try {
      await this.client.ping({}, { requestTimeout: 1000 });
      return true;
    } catch {
      return false;
    }
  }

  /** Create the first concrete index and point the alias at it (idempotent) */
  private async ensureIndex() {
    const firstIndex = 'items_v1';
    const exists = await this.client.indices.exists({ index: firstIndex });
    if (!exists) {
      await this.client.indices.create({
        index: firstIndex,
        settings: ITEMS_SETTINGS,
        mappings: ITEMS_MAPPINGS,
      });
      this.logger.log(`Created index ${firstIndex}`);
    }
    const aliasExists = await this.client.indices.existsAlias({ name: ITEMS_ALIAS });
    if (!aliasExists) {
      await this.client.indices.putAlias({ index: firstIndex, name: ITEMS_ALIAS });
      this.logger.log(`Alias ${ITEMS_ALIAS} -> ${firstIndex}`);
    }
  }
}

import { Injectable } from '@nestjs/common';
import { ITEMS_ALIAS, ElasticsearchProvider } from './elasticsearch.provider';

export interface SearchParams {
  q?: string;
  category?: string; // Tops | Bottoms
  isNew?: string; // 'true' filters new arrivals
  sort?: string; // 'new' | undefined (relevance / default ordering)
  limit?: number;
  offset?: number;
}

/** Shape of the documents we index (see ItemIndexService.toDoc) */
interface ItemSource {
  title: string;
  category: string;
  isNew: boolean;
  image: string;
}

export interface SearchHit {
  id: number;
  title: string;
  category: string;
  isNew: boolean;
  image: string;
  highlight?: string;
}

export interface SearchResult {
  items: SearchHit[];
  total: number;
  took: number;
  available: boolean; // false = Elasticsearch is down, empty payload
}

@Injectable()
export class SearchService {
  constructor(private readonly es: ElasticsearchProvider) {}

  async search(params: SearchParams): Promise<SearchResult> {
    const start = Date.now();
    const empty: SearchResult = { items: [], total: 0, took: Date.now() - start, available: false };
    if (!(await this.es.isAvailable())) return empty;

    const q = (params.q || '').trim();
    const filter: Record<string, unknown>[] = [];
    if (params.category) filter.push({ term: { category: params.category } });
    if (params.isNew === 'true') filter.push({ term: { isNew: true } });

    const query: Record<string, unknown> = {
      bool: {
        must: q ? [{ multi_match: { query: q, fields: ['title^2'] } }] : [{ match_all: {} }],
        filter,
      },
    };

    const sort = params.sort === 'new' ? [{ id: 'desc' }] : undefined;

    const res = await this.es.client.search({
      index: ITEMS_ALIAS,
      query,
      sort,
      size: params.limit ?? 20,
      from: params.offset ?? 0,
      highlight: q ? { fields: { title: { number_of_fragments: 1 } } } : undefined,
    });

    return {
      items: res.hits.hits.map((hit) => {
        const src = (hit._source ?? {}) as Partial<ItemSource>;
        return {
          id: Number(hit._id),
          title: src.title ?? '',
          category: src.category ?? '',
          isNew: src.isNew ?? false,
          image: src.image ?? '',
          highlight: hit.highlight?.title?.[0],
        };
      }),
      total:
        typeof res.hits.total === 'number' ? res.hits.total : (res.hits.total?.value ?? 0),
      took: Date.now() - start,
      available: true,
    };
  }

  /** Type-ahead suggestions via the completion suggester */
  async suggest(q: string): Promise<{ suggestions: string[]; available: boolean }> {
    const kw = q.trim();
    if (!kw || !(await this.es.isAvailable())) return { suggestions: [], available: false };

    const res = await this.es.client.search({
      index: ITEMS_ALIAS,
      size: 0,
      suggest: {
        'item-suggest': {
          prefix: kw,
          completion: { field: 'suggest', skip_duplicates: true, size: 5 },
        },
      },
    });

    const options =
      (res.suggest as Record<string, { options?: { text?: string }[] }[] | undefined>)?.[
        'item-suggest'
      ]?.[0]?.options ?? [];
    return { suggestions: options.map((o) => o.text ?? ''), available: true };
  }
}

# Item Search (v0.3.0) — Technical Design

## 1. Goals

- Full-text search over item titles with an English analyzer
- Type-ahead suggestions, category / new-arrival filters, keyword highlighting
- Reliable DB → Elasticsearch synchronization with a rebuild fallback
- A demo corpus large enough to make search behavior visible

Non-goals: personalized ranking, faceted aggregation, multi-language (Chinese) analysis.

## 2. Architecture

```mermaid
flowchart TB
  subgraph Clients
    MP[WeChat Mini-Program<br/>search box]
    ADM[Admin Dashboard<br/>item CRUD / Rebuild Index]
  end

  subgraph NestJS
    AC[AdminController<br/>POST/PUT/DELETE items]
    SC[SearchController<br/>GET search / suggest]
    SS[SearchService<br/>query builder]
    IX[ItemIndexService<br/>doc mapping + idempotent upsert]
    POL[OutboxPoller]
    W[IndexWorker<br/>BullMQ consumer]
  end

  subgraph Storage
    DB[(SQLite / Prisma<br/>source of truth)]
    OB[(item_index_outbox)]
    Q[[BullMQ item-index<br/>Redis]]
    ES[(Elasticsearch<br/>derived read model)]
  end

  MP --> SC --> SS --> ES
  ADM --> AC
  AC -->|transaction| DB
  AC -->|same transaction| OB
  OB --> POL --> Q --> W
  W -->|re-read latest row| DB
  W -->|PUT _doc/id| ES
  ADM -. manual .-> IX --> DB
  IX --> ES
```

Key principle: **the database is the single source of truth; Elasticsearch is a derived, disposable read model.** A write never fails because ES is down.

## 3. Write path (eventual consistency)

```mermaid
sequenceDiagram
  participant A as Admin UI
  participant C as AdminController
  participant D as Prisma / SQLite
  participant O as Outbox table
  participant P as OutboxPoller
  participant Q as BullMQ item-index
  participant W as IndexWorker
  participant E as Elasticsearch

  A->>C: POST /admin/items
  C->>D: BEGIN
  C->>D: INSERT clothing_item
  C->>O: INSERT outbox(itemId, op=UPSERT)
  C->>D: COMMIT
  C-->>A: 201 Created
  Note over A,E: search visibility delayed by seconds (eventual consistency)
  P->>O: poll status=PENDING
  O-->>P: batch
  P->>Q: enqueue { itemId, op }
  Q->>W: deliver
  W->>D: SELECT latest row by id
  W->>E: PUT /items/_doc/{id}
  W->>O: status=DONE
  Note right of W: failure -> retry with backoff -> DEAD + alert
```

Why Outbox: writing the business row and the change event in **one transaction** makes "DB committed but event lost" impossible. Why re-read from DB in the worker: the queue carries only `itemId`, so out-of-order or duplicated jobs always write the latest state.

Deletes are handled as `op=DELETE` events (`DELETE /items/_doc/{id}`), never by scanning ES.

## 4. Read path

```mermaid
sequenceDiagram
  participant U as Mini-Program
  participant C as SearchController
  participant S as SearchService
  participant E as Elasticsearch

  U->>C: GET /items/search?q=jean&category=Bottoms&sort=new
  C->>S: build query
  S->>E: bool: must multi_match(title^2, title.synonyms) / filter term / highlight
  E-->>S: hits + highlight fragments
  S-->>U: { items, total, took }
  U->>C: GET /items/suggest?q=bl
  C->>E: completion suggester on `suggest`
  E-->>U: ["Blue Denim Jeans", "Light Blue Graphic T-Shirt"]
```

Client-side: 300 ms debounce, empty state, recent keywords in local storage.

## 5. Index design

Index name: `items_v1`, exposed through alias `items` (so a full rebuild can write `items_v2` and switch the alias atomically, zero downtime).

| Field | Type | Purpose |
|-------|------|---------|
| `id` | keyword (`_id` = DB primary key) | idempotent upsert |
| `title` | text, analyzer `apparel` | full-text search |
| `title.raw` | keyword | sorting / exact match |
| `category` | keyword | filter (`Tops` / `Bottoms`) |
| `isNew` | boolean | filter |
| `sort` | integer | default ordering |
| `image` | keyword (not indexed) | display only |
| `suggest` | completion | type-ahead |

Analyzer `apparel`: `standard` tokenizer → `lowercase` → `english_possessive_stemmer` → `apparel_synonyms` → `english_stemmer`.

Synonyms (apparel domain): `pants, trousers, chinos, bottoms`; `tee, t-shirt, tshirt, tops`; `coat, jacket, outerwear`.

Note: DB category values remain Chinese (`上衣` / `裤子`) for backward compatibility; they are mapped to `Tops` / `Bottoms` in `ItemIndexService`.

## 6. Demo corpus

`server/prisma/items.json` — ~50 items generated once, committed to the repo (no runtime AI calls, reproducible).

Deliberately includes analyzer test cases: singular/plural (`Jean` / `Jeans`, `Dress` / `Dresses`), hyphen variants (`T-Shirt` / `T Shirt`), synonyms (`Trousers`, `Pants`, `Chinos`), multi-word color/material combos (`Blue Denim`, `Dark Leather`), and a few long titles for highlighting.

Images reuse the 6 existing compressed files cyclically (`/static/clothes/{i % 6 + 1}.jpg`) — image variety does not affect search quality.

`seed.ts` reads `items.json` and uses `upsert` so existing try-on records are preserved (the current seed deletes them).

## 7. File layout

```
server/
├── prisma/
│   ├── items.json                     # demo corpus
│   ├── seed.ts                        # upsert-based seeding
│   └── schema.prisma                  # + ItemIndexOutbox model
├── src/
│   ├── search/
│   │   ├── search.module.ts
│   │   ├── search.controller.ts       # GET /items/search, /items/suggest
│   │   ├── search.service.ts          # query building
│   │   ├── elasticsearch.provider.ts  # client + index bootstrap
│   │   ├── item-index.service.ts      # doc mapping, upsert/delete, rebuild
│   │   ├── outbox.poller.ts           # pending -> queue
│   │   └── index.worker.ts            # BullMQ consumer
│   ├── admin/
│   │   └── admin.controller.ts        # emit outbox events on CRUD + rebuild endpoint
│   └── app.module.ts                  # import SearchModule
client/src/pages/search/               # search box + results
admin/src/pages/SearchSettings.tsx     # "Rebuild index" button (optional)
docs/design/item-search.md             # this document
```

## 8. API contract

| Method | Path | Response |
|--------|------|----------|
| GET | `/items/search?q=&category=&isNew=&sort=` | `{ items, total, took }` with `highlight` fragments |
| GET | `/items/suggest?q=` | `string[]` |
| POST | `/admin/items/reindex` | `{ indexed, took }` (full rebuild) |

## 9. Consistency & failure handling

| Risk | Mitigation |
|------|-----------|
| ES write fails / ES down | Outbox row stays PENDING, worker retries with backoff; admin write already succeeded |
| Repeated / out-of-order jobs | `PUT _doc/{id}` is idempotent; worker re-reads latest DB row |
| Poison job | after N attempts → `status=DEAD` + log/alert |
| Silent drift | scheduled reconciliation (DB ids vs ES ids) + manual Rebuild Index |
| Mapping change | build `items_v2`, reindex, atomically switch alias `items` |
| ES unavailable at boot | log warning, keep API up, serve empty results with a clear status |

## 10. Implementation phases

1. Corpus: `items.json` + `upsert` seed
2. ES bootstrap: provider, mapping, alias, health check
3. Sync: Outbox model, poller, `item-index` queue, worker
4. Query: search + suggest endpoints, filters, highlighting
5. Client: search page with debounce and suggestions
6. Admin: Rebuild Index action
7. Docs: README (`IK analyzer` → `English analyzer`), env vars, roadmap `[x]`

## 11. Environment

| Variable | Example |
|----------|---------|
| `ELASTICSEARCH_URL` | `http://localhost:9200` |
| `ELASTICSEARCH_INDEX` | `items_v1` |
| `REDIS_URL` | reused from v0.2.0 |

Local ES 8 requires `xpack.security.enabled: false` in `elasticsearch.yml` for password-free development.

## 12. Trade-offs

- **Outbox vs CDC**: CDC (binlog/Debezium) removes all instrumentation from app code but needs extra infrastructure. Outbox is intentionally chosen here: it reuses the existing Prisma + BullMQ stack and demonstrates the consistency pattern explicitly.
- **SQLite**: fine for local development; production would move to PostgreSQL (also unlocks native CDC).
- **Scale**: ~50 items is far below ES's useful threshold; the value of this work is the architecture (sync, idempotency, consistency, rebuild), not the data volume.

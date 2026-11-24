# ai-cloth

[English](./README.md) | [中文](./README.zh-CN.md)

AI-powered virtual try-on platform: full-stack implementation with NestJS + Prisma + AI image generation, featuring quota management, image pipelines and role-based admin.

## Project Structure

| Directory | Description | Tech Stack |
|-----------|-------------|------------|
| [`client/`](./client) | WeChat Mini-Program for the clothing mall | Taro + React + TypeScript |
| [`server/`](./server) | Backend API server | NestJS + Prisma + DashScope (AI try-on) |
| [`webapp/`](./webapp) | Admin dashboard | Vite + React |

## Features

- Virtual try-on powered by AI image generation (DashScope)
- Clothing mall with item management
- Quota management for try-on usage
- Role-based admin with JWT authentication
- Image upload & pipeline management

## Roadmap

> Current version: **v0.1.0 (MVP)** — see [Releases](../../releases) for the changelog.

- [x] **v0.1.0 — MVP**
  - Synchronous AI try-on, clothing mall, quota management, role-based admin

- [ ] **v0.2.0 — Async try-on (task queue)**
  - Replace the synchronous try-on (a single long HTTP request, up to 180s client timeout) with an async job pipeline:
    upload photo → return a `taskId` immediately → AI job queued in **BullMQ** (Redis) → client polls task status → result ready
  - Task state machine (`PENDING / PROCESSING / SUCCESS / FAILED`) persisted in the database
  - Automatic retry with backoff on AI failures, dead-letter handling for poisoned tasks
  - Concurrency control to protect the AI quota; per-user rate limiting
  - Motivation: eliminates long-lived HTTP connections, client timeouts and request-blocking under concurrency

- [ ] **v0.3.0 — Item search (Elasticsearch)**
  - Full-text search over item titles with the **IK analyzer** (Chinese-aware tokenization)
  - Filters (category, new arrivals) combined with multi-field sorted results
  - Keyword highlighting and type-ahead suggestions (`completion` suggester)
  - Database → Elasticsearch sync on every write, plus a **"rebuild index"** action in the admin panel as a fallback
  - Search keyword popularity tracking

- [ ] **v0.4.0 — Automated tests & CI**
  - Unit tests for service layer with **Jest** (mocking Prisma / DashScope clients)
  - E2E API tests with **supertest** covering auth, quota and try-on flows
  - **GitHub Actions** pipeline: lint + test + build on every pull request

## Getting Started

### Prerequisites

- Node.js >= 18
- npm

### 1. Server

```bash
cd server
npm install

# Configure environment
cp .env.example .env   # or create .env manually

# Database setup (SQLite by default, no extra installation needed)
npm run prisma:generate
npm run prisma:migrate
npm run prisma:seed

# Start dev server (default: http://localhost:3000)
npm run start:dev
```

### 2. Admin Dashboard (webapp)

```bash
cd webapp
npm install
npm run dev
```

### 3. Mini-Program (client)

```bash
cd client
npm install
npm run dev:weapp
```

Then open the project in **WeChat DevTools** (import the generated `dist/` output) and configure your `appid` in `client/project.config.json`.

## Configuration

The server reads the following environment variables from `server/.env` (see `.env.example` for a full template):

| Variable | Description |
|----------|-------------|
| `DATABASE_URL` | Prisma database connection string (SQLite by default: `file:./dev.db`) |
| `PORT` | Server port (default: `3000`) |
| `JWT_SECRET` | Secret key for JWT signing |
| `WX_APPID` / `WX_SECRET` | WeChat Mini-Program credentials (for `wx.login` code-to-openid exchange) |
| `WX_MOCK` | Dev debug mode: skip WeChat API and use a fake openid; must be `false` in production |
| `DASHSCOPE_API_KEY` | DashScope API key for AI try-on |
| `DASHSCOPE_TRYON_MODEL` | DashScope virtual try-on model name |
| `UPLOAD_DIR` | Upload / static assets directory |

> Note: changes to `.env` take effect after restarting the server.

## License

See [LICENSE](./LICENSE).

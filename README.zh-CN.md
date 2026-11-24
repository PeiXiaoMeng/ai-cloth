# ai-cloth

[English](./README.md) | [中文](./README.zh-CN.md)

AI 虚拟试穿平台：基于 NestJS + Prisma + AI 图片生成的全栈实现，包含配额管理、图片处理管线和基于角色的后台管理。

## 项目结构

| 目录 | 说明 | 技术栈 |
|------|------|--------|
| [`client/`](./client) | 衣服商城微信小程序 | Taro + React + TypeScript |
| [`server/`](./server) | 后端 API 服务 | NestJS + Prisma + 阿里百炼（AI 试穿） |
| [`webapp/`](./webapp) | 管理后台 | Vite + React |

## 功能特性

- 基于 AI 图片生成的虚拟试穿（阿里百炼 DashScope）
- 衣服商城与商品管理
- 试穿配额管理
- 基于 JWT 的角色权限管理
- 图片上传与处理管线

## 开发路线（Roadmap）

> 当前版本：**v0.1.0（MVP）** — 版本变更记录见 [Releases](../../releases)。

- [x] **v0.1.0 — MVP**
  - 同步 AI 试穿、衣服商城、配额管理、角色后台

- [ ] **v0.2.0 — 异步试穿（任务队列）**
  - 将长达数十秒的同步试穿请求（客户端超时上限 180s）重构为异步任务管线：
    上传照片 → 立即返回 `taskId` → AI 任务进入 **BullMQ** 队列（Redis）→ 客户端轮询任务状态 → 完成后获取结果
  - 任务状态机（`PENDING / PROCESSING / SUCCESS / FAILED`）持久化到数据库
  - AI 失败自动重试（指数退避），毒任务进入死信处理
  - 并发控制保护 AI 配额；按用户限流
  - 改造动机：消除长耗时 HTTP 连接，解决客户端超时与并发下的请求阻塞

- [ ] **v0.3.0 — 商品搜索（Elasticsearch）**
  - 基于 **IK 分词器**的商品标题全文搜索（支持中文分词）
  - 筛选条件（分类、新上）与多字段排序组合查询
  - 关键词高亮与输入联想（`completion` suggester）
  - 数据库 → Elasticsearch 写入时同步，管理后台提供**「重建索引」**兜底操作
  - 搜索关键词热度统计

- [ ] **v0.4.0 — 自动化测试与 CI**
  - 服务层单元测试，使用 **Jest**（mock 掉 Prisma / DashScope 客户端）
  - API 集成测试，使用 **supertest** 覆盖登录、配额、试穿全流程
  - **GitHub Actions** 流水线：每次 PR 自动执行 lint + test + build

## 快速开始

### 环境要求

- Node.js >= 18
- npm

### 1. 服务端（server）

```bash
cd server
npm install

# 配置环境变量
cp .env.example .env   # 或手动创建 .env

# 数据库初始化（默认使用 SQLite，无需额外安装数据库）
npm run prisma:generate
npm run prisma:migrate
npm run prisma:seed

# 启动开发服务（默认：http://localhost:3000）
npm run start:dev
```

### 2. 管理后台（webapp）

```bash
cd webapp
npm install
npm run dev
```

### 3. 小程序端（client）

```bash
cd client
npm install
npm run dev:weapp
```

然后使用**微信开发者工具**打开编译产物（`dist/` 目录），并在 `client/project.config.json` 中配置你的 `appid`。

## 配置说明

服务端从 `server/.env` 读取环境变量（完整模板见 `.env.example`）：

| 变量 | 说明 |
|------|------|
| `DATABASE_URL` | Prisma 数据库连接字符串（默认 SQLite：`file:./dev.db`） |
| `PORT` | 服务端口（默认 `3000`） |
| `JWT_SECRET` | JWT 签名密钥 |
| `WX_APPID` / `WX_SECRET` | 微信小程序配置（用于 `wx.login` code 换 openid） |
| `WX_MOCK` | 开发调试模式：`true` 时跳过微信接口（用假 openid 登录），上线前必须改回 `false` |
| `DASHSCOPE_API_KEY` | 阿里百炼 API Key（用于 AI 试穿） |
| `DASHSCOPE_TRYON_MODEL` | 阿里百炼虚拟试穿模型 |
| `UPLOAD_DIR` | 上传/静态资源目录 |

> 注意：修改 `.env` 后需要重启服务才能生效。

## 许可证

详见 [LICENSE](./LICENSE)。

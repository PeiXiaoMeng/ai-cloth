/**
 * Load-test data isolation: tagging, warm-up baseline and cleanup.
 * Test users are identified by the openid prefix "mock_lt-" (the load-test tag).
 */
import pkg from '@prisma/client';
import { existsSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';

const { PrismaClient } = pkg;
// Prisma reads server/.env itself; keep this in sync if the server uses a custom DATABASE_URL
process.env.DATABASE_URL ||= 'file:./dev.db';
const prisma = new PrismaClient();
const UPLOAD_DIR = join(process.cwd(), 'public', 'uploads');
export const TEST_PREFIX = 'mock_lt-';

/** Warm-up baseline so we can prove the run left no trace */
export async function baseline() {
  return {
    users: await prisma.user.count(),
    records: await prisma.tryOnRecord.count(),
  };
}

/** Delete uploaded files referenced by a test record */
function removeUploadedFiles(record) {
  for (const url of [record.inputImg, record.resultImg]) {
    if (!url) continue;
    const m = url.match(/\/static\/uploads\/(person|tryon)\/([^/?#]+)/);
    if (!m) continue;
    const file = join(UPLOAD_DIR, m[1], m[2]);
    try {
      if (existsSync(file)) unlinkSync(file);
    } catch {
      // file already removed or locked - not worth failing the run
    }
  }
}

async function deleteUsersByOpenidPrefix(prefix) {
  const users = await prisma.user.findMany({
    where: { openid: { startsWith: prefix } },
    select: { id: true },
  });
  const ids = users.map((u) => u.id);
  if (!ids.length) return 0;

  const records = await prisma.tryOnRecord.findMany({
    where: { userId: { in: ids } },
    select: { inputImg: true, resultImg: true },
  });
  // Order matters: TryOnRecord has an FK to User
  await prisma.tryOnRecord.deleteMany({ where: { userId: { in: ids } } });
  await prisma.user.deleteMany({ where: { id: { in: ids } } });
  for (const r of records) removeUploadedFiles(r);
  return ids.length;
}

/** Startup: remove leftovers from interrupted runs (makes the script idempotent) */
export async function pruneStale() {
  return deleteUsersByOpenidPrefix(TEST_PREFIX);
}

/** Teardown: remove everything created by this runId */
export async function cleanupRun(runId) {
  return deleteUsersByOpenidPrefix(`mock_${runId}`);
}

export async function disconnect() {
  await prisma.$disconnect();
}

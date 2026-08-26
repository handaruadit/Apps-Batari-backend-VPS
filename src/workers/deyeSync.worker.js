require("../config/env");
const db = require("../config/db");
const deyeService = require("../integrations/deye/deye.service");

const LOCK_ID = 1_743_393_921;
let timer = null;
let lockConnection = null;
let stopping = false;

const getInterval = () => {
  const interval = Number(process.env.DEYE_SYNC_INTERVAL_MS || 300000);
  if (!Number.isSafeInteger(interval) || interval < 10000) {
    throw new Error("DEYE_SYNC_INTERVAL_MS must be an integer >= 10000");
  }
  return interval;
};

const acquireWorkerLock = async () => {
  lockConnection = await db.client.acquireConnection();
  const result = await lockConnection.query(
    "SELECT pg_try_advisory_lock($1) AS acquired",
    [LOCK_ID],
  );
  return result.rows[0]?.acquired === true;
};

const runCycle = async () => {
  const startedAt = Date.now();
  const results = await deyeService.syncAllEnabled();
  const inserted = results.filter((item) => item.status === "inserted").length;
  const skipped = results.filter((item) => item.status === "skipped").length;
  const failed = results.filter((item) => item.status === "failed").length;
  console.log(`[deye-worker] completed inserted=${inserted} skipped=${skipped} failed=${failed} durationMs=${Date.now() - startedAt}`);
};

const schedule = async () => {
  if (stopping) return;
  try {
    await runCycle();
  } catch (error) {
    console.error(`[deye-worker] cycle failed: ${error.message}`);
  }
  if (!stopping) timer = setTimeout(schedule, getInterval());
};

const shutdown = async (signal) => {
  if (stopping) return;
  stopping = true;
  if (timer) clearTimeout(timer);
  if (lockConnection) {
    await lockConnection.query("SELECT pg_advisory_unlock($1)", [LOCK_ID]);
    await db.client.releaseConnection(lockConnection);
  }
  await db.destroy();
  console.log(`[deye-worker] stopped signal=${signal}`);
};

const start = async () => {
  if (process.env.DEYE_SYNC_ENABLED !== "true") {
    console.log("[deye-worker] disabled by DEYE_SYNC_ENABLED");
    return;
  }
  getInterval();
  if (!(await acquireWorkerLock())) {
    throw new Error("Another Deye worker already holds the production lock");
  }
  await schedule();
};

process.once("SIGINT", () => shutdown("SIGINT"));
process.once("SIGTERM", () => shutdown("SIGTERM"));

if (require.main === module) {
  start().catch(async (error) => {
    console.error(`[deye-worker] startup failed: ${error.message}`);
    await shutdown("startup-error");
    process.exitCode = 1;
  });
}

module.exports = { getInterval, runCycle, start };

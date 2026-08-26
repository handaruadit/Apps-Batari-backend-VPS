require("../src/config/env");
const db = require("../src/config/db");
const deyeService = require("../src/integrations/deye/deye.service");

const run = async () => {
  await deyeService.testAuthentication();
  const requestedStationId = Number(process.env.DEYE_SYNC_STATION_ID);
  const sync = Number.isSafeInteger(requestedStationId) && requestedStationId > 0
    ? async () => [await deyeService.syncStationOnce(requestedStationId)]
    : () => deyeService.syncAllEnabled();

  console.log(
    `[deye-once] authentication successful; scope=${requestedStationId || "all-enabled"}`,
  );

  const first = await sync();
  const firstSummary = {
    total: first.length,
    inserted: first.filter((item) => item.status === "inserted").length,
    skipped: first.filter((item) => item.status === "skipped").length,
    failed: first.filter((item) => item.status === "failed").length,
    rows: first.reduce((sum, item) => sum + (item.rows?.length || 0), 0),
  };
  console.log(`[deye-once] first sync ${JSON.stringify(firstSummary)}`);

  const second = await sync();
  const duplicateSummary = {
    total: second.length,
    inserted: second.filter((item) => item.status === "inserted").length,
    skipped: second.filter((item) => item.status === "skipped").length,
    failed: second.filter((item) => item.status === "failed").length,
  };
  console.log(`[deye-once] second sync ${JSON.stringify(duplicateSummary)}`);

  if (firstSummary.failed || duplicateSummary.failed) {
    throw new Error("One or more Deye stations failed to synchronize");
  }
  // A second request may legitimately receive a newer Deye source timestamp.
  // Equal/older timestamps are reported as skipped by the repository transaction.
};

run()
  .catch((error) => {
    console.error(`[deye-once] failed: ${error.message}`);
    process.exitCode = 1;
  })
  .finally(() => db.destroy());

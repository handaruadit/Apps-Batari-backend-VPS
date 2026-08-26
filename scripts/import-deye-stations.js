require("../src/config/env");

const db = require("../src/config/db");
const deyeService = require("../src/integrations/deye/deye.service");

const apply = process.argv.includes("--apply");

const resolveOwnerUserId = async () => {
  if (process.env.DEYE_OWNER_USER_ID) return process.env.DEYE_OWNER_USER_ID;

  const users = await db("users").select("id").orderBy("created_at", "asc");
  if (users.length !== 1) {
    throw new Error("DEYE_OWNER_USER_ID is required unless the database has exactly one user");
  }
  return users[0].id;
};

const printPreview = (preview) => {
  console.log("Deye Plant Mapping Preview\n");
  console.log(JSON.stringify({ dryRun: true, ...preview.summary }, null, 2));

  preview.stations.forEach((item) => {
    console.log(
      `[${item.action.toUpperCase()}] ${item.station.stationId} ${item.station.stationName} devices=${item.devices.length}`,
    );
    if (item.plantId) console.log(`  plantId=${item.plantId}`);
    if (item.candidatePlants.length) {
      console.log(`  candidates=${JSON.stringify(item.candidatePlants)}`);
    }
    if (item.error) console.log(`  error=${item.error}`);
  });
};

const run = async () => {
  const preview = await deyeService.previewStationImport();
  printPreview(preview);

  if (!apply) {
    console.log("\nNo database writes performed. Add --apply only after reviewing this preview.");
    return;
  }

  if (preview.summary.failed || preview.summary.candidate || preview.summary.ambiguous) {
    throw new Error("Deye import blocked because preview contains failures or uncertain mappings");
  }

  const ownerUserId = await resolveOwnerUserId();
  const result = await deyeService.importStations({
    ownerUserId,
    dryRun: false,
    preview,
  });
  const summary = result.results.reduce(
    (totals, item) => ({
      plantsCreated: totals.plantsCreated + (item.plantStatus === "created" ? 1 : 0),
      plantsExisting: totals.plantsExisting + (item.plantStatus === "existing" ? 1 : 0),
      devicesInserted: totals.devicesInserted + (item.devicesInserted || 0),
      devicesUpdated: totals.devicesUpdated + (item.devicesUpdated || 0),
    }),
    { plantsCreated: 0, plantsExisting: 0, devicesInserted: 0, devicesUpdated: 0 },
  );

  console.log("\nDeye Import Result");
  console.log(JSON.stringify({
    total: result.total,
    success: result.success,
    failed: result.failed,
    ...summary,
    deleted: 0,
  }, null, 2));
  if (result.failed) process.exitCode = 1;
};

run()
  .catch((error) => {
    console.error(`DEYE_IMPORT_FAILED: ${error.message}`);
    process.exitCode = 1;
  })
  .finally(() => db.destroy());

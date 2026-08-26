require("../src/config/env");
const db = require("../src/config/db");

const REQUIRED_TABLES = [
  "plants",
  "plant_devices",
  "registered_devices",
  "device_data",
  "deye_integrations",
];
const REQUIRED_DEYE_ENV = [
  "DEYE_BASE_URL",
  "DEYE_APP_ID",
  "DEYE_APP_SECRET",
  "DEYE_EMAIL",
  "DEYE_PASSWORD_SHA256",
  "DEYE_STATION_ID",
  "DEYE_PLANT_ID",
];

const run = async () => {
  const database = await db.raw(
    "SELECT current_database() AS name, current_setting('TimeZone') AS timezone",
  );
  const tableRows = await db("information_schema.tables")
    .where({ table_schema: "public" })
    .whereIn("table_name", REQUIRED_TABLES)
    .select("table_name");
  const tables = tableRows.map((row) => row.table_name).sort();
  const missingTables = REQUIRED_TABLES.filter((table) => !tables.includes(table));
  const missingEnvironment = REQUIRED_DEYE_ENV.filter((key) => !process.env[key]);
  const plants = await db("plants").select("id", "name").orderBy("id", "asc");
  const integration = process.env.DEYE_STATION_ID
    ? await db("deye_integrations")
        .where({ station_id: process.env.DEYE_STATION_ID })
        .first("plant_id", "station_id", "source_device_id", "enabled", "last_source_timestamp", "last_synced_at")
    : null;

  console.log(JSON.stringify({
    connected: true,
    database: database.rows[0].name,
    databaseTimezone: database.rows[0].timezone,
    tables,
    missingTables,
    missingEnvironment,
    plants,
    integration: integration || null,
  }, null, 2));

  if (missingTables.length || missingEnvironment.length) {
    process.exitCode = 1;
  }
};

run()
  .catch((error) => {
    console.error(`DEYE_READINESS_FAILED: ${error.message}`);
    process.exitCode = 1;
  })
  .finally(() => db.destroy());

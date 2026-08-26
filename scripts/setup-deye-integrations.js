require("../src/config/env");
const fs = require("node:fs/promises");
const path = require("node:path");
const db = require("../src/config/db");

const run = async () => {
  const sql = await fs.readFile(
    path.join(__dirname, "setup-deye-integrations.sql"),
    "utf8",
  );
  await db.raw(sql);
  console.log("Deye integration schema is ready.");
};

run()
  .catch((error) => {
    console.error(`DEYE_SCHEMA_SETUP_FAILED: ${error.message}`);
    process.exitCode = 1;
  })
  .finally(() => db.destroy());

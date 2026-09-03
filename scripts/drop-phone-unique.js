require("../src/config/env");
const db = require("../src/config/db");

async function run() {
  try {
    await db.raw("ALTER TABLE users DROP CONSTRAINT IF EXISTS users_phone_key;");
    await db.raw("ALTER TABLE users DROP CONSTRAINT IF EXISTS users_phone_unique;");
    console.log("✅ SUKSES: Aturan unik nomor telepon berhasil dilepas di database!");
  } catch (err) {
    console.error("❌ Gagal melepas constraint:", err.message);
  } finally {
    await db.destroy();
  }
}

run();

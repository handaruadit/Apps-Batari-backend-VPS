require("../src/config/env");

const db = require("../src/config/db");
const { auditAndSyncDeyePlants } = require("../src/services/plantAuditSync.service");

async function main() {
  console.log("================================================================================");
  console.log(" 🔍 AUDIT & SINKRONISASI STASIUN DEYE CLOUD KE POSTGRESQL (BYSENSE / BATARI)");
  console.log("================================================================================");

  try {
    const result = await auditAndSyncDeyePlants();

    console.log("\n================================================================================");
    console.log(" 📊 RINGKASAN HASIL AUDIT:");
    console.log(` - Total Stasiun Deye Cloud API: ${result.totalDeye}`);
    console.log(` - Sudah Terdaftar Sebelumnya  : ${result.verifiedExisting}`);
    console.log(` - Baru Saja Disinkronkan      : ${result.newlySynced}`);
    console.log("================================================================================");

    if (Array.isArray(result.details) && result.details.length > 0) {
      console.log("\n📋 Rincian Seluruh Stasiun:");
      result.details.forEach((item, index) => {
        const flag = item.status === "newly_synced" ? "✨ [BARU]" : "✓ [OK]";
        console.log(` ${index + 1}. ${flag} ID: ${item.stationId} | Nama: ${item.stationName} -> PostgreSQL Plant ID: ${item.plantId}`);
      });
    }

    console.log("\n✅ Semua stasiun Deye Cloud kini 100% terhubung ke PostgreSQL dengan akses Super Admin Owner!");
  } catch (err) {
    console.error("\n❌ Terjadi kesalahan saat audit:", err.message);
  } finally {
    await db.destroy();
    process.exit(0);
  }
}

main();

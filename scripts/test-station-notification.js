//===== (Imports) ======
require("../src/config/env");
const db = require("../src/config/db");

//===== (Main Simulation Script) ======
async function main() {
  const mode = process.argv[2] || "offline"; // 'offline', 'online', or 'toggle'

  console.log(`\n========================================`);
  console.log(`📡 BATARI STATION NOTIFICATION TEST SCRIPT`);
  console.log(`========================================\n`);

  try {
    // 1. Find the first available plant
    const plant = await db("plants").first();
    if (!plant) {
      console.error("❌ Tidak ada plant yang terdaftar di database.");
      process.exit(1);
    }

    console.log(`📍 Target Plant: [ID: ${plant.id}] "${plant.name}"`);

    // 2. Find associated plant device
    const plantDevice = await db("plant_devices")
      .where({ plant_id: plant.id })
      .first();
    const deviceId = plantDevice?.device_id || `DEYE_SIM_${plant.id}`;

    console.log(`🔌 Device ID: ${deviceId}`);

    if (mode === "offline") {
      // Simulate Offline by setting last timestamp to 30 minutes ago
      const thirtyMinutesAgo = new Date(Date.now() - 30 * 60 * 1000);
      await db("plants").where({ id: plant.id }).update({
        updated_at: thirtyMinutesAgo,
      });

      console.log(`\n🚨 SIMULASI OFFLINE BERHASIL!`);
      console.log(`Timestamp station diubah menjadi: ${thirtyMinutesAgo.toLocaleTimeString()}`);
      console.log(`👉 Buka aplikasi Batari di HP, station akan terdeteksi OFFLINE dan memicu notifikasi:`);
      console.log(`   "🚨 Station Offline: ${plant.name}"`);
    } else if (mode === "online") {
      // Simulate Online by inserting/updating fresh timestamp to NOW
      const now = new Date();
      await db("plants").where({ id: plant.id }).update({
        updated_at: now,
      });

      console.log(`\n✅ SIMULASI ONLINE BERHASIL!`);
      console.log(`Timestamp station diubah menjadi: ${now.toLocaleTimeString()}`);
      console.log(`👉 Buka aplikasi Batari di HP, station akan terdeteksi ONLINE dan memicu notifikasi:`);
      console.log(`   "✅ Station Online: ${plant.name}"`);
    } else {
      console.log(`\nℹ️ Penggunaan: node scripts/test-station-notification.js [offline|online]`);
    }
  } catch (error) {
    console.error("❌ Error running test script:", error.message);
  } finally {
    await db.destroy();
    console.log(`\n========================================\n`);
  }
}

main();

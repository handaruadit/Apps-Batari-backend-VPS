/**
 * ============================================================
 * Batari Plant Telemetry Simulator (Standalone CLI Tool)
 * ============================================================
 */

require("dotenv").config();
const db = require("../src/config/db");

// Parsing CLI Arguments
const args = process.argv.slice(2);
const getArg = (flag, defaultValue) => {
  const index = args.indexOf(flag);
  if (index !== -1 && args[index + 1]) {
    return args[index + 1];
  }
  return defaultValue;
};
const hasFlag = (flag) => args.includes(flag);

const TARGET_PLANT_ID = getArg("--plantId", null);
const TARGET_PLANT_NAME = getArg("--plantName", null);
const IS_ALL = hasFlag("--all") || (!TARGET_PLANT_ID && !TARGET_PLANT_NAME);
const IS_LIVE = hasFlag("--live");
const IS_CLEAN = hasFlag("--clean");

const STEP_MINUTES = 5;

// Helper math functions
const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
const randomBetween = (min, max) => min + (max - min) * Math.random();
const round2 = (v) => Math.round(v * 100) / 100;
const pad2 = (n) => String(n).padStart(2, "0");

// Get Jakarta Date Parts
const getJakartaParts = (date = new Date()) => {
  const jkt = new Date(date.getTime() + 7 * 60 * 60 * 1000);
  return {
    year: jkt.getUTCFullYear(),
    month: jkt.getUTCMonth() + 1,
    day: jkt.getUTCDate(),
    hour: jkt.getUTCHours(),
    minute: jkt.getUTCMinutes(),
    second: jkt.getUTCSeconds(),
  };
};

const formatLocalTimestamp = ({ year, month, day, hour = 0, minute = 0, second = 0 }) =>
  `${year}-${pad2(month)}-${pad2(day)} ${pad2(hour)}:${pad2(minute)}:${pad2(second)}`;

/**
 * Menghitung nilai PV, Load, Battery, Grid, SoC berdasarkan jam
 */
const calculateMetricsForHour = (hourDecimal, seedOffset = 0) => {
  const isDaylight = hourDecimal >= 6 && hourDecimal <= 18;
  const daylightCurve = isDaylight ? Math.sin(((hourDecimal - 6) / 12) * Math.PI) : 0;

  const morningPeak = hourDecimal >= 6 && hourDecimal <= 8.5 ? Math.sin(((hourDecimal - 6) / 2.5) * Math.PI) : 0;
  const eveningPeak = hourDecimal >= 18 && hourDecimal <= 22 ? Math.sin(((hourDecimal - 18) / 4) * Math.PI) : 0;
  const baseLoad = 0.65 + randomBetween(-0.05, 0.05) + seedOffset * 0.1;
  const load = clamp(baseLoad + morningPeak * 1.2 + eveningPeak * 1.8 + randomBetween(-0.1, 0.1), 0.4, 4.2);

  let pv = 0;
  if (daylightCurve > 0) {
    const cloudFactor = randomBetween(0.9, 1.05);
    pv = clamp(daylightCurve * 5.4 * cloudFactor + seedOffset * 0.2, 0, 6.0);
  }

  let battery = 0;
  let soc = 50;

  if (daylightCurve > 0.15) {
    battery = clamp(daylightCurve * 2.3 + randomBetween(-0.1, 0.2), 0.3, 2.6);
    soc = clamp(40 + daylightCurve * 55 + randomBetween(-1, 1), 40, 98);
  } else if (hourDecimal >= 18 || hourDecimal < 6) {
    battery = -clamp(load * 0.75 + randomBetween(-0.1, 0.1), 0.3, 2.2);
    const nightProgress = hourDecimal >= 18 ? (hourDecimal - 18) / 12 : (hourDecimal + 6) / 12;
    soc = clamp(95 - nightProgress * 65 + randomBetween(-1, 1), 20, 95);
  } else {
    battery = randomBetween(-0.2, 0.3);
    soc = clamp(35 + randomBetween(-1, 1), 25, 45);
  }

  const netGrid = load - pv - (battery < 0 ? Math.abs(battery) : -battery);
  const grid = clamp(netGrid + randomBetween(-0.05, 0.05), -3.0, 4.5);

  return {
    pv: round2(pv),
    load: round2(load),
    battery: round2(battery),
    grid: round2(grid),
    soc: round2(soc),
  };
};

/**
 * Main Executable
 */
const main = async () => {
  try {
    console.log("\n==================================================");
    console.log("⚡ BATARI PLANT TELEMETRY SIMULATOR (CLI)");
    console.log("==================================================");

    // 1. Ambil target plants
    let targetPlants = [];
    if (TARGET_PLANT_ID) {
      targetPlants = await db("plants").where({ id: TARGET_PLANT_ID });
    } else if (TARGET_PLANT_NAME) {
      targetPlants = await db("plants").whereRaw("name ILIKE ?", [`%${TARGET_PLANT_NAME}%`]);
    } else {
      targetPlants = await db("plants").orderBy("id", "asc");
    }

    if (targetPlants.length === 0) {
      console.error(`❌ Tidak ada plant yang ditemukan.`);
      process.exit(1);
    }

    console.log(`📍 Menargetkan ${targetPlants.length} Plant: ${targetPlants.map(p => `[ID:${p.id}] ${p.name}`).join(", ")}`);

    // 2. Mode Clean
    if (IS_CLEAN) {
      console.log(`\n🧹 Menghapus seluruh data simulasi...`);
      for (const plant of targetPlants) {
        const deviceId = `INVERTER_SIM_${plant.id}`;
        await db("device_data").where({ device_id: deviceId }).del();
        await db("plant_devices").where({ device_id: deviceId }).del();
      }
      console.log(`✅ Berhasil membersihkan seluruh data simulasi.`);
      process.exit(0);
    }

    // 3. Pastikan relasi device untuk setiap plant
    const devicesToSimulate = [];
    for (const plant of targetPlants) {
      const deviceId = `INVERTER_SIM_${plant.id}`;
      const existingLink = await db("plant_devices").where({ device_id: deviceId }).first();

      if (!existingLink) {
        await db("plant_devices").insert({ device_id: deviceId, plant_id: plant.id });
      } else if (Number(existingLink.plant_id) !== Number(plant.id)) {
        await db("plant_devices").where({ device_id: deviceId }).update({ plant_id: plant.id });
      }
      devicesToSimulate.push({ plant, deviceId });
    }

    // 4. Backfill Data Hari Ini
    const nowJkt = getJakartaParts();
    console.log(`\n📊 Mengisi riwayat data hari ini (${nowJkt.year}-${pad2(nowJkt.month)}-${pad2(nowJkt.day)} 00:00 s/d ${pad2(nowJkt.hour)}:${pad2(nowJkt.minute)})...`);

    const startOfToday = `${nowJkt.year}-${pad2(nowJkt.month)}-${pad2(nowJkt.day)} 00:00:00`;
    const allRows = [];
    const maxMinutes = nowJkt.hour * 60 + nowJkt.minute;

    for (const { plant, deviceId } of devicesToSimulate) {
      // Hapus data lama hari ini untuk device ini
      await db("device_data")
        .where({ device_id: deviceId })
        .andWhere("created_at", ">=", startOfToday)
        .del();

      for (let m = 0; m <= maxMinutes; m += STEP_MINUTES) {
        const h = Math.floor(m / 60);
        const min = m % 60;
        const hourDecimal = h + min / 60;
        const metrics = calculateMetricsForHour(hourDecimal, Number(plant.id) % 3);
        const ts = formatLocalTimestamp({
          year: nowJkt.year,
          month: nowJkt.month,
          day: nowJkt.day,
          hour: h,
          minute: min,
          second: 0,
        });

        allRows.push(
          { device_id: deviceId, category: "pv", type: "chargePower", value: metrics.pv, created_at: ts },
          { device_id: deviceId, category: "pv", type: "power", value: metrics.pv, created_at: ts },
          { device_id: deviceId, category: "out", type: "power", value: metrics.load, created_at: ts },
          { device_id: deviceId, category: "out", type: "vaPower", value: round2(metrics.load * 1.05), created_at: ts },
          { device_id: deviceId, category: "baterai", type: "power", value: metrics.battery, created_at: ts },
          { device_id: deviceId, category: "baterai", type: "soc", value: metrics.soc, created_at: ts },
          { device_id: deviceId, category: "grid", type: "power", value: metrics.grid, created_at: ts }
        );
      }
    }

    // Batch insert
    const chunkSize = 250;
    for (let i = 0; i < allRows.length; i += chunkSize) {
      const chunk = allRows.slice(i, i + chunkSize);
      await db("device_data").insert(chunk);
    }

    console.log(`✅ Berhasil memasukkan total ${allRows.length} titik telemetri ke database.`);

    const sampleMetrics = calculateMetricsForHour(nowJkt.hour + nowJkt.minute / 60);
    console.log(`\n📈 Telemetri Saat Ini (${pad2(nowJkt.hour)}:${pad2(nowJkt.minute)} WIB):`);
    console.log(`   ☀️  PV (Solar)   : ${sampleMetrics.pv} kW`);
    console.log(`   💡 Load (Rumah) : ${sampleMetrics.load} kW`);
    console.log(`   🔋 Baterai      : ${sampleMetrics.battery} kW (SoC: ${sampleMetrics.soc}%)`);
    console.log(`   ⚡ Grid (PLN)   : ${sampleMetrics.grid} kW`);

    if (IS_LIVE) {
      console.log("\n🔴 [LIVE MODE AKTIF] Mengupdate telemetri setiap 5 detik (Tekan Ctrl+C untuk stop)...");
      
      setInterval(async () => {
        const curJkt = getJakartaParts();
        const curHourDec = curJkt.hour + curJkt.minute / 60 + curJkt.second / 3600;
        const liveTs = formatLocalTimestamp(curJkt);
        const liveRows = [];

        for (const { plant, deviceId } of devicesToSimulate) {
          const liveMetrics = calculateMetricsForHour(curHourDec, Number(plant.id) % 3);
          liveRows.push(
            { device_id: deviceId, category: "pv", type: "chargePower", value: liveMetrics.pv, created_at: liveTs },
            { device_id: deviceId, category: "pv", type: "power", value: liveMetrics.pv, created_at: liveTs },
            { device_id: deviceId, category: "out", type: "power", value: liveMetrics.load, created_at: liveTs },
            { device_id: deviceId, category: "out", type: "vaPower", value: round2(liveMetrics.load * 1.05), created_at: liveTs },
            { device_id: deviceId, category: "baterai", type: "power", value: liveMetrics.battery, created_at: liveTs },
            { device_id: deviceId, category: "baterai", type: "soc", value: liveMetrics.soc, created_at: liveTs },
            { device_id: deviceId, category: "grid", type: "power", value: liveMetrics.grid, created_at: liveTs }
          );
        }

        try {
          await db("device_data").insert(liveRows);
          const timeStr = `${pad2(curJkt.hour)}:${pad2(curJkt.minute)}:${pad2(curJkt.second)}`;
          console.log(`[${timeStr}] Live data updated for ${devicesToSimulate.length} plant(s)`);
        } catch (err) {
          console.error("Gagal insert live data:", err.message);
        }
      }, 5000);
    } else {
      console.log("\n🎉 Selesai! Buka aplikasi Batari di HP Anda sekarang dan buka plant mana saja untuk melihat hasilnya.");
      process.exit(0);
    }
  } catch (error) {
    console.error("❌ Error:", error);
    process.exit(1);
  }
};

main();

/**
 * ============================================================
 * Batari VPS Rooftop Live Telemetry Streamer
 * ============================================================
 * 
 * Script ini mengirimkan telemetri langsung ke backend VPS:
 *   - Target Plant : "rooftop" (Plant ID: 5)
 *   - Device ID    : "INVERTER_01"
 *   - Endpoint     : http://89.116.33.75:3001/api/data/manual/send
 */

const API_URL = "http://89.116.33.75:3001/api/data/manual/send";
const PLANT_NAME = "rooftop";
const DEVICE_ID = "INVERTER_01";
const INTERVAL_MS = 5000;

// Helper math
const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
const randomBetween = (min, max) => min + (max - min) * Math.random();
const round2 = (v) => Math.round(v * 100) / 100;
const pad2 = (n) => String(n).padStart(2, "0");

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

/**
 * Menghitung metrik realistis
 */
const calculateMetrics = (hourDecimal) => {
  const isDaylight = hourDecimal >= 6 && hourDecimal <= 18;
  const daylightCurve = isDaylight ? Math.sin(((hourDecimal - 6) / 12) * Math.PI) : 0;

  const morningPeak = hourDecimal >= 6 && hourDecimal <= 8.5 ? Math.sin(((hourDecimal - 6) / 2.5) * Math.PI) : 0;
  const eveningPeak = hourDecimal >= 18 && hourDecimal <= 22 ? Math.sin(((hourDecimal - 18) / 4) * Math.PI) : 0;
  const baseLoad = 0.8 + randomBetween(-0.05, 0.05);
  const load = clamp(baseLoad + morningPeak * 1.2 + eveningPeak * 1.8 + randomBetween(-0.08, 0.08), 0.5, 4.2);
  const upsLoad = clamp(load + 0.15 + randomBetween(0.05, 0.2), 0.6, 4.5);

  let pv = 0;
  if (daylightCurve > 0) {
    const cloud = randomBetween(0.92, 1.05);
    pv = clamp(daylightCurve * 5.4 * cloud, 0, 5.8);
  }

  let battery = 0;
  let charge = 0;
  if (daylightCurve > 0.15) {
    battery = clamp(daylightCurve * 2.2 + randomBetween(-0.05, 0.1), 0.2, 2.5);
    charge = battery;
  } else if (hourDecimal >= 18 || hourDecimal < 6) {
    battery = -clamp(load * 0.7 + randomBetween(-0.05, 0.05), 0.3, 2.0);
    charge = 0;
  } else {
    battery = randomBetween(-0.1, 0.1);
    charge = 0;
  }

  const netGrid = load - pv - (battery < 0 ? Math.abs(battery) : -battery);
  const grid = clamp(netGrid + randomBetween(-0.05, 0.05), -2.5, 4.0);

  return {
    pv: round2(pv),
    production: round2(pv),
    pvGenerate: round2(pv),
    load: round2(load),
    upsLoad: round2(upsLoad),
    battery: round2(battery),
    charge: round2(charge),
    grid: round2(grid),
    export: round2(Math.max(0, -grid)),
  };
};

const sendPayload = async (metrics, timeStr = null) => {
  const body = {
    plantName: PLANT_NAME,
    deviceId: DEVICE_ID,
    ...metrics,
  };
  if (timeStr) {
    body.time = timeStr;
  }

  const res = await fetch(API_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  return await res.json();
};

const main = async () => {
  console.log("==================================================");
  console.log("⚡ BATARI VPS TELEMETRY STREAMER");
  console.log("==================================================");
  console.log(`📍 Plant  : "${PLANT_NAME}"`);
  console.log(`🔌 Device : "${DEVICE_ID}"`);
  console.log(`🌐 Server : ${API_URL}\n`);

  // 1. Backfill data hari ini
  const now = getJakartaParts();
  console.log(`📊 Backfill riwayat hari ini (${pad2(now.hour)}:${pad2(now.minute)})...`);

  const maxMinutes = now.hour * 60 + now.minute;
  let count = 0;

  for (let m = 0; m <= maxMinutes; m += 15) {
    const h = Math.floor(m / 60);
    const min = m % 60;
    const hourDec = h + min / 60;
    const mData = calculateMetrics(hourDec);
    const timeStr = `${pad2(h)}:${pad2(min)}:00`;

    try {
      await sendPayload(mData, timeStr);
      count++;
    } catch (e) {
      // ignore backfill drop
    }
  }
  console.log(`✅ Sukses mengisi ${count} titik riwayat hari ini.\n`);

  // 2. Stream Realtime Loop
  console.log("🔴 [STREAMING AKTIF] Mengirim telemetri realtime setiap 5 detik...");

  const runLive = async () => {
    const jkt = getJakartaParts();
    const hourDec = jkt.hour + jkt.minute / 60 + jkt.second / 3600;
    const metrics = calculateMetrics(hourDec);
    const timeStr = `${pad2(jkt.hour)}:${pad2(jkt.minute)}:${pad2(jkt.second)}`;

    try {
      const resp = await sendPayload(metrics);
      if (resp.status === "success") {
        console.log(`[${timeStr}] ☀️ PV: ${metrics.pv}kW | 💡 Load: ${metrics.load}kW | 🔋 Bat: ${metrics.battery}kW | ⚡ Grid: ${metrics.grid}kW`);
      } else {
        console.warn(`[${timeStr}] Response:`, resp.message);
      }
    } catch (err) {
      console.error(`[${timeStr}] Network error:`, err.message);
    }
  };

  // Run immediate first tick
  await runLive();

  // Run interval
  setInterval(runLive, INTERVAL_MS);
};

main();

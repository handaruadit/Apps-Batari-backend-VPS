const db = require("../config/db");
const { getIO } = require("../sockets/socket");
const { saveDeviceData } = require("./data.service");

const DEFAULT_PLANT_NAME = process.env.MOCK_PLANT_NAME || "Plant Testing";
const TIME_ONLY_REGEX = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/;
const AUTO_SEND_INTERVAL_MS = Number(process.env.MOCK_PLANT_INTERVAL_MS || 300000);

let autoSenderStarted = false;
let autoSenderState = null;
let autoSenderRunning = false;

const round2 = (value) => Number(Number(value).toFixed(2));
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const randomBetween = (min, max, random = Math.random) =>
  min + (max - min) * random();

const parseRequestedTimestamp = ({
  timestamp,
  createdAt,
  time,
  jam,
  date,
} = {}) => {
  const rawValue = timestamp ?? createdAt ?? time ?? jam;

  if (rawValue === undefined || rawValue === null || rawValue === "") {
    return new Date();
  }

  if (rawValue instanceof Date) {
    if (Number.isNaN(rawValue.getTime())) {
      throw new Error("Invalid_Timestamp");
    }

    return rawValue;
  }

  if (typeof rawValue === "number") {
    const parsedFromNumber = new Date(rawValue);

    if (Number.isNaN(parsedFromNumber.getTime())) {
      throw new Error("Invalid_Timestamp");
    }

    return parsedFromNumber;
  }

  const rawText = String(rawValue).trim();
  const timeOnlyMatch = rawText.match(TIME_ONLY_REGEX);

  if (timeOnlyMatch) {
    const [, hourText, minuteText, secondText = "00"] = timeOnlyMatch;
    const hour = Number(hourText);
    const minute = Number(minuteText);
    const second = Number(secondText);

    if (
      hour > 23 ||
      minute > 59 ||
      second > 59 ||
      hour < 0 ||
      minute < 0 ||
      second < 0
    ) {
      throw new Error("Invalid_Timestamp");
    }

    const baseDate = date
      ? new Date(`${String(date).trim()}T00:00:00`)
      : new Date();

    if (Number.isNaN(baseDate.getTime())) {
      throw new Error("Invalid_Timestamp");
    }

    baseDate.setHours(hour, minute, second, 0);
    return baseDate;
  }

  const parsed = new Date(rawText);

  if (Number.isNaN(parsed.getTime())) {
    throw new Error("Invalid_Timestamp");
  }

  return parsed;
};

const getTargetPlant = async ({ plantId, plantName = DEFAULT_PLANT_NAME } = {}) => {
  if (plantId !== undefined && plantId !== null && plantId !== "") {
    const plant = await db("plants").where({ id: plantId }).first();

    if (!plant) {
      throw new Error("Plant_Not_Found");
    }

    return plant;
  }

  const exactMatch = await db("plants")
    .whereRaw("LOWER(name) = LOWER(?)", [plantName])
    .first();

  if (exactMatch) {
    return exactMatch;
  }

  const partialMatch = await db("plants")
    .whereRaw("name ILIKE ?", [`%${plantName}%`])
    .orderBy("id", "asc")
    .first();

  if (partialMatch) {
    return partialMatch;
  }

  if (String(plantName).toLowerCase() === "testing") {
    throw new Error("Plant_Not_Found");
  }

  const fallback = await db("plants")
    .whereRaw("name ILIKE ?", ["%testing%"])
    .orderBy("id", "asc")
    .first();

  if (!fallback) {
    throw new Error("Plant_Not_Found");
  }

  return fallback;
};

const ensureTargetDeviceId = async ({ plantId, deviceId }) => {
  if (deviceId) {
    const existingDevice = await db("plant_devices")
      .where({ device_id: deviceId })
      .first();

    if (existingDevice) {
      if (Number(existingDevice.plant_id) !== Number(plantId)) {
        throw new Error("Device_Already_Assigned_To_Another_Plant");
      }

      return existingDevice.device_id;
    }

    await db("plant_devices").insert({
      device_id: deviceId,
      plant_id: plantId,
    });

    return deviceId;
  }

  const mappedDevice = await db("plant_devices")
    .where({ plant_id: plantId })
    .orderBy("created_at", "asc")
    .first();

  if (mappedDevice) {
    return mappedDevice.device_id;
  }

  const generatedDeviceId = `mock-plant-${plantId}`;

  await db("plant_devices").insert({
    device_id: generatedDeviceId,
    plant_id: plantId,
  });

  return generatedDeviceId;
};

const getHourFraction = (date, timeZone) => {
  if (timeZone) {
    try {
      const formatter = new Intl.DateTimeFormat("en-GB", {
        timeZone,
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: false,
      });
      const parts = formatter.formatToParts(date);
      const hour = Number(parts.find((part) => part.type === "hour")?.value);
      const minute = Number(parts.find((part) => part.type === "minute")?.value);
      const second = Number(parts.find((part) => part.type === "second")?.value);

      if (
        Number.isFinite(hour) &&
        Number.isFinite(minute) &&
        Number.isFinite(second)
      ) {
        return hour + minute / 60 + second / 3600;
      }
    } catch (err) {
      console.warn(`[mock-plant] Invalid timezone "${timeZone}", using server time.`);
    }
  }

  return (
    date.getHours() +
    date.getMinutes() / 60 +
    date.getSeconds() / 3600
  );
};

const buildAutomaticMetrics = (timestamp = new Date(), options = {}) => {
  const { random = Math.random, timeZone } = options;
  const hour = getHourFraction(timestamp, timeZone);
  const daylightFactor =
    hour >= 6 && hour <= 18
      ? Math.sin(((hour - 6) / 12) * Math.PI)
      : 0;
  const morningPeak =
    hour >= 5 && hour <= 9
      ? Math.sin(((hour - 5) / 4) * Math.PI)
      : 0;
  const eveningPeak =
    hour >= 17 && hour <= 23
      ? Math.sin(((hour - 17) / 6) * Math.PI)
      : 0;

  const load = clamp(
    0.55 +
      morningPeak * 0.7 +
      eveningPeak * 1.1 +
      randomBetween(-0.15, 0.15, random),
    0.35,
    2.8
  );

  const upsLoad = clamp(
    load + 0.28 + randomBetween(0.05, 0.55, random),
    0.55,
    3.4
  );

  const production =
    daylightFactor > 0
      ? clamp(
          daylightFactor * randomBetween(2.6, 5.8, random) +
            randomBetween(-0.15, 0.25, random),
          0,
          6.2
        )
      : 0;

  const pv =
    daylightFactor > 0
      ? clamp(
          production + daylightFactor * randomBetween(0.1, 0.9, random),
          production,
          7.2
        )
      : 0;

  let battery;
  if (daylightFactor > 0.12) {
    battery = clamp(
      daylightFactor * randomBetween(0.2, 1.7, random),
      0.1,
      2.2
    );
  } else if (hour >= 18 || hour < 6) {
    battery = -randomBetween(0.25, 1.35, random);
  } else {
    battery = randomBetween(-0.15, 0.2, random);
  }

  const grid = clamp(
    load +
      upsLoad -
      production -
      battery +
      randomBetween(-0.25, 0.25, random),
    -2.2,
    4.6
  );

  return {
    pv: round2(pv),
    battery: round2(battery),
    grid: round2(grid),
    production: round2(production),
    upsLoad: round2(upsLoad),
    load: round2(load),
  };
};

const buildManualPlantDataRows = (deviceId, metrics, timestamp = new Date()) => [
  {
    deviceId,
    category: "grid",
    type: "power",
    value: round2(metrics.grid),
    createdAt: timestamp,
  },
  {
    deviceId,
    category: "baterai",
    type: "power",
    value: round2(metrics.battery),
    createdAt: timestamp,
  },
  {
    deviceId,
    category: "pv",
    type: "power",
    value: round2(metrics.pv),
    createdAt: timestamp,
  },
  {
    deviceId,
    category: "pv",
    type: "chargePower",
    value: round2(metrics.production),
    createdAt: timestamp,
  },
  {
    deviceId,
    category: "out",
    type: "vaPower",
    value: round2(metrics.upsLoad),
    createdAt: timestamp,
  },
  {
    deviceId,
    category: "out",
    type: "power",
    value: round2(metrics.load),
    createdAt: timestamp,
  },
];

const emitRealtimeRows = (deviceId, rows) => {
  try {
    const io = getIO();

    io.to(deviceId).emit(
      "mqtt_message",
      rows.map(({ createdAt, ...row }) => ({
        ...row,
        timestamp: createdAt.getTime(),
      }))
    );
  } catch (err) {
    console.error("[mock-plant] Websocket emit failed:", err.message);
  }
};

const persistAndEmitRows = async (deviceId, rows) => {
  await saveDeviceData(rows);
  emitRealtimeRows(deviceId, rows);
};

const sendManualPlantData = async ({
  plantId,
  plantName,
  deviceId,
  timestamp,
  createdAt,
  time,
  jam,
  date,
  metrics,
}) => {
  const plant = await getTargetPlant({ plantId, plantName });
  const targetDeviceId = await ensureTargetDeviceId({
    plantId: plant.id,
    deviceId,
  });
  const requestedTimestamp = parseRequestedTimestamp({
    timestamp,
    createdAt,
    time,
    jam,
    date,
  });
  const rows = buildManualPlantDataRows(
    targetDeviceId,
    metrics,
    requestedTimestamp
  );

  await persistAndEmitRows(targetDeviceId, rows);

  return {
    plantId: plant.id,
    plantName: plant.name,
    deviceId: targetDeviceId,
    timestamp: requestedTimestamp.toISOString(),
    metrics: {
      pv: round2(metrics.pv),
      battery: round2(metrics.battery),
      grid: round2(metrics.grid),
      production: round2(metrics.production),
      upsLoad: round2(metrics.upsLoad),
      load: round2(metrics.load),
    },
    rowsSent: rows.length,
  };
};

const logAutoSenderState = (state, message) => {
  if (autoSenderState !== state) {
    console.log(message);
    autoSenderState = state;
  }
};

const runAutomaticCycle = async () => {
  if (autoSenderRunning) {
    return;
  }

  autoSenderRunning = true;

  try {
    const plant = await getTargetPlant();
    const targetDeviceId = await ensureTargetDeviceId({
      plantId: plant.id,
    });
    const timestamp = new Date();
    const metrics = buildAutomaticMetrics(timestamp, {
      timeZone: plant.timezone || "Asia/Jakarta",
    });
    const rows = buildManualPlantDataRows(targetDeviceId, metrics, timestamp);

    await persistAndEmitRows(targetDeviceId, rows);

    logAutoSenderState(
      `ready:${plant.id}:${targetDeviceId}`,
      `[mock-plant] Auto sender aktif untuk plant "${plant.name}" dengan interval ${AUTO_SEND_INTERVAL_MS} ms.`
    );
  } catch (err) {
    if (err.message === "Plant_Not_Found") {
      logAutoSenderState(
        "missing-plant",
        `[mock-plant] Plant "${DEFAULT_PLANT_NAME}" belum ditemukan. Auto sender akan mencoba lagi setiap ${AUTO_SEND_INTERVAL_MS} ms.`
      );
      return;
    }

    logAutoSenderState("runtime-error", "[mock-plant] Auto sender mengalami error. Lihat log berikut.");
    console.error("[mock-plant] Auto sender error:", err.message);
  } finally {
    autoSenderRunning = false;
  }
};

const startAutomaticPlantDataSender = () => {
  if (autoSenderStarted || process.env.MOCK_PLANT_ENABLED === "false") {
    return;
  }

  autoSenderStarted = true;
  runAutomaticCycle();
  setInterval(runAutomaticCycle, AUTO_SEND_INTERVAL_MS);
};

module.exports = {
  buildAutomaticMetrics,
  buildManualPlantDataRows,
  parseRequestedTimestamp,
  sendManualPlantData,
  startAutomaticPlantDataSender,
};

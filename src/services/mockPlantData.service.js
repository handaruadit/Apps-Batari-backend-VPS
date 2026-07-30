//===== (Imports) ======
const db = require("../config/db");
const { getIO } = require("../sockets/socket");
const { saveDeviceData } = require("./data.service");

//===== (MockPlant Configuration) ======
const DEFAULT_PLANT_NAME = process.env.MOCK_PLANT_NAME || "Plant Testing";
const DEFAULT_PLANT_ID = process.env.MOCK_PLANT_ID || "1";
const TIME_ONLY_REGEX = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/;
const AUTO_SEND_INTERVAL_MS = Number(process.env.MOCK_PLANT_INTERVAL_MS || 300000);
const AUTO_SEND_INTERVAL_MINUTES = 5;
const AUTO_SEND_TIME_ZONE = "Asia/Jakarta";

//===== (Automatic Sender State) ======
let autoSenderStarted = false;
let autoSenderState = null;
let autoSenderRunning = false;

//===== (round2) ======
const round2 = (value) => Number(Number(value).toFixed(2));
//===== (clamp) ======
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
//===== (randomBetween) ======
const randomBetween = (min, max, random = Math.random) =>
  min + (max - min) * random();
//===== (padTwo) ======
const padTwo = (value) => String(value).padStart(2, "0");

//===== (getJakartaParts) ======
const getJakartaParts = (date = new Date()) => {
  const jakartaDate = new Date(date.getTime() + 7 * 60 * 60 * 1000);

  return {
    year: jakartaDate.getUTCFullYear(),
    month: jakartaDate.getUTCMonth() + 1,
    day: jakartaDate.getUTCDate(),
    hour: jakartaDate.getUTCHours(),
    minute: jakartaDate.getUTCMinutes(),
    second: jakartaDate.getUTCSeconds(),
  };
};

//===== (formatLocalTimestamp) ======
const formatLocalTimestamp = ({
  year,
  month,
  day,
  hour = 0,
  minute = 0,
  second = 0,
}) =>
  `${year}-${padTwo(month)}-${padTwo(day)} ${padTwo(hour)}:${padTwo(
    minute
  )}:${padTwo(second)}`;

//===== (addLocalMinutes) ======
const addLocalMinutes = (parts, minutesToAdd) => {
  const timestamp = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute + minutesToAdd,
    parts.second || 0,
    0
  );
  const date = new Date(timestamp);

  return {
    year: date.getUTCFullYear(),
    month: date.getUTCMonth() + 1,
    day: date.getUTCDate(),
    hour: date.getUTCHours(),
    minute: date.getUTCMinutes(),
    second: date.getUTCSeconds(),
  };
};

//===== (getCurrentJakartaBucket) ======
const getCurrentJakartaBucket = () => {
  const parts = getJakartaParts();

  return {
    ...parts,
    minute:
      Math.floor(parts.minute / AUTO_SEND_INTERVAL_MINUTES) *
      AUTO_SEND_INTERVAL_MINUTES,
    second: 0,
  };
};

//===== (getTodayJakartaBuckets) ======
const getTodayJakartaBuckets = () => {
  const nowBucket = getCurrentJakartaBucket();
  const buckets = [];
  let cursor = {
    year: nowBucket.year,
    month: nowBucket.month,
    day: nowBucket.day,
    hour: 0,
    minute: 0,
    second: 0,
  };

  while (
    formatLocalTimestamp(cursor) <= formatLocalTimestamp(nowBucket)
  ) {
    buckets.push(cursor);
    cursor = addLocalMinutes(cursor, AUTO_SEND_INTERVAL_MINUTES);
  }

  return buckets;
};

//===== (parseRequestedTimestamp) ======
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

//===== (getTargetPlant) ======
const getTargetPlant = async ({
  plantId,
  plantName = DEFAULT_PLANT_NAME,
  strictPlantName = false,
} = {}) => {
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

  if (strictPlantName) {
    throw new Error("Plant_Not_Found");
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

//===== (getAutomaticTargetPlant) ======
const getAutomaticTargetPlant = async () => {
  try {
    return await getTargetPlant({ plantId: DEFAULT_PLANT_ID });
  } catch (err) {
    if (err.message !== "Plant_Not_Found") {
      throw err;
    }

    return getTargetPlant({ plantName: DEFAULT_PLANT_NAME });
  }
};

//===== (ensureTargetDeviceId) ======
const ensureTargetDeviceId = async ({ plantId, deviceId, strictDevice = false }) => {
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

    if (strictDevice) {
      throw new Error("Device_Not_Found");
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

  throw new Error("Device_Not_Found");
};

//===== (getHourFraction) ======
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

//===== (buildAutomaticMetrics) ======
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
  const pvGenerate =
    daylightFactor > 0
      ? clamp(
          production + daylightFactor * randomBetween(0.15, 0.95, random),
          0,
          7.4
        )
      : 0;
  const charge =
    daylightFactor > 0.12
      ? clamp(
          Math.max(0, battery) + randomBetween(0.05, 0.45, random),
          0.05,
          2.6
        )
      : 0;
  const exportValue =
    daylightFactor > 0
      ? clamp(
          pvGenerate - load - charge + randomBetween(-0.2, 0.35, random),
          0,
          4.8
        )
      : 0;

  return {
    pv: round2(pv),
    battery: round2(battery),
    grid: round2(grid),
    production: round2(production),
    pvGenerate: round2(pvGenerate),
    export: round2(exportValue),
    charge: round2(charge),
    upsLoad: round2(upsLoad),
    load: round2(load),
  };
};

//===== (buildManualPlantDataRows) ======
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
  {
    deviceId,
    category: "production",
    type: "pvGenerate",
    value: round2(metrics.pvGenerate ?? metrics.production ?? 0),
    createdAt: timestamp,
  },
  {
    deviceId,
    category: "production",
    type: "export",
    value: round2(metrics.export ?? 0),
    createdAt: timestamp,
  },
  {
    deviceId,
    category: "production",
    type: "charge",
    value: round2(metrics.charge ?? Math.max(0, metrics.battery ?? 0)),
    createdAt: timestamp,
  },
];

//===== (buildProductionFlowRows) ======
const buildProductionFlowRows = (deviceId, metrics, createdAt) => [
  {
    deviceId,
    category: "production",
    type: "pvGenerate",
    value: round2(metrics.pvGenerate),
    createdAt,
  },
  {
    deviceId,
    category: "production",
    type: "export",
    value: round2(metrics.export),
    createdAt,
  },
  {
    deviceId,
    category: "production",
    type: "charge",
    value: round2(metrics.charge),
    createdAt,
  },
];

//===== (buildAutomaticDeviceDataRows) ======
const buildAutomaticDeviceDataRows = (
  deviceId,
  metrics,
  createdAt,
  { includeProductionFlow = true } = {}
) => [
  {
    deviceId,
    category: "pv",
    type: "chargePower",
    value: round2(metrics.production),
    createdAt,
  },
  {
    deviceId,
    category: "out",
    type: "power",
    value: round2(metrics.load),
    createdAt,
  },
  {
    deviceId,
    category: "out",
    type: "vaPower",
    value: round2(metrics.upsLoad),
    createdAt,
  },
  {
    deviceId,
    category: "grid",
    type: "power",
    value: round2(metrics.grid),
    createdAt,
  },
  {
    deviceId,
    category: "baterai",
    type: "power",
    value: round2(metrics.battery),
    createdAt,
  },
  ...(includeProductionFlow
    ? buildProductionFlowRows(deviceId, metrics, createdAt)
    : []),
];

//===== (emitRealtimeRows) ======
const emitRealtimeRows = (deviceId, rows) => {
  try {
    const io = getIO();

    io.to(deviceId).emit(
      "mqtt_message",
      rows.map(({ createdAt, ...row }) => ({
        ...row,
        timestamp:
          createdAt instanceof Date
            ? createdAt.getTime()
            : new Date(String(createdAt).replace(" ", "T")).getTime(),
      }))
    );
  } catch (err) {
    console.error("[mock-plant] Websocket emit failed:", err.message);
  }
};

//===== (persistAndEmitRows) ======
const persistAndEmitRows = async (deviceId, rows) => {
  await saveDeviceData(rows);
  emitRealtimeRows(deviceId, rows);
};

//===== (getRowKey) ======
const getRowKey = (row) => `${row.category}:${row.type}`;

//===== (persistAutomaticRowsForBucket) ======
const persistAutomaticRowsForBucket = async (deviceId, rows, bucketStart) => {
  const bucketEnd = formatLocalTimestamp(
    addLocalMinutes(bucketStart, AUTO_SEND_INTERVAL_MINUTES)
  );
  const bucketStartText = formatLocalTimestamp(bucketStart);
  const existingRows = await db("device_data")
    .select("category", "type")
    .where("device_id", deviceId)
    .where("created_at", ">=", bucketStartText)
    .where("created_at", "<", bucketEnd)
    .whereIn(
      "category",
      Array.from(new Set(rows.map((row) => row.category)))
    )
    .whereIn("type", Array.from(new Set(rows.map((row) => row.type))));
  const existingKeys = new Set(existingRows.map(getRowKey));
  const rowsToInsert = rows.filter((row) => !existingKeys.has(getRowKey(row)));

  if (!rowsToInsert.length) {
    return 0;
  }

  await db("device_data").insert(
    rowsToInsert.map((row) => ({
      device_id: row.deviceId,
      category: row.category,
      type: row.type,
      value: row.value,
      created_at: row.createdAt,
    }))
  );
  emitRealtimeRows(deviceId, rowsToInsert);

  return rowsToInsert.length;
};

//===== (sendManualPlantData) ======
const sendManualPlantData = async ({
  plantId,
  plantName,
  deviceId,
  strictPlantName,
  strictDevice,
  timestamp,
  createdAt,
  time,
  jam,
  date,
  metrics,
}) => {
  const plant = await getTargetPlant({ plantId, plantName, strictPlantName });
  const targetDeviceId = await ensureTargetDeviceId({
    plantId: plant.id,
    deviceId,
    strictDevice,
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
      pvGenerate: round2(metrics.pvGenerate ?? metrics.production ?? 0),
      export: round2(metrics.export ?? 0),
      charge: round2(metrics.charge ?? Math.max(0, metrics.battery ?? 0)),
      upsLoad: round2(metrics.upsLoad),
      load: round2(metrics.load),
    },
    rowsSent: rows.length,
  };
};

//===== (logAutoSenderState) ======
const logAutoSenderState = (state, message) => {
  if (autoSenderState !== state) {
    console.log(message);
    autoSenderState = state;
  }
};

//===== (runAutomaticBucket) ======
const runAutomaticBucket = async ({
  plant,
  targetDeviceId,
  bucket,
  includeProductionFlow = true,
}) => {
  const createdAt = formatLocalTimestamp(bucket);
  const metrics = buildAutomaticMetrics(
    new Date(`${createdAt.replace(" ", "T")}+07:00`),
    {
      timeZone: plant.timezone || AUTO_SEND_TIME_ZONE,
    }
  );
  const rows = buildAutomaticDeviceDataRows(targetDeviceId, metrics, createdAt, {
    includeProductionFlow,
  });

  return persistAutomaticRowsForBucket(targetDeviceId, rows, bucket);
};

//===== (runAutomaticBackfill) ======
const runAutomaticBackfill = async ({ plant, targetDeviceId }) => {
  const buckets = getTodayJakartaBuckets();
  let insertedRows = 0;

  for (const bucket of buckets) {
    insertedRows += await runAutomaticBucket({
      plant,
      targetDeviceId,
      bucket,
      includeProductionFlow: false,
    });
  }

  console.log(
    `[mock-plant] Backfill hari ini selesai untuk plant ${plant.id}. Bucket: ${buckets.length}, row baru: ${insertedRows}.`
  );
};

//===== (runAutomaticCycle) ======
const runAutomaticCycle = async () => {
  if (autoSenderRunning) {
    return;
  }

  autoSenderRunning = true;

  try {
    const plant = await getAutomaticTargetPlant();
    const targetDeviceId = await ensureTargetDeviceId({
      plantId: plant.id,
    });
    const bucket = getCurrentJakartaBucket();
    const insertedRows = await runAutomaticBucket({
      plant,
      targetDeviceId,
      bucket,
    });

    logAutoSenderState(
      `ready:${plant.id}:${targetDeviceId}`,
      `[mock-plant] Dummy data DB aktif untuk plant "${plant.name}" (${targetDeviceId}) setiap ${AUTO_SEND_INTERVAL_MS} ms.`
    );

    if (insertedRows > 0) {
      console.log(
        `[mock-plant] Insert ${insertedRows} row dummy untuk bucket ${formatLocalTimestamp(
          bucket
        )} (${AUTO_SEND_TIME_ZONE}).`
      );
    }
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

//===== (startAutomaticPlantDataSender) ======
const startAutomaticPlantDataSender = () => {
  if (autoSenderStarted || process.env.MOCK_PLANT_ENABLED === "false") {
    return;
  }

  autoSenderStarted = true;
  (async () => {
    try {
      const plant = await getAutomaticTargetPlant();
      const targetDeviceId = await ensureTargetDeviceId({
        plantId: plant.id,
      });

      await runAutomaticBackfill({ plant, targetDeviceId });
    } catch (err) {
      console.error("[mock-plant] Backfill dummy gagal:", err.message);
    } finally {
      runAutomaticCycle();
    }
  })();
  setInterval(runAutomaticCycle, AUTO_SEND_INTERVAL_MS);
};

//===== (Exports) ======
module.exports = {
  buildAutomaticMetrics,
  buildManualPlantDataRows,
  parseRequestedTimestamp,
  sendManualPlantData,
  startAutomaticPlantDataSender,
};


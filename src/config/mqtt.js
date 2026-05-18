require("dotenv").config();
const { getIO } = require("../sockets/socket");
const mqtt = require("mqtt");
const {
  saveDeviceData,
  saveBatteryPowerForPlant,
} = require("../services/data.service");

const BMS_DEVICE_ID = process.env.BMS_DEVICE_ID || "BS26040012";
const BMS_TARGET_PLANT_NAME = process.env.BMS_TARGET_PLANT_NAME || "Kantor Batari Energy";
const BMS_MQTT_TOPIC = process.env.BMS_MQTT_TOPIC;
const BMS_POWER_CATEGORY = "baterai";
const BMS_POWER_TYPE = "power";
const bmsLatest = {};

const parseValue = (val) => {
  if (val === null || val === undefined || val === "") return null;

  // number langsung
  if (typeof val === "number") return val;

  // boolean convert
  if (typeof val === "boolean") return val ? 1 : 0;

  // string angka convert
  if (!isNaN(val)) return Number(val);

  // selain itu skip
  return null;
};

const parsePayloadRows = (payload) => {
  const deviceId = payload.deviceId || payload.device_id;
  if (!deviceId) return [];

  if (payload.category && payload.type && payload.value !== undefined) {
    return [{
      deviceId,
      category: payload.category,
      type: payload.type,
      value: parseValue(payload.value),
      timestamp: payload.created_at ? new Date(payload.created_at).getTime() : Date.now(),
    }];
  }

  const timestamp = Date.now();
  const parsedData = [];

  // LOOP CATEGORY (untuk parsing data)
  for (const category in payload) {
    if (category === "deviceId" || category === "device_id") continue;

    const data = payload[category];

    // pastikan object
    if (typeof data !== "object" || data === null) continue;

    // LOOP TYPE
    for (const key in data) {
      const value = data[key];

      if (Array.isArray(value)) {
        // HANDLE ARRAY VALUE (misal cell_voltages)
        value.forEach((v, i) => {
          parsedData.push({
            deviceId,
            category,
            type: `${key}_${i + 1}`,
            value: parseValue(v),
            timestamp,
          });
        });
      } else {
        // HANDLE SINGLE VALUE
        parsedData.push({
          deviceId,
          category,
          type: key,
          value: parseValue(value),
          timestamp,
        });
      }
    }
  }

  return parsedData;
};

const handleBmsBatteryPower = async (parsedData) => {
  const bmsRows = parsedData.filter((row) =>
    row.deviceId === BMS_DEVICE_ID &&
    (row.type === "voltage" || row.type === "current") &&
    row.value !== null &&
    row.value !== undefined &&
    Number.isFinite(Number(row.value))
  );

  if (bmsRows.length === 0) return;

  if (!bmsLatest[BMS_DEVICE_ID]) {
    bmsLatest[BMS_DEVICE_ID] = {};
  }

  bmsRows.forEach((row) => {
    bmsLatest[BMS_DEVICE_ID][row.type] = Number(row.value);
  });

  console.log("BMS voltage/current detected");

  const { voltage, current } = bmsLatest[BMS_DEVICE_ID];
  if (!Number.isFinite(voltage) || !Number.isFinite(current)) return;

  // Existing backend tidak punya transform charge/discharge, jadi sign current disimpan apa adanya.
  const powerKw = (voltage * current) / 1000;
  const saved = await saveBatteryPowerForPlant({
    plantName: BMS_TARGET_PLANT_NAME,
    powerKw,
  });

  if (saved) {
    console.log(`BMS Battery Power: ${powerKw} kW -> ${BMS_POWER_CATEGORY}/${BMS_POWER_TYPE}`);
    console.log(`Saved BMS Battery power for plant ${BMS_TARGET_PLANT_NAME}`);
  }
};

const connectUrl = `${process.env.MQTT_PROTOCOL}://${process.env.MQTT_HOST}:${process.env.MQTT_PORT}`;

const options = {
  clientId: process.env.MQTT_CLIENT_ID,
  username: process.env.MQTT_USERNAME,
  password: process.env.MQTT_PASSWORD,
  clean: true,
  connectTimeout: 4000,
  reconnectPeriod: 1000,
};

const client = mqtt.connect(connectUrl, options);

const bmsConnectUrl = `${process.env.BMS_MQTT_PROTOCOL}://${process.env.BMS_MQTT_HOST}:${process.env.BMS_MQTT_PORT}`;
const bmsOptions = {
  clientId: process.env.BMS_MQTT_CLIENT_ID,
  username: process.env.BMS_MQTT_USERNAME || undefined,
  password: process.env.BMS_MQTT_PASSWORD || undefined,
  clean: true,
  connectTimeout: 4000,
  reconnectPeriod: 1000,
};
const shouldConnectBmsMqtt = Boolean(
  process.env.BMS_MQTT_PROTOCOL &&
  process.env.BMS_MQTT_HOST &&
  process.env.BMS_MQTT_PORT &&
  process.env.BMS_MQTT_CLIENT_ID &&
  BMS_MQTT_TOPIC
);

const bmsClient = shouldConnectBmsMqtt ? mqtt.connect(bmsConnectUrl, bmsOptions) : null;

client.on("connect", () => {
  console.log("MQTT Connected");
  try {
    client.subscribe("app/+/baterai");
    client.subscribe("app/+/inverter");
    console.log("Subscribed to All device data");
  } catch (err) {
    console.error("MQTT Subscribe Error:", err.message);
  }
});

client.on("error", (err) => {
  console.error("MQTT Error:", err.message);
});

client.on("reconnect", () => {
  console.log("Reconnecting MQTT...");
});

client.on("message", async (topic, message) => {
  try {
    const payload = JSON.parse(message.toString());
    const parsedData = parsePayloadRows(payload);
    if (parsedData.length === 0) return;

    const deviceId = parsedData[0].deviceId;

    // WEBSOCKET (REALTIME)
    try {
      const io = getIO();
      io.to(deviceId).emit("mqtt_message", parsedData);
    } catch (err) {
      console.error("WEBSOCKET Error:", err.message);
    }

    // BULK INSERT (EFISIEN)
    await saveDeviceData(parsedData);

    // DEBUG LOG
    console.log("Parsed Data:", parsedData.length, "rows");
  } catch (err) {
    console.error("MQTT ERROR:", err.message);
  }
});

if (bmsClient) {
  bmsClient.on("connect", () => {
    console.log("BMS MQTT Connected");
    bmsClient.subscribe(process.env.BMS_MQTT_TOPIC, (err) => {
      if (err) {
        console.error("BMS MQTT Subscribe Error:", err.message);
        return;
      }

      console.log("Subscribed to BMS device data");
    });
  });

  bmsClient.on("error", (err) => {
    console.error("BMS MQTT Error:", err.message);
  });

  bmsClient.on("reconnect", () => {
    console.log("Reconnecting BMS MQTT...");
  });

  bmsClient.on("message", async (topic, message) => {
    try {
      if (topic !== process.env.BMS_MQTT_TOPIC) return;

      const payload = JSON.parse(message.toString());
      const parsedData = parsePayloadRows(payload);
      if (parsedData.length === 0) return;

      await handleBmsBatteryPower(parsedData);

      console.log("Parsed Data:", parsedData.length, "rows");
    } catch (err) {
      console.error("BMS MQTT ERROR:", err.message);
    }
  });
} else {
  console.warn("BMS MQTT disabled: BMS_MQTT_* env is incomplete");
}

const publishMessage = (topic, message) => {
  if (!client.connected) {
    console.log("MQTT not connected");
    return;
  }

  client.publish(topic, message, { qos: 1 }, (err) => {
    if (err) {
      console.error("Publish error:", err);
    } else {
      console.log(`Published to ${topic}`);
      console.log(`Message: ${message}`);
    }
  });
};

module.exports = { client, bmsClient, publishMessage };

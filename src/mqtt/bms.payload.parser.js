const { validateBmsPayload } = require("./bms.payload.contract");

const { calculateBatteryPowerKw } = require("./bms.power");

const BMS_CATEGORY = "baterai";
const BMS_TYPES = ["voltage", "current", "soc"];

const normalizeTimestamp = (timestamp, receivedAt = Date.now()) => {
  const parsedTimestamp = timestamp
    ? new Date(timestamp).getTime()
    : new Date(receivedAt).getTime();

  return Number.isFinite(parsedTimestamp) ? parsedTimestamp : Date.now();
};

const parseBmsPayloadRows = (payload, receivedAt = Date.now()) => {
  const validation = validateBmsPayload(payload);

  if (!validation.valid) {
    return {
      valid: false,
      errors: validation.errors,
      rows: [],
    };
  }

    const data = validation.data;
    const deviceId = data.device_id.trim().toUpperCase();

  const timestamp = normalizeTimestamp(data.timestamp, receivedAt);

  const powerKw = calculateBatteryPowerKw(data.voltage, data.current);

  const rows = BMS_TYPES.map((type) => ({
    deviceId,
    category: BMS_CATEGORY,
    type,
    value: data[type],
    timestamp,
  }));

  rows.push({
    deviceId,
    category: BMS_CATEGORY,
    type: "power",
    value: powerKw,
    timestamp,
  });

  return {
    valid: true,
    errors: [],
    rows,
  };
};

module.exports = {
  BMS_CATEGORY,
  BMS_TYPES,
  normalizeTimestamp,
  parseBmsPayloadRows,
};

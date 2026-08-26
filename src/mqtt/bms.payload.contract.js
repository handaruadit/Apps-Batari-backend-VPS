const REQUIRED_FIELDS = ["device_id", "voltage", "current", "soc"];
const TIMESTAMP_FIELDS = ["waktu", "timestamp", "created_at"];

const isObject = (value) =>
  value !== null && typeof value === "object" && !Array.isArray(value);

const getPayloadData = (payload) => {
  if (!isObject(payload)) return null;

  // Mendukung payload biasa dan payload dengan pembungkus "data"
  if (isObject(payload.data)) {
    return {
      ...payload,
      ...payload.data,
    };
  }

  return payload;
};

const toNumber = (value) => {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const result = Number(value);

  return Number.isFinite(result) ? result : null;
};

const getPayloadTimestamp = (payload) => {
  for (const field of TIMESTAMP_FIELDS) {
    if (payload[field] !== undefined && payload[field] !== null) {
      return {
        field,
        value: payload[field],
      };
    }
  }

  return {
    field: null,
    value: null,
  };
};

const validateBmsPayload = (payload) => {
  const data = getPayloadData(payload);
  const errors = [];

  if (!data) {
    return {
      valid: false,
      errors: ["Payload harus berupa objek JSON."],
    };
  }

  if (typeof data.device_id !== "string" || !data.device_id.trim()) {
    errors.push("device_id wajib berupa teks yang tidak kosong.");
  }

  const voltage = toNumber(data.voltage);
  const current = toNumber(data.current);
  const soc = toNumber(data.soc);

  if (voltage === null) {
    errors.push("voltage wajib berupa angka.");
  } else if (voltage < 0) {
    errors.push("voltage tidak boleh negatif.");
  }

  if (current === null) {
    errors.push("current wajib berupa angka.");
  }

  if (soc === null) {
    errors.push("soc wajib berupa angka.");
  } else if (soc < 0 || soc > 100) {
    errors.push("soc harus berada pada rentang 0 sampai 100.");
  }

  const timestamp = getPayloadTimestamp(data);

  if (
    timestamp.value !== null &&
    Number.isNaN(new Date(timestamp.value).getTime())
  ) {
    errors.push(`${timestamp.field} bukan waktu yang valid.`);
  }

  return {
    valid: errors.length === 0,
    errors,
    data:
      errors.length === 0
        ? {
            device_id: data.device_id.trim(),
            voltage,
            current,
            soc,
            timestamp: timestamp.value,
          }
        : null,
  };
};

module.exports = {
  REQUIRED_FIELDS,
  TIMESTAMP_FIELDS,
  getPayloadData,
  getPayloadTimestamp,
  toNumber,
  validateBmsPayload,
};

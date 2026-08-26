const MAPPING = Object.freeze([
  { field: "generationPower", category: "pv", type: "chargePower", kind: "power" },
  { field: "consumptionPower", category: "out", type: "power", kind: "power" },
  {
    field: "gridPower",
    fallbackFields: ["purchasePower", "wirePower"],
    category: "grid",
    type: "power",
    kind: "power",
  },
  { field: "batteryPower", category: "baterai", type: "power", kind: "power" },
  { field: "batterySOC", category: "baterai", type: "soc", kind: "soc" },
]);

const toFiniteNumber = (value) => {
  if (value === null || value === undefined || String(value).trim() === "") {
    return null;
  }
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
};

const toIsoTimestamp = (value) => {
  if (value === null || value === undefined || String(value).trim() === "") {
    return null;
  }
  const number = toFiniteNumber(value);
  const input = number === null
    ? value
    : (number < 1_000_000_000_000 ? number * 1000 : number);
  const date = new Date(input);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
};

const toKilowatt = (value, unit = "W") => {
  const number = toFiniteNumber(value);
  const normalizedUnit = String(unit).trim().toUpperCase();
  if (number === null || !["W", "KW", "MW"].includes(normalizedUnit)) {
    return null;
  }
  const valueKw = normalizedUnit === "W"
    ? number / 1000
    : normalizedUnit === "MW" ? number * 1000 : number;
  return Number(valueKw.toFixed(3));
};

const getStationDeviceId = (stationId) => {
  const number = Number(stationId);
  if (!Number.isSafeInteger(number) || number <= 0) {
    throw new Error("Invalid_Deye_Station_ID");
  }
  return `DEYE_STATION_${number}`;
};

const mapStationLatest = (stationId, rawData, sourceDeviceId) => {
  const deviceId = sourceDeviceId || getStationDeviceId(stationId);
  const createdAt = toIsoTimestamp(rawData?.lastUpdateTime);
  if (!createdAt) {
    throw new Error("Invalid_Deye_Source_Timestamp");
  }

  return MAPPING.flatMap((mapping) => {
    const sourceFields = [mapping.field, ...(mapping.fallbackFields || [])];
    const sourceField = sourceFields.find(
      (field) => toFiniteNumber(rawData?.[field]) !== null,
    );
    const rawValue = sourceField ? rawData?.[sourceField] : null;
    const value = mapping.kind === "soc"
      ? toFiniteNumber(rawValue)
      : toKilowatt(rawValue, process.env.DEYE_STATION_POWER_UNIT || "W");

    if (value === null || (mapping.kind === "soc" && (value < 0 || value > 100))) {
      return [];
    }

    // Grid dan battery mempertahankan sign asli Deye.
    return [{ deviceId, category: mapping.category, type: mapping.type, value, createdAt }];
  });
};

module.exports = {
  MAPPING,
  getStationDeviceId,
  mapStationLatest,
  toFiniteNumber,
  toIsoTimestamp,
  toKilowatt,
};

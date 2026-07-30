//===== (Imports) ======
const {
  CHART_CATEGORY_ALIASES,
  CHART_TYPE_ALIASES,
} = require("./constants");

//===== (Konfigurasi Normalisasi Daya) ======
const POWER_WATT_INFERENCE_ABS_MIN = 20;

//===== (normalizeCreatedAt) ======
const normalizeCreatedAt = (value) => {
  if (!value) {
    return undefined;
  }

  const parsed = value instanceof Date ? value : new Date(value);

  if (Number.isNaN(parsed.getTime())) {
    return undefined;
  }

  return parsed;
};

//===== (normalizeText) ======
const normalizeText = (value) =>
  String(value ?? "")
    .trim()
    .replace(/[-_\s]+/g, "")
    .toLowerCase();

//===== (matchesAlias) ======
const matchesAlias = (value, aliases) => {
  const normalizedValue = normalizeText(value);
  return aliases.some((alias) => normalizeText(alias) === normalizedValue);
};

//===== (getRowUnit) ======
const getRowUnit = (row) =>
  row?.unit ?? row?.units ?? row?.measurement_unit ?? row?.measurementUnit;

//===== (isWattUnit) ======
const isWattUnit = (unit) => matchesAlias(unit, ["w", "watt", "watts"]);

//===== (isKilowattUnit) ======
const isKilowattUnit = (unit) =>
  matchesAlias(unit, ["kw", "kilowatt", "kilowatts"]);

//===== (shouldTreatPowerValueAsWatt) ======
const shouldTreatPowerValueAsWatt = (value, row) => {
  const unit = getRowUnit(row);

  if (isWattUnit(unit)) {
    return true;
  }

  if (isKilowattUnit(unit)) {
    return false;
  }

  return Math.abs(value) >= POWER_WATT_INFERENCE_ABS_MIN;
};

//===== (normalizePowerKw) ======
const normalizePowerKw = (value, row = {}) => {
  const number = Number(value);

  if (!Number.isFinite(number)) {
    return null;
  }

  return shouldTreatPowerValueAsWatt(number, row) ? number / 1000 : number;
};

//===== (roundPowerKw) ======
const roundPowerKw = (value) => {
  const num = Number(value);

  if (!Number.isFinite(num)) {
    return 0;
  }

  if (Math.abs(num) < 0.0005) {
    return 0;
  }

  return Number(num.toFixed(3));
};

//===== (isPowerResponseRow) ======
const isPowerResponseRow = (row) => {
  if (!row) return false;

  if (
    matchesAlias(row.category, CHART_CATEGORY_ALIASES.pv) &&
    (matchesAlias(row.type, CHART_TYPE_ALIASES.power) ||
      matchesAlias(row.type, CHART_TYPE_ALIASES.chargePower))
  ) {
    return true;
  }

  if (
    matchesAlias(row.category, CHART_CATEGORY_ALIASES.load) &&
    (matchesAlias(row.type, CHART_TYPE_ALIASES.power) ||
      matchesAlias(row.type, CHART_TYPE_ALIASES.vaPower))
  ) {
    return true;
  }

  if (
    matchesAlias(row.category, CHART_CATEGORY_ALIASES.grid) &&
    matchesAlias(row.type, CHART_TYPE_ALIASES.power)
  ) {
    return true;
  }

  if (
    matchesAlias(row.category, CHART_CATEGORY_ALIASES.battery) &&
    matchesAlias(row.type, CHART_TYPE_ALIASES.power)
  ) {
    return true;
  }

  if (
    matchesAlias(row.category, CHART_CATEGORY_ALIASES.productionFlow) &&
    (matchesAlias(row.type, CHART_TYPE_ALIASES.pvGenerate) ||
      matchesAlias(row.type, CHART_TYPE_ALIASES.export) ||
      matchesAlias(row.type, CHART_TYPE_ALIASES.charge))
  ) {
    return true;
  }

  return false;
};

//===== (formatPowerValueForResponse) ======
const formatPowerValueForResponse = (row) => {
  if (!isPowerResponseRow(row)) {
    return row?.value;
  }

  return roundPowerKw(normalizePowerKw(row?.value, row));
};

//===== (formatDeviceDataForResponse) ======
const formatDeviceDataForResponse = (row) => ({
  ...row,
  value: formatPowerValueForResponse(row),
});

//===== (Exports) ======
module.exports = {
  normalizeCreatedAt,
  normalizeText,
  matchesAlias,
  normalizePowerKw,
  roundPowerKw,
  isPowerResponseRow,
  formatPowerValueForResponse,
  formatDeviceDataForResponse,
};

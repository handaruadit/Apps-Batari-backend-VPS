//===== (Alias Kategori Chart) ======
const CHART_CATEGORY_ALIASES = {
  pv: ["pv", "solar"],
  grid: ["grid"],
  battery: ["battery", "baterai"],
  load: ["load", "out"],
  productionFlow: ["production", "productionFlow", "production_flow"],
};

//===== (Alias Tipe Chart) ======
const CHART_TYPE_ALIASES = {
  power: ["power"],
  chargePower: ["chargePower", "charge_power", "chargepower"],
  vaPower: ["vaPower", "va_power", "vapower"],
  pvGenerate: ["pvGenerate", "pv_generate", "pvgenerate"],
  export: ["export", "exportPower", "export_power", "exportpower"],
  charge: ["charge", "chargePowerOut", "charge_power_out", "chargepowerout"],
};

//===== (Konfigurasi Chart) ======
const CHART_ALLOWED_SEGMENTS = ["day", "month", "year", "lifetime"];
const CHART_ENERGY_UNIT = "kWh";
const CHART_ENERGY_SOURCE = "backend-daily-kwh";
const CHART_SERIES_CONFIG = {
  production: { category: "pv", type: "chargePower" },
  load: { category: "out", type: "power" },
  upsLoad: { category: "out", type: "vaPower" },
  grid: { category: "grid", type: "power" },
  battery: { category: "baterai", type: "power" },
  pvGenerate: { category: "production", type: "pvGenerate" },
  export: { category: "production", type: "export" },
  charge: { category: "production", type: "charge" },
};

//===== (Konfigurasi Mock Chart) ======
const DEFAULT_MOCK_CHART_POINTS_PER_DAY = 180;
const MOCK_CHART_SERIES_KEYS = [
  "production",
  "load",
  "upsLoad",
  "grid",
  "battery",
];

//===== (Konfigurasi Energi) ======
const ENERGY_TIME_ZONE = "Asia/Jakarta";
const MONTH_LABELS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

//===== (Exports) ======
module.exports = {
  CHART_CATEGORY_ALIASES,
  CHART_TYPE_ALIASES,
  CHART_ALLOWED_SEGMENTS,
  CHART_ENERGY_UNIT,
  CHART_ENERGY_SOURCE,
  CHART_SERIES_CONFIG,
  DEFAULT_MOCK_CHART_POINTS_PER_DAY,
  MOCK_CHART_SERIES_KEYS,
  ENERGY_TIME_ZONE,
  MONTH_LABELS,
};

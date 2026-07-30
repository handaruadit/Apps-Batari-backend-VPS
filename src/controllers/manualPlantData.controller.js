//===== (Imports) ======
const {
  sendManualPlantData: sendManualPlantDataService,
} = require("../services/mockPlantData.service");

//===== (Konfigurasi Metric Wajib) ======
const REQUIRED_METRIC_FIELDS = [
  { target: "pv", keys: ["pv", "PV"], label: "PV" },
  { target: "battery", keys: ["battery", "Battery"], label: "Battery" },
  { target: "grid", keys: ["grid", "Grid"], label: "Grid" },
  {
    target: "production",
    keys: ["production", "Production"],
    label: "Production",
  },
  {
    target: "upsLoad",
    keys: ["upsLoad", "ups_load", "ups-load", "UPS-load", "UPSLoad"],
    label: "UPS-load",
  },
  { target: "load", keys: ["load", "Load"], label: "Load" },
];

//===== (Konfigurasi Metric Opsional) ======
const OPTIONAL_METRIC_FIELDS = [
  {
    target: "pvGenerate",
    keys: ["pvGenerate", "pv_generate", "PVGenerate", "PV Generate"],
    label: "PV Generate",
  },
  { target: "export", keys: ["export", "Export"], label: "Export" },
  { target: "charge", keys: ["charge", "Charge"], label: "Charge" },
];

//===== (pickBodyValue) ======
const pickBodyValue = (body, keys) => {
  for (const key of keys) {
    if (body[key] !== undefined && body[key] !== null && body[key] !== "") {
      return body[key];
    }
  }

  return undefined;
};

//===== (parseRequiredMetric) ======
const parseRequiredMetric = (body, keys, label) => {
  const rawValue = pickBodyValue(body, keys);

  if (rawValue === undefined) {
    return { error: `${label} is required` };
  }

  const numericValue = Number(rawValue);
  if (!Number.isFinite(numericValue)) {
    return { error: `${label} must be a valid number` };
  }

  return { value: numericValue };
};

//===== (parseOptionalMetric) ======
const parseOptionalMetric = (body, keys, label) => {
  const rawValue = pickBodyValue(body, keys);

  if (rawValue === undefined) {
    return {};
  }

  const numericValue = Number(rawValue);
  if (!Number.isFinite(numericValue)) {
    return { error: `${label} must be a valid number` };
  }

  return { value: numericValue };
};

//===== (sendManualPlantData) ======
const sendManualPlantData = async (req, res) => {
  try {
    const metrics = {};

    for (const field of REQUIRED_METRIC_FIELDS) {
      const parsed = parseRequiredMetric(req.body, field.keys, field.label);

      if (parsed.error) {
        return res.status(400).json({
          status: "error",
          message: parsed.error,
        });
      }

      metrics[field.target] = parsed.value;
    }

    for (const field of OPTIONAL_METRIC_FIELDS) {
      const parsed = parseOptionalMetric(req.body, field.keys, field.label);

      if (parsed.error) {
        return res.status(400).json({
          status: "error",
          message: parsed.error,
        });
      }

      if (parsed.value !== undefined) {
        metrics[field.target] = parsed.value;
      }
    }

    const result = await sendManualPlantDataService({
      plantId: pickBodyValue(req.body, ["plantId", "plant_id"]),
      plantName: pickBodyValue(req.body, ["plantName", "plant_name", "name"]),
      deviceId: pickBodyValue(req.body, ["deviceId", "device_id"]),
      strictPlantName:
        req.body.strictPlantName === true ||
        req.body.strict_plant_name === true,
      strictDevice:
        req.body.strictDevice === true || req.body.strict_device === true,
      timestamp: req.body.timestamp,
      createdAt: req.body.createdAt || req.body.created_at,
      time: req.body.time,
      jam: req.body.jam,
      date: req.body.date,
      metrics,
    });

    res.status(201).json({
      status: "success",
      message: "Manual plant data sent",
      data: result,
    });
  } catch (err) {
    if (err.message === "Invalid_Timestamp") {
      return res.status(400).json({
        status: "error",
        message: "timestamp/time is invalid",
      });
    }

    if (err.message === "Plant_Not_Found") {
      return res.status(404).json({
        status: "error",
        message: "Plant not found",
      });
    }

    if (err.message === "Device_Already_Assigned_To_Another_Plant") {
      return res.status(409).json({
        status: "error",
        message: "deviceId is already assigned to another plant",
      });
    }

    if (err.message === "Device_Not_Found") {
      return res.status(404).json({
        status: "error",
        message: "Device not found for target plant",
      });
    }

    console.error("Error sending manual plant data:", err);
    res.status(500).json({
      status: "error",
      message: "Internal server error",
    });
  }
};

//===== (Exports) ======
module.exports = {
  sendManualPlantData,
};

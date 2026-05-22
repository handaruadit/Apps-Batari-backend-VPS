const { assignDeviceToPlant } = require("../services/plant.service");
const { checkPlantAccess } = require("../services/plant.service");
const { assignUserToPlant } = require("../services/plant.service");
const { getPlantDevices } = require("../services/plant.service");
const { getPlants } = require("../services/plant.service");
const { create } = require("../services/plant.service");

const validatePlantCreatePayload = (payload) => {
  const requiredFields = [
    "name",
    "location",
    "latitude",
    "longitude",
    "system_type",
    "pv_capacity",
    "currency",
  ];

  for (const field of requiredFields) {
    if (payload[field] === undefined || payload[field] === null || payload[field] === "") {
      return `${field} is required`;
    }
  }

  if (typeof payload.latitude !== "number" || Number.isNaN(payload.latitude)) {
    return "latitude must be a valid number";
  }
  if (payload.latitude < -90 || payload.latitude > 90) {
    return "latitude must be between -90 and 90";
  }

  if (typeof payload.longitude !== "number" || Number.isNaN(payload.longitude)) {
    return "longitude must be a valid number";
  }
  if (payload.longitude < -180 || payload.longitude > 180) {
    return "longitude must be between -180 and 180";
  }

  if (typeof payload.pv_capacity !== "number" || Number.isNaN(payload.pv_capacity)) {
    return "pv_capacity must be a valid number";
  }

  if (payload.battery_capacity !== undefined && payload.battery_capacity !== null && payload.battery_capacity !== "") {
    if (typeof payload.battery_capacity !== "number" || Number.isNaN(payload.battery_capacity)) {
      return "battery_capacity must be a valid number";
    }
  }

  if (payload.electricity_price !== undefined && payload.electricity_price !== null && payload.electricity_price !== "") {
    if (typeof payload.electricity_price !== "number" || Number.isNaN(payload.electricity_price)) {
      return "electricity_price must be a valid number";
    }
  }

  return null;
};

const validateAssignDevicePayload = (payload) => {
  if (!payload.deviceId && !payload.device_id) return "deviceId is required";
  const plantId = payload.plant_id || payload.plantId;
  if (!plantId) return "plant_id is required";
  return null;
};

const validateAssignUserPayload = (payload) => {
  if (!payload.email) return "email is required";
  const plantId = payload.plant_id || payload.plantId;
  if (!plantId) return "plant_id is required";
  if (!payload.role) return "role is required";
  return null;
};

const addDeviceToPlant = async (req, res) => {
  try {
    const validationError = validateAssignDevicePayload({
      ...req.body,
      plantId: req.body.plant_id || req.body.plantId || req.params.id,
    });
    if (validationError) {
      return res.status(400).json({ message: validationError });
    }

    const deviceId = req.body.deviceId || req.body.device_id;
    const plantId = req.body.plant_id || req.body.plantId || req.params.id;
    const userId = req.user.userId;

    const allowed = await checkPlantAccess(userId, plantId);
    if (!allowed) {
      return res.status(403).json({ message: "Access denied" });
    }

    const device = await assignDeviceToPlant(deviceId, plantId, userId);
    res.json({ status: "device added", data: device });
  } catch (err) {
    if (err.message === "Device_ID_Required") {
      return res.status(400).json({ message: "Device ID tidak boleh kosong" });
    }

    if (err.message === "Device_Not_Registered") {
      return res.status(404).json({
        message: "Device ID belum terdaftar. Hubungi admin.",
      });
    }

    res.status(500).json({ message: err.message });
  }
};

const getPlantDeviceData = async (req, res) => {
  try {
    const plantId = req.params.id;
    const userId = req.user.userId;

    const allowed = await checkPlantAccess(userId, plantId);
    if (!allowed) {
      return res.status(403).json({ message: "Access denied" });
    }

    const devices = await getPlantDevices(plantId, userId);
    res.json({
      status: "success",
      data: {
        plant: { id: plantId },
        devices,
      },
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

const createPlant = async (req, res) => {
  try {
    const validationError = validatePlantCreatePayload(req.body);
    if (validationError) {
      return res.status(400).json({ message: validationError });
    }

    const userId = req.user.userId;
    const [plant] = await create(req.body, userId);

    res.json({ status: "success", data: plant });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

const assignUserToPlantByEmail = async (req, res) => {
  try {
    const validationError = validateAssignUserPayload(req.body);
    if (validationError) {
      return res.status(400).json({ message: validationError });
    }

    const plantId = req.body.plant_id || req.body.plantId;
    const email = req.body.email;
    const role = req.body.role;
    const userId = req.user.userId;

    const allowed = await checkPlantAccess(userId, plantId);
    if (!allowed) {
      return res.status(403).json({ message: "Access denied" });
    }

    await assignUserToPlant(email, plantId, role);
    res.json({ status: "user assigned", email });
  } catch (err) {
    if (err.message === "User not found") {
      return res.status(404).json({ message: err.message });
    }
    res.status(500).json({ message: err.message });
  }
};

const getPlantData = async (req, res) => {
  try {
    const userId = req.user.userId;

    const data = await getPlants(userId);
    res.json({
      status: "success",
      data,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

module.exports = {
  createPlant,
  addDeviceToPlant,
  assignUserToPlantByEmail,
  getPlantDeviceData,
  getPlantData,
};

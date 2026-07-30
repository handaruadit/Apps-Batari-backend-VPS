//===== (Imports) ======
const {
  canManagePlant,
  canViewPlant,
} = require("../services/plantAccess.service");
const { getPlantById } = require("../services/plantCrud.service");
const {
  assignDeviceToPlant,
  getPlantDevices,
  removePlantDevice,
} = require("../services/plantDevice.service");
const {
  validateAssignDevicePayload,
} = require("../validators/plant.validator");

//===== (addDeviceToPlant) ======
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

    const allowed = await canManagePlant(userId, plantId);
    if (!allowed) {
      return res.status(403).json({ message: "Access denied" });
    }

    const device = await assignDeviceToPlant(deviceId, plantId, userId);
    res.json({ status: "device added", data: device });
  } catch (err) {
    if (err.message === "Device_ID_Required") {
      return res.status(400).json({ message: "Device ID tidak boleh kosong" });
    }

    res.status(500).json({ message: err.message });
  }
};

//===== (getPlantDeviceData) ======
const getPlantDeviceData = async (req, res) => {
  try {
    const plantId = req.params.id;
    const userId = req.user.userId;

    const allowed = await canViewPlant(userId, plantId);
    if (!allowed) {
      return res.status(403).json({ message: "Access denied" });
    }

    const devices = await getPlantDevices(plantId);
    const plant = await getPlantById(plantId);
    res.json({
      status: "success",
      data: {
        plant: plant || { id: plantId },
        devices,
      },
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

//===== (removeDeviceFromPlant) ======
const removeDeviceFromPlant = async (req, res) => {
  try {
    const plantId = req.params.id;
    const deviceId = req.params.deviceId;
    const userId = req.user.userId;

    if (!plantId) {
      return res.status(400).json({ message: "plant_id is required" });
    }

    if (!deviceId) {
      return res.status(400).json({ message: "deviceId is required" });
    }

    const allowed = await canManagePlant(userId, plantId);
    if (!allowed) {
      return res.status(403).json({ message: "Access denied" });
    }

    const removedDevice = await removePlantDevice(deviceId, plantId);

    res.json({
      message: "Device berhasil dilepas dari plant.",
      plantId: removedDevice.plantId,
      deviceId: removedDevice.deviceId,
    });
  } catch (err) {
    if (err.message === "Device_ID_Required") {
      return res.status(400).json({ message: "Device ID tidak boleh kosong" });
    }

    if (err.message === "Plant_Device_Not_Found") {
      return res.status(404).json({
        message: "Device tidak ditemukan pada plant ini.",
      });
    }

    res.status(500).json({ message: err.message });
  }
};

//===== (Exports) ======
module.exports = {
  addDeviceToPlant,
  getPlantDeviceData,
  removeDeviceFromPlant,
};

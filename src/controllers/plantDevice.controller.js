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

const SUPER_ADMIN_EMAILS = [
  "idewanyomanbayusw@gmail.com",
  "idewbayu14@gmail.com",
  "admin@batarienergy.com",
];

const checkIsAdmin = (req) => {
  const role = (req.user?.role || "").toLowerCase();
  const email = (req.user?.email || "").toLowerCase();
  return (
    role === "admin" ||
    role === "superadmin" ||
    role === "super_admin" ||
    SUPER_ADMIN_EMAILS.includes(email)
  );
};

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
    const userId = req.user?.userId || req.user?.id;
    const isAdmin = checkIsAdmin(req);

    const allowed = isAdmin || (await canManagePlant(userId, plantId));
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
    const userId = req.user?.userId || req.user?.id;
    const isAdmin = checkIsAdmin(req);

    const allowed = isAdmin || (await canViewPlant(userId, plantId));
    if (!allowed) {
      return res.status(403).json({ message: "Access denied" });
    }

    let devices = await getPlantDevices(plantId);
    const plant = await getPlantById(plantId);

    // If no physical inverters returned from plant_devices table, check Deye integration
    const hasInverters = Array.isArray(devices) && devices.some((d) => d.deviceType === "INVERTER" || d.type === "INVERTER");
    if (!hasInverters) {
      let targetStationId = plant?.deye_station_id || (Number(plantId) >= 100000 ? plantId : null);
      if (!targetStationId) {
        try {
          const db = require("../config/db");
          const integration = await db("deye_integrations")
            .where("plant_id", String(plantId))
            .orWhere("station_id", String(plantId))
            .first("plant_id", "station_id");
          if (integration?.station_id) {
            targetStationId = integration.station_id;
          }
        } catch (_intErr) {}
      }

      if (targetStationId) {
        try {
          const { fetchDeyeStationDevicesWithLatest } = require("../services/data/deyeDevices.service");
          const deyeInverters = await fetchDeyeStationDevicesWithLatest(
            targetStationId,
            plant,
            plant?.updated_at || new Date().toISOString(),
            0,
            null,
          );
          if (Array.isArray(deyeInverters) && deyeInverters.length > 0) {
            devices = deyeInverters;
          }
        } catch (_deyeErr) {
          console.warn("[plantDevice.controller] Deye inverters fetch fallback:", _deyeErr.message);
        }
      }
    }

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
    const userId = req.user?.userId || req.user?.id;
    const isAdmin = checkIsAdmin(req);

    if (!plantId) {
      return res.status(400).json({ message: "plant_id is required" });
    }

    if (!deviceId) {
      return res.status(400).json({ message: "deviceId is required" });
    }

    const allowed = isAdmin || (await canManagePlant(userId, plantId));
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

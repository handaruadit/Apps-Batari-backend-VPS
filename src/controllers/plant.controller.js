const {
  addPlantAccess,
  assignDeviceToPlant,
  assignUserToPlant,
  canManagePlant,
  canViewPlant,
  create,
  deletePlant: deletePlantService,
  getPlantAccessList,
  getPlantDevices,
  getPlants,
  isPlantOwner,
  removePlantDevice,
  removePlantAccess,
  searchRegisteredUsers,
  updatePlant,
  updatePlantAccess,
} = require("../services/plant.service");

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
    if (
      payload[field] === undefined ||
      payload[field] === null ||
      payload[field] === ""
    ) {
      return `${field} is required`;
    }
  }

  if (typeof payload.latitude !== "number" || Number.isNaN(payload.latitude)) {
    return "latitude must be a valid number";
  }
  if (payload.latitude < -90 || payload.latitude > 90) {
    return "latitude must be between -90 and 90";
  }

  if (
    typeof payload.longitude !== "number" ||
    Number.isNaN(payload.longitude)
  ) {
    return "longitude must be a valid number";
  }
  if (payload.longitude < -180 || payload.longitude > 180) {
    return "longitude must be between -180 and 180";
  }

  if (
    typeof payload.pv_capacity !== "number" ||
    Number.isNaN(payload.pv_capacity)
  ) {
    return "pv_capacity must be a valid number";
  }

  if (
    payload.battery_capacity !== undefined &&
    payload.battery_capacity !== null &&
    payload.battery_capacity !== "" &&
    (typeof payload.battery_capacity !== "number" ||
      Number.isNaN(payload.battery_capacity))
  ) {
    return "battery_capacity must be a valid number";
  }

  if (
    payload.electricity_price !== undefined &&
    payload.electricity_price !== null &&
    payload.electricity_price !== "" &&
    (typeof payload.electricity_price !== "number" ||
      Number.isNaN(payload.electricity_price))
  ) {
    return "electricity_price must be a valid number";
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

const getPlantDeviceData = async (req, res) => {
  try {
    const plantId = req.params.id;
    const userId = req.user.userId;

    const allowed = await canViewPlant(userId, plantId);
    if (!allowed) {
      return res.status(403).json({ message: "Access denied" });
    }

    const devices = await getPlantDevices(plantId);
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

const updatePlantData = async (req, res) => {
  try {
    const plantId = req.params.id;
    const userId = req.user.userId;

    const allowed = await canManagePlant(userId, plantId);
    if (!allowed) {
      return res.status(403).json({ message: "Access denied" });
    }

    await updatePlant(plantId, req.body);
    res.json({ status: "updated" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

const deletePlantData = async (req, res) => {
  try {
    const plantId = req.params.id;
    const userId = req.user.userId;

    const allowed = await isPlantOwner(userId, plantId);
    if (!allowed) {
      return res.status(403).json({ message: "Only owner can delete plant" });
    }

    await deletePlantService(plantId);
    res.json({ status: "deleted" });
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

    const allowed = await canManagePlant(userId, plantId);
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

const getPlantAccessData = async (req, res) => {
  try {
    const plantId = req.params.id;
    const userId = req.user.userId;

    const allowed = await canManagePlant(userId, plantId);
    if (!allowed) {
      return res.status(403).json({ message: "Access denied" });
    }

    const users = await getPlantAccessList(plantId);
    res.json({ status: "success", data: users });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

const searchPlantAccessUsers = async (req, res) => {
  try {
    const plantId = req.params.id;
    const userId = req.user.userId;

    const allowed = await canManagePlant(userId, plantId);
    if (!allowed) {
      return res.status(403).json({ message: "Access denied" });
    }

    const users = await searchRegisteredUsers({
      query: req.body.query,
      excludePlantId: plantId,
    });
    res.json({ status: "success", data: users });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

const addPlantAccessUser = async (req, res) => {
  try {
    const plantId = req.params.id;
    const actorId = req.user.userId;

    const allowed = await canManagePlant(actorId, plantId);
    if (!allowed) {
      return res.status(403).json({ message: "Access denied" });
    }

    await addPlantAccess({
      plantId,
      userId: req.body.userId,
      role: req.body.role || "only_view",
    });

    const users = await getPlantAccessList(plantId);
    res.status(201).json({ status: "success", data: users });
  } catch (err) {
    if (err.message === "User_Not_Found") {
      return res.status(404).json({ message: "User not found" });
    }

    if (err.message === "Cannot_Assign_Owner") {
      return res.status(400).json({ message: "Owner role cannot be assigned" });
    }

    res.status(500).json({ message: err.message });
  }
};

const updatePlantAccessUser = async (req, res) => {
  try {
    const plantId = req.params.id;
    const targetUserId = req.params.userId;
    const actorId = req.user.userId;

    const allowed = await canManagePlant(actorId, plantId);
    if (!allowed) {
      return res.status(403).json({ message: "Access denied" });
    }

    await updatePlantAccess({
      plantId,
      userId: targetUserId,
      role: req.body.role,
    });

    const users = await getPlantAccessList(plantId);
    res.json({ status: "success", data: users });
  } catch (err) {
    if (err.message === "Cannot_Modify_Owner") {
      return res.status(400).json({ message: "Owner access cannot be changed" });
    }

    if (err.message === "Access_Not_Found") {
      return res.status(404).json({ message: "Access not found" });
    }

    res.status(500).json({ message: err.message });
  }
};

const removePlantAccessUser = async (req, res) => {
  try {
    const plantId = req.params.id;
    const targetUserId = req.params.userId;
    const actorId = req.user.userId;

    const allowed = await canManagePlant(actorId, plantId);
    if (!allowed) {
      return res.status(403).json({ message: "Access denied" });
    }

    await removePlantAccess({ plantId, userId: targetUserId });
    const users = await getPlantAccessList(plantId);
    res.json({ status: "success", data: users });
  } catch (err) {
    if (err.message === "Cannot_Modify_Owner") {
      return res.status(400).json({ message: "Owner access cannot be removed" });
    }

    if (err.message === "Access_Not_Found") {
      return res.status(404).json({ message: "Access not found" });
    }

    res.status(500).json({ message: err.message });
  }
};

module.exports = {
  createPlant,
  addDeviceToPlant,
  addPlantAccessUser,
  assignUserToPlantByEmail,
  deletePlantData,
  getPlantAccessData,
  getPlantDeviceData,
  getPlantData,
  removeDeviceFromPlant,
  removePlantAccessUser,
  searchPlantAccessUsers,
  updatePlantAccessUser,
  updatePlantData,
};

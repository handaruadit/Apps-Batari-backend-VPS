const db = require("../config/db");
const {
  isRegisteredDevice,
  normalizeDeviceId,
} = require("./deviceRegistry.service");

// CHECK USER PUNYA PLANT
const checkPlantAccess = async (userId, plantId) => {
  const data = await db("user_plants")
    .where({ user_id: userId, plant_id: plantId })
    .first();

  return !!data;
};

// AMBIL DATA PLANT USER
const getPlants = async (userId) => {
  return await db("plants as p")
    .join("user_plants as up", "p.id", "up.plant_id")
    .where("up.user_id", userId)
    .select("p.*", "up.role");
};

// ASSIGN PLANT KE USER
const assignUserToPlant = async (email, plantId, role = "viewer") => {
  const user = await db("users")
    .where({ email })
    .first();

  if (!user) {
    throw new Error("User not found");
  }
  
  return await db("user_plants").insert({
    user_id: user.id,
    plant_id: plantId,
    role,
  });
};

// ASSIGN DEVICE KE PLANT
const assignDeviceToPlant = async (deviceId, plantId, userId) => {
  const normalizedDeviceId = normalizeDeviceId(deviceId);

  if (!normalizedDeviceId) {
    throw new Error("Device_ID_Required");
  }

  const isRegistered = await isRegisteredDevice(normalizedDeviceId);

  if (!isRegistered) {
    throw new Error("Device_Not_Registered");
  }

  return db.transaction(async (trx) => {
    const existingDevice = await trx("plant_devices")
      .where({ device_id: normalizedDeviceId, plant_id: plantId })
      .first();

    const plantDevice =
      existingDevice ||
      (
        await trx("plant_devices")
          .insert({
            device_id: normalizedDeviceId,
            plant_id: plantId,
          })
          .returning("*")
      )[0];

    if (userId) {
      await trx("device_access_permissions")
        .insert({
          user_id: userId,
          plant_id: plantId,
          device_id: normalizedDeviceId,
          allowed: false,
          updated_at: trx.fn.now(),
        })
        .onConflict(["user_id", "plant_id", "device_id"])
        .ignore();
    }

    return plantDevice;
  });
};

const getPlantDevices = async (plantId, userId) => {
  return db("plant_devices as pd")
    .leftJoin("device_access_permissions as dap", function joinPermissions() {
      this.on("dap.plant_id", "=", "pd.plant_id")
        .andOn("dap.device_id", "=", "pd.device_id")
        .andOn("dap.user_id", "=", db.raw("?", [userId]));
    })
    .leftJoin("device_data as dd", "dd.device_id", "pd.device_id")
    .where("pd.plant_id", plantId)
    .select(
      "pd.*",
      db.raw("COALESCE(dap.allowed, false) as allowed"),
      db.raw("MAX(dd.created_at) as latest_data_at"),
    )
    .groupBy("pd.id", "dap.allowed")
    .orderBy("pd.device_id", "asc");
};

// UPDATE PLANT
const updatePlant = async (plantId, data) => {
  return await db("plants")
    .where({ id: plantId })
    .update(data);
};

// CREATE PLANT
const create = async (data, userId) => {
  const [plant] = await db("plants")
      .insert(data)
      .returning("*");
  await db("user_plants").insert({
    user_id: userId,
    plant_id: plant.id,
    role: "owner",
  });

  return [plant];
};

module.exports = {
  checkPlantAccess,
  assignUserToPlant,
  updatePlant,
  assignDeviceToPlant,
  getPlantDevices,
  getPlants,
  create,
};

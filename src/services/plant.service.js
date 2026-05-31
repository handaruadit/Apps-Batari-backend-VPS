const db = require("../config/db");
const {
  normalizeDeviceId,
  registerDevice,
} = require("./deviceRegistry.service");

const ACCESS_ROLES = {
  OWNER: "owner",
  ONLY_VIEW: "viewer",
  CAN_MANAGE: "editor",
};

const normalizeAccessRole = (role) => {
  const normalized = String(role || "")
    .trim()
    .toLowerCase();

  if (normalized === "owner") {
    return ACCESS_ROLES.OWNER;
  }

  if (
    ["editor", "can_manage", "manage_access", "manager"].includes(normalized)
  ) {
    return ACCESS_ROLES.CAN_MANAGE;
  }

  if (["viewer", "only_view", "view_only", "view"].includes(normalized)) {
    return ACCESS_ROLES.ONLY_VIEW;
  }

  return ACCESS_ROLES.ONLY_VIEW;
};

const getRoleFlags = (role) => {
  const normalizedRole = normalizeAccessRole(role);
  const canManage =
    normalizedRole === ACCESS_ROLES.OWNER ||
    normalizedRole === ACCESS_ROLES.CAN_MANAGE;

  return {
    accessRole: normalizedRole,
    canManage,
    canEdit: canManage,
    canAddDatalogger: canManage,
    canDelete: normalizedRole === ACCESS_ROLES.OWNER,
  };
};

// CHECK USER PUNYA PLANT
const checkPlantAccess = async (userId, plantId) => {
  const data = await db("user_plants")
    .where({ user_id: userId, plant_id: plantId })
    .first();

  return !!data;
};

const getPlantAccessRole = async (userId, plantId) => {
  const access = await db("user_plants")
    .where({ user_id: userId, plant_id: plantId })
    .first("role");

  return access ? normalizeAccessRole(access.role) : null;
};

const canViewPlant = async (userId, plantId) => {
  return !!(await getPlantAccessRole(userId, plantId));
};

const canManagePlant = async (userId, plantId) => {
  const role = await getPlantAccessRole(userId, plantId);
  return role === ACCESS_ROLES.OWNER || role === ACCESS_ROLES.CAN_MANAGE;
};

const isPlantOwner = async (userId, plantId) => {
  const role = await getPlantAccessRole(userId, plantId);
  return role === ACCESS_ROLES.OWNER;
};

// AMBIL DATA PLANT USER
const getPlants = async (userId) => {
  const rows = await db("plants as p")
    .join("user_plants as up", "p.id", "up.plant_id")
    .where("up.user_id", userId)
    .select("p.*", "up.role");

  return rows.map((plant) => ({
    ...plant,
    role: normalizeAccessRole(plant.role),
    ...getRoleFlags(plant.role),
  }));
};

// ASSIGN PLANT KE USER
const assignUserToPlant = async (
  email,
  plantId,
  role = ACCESS_ROLES.ONLY_VIEW,
) => {
  const user = await db("users").where({ email }).first();

  if (!user) {
    throw new Error("User not found");
  }

  const accessRole = normalizeAccessRole(role);

  const existing = await db("user_plants")
    .where({ user_id: user.id, plant_id: plantId })
    .first("id");

  if (existing) {
    return db("user_plants")
      .where({ id: existing.id })
      .update({ role: accessRole, updated_at: db.fn.now() });
  }

  return await db("user_plants").insert({
    user_id: user.id,
    plant_id: plantId,
    role: accessRole,
  });
};

// ASSIGN DEVICE KE PLANT
const assignDeviceToPlant = async (deviceId, plantId, userId) => {
  const normalizedDeviceId = normalizeDeviceId(deviceId);

  if (!normalizedDeviceId) {
    throw new Error("Device_ID_Required");
  }

  return db.transaction(async (trx) => {
    await registerDevice(normalizedDeviceId);

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
    return plantDevice;
  });
};

const getPlantDevices = async (plantId) => {
  const devices = await db("plant_devices")
    .where("plant_id", plantId)
    .orderBy("device_id", "asc");

  for (const device of devices) {
    device.latestData = await db("device_data")
      .where("device_id", device.device_id)
      .whereIn("category", ["data_bms", "baterai", "setting_bms"])
      .orderBy("created_at", "desc");
  }

  return devices;
};

// UPDATE PLANT
const updatePlant = async (plantId, data) => {
  return await db("plants").where({ id: plantId }).update(data);
};

const deletePlant = async (plantId) => {
  return db("plants").where({ id: plantId }).del();
};

// CREATE PLANT
const create = async (data, userId) => {
  const [plant] = await db("plants").insert(data).returning("*");
  await db("user_plants").insert({
    user_id: userId,
    plant_id: plant.id,
    role: "owner",
  });

  return [plant];
};

const getPlantAccessList = async (plantId) => {
  const rows = await db("user_plants as up")
    .join("users as u", "u.id", "up.user_id")
    .where("up.plant_id", plantId)
    .select(
      "u.id as userId",
      "u.email",
      "u.phone",
      "up.role",
      "up.created_at as createdAt",
      "up.updated_at as updatedAt",
    )
    .orderByRaw(
      "CASE WHEN up.role = 'owner' THEN 0 WHEN up.role = 'can_manage' THEN 1 ELSE 2 END",
    )
    .orderBy("u.email", "asc");

  return rows.map((row) => ({
    ...row,
    role: normalizeAccessRole(row.role),
  }));
};

const searchRegisteredUsers = async ({ query, excludePlantId }) => {
  const text = String(query || "").trim();

  if (!text) {
    return [];
  }

  const pattern = `%${text}%`;
  const rows = await db("users as u")
    .where((builder) => {
      builder.whereILike("u.email", pattern).orWhereILike("u.phone", pattern);
    })
    .modify((builder) => {
      if (excludePlantId) {
        builder.whereNotExists(function excludeExistingAccess() {
          this.select("*")
            .from("user_plants as up")
            .whereRaw("up.user_id = u.id")
            .where("up.plant_id", excludePlantId);
        });
      }
    })
    .select("u.id as userId", "u.email", "u.phone")
    .limit(20);

  return rows;
};

const addPlantAccess = async ({
  plantId,
  userId,
  role = ACCESS_ROLES.ONLY_VIEW,
}) => {
  const accessRole = normalizeAccessRole(role);

  if (accessRole === ACCESS_ROLES.OWNER) {
    throw new Error("Cannot_Assign_Owner");
  }

  const user = await db("users").where({ id: userId }).first("id");
  if (!user) {
    throw new Error("User_Not_Found");
  }

  const existing = await db("user_plants")
    .where({ plant_id: plantId, user_id: userId })
    .first("id");

  if (existing) {
    const [updatedAccess] = await db("user_plants")
      .where({ id: existing.id })
      .update({ role: accessRole, updated_at: db.fn.now() })
      .returning("*");
    return updatedAccess;
  }

  const [access] = await db("user_plants")
    .insert({
      plant_id: plantId,
      user_id: userId,
      role: accessRole,
    })
    .returning("*");

  return access;
};

const updatePlantAccess = async ({ plantId, userId, role }) => {
  const currentRole = await getPlantAccessRole(userId, plantId);

  if (!currentRole) {
    throw new Error("Access_Not_Found");
  }

  if (currentRole === ACCESS_ROLES.OWNER) {
    throw new Error("Cannot_Modify_Owner");
  }

  const accessRole = normalizeAccessRole(role);

  if (accessRole === ACCESS_ROLES.OWNER) {
    throw new Error("Cannot_Assign_Owner");
  }

  const [access] = await db("user_plants")
    .where({ plant_id: plantId, user_id: userId })
    .update({
      role: accessRole,
      updated_at: db.fn.now(),
    })
    .returning("*");

  return access;
};

const removePlantAccess = async ({ plantId, userId }) => {
  const currentRole = await getPlantAccessRole(userId, plantId);

  if (!currentRole) {
    throw new Error("Access_Not_Found");
  }

  if (currentRole === ACCESS_ROLES.OWNER) {
    throw new Error("Cannot_Modify_Owner");
  }

  return db("user_plants").where({ plant_id: plantId, user_id: userId }).del();
};

module.exports = {
  ACCESS_ROLES,
  checkPlantAccess,
  canManagePlant,
  canViewPlant,
  isPlantOwner,
  assignUserToPlant,
  addPlantAccess,
  deletePlant,
  getPlantAccessList,
  getPlantAccessRole,
  getRoleFlags,
  updatePlant,
  updatePlantAccess,
  assignDeviceToPlant,
  getPlantDevices,
  getPlants,
  removePlantAccess,
  searchRegisteredUsers,
  create,
};

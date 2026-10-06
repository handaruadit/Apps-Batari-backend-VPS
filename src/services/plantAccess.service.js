//===== (Imports) ======
const db = require("../config/db");

//===== (Konstanta Hak Akses) ======
const ACCESS_ROLES = {
  OWNER: "owner",
  ONLY_VIEW: "viewer",
  CAN_MANAGE: "editor",
};

//===== (normalizeAccessRole) ======
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

//===== (getRoleFlags) ======
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

//===== (ensureDeyePlantIntegrated) ======
const ensureDeyePlantIntegrated = async (stationId) => {
  const sId = Number(stationId);
  if (!sId || isNaN(sId)) return null;

  try {
    const existing = await db("deye_integrations")
      .where({ station_id: sId })
      .first("plant_id");
    if (existing?.plant_id) return existing.plant_id;

    // Fetch station details from Deye Cloud API
    let stationData = null;
    try {
      const deyeService = require("../integrations/deye/deye.service");
      const rawList = await deyeService.listStations().catch(() => []);
      stationData = (rawList || []).find((s) => Number(s.stationId || s.id) === sId);
      if (!stationData && typeof deyeService.getStationLatest === "function") {
        stationData = await deyeService.getStationLatest(sId).catch(() => null);
      }
    } catch {
      // Non-fatal
    }

    const stationName = String(
      stationData?.stationName || stationData?.name || `Deye Station #${sId}`
    ).trim();

    // Check if plant with identical or similar name already exists
    const existingByName = await db("plants")
      .whereRaw("LOWER(TRIM(name)) = ?", [stationName.toLowerCase().trim()])
      .first("id");

    let plantId = existingByName?.id;

    if (!plantId) {
      const location = String(
        stationData?.locationAddress ||
          stationData?.address ||
          "Lokasi belum tersedia"
      );
      const lat = Number(stationData?.locationLat || stationData?.latitude || 0);
      const lng = Number(stationData?.locationLng || stationData?.longitude || 0);
      const tz =
        stationData?.regionTimezone ||
        stationData?.timezone ||
        "Asia/Jakarta";
      const cap = Number(
        stationData?.capacity || stationData?.installedCapacity || 0
      );

      const [newPlant] = await db("plants")
        .insert({
          name: stationName,
          location,
          latitude: Number.isFinite(lat) ? lat : 0,
          longitude: Number.isFinite(lng) ? lng : 0,
          timezone: tz,
          system_type: "Deye Cloud",
          pv_capacity: Number.isFinite(cap) ? cap : 0,
          battery_capacity: 0,
          electricity_price: 0,
          currency: "Rp",
          total_saving: 0,
        })
        .returning("*");

      plantId = newPlant?.id;
    }

    if (!plantId) return null;

    // Link in deye_integrations
    const sourceDeviceId = `deye_station_${sId}`;
    await db("deye_integrations")
      .insert({
        plant_id: plantId,
        station_id: sId,
        source_device_id: sourceDeviceId,
        station_name: stationName,
        enabled: true,
        updated_at: db.fn.now(),
      })
      .onConflict("station_id")
      .merge({ plant_id: plantId, updated_at: db.fn.now() });

    // Link device in registered_devices and plant_devices
    await db("registered_devices")
      .insert({ device_id: sourceDeviceId, updated_at: db.fn.now() })
      .onConflict("device_id")
      .ignore();

    await db("plant_devices")
      .insert({ plant_id: plantId, device_id: sourceDeviceId })
      .onConflict(["plant_id", "device_id"])
      .ignore()
      .catch(() => {});

    // Ensure Super Admins have owner access in user_plants
    const superAdmins = await db("users")
      .whereIn("email", [
        "idewanyomanbayusw@gmail.com",
        "admin@batarienergy.com",
      ])
      .select("id");

    for (const sa of superAdmins) {
      await db("user_plants")
        .insert({ user_id: sa.id, plant_id: plantId, role: "owner" })
        .onConflict(["user_id", "plant_id"])
        .ignore();
    }

    return plantId;
  } catch (err) {
    console.warn(`[ensureDeyePlantIntegrated] Warning for station #${stationId}:`, err.message);
    return null;
  }
};

//===== (resolvePlantId) ======
const resolvePlantId = async (rawPlantId) => {
  const numId = Number(rawPlantId);
  if (!numId || isNaN(numId)) return rawPlantId;

  const direct = await db("plants").where({ id: numId }).first("id");
  if (direct) return direct.id;

  if (numId >= 1000000) {
    const integ = await db("deye_integrations").where({ station_id: numId }).first("plant_id");
    if (integ?.plant_id) return integ.plant_id;

    // Auto-integrate unmapped Deye station on-the-fly
    const autoSyncedId = await ensureDeyePlantIntegrated(numId);
    if (autoSyncedId) return autoSyncedId;
  }

  return rawPlantId;
};

//===== (checkPlantAccess) ======
const checkPlantAccess = async (userId, plantId) => {
  const resolvedId = await resolvePlantId(plantId);
  const data = await db("user_plants")
    .where({ user_id: userId, plant_id: resolvedId })
    .first();

  return !!data;
};

//===== (getPlantAccessRole) ======
const getPlantAccessRole = async (userId, plantId) => {
  const resolvedId = await resolvePlantId(plantId);
  const access = await db("user_plants")
    .where({ user_id: userId, plant_id: resolvedId })
    .first("role");

  return access ? normalizeAccessRole(access.role) : null;
};

//===== (canViewPlant) ======
const canViewPlant = async (userId, plantId) => {
  return !!(await getPlantAccessRole(userId, plantId));
};

//===== (canManagePlant) ======
const canManagePlant = async (userId, plantId) => {
  const role = await getPlantAccessRole(userId, plantId);
  return role === ACCESS_ROLES.OWNER || role === ACCESS_ROLES.CAN_MANAGE;
};

//===== (isPlantOwner) ======
const isPlantOwner = async (userId, plantId) => {
  const role = await getPlantAccessRole(userId, plantId);
  return role === ACCESS_ROLES.OWNER;
};

//===== (assignUserToPlant) ======
const assignUserToPlant = async (
  email,
  plantId,
  role = ACCESS_ROLES.ONLY_VIEW,
) => {
  const user = await db("users").where({ email }).first();

  if (!user) {
    throw new Error("User not found");
  }

  const resolvedPlantId = await resolvePlantId(plantId);
  const accessRole = normalizeAccessRole(role);
  const existing = await db("user_plants")
    .where({ user_id: user.id, plant_id: resolvedPlantId })
    .first("id");

  if (existing) {
    return db("user_plants")
      .where({ id: existing.id })
      .update({ role: accessRole });
  }

  return await db("user_plants").insert({
    user_id: user.id,
    plant_id: resolvedPlantId,
    role: accessRole,
  });
};

//===== (getPlantAccessList) ======
const getPlantAccessList = async (plantId) => {
  const resolvedPlantId = await resolvePlantId(plantId);
  const rows = await db("user_plants as up")
    .join("users as u", "u.id", "up.user_id")
    .where("up.plant_id", resolvedPlantId)
    .select(
      "u.id as userId",
      "u.email",
      "u.phone",
      "up.role",
      "up.created_at as createdAt",
    )
    .orderByRaw(
      "CASE WHEN up.role = 'owner' THEN 0 WHEN up.role = 'editor' THEN 1 ELSE 2 END",
    )
    .orderBy("u.email", "asc");

  return rows.map((row) => ({
    ...row,
    role: normalizeAccessRole(row.role),
    updatedAt: row.createdAt,
  }));
};

//===== (searchRegisteredUsers) ======
const searchRegisteredUsers = async ({ query, excludePlantId }) => {
  const text = String(query || "").trim();

  if (!text) {
    return [];
  }

  const resolvedExcludePlantId = excludePlantId
    ? await resolvePlantId(excludePlantId)
    : null;

  const pattern = `%${text}%`;
  const rows = await db("users as u")
    .where((builder) => {
      builder.whereILike("u.email", pattern).orWhereILike("u.phone", pattern);
    })
    .modify((builder) => {
      if (resolvedExcludePlantId) {
        //===== (excludeExistingAccess) ======
        builder.whereNotExists(function excludeExistingAccess() {
          this.select("*")
            .from("user_plants as up")
            .whereRaw("up.user_id = u.id")
            .where("up.plant_id", resolvedExcludePlantId);
        });
      }
    })
    .select("u.id as userId", "u.email", "u.phone")
    .limit(20);

  return rows;
};

//===== (addPlantAccess) ======
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

  const resolvedPlantId = await resolvePlantId(plantId);

  const existing = await db("user_plants")
    .where({ plant_id: resolvedPlantId, user_id: userId })
    .first("id");

  if (existing) {
    const [updatedAccess] = await db("user_plants")
      .where({ id: existing.id })
      .update({ role: accessRole })
      .returning("*");
    return updatedAccess;
  }

  const [access] = await db("user_plants")
    .insert({
      plant_id: resolvedPlantId,
      user_id: userId,
      role: accessRole,
    })
    .returning("*");

  return access;
};

//===== (updatePlantAccess) ======
const updatePlantAccess = async ({ plantId, userId, role }) => {
  const resolvedPlantId = await resolvePlantId(plantId);
  const currentRole = await getPlantAccessRole(userId, resolvedPlantId);

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
    .where({ plant_id: resolvedPlantId, user_id: userId })
    .update({ role: accessRole })
    .returning("*");

  return access;
};

//===== (removePlantAccess) ======
const removePlantAccess = async ({ plantId, userId }) => {
  const resolvedPlantId = await resolvePlantId(plantId);
  const currentRole = await getPlantAccessRole(userId, resolvedPlantId);

  if (!currentRole) {
    throw new Error("Access_Not_Found");
  }

  if (currentRole === ACCESS_ROLES.OWNER) {
    throw new Error("Cannot_Modify_Owner");
  }

  return db("user_plants").where({ plant_id: resolvedPlantId, user_id: userId }).del();
};

//===== (Exports) ======
module.exports = {
  ACCESS_ROLES,
  addPlantAccess,
  assignUserToPlant,
  canManagePlant,
  canViewPlant,
  checkPlantAccess,
  getPlantAccessList,
  getPlantAccessRole,
  getRoleFlags,
  isPlantOwner,
  normalizeAccessRole,
  removePlantAccess,
  searchRegisteredUsers,
  updatePlantAccess,
};

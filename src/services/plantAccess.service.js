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

//===== (resolvePlantId) ======
const resolvePlantId = async (rawPlantId) => {
  const numId = Number(rawPlantId);
  if (!numId || isNaN(numId)) return rawPlantId;

  const direct = await db("plants").where({ id: numId }).first("id");
  if (direct) return direct.id;

  if (numId >= 1000000) {
    const integ = await db("deye_integrations").where({ station_id: numId }).first("plant_id");
    if (integ?.plant_id) return integ.plant_id;
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

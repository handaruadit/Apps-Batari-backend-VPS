//===== (Imports) ======
const db = require("../config/db");
const {
  getRoleFlags,
  normalizeAccessRole,
} = require("./plantAccess.service");

const isValidUuid = (str) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    String(str || "")
  );

//===== (getPlants) ======
const getPlants = async (userId, isAdmin = false) => {
  const safeUserId = isValidUuid(userId) ? userId : null;
  const query = isAdmin
    ? `
    SELECT
      p.*,
      di.station_id as deye_station_id,
      COALESCE(up.role, 'owner') as role,
      (
        SELECT MAX(sub.ts)
        FROM (
          SELECT MAX(d.created_at) as ts
          FROM plant_devices pd
          JOIN device_data d ON d.device_id = pd.device_id
          WHERE pd.plant_id = p.id
          UNION ALL
          SELECT di.last_source_timestamp as ts
          FROM deye_integrations di
          WHERE di.plant_id = p.id
          UNION ALL
          SELECT di.last_synced_at as ts
          FROM deye_integrations di
          WHERE di.plant_id = p.id
          UNION ALL
          SELECT dd.last_seen as ts
          FROM plant_devices pd
          JOIN deye_devices dd ON dd.device_sn = pd.device_id
          WHERE pd.plant_id = p.id
        ) sub
      ) as latest_data_at,
      EXISTS(
        SELECT 1 FROM plant_devices pd WHERE pd.plant_id = p.id
      ) as has_devices
    FROM plants p
    LEFT JOIN deye_integrations di ON di.plant_id = p.id
    LEFT JOIN user_plants up ON p.id = up.plant_id AND up.user_id = ?::uuid
    ORDER BY p.id ASC
    `
    : `
    SELECT
      p.*,
      di.station_id as deye_station_id,
      up.role,
      (
        SELECT MAX(sub.ts)
        FROM (
          SELECT MAX(d.created_at) as ts
          FROM plant_devices pd
          JOIN device_data d ON d.device_id = pd.device_id
          WHERE pd.plant_id = p.id
          UNION ALL
          SELECT di.last_source_timestamp as ts
          FROM deye_integrations di
          WHERE di.plant_id = p.id
          UNION ALL
          SELECT di.last_synced_at as ts
          FROM deye_integrations di
          WHERE di.plant_id = p.id
          UNION ALL
          SELECT dd.last_seen as ts
          FROM plant_devices pd
          JOIN deye_devices dd ON dd.device_sn = pd.device_id
          WHERE pd.plant_id = p.id
        ) sub
      ) as latest_data_at,
      EXISTS(
        SELECT 1 FROM plant_devices pd WHERE pd.plant_id = p.id
      ) as has_devices
    FROM plants p
    LEFT JOIN deye_integrations di ON di.plant_id = p.id
    JOIN user_plants up ON p.id = up.plant_id
    WHERE up.user_id = ?::uuid
    ORDER BY p.id ASC
    `;

  const result = await db.raw(query, [safeUserId]);

  return result.rows.map((plant) => {
    const roleFlags = getRoleFlags(plant.role);
    return {
      ...plant,
      role: normalizeAccessRole(plant.role),
      accessRole: normalizeAccessRole(plant.role),
      canManage: isAdmin || roleFlags.canManage,
      canEdit: isAdmin || roleFlags.canEdit,
      canAddDatalogger: isAdmin || roleFlags.canAddDatalogger,
      canDelete: isAdmin || roleFlags.canDelete,
    };
  });
};

//===== (getPlantById) ======
const getPlantById = async (plantId) => {
  return db("plants")
    .select("id", "name", "location", "city", "province")
    .where({ id: plantId })
    .first();
};

//===== (updatePlant) ======
const updatePlant = async (plantId, data) => {
  const allowed = [
    "name",
    "location",
    "latitude",
    "longitude",
    "system_type",
    "pv_capacity",
    "battery_capacity",
    "electricity_price",
    "currency",
    "city",
    "province",
    "postal_code",
  ];
  const payload = {};
  for (const key of allowed) {
    if (data[key] !== undefined) payload[key] = data[key];
  }
  return await db("plants").where({ id: plantId }).update(payload);
};

//===== (deletePlant) ======
const deletePlant = async (plantId) => {
  return db.transaction(async (trx) => {
    await trx("user_plants").where({ plant_id: plantId }).del();
    await trx("plant_devices").where({ plant_id: plantId }).del();
    await trx("device_access_permissions").where({ plant_id: plantId }).del();
    await trx("deye_integrations").where({ plant_id: plantId }).del();
    return trx("plants").where({ id: plantId }).del();
  });
};

//===== (create) ======
const create = async (data, userId) => {
  return await db.transaction(async (trx) => {
    const [plant] = await trx("plants").insert(data).returning("*");
    await trx("user_plants").insert({
      user_id: userId,
      plant_id: plant.id,
      role: "owner",
    });

    return [plant];
  });
};

//===== (Exports) ======
module.exports = {
  create,
  deletePlant,
  getPlantById,
  getPlants,
  updatePlant,
};

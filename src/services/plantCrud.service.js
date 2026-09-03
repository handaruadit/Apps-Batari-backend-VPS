//===== (Imports) ======
const db = require("../config/db");
const {
  getRoleFlags,
  normalizeAccessRole,
} = require("./plantAccess.service");

//===== (getPlants) ======
const getPlants = async (userId) => {
  const result = await db.raw(
    `
    SELECT
      p.*,
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
    JOIN user_plants up ON p.id = up.plant_id
    WHERE up.user_id = ?
    ORDER BY p.id ASC
    `,
    [userId],
  );

  return result.rows.map((plant) => ({
    ...plant,
    role: normalizeAccessRole(plant.role),
    ...getRoleFlags(plant.role),
  }));
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
  return await db("plants").where({ id: plantId }).update(data);
};

//===== (deletePlant) ======
const deletePlant = async (plantId) => {
  return db("plants").where({ id: plantId }).del();
};

//===== (create) ======
const create = async (data, userId) => {
  const [plant] = await db("plants").insert(data).returning("*");
  await db("user_plants").insert({
    user_id: userId,
    plant_id: plant.id,
    role: "owner",
  });

  return [plant];
};

//===== (Exports) ======
module.exports = {
  create,
  deletePlant,
  getPlantById,
  getPlants,
  updatePlant,
};

//===== (Imports) ======
const db = require("../config/db");
const {
  getRoleFlags,
  normalizeAccessRole,
} = require("./plantAccess.service");

//===== (getPlants) ======
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

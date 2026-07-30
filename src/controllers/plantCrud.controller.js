//===== (Imports) ======
const {
  canManagePlant,
  isPlantOwner,
} = require("../services/plantAccess.service");
const {
  create,
  deletePlant: deletePlantService,
  getPlants,
  updatePlant,
} = require("../services/plantCrud.service");
const {
  validatePlantCreatePayload,
} = require("../validators/plant.validator");

//===== (createPlant) ======
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

//===== (updatePlantData) ======
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

//===== (deletePlantData) ======
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

//===== (getPlantData) ======
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

//===== (Exports) ======
module.exports = {
  createPlant,
  deletePlantData,
  getPlantData,
  updatePlantData,
};

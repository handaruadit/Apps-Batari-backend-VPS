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

//===== (createPlant) ======
const createPlant = async (req, res) => {
  try {
    const validationError = validatePlantCreatePayload(req.body);
    if (validationError) {
      return res.status(400).json({ message: validationError });
    }

    const userId = req.user?.userId || req.user?.id;
    if (!userId) {
      return res.status(401).json({ message: "User ID not found in token. Please log in again." });
    }

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
    const userId = req.user?.userId || req.user?.id;
    const isAdmin = checkIsAdmin(req);

    const allowed = isAdmin || (await canManagePlant(userId, plantId));
    if (!allowed) {
      return res.status(403).json({ message: "Access denied" });
    }

    await updatePlant(plantId, req.body);
    res.json({ status: "updated", success: true });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

//===== (deletePlantData) ======
const deletePlantData = async (req, res) => {
  try {
    const plantId = req.params.id;
    const userId = req.user?.userId || req.user?.id;
    const isAdmin = checkIsAdmin(req);

    const allowed = isAdmin || (await isPlantOwner(userId, plantId));
    if (!allowed) {
      return res.status(403).json({ message: "Only owner can delete plant" });
    }

    await deletePlantService(plantId);
    res.json({ status: "deleted", success: true, message: `Plant ${plantId} deleted successfully` });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

//===== (getPlantData) ======
const getPlantData = async (req, res) => {
  try {
    const userId = req.user?.userId || req.user?.id;
    const isAdmin = checkIsAdmin(req);
    const data = await getPlants(userId, isAdmin);

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

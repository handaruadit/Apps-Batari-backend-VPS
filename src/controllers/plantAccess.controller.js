//===== (Imports) ======
const {
  addPlantAccess,
  assignUserToPlant,
  canManagePlant,
  getPlantAccessList,
  removePlantAccess,
  searchRegisteredUsers,
  updatePlantAccess,
} = require("../services/plantAccess.service");
const {
  validateAssignUserPayload,
} = require("../validators/plant.validator");

//===== (assignUserToPlantByEmail) ======
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

//===== (getPlantAccessData) ======
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

//===== (searchPlantAccessUsers) ======
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

//===== (addPlantAccessUser) ======
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

//===== (updatePlantAccessUser) ======
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

//===== (removePlantAccessUser) ======
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

//===== (Exports) ======
module.exports = {
  addPlantAccessUser,
  assignUserToPlantByEmail,
  getPlantAccessData,
  removePlantAccessUser,
  searchPlantAccessUsers,
  updatePlantAccessUser,
};

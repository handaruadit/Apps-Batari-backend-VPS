const router = require("express").Router();
const auth = require("../middlewares/auth.middleware");
const {
  addDeviceToPlant,
  addPlantAccessUser,
  assignUserToPlantByEmail,
  createPlant,
  deletePlantData,
  getPlantAccessData,
  getPlantData,
  getPlantDeviceData,
  removePlantAccessUser,
  searchPlantAccessUsers,
  updatePlantAccessUser,
  updatePlantData,
} = require("../controllers/plant.controller");

// create plant
router.post("/create", auth, createPlant);

// legacy assign user to plant
router.post("/assign-user", auth, assignUserToPlantByEmail);

// legacy assign device to plant
router.post("/assign-device", auth, addDeviceToPlant);

// plant access management
router.get("/:id/access", auth, getPlantAccessData);
router.post("/:id/access/search", auth, searchPlantAccessUsers);
router.post("/:id/access", auth, addPlantAccessUser);
router.patch("/:id/access/:userId", auth, updatePlantAccessUser);
router.delete("/:id/access/:userId", auth, removePlantAccessUser);

// plant devices
router.post("/:id/device", auth, addDeviceToPlant);
router.get("/:id/devices", auth, getPlantDeviceData);

// update/delete plant
router.put("/:id", auth, updatePlantData);
router.delete("/:id", auth, deletePlantData);

// get plant data
router.get("/", auth, getPlantData);

module.exports = router;

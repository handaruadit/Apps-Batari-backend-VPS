const router = require("express").Router();
const auth = require("../middlewares/auth.middleware");
const { generalLimiter } = require("../middlewares/rate.middleware");
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
router.post("/create", auth, generalLimiter, createPlant);

// legacy assign user to plant
router.post("/assign-user", auth, generalLimiter, assignUserToPlantByEmail);

// legacy assign device to plant
router.post("/assign-device", auth, generalLimiter, addDeviceToPlant);

// plant access management
router.get("/:id/access", auth, getPlantAccessData);
router.post("/:id/access/search", auth, generalLimiter, searchPlantAccessUsers);
router.post("/:id/access", auth, generalLimiter, addPlantAccessUser);
router.patch("/:id/access/:userId", auth, generalLimiter, updatePlantAccessUser);
router.delete("/:id/access/:userId", auth, generalLimiter, removePlantAccessUser);

// plant devices
router.post("/:id/device", auth, generalLimiter, addDeviceToPlant);
router.get("/:id/devices", auth, generalLimiter, getPlantDeviceData);

// update/delete plant
router.put("/:id", auth, generalLimiter, updatePlantData);
router.delete("/:id", auth, generalLimiter, deletePlantData);

// get plant data
router.get("/", auth, generalLimiter, getPlantData);

module.exports = router;

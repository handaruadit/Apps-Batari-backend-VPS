//===== (Imports) ======
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
  removeDeviceFromPlant,
  removePlantAccessUser,
  searchPlantAccessUsers,
  updatePlantAccessUser,
  updatePlantData,
} = require("../controllers/plant.controller");

//===== (Create Plant Route) ======
router.post("/create", auth, createPlant);

//===== (Legacy User Assignment Route) ======
router.post("/assign-user", auth, assignUserToPlantByEmail);

//===== (Legacy Device Assignment Route) ======
router.post("/assign-device", auth, addDeviceToPlant);

//===== (Plant Access Routes) ======
router.get("/:id/access", auth, getPlantAccessData);
router.post("/:id/access/search", auth, searchPlantAccessUsers);
router.post("/:id/access", auth, addPlantAccessUser);
router.patch("/:id/access/:userId", auth, updatePlantAccessUser);
router.delete("/:id/access/:userId", auth, removePlantAccessUser);

//===== (Plant Device Routes) ======
router.post("/:id/device", auth, addDeviceToPlant);
router.get("/:id/devices", auth, getPlantDeviceData);
router.delete("/:id/device/:deviceId", auth, removeDeviceFromPlant);

//===== (Plant Mutation Routes) ======
router.put("/:id", auth, updatePlantData);
router.delete("/:id", auth, deletePlantData);

//===== (Plant List Route) ======
router.get("/", auth, getPlantData);

//===== (Exports) ======
module.exports = router;

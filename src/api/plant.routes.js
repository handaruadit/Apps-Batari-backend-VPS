const router = require("express").Router();
const auth = require("../middlewares/auth.middleware");
const { updatePlant } = require("../services/plant.service");
const { createPlant, assignUserToPlantByEmail } = require("../controllers/plant.controller");
const { addDeviceToPlant } = require("../controllers/plant.controller");
const { getPlantDeviceData } = require("../controllers/plant.controller");
const { getPlantData } = require("../controllers/plant.controller");

// update plant
router.put("/:id", auth, async (req, res) => {
  await updatePlant(req.params.id, req.body);
  res.json({ status: "updated" });
});

// create plant
router.post("/create", auth, createPlant);

// assign user to plant
router.post("/assign-user", auth, assignUserToPlantByEmail);

// assign device to plant
router.post("/assign-device", auth, addDeviceToPlant);
router.post("/:id/device", auth, addDeviceToPlant);
router.get("/:id/devices", auth, getPlantDeviceData);

// get plant data
router.get("/", auth, getPlantData);

module.exports = router;

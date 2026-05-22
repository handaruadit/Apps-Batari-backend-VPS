const router = require("express").Router();
const requireAdmin = require("../middlewares/requireAdmin");
const {
  createRegisteredDevice,
  getDeviceAccess,
  listRegisteredDevices,
  updateDeviceAccess,
} = require("../controllers/admin.controller");

router.get("/devices", requireAdmin, listRegisteredDevices);
router.post("/devices", requireAdmin, createRegisteredDevice);
router.get("/device-access", requireAdmin, getDeviceAccess);
router.patch("/device-access", requireAdmin, updateDeviceAccess);

module.exports = router;

const router = require("express").Router();
const requireAdmin = require("../middlewares/requireAdmin");
const {
  getDeviceAccess,
  updateDeviceAccess,
} = require("../controllers/admin.controller");

router.get("/device-access", requireAdmin, getDeviceAccess);
router.patch("/device-access", requireAdmin, updateDeviceAccess);

module.exports = router;

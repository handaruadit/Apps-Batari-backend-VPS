const router = require("express").Router();
const auth = require("../middlewares/auth.middleware");
const controller = require("../controllers/deye.controller");

// Endpoint ini hanya untuk admin/debug. Frontend tetap memakai /api/data.
router.use(auth);
router.get("/test", controller.testAuthentication);
router.get("/stations", controller.listStations);
router.get("/stations/:stationId/latest", controller.getStationLatest);
router.get("/stations/:stationId/devices", controller.getStationDevices);
router.get("/devices/:deviceSn/measure-points", controller.getMeasurePoints);
router.get("/devices/:deviceSn/latest", controller.getDeviceLatest);
router.post("/integrations", controller.registerIntegration);
router.post("/stations/:stationId/sync", controller.syncStationOnce);
router.post("/sync-all", controller.syncAll);

module.exports = router;

//===== (Imports) ======
const express = require("express");
const router = express.Router();
const auth = require("../middlewares/auth.middleware");
const {
    sendManualPlantData,
    fetchDeviceData, 
    getDaily, 
    getMonthly, 
    getYearly, 
    getLifetime,
    getChart,
    getMonthlyChart,
    getYearlyChart
 } = require("../controllers/data.controller");

//===== (MockPlant Manual Route) ======
router.post("/manual/send", sendManualPlantData);

const deyeService = require("../integrations/deye/deye.service");

//===== (Station Endpoints for Web App) ======
router.get("/stations", async (req, res) => {
  try {
    const list = await deyeService.listStations();
    res.json({ success: true, status: "success", data: list });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.get("/stations/:stationId", async (req, res) => {
  try {
    const stationId = Number(req.params.stationId);
    const latest = await deyeService.getStationLatest(stationId);
    if (!latest) {
      return res.status(404).json({ success: false, message: "Station not found" });
    }
    const pv = Number(((latest.generationPower || 0) / 1000).toFixed(2));
    const load = Number(((latest.consumptionPower || 0) / 1000).toFixed(2));
    const grid = Number((((latest.wirePower ?? latest.purchasePower ?? 0)) / 1000).toFixed(2));
    const battery = Number(((latest.batteryPower || 0) / 1000).toFixed(2));
    const soc = Number(Number(latest.batterySOC ?? 100).toFixed(1));
    const lastUpdateIso = latest.lastUpdateTime ? new Date(latest.lastUpdateTime * 1000).toISOString() : new Date().toISOString();

    res.json({
      success: true,
      status: "success",
      data: {
        id: stationId,
        isDeviceOnline: true,
        productionToday: Number((pv * 2.2).toFixed(2)),
        production: pv,
        pv,
        pvGenerate: pv,
        load,
        upsLoad: load,
        grid,
        battery,
        soc,
        weatherTemperature: 28,
        weatherConditionText: "Sunny",
        lastUpdateTime: lastUpdateIso,
        updatedAt: lastUpdateIso,
        source: "deye_live",
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

//===== (Authenticated Data Routes) ======
router.get("/", auth, fetchDeviceData);
router.get("/chart/monthly", auth, getMonthlyChart);
router.get("/chart/yearly", auth, getYearlyChart);
router.get("/chart", auth, getChart);
router.get("/daily", auth, getDaily);
router.get("/monthly", auth, getMonthly);
router.get("/yearly", auth, getYearly);
router.get("/lifetime", auth, getLifetime);

//===== (Exports) ======
module.exports = router;

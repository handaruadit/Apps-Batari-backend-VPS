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

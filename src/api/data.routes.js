const express = require("express");
const router = express.Router();
const auth = require("../middlewares/auth.middleware");
const { generalLimiter } = require("../middlewares/rate.middleware");
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

// POST manual send endpoint for testing
router.post("/manual/send", generalLimiter, sendManualPlantData);

// GET data endpoint
router.get("/", auth, fetchDeviceData);
router.get("/chart/monthly", auth, getMonthlyChart);
router.get("/chart/yearly", auth, getYearlyChart);
router.get("/chart", auth, getChart);
router.get("/daily", auth, getDaily);
router.get("/monthly", auth, getMonthly);
router.get("/yearly", auth, getYearly);
router.get("/lifetime", auth, getLifetime);


module.exports = router;

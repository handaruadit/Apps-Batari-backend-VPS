const express = require("express");
const router = express.Router();
const auth = require("../middlewares/auth.middleware");
const { 
    sendManualPlantData,
    fetchDeviceData, 
    getDaily, 
    getMonthly, 
    getYearly, 
    getLifetime
 } = require("../controllers/data.controller");

// POST manual send endpoint for testing
router.post("/manual/send", sendManualPlantData);

// GET data endpoint
router.get("/", auth, fetchDeviceData);
router.get("/daily", auth, getDaily);
router.get("/monthly", auth, getMonthly);
router.get("/yearly", auth, getYearly);
router.get("/lifetime", auth, getLifetime);


module.exports = router;

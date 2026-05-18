const { 
    getDeviceData, 
    getDailyData, 
    getMonthlyData, 
    getYearlyData, 
    getLifetimeData, 
    getChartData,
    getMonthlyChartData,
    getYearlyChartData,
    getLatestEnergyData,
    formatDeviceDataForResponse,
    getDeviceIdData } = require("../services/data.service");
const {
    sendManualPlantData: sendManualPlantDataService,
} = require("../services/mockPlantData.service");
// const { formatByType } = require("../services/data.service");

const pickBodyValue = (body, keys) => {
    for (const key of keys) {
        if (body[key] !== undefined && body[key] !== null && body[key] !== "") {
            return body[key];
        }
    }

    return undefined;
};

const parseRequiredMetric = (body, keys, label) => {
    const rawValue = pickBodyValue(body, keys);

    if (rawValue === undefined) {
        return { error: `${label} is required` };
    }

    const numericValue = Number(rawValue);

    if (!Number.isFinite(numericValue)) {
        return { error: `${label} must be a valid number` };
    }

    return { value: numericValue };
};

const parseOptionalMetric = (body, keys, label) => {
    const rawValue = pickBodyValue(body, keys);

    if (rawValue === undefined) {
        return {};
    }

    const numericValue = Number(rawValue);

    if (!Number.isFinite(numericValue)) {
        return { error: `${label} must be a valid number` };
    }

    return { value: numericValue };
};

const fetchDeviceData = async (req, res) => {
    try {
        const { plantId, category, limit, startDate, endDate, latestBy } = req.query;
        const userId = req.user.userId;

        if (!plantId) {
            return res.status(400).json({
                status: "error",
                message: "plantId is required",
            });
        }

        const deviceIds = await getDeviceIdData(userId, plantId);
        console.log("🔍 Device IDs:", deviceIds);

        if (!deviceIds || deviceIds.length === 0) {
            return res.status(404).json({
                status: "error",
                message: "No devices found for the specified plant",
            });
        }

        const types = req.query.type ? req.query.type.split(",") : null;

        let start, end;
        if (startDate && endDate) {
            start = new Date(startDate);
            end = new Date(endDate);
        }

        const data = await getDeviceData({
            deviceIds: deviceIds.map((d) => d.device_id),
            category,
            types,
            startDate: start,
            endDate: end,
            latestBy,
            limit: limit ? parseInt(limit) : undefined,
        });
        const latestEnergy = await getLatestEnergyData({
            deviceIds: deviceIds.map((d) => d.device_id),
        });

        const formatted = data.reduce((accumulator, currentItem) => {
            const cat = currentItem.category;
            if (!accumulator[cat]) {
                accumulator[cat] = {};
            }
            accumulator[cat][currentItem.type] = formatDeviceDataForResponse(currentItem);
            return accumulator;
        }, {});

        res.json({
            status: "success",
            count: data.length,
            data: formatted,
            ...latestEnergy,
        });

    } catch (err) {
        console.error("Error fetching device data:", err);
        res.status(500).json({ 
            status: "error", 
            message: "Internal server error" 
        });
    }
};

const getDaily = async (req, res) => {
    try {
        const { plantId, date, category } = req.query;
        const userId = req.user.userId;
        if (!plantId) {
            return res.status(400).json({
                status: "error",
                message: "plantId is required",
            });
        }

        const deviceIds = await getDeviceIdData(userId, plantId);

        if (!deviceIds || deviceIds.length === 0) {
            return res.status(404).json({
                status: "error",
                message: "No devices found for the specified plant",
            });
        }

        if (!date) {
            return res.status(400).json({
                status: "error",
                message: "date is required (Format: YYYY-MM-DD)",
            });
        }

        const types = req.query.type ? req.query.type.split(",") : null;

        const data = await getDailyData({
            deviceId: deviceIds.map((d) => d.device_id),
            date,
            category,
            types,
        });

        const formatted = data.reduce((accumulator, currentItem) => {
            const cat = currentItem.category;
            if (!accumulator[cat]) {
                accumulator[cat] = {};
            }
            accumulator[cat][currentItem.type] = currentItem;
            return accumulator;
        }, {});

        res.json({
            status: "success",
            data: formatted,
        });
    } catch (err) {
        res.status(500).json({ status: "error" });
    }
};

const getMonthly = async (req, res) => {
    try {
        const { plantId, date, category } = req.query;
        const userId = req.user.userId;
        if (!plantId) {
            return res.status(400).json({
                status: "error",
                message: "plantId is required",
            });
        }

        const deviceIds = await getDeviceIdData(userId, plantId);

        if (!deviceIds || deviceIds.length === 0) {
            return res.status(404).json({
                status: "error",
                message: "No devices found for the specified plant",
            });
        }

        if (!date) {
            return res.status(400).json({
                status: "error",
                message: "date is required (Format: YYYY-MM)",
            });
        }

        const types = req.query.type ? req.query.type.split(",") : null;

        const data = await getMonthlyData({
            deviceId: deviceIds.map((d) => d.device_id),
            month:date,
            category,
            types,
        });

        const formatted = data.reduce((accumulator, currentItem) => {
            const cat = currentItem.category;
            if (!accumulator[cat]) {
                accumulator[cat] = {};
            }
            accumulator[cat][currentItem.type] = currentItem;
            return accumulator;
        }, {});

        res.json({
            status: "success",
            data: formatted,
        });

    } catch (err) {
        res.status(500).json({ status: "error" });
    }
};

const getYearly = async (req, res) => {
    try {
        const { plantId, date, category } = req.query;
        const userId = req.user.userId;
        if (!plantId) {
            return res.status(400).json({
                status: "error",
                message: "plantId is required",
            });
        }

        const deviceIds = await getDeviceIdData(userId, plantId);

        if (!deviceIds || deviceIds.length === 0) {
            return res.status(404).json({
                status: "error",
                message: "No devices found for the specified plant",
            });
        }

        if (!date) {
            return res.status(400).json({
                status: "error",
                message: "date is required (Format: YYYY)",
            });
        }

        const types = req.query.type ? req.query.type.split(",") : null;

        const data = await getYearlyData({
            deviceId: deviceIds.map((d) => d.device_id),
            year: date,
            category,
            types,
        });

        const formatted = data.reduce((accumulator, currentItem) => {
            const cat = currentItem.category;
            if (!accumulator[cat]) {
                accumulator[cat] = {};
            }
            accumulator[cat][currentItem.type] = currentItem;
            return accumulator;
        }, {});

        res.json({
            status: "success",
            data: formatted,
        });
    } catch (err) {res.status(500).json({ status: err.message });}
};

const getLifetime = async (req, res) => {
    try {
        const { plantId, category } = req.query;
        const userId = req.user.userId;
        if (!plantId) {
            return res.status(400).json({
                status: "error",
                message: "plantId is required",
            });
        }

        const deviceIds = await getDeviceIdData(userId, plantId);

        if (!deviceIds || deviceIds.length === 0) {
            return res.status(404).json({
                status: "error",
                message: "No devices found for the specified plant",
            });
        }

        const types = req.query.type ? req.query.type.split(",") : null;

        const data = await getLifetimeData({
            deviceId: deviceIds.map((d) => d.device_id),
            category,
            types,
        });

        // const formatted = formatByType(data, "date");

        res.json({
            status: "success",
            data,
        });
    } catch (err) {res.status(500).json({ status: "error" });}
};

const getChart = async (req, res) => {
    try {
        const { plantId, segment = "day", date } = req.query;
        const userId = req.user.userId;

        if (!plantId) {
            return res.status(400).json({
                success: false,
                status: "error",
                message: "plantId is required",
            });
        }

        const deviceIds = await getDeviceIdData(userId, plantId);

        if (!deviceIds || deviceIds.length === 0) {
            return res.status(404).json({
                success: false,
                status: "error",
                message: "No devices found for the specified plant",
            });
        }

        const chartResult = await getChartData({
            plantId,
            deviceIds: deviceIds.map((d) => d.device_id),
            segment,
            date,
        });

        console.log("Chart data response:", {
            userId,
            plantId,
            segment,
            date,
            range: chartResult.range,
            source: chartResult.source,
            rowCount: chartResult.rowCount,
            counts: chartResult.counts,
        });

        res.json({
            success: true,
            status: "success",
            source: chartResult.source,
            data: chartResult.data,
        });
    } catch (err) {
        if (err.message === "Access_Denied") {
            return res.status(403).json({
                success: false,
                status: "error",
                message: "Access denied",
            });
        }

        if (err.message === "Data_Not_Found") {
            return res.status(404).json({
                success: false,
                status: "error",
                message: "No devices found for the specified plant",
            });
        }

        if (
            err.message === "Invalid_Chart_Segment" ||
            err.message === "Invalid_Chart_Date"
        ) {
            return res.status(400).json({
                success: false,
                status: "error",
                message: "Invalid chart segment or date",
            });
        }

        console.error("Error fetching chart data:", err);
        res.status(500).json({
            success: false,
            status: "error",
            message: "Internal server error",
        });
    }
};

const getMonthlyChart = async (req, res) => {
    try {
        const { plantId, month, date } = req.query;
        const userId = req.user.userId;
        const requestedMonth = month || date;

        if (!plantId) {
            return res.status(400).json({
                success: false,
                status: "error",
                message: "plantId is required",
            });
        }

        if (!requestedMonth) {
            return res.status(400).json({
                success: false,
                status: "error",
                message: "month is required (Format: YYYY-MM)",
            });
        }

        const deviceIds = await getDeviceIdData(userId, plantId);
        const data = await getMonthlyChartData({
            deviceIds: deviceIds.map((d) => d.device_id),
            month: requestedMonth,
        });

        res.json({
            success: true,
            status: "success",
            data,
        });
    } catch (err) {
        if (err.message === "Access_Denied") {
            return res.status(403).json({
                success: false,
                status: "error",
                message: "Access denied",
            });
        }

        if (err.message === "Data_Not_Found") {
            return res.status(404).json({
                success: false,
                status: "error",
                message: "No devices found for the specified plant",
            });
        }

        if (err.message === "Invalid_Chart_Date") {
            return res.status(400).json({
                success: false,
                status: "error",
                message: "Invalid month",
            });
        }

        console.error("Error fetching monthly chart data:", err);
        res.status(500).json({
            success: false,
            status: "error",
            message: "Internal server error",
        });
    }
};

const getYearlyChart = async (req, res) => {
    try {
        const { plantId, year, date } = req.query;
        const userId = req.user.userId;
        const requestedYear = year || date;

        if (!plantId) {
            return res.status(400).json({
                success: false,
                status: "error",
                message: "plantId is required",
            });
        }

        if (!requestedYear) {
            return res.status(400).json({
                success: false,
                status: "error",
                message: "year is required (Format: YYYY)",
            });
        }

        const deviceIds = await getDeviceIdData(userId, plantId);
        const data = await getYearlyChartData({
            deviceIds: deviceIds.map((d) => d.device_id),
            year: requestedYear,
        });

        res.json({
            success: true,
            status: "success",
            data,
        });
    } catch (err) {
        if (err.message === "Access_Denied") {
            return res.status(403).json({
                success: false,
                status: "error",
                message: "Access denied",
            });
        }

        if (err.message === "Data_Not_Found") {
            return res.status(404).json({
                success: false,
                status: "error",
                message: "No devices found for the specified plant",
            });
        }

        if (err.message === "Invalid_Chart_Date") {
            return res.status(400).json({
                success: false,
                status: "error",
                message: "Invalid year",
            });
        }

        console.error("Error fetching yearly chart data:", err);
        res.status(500).json({
            success: false,
            status: "error",
            message: "Internal server error",
        });
    }
};

const sendManualPlantData = async (req, res) => {
    try {
        const metrics = {};
        const fieldConfig = [
            { target: "pv", keys: ["pv", "PV"], label: "PV" },
            { target: "battery", keys: ["battery", "Battery"], label: "Battery" },
            { target: "grid", keys: ["grid", "Grid"], label: "Grid" },
            { target: "production", keys: ["production", "Production"], label: "Production" },
            {
                target: "upsLoad",
                keys: ["upsLoad", "ups_load", "ups-load", "UPS-load", "UPSLoad"],
                label: "UPS-load",
            },
            { target: "load", keys: ["load", "Load"], label: "Load" },
        ];

        for (const field of fieldConfig) {
            const parsed = parseRequiredMetric(req.body, field.keys, field.label);

            if (parsed.error) {
                return res.status(400).json({
                    status: "error",
                    message: parsed.error,
                });
            }

            metrics[field.target] = parsed.value;
        }

        const optionalFieldConfig = [
            {
                target: "pvGenerate",
                keys: ["pvGenerate", "pv_generate", "PVGenerate", "PV Generate"],
                label: "PV Generate",
            },
            { target: "export", keys: ["export", "Export"], label: "Export" },
            { target: "charge", keys: ["charge", "Charge"], label: "Charge" },
        ];

        for (const field of optionalFieldConfig) {
            const parsed = parseOptionalMetric(req.body, field.keys, field.label);

            if (parsed.error) {
                return res.status(400).json({
                    status: "error",
                    message: parsed.error,
                });
            }

            if (parsed.value !== undefined) {
                metrics[field.target] = parsed.value;
            }
        }

        const result = await sendManualPlantDataService({
            plantId: pickBodyValue(req.body, ["plantId", "plant_id"]),
            plantName: pickBodyValue(req.body, ["plantName", "plant_name", "name"]),
            deviceId: pickBodyValue(req.body, ["deviceId", "device_id"]),
            strictPlantName: req.body.strictPlantName === true || req.body.strict_plant_name === true,
            strictDevice: req.body.strictDevice === true || req.body.strict_device === true,
            timestamp: req.body.timestamp,
            createdAt: req.body.createdAt || req.body.created_at,
            time: req.body.time,
            jam: req.body.jam,
            date: req.body.date,
            metrics,
        });

        res.status(201).json({
            status: "success",
            message: "Manual plant data sent",
            data: result,
        });
    } catch (err) {
        if (err.message === "Invalid_Timestamp") {
            return res.status(400).json({
                status: "error",
                message: "timestamp/time is invalid",
            });
        }

        if (err.message === "Plant_Not_Found") {
            return res.status(404).json({
                status: "error",
                message: "Plant not found",
            });
        }

        if (err.message === "Device_Already_Assigned_To_Another_Plant") {
            return res.status(409).json({
                status: "error",
                message: "deviceId is already assigned to another plant",
            });
        }

        if (err.message === "Device_Not_Found") {
            return res.status(404).json({
                status: "error",
                message: "Device not found for target plant",
            });
        }

        console.error("Error sending manual plant data:", err);
        res.status(500).json({
            status: "error",
            message: "Internal server error",
        });
    }
};


module.exports = {
    fetchDeviceData,
    getDaily,
    getMonthly,
    getYearly,
    getLifetime,
    getChart,
    getMonthlyChart,
    getYearlyChart,
    sendManualPlantData,
};

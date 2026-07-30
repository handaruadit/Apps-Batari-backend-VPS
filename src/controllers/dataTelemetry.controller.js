//===== (Imports) ======
const {
  formatDeviceDataForResponse,
  getDailyData,
  getDeviceData,
  getDeviceIdData,
  getLatestEnergyData,
  getLifetimeData,
  getMonthlyData,
  getYearlyData,
} = require("../services/data.service");
const {
  getDeviceIdValues,
  groupDataByCategoryAndType,
  isDeviceAccessDenied,
  sendDeviceAccessDenied,
} = require("./dataController.helpers");

//===== (fetchDeviceData) ======
const fetchDeviceData = async (req, res) => {
  try {
    const { plantId, category, limit, startDate, endDate, latestBy } = req.query;
    const userId = req.user.userId;
    const role = req.user.role;

    if (!plantId) {
      return res.status(400).json({
        status: "error",
        message: "plantId is required",
      });
    }

    const deviceIds = await getDeviceIdData(userId, plantId, role);
    console.log("🔍 Device IDs:", deviceIds);

    if (!deviceIds || deviceIds.length === 0) {
      return res.status(404).json({
        status: "error",
        message: "No devices found for the specified plant",
      });
    }

    const types = req.query.type ? req.query.type.split(",") : null;

    let start;
    let end;
    if (startDate && endDate) {
      start = new Date(startDate);
      end = new Date(endDate);
    }

    const mappedDeviceIds = getDeviceIdValues(deviceIds);
    const data = await getDeviceData({
      deviceIds: mappedDeviceIds,
      category,
      types,
      startDate: start,
      endDate: end,
      latestBy,
      limit: limit ? parseInt(limit) : undefined,
    });
    const latestEnergy = await getLatestEnergyData({
      deviceIds: mappedDeviceIds,
    });

    const formatted = groupDataByCategoryAndType(
      data,
      formatDeviceDataForResponse,
    );

    res.json({
      status: "success",
      count: data.length,
      data: formatted,
      ...latestEnergy,
    });
  } catch (err) {
    if (isDeviceAccessDenied(err)) {
      return sendDeviceAccessDenied(res);
    }

    console.error("Error fetching device data:", err);
    res.status(500).json({
      status: "error",
      message: "Internal server error",
    });
  }
};

//===== (getDaily) ======
const getDaily = async (req, res) => {
  try {
    const { plantId, date, category } = req.query;
    const userId = req.user.userId;
    const role = req.user.role;

    if (!plantId) {
      return res.status(400).json({
        status: "error",
        message: "plantId is required",
      });
    }

    const deviceIds = await getDeviceIdData(userId, plantId, role);
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
      deviceId: getDeviceIdValues(deviceIds),
      date,
      category,
      types,
    });

    res.json({
      status: "success",
      data: groupDataByCategoryAndType(data),
    });
  } catch (err) {
    if (isDeviceAccessDenied(err)) {
      return sendDeviceAccessDenied(res);
    }

    res.status(500).json({ status: "error" });
  }
};

//===== (getMonthly) ======
const getMonthly = async (req, res) => {
  try {
    const { plantId, date, category } = req.query;
    const userId = req.user.userId;
    const role = req.user.role;

    if (!plantId) {
      return res.status(400).json({
        status: "error",
        message: "plantId is required",
      });
    }

    const deviceIds = await getDeviceIdData(userId, plantId, role);
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
      deviceId: getDeviceIdValues(deviceIds),
      month: date,
      category,
      types,
    });

    res.json({
      status: "success",
      data: groupDataByCategoryAndType(data),
    });
  } catch (err) {
    if (isDeviceAccessDenied(err)) {
      return sendDeviceAccessDenied(res);
    }

    res.status(500).json({ status: "error" });
  }
};

//===== (getYearly) ======
const getYearly = async (req, res) => {
  try {
    const { plantId, date, category } = req.query;
    const userId = req.user.userId;
    const role = req.user.role;

    if (!plantId) {
      return res.status(400).json({
        status: "error",
        message: "plantId is required",
      });
    }

    const deviceIds = await getDeviceIdData(userId, plantId, role);
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
      deviceId: getDeviceIdValues(deviceIds),
      year: date,
      category,
      types,
    });

    res.json({
      status: "success",
      data: groupDataByCategoryAndType(data),
    });
  } catch (err) {
    if (isDeviceAccessDenied(err)) {
      return sendDeviceAccessDenied(res);
    }

    res.status(500).json({ status: err.message });
  }
};

//===== (getLifetime) ======
const getLifetime = async (req, res) => {
  try {
    const { plantId, category } = req.query;
    const userId = req.user.userId;
    const role = req.user.role;

    if (!plantId) {
      return res.status(400).json({
        status: "error",
        message: "plantId is required",
      });
    }

    const deviceIds = await getDeviceIdData(userId, plantId, role);
    if (!deviceIds || deviceIds.length === 0) {
      return res.status(404).json({
        status: "error",
        message: "No devices found for the specified plant",
      });
    }

    const types = req.query.type ? req.query.type.split(",") : null;
    const data = await getLifetimeData({
      deviceId: getDeviceIdValues(deviceIds),
      category,
      types,
    });

    res.json({
      status: "success",
      data,
    });
  } catch (err) {
    if (isDeviceAccessDenied(err)) {
      return sendDeviceAccessDenied(res);
    }

    res.status(500).json({ status: "error" });
  }
};

//===== (Exports) ======
module.exports = {
  fetchDeviceData,
  getDaily,
  getLifetime,
  getMonthly,
  getYearly,
};

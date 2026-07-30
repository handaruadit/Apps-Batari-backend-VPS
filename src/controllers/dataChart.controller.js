//===== (Imports) ======
const {
  getChartData,
  getDeviceIdData,
  getMonthlyChartData,
  getYearlyChartData,
} = require("../services/data.service");
const {
  getDeviceIdValues,
  isDeviceAccessDenied,
  sendDeviceAccessDenied,
} = require("./dataController.helpers");

//===== (getChart) ======
const getChart = async (req, res) => {
  try {
    const { plantId, segment = "day", date } = req.query;
    const userId = req.user.userId;
    const role = req.user.role;

    if (!plantId) {
      return res.status(400).json({
        success: false,
        status: "error",
        message: "plantId is required",
      });
    }

    const deviceIds = await getDeviceIdData(userId, plantId, role);
    if (!deviceIds || deviceIds.length === 0) {
      return res.status(404).json({
        success: false,
        status: "error",
        message: "No devices found for the specified plant",
      });
    }

    const chartResult = await getChartData({
      plantId,
      deviceIds: getDeviceIdValues(deviceIds),
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
    if (isDeviceAccessDenied(err)) {
      return sendDeviceAccessDenied(res);
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

//===== (getMonthlyChart) ======
const getMonthlyChart = async (req, res) => {
  try {
    const { plantId, month, date } = req.query;
    const userId = req.user.userId;
    const role = req.user.role;
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

    const deviceIds = await getDeviceIdData(userId, plantId, role);
    const data = await getMonthlyChartData({
      deviceIds: getDeviceIdValues(deviceIds),
      month: requestedMonth,
    });

    res.json({
      success: true,
      status: "success",
      data,
    });
  } catch (err) {
    if (isDeviceAccessDenied(err)) {
      return sendDeviceAccessDenied(res);
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

//===== (getYearlyChart) ======
const getYearlyChart = async (req, res) => {
  try {
    const { plantId, year, date } = req.query;
    const userId = req.user.userId;
    const role = req.user.role;
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

    const deviceIds = await getDeviceIdData(userId, plantId, role);
    const data = await getYearlyChartData({
      deviceIds: getDeviceIdValues(deviceIds),
      year: requestedYear,
    });

    res.json({
      success: true,
      status: "success",
      data,
    });
  } catch (err) {
    if (isDeviceAccessDenied(err)) {
      return sendDeviceAccessDenied(res);
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

//===== (Exports) ======
module.exports = {
  getChart,
  getMonthlyChart,
  getYearlyChart,
};

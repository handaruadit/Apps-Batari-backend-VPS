const db = require("../config/db");

const getDeviceAccess = async (_req, res) => {
  try {
    const rows = await db("users as u")
      .join("user_plants as up", "u.id", "up.user_id")
      .join("plants as p", "up.plant_id", "p.id")
      .join("plant_devices as pd", "p.id", "pd.plant_id")
      .leftJoin("device_access_permissions as dap", function joinPermissions() {
        this.on("dap.user_id", "=", "u.id")
          .andOn("dap.plant_id", "=", "p.id")
          .andOn("dap.device_id", "=", "pd.device_id");
      })
      .where("u.role", "user")
      .select(
        "u.id as userId",
        "u.email",
        "p.id as plantId",
        "p.name as plantName",
        "pd.device_id as deviceId",
        db.raw("COALESCE(dap.allowed, false) as allowed"),
      )
      .orderBy(["u.email", "p.name", "pd.device_id"]);

    const usersById = rows.reduce((items, row) => {
      if (!items[row.userId]) {
        items[row.userId] = {
          userId: row.userId,
          email: row.email,
          plants: [],
        };
      }

      items[row.userId].plants.push({
        plantId: row.plantId,
        plantName: row.plantName,
        deviceId: row.deviceId,
        allowed: row.allowed,
      });

      return items;
    }, {});

    res.json(Object.values(usersById));
  } catch (err) {
    console.error("Error fetching admin device access:", err);
    res.status(500).json({ message: "Internal server error" });
  }
};

const updateDeviceAccess = async (req, res) => {
  try {
    const { userId, plantId, deviceId, allowed } = req.body;

    if (!userId || !plantId || !deviceId || typeof allowed !== "boolean") {
      return res.status(400).json({
        success: false,
        message: "userId, plantId, deviceId, and allowed are required",
      });
    }

    const relation = await db("user_plants as up")
      .join("plant_devices as pd", "up.plant_id", "pd.plant_id")
      .where("up.user_id", userId)
      .where("up.plant_id", plantId)
      .where("pd.device_id", deviceId)
      .first("up.user_id");

    if (!relation) {
      return res.status(404).json({
        success: false,
        message: "User, plant, or device relation not found",
      });
    }

    await db("device_access_permissions")
      .insert({
        user_id: userId,
        plant_id: plantId,
        device_id: deviceId,
        allowed,
      })
      .onConflict(["user_id", "plant_id", "device_id"])
      .merge({
        allowed,
        updated_at: db.fn.now(),
      });

    res.json({
      success: true,
      message: "Device access updated",
      data: {
        userId,
        plantId,
        deviceId,
        allowed,
      },
    });
  } catch (err) {
    console.error("Error updating admin device access:", err);
    res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};

module.exports = {
  getDeviceAccess,
  updateDeviceAccess,
};

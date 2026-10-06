//===== (Imports) ======
const pushNotificationService = require("../services/pushNotification.service");

//===== (savePushToken) ======
const savePushToken = async (req, res) => {
  try {
    const userId = req.user?.id;
    const { pushToken, platform = "android" } = req.body;
    if (!userId || !pushToken) {
      return res.status(400).json({
        status: "error",
        message: "Missing userId or pushToken",
      });
    }

    const saved = await pushNotificationService.savePushToken({
      userId,
      pushToken,
      platform,
    });

    res.json({
      status: "success",
      success: saved,
      message: saved ? "Push token registered" : "Failed to register token",
    });
  } catch (err) {
    res.status(500).json({ status: "error", message: err.message });
  }
};

//===== (removePushToken) ======
const removePushToken = async (req, res) => {
  try {
    const userId = req.user?.id;
    const { pushToken } = req.body;
    await pushNotificationService.removePushToken({ userId, pushToken });
    res.json({ status: "success", message: "Push token unregistered" });
  } catch (err) {
    res.status(500).json({ status: "error", message: err.message });
  }
};

//===== (testPushNotification) ======
const testPushNotification = async (req, res) => {
  try {
    const userId = req.user?.id;
    const { language = "id", plantName = "Solar Plant Utama" } = req.body;
    const isEn = language === "en";

    const title = isEn
      ? `🚨 Station Offline: ${plantName}`
      : `🚨 Stasiun Offline: ${plantName}`;
    const body = isEn
      ? `Station '${plantName}' has been disconnected from the network (Offline).`
      : `Stasiun '${plantName}' telah terputus dari jaringan (Offline).`;

    const result = await pushNotificationService.sendPushToUser(userId, {
      title,
      body,
      data: { type: "test_push", timestamp: Date.now() },
    });

    res.json({
      status: "success",
      ...result,
      message: result.success
        ? "Push notification dispatched to your device"
        : "Failed to dispatch push notification",
    });
  } catch (err) {
    res.status(500).json({ status: "error", message: err.message });
  }
};

module.exports = {
  savePushToken,
  removePushToken,
  testPushNotification,
};

//===== (Imports) ======
const router = require("express").Router();
const {
  deleteAccount,
  forgotPassword,
  getProfile,
  googleLogin,
  login,
  register,
  updatePassword,
  updateProfile,
  verifyResetCode,
} = require("../controllers/auth.controller");
const {
  savePushToken,
  removePushToken,
  testPushNotification,
} = require("../controllers/pushNotification.controller");
const authMiddleware = require("../middlewares/auth.middleware");

//===== (Public Authentication Routes) ======
router.post("/register", register);
router.post("/login", login);
router.post("/google-login", googleLogin);
router.post("/forgot-password", forgotPassword);
router.post("/verify-reset-code", verifyResetCode);
router.post("/reset-password", updatePassword);

//===== (Authenticated Profile & Push Routes) ======
router.get("/profile", authMiddleware, getProfile);
router.put("/profile", authMiddleware, updateProfile);
router.delete("/account", authMiddleware, deleteAccount);
router.post("/push-token", authMiddleware, savePushToken);
router.delete("/push-token", authMiddleware, removePushToken);
router.post("/test-push", authMiddleware, testPushNotification);

//===== (Exports) ======
module.exports = router;

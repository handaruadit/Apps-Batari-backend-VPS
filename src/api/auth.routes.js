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
const authMiddleware = require("../middlewares/auth.middleware");

//===== (Public Authentication Routes) ======
router.post("/register", register);
router.post("/login", login);
router.post("/google-login", googleLogin);
router.post("/forgot-password", forgotPassword);
router.post("/verify-reset-code", verifyResetCode);
router.post("/reset-password", updatePassword);

//===== (Authenticated Profile Routes) ======
router.get("/profile", authMiddleware, getProfile);
router.put("/profile", authMiddleware, updateProfile);
router.delete("/account", authMiddleware, deleteAccount);

//===== (Exports) ======
module.exports = router;

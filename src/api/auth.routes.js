const router = require("express").Router();
const {
  register,
  login,
  forgotPassword,
  verifyResetCode,
  updatePassword,
} = require("../controllers/auth.controller");

router.post("/register", register);
router.post("/login", login);
router.post("/forgot-password", forgotPassword);
router.post("/verify-reset-code", verifyResetCode);
router.post("/reset-password", updatePassword);

module.exports = router;

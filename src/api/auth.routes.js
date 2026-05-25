const router = require("express").Router();
const { generalLimiter } = require("../middlewares/rate.middleware");
const {
  register,
  login,
  forgotPassword,
  verifyResetCode,
  updatePassword,
} = require("../controllers/auth.controller");

router.post("/register", generalLimiter, register);
router.post("/login", generalLimiter, login);
router.post("/forgot-password", generalLimiter, forgotPassword);
router.post("/verify-reset-code", generalLimiter, verifyResetCode);
router.post("/reset-password", generalLimiter, updatePassword);

module.exports = router;

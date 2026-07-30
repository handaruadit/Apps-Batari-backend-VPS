//===== (Imports) ======
const router = require("express").Router();
const {
  register,
  login,
  forgotPassword,
  verifyResetCode,
  updatePassword,
} = require("../controllers/auth.controller");

//===== (Authentication Routes) ======
router.post("/register", register);
router.post("/login", login);
router.post("/forgot-password", forgotPassword);
router.post("/verify-reset-code", verifyResetCode);
router.post("/reset-password", updatePassword);

//===== (Exports) ======
module.exports = router;

//===== (Imports) ======
const {
  requestPasswordReset,
  resetPassword,
  verifyPasswordResetCode,
} = require("../services/passwordReset.service");
const {
  validateResetCodeData,
  validateResetIdentityData,
  validateResetPasswordData,
} = require("../validators/auth.validator");

//===== (Konstanta Pesan Reset Password) ======
const RESET_SEND_FAILED_MESSAGE =
  "Gagal mengirim kode reset password. Silakan coba lagi.";
const RESET_VERIFY_FAILED_MESSAGE = "Kode salah atau sudah kedaluwarsa.";
const RESET_UPDATE_FAILED_MESSAGE =
  "Password gagal diperbarui. Silakan coba lagi.";

//===== (forgotPassword) ======
const forgotPassword = async (req, res) => {
  const validationError = validateResetIdentityData(req.body);
  if (validationError) {
    return res.status(validationError.status).json({
      status: "error",
      success: false,
      message: validationError.message,
    });
  }

  try {
    await requestPasswordReset(req.body);
    res.json({
      status: "success",
      success: true,
      message: "Reset code has been sent",
    });
  } catch (err) {
    console.error("[auth] forgot password failed", err);
    if (err.message === "Account not found") {
      return res.status(404).json({
        status: "error",
        success: false,
        message: RESET_SEND_FAILED_MESSAGE,
      });
    }
    if (
      err.message === "Email sender is not configured" ||
      err.message === "WhatsApp sender is not configured"
    ) {
      return res.status(503).json({
        status: "error",
        success: false,
        message: RESET_SEND_FAILED_MESSAGE,
      });
    }
    res.status(500).json({
      status: "error",
      success: false,
      message: RESET_SEND_FAILED_MESSAGE,
    });
  }
};

//===== (verifyResetCode) ======
const verifyResetCode = async (req, res) => {
  const validationError = validateResetCodeData(req.body);
  if (validationError) {
    return res.status(validationError.status).json({
      status: "error",
      success: false,
      message: validationError.message,
    });
  }

  try {
    await verifyPasswordResetCode(req.body);
    res.json({
      status: "success",
      success: true,
      message: "Code verified",
    });
  } catch (err) {
    console.error("[auth] verify reset code failed", err);
    if (err.message === "Invalid or expired code") {
      return res.status(400).json({
        status: "error",
        success: false,
        message: RESET_VERIFY_FAILED_MESSAGE,
      });
    }
    res.status(500).json({
      status: "error",
      success: false,
      message: RESET_VERIFY_FAILED_MESSAGE,
    });
  }
};

//===== (updatePassword) ======
const updatePassword = async (req, res) => {
  const validationError = validateResetPasswordData(req.body);
  if (validationError) {
    return res.status(validationError.status).json({
      status: "error",
      success: false,
      message: validationError.message,
    });
  }

  try {
    await resetPassword(req.body);
    res.json({
      status: "success",
      success: true,
      message: "Password updated successfully",
    });
  } catch (err) {
    console.error("[auth] reset password failed", err);
    if (err.message === "Invalid or expired code") {
      return res.status(400).json({
        status: "error",
        success: false,
        message: RESET_VERIFY_FAILED_MESSAGE,
      });
    }
    res.status(500).json({
      status: "error",
      success: false,
      message: RESET_UPDATE_FAILED_MESSAGE,
    });
  }
};

//===== (Exports) ======
module.exports = {
  forgotPassword,
  updatePassword,
  verifyResetCode,
};

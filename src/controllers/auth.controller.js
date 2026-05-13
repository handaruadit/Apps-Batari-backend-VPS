const {
  registerUser,
  loginUser,
  requestPasswordReset,
  verifyPasswordResetCode,
  resetPassword,
} = require("../services/auth.service");

const validateEmail = (email) => {
  return typeof email === "string" && /^\S+@\S+\.\S+$/.test(email);
};

const validateRegisterData = ({ email, password, phone }) => {
  if (!email) return { status: 400, message: "Email is required" };
  if (!validateEmail(email)) return { status: 422, message: "Invalid email format" };
  if (!password) return { status: 400, message: "Password is required" };
  if (typeof password !== "string" || password.length < 6) return { status: 422, message: "Password must be at least 6 characters" };
  if (phone && typeof phone !== "string") return { status: 422, message: "Invalid phone format" };
  return null;
};

const validateLoginData = ({ email, password }) => {
  if (!email) return { status: 400, message: "Email is required" };
  if (!password) return { status: 400, message: "Password is required" };
  return null;
};

const validateEmailData = ({ email }) => {
  if (!email) return { status: 400, message: "Email is required" };
  if (!validateEmail(email)) return { status: 422, message: "Invalid email format" };
  return null;
};

const validatePhone = (phone) => {
  return typeof phone === "string" && /^[+0-9][0-9\s-]{7,18}$/.test(phone.trim());
};

const validateResetIdentityData = ({ method = "email", email, phone }) => {
  if (method === "phone") {
    if (!phone) return { status: 400, message: "Phone is required" };
    if (!validatePhone(phone)) return { status: 422, message: "Invalid phone format" };
    return null;
  }

  return validateEmailData({ email });
};

const validateResetCodeData = ({ method = "email", email, phone, code }) => {
  const identityError = validateResetIdentityData({ method, email, phone });
  if (identityError) return identityError;
  if (!code) return { status: 400, message: "Code is required" };
  if (!/^\d{6}$/.test(String(code))) return { status: 422, message: "Code must be 6 digits" };
  return null;
};

const validateResetPasswordData = ({ method = "email", email, phone, code, newPassword }) => {
  const codeError = validateResetCodeData({ method, email, phone, code });
  if (codeError) return codeError;
  if (!newPassword) return { status: 400, message: "New password is required" };
  if (typeof newPassword !== "string" || newPassword.length < 6) return { status: 422, message: "Password must be at least 6 characters" };
  return null;
};

const register = async (req, res) => {
  const validationError = validateRegisterData(req.body);
  if (validationError) {
    return res.status(validationError.status).json({ status: "error", message: validationError.message });
  }

  try {
    const user = await registerUser(req.body);
    const { password, ...safeUser } = user;
    res.json({ status: "success", success: true, message: "Account created successfully", data: safeUser });
  } catch (err) {
    if (err.message.includes("already registered")) {
      return res.status(409).json({ status: "error", message: err.message });
    }
    res.status(500).json({ status: "error", message: err.message });
  }
};

const login = async (req, res) => {
  const validationError = validateLoginData(req.body);
  if (validationError) {
    return res.status(validationError.status).json({ status: "error", message: validationError.message });
  }

  try {
    const data = await loginUser(req.body);
    res.json({ status: "success", ...data });
  } catch (err) {
    if (err.message === "User not found" || err.message === "Wrong password") {
      return res.status(401).json({ status: "error", message: err.message });
    }
    res.status(500).json({ status: "error", message: err.message });
  }
};

const forgotPassword = async (req, res) => {
  const validationError = validateResetIdentityData(req.body);
  if (validationError) {
    return res.status(validationError.status).json({ status: "error", success: false, message: validationError.message });
  }

  try {
    await requestPasswordReset(req.body);
    res.json({ status: "success", success: true, message: "Reset code has been sent" });
  } catch (err) {
    console.error("[auth] forgot password failed", err);
    if (err.message === "Account not found") {
      return res.status(404).json({ status: "error", success: false, message: err.message });
    }
    if (
      err.message === "Email sender is not configured" ||
      err.message === "WhatsApp sender is not configured"
    ) {
      return res.status(503).json({ status: "error", success: false, message: err.message });
    }
    res.status(500).json({ status: "error", success: false, message: err.message });
  }
};

const verifyResetCode = async (req, res) => {
  const validationError = validateResetCodeData(req.body);
  if (validationError) {
    return res.status(validationError.status).json({ status: "error", success: false, message: validationError.message });
  }

  try {
    await verifyPasswordResetCode(req.body);
    res.json({ status: "success", success: true, message: "Code verified" });
  } catch (err) {
    if (err.message === "Invalid or expired code") {
      return res.status(400).json({ status: "error", success: false, message: err.message });
    }
    res.status(500).json({ status: "error", success: false, message: err.message });
  }
};

const updatePassword = async (req, res) => {
  const validationError = validateResetPasswordData(req.body);
  if (validationError) {
    return res.status(validationError.status).json({ status: "error", success: false, message: validationError.message });
  }

  try {
    await resetPassword(req.body);
    res.json({ status: "success", success: true, message: "Password updated successfully" });
  } catch (err) {
    if (err.message === "Invalid or expired code") {
      return res.status(400).json({ status: "error", success: false, message: err.message });
    }
    res.status(500).json({ status: "error", success: false, message: err.message });
  }
};

module.exports = { register, login, forgotPassword, verifyResetCode, updatePassword };

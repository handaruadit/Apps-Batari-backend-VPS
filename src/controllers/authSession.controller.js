//===== (Imports) ======
const {
  loginUser,
  registerUser,
} = require("../services/auth.service");
const {
  validateLoginData,
  validateRegisterData,
} = require("../validators/auth.validator");

//===== (register) ======
const register = async (req, res) => {
  const validationError = validateRegisterData(req.body);
  if (validationError) {
    return res.status(validationError.status).json({
      status: "error",
      message: validationError.message,
    });
  }

  try {
    const user = await registerUser(req.body);
    const { password, ...safeUser } = user;
    res.json({
      status: "success",
      success: true,
      message: "Account created successfully",
      data: safeUser,
    });
  } catch (err) {
    if (err.message.includes("already registered")) {
      return res.status(409).json({ status: "error", message: err.message });
    }
    res.status(500).json({ status: "error", message: err.message });
  }
};

//===== (login) ======
const login = async (req, res) => {
  const validationError = validateLoginData(req.body);
  if (validationError) {
    return res.status(validationError.status).json({
      status: "error",
      message: validationError.message,
    });
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

//===== (Exports) ======
module.exports = {
  login,
  register,
};

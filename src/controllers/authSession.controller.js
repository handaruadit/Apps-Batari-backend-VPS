//===== (Imports) ======
const {
  deleteUserAccount,
  getUserProfile,
  googleLoginUser,
  loginUser,
  registerUser,
  updateUserProfile,
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

//===== (googleLogin) ======
const googleLogin = async (req, res) => {
  const email = req.body?.email || req.body?.user?.email;
  const name = req.body?.name || req.body?.user?.name;
  const photo = req.body?.photo || req.body?.user?.photo;

  if (!email) {
    return res.status(400).json({
      status: "error",
      message: "Email is required for Google login",
    });
  }

  try {
    const data = await googleLoginUser({ email, name, photo });
    res.json({ status: "success", success: true, ...data });
  } catch (err) {
    res.status(500).json({ status: "error", message: err.message });
  }
};

//===== (getProfile) ======
const getProfile = async (req, res) => {
  try {
    const userId = req.user?.id || req.user?.userId;
    if (!userId) {
      return res.status(401).json({ status: "error", message: "Unauthorized" });
    }

    const profile = await getUserProfile(userId);
    res.json({ status: "success", data: profile });
  } catch (err) {
    res.status(500).json({ status: "error", message: err.message });
  }
};

//===== (updateProfile) ======
const updateProfile = async (req, res) => {
  try {
    const userId = req.user?.id || req.user?.userId;
    if (!userId) {
      return res.status(401).json({ status: "error", message: "Unauthorized" });
    }

    const { name, phone, password, oldPassword } = req.body;
    const updated = await updateUserProfile({
      userId,
      name,
      phone,
      password,
      oldPassword,
    });

    res.json({
      status: "success",
      message: "Profile updated successfully",
      data: updated,
    });
  } catch (err) {
    if (
      err.message.includes("incorrect") ||
      err.message.includes("required") ||
      err.message.includes("characters")
    ) {
      return res.status(400).json({ status: "error", message: err.message });
    }
    if (err.message.includes("already in use")) {
      return res.status(409).json({ status: "error", message: err.message });
    }
    res.status(500).json({ status: "error", message: err.message });
  }
};

//===== (deleteAccount) ======
const deleteAccount = async (req, res) => {
  try {
    const userId = req.user?.id || req.user?.userId;
    if (!userId) {
      return res.status(401).json({ status: "error", message: "Unauthorized" });
    }

    const { password } = req.body;
    await deleteUserAccount({ userId, password });

    res.json({
      status: "success",
      message: "Account deleted successfully",
    });
  } catch (err) {
    if (err.message.includes("incorrect")) {
      return res.status(400).json({ status: "error", message: err.message });
    }
    res.status(500).json({ status: "error", message: err.message });
  }
};

//===== (Exports) ======
module.exports = {
  deleteAccount,
  getProfile,
  googleLogin,
  login,
  register,
  updateProfile,
};

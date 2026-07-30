//===== (Imports) ======
const bcrypt = require("bcrypt");
const db = require("../config/db");
const { generateToken } = require("../config/jwt");
const { normalizePhoneNumber } = require("./notification.service");
const {
  requestPasswordReset,
  resetPassword,
  verifyPasswordResetCode,
} = require("./passwordReset.service");

//===== (registerUser) ======
const registerUser = async ({ email, password, phone }) => {
  const existingUser = await db("users").where({ email }).first();
  if (existingUser) {
    throw new Error("Email already registered");
  }

  const normalizedPhone = phone || `email:${email}`;

  if (phone) {
    const existingPhone = await db("users").where({ phone }).first();
    if (existingPhone) {
      throw new Error("Phone already registered");
    }
  }

  const hashed = await bcrypt.hash(password, 10);

  const [user] = await db("users")
    .insert({ email, password: hashed, phone: normalizedPhone, role: "user" })
    .returning("*");

  return user;
};

//===== (loginUser) ======
const loginUser = async ({ email, password }) => {
  const user = await db("users").where({ email }).first();

  if (!user) throw new Error("User not found");

  const valid = await bcrypt.compare(password, user.password);
  if (!valid) throw new Error("Wrong password");

  const role = user.role || "user";
  const token = generateToken({
    id: user.id,
    userId: user.id,
    email: user.email,
    role,
  });

  return {
    token,
    user: {
      id: user.id,
      email: user.email,
      role,
    },
  };
};

//===== (Exports) ======
module.exports = {
  loginUser,
  normalizePhoneNumber,
  registerUser,
  requestPasswordReset,
  resetPassword,
  verifyPasswordResetCode,
};

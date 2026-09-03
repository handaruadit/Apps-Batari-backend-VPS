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

//===== (ensureUsersColumns) ======
let columnsChecked = false;
const ensureUsersColumns = async () => {
  if (columnsChecked) return;
  try {
    const hasName = await db.schema.hasColumn("users", "name");
    if (!hasName) {
      await db.schema.table("users", (table) => {
        table.text("name").nullable();
      });
    }
    const hasRole = await db.schema.hasColumn("users", "role");
    if (!hasRole) {
      await db.schema.table("users", (table) => {
        table.text("role").defaultTo("user");
      });
    }
    columnsChecked = true;
  } catch (error) {
    console.warn("[auth] Warning checking users columns:", error.message);
  }
};

//===== (registerUser) ======
const registerUser = async ({ email, password, phone, name }) => {
  await ensureUsersColumns();

  const existingUser = await db("users").where({ email }).first();
  if (existingUser) {
    throw new Error("Email already registered");
  }

  const normalizedPhone = phone || `email:${email}`;

  const hashed = await bcrypt.hash(password, 10);

  const insertData = {
    email,
    password: hashed,
    phone: normalizedPhone,
    role: "user",
  };
  if (name) insertData.name = name.trim();

  const [user] = await db("users").insert(insertData).returning("*");

  return user;
};

//===== (loginUser) ======
const loginUser = async ({ email, password }) => {
  await ensureUsersColumns();

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
      phone: user.phone && !user.phone.startsWith("email:") ? user.phone : null,
      name: user.name || null,
      role,
    },
  };
};

//===== (googleLoginUser) ======
const googleLoginUser = async ({ email, name, photo }) => {
  await ensureUsersColumns();

  if (!email) {
    throw new Error("Email is required for Google login");
  }

  const normalizedEmail = String(email).trim().toLowerCase();
  let user = await db("users").whereRaw("LOWER(email) = ?", [normalizedEmail]).first();

  if (!user) {
    const dummyPassword = await bcrypt.hash(Math.random().toString(36), 10);
    const insertData = {
      email: normalizedEmail,
      password: dummyPassword,
      phone: `google:${normalizedEmail}`,
      role: "user",
    };
    if (name) insertData.name = String(name).trim();

    const [createdUser] = await db("users").insert(insertData).returning("*");
    user = createdUser;
  } else if (name && !user.name) {
    await db("users").where({ id: user.id }).update({ name: String(name).trim() });
    user.name = String(name).trim();
  }

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
      phone: user.phone && !user.phone.startsWith("email:") && !user.phone.startsWith("google:") ? user.phone : null,
      name: user.name || null,
      role,
    },
  };
};

//===== (getUserProfile) ======
const getUserProfile = async (userId) => {
  await ensureUsersColumns();

  const user = await db("users").where({ id: userId }).first();
  if (!user) {
    throw new Error("User not found");
  }

  return {
    id: user.id,
    email: user.email,
    phone: user.phone && !user.phone.startsWith("email:") ? user.phone : null,
    name: user.name || null,
    role: user.role || "user",
    created_at: user.created_at,
  };
};

//===== (updateUserProfile) ======
const updateUserProfile = async ({
  userId,
  name,
  phone,
  password,
  oldPassword,
}) => {
  await ensureUsersColumns();

  const user = await db("users").where({ id: userId }).first();
  if (!user) {
    throw new Error("User not found");
  }

  const updatePayload = {
    updated_at: new Date(),
  };

  // 1. Update Name if provided
  if (name !== undefined) {
    updatePayload.name = String(name || "").trim();
  }

  // 2. Update Phone if provided (allow duplicate phone across accounts)
  if (phone !== undefined && phone !== null && String(phone).trim() !== "") {
    updatePayload.phone = String(phone).trim();
  }

  // 3. Update Password if provided
  if (password) {
    if (!oldPassword) {
      throw new Error("Current password is required to change password");
    }
    const isOldValid = await bcrypt.compare(oldPassword, user.password);
    if (!isOldValid) {
      throw new Error("Current password is incorrect");
    }
    if (password.length < 6) {
      throw new Error("New password must be at least 6 characters");
    }
    updatePayload.password = await bcrypt.hash(password, 10);
  }

  const [updatedUser] = await db("users")
    .where({ id: userId })
    .update(updatePayload)
    .returning("*");

  return {
    id: updatedUser.id,
    email: updatedUser.email,
    phone:
      updatedUser.phone && !updatedUser.phone.startsWith("email:")
        ? updatedUser.phone
        : null,
    name: updatedUser.name || null,
    role: updatedUser.role || "user",
  };
};

//===== (deleteUserAccount) ======
const deleteUserAccount = async ({ userId, password }) => {
  const user = await db("users").where({ id: userId }).first();
  if (!user) {
    throw new Error("User not found");
  }

  if (password) {
    const valid = await bcrypt.compare(password, user.password);
    if (!valid) {
      throw new Error("Password incorrect");
    }
  }

  await db("users").where({ id: userId }).del();
  return { success: true };
};

//===== (Exports) ======
module.exports = {
  deleteUserAccount,
  getUserProfile,
  googleLoginUser,
  loginUser,
  normalizePhoneNumber,
  registerUser,
  requestPasswordReset,
  resetPassword,
  updateUserProfile,
  verifyPasswordResetCode,
};

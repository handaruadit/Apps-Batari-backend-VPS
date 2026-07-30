//===== (Imports) ======
const bcrypt = require("bcrypt");
const crypto = require("crypto");
const db = require("../config/db");
const {
  normalizePhoneNumber,
  sendResetCodeEmail,
  sendResetCodeWhatsApp,
} = require("./notification.service");

//===== (Konstanta Reset Password) ======
const RESET_CODE_EXPIRY_MS = 15 * 60 * 1000;

//===== (createResetCode) ======
const createResetCode = () => {
  return String(crypto.randomInt(0, 1000000)).padStart(6, "0");
};

//===== (hashResetCode) ======
const hashResetCode = async (code) => {
  return bcrypt.hash(code, 10);
};

//===== (getResetIdentity) ======
const getResetIdentity = ({ method = "email", email, phone }) => {
  if (method === "phone") {
    const normalizedPhone = normalizePhoneNumber(phone);
    return {
      method: "phone",
      lookup: { phone: normalizedPhone },
      phone: normalizedPhone,
    };
  }

  return {
    method: "email",
    lookup: { email },
    email,
  };
};

//===== (requestPasswordReset) ======
const requestPasswordReset = async ({ method = "email", email, phone }) => {
  const identity = getResetIdentity({ method, email, phone });
  const user = await db("users").where(identity.lookup).first();
  if (!user) {
    throw new Error("Account not found");
  }

  const code = createResetCode();
  const codeHash = await hashResetCode(code);
  const expiresAt = new Date(Date.now() + RESET_CODE_EXPIRY_MS);
  const resetEmail = user.email;
  const resetPhone = identity.method === "phone" ? identity.phone : null;

  await db("password_reset_codes")
    .where({ method: identity.method })
    .where({ email: resetEmail })
    .modify((query) => {
      if (resetPhone) {
        query.where({ phone: resetPhone });
      }
    })
    .whereNull("used_at")
    .update({ used_at: db.fn.now() });

  await db("password_reset_codes").insert({
    user_id: user.id,
    email: resetEmail,
    phone: resetPhone,
    method: identity.method,
    code_hash: codeHash,
    expires_at: expiresAt,
  });

  if (identity.method === "phone") {
    await sendResetCodeWhatsApp({ phone: resetPhone, code });
  } else {
    await sendResetCodeEmail({ email: resetEmail, code });
  }
};

//===== (getLatestResetRecord) ======
const getLatestResetRecord = async ({ method = "email", email, phone }) => {
  const identity = getResetIdentity({ method, email, phone });

  return db("password_reset_codes")
    .where({ method: identity.method })
    .modify((query) => {
      if (identity.method === "phone") {
        query.where({ phone: identity.phone });
      } else {
        query.where({ email: identity.email });
      }
    })
    .whereNull("used_at")
    .orderBy("created_at", "desc")
    .first();
};

//===== (verifyPasswordResetCode) ======
const verifyPasswordResetCode = async ({
  method = "email",
  email,
  phone,
  code,
}) => {
  const resetRecord = await getLatestResetRecord({ method, email, phone });

  if (!resetRecord) {
    throw new Error("Invalid or expired code");
  }

  if (new Date(resetRecord.expires_at).getTime() < Date.now()) {
    throw new Error("Invalid or expired code");
  }

  const isValid = await bcrypt.compare(code, resetRecord.code_hash);
  if (!isValid) {
    throw new Error("Invalid or expired code");
  }

  await db("password_reset_codes")
    .where({ id: resetRecord.id })
    .update({ verified_at: db.fn.now() });
};

//===== (resetPassword) ======
const resetPassword = async ({
  method = "email",
  email,
  phone,
  code,
  newPassword,
}) => {
  const resetRecord = await getLatestResetRecord({ method, email, phone });

  if (!resetRecord || !resetRecord.verified_at) {
    throw new Error("Invalid or expired code");
  }

  if (new Date(resetRecord.expires_at).getTime() < Date.now()) {
    throw new Error("Invalid or expired code");
  }

  const isValid = await bcrypt.compare(code, resetRecord.code_hash);
  if (!isValid) {
    throw new Error("Invalid or expired code");
  }

  const hashed = await bcrypt.hash(newPassword, 10);

  await db("users").where({ id: resetRecord.user_id }).update({
    password: hashed,
    updated_at: db.fn.now(),
  });

  await db("password_reset_codes")
    .where({ id: resetRecord.id })
    .update({ used_at: db.fn.now() });
};

//===== (Exports) ======
module.exports = {
  createResetCode,
  getResetIdentity,
  requestPasswordReset,
  resetPassword,
  verifyPasswordResetCode,
};

const db = require("../config/db");
const bcrypt = require("bcrypt");
const crypto = require("crypto");
const nodemailer = require("nodemailer");
const { generateToken } = require("../config/jwt");

const ADMIN_EMAIL = "admin@batarienergy.com";
const ADMIN_PASSWORD = "password";

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

const seedAdminUser = async () => {
  const existingAdmin = await db("users").where({ email: ADMIN_EMAIL }).first();

  if (existingAdmin) {
    if (existingAdmin.role !== "admin") {
      const [updatedAdmin] = await db("users")
        .where({ id: existingAdmin.id })
        .update({ role: "admin", updated_at: db.fn.now() })
        .returning(["id", "email", "role"]);

      return updatedAdmin;
    }

    return {
      id: existingAdmin.id,
      email: existingAdmin.email,
      role: existingAdmin.role,
    };
  }

  const hashed = await bcrypt.hash(ADMIN_PASSWORD, 10);
  const [admin] = await db("users")
    .insert({
      email: ADMIN_EMAIL,
      password: hashed,
      phone: `email:${ADMIN_EMAIL}`,
      role: "admin",
    })
    .returning(["id", "email", "role"]);

  return admin;
};

const createResetCode = () => {
  return String(crypto.randomInt(0, 1000000)).padStart(6, "0");
};

const hashResetCode = async (code) => {
  return bcrypt.hash(code, 10);
};

const normalizePhoneNumber = (phone) => {
  const rawPhone = String(phone || "").trim();
  const digits = rawPhone.replace(/[^\d+]/g, "");

  if (digits.startsWith("+62")) {
    return digits.slice(1);
  }

  if (digits.startsWith("62")) {
    return digits;
  }

  if (digits.startsWith("0")) {
    return `62${digits.slice(1)}`;
  }

  return digits.replace(/^\+/, "");
};

const sendResetCodeEmail = async ({ email, code }) => {
  const { EMAIL_HOST, EMAIL_PORT, EMAIL_USER, EMAIL_PASS, EMAIL_FROM } =
    process.env;

  if (!EMAIL_HOST || !EMAIL_PORT || !EMAIL_USER || !EMAIL_PASS) {
    throw new Error("Email sender is not configured");
  }

  const transporter = nodemailer.createTransport({
    host: EMAIL_HOST,
    port: Number(EMAIL_PORT),
    secure: Number(EMAIL_PORT) === 465,
    auth: {
      user: EMAIL_USER,
      pass: EMAIL_PASS,
    },
  });

  await transporter.sendMail({
    from: EMAIL_FROM || EMAIL_USER,
    to: email,
    subject: "Batari password reset code",
    text: `Your Batari password reset code is ${code}. This code expires in 15 minutes.`,
  });
};

const sendResetCodeWhatsApp = async ({ phone, code }) => {
  const provider = String(process.env.WHATSAPP_PROVIDER || "meta").toLowerCase();
  const normalizedPhone = normalizePhoneNumber(phone);
  const message = `Your Batari password reset code is ${code}. This code expires in 15 minutes.`;

  if (!normalizedPhone) {
    throw new Error("Invalid phone number");
  }

  if (provider === "twilio") {
    const {
      TWILIO_ACCOUNT_SID,
      TWILIO_AUTH_TOKEN,
      TWILIO_WHATSAPP_FROM,
    } = process.env;

    if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN || !TWILIO_WHATSAPP_FROM) {
      throw new Error("WhatsApp sender is not configured");
    }

    const response = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}/Messages.json`,
      {
        method: "POST",
        headers: {
          Authorization: `Basic ${Buffer.from(
            `${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`,
          ).toString("base64")}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          From: TWILIO_WHATSAPP_FROM,
          To: `whatsapp:+${normalizedPhone}`,
          Body: message,
        }).toString(),
      },
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error("[auth] Twilio WhatsApp send failed", errorText);
      throw new Error("Failed to send WhatsApp reset code");
    }

    return;
  }

  const { WHATSAPP_ACCESS_TOKEN, WHATSAPP_PHONE_NUMBER_ID, WHATSAPP_API_URL } =
    process.env;

  if (!WHATSAPP_ACCESS_TOKEN || !WHATSAPP_PHONE_NUMBER_ID) {
    throw new Error("WhatsApp sender is not configured");
  }

  const apiUrl =
    WHATSAPP_API_URL ||
    `https://graph.facebook.com/v19.0/${WHATSAPP_PHONE_NUMBER_ID}/messages`;

  const response = await fetch(apiUrl, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${WHATSAPP_ACCESS_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to: normalizedPhone,
      type: "text",
      text: { body: message },
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error("[auth] Meta WhatsApp send failed", errorText);
    throw new Error("Failed to send WhatsApp reset code");
  }
};

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

const requestPasswordReset = async ({ method = "email", email, phone }) => {
  const identity = getResetIdentity({ method, email, phone });
  const user = await db("users").where(identity.lookup).first();
  if (!user) {
    throw new Error("Account not found");
  }

  const code = createResetCode();
  const codeHash = await hashResetCode(code);
  const expiresAt = new Date(Date.now() + 15 * 60 * 1000);
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

const verifyPasswordResetCode = async ({ method = "email", email, phone, code }) => {
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

const resetPassword = async ({ method = "email", email, phone, code, newPassword }) => {
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

module.exports = {
  registerUser,
  loginUser,
  requestPasswordReset,
  verifyPasswordResetCode,
  resetPassword,
  normalizePhoneNumber,
  seedAdminUser,
};

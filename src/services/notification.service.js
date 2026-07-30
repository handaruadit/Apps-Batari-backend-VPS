//===== (Imports) ======
const nodemailer = require("nodemailer");

//===== (normalizePhoneNumber) ======
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

//===== (sendResetCodeEmail) ======
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

//===== (sendResetCodeWhatsApp) ======
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

//===== (Exports) ======
module.exports = {
  normalizePhoneNumber,
  sendResetCodeEmail,
  sendResetCodeWhatsApp,
};

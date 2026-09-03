//===== (Imports) ======
const nodemailer = require("nodemailer");
const fs = require("fs");
const path = require("path");

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
  const host = process.env.EMAIL_HOST || process.env.SMTP_HOST;
  const port = process.env.EMAIL_PORT || process.env.SMTP_PORT || 587;
  const user = process.env.EMAIL_USER || process.env.SMTP_USER;
  const pass = process.env.EMAIL_PASS || process.env.SMTP_PASS;
  const from = process.env.EMAIL_FROM || user;

  if (!host || !user || !pass) {
    throw new Error("Email sender is not configured");
  }

  const transporter = nodemailer.createTransport({
    host,
    port: Number(port),
    secure: Number(port) === 465,
    auth: {
      user,
      pass,
    },
  });

  const logoPath = path.resolve(__dirname, "../assets/batari-energy-logo.webp");
  const attachments = [];
  if (fs.existsSync(logoPath)) {
    attachments.push({
      filename: "batari-logo.webp",
      path: logoPath,
      cid: "batariLogo",
    });
  }

  const htmlContent = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Kode Reset Password Batari</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
      background-color: #030816;
      color: #E2E8F0;
      margin: 0;
      padding: 32px 16px;
    }
    .wrapper {
      max-width: 500px;
      margin: 0 auto;
      background: #0B1528;
      border: 1px solid rgba(8, 174, 234, 0.22);
      border-radius: 18px;
      overflow: hidden;
      box-shadow: 0 16px 40px rgba(0, 0, 0, 0.5);
    }
    .brand-header {
      background: rgba(255, 255, 255, 0.04);
      border-bottom: 1px solid rgba(255, 255, 255, 0.08);
      padding: 28px 24px;
      text-align: center;
    }
    .brand-logo {
      max-width: 220px;
      height: auto;
      display: inline-block;
    }
    .body-content {
      padding: 32px 28px;
      text-align: center;
    }
    .title {
      font-size: 21px;
      font-weight: 700;
      color: #FFFFFF;
      margin: 0 0 10px 0;
    }
    .description {
      font-size: 14px;
      color: #94A3B8;
      line-height: 1.6;
      margin: 0 0 28px 0;
    }
    .code-box {
      background: #040914;
      border: 1.5px solid #08AEEA;
      border-radius: 12px;
      padding: 22px 16px;
      margin-bottom: 28px;
    }
    .code-text {
      font-family: 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace;
      font-size: 40px;
      font-weight: 700;
      letter-spacing: 12px;
      color: #08AEEA;
      padding-left: 12px;
    }
    .expiry-text {
      font-size: 12px;
      color: #64748B;
      margin-top: 10px;
    }
    .security-notice {
      background: rgba(255, 255, 255, 0.03);
      border-left: 3px solid #08AEEA;
      border-radius: 6px;
      padding: 14px 16px;
      text-align: left;
      font-size: 12px;
      color: #64748B;
      line-height: 1.5;
      margin-bottom: 8px;
    }
    .footer {
      border-top: 1px solid rgba(255, 255, 255, 0.06);
      padding: 20px;
      text-align: center;
      font-size: 11px;
      color: #64748B;
    }
  </style>
</head>
<body>
  <div class="wrapper">
    <div class="brand-header">
      <img src="cid:batariLogo" alt="Batari Energy" class="brand-logo" />
    </div>
    <div class="body-content">
      <h2 class="title">Reset Kata Sandi</h2>
      <p class="description">Kami menerima permintaan untuk mereset kata sandi akun Batari Anda. Masukkan kode verifikasi 6 digit berikut pada aplikasi:</p>
      <div class="code-box">
        <div class="code-text">${code}</div>
        <div class="expiry-text">Kode ini berlaku selama 15 menit.</div>
      </div>
      <div class="security-notice">
        Jangan berikan kode ini kepada siapa pun. Jika Anda tidak merasa melakukan permintaan ini, abaikan email ini dan akun Anda tetap aman.
      </div>
    </div>
    <div class="footer">
      PT Batari Energi Nusantara
    </div>
  </div>
</body>
</html>
  `;

  await transporter.sendMail({
    from: from || user,
    to: email,
    subject: `Kode Reset Password Batari: ${code}`,
    text: `Kode reset kata sandi Batari Energy Anda adalah: ${code}\n\nKode ini berlaku selama 15 menit.\nJika Anda tidak merasa meminta reset kata sandi, silakan abaikan email ini.\n\nSalam,\nBatari Energy`,
    html: htmlContent,
    attachments,
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

  const hasTwilio =
    process.env.TWILIO_ACCOUNT_SID &&
    process.env.TWILIO_AUTH_TOKEN &&
    process.env.TWILIO_WHATSAPP_FROM;
  const hasMeta =
    process.env.WHATSAPP_ACCESS_TOKEN && process.env.WHATSAPP_PHONE_NUMBER_ID;

  if (!hasTwilio && !hasMeta) {
    console.log("\n=======================================================");
    console.log(`📱 [WHATSAPP RESET CODE] Nomor HP: +${normalizedPhone}`);
    console.log(`🔑 KODE OTP VERIFIKASI: ${code}`);
    console.log("⏱️  Masa berlaku: 15 menit.");
    console.log("ℹ️  (Gateway WhatsApp belum dikonfigurasi di .env)");
    console.log("=======================================================\n");
    return;
  }

  if (provider === "twilio") {
    const {
      TWILIO_ACCOUNT_SID,
      TWILIO_AUTH_TOKEN,
      TWILIO_WHATSAPP_FROM,
    } = process.env;

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

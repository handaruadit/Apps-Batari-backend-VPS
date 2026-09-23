//===== (Environment) ======
require("./env");

//===== (Imports) ======
const jwt = require("jsonwebtoken");

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET || JWT_SECRET.length < 32) {
  if (process.env.NODE_ENV === "production") {
    throw new Error("FATAL: JWT_SECRET harus disetel dan memiliki panjang minimal 32 karakter di lingkungan produksi.");
  } else {
    console.warn("PERINGATAN KEAMANAN: JWT_SECRET belum disetel atau kurang dari 32 karakter. Gunakan rahasia yang lebih kuat.");
  }
}

//===== (generateToken) ======
const generateToken = (payload) => {
  return jwt.sign(payload, JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || "24h",
  });
};

//===== (verifyToken) ======
const verifyToken = (token) => {
  return jwt.verify(token, JWT_SECRET);
};

//===== (Exports) ======
module.exports = { generateToken, verifyToken };
//===== (Environment) ======
require("./env");

//===== (Imports) ======
const jwt = require("jsonwebtoken");

//===== (generateToken) ======
const generateToken = (payload) => {
  return jwt.sign(payload, process.env.JWT_SECRET, {
    expiresIn: "7d",
  });
};

//===== (verifyToken) ======
const verifyToken = (token) => {
  return jwt.verify(token, process.env.JWT_SECRET);
};

//===== (Exports) ======
module.exports = { generateToken, verifyToken };
//===== (Imports) ======
const { verifyToken } = require("../config/jwt");

//===== (authMiddleware) ======
const authMiddleware = (req, res, next) => {
  const header = req.headers.authorization;

  if (!header) {
    return res.status(401).json({
      status: "error",
      message: "Authentication required. Please provide a valid token.",
    });
  }

  const token = header.split(" ")[1];
  if (!token) {
    return res.status(401).json({
      status: "error",
      message: "Authentication required. Token format: Bearer <token>",
    });
  }

  try {
    const decoded = verifyToken(token);
    req.user = decoded;
    next();
  } catch (err) {
    return res.status(401).json({
      status: "error",
      message: "Invalid or expired token. Please log in again.",
    });
  }
};

//===== (Exports) ======
module.exports = authMiddleware;
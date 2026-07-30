//===== (Imports) ======
const { verifyToken } = require("../config/jwt");

//===== (authMiddleware) ======
const authMiddleware = (req, res, next) => {
  const header = req.headers.authorization;

  if (!header) return res.status(401).json({ message: "No token" });

  const token = header.split(" ")[1];

  try {
    const decoded = verifyToken(token);
    req.user = decoded;
    next();
  } catch {
    res.status(401).json({ message: "Invalid token" });
  }
};

//===== (Exports) ======
module.exports = authMiddleware;
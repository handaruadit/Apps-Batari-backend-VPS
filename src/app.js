//===== (Imports) ======
const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");

//===== (Application) ======
const app = express();

//===== (Security Middleware) ======

// Helmet — automatic security headers (X-Content-Type-Options, X-Frame-Options, etc.)
app.use(helmet());

// CORS configuration
const ALLOWED_ORIGINS = [
  "https://bysense.batarienergy.com",
  "https://www.bysense.batarienergy.com",
  "http://bysense.batarienergy.com",
  "http://localhost:3000",
  "http://localhost:3003",
  "http://145.79.11.228:3000",
  "http://145.79.11.228:3003",
];

app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (server-to-server, next.js rewrites, mobile apps, curl)
      if (!origin) return callback(null, true);
      if (ALLOWED_ORIGINS.some((allowed) => origin.startsWith(allowed))) {
        return callback(null, true);
      }
      return callback(null, false);
    },
    credentials: true,
  })
);

// Global rate limiter — 1500 requests per 15 minutes per IP (ramah polling data mobile & web)
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 1500,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    status: "error",
    message: "Too many requests. Please try again later.",
  },
});
app.use(globalLimiter);

// Strict rate limiter for auth endpoints — 15 attempts per 15 minutes
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 15,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    status: "error",
    message: "Too many authentication attempts. Please try again in 15 minutes.",
  },
});

app.use(express.json({ limit: "1mb" }));

//===== (Routes) ======
// Apply strict auth rate limiter to authentication routes
app.use("/api/auth/login", authLimiter);
app.use("/api/auth/register", authLimiter);
app.use("/api/auth/forgot-password", authLimiter);
app.use("/api/auth/google-login", authLimiter);
app.use("/auth/login", authLimiter);
app.use("/auth/register", authLimiter);

app.use("/api/auth", require("./api/auth.routes"));
app.use("/auth", require("./api/auth.routes"));
app.use("/api/data", require("./api/data.routes"));
app.use("/api/plant", require("./api/plant.routes"));
app.use("/api/mqtt", require("./api/mqtt.routes"));
app.use("/api/deye", require("./api/deye.routes"));

//===== (Exports) ======
module.exports = app;

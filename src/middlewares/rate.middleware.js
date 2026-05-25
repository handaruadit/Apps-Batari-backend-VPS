const rateLimit = require('express-rate-limit');

// Limiter umum untuk semua API
const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 menit
  max: 100, // Maksimal 100 request per IP per 15 menit
  message: {
    message: "Terlalu banyak permintaan dari IP ini, silakan coba lagi nanti."
  },
  standardHeaders: true, // Kembalikan info rate limit di header `RateLimit-*`
  legacyHeaders: false, // Nonaktifkan header `X-RateLimit-*`
});

// Limiter khusus untuk fitur sensitif (Login / Ubah Password)
const sensitiveLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 jam
  max: 5, // Maksimal 5 kali percobaan per jam
  message: {
    message: "Terlalu banyak upaya perubahan password. Akun Anda dibatasi sementara demi keamanan."
  }
});

module.exports = { generalLimiter, sensitiveLimiter };
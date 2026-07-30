# belajar-api

Backend Node.js/Express untuk autentikasi, pengelolaan plant dan device, telemetry, chart energi, MQTT, serta pembaruan realtime melalui Socket.IO.

## Menjalankan lokal

1. Install dependency:

   ```bash
   npm install
   ```

2. Salin `.env.example` menjadi `.env`, lalu isi koneksi database, JWT, MQTT, email, dan WhatsApp yang diperlukan.

3. Siapkan database baru:

   ```bash
   psql -d apidb -f setup-db.sql
   ```

4. Jalankan development server:

   ```bash
   npm run dev
   ```

Server menggunakan `PORT` dari `.env`; jika tidak tersedia, fallback-nya adalah `3001`.

## Script

| Perintah | Kegunaan |
|---|---|
| `npm start` | Menjalankan server dengan Node.js |
| `npm run dev` | Menjalankan server dengan Nodemon |
| `npm test` | Menjalankan seluruh test satu kali |
| `npm run test:watch` | Menjalankan test dalam watch mode |

## Struktur utama

```text
src/
├── api/             # Definisi route HTTP
├── config/          # Environment, database, JWT, dan facade MQTT
├── controllers/     # Validasi request dan response HTTP
├── middlewares/     # Middleware autentikasi
├── mqtt/            # Config, parser, client, handler, dan BMS MQTT
├── services/
│   ├── data/        # Telemetry, chart, energy, repository, dan device access
│   └── ...          # Auth, plant, device registry, dan MockPlant
├── sockets/         # Socket.IO
├── validators/      # Validator payload
├── app.js           # Konfigurasi Express
└── index.js         # Bootstrap HTTP, MQTT, dan Socket.IO
```

Alur request utama tetap:

```text
route → controller → service → repository/database
```

## Dokumentasi

- Daftar endpoint: `ListAPI.md`
- Dummy/MockPlant: `DUMMY_DATA.md`
- Deployment VPS: `DEPLOY_VPS.md`
- Simulator Socket.IO manual: `tools/socket-client.html`

## MockPlant

`mockPlantData.service.js` tetap tersedia.

- Endpoint manual `POST /api/data/manual/send` tetap aktif untuk kebutuhan testing.
- Automatic sender tidak otomatis dimulai oleh source saat ini karena pemanggilan `startAutomaticPlantDataSender()` di `src/index.js` masih dikomentari.
- `MOCK_CHART_ENABLED` adalah fallback chart yang berbeda dan tidak menyimpan data ke database.

Gunakan MockPlant hanya pada environment development/testing dan jangan memasukkan kredensial asli ke repository.

## Database

`setup-db.sql` adalah schema lengkap untuk database baru. Script di `scripts/setup-*.sql` digunakan untuk memperbarui database yang sudah berjalan tanpa reset data.

Role akses plant yang disimpan di database:

- `owner`
- `editor`
- `viewer`

Alias seperti `can_manage` dan `only_view` tetap dinormalisasi oleh aplikasi agar request lama tetap kompatibel.

## Pemeriksaan sebelum deploy

```bash
npm test
```

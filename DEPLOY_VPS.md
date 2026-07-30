# Deploy Backend Apps Batari ke VPS Ubuntu 22.04

Panduan ini untuk deploy backend Node.js/Express dari repo:

```bash
https://github.com/handaruadit/Apps-Batari-backend-VPS.git
```

Target akses backend:

```bash
http://103.31.205.39:3000
```

Script production yang dipakai dari `package.json` adalah:

```bash
npm start
```

Script tersebut menjalankan:

```bash
node src/index.js
```

## 1. Masuk VPS

```bash
ssh ubuntu@103.31.205.39
```

## 2. Cek service dasar

Node.js, npm, PM2, PostgreSQL, Mosquitto, dan Nginx sudah terinstall. Cek ulang jika perlu:

```bash
node -v
npm -v
pm2 -v
sudo systemctl status postgresql --no-pager
sudo systemctl status mosquitto --no-pager
sudo systemctl status nginx --no-pager
```

## 3. Siapkan folder aplikasi

```bash
mkdir -p ~/apps
cd ~/apps
```

Jika repo belum ada di VPS:

```bash
git clone https://github.com/handaruadit/Apps-Batari-backend-VPS.git
cd Apps-Batari-backend-VPS
```

Jika repo sudah ada di VPS:

```bash
cd ~/apps/Apps-Batari-backend-VPS
git pull origin main
```

## 4. Install dependency

```bash
npm install
```

## 5. Buat user dan database PostgreSQL

Database yang dipakai:

- database: `apidb`
- user: `apiuser`
- password: isi sendiri, lalu samakan dengan `DB_PASSWORD` di `.env`

Jika pertama kali membuat user/database:

```bash
sudo -u postgres createuser --pwprompt apiuser
sudo -u postgres createdb -O apiuser apidb
sudo -u postgres psql -c "GRANT ALL PRIVILEGES ON DATABASE apidb TO apiuser;"
```

Jika user `apiuser` sudah ada dan hanya ingin mengganti password:

```bash
sudo -u postgres psql -c "ALTER USER apiuser WITH PASSWORD 'ISI_PASSWORD_BARU_DI_SINI';"
```

Jika database `apidb` sudah ada, jangan dibuat ulang. Cek dengan:

```bash
sudo -u postgres psql -lqt | cut -d \| -f 1 | grep -w apidb
```

## 6. Jalankan setup tabel

File schema yang disiapkan:

```bash
setup-db.sql
```

Jalankan:

```bash
sudo -u postgres psql -d apidb -f setup-db.sql
```

File ini akan membuat tabel jika belum ada:

- `users`
- `plants`
- `user_plants`
- `plant_devices`
- `registered_devices`
- `device_access_permissions`
- `device_data`
- `password_reset_codes`

File ini juga mengaktifkan `pgcrypto` untuk `gen_random_uuid()` dan membuat index yang dibutuhkan query data.

Jika tabel lain sudah ada dan hanya perlu menambahkan tabel Forgot Password tanpa menyentuh setup lain, jalankan script khusus ini:

```bash
sudo -u postgres psql -d apidb -f scripts/setup-password-reset-codes.sql
```

Script tersebut hanya membuat `password_reset_codes` jika belum ada, menyesuaikan tipe `user_id` dengan `users.id`, membuat index reset code, dan memberi permission ke user database aplikasi. Jika `DB_USER` di `.env` bukan `apiuser`, ganti nama user pada bagian `GRANT` di script sebelum dijalankan.

## 7. Buat file `.env` di VPS

```bash
nano .env
```

Isi contoh:

```env
PORT=3000

DB_HOST=localhost
DB_PORT=5432
DB_USER=apiuser
DB_PASSWORD=CHANGE_ME_DB_PASSWORD
DB_NAME=apidb

JWT_SECRET=CHANGE_ME_JWT_SECRET

MQTT_PROTOCOL=mqtt
MQTT_HOST=localhost
MQTT_PORT=1883
MQTT_CLIENT_ID=batari-backend-server
MQTT_USERNAME=
MQTT_PASSWORD=

MOCK_PLANT_ENABLED=false
MOCK_PLANT_ID=1
MOCK_PLANT_NAME=Plant Testing
MOCK_PLANT_INTERVAL_MS=300000

MOCK_CHART_ENABLED=false
MOCK_CHART_POINTS_PER_DAY=180
```

Ganti:

- `CHANGE_ME_DB_PASSWORD` dengan password PostgreSQL `apiuser`
- `CHANGE_ME_JWT_SECRET` dengan secret panjang dan acak

Jangan commit file `.env` ke GitHub.

Catatan MockPlant:

- Automatic sender tersedia, tetapi pemanggilannya di `src/index.js` tidak diaktifkan secara default.
- `MOCK_PLANT_ENABLED` hanya diperiksa ketika fungsi automatic sender dipanggil.
- Endpoint manual `POST /api/data/manual/send` tetap aktif untuk testing.

## 8. Test backend manual

Jalankan test terlebih dahulu:

```bash
npm test
```

Jika seluruh test lulus, jalankan:

```bash
npm start
```

Jika berhasil, server akan listen di:

```bash
0.0.0.0:3000
```

Tekan `Ctrl+C` setelah test manual selesai.

Untuk test cepat dari VPS:

```bash
curl http://localhost:3000
```

Catatan: jika root `/` menampilkan `Cannot GET /`, itu masih berarti server Express sudah terhubung. Endpoint utama berada di `/api/auth`, `/api/plant`, `/api/data`, dan `/api/mqtt`.

## 9. Jalankan backend 24 jam dengan PM2

```bash
pm2 start npm --name apps-batari-backend -- start
```

Cek status:

```bash
pm2 status
```

Simpan daftar proses PM2:

```bash
pm2 save
```

Aktifkan PM2 saat server reboot:

```bash
pm2 startup
```

PM2 akan menampilkan satu command `sudo ...`. Copy dan jalankan command tersebut, lalu:

```bash
pm2 save
```

## 10. Buka port 3000 jika firewall aktif

Cek UFW:

```bash
sudo ufw status
```

Jika UFW aktif, izinkan port 3000:

```bash
sudo ufw allow 3000/tcp
```

## 11. Test dari laptop atau HP

Buka:

```bash
http://103.31.205.39:3000
```

Untuk frontend mobile, arahkan `BASE_URL` ke:

```bash
http://103.31.205.39:3000
```

## 12. Lihat log PM2

```bash
pm2 logs apps-batari-backend
```

Log singkat:

```bash
pm2 logs apps-batari-backend --lines 100
```

## 13. Restart backend

```bash
pm2 restart apps-batari-backend
```

## 14. Dummy chart fallback untuk demo

Fitur ini hanya mengirim dummy chart sebagai response API saat data chart kosong. Backend tetap mencoba mengambil data real dari PostgreSQL terlebih dahulu, tidak membuat MQTT publisher baru, dan tidak insert dummy ke database.

Aktifkan di VPS:

```bash
nano .env
```

Isi atau ubah:

```env
MOCK_CHART_ENABLED=true
MOCK_CHART_POINTS_PER_DAY=180
```

Restart backend:

```bash
pm2 restart apps-batari-backend
```

Matikan lagi:

```bash
nano .env
```

Ubah:

```env
MOCK_CHART_ENABLED=false
```

Restart backend:

```bash
pm2 restart apps-batari-backend
```

## 15. Update backend setelah push terbaru

```bash
cd ~/apps/Apps-Batari-backend-VPS
git pull origin main
npm install
pm2 restart apps-batari-backend
```

## 16. Deploy memakai script opsional

Setelah `.env` dan database siap, script ini bisa dipakai untuk install dependency dan start/restart PM2:

```bash
chmod +x scripts/deploy-vps.sh
./scripts/deploy-vps.sh
```

Script ini aman untuk deploy ulang karena:

- tidak menjalankan `rm -rf`
- tidak menjalankan `DROP DATABASE`
- tidak menjalankan `DROP TABLE`
- tidak menjalankan `git reset --hard`
- menolak lanjut jika `.env` masih berisi placeholder

## 17. Environment variable yang dipakai backend

Wajib untuk VPS:

- `PORT`
- `DB_HOST`
- `DB_PORT`
- `DB_USER`
- `DB_PASSWORD`
- `DB_NAME`
- `JWT_SECRET`
- `MQTT_PROTOCOL`
- `MQTT_HOST`
- `MQTT_PORT`
- `MQTT_CLIENT_ID`
- `MQTT_USERNAME`
- `MQTT_PASSWORD`

Opsional:

- `MOCK_PLANT_ENABLED`
- `MOCK_PLANT_ID`
- `MOCK_PLANT_NAME`
- `MOCK_PLANT_INTERVAL_MS`
- `MOCK_CHART_ENABLED`
- `MOCK_CHART_POINTS_PER_DAY`

Untuk VPS ini gunakan Mosquitto lokal:

```env
MQTT_PROTOCOL=mqtt
MQTT_HOST=localhost
MQTT_PORT=1883
MQTT_USERNAME=
MQTT_PASSWORD=
```

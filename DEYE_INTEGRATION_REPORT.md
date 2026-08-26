# Laporan Integrasi Deye — Tahap 7 sampai 17

## Update integrasi frontend — 19 Agustus 2026

Status: jalur latest-data sampai frontend existing sudah terverifikasi.

- Station `61419275` didaftarkan ke plant `3` sebagai device virtual
  `DEYE_STATION_61419275` dengan inverter utama `2411216565`.
- Sinkronisasi manual memasukkan lima telemetry, query ulang menemukan lima
  baris, dan percobaan kedua dilewati sebagai duplikat.
- Mapper grid sekarang memakai fallback berurutan `gridPower`,
  `purchasePower`, lalu `wirePower`. Hal ini diperlukan karena station ini
  mengirim `gridPower = null` dan `wirePower` sebagai daya grid yang tersedia.
- Endpoint existing `/api/plant/3/devices` menampilkan device virtual Deye.
- Endpoint existing `/api/data` dan `/api/data/chart` menerima filter
  `device_id`/`deviceId`, memvalidasi device terhadap plant, dan berhasil
  mengembalikan data khusus Deye dengan JWT.
- Frontend `belajar-app` tidak memerlukan credential atau endpoint Deye baru;
  dashboard tetap memakai `/api/data` dan memilih
  `DEYE_STATION_61419275` dari daftar sumber data.
- Konfigurasi lokal frontend diarahkan ke `http://192.168.1.215:3001`.
- Satu siklus worker berhasil dengan `inserted=1`, `skipped=0`, `failed=0`.

Catatan: worker tetap harus dijalankan sebagai process terpisah dari Express
dengan `npm run deye:worker` pada deployment/runtime sebenarnya.

## Ringkasan

Modul latest-data Deye telah dipindahkan ke backend utama `belajar-api` tanpa mengganti backend dan tanpa mengubah file MQTT maupun BMS Jiabaida. Schema Deye sudah diterapkan pada PostgreSQL lokal. Authentication dan pembacaan live Deye berhasil.

Sinkronisasi database satu kali belum dijalankan karena `DEYE_PLANT_ID` belum ditentukan. Database saat ini memiliki plant 1, 2, dan 3; contoh plant 4 tidak ada. Menghubungkan station ke plant secara tebakan akan melanggar isolasi plant.

Sesuai urutan spesifikasi, frontend, history, dan backfill tidak dilanjutkan sebelum latest-data berhasil masuk dan terbaca kembali dari PostgreSQL.

## Tahap 7 — Integrasi modul

Status: selesai.

- `src/integrations/deye/deye.client.js`: HTTP Deye, timeout, token cache, dan satu kali retry 401.
- `src/integrations/deye/deye.mapper.js`: allowlist lima telemetry, W ke kW, SOC, timestamp, null/NaN, dan sign preservation.
- `src/integrations/deye/deye.repository.js`: operasi Knex, registration, insert telemetry, row lock, dan duplicate prevention.
- `src/integrations/deye/deye.service.js`: business flow dan isolasi error per station.
- `src/controllers/deye.controller.js`: diagnostic/manual admin dengan error mapping.
- `src/api/deye.routes.js`: route khusus admin; frontend tetap menggunakan `/api/data`.
- `src/workers/deyeSync.worker.js`: worker terpisah, interval env, PostgreSQL advisory lock, logging, dan graceful shutdown.

MQTT handler dan BMS Jiabaida tidak dimodifikasi. Seluruh regression test keduanya tetap lulus.

## Tahap 8 — Manual sync satu kali

Status: sebagian; probe live selesai, insert menunggu plant tujuan.

Perintah `npm run deye:probe` berhasil melakukan authentication, station list, station latest, station devices, measure points, device latest, serta mapping. Sampel live menghasilkan PV 3.676 kW, Load 6.566 kW, Battery 3.002 kW, dan SOC 41%. Grid tidak dibuat karena sumber mengembalikan nilai kosong/tidak valid.

Setelah `DEYE_PLANT_ID` dipilih:

```powershell
npm run deye:register
npm run deye:sync-once
```

`sync-deye-once` melakukan sync pertama, query ulang timestamp sumber yang sama, sync kedua, dan gagal secara eksplisit bila sync kedua tidak di-skip.

## Tahap 9 — Duplicate prevention

Status implementasi: selesai.

Repository mengunci row integration dengan `FOR UPDATE`, membandingkan timestamp Deye dengan `last_source_timestamp`, dan melewati timestamp sama atau lebih lama. Insert `device_data` dan update `last_source_timestamp` berada dalam transaksi yang sama. Jika insert gagal, update timestamp ikut rollback. Partial unique index Deye menjadi perlindungan database tambahan.

## Tahap 10 — Existing API

Status implementasi: selesai; verifikasi live Deye menunggu insert.

Device virtual dimasukkan ke `plant_devices`, sehingga JWT dan pemeriksaan `user_plants` existing otomatis berlaku pada `/api/data`, chart, daily, monthly, yearly, dan lifetime. Endpoint `/api/deye` memakai JWT serta role admin dan hanya untuk diagnostic/manual operation.

## Tahap 11 — Frontend

Status: belum dimulai sesuai gate spesifikasi. Latest-data belum bisa dimasukkan sebelum plant tujuan dipilih. Frontend lama tidak diubah sehingga plant MQTT lama tetap aman.

## Tahap 12 — Timestamp/timezone

Status backend latest: diterapkan sebagian.

- Timestamp Deye dinormalisasi secara eksplisit ke ISO UTC.
- Measurement memakai timestamp sumber, bukan waktu insert.
- `APP_TIME_ZONE=Asia/Jakarta` menetapkan timezone Node secara eksplisit dan tidak bergantung pada OS.
- Database lokal melaporkan timezone `Asia/Bangkok` (offset sama UTC+7, tetapi nama berbeda).

Plant-specific CSV/frontend timezone belum diverifikasi karena frontend belum masuk gate pengerjaan.

## Tahap 13–14 — History dan backfill

Status: sengaja belum dimulai. Spesifikasi melarang history sebelum latest-data terbukti bekerja. Endpoint, periode maksimum, dan sampling history Deye juga belum dikontrak oleh data Tahap 4.

## Tahap 15 — Auto sync

Status implementasi: selesai, aktivasi ditahan.

Worker dijalankan terpisah dengan `npm run deye:worker`. Interval berasal dari `DEYE_SYNC_INTERVAL_MS`; default 300000 ms dan minimum 10000 ms. `DEYE_SYNC_ENABLED` default false. PostgreSQL advisory lock memastikan hanya satu worker memegang polling lock. SIGINT/SIGTERM melepaskan lock dan menutup pool database.

Worker tidak boleh diaktifkan sebelum manual sync sukses.

## Tahap 16 — Error handling

Status implementasi: selesai untuk latest flow.

Timeout, authentication error, refresh 401, cloud/network/5xx wrapping, invalid response rejection, transaction rollback, logging tanpa token/credential, dan isolasi kegagalan per station telah diterapkan. Express tidak bergantung pada worker, sehingga kegagalan Deye tidak menghentikan pembacaan data terakhir PostgreSQL.

## Tahap 17 — Hasil testing

- Backend regression: 23 suite lulus.
- Total: 185 test lulus, 0 gagal.
- Deye live authentication: berhasil.
- Station list: berhasil, 33 station terbaca.
- Station latest: berhasil.
- Device latest: berhasil, 1 device terbaca.
- Mapper: berhasil.
- PostgreSQL connection: berhasil.
- Migration `deye_integrations`: berhasil.
- MQTT/BMS regression: lulus dan file implementasinya tidak disentuh.
- Insert/query/duplicate live: menunggu `DEYE_PLANT_ID`.
- Existing API live dan frontend: menunggu insert live.
- History/backfill: menunggu latest-data gate.

## Langkah yang diperlukan dari operator

Pilih plant tujuan yang benar dan isi `DEYE_PLANT_ID` pada `.env`. Pilihan database saat pemeriksaan adalah:

- plant 1 — Plant Testing;
- plant 2 — Plant Testing;
- plant 3 — Handaru Raditya Agung.

Setelah itu jalankan, berurutan:

```powershell
npm run deye:check
npm run deye:register
npm run deye:sync-once
npm test
```

Jangan mengaktifkan worker atau mengubah frontend sebelum `deye:sync-once` membuktikan insert, query ulang, timestamp sumber, dan duplicate skip.

## Update multi-plant - 26 Agustus 2026

- Discovery aktual: 34 station dan 77 device, tanpa kegagalan discovery.
- Dry-run mapping: 1 integration existing (Keith), 33 plant baru, 0 candidate,
  0 ambiguous, dan 0 delete.
- PostgreSQL lokal dibackup sebelum import. Migration hanya menambah metadata
  integration dan tabel inventory `deye_devices` secara non-destruktif.
- Import pertama: 33 plant dibuat, 1 direuse, 77 device dimasukkan.
- Import kedua: 0 plant baru, 0 device baru, 34 integration direuse, sehingga
  idempotency plant/device terverifikasi.
- Seluruh 34 integration berhasil diproses. Dua station tanpa source timestamp
  dilaporkan `skipped/no_source_timestamp`, bukan menyebabkan worker gagal.
- Validasi Keith dan PJT Gunungsari menunjukkan device overlap 0 dan telemetry
  hanya berasal dari virtual device station milik plant masing-masing.
- Frontend memakai API existing `/api/plant`, `/api/plant/:id/devices`, dan
  `/api/data`. State overview/device direset saat `plantId` berubah dan response
  async dari plant lama diabaikan.

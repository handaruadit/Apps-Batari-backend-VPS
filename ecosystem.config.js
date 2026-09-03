module.exports = {
  apps: [
    {
      name: "batari-api",
      script: "src/index.js",
      instances: 1,
      exec_mode: "fork",
      autorestart: true,
      watch: false,
      max_memory_restart: "500M",
      env: {
        NODE_ENV: "production",
      },
    },
    {
      name: "batari-deye-worker",
      script: "src/workers/deyeSync.worker.js",
      instances: 1,
      exec_mode: "fork",
      autorestart: true,
      watch: false,
      max_memory_restart: "300M",
      env: {
        NODE_ENV: "production",
      },
    },
  ],
};

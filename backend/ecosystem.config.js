module.exports = {
  apps: [
    {
      name: 'wedeazzy-api',
      script: 'src/server.js',
      // IMPORTANT: Must use fork mode (not cluster) because Baileys WhatsApp
      // WebSocket client maintains a single persistent connection that cannot be
      // shared across Node.js cluster worker processes. Cluster mode would create
      // multiple disconnected Baileys instances that fight over the WA socket.
      instances: 1,
      exec_mode: 'fork',

      // Restart policy
      autorestart: true,
      watch: false,
      max_memory_restart: '1G',

      // Environment
      env_production: {
        NODE_ENV: 'production',
        PORT: 4000,
      },

      // Logs
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      combine_logs: true,
      error_file: 'logs/err.log',
      out_file: 'logs/out.log',
      merge_logs: true,

      // Graceful reload
      kill_timeout: 8000,
      listen_timeout: 10000,
      shutdown_with_message: true,
    }
  ]
};

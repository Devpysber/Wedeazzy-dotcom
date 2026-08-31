const pino = require('pino');
const env = require('./env');

let transport;
if (env.NODE_ENV !== 'production') {
  try {
    require.resolve('pino-pretty');
    transport = {
      target: 'pino-pretty',
      options: { colorize: true, translateTime: 'HH:MM:ss' },
    };
  } catch (err) {
    // pino-pretty not available, fallback to standard stream
  }
}

const logger = pino({
  level: env.NODE_ENV === 'production' ? 'info' : 'debug',
  transport,
  base: { service: 'wedeazzy-api' },
});

module.exports = logger;

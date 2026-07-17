const pino = require('pino');
const env = require('./env');

const logger = pino({
  level: env.NODE_ENV === 'production' ? 'info' : 'debug',
  transport: env.NODE_ENV === 'production' ? undefined : {
    target: 'pino-pretty',
    options: { colorize: true, translateTime: 'HH:MM:ss' },
  },
  base: { service: 'wedeazzy-api' },
});

module.exports = logger;

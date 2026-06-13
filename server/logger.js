const pino = require('pino');

const isTest = process.env.NODE_ENV === 'test' || process.env.JEST_WORKER_ID;
const level = process.env.LOG_LEVEL || (process.env.NODE_ENV === 'production' ? 'info' : 'debug');

const opts = { level };

/* 非测试、非生产环境使用 pretty print */
if (!isTest && process.env.NODE_ENV !== 'production') {
  opts.transport = { target: 'pino-pretty', options: { colorize: true } };
}

const logger = pino(opts);

module.exports = logger;

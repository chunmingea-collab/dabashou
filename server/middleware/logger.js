const logger = require('../logger');

function requestLogger(req, res, next) {
  const start = Date.now();
  res.on('finish', () => {
    const ms = Date.now() - start;
    const data = { method: req.method, path: req.path, status: res.statusCode, ms };
    if (res.statusCode >= 500) logger.error(data);
    else if (res.statusCode >= 400) logger.warn(data);
    else logger.info(data);
  });
  next();
}

module.exports = { requestLogger };

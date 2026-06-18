/**
 * asyncHandler – 包装 async 路由处理器
 * Express 4.x 不会自动捕获 async 函数抛出的异常，
 * 此包装器将 Promise reject 转发给 next(err)
 *
 * @param {(req: import('express').Request, res: import('express').Response, next: import('express').NextFunction) => Promise<any>} handler
 * @returns {(req: import('express').Request, res: import('express').Response, next: import('express').NextFunction) => void}
 */
function asyncHandler(handler) {
  return (req, res, next) => {
    try {
      const result = handler(req, res, next);
      if (result && typeof result.then === 'function') {
        result.catch(next);
      }
    } catch (err) {
      next(err);
    }
  };
}

module.exports = asyncHandler;

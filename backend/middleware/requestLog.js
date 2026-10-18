/**
 * One line per request: method, path, status, milliseconds.
 * The query string is left out on purpose: searches can contain patient names or IDs.
 */
export function requestLog(write = line => console.log(line)) {
  return function logRequest(req, res, next) {
    const started = process.hrtime.bigint();
    res.on('finish', () => {
      const ms = Number(process.hrtime.bigint() - started) / 1e6;
      const path = (req.originalUrl || req.url).split('?')[0];
      write(`${new Date().toISOString()} ${req.method} ${path} ${res.statusCode} ${ms.toFixed(1)}ms`);
    });
    next();
  };
}

function errorHandler(err, req, res, next) {
  if (res.headersSent) return next(err);
  let status = Number.isInteger(err.status) && err.status >= 400 && err.status < 600 ? err.status : 500;
  if (err.name === 'ValidationError' || err.name === 'CastError') status = 400;
  if (err.code === 11000) status = 409;
  if (process.env.NODE_ENV !== 'production') {
    console.error(`${req.method} ${req.path}: ${err.name || 'Error'} (HTTP ${status})`);
  }
  const message = err.code === 11000 ? 'A record with that value already exists' :
    status === 400 && err.name === 'ValidationError' ? 'Request validation failed' :
    status === 400 && err.name === 'CastError' ? 'Invalid request value' :
    status === 500 && process.env.NODE_ENV === 'production' ? 'Internal server error' : err.message;
  res.status(status).json({
    success: false,
    error: message
  });
}

module.exports = errorHandler;

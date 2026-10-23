const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const path = require('node:path');
const healthRoutes = require('./routes/healthRoutes');
const notFound = require('./middleware/notFound');
const errorHandler = require('./middleware/errorHandler');

const app = express();
const isProduction = process.env.NODE_ENV === 'production';
const configuredOrigins = process.env.CLIENT_URL || (isProduction ? '' : 'http://localhost:5173');
const allowedOrigins = configuredOrigins
  .split(',').map((origin) => origin.trim()).filter(Boolean);

app.disable('x-powered-by');
app.use(helmet());
app.use(cors({
  origin(origin, callback) {
    if (!origin || allowedOrigins.includes(origin)) return callback(null, true);
    // A same-origin production frontend does not need CORS headers. With no
    // CLIENT_URL configured, leave browser CORS enforcement to the browser.
    if (isProduction && !process.env.CLIENT_URL) return callback(null, false);
    return callback(Object.assign(new Error('Origin is not allowed by CORS'), { status: 403 }));
  }
}));
app.use(express.json({ limit: '100kb' }));
app.use((req, res, next) => {
  if (process.env.NODE_ENV !== 'production') console.info(`${req.method} ${req.path}`);
  next();
});
app.use('/api/health', healthRoutes);
// Keep API misses on the JSON 404 path before static files are considered.
app.use('/api', notFound);
if (isProduction) {
  app.use(express.static(path.join(__dirname, '..', 'dist'), { fallthrough: true }));
}
// This is a single-page site with anchor navigation, so no HTML route fallback
// is needed. Unknown paths retain the existing JSON 404 response.
app.use(notFound);
app.use(errorHandler);

module.exports = app;

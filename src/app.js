const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const healthRoutes = require('./routes/healthRoutes');
const notFound = require('./middleware/notFound');
const errorHandler = require('./middleware/errorHandler');

const app = express();
const allowedOrigins = (process.env.CLIENT_URL || 'http://localhost:5173')
  .split(',').map((origin) => origin.trim()).filter(Boolean);

app.disable('x-powered-by');
app.use(helmet());
app.use(cors({
  origin(origin, callback) {
    if (!origin || allowedOrigins.includes(origin)) return callback(null, true);
    return callback(Object.assign(new Error('Origin is not allowed by CORS'), { status: 403 }));
  }
}));
app.use(express.json({ limit: '100kb' }));
app.use((req, res, next) => {
  if (process.env.NODE_ENV !== 'production') console.info(`${req.method} ${req.path}`);
  next();
});
app.use('/api/health', healthRoutes);
app.use(notFound);
app.use(errorHandler);

module.exports = app;

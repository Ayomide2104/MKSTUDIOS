const express = require('express');
const mongoose = require('mongoose');

const router = express.Router();

router.get('/', (req, res) => {
  res.status(200).json({
    success: true,
    data: { status: 'ok', timestamp: new Date().toISOString(), environment: process.env.NODE_ENV || 'development' }
  });
});

router.get('/db', (req, res) => {
  const connected = mongoose.connection.readyState === 1;
  res.status(connected ? 200 : 503).json({
    success: connected,
    data: { status: connected ? 'connected' : 'unavailable', timestamp: new Date().toISOString() }
  });
});

module.exports = router;

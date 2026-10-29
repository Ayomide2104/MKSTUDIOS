require('dotenv').config();

const app = require('./app');
const { attachSocketServer } = require('./socket');
const mongoose = require('mongoose');
const { connectDatabase } = require('./config/db');
const { describeMongoError } = require('./config/dbDiagnostics');

const port = Number.parseInt(process.env.PORT || '3000', 10);
let server;
let shuttingDown = false;
let databaseRetry;

async function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.info(`${signal} received; shutting down.`);
  if (server) {
    await new Promise((resolve) => server.close(resolve));
  }
  if (databaseRetry) clearTimeout(databaseRetry);
  try {
    await mongoose.disconnect();
  } catch {
    console.error('Error while closing MongoDB connection.');
    process.exitCode = 1;
  }
}

async function connectWithRetry() {
  if (shuttingDown || mongoose.connection.readyState === 1) return;
  try {
    await connectDatabase();
  } catch (error) {
    console.error('MongoDB is unavailable; API health remains available.');
    console.error('MongoDB diagnostic:', JSON.stringify(describeMongoError(error)));
    if (!shuttingDown) databaseRetry = setTimeout(() => { void connectWithRetry(); }, 30000);
  }
}

function start() {
  const http = require('node:http');

  server = http.createServer(app);
  attachSocketServer(server, app);

  server.listen(port, '0.0.0.0', () => {
    console.info(`Server listening on port ${port}.`);
    void connectWithRetry();
  });
}

process.on('SIGINT', () => { void shutdown('SIGINT'); });
process.on('SIGTERM', () => { void shutdown('SIGTERM'); });
start();

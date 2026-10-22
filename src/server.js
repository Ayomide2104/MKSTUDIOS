require('dotenv').config();

const app = require('./app');
const mongoose = require('mongoose');
const { connectDatabase } = require('./config/db');

const port = Number.parseInt(process.env.PORT || '3000', 10);
let server;
let shuttingDown = false;

async function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.info(`${signal} received; shutting down.`);
  if (server) {
    await new Promise((resolve) => server.close(resolve));
  }
  try {
    await mongoose.disconnect();
  } catch {
    console.error('Error while closing MongoDB connection.');
    process.exitCode = 1;
  }
}

async function start() {
  try {
    await connectDatabase();
    server = app.listen(port, () => console.info(`API listening on port ${port}.`));
  } catch (error) {
    const message = error.message === 'MONGODB_URI is required. Set it in your local .env file.'
      ? error.message
      : error.message.startsWith('MONGODB_URI still contains the example password placeholder.')
        ? error.message
      : 'Startup failed: unable to connect to MongoDB. Check the local URI, Atlas Network Access, and database user permissions.';
    console.error(message);
    await mongoose.disconnect().catch(() => {});
    process.exitCode = 1;
  }
}

process.on('SIGINT', () => { void shutdown('SIGINT'); });
process.on('SIGTERM', () => { void shutdown('SIGTERM'); });
void start();

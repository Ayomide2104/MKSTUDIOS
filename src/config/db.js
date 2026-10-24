const mongoose = require('mongoose');
const { describeMongoError } = require('./dbDiagnostics');

let connectionEventsAttached = false;
let hasConnected = false;

function attachConnectionEvents(connection) {
  if (connectionEventsAttached) return;
  connectionEventsAttached = true;

  connection.on('connected', () => {
    hasConnected = true;
    console.info('MongoDB connection established.');
  });
  connection.on('error', (error) => {
    if (hasConnected) {
      console.error('MongoDB connection event:', JSON.stringify(describeMongoError(error)));
    }
  });
  connection.on('disconnected', () => {
    if (hasConnected) console.warn('MongoDB connection disconnected.');
  });
}

async function connectDatabase() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    throw new Error('MONGODB_URI is required. Set it in your local .env file.');
  }
  if (uri.includes('REPLACE_WITH_NEW_PASSWORD')) {
    throw new Error('MONGODB_URI still contains the example password placeholder. Replace it in your local .env file after rotating the Atlas password.');
  }

  const connection = mongoose.connection;
  attachConnectionEvents(connection);

  await mongoose.connect(uri, { dbName: 'mkstudios', serverSelectionTimeoutMS: 10000 });
  if (connection.readyState !== 1) {
    throw new Error('MongoDB did not reach the connected state.');
  }
  return connection;
}

module.exports = { connectDatabase };

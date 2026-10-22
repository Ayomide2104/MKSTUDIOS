const mongoose = require('mongoose');

async function connectDatabase() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    throw new Error('MONGODB_URI is required. Set it in your local .env file.');
  }
  if (uri.includes('REPLACE_WITH_NEW_PASSWORD')) {
    throw new Error('MONGODB_URI still contains the example password placeholder. Replace it in your local .env file after rotating the Atlas password.');
  }

  const connection = mongoose.connection;
  connection.on('connected', () => console.info('MongoDB connection established.'));
  connection.on('error', () => console.error('MongoDB connection error. Check Atlas credentials, network access, and database permissions.'));
  connection.on('disconnected', () => console.warn('MongoDB connection disconnected.'));

  await mongoose.connect(uri, { dbName: 'mkstudios', serverSelectionTimeoutMS: 10000 });
  if (connection.readyState !== 1) {
    throw new Error('MongoDB did not reach the connected state.');
  }
  return connection;
}

module.exports = { connectDatabase };

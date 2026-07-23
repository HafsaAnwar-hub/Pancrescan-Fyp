const mongoose = require('mongoose');

mongoose.set('bufferCommands', false);
let connectionPromise;

async function connectDB() {
  if (!process.env.MONGODB_URI) {
    return false;
  }

  if (mongoose.connection.readyState === 1) {
    return true;
  }

  if (connectionPromise) {
    return connectionPromise;
  }

  connectionPromise = mongoose.connect(process.env.MONGODB_URI, {
    serverSelectionTimeoutMS: 5000
  }).then(() => {
    console.log('MongoDB connected');
    return true;
  }).catch((err) => {
    connectionPromise = undefined;
    throw err;
  });

  return connectionPromise;
}

module.exports = connectDB;
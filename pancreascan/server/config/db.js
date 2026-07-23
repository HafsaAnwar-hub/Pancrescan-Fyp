const mongoose = require('mongoose');

async function connectDB() {
  if (!process.env.MONGODB_URI) {
    console.warn('MONGODB_URI is not set. Continuing without MongoDB for local password reset flow.');
    return;
  }

  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('MongoDB connected');
  } catch (err) {
    console.warn('MongoDB connection error:', err.message);
    console.warn('Continuing without MongoDB. Password reset will use temporary in-memory fallback.');
  }
}

module.exports = connectDB;
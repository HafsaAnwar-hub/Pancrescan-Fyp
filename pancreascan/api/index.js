const app = require('../server/server');
const connectDB = require('../server/config/db');

module.exports = async (req, res) => {
	try {
		await connectDB();
	} catch (err) {
		console.error('MongoDB connection failed:', err.message);
	}

	return app(req, res);
};
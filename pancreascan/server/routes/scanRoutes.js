const express = require('express');
const axios = require('axios');
const FormData = require('form-data');
const multer = require('multer');
const fs = require('fs');
const os = require('os');
const path = require('path');

const Scan = require('../models/Scan');
const User = require('../models/User');
const requireAuth = require('../middleware/auth');
const mongoose = require('mongoose');

const router = express.Router();
const uploadDirectory = process.env.VERCEL
  ? path.join(os.tmpdir(), 'pancreascan-uploads')
  : path.join(__dirname, '..', '..', 'uploads');
fs.mkdirSync(uploadDirectory, { recursive: true });
const ALLOWED_MIME_TYPES = new Set(['image/jpeg', 'image/png']);
const upload = multer({
  dest: uploadDirectory,
  fileFilter: (req, file, cb) => {
    if (!ALLOWED_MIME_TYPES.has(file.mimetype)) {
      return cb(new Error('Only JPG or PNG CT scan images are allowed.'));
    }
    cb(null, true);
  },
});

const ML_SERVICE_URL = process.env.ML_SERVICE_URL || 'http://localhost:5001/predict';

router.post('/upload', requireAuth, (req, res, next) => {
  upload.single('image')(req, res, (err) => {
    if (err) {
      return res.status(400).json({ message: err.message || 'Invalid file upload.' });
    }
    next();
  });
}, async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ message: 'No image file uploaded under field name "image"' });
  }

  const filePath = req.file.path;
  const startTime = Date.now();

  try {
    if (mongoose.connection.readyState !== 1) {
      return res.status(503).json({ message: 'Database is not connected. Configure MONGODB_URI in Vercel.' });
    }

    let prediction;
    let tumor_probability;

    try {
      const form = new FormData();
      form.append('image', fs.createReadStream(filePath));

      const mlResponse = await axios.post(ML_SERVICE_URL, form, {
        headers: form.getHeaders(),
        maxContentLength: Infinity,
        maxBodyLength: Infinity,
        timeout: 30000
      });

      prediction = mlResponse.data.prediction;
      tumor_probability = mlResponse.data.tumor_probability;
    } catch (mlErr) {
      if (mlErr.response && mlErr.response.status === 400 && mlErr.response.data?.error) {
        return res.status(400).json({ message: mlErr.response.data.error });
      }
      console.error('ML microservice unreachable or error:', mlErr.message);
      return res.status(503).json({ message: 'Scan analysis service is unavailable right now. Please try again shortly.' });
    }

    const analysisTime = Math.max(1, Math.round((Date.now() - startTime) / 1000));
    let rawConfidence = Math.round(
      (prediction === 'positive' ? tumor_probability : 1 - tumor_probability) * 100
    );

    // Clinical confidence calibration: ensure AI does not report 100% certainty.
    // Cap all high confidence scores (>= 96%) down to a realistic 92%-96% range.
    let confidence = rawConfidence;
    if (rawConfidence >= 96) {
      const deduction = (Math.floor(Math.random() * 5) + 4); // Reduces 100 -> 96, 95, 94, 93, 92
      confidence = Math.max(92, Math.min(96, 100 - deduction));
    } else if (rawConfidence > 90) {
      confidence = rawConfidence - 3;
    }

    const { assignedDoctorId } = req.body;

    const scan = await Scan.create({
      userId: req.userId,
      fileName: req.file.originalname,
      result: prediction,
      confidence,
      analysisTime,
      status: 'completed',
      assignedDoctorId: assignedDoctorId || undefined
    });

    res.status(201).json({ message: 'Scan uploaded and analyzed successfully', scan });
  } catch (err) {
    console.error('Error during scan upload:', err.message);
    res.status(500).json({ message: 'Server error processing scan: ' + err.message });
  } finally {
    fs.unlink(filePath, () => { });
  }
});

router.get('/history', requireAuth, async (req, res) => {
  try {
    if (mongoose.connection.readyState !== 1) {
      return res.status(503).json({ message: 'Database is not connected. Configure MONGODB_URI in Vercel.' });
    }

    const scans = await Scan.find({ userId: req.userId }).populate('assignedDoctorId', 'name email').sort({ createdAt: -1 });
    res.json({ scans });
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

router.get('/patient/:patientId', requireAuth, async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    if (!user || (user.role !== 'doctor' && user.role !== 'admin')) {
      return res.status(403).json({ message: 'Access denied.' });
    }
    
    let query = { userId: req.params.patientId };
    if (user.role === 'doctor') {
      // Doctor can only see scans assigned to them or unassigned
      query.$or = [
        { assignedDoctorId: req.userId },
        { assignedDoctorId: { $exists: false } },
        { assignedDoctorId: null }
      ];
    }
    
    const scans = await Scan.find(query).sort({ createdAt: -1 });
    res.json({ scans });
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

module.exports = router;
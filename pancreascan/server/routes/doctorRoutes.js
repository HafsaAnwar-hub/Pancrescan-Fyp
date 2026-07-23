const express = require('express');
const DoctorRequest = require('../models/DoctorRequest');
const User = require('../models/User');
const requireAuth = require('../middleware/auth');

const router = express.Router();

const DOCTORS = [
  { name: 'Dr. Fatima Khan', role: 'Pancreatic Surgeon', phone: '+92 300 1234567' },
  { name: 'Dr. Ahmed Malik', role: 'Medical Oncologist', phone: '+92 301 2345678' },
  { name: 'Dr. Ayesha Siddiqui', role: 'Radiologist', phone: '+92 302 3456789' }
];

router.get('/', async (req, res) => {
  try {
    const dbDoctors = await User.find({ role: 'doctor', isApproved: true }).select('name email');
    if (dbDoctors && dbDoctors.length > 0) {
      const formatted = dbDoctors.map(d => ({ id: d._id, name: `Dr. ${d.name.replace(/^Dr\.\s*/i, '')}`, role: 'Oncology Specialist', email: d.email }));
      return res.json({ doctors: formatted });
    }
    res.json({ doctors: DOCTORS });
  } catch (e) {
    res.json({ doctors: DOCTORS });
  }
});

router.post('/contact', async (req, res) => {
  try {
    const { name, email, phone, message, doctorId, userId } = req.body;
    if (!name || !email) {
      return res.status(400).json({ message: 'Name and email are required' });
    }
    const request = await DoctorRequest.create({
      userId: userId || undefined,
      doctorId: doctorId || undefined,
      name,
      email,
      phone,
      message
    });
    res.status(201).json({ message: 'Request received', request });
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

router.get('/callbacks', requireAuth, async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    if (!user || (user.role !== 'doctor' && user.role !== 'admin')) {
      return res.status(403).json({ message: 'Access denied. Only registered doctors and administrators can view callback inquiries.' });
    }
    
    let query = {};
    if (user.role === 'doctor') {
      // Doctor only sees callback requests assigned to them or unassigned
      query.$or = [
        { doctorId: req.userId },
        { doctorId: { $exists: false } },
        { doctorId: null }
      ];
    }
    
    const requests = await DoctorRequest.find(query).sort({ createdAt: -1 });
    res.json({ requests });
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

router.patch('/callbacks/:id', requireAuth, async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    if (!user || (user.role !== 'doctor' && user.role !== 'admin')) {
      return res.status(403).json({ message: 'Access denied.' });
    }
    const { status } = req.body;
    if (!['pending', 'resolved'].includes(status)) {
      return res.status(400).json({ message: 'Invalid status' });
    }
    const request = await DoctorRequest.findByIdAndUpdate(req.params.id, { status }, { new: true });
    if (!request) return res.status(404).json({ message: 'Inquiry not found' });
    res.json({ message: 'Status updated', request });
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

router.get('/patients', requireAuth, async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    if (!user || (user.role !== 'doctor' && user.role !== 'admin')) {
      return res.status(403).json({ message: 'Access denied.' });
    }
    let patients;
    if (user.role === 'admin') {
      patients = await User.find({ role: 'patient' }).select('-password').sort({ createdAt: -1 });
    } else {
      // Find patients who have assigned scans or requested callback from this doctor
      const Scan = require('../models/Scan');
      const assignedScanUserIds = await Scan.distinct('userId', { assignedDoctorId: req.userId });
      const callbackUserIds = await DoctorRequest.distinct('userId', { doctorId: req.userId });
      
      // Combine user IDs
      const combinedUserIds = [...new Set([...assignedScanUserIds, ...callbackUserIds].map(id => id ? id.toString() : null).filter(Boolean))];
      
      patients = await User.find({ role: 'patient', _id: { $in: combinedUserIds } }).select('-password').sort({ createdAt: -1 });
    }
    res.json({ patients });
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

module.exports = router;
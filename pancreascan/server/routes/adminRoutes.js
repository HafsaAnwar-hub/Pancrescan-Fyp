const express = require('express');
const User = require('../models/User');
const Scan = require('../models/Scan');
const DoctorRequest = require('../models/DoctorRequest');
const requireAuth = require('../middleware/auth');

const router = express.Router();

// Helper middleware to ensure user is admin
async function requireAdmin(req, res, next) {
  try {
    const user = await User.findById(req.userId);
    if (!user || user.role !== 'admin') {
      return res.status(403).json({ message: 'Access denied. Administrator privileges required.' });
    }
    next();
  } catch (err) {
    res.status(500).json({ message: 'Authorization error', error: err.message });
  }
}

// Get Admin dashboard statistics
router.get('/stats', requireAuth, requireAdmin, async (req, res) => {
  try {
    const totalUsers = await User.countDocuments();
    const totalPatients = await User.countDocuments({ role: 'patient' });
    const totalDoctors = await User.countDocuments({ role: 'doctor' });
    const totalScans = await Scan.countDocuments();
    const totalCallbacks = await DoctorRequest.countDocuments();
    const pendingCallbacks = await DoctorRequest.countDocuments({ status: 'pending' });

    res.json({
      stats: {
        totalUsers,
        totalPatients,
        totalDoctors,
        totalScans,
        totalCallbacks,
        pendingCallbacks
      }
    });
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

// List all registered users
router.get('/users', requireAuth, requireAdmin, async (req, res) => {
  try {
    const users = await User.find().select('-password').sort({ createdAt: -1 });
    res.json({ users });
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

// Update a user's role
router.patch('/users/:id/role', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { role } = req.body;
    if (!['patient', 'doctor', 'admin'].includes(role)) {
      return res.status(400).json({ message: 'Invalid role choice' });
    }
    const user = await User.findByIdAndUpdate(req.params.id, { role }, { new: true }).select('-password');
    if (!user) return res.status(404).json({ message: 'User not found' });
    res.json({ message: 'User role updated successfully', user });
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

// Delete a user
router.delete('/users/:id', requireAuth, requireAdmin, async (req, res) => {
  try {
    const user = await User.findByIdAndDelete(req.params.id);
    if (!user) return res.status(404).json({ message: 'User not found' });
    
    // Clean up scans uploaded by this user if they were a patient
    await Scan.deleteMany({ userId: req.params.id });

    res.json({ message: 'User and their related data deleted successfully' });
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

// Delete a callback inquiry
router.delete('/callbacks/:id', requireAuth, requireAdmin, async (req, res) => {
  try {
    const request = await DoctorRequest.findByIdAndDelete(req.params.id);
    if (!request) return res.status(404).json({ message: 'Inquiry not found' });
    res.json({ message: 'Inquiry deleted successfully' });
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

// Toggle user approval status (e.g. for doctors)
router.patch('/users/:id/approve', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { isApproved } = req.body;
    if (typeof isApproved !== 'boolean') {
      return res.status(400).json({ message: 'isApproved field must be a boolean' });
    }
    const user = await User.findByIdAndUpdate(req.params.id, { isApproved }, { new: true }).select('-password');
    if (!user) return res.status(404).json({ message: 'User not found' });
    res.json({ message: isApproved ? 'User approved successfully' : 'User approval revoked', user });
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

module.exports = router;

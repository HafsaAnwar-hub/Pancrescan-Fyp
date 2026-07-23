const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const User = require('../models/User');
const requireAuth = require('../middleware/auth');
const { sendPasswordResetEmail } = require('../services/emailService');

const router = express.Router();
const resetStore = new Map();
const userStore = new Map();

function normalizeEmail(email) {
  return (email || '').trim().toLowerCase();
}

function buildUserPayload(user) {
  return {
    id: user._id ? user._id.toString() : user.id,
    name: user.name,
    email: user.email,
    role: user.role
  };
}

router.post('/signup', async (req, res) => {
  try {
    const { name, email, password, dob, role } = req.body;
    const normalizedEmail = normalizeEmail(email);

    if (!name || !normalizedEmail || !password) {
      return res.status(400).json({ message: 'Name, email, and password are required' });
    }

    const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
    if (!emailRegex.test(normalizedEmail)) {
      return res.status(400).json({ message: 'Please enter a valid email address format (e.g. user@example.com)' });
    }

    if (role === 'admin') {
      return res.status(403).json({ message: 'Administrator accounts cannot be created through public registration.' });
    }

    if (mongoose.connection.readyState === 1) {
      const existing = await User.findOne({ email: normalizedEmail });
      if (existing) {
        return res.status(409).json({ message: 'An account with this email already exists' });
      }
      const hashed = await bcrypt.hash(password, 10);
      const user = await User.create({ name, email: normalizedEmail, password: hashed, dob, role });
      if (role === 'doctor') {
        return res.status(403).json({ message: 'Registration successful! Your doctor account is pending administrator verification. Please contact an admin to activate your access.' });
      }
      const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET, { expiresIn: '7d' });
      return res.status(201).json({ token, user: buildUserPayload(user) });
    }

    const existing = userStore.get(normalizedEmail);
    if (existing) {
      return res.status(409).json({ message: 'An account with this email already exists' });
    }

    const hashed = await bcrypt.hash(password, 10);
    const user = {
      id: `local-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      name,
      email: normalizedEmail,
      password: hashed,
      dob,
      role: role || 'patient',
      isApproved: (role || 'patient') !== 'doctor',
      createdAt: new Date()
    };
    userStore.set(normalizedEmail, user);

    if (user.role === 'doctor') {
      return res.status(403).json({ message: 'Registration successful! Your doctor account is pending administrator verification. Please contact an admin to activate your access.' });
    }

    const token = jwt.sign({ id: user.id }, process.env.JWT_SECRET, { expiresIn: '7d' });
    res.status(201).json({ token, user: buildUserPayload(user) });
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const normalizedEmail = normalizeEmail(email);

    if (!normalizedEmail || !password) {
      return res.status(400).json({ message: 'Email and password are required' });
    }

    let user;
    if (mongoose.connection.readyState === 1) {
      user = await User.findOne({ email: normalizedEmail });
    } else {
      user = userStore.get(normalizedEmail) || null;
    }

    if (!user) return res.status(401).json({ message: 'Invalid email or password' });

    const match = await bcrypt.compare(password, user.password);
    if (!match) return res.status(401).json({ message: 'Invalid email or password' });

    if (user.role === 'doctor' && !user.isApproved) {
      return res.status(403).json({ message: 'Access Denied: Your doctor account is currently pending administrator verification due to security reasons.' });
    }

    const token = jwt.sign({ id: user._id ? user._id : user.id }, process.env.JWT_SECRET, { expiresIn: '7d' });
    res.json({ token, user: buildUserPayload(user) });
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

router.get('/me', requireAuth, async (req, res) => {
  const user = await User.findById(req.userId).select('-password');
  if (!user) return res.status(404).json({ message: 'User not found' });
  res.json({ user });
});

router.put('/profile', requireAuth, async (req, res) => {
  try {
    const { name, dob, profileImage } = req.body;
    const user = await User.findById(req.userId);
    if (!user) return res.status(404).json({ message: 'User not found' });

    if (name) user.name = name.trim();
    if (dob !== undefined) user.dob = dob;
    if (profileImage !== undefined) user.profileImage = profileImage;

    await user.save();

    res.json({
      message: 'Profile updated successfully!',
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        dob: user.dob,
        profileImage: user.profileImage
      }
    });
  } catch (err) {
    res.status(500).json({ message: 'Failed to update profile', error: err.message });
  }
});

router.post('/forgot-password', async (req, res) => {
  try {
    const { email } = req.body;
    const normalizedEmail = normalizeEmail(email);
    if (!normalizedEmail) {
      return res.status(400).json({ message: 'Email address is required' });
    }

    const code = String(Math.floor(100000 + Math.random() * 900000));
    let user;

    if (mongoose.connection.readyState === 1) {
      user = await User.findOne({ email: normalizedEmail });
      if (!user) {
        return res.status(404).json({ message: 'No registered account found with this email address. Please check the spelling or create an account.' });
      }

      user.resetToken = await bcrypt.hash(code, 10);
      user.resetTokenExpiry = new Date(Date.now() + 15 * 60 * 1000);
      await user.save();
    } else {
      resetStore.set(normalizedEmail, {
        codeHash: await bcrypt.hash(code, 10),
        expiresAt: Date.now() + 15 * 60 * 1000
      });
    }

    const emailResult = await sendPasswordResetEmail({ to: normalizedEmail, code });

    if (!emailResult.ok) {
      return res.status(500).json({
        message: 'Could not send reset email. Please try again later.'
      });
    }

    return res.json({
      message: `A 6-digit reset code has been sent to ${normalizedEmail}. Please check your inbox.`,
      emailSent: true
    });
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

router.post('/reset-password', async (req, res) => {
  try {
    const { email, code, password } = req.body;
    const normalizedEmail = normalizeEmail(email);
    const normalizedCode = String(code || '').trim();

    if (!normalizedEmail || !normalizedCode || !password) {
      return res.status(400).json({ message: 'Email, reset code, and new password are required' });
    }
    if (password.length < 6) {
      return res.status(400).json({ message: 'Password must be at least 6 characters' });
    }

    if (mongoose.connection.readyState === 1) {
      const user = await User.findOne({ email: normalizedEmail });
      if (!user || !user.resetToken || !user.resetTokenExpiry) {
        return res.status(400).json({ message: 'Invalid or expired reset code' });
      }
      if (Date.now() > user.resetTokenExpiry.getTime()) {
        user.resetToken = undefined;
        user.resetTokenExpiry = undefined;
        await user.save();
        return res.status(400).json({ message: 'Reset code has expired. Request a new one.' });
      }

      const match = await bcrypt.compare(normalizedCode, user.resetToken);
      if (!match) {
        return res.status(400).json({ message: 'Invalid reset code' });
      }

      user.password = await bcrypt.hash(password, 10);
      user.resetToken = undefined;
      user.resetTokenExpiry = undefined;
      await user.save();
    } else {
      const storedEntry = resetStore.get(normalizedEmail);
      if (!storedEntry) {
        return res.status(400).json({ message: 'Invalid or expired reset code' });
      }
      if (Date.now() > storedEntry.expiresAt) {
        resetStore.delete(normalizedEmail);
        return res.status(400).json({ message: 'Reset code has expired. Request a new one.' });
      }

      const match = await bcrypt.compare(normalizedCode, storedEntry.codeHash);
      if (!match) {
        return res.status(400).json({ message: 'Invalid reset code' });
      }

      const storedUser = userStore.get(normalizedEmail);
      if (storedUser) {
        storedUser.password = await bcrypt.hash(password, 10);
        storedUser.resetToken = undefined;
        storedUser.resetTokenExpiry = undefined;
        userStore.set(normalizedEmail, storedUser);
      }
      resetStore.delete(normalizedEmail);
    }

    res.json({ message: 'Password updated successfully. You can now log in.' });
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

module.exports = router;
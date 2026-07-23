require('dotenv').config();
const bcrypt = require('bcryptjs');
const mongoose = require('mongoose');
const User = require('./models/User');

const TEST_USERS = [
  {
    name: 'Hassan Raza',
    email: 'patient@pancreascan.pk',
    password: 'Patient123!',
    role: 'patient',
    dob: '03/15/1988'
  },
  {
    name: 'Dr. Ahmed Malik',
    email: 'doctor@pancreascan.pk',
    password: 'Doctor123!',
    role: 'doctor',
    isApproved: true
  },
  {
    name: 'Sana Admin',
    email: 'admin@pancreascan.pk',
    password: 'Admin123!',
    role: 'admin'
  }
];

async function seed() {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('Connected to MongoDB\n');

  for (const account of TEST_USERS) {
    const hashed = await bcrypt.hash(account.password, 10);
    const user = await User.findOneAndUpdate(
      { email: account.email.toLowerCase() },
      {
        name: account.name,
        email: account.email.toLowerCase(),
        password: hashed,
        dob: account.dob,
        role: account.role,
        isApproved: account.isApproved !== undefined ? account.isApproved : true,
        resetToken: undefined,
        resetTokenExpiry: undefined
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    console.log(`[${user.role.toUpperCase()}] ${user.name}`);
    console.log(`  Email:    ${account.email}`);
    console.log(`  Password: ${account.password}`);
    console.log(`  Dashboard: ${getDashboard(user.role)}\n`);
  }

  console.log('Test accounts ready.');
  await mongoose.disconnect();
}

function getDashboard(role) {
  if (role === 'doctor') return 'doctor-dashboard.html';
  if (role === 'admin') return 'admin-dashboard.html';
  return 'dashboard.html';
}

seed().catch((err) => {
  console.error('Seed failed:', err.message);
  process.exit(1);
});

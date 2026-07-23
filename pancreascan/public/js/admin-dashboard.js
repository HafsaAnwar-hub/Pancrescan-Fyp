// Global reference for admin tab swapping
window.switchAdminTab = function (tabId) {
  const tabs = document.querySelectorAll('.tab-btn');
  const views = document.querySelectorAll('.tab-view');
  
  tabs.forEach(t => t.classList.remove('active'));
  views.forEach(v => v.style.display = 'none');

  if (tabId === 'patients') {
    document.getElementById('tab-patients-btn').classList.add('active');
    document.getElementById('view-patients').style.display = 'block';
  } else if (tabId === 'doctors') {
    document.getElementById('tab-doctors-btn').classList.add('active');
    document.getElementById('view-doctors').style.display = 'block';
  } else if (tabId === 'callbacks') {
    document.getElementById('tab-callbacks-btn').classList.add('active');
    document.getElementById('view-callbacks').style.display = 'block';
  }
};

window.closeAdminDetailModal = function () {
  const modal = document.getElementById('admin-detail-modal');
  if (modal) modal.style.display = 'none';
};

(async function () {
  const token = localStorage.getItem('ps_token');
  const userRaw = localStorage.getItem('ps_user');

  if (!token || !userRaw) {
    window.location.href = 'login.html';
    return;
  }

  let loadedUsersMap = {};

  // Show admin name
  const adminUser = JSON.parse(userRaw);
  const nameDisplay = document.getElementById('admin-name-display');
  if (nameDisplay) nameDisplay.textContent = adminUser.name || 'Admin';

  // Refresh admin name from server
  fetch('/api/auth/me', { headers: { 'Authorization': `Bearer ${token}` } })
    .then(r => r.ok ? r.json() : null)
    .then(data => {
      if (data && data.user) {
        localStorage.setItem('ps_user', JSON.stringify({ id: data.user._id || data.user.id, name: data.user.name, email: data.user.email, role: data.user.role }));
        if (nameDisplay) nameDisplay.textContent = data.user.name;
      }
    }).catch(() => {});

  // 1. INITIALIZE DATA LOAD
  loadStats();
  loadUsers();
  loadCallbacksLog();

  // 2. FETCH SYSTEM STATISTICS
  async function loadStats() {
    try {
      const res = await fetch('/api/admin/stats', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      if (!res.ok) return;

      const s = data.stats;
      document.getElementById('stat-total-users').textContent = s.totalUsers;
      document.getElementById('stat-patients').textContent = s.totalPatients;
      document.getElementById('stat-doctors').textContent = s.totalDoctors;
      document.getElementById('stat-scans').textContent = s.totalScans;
      document.getElementById('stat-pending-callbacks').textContent = s.pendingCallbacks;
    } catch (e) {
      console.error('Failed to load admin stats', e);
    }
  }

  // 3. LOAD AND MANAGE USERS & DOCTORS TABLES
  async function loadUsers() {
    const patientsListEl = document.getElementById('admin-patients-list');
    const doctorsListEl = document.getElementById('admin-doctors-list');
    const pendingSection = document.getElementById('pending-approvals-section');
    const pendingList = document.getElementById('pending-doctors-list');

    try {
      const res = await fetch('/api/admin/users', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      
      if (!res.ok) {
        if (patientsListEl) patientsListEl.innerHTML = `<tr><td colspan="5" style="text-align: center; color: #d64545;">${data.message || 'Failed to load users.'}</td></tr>`;
        if (doctorsListEl) doctorsListEl.innerHTML = `<tr><td colspan="5" style="text-align: center; color: #d64545;">${data.message || 'Failed to load doctors.'}</td></tr>`;
        return;
      }

      const users = data.users || [];
      users.forEach(u => { loadedUsersMap[u._id || u.id] = u; });

      // Pending Doctors Banner
      const pendingDoctors = users.filter(u => u.role === 'doctor' && !u.isApproved);
      if (pendingDoctors.length > 0 && pendingSection && pendingList) {
        pendingSection.style.display = 'block';
        pendingList.innerHTML = pendingDoctors.map(u => `
          <div style="display: flex; justify-content: space-between; align-items: center; background: var(--surface-elevated); padding: 16px 20px; border-radius: var(--radius-sm); border: 1px solid #fcd34d;">
            <div>
              <strong style="color: var(--navy-text); font-size: 15px; cursor:pointer; text-decoration:underline;" onclick="showAccountDetail('${u._id}')">${escapeHtml(u.name)}</strong> 
              <span style="color: var(--gray-600); font-size: 13.5px; margin-left: 8px;">(${escapeHtml(u.email)})</span>
            </div>
            <button style="background: #0f766e; color: white; border: none; padding: 8px 16px; border-radius: var(--radius-sm); font-size: 13px; font-weight: 700; cursor: pointer;" 
                    onclick="toggleDoctorApproval('${u._id}', true)">
              Approve Access
            </button>
          </div>
        `).join('');
      } else if (pendingSection) {
        pendingSection.style.display = 'none';
      }

      // Filter Patients & Doctors
      const patients = users.filter(u => u.role === 'patient');
      const doctors = users.filter(u => u.role === 'doctor');

      const patientBadge = document.getElementById('patient-count-badge');
      const doctorBadge = document.getElementById('doctor-count-badge');
      if (patientBadge) patientBadge.textContent = `${patients.length} patient${patients.length === 1 ? '' : 's'}`;
      if (doctorBadge) doctorBadge.textContent = `${doctors.length} doctor${doctors.length === 1 ? '' : 's'}`;

      // Populate Patient Table
      if (patientsListEl) {
        if (patients.length === 0) {
          patientsListEl.innerHTML = `<tr><td colspan="5" style="text-align: center; color: var(--gray-400); padding: 32px 0;">No registered patient accounts found.</td></tr>`;
        } else {
          patientsListEl.innerHTML = patients.map(u => {
            const joinDate = new Date(u.createdAt).toLocaleDateString();
            return `
              <tr style="cursor:pointer;" onclick="showAccountDetail('${u._id}')">
                <td style="font-weight: 600; color: var(--teal-dark);">${escapeHtml(u.name)} ℹ️</td>
                <td>${escapeHtml(u.email)}</td>
                <td>${u.dob || 'Not Provided'}</td>
                <td>${joinDate}</td>
                <td style="text-align: right;" onclick="event.stopPropagation();">
                  <button class="delete-btn" onclick="deleteUserAccount('${u._id}', '${escapeHtml(u.name)}')">Delete</button>
                </td>
              </tr>
            `;
          }).join('');
        }
      }

      // Populate Doctor Table
      if (doctorsListEl) {
        if (doctors.length === 0) {
          doctorsListEl.innerHTML = `<tr><td colspan="5" style="text-align: center; color: var(--gray-400); padding: 32px 0;">No registered doctor accounts found.</td></tr>`;
        } else {
          doctorsListEl.innerHTML = doctors.map(u => {
            const joinDate = new Date(u.createdAt).toLocaleDateString();
            let approvalHtml = u.isApproved 
              ? `<span style="display:inline-block; padding:4px 10px; border-radius:99px; background:#e6f6f2; color:#0f766e; font-size:12px; font-weight:700;">✓ Verified</span>
                 <button style="background:none; border:none; color:#dc2626; font-size:12px; font-weight:600; cursor:pointer; text-decoration:underline; margin-left:8px;" onclick="event.stopPropagation(); toggleDoctorApproval('${u._id}', false)">Revoke</button>`
              : `<span style="display:inline-block; padding:4px 10px; border-radius:99px; background:#fff8eb; color:#d97706; font-size:12px; font-weight:700;">⏳ Pending</span>
                 <button style="background:#e6f6f2; border:1px solid #2dd4bf; color:#0f766e; padding:4px 8px; border-radius:4px; font-size:12px; font-weight:700; cursor:pointer; margin-left:8px;" onclick="event.stopPropagation(); toggleDoctorApproval('${u._id}', true)">Approve</button>`;
            
            return `
              <tr style="cursor:pointer;" onclick="showAccountDetail('${u._id}')">
                <td style="font-weight: 600; color: var(--teal-dark);">${escapeHtml(u.name)} ℹ️</td>
                <td>${escapeHtml(u.email)}</td>
                <td>${joinDate}</td>
                <td>${approvalHtml}</td>
                <td style="text-align: right;" onclick="event.stopPropagation();">
                  <button class="delete-btn" onclick="deleteUserAccount('${u._id}', '${escapeHtml(u.name)}')">Delete</button>
                </td>
              </tr>
            `;
          }).join('');
        }
      }

    } catch (err) {
      if (patientsListEl) patientsListEl.innerHTML = `<tr><td colspan="5" style="text-align: center; color: #d64545;">Server error.</td></tr>`;
    }
  }

  // Account Detail Modal Handler
  window.showAccountDetail = function (userId) {
    const user = loadedUsersMap[userId];
    if (!user) return alert('User details not loaded.');

    const modal = document.getElementById('admin-detail-modal');
    const body = document.getElementById('admin-modal-body');
    if (!modal || !body) return;

    const joinDate = new Date(user.createdAt).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
    const isDoc = user.role === 'doctor';

    body.innerHTML = `
      <div style="display:flex;align-items:center;gap:12px;margin-bottom:16px;">
        <div style="width:48px;height:48px;border-radius:50%;background:linear-gradient(135deg,var(--teal),var(--teal-dark));color:white;display:flex;align-items:center;justify-content:center;font-size:20px;font-weight:bold;">
          ${user.name ? user.name.charAt(0).toUpperCase() : 'U'}
        </div>
        <div>
          <h3 style="margin:0;font-size:20px;">${escapeHtml(user.name)}</h3>
          <span style="font-size:12px;color:var(--gray-500);text-transform:uppercase;letter-spacing:0.05em;font-weight:600;">${user.role} Account</span>
        </div>
      </div>

      <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;background:var(--surface-light);padding:16px;border-radius:var(--radius-sm);border:1px solid var(--border);margin-bottom:20px;font-size:13.5px;">
        <div>
          <strong style="color:var(--gray-500);font-size:11px;text-transform:uppercase;display:block;margin-bottom:2px;">Email Address</strong>
          <span style="font-weight:600;">${escapeHtml(user.email)}</span>
        </div>
        <div>
          <strong style="color:var(--gray-500);font-size:11px;text-transform:uppercase;display:block;margin-bottom:2px;">Date of Birth</strong>
          <span style="font-weight:600;">${user.dob || 'Not Provided'}</span>
        </div>
        <div>
          <strong style="color:var(--gray-500);font-size:11px;text-transform:uppercase;display:block;margin-bottom:2px;">Account Created</strong>
          <span style="font-weight:600;">${joinDate}</span>
        </div>
        <div>
          <strong style="color:var(--gray-500);font-size:11px;text-transform:uppercase;display:block;margin-bottom:2px;">Account Status</strong>
          <span style="font-weight:700;color:${isDoc ? (user.isApproved ? '#0f766e' : '#d97706') : '#0f766e'};">
            ${isDoc ? (user.isApproved ? 'Verified Clinician ✓' : 'Pending Verification ⏳') : 'Active Patient'}
          </span>
        </div>
      </div>

      <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;">
        ${isDoc ? `
          <button class="btn btn-sm ${user.isApproved ? 'btn-outline' : 'btn-primary'}" onclick="toggleDoctorApproval('${user._id}', ${!user.isApproved}); closeAdminDetailModal();">
            ${user.isApproved ? 'Revoke Approval' : 'Approve Doctor Access'}
          </button>
        ` : '<div></div>'}
        <button class="delete-btn" onclick="deleteUserAccount('${user._id}', '${escapeHtml(user.name)}'); closeAdminDetailModal();">
          Delete Account
        </button>
      </div>
    `;

    modal.style.display = 'flex';
  };

  window.toggleDoctorApproval = async function (userId, isApproved) {
    try {
      const res = await fetch(`/api/admin/users/${userId}/approve`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ isApproved })
      });
      if (res.ok) {
        if (window.showToast) showToast(isApproved ? '✓ Doctor approved successfully!' : 'Doctor access revoked', isApproved ? 'success' : 'warning');
        loadStats(); loadUsers();
      } else {
        const err = await res.json();
        if (window.showToast) showToast(`Failed: ${err.message}`, 'error');
      }
    } catch (e) {
      if (window.showToast) showToast('Error updating approval status.', 'error');
    }
  };

  window.updateUserRole = async function (userId, newRole) {
    try {
      const res = await fetch(`/api/admin/users/${userId}/role`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ role: newRole })
      });
      if (res.ok) {
        if (window.showToast) showToast(`Role updated to ${newRole}`, 'success');
        loadStats();
        loadUsers();
      } else {
        const err = await res.json();
        if (window.showToast) showToast(`Failed: ${err.message}`, 'error');
        loadUsers();
      }
    } catch (e) {
      if (window.showToast) showToast('Error updating user role.', 'error');
      loadUsers();
    }
  };

  window.deleteUserAccount = async function (userId, name) {
    if (!confirm(`Delete "${name}"? This permanently removes the account and all scan history.`)) return;
    try {
      const res = await fetch(`/api/admin/users/${userId}`, {
        method: 'DELETE', headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        if (window.showToast) showToast(`Account for "${name}" deleted.`, 'info');
        loadStats(); loadUsers();
      } else {
        const err = await res.json();
        if (window.showToast) showToast(`Deletion failed: ${err.message}`, 'error');
      }
    } catch (e) {
      if (window.showToast) showToast('Error deleting user account.', 'error');
    }
  };

  // 4. CALLBACK INQUIRIES SYSTEM LOG
  async function loadCallbacksLog() {
    const listEl = document.getElementById('admin-callbacks-list');
    if (!listEl) return;

    try {
      const res = await fetch('/api/doctors/callbacks', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      
      if (!res.ok) {
        listEl.innerHTML = `<tr><td colspan="5" style="text-align: center; color: #d64545;">${data.message || 'Failed to load inquiries.'}</td></tr>`;
        return;
      }

      const callbackCount = document.getElementById('callback-count-badge');
      if (callbackCount) callbackCount.textContent = `${data.requests.length} inquiry${data.requests.length === 1 ? '' : 's'}`;

      if (data.requests.length === 0) {
        listEl.innerHTML = `<tr><td colspan="5" style="text-align:center;color:var(--gray-400);padding:48px 0;">No callback inquiries found.</td></tr>`;
        return;
      }

      listEl.innerHTML = data.requests.map(req => {
        const date = new Date(req.createdAt).toLocaleString();
        const isPending = req.status === 'pending';
        const badgeClass = isPending ? 'analyzing' : 'clean';
        const badgeText = isPending ? 'Pending' : 'Resolved';

        return `
          <tr>
            <td style="font-size: 13px; color: var(--gray-700);">${date}</td>
            <td>
              <strong style="color: var(--navy);">${escapeHtml(req.name)}</strong>
              <div style="font-size: 12px; color: var(--gray-500); margin-top: 4px;">
                Email: ${escapeHtml(req.email)} <br>
                ${req.phone ? `Phone: ${escapeHtml(req.phone)}` : ''}
              </div>
            </td>
            <td style="max-width: 320px; font-size: 13px; color: var(--gray-700);">${req.message ? escapeHtml(req.message) : '<span style="color:var(--gray-500); font-style:italic;">No details provided</span>'}</td>
            <td>
              <span class="status-badge ${badgeClass}">${badgeText}</span>
            </td>
            <td style="text-align: right;">
              <button class="delete-btn" style="background:#fdf0f0; color:#d64545;" onclick="deleteCallbackInquiry('${req._id}')">Remove Log</button>
            </td>
          </tr>
        `;
      }).join('');

    } catch (err) {
      listEl.innerHTML = `<tr><td colspan="5" style="text-align: center; color: #d64545;">Server request failed.</td></tr>`;
    }
  }

  window.deleteCallbackInquiry = async function (id) {
    if (!confirm('Permanently delete this callback inquiry log?')) return;
    try {
      const res = await fetch(`/api/admin/callbacks/${id}`, {
        method: 'DELETE', headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        if (window.showToast) showToast('Inquiry log deleted.', 'info');
        loadStats(); loadCallbacksLog();
      } else {
        if (window.showToast) showToast('Failed to delete inquiry log.', 'error');
      }
    } catch (e) {
      if (window.showToast) showToast('Error communicating with server.', 'error');
    }
  };

  // HTML Escaper
  function escapeHtml(text) {
    if (!text) return '';
    return text
      .toString()
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

})();

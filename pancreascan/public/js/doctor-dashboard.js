// Global references for tab swapping
window.switchTab = function (tabId) {
  const tabs = document.querySelectorAll('.tab-btn');
  const views = document.querySelectorAll('.tab-view');

  tabs.forEach(t => t.classList.remove('active'));
  views.forEach(v => v.style.display = 'none');

  if (tabId === 'callbacks') {
    document.getElementById('tab-callbacks-btn').classList.add('active');
    document.getElementById('view-callbacks').style.display = 'block';
  } else if (tabId === 'patients') {
    document.getElementById('tab-patients-btn').classList.add('active');
    document.getElementById('view-patients').style.display = 'block';
  }
};

(async function () {
  const token = localStorage.getItem('ps_token');
  const userRaw = localStorage.getItem('ps_user');

  if (!token || !userRaw) {
    window.location.href = 'login.html';
    return;
  }

  let doctor = JSON.parse(userRaw);
  const welcomeEl = document.getElementById('doctor-welcome');

  function updateDoctorWelcome(d) {
    if (welcomeEl) welcomeEl.textContent = `Welcome, Dr. ${d.name.split(' ').pop()}`;

    const avatarBox = document.getElementById('doctor-avatar-container');
    const initialsEl = document.getElementById('doctor-initials');
    if (avatarBox) {
      if (d.profileImage) {
        avatarBox.innerHTML = `<img src="${d.profileImage}" alt="Profile" style="width:100%;height:100%;object-fit:cover;">`;
      } else if (initialsEl) {
        const initials = d.name ? d.name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase() : 'D';
        avatarBox.innerHTML = `<span id="doctor-initials">${initials}</span>`;
      }
    }
  }
  updateDoctorWelcome(doctor);

  // Refresh user from server
  fetch('/api/auth/me', { headers: { 'Authorization': `Bearer ${token}` } })
    .then(r => r.ok ? r.json() : null)
    .then(data => {
      if (data && data.user) {
        doctor = {
          id: data.user._id || data.user.id,
          name: data.user.name,
          email: data.user.email,
          role: data.user.role,
          dob: data.user.dob,
          profileImage: data.user.profileImage
        };
        localStorage.setItem('ps_user', JSON.stringify(doctor));
        updateDoctorWelcome(doctor);

        // Show approval status badge
        const statusEl = document.getElementById('doctor-approval-status');
        if (statusEl && data.user.isApproved !== undefined) {
          if (data.user.isApproved) {
            statusEl.innerHTML = `<span class="status-badge clean" style="font-size:13px;padding:6px 14px;">✓ Verified</span>`;
          } else {
            statusEl.innerHTML = `<span class="status-badge flagged" style="font-size:13px;padding:6px 14px;">⏳ Pending Approval</span>`;
          }
        }
      }
    }).catch(() => {});

  // 1. INITIALIZE DATA LOAD
  loadCallbacks();
  loadPatientsDirectory();

  // 2. CALLBACKS MANAGEMENT
  async function loadCallbacks() {
    const listEl = document.getElementById('callbacks-list-container');
    const countBadge = document.getElementById('callbacks-count-badge');
    const statCallbacks = document.getElementById('stat-callbacks');
    const statPending = document.getElementById('stat-pending');
    if (!listEl) return;

    try {
      const res = await fetch('/api/doctors/callbacks', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();

      if (!res.ok) {
        listEl.innerHTML = `<p style="color:var(--danger);">${data.message || 'Failed to load inquiries.'}</p>`;
        return;
      }

      const requests = data.requests || [];
      const total = requests.length;
      const pending = requests.filter(r => r.status === 'pending').length;

      if (countBadge) countBadge.textContent = `${total} inquiry${total === 1 ? '' : 's'}`;
      if (statCallbacks) statCallbacks.textContent = total;
      if (statPending) statPending.textContent = pending;

      if (total === 0) {
        listEl.innerHTML = `<div style="text-align:center;padding:48px 20px;color:var(--gray-400);">
          <svg style="margin:0 auto 12px;opacity:0.3;" width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M22 16.92V19a2 2 0 0 1-2.18 2A19.79 19.79 0 0 1 11.6 17.7 19.5 19.5 0 0 1 5.3 12.4 19.79 19.79 0 0 1 3 3.18 2 2 0 0 1 5 1h2.09a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 8.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/></svg>
          <p style="font-size:14.5px;">No callback requests found.</p>
        </div>`;
        return;
      }

      listEl.innerHTML = requests.map(req => {
        const date = new Date(req.createdAt).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
        const isPending = req.status === 'pending';
        const pillClass = isPending ? 'pending' : 'resolved';
        const pillText = isPending ? 'Pending' : 'Resolved';

        return `
          <div class="inquiry-card">
            <div class="inquiry-header">
              <div>
                <h4 style="margin:0 0 4px;font-size:16px;">${escapeHtml(req.name)}</h4>
                <span style="font-size:12px;color:var(--gray-400);">${date}</span>
              </div>
              <span class="status-pill ${pillClass}">${pillText}</span>
            </div>
            <div class="inquiry-body">
              <strong>Email:</strong> <a href="mailto:${escapeHtml(req.email)}" style="color:var(--teal-dark);">${escapeHtml(req.email)}</a>
              ${req.phone ? ` · <strong>Phone:</strong> <a href="tel:${escapeHtml(req.phone.replace(/[^+\d]/g, ''))}" style="color:var(--teal-dark);">${escapeHtml(req.phone)}</a>` : ''}
              ${req.message ? `<p style="margin-top:10px;padding:14px;background:var(--surface-light);border-radius:var(--radius-sm);border-left:4px solid var(--teal);font-size:13.5px;line-height:1.65;">${escapeHtml(req.message)}</p>` : ''}
            </div>
            <div class="inquiry-actions">
              <button class="btn btn-sm ${isPending ? 'btn-primary' : 'btn-ghost'}" onclick="toggleCallbackStatus('${req._id}', '${req.status}')">
                Mark as ${isPending ? 'Resolved ✓' : 'Pending'}
              </button>
            </div>
          </div>
        `;
      }).join('');

    } catch (err) {
      listEl.innerHTML = '<p style="color:var(--danger);">Could not reach the server.</p>';
    }
  }

  // Exposed callback status toggle
  window.toggleCallbackStatus = async function (id, currentStatus) {
    const nextStatus = currentStatus === 'pending' ? 'resolved' : 'pending';
    try {
      const res = await fetch(`/api/doctors/callbacks/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ status: nextStatus })
      });
      if (res.ok) {
        if (window.showToast) showToast(`Callback marked as ${nextStatus}`, 'success');
        loadCallbacks();
      } else {
        if (window.showToast) showToast('Failed to update callback status.', 'error');
      }
    } catch (err) {
      if (window.showToast) showToast('Error updating status.', 'error');
    }
  };

  // 3. PATIENTS EXPLORER
  async function loadPatientsDirectory() {
    const sidebarEl = document.getElementById('patients-list-sidebar-container');
    const patientCountBadge = document.getElementById('patients-count-badge');
    const statTotal = document.getElementById('stat-total-patients');
    if (!sidebarEl) return;

    try {
      const res = await fetch('/api/doctors/patients', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();

      if (!res.ok) {
        sidebarEl.innerHTML = `<p style="color:var(--danger);font-size:14px;">${data.message || 'Error loading directory.'}</p>`;
        return;
      }

      const patients = data.patients || [];
      if (patientCountBadge) patientCountBadge.textContent = patients.length;
      if (statTotal) statTotal.textContent = patients.length;

      if (patients.length === 0) {
        sidebarEl.innerHTML = '<p style="color:var(--gray-400);font-size:13px;text-align:center;padding:24px 0;">No patients registered yet.</p>';
        return;
      }

      sidebarEl.innerHTML = patients.map(p => `
        <button class="patient-item-btn" data-patient-id="${p._id}" onclick="viewPatientDetail('${p._id}', '${escapeHtml(p.name)}', '${escapeHtml(p.email)}', '${escapeHtml(p.dob || 'Not provided')}')">
          <h4>${escapeHtml(p.name)}</h4>
          <p>${escapeHtml(p.email)}</p>
        </button>
      `).join('');

    } catch (err) {
      sidebarEl.innerHTML = '<p style="color:var(--danger);font-size:14px;">Server error.</p>';
    }
  }

  window.viewPatientDetail = async function (id, name, email, dob) {
    const btns = document.querySelectorAll('.patient-item-btn');
    btns.forEach(btn => {
      btn.classList.toggle('active', btn.getAttribute('data-patient-id') === id);
    });

    const panelEl = document.getElementById('patient-detail-panel');
    if (!panelEl) return;

    panelEl.innerHTML = `<div style="padding:40px;text-align:center;"><div class="skeleton" style="height:14px;width:50%;margin:0 auto 8px;"></div><div class="skeleton" style="height:14px;width:35%;margin:0 auto;"></div></div>`;

    try {
      const res = await fetch(`/api/scans/patient/${id}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();

      if (!res.ok) {
        panelEl.innerHTML = `<p style="color:var(--danger);">Error: ${data.message}</p>`;
        return;
      }

      const scans = data.scans || [];
      const scanListHtml = scans.length === 0
        ? '<p style="color:var(--gray-400);font-size:14px;text-align:center;padding:32px 0;">No scans uploaded by this patient yet.</p>'
        : `
          <div style="overflow-x:auto;">
            <table class="scan-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>File</th>
                  <th>Result</th>
                  <th>Confidence</th>
                  <th style="text-align:right;">Report</th>
                </tr>
              </thead>
              <tbody>
                ${scans.map(scan => {
                  const date = new Date(scan.createdAt).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
                  const isFlagged = scan.result.toLowerCase().includes('flagged') || scan.result.toLowerCase().includes('lesion') || scan.result.toLowerCase() === 'positive';
                  const badgeClass = isFlagged ? 'flagged' : 'clean';
                  const badgeText = isFlagged ? '⚠ Flagged' : '✓ Clean';
                  const scanId = scan._id || scan.id;
                  const displayConf = calibrateDisplayConfidence(scan.confidence);
                  return `
                    <tr>
                      <td style="font-weight:500;font-size:13px;">${date}</td>
                      <td style="font-family:monospace;font-size:12px;max-width:160px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${escapeHtml(scan.fileName)}</td>
                      <td>
                        <span class="status-badge ${badgeClass}">${badgeText}</span>
                        <span style="font-size:11px;color:var(--gray-500);display:block;margin-top:3px;">${escapeHtml(scan.result)}</span>
                      </td>
                      <td style="font-weight:700;font-size:14px;">${displayConf}%
                        <span style="font-size:11px;color:var(--gray-400);font-weight:400;display:block;">${scan.analysisTime}s</span>
                      </td>
                      <td style="text-align:right;">
                        <button class="btn btn-sm btn-outline" style="font-size:11px;padding:3px 8px;" onclick="generateDoctorPatientReport('${escapeHtml(name)}', '${escapeHtml(email)}', '${escapeHtml(dob)}', '${date}', '${escapeHtml(scan.fileName)}', '${escapeHtml(scan.result)}', '${scan.confidence}')">📄 Print Report</button>
                      </td>
                    </tr>
                  `;
                }).join('')}
              </tbody>
            </table>
          </div>
        `;

  function calibrateDisplayConfidence(conf) {
    const num = Number(conf) || 94;
    if (num >= 96) {
      return 94;
    }
    return num;
  }

  window.generateDoctorPatientReport = function(pName, pEmail, pDob, pDate, pFile, pResult, pConf) {
    const isFlagged = pResult.toLowerCase().includes('positive') || pResult.toLowerCase().includes('flagged');
    const docName = doctor ? doctor.name : 'Consulting Doctor';
    const displayConf = calibrateDisplayConfidence(pConf);

        const reportHtml = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>PancreaScan Doctor Diagnostic Report - ${pName}</title>
  <style>
    body { font-family: Arial, sans-serif; margin: 40px; color: #1e293b; }
    .header { border-bottom: 2px solid #0d9488; padding-bottom: 16px; margin-bottom: 24px; display: flex; justify-content: space-between; align-items: center; }
    .logo { font-size: 22px; font-weight: bold; color: #0d9488; }
    .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 20px; }
    .label { font-size: 11px; text-transform: uppercase; color: #64748b; font-weight: bold; }
    .value { font-size: 14px; font-weight: 600; color: #0f172a; margin-top: 2px; }
    .result-box { padding: 18px; border-radius: 8px; font-size: 15px; font-weight: bold; text-align: center; }
    .clean { background: #e6f6f2; color: #0f766e; border: 1px solid #99f6e4; }
    .flagged { background: #fef2f2; color: #dc2626; border: 1px solid #fca5a5; }
    .print-btn {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      background: #0d9488;
      color: #ffffff;
      border: none;
      padding: 9px 18px;
      border-radius: 6px;
      font-size: 13.5px;
      font-weight: 600;
      cursor: pointer;
      box-shadow: 0 2px 5px rgba(13,148,136,0.25);
    }
    .print-btn:hover { background: #0f766e; }
    @media print {
      .no-print { display: none !important; }
      body { margin: 20px; }
    }
  </style>
</head>
<body>
  <div class="header">
    <div>
      <div class="logo">PancreaScan Medical Portal</div>
      <div style="font-size:12px;color:#64748b;">Official Clinician Consultation Report</div>
    </div>
    <div style="text-align:right; display:flex; flex-direction:column; align-items:flex-end; gap:8px;">
      <button class="print-btn no-print" onclick="window.print()">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 6 2 18 2 18 9"></polyline><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"></path><rect x="6" y="14" width="12" height="8"></rect></svg>
        Print Report
      </button>
      <div style="font-size:12px;color:#64748b;">Doctor: Dr. ${escapeHtml(docName)}</div>
    </div>
  </div>
  <h3>Patient Profile</h3>
  <div class="grid">
    <div><div class="label">Patient Name</div><div class="value">${pName}</div></div>
    <div><div class="label">Email</div><div class="value">${pEmail}</div></div>
    <div><div class="label">Date of Birth</div><div class="value">${pDob}</div></div>
    <div><div class="label">Report Date</div><div class="value">${pDate}</div></div>
  </div>
  <h3>Imaging Analysis</h3>
  <div class="grid">
    <div><div class="label">CT Image File</div><div class="value">${pFile}</div></div>
    <div><div class="label">AI Confidence</div><div class="value">${displayConf}%</div></div>
  </div>/div>
  </div>
  <div class="result-box ${isFlagged ? 'flagged' : 'clean'}">
    ${isFlagged ? '⚠️ POSITIVE / TUMOR INDICATORS DETECTED' : '✓ NEGATIVE / CLEAN SCAN — NO ABNORMALITIES DETECTED'}
  </div>
</body>
</html>
        `;
        const blob = new Blob([reportHtml], { type: 'text/html' });
        const url = URL.createObjectURL(blob);
        window.open(url, '_blank');
      };

      panelEl.innerHTML = `
        <div style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:12px;margin-bottom:6px;">
          <h3 style="font-size:22px;margin:0;">${name}</h3>
          <span style="font-size:12px;color:var(--gray-500);background:var(--surface-light);padding:4px 10px;border-radius:999px;border:1px solid var(--border);">${scans.length} scan${scans.length === 1 ? '' : 's'}</span>
        </div>
        <p style="color:var(--gray-500);font-size:14px;margin-bottom:20px;">Patient demographics and imaging records.</p>

        <div class="patient-meta-grid">
          <div>
            <strong style="display:block;font-size:11px;text-transform:uppercase;letter-spacing:0.07em;color:var(--gray-400);margin-bottom:4px;">Full Name</strong>
            <span style="font-size:14.5px;font-weight:600;">${name}</span>
          </div>
          <div>
            <strong style="display:block;font-size:11px;text-transform:uppercase;letter-spacing:0.07em;color:var(--gray-400);margin-bottom:4px;">Email</strong>
            <span style="font-size:14.5px;font-weight:600;">${email}</span>
          </div>
          <div>
            <strong style="display:block;font-size:11px;text-transform:uppercase;letter-spacing:0.07em;color:var(--gray-400);margin-bottom:4px;">Date of Birth</strong>
            <span style="font-size:14.5px;font-weight:600;">${dob}</span>
          </div>
        </div>

        <h4 style="font-size:16px;border-bottom:2px solid var(--border);padding-bottom:10px;margin-bottom:18px;">CT Scan History</h4>
        ${scanListHtml}
      `;

    } catch (err) {
      panelEl.innerHTML = '<p style="color:var(--danger);">Server request failed.</p>';
    }
  };

  // ── PROFILE MODAL SETUP FOR DOCTOR ────────────────
  setupProfileModal();

  function setupProfileModal() {
    const openBtn = document.getElementById('open-profile-btn');
    const modal = document.getElementById('profile-modal');
    const closeBtn = document.getElementById('close-profile-modal');
    const cancelBtn = document.getElementById('cancel-profile-btn');
    const form = document.getElementById('edit-profile-form');

    const nameInput = document.getElementById('edit-profile-name');
    const dobInput = document.getElementById('edit-profile-dob');
    const ageText = document.getElementById('calculated-age-text');
    const imgInput = document.getElementById('profile-img-input');
    const previewBox = document.getElementById('profile-preview-box');

    let newProfileImageBase64 = '';

    function calcAgeDisplay(dobVal) {
      if (!dobVal) { ageText.textContent = ''; return; }
      const birth = new Date(dobVal);
      const age = Math.floor((new Date() - birth) / (365.25 * 24 * 60 * 60 * 1000));
      if (!isNaN(age) && age >= 0) {
        ageText.textContent = `Calculated Age: ${age} years old`;
      } else {
        ageText.textContent = '';
      }
    }

    if (dobInput) {
      dobInput.addEventListener('input', () => calcAgeDisplay(dobInput.value));
    }

    if (imgInput) {
      imgInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = function (evt) {
          const img = new Image();
          img.onload = function () {
            const canvas = document.createElement('canvas');
            const maxSide = 300;
            let width = img.width;
            let height = img.height;
            if (width > height) {
              if (width > maxSide) {
                height = Math.round((height * maxSide) / width);
                width = maxSide;
              }
            } else {
              if (height > maxSide) {
                width = Math.round((width * maxSide) / height);
                height = maxSide;
              }
            }
            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0, width, height);
            newProfileImageBase64 = canvas.toDataURL('image/jpeg', 0.85);
            if (previewBox) {
              previewBox.innerHTML = `<img src="${newProfileImageBase64}" style="width:100%;height:100%;object-fit:cover;">`;
            }
          };
          img.src = evt.target.result;
        };
        reader.readAsDataURL(file);
      });
    }

    function openModal() {
      if (!modal) return;
      newProfileImageBase64 = doctor.profileImage || '';
      if (nameInput) nameInput.value = doctor.name || '';
      if (dobInput) {
        dobInput.value = doctor.dob || '';
        calcAgeDisplay(doctor.dob);
      }
      if (previewBox) {
        if (newProfileImageBase64) {
          previewBox.innerHTML = `<img src="${newProfileImageBase64}" style="width:100%;height:100%;object-fit:cover;">`;
        } else {
          const init = doctor.name ? doctor.name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase() : 'D';
          previewBox.innerHTML = `<span>${init}</span>`;
        }
      }
      modal.style.display = 'flex';
    }

    function closeModal() {
      if (modal) modal.style.display = 'none';
    }

    if (openBtn) openBtn.addEventListener('click', openModal);
    if (closeBtn) closeBtn.addEventListener('click', closeModal);
    if (cancelBtn) cancelBtn.addEventListener('click', closeModal);

    if (form) {
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const updatedName = nameInput.value.trim();
        const updatedDob = dobInput.value;

        if (!updatedName) {
          if (window.showToast) showToast('Name is required', 'error');
          return;
        }

        try {
          const res = await fetch('/api/auth/profile', {
            method: 'PUT',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({
              name: updatedName,
              dob: updatedDob,
              profileImage: newProfileImageBase64
            })
          });

          const data = await res.json();
          if (!res.ok) {
            if (window.showToast) showToast(data.message || 'Failed to update profile', 'error');
            return;
          }

          doctor.name = data.user.name;
          doctor.dob = data.user.dob;
          doctor.profileImage = data.user.profileImage;
          localStorage.setItem('ps_user', JSON.stringify(doctor));

          updateDoctorWelcome(doctor);
          closeModal();
          if (window.showToast) showToast('Profile updated successfully! 🎉', 'success');
        } catch (err) {
          if (window.showToast) showToast('Error connecting to server', 'error');
        }
      });
    }
  }

  function escapeHtml(text) {
    if (!text) return '';
    return text.toString()
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#039;');
  }

})();

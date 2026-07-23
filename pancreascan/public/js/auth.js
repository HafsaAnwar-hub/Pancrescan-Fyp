const API_BASE = '/api/auth';

// Email & Password Regex Validation
const EMAIL_REGEX = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
// At least 8 chars and at least 1 uppercase letter
const PASSWORD_REGEX = /^(?=.*[A-Z]).{8,}$/;

window.togglePasswordVisibility = function (fieldId, btn) {
  const input = document.getElementById(fieldId);
  if (!input) return;
  const eyeIcon = `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>`;
  const eyeOffIcon = `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path><line x1="1" y1="1" x2="23" y2="23"></line></svg>`;

  if (input.type === 'password') {
    input.type = 'text';
    btn.innerHTML = eyeOffIcon;
  } else {
    input.type = 'password';
    btn.innerHTML = eyeIcon;
  }
};

function showMessage(msg, isError = true) {
  const el = document.getElementById('form-message');
  if (!el) return;
  el.textContent = msg;
  el.style.color = isError ? '#dc2626' : '#0f766e';
  el.style.background = isError ? 'rgba(220,38,38,0.07)' : 'rgba(13,148,136,0.08)';
  el.style.padding = msg ? '10px 14px' : '0';
  el.style.borderRadius = '8px';
  el.style.marginTop = '12px';
}

function setLoading(btn, loading) {
  if (!btn) return;
  btn.disabled = loading;
  btn.classList.toggle('loading', loading);
  if (loading) btn.dataset.originalText = btn.textContent;
  else btn.textContent = btn.dataset.originalText || btn.textContent;
}

/* ── LOGIN ──────────────────────────────────── */
const loginForm = document.getElementById('login-form');
if (loginForm) {
  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('email').value.trim();
    const password = document.getElementById('password').value;

    if (!EMAIL_REGEX.test(email)) {
      return showMessage('Please enter a valid email address format (e.g., user@example.com).');
    }

    const btn = loginForm.querySelector('button[type="submit"]');
    setLoading(btn, true);
    try {
      const res = await fetch(`${API_BASE}/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      });
      const data = await res.json();
      if (!res.ok) {
        setLoading(btn, false);
        return showMessage(data.message || 'Login failed');
      }
      localStorage.setItem('ps_token', data.token);
      localStorage.setItem('ps_user', JSON.stringify(data.user));
      if (window.showToast) showToast(`Welcome back, ${data.user.name.split(' ')[0]}! 👋`, 'success');

      // Redirect based on user role
      setTimeout(() => {
        if (data.user.role === 'doctor') window.location.href = 'doctor-dashboard.html';
        else if (data.user.role === 'admin') window.location.href = 'admin-dashboard.html';
        else window.location.href = 'dashboard.html';
      }, 600);
    } catch (err) {
      setLoading(btn, false);
      showMessage('Could not reach the server. Please try again shortly.');
    }
  });
}

/* ── SIGNUP ─────────────────────────────────── */
const signupForm = document.getElementById('signup-form');
if (signupForm) {
  signupForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = document.getElementById('name').value.trim();
    const email = document.getElementById('email').value.trim();
    const password = document.getElementById('password').value;
    const dobField = document.getElementById('dob');
    const dob = dobField ? dobField.value : '';
    const roleField = document.getElementById('role');
    const role = roleField ? roleField.value : 'patient';

    if (!EMAIL_REGEX.test(email)) {
      return showMessage('Please enter a valid email address (e.g. name@domain.com).');
    }

    if (!PASSWORD_REGEX.test(password)) {
      return showMessage('Password must be at least 8 characters long and contain at least 1 uppercase letter.');
    }
    const btn = signupForm.querySelector('button[type="submit"]');
    setLoading(btn, true);
    try {
      const res = await fetch(`${API_BASE}/signup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, password, dob, role })
      });
      const data = await res.json();
      if (!res.ok) {
        setLoading(btn, false);
        return showMessage(data.message || 'Sign up failed');
      }
      localStorage.setItem('ps_token', data.token);
      localStorage.setItem('ps_user', JSON.stringify(data.user));
      if (window.showToast) showToast(`Account created! Welcome, ${data.user.name.split(' ')[0]}! 🎉`, 'success');
      setTimeout(() => {
        if (data.user.role === 'doctor') window.location.href = 'doctor-dashboard.html';
        else if (data.user.role === 'admin') window.location.href = 'admin-dashboard.html';
        else window.location.href = 'dashboard.html';
      }, 600);
    } catch (err) {
      setLoading(btn, false);
      showMessage('Could not reach the server. Please try again shortly.');
    }
  });
}

/* ── FORGOT PASSWORD ────────────────────────── */
const requestCodeForm = document.getElementById('request-code-form');
if (requestCodeForm) {
  requestCodeForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('email').value.trim().toLowerCase();
    if (!email) return showMessage('Please enter your email address.');
    const btn = requestCodeForm.querySelector('button[type="submit"]');
    setLoading(btn, true);

    try {
      const res = await fetch(`${API_BASE}/forgot-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email })
      });
      const data = await res.json();
      setLoading(btn, false);
      if (!res.ok) return showMessage(data.message || 'Could not request reset code');

      showMessage(data.message, false);
      if (window.showToast) showToast('Reset code generated!', 'info');

      const resetForm = document.getElementById('reset-password-form');
      const resetEmailEl = document.getElementById('reset-email');
      const codeBanner = document.getElementById('reset-code-banner');
      
      if (codeBanner) {
        codeBanner.style.display = 'none';
        codeBanner.hidden = true;
      }

      if (resetForm && resetEmailEl) {
        resetEmailEl.value = email;
        resetForm.hidden = false;
        resetForm.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    } catch (err) {
      setLoading(btn, false);
      showMessage('Could not reach the server. Please try again shortly.');
    }
  });
}

/* ── RESET PASSWORD ─────────────────────────── */
const resetPasswordForm = document.getElementById('reset-password-form');
if (resetPasswordForm) {
  resetPasswordForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('reset-email').value.trim().toLowerCase();
    const code = document.getElementById('reset-code').value.trim();
    const password = document.getElementById('new-password').value;
    const confirmPassword = document.getElementById('confirm-password').value;
    const btn = resetPasswordForm.querySelector('button[type="submit"]');

    if (!email) return showMessage('Please enter your email address.');
    if (!/^[0-9]{6}$/.test(code)) return showMessage('Please enter the 6-digit reset code.');
    if (password !== confirmPassword) return showMessage('Passwords do not match.');

    setLoading(btn, true);
    try {
      const res = await fetch(`${API_BASE}/reset-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, code, password })
      });
      const data = await res.json();
      setLoading(btn, false);
      if (!res.ok) return showMessage(data.message || 'Could not reset password');

      showMessage(data.message, false);
      if (window.showToast) showToast('Password updated successfully! Redirecting...', 'success');
      setTimeout(() => { window.location.href = 'login.html'; }, 1500);
    } catch (err) {
      setLoading(btn, false);
      showMessage('Could not reach the server. Please try again shortly.');
    }
  });
}
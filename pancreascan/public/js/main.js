(function () {
  /* ── THEME ──────────────────────────────── */
  const THEME_KEY = 'ps_theme';

  function getTheme() {
    return document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
  }

  function syncToggleButtons(theme) {
    const sunIcon = `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:flex"><circle cx="12" cy="12" r="5"></circle><line x1="12" y1="1" x2="12" y2="3"></line><line x1="12" y1="21" x2="12" y2="23"></line><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line><line x1="1" y1="12" x2="3" y2="12"></line><line x1="21" y1="12" x2="23" y2="12"></line><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line></svg>`;
    const moonIcon = `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:flex"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path></svg>`;

    document.querySelectorAll('.theme-toggle').forEach(function (btn) {
      btn.innerHTML = theme === 'dark' ? sunIcon : moonIcon;
      btn.setAttribute('aria-label', theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode');
      btn.setAttribute('aria-pressed', theme === 'dark' ? 'true' : 'false');
    });
  }

  function applyTheme(theme) {
    if (theme === 'dark') {
      document.documentElement.setAttribute('data-theme', 'dark');
    } else {
      document.documentElement.removeAttribute('data-theme');
    }
    localStorage.setItem(THEME_KEY, theme);
    syncToggleButtons(theme);
  }

  function initTheme() {
    const saved = localStorage.getItem(THEME_KEY);
    if (saved === 'dark' || saved === 'light') { applyTheme(saved); return; }
    if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) { applyTheme('dark'); return; }
    syncToggleButtons('light');
  }

  initTheme();

  document.addEventListener('click', function (e) {
    const btn = e.target.closest('.theme-toggle');
    if (!btn) return;
    applyTheme(getTheme() === 'dark' ? 'light' : 'dark');
  });

  /* ── SCROLL HEADER SHADOW ───────────────── */
  window.addEventListener('scroll', function () {
    const header = document.querySelector('header');
    if (header) {
      if (window.scrollY > 10) header.classList.add('scrolled');
      else header.classList.remove('scrolled');
    }
  }, { passive: true });

  /* ── TOAST SYSTEM ───────────────────────── */
  window.showToast = function (message, type = 'success', duration = 3500) {
    let container = document.getElementById('toast-container');
    if (!container) {
      container = document.createElement('div');
      container.id = 'toast-container';
      document.body.appendChild(container);
    }
    const icons = { success: '✓', error: '✕', info: 'ℹ', warning: '⚠' };
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = `<span style="font-size:16px;flex-shrink:0">${icons[type] || '•'}</span><span>${message}</span>`;
    container.appendChild(toast);
    setTimeout(() => {
      toast.classList.add('fade-out');
      toast.addEventListener('animationend', () => toast.remove());
    }, duration);
  };

  /* ── SESSION GUARD + USER REFRESH ───────── */
  const token = localStorage.getItem('ps_token');
  const userRaw = localStorage.getItem('ps_user');

  let user = null;
  if (userRaw && token) {
    try { user = JSON.parse(userRaw); } catch (e) {
      localStorage.removeItem('ps_token');
      localStorage.removeItem('ps_user');
    }
  }

  const path = window.location.pathname.toLowerCase();
  const filename = path.split('/').pop() || path;

  // Route guard: redirect if not the right role
  if (filename.includes('dashboard') && !filename.includes('doctor') && !filename.includes('admin')) {
    if (!user || user.role !== 'patient') { window.location.href = 'login.html'; return; }
  } else if (filename.includes('doctor-dashboard')) {
    if (!user || user.role !== 'doctor') { window.location.href = 'login.html'; return; }
  } else if (filename.includes('admin-dashboard')) {
    if (!user || user.role !== 'admin') { window.location.href = 'login.html'; return; }
  } else if (filename === 'login.html' || filename === 'signup.html') {
    // Already logged in — don't show the login/signup form again.
    if (user) {
      const dest = user.role === 'doctor' ? 'doctor-dashboard.html'
        : user.role === 'admin' ? 'admin-dashboard.html'
        : 'dashboard.html';
      window.location.href = dest;
      return;
    }
  }

  // Refresh user data from server to keep name/role current
  if (user && token) {
    fetch('/api/auth/me', { headers: { 'Authorization': `Bearer ${token}` } })
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (data && data.user) {
          const fresh = {
            id: data.user._id || data.user.id,
            name: data.user.name,
            email: data.user.email,
            role: data.user.role
          };
          localStorage.setItem('ps_user', JSON.stringify(fresh));
          user = fresh;
          renderNav(user);
        }
      })
      .catch(() => {}); // silent fail — use cached data
  }

  /* ── NAV LINKS ──────────────────────────── */
  const navLinks = document.querySelector('.nav-links');
  const actions = document.querySelector('.nav-actions');

  if (user && navLinks) {
    let dashboardLink = '';
    if (user.role === 'patient') dashboardLink = 'dashboard.html';
    else if (user.role === 'doctor') dashboardLink = 'doctor-dashboard.html';
    else if (user.role === 'admin') dashboardLink = 'admin-dashboard.html';

    if (dashboardLink && !navLinks.querySelector('.dash-injected-link')) {
      const li = document.createElement('li');
      li.className = 'dash-injected-link';
      li.innerHTML = `<a href="${dashboardLink}" style="color: var(--teal-dark); font-weight: 700;">Dashboard</a>`;
      navLinks.appendChild(li);
    }
  }

  function renderNav(u) {
    if (!u || !actions) return;
    const isDark = getTheme() === 'dark';
    const sunIcon = `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:flex"><circle cx="12" cy="12" r="5"></circle><line x1="12" y1="1" x2="12" y2="3"></line><line x1="12" y1="21" x2="12" y2="23"></line><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line><line x1="1" y1="12" x2="3" y2="12"></line><line x1="21" y1="12" x2="23" y2="12"></line><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line></svg>`;
    const moonIcon = `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:flex"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path></svg>`;
    const themeIcon = isDark ? sunIcon : moonIcon;

    const initials = u.name
      ? u.name.split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase()
      : '?';
    const roleBadge = u.role === 'admin' ? 'Admin' : u.role === 'doctor' ? 'Doctor' : 'Patient';
    actions.innerHTML = `
      <button class="theme-toggle" type="button" aria-label="Toggle dark mode">${themeIcon}</button>
      <div class="nav-user-badge" id="nav-user-menu">
        <div class="nav-avatar">${initials}</div>
        <div>
          <div class="nav-user-name">${u.name.split(' ')[0]}</div>
          <div class="nav-user-role">${roleBadge}</div>
        </div>
      </div>
      <a href="#" class="btn btn-dark btn-sm" id="logout-btn">Log out</a>
    `;
    syncToggleButtons(getTheme());

    document.getElementById('logout-btn').addEventListener('click', (e) => {
      e.preventDefault();
      localStorage.removeItem('ps_token');
      localStorage.removeItem('ps_user');
      window.location.href = 'index.html';
    });
  }

  if (user && actions) renderNav(user);

})();

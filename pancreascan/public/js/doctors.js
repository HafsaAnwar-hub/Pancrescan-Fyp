(async function() {
  // 1. INITIALIZE PATIENT VIEW
  loadDoctors();
  setupContactForm();

  // 2. LOAD DOCTORS (Patient View)
  async function loadDoctors() {
    const list = document.getElementById('doctor-list');
    if (!list) return;
    try {
      const res = await fetch('/api/doctors');
      const data = await res.json();
      list.innerHTML = data.doctors.map(d => `
        <div class="doctor-card">
          <div>
            <h3>${d.name}</h3>
            <p>${d.role}</p>
          </div>
          <a href="tel:${d.phone.replace(/[^+\d]/g, '')}" class="doctor-phone">📞 ${d.phone}</a>
        </div>
      `).join('');
    } catch (err) {
      list.innerHTML = '<p>Could not load doctors right now.</p>';
    }
  }

  // 3. SETUP CALLBACK CONTACT FORM (Patient View)
  function setupContactForm() {
    const contactForm = document.getElementById('doctor-contact-form');
    if (!contactForm) return;

    contactForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const name = document.getElementById('name').value.trim();
      const email = document.getElementById('email').value.trim();
      const phone = document.getElementById('phone').value.trim();
      const message = document.getElementById('message').value.trim();
      const msgEl = document.getElementById('form-message');
      const btn = contactForm.querySelector('button[type="submit"]');
      if (btn) { btn.disabled = true; btn.classList.add('loading'); }
      try {
        const res = await fetch('/api/doctors/contact', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name, email, phone, message })
        });
        const data = await res.json();
        if (btn) { btn.disabled = false; btn.classList.remove('loading'); }
        if (!res.ok) {
          msgEl.style.color = 'var(--danger)';
          msgEl.textContent = data.message || 'Something went wrong';
          if (window.showToast) showToast(data.message || 'Submission failed', 'error');
          return;
        }
        msgEl.style.color = 'var(--teal-dark)';
        msgEl.textContent = 'Request received — a specialist will reach out soon.';
        if (window.showToast) showToast('Callback request submitted! A doctor will contact you.', 'success', 5000);
        contactForm.reset();
      } catch (err) {
        if (btn) { btn.disabled = false; btn.classList.remove('loading'); }
        msgEl.style.color = 'var(--danger)';
        msgEl.textContent = 'Could not reach the server. Try again shortly.';
        if (window.showToast) showToast('Server unreachable. Try again.', 'error');
      }
    });
  }
})();
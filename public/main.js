/* ================================================================
   LUNA NHS ENROLLMENT SYSTEM — main.js
   ================================================================ */

document.addEventListener('DOMContentLoaded', function () {

  // ── Bootstrap tooltips ──────────────────────────────────────────
  document.querySelectorAll('[data-bs-toggle="tooltip"]').forEach(el => new bootstrap.Tooltip(el));

  // ── Auto-dismiss flash alerts ────────────────────────────────────
  document.querySelectorAll('.alert.alert-dismissible').forEach(alert => {
    setTimeout(() => {
      const bsAlert = bootstrap.Alert.getInstance(alert) || new bootstrap.Alert(alert);
      bsAlert.close();
    }, 5000);
  });

  // ── Strand card radio select ─────────────────────────────────────
  document.querySelectorAll('input[name="chosen_strand"]').forEach(radio => {
    radio.addEventListener('change', function () {
      document.querySelectorAll('label.interest-card').forEach(c => c.classList.remove('selected'));
      const label = this.closest('label');
      if (label) label.classList.add('selected');
    });
    // Init selected on page load
    if (radio.checked) {
      const label = radio.closest('label');
      if (label) label.classList.add('selected');
    }
  });

  // ── Progress bar animation on load ──────────────────────────────
  document.querySelectorAll('.strand-bar[data-width]').forEach(bar => {
    requestAnimationFrame(() => { bar.style.width = bar.dataset.width + '%'; });
  });

  // ── Confirm before form submit with data-confirm ─────────────────
  document.querySelectorAll('form[data-confirm]').forEach(form => {
    form.addEventListener('submit', function (e) {
      if (!confirm(this.dataset.confirm)) e.preventDefault();
    });
  });

  // ── Active nav link highlight ────────────────────────────────────
  const path = window.location.pathname;
  document.querySelectorAll('.nav-link, .sidebar-item').forEach(link => {
    const target = new URL(link.href, window.location.origin).pathname;
    if (target === path || (target !== '/dashboard' && target !== '/admin/dashboard' && path.startsWith(target + '/'))) link.classList.add('active');
  });

  const sidebarTrigger = document.getElementById('sidebarTrigger');
  const sidebarBackdrop = document.getElementById('sidebarBackdrop');
  const setSidebar = open => {
    document.body.classList.toggle('sidebar-open', open);
    if (sidebarTrigger) sidebarTrigger.setAttribute('aria-expanded', String(open));
  };
  sidebarTrigger?.addEventListener('click', () => setSidebar(!document.body.classList.contains('sidebar-open')));
  sidebarBackdrop?.addEventListener('click', () => setSidebar(false));
  document.addEventListener('keydown', event => { if (event.key === 'Escape') setSidebar(false); });

  document.querySelectorAll('.elective-check').forEach(checkbox => {
    const updateRank = () => {
      const card = checkbox.closest('.pos-elective-card');
      const rank = card.querySelector('.rank-input');
      rank.disabled = !checkbox.checked;
      rank.required = checkbox.checked;
      if (!checkbox.checked) rank.value = '';
      card.classList.toggle('selected', checkbox.checked);
      const count = document.querySelectorAll('.elective-check:checked').length;
      const countLabel = document.getElementById('electiveCount');
      if (countLabel) countLabel.textContent = `${count} of 10 selected`;
    };
    checkbox.addEventListener('change', updateRank);
    updateRank();
  });

  document.getElementById('electiveSearch')?.addEventListener('input', event => {
    const query = event.target.value.trim().toLowerCase();
    document.querySelectorAll('.pos-elective-card').forEach(card => {
      card.hidden = query && !card.textContent.toLowerCase().includes(query);
    });
  });

});

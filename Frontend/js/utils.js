// ===== SHARED UTILITIES =====

// Toast notifications
function showToast(message, type = 'info', duration = 3000) {
  const container = document.getElementById('toastContainer');
  if (!container) return;
  const icons = { success: '<i class="fas fa-check-circle"></i>', error: '<i class="fas fa-circle-xmark"></i>', warning: '<i class="fas fa-triangle-exclamation"></i>', info: '<i class="fas fa-circle-info"></i>' };
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.innerHTML = `
    <span class="toast-icon">${icons[type] || icons.info}</span>
    <span class="toast-message">${message}</span>
  `;
  container.appendChild(toast);
  setTimeout(() => {
    if (toast.parentElement) {
      toast.style.animation = 'toastIn 0.15s ease reverse';
      setTimeout(() => toast.remove(), 150);
    }
  }, duration);
}

// Modal helpers
function openModal(id) {
  const el = document.getElementById(id);
  if (el) el.classList.add('active');
}
function closeModal(id) {
  const el = document.getElementById(id);
  if (el) el.classList.remove('active');
}

// Bind all modal close buttons
document.addEventListener('click', (e) => {
  const closeBtn = e.target.closest('[data-close]');
  if (closeBtn) closeModal(closeBtn.dataset.close);
  const overlay = e.target.classList.contains('modal-overlay');
  if (overlay && e.target.classList.contains('active')) {
    const modal = e.target.querySelector('.modal');
    if (modal && !modal.contains(e.target)) e.target.classList.remove('active');
  }
});

// Dropdown toggle
document.addEventListener('click', (e) => {
  const toggle = e.target.closest('.dropdown > button, .dropdown > .topnav-btn');
  if (toggle) {
    const dropdown = toggle.closest('.dropdown');
    const isOpen = dropdown.classList.contains('open');
    document.querySelectorAll('.dropdown.open').forEach(d => d.classList.remove('open'));
    if (!isOpen) dropdown.classList.add('open');
    return;
  }
  if (!e.target.closest('.dropdown.open')) {
    document.querySelectorAll('.dropdown.open').forEach(d => d.classList.remove('open'));
  }
});

// Format date
function formatDate(dateStr) {
  if (!dateStr) return '—';
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatRelative(dateStr) {
  if (!dateStr) return '';
  const now = new Date();
  const d = new Date(dateStr);
  const diff = Math.floor((now - d) / 1000);
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;
  return formatDate(dateStr);
}

function isOverdue(dateStr) {
  if (!dateStr) return false;
  return new Date(dateStr) < new Date() && new Date(dateStr).toDateString() !== new Date().toDateString();
}

// Avatar helper
function getAvatarHTML(user, size = '') {
  if (!user) return `<div class="avatar ${size}" style="background:#6366f1">?</div>`;
  const colors = ['#6366f1', '#8b5cf6', '#ec4899', '#f59e0b', '#10b981', '#3b82f6'];
  const color = user.avatar && user.avatar.startsWith('#') ? user.avatar : colors[user.id % colors.length] || '#6366f1';
  const initials = (user.username || user.name || '?').charAt(0).toUpperCase();
  return `<div class="avatar ${size}" style="background:${color}" title="${user.username || ''}">${initials}</div>`;
}

function getUserColor(user) {
  if (!user) return '#6366f1';
  const colors = ['#6366f1', '#8b5cf6', '#ec4899', '#f59e0b', '#10b981', '#3b82f6'];
  if (user.avatar && user.avatar.startsWith('#')) return user.avatar;
  return colors[(user.id || 0) % colors.length];
}

// Priority helpers
function getPriorityLabel(p) {
  return { urgent: '<i class="fas fa-fire"></i> Urgent', high: '<i class="fas fa-circle-up"></i> High', medium: '<i class="fas fa-circle"></i> Medium', low: '<i class="fas fa-circle-down"></i> Low' }[p] || p;
}
function getPriorityColor(p) {
  return { urgent: 'var(--danger)', high: 'var(--warning)', medium: 'var(--info)', low: 'var(--success)' }[p] || 'var(--text-muted)';
}

// Auth guard
function requireAuth() {
  const token = localStorage.getItem('tf_token');
  if (!token) { window.location.href = getBasePath() + 'index.html'; return false; }
  return true;
}

function getBasePath() {
  const path = window.location.pathname;
  // If we're in the pages directory, we need to go up one level to reach root assets
  if (path.includes('/pages/')) return '../';
  return '';
}

function getPagePath(pageName) {
  const path = window.location.pathname;
  const inPages = path.includes('/pages/');
  if (inPages) return pageName.startsWith('pages/') ? pageName.replace('pages/', '') : pageName;
  return pageName.startsWith('pages/') ? pageName : 'pages/' + pageName;
}

function getCurrentUser() {
  try { return JSON.parse(localStorage.getItem('tf_user')); } catch { return null; }
}

function setCurrentUser(user) {
  localStorage.setItem('tf_user', JSON.stringify(user));
}

// Loading state helper
function setLoading(btn, spinnerId, loading, text) {
  const spinner = document.getElementById(spinnerId);
  if (!btn || !spinner) return;
  if (loading) {
    btn.disabled = true;
    spinner.classList.remove('hidden');
  } else {
    btn.disabled = false;
    spinner.classList.add('hidden');
    if (text) btn.querySelector('span') && (btn.querySelector('span').textContent = text);
  }
}

// Theme initialization
function initTheme() {
  const saved = localStorage.getItem('tf_theme') || 'system';
  applyTheme(saved, false);
}

initTheme();

function applyTheme(theme, showNotice = true) {
  const root = document.documentElement;
  root.setAttribute('data-theme', theme);
  
  if (theme === 'system') {
    localStorage.removeItem('tf_theme');
  } else {
    localStorage.setItem('tf_theme', theme);
  }
  
  updateThemeIcons(theme);

  if (showNotice) {
    const themeName = theme === 'system' ? 'System' : theme.charAt(0).toUpperCase() + theme.slice(1);
    showToast(`${themeName} mode applied!`, 'info');

    // Close dropdowns
    document.querySelectorAll('.dropdown.open').forEach(d => d.classList.remove('open'));

    // Save to notifications list
    if (typeof Notifications !== 'undefined' && Notifications.addLocalNotification) {
      Notifications.addLocalNotification('Appearance Changed', `You switched to ${themeName} mode.`, 'appearance_changed');
    }
  }
}

function updateThemeIcons(theme) {
  const icons = document.querySelectorAll('.theme-icon');
  icons.forEach(icon => {
    if (theme === 'dark') icon.className = 'theme-icon fas fa-moon';
    else if (theme === 'light') icon.className = 'theme-icon fas fa-sun';
    else icon.className = 'theme-icon fas fa-circle-half-stroke';
  });
}

// Sidebar setup (shared across pages)
function initSidebar() {
  const sidebar = document.getElementById('sidebar');
  const mainContent = document.getElementById('mainContent');
  const toggle = document.getElementById('sidebarToggle');

  // Create sidebar mobile overlay on load if on mobile
  if (sidebar) {
    const createOverlay = () => {
      if (window.innerWidth <= 768 && !document.getElementById('sidebarMobileOverlay')) {
        const overlay = document.createElement('div');
        overlay.id = 'sidebarMobileOverlay';
        overlay.className = 'sidebar-overlay';
        document.body.appendChild(overlay);
        overlay.addEventListener('click', () => {
          sidebar.classList.remove('mobile-open');
          overlay.classList.remove('active');
        });
      }
    };
    createOverlay();
    window.addEventListener('resize', createOverlay);
  }

  // Restore collapsed state from localStorage (only for desktop)
  if (window.innerWidth > 768 && localStorage.getItem('tf_sidebar_collapsed') === 'true') {
    if (sidebar && mainContent) {
      // Temporarily disable transitions to prevent sliding animation on page load
      sidebar.style.transition = 'none';
      mainContent.style.transition = 'none';
      
      sidebar.classList.add('collapsed');
      mainContent.classList.add('sidebar-collapsed');
      
      // Force reflow
      void sidebar.offsetHeight;
      
      // Restore transitions asynchronously to ensure they apply after the paint
      setTimeout(() => {
        sidebar.style.transition = '';
        mainContent.style.transition = '';
      }, 50);
    }
  }

  if (toggle && sidebar) {
    toggle.addEventListener('click', (e) => {
      e.stopPropagation();
      if (window.innerWidth <= 768) {
        sidebar.classList.toggle('mobile-open');
        const overlay = document.getElementById('sidebarMobileOverlay');
        if (overlay) {
          overlay.classList.toggle('active', sidebar.classList.contains('mobile-open'));
        }
      } else {
        const isCollapsed = sidebar.classList.toggle('collapsed');
        if (mainContent) mainContent.classList.toggle('sidebar-collapsed', isCollapsed);
        localStorage.setItem('tf_sidebar_collapsed', isCollapsed);
      }
    });

    // Close mobile sidebar when clicking outside
    document.addEventListener('click', (e) => {
      if (window.innerWidth <= 768 && sidebar.classList.contains('mobile-open')) {
        const overlay = document.getElementById('sidebarMobileOverlay');
        if (!sidebar.contains(e.target) && !toggle.contains(e.target)) {
          sidebar.classList.remove('mobile-open');
          overlay && overlay.classList.remove('active');
        }
      }
    });
  }

  // Real-time project list sync
  WsClient.on('PROJECT_CREATED', () => loadSidebarProjects());
  WsClient.on('PROJECT_DELETED', () => loadSidebarProjects());
  WsClient.on('NEW_NOTIFICATION', (msg) => {
    if (msg.notification?.type === 'project_invite' || msg.notification?.type === 'task_assigned') {
      loadSidebarProjects();
    }
  });

  const user = getCurrentUser();
  if (user) {
    // Populate all instances of user info (top and bottom sidebar)
    document.querySelectorAll('.sidebar-user-name').forEach(el => el.textContent = user.username);
    document.querySelectorAll('.sidebar-avatar').forEach(el => {
      el.textContent = user.username.charAt(0).toUpperCase();
      el.style.background = getUserColor(user);
    });
  }
  // Logout buttons
  ['btnLogout', 'btnLogout2'].forEach(id => {
    const btn = document.getElementById(id);
    if (btn) btn.addEventListener('click', confirmLogout);
  });
}

function confirmLogout() {
  let modal = document.getElementById('logoutModal');
  if (!modal) {
    const div = document.createElement('div');
    div.innerHTML = `
      <div class="modal-overlay" id="logoutModal">
        <div class="modal" style="width: min(400px, 94vw);">
          <div class="modal-header">
            <h3 class="modal-title" style="color: var(--danger)"><i class="fas fa-sign-out-alt"></i> Confirm Logout</h3>
            <button class="modal-close" data-close="logoutModal"><i class="fas fa-times"></i></button>
          </div>
          <div style="margin-bottom: 24px; font-size: 15px;">
            Are you sure you want to log out of TaskFlow?
          </div>
          <div class="modal-footer">
            <button type="button" class="btn btn-secondary" data-close="logoutModal">Cancel</button>
            <button type="button" class="btn btn-danger" id="confirmLogoutBtn">Logout</button>
          </div>
        </div>
      </div>
    `;
    document.body.appendChild(div.firstElementChild);

    document.getElementById('confirmLogoutBtn')?.addEventListener('click', () => {
      Api.removeToken();
      window.location.href = getBasePath() + 'index.html';
    });
  }
  openModal('logoutModal');
}

// Load sidebar projects
async function loadSidebarProjects(activeProjectId = null) {
  const container = document.getElementById('sidebarProjects');
  if (!container) return;
  try {
    const { projects } = await Api.getProjects();
    if (!projects.length) {
      container.innerHTML = '<div style="padding:8px 12px;font-size:12px;color:var(--text-muted)">No projects yet</div>';
      return;
    }
    container.innerHTML = projects.map(p => {
      const iconHtml = p.icon && p.icon.length > 2 
        ? `<i class="${p.icon}"></i>` 
        : (p.icon || '<i class="fas fa-clipboard"></i>');
      return `
        <a href="${getPagePath('project.html')}?id=${p.id}"
          class="sidebar-project-item ${p.id == activeProjectId ? 'active' : ''}"
          title="${p.name}">
          <span class="sidebar-project-icon" style="color:${p.color}">${iconHtml}</span>
          <span class="sidebar-project-name">${p.name}</span>
        </a>
      `;
    }).join('');
  } catch { }
}

// Greeting
function getGreeting() {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

function openProfileModal() {
  let modal = document.getElementById('profileModal');
  if (!modal) {
    const div = document.createElement('div');
    div.innerHTML = `
      <div class="modal-overlay" id="profileModal">
        <div class="modal">
          <div class="modal-header">
            <h3 class="modal-title"><i class="fas fa-user-circle"></i> Profile Settings</h3>
            <button class="modal-close" data-close="profileModal"><i class="fas fa-times"></i></button>
          </div>
          <form id="profileForm">
            <div style="display:flex;align-items:center;gap:16px;margin-bottom:24px">
              <div class="avatar avatar-xl" id="profileAvatar" style="background:#6366f1;font-size:28px">?</div>
              <div>
                <div id="profileDisplayName" style="font-size:18px;font-weight:700">—</div>
                <div id="profileEmail" style="font-size:13px;color:var(--text-muted)">—</div>
              </div>
            </div>
            <div class="form-group">
              <label class="form-label">Username</label>
              <input type="text" id="profileUsername" class="form-input" placeholder="Username" />
            </div>
            <div class="modal-footer">
              <button type="button" class="btn btn-secondary" data-close="profileModal">Cancel</button>
              <button type="submit" class="btn btn-primary">Save Changes</button>
            </div>
          </form>
        </div>
      </div>
    `;
    document.body.appendChild(div.firstElementChild);

    // Bind form submit
    document.getElementById('profileForm')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      try {
        const { user: updated } = await Api.updateProfile({ username: document.getElementById('profileUsername').value.trim() });
        setCurrentUser(updated);
        showToast('Profile updated!', 'success');
        closeModal('profileModal');
        // Update UI
        document.querySelectorAll('.sidebar-user-name').forEach(el => el.textContent = updated.username);
        document.querySelectorAll('.sidebar-avatar').forEach(el => {
          el.textContent = updated.username.charAt(0).toUpperCase();
          el.style.background = getUserColor(updated);
        });
      } catch (err) {
        showToast(err.message, 'error');
      }
    });
  }

  const u = getCurrentUser();
  if (u) {
    const usernameInput = document.getElementById('profileUsername');
    if (usernameInput) usernameInput.value = u.username;
    const displayName = document.getElementById('profileDisplayName');
    if (displayName) displayName.textContent = u.username;
    const emailEl = document.getElementById('profileEmail');
    if (emailEl) emailEl.textContent = u.email;
    const av = document.getElementById('profileAvatar');
    if (av) { av.textContent = u.username.charAt(0).toUpperCase(); av.style.background = getUserColor(u); }
  }
  openModal('profileModal');
}

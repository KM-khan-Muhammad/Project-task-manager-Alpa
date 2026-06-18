// ===== DASHBOARD PAGE =====
(async function () {
  if (!requireAuth()) return;

  let projects = [];
  const user = getCurrentUser();

  // Init shared components
  initSidebar();
  WsClient.connect();
  Notifications.init();

  // Greeting
  const greetEl = document.getElementById('dashGreeting');
  if (greetEl && user) greetEl.innerHTML = `${getGreeting()}, ${user.username}! <i class="far fa-hand-wave"></i>`;

  // Load everything
  await loadDashboard();
  await loadSidebarProjects();

  // Create project button
  document.getElementById('createProjectBtn')?.addEventListener('click', () => openModal('createProjectModal'));
  document.getElementById('btnCreateProject')?.addEventListener('click', () => openModal('createProjectModal'));

  // Project form pickers
  initIconPicker();
  initColorPicker();

  // Create project form
  document.getElementById('createProjectForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = document.getElementById('createProjSubmit');
    const spinner = document.getElementById('createProjSpinner');
    btn.disabled = true;
    spinner?.classList.remove('hidden');
    try {
      const data = await Api.createProject({
        name: document.getElementById('projName').value.trim(),
        description: document.getElementById('projDesc').value.trim(),
        icon: document.getElementById('projIcon').value,
        color: document.getElementById('projColor').value
      });
      showToast(`Project "${data.project.name}" created! 🎉`, 'success');
      closeModal('createProjectModal');
      document.getElementById('createProjectForm').reset();
      await loadDashboard();
      await loadSidebarProjects();
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      btn.disabled = false;
      spinner?.classList.add('hidden');
    }
  });

  // Profile form
  ['btnProfile', 'sidebarUser'].forEach(id => {
    document.getElementById(id)?.addEventListener('click', () => {
      const u = getCurrentUser();
      if (u) {
        document.getElementById('profileUsername').value = u.username;
        document.getElementById('profileDisplayName').textContent = u.username;
        document.getElementById('profileEmail').textContent = u.email;
        const av = document.getElementById('profileAvatar');
        if (av) { av.textContent = u.username.charAt(0).toUpperCase(); av.style.background = getUserColor(u); }
      }
      openModal('profileModal');
    });
  });
  document.getElementById('profileForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      const { user: updated } = await Api.updateProfile({ username: document.getElementById('profileUsername').value.trim() });
      setCurrentUser(updated);
      showToast('Profile updated!', 'success');
      closeModal('profileModal');
      document.getElementById('sidebarUserName').textContent = updated.username;
    } catch (err) {
      showToast(err.message, 'error');
    }
  });

  // Search
  let searchTimer;
  const globalSearchInput = document.getElementById('globalSearch');
  globalSearchInput?.addEventListener('input', (e) => {
    clearTimeout(searchTimer);
    const query = e.target.value.trim();
    searchTimer = setTimeout(() => {
      if (query.length > 1) {
        performGlobalSearch(query);
      } else {
        loadDashboard();
      }
    }, 150);
  });

  async function performGlobalSearch(query) {
    const grid = document.getElementById('projectsGrid');
    grid.innerHTML = '<div class="empty-state" style="grid-column:1/-1"><div class="spinner spinner-lg"></div><p>Searching everywhere...</p></div>';
    
    try {
      const { projects: foundProjects, tasks: foundTasks } = await Api.globalSearch(query);
      
      if (!foundProjects.length && !foundTasks.length) {
        grid.innerHTML = `<div class="empty-state" style="grid-column:1/-1"><div class="empty-state-icon">🔍</div><h3>No results found</h3><p>We couldn't find anything matching "${query}"</p></div>`;
        return;
      }

      grid.innerHTML = '';
      
      if (foundProjects.length) {
        const title = document.createElement('h3');
        title.style.gridColumn = '1/-1';
        title.style.margin = '20px 0 10px';
        title.style.fontSize = '16px';
        title.innerHTML = `<i class="fas fa-folder"></i> Projects (${foundProjects.length})`;
        grid.appendChild(title);
        renderProjects(foundProjects, true);
      }

      if (foundTasks.length) {
        const title = document.createElement('h3');
        title.style.gridColumn = '1/-1';
        title.style.margin = '30px 0 10px';
        title.style.fontSize = '16px';
        title.innerHTML = `<i class="fas fa-tasks"></i> Tasks (${foundTasks.length})`;
        grid.appendChild(title);
        
        foundTasks.forEach(t => {
          const card = document.createElement('div');
          card.className = 'project-card task-search-result';
          card.style.borderLeft = '4px solid var(--primary)';
          card.onclick = () => window.location.href = `project.html?id=${t.project_id}&taskId=${t.id}`;
          card.innerHTML = `
            <div style="display:flex; justify-content:space-between; align-items:start">
              <div style="font-weight:700; font-size:15px">${t.title}</div>
              <span class="badge ${getPriorityBadgeClass(t.priority)}">${t.priority}</span>
            </div>
            <div style="font-size:12px; color:var(--text-muted); margin-top:4px">Project: <b>${t.project_name}</b> • Board: ${t.board_name}</div>
            <div style="font-size:13px; color:var(--text-secondary); margin-top:8px">${t.description ? t.description.substring(0, 100) + '...' : 'No description'}</div>
          `;
          grid.appendChild(card);
        });
      }
    } catch (err) {
      showToast('Search failed: ' + err.message, 'error');
    }
  }

  function getPriorityBadgeClass(p) {
    return { urgent:'badge-danger', high:'badge-warning', medium:'badge-info', low:'badge-success' }[p] || 'badge-secondary';
  }

  // View toggle
  const gridContainer = document.getElementById('projectsGrid');
  
  document.getElementById('viewGrid')?.addEventListener('click', () => {
    gridContainer.classList.remove('list-mode');
    document.getElementById('viewGrid').classList.remove('btn-ghost');
    document.getElementById('viewGrid').classList.add('btn-secondary');
    document.getElementById('viewList').classList.add('btn-ghost');
    document.getElementById('viewList').classList.remove('btn-secondary');
  });

  document.getElementById('viewList')?.addEventListener('click', () => {
    gridContainer.classList.add('list-mode');
    document.getElementById('viewList').classList.remove('btn-ghost');
    document.getElementById('viewList').classList.add('btn-secondary');
    document.getElementById('viewGrid').classList.add('btn-ghost');
    document.getElementById('viewGrid').classList.remove('btn-secondary');
  });

  // WS events
  WsClient.on('PROJECT_UPDATED', loadDashboard);
  WsClient.on('PROJECT_CREATED', loadDashboard);
  WsClient.on('PROJECT_DELETED', loadDashboard);
  WsClient.on('TASK_CREATED', loadDashboard);
  WsClient.on('TASK_UPDATED', loadDashboard);
  WsClient.on('TASK_DELETED', loadDashboard);

  async function loadDashboard() {
    try {
      const { projects: p } = await Api.getProjects();
      projects = p;
      
      renderStats(p);
      renderProjects(p);
    } catch (err) {
      document.getElementById('projectsGrid').innerHTML =
        `<div class="empty-state" style="grid-column:1/-1"><div class="empty-state-icon"><i class="fas fa-circle-xmark"></i></div><h3>Connection Error</h3><p>${err.message}</p></div>`;
    }
  }

  function renderStats(projects) {
    const totalTasks = projects.reduce((s, p) => s + (parseInt(p.task_count || 0)), 0);
    const completedCount = projects.reduce((s, p) => s + (parseInt(p.completed_tasks || 0)), 0);
    const overdueCount = projects.reduce((s, p) => s + (parseInt(p.overdue_tasks || 0)), 0);
    
    document.getElementById('statProjects').textContent = projects.length || 0;
    document.getElementById('statTasks').textContent = totalTasks || 0;
    document.getElementById('statDone').textContent = completedCount || 0;
    document.getElementById('statOverdue').textContent = overdueCount || 0;
  }

  function renderProjects(list, append = false) {
    const grid = document.getElementById('projectsGrid');
    if (!list.length && !append) {
      grid.innerHTML = `
        <div class="empty-state" style="grid-column:1/-1">
          <div class="empty-state-icon"><i class="fas fa-folder-open"></i></div>
          <h3>No projects yet</h3>
          <p>Create your first project and start collaborating with your team</p>
          <button class="btn btn-primary" onclick="openModal('createProjectModal')"><i class="fas fa-plus"></i> Create Project</button>
        </div>`;
      return;
    }
    
    const html = list.map((p, i) => {
      const progress = p.task_count > 0 ? Math.round((p.completed_tasks / p.task_count) * 100) : 0;
      return `
        <div class="project-card" style="--card-color:${p.color};animation-delay:${i * 0.05}s"
          onclick="window.location.href='${getPagePath('project.html')}?id=${p.id}'">
          <div class="project-card-header">
            <div class="project-icon">${p.icon && p.icon.length > 2 ? `<i class="${p.icon}"></i>` : (p.icon || '<i class="fas fa-project-diagram"></i>')}</div>
          </div>
          <div class="project-title">${p.name}</div>
          <div class="project-desc">${p.description || 'No description provided'}</div>
          <div class="project-meta">
            <div class="project-meta-item"><i class="fas fa-tasks"></i> ${p.task_count || 0} tasks</div>
            <div class="project-meta-item">
              <span class="badge ${p.status === 'active' ? 'badge-success' : 'badge-secondary'}">${p.status || 'active'}</span>
            </div>
          </div>
          <div class="project-progress">
            <div class="project-progress-header">
              <span>Progress</span>
              <span>${progress}%</span>
            </div>
            <div class="progress-bar"><div class="progress-fill" style="width:${progress}%"></div></div>
          </div>
        </div>`;
    }).join('');

    if (append) {
      const container = document.createElement('div');
      container.style.display = 'contents';
      container.innerHTML = html;
      grid.appendChild(container);
    } else {
      grid.innerHTML = html;
    }
  }



  function initIconPicker() {
    document.querySelectorAll('.icon-opt').forEach(opt => {
      opt.addEventListener('click', () => {
        document.querySelectorAll('.icon-opt').forEach(o => {
          o.style.border = '2px solid transparent';
          o.style.background = 'transparent';
        });
        opt.style.border = '2px solid var(--primary)';
        opt.style.background = 'rgba(99,102,241,0.1)';
        document.getElementById('projIcon').value = opt.dataset.icon;
      });
    });
  }

  function initColorPicker() {
    document.querySelectorAll('.color-opt').forEach(opt => {
      opt.addEventListener('click', () => {
        document.querySelectorAll('.color-opt').forEach(o => {
          o.style.border = '2px solid transparent';
          o.style.outline = 'none';
        });
        opt.style.border = '3px solid #fff';
        opt.style.outline = `2px solid ${opt.dataset.color}`;
        document.getElementById('projColor').value = opt.dataset.color;
      });
    });
  }

  window.confirmDeleteProject = async (id, name) => {
    if (!confirm(`Delete project "${name}"? This will remove all boards, tasks and comments.`)) return;
    try {
      await Api.deleteProject(id);
      showToast('Project deleted', 'success');
      await loadDashboard();
      await loadSidebarProjects();
    } catch (err) {
      showToast(err.message, 'error');
    }
  };
})();

document.addEventListener('DOMContentLoaded', async () => {
  if (!requireAuth()) return;

  initSidebar();
  WsClient.connect();
  Notifications.init();
  await loadSidebarProjects();
  
  const tasksTableBody = document.getElementById('myTasksTableBody');
  const searchInput = document.getElementById('myTaskSearch');
  const priorityFilter = document.getElementById('myTaskPriorityFilter');
  const statusFilter = document.getElementById('myTaskStatusFilter');
  
  let allTasks = [];
  
  loadMyTasks();

  async function loadMyTasks() {
    try {
      const { tasks } = await Api.getMyTasks();
      allTasks = tasks;
      applyFilters();
    } catch (err) {
      showToast('Failed to load tasks: ' + err.message, 'error');
      tasksTableBody.innerHTML = `<tr><td colspan="6" style="text-align:center;padding:40px;color:var(--danger)">${err.message}</td></tr>`;
    }
  }

  function applyFilters() {
    const query = searchInput.value.toLowerCase();
    const priority = priorityFilter.value;
    const status = statusFilter.value;

    const filtered = allTasks.filter(t => {
      const matchesSearch = t.title.toLowerCase().includes(query) || 
                            (t.description || '').toLowerCase().includes(query) ||
                            t.project_name.toLowerCase().includes(query);
      const matchesPriority = !priority || t.priority === priority;
      const matchesStatus = !status || (status === 'done' ? t.status === 'done' : t.status !== 'done');
      
      return matchesSearch && matchesPriority && matchesStatus;
    });

    renderTasks(filtered);
  }

  // Bind filter events
  searchInput.addEventListener('input', applyFilters);
  priorityFilter.addEventListener('change', applyFilters);
  statusFilter.addEventListener('change', applyFilters);

  function renderTasks(tasks) {
    if (!tasks.length) {
      tasksTableBody.innerHTML = `
        <tr>
          <td colspan="6" style="text-align:center;padding:60px;color:var(--text-muted)">
            <div style="font-size:40px;margin-bottom:16px">🎯</div>
            <p>You have no assigned tasks. Good job!</p>
          </td>
        </tr>`;
      return;
    }

    tasksTableBody.innerHTML = tasks.map(t => `
      <tr onclick="viewTask(${t.project_id}, ${t.id})" style="cursor:pointer">
        <td>
          <div style="font-weight:600;color:var(--text-primary)">${escapeHtml(t.title)}</div>
          <div style="font-size:12px;color:var(--text-muted);margin-top:4px">${t.description ? escapeHtml(t.description.substring(0, 40)) + '...' : 'No description'}</div>
        </td>
        <td>
          <div style="display:flex;align-items:center;gap:6px">
             <span style="font-size:12px">${escapeHtml(t.project_name)}</span>
          </div>
        </td>
        <td>
          <span class="badge" style="background:${t.board_color}22; color:${t.board_color}">
            ${escapeHtml(t.board_name || 'No Board')}
          </span>
        </td>
        <td>
          <span class="badge ${getPriorityBadgeClass(t.priority)}">${t.priority}</span>
        </td>
        <td>
          <div style="font-size:13px; color:${isOverdue(t.due_date) ? 'var(--danger)' : 'var(--text-primary)'}">
            ${t.due_date ? new Date(t.due_date).toLocaleDateString() : 'No date'}
          </div>
        </td>
        <td>
          <button class="btn btn-ghost btn-sm">
            <i class="fas fa-external-link-alt"></i> View
          </button>
        </td>
      </tr>
    `).join('');
  }

  window.viewTask = (projectId, taskId) => {
    window.location.href = `project.html?id=${projectId}&taskId=${taskId}`;
  };

  function isOverdue(date) {
    if (!date) return false;
    return new Date(date) < new Date() && !date.includes('Done');
  }

  function getPriorityBadgeClass(p) {
    return { urgent:'badge-danger', high:'badge-warning', medium:'badge-info', low:'badge-success' }[p] || 'badge-secondary';
  }

  function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  loadMyTasks();
});

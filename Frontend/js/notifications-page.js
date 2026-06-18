document.addEventListener('DOMContentLoaded', async () => {
  if (!requireAuth()) return;

  initSidebar();
  WsClient.connect();
  Notifications.init();
  await loadSidebarProjects();

  const list = document.getElementById('notificationsPageList');
  const markAllBtn = document.getElementById('markAllReadPage');
  const clearAllBtn = document.getElementById('clearAllNotifsPage');

  async function loadNotifications() {
    try {
      const { notifications: serverNotifs } = await Api.getNotifications();
      let localNotifs = [];
      try {
        localNotifs = JSON.parse(localStorage.getItem('tf_local_notifs') || '[]');
      } catch (e) { localNotifs = []; }
      
      const allNotifs = [...localNotifs, ...serverNotifs].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
      renderNotifications(allNotifs);
    } catch (err) {
      showToast('Failed to load notifications: ' + err.message, 'error');
    }
  }

  function renderNotifications(notifs) {
    if (!notifs.length) {
      list.innerHTML = `
        <div style="text-align:center;padding:80px;color:var(--text-muted)">
          <div style="font-size:48px;margin-bottom:16px">🔔</div>
          <p>No notifications yet. You're all caught up!</p>
        </div>`;
      return;
    }

    list.innerHTML = notifs.map(n => {
      const dataStr = typeof n.data === 'string' ? n.data : JSON.stringify(n.data || {});
      return `
      <div class="notif-page-item ${n.is_read ? '' : 'unread'}" 
           data-notif-id="${n.id}" data-notif-data='${JSON.stringify(n.data || {})}'
           onclick="window.handleNotifPageClick(this, event)">
        <div class="notif-page-icon">
          <i class="${getNotifIcon(n.type)}"></i>
        </div>
        <div class="notif-page-content">
          <div class="notif-page-title">${escapeHtml(n.title)}</div>
          <div class="notif-page-desc">${escapeHtml(n.message)}</div>
          <div class="notif-page-time"><i class="far fa-clock"></i> ${formatRelative(n.created_at)}</div>
        </div>
        ${!n.is_read ? '<div class="unread-indicator"></div>' : ''}
        <div class="notif-delete-btn">
          <button class="btn btn-ghost btn-icon btn-sm danger" onclick="deleteIndividualNotif('${n.id}', event)" title="Delete notification">
            <i class="fas fa-times"></i>
          </button>
        </div>
      </div>`;
    }).join('');
  }

  window.handleNotifPageClick = async (el, event) => {
    if (event.target.closest('button')) return;
    
    const id = el.dataset.notifId;
    const dataStr = el.dataset.notifData;
    
    try {
      if (id) {
        if (String(id).startsWith('local_')) {
          let local = JSON.parse(localStorage.getItem('tf_local_notifs') || '[]');
          const idx = local.findIndex(n => n.id == id);
          if (idx !== -1) {
            local[idx].is_read = true;
            localStorage.setItem('tf_local_notifs', JSON.stringify(local));
          }
        } else {
          await Api.deleteNotif(id);
        }
        if (typeof Notifications !== 'undefined') Notifications.load();
      }
      
      const data = JSON.parse(dataStr || '{}');
      if (data.projectId && data.taskId) {
        window.location.href = `project.html?id=${data.projectId}&taskId=${data.taskId}`;
      } else if (data.projectId) {
        window.location.href = `project.html?id=${data.projectId}`;
      } else {
        loadNotifications();
      }
    } catch (err) { console.error('Notif click error:', err); }
  };

  window.deleteIndividualNotif = async (id, event) => {
    if (event) event.stopPropagation();
    try {
      if (String(id).startsWith('local_')) {
        let local = JSON.parse(localStorage.getItem('tf_local_notifs') || '[]');
        local = local.filter(n => n.id != id);
        localStorage.setItem('tf_local_notifs', JSON.stringify(local));
      } else {
        await Api.deleteNotif(id);
      }
      loadNotifications();
      if (typeof Notifications !== 'undefined') Notifications.load();
    } catch (err) { showToast(err.message, 'error'); }
  };

  markAllBtn.addEventListener('click', async () => {
    try {
      await Api.markAllNotifsRead();
      let local = JSON.parse(localStorage.getItem('tf_local_notifs') || '[]');
      local.forEach(n => n.is_read = true);
      localStorage.setItem('tf_local_notifs', JSON.stringify(local));
      
      showToast('All notifications marked as read');
      loadNotifications();
      if (typeof Notifications !== 'undefined') Notifications.load();
    } catch (err) { showToast(err.message, 'error'); }
  });

  clearAllBtn.addEventListener('click', async () => {
    if (!confirm('Clear all notifications? This cannot be undone.')) return;
    try {
      await Api.clearAllNotifs();
      localStorage.removeItem('tf_local_notifs');
      
      showToast('Notifications cleared');
      loadNotifications();
      if (typeof Notifications !== 'undefined') Notifications.load();
    } catch (err) { showToast(err.message, 'error'); }
  });

  function getNotifIcon(type) {
    const icons = {
      'new_task': 'fas fa-tasks',
      'task_updated': 'fas fa-edit',
      'new_comment': 'fas fa-comment-dots',
      'project_invite': 'fas fa-user-plus',
      'task_assigned': 'fas fa-clipboard-list',
      'mention': 'fas fa-at'
    };
    return icons[type] || 'fas fa-bell';
  }

  function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  loadNotifications();
});

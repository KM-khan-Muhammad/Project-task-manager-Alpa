// ===== NOTIFICATIONS MODULE =====
const Notifications = (() => {
  let unreadCount = 0;

  async function init() {
    await load();
    // Real-time
    WsClient.on('NEW_NOTIFICATION', (msg) => {
      if (msg.notification) {
        unreadCount++;
        updateBadge();
        prependNotification(msg.notification);
        showToast(msg.notification.message, 'info');
      }
    });
    // Mark all read / Clear all
    document.addEventListener('click', (e) => {
      if (e.target.id === 'markAllRead') markAllRead(e);
      if (e.target.id === 'clearAllNotifs') clearAll(e);
      if (e.target.classList.contains('view-all-link')) viewAll(e);
    });
  }

  async function clearAll(e) {
    if (e) { e.preventDefault(); e.stopPropagation(); }
    if (!confirm('Clear all notifications?')) return;
    try {
      await Api.clearAllNotifs();
      localStorage.removeItem('tf_local_notifs');
      unreadCount = 0;
      updateBadge();
      renderList([]);
      showToast('Notifications cleared', 'success');
    } catch (err) {
      console.error('Clear all failed:', err);
    }
  }

  function getLocalNotifs() {
    try { return JSON.parse(localStorage.getItem('tf_local_notifs') || '[]'); } catch { return []; }
  }
  function saveLocalNotifs(notifs) {
    localStorage.setItem('tf_local_notifs', JSON.stringify(notifs));
  }

  async function load() {
    try {
      const { notifications: serverNotifs, unreadCount: serverCnt } = await Api.getNotifications();
      const localNotifs = getLocalNotifs();
      
      const allNotifs = [...localNotifs, ...serverNotifs].sort((a,b) => new Date(b.created_at) - new Date(a.created_at));
      unreadCount = serverCnt + localNotifs.filter(n => !n.is_read).length;
      
      updateBadge();
      renderList(allNotifs);
    } catch {
      const localNotifs = getLocalNotifs();
      unreadCount = localNotifs.filter(n => !n.is_read).length;
      updateBadge();
      renderList(localNotifs);
    }
  }

  function updateBadge() {
    const badges = document.querySelectorAll('#notifCount, #sidebarNotifBadge');
    badges.forEach(b => {
      if (unreadCount > 0) {
        b.textContent = unreadCount > 99 ? '99+' : unreadCount;
        b.classList.remove('hidden');
      } else {
        b.classList.add('hidden');
      }
    });
  }

  function renderList(notifications) {
    const list = document.getElementById('notificationsList');
    if (!list) return;
    if (!notifications.length) {
      list.innerHTML = `<div class="empty-state" style="padding:30px">
        <div class="empty-state-icon">🔔</div><p>No notifications yet</p></div>`;
      return;
    }
    list.innerHTML = notifications.map(n => buildNotifHTML(n)).join('');
    list.querySelectorAll('.notification-item').forEach(el => {
      el.addEventListener('click', () => handleNotifClick(el));
    });
  }

  function buildNotifHTML(n) {
    const icons = { 
      project_invite: '<i class="fas fa-envelope-open-text" style="color:var(--primary-light)"></i>', 
      task_assigned: '<i class="fas fa-clipboard-check" style="color:var(--success)"></i>', 
      new_comment: '<i class="fas fa-comment-dots" style="color:var(--info)"></i>', 
      task_moved: '<i class="fas fa-arrows-left-right" style="color:var(--warning)"></i>',
      appearance_changed: '<i class="fas fa-palette" style="color:var(--secondary)"></i>',
      default: '<i class="fas fa-bell" style="color:var(--text-muted)"></i>' 
    };
    return `
      <div class="notification-item ${n.is_read ? '' : 'unread'}" data-id="${n.id}" data-notif-data='${typeof n.data === "string" ? n.data : JSON.stringify(n.data || {})}'>
        <div style="width:32px; height:32px; display:flex; align-items:center; justify-content:center; font-size:18px; flex-shrink:0;">
          ${icons[n.type] || icons.default}
        </div>
        <div class="notif-content">
          <div class="notif-title">${n.title}</div>
          <div class="notif-msg">${n.message}</div>
          <div class="notif-time">${formatRelative(n.created_at)}</div>
        </div>
        <button class="notif-dismiss-btn" onclick="event.stopPropagation();deleteNotif('${n.id}',this)" title="Dismiss">
          <i class="fas fa-times"></i>
        </button>
      </div>`;
  }

  function prependNotification(n) {
    const list = document.getElementById('notificationsList');
    if (!list) return;
    const emptyState = list.querySelector('.empty-state');
    if (emptyState) emptyState.remove();
    const div = document.createElement('div');
    div.innerHTML = buildNotifHTML(n);
    list.prepend(div.firstElementChild);
    list.querySelectorAll('.notification-item').forEach(el => {
      el.onclick = () => handleNotifClick(el);
    });
  }

  async function handleNotifClick(el) {
    const id = el.dataset.id;
    const notifDataStr = el.dataset.notifData || '{}';
    if (!el.classList.contains('unread')) {
      navigateFromNotif(notifDataStr);
      return;
    }
    el.classList.remove('unread');
    
    if (String(id).startsWith('local_')) {
      let local = getLocalNotifs();
      const idx = local.findIndex(n => n.id == id);
      if (idx !== -1) {
        local[idx].is_read = true;
        saveLocalNotifs(local);
      }
    } else {
      try {
      await Api.deleteNotif(id);
    } catch {}
    }
    
    unreadCount = Math.max(0, unreadCount - 1);
    updateBadge();
    navigateFromNotif(notifDataStr);
  }

  function navigateFromNotif(dataStr) {
    try {
      const data = typeof dataStr === 'string' ? JSON.parse(dataStr) : dataStr;
      if (data && data.projectId) {
        const base = window.location.pathname.includes('/pages/') ? '' : 'pages/';
        let url = `${base}project.html?id=${data.projectId}`;
        if (data.taskId) url += `&taskId=${data.taskId}`;
        window.location.href = url;
      }
    } catch {}
  }

  async function markAllRead(e) {
    if (e) { e.preventDefault(); e.stopPropagation(); }
    try {
      await Api.markAllNotifsRead();
      
      // Handle local ones
      let local = getLocalNotifs();
      local.forEach(n => n.is_read = true);
      saveLocalNotifs(local);
      
      unreadCount = 0;
      updateBadge();
      document.querySelectorAll('.notification-item.unread').forEach(el => el.classList.remove('unread'));
      showToast('All notifications marked as read', 'success');
    } catch (err) {
      console.error('Mark all read failed:', err);
    }
  }

  function viewAll(e) {
    if (e) { e.preventDefault(); e.stopPropagation(); }
    const base = window.location.pathname.includes('/pages/') ? '' : 'pages/';
    window.location.href = `${base}notifications.html`;
  }

  function addLocalNotification(title, message, type = 'default') {
    const n = { id: `local_${Date.now()}`, title, message, type, created_at: new Date().toISOString(), is_read: false };
    const local = getLocalNotifs();
    local.unshift(n);
    saveLocalNotifs(local);
    
    prependNotification(n);
    unreadCount++;
    updateBadge();
  }

  return { init, load, updateBadge, addLocalNotification, markAllRead, viewAll };
})();

// Global delete notif (called inline)
async function deleteNotif(id, btn) {
  try {
    if (String(id).startsWith('local_')) {
      let local = JSON.parse(localStorage.getItem('tf_local_notifs') || '[]');
      local = local.filter(n => n.id != id);
      localStorage.setItem('tf_local_notifs', JSON.stringify(local));
    } else {
      await Api.deleteNotif(id);
    }
    btn.closest('.notification-item').remove();
    // Update badge if unread
    Notifications.load(); // Refresh state
    showToast('Notification dismissed', 'info');
  } catch (err) {
    console.error(err);
  }
}

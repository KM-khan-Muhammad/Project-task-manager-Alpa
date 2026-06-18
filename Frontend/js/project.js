// ===== PROJECT PAGE =====
(async function () {
  if (!requireAuth()) return;

  const params = new URLSearchParams(window.location.search);
  const projectId = params.get('id');
  if (!projectId) { window.location.href = 'dashboard.html'; return; }

  let project = null, boards = [], tasks = [], members = [], allSystemUsers = [];
  let currentTab = 'board';
  let activeTaskId = null;
  const currentUser = getCurrentUser();

  initSidebar();
  WsClient.connect();
  WsClient.subscribeProject(parseInt(projectId));
  Notifications.init();

  await loadProject();
  await loadSidebarProjects(projectId);

  // Handle direct link to a task
  const taskId = params.get('taskId');
  if (taskId) {
    openTaskDetail(parseInt(taskId));
    // Remove taskId from URL so it doesn't reopen on refresh
    const newUrl = window.location.pathname + '?id=' + projectId;
    window.history.replaceState({}, '', newUrl);
  }

  bindEvents();
  bindWebSocketEvents();

  // ===== LOAD PROJECT =====
  async function loadProject() {
    try {
      const data = await Api.getProject(projectId);
      project = data.project;
      boards = data.boards;
      members = data.members;

      // Fetch all system users as requested (non-blocking)
      Api.getUsers().then(({ users }) => {
        allSystemUsers = users;
        populateMemberSelects();
      }).catch(err => console.error('Failed to fetch system users:', err));

      document.title = `${project.name} | TaskFlow`;
      document.getElementById('projectName').textContent = project.name;
      document.getElementById('projectDesc').textContent = project.description || '';
      document.getElementById('projectIcon').innerHTML = project.icon && project.icon.length > 2 ? `<i class="${project.icon}"></i>` : (project.icon || '<i class="fas fa-project-diagram"></i>');
      document.getElementById('breadcrumbProject').textContent = project.name;

      populateMemberSelects();
      await loadTasks();
      
      // Handle role-based UI restrictions (Strictly Owner Only)
      const myRole = members.find(m => m.id === currentUser?.id)?.role;
      if (myRole !== 'owner') {
        document.getElementById('addTaskQuickBtn')?.classList.add('hidden');
        document.getElementById('addTaskFilterBtn')?.classList.add('hidden');
        document.getElementById('addBoardBtn')?.classList.add('hidden');
        // Keep Search but hide Assignee Filter
        document.getElementById('filterAssignee')?.classList.add('hidden');
      }
      
      renderCurrentTab();
    } catch (err) {
      showToast('Failed to load project: ' + err.message, 'error');
    }
  }

  async function loadTasks(filters = {}) {
    try {
      const { tasks: t } = await Api.getTasks(projectId, filters);
      tasks = t;
    } catch (err) {
      showToast('Failed to load tasks', 'error');
    }
  }

  // ===== TABS =====
  function renderCurrentTab() {
    document.querySelectorAll('.project-tab').forEach(t => t.classList.remove('active'));
    document.getElementById(`tab${currentTab.charAt(0).toUpperCase()+currentTab.slice(1)}`)?.classList.add('active');

    document.getElementById('viewBoard').classList.toggle('hidden', currentTab !== 'board');
    document.getElementById('viewList').classList.toggle('hidden', currentTab !== 'list');
    document.getElementById('viewMembers').classList.toggle('hidden', currentTab !== 'members');
    document.getElementById('viewActivity').classList.toggle('hidden', currentTab !== 'activity');
    document.getElementById('filterBar').classList.toggle('hidden', currentTab === 'members' || currentTab === 'activity');

    if (currentTab === 'board') renderBoard();
    else if (currentTab === 'list') renderList();
    else if (currentTab === 'members') renderMembers();
    else if (currentTab === 'activity') loadActivity();
  }

  // ===== BOARD RENDER =====
  function renderBoard() {
    const container = document.getElementById('viewBoard');
    container.innerHTML = '';

    const myRole = members.find(m => m.id === currentUser?.id)?.role;
    const filteredTasks = myRole === 'owner' ? tasks : tasks.filter(t => t.assignee_id === currentUser?.id);

    boards.forEach(board => {
      const boardTasks = filteredTasks.filter(t => t.board_id === board.id);
      const col = document.createElement('div');
      col.className = 'board-column';
      col.dataset.boardId = board.id;
      col.innerHTML = `
        <div class="column-header">
          <div class="column-header-left">
            <span class="column-color-bar" style="background:${board.color}"></span>
            <span class="column-name">${board.name}</span>
            <span class="column-count">${boardTasks.length}</span>
          </div>
          ${members.find(m => m.id === currentUser?.id)?.role === 'owner' ? `
          <button class="column-add-btn" data-board="${board.id}" title="Add task"><i class="fas fa-plus"></i></button>` : ''}
        </div>
        <div class="column-tasks" data-board="${board.id}" id="col-${board.id}">
          ${boardTasks.length === 0 ? '<div style="padding:20px;text-align:center;font-size:12px;color:var(--text-muted)">No tasks yet</div>' : ''}
        </div>
        ${members.find(m => m.id === currentUser?.id)?.role === 'owner' ? `
        <button class="add-task-btn" data-board="${board.id}"><i class="fas fa-plus"></i> Add task</button>` : ''}`;
      container.appendChild(col);

      boardTasks.forEach(task => {
        const card = buildTaskCard(task);
        col.querySelector('.column-tasks').appendChild(card);
      });
    });

    // Add board button (Owner Only)
    if (members.find(m => m.id === currentUser?.id)?.role === 'owner') {
      const addCol = document.createElement('div');
      addCol.className = 'add-board-column';
      addCol.innerHTML = '<div class="add-board-column-icon"><i class="fas fa-plus"></i></div><span>Add Board</span>';
      addCol.onclick = () => openModal('addBoardModal');
      container.appendChild(addCol);
    }

    initDragDrop();
  }

  function buildTaskCard(task) {
    const card = document.createElement('div');
    card.className = 'task-card';
    card.draggable = true;
    card.dataset.taskId = task.id;
    card.dataset.boardId = task.board_id;

    const due = task.due_date ? `<span class="task-meta-item ${isOverdue(task.due_date)?'overdue':''}"><i class="far fa-calendar"></i> ${formatDate(task.due_date)}</span>` : '';
    const comments = task.comment_count > 0 ? `<span class="task-meta-item"><i class="far fa-comment"></i> ${task.comment_count}</span>` : '';
    const labels = task.labels ? JSON.parse(task.labels) : [];
    const labelsHTML = labels.map(l => `<span class="task-label" style="background:rgba(99,102,241,0.15);color:var(--primary-light)">${l}</span>`).join('');
    const assignee = task.assignee_id ? `<div class="avatar avatar-sm" style="background:${getUserColorById(task.assignee_id)}" title="${task.assignee_name||''}">${(task.assignee_name||'?').charAt(0).toUpperCase()}</div>` : '';

    card.innerHTML = `
      <div class="task-card-priority">
        ${getPriorityIcon(task.priority)}
        <span style="font-size:11px;color:var(--text-muted);text-transform:capitalize">${task.priority}</span>
      </div>
      <div class="task-card-title">${escapeHtml(task.title)}</div>
      ${labelsHTML ? `<div class="task-card-labels">${labelsHTML}</div>` : ''}
      <div class="task-card-footer">
        <div class="task-card-meta">${due}${comments}</div>
        <div class="task-card-assignee">${assignee}</div>
      </div>`;

    card.addEventListener('click', () => openTaskDetail(task.id));
    return card;
  }

  function getPriorityIcon(p) {
    if (p === 'urgent') return '<i class="fas fa-circle-exclamation" style="color:var(--danger)"></i>';
    if (p === 'high') return '<i class="fas fa-angles-up" style="color:var(--warning)"></i>';
    if (p === 'medium') return '<i class="fas fa-angle-up" style="color:var(--info)"></i>';
    return '<i class="fas fa-angle-down" style="color:var(--text-muted)"></i>';
  }

  // ===== DRAG & DROP =====
  function initDragDrop() {
    document.querySelectorAll('.task-card').forEach(card => {
      card.addEventListener('dragstart', e => {
        e.dataTransfer.setData('taskId', card.dataset.taskId);
        e.dataTransfer.setData('fromBoard', card.dataset.boardId);
        setTimeout(() => card.classList.add('dragging'), 0);
      });
      card.addEventListener('dragend', () => card.classList.remove('dragging'));
    });

    document.querySelectorAll('.column-tasks').forEach(col => {
      col.addEventListener('dragover', e => { e.preventDefault(); col.closest('.board-column').classList.add('drag-over'); });
      col.addEventListener('dragleave', () => col.closest('.board-column').classList.remove('drag-over'));
      col.addEventListener('drop', async e => {
        e.preventDefault();
        col.closest('.board-column').classList.remove('drag-over');
        const taskId = e.dataTransfer.getData('taskId');
        const fromBoard = e.dataTransfer.getData('fromBoard');
        const toBoard = col.dataset.board;
        if (fromBoard !== toBoard) {
          try {
            const targetBoardId = parseInt(toBoard);
            const targetBoard = boards.find(b => b.id === targetBoardId);
            const isDone = targetBoard?.name.toLowerCase().includes('done') || targetBoard?.name.toLowerCase().includes('complete');
            
            await Api.updateTask(projectId, taskId, { 
              board_id: targetBoardId,
              status: isDone ? 'done' : 'todo'
            });
            await loadTasks();
            renderBoard();
          } catch (err) { showToast(err.message, 'error'); }
        }
      });
    });
  }

  // ===== LIST VIEW =====
  function renderList() {
    const tbody = document.getElementById('listTableBody');
    
    const myRole = members.find(m => m.id === currentUser?.id)?.role;
    const filteredTasks = myRole === 'owner' ? tasks : tasks.filter(t => t.assignee_id === currentUser?.id);

    if (!filteredTasks.length) {
      tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:40px;color:var(--text-muted)"><i class="fas fa-folder-open" style="font-size:24px;margin-bottom:10px;display:block"></i>No tasks found</td></tr>';
      return;
    }
    tbody.innerHTML = filteredTasks.map(t => `
      <tr onclick="openTaskDetailById(${t.id})">
        <td>
          <div style="display:flex;align-items:center;gap:10px">
            ${getPriorityIcon(t.priority)}
            <span style="font-weight:600">${escapeHtml(t.title)}</span>
          </div>
        </td>
        <td><span style="background:rgba(99,102,241,0.1);color:var(--primary-light);padding:4px 12px;border-radius:20px;font-size:12px;font-weight:500"><i class="fas fa-layer-group" style="font-size:10px;margin-right:4px"></i>${t.board_name||'—'}</span></td>
        <td><span class="badge ${getPriorityBadgeClass(t.priority)}" style="text-transform:capitalize">${t.priority}</span></td>
        <td>${t.assignee_name ? `<div style="display:flex;align-items:center;gap:8px"><div class="avatar avatar-sm" style="background:${getUserColorById(t.assignee_id)}">${t.assignee_name.charAt(0).toUpperCase()}</div>${t.assignee_name}</div>` : '<span style="color:var(--text-muted)"><i class="fas fa-user-slash" style="margin-right:6px"></i>Unassigned</span>'}</td>
        <td><span class="${isOverdue(t.due_date)?'text-danger':''}" style="font-weight:500"><i class="far fa-calendar-alt" style="margin-right:6px"></i>${formatDate(t.due_date)}</span></td>
        <td style="color:var(--text-muted);font-size:12px"><i class="far fa-clock" style="margin-right:4px"></i>${formatRelative(t.created_at)}</td>
      </tr>`).join('');
  }

  // ===== MEMBERS VIEW =====
  function renderMembers() {
    const grid = document.getElementById('membersGrid');
    grid.innerHTML = members.map(m => `
      <div class="member-card">
        <div class="avatar avatar-lg" style="background:${getUserColorById(m.id)}">${m.username.charAt(0).toUpperCase()}</div>
        <div class="member-info">
          <div class="member-name">${escapeHtml(m.username)}</div>
          <div class="member-email">${m.email}</div>
          <div class="member-role-badge">
            <span class="badge ${m.role==='owner'?'badge-primary':m.role==='admin'?'badge-warning':'badge-secondary'}">${m.role}</span>
          </div>
        </div>
        ${m.id !== currentUser?.id && project?.owner_id === currentUser?.id ? `
      <button class="btn btn-danger btn-sm btn-icon" onclick="removeMember(${m.id},'${m.username}')" title="Remove"><i class="fas fa-user-minus"></i></button>` : ''}
      </div>`).join('');
  }

  // ===== ACTIVITY =====
  async function loadActivity() {
    const el = document.getElementById('activityList');
    el.innerHTML = '<div style="text-align:center;padding:20px"><div class="spinner spinner-lg" style="margin:0 auto"></div></div>';
    try {
      const { logs } = await Api.getProjectActivity(projectId);
      if (!logs.length) { el.innerHTML = '<div class="empty-state"><div class="empty-state-icon"><i class="fas fa-history"></i></div><p>No activity yet</p></div>'; return; }
      const icons = { task_created:'<i class="fas fa-plus-circle"></i>', task_moved:'<i class="fas fa-arrows-alt"></i>', comment_added:'<i class="fas fa-comment-dots"></i>', default:'<i class="fas fa-info-circle"></i>' };
      el.innerHTML = logs.map(l => {
        const details = typeof l.details === 'string' ? JSON.parse(l.details || '{}') : (l.details || {});
        const msgs = { task_created:`created task <b>${details.taskTitle||''}</b>`, task_moved:`moved task to <b>${details.boardName||''}</b>`, comment_added:`commented on <b>${details.taskTitle||''}</b>` };
        return `<div style="display:flex;gap:12px;padding:14px 0;border-bottom:1px solid var(--border-light)">
          <span style="font-size:20px">${icons[l.action]||icons.default}</span>
          <div>
            <div style="font-size:14px"><b>${l.username}</b> ${msgs[l.action]||l.action}</div>
            <div style="font-size:12px;color:var(--text-muted);margin-top:4px">${formatRelative(l.created_at)}</div>
          </div></div>`;
      }).join('');
    } catch { el.innerHTML = '<div class="empty-state"><p>Failed to load activity</p></div>'; }
  }

  // ===== TASK DETAIL =====
  async function openTaskDetail(taskId) {
    activeTaskId = taskId;
    try {
      const { task, comments } = await Api.getTask(projectId, taskId);
      const modal = document.getElementById('taskDetailModal');
      document.getElementById('taskDetailTitle').value = task.title;
      document.getElementById('taskDetailDesc').value = task.description || '';
      document.getElementById('taskDetailPriority').value = task.priority;
      document.getElementById('taskDetailDueDate').value = task.due_date || '';
      document.getElementById('taskDetailPriorityDot').className = `priority-dot ${task.priority}`;

      const labels = task.labels ? JSON.parse(task.labels) : [];
      document.getElementById('taskDetailLabels').value = labels.join(', ');

      // Labels display
      document.getElementById('taskLabelsDisplay').innerHTML = labels.map(l =>
        `<span class="task-label" style="background:rgba(99,102,241,0.15);color:var(--primary-light);padding:3px 10px;border-radius:20px;font-size:12px">${l}</span>`).join('');

      // Board select
      const boardSel = document.getElementById('taskDetailBoard');
      boardSel.innerHTML = boards.map(b => `<option value="${b.id}" ${b.id===task.board_id?'selected':''}>${b.name}</option>`).join('');

      // Assignee (Using ALL system users)
      const assignSel = document.getElementById('taskDetailAssignee');
      assignSel.innerHTML = '<option value="">Unassigned</option>' +
        allSystemUsers.map(u => `<option value="${u.id}" ${u.id===task.assignee_id?'selected':''}>${u.username} (${u.email})</option>`).join('');

      // Creator
      document.getElementById('taskDetailCreator').textContent = task.creator_name || '—';
      const creatorAv = document.getElementById('taskDetailCreatorAvatar');
      creatorAv.textContent = (task.creator_name||'?').charAt(0).toUpperCase();
      creatorAv.style.background = getUserColorById(task.creator_id);

      // Comment user avatar
      const commentAv = document.getElementById('commentUserAvatar');
      if (commentAv && currentUser) {
        commentAv.textContent = currentUser.username.charAt(0).toUpperCase();
        commentAv.style.background = getUserColor(currentUser);
      }

      // Role-based restrictions for Task Details
      const isOwner = members.find(m => m.id === currentUser?.id)?.role === 'owner';
      ['taskDetailTitle', 'taskDetailDesc', 'taskDetailBoard', 'taskDetailPriority', 'taskDetailAssignee', 'taskDetailDueDate', 'taskDetailLabels'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.disabled = !isOwner;
      });
      document.getElementById('saveTaskChangesBtn').style.display = isOwner ? 'block' : 'none';
      document.getElementById('deleteTaskBtn').style.display = isOwner ? 'flex' : 'none';

      renderComments(comments, task.id);
      openModal('taskDetailModal');
    } catch (err) { showToast('Failed to load task: ' + err.message, 'error'); }
  }

  window.openTaskDetailById = (id) => openTaskDetail(id);

  function renderComments(comments, taskId) {
    const list = document.getElementById('commentList');
    document.getElementById('commentCount').textContent = `(${comments.length})`;
    if (!comments.length) {
      list.innerHTML = '<div style="text-align:center;padding:20px;font-size:13px;color:var(--text-muted)">No comments yet. Be the first to comment!</div>';
      return;
    }

    // Organize comments by parent_id
    const commentMap = {};
    comments.forEach(c => {
      c.replies = [];
      commentMap[c.id] = c;
    });

    const roots = [];
    comments.forEach(c => {
      if (c.parent_id && commentMap[c.parent_id]) {
        commentMap[c.parent_id].replies.push(c);
      } else {
        roots.push(c);
      }
    });

    function buildCommentHtml(c, isReply = false) {
      if (!c.username) return ''; // Skip invalid comments
      return `
        <div class="comment-item ${isReply ? 'comment-reply' : ''}" id="comment-${c.id}" style="margin-bottom: 16px;">
          <div class="avatar avatar-sm" style="background:${getUserColorById(c.user_id)}; flex-shrink:0;">${c.username.charAt(0).toUpperCase()}</div>
          <div class="comment-body" style="flex:1; min-width:0;">
            <div class="comment-header" style="display:flex; align-items:center; gap:8px; margin-bottom:4px;">
              <span class="comment-author" style="font-size:13px; font-weight:600; color:var(--text-primary);">${escapeHtml(c.username)}</span>
              <span class="comment-time" style="font-size:11px; color:var(--text-muted);">${formatRelative(c.created_at)}</span>
            </div>
            <div class="comment-text" id="comment-text-${c.id}" style="background:var(--bg-tertiary); border:1px solid var(--border-light); border-radius:8px; padding:10px 14px; font-size:14px; line-height:1.5; color:var(--text-primary); word-break:break-word;">${escapeHtml(c.content).replace(/\n/g,'<br>')}</div>
            <div class="comment-actions" style="display:flex; gap:12px; margin-top:6px;">
              <button class="comment-action-btn like-btn ${c.is_liked ? 'liked' : ''}" onclick="window.toggleLikeAction(${c.id})" style="font-size:12px; border:none; background:none; cursor:pointer; display:flex; align-items:center; gap:4px; color:${c.is_liked ? 'var(--primary-light)' : 'var(--text-muted)'}; transition:0.2s;">
                <i class="${c.is_liked ? 'fas' : 'far'} fa-thumbs-up"></i> 
                <span>Like</span>
                <span class="like-count" style="font-weight:600;">${c.like_count || ''}</span>
              </button>
              <button class="comment-action-btn" onclick="window.setReplyTo(${c.id}, '${escapeHtml(c.username)}')" style="font-size:12px; border:none; background:none; cursor:pointer; display:flex; align-items:center; gap:4px; color:var(--text-muted); transition:0.2s;">
                <i class="fas fa-reply"></i> Reply
              </button>
              ${c.user_id === currentUser?.id ? `
              <button class="comment-action-btn" onclick="window.editCommentAction(${c.id})" style="font-size:12px; border:none; background:none; cursor:pointer; color:var(--text-muted); transition:0.2s;"><i class="fas fa-edit"></i> Edit</button>
              <button class="comment-action-btn" onclick="window.deleteCommentAction(${c.id})" style="font-size:12px; border:none; background:none; cursor:pointer; color:var(--text-muted); transition:0.2s;"><i class="fas fa-trash"></i> Delete</button>` : ''}
            </div>
            ${c.replies.length > 0 ? `<div class="replies-container" style="margin-top:12px; display:flex; flex-direction:column; gap:12px;">${c.replies.map(r => buildCommentHtml(r, true)).join('')}</div>` : ''}
          </div>
        </div>`;
    }

    list.innerHTML = roots.map(c => buildCommentHtml(c)).join('');
  }

  // ===== BIND EVENTS =====
  function bindEvents() {
    // Tabs
    document.querySelectorAll('.project-tab').forEach(tab => {
      tab.addEventListener('click', async () => {
        currentTab = tab.dataset.tab;
        renderCurrentTab();
      });
    });

    // Add task buttons (both quick and column)
    document.getElementById('addTaskQuickBtn')?.addEventListener('click', () => openAddTaskModal());
    document.getElementById('addTaskFilterBtn')?.addEventListener('click', () => openAddTaskModal());
    document.addEventListener('click', e => {
      if (e.target.closest('.column-add-btn') || e.target.closest('.add-task-btn')) {
        const boardId = e.target.closest('[data-board]')?.dataset.board;
        openAddTaskModal(boardId);
      }
    });

    // Profile settings
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
        // Update local UI
        document.querySelectorAll('.sidebar-user-name').forEach(el => el.textContent = updated.username);
        document.querySelectorAll('.user-avatar-initial').forEach(el => el.textContent = updated.username.charAt(0).toUpperCase());
      } catch (err) {
        showToast(err.message, 'error');
      }
    });

    // Add task form
    document.getElementById('addTaskForm')?.addEventListener('submit', async e => {
      e.preventDefault();
      const spinner = document.getElementById('addTaskSpinner');
      spinner?.classList.remove('hidden');
      const labels = document.getElementById('taskLabels').value.split(',').map(l=>l.trim()).filter(Boolean);
      try {
        await Api.createTask(projectId, {
          title: document.getElementById('taskTitle').value.trim(),
          description: document.getElementById('taskDesc').value.trim(),
          board_id: parseInt(document.getElementById('taskBoard').value),
          priority: document.getElementById('taskPriority').value,
          assignee_id: document.getElementById('taskAssignee').value || null,
          due_date: document.getElementById('taskDueDate').value || null,
          labels
        });
        showToast('Task created!', 'success');
        closeModal('addTaskModal');
        document.getElementById('addTaskForm').reset();
        await loadTasks(); renderBoard();
      } catch (err) { showToast(err.message, 'error'); }
      finally { spinner?.classList.add('hidden'); }
    });

    // Save task changes
    document.getElementById('saveTaskChangesBtn')?.addEventListener('click', async () => {
      if (!activeTaskId) return;
      const labels = document.getElementById('taskDetailLabels').value.split(',').map(l=>l.trim()).filter(Boolean);
      try {
        await Api.updateTask(projectId, activeTaskId, {
          title: document.getElementById('taskDetailTitle').value.trim(),
          description: document.getElementById('taskDetailDesc').value.trim(),
          board_id: parseInt(document.getElementById('taskDetailBoard').value),
          priority: document.getElementById('taskDetailPriority').value,
          assignee_id: document.getElementById('taskDetailAssignee').value || null,
          due_date: document.getElementById('taskDetailDueDate').value || null,
          labels
        });
        showToast('Task saved!', 'success');
        closeModal('taskDetailModal');
        await loadTasks(); renderCurrentTab();
      } catch (err) { showToast(err.message, 'error'); }
    });

    // Delete task
    document.getElementById('deleteTaskBtn')?.addEventListener('click', async () => {
      if (!activeTaskId || !confirm('Delete this task?')) return;
      try {
        await Api.deleteTask(projectId, activeTaskId);
        showToast('Task deleted', 'success');
        closeModal('taskDetailModal');
        await loadTasks(); renderCurrentTab();
      } catch (err) { showToast(err.message, 'error'); }
    });

    // Post comment
    document.getElementById('postCommentBtn')?.addEventListener('click', postComment);
    document.getElementById('commentInput')?.addEventListener('keydown', e => {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); postComment(); }
    });

    // Invite member
    document.getElementById('inviteMemberBtn')?.addEventListener('click', () => openModal('inviteMemberModal'));
    document.getElementById('inviteForm')?.addEventListener('submit', async e => {
      e.preventDefault();
      try {
        await Api.addMember(projectId, document.getElementById('inviteEmail').value.trim(), document.getElementById('inviteRole').value);
        showToast('Member added!', 'success');
        closeModal('inviteMemberModal');
        document.getElementById('inviteForm').reset();
        await loadProject();
      } catch (err) { showToast(err.message, 'error'); }
    });

    // Add board
    document.getElementById('addBoardBtn')?.addEventListener('click', () => {
      document.getElementById('projectMenuDrop').classList.remove('open');
      openModal('addBoardModal');
    });
    document.getElementById('addBoardForm')?.addEventListener('submit', async e => {
      e.preventDefault();
      try {
        await Api.createBoard(projectId, { name: document.getElementById('boardName').value.trim(), color: document.getElementById('boardColor').value });
        showToast('Board added!', 'success');
        closeModal('addBoardModal');
        document.getElementById('addBoardForm').reset();
        const data = await Api.getProject(projectId);
        boards = data.boards;
        renderBoard();
      } catch (err) { showToast(err.message, 'error'); }
    });

    // Delete project
    document.getElementById('deleteProjectBtn')?.addEventListener('click', async () => {
      if (!confirm(`Delete project "${project?.name}"? This cannot be undone.`)) return;
      try {
        await Api.deleteProject(projectId);
        showToast('Project deleted', 'success');
        setTimeout(() => window.location.href = 'dashboard.html', 400);
      } catch (err) { showToast(err.message, 'error'); }
    });

    // Filters
    document.getElementById('filterPriority')?.addEventListener('change', applyFilters);
    document.getElementById('filterAssignee')?.addEventListener('change', applyFilters);
    let searchTimer;
    document.getElementById('taskSearch')?.addEventListener('input', () => { clearTimeout(searchTimer); searchTimer = setTimeout(applyFilters, 150); });
  }

  async function applyFilters() {
    const filters = {};
    const p = document.getElementById('filterPriority')?.value; if (p) filters.priority = p;
    const a = document.getElementById('filterAssignee')?.value; if (a) filters.assigneeId = a;
    const s = document.getElementById('taskSearch')?.value; if (s) filters.search = s;
    await loadTasks(filters);
    renderCurrentTab();
  }

  async function postComment() {
    const el = document.getElementById('commentInput');
    const content = el.value.trim();
    if (!content) return;
    try {
      await Api.addComment(projectId, activeTaskId, content, activeReplyToId);
      el.value = '';
      cancelReply();
      const { comments } = await Api.getTask(projectId, activeTaskId);
      renderComments(comments, activeTaskId);
    } catch (err) { showToast(err.message, 'error'); }
  }

  let activeReplyToId = null;
  function setReplyTo(id, username) {
    activeReplyToId = id;
    const input = document.getElementById('commentInput');
    const indicator = document.getElementById('replyIndicator') || createReplyIndicator();
    indicator.innerHTML = `Replying to <b>@${username}</b> <span onclick="cancelReply()" style="cursor:pointer;margin-left:8px;color:var(--primary-light)">✕</span>`;
    indicator.classList.remove('hidden');
    input.focus();
  }

  function cancelReply() {
    activeReplyToId = null;
    document.getElementById('replyIndicator')?.classList.add('hidden');
  }

  function createReplyIndicator() {
    const div = document.createElement('div');
    div.id = 'replyIndicator';
    div.className = 'reply-indicator';
    const area = document.querySelector('.comment-input-area');
    area.parentNode.insertBefore(div, area);
    return div;
  }

  window.removeMember = async (userId, username) => {
    if (!confirm(`Remove ${username} from the project?`)) return;
    try {
      await Api.removeMember(projectId, userId);
      showToast('Member removed', 'success');
      await loadProject();
    } catch (err) { showToast(err.message, 'error'); }
  };

  function openAddTaskModal(boardId = null) {
    const boardSel = document.getElementById('taskBoard');
    boardSel.innerHTML = boards.map(b => `<option value="${b.id}" ${b.id==boardId?'selected':''}>${b.name}</option>`).join('');
    const assignSel = document.getElementById('taskAssignee');
    assignSel.innerHTML = '<option value="">Unassigned</option>' + 
      allSystemUsers.map(u => `<option value="${u.id}">${u.username} (${u.email})</option>`).join('');
    openModal('addTaskModal');
  }

  function populateMemberSelects() {
    const filterSel = document.getElementById('filterAssignee');
    if (filterSel) {
      filterSel.innerHTML = '<option value="">All Assignees</option>' + members.map(m => `<option value="${m.id}">${m.username}</option>`).join('');
    }
  }

  // ===== WEBSOCKET EVENTS =====
  function bindWebSocketEvents() {
    WsClient.on('TASK_CREATED', async () => { await loadTasks(); renderCurrentTab(); });
    WsClient.on('TASK_UPDATED', async () => { await loadTasks(); renderCurrentTab(); });
    WsClient.on('TASK_DELETED', async () => { await loadTasks(); renderCurrentTab(); });
    WsClient.on('BOARD_CREATED', async () => { const d = await Api.getProject(projectId); boards = d.boards; renderCurrentTab(); });
    WsClient.on('BOARD_DELETED', async () => { const d = await Api.getProject(projectId); boards = d.boards; await loadTasks(); renderCurrentTab(); });
    WsClient.on('COMMENT_ADDED', async (msg) => {
      if (activeTaskId && msg.taskId == activeTaskId) {
        const { task, comments } = await Api.getTask(projectId, activeTaskId);
        renderComments(comments, activeTaskId);
      }
    });
    WsClient.on('COMMENT_UPDATED', async (msg) => {
      if (activeTaskId && msg.taskId == activeTaskId) {
        const { comments } = await Api.getTask(projectId, activeTaskId);
        renderComments(comments, activeTaskId);
      }
    });
    WsClient.on('COMMENT_LIKED', async (msg) => {
      if (activeTaskId && msg.taskId == activeTaskId) {
        // Find the comment and update its like count without full re-render if possible
        // But for simplicity and threading consistency, full fetch is safer
        const { comments } = await Api.getTask(projectId, activeTaskId);
        renderComments(comments, activeTaskId);
      }
    });
    WsClient.on('COMMENT_DELETED', async (msg) => {
      if (activeTaskId && msg.taskId == activeTaskId) {
        const { comments } = await Api.getTask(projectId, activeTaskId);
        renderComments(comments, activeTaskId);
      }
    });
  }

  // ===== HELPERS =====
  function getUserColorById(id) {
    const m = members.find(m => m.id === id);
    if (m) return getUserColor(m);
    const colors = ['#6366f1','#8b5cf6','#ec4899','#f59e0b','#10b981','#3b82f6'];
    return colors[(id || 0) % colors.length];
  }

  function getPriorityBadgeClass(p) {
    return { urgent:'badge-danger', high:'badge-warning', medium:'badge-info', low:'badge-success' }[p] || 'badge-secondary';
  }

  function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }
  // ===== COMMENT ACTIONS =====
  window.deleteCommentAction = async (id) => {
    if (!confirm('Delete comment?')) return;
    try {
      await Api.deleteComment(projectId, activeTaskId, id);
      showToast('Comment deleted');
      const { comments } = await Api.getTask(projectId, activeTaskId);
      renderComments(comments, activeTaskId);
    } catch (err) { showToast(err.message, 'error'); }
  };

  window.editCommentAction = async (id) => {
    const textEl = document.getElementById(`comment-text-${id}`);
    const originalContent = textEl.innerText;
    const newContent = prompt('Edit your comment:', originalContent);
    if (newContent !== null && newContent.trim() !== '' && newContent !== originalContent) {
      try {
        await Api.editComment(projectId, activeTaskId, id, newContent.trim());
        showToast('Comment updated');
        const { comments } = await Api.getTask(projectId, activeTaskId);
        renderComments(comments, activeTaskId);
      } catch (err) { showToast(err.message, 'error'); }
    }
  };

  window.toggleLikeAction = async (commentId) => {
    try {
      await Api.likeComment(projectId, activeTaskId, commentId);
      const { comments } = await Api.getTask(projectId, activeTaskId);
      renderComments(comments, activeTaskId);
    } catch (err) { showToast(err.message, 'error'); }
  };

  window.setReplyTo = (id, username) => setReplyTo(id, username);
  window.cancelReply = () => cancelReply();
})();

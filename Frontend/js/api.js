// ===== API WRAPPER =====
const API_BASE = 'http://localhost:4000/api';

const Api = {
  getToken() { return localStorage.getItem('tf_token'); },
  setToken(t) { localStorage.setItem('tf_token', t); },
  removeToken() { localStorage.removeItem('tf_token'); localStorage.removeItem('tf_user'); },

  headers() {
    const h = { 'Content-Type': 'application/json' };
    const t = this.getToken();
    if (t) h['Authorization'] = `Bearer ${t}`;
    return h;
  },

  async request(method, path, body = null) {
    const opts = { method, headers: this.headers() };
    if (body) opts.body = JSON.stringify(body);
    try {
      const res = await fetch(`${API_BASE}${path}`, opts);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      return data;
    } catch (err) {
      if (err.message === 'Failed to fetch') throw new Error('Cannot connect to server. Make sure the backend is running.');
      if (err.message === 'User not found' || err.message === 'Invalid or expired token') {
        this.removeToken();
        // Smarter redirect to root index.html
        if (window.location.pathname.includes('/pages/')) {
          window.location.href = '../index.html';
        } else if (!window.location.pathname.endsWith('index.html') && window.location.pathname !== '/') {
          window.location.href = 'index.html';
        }
      }
      throw err;
    }
  },

  get(path) { return this.request('GET', path); },
  post(path, body) { return this.request('POST', path, body); },
  put(path, body) { return this.request('PUT', path, body); },
  delete(path) { return this.request('DELETE', path); },

  // Auth
  login(email, password) { return this.post('/auth/login', { email, password }); },
  register(username, email, password) { return this.post('/auth/register', { username, email, password }); },
  getMe() { return this.get('/auth/me'); },
  updateProfile(data) { return this.put('/auth/profile', data); },

  // Projects
  getProjects() { return this.get('/projects'); },
  createProject(data) { return this.post('/projects', data); },
  getProject(id) { return this.get(`/projects/${id}`); },
  updateProject(id, data) { return this.put(`/projects/${id}`, data); },
  deleteProject(id) { return this.delete(`/projects/${id}`); },
  getMyTasks() { return this.get('/my-tasks'); },
  getProjectActivity(id) { return this.get(`/projects/${id}/activity`); },

  // Members
  addMember(projectId, email, role) { return this.post(`/projects/${projectId}/members`, { email, role }); },
  removeMember(projectId, userId) { return this.delete(`/projects/${projectId}/members/${userId}`); },

  // Boards
  getBoards(projectId) { return this.get(`/projects/${projectId}/boards`); },
  createBoard(projectId, data) { return this.post(`/projects/${projectId}/boards`, data); },
  updateBoard(projectId, boardId, data) { return this.put(`/projects/${projectId}/boards/${boardId}`, data); },
  deleteBoard(projectId, boardId) { return this.delete(`/projects/${projectId}/boards/${boardId}`); },

  // Tasks
  getTasks(projectId, params = {}) {
    const q = new URLSearchParams(params).toString();
    return this.get(`/projects/${projectId}/tasks${q ? '?' + q : ''}`);
  },
  createTask(projectId, data) { return this.post(`/projects/${projectId}/tasks`, data); },
  getTask(projectId, taskId) { return this.get(`/projects/${projectId}/tasks/${taskId}`); },
  updateTask(projectId, taskId, data) { return this.put(`/projects/${projectId}/tasks/${taskId}`, data); },
  deleteTask(projectId, taskId) { return this.delete(`/projects/${projectId}/tasks/${taskId}`); },

  // Comments
  addComment(projectId, taskId, content) { return this.post(`/projects/${projectId}/tasks/${taskId}/comments`, { content }); },
  editComment(projectId, taskId, commentId, content) { return this.put(`/projects/${projectId}/tasks/${taskId}/comments/${commentId}`, { content }); },
  deleteComment(projectId, taskId, commentId) { return this.delete(`/projects/${projectId}/tasks/${taskId}/comments/${commentId}`); },
  likeComment(projectId, taskId, commentId) { return this.post(`/projects/${projectId}/tasks/${taskId}/comments/${commentId}/like`); },

  // Notifications
  getNotifications() { return this.get('/notifications'); },
  markNotifRead(id) { return this.put(`/notifications/${id}/read`); },
  markAllNotifsRead() { return this.put('/notifications/read-all'); },
  deleteNotif(id) { return this.delete(`/notifications/${id}`); },
  clearAllNotifs() { return this.delete('/notifications'); },

  // Users
  getUsers() { return this.get('/users'); },
  searchUsers(q) { return this.get(`/users/search?q=${encodeURIComponent(q)}`); },
  globalSearch(q) { return this.get(`/search?q=${encodeURIComponent(q)}`); },
};

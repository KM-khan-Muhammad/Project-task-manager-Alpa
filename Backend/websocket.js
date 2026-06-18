const WebSocket = require('ws');
const jwt = require('jsonwebtoken');
const db = require('./database').getDb();
const { JWT_SECRET } = require('./middleware/auth');

let wss = null;
// Map: userId -> Set of ws clients
const userConnections = new Map();
// Map: projectId -> Set of userIds
const projectSubscriptions = new Map();

function initWebSocket(server) {
  wss = new WebSocket.Server({ server, path: '/ws' });

  wss.on('connection', (ws, req) => {
    const urlParams = new URL(req.url, 'http://localhost');
    const token = urlParams.searchParams.get('token');

    if (!token) { ws.close(4001, 'Unauthorized'); return; }

    let userId;
    try {
      const decoded = jwt.verify(token, JWT_SECRET);
      userId = decoded.userId;
    } catch {
      ws.close(4001, 'Invalid token'); return;
    }

    // Register connection
    ws.userId = userId;
    if (!userConnections.has(userId)) userConnections.set(userId, new Set());
    userConnections.get(userId).add(ws);

    console.log(`🔌 WS connected: user ${userId} (total: ${wss.clients.size})`);

    // Send welcome
    ws.send(JSON.stringify({ type: 'CONNECTED', message: 'WebSocket connected', userId }));

    ws.on('message', (raw) => {
      try {
        const msg = JSON.parse(raw);
        handleClientMessage(ws, userId, msg);
      } catch (e) {
        ws.send(JSON.stringify({ type: 'ERROR', message: 'Invalid message format' }));
      }
    });

    ws.on('close', () => {
      // Cleanup
      userConnections.get(userId)?.delete(ws);
      if (userConnections.get(userId)?.size === 0) userConnections.delete(userId);

      // Remove from all project subscriptions
      projectSubscriptions.forEach((users, pid) => {
        users.delete(userId);
        if (users.size === 0) projectSubscriptions.delete(pid);
      });
      console.log(`🔌 WS disconnected: user ${userId}`);
    });

    ws.on('error', (err) => console.error('WS error:', err.message));
  });

  console.log('🚀 WebSocket server initialized');
  return wss;
}

function handleClientMessage(ws, userId, msg) {
  switch (msg.type) {
    case 'SUBSCRIBE_PROJECT':
      if (msg.projectId) {
        // Verify membership
        const member = db.prepare('SELECT id FROM project_members WHERE project_id = ? AND user_id = ?').get(msg.projectId, userId);
        if (member) {
          if (!projectSubscriptions.has(msg.projectId)) projectSubscriptions.set(msg.projectId, new Set());
          projectSubscriptions.get(msg.projectId).add(userId);
          ws.send(JSON.stringify({ type: 'SUBSCRIBED', projectId: msg.projectId }));
        }
      }
      break;

    case 'UNSUBSCRIBE_PROJECT':
      if (msg.projectId) {
        projectSubscriptions.get(msg.projectId)?.delete(userId);
        ws.send(JSON.stringify({ type: 'UNSUBSCRIBED', projectId: msg.projectId }));
      }
      break;

    case 'PING':
      ws.send(JSON.stringify({ type: 'PONG', timestamp: Date.now() }));
      break;

    default:
      break;
  }
}

// Broadcast to all members of a project
function broadcastToProject(projectId, data, excludeUserId = null) {
  const subscribers = projectSubscriptions.get(parseInt(projectId)) || new Set();
  const payload = JSON.stringify(data);

  subscribers.forEach(uid => {
    if (uid === excludeUserId) return;
    const conns = userConnections.get(uid);
    conns?.forEach(ws => {
      if (ws.readyState === WebSocket.OPEN) ws.send(payload);
    });
  });
}

// Send to specific user
function sendToUser(userId, data) {
  const conns = userConnections.get(userId);
  if (!conns) return;
  const payload = JSON.stringify(data);
  conns.forEach(ws => {
    if (ws.readyState === WebSocket.OPEN) ws.send(payload);
  });
}

// Create a notification and push in real-time
function createNotification(userId, type, title, message, data = {}) {
  try {
    const result = db.prepare(
      'INSERT INTO notifications (user_id, type, title, message, data) VALUES (?, ?, ?, ?, ?)'
    ).run(userId, type, title, message, JSON.stringify(data));

    const notification = db.prepare('SELECT * FROM notifications WHERE id = ?').get(result.lastInsertRowid);
    sendToUser(userId, { type: 'NEW_NOTIFICATION', notification });

    return notification;
  } catch (err) {
    console.error('Notification error:', err.message);
  }
}

module.exports = { initWebSocket, broadcastToProject, sendToUser, createNotification };

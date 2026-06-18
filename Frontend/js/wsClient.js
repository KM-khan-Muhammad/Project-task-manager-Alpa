// ===== WEBSOCKET CLIENT =====
const WsClient = (() => {
  let ws = null;
  let reconnectTimer = null;
  let pingInterval = null;
  let handlers = {};
  let subscribedProjects = new Set();
  let isConnecting = false;

  function connect() {
    const token = Api.getToken();
    if (!token || isConnecting) return;
    if (ws && ws.readyState === WebSocket.OPEN) return;
    isConnecting = true;

    const url = `ws://localhost:4000/ws?token=${token}`;
    ws = new WebSocket(url);

    ws.onopen = () => {
      isConnecting = false;
      console.log('🔌 WebSocket connected');
      clearTimeout(reconnectTimer);

      // Re-subscribe to projects
      subscribedProjects.forEach(pid => subscribeProject(pid));

      // Heartbeat
      pingInterval = setInterval(() => {
        if (ws && ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: 'PING' }));
        }
      }, 30000);

      trigger('connected');
    };

    ws.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data);
        trigger(msg.type, msg);
        trigger('*', msg); // wildcard
      } catch {}
    };

    ws.onclose = (e) => {
      isConnecting = false;
      clearInterval(pingInterval);
      console.log('🔌 WebSocket disconnected, reconnecting...');
      trigger('disconnected');
      if (e.code !== 4001) {
        reconnectTimer = setTimeout(connect, 3000);
      }
    };

    ws.onerror = () => { isConnecting = false; };
  }

  function disconnect() {
    clearTimeout(reconnectTimer);
    clearInterval(pingInterval);
    if (ws) { ws.close(); ws = null; }
  }

  function subscribeProject(projectId) {
    subscribedProjects.add(projectId);
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'SUBSCRIBE_PROJECT', projectId }));
    }
  }

  function unsubscribeProject(projectId) {
    subscribedProjects.delete(projectId);
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'UNSUBSCRIBE_PROJECT', projectId }));
    }
  }

  function on(eventType, handler) {
    if (!handlers[eventType]) handlers[eventType] = [];
    handlers[eventType].push(handler);
    return () => off(eventType, handler);
  }

  function off(eventType, handler) {
    if (handlers[eventType]) {
      handlers[eventType] = handlers[eventType].filter(h => h !== handler);
    }
  }

  function trigger(eventType, data) {
    (handlers[eventType] || []).forEach(h => { try { h(data); } catch {} });
  }

  return { connect, disconnect, subscribeProject, unsubscribeProject, on, off };
})();

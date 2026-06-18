const express = require('express');
const cors = require('cors');
const path = require('path');
const http = require('http');

// Initialize DB wrapper
const { initDatabase } = require('./database');

async function startServer() {
  try {
    // Wait for database to initialize
    await initDatabase();
    const db = require('./database').getDb();

    const app = express();
    const server = http.createServer(app);

    // Init WebSocket
    const { initWebSocket } = require('./websocket');
    initWebSocket(server);

    // Middleware
    app.use(cors({
      origin: ['http://localhost:3000', 'http://127.0.0.1:3000', 'http://localhost:5500', 'http://127.0.0.1:5500', 'null'],
      credentials: true
    }));
    app.use(express.json({ limit: '10mb' }));
    app.use(express.urlencoded({ extended: true }));

    // Serve frontend static files
    app.use(express.static(path.join(__dirname, '../Frontend')));

    // Routes - Require these AFTER database is initialized
    const authRoutes = require('./routes/auth');
    const projectRoutes = require('./routes/projects');
    const boardRoutes = require('./routes/boards');
    const taskRoutes = require('./routes/tasks');
    const commentRoutes = require('./routes/comments');
    const notificationRoutes = require('./routes/notifications');
    const userRoutes = require('./routes/users');
    const userTaskRoutes = require('./routes/userTasks');
    const searchRoutes = require('./routes/search');

    app.use('/api/auth', authRoutes);
    app.use('/api/projects', projectRoutes);
    app.use('/api/projects/:projectId/boards', boardRoutes);
    app.use('/api/projects/:projectId/tasks', taskRoutes);
    app.use('/api/projects/:projectId/tasks/:taskId/comments', commentRoutes);
    app.use('/api/notifications', notificationRoutes);
    app.use('/api/users', userRoutes);
    app.use('/api/my-tasks', userTaskRoutes);
    app.use('/api/search', searchRoutes);

    // Health check
    app.get('/api/health', (req, res) => {
      res.json({ status: 'ok', timestamp: new Date().toISOString(), version: '1.0.0' });
    });

    // Serve frontend for any non-API routes (SPA fallback)
    app.get('*', (req, res) => {
      if (!req.path.startsWith('/api')) {
        res.sendFile(path.join(__dirname, '../Frontend/index.html'));
      } else {
        res.status(404).json({ error: 'Route not found' });
      }
    });

    // Error handler
    app.use((err, req, res, next) => {
      console.error('❌ Error:', err.stack);
      res.status(500).json({ error: 'Internal server error', details: err.message });
    });

    const PORT = process.env.PORT || 4000;
    server.listen(PORT, () => {
      console.log(`\n🚀 TaskFlow Server running on http://localhost:${PORT}`);
      console.log(`📡 WebSocket available at ws://localhost:${PORT}/ws`);
      console.log(`📁 Frontend served at http://localhost:${PORT}\n`);
    });

  } catch (error) {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  }
}

startServer();

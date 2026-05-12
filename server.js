const express = require('express');
const path = require('path');
const http = require('http');
const WebSocket = require('ws');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

const roomManager = require('./ws/room');

// 中间件
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// API 路由
app.use('/api/auth', require('./api/auth'));
app.use('/api/rooms', require('./api/room'));
app.use('/api/tasks', require('./api/task'));

// WebSocket
wss.on('connection', (ws, req) => {
  roomManager.handleConnection(ws, req);
});

// 首页
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`🍅 番茄Todo 服务器运行在 http://localhost:${PORT}`);
});

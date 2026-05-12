const WebSocket = require('ws');
const db = require('../db');
const jwt = require('jsonwebtoken');
const { JWT_SECRET } = require('../auth');

class RoomManager {
  constructor() {
    this.clients = new Map();
    this.heartbeatInterval = setInterval(() => this.checkHeartbeats(), 30000);
  }

  handleConnection(ws, req) {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const token = url.searchParams.get('token');

    if (!token) {
      ws.close(1008, '缺少Token');
      return;
    }

    try {
      const decoded = jwt.verify(token, JWT_SECRET);
      ws.userId = decoded.id;
      ws.isAlive = true;
      this.clients.set(ws, { userId: decoded.id, roomCode: null });

      ws.on('message', (data) => this.handleMessage(ws, data));
      ws.on('close', () => this.handleClose(ws));
      ws.on('pong', () => { ws.isAlive = true; });

      ws.send(JSON.stringify({ type: 'connected', userId: decoded.id }));
    } catch (err) {
      ws.close(1008, 'Token无效');
    }
  }

  handleMessage(ws, data) {
    try {
      const msg = JSON.parse(data);
      const client = this.clients.get(ws);
      if (!client) return;

      switch (msg.type) {
        case 'join_room': this.joinRoom(ws, msg.room_code); break;
        case 'status_update': this.updateStatus(ws, msg); break;
        case 'task_complete': this.broadcastTaskComplete(ws, msg); break;
        case 'heartbeat': ws.isAlive = true; break;
        case 'get_member_tasks': this.sendMemberTasks(ws, msg.user_id); break;
        case 'encourage': this.handleEncourage(ws, msg); break;
        case 'set_goal': this.handleSetGoal(ws, msg); break;
      }
    } catch (e) {
      console.error('WebSocket message error:', e);
    }
  }

  getRoomId(roomCode) {
    const room = db.rooms.findOne({ code: roomCode });
    return room ? room.id : null;
  }

  joinRoom(ws, roomCode) {
    const client = this.clients.get(ws);
    if (!client) return;
    client.roomCode = roomCode;

    const roomId = this.getRoomId(roomCode);
    if (!roomId) return;

    const existing = db.roomMembers.findOne({ room_id: roomId, user_id: ws.userId });
    if (existing) {
      db.roomMembers.updateWhere({ room_id: roomId, user_id: ws.userId }, { last_seen_at: db.now(), status: 'idle' });
    } else {
      db.roomMembers.insert({
        room_id: roomId, user_id: ws.userId,
        joined_at: db.now(), last_seen_at: db.now(), status: 'idle',
        time_left: 0, total_time: 0, today_focus_min: 0, current_task: '', goal: '', encouraged_count: 0,
      });
    }

    this.broadcastMembers(roomCode);
    this.broadcastRanking(roomCode);
    this.broadcastSystem(roomCode, '有人加入了自习室');
  }

  updateStatus(ws, msg) {
    const client = this.clients.get(ws);
    if (!client || !client.roomCode) return;

    const roomId = this.getRoomId(client.roomCode);
    if (!roomId) return;

    db.roomMembers.updateWhere({ room_id: roomId, user_id: ws.userId }, {
      status: msg.status,
      time_left: msg.time_left || 0,
      total_time: msg.total_time || 0,
      current_task: msg.current_task || '',
      last_seen_at: db.now(),
    });

    if (msg.status === 'focus_complete') {
      const member = db.roomMembers.findOne({ room_id: roomId, user_id: ws.userId });
      if (member) {
        db.roomMembers.updateWhere({ room_id: roomId, user_id: ws.userId }, {
          today_focus_min: (member.today_focus_min || 0) + (msg.duration || 25),
        });
      }

      if (msg.duration) {
        db.sessions.insert({
          user_id: ws.userId, room_id: roomId, mode: 'focus',
          duration_min: msg.duration, started_at: db.now(),
        });
      }

      this.updateUserStreak(ws.userId);

      this.broadcastActivity(client.roomCode, {
        type: 'focus_complete', user_id: ws.userId, message: '完成了一个专注时段',
      });
    }

    if (msg.status === 'focus') {
      this.broadcastActivity(client.roomCode, {
        type: 'focus_start', user_id: ws.userId, message: '开始了专注学习',
      });
    }

    this.broadcastMembers(client.roomCode);
    this.broadcastRanking(client.roomCode);
  }

  updateUserStreak(userId) {
    const today = db.today();
    const row = db.streaks.findOne({ user_id: userId });

    if (!row) {
      db.streaks.insert({
        user_id: userId, current_streak: 1, longest_streak: 1,
        last_study_date: today, total_focus_min: 0, total_sessions: 1,
      });
      return;
    }

    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = yesterday.toISOString().slice(0, 10);

    let newStreak = row.current_streak;
    if (row.last_study_date === today) {
      // Already studied today
    } else if (row.last_study_date === yesterdayStr) {
      newStreak = row.current_streak + 1;
    } else {
      newStreak = 1;
    }

    const longest = Math.max(row.longest_streak || 0, newStreak);
    db.streaks.updateWhere({ user_id: userId }, {
      current_streak: newStreak, longest_streak: longest,
      last_study_date: today,
      total_sessions: (row.total_sessions || 0) + 1,
    });
  }

  broadcastTaskComplete(ws, msg) {
    const client = this.clients.get(ws);
    if (!client || !client.roomCode) return;

    this.broadcastSystem(client.roomCode, '完成了一个任务');
    this.broadcastActivity(client.roomCode, {
      type: 'task_complete', user_id: ws.userId, message: '完成了一个待办任务',
    });
    this.broadcastMembers(client.roomCode);
  }

  handleEncourage(ws, msg) {
    const client = this.clients.get(ws);
    if (!client || !client.roomCode) return;

    const roomId = this.getRoomId(client.roomCode);
    if (!roomId) return;

    const member = db.roomMembers.findOne({ room_id: roomId, user_id: msg.target_user_id });
    if (member) {
      db.roomMembers.updateWhere({ room_id: roomId, user_id: msg.target_user_id }, {
        encouraged_count: (member.encouraged_count || 0) + 1,
      });
    }

    this.broadcast(client.roomCode, {
      type: 'encourage', from_user_id: ws.userId,
      target_user_id: msg.target_user_id, emoji: msg.emoji || '🔥',
    });
    this.broadcastMembers(client.roomCode);
  }

  handleSetGoal(ws, msg) {
    const client = this.clients.get(ws);
    if (!client || !client.roomCode) return;

    const roomId = this.getRoomId(client.roomCode);
    if (!roomId) return;

    db.roomMembers.updateWhere({ room_id: roomId, user_id: ws.userId }, { goal: msg.goal || '' });
    this.broadcastMembers(client.roomCode);
  }

  sendMemberTasks(ws, userId) {
    const client = this.clients.get(ws);
    if (!client || !client.roomCode) return;

    const all = db.tasks.findWhere({ user_id: Number(userId), date: db.today() });
    all.sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''));
    const simple = all.map(t => ({ id: t.id, name: t.name, done: t.done, pomos: t.pomos, target_pomos: t.target_pomos || 1 }));
    ws.send(JSON.stringify({ type: 'member_tasks', user_id: userId, tasks: simple }));
  }

  broadcastMembers(roomCode) {
    const roomId = this.getRoomId(roomCode);
    if (!roomId) return;

    const members = db.roomMembers.findWhere({ room_id: roomId });
    members.sort((a, b) => (b.last_seen_at || '').localeCompare(a.last_seen_at || ''));
    const enriched = members.map(m => {
      const user = db.users.findOne({ id: m.user_id });
      return { ...m, nickname: user?.nickname || '', avatar: user?.avatar || '😊' };
    });

    this.broadcast(roomCode, { type: 'members', data: enriched });
  }

  broadcastRanking(roomCode) {
    const roomId = this.getRoomId(roomCode);
    if (!roomId) return;

    const members = db.roomMembers.findWhere({ room_id: roomId });
    const ranking = members.map(m => {
      const user = db.users.findOne({ id: m.user_id });
      return { user_id: m.user_id, today_focus_min: m.today_focus_min || 0, nickname: user?.nickname || '', avatar: user?.avatar || '😊' };
    });
    ranking.sort((a, b) => b.today_focus_min - a.today_focus_min);

    this.broadcast(roomCode, { type: 'ranking', data: ranking });
  }

  broadcastSystem(roomCode, message) {
    this.broadcast(roomCode, { type: 'system', message });
  }

  broadcastActivity(roomCode, activity) {
    this.broadcast(roomCode, { type: 'activity', data: activity });
  }

  broadcast(roomCode, data) {
    const msg = JSON.stringify(data);
    for (const [ws, client] of this.clients) {
      if (client.roomCode === roomCode && ws.readyState === WebSocket.OPEN) {
        ws.send(msg);
      }
    }
  }

  handleClose(ws) {
    const client = this.clients.get(ws);
    if (client?.roomCode) {
      this.broadcastSystem(client.roomCode, '有人离开了自习室');
      this.broadcastMembers(client.roomCode);
    }
    this.clients.delete(ws);
  }

  checkHeartbeats() {
    for (const [ws, client] of this.clients) {
      if (!ws.isAlive) {
        ws.terminate();
        this.clients.delete(ws);
        if (client.roomCode) this.broadcastMembers(client.roomCode);
        continue;
      }
      ws.isAlive = false;
      ws.ping();
    }
  }
}

module.exports = new RoomManager();

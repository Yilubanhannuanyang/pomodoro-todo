const express = require('express');
const db = require('../db');
const { authMiddleware } = require('../auth');

const router = express.Router();

function generateCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

router.post('/', authMiddleware, (req, res) => {
  const { name, theme, max_members, is_public } = req.body;
  const maxMembers = Math.max(2, Math.min(50, parseInt(max_members) || 20));
  const isPublic = is_public === false ? 0 : 1;

  let code = generateCode();
  let tries = 0;
  while (db.rooms.findOne({ code }) && tries < 10) {
    code = generateCode();
    tries++;
  }

  try {
    const result = db.rooms.insert({
      code,
      name: name || '我的自习室',
      theme: theme || 'library',
      created_by: req.userId,
      max_members: maxMembers,
      is_public: isPublic,
      announcement: '',
      created_at: db.now(),
    });
    res.json({ id: result.lastInsertRowid, code, name: name || '我的自习室', theme: theme || 'library', max_members: maxMembers, is_public: isPublic });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

router.get('/', authMiddleware, (req, res) => {
  try {
    const publicRooms = db.rooms.findWhere({ is_public: 1 });
    const roomsWithCount = publicRooms.map(r => ({
      ...r,
      member_count: db.roomMembers.count({ room_id: r.id }),
    }));
    roomsWithCount.sort((a, b) => b.member_count - a.member_count);
    res.json({ rooms: roomsWithCount.slice(0, 50) });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

router.post('/join', authMiddleware, (req, res) => {
  const { code } = req.body;
  try {
    const room = db.rooms.findOne({ code });
    if (!room) return res.status(404).json({ error: '房间不存在' });

    const count = db.roomMembers.count({ room_id: room.id });
    const existing = db.roomMembers.findOne({ room_id: room.id, user_id: req.userId });

    if (!existing && count >= (room.max_members || 20)) {
      return res.status(403).json({ error: '房间已满员' });
    }

    if (existing) {
      db.roomMembers.updateWhere({ room_id: room.id, user_id: req.userId }, { last_seen_at: db.now() });
    } else {
      db.roomMembers.insert({
        room_id: room.id,
        user_id: req.userId,
        joined_at: db.now(),
        last_seen_at: db.now(),
        status: 'idle',
        time_left: 0,
        total_time: 0,
        today_focus_min: 0,
        current_task: '',
        goal: '',
        encouraged_count: 0,
      });
    }

    res.json({ room });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

router.get('/:code', authMiddleware, (req, res) => {
  const { code } = req.params;
  try {
    const room = db.rooms.findOne({ code });
    if (!room) return res.status(404).json({ error: '房间不存在' });

    const members = db.roomMembers.findWhere({ room_id: room.id });
    const enriched = members.map(m => {
      const user = db.users.findOne({ id: m.user_id });
      return { ...m, nickname: user?.nickname || '', avatar: user?.avatar || '😊' };
    });

    res.json({ room, members: enriched });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

router.patch('/:code', authMiddleware, (req, res) => {
  const { code } = req.params;
  const { name, announcement, max_members, is_public } = req.body;

  try {
    const room = db.rooms.findOne({ code });
    if (!room) return res.status(404).json({ error: '房间不存在' });
    if (room.created_by !== req.userId) return res.status(403).json({ error: '只有房主可以修改房间信息' });

    const updates = {};
    if (name !== undefined) updates.name = name;
    if (announcement !== undefined) updates.announcement = announcement;
    if (max_members !== undefined) updates.max_members = Math.max(2, Math.min(50, parseInt(max_members) || 20));
    if (is_public !== undefined) updates.is_public = is_public ? 1 : 0;

    if (Object.keys(updates).length === 0) return res.json({ room });

    db.rooms.updateWhere({ id: room.id }, updates);
    const updated = db.rooms.findOne({ id: room.id });
    res.json({ room: updated });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

router.delete('/:code', authMiddleware, (req, res) => {
  const { code } = req.params;
  try {
    const room = db.rooms.findOne({ code });
    if (!room) return res.status(404).json({ error: '房间不存在' });
    if (room.created_by !== req.userId) return res.status(403).json({ error: '只有房主可以解散房间' });

    db.roomMembers.removeWhere({ room_id: room.id });
    db.rooms.removeWhere({ id: room.id });
    res.json({ success: true });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

router.post('/:code/leave', authMiddleware, (req, res) => {
  const { code } = req.params;
  try {
    const room = db.rooms.findOne({ code });
    if (!room) return res.status(404).json({ error: '房间不存在' });

    db.roomMembers.removeWhere({ room_id: room.id, user_id: req.userId });
    res.json({ success: true });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

router.get('/:code/stats', authMiddleware, (req, res) => {
  const { code } = req.params;
  try {
    const room = db.rooms.findOne({ code });
    if (!room) return res.status(404).json({ error: '房间不存在' });

    const today = db.today();
    const allSessions = db.sessions.findWhere({ room_id: room.id });
    const todaySessions = allSessions.filter(s => (s.started_at || '').startsWith(today));

    const todayStats = {
      total_sessions: todaySessions.length,
      total_minutes: todaySessions.reduce((sum, s) => sum + (s.duration_min || 0), 0),
    };

    const userMap = {};
    for (const s of todaySessions) {
      if (!userMap[s.user_id]) {
        const user = db.users.findOne({ id: s.user_id });
        userMap[s.user_id] = { nickname: user?.nickname || '', avatar: user?.avatar || '😊', sessions: 0, minutes: 0 };
      }
      userMap[s.user_id].sessions++;
      userMap[s.user_id].minutes += (s.duration_min || 0);
    }
    const topUsers = Object.entries(userMap)
      .map(([uid, data]) => ({ user_id: Number(uid), ...data }))
      .sort((a, b) => b.minutes - a.minutes)
      .slice(0, 10);

    res.json({ today: todayStats, top_users: topUsers });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

module.exports = router;

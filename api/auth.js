const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('../db');
const { generateToken, authMiddleware } = require('../auth');

const router = express.Router();

router.post('/register', (req, res) => {
  const { username, password, nickname, avatar } = req.body;
  if (!username || !password || !nickname) {
    return res.status(400).json({ error: '请填写完整信息' });
  }

  if (db.users.findOne({ username })) {
    return res.status(409).json({ error: '用户名已存在' });
  }

  const passwordHash = bcrypt.hashSync(password, 10);

  try {
    const result = db.users.insert({
      username,
      password_hash: passwordHash,
      nickname,
      avatar: avatar || '😊',
      created_at: db.now(),
    });

    const user = { id: result.lastInsertRowid, username, nickname, avatar: avatar || '😊' };
    const token = generateToken(user);
    res.json({ token, user });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

router.get('/streak', authMiddleware, (req, res) => {
  const streak = db.streaks.findOne({ user_id: req.userId });
  res.json(streak || { current_streak: 0, longest_streak: 0, total_focus_min: 0, total_sessions: 0 });
});

router.post('/login', (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: '请填写账号和密码' });
  }

  const user = db.users.findOne({ username });
  if (!user) return res.status(401).json({ error: '账号或密码错误' });

  const valid = bcrypt.compareSync(password, user.password_hash);
  if (!valid) return res.status(401).json({ error: '账号或密码错误' });

  const token = generateToken(user);
  res.json({
    token,
    user: {
      id: user.id,
      username: user.username,
      nickname: user.nickname,
      avatar: user.avatar,
    },
  });
});

router.get('/me', authMiddleware, (req, res) => {
  const user = db.users.findOne({ id: req.userId });
  if (!user) return res.status(404).json({ error: '用户不存在' });
  const { password_hash, ...safe } = user;
  res.json(safe);
});

module.exports = router;

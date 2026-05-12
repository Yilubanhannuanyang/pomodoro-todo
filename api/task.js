const express = require('express');
const db = require('../db');
const { authMiddleware } = require('../auth');

const router = express.Router();

router.get('/', authMiddleware, (req, res) => {
  const all = db.tasks.findWhere({ user_id: req.userId, date: db.today() });
  all.sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''));
  res.json(all);
});

router.post('/', authMiddleware, (req, res) => {
  const { name, group_name, target_pomos } = req.body;
  if (!name) return res.status(400).json({ error: '任务名称不能为空' });

  try {
    const result = db.tasks.insert({
      user_id: req.userId,
      name,
      group_name: group_name || '默认',
      target_pomos: Math.max(1, parseInt(target_pomos) || 1),
      done: 0,
      pomos: 0,
      created_at: db.now(),
      date: db.today(),
    });
    res.json({
      id: result.lastInsertRowid, name, done: 0, pomos: 0,
      group_name: group_name || '默认',
      target_pomos: Math.max(1, parseInt(target_pomos) || 1),
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

router.patch('/:id', authMiddleware, (req, res) => {
  const { id } = req.params;
  const { done, pomos } = req.body;

  const task = db.tasks.findOne({ id: Number(id), user_id: req.userId });
  if (!task) return res.status(404).json({ error: '任务不存在' });

  const updates = {};
  if (done !== undefined) {
    updates.done = done ? 1 : 0;
    if (done) updates.completed_at = db.now();
  }
  if (pomos !== undefined) updates.pomos = pomos;
  if (group_name !== undefined) updates.group_name = group_name;
  if (target_pomos !== undefined) updates.target_pomos = Math.max(1, parseInt(target_pomos) || 1);

  if (Object.keys(updates).length === 0) return res.status(400).json({ error: '无更新内容' });

  try {
    db.tasks.updateWhere({ id: Number(id), user_id: req.userId }, updates);
    res.json({ success: true });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

router.delete('/:id', authMiddleware, (req, res) => {
  const { id } = req.params;
  const result = db.tasks.removeWhere({ id: Number(id), user_id: req.userId });
  if (result.changes === 0) return res.status(404).json({ error: '任务不存在' });
  res.json({ success: true });
});

router.get('/user/:userId', authMiddleware, (req, res) => {
  const { userId } = req.params;
  const all = db.tasks.findWhere({ user_id: Number(userId), date: db.today() });
  all.sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''));
  res.json(all.map(t => ({ id: t.id, name: t.name, done: t.done, pomos: t.pomos })));
});

// Get distinct groups for current user
router.get('/groups', authMiddleware, (req, res) => {
  const all = db.tasks.findWhere({ user_id: req.userId, date: db.today() });
  const groups = [...new Set(all.map(t => t.group_name || '默认'))];
  res.json(groups);
});

module.exports = router;

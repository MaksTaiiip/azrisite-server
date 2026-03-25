const express = require('express');
const jwt = require('jsonwebtoken');
const db = require('../db');
const router = express.Router();

// Middleware: перевірка токена гравця (для сайту)
function authUser(req, res, next) {
  const token = req.headers.authorization?.split(' ')[1];
  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: 'Не авторизований' });
  }
}

// Middleware: перевірка секрету плагіну (для Minecraft)
function authPlugin(req, res, next) {
  if (req.headers['x-plugin-secret'] !== process.env.PLUGIN_SECRET) {
    return res.status(403).json({ error: 'Заборонено' });
  }
  next();
}

// ← ПЛАГІН ВИКЛИКАЄ ЦЕЙ МАРШРУТ коли гравець ламає блок
router.post('/block-break', authPlugin, async (req, res) => {
  console.log('Отримано запит від плагіну:', req.body); // ← додай цей рядок
  const { minecraft_uuid, block_type } = req.body;

  // Знаходимо гравця за UUID
  const [users] = await db.execute(
    'SELECT id FROM users WHERE minecraft_uuid = ?', [minecraft_uuid]
  );
  if (!users.length) return res.json({ success: false, reason: 'not_linked' });

  const userId = users[0].id;

  // Знаходимо всі активні квести для цього типу блоку
  const [quests] = await db.execute(
    'SELECT * FROM quests WHERE block_type = ?', [block_type]
  );

  const rewards = [];

  for (const quest of quests) {
    // Створюємо або оновлюємо прогрес
    await db.execute(`
      INSERT INTO quest_progress (user_id, quest_id, current_count)
      VALUES (?, ?, 1)
      ON DUPLICATE KEY UPDATE
        current_count = IF(completed, current_count, current_count + 1)
    `, [userId, quest.id]);

    // Перевіряємо чи виконано
    const [progress] = await db.execute(
      'SELECT * FROM quest_progress WHERE user_id = ? AND quest_id = ?',
      [userId, quest.id]
    );

    const p = progress[0];
    if (!p.completed && p.current_count >= quest.required_count) {
      // Відмічаємо як виконане
      await db.execute(`
        UPDATE quest_progress
        SET completed = TRUE, completed_at = NOW()
        WHERE user_id = ? AND quest_id = ?
      `, [userId, quest.id]);

      // Повертаємо команду нагороди для плагіну
      rewards.push(quest.reward_command);
    }
  }

  res.json({ success: true, rewards });
});

// Гравець на сайті бачить свої квести
router.get('/my', authUser, async (req, res) => {
  const [rows] = await db.execute(`
    SELECT q.name, q.description, q.required_count,
           COALESCE(qp.current_count, 0) AS current_count,
           COALESCE(qp.completed, FALSE) AS completed,
           qp.completed_at
    FROM quests q
    LEFT JOIN quest_progress qp
      ON qp.quest_id = q.id AND qp.user_id = ?
    ORDER BY q.id
  `, [req.user.userId]);

  res.json(rows);
});

module.exports = router;
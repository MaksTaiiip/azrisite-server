const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const db = require('../db');
const router = express.Router();

// Реєстрація
router.post('/register', async (req, res) => {
  const { username, password } = req.body;
  try {
    const hash = await bcrypt.hash(password, 10);
    await db.execute(
      'INSERT INTO users (username, password_hash) VALUES (?, ?)',
      [username, hash]
    );
    res.json({ success: true, message: 'Акаунт створено' });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(400).json({ error: 'Такий нікнейм вже існує' });
    }
    res.status(500).json({ error: 'Помилка сервера' });
  }
});

// Логін
router.post('/login', async (req, res) => {
  const { username, password } = req.body;
  const [rows] = await db.execute(
    'SELECT * FROM users WHERE username = ?', [username]
  );
  if (!rows.length) return res.status(401).json({ error: 'Невірний логін або пароль' });

  const user = rows[0];
  const valid = await bcrypt.compare(password, user.password_hash);
  if (!valid) return res.status(401).json({ error: 'Невірний логін або пароль' });

  const token = jwt.sign({ userId: user.id }, process.env.JWT_SECRET, { expiresIn: '7d' });
  res.json({ token, username: user.username });
});

// Прив'язати Minecraft UUID до акаунту
// Отримати UUID по нікнейму через Mojang API
router.post('/link-minecraft-username', async (req, res) => {
  const { token, minecraft_username } = req.body;
  try {
    const { userId } = jwt.verify(token, process.env.JWT_SECRET);
    
    // Запитуємо UUID у Mojang
    const mojang = await fetch(
      `https://api.mojang.com/users/profiles/minecraft/${minecraft_username}`
    );
    if (!mojang.ok) return res.status(404).json({ error: 'Гравець не знайдений' });
    
    const { id: uuid } = await mojang.json();
    // Mojang повертає uuid без дефісів, форматуємо
    const formatted = `${uuid.slice(0,8)}-${uuid.slice(8,12)}-${uuid.slice(12,16)}-${uuid.slice(16,20)}-${uuid.slice(20)}`;
    
    await db.execute('UPDATE users SET minecraft_uuid = ? WHERE id = ?', [formatted, userId]);
    res.json({ success: true, uuid: formatted });
  } catch {
    res.status(401).json({ error: 'Невалідний токен' });
  }
});

module.exports = router;
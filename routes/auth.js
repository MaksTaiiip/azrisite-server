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

    // Перевіряємо чи гравець вже є в minecraft_players
    const [mcPlayers] = await db.execute(
      'SELECT uuid FROM minecraft_players WHERE username = ?',
      [username]
    );
    const minecraft_uuid = mcPlayers.length ? mcPlayers[0].uuid : null;

    // Створюємо акаунт і одразу прив'язуємо UUID якщо є
    await db.execute(
      'INSERT INTO users (username, password_hash, minecraft_uuid) VALUES (?, ?, ?)',
      [username, hash, minecraft_uuid]
    );

    res.json({
      success: true,
      message: minecraft_uuid
        ? 'Акаунт створено і Minecraft прив\'язано автоматично!'
        : 'Акаунт створено'
    });
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
router.post('/player-join', async (req, res) => {
  const { minecraft_uuid, minecraft_username, plugin_secret } = req.body;

  if (plugin_secret !== process.env.PLUGIN_SECRET) {
    return res.status(403).json({ error: 'Заборонено' });
  }

  try {
    // Зберігаємо гравця в таблиці minecraft_players
    await db.execute(`
      INSERT INTO minecraft_players (uuid, username, last_seen)
      VALUES (?, ?, NOW())
      ON DUPLICATE KEY UPDATE username = ?, last_seen = NOW()
    `, [minecraft_uuid, minecraft_username, minecraft_username]);

    // Автоматично прив'язуємо UUID до акаунту на сайті якщо нікнейми збігаються
    await db.execute(`
      UPDATE users SET minecraft_uuid = ?
      WHERE username = ? AND minecraft_uuid IS NULL
    `, [minecraft_uuid, minecraft_username]);

    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Помилка сервера' });
  }
});


// Перевірити статус прив'язки
router.get('/minecraft-status', async (req, res) => {
  const token = req.headers.authorization?.split(' ')[1];
  try {
    const { userId } = jwt.verify(token, process.env.JWT_SECRET);
    const [rows] = await db.execute(
      'SELECT minecraft_uuid FROM users WHERE id = ?', [userId]
    );
    const linked = !!(rows[0]?.minecraft_uuid);
    res.json({ linked, uuid: rows[0]?.minecraft_uuid || null });
  } catch {
    res.status(401).json({ error: 'Не авторизований' });
  }
});

module.exports = router;
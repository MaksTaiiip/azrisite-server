const express = require('express');
const jwt = require('jsonwebtoken');
const db = require('../db');
const router = express.Router();

function authUser(req, res, next) {
  const token = req.headers.authorization?.split(' ')[1];
  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: 'Не авторизований' });
  }
}

// Публічний профіль по нікнейму
router.get('/:username', async (req, res) => {
  const { username } = req.params;

  const [users] = await db.execute(
    'SELECT id, username, avatar_url, banner_url, bio, minecraft_uuid, featured_items, created_at FROM users WHERE username = ?',
    [username]
  );
  if (!users.length) return res.status(404).json({ error: 'Користувач не знайдений' });

  const user = users[0];

  // Бейджики
  const [badges] = await db.execute(`
    SELECT b.slug, b.name, b.description, b.icon, b.color
    FROM user_badges ub
    JOIN badges b ON b.id = ub.badge_id
    WHERE ub.user_id = ?
    ORDER BY ub.obtained_at ASC
  `, [user.id]);

  // Предмети на показ
  let featuredItems = [];
  if (user.featured_items) {
    const ids = JSON.parse(user.featured_items);
    if (ids.length) {
      const placeholders = ids.map(() => '?').join(',');
      const [items] = await db.execute(
        `SELECT i.slug, i.name, i.image_url, i.rarity
         FROM user_items ui
         JOIN items i ON i.id = ui.item_id
         WHERE ui.user_id = ? AND i.id IN (${placeholders})`,
        [user.id, ...ids]
      );
      featuredItems = items;
    }
  }

  // Статус
  const status = user.minecraft_uuid ? 'player' : 'guest';

  res.json({
    username: user.username,
    avatar_url: user.avatar_url,
    banner_url: user.banner_url,
    bio: user.bio,
    status,
    badges,
    featuredItems,
    created_at: user.created_at
  });
});

// Оновити свій профіль
router.put('/me/update', authUser, async (req, res) => {
  const { avatar_url, banner_url, bio, featured_items } = req.body;

  // Обмеження bio
  if (bio && bio.length > 255) {
    return res.status(400).json({ error: 'Bio занадто довге (макс. 255 символів)' });
  }

  // featured_items — максимум 4 предмети
  if (featured_items && featured_items.length > 4) {
    return res.status(400).json({ error: 'Можна виставити максимум 4 предмети' });
  }

  await db.execute(`
    UPDATE users
    SET avatar_url = ?, banner_url = ?, bio = ?, featured_items = ?
    WHERE id = ?
  `, [
    avatar_url || null,
    banner_url || null,
    bio || null,
    featured_items ? JSON.stringify(featured_items) : null,
    req.user.userId
  ]);

  res.json({ success: true });
});

// Отримати свої дані для редагування
router.get('/me/edit', authUser, async (req, res) => {
  const [rows] = await db.execute(
    'SELECT username, avatar_url, banner_url, bio, featured_items FROM users WHERE id = ?',
    [req.user.userId]
  );
  if (!rows.length) return res.status(404).json({ error: 'Не знайдено' });
  const u = rows[0];
  u.featured_items = u.featured_items ? JSON.parse(u.featured_items) : [];
  res.json(u);
});

module.exports = router;
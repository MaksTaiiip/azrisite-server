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

// Публічний профіль
router.get('/user/:username', async (req, res) => {
  const [users] = await db.execute(`
    SELECT
      u.id, u.username, u.bio, u.minecraft_uuid, u.featured_items, u.created_at,
      av.image_url AS avatar_url,
      bg.image_url AS banner_url,
      bg.cosmetic_type AS banner_type
    FROM users u
    LEFT JOIN items av ON av.id = u.avatar_item_id
    LEFT JOIN items bg ON bg.id = u.banner_item_id
    WHERE u.username = ?
  `, [req.params.username]);

  if (!users.length) return res.status(404).json({ error: 'Не знайдено' });
  const user = users[0];

  const [badges] = await db.execute(`
    SELECT b.slug, b.name, b.description, b.icon, b.color
    FROM user_badges ub JOIN badges b ON b.id = ub.badge_id
    WHERE ub.user_id = ? ORDER BY ub.obtained_at ASC
  `, [user.id]);

  let featuredItems = [];
  if (user.featured_items) {
    const ids = JSON.parse(user.featured_items);
    if (ids.length) {
      const ph = ids.map(() => '?').join(',');
      const [items] = await db.execute(
        `SELECT i.slug, i.name, i.image_url, i.rarity
         FROM user_items ui JOIN items i ON i.id = ui.item_id
         WHERE ui.user_id = ? AND i.id IN (${ph})`,
        [user.id, ...ids]
      );
      featuredItems = items;
    }
  }

  res.json({
    username: user.username,
    avatar_url: user.avatar_url,
    banner_url: user.banner_url,
    banner_is_photo: user.banner_type === 'background',
    bio: user.bio,
    status: user.minecraft_uuid ? 'player' : 'guest',
    badges,
    featuredItems,
    created_at: user.created_at
  });
});

// Дані для редагування
router.get('/me/edit', authUser, async (req, res) => {
  const [rows] = await db.execute(
    'SELECT username, bio, avatar_item_id, banner_item_id, featured_items FROM users WHERE id = ?',
    [req.user.userId]
  );
  if (!rows.length) return res.status(404).json({ error: 'Не знайдено' });
  const u = rows[0];
  u.featured_items = u.featured_items ? JSON.parse(u.featured_items) : [];
  res.json(u);
});

// Аватарки гравця
router.get('/me/avatars', authUser, async (req, res) => {
  const [items] = await db.execute(`
    SELECT i.id, i.slug, i.name, i.image_url, i.rarity
    FROM user_items ui JOIN items i ON i.id = ui.item_id
    WHERE ui.user_id = ? AND i.category = 'avatar'
  `, [req.user.userId]);
  res.json(items);
});

// Фони гравця
router.get('/me/backgrounds', authUser, async (req, res) => {
  const [items] = await db.execute(`
    SELECT i.id, i.slug, i.name, i.image_url, i.rarity, i.cosmetic_type
    FROM user_items ui JOIN items i ON i.id = ui.item_id
    WHERE ui.user_id = ? AND i.category = 'background'
  `, [req.user.userId]);
  res.json(items);
});

// Зберегти профіль
router.put('/me/update', authUser, async (req, res) => {
  const { bio, avatar_item_id, banner_item_id, featured_items } = req.body;

  if (bio && bio.length > 255) return res.status(400).json({ error: 'Bio занадто довге' });
  if (featured_items && featured_items.length > 4) return res.status(400).json({ error: 'Макс. 4 предмети' });

  // Перевірка що аватарка належить гравцю
  if (avatar_item_id) {
    const [check] = await db.execute(
      "SELECT 1 FROM user_items ui JOIN items i ON i.id = ui.item_id WHERE ui.user_id = ? AND i.id = ? AND i.category = 'avatar'",
      [req.user.userId, avatar_item_id]
    );
    if (!check.length) return res.status(403).json({ error: 'Ця аватарка вам не належить' });
  }

  // Перевірка що фон належить гравцю
  if (banner_item_id) {
    const [check] = await db.execute(
      "SELECT 1 FROM user_items ui JOIN items i ON i.id = ui.item_id WHERE ui.user_id = ? AND i.id = ? AND i.category = 'background'",
      [req.user.userId, banner_item_id]
    );
    if (!check.length) return res.status(403).json({ error: 'Цей фон вам не належить' });
  }

  await db.execute(`
    UPDATE users SET bio = ?, avatar_item_id = ?, banner_item_id = ?, featured_items = ?
    WHERE id = ?
  `, [
    bio || null,
    avatar_item_id || null,
    banner_item_id || null,
    featured_items?.length ? JSON.stringify(featured_items) : null,
    req.user.userId
  ]);

  res.json({ success: true });
});

module.exports = router;
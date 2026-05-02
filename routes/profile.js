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

// Безпечний парсер масиву
function safeParseArray(val) {
  if (!val) return [];
  try {
    let parsed = typeof val === 'string' ? JSON.parse(val) : val;
    if (typeof parsed === 'string') parsed = JSON.parse(parsed);
    return Array.isArray(parsed) ? parsed.map(Number) : [];
  } catch {
    return [];
  }
}

router.get('/user/:username', async (req, res) => {
  try {
    const [users] = await db.execute(`
      SELECT
        u.id, u.username, u.bio, u.minecraft_uuid,
        u.featured_items, u.featured_badges, u.created_at,
        av.image_url AS avatar_url,
        bg.image_url AS banner_url
      FROM users u
      LEFT JOIN items av ON av.id = u.avatar_item_id
      LEFT JOIN items bg ON bg.id = u.banner_item_id
      WHERE u.username = ?
    `, [req.params.username]);

    if (!users.length) return res.status(404).json({ error: 'Не знайдено' });
    const user = users[0];

    const [allBadges] = await db.execute(`
      SELECT b.id, b.slug, b.name, b.description, b.icon, b.color
      FROM user_badges ub JOIN badges b ON b.id = ub.badge_id
      WHERE ub.user_id = ? ORDER BY ub.obtained_at ASC
    `, [user.id]);

    const featuredBadgeIds = safeParseArray(user.featured_badges);
    let shownBadges = allBadges;
    if (featuredBadgeIds.length) {
      shownBadges = featuredBadgeIds
        .map(id => allBadges.find(b => b.id === id))
        .filter(Boolean);
    }

    const featuredItemIds = safeParseArray(user.featured_items);
    let featuredItems = [];
    if (featuredItemIds.length) {
      const ph = featuredItemIds.map(() => '?').join(',');
      const [items] = await db.execute(
        `SELECT i.id, i.slug, i.name, i.image_url, i.rarity FROM items i WHERE i.id IN (${ph})`,
        featuredItemIds
      );
      featuredItems = featuredItemIds
        .map(id => items.find(it => it.id === id))
        .filter(Boolean);
    }

    res.json({
      username: user.username,
      avatar_url: user.avatar_url,
      banner_url: user.banner_url,
      bio: user.bio,
      status: user.minecraft_uuid ? 'player' : 'guest',
      badges: shownBadges,
      featuredItems,
      created_at: user.created_at
    });

  } catch(err) {
    console.error('Profile error:', err);
    res.status(500).json({ error: 'Помилка сервера: ' + err.message });
  }
});

router.get('/me/edit', authUser, async (req, res) => {
  const [rows] = await db.execute(
    'SELECT username, bio, avatar_item_id, banner_item_id, featured_items, featured_badges FROM users WHERE id = ?',
    [req.user.userId]
  );
  if (!rows.length) return res.status(404).json({ error: 'Не знайдено' });
  const u = rows[0];
  u.featured_items  = safeParseArray(u.featured_items);
  u.featured_badges = safeParseArray(u.featured_badges);
  res.json(u);
});

router.get('/me/avatars', authUser, async (req, res) => {
  const [items] = await db.execute(`
    SELECT i.id, i.slug, i.name, i.image_url, i.rarity
    FROM user_items ui JOIN items i ON i.id = ui.item_id
    WHERE ui.user_id = ? AND i.category = 'avatar'
  `, [req.user.userId]);
  res.json(items);
});

router.get('/me/backgrounds', authUser, async (req, res) => {
  const [items] = await db.execute(`
    SELECT i.id, i.slug, i.name, i.image_url, i.rarity
    FROM user_items ui JOIN items i ON i.id = ui.item_id
    WHERE ui.user_id = ? AND i.category = 'background'
  `, [req.user.userId]);
  res.json(items);
});

router.get('/me/badges', authUser, async (req, res) => {
  const [badges] = await db.execute(`
    SELECT b.id, b.slug, b.name, b.description, b.icon, b.color
    FROM user_badges ub JOIN badges b ON b.id = ub.badge_id
    WHERE ub.user_id = ? ORDER BY ub.obtained_at ASC
  `, [req.user.userId]);
  res.json(badges);
});

router.put('/me/update', authUser, async (req, res) => {
  const { bio, avatar_item_id, banner_item_id, featured_items, featured_badges } = req.body;

  if (bio && bio.length > 255) return res.status(400).json({ error: 'Bio занадто довге' });
  if (featured_items  && featured_items.length  > 4) return res.status(400).json({ error: 'Макс. 4 предмети' });
  if (featured_badges && featured_badges.length > 5) return res.status(400).json({ error: 'Макс. 5 бейджиків' });

  if (avatar_item_id) {
    const [check] = await db.execute(
      "SELECT 1 FROM user_items ui JOIN items i ON i.id = ui.item_id WHERE ui.user_id = ? AND i.id = ? AND i.category = 'avatar'",
      [req.user.userId, avatar_item_id]
    );
    if (!check.length) return res.status(403).json({ error: 'Ця аватарка вам не належить' });
  }

  if (banner_item_id) {
    const [check] = await db.execute(
      "SELECT 1 FROM user_items ui JOIN items i ON i.id = ui.item_id WHERE ui.user_id = ? AND i.id = ? AND i.category = 'background'",
      [req.user.userId, banner_item_id]
    );
    if (!check.length) return res.status(403).json({ error: 'Цей фон вам не належить' });
  }

  await db.execute(`
    UPDATE users
    SET bio = ?, avatar_item_id = ?, banner_item_id = ?,
        featured_items = ?, featured_badges = ?
    WHERE id = ?
  `, [
    bio || null,
    avatar_item_id || null,
    banner_item_id || null,
    featured_items?.length  ? JSON.stringify(featured_items)  : null,
    featured_badges?.length ? JSON.stringify(featured_badges) : null,
    req.user.userId
  ]);

  res.json({ success: true });
});

module.exports = router;
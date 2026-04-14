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

// Інвентар користувача
router.get('/my', authUser, async (req, res) => {
  const [rows] = await db.execute(`
    SELECT
      ui.id, ui.quantity, ui.obtained_at, ui.obtained_from,
      i.slug, i.name, i.description, i.image_url, i.category, i.rarity
    FROM user_items ui
    JOIN items i ON i.id = ui.item_id
    WHERE ui.user_id = ?
    ORDER BY ui.obtained_at DESC
  `, [req.user.userId]);
  res.json(rows);
});

// Інформація про конкретний предмет
router.get('/:slug', async (req, res) => {
  const [rows] = await db.execute(
    'SELECT * FROM items WHERE slug = ?', [req.params.slug]
  );
  if (!rows.length) return res.status(404).json({ error: 'Предмет не знайдено' });
  res.json(rows[0]);
});

module.exports = router;
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const app = express();

app.use(cors());
app.use(express.json());

app.use('/api/auth', require('./routes/auth'));
app.use('/api/quests', require('./routes/quests'));

// Тестовий маршрут — щоб перевірити що сервер живий
app.get('/ping', (req, res) => res.json({ status: 'ok' }));

app.listen(process.env.PORT, () => {
  console.log(`Сервер запущено на порті ${process.env.PORT}`);
});

// Самопінг щоб Render не засинав
const RENDER_URL = process.env.RENDER_URL || '';
if (RENDER_URL) {
    setInterval(async () => {
        try {
            await fetch(RENDER_URL + '/ping');
            console.log('Самопінг виконано');
        } catch (e) {
            console.log('Самопінг помилка:', e.message);
        }
    }, 14 * 60 * 1000); // кожні 14 хвилин
}
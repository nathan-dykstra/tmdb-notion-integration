const express = require('express');
const { startPolling, processWebhook } = require('./app');

const app = express();
const PORT = process.env.PORT || 3000;

startPolling();

app.post('/webhook', (req, res) => {
    console.log('Received webhook:', req.body);
    processWebhook(req.body);
    res.status(200).send('Received webhook');
});

app.get('/', (req, res) => {
    res.send('TMDB-Notion Sync Server is running');
});

app.listen(PORT, () => {
    console.log(`Server is running on port http://localhost:${PORT}`);
});

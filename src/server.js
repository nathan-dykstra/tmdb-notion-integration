const express = require('express');
const { scheduleDailyUpdate, processTitleWebhook, processCheckboxWebook } = require('./app');

const app = express();
const PORT = process.env.PORT || 3000;

scheduleDailyUpdate();

app.use(express.json());

app.post('/title-webhook', (req, res) => {
    processTitleWebhook(req.body);
    res.status(200).send('Received webhook');
});

app.post('/checkbox-webhook', (req, res) => {
    processCheckboxWebook(req.body);
    res.status(200).send('Received webhook');
});

app.get('/', (req, res) => {
    res.send('TMDB-Notion Sync Server is running');
});

app.listen(PORT, () => {
    console.log(`Server is running on port http://localhost:${PORT}`);
});

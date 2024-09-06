const express = require('express');
const { startPolling, updateUnreleasedContent } = require('./app'); // TODO remove updateUnreleasedContent from module exports

const app = express();
const PORT = 3001;

updateUnreleasedContent();

app.get('/', (req, res) => {
    res.send('TMDB-Notion Sync Server is running');
});

app.listen(PORT, () => {
    console.log(`Server is running on port http://localhost:${PORT}`);
});
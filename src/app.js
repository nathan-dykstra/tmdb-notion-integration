const { fetchNotionDatabase, updateNotionDatabase } = require('./services/notionService');
const { fetchTMDBDetails } = require('./services/tmdbService');

// Keep track of pages currently being updated to avoid updating them again
const updatingPages = new Set();

const checkForUpdates = async () => {
    const pages = await fetchNotionDatabase();
    for (const page of pages) {
        const queryString = page.properties.Title.title[0].text.content;
        const pageId = page.id;

        if (updatingPages.has(pageId)) {
            continue;
        }
        updatingPages.add(pageId);

        try {
            const details = await fetchTMDBDetails(queryString);

            if (details) {
                //console.log(JSON.stringify(details, null, 3));
                await updateNotionDatabase(page, details);
            }
        } catch (error) {
            console.error('Error updating Notion database:', error);
        } finally {
            updatingPages.delete(pageId);
        }
    }
};

const startPolling = () => {
    setInterval(checkForUpdates, 10000);
};

module.exports = { startPolling };

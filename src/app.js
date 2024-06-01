const { fetchNotionDatabase, updateNotionDatabase } = require('./services/notionService');
const { fetchTMDBDetails } = require('./services/tmdbService');

// Keep track of pages currently being updated to avoid updating them again
const updatingPages = new Set();

const checkForUpdates = async () => {
    // Get pages from Notion database
    const pages = await fetchNotionDatabase();

    for (const page of pages) {
        const queryString = page.properties.Title.title[0].text.content;
        const pageId = page.id;

        // Skip pages that are already being updated
        if (updatingPages.has(pageId)) {
            continue;
        }
        updatingPages.add(pageId);

        try {
            // Get details from TMDB API
            const details = await fetchTMDBDetails(queryString);

            // Update the Notion database with the details
            if (details) {
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
    setInterval(checkForUpdates, 5000);
};

module.exports = { startPolling };

const schedule = require('node-schedule');
const { fetchNotionPages, fetchNotionUnreleasedPages, updateNotionDatabase } = require('./services/notionService');
const { fetchTMDBDetails, fetchTMDBMovieDetails, fetchTMDBTelevisionDetails } = require('./services/tmdbService');

// Keep track of pages currently being updated to avoid updating them again
const updatingPages = new Set();

const checkForUpdates = async () => {
    // Get pages from Notion database
    const pages = await fetchNotionPages();

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

const updateUnreleasedContent = async () => {
    // Get unreleased pages from Notion database
    const pages = await fetchNotionUnreleasedPages();

    for (const page of pages) {
        const pageId = page.id;
        const tmdbId = page.properties['TMDB ID'].number;

        // Skip pages that are already being updated (highly unlikely since daily update runs at 3:00 AM)
        if (updatingPages.has(pageId)) {
            continue;
        }
        updatingPages.add(pageId);

        try {
            console.log(page.properties.Title.title[0].text.content);
            if (page.properties['Type'].select.name === 'Movie') {
                // Get updated movie details from TMDB API
                const details = await fetchTMDBMovieDetails(tmdbId);

                // Update the Notion page with the new details
                if (details) {
                    await updateNotionDatabase(page, details);
                }
            } else {
                // Get updated TV show details from TMDB API
                const details = await fetchTMDBTelevisionDetails(tmdbId);

                // Update the Notion page with the new details
                if (details) {
                    // update notion...
                }
            }

            // TODO: 
            // 1. Get movie/tv details from TMDB API using tmdbId
            //   a. If no content found for the tmdbId, add error block to the Notion page
            // 2. Update Notion page with the new details
            // 3. If the OG Notion page is a tv show and it has seasons, update season pages and add new seasons
            // 4. If the OG Notion page is a tv show and has seasons and the seasons have episodes, update the episodes and add new episodes
            // Note: Make sure seasons and episodes are not duplicated!
            // NOTE: Only add new seasons and episodes to avoid updating tons of existing pages

        } catch (error) {
            console.error('Error updating unreleased content in Notion database:', error);
        } finally {
            updatingPages.delete(pageId);
        }
    }
};

// Schedule a daily update at 3:00 AM
const scheduleDailyUpdate = () => {
    schedule.scheduleJob('0 3 * * *', async () => {
        console.log('Starting daily update...');
        await updateUnreleasedContent();
    });
}

const startPolling = () => {
    setInterval(checkForUpdates, 5000);
    //scheduleDailyUpdate();
};

module.exports = { startPolling, updateUnreleasedContent }; // TODO remove updateUnreleasedContent from module exports

const { Client } = require('@notionhq/client');
require('dotenv').config();

const notion = new Client({ auth: process.env.NOTION_API_TOKEN });
const notionDatabaseId = process.env.NOTION_DATABASE_ID;
const notionTitleDelimiter = ';';

/**
 * Fetch Notion pages where "Title" ends with the delimiter ';'.
 * @returns 
 */
const fetchUpdatedPages = async () => {
    // Query Notion pages where page title ends with the delimiter
    const query = { 
        database_id: notionDatabaseId,
        filter: { property: 'Title', title: { ends_with: notionTitleDelimiter } },
    };

    try {
        const response = await notion.databases.query(query);
        let nextCursor = response.next_cursor;

        // Get all pages if results are paginated
        while (nextCursor) {
            query.start_cursor = nextCursor;
            const nextResponse = await notion.databases.query(query);
            response.results.push(...nextResponse.results);
            nextCursor = nextResponse.next_cursor;
        }

        return response.results;
    } catch (error) {
        console.error('Error fetching Notion pages:', error);
    }
};

/**
 * Fetch Notion pages where "Release Status" is not "Released", "Ended", or "Cancelled", or the
 * release date is on or after today's date.
 * @returns
 */
const fetchUnreleasedPages = async () => {
    const today = new Date().toISOString().split('T')[0];

    const query = {
        database_id: notionDatabaseId,
        filter: {
            or: [
                { property: 'Release Date', date: { on_or_after: today } },
                {
                    and: [
                        { property: 'Release Status', status: { does_not_equal: 'Released' } },
                        { property: 'Release Status', status: { does_not_equal: 'Ended' } },
                        { property: 'Release Status', status: { does_not_equal: 'Canceled' } },
                        { property: 'Release Status', status: { is_not_empty: true } },
                    ]
                }
            ]
        }
    };

    try {
        const response = await notion.databases.query(query);
        let nextCursor = response.next_cursor;

        // Get all pages if results are paginated
        while (nextCursor) {
            query.start_cursor = nextCursor;
            const nextResponse = await notion.databases.query(query);
            response.results.push(...nextResponse.results);
            nextCursor = nextResponse.next_cursor;
        }

        return response.results;
    } catch (error) {
        console.error('Error fetching unreleased Notion pages:', error);
    }
};

const fetchNeedsRefreshPages = async () => {
    const query = {
        database_id: notionDatabaseId,
        filter: {
            and: [
                { property: 'Refresh Metadata', checkbox: { equals: true } },
                { property: 'TMDB ID', number: { is_not_empty: true } }
            ]
        }
    }

    try {
        const response = await notion.databases.query(query);
        let nextCursor = response.next_cursor;

        // Get all pages if results are paginated
        while (nextCursor) {
            query.start_cursor = nextCursor;
            const nextResponse = await notion.databases.query(query);
            response.results.push(...nextResponse.results);
            nextCursor = nextResponse.next_cursor;
        }

        return response.results;
    } catch (error) {
        console.error('Error fetching pages that requested a metadata refresh:', error);
    }
};

/**
 * Get the TMDB show ID of the parent show of the season "seasonPage".
 * @param {*} seasonPage 
 * @returns 
 */
const getTMDBShowIdFromSeason = async (seasonPage) => {
    try {
        const showPage = await notion.pages.retrieve({
            page_id: seasonPage.properties['Show'].relation[0].id
        });
        return showPage.properties['TMDB ID'].number;
    } catch (error) {
        console.error('Error fetching the TMDB show ID from season page:', error);
    }
};

/**
 * Get the TMDB show ID of the parent show of the episode "episodePage".
 * @param {*} episodePage 
 * @returns 
 */
const getTMDBShowIdFromEpisode = async (episodePage) => {
    try {
        const seasonPage = await notion.pages.retrieve({
            page_id: episodePage.properties['Season'].relation[0].id
        });

        const showPageId = seasonPage.properties['Show'].relation.length ? seasonPage.properties['Show'].relation[0].id : null;

        if (showPageId) { // For a regular TV episode (episode is related to a season, which is related to the show)
            const showPage = await notion.pages.retrieve({
                page_id: showPageId
            });
            return showPage.properties['TMDB ID'].number;
        } else { // For a miniseries TV episode (episode is related to a show directly, via the "Season" relation property)
            return seasonPage.properties['TMDB ID'].number;
        }
    } catch (error) {
        console.error('Error fetching the TMDB show ID from episode page:', error);
    }
};

async function getSeasonPages(showPageId) {
    const query = {
        database_id: notionDatabaseId,
        filter: { property: 'Show', relation: { contains: showPageId } },
    };

    try {
        const response = await notion.databases.query(query);
        let nextCursor = response.next_cursor;

        // Get all pages if results are paginated
        while (nextCursor) {
            query.start_cursor = nextCursor;
            const nextResponse = await notion.databases.query(query);
            response.results.push(...nextResponse.results);
            nextCursor = nextResponse.next_cursor;
        }

        return response.results;
    } catch (error) {
        console.error('Error fetching season pages:', error);
    }
}

async function getEpisodePages(seasonPageId) {
    const query = {
        database_id: notionDatabaseId,
        filter: { property: 'Season', relation: { contains: seasonPageId } },
    };

    try {
        const response = await notion.databases.query(query);
        let nextCursor = response.next_cursor;

        // Get all pages if results are paginated
        while (nextCursor) {
            query.start_cursor = nextCursor;
            const nextResponse = await notion.databases.query(query);
            response.results.push(...nextResponse.results);
            nextCursor = nextResponse.next_cursor;
        }

        return response.results;
    } catch (error) {
        console.error('Error fetching episode pages:', error);
    }
}

const fetchProperty = async (pageId, propertyId) => {
    const query = {
        page_id: pageId,
        property_id: propertyId
    };

    try {
        const response = await notion.pages.properties.retrieve(query);
        let nextCursor = response.next_cursor;

        // Get full rollup value for rollups with many referenced pages
        while (nextCursor) {
            query.start_cursor = nextCursor;
            const nextResponse = await notion.pages.properties.retrieve(query);
            response.property_item = nextResponse.property_item;
            nextCursor = nextResponse.next_cursor;
        }

        return response;
    } catch (error) {
        console.error('Error fetching Notion property:', error);
    }
};

/**
 * Constructs a Notion properites object from "details".
 * @param {*} details 
 * @returns 
 */
function constructNotionProperties(details) {
    const properties = {};

    if (details.title) {
        properties['Title'] = { title: [{ text: { content: details.title } }] };
    }
    if (details.tagline) {
        properties['Tagline'] = { rich_text: [{ text: { content: details.tagline } }] };
    }
    if (details.genres) {
        properties['Genre'] = { multi_select: details.genres.map(genre => ({ name: genre })) };
    }
    if (details.releaseDate) {
        properties['Release Date'] = { date: { start: details.releaseDate } };
    }
    if (details.status) {
        properties['Release Status'] = { status: { name: details.status } };
    }
    if (details.runtime) {
        let runtimeString = '';
        const runtimeHours = Math.floor(details.runtime / 60);
        if (runtimeHours) {
            runtimeString += runtimeHours + 'h';
        }
        const runtimeMinutes = details.runtime % 60;
        if (runtimeMinutes) {
            runtimeString += ' ' + runtimeMinutes + 'm';
        }
        properties['Runtime'] = { rich_text: [{ text: { content: runtimeString } }] };
    }
    if (details.synopsis) {
        properties['Synopsis'] = { rich_text: [{ text: { content: details.synopsis } }] };
    }
    if (details.director) {
        properties['Director'] = { rich_text: [{ text: { content: details.director } }] };
    }
    if (details.composer) {
        properties['Composer'] = { rich_text: [{ text: { content: details.composer } }] };
    }
    if (details.cast) {
        properties['Cast'] = { rich_text: [{ text: { content: details.cast.join(', ') } }] };
    }
    if (details.trailer) {
        properties['Trailer'] = { url: details.trailer };
    }
    if (details.rating) {
        properties['TMDB Rating'] = { number: parseFloat(details.rating.toFixed(1)) };
    }
    if (details.seasonNumber) {
        properties['Season Number'] = { number: details.seasonNumber };
    }
    if (details.episodeNumber) {
        properties['Episode Number'] = { number: details.episodeNumber };
    }
    if (details.type) {
        properties['Type'] = { select: { name: details.type, color: 'default' } };
    }
    if (details.tmdbId) {
        properties['TMDB ID'] = { number: details.tmdbId };
    }
    properties['Refresh Metadata'] = { checkbox: false };

    return properties;
}

/**
 * Create a Notion page for a television episode from "details".
 * @param {number} seasonPageId 
 * @param {*} details 
 */
async function createNotionEpisodePage(seasonPageId, details) {
    const properties = constructNotionProperties(details);
    properties['Season'] = { relation: [{ id: seasonPageId }] };

    const icon = details.poster ? { type: 'external', external: { url: details.poster } } : null;
    const cover = details.backdrop ? { type: 'external', external: { url: details.backdrop } } : null;

    try {
        await notion.pages.create({
            parent: { database_id: notionDatabaseId },
            properties: properties,
            cover: cover,
            icon: icon
        });
        console.log('Page created:', details.title);
    } catch (error) {
        console.error('Error creating Notion page:', error);
    }
}

/**
 * Create a Notion page for a television season from "details".
 * @param {number} showPageId 
 * @param {*} details 
 */
async function createNotionSeasonPage(showPageId, details) {
    const properties = constructNotionProperties(details);
    properties['Show'] = { relation: [{ id: showPageId }] };

    const icon = details.poster ? { type: 'external', external: { url: details.poster } } : null;
    const cover = details.backdrop ? { type: 'external', external: { url: details.backdrop } } : null;

    try {
        const response = await notion.pages.create({
            parent: { database_id: notionDatabaseId },
            properties: properties,
            cover: cover,
            icon: icon
        });
        console.log('Page created:', details.title);

        if (details.episodes) {
            for (const episode of details.episodes) {
                await createNotionEpisodePage(response.id, episode);
            }
        }
    } catch (error) {
        console.error('Error creating Notion page:', error);
    }
}

async function updateNotionPage(pageId, details) {
    const properties = constructNotionProperties(details);
    const icon = details.poster ? { type: 'external', external: { url: details.poster } } : null;
    const cover = details.backdrop ? { type: 'external', external: { url: details.backdrop } } : null;

    try {
        await notion.pages.update({
            page_id: pageId,
            properties: properties,
            cover: cover,
            icon: icon
        });
        console.log('Page updated:', details.title);
    } catch (error) {
        console.error('Error updating Notion page:', error);
    }
}

/**
 * Adds an error block with "message" to the Notion page with ID "pageId".
 * @param {number} pageId 
 * @param {string} pageTitle 
 * @param {string} message 
 */
async function addErrorBlock(pageId, pageTitle, message) {
    const newTitle = pageTitle.endsWith(notionTitleDelimiter) ? pageTitle.slice(0, -1) : pageTitle;
    const errorMessage = message + '\n\n';
    const helpLink = 'https://github.com/nathan-dykstra/tmdb-notion-integration?tab=readme-ov-file#tmdb-notion-integration';

    try {
        // Update the page title to remove the delimiter (ensure it isn't queried again)
        await notion.pages.update({
            page_id: pageId,
            properties: { 
                'Title': { title: [{ text: { content: newTitle } }] },
                'Refresh Metadata': { checkbox: false }
            },
        });

        // Add a "callout" block with the error message to the page
        await notion.blocks.children.append({
            block_id: pageId,
            children: [
                {
                    object: 'block',
                    type: 'callout',
                    callout: {
                        rich_text: [
                            { type: 'text', text: { content: errorMessage } }, 
                            { type: 'text', text: { content: 'View query format guide', link: { url: helpLink } } }
                        ],
                        icon: { type: 'emoji', emoji: '❗' },
                        color: 'red_background'
                    }
                }
            ]
        });

        console.log('Error message added to page');
    } catch (error) {
        console.error('Error updating Notion page with error message:', error);
    }
}

/**
 * Deletes all error blocks from the Notion page with ID "pageId".
 * @param {number} pageId 
 */
async function deleteMessageBlocks(pageId) {
    try {
        const response = await notion.blocks.children.list({
            block_id: pageId
        });

        // Delete the "callout" block with the error message (if it exists)
        const errorCalloutBlock = response.results.find(block => block.type === 'callout' && block.callout.color === 'red_background');
        if (errorCalloutBlock) {
            await notion.blocks.delete({
                block_id: errorCalloutBlock.id
            });
            console.log('Error message removed from page');
        }
    } catch (error) {
        console.error('Error removing blocks from page:', error);
    }
}

/**
 * Checks if a page already exists in the Notion database with the same TMDB ID as the page with ID "pageId".
 * @param {number} pageId 
 * @param {string} pageTitle 
 * @param {number} tmdbId 
 * @returns 
 */
async function checkIfExists(pageId, pageTitle, tmdbId) {
    try {
        // Check if the page already exists using the TMDB ID
        const response = await notion.databases.query({
            database_id: notionDatabaseId,
            filter: {
                property: 'TMDB ID',
                number: { equals: tmdbId }
            }
        });

        // Add info message if page already exists, then delete the page after 30 seconds
        if (response.results.length) {
            const newTitle = pageTitle.endsWith(notionTitleDelimiter) ? pageTitle.slice(0, -1) : pageTitle;
            const existingPageId = response.results[0].id;
            const alreadyExistsMessage = 'The requested movie or TV show already exists in your database! You can find a link to the page below. This page will be automatically deleted in 30 seconds.\n';

            // The current page does not count for checking if the content already exists
            if (existingPageId === pageId) {
                return false;
            }

            // Update the page title to remove the delimiter (ensure it isn't queried again)
            await notion.pages.update({
                page_id: pageId,
                properties: { 'Title': { title: [{ text: { content: newTitle } }] } }
            });

            const calloutBlock = await notion.blocks.children.append({
                block_id: pageId,
                children: [
                    {
                        object: 'block',
                        type: 'callout',
                        callout: {
                            rich_text: [{ type: 'text', text: { content: alreadyExistsMessage } }],
                            icon: { type: 'emoji', emoji: 'ℹ️' },
                            color: 'blue_background'
                        }
                    }
                ]
            });

            await notion.blocks.children.append({
                block_id: calloutBlock.results[0].id,
                children: [
                    {
                        object: 'block',
                        type: 'link_to_page',
                        link_to_page: { page_id: existingPageId }
                    }
                ]
            });

            const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms));
            await wait(30000); // Wait 30 seconds before archiving the page

            await notion.pages.update({
                page_id: pageId,
                archived: true
            });
            console.log('Page archived!');

            return true;
        }
        return false;
    } catch (error) {
        console.error('Error checking if page exists:', error);
    }
}

/**
 * Updates the Notion page "page" with the content from "details".
 * @param {*} page 
 * @param {*} details 
 * @returns 
 */
const updateDatabase = async (page, details, updateExistingForTv = false) => {
    const pageId = page.id;
    const pageTitle = page.properties.Title.title[0]?.text.content || '';

    // Remove default message & error message blocks
    await deleteMessageBlocks(pageId);

    // Update the Notion page with the error message if necessary
    if (details.error) {
        await addErrorBlock(pageId, pageTitle, details.error);
        return;
    }

    // Check if the page already exists using the TMDB ID
    const alreadyExists = await checkIfExists(pageId, pageTitle, details.tmdbId);
    if (alreadyExists) {
        return;
    }

    // Create or update television season & episode pages if necessary
    if (details.type === 'Miniseries' && details.seasons && details.seasons.length === 1 && details.seasons[0].episodes) {
        // For miniseries or limited series with one season, create episode pages attached directly to the show (no season pages)
        for (const episodeDetails of details.seasons[0].episodes) {
            if (updateExistingForTv) { // Update existing episode pages rather than create new ones
                const currentEpisodePages = await getEpisodePages(pageId);
                const existingEpisodePage = currentEpisodePages.find(episodePage => episodePage.properties['TMDB ID'].number === episodeDetails.tmdbId);
                if (existingEpisodePage) {
                    await updateNotionPage(existingEpisodePage.id, episodeDetails);
                    continue;
                }
                await createNotionEpisodePage(pageId, episodeDetails);
            } else {
                await createNotionEpisodePage(pageId, episodeDetails);
            }
        }
    } else if (details.seasons) {
        // Create TV show season pages (this will also create episode pages for each season if necessary)
        for (const seasonDetails of details.seasons) {
            if (updateExistingForTv) { // Update existing season & episode pages rather than creating new ones
                const currentSeasonPages = await getSeasonPages(pageId);
                const existingSeasonPage = currentSeasonPages.find(seasonPage => seasonPage.properties['TMDB ID'].number === seasonDetails.tmdbId);
                if (existingSeasonPage) {
                    await updateNotionPage(existingSeasonPage.id, seasonDetails);

                    if (seasonDetails.episodes) {
                        for (const episodeDetails of seasonDetails.episodes) {
                            const currentEpisodePages = await getEpisodePages(existingSeasonPage.id);
                            const existingEpisodePage = currentEpisodePages.find(episodePage => episodePage.properties['TMDB ID'].number === episodeDetails.tmdbId);
                            if (existingEpisodePage) {
                                await updateNotionPage(existingEpisodePage.id, episodeDetails);
                                continue;
                            }
                            await createNotionEpisodePage(existingSeasonPage.id, episodeDetails);
                        }
                    }

                    continue;
                }
                await createNotionSeasonPage(pageId, seasonDetails);
            } else {
                await createNotionSeasonPage(pageId, seasonDetails);
            }
        }
    } else if (details.episodes) {
        // Create TV show episode pages
        for (const episodeDetails of details.episodes) {
            if (updateExistingForTv) { // Update existing episode pages rather than create new ones
                const currentEpisodePages = await getEpisodePages(pageId);
                const existingEpisodePage = currentEpisodePages.find(episodePage => episodePage.properties['TMDB ID'].number === episodeDetails.tmdbId);
                if (existingEpisodePage) {
                    await updateNotionPage(existingEpisodePage.id, episodeDetails);
                    continue;
                }
                await createNotionEpisodePage(pageId, episodeDetails);
            } else {
                await createNotionEpisodePage(pageId, episodeDetails);
            }
        }
    }

    // Update the Notion page with the new content
    await updateNotionPage(pageId, details);
};

module.exports = { 
    fetchUpdatedPages,
    fetchUnreleasedPages,
    fetchNeedsRefreshPages,
    fetchProperty,
    getTMDBShowIdFromSeason,
    getTMDBShowIdFromEpisode,
    updateDatabase
};

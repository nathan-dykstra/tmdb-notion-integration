const { Client } = require('@notionhq/client');
require('dotenv').config();

const notion = new Client({ auth: process.env.NOTION_API_TOKEN });
const notionDatabaseId = process.env.NOTION_DATABASE_ID;
const notionTitleDelimiter = ';';

const fetchNotionDatabase = async () => {
    const fiveMinutesAgo = new Date(Date.now() - (5 * 60 * 1000)).toISOString();

    // Query recently updated Notion pages with a title ending with the delimiter
    const query = { 
        database_id: notionDatabaseId,
        filter: {
            and: [
                { property: 'Title', title: { ends_with: notionTitleDelimiter } },
                { timestamp: 'last_edited_time', last_edited_time: { after: fiveMinutesAgo } }
            ]
        }
    }

    try {
        const response = await notion.databases.query(query);
        let nextCursor = response.next_cursor;

        // Get all pages if results are paginated
        while (nextCursor) {
            const nextResponse = await notion.databases.query(query);
            response.results.push(...nextResponse.results);
            nextCursor = nextResponse.next_cursor;
        }

        return response.results;
    } catch (error) {
        console.error('Error fetching Notion database:', error);
    }
};

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

    return properties;
}

async function createNotionEpisodePage(seasonPageId, details) {
    const properties = constructNotionProperties(details);
    properties['Season'] = { relation: [{ id: seasonPageId }] };

    const icon = details.poster ? { type: "external", external: { url: details.poster } } : null;
    const cover = details.backdrop ? { type: "external", external: { url: details.backdrop } } : null;

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

async function createNotionSeasonPage(showPageId, details) {
    const properties = constructNotionProperties(details);
    properties['Show'] = { relation: [{ id: showPageId }] };

    const icon = details.poster ? { type: "external", external: { url: details.poster } } : null;
    const cover = details.backdrop ? { type: "external", external: { url: details.backdrop } } : null;

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

async function addErrorBlock(pageId, pageTitle, message) {
    const newTitle = pageTitle.endsWith(notionTitleDelimiter) ? pageTitle.slice(0, -1) : pageTitle;
    const errorMessage = message + ' Ensure your query is spelled correctly and ends with a semicolon. A link to the query format guide can be found below.\n\n';
    const helpLink = 'https://github.com/nathan-dykstra/tmdb-notion-integration';

    try {
        // Update the page title to remove the delimiter (ensure it isn't queried again)
        await notion.pages.update({
            page_id: pageId,
            properties: { 'Title': { title: [{ text: { content: newTitle } }] } }
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

const updateNotionDatabase = async (page, details) => {
    const pageId = page.id;
    const pageTitle = page.properties.Title.title[0].text.content;

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

    // Create television season & episode pages if necessary
    if (details.type === 'Miniseries' && details.seasons && details.seasons.length === 1) {
        // For miniseries or limited series with one season, create episode pages attached directly to the show (no season pages)
        if (details.seasons[0].episodes) {
            for (const episode of details.seasons[0].episodes) {
                await createNotionEpisodePage(pageId, episode);
            }
        }
    } else if (details.seasons) {
        // Create TV show season pages (this will also create episode pages for each season if necessary)
        for (const season of details.seasons) {
            await createNotionSeasonPage(pageId, season);
        }
    }

    const properties = constructNotionProperties(details);
    const icon = details.poster ? { type: "external", external: { url: details.poster } } : null;
    const cover = details.backdrop ? { type: "external", external: { url: details.backdrop } } : null;

    try {
        await notion.pages.update({
            page_id: pageId,
            properties: properties,
            cover: cover,
            icon: icon
        });
        console.log('Page updated:', details.title);
    } catch (error) {
        console.error('Error updating Notion database:', error);
    }
};

module.exports = { fetchNotionDatabase, updateNotionDatabase };

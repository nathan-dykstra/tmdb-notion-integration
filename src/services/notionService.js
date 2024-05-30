const { Client } = require('@notionhq/client');
require('dotenv').config();

const notion = new Client({ auth: process.env.NOTION_API_TOKEN });
const notionDatabaseId = process.env.NOTION_DATABASE_ID;
const notionTitleDelimiter = ';';

const fetchNotionDatabase = async () => {
    const fiveMinutesAgo = new Date(Date.now() - (5 * 60 * 1000)).toISOString();

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

async function createNotionEpisodePage(seasonPageId, details) {
    const properties = {};

    if (details.title) {
        properties['Title'] = { title: [{ text: { content: details.title } }] };
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
        properties['Runtime'] = { number: details.runtime };
    }
    if (details.synopsis) {
        properties['Synopsis'] = { rich_text: [{ text: { content: details.synopsis } }] };
    }
    if (details.composer) {
        properties['Composer'] = { select: { name: details.composer, color: 'default' } };
    }
    if (details.cast) {
        properties['Cast'] = { multi_select: details.cast.map(actor => ({ name: actor, color: 'default' })) };
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
    properties['Type'] = { select: { name: details.type, color: 'default' } }
    properties['Season'] = { relation: [{ id: seasonPageId }] }

    const icon = { type: "external", external: { url: details.poster } }
    const cover = { type: "external", external: { url: details.backdrop } }

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
    const properties = {};

    if (details.title) {
        properties['Title'] = { title: [{ text: { content: details.title } }] };
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
    if (details.synopsis) {
        properties['Synopsis'] = { rich_text: [{ text: { content: details.synopsis } }] };
    }
    if (details.composer) {
        properties['Composer'] = { select: { name: details.composer, color: 'default' } };
    }
    if (details.cast) {
        properties['Cast'] = { multi_select: details.cast.map(actor => ({ name: actor, color: 'default' })) };
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
    properties['Show'] = { relation: [{ id: showPageId }] }
    properties['Type'] = { select: { name: details.type, color: 'default' } }

    const icon = { type: "external", external: { url: details.poster } }
    const cover = { type: "external", external: { url: details.backdrop } }

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
    const errorMessage = message + ' Ensure your query is spelled correctly and ends with a semicolon. Your query should be formatted as follows (all filters are optional):\n';
    const formatMessage = 'Title[year=XXXX, type=movie|tv, language=XX, all_seasons=true|false, all_episodes=true|false];';

    try {
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
                        rich_text: [{ type: 'text', text: { content: errorMessage } }],
                        icon: { type: 'emoji', emoji: '❗' },
                        color: 'red_background'
                    }
                }
            ]
        });

        await notion.blocks.children.append({
            block_id: calloutBlock.results[0].id,
            children: [
                {
                    object: 'block',
                    type: 'code',
                    code: {
                        rich_text: [{ type: 'text', text: { content: formatMessage } }],
                        language: 'plain text'
                    }
                }
            ]
        });

        console.log('Error message added to page');
    } catch (error) {
        console.error('Error updating Notion page with error message:', error);
    }
}

async function removeErrorBlock(pageId) {
    try {
        const resposne = await notion.blocks.children.list({
            block_id: pageId
        });

        const errorCalloutBlock = resposne.results.find(block => block.type === 'callout' && block.callout.color === 'red_background');

        if (errorCalloutBlock) {
            await notion.blocks.delete({
                block_id: errorCalloutBlock.id
            });
            console.log('Error message removed from page');
        }
    } catch (error) {
        console.error('Error removing error message from page:', error);
    }
}

// TODO: Handle upcoming/unreleased flag
const updateNotionDatabase = async (page, details) => {
    const pageId = page.id;
    const pageTitle = page.properties.Title.title[0].text.content;

    // Remove error message block if it exists
    await removeErrorBlock(pageId);

    if (details.error) {
        // Update the Notion page with the error message
        await addErrorBlock(pageId, pageTitle, details.error);
        return;
    }

    if (details.type === 'Miniseries' && details.seasons) {
        for (const episode of details.seasons[0].episodes) {
            await createNotionEpisodePage(pageId, episode);
        }
    } else if (details.seasons) {
        for (const season of details.seasons) {
            await createNotionSeasonPage(pageId, season);
        }
    }

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
        properties['Runtime'] = { number: details.runtime };
    }
    if (details.synopsis) {
        properties['Synopsis'] = { rich_text: [{ text: { content: details.synopsis } }] };
    }
    if (details.director) {
        properties['Director'] = { select: { name: details.director, color: 'default' } };
    }
    if (details.composer) {
        properties['Composer'] = { select: { name: details.composer, color: 'default' } };
    }
    if (details.cast) {
        properties['Cast'] = { multi_select: details.cast.map(actor => ({ name: actor, color: 'default' })) };
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
    properties['Type'] = { select: { name: details.type, color: 'default' } }

    const icon = { type: "external", external: { url: details.poster } }
    const cover = { type: "external", external: { url: details.backdrop } }

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

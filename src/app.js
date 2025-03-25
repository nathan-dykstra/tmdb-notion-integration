const schedule = require('node-schedule');
const notionService = require('./services/notionService');
const tmdbService = require('./services/tmdbService');

// Keep track of pages currently being updated to avoid updating them again
const updatingPages = new Set();

/**
 * Handle webhook requesting from Notion page title edit. Search TMDB, fetch details for the
 * movie or show, and update the Notion page with the TMDB data.
 * @param {*} body 
 * @returns 
 */
const processTitleWebhook = async (body) => {
    const pageId = body.data?.id;
    const title = body.data?.properties['Title']?.title[0]?.text?.content;

    if (title.slice(-1) !== notionService.notionTitleDelimiter) {
        return;
    }

    if (updatingPages.has(pageId)) {
        return;
    }
    updatingPages.add(pageId);

    console.log(`Received title edit webhook for "${title}"`);

    try {
        const details = await tmdbService.fetchTMDBDetails(title);
        await notionService.updateDatabase(body.data, details);

    } catch (error) {
        // TODO (Nathan):
    } finally {
        updatingPages.delete(pageId);
    }
};

/**
 * Handle webhook request resulting from "Refresh Metadata" checkbox being checked. Fetch
 * updated details from TMDB and update the Notion page with the new data.
 * @param {*} body 
 * @returns 
 */
const processCheckboxWebook = async (body) => {
    const pageId = body.data?.id;

    if (updatingPages.has(pageId)) {
        return;
    }
    updatingPages.add(pageId);

    const title = body.data?.properties['Title']?.title[0]?.text?.content;
    const tmdbId = body.data?.properties['TMDB ID']?.number;
    const type = body.data?.properties['Type']?.select?.name;
    const seasonNumber = body.data?.properties['Season Number']?.number;
    const episodeNumber = body.data?.properties['Episode Number']?.number;
    const seasonNumbers = body.data?.properties['Season Numbers']?.rollup?.array?.map(season => season.number);
    const episodeNumbers = body.data?.properties['Episode Numbers']?.rollup?.array?.map(episode => episode.number);
    const episodesCount = body.data?.properties['Episodes Count']?.rollup?.number;

    console.log(`Received metadata refresh webhook for "${title}"`);

    try {
        switch (type) {
            case 'Movie':
                try {
                    const { movieData } = await tmdbService.fetchMovieDetails(tmdbId);
                    const movieDetails = tmdbService.constructDetails(movieData, false);
                    await notionService.updateDatabase(body.data, movieDetails);
                } catch (error) {
                    console.error('Error refreshing movie metadata:', error);
                    const errorDetails = { error: 'An error occurred while refreshing movie metadata! Ensure the TMDB ID was not altered by mistake.' };
                    await notionService.updateDatabase(body.data, errorDetails);
                }
                break;
            case 'Television':
                try {
                    const includeSeasons = seasonNumbers.length > 0;
                    const includeEpisodes = episodesCount > 0;
    
                    const { showData, seasonsData } = await tmdbService.fetchTelevisionShowDetails(tmdbId, includeSeasons, [], includeEpisodes);
                    const showDetails = tmdbService.constructDetails(showData, true);
    
                    if (seasonsData) {
                        const seasonsPromises = seasonsData.map(async seasonData => {
                            const seasonDetails = await tmdbService.constructSeasonDetails(seasonData.seasonData ?? seasonData, showData);
                            if (seasonData.episodesData) {
                                const episodesPromises = seasonData.episodesData.map(async episodeData => {
                                    return await tmdbService.constructEpisodeDetails(episodeData, showData, seasonData.seasonData)
                                });
                                seasonDetails.episodes = await Promise.all(episodesPromises);
                            }
                            return seasonDetails;
                        });
                        showDetails.seasons = await Promise.all(seasonsPromises);
                    }
    
                    await notionService.updateDatabase(body.data, showDetails, true);
                } catch (error) {
                    console.error('Error refreshing TV show metadata:', error);
                    const errorDetails = { error: 'An error occurred while refreshing TV show metadata! Ensure the TMDB ID was not altered by mistake.' };
                    await notionService.updateDatabase(body.data, errorDetails);
                }
                break;
            case 'Television Season':
                try {
                    const showId = await notionService.getTMDBShowIdFromSeason(body.data);
                    const includeEpisodes = episodeNumbers.length > 0;
    
                    const { showData } = await tmdbService.fetchTelevisionShowDetails(showId);
                    const { seasonData, episodesData } = await tmdbService.fetchTelevisionSeasonDetails(showId, seasonNumber, includeEpisodes);
                    const seasonDetails = await tmdbService.constructSeasonDetails(seasonData, showData);
    
                    if (episodesData) {
                        const episodesPromises = episodesData.map(async episodeData => {
                            return await tmdbService.constructEpisodeDetails(episodeData, showData, seasonData);
                        });
                        seasonDetails.episodes = await Promise.all(episodesPromises);
                    }
    
                    await notionService.updateDatabase(body.data, seasonDetails, true);
                } catch (error) {
                    console.error('Error refreshing TV season metadata:', error);
                    const details = { error: 'An error occurred while refreshing TV season metadata! Ensure the TMDB ID of this season\'s parent show and the Season Number were not altered by mistake.' };
                    await notionService.updateDatabase(body.data, details);
                }
                break;
            case 'Television Episode':
                try {
                    const showId = await notionService.getTMDBShowIdFromEpisode(body.data);

                    const { episodeData } = await tmdbService.fetchTelevisionEpisodeDetails(showId, seasonNumber, episodeNumber);
                    const episodeDetails = await tmdbService.constructEpisodeDetails(episodeData, null, null, showId, seasonNumber);

                    await notionService.updateDatabase(body.data, episodeDetails, true);
                } catch (error) {
                    console.error('Error refreshing TV episode metadata:', error);
                    const details = { error: 'An error occurred while refreshing TV episode metadata! Ensure the TMDB ID of this episode\'s parent show, the Season Number, and the Episode Number were not altered by mistake.' };
                    await notionService.updateDatabase(body.data, details);
                }
                break;
            case 'Miniseries':
                try {
                    const includeEpisodes = episodeNumbers.length > 0;

                    const { showData, seasonsData } = await tmdbService.fetchTelevisionShowDetails(tmdbId, includeEpisodes, [], includeEpisodes);
                    const showDetails = tmdbService.constructDetails(showData, true);

                    if (seasonsData) {
                        const seasonsPromises = seasonsData.map(async seasonData => {
                            const seasonDetails = await tmdbService.constructSeasonDetails(seasonData.seasonData, showData)
                            const episodesPromises = seasonData.episodesData.map(async episodeData => {
                                return await tmdbService.constructEpisodeDetails(episodeData, showData, seasonData.seasonData)
                            });
                            seasonDetails.episodes = await Promise.all(episodesPromises);
                            return seasonDetails;
                        });
                        showDetails.seasons = await Promise.all(seasonsPromises);
                    }

                    await notionService.updateDatabase(body.data, showDetails, true);
                } catch (error) {
                    console.error('Error refreshing miniseries metadata:', error);
                    const details = { error: 'An error occurred while refreshing miniseries metadata! Ensure the TMDB ID was not altered by mistake.' };
                    await notionService.updateDatabase(body.data, details);
                }
        }
    } catch (error) {
        // TODO (Nathan): 
    } finally {
        updatingPages.delete(pageId);
    }
};

/**
 * Check for unreleased content in the Notion database, retrieve details for these
 * pages from TMDB, and update the Notion pages with the TMDB data.
 */
const updateUnreleasedContent = async () => {
    // Get unreleased pages from Notion database
    const pages = await notionService.fetchUnreleasedPages();

    for (const page of pages ?? []) {
        const pageId = page.id;
        const tmdbId = page.properties['TMDB ID'].number;
        const type = page.properties['Type'].select.name;

        // Skip pages that are already being updated (highly unlikely since daily update runs at 3:00 AM)
        if (updatingPages.has(pageId)) {
            continue;
        }
        updatingPages.add(pageId);

        try {
            switch (type) {
                case 'Movie':
                    try {
                        const { movieData } = await tmdbService.fetchMovieDetails(tmdbId);
                        const movieDetails = tmdbService.constructDetails(movieData, false);
                        await notionService.updateDatabase(page, movieDetails);
                    } catch (error) {
                        console.error('Error auto-updating an unreleased movie:', error);
                        const details = { error: 'An error occurred while auto-updating an unreleased movie! Ensure the TMDB ID was not altered by mistake.' };
                        await notionService.updateDatabase(page, details);
                    }
                    break;
                case 'Television':
                    const seasonNumbersProperty = await notionService.fetchProperty(pageId, page.properties['Season Numbers'].id);
                    const currentSeasons = seasonNumbersProperty.results.map(season => season.number);
    
                    try {
                        const { showData, seasonsData } = await tmdbService.fetchTelevisionShowDetails(tmdbId, currentSeasons.length ? true : false, currentSeasons);
                        const showDetails = tmdbService.constructDetails(showData, true);
                        if (seasonsData) {
                            const showDetailsPromises = seasonsData.map(async seasonData => {
                                return await tmdbService.constructSeasonDetails(seasonData, showData);
                            });
                            showDetails.seasons = await Promise.all(showDetailsPromises);
                        }
                        await notionService.updateDatabase(page, showDetails);
                    } catch (error) {
                        console.error('Error auto-updating a returning TV show:', error);
                        const details = { error: 'An error occurred while auto-updating a returning TV show! Ensure the TMDB ID was not altered by mistake.' };
                        await notionService.updateDatabase(page, details);
                    }
                    break;
                case 'Television Season':
                    try {
                        const showId = await notionService.getTMDBShowIdFromSeason(page);
                        const seasonNumber = page.properties['Season Number'].number;
                        const episodeNumbersProperty = await notionService.fetchProperty(pageId, page.properties['Episode Numbers'].id);
                        const currentEpisodes = episodeNumbersProperty.results.map(episode => episode.number);
    
                        try {
                            const { seasonData } = await tmdbService.fetchTelevisionSeasonDetails(showId, seasonNumber, null, currentEpisodes.length ? true : false, currentEpisodes);
                            const seasonDetails = await tmdbService.constructSeasonDetails(seasonData, null, showId);
                            await notionService.updateDatabase(page, seasonDetails);
                        } catch (error) {
                            console.error('Error auto-updating an unreleased TV season:', error);
                            const details = { error: 'An error occurred while auto-updating an unreleased TV season! Ensure the TMDB ID of this season\'s parent show and the Season Number were not altered by mistake.' };
                            await notionService.updateDatabase(page, details);
                        }
                    } catch (error) {
                        console.error('Error auto-updating an unreleased TV season:', error);
                        const details = { error: 'An error ocurred while auto-updating an unreleased TV season! The TMDB ID of this season\'s parent show could not be found.' };
                        await notionService.updateDatabase(page, details);
                    }
                    break;
                case 'Television Episode':
                    try {
                        const showId = await notionService.getTMDBShowIdFromEpisode(page);
                        const seasonNumber = page.properties['Season Number'].number;
                        const episodeNumber = page.properties['Episode Number'].number;
    
                        try {
                            const { episodeData } = await tmdbService.fetchTelevisionEpisodeDetails(showId, seasonNumber, episodeNumber);
                            const episodeDetails = await tmdbService.constructEpisodeDetails(episodeData, null, null, showId, seasonNumber);
                            await notionService.updateDatabase(page, episodeDetails);
                        } catch (error) {
                            console.error('Error auto-updating an unreleased TV episode:', error);
                            const details = { error: 'An error occurred while auto-updating an unreleased TV episode! Ensure the TMDB ID of this episode\'s parent show, the Season Number, and the Episode Number were not altered by mistake.' };
                            await notionService.updateDatabase(page, details);
                        }
                    } catch (error) {
                        console.error('Error auto-updating an unreleased TV episode:', error);
                        const details = { error: 'An error ocurred while auto-updating an unreleased TV episode! The TMDB ID of this episode\'s parent show could not be found.' };
                        await notionService.updateDatabase(page, details);
                    }
                    break;
                case 'Miniseries':
                    try {
                        const episodeNumbersProperty = await notionService.fetchProperty(pageId, page.properties['Episode Numbers'].id);
                        const currentEpisodes = episodeNumbersProperty.results.map(episode => episode.number);
    
                        const { showData, seasonData, episodesData } = await tmdbService.fetchTelevisionShowDetails(tmdbId, false, [], currentEpisodes.length ? true : false, currentEpisodes);
                        const showDetails = tmdbService.constructDetails(showData, true);
    
                        if (seasonData && episodesData) {
                            const seasonDetails = await tmdbService.constructSeasonDetails(seasonData, showData);
    
                            const episodesPromises = episodesData.map(async episodeData => {
                                return await tmdbService.constructEpisodeDetails(episodeData, showData, seasonData);
                            });
                            seasonDetails.episodes = await Promise.all(episodesPromises);
    
                            showDetails.seasons = [seasonDetails];
                        }
    
                        await notionService.updateDatabase(page, showDetails);
                    } catch (error) {
                        console.error('Error auto-updating an unreleased miniseries:', error);
                        const details = { error: 'An error occurred while auto-updating an unreleased miniseries! Ensure the TMDB ID was not altered by mistake.' };
                        await notionService.updateDatabase(page, details);
                    }
            }
        } catch (error) {
            // TODO (Nathan):
        } finally {
            updatingPages.delete(pageId);
        }
    }
};

/**
 * Schedule a daily update at 3:00 AM to check for unreleased content in the Notion database.
 */
const scheduleDailyUpdate = () => {
    schedule.scheduleJob('0 3 * * *', async () => {
        console.log('Starting daily update...');
        await updateUnreleasedContent();
        console.log('Daily update complete.');
    });
};

module.exports = { scheduleDailyUpdate, processTitleWebhook, processCheckboxWebook };

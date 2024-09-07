const axios = require('axios');
require('dotenv').config();

const baseTmdbUrl = 'https://api.themoviedb.org/3';
const tmdbApiKey = process.env.TMDB_API_KEY;
const headers = {
    accept: 'application/json',
    Authorization: `Bearer ${tmdbApiKey}`
};

/**
 * Retrieve details for a movie from the TMDB API using the movie ID.
 * @param {number} movieId 
 * @returns 
 */
const fetchMovieDetails = async (movieId) => {
    const params = {
        append_to_response: 'credits,videos'
    };

    const options = {
        method: 'GET',
        headers: headers,
        params: params,
        url: `${baseTmdbUrl}/movie/${movieId}`
    };

    try {
        const response = await axios.request(options);
        return {
            movieData: response.data
        };
    } catch (error) {
        console.error('Error fetching TMDB movie details:', error);
        throw new Error(); // Error handled in the calling function
    }
};

/**
 * Retrive details for a television show from the TMDB API using the show ID.
 * @param {number} showId 
 * @param {boolean} includeSeasons 
 * @param {Array<number>} currentSeasons 
 * @param {boolean} includeEpisodes 
 * @param {Array<number>} currentEpisodes 
 * @returns 
 */
const fetchTelevisionShowDetails = async (showId, includeSeasons = false, currentSeasons = [], includeEpisodes = false, currentEpisodes = []) => {
    const params = {
        append_to_response: 'credits,videos'
    };

    const options = {
        method: 'GET',
        headers: headers,
        params: params,
        url: `${baseTmdbUrl}/tv/${showId}`
    };

    try {
        const response = await axios.request(options);
        const showData = response.data;

        if (includeSeasons) {
            // Get missing seasons
            const newSeasons = showData.seasons
                .filter(season => season.season_number > 0)
                .filter(season => !currentSeasons.includes(season.season_number))
                .map(season => season.season_number);

            const seasonsPromises = newSeasons.map(async (seasonNumber) => {
                if (includeEpisodes) {
                    const { seasonData, episodesData } = await fetchTelevisionSeasonDetails(showId, seasonNumber, true);
                    return {
                        seasonData: seasonData,
                        episodesData: episodesData
                    };
                } else {
                    const { seasonData } = await fetchTelevisionSeasonDetails(showId, seasonNumber);
                    return seasonData;
                }
            });

            return {
                showData: showData,
                seasonsData: await Promise.all(seasonsPromises)
            };
        } else if (includeEpisodes) { // Only necessary for minseries, where episodes are related directly to the show
            const { seasonData, episodesData } = await fetchTelevisionSeasonDetails(showId, 1, true, currentEpisodes);

            return {
                showData: showData,
                seasonData: seasonData,
                episodesData: episodesData
            };
        }

        return {
            showData: showData
        };
    } catch (error) {
        console.error('Error fetching TMDB television details:', error);
        throw new Error(); // Error handled in the calling function
    }
};

/**
 * Retrieve details for a television season from the TMDB API using the show ID and season number.
 * @param {number} showId 
 * @param {number} seasonNumber 
 * @param {boolean} includeEpisodes 
 * @param {Array<number>} currentEpisodes 
 * @returns 
 */
const fetchTelevisionSeasonDetails = async (showId, seasonNumber, includeEpisodes = false, currentEpisodes = []) => {
    const params = {
        append_to_response: 'credits,videos'
    };

    const options = {
        method: 'GET',
        headers: headers,
        params: params,
        url: `${baseTmdbUrl}/tv/${showId}/season/${seasonNumber}`
    };

    try {
        const response = await axios.request(options);
        const seasonData = response.data;

        if (includeEpisodes) {
            // Get new episodes
            const newEpisodes = seasonData.episodes
                .filter(episode => !currentEpisodes.includes(episode.episode_number))
                .map(episode => episode.episode_number);

            const episodesPromises = newEpisodes.map(async (episodeNumber) => {
                const { episodeData } = await fetchTelevisionEpisodeDetails(showId, seasonNumber, episodeNumber);
                return episodeData;
            });

            return {
                seasonData: seasonData,
                episodesData: await Promise.all(episodesPromises)
            };
        }

        return {
            seasonData: seasonData
        };
    } catch (error) {
        console.error('Error fetching TMDB season details:', error);
        throw new Error(); // Error handled in the calling function
    }
};

/**
 * Retrieve details for a television episode from the TMDB API using the show ID,
 * season number, and episode number.
 * @param {number} showId 
 * @param {number} seasonNumber 
 * @param {number} episodeNumber 
 * @returns 
 */
const fetchTelevisionEpisodeDetails = async (showId, seasonNumber, episodeNumber) => {
    const params = {
        append_to_response: 'credits'
    };

    const options = {
        method: 'GET',
        headers: headers,
        params: params,
        url: `${baseTmdbUrl}/tv/${showId}/season/${seasonNumber}/episode/${episodeNumber}`
    };

    try {
        const response = await axios.request(options);

        return {
            episodeData: response.data
        };
    } catch (error) {
        console.error('Error fetching TMDB episode details:', error);
        throw new Error(); // Error handled in the calling function
    }
};

/**
 * Construct a details object for a movie or TV show with the relevant information from "data".
 * @param {*} data 
 * @param {boolean} isTelevision 
 * @returns 
 */
const constructDetails = (data, isTelevision) => {
    let directorName = '', cast = [];

    if (isTelevision) {
        cast = data.credits.cast.slice(0, 20).map(actor => actor.name);
    } else {
        const director = data.credits.crew.find(member => member.job === 'Director');
        directorName = director ? director.name : '';
        cast = data.credits.cast.slice(0, 10).map(actor => actor.name);
    }

    const composer = data.credits.crew.find(member => member.job === 'Original Music Composer');
    const composerName = composer ? composer.name : '';

    const trailers = data.videos.results
        .filter(video => video.type === 'Trailer' && video.site === 'YouTube' && video.official)
        .sort((a, b) => new Date(a.published_at) - new Date(b.published_at));
    const trailerKey = trailers.length > 0 ? trailers[0].key : '';

    return {
        title: data.title || data.name,
        tagline: data.tagline,
        genres: data.genres.map(genre => genre.name),
        runtime: data.runtime,
        status: data.status,
        releaseDate: data.release_date || data.first_air_date,
        synopsis: data.overview,
        director: directorName,
        composer: composerName,
        cast: cast,
        poster: data.poster_path ? `https://image.tmdb.org/t/p/w500${data.poster_path}` : '',
        backdrop: data.backdrop_path ? `https://image.tmdb.org/t/p/original${data.backdrop_path}` : '',
        trailer: trailerKey ? `https://www.youtube.com/watch?v=${trailerKey}` : '',
        rating: data.vote_average,
        type: isTelevision ? (data.type === 'Miniseries' ? 'Miniseries' : 'Television') : 'Movie',
        tmdbId: data.id
    };
};

/**
 * Construct a details object for a TV season with the relevant information from "seasonData" and "showData".
 * @param {*} seasonData 
 * @param {*} showData 
 * @param {number} showId 
 * @returns 
 */
const constructSeasonDetails = async (seasonData, showData = null, showId = null) => {
    if (!showData) {
        if (!showId) {
            throw new Error();
        }

        const showParams = {
            append_to_response: 'credits,videos'
        };
    
        const showOptions = {
            method: 'GET',
            headers: headers,
            params: showParams,
            url: `${baseTmdbUrl}/tv/${showId}`
        };

        const showResponse = await axios.request(showOptions);
        showData = showResponse.data;
    }

    let seasonComposerName = '';
    const seasonComposer = seasonData.credits.crew.find(member => member.job === 'Original Music Composer');
    if (seasonComposer) {
        seasonComposerName = seasonComposer.name;
    } else {
        const showComposer = showData.credits.crew.find(member => member.job === 'Original Music Composer');
        seasonComposerName = showComposer ? showComposer.name : '';
    }

    const seasonCast = seasonData.credits.cast.slice(0, 15).map(actor => actor.name);

    const seasonTrailers = seasonData.videos.results
        .filter(video => video.type === 'Trailer' && video.site === 'YouTube' && video.official)
        .sort((a, b) => new Date(a.published_at) - new Date(b.published_at));
    const seasonTrailerKey = seasonTrailers.length > 0 ? seasonTrailers[0].key : '';

    return {
        title: seasonData.name,
        genres: showData.genres.map(genre => genre.name),
        status: new Date().toISOString().split('T')[0] > seasonData.air_date && showData.status !== 'Canceled' ? 'Released' : showData.status,
        releaseDate: seasonData.air_date,
        synopsis: seasonData.overview ? seasonData.overview : (seasonData.season_number === 1 ? showData.overview : ''),
        composer: seasonComposerName,
        cast: seasonCast,
        poster: seasonData.poster_path ? `https://image.tmdb.org/t/p/w500${seasonData.poster_path}` : '',
        backdrop: showData.backdrop_path ? `https://image.tmdb.org/t/p/original${showData.backdrop_path}` : '',
        trailer: seasonTrailerKey ? `https://www.youtube.com/watch?v=${seasonTrailerKey}` : '',
        rating: seasonData.vote_average,
        seasonNumber: seasonData.season_number,
        type: 'Television Season',
        tmdbId: seasonData.id
    };
};

/**
 * Construct a details object for a TV episode with the relevant information from "episodeData", "showData", and "seasonData".
 * @param {*} episodeData 
 * @param {*} showData 
 * @param {*} seasonData 
 * @param {number} showId 
 * @param {number} seasonNumber 
 * @returns 
 */
const constructEpisodeDetails = async (episodeData, showData = null, seasonData = null, showId = null, seasonNumber = null) => {
    if (!showData) {
        if (!showId) {
            throw new Error();
        }

        const showParams = {
            append_to_response: 'credits,videos'
        };
    
        const showOptions = {
            method: 'GET',
            headers: headers,
            params: showParams,
            url: `${baseTmdbUrl}/tv/${showId}`
        };

        const showResponse = await axios.request(showOptions);
        showData = showResponse.data;
    }

    if (!seasonData) {
        if (!showId || !seasonNumber) {
            throw new Error();
        }

        const seasonParams = {
            append_to_response: 'credits,videos'
        };

        const seasonOptions = {
            method: 'GET',
            headers: headers,
            params: seasonParams,
            url: `${baseTmdbUrl}/tv/${showId}/season/${seasonNumber}`
        };

        const seasonResponse = await axios.request(seasonOptions);
        seasonData = seasonResponse.data;
    }

    const director = episodeData.credits.crew.find(member => member.job === 'Director');
    const directorName = director ? director.name : '';

    let episodeComposerName = '';
    const episodeComposer = episodeData.credits.crew.find(member => member.job === 'Original Music Composer');
    if (episodeComposer) {
        episodeComposerName = episodeComposer.name;
    } else {
        const seasonComposer = seasonData.credits.crew.find(member => member.job === 'Original Music Composer');
        if (seasonComposer) {
            episodeComposerName = seasonComposer.name;
        } else {
            const showComposer = showData.credits.crew.find(member => member.job === 'Original Music Composer');
            episodeComposerName = showComposer ? showComposer.name : '';
        }
    }

    const episodeCast = episodeData.credits.cast.slice(0, 10).map(actor => actor.name);

    return {
        title: episodeData.name,
        genres: showData.genres.map(genre => genre.name),
        runtime: episodeData.runtime,
        status: new Date().toISOString().split('T')[0] > seasonData.air_date && showData.status !== 'Canceled' ? 'Released' : showData.status,
        releaseDate: episodeData.air_date,
        synopsis: episodeData.overview,
        director: directorName,
        composer: episodeComposerName,
        cast: episodeCast,
        poster: seasonData.poster_path ? `https://image.tmdb.org/t/p/w500${seasonData.poster_path}` : '',
        backdrop: showData.backdrop_path ? `https://image.tmdb.org/t/p/original${showData.backdrop_path}` : '',
        rating: episodeData.vote_average,
        seasonNumber: episodeData.season_number,
        episodeNumber: episodeData.episode_number,
        type: 'Television Episode',
        tmdbId: episodeData.id
    };
};

/**
 * Validates the key-value pairs in the query filters
 * @param {string} key 
 * @param {string} value 
 * @returns {boolean}
 */
function validateQueryFilters(key, value) {
    const validKeys = ['year', 'y', 'type', 't', 'episode', 'e', 'season', 's', 'all_seasons', 'all_episodes', 'all'];

    const validValues = {
        year: /^\d{4}$/,
        type: /^(movie|film|tv|television|series|show)$/,
        season: /^\d+$/,
        episode: /^\d+$/,
        all_seasons: /^(true|false|yes|no)$/,
        all_episodes: /^(true|false|yes|no)$/
    };

    if (!validKeys.includes(key)) {
        console.error(`Invalid filter: '${key}'`);
        return false;
    }

    if (!validValues[key].test(value)) {
        console.error(`Invalid value for filter '${key}': '${value}'`);
        return false;
    }

    return true;
}

/**
 * Parse the query string into a main query and filters
 * @param {string} queryString 
 * @returns
 */
function parseQueryString(queryString) {
    const keyMapping = {
        'y': 'year',
        't': 'type',
        's': 'season',
        'e': 'episode',
        'all': 'all_episodes'
    };

    const [mainQuery, filtersString] = queryString.slice(0, -1).split('['); // Remove trailing semicolon and split on '['

    const filters = {};
    if (filtersString) {
        const filtersPairs = filtersString.slice(0, -1).split(','); // Remove trailing ']' and split by comma
        for (const pair of filtersPairs) {
            let [key, value] = pair.split(/[:=]/).map(item => item.trim().toLowerCase()); // Split filters by colon or comma
            if (keyMapping[key]) {
                key = keyMapping[key];
            }

            if (validateQueryFilters(key, value)) {
                filters[key] = value;
            }
        }
    }

    return {
        mainQuery: mainQuery.trim(),
        filters: filters
    };
}

/**
 * Query the TMDB API for the best movie or TV show matching "name", and return the corresponding details.
 * @param {string} name 
 * @returns 
 */
const fetchTMDBDetails = async (name) => {
    const movieTypes = ['movie', 'film'];
    const tvTypes = ['tv', 'television', 'series', 'show'];

    const tmdbQuery = parseQueryString(name);

    // Perform validation on the search query

    if (tmdbQuery.mainQuery === '') {
        return { error: 'Invalid query!' };
    }

    if (tmdbQuery.filters.episode && !tmdbQuery.filters.season) {
        return { error: 'If you specify an episode number, you must also specify the season number!' };
    }

    // Set up the initial TMDB search

    const params = {
        query: tmdbQuery.mainQuery,
    };

    const options = {
        method: 'GET',
        headers: headers
    };

    if (tmdbQuery.filters.type) {
        if (movieTypes.includes(tmdbQuery.filters.type)) {
            // Movie search type
            if (tmdbQuery.filters.year) {
                params.primary_release_year = tmdbQuery.filters.year;
            }
            options.url = `${baseTmdbUrl}/search/movie`;
        } else if (tvTypes.includes(tmdbQuery.filters.type)) {
            // TV search type
            if (tmdbQuery.filters.year) {
                params.year = tmdbQuery.filters.year;
            }
            options.url = `${baseTmdbUrl}/search/tv`;
        }
    } else {
        // Multi search type
        options.url = `${baseTmdbUrl}/search/multi`;
    }

    options.params = params;

    try {
        const searchResponse = await axios.request(options);
        const result = searchResponse.data.results[0];

        if (result) {
            if (movieTypes.includes(tmdbQuery.filters.type) || result.media_type === 'movie') {
                try {
                    const { movieData } = await fetchMovieDetails(result.id);
                    const movieDetails = constructDetails(movieData, false);
                    return movieDetails;
                } catch (error) {
                    console.error('Error fetching movie details from TMDB:', error);
                    return { error: 'An error occurred while fetching movie details from TMDB!' };
                }
            } else if (tvTypes.includes(tmdbQuery.filters.type) || result.media_type === 'tv') {
                try {
                    const { showData } = await fetchTelevisionShowDetails(result.id);
                    const showDetails = constructDetails(showData, true);

                    // Get a single season or episode if specified in the filters
                    if (tmdbQuery.filters.season) {
                        try {
                            const { seasonData, episodesData } = await fetchTelevisionSeasonDetails(result.id, tmdbQuery.filters.season, tmdbQuery.filters.all_episodes ? true : false);
                            const seasonDetails = await constructSeasonDetails(seasonData, showData);

                            if (tmdbQuery.filters.episode) { // Get a specific episode for a specific season
                                try {
                                    const { episodeData } = await fetchTelevisionEpisodeDetails(result.id, tmdbQuery.filters.season, tmdbQuery.filters.episode);
                                    const episodeDetails = await constructEpisodeDetails(episodeData, showData, seasonData);
                                    return episodeDetails;
                                } catch (error) {
                                    console.error('Error fetching TV episode details from TMDB:', error);
                                    return { error: 'An error occurred while fetching TV episode details from TMDB! Ensure the season and episode numbers are valid.' };
                                }
                            } else if (tmdbQuery.filters.all_episodes) { // Get all episodes for a specific season
                                const episodeNumbers = episodesData.map(episode => episode.episode_number);

                                const episodesPromises = episodeNumbers.map(async (episodeNumber) => {
                                    const { episodeData } = await fetchTelevisionEpisodeDetails(result.id, tmdbQuery.filters.season, episodeNumber);
                                    const episodeDetails = await constructEpisodeDetails(episodeData, showData, seasonData);
                                    return episodeDetails;
                                });

                                const episodesDetails = await Promise.all(episodesPromises);
                                seasonDetails.episodes = episodesDetails;
                            }

                            return seasonDetails;
                        } catch (error) {
                            console.error('Error fetching TV season details from TMDB:', error);
                            return { error: 'An error occurred while fetching TV season data TMDB! Ensure the season number is valid.' };
                        }
                    }

                    // Get season and episode details for television shows (if necessary)

                    const trueFilters = ['true', 'yes'];
                    const includeSeasons = trueFilters.includes(tmdbQuery.filters.all_seasons);
                    const includeEpisodes = trueFilters.includes(tmdbQuery.filters.all_episodes);

                    if (includeSeasons || includeEpisodes) {
                        // Filter out Season 0 (Specials)
                        const seasons = showData.seasons.filter(season => season.season_number > 0).map(season => season.season_number);

                        const seasonsPromises = seasons.map(async (season) => {
                            const { seasonData, episodesData } = await fetchTelevisionSeasonDetails(result.id, season, includeEpisodes);
                            const seasonDetails = await constructSeasonDetails(seasonData, showData);
                            if (includeEpisodes) {
                                const episodesPromises = episodesData.map(async (episodeData) => await constructEpisodeDetails(episodeData, showData, seasonData));
                                seasonDetails.episodes = await Promise.all(episodesPromises);
                            }
                            return seasonDetails;
                        });

                        const seasonsDetails = await Promise.all(seasonsPromises);
                        showDetails.seasons = seasonsDetails;
                    }

                    return showDetails;
                } catch (error) {
                    console.error('Error fetching TV show details from TMDB:', error);
                    return { error: 'An error occurred while fetching TV show details from TMDB!' };
                }
            } else {
                return { error: 'No results found!' };
            }
        } else {
            return { error: 'No results found!' };
        }
    } catch (error) {
        console.error('Error searching TMDB:', error);
        return { error: 'An error occurred while searching TMDB!' };
    }
};

module.exports = {
    fetchTMDBDetails,
    fetchMovieDetails,
    fetchTelevisionShowDetails,
    fetchTelevisionSeasonDetails,
    fetchTelevisionEpisodeDetails,
    constructDetails,
    constructSeasonDetails,
    constructEpisodeDetails
};

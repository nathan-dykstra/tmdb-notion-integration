const axios = require('axios');
require('dotenv').config();

const baseTmdbUrl = 'https://api.themoviedb.org/3';
const tmdbApiKey = process.env.TMDB_API_KEY;
const headers = {
    accept: 'application/json',
    Authorization: `Bearer ${tmdbApiKey}`
};

/**
 * Validates the key-value pairs in the query filters
 * @param {string} key 
 * @param {string} value 
 * @returns
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

async function fetchTMDBSeasonDetails(showId, seasonNumber) {
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
        return response.data;
    } catch (error) {
        console.error('Error fetching TMDB season details', error);
        throw new Error(); // Error handled in the calling function
    }
}

async function fetchTMDBEpisodeDetails(showId, seasonNumber, episodeNumber) {
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
        return response.data;
    } catch (error) {
        console.error('Error fetching TMDB episode details', error);
        throw new Error(); // Error handled in the calling function
    }
}

function constructDetails(data, isTelevision) {
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
}

function constructSeasonDetails(showData, seasonData) {
    const seasonComposer = seasonData.credits.crew.find(member => member.job === 'Original Music Composer');
    const seasonComposerName = seasonComposer ? seasonComposer.name : '';

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
        synopsis: seasonData.overview,
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
}

function constructEpisodeDetails(showData, seasonData, episodeData) {
    const episodeComposer = episodeData.credits.crew.find(member => member.job === 'Original Music Composer');
    const episodeComposerName = episodeComposer ? episodeComposer.name : '';

    const episodeCast = episodeData.credits.cast.slice(0, 10).map(actor => actor.name);

    return {
        title: episodeData.name,
        genres: showData.genres.map(genre => genre.name),
        runtime: episodeData.runtime,
        status: new Date().toISOString().split('T')[0] > seasonData.air_date && showData.status !== 'Canceled' ? 'Released' : showData.status,
        releaseDate: episodeData.air_date,
        synopsis: episodeData.overview,
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
}

const fetchTMDBDetails = async (name) => {
    const movieTypes = ['movie', 'film'];
    const tvTypes = ['tv', 'television', 'series', 'show'];

    const tmdbQuery = parseQueryString(name);

    // Perform some validation on the query

    if (tmdbQuery.mainQuery === '') {
        console.error('Invalid query');
        return {
            error: 'Invalid query!'
        };
    }

    if (tmdbQuery.filters.episode && !tmdbQuery.filters.season) {
        return {
            error: 'If you specify an episode number, you must also specify the season number!'
        }
    }

    // Set up the initial TMDB search

    const searchParams = {
        query: tmdbQuery.mainQuery,
    };

    const searchOptions = {
        method: 'GET',
        headers: headers
    };

    if (tmdbQuery.filters.type) {
        if (movieTypes.includes(tmdbQuery.filters.type)) {
            // Movie search type
            if (tmdbQuery.filters.year) {
                searchParams.primary_release_year = tmdbQuery.filters.year;
            }
            searchOptions.url = `${baseTmdbUrl}/search/movie`;
        } else if (tvTypes.includes(tmdbQuery.filters.type)) {
            // TV search type
            if (tmdbQuery.filters.year) {
                searchParams.year = tmdbQuery.filters.year;
            }
            searchOptions.url = `${baseTmdbUrl}/search/tv`;
        }
    } else {
        // Multi search type
        searchOptions.url = `${baseTmdbUrl}/search/multi`;
    }

    searchOptions.params = searchParams;

    try {
        const searchResponse = await axios.request(searchOptions);

        const detailsParams = {
            append_to_response: 'credits,videos'
        };

        const detailsOptions = {
            method: 'GET',
            headers: headers,
            params: detailsParams
        };

        const result = searchResponse.data.results[0];

        let isTelevision = false;

        if (result) {
            if (movieTypes.includes(tmdbQuery.filters.type) || result.media_type === 'movie') {
                detailsOptions.url = `${baseTmdbUrl}/movie/${result.id}`
            } else if (tvTypes.includes(tmdbQuery.filters.type) || result.media_type === 'tv') {
                isTelevision = true;
                detailsOptions.url = `${baseTmdbUrl}/tv/${result.id}`
            } else {
                return {
                    error: 'No results found!'
                };
            }

            try {
                const detailsResponse = await axios.request(detailsOptions);
                const data = detailsResponse.data;
                const details = constructDetails(data, isTelevision);

                // Get a single season or episode if specified in the filters
                if (tmdbQuery.filters.season) {
                    try {
                        const seasonData = await fetchTMDBSeasonDetails(data.id, tmdbQuery.filters.season);
                        const seasonDetails = constructSeasonDetails(data, seasonData);

                        if (tmdbQuery.filters.episode) {
                            try {
                                const episodeData = await fetchTMDBEpisodeDetails(data.id, tmdbQuery.filters.season, tmdbQuery.filters.episode);
                                const episodeDetails = constructEpisodeDetails(data, seasonData, episodeData);

                                return episodeDetails;
                            } catch (error) {
                                return {
                                    error: 'An error occurred while fetching TMDB details! Ensure the season and episode numbers are valid.'
                                }
                            }
                        }

                        return seasonDetails;
                    } catch (error) {
                        return {
                            error: 'An error occurred while fetching TMDB details! Ensure the season number is valid.'
                        }
                    }
                }

                // Get season and episode details for television shows (if necessary)
                const trueFilters = ['true', 'yes'];
                if (isTelevision && (trueFilters.includes(tmdbQuery.filters.all_seasons) || trueFilters.includes(tmdbQuery.filters.all_episodes))) {
                    // Filter out Season 0 (Specials)
                    const seasons = data.seasons.filter(season => season.season_number > 0).map(season => season.season_number);

                    const seasonPromises = seasons.map(async (season) => {
                        const seasonData = await fetchTMDBSeasonDetails(data.id, season);
                        const seasonDetails = constructSeasonDetails(data, seasonData);

                        if (trueFilters.includes(tmdbQuery.filters.all_episodes)) {
                            const episodes = seasonData.episodes.map(episode => episode.episode_number);

                            const episodePromises = episodes.map(async (episode) => {
                                const episodeData = await fetchTMDBEpisodeDetails(data.id, season, episode);
                                const episodeDetails = constructEpisodeDetails(data, seasonData, episodeData);

                                return episodeDetails;
                            });

                            const episodesDetails = await Promise.all(episodePromises);
                            seasonDetails.episodes = episodesDetails;
                        }

                        return seasonDetails;
                    });

                    const seasonsDetails = await Promise.all(seasonPromises);
                    details.seasons = seasonsDetails;
                }

                return details;
            } catch (error) {
                console.error('Error fetching TMDB details', error);
                return {
                    error: 'An error occurred while fetching TMDB details!'
                }
            }
        } else {
            return {
                error: 'No results found!'
            }
        }
    } catch (error) {
        console.error('Error searching TMDB', error);
        return {
            error: 'An error occurred while searching TMDB!'
        }
    }
};

const fetchTMDBMovieDetails = async (movieId) => {
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
        const data = response.data;
        const details = constructDetails(data, false);
        return details;
    } catch (error) {
        console.error('Error fetching TMDB movie details', error);
        return {
            error: 'An error occurred while auto-updating an unreleased movie! Ensure the TMDB ID was not altered by mistake.'
        }
    }
};

const fetchTMDBTelevisionDetails = async (showId, includeSeasons = false, includeEpisodes = false) => {
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
        const data = response.data;
        const details = constructDetails(data, true);

        // TODO: seasons and episodes (if necessary)

        return details;
    } catch (error) {
        console.error('Error fetching TMDB television details', error);
        return {
            error: 'An error occurred while auto-updating a returning TV show! Ensure the TMDB ID was not altered by mistake.'
        }
    }
};

module.exports = { fetchTMDBDetails, fetchTMDBMovieDetails, fetchTMDBTelevisionDetails };

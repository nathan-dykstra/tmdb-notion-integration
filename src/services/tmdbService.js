const axios = require('axios');
const e = require('express');
require('dotenv').config();

const tmdbApiKey = process.env.TMDB_API_KEY;

/**
 * Validates the key-value pairs in the query filters
 * @param {string} key 
 * @param {string} value 
 * @returns
 */
function validateQueryFilters(key, value) {
    const validKeys = ['year', 'y', 'language', 'lang', 'l', 'type', 't', 'episode', 'e', 'season', 's', 'all_seasons', 'all_episodes', 'all'];

    const validValues = {
        year: /^\d{4}$/,
        language: /^[a-zA-Z]{2}$/,
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
        'lang': 'language',
        'l': 'language',
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

const fetchTMDBDetails = async (name) => {
    const movieTypes = ['movie', 'film'];
    const tvTypes = ['tv', 'television', 'series', 'show'];

    tmdbQuery = parseQueryString(name);

    if (tmdbQuery.mainQuery === '') {
        console.error('Invalid query');
        return {
            error: 'Invalid query!'
        };
    }

    const headers = {
        accept: 'application/json',
        Authorization: `Bearer ${tmdbApiKey}`
    }

    const searchParams = {
        query: tmdbQuery.mainQuery,
    }

    if (tmdbQuery.filters.language) {
        searchParams.language = tmdbQuery.filters.language;
    }

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
            searchOptions.url = 'https://api.themoviedb.org/3/search/movie';
        } else if (tvTypes.includes(tmdbQuery.filters.type)) {
            // TV search type
            if (tmdbQuery.filters.year) {
                searchParams.year = tmdbQuery.filters.year;
            }
            searchOptions.url = 'https://api.themoviedb.org/3/search/tv';
        }
    } else {
        // Multi search type
        searchOptions.url = 'https://api.themoviedb.org/3/search/multi';
    }

    searchOptions.params = searchParams;

    try {
        const searchResponse = await axios.request(searchOptions);

        const detailsParams = {};
        const detailsOptions = {
            method: 'GET',
            headers: headers
        }

        const result = searchResponse.data.results[0];
        let isTelevision = false;

        if (result) {
            if (movieTypes.includes(tmdbQuery.filters.type) || result.media_type === 'movie') {
                detailsParams.append_to_response = 'credits,videos';
                detailsOptions.url = `https://api.themoviedb.org/3/movie/${result.id}`
            } else if (tvTypes.includes(tmdbQuery.filters.type) || result.media_type === 'tv') {
                isTelevision = true;
                detailsOptions.url = `https://api.themoviedb.org/3/tv/${result.id}`
                detailsParams.append_to_response = 'credits,videos';
            } else {
                return {
                    error: 'No results found!'
                };
            }

            // TODO: handle request for specific season or episode

            detailsParams.language = result.original_language;
            detailsOptions.params = detailsParams;

            try {
                const detailsResponse = await axios.request(detailsOptions);
                const data = detailsResponse.data;

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

                const details = {
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
                };

                const trueFilters = ['true', 'yes'];

                if (isTelevision) {
                    if (trueFilters.includes(tmdbQuery.filters.all_seasons) || trueFilters.includes(tmdbQuery.filters.all_episodes)) {
                        // Filter out Season 0 (Specials)
                        const seasons = data.seasons.filter(season => season.season_number > 0).map(season => season.season_number);

                        const seasonParams = {
                            append_to_response: 'credits,videos'
                        }
                        if (detailsParams.language) {
                            seasonParams.language = detailsParams.language;
                        }

                        const seasonOptions = {
                            method: 'GET',
                            headers: headers,
                            params: seasonParams
                        }

                        const seasonPromises = seasons.map(async (season) => {
                            seasonOptions.url = `https://api.themoviedb.org/3/tv/${data.id}/season/${season}`;

                            try {
                                const seasonResponse = await axios.request(seasonOptions);

                                const seasonData = seasonResponse.data;

                                const seasonComposer = seasonData.credits.crew.find(member => member.job === 'Original Music Composer');
                                const seasonComposerName = seasonComposer ? seasonComposer.name : '';

                                const seasonCast = seasonData.credits.cast.slice(0, 15).map(actor => actor.name);

                                const seasonTrailers = seasonData.videos.results
                                    .filter(video => video.type === 'Trailer' && video.site === 'YouTube' && video.official)
                                    .sort((a, b) => new Date(a.published_at) - new Date(b.published_at));
                                const seasonTrailerKey = seasonTrailers.length > 0 ? seasonTrailers[0].key : '';

                                const seasonDetails = {
                                    title: seasonData.name,
                                    genres: data.genres.map(genre => genre.name),
                                    status: new Date().toISOString().split('T')[0] > seasonData.air_date && data.status !== 'Canceled' ? 'Released' : data.status,
                                    releaseDate: seasonData.air_date,
                                    synopsis: seasonData.overview,
                                    composer: seasonComposerName,
                                    cast: seasonCast,
                                    poster: seasonData.poster_path ? `https://image.tmdb.org/t/p/w500${seasonData.poster_path}` : '',
                                    backdrop: data.backdrop_path ? `https://image.tmdb.org/t/p/original${data.backdrop_path}` : '',
                                    trailer: seasonTrailerKey ? `https://www.youtube.com/watch?v=${seasonTrailerKey}` : '',
                                    rating: seasonData.vote_average,
                                    seasonNumber: seasonData.season_number,
                                    type: 'Television Season'
                                };

                                if (trueFilters.includes(tmdbQuery.filters.all_episodes)) {
                                    const episodes = seasonData.episodes.map(episode => episode.episode_number);

                                    const episodeParams = {
                                        append_to_response: 'credits'
                                    }
                                    if (detailsParams.language) {
                                        episodeParams.language = detailsParams.language;
                                    }
            
                                    const episodeOptions = {
                                        method: 'GET',
                                        headers: headers,
                                        params: episodeParams
                                    }

                                    const episodePromises = episodes.map(async (episode) => {
                                        episodeOptions.url = `https://api.themoviedb.org/3/tv/${data.id}/season/${season}/episode/${episode}`;

                                        try {
                                            const episodeResponse = await axios.request(episodeOptions);
            
                                            const episodeData = episodeResponse.data;
            
                                            const episodeComposer = episodeData.credits.crew.find(member => member.job === 'Original Music Composer');
                                            const episodeComposerName = episodeComposer ? episodeComposer.name : '';
            
                                            const episodeCast = episodeData.credits.cast.slice(0, 10).map(actor => actor.name);
            
                                            const episodeDetails = {
                                                title: episodeData.name,
                                                genres: data.genres.map(genre => genre.name),
                                                runtime: episodeData.runtime,
                                                status: new Date().toISOString().split('T')[0] > seasonData.air_date && data.status !== 'Canceled' ? 'Released' : data.status,
                                                releaseDate: episodeData.air_date,
                                                synopsis: episodeData.overview,
                                                composer: episodeComposerName,
                                                cast: episodeCast,
                                                poster: seasonData.poster_path ? `https://image.tmdb.org/t/p/w500${seasonData.poster_path}` : '',
                                                backdrop: data.backdrop_path ? `https://image.tmdb.org/t/p/original${data.backdrop_path}` : '',
                                                rating: episodeData.vote_average,
                                                seasonNumber: episodeData.season_number,
                                                episodeNumber: episodeData.episode_number,
                                                type: 'Television Episode'
                                            };

                                            return episodeDetails;
                                        } catch (error) {
                                            console.error('Error fetching TMDB episode details', error);
                                        }
                                    });

                                    const episodesDetails = await Promise.all(episodePromises);
                                    seasonDetails.episodes = episodesDetails;
                                }

                                return seasonDetails;
                            } catch (error) {
                                console.error('Error fetching TMDB season details', error);
                            }
                        });

                        const seasonsDetails = await Promise.all(seasonPromises);
                        details.seasons = seasonsDetails;
                    }
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

module.exports = { fetchTMDBDetails };

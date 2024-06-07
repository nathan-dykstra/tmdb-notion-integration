# tmdb-notion-integration

Type the name of the movie or TV show, optionally followed by a comma-separated list of filters in square brackets. Your query must end in a semicolon. Examples of the expected format are below:

1. **Movie:**
    ```
    Title[type=movie, year=XXXX, language=XX];
    ```
2. **TV show:**
    *Note:* `all_seasons` *and* `all_episodes` *default to false. If you set* `all_episodes=true`*, then all seasons will automatically be imported as well).*
    ```
    Title[type=tv, year=XXXX, language=XX, all_seasons=true|false, all_episodes=true|false];
    ```
3. *Coming Soon* **TV show (specific season):**
    ```
    Title[type=tv, season=XX, year=XXXX, language=XX];
    ```
4. *Coming Soon* **TV show (specific episode):**
    ```
    Title[type=tv, episode=XX, year=XXXX, language=XX];
    ```

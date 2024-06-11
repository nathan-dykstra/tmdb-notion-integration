# tmdb-notion-integration

Type the name of the movie or TV show, optionally followed by a comma-separated list of filters in square brackets. Examples of the expected format are below.

Notes:
- Your query must end in a semicolon
- If you specify `year`, you must also specify `type`
- `year` is a four digit number
- Extra whitespace in your query does not affect the results

Examples:

1. **Movie:**

    ```
    Title[type=movie, year=XXXX];
    ```

2. **TV show:**

    Notes:
    - `all_seasons` and `all_episodes` default to false
    - If you set `all_episodes=true`, then all seasons will automatically be imported as well

    ```
    Title[type=tv, all_seasons=true|false, all_episodes=true|false, year=XXXX];
    ```

3. **TV show (specific season):**

    Notes:
    - `season` is a number

    ```
    Title[type=tv, season=XX, year=XXXX];
    ```

4. **TV show (specific episode):**

    Notes:
    - `season` and `episode` are numbers
    - If you specify `episode`, you must also specify `season`

    ```
    Title[type=tv, season=XX, episode=XX, year=XXXX];
    ```

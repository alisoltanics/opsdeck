'use strict';
(function () {
  const OD = (window.OD = window.OD || {});
  OD.help = OD.help || {};

  const SHARED_ASK_AI = {
    name: 'Ask AI',
    description: 'Opens the AI assistant with live context about the page you are on (and the selected connection), so you can ask questions about what you see. It only appears when the AI feature is available.',
  };

  Object.assign(OD.help, {
    'databases/dashboard': {
      title: 'Dashboard',
      summary: 'A one-screen overview of your database connections, the databases OpsDeck found on this machine (Docker, local services, Kubernetes) and the most recent database activity.',
      whenToUse: [
        'You just opened the Databases workspace and want to see what is connected and what is healthy.',
        'You want to know which databases are running on this machine that you have not added yet.',
        'You want a quick look at what was done recently (connections, queries, schema changes).',
      ],
      howItWorks: [
        'Saved connections come from the profiles stored on this computer (see Connections). Discovery results come from a live scan of Docker, local services and the selected Kubernetes context. The scan runs when you open the page, and is reused for a few seconds if you come back quickly. Press Discover to force a fresh scan.',
        '"Connected" means OpsDeck currently holds an open session to that database in this app. Sessions are opened on demand when you browse, query or press Connect, and idle sessions are closed automatically after a while.',
        'Nothing on this page is made up: every number is read from the database service in the app.',
      ],
      parts: [
        {
          name: 'Page header buttons',
          description: 'Actions at the top right of the page.',
          items: [
            { name: 'Discover', description: 'Re-scans Docker, local services and Kubernetes. A toast tells you how many databases were found in each place.' },
            { name: 'New connection', description: 'Opens the connection form (a side drawer) to add a database profile.' },
            { name: 'Refresh', description: 'Reloads the page data.' },
            SHARED_ASK_AI,
          ],
        },
        {
          name: 'Credential storage banner',
          description: 'A banner that tells you how passwords are protected. Green: "Credentials protected by the OS keyring" (the operating system keyring is used). Amber: "Credentials encrypted with AES-256-GCM" means no keyring was found, so OpsDeck uses its own encrypted key file with owner-only permissions. In both cases passwords never reach the page you are looking at.',
        },
        {
          name: 'Summary cards',
          description: 'Four cards at the top.',
          items: [
            { name: 'Connections', description: 'How many connection profiles you have saved, with the number of favorites underneath (for example "5 favorites").' },
            { name: 'Connected now', description: 'Open sessions out of total profiles, for example 2/6. The note says "Live sessions in this window" or "No open sessions".' },
            { name: 'Engines available', description: 'How many database engines OpsDeck can really connect to (PostgreSQL, MySQL, MariaDB, SQLite, MongoDB, Redis, Elasticsearch, OpenSearch). The note shows how many more are planned but not usable yet.' },
            { name: 'Discovered databases', description: 'Total found by discovery, split as "3 Docker, 1 local, 0 Kubernetes". Shows a dash and "Scanning..." until the first scan ends.' },
          ],
        },
        {
          name: 'Discovery',
          description: 'Three clickable cards, one each for Docker, Local services and Kubernetes. Each shows the number of databases found and "N reachable, M not reachable". Click a card to open its page (Docker databases, Local databases, Kubernetes databases). If a source cannot be scanned (for example Docker is not running) the card says "unavailable" with the reason.',
        },
        {
          name: 'Connection health',
          description: 'A table of up to 10 saved connections with their state. Click the "All connections" link to open the full list.',
          items: [
            { name: 'Connect / Disconnect (row button)', description: 'Opens or closes a session for that connection.' },
            { name: 'Performance (row button)', description: 'Jumps to the Performance page for that connection.' },
            { name: 'Connection name link', description: 'Opens that connection in the Explorer.' },
          ],
        },
        {
          name: 'Recent activity',
          description: 'The 6 latest entries of the Activity log (When, Operation, Connection, Message). Green badges are successes, amber are warnings, red are failures. "Open log" goes to the full Activity log.',
        },
        {
          name: 'Last connected line',
          description: 'A small line at the bottom listing the connections you opened most recently (up to 5). Click a name to explore it. It is hidden if you have never connected.',
        },
      ],
      tables: [
        {
          name: 'Connection health table',
          columns: [
            { name: 'Connection', meaning: 'Name of the saved profile. Click to explore it.', example: 'shop-db' },
            { name: 'Engine', meaning: 'Database type. A grey "planned" badge means the engine is recognised but cannot be connected to yet.', example: 'PostgreSQL' },
            { name: 'Status', meaning: 'connected (green): session open. error (red): the last attempt failed. idle (grey): no session open right now.', example: 'connected' },
            { name: 'Last connected', meaning: 'How long ago the last successful connection was, or "never".', example: '12 minutes ago' },
          ],
        },
        {
          name: 'Recent activity table',
          columns: [
            { name: 'When', meaning: 'Relative time. Hover to see the exact date and time.', example: '3 minutes ago' },
            { name: 'Operation', meaning: 'The kind of action, colored by outcome.', example: 'query (green)' },
            { name: 'Connection', meaning: 'Which connection it was run on.', example: 'shop-db' },
            { name: 'Message', meaning: 'Short description of what happened.', example: 'SELECT returned 25 rows' },
          ],
        },
      ],
      example: {
        title: 'Example: check your setup after starting Docker',
        steps: [
          'Open Databases > Dashboard.',
          'Look at the "Discovered databases" card: it says "1 Docker, 0 local, 0 Kubernetes".',
          'Click the Docker card to open the Docker databases page and connect to the new container.',
          'Come back to the Dashboard: "Connected now" now reads 1/1 and the connection shows a green "connected" badge.',
        ],
      },
      tips: [
        'Discovery only detects databases. It never creates a profile or guesses passwords by itself.',
        'If a card says "unavailable", open its page: it explains why (for example Docker is not installed or no Kubernetes context is selected).',
        'The dashboard only lists the first 10 connections. Use Connections for the full list.',
      ],
    },

    'databases/connections': {
      title: 'Connections',
      summary: 'Create, edit, group, test, import and export the saved profiles that tell OpsDeck how to reach each database.',
      whenToUse: [
        'You want to add a new database (local, Docker, Kubernetes or remote).',
        'You need to change a host, port, password or TLS setting.',
        'You want to mark a connection read-only so nobody can write to it by accident.',
        'You are moving your connection list to another computer or sharing it with a teammate.',
      ],
      howItWorks: [
        'A connection is only a saved profile (engine, host, port, user, options). Saving a profile does not open a session. Press Connect (or just open the Explorer or SQL editor) when you want to use it.',
        'Profiles are stored locally on this computer. Passwords are encrypted by the app and are never shown again: when you edit a profile, a "stored" badge appears next to Password and leaving the field blank keeps the existing password.',
        'Connections are grouped by their Group field (or "Ungrouped") into one card per group. Favorites are also pinned in a bar at the top for one-click access to the Explorer.',
        'Supported engines: PostgreSQL, MySQL, MariaDB, SQLite, MongoDB, Redis, Elasticsearch and OpenSearch. Other engines are listed as "planned" in the form but cannot be selected.',
      ],
      parts: [
        {
          name: 'Page header buttons',
          items: [
            { name: 'Import', description: 'Loads connection profiles from an export file. The result toast says how many were created and how many were skipped. Passwords are never in an export, so you must enter them again.' },
            { name: 'Export', description: 'Saves all profiles to a file. The toast confirms the number of profiles and that no secrets were included.' },
            { name: 'New connection', description: 'Opens the connection form.' },
            { name: 'Refresh', description: 'Reloads the list.' },
            SHARED_ASK_AI,
          ],
        },
        {
          name: 'Favorites bar',
          description: 'Appears only when at least one connection is starred. Each chip shows the connection name and engine; clicking it opens the Explorer on that connection.',
        },
        {
          name: 'Group cards',
          description: 'One card per group with the group name and the number of connections in it. Each card contains a table of its connections.',
          items: [
            { name: 'Star button (next to the name)', description: 'Adds or removes the connection from your favorites.' },
            { name: 'Name link', description: 'Opens the edit form for that connection.' },
            { name: 'Connect / Disconnect', description: 'Opens or closes a session. A toast shows the server version when it connects, or the error if it fails.' },
            { name: 'Diagnostics', description: 'Jumps to the Diagnostics page for this connection to run step-by-step checks.' },
            { name: 'Edit connection', description: 'Opens the edit form.' },
            { name: 'Duplicate', description: 'Creates a copy of the profile (handy to point at another database on the same server).' },
            { name: 'Delete connection', description: 'Asks for confirmation, then removes the profile and its encrypted password. The database itself is not touched.' },
          ],
        },
        {
          name: 'Connection form (side drawer)',
          description: 'Opened by New connection or by editing a row. Fields change with the engine: SQLite shows a file picker instead of host and port.',
          items: [
            { name: 'Connection name', description: 'A label you choose. It is required to save.' },
            { name: 'Engine', description: 'The database type. Choosing one fills in its default port (5432 PostgreSQL, 3306 MySQL/MariaDB, 27017 MongoDB, 6379 Redis, 9200 Elasticsearch/OpenSearch). Planned engines are greyed out.' },
            { name: 'Host and Port', description: 'Where the server listens, for example 127.0.0.1 and 5432.' },
            { name: 'SQLite file (with Browse)', description: 'Path to the .sqlite file for SQLite connections. Browse opens a file picker and uses the file name as the connection name if it is empty.' },
            { name: 'Username and Password', description: 'Both optional (Redis or SQLite often need none). Password is stored encrypted, never in plain text.' },
            { name: 'Default database', description: 'The database used first when you open the Explorer or SQL editor.' },
            { name: 'Group', description: 'Free text used to group connections, for example "production". Connections created from a Compose project use the project name.' },
            { name: 'TLS mode', description: 'disable, allow, prefer, require, verify-ca or verify-full. Use require or verify-full for remote servers.' },
            { name: 'Connection timeout (ms)', description: 'How long to wait before giving up. 1000 to 60000, default 10000.' },
            { name: 'Pool size', description: 'Maximum simultaneous connections OpsDeck opens to this database (1 to 50, default 5).' },
            { name: 'Advanced options', description: 'Extra driver options written as key=value; key2=value2.' },
            { name: 'Read-only profile', description: 'Blocks write statements run from OpsDeck on this connection. A "read-only" badge then shows in the table.' },
            { name: 'Favorite', description: 'Pins the connection to the Favorites bar.' },
            { name: 'Validate TLS certificates', description: 'On by default. Turn it off only for servers with self-signed certificates you trust.' },
            { name: 'Test connection', description: 'Tries to connect with the values currently in the form, without saving. A toast shows the server version and response time, or the error.' },
            { name: 'Create connection / Save changes', description: 'Saves the profile. Fails with a message if the name is empty.' },
          ],
        },
      ],
      tables: [
        {
          name: 'Connections table (one per group)',
          columns: [
            { name: 'Name', meaning: 'Profile name, with a star to favorite it.', example: 'shop-db' },
            { name: 'Engine', meaning: 'Database type badge.', example: 'PostgreSQL' },
            { name: 'Target', meaning: 'Host and port, or the file path for SQLite.', example: '127.0.0.1:5432' },
            { name: 'Source', meaning: 'How the profile was created: manual (typed by you), or docker, compose, kubernetes, local when created from a discovery result.', example: 'compose' },
            { name: 'Status', meaning: 'connected, error or idle, plus an amber "read-only" badge when the profile blocks writes.', example: 'idle + read-only' },
          ],
        },
      ],
      example: {
        title: 'Example: add a local PostgreSQL',
        steps: [
          'Click New connection.',
          'Type the name "Local Postgres" and keep Engine = PostgreSQL (port becomes 5432).',
          'Host 127.0.0.1, Username "postgres", enter the password, Default database "postgres".',
          'Click Test connection. Wait for the green toast with the server version, for example "PostgreSQL 16.2 - 14 ms".',
          'Click Create connection. The profile appears in the "Ungrouped" card with status idle.',
          'Click the play (Connect) button, then open the Explorer to browse it.',
        ],
      },
      tips: [
        'Tick "Read-only profile" for production databases. Write statements are then refused by OpsDeck itself.',
        'Exported files never contain passwords. After an import, edit each profile and enter its password again.',
        'Deleting a profile never deletes any data in the database.',
        'If a connection fails, use Diagnostics to see which step (reachability, TLS, login, permissions) breaks.',
      ],
    },

    'databases/explorer': {
      title: 'Database explorer',
      summary: 'Browse the structure and contents of a connected database: schemas, tables, views, indexes, collections, indices or Redis keys, with a preview of the data.',
      whenToUse: [
        'You want to see which tables or collections exist and how big they are.',
        'You want a quick look at the first rows of a table without writing a query.',
        'You want to inspect or change the expiry of a Redis key.',
        'You want to leave a note about a table for yourself or your team.',
      ],
      howItWorks: [
        'Pick a connection at the top, then a database. OpsDeck opens the connection if needed and reads metadata. What you see depends on the engine: relational databases show schemas with tables and more; MongoDB shows collections; Elasticsearch/OpenSearch show indices; Redis shows keys.',
        'Click an object in the tree on the left to open it on the right. Previews are bounded: you see the first rows only, never the entire table.',
        'Your selected connection, database and expanded tree nodes are remembered when you restart the app.',
      ],
      parts: [
        {
          name: 'Header',
          items: [
            { name: 'Connection selector', description: 'Choose which saved connection to browse. Without any connection you get an empty state with a New connection button.' },
            { name: 'Refresh', description: 'Re-reads metadata from the database (use it after creating or dropping tables elsewhere).' },
            SHARED_ASK_AI,
          ],
        },
        {
          name: 'Toolbar',
          items: [
            { name: 'Database', description: 'Dropdown of databases visible to your user. For servers where it cannot be listed, it is a text field where you type the name.' },
            { name: 'Filter tables, views, keys', description: 'Type to narrow the tree on the left instantly.' },
            { name: 'SCAN pattern (Redis only)', description: 'A Redis glob pattern such as user:* to choose which keys are listed. The default * matches all.' },
            { name: 'Loading indicator', description: '"Reading metadata..." while data is being fetched.' },
          ],
        },
        {
          name: 'Object tree (left)',
          description: 'Differs by engine. A small count badge sits next to each node.',
          items: [
            { name: 'Relational (PostgreSQL, MySQL, MariaDB, SQLite)', description: 'Each schema contains Tables (with an estimated row count), Views, Indexes, Functions & procedures, Triggers and Sequences when they exist. At database level you may also see Users & roles (superusers are marked) and Extensions. Only tables and views can be opened on the right.' },
            { name: 'MongoDB', description: 'List of collections with document counts. If the server has several databases, chips below the list let you switch database and show its size.' },
            { name: 'Elasticsearch / OpenSearch', description: 'List of indices with document counts.' },
            { name: 'Redis', description: 'List of keys matching the pattern. A badge like 3600s shows the remaining TTL. Hover a key for its type and memory. "Load more" fetches the next batch (SCAN cursor); it reads "End of SCAN" when there are no more.' },
          ],
        },
        {
          name: 'Object detail (right)',
          description: 'Empty until you click an object ("Inspect an object").',
          items: [
            { name: 'Query', description: 'Opens the SQL editor with a ready-made statement for that object.' },
            { name: 'Copy name', description: 'Copies the object name to the clipboard.' },
            { name: 'Row badges', description: '"N rows shown", "N total" when known, and an amber "bounded" badge when the preview was cut short.' },
            { name: 'Data preview', description: 'A table of the first rows (up to 200 shown). NULL values are shown as NULL; objects are shown as compact JSON. Documents and other non-tabular data are shown as formatted JSON.' },
            { name: 'Investigation notes', description: 'A notes box for this object. Add note opens a dialog; each note shows its author and age and has a delete button. Notes are stored locally and included in the query library export.' },
          ],
        },
        {
          name: 'Redis key detail',
          description: 'Shown when you select a key.',
          items: [
            { name: 'Key facts', description: 'Type (string, hash, list, set, zset, stream), TTL ("no expiry", seconds left, or "missing"), memory used, internal encoding and length.' },
            { name: 'Value view', description: 'Strings are shown as text; hashes as a Field/Value table; sorted sets as a Member/Score table; other types as JSON.' },
            { name: 'Edit TTL', description: 'Asks for seconds. 0 makes the key permanent; a negative number deletes it.' },
            { name: 'Delete', description: 'Red button. Asks for confirmation, then permanently deletes the key.' },
          ],
        },
      ],
      tables: [
        {
          name: 'Preview table',
          description: 'Columns are the columns of the table you opened.',
          columns: [
            { name: 'Column headers', meaning: 'Same as the database columns of the opened table or view.', example: 'id, email, created_at' },
            { name: 'Cells', meaning: 'Values as stored. Long text is shortened (hover for more). NULL means "no value".', example: '42 | ada@example.com | 2026-03-02T10:14:00Z' },
          ],
        },
      ],
      example: {
        title: 'Example: look at the orders table',
        steps: [
          'Choose "Local Postgres" in the connection selector and "shop" in the Database dropdown.',
          'Expand the "public" schema, then Tables.',
          'Type "ord" in the filter box. The tree shows "orders  12,480" (about 12,480 rows).',
          'Click "orders". The right side shows the first rows with badges "200 rows shown" and "12,480 total".',
          'Click Query to jump to the SQL editor and refine the query.',
        ],
      },
      tips: [
        'Row counts in the tree are estimates from the database statistics, not exact counts.',
        'Redis keys are read with SCAN in small batches so a large database is not blocked. Prefer a specific pattern over *.',
        'Delete and Edit TTL change real data on the Redis server, so double check the key name before confirming.',
        'Indexes, functions, triggers, sequences, users and extensions are shown for information only and cannot be opened.',
      ],
    },

    'databases/editor': {
      title: 'SQL editor',
      summary: 'Write and run queries (or engine commands) against a connection, read the results, explain the execution plan, export data and keep a library of saved queries.',
      whenToUse: [
        'You need an answer from the data that the Explorer preview cannot give.',
        'You want to check how a query will be executed (Explain).',
        'You want to export a result as CSV, JSON or SQL.',
        'You want AI help to draft a query from plain words.',
      ],
      howItWorks: [
        'Choose a connection and database in the header, type the statement in the text area and press Run (or Ctrl+Enter). If text is selected, Run selection (or Ctrl+Enter) runs only the selection. The editor offers autocomplete for table and column names.',
        'Results are bounded before they reach the screen (default 1000 rows) and the page tells you when they were truncated. Each statement is also written to Query history and to the Activity log.',
        'Safety: a connection marked read-only refuses write statements. Even on a normal connection, risky statements (DROP, TRUNCATE, DELETE or UPDATE without WHERE, ALTER TABLE ... DROP, FLUSHALL/FLUSHDB/SHUTDOWN) trigger a "Destructive statement" confirmation with a "Run anyway" button. Nothing runs until you confirm.',
        'Not only SQL: for Redis you type commands (SCAN 0 MATCH user:* COUNT 100); for MongoDB a JSON command ({"find":"users","filter":{},"limit":10}); for Elasticsearch/OpenSearch a JSON search body ({"query":{"match_all":{}},"size":10}). A blue banner repeats these hints. Broad KEYS patterns and dangerous Redis commands (FLUSHALL, CONFIG, SHUTDOWN and similar) are blocked.',
      ],
      parts: [
        {
          name: 'Header',
          items: [
            { name: 'Connection and database selectors', description: 'Pick where the query runs. The subtitle shows the engine and "read-only profile" when writes are blocked.' },
            { name: 'Refresh', description: 'Reloads the database list.' },
            SHARED_ASK_AI,
          ],
        },
        {
          name: 'AI query assistant',
          description: 'Shown for SQL engines only (not Redis, MongoDB or Elasticsearch).',
          items: [
            { name: 'Describe the data you need', description: 'Type plain words such as "orders created today with their customer name, newest first" (up to 2000 characters).' },
            { name: 'Generate query (Ctrl+Enter)', description: 'Sends only table and column names plus your sentence to the configured AI provider. Never credentials or row data. Nothing is executed.' },
            { name: 'Answer panel', description: 'Shows an explanation, the SQL, and sometimes a Django ORM version. When there are several variants, tabs let you switch. "Use in editor" copies the SQL into the editor; Copy copies it to the clipboard. Always review before running.' },
            { name: 'Not configured', description: 'If no AI provider is set up, a red banner says so with an Open settings button.' },
          ],
        },
        {
          name: 'Editor bar',
          description: 'A dialect badge (for example postgres, mysql) and a hint line, then the action buttons.',
          items: [
            { name: 'Run', description: 'Runs the whole text. Shows "Running..." while busy.' },
            { name: 'Run selection', description: 'Runs only the highlighted text.' },
            { name: 'Explain', description: 'Shows the execution plan instead of running the statement. The plan appears in an "Execution plan" card with a Copy button.' },
            { name: 'Save query', description: 'Opens a dialog to store the statement in your library: name, description, tags (comma separated, up to 8) and author, with a preview of the SQL.' },
            { name: 'Library (N)', description: 'Shows or hides the Query library card. N is how many queries are saved.' },
            { name: 'Cancel', description: 'Asks the server to stop the running query. A toast says "Cancellation requested" or "Nothing to cancel".' },
          ],
        },
        {
          name: 'Query library card',
          description: 'Saved queries stored locally on this computer.',
          items: [
            { name: 'Search box and tag filter', description: 'Filter by name, SQL text, tag or author, and narrow to one tag.' },
            { name: 'Load', description: 'Puts the saved query (and its connection and database) back in the editor.' },
            { name: 'Delete (trash)', description: 'Removes the saved query.' },
            { name: 'Export / Import', description: 'Saves the whole library to a file, or loads one from a teammate. Investigation notes from the Explorer travel with the export.' },
            { name: 'Close', description: 'Hides the card.' },
          ],
        },
        {
          name: 'Query results card',
          description: 'Appears after a successful run.',
          items: [
            { name: 'Table / JSON / Raw tabs', description: 'Table is a grid (click a column header to sort, click again to reverse). JSON shows formatted rows. Raw shows one JSON object per line. JSON and Raw show up to 500 rows.' },
            { name: 'Search results', description: 'Filters the rows already returned (it does not run a new query).' },
            { name: 'CSV / JSON / SQL buttons', description: 'Exports the current result to a file. SQL exports INSERT statements for table "exported_rows".' },
            { name: 'Pager', description: 'Appears when there are more than 100 rows: Previous, "Page 2 of 5", Next.' },
            { name: 'Empty result', description: 'For statements that return no rows (INSERT, UPDATE), a "Statement completed" message shows how many rows were affected.' },
          ],
        },
        {
          name: 'Error banner',
          description: 'A red "Query failed" banner with the database error and a Copy error button.',
        },
      ],
      tables: [
        {
          name: 'Result badges',
          description: 'Small badges above the results.',
          columns: [
            { name: 'N rows', meaning: 'Rows shown in the result.', example: '25 rows' },
            { name: 'N returned', meaning: 'Amber. The server returned more rows than are shown here.', example: '4,200 returned' },
            { name: 'Duration', meaning: 'How long the database took.', example: '38 ms' },
            { name: 'N affected', meaning: 'Rows changed by INSERT/UPDATE/DELETE.', example: '3 affected' },
            { name: 'truncated by row limit', meaning: 'Amber. The result hit the row limit; add LIMIT/WHERE or use a narrower query.', example: 'truncated by row limit' },
            { name: 'Command tag', meaning: 'The type of command the server reports.', example: 'SELECT' },
          ],
        },
      ],
      example: {
        title: 'Example: find recent orders and save the query',
        steps: [
          'Select "Local Postgres" and database "shop".',
          'Type: SELECT id, total, created_at FROM orders ORDER BY created_at DESC LIMIT 20;',
          'Press Ctrl+Enter. The results show "20 rows" and "12 ms".',
          'Click the "total" header to sort by amount, then click CSV to export the rows.',
          'Click Save query, name it "Latest orders", tag it "orders" and save. Find it later under Library.',
        ],
      },
      tips: [
        'Prefer Explain before running a heavy query on a busy production database.',
        'A DELETE or UPDATE without a WHERE clause will ask for confirmation. Read the message before pressing "Run anyway".',
        'On a read-only profile, only read statements (SELECT, WITH, VALUES and similar) run. Others return the message "This connection is read-only".',
        'Result sorting and searching only work on the rows already loaded, not on the whole table.',
      ],
    },

    'databases/history': {
      title: 'Query history',
      summary: 'A list of statements you ran through the SQL editor on this computer, with their outcome, row count and duration.',
      whenToUse: [
        'You want to re-run or recover a query you wrote earlier.',
        'You want to see which queries failed and why.',
        'You want to check how long past queries took.',
      ],
      howItWorks: [
        'Every statement run from the SQL editor is recorded automatically, successful or not. Values that look like credentials are redacted. The page shows the latest 300 entries, newest first.',
        'History is local to this computer. It is different from the Activity log, which also records connections, schema changes and service actions.',
      ],
      parts: [
        {
          name: 'Header buttons',
          items: [
            { name: 'Clear history', description: 'Asks for confirmation, then deletes the recorded history on this host. Activity logs are kept.' },
            { name: 'Refresh', description: 'Reloads the list.' },
            SHARED_ASK_AI,
          ],
        },
        {
          name: 'History table',
          description: 'One row per statement. Empty until you run something in the editor ("No queries recorded yet").',
          items: [
            { name: 'Open in editor (row button)', description: 'Loads the statement into the SQL editor so you can run or edit it.' },
            { name: 'Copy SQL (row button)', description: 'Copies the statement to the clipboard.' },
          ],
        },
      ],
      tables: [
        {
          name: 'History table',
          columns: [
            { name: 'When', meaning: 'Relative time. Hover for the exact date.', example: '5 minutes ago' },
            { name: 'Connection', meaning: 'Connection name, with the engine below it.', example: 'Local Postgres / postgres' },
            { name: 'Status', meaning: 'success (green) or failed (red).', example: 'failed' },
            { name: 'Rows', meaning: 'Rows returned or affected.', example: '20' },
            { name: 'Duration', meaning: 'Execution time.', example: '38 ms' },
            { name: 'Statement', meaning: 'The SQL, shortened (hover for more). For failures the database error appears in red below it.', example: 'SELECT * FROM orderz  /  relation "orderz" does not exist' },
          ],
        },
      ],
      example: {
        title: 'Example: fix a failed query',
        steps: [
          'Open Query history and find the row with the red "failed" badge.',
          'Read the error under the statement: relation "orderz" does not exist.',
          'Click Open in editor, correct the table name to "orders" and press Run.',
        ],
      },
      tips: [
        'Clear history only removes this list, not the Activity log.',
        'For statistics such as slowest or most frequent queries, see the Intelligence page.',
      ],
    },

    'databases/local': {
      title: 'Local databases',
      summary: 'Database services installed directly on this computer (not in Docker), detected from listening ports, processes and installed programs, with start, stop and restart controls.',
      whenToUse: [
        'You installed PostgreSQL, MySQL, Redis or similar on this machine and want to connect to it.',
        'A local database is not responding and you want to see whether it is running.',
        'You want to start, stop or restart a local database service.',
      ],
      howItWorks: [
        'OpsDeck checks which database ports are listening on 127.0.0.1, which processes are running and which database programs are installed. The scan runs when you open the page and is reused for a few seconds; use Rescan to force it.',
        'Start, stop and restart use systemd (systemctl) on this machine. If no service unit exists for the engine, OpsDeck shows the real failure instead of pretending it worked.',
        'Docker databases are listed on the Docker databases page, not here.',
      ],
      parts: [
        {
          name: 'Header buttons',
          items: [
            { name: 'Rescan', description: 'Runs discovery again.' },
            { name: 'Refresh', description: 'Reloads the page.' },
            SHARED_ASK_AI,
          ],
        },
        {
          name: 'Row actions',
          items: [
            { name: 'Open', description: 'Shown when a connection profile already exists for this database. Opens it in the Explorer.' },
            { name: 'Connect', description: 'Shown when the service is listening and no profile exists. Opens the New connection form pre-filled with host and port; you add user and password, then save.' },
            { name: 'Start the service to connect', description: 'Replaces Connect when the service is stopped.' },
            { name: 'Start service (play)', description: 'Shown for stopped services.' },
            { name: 'Restart service / Stop service', description: 'Shown for listening services. Each asks for confirmation first.' },
          ],
        },
        {
          name: 'Service management banner',
          description: 'A reminder that start, stop and restart go through systemctl and report failures honestly.',
        },
        {
          name: 'Empty and error states',
          description: '"No local database services found" when nothing was detected. A red banner appears if the machine could not be inspected.',
        },
      ],
      tables: [
        {
          name: 'Local services table',
          columns: [
            { name: 'Engine', meaning: 'The type of database. A grey "planned" badge means it is recognised but not supported yet.', example: 'PostgreSQL' },
            { name: 'Endpoint', meaning: 'Host and port it listens on.', example: '127.0.0.1:5432' },
            { name: 'Process', meaning: 'Name of the running process, if found.', example: 'postgres' },
            { name: 'Binary', meaning: 'Path of the installed program, or an amber "not on PATH" badge if it was not found.', example: '/usr/bin/psql' },
            { name: 'State', meaning: 'listening (green): accepting connections on the port. stopped (grey): nothing is listening.', example: 'listening' },
          ],
        },
      ],
      example: {
        title: 'Example: connect to a local Redis',
        steps: [
          'Open Local databases. A row shows Redis, 127.0.0.1:6379, state "listening".',
          'Click Connect. The New connection form opens with host and port filled in.',
          'Click Test connection, then Create connection.',
          'The row now shows an Open button that jumps to the Explorer.',
        ],
      },
      tips: [
        'A stopped service cannot accept connections. Start it first, then connect.',
        'Restart and Stop interrupt every client that is using that database.',
        'Starting a service may need system permissions; if it fails, the error message comes straight from systemctl.',
      ],
    },

    'databases/docker': {
      title: 'Docker databases',
      summary: 'Database containers found in Docker, grouped by Compose project, with their ports, storage and state, plus controls to connect, start, stop, restart and read logs.',
      whenToUse: [
        'You run databases in Docker or Docker Compose and want to connect to them without typing ports.',
        'A container database is unreachable and you want to know why.',
        'You want to check whether a database container keeps its data on a volume.',
      ],
      howItWorks: [
        'OpsDeck looks at running and stopped containers and recognises databases from image names, ports, environment variable names, labels and metadata. The "detection" badge shows how sure it is (high, medium, low); hover it to see the reasons.',
        'A running container does not prove the database accepts connections. OpsDeck tests each candidate before saving a profile and never guesses credentials.',
        'Containers with no published host port can only be reached from inside the Docker network. OpsDeck will not guess internal IP addresses; instead, "How to connect" shows the exact fix.',
        'Rows are grouped into one card per Compose project ("Compose project - shop") and one "Standalone containers" card.',
      ],
      parts: [
        {
          name: 'Header buttons',
          items: [
            { name: 'Rescan', description: 'Runs discovery again.' },
            { name: 'Refresh', description: 'Reloads the page.' },
            SHARED_ASK_AI,
          ],
        },
        {
          name: 'Banners',
          items: [
            { name: 'Detection, not assumption', description: 'Blue note explaining that OpsDeck tests candidates and does not guess credentials.' },
            { name: 'Some databases are not reachable', description: 'Amber note shown when at least one container has no usable host port.' },
          ],
        },
        {
          name: 'Row actions',
          items: [
            { name: 'Open', description: 'Shown when a profile already exists. Opens the Explorer on it.' },
            { name: 'Connect', description: 'Shown for reachable, supported databases without a profile. Opens the New connection form pre-filled (name, engine, host, published port, group = Compose project). You add user and password.' },
            { name: 'How to connect', description: 'Shown when it cannot be reached. Opens a help dialog. Depending on the case: "This container is not running" (with a Start container button), "Publish a host port to connect" (shows the ports line to add to your compose.yml and the docker compose or docker run command, plus a Rescan now button), or "No adapter for this engine yet" when the engine is detected but unsupported (button reads "Not supported").' },
            { name: 'Stop / Start container', description: 'Stops a running container or starts a stopped one. Stopping asks for confirmation because every client loses the database.' },
            { name: 'Restart container', description: 'Restarts the container after confirmation.' },
            { name: 'Container logs', description: 'Opens a log viewer for the container.' },
            { name: 'Open in Docker workspace', description: 'Jumps to the Containers page of the Docker workspace.' },
          ],
        },
        {
          name: 'Empty and error states',
          description: '"No database containers detected" when none were found. A red "Docker discovery unavailable" banner appears if Docker cannot be reached.',
        },
      ],
      tables: [
        {
          name: 'Docker databases table',
          columns: [
            { name: 'Database', meaning: 'Container or service name, with the Compose service or short container id below.', example: 'shop-db-1 / db' },
            { name: 'Engine', meaning: 'Detected engine plus a "detection high/medium/low" badge.', example: 'PostgreSQL, detection high' },
            { name: 'Image', meaning: 'Docker image the container was created from.', example: 'postgres:16' },
            { name: 'Container', meaning: 'State badge (running, exited...) with the status text and short container id.', example: 'running, Up 2 hours, a1b2c3d4' },
            { name: 'Ports', meaning: 'If published: host address and port with the container port below it. If not: the container port with an amber "internal only" badge.', example: '127.0.0.1:5433 -> 5432/tcp' },
            { name: 'Storage', meaning: 'green "volume" = data on a named Docker volume; green "bind mount" = data in a host folder; red "ephemeral" = data is lost when the container is removed.', example: 'volume' },
          ],
        },
      ],
      example: {
        title: 'Example: connect to a Compose Postgres that is "internal only"',
        steps: [
          'Open Docker databases. The "shop" Compose project lists service "db" with Ports "5432/tcp - internal only".',
          'Click How to connect. The dialog shows the lines to add: ports: - "5433:5432".',
          'Add them to your compose.yml and run the shown command: docker compose -p shop up -d db.',
          'Click Rescan now. The row now shows 127.0.0.1:5433 and a Connect button.',
          'Click Connect, enter the user and password, then Create connection.',
        ],
      },
      tips: [
        'A red "ephemeral" storage badge means a container removal destroys the data. Add a volume before storing anything important.',
        'Stopping or restarting a container interrupts all of its clients.',
        'The host port in the suggested fix is only a suggestion; any free port works.',
      ],
    },

    'databases/kubernetes': {
      title: 'Kubernetes databases',
      summary: 'Database workloads (Pods and StatefulSets) found in the selected Kubernetes context and namespace, with one-click connection through a safe port-forward.',
      whenToUse: [
        'Your databases run in a Kubernetes cluster and you want to browse or query them from your computer.',
        'You want to see which database pods exist and whether they are ready.',
      ],
      howItWorks: [
        'The page uses the context and namespace currently selected in the Kubernetes workspace (shown under the title). Pods and StatefulSets whose images match a supported database engine are listed.',
        'Pod IP addresses are normally not reachable from your computer, so OpsDeck never uses them. Connecting starts a controlled kubectl port-forward to 127.0.0.1 using the selected context and namespace, and stops it when you disconnect.',
        'If no context is selected the page shows "No cluster context selected" with an Open contexts button. If Kubernetes cannot be reached, a red "Kubernetes discovery unavailable" banner explains why.',
      ],
      parts: [
        {
          name: 'Header buttons',
          items: [
            { name: 'Rescan', description: 'Runs discovery again.' },
            { name: 'Refresh', description: 'Reloads the page.' },
            SHARED_ASK_AI,
          ],
        },
        {
          name: 'Port forwarding banner',
          description: 'A blue note repeating how connections are made (kubectl port-forward on 127.0.0.1).',
        },
        {
          name: 'Row actions',
          items: [
            { name: 'Open', description: 'Shown when a profile already exists. Opens the Explorer on it.' },
            { name: 'Connect', description: 'Opens the New connection form pre-filled with the pod, namespace and context. You add user and password, then save. The port-forward starts when you connect.' },
            { name: 'Open workload in Kubernetes', description: 'Jumps to the StatefulSets page (for StatefulSets) or the Pods page (for pods) of the Kubernetes workspace.' },
          ],
        },
        {
          name: 'Empty state',
          description: '"No database workloads detected": only Pods and StatefulSets whose images match a supported engine appear.',
        },
      ],
      tables: [
        {
          name: 'Kubernetes databases table',
          columns: [
            { name: 'Workload', meaning: 'Workload name with its namespace below.', example: 'postgres-0 / production' },
            { name: 'Engine', meaning: 'Detected engine with a "detection" confidence badge.', example: 'PostgreSQL, detection high' },
            { name: 'Kind', meaning: 'StatefulSet or Pod.', example: 'StatefulSet' },
            { name: 'Status', meaning: 'Pod status badge (for example Running) with the ready count below.', example: 'Running, 1/1' },
            { name: 'Access', meaning: 'How OpsDeck reaches it. Always "kubectl port-forward".', example: 'kubectl port-forward' },
          ],
        },
      ],
      example: {
        title: 'Example: query a database inside the cluster',
        steps: [
          'In the Kubernetes workspace select the context and namespace "production".',
          'Open Kubernetes databases: "postgres-0, StatefulSet, Running 1/1" is listed.',
          'Click Connect, enter the username and password and save.',
          'Open the Explorer or SQL editor: OpsDeck starts the port-forward automatically and stops it when you disconnect.',
        ],
      },
      tips: [
        'You need kubectl access to the cluster and permission to port-forward to the pod.',
        'Rescan after switching context or namespace in the Kubernetes workspace.',
        'Mark production profiles as read-only in the connection form before running queries.',
      ],
    },

    'databases/performance': {
      title: 'Performance',
      summary: 'Live health metrics for one connected database: connections, cache efficiency, size, uptime, running and slow queries, and engine-specific details.',
      whenToUse: [
        'The application feels slow and you want to see what the database is doing.',
        'You want to find long-running or slow queries.',
        'You want to check how close you are to the connection limit or memory limit.',
      ],
      howItWorks: [
        'Choose a connection. OpsDeck reads metrics directly from the database server when the page opens and when you refresh. Values are shown as reported; nothing is estimated or smoothed.',
        'Only metrics the engine and your user can expose are shown, so the cards differ between PostgreSQL, MySQL/MariaDB, MongoDB, Redis and Elasticsearch. If your user lacks permission, an amber "Metrics unavailable" banner explains why.',
        'A refresh interval selector can reload the data automatically. After two or more reads, a footnote shows how many samples were collected in this session.',
      ],
      parts: [
        {
          name: 'Header controls',
          items: [
            { name: 'Connection selector', description: 'Which database to measure.' },
            { name: 'Refresh interval', description: 'Manual refresh (default), or every 5, 15, 30 or 60 seconds. Automatic refresh only runs while this page is open.' },
            { name: 'Refresh', description: 'Reads metrics now. Shows "Reading..." while busy.' },
            SHARED_ASK_AI,
          ],
        },
        {
          name: 'Metric cards',
          description: 'Only cards that the engine reports are shown.',
          items: [
            { name: 'Active connections', description: 'Sessions currently open, with "of N max" when the limit is known. Example: 18 of 100 max.' },
            { name: 'Cache hit ratio', description: 'Percentage of reads served from memory. Higher is better; a low value often means the database needs more memory or better indexes. Example: 99.2%.' },
            { name: 'Database size', description: 'Size on disk where reported. Example: 2.4 GB.' },
            { name: 'Uptime', description: 'How long the server process has been running.' },
            { name: 'Memory used', description: 'Memory in use (Redis), with the maximum if configured.' },
            { name: 'Commands / sec', description: 'Current operations per second (Redis).' },
            { name: 'Cluster health', description: 'Elasticsearch/OpenSearch status: GREEN, YELLOW or RED, with node and shard counts.' },
            { name: 'Tables', description: 'Number of tables and indexes (SQLite and similar).' },
          ],
        },
        {
          name: 'Detail sections',
          description: 'Shown when data exists.',
          items: [
            { name: 'Connection states', description: 'Sessions grouped by state, for example active, idle, idle in transaction.' },
            { name: 'Long-running queries', description: 'Queries running longer than about a second: PID, user, state, duration and the query text.' },
            { name: 'Slow query analysis', description: 'Most expensive statements with calls, mean time and rows. It needs pg_stat_statements on PostgreSQL or the performance schema on MySQL; otherwise an amber "Extension not available" banner says so.' },
            { name: 'Transactions', description: 'Committed, rolled back, deadlocks and temporary bytes written.' },
            { name: 'Operations', description: 'MongoDB operation counters (insert, query, update, delete...).' },
            { name: 'Replication', description: 'For MongoDB, a members table (name, state, lag). For Redis, role, connected replicas and master link status.' },
            { name: 'Clients', description: 'Connected Redis clients (address, name, database, last command).' },
            { name: 'Redis slow log', description: 'Slowest recent Redis commands with time and duration.' },
          ],
        },
      ],
      tables: [
        {
          name: 'Long-running queries',
          columns: [
            { name: 'PID', meaning: 'Process or session id of the query.', example: '4812' },
            { name: 'User', meaning: 'Database user running it.', example: 'app_user' },
            { name: 'State', meaning: 'What the session is doing.', example: 'active' },
            { name: 'Duration', meaning: 'How long it has been running.', example: '42s' },
            { name: 'Query', meaning: 'The SQL text, shortened.', example: 'SELECT ... FROM orders JOIN items ...' },
          ],
        },
        {
          name: 'Slow query analysis',
          columns: [
            { name: 'Query', meaning: 'Normalised statement text.', example: 'SELECT * FROM orders WHERE customer_id = $1' },
            { name: 'Calls', meaning: 'How many times it ran.', example: '15,230' },
            { name: 'Mean time', meaning: 'Average time per call.', example: '84.50 ms' },
            { name: 'Rows', meaning: 'Rows returned or examined.', example: '120' },
          ],
        },
      ],
      example: {
        title: 'Example: find what is slowing PostgreSQL down',
        steps: [
          'Choose "Local Postgres" and set the interval to "Every 15s".',
          'Check Active connections: 96 of 100 max means you are near the limit.',
          'Open Long-running queries: a query by "report_user" has run for 3 minutes.',
          'Copy the query text and open it in the SQL editor with Explain to see why it is slow.',
        ],
      },
      tips: [
        'Deeper checks, findings and trends are on the Intelligence page.',
        'A very low cache hit ratio right after a restart is normal; the cache needs time to warm up.',
        'Automatic refresh adds load on the server. Use Manual refresh on fragile production databases.',
      ],
    },

    'databases/insights': {
      title: 'Intelligence',
      summary: 'Read-only analysis of one connection: a health score, findings, schema review, table relationships, schema changes over time, running sessions, query statistics and a forecast.',
      whenToUse: [
        'You want an overall health check of a database in one page.',
        'You want to spot design problems such as tables without a primary key.',
        'You want to know whether the schema changed since your last look.',
        'You want to find blocked sessions or queries that got slower.',
      ],
      howItWorks: [
        'Choose a connection in the Connection card. The page reads metadata and metrics, computes results, and refreshes itself every 90 seconds while open. Refresh forces a new read.',
        'Analysis only reads: no write query is issued. Anything that could not be measured is shown as "unknown" or listed under Limitations, never counted as healthy.',
        'The first time a schema is read it is stored as a baseline; later reads are compared against it.',
        'Some sections need an engine feature (for example schema and dependency analysis work on relational engines only). When a section is not available it says why.',
      ],
      parts: [
        {
          name: 'Header buttons',
          items: [
            { name: 'Cross-module view', description: 'Opens the Intelligence workspace overview that combines Docker, Databases, Kubernetes and Observability.' },
            { name: 'Refresh', description: 'Reads and recomputes everything now.' },
          ],
        },
        {
          name: 'Connection card',
          description: 'A dropdown to choose the connection ("name - engine - connected") and a summary: engine, database, host, state, whether read-only is enforced, and how many databases are visible. If there is no connection, an empty state offers "Open connections".',
        },
        {
          name: 'Summary cards',
          items: [
            { name: 'Tables', description: 'Number of tables, with the index count below.' },
            { name: 'Rows (estimated)', description: 'Total estimated rows and total size.' },
            { name: 'Blocked / long', description: 'Sessions blocked by another session, out of all active sessions. Turns red when a critical finding exists.' },
            { name: 'Queries tracked', description: 'Statements recorded in Query history, with the number of failed runs.' },
          ],
        },
        {
          name: 'Findings',
          description: 'Rule-based problems and hints from health, schema, workload and history. Each row has a severity badge (Critical red, Warning orange, Info blue, Pass green, Unknown grey), a title, detail and evidence, and sometimes an Open link to the related page. Count chips at the top show how many of each severity.',
        },
        {
          name: 'Health score and Health checks',
          description: 'A 0 to 100 score with a status (Healthy, Degraded, Unhealthy, Unknown) and a bar. It is weighted from measured checks only. The checks table lists each check with its outcome (Pass, Warning, Fail, Unknown), value and detail.',
        },
        {
          name: 'Schema analysis',
          description: 'Tables with kind, estimated rows, size, columns and index counts, and a Key badge: green "Primary key" or orange "No primary key". Schema findings are listed underneath. Not available for non-relational engines.',
        },
        {
          name: 'Table dependencies',
          description: 'Built only from foreign keys that are really declared, never guessed from names. Shows Child table, Columns, Parent table and Constraint; tables outside the schema carry an "external" badge. Also lists circular relationships, the most referenced tables, and tables with no declared relationship.',
        },
        {
          name: 'Schema time machine',
          description: 'Compares the current structure with the previous stored capture. A banner says "Baseline captured", "No structural change" or "N structural change(s) since the previous capture". Changes are labelled Table added/removed, Column added/removed/changed, Index added/removed/changed, Foreign key added/removed. A table of captured structures shows counts and whether each differed from the previous one. The last 8 distinct structures are kept per connection. "Capture now" re-reads the schema. Data changes are not tracked.',
        },
        {
          name: 'Workloads',
          description: 'Active sessions with id, user, state, age, wait, a Blocked badge (red "N blocking" or green "Not blocked") and the statement. Below, "Slow statements from the engine" lists statement, calls, mean time and rows when the engine provides them.',
        },
        {
          name: 'Query time machine',
          description: 'Your query history grouped by normalised statement (so different literal values count as the same query): runs, error rate, mean, p95 (95% of runs were faster than this) and a trend badge ("Stable" green or orange "Slower +40%"). "Latest runs" shows the most recent executions with OK/Failed, duration and SQL.',
        },
        {
          name: 'Forecast',
          description: 'Projects when a measured series (for example connections or size) will cross its threshold, using stored observability samples. It shows current value, threshold, projected crossing date, confidence and a note. Without at least six samples it says "Not enough history to forecast".',
        },
        {
          name: 'Limitations and read-only banner',
          description: 'A card listing what could not be measured and why, and a blue banner repeating that the analysis is read-only.',
        },
      ],
      tables: [
        {
          name: 'Schema analysis table',
          columns: [
            { name: 'Table', meaning: 'Table name with its schema.', example: 'orders - public' },
            { name: 'Kind', meaning: 'Table or view.', example: 'table' },
            { name: 'Rows', meaning: 'Estimated row count.', example: '12,480' },
            { name: 'Size', meaning: 'Size on disk.', example: '3.1 MB' },
            { name: 'Columns / indexes', meaning: 'Number of columns and indexes.', example: '9 / 3' },
            { name: 'Key', meaning: 'Whether the table has a primary key.', example: 'No primary key (orange)' },
          ],
        },
        {
          name: 'Query time machine table',
          columns: [
            { name: 'Statement', meaning: 'A sample of the grouped statement.', example: 'SELECT * FROM orders WHERE id = 1' },
            { name: 'Runs', meaning: 'How many times it ran.', example: '58' },
            { name: 'Errors', meaning: 'Share of runs that failed (blank when none).', example: '5.2%' },
            { name: 'Mean / p95', meaning: 'Average and 95th percentile duration.', example: '42 ms / 130 ms' },
            { name: 'Trend', meaning: 'Compares recent runs with older ones.', example: 'Slower +65%' },
          ],
        },
      ],
      example: {
        title: 'Example: review a database after a deploy',
        steps: [
          'Open Intelligence and choose "Local Postgres" in the Connection card.',
          'Read the Findings card: "Warning - Table audit_log has no primary key".',
          'Open Schema time machine: "2 structural changes since the previous capture" - Column added: orders.coupon_code, Index added: orders_coupon_idx.',
          'Check Query time machine: one statement is marked "Slower +65%". Copy it into the SQL editor and use Explain.',
        ],
      },
      tips: [
        'This page never changes data or structure.',
        'The health score only counts checks that could be measured, so a missing permission lowers confidence, not the score.',
        'Forecasts need history. Leave OpsDeck observability collecting samples to get meaningful projections.',
        'Row counts are estimates from database statistics.',
      ],
    },

    'databases/diagnostics': {
      title: 'Diagnostics',
      summary: 'Runs a step-by-step check of one connection (settings, network, TLS, login, permissions, monitoring) so you can see exactly where a problem is.',
      whenToUse: [
        'A connection fails and you do not know why.',
        'You changed a password, port or TLS setting and want to verify it.',
        'You want to confirm your user can list databases and read performance metrics.',
      ],
      howItWorks: [
        'Choose a connection and press Run diagnostics. The checks run in order and each step reports pass, warning or fail with a short explanation and how long it took. Nothing is changed in the database.',
        'The steps depend on the connection type. File databases (SQLite) check that the file exists. Kubernetes-linked connections also check the port-forward.',
      ],
      parts: [
        {
          name: 'Header',
          items: [
            { name: 'Connection selector', description: 'Which connection to check.' },
            { name: 'Run diagnostics', description: 'Starts the checks. Also offered as a button in the empty state ("No diagnostics run yet").' },
          ],
        },
        {
          name: 'Summary banner',
          description: 'After a run: a green "All checks passed" or a red "Some checks failed", with the time of the run.',
        },
        {
          name: 'Steps list',
          description: 'One line per step with a status icon (green check = pass, amber triangle = warning, red cross = fail), the step name, a detail sentence and the time it took.',
          items: [
            { name: 'Configuration', description: 'Is the engine supported by OpsDeck?' },
            { name: 'Kubernetes port-forward', description: 'Only for Kubernetes-linked profiles: could the port-forward start?' },
            { name: 'File access', description: 'SQLite only: does the database file exist?' },
            { name: 'Network reachability', description: 'Can OpsDeck open a TCP connection to host and port?' },
            { name: 'TLS', description: 'Shows the TLS mode that will be used.' },
            { name: 'Authentication', description: 'Does the login work? On success it names the user.' },
            { name: 'Version', description: 'The server version reported by the database.' },
            { name: 'Permissions', description: 'Can the user list databases? A warning means the login works but the user is limited.' },
            { name: 'Monitoring', description: 'Can performance metrics be read? A warning means the Performance page will have limited data.' },
          ],
        },
      ],
      tables: [
        {
          name: 'Example steps',
          columns: [
            { name: 'Network reachability', meaning: 'Pass: the port accepts connections. Fail: wrong host or port, firewall, or the server is stopped.', example: 'pass, 3 ms' },
            { name: 'Authentication', meaning: 'Fail usually means wrong user or password, or the user may not log in from this host.', example: 'fail: password authentication failed' },
            { name: 'Permissions', meaning: 'Warning means login works but listing databases is not allowed.', example: 'warn: permission denied' },
          ],
        },
      ],
      example: {
        title: 'Example: find out why a connection fails',
        steps: [
          'Open Diagnostics and select the failing connection.',
          'Click Run diagnostics.',
          'Network reachability passes but Authentication fails with "password authentication failed".',
          'Go to Connections, edit the profile, re-enter the password and run diagnostics again until "All checks passed" appears.',
        ],
      },
      tips: [
        'You can also reach Diagnostics from the stethoscope button on a row in Connections.',
        'A failed step does not stop the page from showing the others that ran.',
        'Warnings are not errors: you can still connect, but some features may be limited.',
      ],
    },

    'databases/activity': {
      title: 'Activity log',
      summary: 'A history of actions performed through OpsDeck on your databases: connections, tests, queries, schema changes and service actions.',
      whenToUse: [
        'You want to know what was done, when and on which connection.',
        'You want to see why something failed (status and message).',
        'You need a record of write or destructive actions made from OpsDeck.',
      ],
      howItWorks: [
        'Entries are written automatically by the database service and shown newest first (up to 300). The log is local to this computer.',
        'It only contains actions done through OpsDeck. Audit events recorded on the database server are a separate source and are not mixed in.',
        'The page has no filters or row actions. Hover the When column for the exact date and time.',
      ],
      parts: [
        {
          name: 'Header',
          items: [
            { name: 'Refresh', description: 'Reloads the log.' },
            SHARED_ASK_AI,
          ],
        },
        {
          name: 'Activity table',
          description: 'One row per action. Empty state: "No activity recorded".',
        },
      ],
      tables: [
        {
          name: 'Activity table',
          columns: [
            { name: 'When', meaning: 'Relative time; hover for the exact date.', example: '10 minutes ago' },
            { name: 'Kind', meaning: 'Type of action. Examples: connection, connection-failed, connection-test, disconnect, query, data-browse, connection-deleted, connection-duplicated, connections-imported, local-service, redis-delete, database-created, database-dropped.', example: 'query' },
            { name: 'Connection', meaning: 'Which connection it concerned.', example: 'Local Postgres' },
            { name: 'Status', meaning: 'success (green), warning (amber) or error (red).', example: 'success' },
            { name: 'Duration', meaning: 'How long the action took, when measured.', example: '38 ms' },
            { name: 'Detail', meaning: 'A message, and for queries the statement below it in small text.', example: 'Query completed - UPDATE orders SET status = \'paid\' WHERE id = 7' },
          ],
        },
      ],
      example: {
        title: 'Example: who restarted the database service?',
        steps: [
          'Open Activity log.',
          'Look for a row with Kind "local-service". The Detail column says which action ran and the Status shows success or error.',
          'Use the When column to see how long ago it happened.',
        ],
      },
      tips: [
        'Clearing Query history does not clear this log.',
        'Credentials are never written to the log.',
        'Use the Dashboard to see only the 6 latest entries.',
      ],
    },
  });
})();

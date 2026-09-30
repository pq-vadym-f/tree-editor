# Tree Editor

## Run locally

Requires .NET 10 SDK, Node.js 22.12+, and Docker Desktop running.
Run all commands from the repository root.

1. Start PostgreSQL:

   ```powershell
   docker compose up -d --wait
   ```

2. Start the API (http://localhost:5000). Startup automatically applies EF Core
   migrations and seeds sample data once:

   ```powershell
   dotnet run --project backend/src/TreeEditor.Api
   ```

3. In another terminal, install dependencies and start the UI:

   ```powershell
   npm --prefix frontend ci
   npm --prefix frontend run dev
   ```

   Open http://localhost:5173.

## API documentation and checks

In Development, the API serves its OpenAPI document at
http://localhost:5000/openapi/v1.json. The document includes endpoint descriptions,
request and response schemas, and error status codes.

`backend/src/TreeEditor.Api/TreeEditor.Api.http` contains requests for every
endpoint, plus missing-node and invalid-value examples. Set `nodeId` and
`nodeVersion` from the root-list response before running the node and apply
requests. The last request resets the database to fresh sample data.

The apply endpoint is an atomic batch action returning `200 OK` with committed
versions. Reset returns `204 No Content` after replacing the sample tree.

With PostgreSQL running, run the backend checks from the repository root:

```powershell
dotnet build TreeEditor.slnx
dotnet test TreeEditor.slnx --no-build
node --test backend/tests/*.test.mjs
dotnet format TreeEditor.slnx --no-restore --verify-no-changes
```

## Stop and remove Docker resources

Stop the API and UI with `Ctrl+C` in their terminals, then run from the repository
root:

```powershell
docker compose down --volumes --rmi all --remove-orphans
```

This removes this project's Docker containers, networks, PostgreSQL image, and
`postgres_data` volume. **Deleting the volume permanently deletes all database
data.** The next time you start PostgreSQL and the API, the database is recreated
and sample data is seeded again.


## Implementation decisions

- Core contains domain rules and services; Infrastructure handles EF Core and
  PostgreSQL; API exposes HTTP endpoints.
- The React UI loads branches on demand and keeps edits in a sparse, in-memory
  cache until **Apply all changes** is pressed. Reloading the page loses pending edits.
- Apply commits the entire batch in one serializable transaction; version checks
  reject stale edits. Recursive SQL deletes whole subtrees, including unloaded
  descendants, with a deferred foreign key allowing deletion in one statement.

## Database schema

Start with an empty database; the API creates its schema through EF Core
migrations. Databases created before EF migrations must be recreated.

PostgreSQL stores the tree in `tree_nodes`: UUID primary key `id`, nullable
`parent_id` referencing another node (null for roots), nonblank text `value`
(up to 500 characters), and bigint `version` for concurrency checks.
The `(parent_id, id)` index supports child queries. Existing IDs and parents
are immutable. `tree_initialization` holds a single marker so an intentionally
emptied tree is not reseeded after restart.

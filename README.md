# Tree Editor

## Afterthoughts

Looking back at this implementation, I'd save drafts locally so refreshing the
browser wouldn't lose pending edits. I'd also let users start a new tree after
deleting the last root and resolve save conflicts without discarding their work.

## Run locally

Requires .NET 10 SDK, Node.js 22.12+, and Docker Desktop running.
Run all commands from the repository root.

Databases created before EF migrations must be recreated.

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

- PostgreSQL stores one row per node with an ID, parent ID (null for roots), value,
  and version. Parent references form the tree.
- React loads branches on demand and keeps editable nodes in an in-memory `Map`
  keyed by ID. Edits are saved with **Apply all changes**; reloading loses pending edits.
- Apply saves the entire batch atomically; version checks reject stale edits.
- Deleting a node removes its entire subtree, including descendants not loaded
  in the browser.

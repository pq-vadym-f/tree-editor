# Tree Editor

Full-stack tree editor assignment using ASP.NET Core, React,
TypeScript, and PostgreSQL.


## Prerequisites

- .NET 10 SDK
- Node.js 22.12+
- Docker Desktop running

## Install dependencies

Run from the repository root:

```powershell
dotnet restore
npm --prefix frontend ci
```

## Start

Start PostgreSQL:

```powershell
docker compose up -d --wait
```

Start the API in one terminal:

```powershell
dotnet run --project backend/TreeEditor.Api --no-launch-profile --urls http://localhost:5000
```

Start the UI in another terminal:

```powershell
npm --prefix frontend run dev
```

Open http://localhost:5173.

## Database

PostgreSQL runs in Docker and is available locally on port 5432.

- Database: tree_editor
- Username: tree_editor
- Password: dev_password

(These credentials are for local development).


Stop PostgreSQL while keeping data:

```powershell
docker compose down
```
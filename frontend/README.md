# Tree Editor frontend

React and TypeScript, built with Vite. See the [root README](../README.md) for
backend/database setup and the editor workflow.

```powershell
npm ci
npm run dev
```

Vite serves http://localhost:5173 and proxies `/api` to http://localhost:5000.
Run these commands from this directory to check the frontend:

```powershell
npm test
npm run build
npm run lint
npm run format:check
```

Run `npm run format` to apply the shared formatting rules to the frontend source and tests.

`src/main.tsx` mounts the tree feature. `src/features/tree/api.ts` contains HTTP
calls, `cache.ts` contains pure cache transitions, and `types.ts` defines API
contracts. Hooks own asynchronous paging and editing workflows; components
render the database tree, sparse cache, and selected-node editor. The cache
never makes network requests or writes to the database on its own.

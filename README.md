# stiff

A small [Next.js](https://nextjs.org) (App Router) task manager used to bootstrap
and validate the Cloud Agent development environment for this repository.

## Tech stack

- Next.js 16 (App Router) + React 19
- TypeScript
- Tailwind CSS v4
- Vitest for unit tests
- ESLint (`eslint-config-next`)

## Getting started

Install dependencies and start the dev server:

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) to use the app: add tasks,
toggle them complete, and delete them. Tasks are persisted server-side to a JSON
file at `.data/tasks.json` (git-ignored) through the API routes.

## API

| Method   | Route             | Description            |
| -------- | ----------------- | ---------------------- |
| `GET`    | `/api/tasks`      | List all tasks         |
| `POST`   | `/api/tasks`      | Create a task          |
| `PATCH`  | `/api/tasks/:id`  | Toggle a task's `done` |
| `DELETE` | `/api/tasks/:id`  | Delete a task          |

## Scripts

| Command             | Description                     |
| ------------------- | ------------------------------- |
| `npm run dev`       | Start the development server    |
| `npm run build`     | Production build                |
| `npm run start`     | Serve the production build      |
| `npm run lint`      | Run ESLint                      |
| `npm run typecheck` | Type-check with `tsc --noEmit`  |
| `npm test`          | Run the Vitest unit tests       |

## Cloud Agent environment

The environment is defined in [`.cursor/environment.json`](.cursor/environment.json):
`install` runs `npm ci`, and the `dev` terminal runs `npm run dev` on port 3000.

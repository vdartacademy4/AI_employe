# AI Employee Intelligence Platform

Monorepo foundation for a workplace intelligence platform: engagement analytics,
pulse surveys, feedback, attrition-risk prediction, alerts, action items and an
AI assistant surface.

The platform is split into two workspaces:

| Workspace  | Stack                                        | Purpose                              |
| ---------- | -------------------------------------------- | ------------------------------------ |
| `backend`  | Node + Express + TypeScript + Prisma + SQLite | API, auth, RBAC, domain services    |
| `frontend` | React + Vite + TypeScript + Tailwind + Router | Responsive SPA with role-aware shell |

## Prerequisites

- Node.js >= 20 (developed against Node 24)
- npm >= 10

No database server is required for local development. The backend uses SQLite via
Prisma; the schema is written to be portable to PostgreSQL (see
[Database portability](#database-portability)).

## Quick start

```bash
npm install

# Copy the env template and fill in the secrets + the initial admin credentials
copy backend\.env.example backend\.env      # Windows
# cp backend/.env.example backend/.env       # macOS / Linux

npm run setup          # prisma generate + migrate + seed the admin account
npm run dev            # backend on :4000, frontend on :5173
```

The seed command refuses to run unless `ADMIN_EMAIL` and `ADMIN_PASSWORD` are
present in `backend/.env`, and it only ever creates an admin account. It never
inserts demo or placeholder business data.

Open http://localhost:5173 and sign in with the seeded admin credentials.

## Workspace layout

```
.
├── backend/
│   ├── prisma/
│   │   ├── schema.prisma        # data model (14 tables)
│   │   └── migrations/          # generated SQL migrations
│   └── src/
│       ├── config/              # env parsing + typed config object
│       ├── core/                # errors, logger, async handler, prisma client
│       ├── middleware/          # auth, rbac, validation, error handler
│       ├── modules/             # one folder per domain
│       │   ├── auth/
│       │   ├── users/
│       │   ├── departments/
│       │   ├── employees/
│       │   ├── surveys/
│       │   ├── feedback/
│       │   ├── engagement/
│       │   ├── risk/
│       │   ├── alerts/
│       │   ├── action-items/
│       │   ├── reports/
│       │   └── ai/
│       └── server.ts            # http entrypoint
└── frontend/
    └── src/
        ├── api/                 # typed fetch client + per-domain endpoints
        ├── components/          # layout, ui primitives
        ├── context/             # auth session context
        ├── hooks/
        ├── pages/               # one folder per route
        └── lib/                 # shared helpers, role metadata
```

## Roles

Four roles, enforced server-side by a permission matrix in
`backend/src/modules/auth/permissions.ts` and mirrored in the UI so the sidebar
and routes only expose what the signed-in user may use.

| Role       | Scope                                                                     |
| ---------- | ------------------------------------------------------------------------- |
| `EMPLOYEE` | Own profile, own survey responses, own feedback, AI chat, own engagement  |
| `MANAGER`  | Team surveys, team analytics, team risk, action items for the team        |
| `HR`       | Organisation-wide surveys, feedback inbox, analytics, risk, reports        |
| `ADMIN`    | Everything, including user/role management and system configuration        |

## Database portability

`prisma/schema.prisma` targets SQLite for local development. To move to
PostgreSQL:

1. Change `provider = "sqlite"` to `provider = "postgresql"` and change
   `DATABASE_URL` to a Postgres connection string.
2. SQLite-specific `Json` usage is already avoided; string columns that hold
   enums are declared as Prisma enums and will map natively on Postgres.
3. Recreate migrations with `npx prisma migrate dev --name init_postgres`.

No application code reads the driver directly, so nothing else needs to change.

## AI integration readiness

`backend/src/modules/ai` defines a provider interface
(`AiProvider`) plus a `providerFactory` that resolves the implementation from
configuration. The bundled `NullAiProvider` returns a clearly-flagged
"not configured" response instead of inventing content, so the UI and API
contracts can be built and tested before a model is selected. To add a real
provider, implement `AiProvider` in that folder and point `AI_PROVIDER` at it.

The `ai_conversations`, `ai_messages`, `ai_usage_events` and `ai_insights`
tables already store provider, model, token counts and embedding metadata, so
history, cost accounting and retrieval can be added without a migration.

## Scripts

| Command                  | Description                              |
| ------------------------ | ---------------------------------------- |
| `npm run dev`            | Run backend and frontend in watch mode   |
| `npm run build`          | Type-check and build both workspaces     |
| `npm run typecheck`      | TypeScript only, no emit                 |
| `npm run lint`           | ESLint across both workspaces            |
| `npm test`               | Backend test suite                       |
| `npm run db:migrate`     | Create/apply a development migration    |
| `npm run db:studio`      | Open Prisma Studio                       |
| `npm run db:seed`        | Create the env-driven admin account      |

## Conventions

- Every domain module follows the same shape: `*.routes.ts` -> `*.controller.ts`
  -> `*.service.ts` -> Prisma. Routes stay thin, business logic lives in
  services and is unit-testable without HTTP.
- Controllers never touch Prisma directly.
- Zod schemas validate every request body, query and path parameter.
- All errors flow through a single `AppError` hierarchy and one error middleware.
- Responses use a consistent envelope: `{ data }` or `{ data, meta }`.

# Tuno

A self-hostable, multi-app workspace built with **Bun**, **React**, and **PostgreSQL**. Tuno ships with a shared core (authentication, teams, settings) and a suite of modular apps — Mailer, Notes, Forms, Scheduler, CRM, Tasks, Documents, and CMS — each with its own Prisma schema, generated client, and database namespace.

## Features

- **Bootstrap-first onboarding** — the first account created through `/auth/signup` becomes the workspace `ADMIN`; registration closes automatically after that.
- **Invitation-based team management** — admins invite members by email. Invitations are single-use, expire after 48 hours, and are delivered over SMTP.
- **Secure sessions** — passwords hashed with Argon2id (via `Bun.password`), opaque session tokens stored as SHA-256 hashes, HttpOnly cookies with a `Secure` flag in production.
- **API keys** — authenticated users can create named, optionally expiring API keys and use them to call public API endpoints from scripts and integrations.
- **Modular app architecture** — General, Mailer, Notes, Forms, Scheduler, CRM, Tasks, Documents, and CMS each own a separate Prisma schema and generated client, isolated in their own Postgres schema (`general`, `mailer`, `notes`, `forms`, `scheduler`, `crm`, `tasks`, `documents`, `cms`).
- **Shared settings** — key/value workspace settings exposed through a small REST API.
- **Headless CMS** — Strapi-style content collections with custom fields (text, number, boolean, date, select, and a BlockNote rich-text editor for long content), draft/publish workflow, and a standalone REST content API you can consume from anywhere. (`/cms`)
- **Modern React client** — React 19, React Router, React Hook Form with Zod validation, Tailwind CSS 4, and a shared component library under `components/`.

## Tech Stack

| Layer      | Technology                                              |
| ---------- | ------------------------------------------------------- |
| Runtime    | [Bun](https://bun.sh)                                   |
| Server     | Express 5 (TypeScript)                                  |
| Database   | PostgreSQL with Prisma 7 (multi-schema, `bun` runtime)  |
| Frontend   | React 19, React Router 7, Tailwind CSS 4, Radix UI      |
| Validation | Zod + React Hook Form                                   |
| Email      | Nodemailer (SMTP)                                       |

## Getting Started

### Prerequisites

- [Bun](https://bun.sh) v1.x
- PostgreSQL running locally (default: `localhost:5432`)

### Setup

1. **Clone and install dependencies**

   ```sh
   git clone <repository-url>
   cd tuno
   bun install
   ```

2. **Configure environment variables**

   ```sh
   cp .env.example .env
   ```

   By default Tuno expects Postgres at `localhost` with user `postgres`, password `root`, and database `tuno`. Adjust `DATABASE_URL` if yours differs.

3. **Create the database and Prisma clients**

   ```sh
   bun run db:setup
   ```

   This creates the shared database, generates the Prisma clients (General, Mailer, Notes, Forms, Scheduler, CRM, Tasks, Documents, CMS), and pushes each schema.

4. **Start the development server**

   ```sh
   bun run dev
   ```

   Tuno is now listening on `http://localhost:5000` (override with `PORT`).

5. **Create your admin account**

   Visit `/auth/signup` to create the first (and only self-registered) account. Once it exists, registration is closed and new members join via admin invitations.

## Environment Variables

| Variable        | Description                                                        | Default                  |
| --------------- | ------------------------------------------------------------------ | ------------------------ |
| `PORT`          | HTTP port the server listens on                                    | `5000`                   |
| `NODE_ENV`      | `development` or `production` (enables `Secure` cookies in prod)   | `development`            |
| `APP_URL`       | Public URL of the app, used in invitation emails                   | `http://localhost:5000`  |
| `DATABASE_URL`  | Shared Postgres connection string for all app schemas              | —                        |
| `SMTP_HOST`     | SMTP server hostname (required for invitations)                    | —                        |
| `SMTP_PORT`     | SMTP server port                                                   | `465`                    |
| `SMTP_USER`     | SMTP username                                                      | —                        |
| `SMTP_PASS`     | SMTP password                                                      | —                        |
| `SMTP_FROM`     | From address for outgoing email (falls back to `SMTP_USER`)        | —                        |
| `AWS_S3_ACCESS_KEY_ID` | S3 access key (documents)                                   | —                        |
| `AWS_S3_SECRET_ACCESS_KEY` | S3 secret key                                     | —                        |
| `AWS_S3_ENDPOINT_URL` | S3-compatible endpoint (AWS, R2, MinIO…)                    | —                        |
| `AWS_STORAGE_BUCKET_NAME` | S3 bucket name                                        | —                        |

> Bun automatically loads `.env` — no extra dotenv setup needed.

## Scripts

| Command                | Description                                                                 |
| ---------------------- | --------------------------------------------------------------------------- |
| `bun run dev`          | Build the client and watch/restart the server                               |
| `bun run start`        | Build the client and run the server (production)                            |
| `bun run build`        | Compile Tailwind CSS and bundle the React client into `public/`             |
| `bun run db:setup`     | Create the database + Postgres schemas, generate clients, push all schemas  || `bun run db:push`      | Push all Prisma schemas to the database                                     |
| `bun run prisma:generate` | Regenerate all Prisma clients                                            |
| `bun run typecheck`    | Run TypeScript checks (`tsc --noEmit`)                                      |

## Architecture

```
tuno/
├── main.ts                    # Express server, routes, static hosting, graceful shutdown
├── general/                   # Core app: auth, users, teams, settings
│   ├── api/
│   │   ├── routes/            # auth, user, team, settings routers
│   │   └── services/          # database client, email service, auth guards
│   ├── frontend/              # auth page, workspace shell, home page
│   ├── prisma/                # General schema (general.* tables)
│   └── generated/client/      # Generated Prisma client
├── mailer/                    # Mailer app — campaigns, audiences, templates, analytics
│   ├── api/routes/            # contact/template/campaign CRUD, sends, SMTP, tracking
│   ├── api/services/          # database, SMTP resolution, send fan-out
│   ├── frontend/              # overview analytics, audiences, block editor, campaigns
│   ├── shared/                # isomorphic markdown block renderer + interpolation
│   ├── prisma/                # Mailer schema (mailer.* tables)
│   └── generated/client/
├── forms/                     # Forms app — block-based form builder with skip logic
│   ├── api/routes/            # form CRUD, publish/draft, submissions, public endpoints
│   ├── api/services/
│   ├── frontend/              # builder, submissions viewer, public form
│   ├── shared/                # block model + skip logic + submission validation
│   ├── prisma/                # Forms schema (forms.* tables)
│   └── generated/client/
├── notes/                     # Notes app — Notion-style pages with a BlockNote editor
│   ├── api/routes/
│   ├── api/services/
│   ├── frontend/              # sidebar pages, editor, share dialog, public viewer
│   ├── prisma/                # Notes schema (notes.* tables)
│   └── generated/client/
├── scheduler/                 # Scheduler app — Cal.com-style meeting booking
│   ├── api/routes/            # event types, availability, bookings, public API
│   ├── api/services/
│   ├── frontend/              # event types, bookings, availability, public booking page
│   ├── shared/                # availability + slot computation
│   ├── prisma/                # Scheduler schema (scheduler.* tables)
│   └── generated/client/
├── crm/                       # CRM app — leads, contacts, tasks, notes, custom fields
│   ├── api/routes/            # lead/contact/task/note CRUD, custom fields + values
│   ├── api/services/
│   ├── frontend/              # leads, contacts, tasks, notes, custom field manager
│   ├── prisma/                # CRM schema (crm.* tables)
│   └── generated/client/
├── tasks/                     # Tasks app — Trello-style kanban boards
│   ├── api/routes/            # boards, columns, cards, sharing, planner, public API
│   ├── api/services/
│   ├── frontend/              # boards grid, kanban board, planner, public board
│   ├── prisma/                # Tasks schema (tasks.* tables)
│   └── generated/client/
├── documents/                 # Documents app — Drive-style folders and files
│   ├── api/routes/            # folders, files, presigned uploads, sharing, public API
│   ├── api/services/
│   ├── frontend/              # folder browser, uploader, share dialogs, public viewer
│   ├── prisma/                # Documents schema (documents.* tables)
│   └── generated/client/
├── cms/                       # CMS app — Strapi-style content collections
│   ├── api/routes/            # collections, fields, entries, standalone public API
│   ├── api/services/
│   ├── frontend/              # collections, entries table, BlockNote entry editor, API docs
│   ├── prisma/                # CMS schema (cms.* tables)
│   └── generated/client/
├── components/ui/             # Shared UI component library (Radix-based)
├── hooks/                     # Shared React hooks
├── lib/                       # Shared utilities
├── scripts/database.ts        # Multi-schema database bootstrap CLI
└── public/                    # Built client assets
```

### Database layout

All apps connect to the **same Postgres database** from a single `DATABASE_URL`, but each app's tables live in their own Postgres schema (`general`, `mailer`, `notes`, `forms`, `scheduler`, `crm`, `tasks`, `documents`, `cms`). Prisma clients are generated per app with the `bun` runtime, and connection strings live in each `prisma.config.ts` rather than the schema files.

See [API.md](API.md) for the full API reference (General, Mailer, Notes).

### Authentication model

- Passwords are hashed with **Argon2id** using `Bun.password`.
- Sessions use opaque random tokens delivered as **HttpOnly cookies**; only the SHA-256 hash of the token is stored server-side.
- Sessions expire and are cleaned up by `expiresAt`; signing out deletes the session row.
- Set `NODE_ENV=production` behind HTTPS to enable the cookie's `Secure` flag.
- Invitations are single-use, expire after 48 hours, and their tokens are also stored hashed.

## Roadmap

- **Mailer** — markdown block templates with `{{ variable }}` personalization, audience contacts, campaign sends with open/click tracking, Shadcn analytics charts, and per-user SMTP (AWS SES / Resend friendly) with app-level fallback (`/mailer`)
- **Notes** — real-time collaboration, nested sub-pages, and page permissions (`/notes`)
- **Forms** — response analytics, notifications, and more block types (`/forms`)
- **Scheduler** — email confirmations, reminders, and calendar sync (`/scheduler`)
- **CRM** — pipeline analytics, bulk import/export, and lead assignment (`/crm`)
- **Tasks** — real-time board updates, labels/checklists, and board templates (`/tasks`)
- **Documents** — file previews, drag-and-drop upload, and search (`/documents`)
- **CMS** — media fields, entry relationships, and webhooks (`/cms`)

## Contributing

Contributions are welcome! Please:

1. Fork the repository and create your branch from `master`.
2. Run `bun run typecheck` before submitting.
3. Keep new database changes in the appropriate app's Prisma schema and run `bun run db:push`.

## License

Tuno is open source under the [MIT License](LICENSE).
# Tuno API

REST API reference for Tuno's apps. All endpoints are served from the same Express server (default `http://localhost:5000`) under the `/api` prefix.

## General

Core app: authentication, users, teams, settings, and API keys.

| Method | Endpoint                        | Auth        | Description                          |
| ------ | ------------------------------- | ----------- | ------------------------------------ |
| `GET`  | `/api/health`                   | Public      | Health check                         |
| `GET`  | `/api/auth/registration-status` | Public      | Whether signup is still open         |
| `POST` | `/api/auth/signup`              | Public*     | Create the bootstrap admin account   |
| `POST` | `/api/auth/login`               | Public      | Sign in, sets session cookie         |
| `POST` | `/api/auth/logout`              | Public      | Destroy the current session          |
| `GET`  | `/api/auth/me`                  | Session     | Current user                         |
| `GET`  | `/api/auth/invitations/:token`  | Public      | Validate an invitation token         |
| `POST` | `/api/auth/invitations/accept`  | Public      | Accept an invitation, create account |
| `GET`  | `/api/user/me`                  | Session     | Current user profile                 |
| `PATCH`| `/api/user/me`                  | Session     | Update the current user's name       |
| `GET`  | `/api/team/members`             | Admin       | List workspace members               |
| `POST` | `/api/team/invitations`         | Admin       | Invite a new member by email         |
| `GET`  | `/api/settings`                 | Session     | Read workspace settings              |
| `PUT`  | `/api/settings`                 | Session     | Update workspace settings            |
| `GET`  | `/api/keys`                     | Session     | List your API keys                   |
| `POST` | `/api/keys`                     | Session     | Create an API key                    |
| `DELETE`| `/api/keys/:key`               | Session     | Revoke one of your API keys          |
| `GET`  | `/api/public/me`                | API key     | Info about the calling key and owner |
| `GET`  | `/api/public/workspace`         | API key     | Read-only workspace snapshot         |

\* Only available while the workspace has no users (bootstrap state).

### API keys

API keys let scripts and integrations call the public API endpoints (`/api/public/*`) without a browser session:

1. Create a key while signed in: `POST /api/keys` with `{"name": "My integration", "expiresAt": "2027-01-01T00:00:00.000Z"}` (expiry optional).
2. Pass the key on every request via the `Authorization: Bearer <key>` header or the `X-API-Key: <key>` header.
3. Revoke keys at any time with `DELETE /api/keys/:key`. Expired or revoked keys are rejected immediately.

## Mailer

Loops-style email campaigns: markdown templates with `{{ variable }}` personalization, audience contacts with custom properties, fan-out sends with open/click tracking, and per-user SMTP configuration.

| Method | Endpoint                          | Auth    | Description                                                        |
| ------ | --------------------------------- | ------- | ------------------------------------------------------------------ |
| `GET`  | `/api/mailer/contacts?q=`         | Session | List contacts (optional search on email/name)                       |
| `POST` | `/api/mailer/contacts`            | Session | Add a contact (`email`, `name`, `props` JSON, `subscribed`)         |
| `POST` | `/api/mailer/contacts/import`     | Session | Bulk import from pasted lines (`"email,name"` per line)             |
| `PATCH`| `/api/mailer/contacts/:id`        | Session | Update a contact (`email`, `name`, `props`, `subscribed`)           |
| `DELETE`| `/api/mailer/contacts/:id`       | Session | Remove a contact                                                    |
| `GET`  | `/api/mailer/templates`           | Session | List templates                                                      |
| `POST` | `/api/mailer/templates`           | Session | Create a template (`name`, `subject`, `blocks` JSON)                |
| `GET`  | `/api/mailer/templates/:id`       | Session | Read a template (includes parsed `blockList`)                       |
| `PATCH`| `/api/mailer/templates/:id`       | Session | Update name/subject/blocks                                          |
| `POST` | `/api/mailer/templates/:id/test`  | Session | Send the template to one address with sample values (`{ to }`)      |
| `DELETE`| `/api/mailer/templates/:id`      | Session | Delete a template                                                   |
| `GET`  | `/api/mailer/campaigns`           | Session | List campaigns with status and recipient counts                     |
| `POST` | `/api/mailer/campaigns`           | Session | Create a campaign (`name`, `subject`, `templateId`, `payload` JSON) |
| `PATCH`| `/api/mailer/campaigns/:id`       | Session | Edit a draft campaign                                               |
| `POST` | `/api/mailer/campaigns/:id/send`  | Session | Send to all subscribed contacts, or `{ testEmail }` for a test send |
| `GET`  | `/api/mailer/campaigns/:id/events`| Session | Per-recipient delivery/engagement events                            |
| `DELETE`| `/api/mailer/campaigns/:id`      | Session | Delete a campaign and its analytics                                 |
| `GET`  | `/api/mailer/analytics`           | Session | 30-day event series + totals (sends, open rate, click rate)         |
| `GET`  | `/api/mailer/smtp`                | Session | SMTP status (`hasCustomSmtp`, `appFallbackAvailable`, config)       |
| `PUT`  | `/api/mailer/smtp`                | Session | Save the user's SMTP server (password stored AES-256-GCM encrypted) |
| `DELETE`| `/api/mailer/smtp`               | Session | Remove the custom SMTP and fall back to the app's `SMTP_*` env vars |
| `POST` | `/api/mailer/smtp/test`           | Session | Send a test email through the resolved SMTP server (`{ to }`)       |
| `GET`  | `/api/public/mailer/open/:id.gif` | Public  | Open-tracking pixel (embedded in campaign emails)                   |
| `GET`  | `/api/public/mailer/click/:id?u=` | Public  | Click-tracking redirect (rewrites links in campaign emails)         |

### How sending works

1. Create a **template** from markdown blocks (headings, text, buttons, dividers, spacers) with `{{ email }}`, `{{ name }}`, or any custom contact property as variables.
2. Add **contacts** to your audience — each can carry custom properties (e.g. `{"plan": "Pro"}`) used to fill template variables.
3. Create a **campaign** with a subject, template, and optional **custom payload** — payload keys override contact properties at send time.
4. Send: every subscribed contact receives a personally rendered email with an open-tracking pixel and click-tracked links. Engagement shows up under Analytics and the campaign detail page.
5. Delivery uses the user's own SMTP server when configured, otherwise the app-wide `SMTP_HOST`/`SMTP_PORT`/`SMTP_USER`/`SMTP_PASS`/`SMTP_FROM` environment variables.


## Notes

Notion-style notes workspace built on a block editor (BlockNote). Pages have a title, an emoji icon, and block content stored as JSON.

| Method | Endpoint                            | Auth            | Description                                        |
| ------ | ----------------------------------- | --------------- | -------------------------------------------------- |
| `GET`  | `/api/notes/pages`                  | Session         | List your pages (newest activity first)            |
| `GET`  | `/api/notes/pages?scope=shared`     | Session         | Pages shared with you (team, people, or public)    |
| `POST` | `/api/notes/pages`                  | Session         | Create a page (`title`, `icon`, `content` optional)|
| `GET`  | `/api/notes/teammates`              | Session         | List workspace users for sharing                   |
| `GET`  | `/api/notes/pages/:id`              | Session*        | Read a page (owner or shared with you)             |
| `PATCH`| `/api/notes/pages/:id`              | Owner           | Update `title`, `icon`, `content`, `favorite`      |
| `DELETE`| `/api/notes/pages/:id`             | Owner           | Delete a page                                      |
| `GET`  | `/api/notes/pages/:id/shares`       | Owner           | Sharing state (`sharedAll`, `publicSlug`, users)   |
| `PATCH`| `/api/notes/pages/:id/shares`       | Owner           | Toggle `sharedAll` (visible to all teammates)      |
| `POST` | `/api/notes/pages/:id/shares`       | Owner           | Share with a specific person (`{ userId }`)        |
| `DELETE`| `/api/notes/pages/:id/shares/:userId` | Owner         | Remove a person's access                           |
| `POST` | `/api/notes/pages/:id/shares/public` | Owner          | Generate a public link slug                        |
| `DELETE`| `/api/notes/pages/:id/shares/public` | Owner          | Revoke the public link                             |
| `GET`  | `/api/public/notes/:slug`           | Public          | Read a publicly shared page (no auth)              |

`content` is the BlockNote document: a JSON array of blocks (up to 5,000 blocks, 2 MB request limit on notes routes).

Public pages are also viewable in the app at `/share/:slug`.

## Forms

Block-based form builder. Forms are built from typed blocks (text, short/long text, email, number, date, single/multi choice, file upload) with per-option **skip logic** (continue, jump to a later question, or end the form). Forms live as drafts until published; published forms get a public slug and collect submissions.

| Method | Endpoint                                  | Auth     | Description                                                    |
| ------ | ----------------------------------------- | -------- | -------------------------------------------------------------- |
| `GET`  | `/api/forms/forms`                        | Session  | List your forms with status and submission counts              |
| `POST` | `/api/forms/forms`                        | Session  | Create a form (`title`, `description`, `icon`, `blocks` optional) |
| `GET`  | `/api/forms/forms/:id`                    | Owner    | Read a form (includes `blocks`)                                |
| `PATCH`| `/api/forms/forms/:id`                    | Owner    | Update `title`, `description`, `icon`, `blocks`                |
| `DELETE`| `/api/forms/forms/:id`                   | Owner    | Delete a form and its submissions                              |
| `POST` | `/api/forms/forms/:id/publish`            | Owner    | Publish the form (generates a `publicSlug` if needed)          |
| `DELETE`| `/api/forms/forms/:id/publish`           | Owner    | Move the form back to draft                                    |
| `GET`  | `/api/forms/forms/:id/submissions`        | Owner    | List submissions (newest first)                                |
| `DELETE`| `/api/forms/forms/:id/submissions/:sid`  | Owner    | Delete a submission                                            |
| `GET`  | `/api/forms/files/:filename/url`          | Owner    | Presigned download link for an uploaded file                   |
| `GET`  | `/api/public/forms/:slug`                 | Public   | Read a published form (blocks included, no auth)               |
| `POST` | `/api/public/forms/:slug/submissions`     | Public   | Submit answers (`{ answers: { blockId: value } }`)             |
| `POST` | `/api/public/forms/upload-url`            | Public   | Get a presigned S3 upload URL (`{ filename }`)                 |

- `blocks` is a JSON array of block objects (`id`, `type`, `label`, `description`, `required`, `options`). Choice options carry skip logic: `skip: "next" | "jump" | "end"` with `jumpTarget` (a later block id; jumps are forward-only).
- Submissions are validated server-side by walking the form with the same skip logic, so only questions reachable through the respondent's path are enforced.
- File-upload answers store the S3 key; respondents upload directly via the presigned URL and owners download via the presigned GET link (verified against the owner's submissions).

Public forms are served at `/f/:slug`.

## Scheduler

Cal.com-style meeting scheduler. Owners define **event types** (bookable meeting templates with a unique public link), set weekly **availability**, and collect **bookings** from guests. Slots are computed from availability in 15-minute increments, with existing bookings blocking double-booking across all of an owner's event types.

| Method | Endpoint                                        | Auth     | Description                                                        |
| ------ | ----------------------------------------------- | -------- | ------------------------------------------------------------------ |
| `GET`  | `/api/scheduler/me`                             | Session  | Owner profile used by booking pages                                |
| `GET`  | `/api/scheduler/event-types`                    | Session  | List your event types (with booking counts)                        |
| `POST` | `/api/scheduler/event-types`                    | Session  | Create an event type (`title`, `slug`, `durationMinutes`, `location`, `color`, `description` optional) |
| `PATCH`| `/api/scheduler/event-types/:id`                | Owner    | Update any field, including `active` (hide/show the booking page)  |
| `DELETE`| `/api/scheduler/event-types/:id`               | Owner    | Delete an event type and its bookings                              |
| `GET`  | `/api/scheduler/availability`                   | Session  | Your weekly availability (one entry per weekday)                   |
| `PUT`  | `/api/scheduler/availability`                   | Session  | Replace your weekly availability (`{ days: [{ weekday, enabled, start, end }] }`) |
| `GET`  | `/api/scheduler/bookings?status=`               | Session  | List bookings, optionally filtered by status                       |
| `POST` | `/api/scheduler/bookings/:id/accept`            | Owner    | Accept a pending booking                                           |
| `POST` | `/api/scheduler/bookings/:id/reject`            | Owner    | Reject a pending booking                                           |
| `POST` | `/api/scheduler/bookings/:id/cancel`            | Owner    | Cancel a pending or accepted booking                               |
| `GET`  | `/api/public/scheduler/pages/:slug`             | Public   | Read a booking page (title, description, duration, host, no auth)  |
| `GET`  | `/api/public/scheduler/pages/:slug/slots`       | Public   | Bookable start times (`?date=YYYY-MM-DD` or `?from=ISO&to=ISO`)    |
| `POST` | `/api/public/scheduler/pages/:slug/bookings`    | Public   | Create a booking (`{ start, name, email, timezone?, notes? }`)     |
| `GET`  | `/api/public/scheduler/event-types`             | API key  | List the key owner's event types                                   |
| `GET`  | `/api/public/scheduler/availability`            | API key  | Read the key owner's weekly availability                           |
| `GET`  | `/api/public/scheduler/bookings?status=`        | API key  | List the key owner's bookings                                      |
| `POST` | `/api/public/scheduler/bookings`                | API key  | Create a booking (`{ eventTypeId, start, name, email, timezone?, notes? }`), auto-accepted |

- Availability windows are stored as minutes-since-midnight **UTC**; slots are returned as ISO timestamps and rendered in the guest's local time zone.
- Bookings created from a public page start as `PENDING` and must be accepted or rejected by the owner. Bookings created through the API key endpoint are `ACCEPTED` immediately.
- A requested start time is validated against availability and existing bookings, so double-booking and off-schedule times fail with `409`.

Public booking pages are served at `/s/:slug`.

## CRM

A lightweight pipeline tracker: **leads** (deals with status and value), **contacts** (people, optionally linked to a lead), **tasks** (follow-ups), and **notes** (a shared timeline). Records live in the caller's own scope, and any lead/contact/task can carry extra **custom fields** you define (text, number, date, select, checkbox).

| Method | Endpoint                        | Auth    | Description                                              |
| ------ | ------------------------------- | ------- | -------------------------------------------------------- |
| `GET`  | `/api/crm/leads`                | Session | List your leads (includes custom values)                  |
| `POST` | `/api/crm/leads`                | Session | Create a lead (`name` required)                           |
| `PATCH`| `/api/crm/leads/:id`            | Session | Update lead fields or `status`                            |
| `DELETE`| `/api/crm/leads/:id`           | Session | Delete a lead (cascades its tasks/notes)                  |
| `GET`  | `/api/crm/contacts`             | Session | List your contacts (includes custom values)               |
| `POST` | `/api/crm/contacts`             | Session | Create a contact, optionally linked to a lead (`leadId`)  |
| `PATCH`| `/api/crm/contacts/:id`         | Session | Update contact fields or the linked lead                  |
| `DELETE`| `/api/crm/contacts/:id`        | Session | Delete a contact                                          |
| `GET`  | `/api/crm/tasks`                | Session | List your tasks (includes custom values)                  |
| `POST` | `/api/crm/tasks`                | Session | Create a task (`title` required; `dueDate`, links optional)|
| `PATCH`| `/api/crm/tasks/:id`            | Session | Update `title`, `status`, `dueDate`, or links             |
| `DELETE`| `/api/crm/tasks/:id`           | Session | Delete a task                                             |
| `GET`  | `/api/crm/notes?leadId=&contactId=` | Session | List notes, optionally filtered by lead/contact       |
| `POST` | `/api/crm/notes`                | Session | Create a note (`body` required; links optional)           |
| `PATCH`| `/api/crm/notes/:id`            | Session | Update the note body                                      |
| `DELETE`| `/api/crm/notes/:id`           | Session | Delete a note                                             |
| `GET`  | `/api/crm/fields`               | Session | List custom fields                                        |
| `POST` | `/api/crm/fields`               | Session | Create a field (`name`, `type`, `appliesTo`, `options`)   |
| `PATCH`| `/api/crm/fields/:id`           | Session | Rename a field or update its select options               |
| `DELETE`| `/api/crm/fields/:id`          | Session | Delete a field and all its stored values                  |
| `PUT`  | `/api/crm/values`               | Session | Save custom values (`{ entityType, entityId, values }`)   |
| `GET`  | `/api/crm/teammates`            | Session | List workspace users                                      |

Custom values are stored per `(field, entityType, entityId)`; the server normalizes values by field type (numbers, ISO dates, booleans) and clearing a value deletes the row.

## Tasks

Trello-style kanban boards. **Boards** hold ordered **columns** and **cards**; cards support **subtasks** (one nesting level), an **assignee** (limited to the owner and people the board is shared with), and a **due date**. Boards can be shared with specific teammates (who can edit cards), with everyone (`sharedAll`), or via a read-only public link.

| Method | Endpoint                              | Auth         | Description                                         |
| ------ | ------------------------------------- | ------------ | ---------------------------------------------------- |
| `GET`  | `/api/tasks/boards`                   | Session      | Boards you own or are shared on                      |
| `POST` | `/api/tasks/boards`                   | Session      | Create a board (seeds To do / In progress / Done)    |
| `GET`  | `/api/tasks/boards/:id`               | Session*     | Full board: columns, cards, subtasks, assignees      |
| `PATCH`| `/api/tasks/boards/:id`               | Owner        | Rename the board or change its color                 |
| `DELETE`| `/api/tasks/boards/:id`              | Owner        | Delete the board and everything on it                |
| `POST` | `/api/tasks/boards/:id/columns`       | Owner        | Add a column                                         |
| `PATCH`| `/api/tasks/columns/:id`              | Owner        | Rename or reorder a column                           |
| `DELETE`| `/api/tasks/columns/:id`             | Owner        | Delete a column and its cards                        |
| `POST` | `/api/tasks/boards/:id/cards`         | Session*     | Create a card (supports `parentId` for subtasks)     |
| `PATCH`| `/api/tasks/cards/:id`                | Session*     | Move the card, edit fields, assign, or set due date  |
| `DELETE`| `/api/tasks/cards/:id`               | Session*     | Delete a card (subtasks cascade)                     |
| `GET`  | `/api/tasks/planner`                  | Session      | All dated cards across your boards                   |
| `GET`  | `/api/tasks/teammates`                | Session      | List workspace users                                 |
| `GET`  | `/api/tasks/boards/:id/shares`        | Owner        | Sharing state (`sharedAll`, `publicSlug`, users)     |
| `PATCH`| `/api/tasks/boards/:id/shares`        | Owner        | Toggle `sharedAll`                                   |
| `POST` | `/api/tasks/boards/:id/shares`        | Owner        | Share with a specific person (`{ userId }`)          |
| `DELETE`| `/api/tasks/boards/:id/shares/:userId` | Owner      | Remove a person's access                             |
| `POST` | `/api/tasks/boards/:id/shares/public` | Owner        | Generate a read-only public link slug                |
| `DELETE`| `/api/tasks/boards/:id/shares/public` | Owner        | Revoke the public link                               |
| `GET`  | `/api/public/tasks/boards/:slug`      | Public       | Read-only board snapshot (no auth)                   |

\* Session endpoints require the board to be owned by, or shared with, the caller. Shared users can create and edit cards; board structure (columns, name) stays owner-only. Public boards render read-only at `/t/:slug`.

## Documents

Google-Drive-style file storage. **Folders** nest arbitrarily and hold **files** uploaded straight to S3 via presigned URLs. Folders can be shared with specific teammates (browse, upload, download), with everyone, or through a read-only public link.

| Method | Endpoint                                    | Auth     | Description                                            |
| ------ | ------------------------------------------- | -------- | ------------------------------------------------------- |
| `GET`  | `/api/documents/folders?parentId=`          | Session  | List folders at a level (`scope=shared` for shared-only)|
| `POST` | `/api/documents/folders`                    | Session  | Create a folder (`name`, optional `parentId`)           |
| `GET`  | `/api/documents/folders/:id/path`           | Session* | Breadcrumb trail from the root                          |
| `PATCH`| `/api/documents/folders/:id`                | Owner    | Rename a folder                                         |
| `DELETE`| `/api/documents/folders/:id`               | Owner    | Delete a folder, subfolders, and files                  |
| `POST` | `/api/documents/uploads`                    | Session  | Get a presigned S3 upload URL (`{ name }`)              |
| `GET`  | `/api/documents/files?parentId=`            | Session  | List files in a folder (or root + shared)               |
| `POST` | `/api/documents/files`                      | Session* | Register an uploaded object (`name`, `key`, `size`, …)  |
| `GET`  | `/api/documents/files/:id/download`         | Session* | Presigned download URL                                  |
| `DELETE`| `/api/documents/files/:id`                 | Owner    | Delete a file record                                    |
| `GET`  | `/api/documents/teammates`                  | Session  | List workspace users                                    |
| `GET`  | `/api/documents/folders/:id/shares`         | Owner    | Sharing state (`sharedAll`, `publicSlug`, users)        |
| `PATCH`| `/api/documents/folders/:id/shares`         | Owner    | Toggle `sharedAll`                                      |
| `POST` | `/api/documents/folders/:id/shares`         | Owner    | Share with a specific person (`{ userId }`)             |
| `DELETE`| `/api/documents/folders/:id/shares/:userId` | Owner   | Remove a person's access                                |
| `POST` | `/api/documents/folders/:id/shares/public`  | Owner    | Generate a public link slug                             |
| `DELETE`| `/api/documents/folders/:id/shares/public` | Owner    | Revoke the public link                                  |
| `GET`  | `/api/public/documents/folders/:slug`       | Public   | Read-only folder snapshot (no auth)                     |
| `GET`  | `/api/public/documents/files/:id/download`  | Public   | Download from a publicly shared folder (no auth)        |

\* Requires ownership of, or shared access to, the folder.

Uploads are a two-step flow: `POST /api/documents/uploads` returns a presigned PUT URL (via `lib/file.ts`), the browser uploads the bytes directly to S3, then `POST /api/documents/files` registers the stored object. Requires the `AWS_S3_*` environment variables. Public folders render at `/d/:slug`.

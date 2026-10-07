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

Email campaigns app — coming soon. No endpoints are exposed yet.

## Notes

Shared notes workspace — coming soon. No endpoints are exposed yet.

**English** | [中文](README.zh-CN.md)

# GreenLight ⛳

GreenLight monitors golf courses in Vancouver. When a tee time that matches your criteria becomes available, GreenLight sends you an email.

**Live site: <https://lilmuh.github.io/greenlight-frontend/>**

> A private monorepo contains the server side (backend, scraper and database schema). This public repository contains only the web UI.

## What it does

Tee times at the municipal courses around Vancouver go quickly. Weekend afternoon and twilight slots are often booked within minutes of their release. After that, you can only wait for a cancellation. It is not practical to check the booking sites manually.

GreenLight does the monitoring for you:

* You set the criteria: courses, weekdays, a tee-off time window and group size.
* The backend polls the booking systems of the courses on a schedule. It converts the data from each provider into one format and stores the current open slots.
* When a matching slot appears, you get an email immediately. If someone books a slot and the slot becomes available again later, you get another email.
* The web UI reads from the database. Thus pages load quickly, and a page view does not send requests to the booking sites.

## Architecture

GreenLight has a public frontend (this repo) and a private server-side monorepo (`greenlight`). Each one deploys independently.

```
  greenlight-frontend  ──REST/JSON──▶  greenlight/backend
  (this repo)                          Spring Boot
  React + TypeScript (Vite)            · REST API for the UI
                                       · @Scheduled poller
                                       · dedup + email alerts
                                            │            │
                                        JPA │            │ HTTP
                                            ▼            ▼
                              greenlight/database   greenlight/scraper
                              Postgres + Liquibase  Node, fetches and
                                                    normalizes tee times
                                                    (POST /scrape)
```

| Repository | Role | Stack |
| --- | --- | --- |
| **greenlight-frontend** (this repo) | The web UI: edit watch configs and view current tee times. | React, TypeScript, Vite |
| `greenlight/backend` (private) | REST API, scheduled polling, de-duplication and email alerts. | Java 21, Spring Boot, Gradle |
| `greenlight/scraper` (private) | Gets availability from each booking system and converts it into one format. | Node, TypeScript |
| `greenlight/database` (private) | Schema (Liquibase) and local database setup (Docker). | PostgreSQL, Liquibase |

The frontend stays public, because a static site goes to the browser of each visitor as-is. The private `greenlight` monorepo contains the backend, the scraper and the database schema. The two repositories share only one thing: a documented JSON contract.

## This repository

The frontend uses React and TypeScript. Vite builds it as a multi-page app (MPA) with two entries. Each page has its own React root, and a plain link goes from one page to the other. The frontend talks only to the REST API of the backend. It never talks to the scraper or the database directly.

```
greenlight-frontend/
├── index.html               # entry: tee-time view
├── config.html              # entry: watch-config editor
├── vite.config.ts           # two-entry MPA build
└── src/
    ├── api.ts               # all backend calls + DTO types live here
    └── pages/
        ├── tee-times/       # strings / logic / reducer / components / styles.css
        └── config/          # same structure
```

`src/api.ts` contains all `fetch` calls. Named functions wrap them, for example `getTeeTimes()`, `listWatchConfigs()` and `createWatchConfigs()`. TypeScript types record the JSON contract of the backend. Vitest tests cover the pure logic (grouping, filtering, booking links and form normalization). To run the tests, use `npm test`.

### Endpoints used

| Method | Path | Used for |
| --- | --- | --- |
| `GET` | `/api/health` | connectivity check |
| `GET` | `/api/courses` | filling the course pickers |
| `GET` | `/api/tee-times?course=&date=&onlyAvailable=` | the tee-time view |
| `GET` | `/api/watch-configs` | listing saved watches |
| `POST` | `/api/watch-configs` | creating a watch |
| `PUT` | `/api/watch-configs/{id}` | updating a watch |
| `DELETE` | `/api/watch-configs/{id}` | deleting a watch |

## Run locally

### Prerequisites

The frontend has no data to show on its own. Start the rest of the stack first, in this order:

1. `greenlight/database`: run `docker compose up -d`, then apply the Liquibase changelog.
2. `greenlight/scraper`: run `npm install && npm run dev`.
3. `greenlight/backend`: start the Spring Boot application. In development, make sure that CORS allows the origin of this frontend. If it does not, all requests fail.

For more details, see the README in each directory of the monorepo.

### Run the frontend

```bash
npm install
npm run dev
```

Open the URL that the command shows. `npm test` runs the unit tests. `npm run build` writes the static site to `dist/`.

### Configure the API base URL

The backend address and the Google OAuth Client ID come from Vite environment variables. Vite reads them at build time and in dev mode. The deploy workflow sets them from the repository variables `API_BASE` and `GOOGLE_CLIENT_ID`:

```bash
VITE_API_BASE=http://localhost:8080 VITE_GOOGLE_CLIENT_ID=xxx.apps.googleusercontent.com npm run dev
```

If you do not set `VITE_API_BASE`, the default is `http://localhost:8080`. If you do not set a Client ID, the page hides the Google button and offers only email-code sign-in. When the backend uses dev mail mode, it writes the code to the backend log.

### Sign-in

The tee-time search page is public. The Watch Alerts page requires sign-in, with Google or with a 6-digit code that the backend sends by email. Each account sees only its own watches.

The admin account signs in with a username and password. It sees the watches of all users, grouped by owner. It can edit, pause or delete any of them.

The browser keeps the session token in `localStorage` and sends it as `Authorization: Bearer …`.

## Roadmap

- [x] Connect `config.html` to the watch-config API
- [x] Tee-time view with course and date filters
- [ ] Live refresh: poll `/api/tee-times` first, then move to SSE or WebSockets
- [x] Migrate to a framework: React + TypeScript on Vite (2026-09)

## Related repositories

* 🖥️ greenlight-frontend (this repo, public): live at <https://lilmuh.github.io/greenlight-frontend/>
* 🔒 greenlight (private server-side monorepo): `backend/` Spring Boot, `scraper/` Node, `database/` Liquibase

## License

[GNU Affero General Public License v3.0](LICENSE).

You can use, change and redistribute this code. The Affero clause adds one
condition to the GPL: if you run a changed version as a network service,
you must make its source available to the users of that service.

The server-side monorepo uses the same license.
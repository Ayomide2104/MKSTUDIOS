# MK Studios backend

A small Express API with MongoDB Atlas connectivity, health checks, and a starter User model. The existing `index.html` and `css/style.css` remain in place; this API does not expose database credentials to browser code.

## Prerequisites

- Node.js 20.19 or newer and npm
- A MongoDB Atlas cluster and database user
- MongoDB Compass is optional

## Install and configure

From the project root, install dependencies:

```sh
npm install
```

The local `.env` file is ignored by Git. Set its values locally:

```dotenv
PORT=3000
NODE_ENV=development
MONGODB_URI=mongodb+srv://<username>:<password>@<cluster-host>/<database>
CLIENT_URL=http://localhost:5173
```

Replace the placeholders with your Atlas database username, password, cluster hostname, and database name. Do not paste secrets into source files, documentation, frontend code, or commits. If a password contains reserved URI characters such as `@`, `:`, `/`, `?`, `#`, or `%`, percent-encode the password portion only. Do not encode the whole URI. `.env.example` is a placeholder and is safe to copy as a template; it is not a working credential.

## Atlas setup

1. In Atlas Database Access, use a database user with only the permissions required by the application.
2. Grant that database user only the required read/write access to `mkstudios`.
3. In Atlas Network Access, allow the development machine’s current public IP. Avoid broad `0.0.0.0/0` access unless you have a deliberate, temporary reason and understand the exposure.
4. Put the complete replacement URI in the local `.env` as `MONGODB_URI`. The application reads it only from the environment.

Atlas connectivity depends on valid credentials, database permissions, an allowed client IP, a running cluster, DNS SRV support, and outbound access to MongoDB. This project does not create collections or seed records on startup. Mongoose may build the declared unique email index when the User model is first used; plan index creation appropriately if deploying against existing data with duplicate emails.

## Run

Development with automatic restart:

```sh
npm run dev
```

Production-style start:

```sh
npm start
```

## Frontend

The site uses semantic HTML, custom CSS, and vanilla JavaScript, with Vite for local development and production builds. It does not add a frontend framework or animation library.

Start the API in one terminal (this connects to the configured Atlas database):

```sh
npm run dev
```

Start the frontend in a second terminal:

```sh
npm run frontend:dev
```

Vite serves the site at `http://localhost:5173` and proxies `/api` requests to `http://localhost:3000`. Set `API_PROXY_TARGET` in the Vite process environment if the API listens elsewhere. This setting is a URL, not a secret.

Create a static production build with:

```sh
npm run frontend:build
```

The generated site is in `dist/` and can be deployed to a static host. The Express server remains API-only. Project imagery, work, service scope, studio details, and contact destination are marked as placeholders where verified studio content was not available. The contact section does not submit messages.

The server waits for the initial Atlas connection before listening. It defaults to port 3000. `CLIENT_URL` accepts a comma-separated list of allowed browser origins; configure the real frontend origin for deployment. Requests without an `Origin` header (such as curl) are allowed.

## Health endpoints

- `GET http://localhost:3000/api/health` reports API status, timestamp, and environment.
- `GET http://localhost:3000/api/health/db` reports the actual Mongoose connection state; disconnected state returns HTTP 503.

## MongoDB Compass

Compass connects directly to Atlas, while this API connects through Mongoose. In Compass, create a new connection using the same Atlas SRV URI stored in the local `.env`; enter the replacement password in Compass’s credential UI or its local connection configuration, and do not share screenshots or connection files containing credentials. If the API connects but Compass does not, verify Compass’s saved credentials, the Atlas Network Access IP allowlist, and its DNS/network access independently.

## Tests

Run the built-in Node test suite:

```sh
npm test
```

The health route tests do not require a live Atlas database. The actual DB health result is only healthy when Mongoose is connected.

## Troubleshooting

- **`node` or `npm` not found:** install Node.js 20.19 or newer and reopen the terminal so PATH updates.
- **`MONGODB_URI is required`:** create the local `.env` and set the URI.
- **Authentication failed:** rotate the database user password in Atlas, confirm the username, and percent-encode reserved characters in the password portion.
- **Server selection timeout / DNS error:** check that the cluster is active, the hostname is correct, DNS SRV lookups work, and outbound MongoDB traffic is allowed.
- **IP not authorized:** add only the current client IP in Atlas Network Access.
- **Not authorized:** grant the Atlas database user appropriate access to `mkstudios`.
- **Duplicate email index failure:** inspect existing data for normalized duplicate email addresses before creating the unique index.

## Security and Git

Never commit `.env` or share its contents. `.gitignore` excludes local environment files, dependencies, logs, build output, and coverage reports. If `.env` was ever committed, rotate its secrets immediately, then remove it from the Git index without deleting the local file using `git rm --cached .env` and commit that removal. Ignore rules do not remove a file already tracked. Keep all database credentials server-side; do not put `MONGODB_URI` into HTML or browser JavaScript.

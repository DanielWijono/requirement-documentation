# Deploying Quire

Quire runs on one server with Docker Compose: Postgres, the API (which also serves real-time co-editing),
Caddy (TLS and the web app), and a nightly backup job. Only ports 80 and 443 are open to the outside.

```
browser ──https──▶ Caddy ─┬─ /            the built web app
                          ├─ /api/*       ─▶ api:3000 ─▶ postgres
                          └─ /collab      ─▶ api:3000 (WebSocket)
backup ── pg_dump nightly ─▶ ./backups
```

## What you need

- A Linux server with Docker Engine and the Compose plugin (2 GB RAM is plenty to start).
- A domain name with an A (and AAAA, if you have IPv6) record pointing at the server.
- Ports 80 and 443 open. Caddy uses them to get and renew the TLS certificate.
- An SMTP account for invite and password-reset emails (Postmark, Mailgun, SES, your own mail server…).

## First deploy

```sh
git clone https://github.com/DanielWijono/requirement-documentation.git quire
cd quire
cp deploy/.env.example .env
```

Fill in every value in `.env`. For the secrets:

```sh
openssl rand -hex 24   # POSTGRES_PASSWORD
openssl rand -hex 32   # BETTER_AUTH_SECRET
```

Then start everything:

```sh
docker compose -f compose.prod.yaml up -d --build
docker compose -f compose.prod.yaml ps      # api, postgres, web and backup running; migrate exited 0
```

The `migrate` job applies database migrations and exits. The API only starts after it succeeds.

### Create the first admin

Quire is invite-only, so the first account is made from the command line:

```sh
docker compose -f compose.prod.yaml exec api npx tsx src/cli/bootstrap-admin.ts --email you@example.com --name "Your Name"
```

It asks for a password (at least 10 characters). It only works while there is no admin yet. Then open
`https://<your domain>`, sign in, and invite everyone else from **People** in the account menu (your avatar, top right).

Production starts empty. The demo workspace (`npm run db:seed`) refuses to run against a production database.

## Updating

```sh
git pull
docker compose -f compose.prod.yaml up -d --build
```

Migrations run automatically before the new API starts. Open co-editing sessions reconnect on their own,
and their changes are saved before the old API stops.

## Backups

The `backup` service writes `backups/quire-YYYY-MM-DD.dump` every day at `BACKUP_HOUR` (UTC). It keeps
`BACKUP_KEEP_DAYS` days of dumps. The dumps sit on the same disk as the database, so copy them somewhere
else too (another machine, object storage).

```sh
docker compose -f compose.prod.yaml exec backup quire-backup now   # take a backup right now
ls -lh backups/
```

### Restoring

This replaces the current data with the dump's contents.

```sh
docker compose -f compose.prod.yaml stop api web
docker compose -f compose.prod.yaml exec -T postgres \
  pg_restore --clean --if-exists --no-owner -U quire -d quire < backups/quire-2026-09-24.dump
docker compose -f compose.prod.yaml start api web
```

Sessions live in the database too, so anyone who signed in after the backup was taken has to sign in again.
Practise a restore now and then: restore into a scratch server and check that the pages you expect are there.

## Email

Invites and password resets use the `SMTP_*` settings. Use port 587 with `SMTP_SECURE=false` (STARTTLS),
or port 465 with `SMTP_SECURE=true`. `MAIL_FROM` must be an address your provider lets you send from.
If emails don't arrive, the API log says why:

```sh
docker compose -f compose.prod.yaml logs api | grep -i mail
```

## Looking after it

```sh
docker compose -f compose.prod.yaml logs -f api       # API and co-editing
docker compose -f compose.prod.yaml logs -f web       # Caddy: requests, certificates
curl -s https://<your domain>/api/health              # {"ok":true,"db":"up"}
```

## Security notes

- Sessions are HTTP-only, `Secure`, `SameSite=Lax` cookies. Writes and co-editing connections must come from
  your domain (Origin check).
- Page bodies are sanitized by the API before they are stored. Caddy adds a Content-Security-Policy on top.
- Sign-in, password-reset requests and resets are rate-limited per IP address.
- Changing `BETTER_AUTH_SECRET` signs everyone out. Changing `POSTGRES_PASSWORD` after the first start
  also means changing it inside Postgres (`ALTER USER quire PASSWORD '…'`).

## Trying the production setup locally

With Docker able to pull images, this starts the production compose file on your machine with
`DOMAIN=localhost`, checks that the site and API answer over HTTPS, takes a backup, and removes it all again:

```sh
sh scripts/smoke-prod.sh
```

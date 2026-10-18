# Deploying the clinic system

This guide covers a production deployment on one Linux server. Two routes: **Docker** (recommended) or **plain Node.js + systemd**. Both put an HTTPS reverse proxy in front of the app.

> The app handles medical records. Serve it over HTTPS only, keep the server patched, and back up the database every day.

## 1. Before you start

| Need | Notes |
|---|---|
| A server | 1 vCPU / 1 GB RAM is plenty for one clinic |
| A domain name | e.g. `clinic.example.edu`, pointing at the server |
| Docker + Compose **or** Node.js 22.9+ and MySQL 8.x | |
| Ports 80 and 443 open | Port 3000 stays private (bound to 127.0.0.1) |

The login screen and sidebar expect image files in `frontend/css/` (`ulslogo.png`, `uls-background.png`, `uls-background-night.png`, `uls-sidebar-portrait.png`) and `frontend/assets/uls-logo.png`. They were **not in the project archive**. Add them before going live or the pages will show without branding.

## 2. Route A: Docker

    cp .env.docker.example .env
    # edit .env: set MYSQL_ROOT_PASSWORD, DB_PASSWORD (openssl rand -base64 24) and CLINIC_ORIGIN
    docker compose up -d --build
    docker compose logs -f app          # wait for "Clinic server: ..."

The app container applies database migrations on every start, so upgrading is `git pull && docker compose up -d --build`.

Create the first staff accounts (you are prompted for a password of 12-200 characters):

    docker compose exec app node scripts/create-user.js dr.santos doctor "Dr. Maria Santos"
    docker compose exec app node scripts/create-user.js nurse.reyes nurse "Ana Reyes"

Do **not** run `seed-users` in production: it creates well-known accounts. In production it refuses to run unless you provide `SEED_PASSWORD`.

## 3. Route B: Node.js + systemd

    # MySQL: create a dedicated user (never use root)
    CREATE USER 'clinic_app'@'localhost' IDENTIFIED BY '<strong password>';
    GRANT ALL ON clinic.* TO 'clinic_app'@'localhost';
    -- the schema has triggers; with binary logging on, also run once as an admin:
    SET GLOBAL log_bin_trust_function_creators = 1;   -- and persist it in my.cnf

    cd backend
    npm ci --omit=dev
    cp .env.example .env     # set NODE_ENV=production, DB_*, COOKIE_SECURE=true, TRUST_PROXY=1, CLINIC_ORIGIN, HOST=127.0.0.1
    chmod 600 .env
    npm run migrate
    npm run create-user -- dr.santos doctor "Dr. Maria Santos"

`/etc/systemd/system/clinic.service`:

    [Unit]
    Description=SLC University Clinic System
    After=network.target mysql.service

    [Service]
    WorkingDirectory=/opt/clinic/backend
    ExecStart=/usr/bin/node --env-file-if-exists=.env server.js
    Restart=always
    User=clinic
    NoNewPrivileges=true
    ProtectSystem=full

    [Install]
    WantedBy=multi-user.target

    sudo systemctl enable --now clinic

## 4. HTTPS reverse proxy

**Caddy** (automatic certificates), `/etc/caddy/Caddyfile`:

    clinic.example.edu {
        encode gzip
        reverse_proxy 127.0.0.1:3000
    }

**nginx** (with certbot):

    server {
        listen 443 ssl http2;
        server_name clinic.example.edu;
        # ssl_certificate lines added by certbot
        client_max_body_size 1m;
        location / {
            proxy_pass http://127.0.0.1:3000;
            proxy_set_header Host $host;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto $scheme;
        }
    }
    server { listen 80; server_name clinic.example.edu; return 301 https://$host$request_uri; }

The `Host` header must reach the app unchanged: the CSRF origin check compares it with the browser's `Origin`.

## 5. Production settings checklist

| Variable | Production value |
|---|---|
| `NODE_ENV` | `production` (refuses root DB user and empty/placeholder DB password) |
| `COOKIE_SECURE` | `true` (also turns on HSTS) |
| `TRUST_PROXY` | `1` behind one proxy. Without it every user shares the proxy's address and the login rate limit locks everyone out together |
| `CLINIC_ORIGIN` | `https://clinic.example.edu` |
| `HOST` | `127.0.0.1` (Node route) or `0.0.0.0` inside Docker |
| `DB_USER` | a dedicated user, not `root` |

## 6. Health checks and logs

- `GET /healthz`: the process is up (use for liveness).
- `GET /readyz`: the process can reach MySQL (use for readiness and uptime monitoring). Returns 503 otherwise.
- Request logs go to stdout: method, path, status, time. Query strings are never logged because searches can contain patient names. Use `docker compose logs app` or `journalctl -u clinic`.

## 7. Backups (required)

Daily, off the server:

    docker compose exec -T db sh -c 'mysqldump -uroot -p"$MYSQL_ROOT_PASSWORD" --single-transaction --routines --triggers clinic' | gzip > clinic-$(date +%F).sql.gz

Or, without Docker: `mysqldump -u clinic_app -p --single-transaction --triggers clinic | gzip > ...`. Test a restore at least once: `gunzip -c clinic-DATE.sql.gz | mysql -u clinic_app -p clinic`. Keep backups encrypted and access-controlled.

## 8. Security notes

- Sessions last 8 hours, are stored hashed in MySQL, and cookies are `HttpOnly; SameSite=Strict` (plus `Secure` when `COOKIE_SECURE=true`).
- State-changing requests need a per-session CSRF token and a same-origin check.
- Login is rate limited to 30 attempts per address per 10 minutes. The limiter is in memory, so run **one** app instance.
- A Content-Security-Policy blocks inline and third-party scripts on the app pages.
- Pages under `/doctor`, `/nurse` and `/shared` require a staff login before the HTML is sent.
- If a `.env` file with real credentials was ever shared, committed, or emailed, **change those database passwords now**.

## 9. Upgrading and rollback

1. Take a backup (section 7).
2. `git pull`, then `docker compose up -d --build` (or `npm ci --omit=dev && npm run migrate && sudo systemctl restart clinic`).
3. Migrations only move forward. To roll back, redeploy the previous version and restore the backup.

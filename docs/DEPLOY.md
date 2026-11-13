# Deploying ARENA11

## Option A: venue laptop or mini PC on the local network

Use the README "Run it with Docker" steps. Staff phones and the TV use `http://<laptop-IP>:8080`. Give the laptop a fixed IP in the router so the address doesn't change. Keep `COOKIE_SECURE=false` on plain HTTP.

## Option B: public server with a domain (recommended for the website)

Any small Linux VPS (1 vCPU, 1–2 GB RAM) with Docker.

1. Point the domain's DNS `A` record at the server.
2. Copy the project to the server, then:

   ```bash
   cp .env.example .env
   # DB_PASSWORD=<long random>   APP_SECRET=<32+ random chars>   COOKIE_SECURE=true
   docker compose up -d --build
   ```

3. Put HTTPS in front. With Caddy (gets certificates automatically), `/etc/caddy/Caddyfile`:

   ```
   arena11.example.com {
       reverse_proxy localhost:8080
   }
   ```

   With nginx, proxy to `127.0.0.1:8080` and pass WebSocket upgrades for `/socket.io/` (`proxy_http_version 1.1; proxy_set_header Upgrade $http_upgrade; proxy_set_header Connection "upgrade";`) and `X-Forwarded-For`.

4. Close port 8080 to the outside (firewall) so only the proxy reaches it.
5. Visit `/command` and create the owner account straight away.
6. The venue bridge then uses `serverUrl: "https://arena11.example.com"`.

The server refuses to start in production with a weak or placeholder `APP_SECRET` or a database URL that still contains the `change-me` placeholder.

## Updating

```bash
git pull            # or copy the new files
docker compose up -d --build
```

Database migrations run on start. Sessions survive an update.

## Backup

Everything (players, matches, bookings, website settings, gallery images) is in PostgreSQL.

```bash
mkdir -p backups
docker compose exec -T db pg_dump -U arena -Fc arena > backups/arena-$(date +%F).dump
```

Nightly with cron (`crontab -e`):

```
30 3 * * * cd /opt/arena11 && docker compose exec -T db pg_dump -U arena -Fc arena > backups/arena-$(date +\%F).dump && find backups -name '*.dump' -mtime +30 -delete
```

Copy the `backups/` folder off the machine regularly (cloud drive, USB).

## Restore

```bash
docker compose stop app
docker compose exec -T db pg_restore -U arena -d arena --clean --if-exists < backups/arena-2026-10-30.dump
docker compose start app
```

Keep the same `APP_SECRET`: hub device secrets are encrypted with it. With a new secret, register the hub devices again.

## Health

- `GET /api/health` answers when the app and database are up. `docker compose ps` shows both services; `docker compose logs -f app` shows requests and errors (no secrets are logged).
- The Live section on the website reads "NO ACTIVE MISSION" when the API is up and nothing is running.

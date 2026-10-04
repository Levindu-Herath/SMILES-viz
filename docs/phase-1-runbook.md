# Phase 1 runbook — deploy SMILES-viz to EC2

> **You run every command here, live.** Nothing in this file is automated.
> Placeholders: `<ACCOUNT_ID>`, `<REGION>`, `<EIP>` (Elastic IP), `<KEY>.pem`, `<SHA>` (git commit).
> ⚡ = large download/upload — use the fast connection.

## 0. AWS console prerequisites (live session)

- [ ] EC2: Ubuntu **24.04 LTS**, **t3.small**, public subnet, **gp3 root volume ≥ 20 GB**
      (images ≈ 2.6 GB + Docker overhead + logs).
- [ ] Security group: **22** from *my IP only*; **80** and **443** from `0.0.0.0/0` and `::/0`.
      **Do not open 3000 or 8000** — Nginx is the only public entry point.
- [ ] IAM **instance role** with `AmazonEC2ContainerRegistryReadOnly` attached to the instance
      (the box pulls from ECR with no stored keys).
- [ ] **Elastic IP** allocated and associated (public IPv4 ≈ $3.6/month; release it if you tear down).
- [ ] ECR repositories: `smiles-viz-backend`, `smiles-viz-frontend` (same region).

## 1. Laptop — build, check, push images (PowerShell, repo root)

```powershell
git status                                  # clean; everything committed
$sha    = git rev-parse --short HEAD
$cfg    = (Get-Content .env | Where-Object { $_ -match '^[A-Z_]+=' }) -join "`n" | ConvertFrom-StringData
$ecr    = "<ACCOUNT_ID>.dkr.ecr.<REGION>.amazonaws.com"

# Backend — runtime-configured, same image everywhere
docker build -t "$ecr/smiles-viz-backend:$sha" backend

# Frontend — PROD build: API URL deliberately EMPTY (relative /api via Nginx)
docker build -t "$ecr/smiles-viz-frontend:${sha}-prod" `
  --build-arg NEXT_PUBLIC_API_URL= `
  --build-arg NEXT_PUBLIC_SUPABASE_URL=$($cfg.SUPABASE_URL) `
  --build-arg NEXT_PUBLIC_SUPABASE_ANON_KEY=$($cfg.SUPABASE_ANON_KEY) `
  frontend
```

- [ ] Sanity check — prod bundle should not target localhost (expect `0`;
      if non-zero, the decisive test is step 6's browser check):
  ```powershell
  docker run --rm --entrypoint sh "$ecr/smiles-viz-frontend:${sha}-prod" -c "grep -rl 'localhost:8000' .next/static | wc -l"
  ```
- [ ] Log in to ECR and push ⚡ (≈ 600 MB backend + ≈ 100 MB frontend, first push):
  ```powershell
  aws ecr get-login-password --region <REGION> | docker login --username AWS --password-stdin $ecr
  docker push "$ecr/smiles-viz-backend:$sha"
  docker push "$ecr/smiles-viz-frontend:${sha}-prod"
  ```
- [ ] Copy the deploy files to the box:
  ```powershell
  scp -i <KEY>.pem docker-compose.prod.yml .env.prod.example deploy/nginx/molytica-stage1-http.conf deploy/nginx/molytica.conf ubuntu@<EIP>:~/
  ```

## 2. Box — base setup (`ssh -i <KEY>.pem ubuntu@<EIP>`)

- [ ] Updates: `sudo apt update && sudo apt -y upgrade` (reboot if a kernel was updated).
- [ ] **2 GB swapfile** (t3.small has 2 GB RAM; 200 MB model uploads are read into memory):
  ```bash
  sudo fallocate -l 2G /swapfile && sudo chmod 600 /swapfile
  sudo mkswap /swapfile && sudo swapon /swapfile
  echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
  free -h                                  # Swap: 2.0Gi
  ```
- [ ] **Docker Engine + compose plugin** (official Docker apt repo):
  ```bash
  sudo apt-get install -y ca-certificates curl
  sudo install -m 0755 -d /etc/apt/keyrings
  sudo curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
  sudo chmod a+r /etc/apt/keyrings/docker.asc
  echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
  sudo apt-get update
  sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
  sudo usermod -aG docker ubuntu           # then log out and back in
  docker compose version                   # works without sudo
  ```
- [ ] **AWS CLI** (uses the instance role — no keys): `sudo snap install aws-cli --classic`
      then `aws sts get-caller-identity` shows the role ARN.

## 3. Box — app config

```bash
mkdir -p ~/smiles-viz && mv ~/docker-compose.prod.yml ~/.env.prod.example ~/molytica*.conf ~/smiles-viz/
cd ~/smiles-viz
cp .env.prod.example .env.prod && nano .env.prod    # real values + BACKEND_IMAGE/FRONTEND_IMAGE with <SHA>
chmod 600 .env.prod                                 # secrets: owner-only
echo "alias dc='docker compose --env-file ~/smiles-viz/.env.prod -f ~/smiles-viz/docker-compose.prod.yml'" >> ~/.bashrc
source ~/.bashrc
```

- [ ] `dc config --quiet` prints nothing (all `:?` values set).
- [ ] **Every** compose command uses `dc` (`dc ps`, `dc logs`, `dc down`) — never bare `docker compose`.

## 4. Box — pull and start (never build here)

```bash
aws ecr get-login-password --region <REGION> | docker login --username AWS --password-stdin <ACCOUNT_ID>.dkr.ecr.<REGION>.amazonaws.com
dc pull                                   # ECR login token lasts 12 h — re-login before later pulls
dc up -d
dc ps                                     # backend (healthy); ports 127.0.0.1:8000 / 127.0.0.1:3000
```

- [ ] Internal checks on the box:
  ```bash
  curl -s http://127.0.0.1:8000/api/health        # {"status":"ok"}
  curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:3000/   # 307 (redirect to /visualize)
  ```
- [ ] From the **laptop**, app ports must be unreachable:
  `curl.exe -m 5 http://<EIP>:8000/api/health` → times out / refused.

## 5. Box — Nginx, stage 1 (HTTP only)

```bash
sudo apt install -y nginx certbot
sudo mkdir -p /var/www/certbot
sudo cp ~/smiles-viz/molytica-stage1-http.conf /etc/nginx/sites-available/molytica
sudo ln -s /etc/nginx/sites-available/molytica /etc/nginx/sites-enabled/molytica
sudo rm /etc/nginx/sites-enabled/default        # our server becomes the catch-all (bare IP works)
sudo nginx -t && sudo systemctl reload nginx
```

## 6. Test over HTTP on the bare IP (before touching DNS)

- [ ] Browser → `http://<EIP>` loads the app with styling.
- [ ] DevTools → Network: API calls go to **`http://<EIP>/api/...`** (same host, relative URL — proves option 2).
      Calls to `localhost:8000` here = wrong frontend build → rebuild step 1.
- [ ] Predict works. (Skip login here — test auth over HTTPS in step 9.)

## 7. DNS → box (must happen BEFORE Certbot)

- [ ] DuckDNS → `molytica` → set IP to `<EIP>` → **update ip**.
- [ ] Laptop: `nslookup molytica.duckdns.org 8.8.8.8` returns **`<EIP>`** (not the home IP).
- [ ] Browser → `http://molytica.duckdns.org` loads the app.

> Why this order: Let's Encrypt validates by fetching
> `http://molytica.duckdns.org/.well-known/acme-challenge/<token>` **from the internet**.
> It goes wherever DNS points, over **port 80**. Wrong DNS or closed port 80 → issuance fails,
> and repeated failures hit rate limits.

## 8. Certificate + Nginx stage 2 (HTTPS)

```bash
# Rehearse against the staging CA first (no rate-limit risk)
sudo certbot certonly --webroot -w /var/www/certbot -d molytica.duckdns.org --dry-run \
  --email <YOUR_EMAIL> --agree-tos --no-eff-email
# Real certificate; the deploy hook reloads Nginx after every future renewal
sudo certbot certonly --webroot -w /var/www/certbot -d molytica.duckdns.org \
  --email <YOUR_EMAIL> --agree-tos --no-eff-email --deploy-hook "systemctl reload nginx"

sudo cp ~/smiles-viz/molytica.conf /etc/nginx/sites-available/molytica
sudo nginx -t && sudo systemctl reload nginx
```

- [ ] Renewal is automatic: `systemctl list-timers | grep certbot` shows the timer;
      `sudo certbot renew --dry-run` succeeds.

## 9. Verify HTTPS end to end

```bash
curl -sI http://molytica.duckdns.org | head -3          # 301 → https://molytica.duckdns.org/
curl -s  https://molytica.duckdns.org/api/health        # {"status":"ok"}
curl -sI https://molytica.duckdns.org | grep -i strict  # Strict-Transport-Security: max-age=86400
# CORS: allowed origin echoed back; foreign origin rejected (400)
curl -si -X OPTIONS https://molytica.duckdns.org/api/predict -H "Origin: https://molytica.duckdns.org" -H "Access-Control-Request-Method: POST" | grep -i access-control-allow-origin
curl -si -X OPTIONS https://molytica.duckdns.org/api/predict -H "Origin: https://evil.example" -H "Access-Control-Request-Method: POST" | head -1
sudo ss -tlnp | grep -E ':(80|443|3000|8000) '         # 80/443 on 0.0.0.0 (nginx); 3000/8000 on 127.0.0.1 only
```

- [ ] Supabase → Authentication → URL Configuration: set **Site URL** `https://molytica.duckdns.org`,
      add redirect **`https://molytica.duckdns.org/auth/callback`** (keep the Vercel ones until cutover is done).
- [ ] Browser checklist on `https://molytica.duckdns.org`: padlock; every tab; register/login;
      predict lung/prostate/melanoma; dataset upload **> 1 MB** (proves `client_max_body_size`);
      model upload + predict with it (proves the volume is writable).

## 10. Cutover

- [ ] `NEXT_PUBLIC_API_URL`: **nothing to switch** — the prod bundle uses relative `/api` (option 2).
- [ ] **Train tab / local trainer:** the trainer only allows `*.vercel.app` + its defaults. Run it with
      `ALLOWED_ORIGINS=https://molytica.duckdns.org`, or release a trainer update — then confirm the
      Train tab detects `localhost:5000` from the new site.
- [ ] Share the new URL; watch `dc logs -f` and `/var/log/nginx/error.log` for 24–48 h.
- [ ] Then: **suspend the Render service**, pause/redirect the **Vercel** project, remove the old
      Vercel URLs from Supabase redirect settings.
- [ ] After a stable week: raise HSTS `max-age` to `31536000` in `molytica.conf`, reload Nginx.

## Operations reference

| Task | Command (on the box, in `~/smiles-viz`) |
|---|---|
| Status / logs | `dc ps` · `dc logs -f backend` · `sudo tail -f /var/log/nginx/error.log` |
| Deploy a new version | laptop: step 1 with the new SHA → box: edit tags in `.env.prod` → ECR login → `dc pull && dc up -d` → `docker image prune -f` |
| Roll back | set the previous `<SHA>` tags in `.env.prod` → `dc up -d` |
| Restart | `dc restart` (containers also return after reboot: `restart: unless-stopped`) |
| Stop | `dc down` — **never `dc down -v`** (deletes uploaded models in the `published-models` volume) |
| Change Nginx | edit the repo file → `scp` → `sudo cp` → `sudo nginx -t && sudo systemctl reload nginx` |

## Gotchas (keep in mind)

- `NEXT_PUBLIC_*` is **baked at build**. Supabase URL/key changes → rebuild the frontend image.
- Only Nginx is public. App ports are `127.0.0.1`-bound; never change them to `"3000:3000"`.
- `.env.prod` lives **only on the box** (`chmod 600`). The repo has the keys-only `.env.prod.example`.
- Never build the RDKit image on the box — always pull a tagged image from ECR.
- Never deploy `:latest` — always an immutable `<SHA>` tag, so rollback is one edit.

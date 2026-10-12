# Phase 1 runbook — deploy SMILES-viz to EC2

> **You run every command here, live.** Nothing in this file is automated.
> ⚡ = large download/upload — use the fast connection.

## This deployment

| Item | Value |
|---|---|
| Region | `ap-northeast-2` (Seoul — same region as the Supabase project) |
| AWS account / ECR registry | `256130491262` / `256130491262.dkr.ecr.ap-northeast-2.amazonaws.com` |
| Instance | `smiles-viz` — t3.small, Ubuntu 24.04 LTS (x86), role `smiles-viz-ec2`, SG `smiles-viz-web` |
| Elastic IP | `13.124.161.67` |
| Hostname | `molytica.duckdns.org` (DuckDNS) |
| SSH key (laptop) | `C:\Users\User\.ssh\smiles-viz-key.pem` |

Generic placeholders used below: `<SHA>` = short git commit, `<EIP>` = Elastic IP, `<YOUR_EMAIL>` = your email.

## Which terminal?

| Prompt | Where | What runs there |
|---|---|---|
| `PS F:\...>` | **Laptop**, Windows PowerShell | `docker build/push`, `aws` (your user), `ssh`, `scp` |
| `(base) C:\...>` | **Laptop**, Anaconda Prompt (cmd.exe) | the local trainer (`molytica-train`) |
| `ubuntu@ip-...:~$` | **The box**, bash over SSH | everything from step 2 on: `sudo ...`, `dc ...`, `nginx`, `certbot` |

- Run commands **as single lines**. Bash `\` continuations break in PowerShell.
- PowerShell sets env vars with `$env:NAME = "value"`; cmd uses `set NAME=value` (no quotes, no spaces around `=`).
- On the box, anything touching `/etc`, `/var/www`, `apt`, `systemctl`, `nginx` or `certbot` needs `sudo`. Docker/`dc` does not.

## 0. AWS prerequisites

**Console** — region selector set to **Asia Pacific (Seoul)** first.

- [ ] EC2 → Settings → **EBS encryption → enable by default** (free; applies to volumes created afterwards).
- [ ] IAM role: *AWS service → EC2*, policy **`AmazonEC2ContainerRegistryReadOnly`** only, name `smiles-viz-ec2`.
- [ ] Launch instance:
  - AMI **Ubuntu Server 24.04 LTS**, architecture **64-bit (x86)** (images are amd64; the console defaults to the newest LTS — pick 24.04).
  - Type **t3.small**. Key pair: new, ED25519, `.pem`.
  - Security group `smiles-viz-web`: **SSH 22 from My IP**, **HTTP 80** and **HTTPS 443 from 0.0.0.0/0**.
    **Never open 3000 or 8000.** The "0.0.0.0/0" warning is expected for 80/443 on a public site.
  - Storage **20 GiB gp3**. File systems: **None**.
  - Advanced details: IAM instance profile `smiles-viz-ec2`; metadata **V2 only**; credit specification **Standard**
    (Unlimited bills for sustained bursts).
- [ ] **Elastic IP**: allocate (Amazon's pool, border group `ap-northeast-2`, no Global Accelerator) → associate with the
      instance. Costs ≈ $3.6/month attached or not — release it if you tear the instance down.
- [ ] Instance shows **Running** and all status checks passed.

**Laptop (PowerShell)** — ECR repositories, with immutable tags:

```powershell
aws ecr create-repository --repository-name smiles-viz-backend --image-scanning-configuration scanOnPush=true
aws ecr create-repository --repository-name smiles-viz-frontend --image-scanning-configuration scanOnPush=true
aws ecr put-image-tag-mutability --repository-name smiles-viz-backend --image-tag-mutability IMMUTABLE
aws ecr put-image-tag-mutability --repository-name smiles-viz-frontend --image-tag-mutability IMMUTABLE
```

> Docker Desktop pushes each tag as an index + image + attestation; the last two show as **untagged** in ECR.
> **Never add a lifecycle rule that expires untagged images** — it deletes the layers behind your tags.

**SSH key (first time only)** — Windows `ssh` refuses keys other users can read:

```powershell
New-Item -ItemType Directory -Force "$env:USERPROFILE\.ssh"
Move-Item "$env:USERPROFILE\Downloads\smiles-viz-key.pem" "$env:USERPROFILE\.ssh\smiles-viz-key.pem"
$key = "$env:USERPROFILE\.ssh\smiles-viz-key.pem"; icacls $key /inheritance:r; icacls $key /grant:r "$($env:USERNAME):(R)"
```

Keep a backup of the `.pem` outside the repo — AWS keeps only the public half.

## 1. Laptop — build, check, push images (PowerShell, repo root)

**One-time Docker setup for ECR on Windows.** `docker login` to ECR fails on Windows with
`The stub received bad data` (the ECR token is too long for Windows Credential Manager). Instead, add this key to
`C:\Users\User\.docker\config.json` (right after the opening `{`):

```json
  "credHelpers": { "256130491262.dkr.ecr.ap-northeast-2.amazonaws.com": "ecr-login" },
```

Docker Desktop ships `docker-credential-ecr-login.exe`, which fetches a fresh token on every push — no `docker login`.

**Each release:**

```powershell
git status                                   # clean; everything committed
$sha = git rev-parse --short HEAD
$cfg = (Get-Content .env | Where-Object { $_ -match '^[A-Z_]+=' }) -join "`n" | ConvertFrom-StringData
$ecr = "256130491262.dkr.ecr.ap-northeast-2.amazonaws.com"
"sha=$sha  url-set=$([bool]$cfg.SUPABASE_URL)  anon-len=$($cfg.SUPABASE_ANON_KEY.Length)  ecr=$ecr"
```

Expect `url-set=True` and a non-zero `anon-len`. Variables live only in this window.

```powershell
docker build -t "$ecr/smiles-viz-backend:$sha" backend
docker build -t "$ecr/smiles-viz-frontend:${sha}-prod" --build-arg NEXT_PUBLIC_API_URL= --build-arg NEXT_PUBLIC_SUPABASE_URL=$($cfg.SUPABASE_URL) --build-arg NEXT_PUBLIC_SUPABASE_ANON_KEY=$($cfg.SUPABASE_ANON_KEY) frontend
docker run --rm --entrypoint sh "$ecr/smiles-viz-frontend:${sha}-prod" -c "grep -rl 'localhost:8000' .next/static | wc -l"
```

- `NEXT_PUBLIC_API_URL=` is **deliberately empty** → the bundle calls relative `/api/...` and works on any host.
- The last line must print `0`.

Push ⚡ (≈ 600 MB backend + ≈ 75 MB frontend on first push; later pushes upload only changed layers):

```powershell
aws configure export-credentials --format powershell | Invoke-Expression
docker push "$ecr/smiles-viz-backend:$sha"
docker push "$ecr/smiles-viz-frontend:${sha}-prod"
aws ecr list-images --repository-name smiles-viz-backend --query "imageIds[].imageTag"
aws ecr list-images --repository-name smiles-viz-frontend --query "imageIds[].imageTag"
Remove-Item Env:AWS_ACCESS_KEY_ID, Env:AWS_SECRET_ACCESS_KEY, Env:AWS_SESSION_TOKEN
```

- `export-credentials` hands your `aws login` session to the ECR helper for this window only.
  If a push says `no basic auth credentials`, run `aws login` again, then repeat it.
- A push that already exists fails with `ImageTagAlreadyExistsException` (immutable tags): commit, get a new `<SHA>`.
- In the push output, `Waiting` lines are normal — Docker uploads a few layers at a time.

First deploy only — copy the deploy files to the box:

```powershell
scp -i "$env:USERPROFILE\.ssh\smiles-viz-key.pem" docker-compose.prod.yml .env.prod.example deploy/nginx/molytica-stage1-http.conf deploy/nginx/molytica.conf ubuntu@13.124.161.67:~/
```

## 2. Box — base setup

Connect: `ssh -i "$env:USERPROFILE\.ssh\smiles-viz-key.pem" ubuntu@13.124.161.67` (type `yes` to the first-time
host-key prompt).

- [ ] Updates: `sudo apt update && sudo apt -y upgrade` (Enter on any "daemons using outdated libraries" screen).
      If `ls /var/run/reboot-required` shows the file, `sudo reboot` and reconnect.
- [ ] **2 GB swapfile** (t3.small has 2 GB RAM; 200 MB model uploads are read into memory):
  ```bash
  sudo fallocate -l 2G /swapfile && sudo chmod 600 /swapfile
  sudo mkswap /swapfile && sudo swapon /swapfile
  echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
  free -h
  ```
  Expect `Swap: 2.0Gi`.
- [ ] **Docker Engine + compose plugin** (official Docker apt repo):
  ```bash
  sudo apt-get install -y ca-certificates curl
  sudo install -m 0755 -d /etc/apt/keyrings
  sudo curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
  sudo chmod a+r /etc/apt/keyrings/docker.asc
  echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
  sudo apt-get update
  sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
  sudo usermod -aG docker ubuntu
  exit
  ```
  Reconnect (group membership applies at login), then check:
  `docker compose version`, `docker run --rm hello-world`, `systemctl is-enabled docker` → `enabled`.
- [ ] **AWS CLI** (uses the instance role — no keys): `sudo snap install aws-cli --classic`
      then `aws sts get-caller-identity` → `Arn` ends in `assumed-role/smiles-viz-ec2/i-...`.

## 3. Box — app config

```bash
mkdir -p ~/smiles-viz && mv ~/docker-compose.prod.yml ~/.env.prod.example ~/molytica*.conf ~/smiles-viz/
cd ~/smiles-viz
sed -i 's/\r$//' docker-compose.prod.yml .env.prod.example molytica*.conf
file docker-compose.prod.yml .env.prod.example molytica*.conf
```

- Files copied from a Windows checkout have **CRLF** line endings; a stray `\r` would become part of every
  `.env.prod` value. `file` must **not** say "with CRLF line terminators".

```bash
cp .env.prod.example .env.prod
chmod 600 .env.prod
nano .env.prod
```

- `chmod` **before** adding secrets, so the file is never readable by others.
- Fill in: `BACKEND_IMAGE=...:<SHA>`, `FRONTEND_IMAGE=...:<SHA>-prod`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`
  (copy from the laptop's root `.env`), `CORS_ORIGINS=https://molytica.duckdns.org`, `DEBUG=false`.
  No quotes, no spaces around `=`. nano: right-click pastes, Ctrl+O Enter saves, Ctrl+X exits.

```bash
echo "alias dc='docker compose --env-file ~/smiles-viz/.env.prod -f ~/smiles-viz/docker-compose.prod.yml'" >> ~/.bashrc
source ~/.bashrc
dc config --quiet && echo "config OK"
dc config --images
grep -c $'\r' .env.prod; grep -qE '^SUPABASE_URL=https://[a-z0-9]+\.supabase\.co$' .env.prod && echo "url format OK"
ls -l .env.prod
```

Expect `config OK`, both image refs, `0`, `url format OK`, `-rw-------`.
**Every** compose command uses `dc` (`dc ps`, `dc logs`, `dc down`) — bare `docker compose` fails the `:?` checks.

## 4. Box — pull and start (never build here)

```bash
aws ecr get-login-password --region ap-northeast-2 | docker login --username AWS --password-stdin 256130491262.dkr.ecr.ap-northeast-2.amazonaws.com
dc pull
dc up -d
```

- Linux has no Windows credential-store problem; the "stored unencrypted" warning is expected (12 h token).
- `dc pull` runs inside AWS (ECR → EC2, same region) — seconds, and no home bandwidth used.

Wait ~30 s, then:

```bash
dc ps
curl -s http://127.0.0.1:8000/api/health; echo
curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:3000/
docker stats --no-stream --format "table {{.Name}}\t{{.MemUsage}}"
free -h
```

Expect backend `(healthy)`, ports `127.0.0.1:...` only, `{"status":"ok"}`, `307`.
Baseline seen on first deploy: backend ≈ 145 MB, frontend ≈ 80 MB, ≈ 1.2 GiB available.

From the **laptop**, the app ports must be closed:

```powershell
foreach ($p in 22,3000,8000) { "port $p : " + (Test-NetConnection 13.124.161.67 -Port $p -WarningAction SilentlyContinue).TcpTestSucceeded }
```

Expect 22 `True`, 3000 and 8000 `False`.

## 5. Box — Nginx, stage 1 (HTTP only)

```bash
sudo apt install -y nginx certbot
sudo mkdir -p /var/www/certbot
sudo cp ~/smiles-viz/molytica-stage1-http.conf /etc/nginx/sites-available/molytica
sudo ln -s /etc/nginx/sites-available/molytica /etc/nginx/sites-enabled/molytica
sudo rm /etc/nginx/sites-enabled/default
sudo nginx -t && sudo systemctl reload nginx
```

- `nginx -t` **without `sudo`** fails with `open() "/run/nginx.pid" failed (13: Permission denied)` — not a config error.
- Removing `default` makes our server the catch-all, so the bare IP works for step 6.

Checks: `systemctl is-active nginx` → `active`; `curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1/` → `307`;
`curl -s http://127.0.0.1/api/health` → `{"status":"ok"}`.

## 6. Test over HTTP on the bare IP (before touching DNS)

- [ ] Browser → `http://13.124.161.67` loads with styling ("Not secure" is expected over HTTP).
- [ ] DevTools → Network: API calls go to `http://13.124.161.67/api/...` (same host — relative URLs work).
- [ ] Every tab opens; predict works.
- Skip login and uploads here (no TLS; Supabase redirects not configured yet).
- **The Train tab's local trainer cannot work over HTTP.** Chrome blocks a public, non-secure page from calling
  `localhost` ("not a secure context … more-private address space `loopback`") before the request leaves the
  browser. This is expected; test the trainer over HTTPS in step 9.

## 7. DNS → box (must happen BEFORE Certbot)

- [ ] DuckDNS → `molytica` → set IP to `13.124.161.67` → **update ip**.
- [ ] Laptop: `Resolve-DnsName molytica.duckdns.org -Server 8.8.8.8 -Type A` returns `13.124.161.67` (not the home IP).
- [ ] Browser → `http://molytica.duckdns.org` loads.

> Let's Encrypt validates by fetching `http://molytica.duckdns.org/.well-known/acme-challenge/<token>` **from the
> internet**, wherever DNS points, over **port 80**. Wrong DNS or closed port 80 → issuance fails, and repeated failures
> hit rate limits.

## 8. Certificate + Nginx stage 2 (HTTPS) — on the box, single lines

Dry run against the staging CA first (no rate-limit risk):

```bash
sudo certbot certonly --webroot -w /var/www/certbot -d molytica.duckdns.org --dry-run --email <YOUR_EMAIL> --agree-tos --no-eff-email
```

Expect `The dry run was successful.` Then the real certificate (the deploy hook reloads Nginx after every renewal):

```bash
sudo certbot certonly --webroot -w /var/www/certbot -d molytica.duckdns.org --email <YOUR_EMAIL> --agree-tos --no-eff-email --deploy-hook "systemctl reload nginx"
```

Switch to the HTTPS config:

```bash
sudo cp ~/smiles-viz/molytica.conf /etc/nginx/sites-available/molytica && sudo nginx -t && sudo systemctl reload nginx
```

Renewal checks:

```bash
systemctl list-timers | grep certbot
sudo certbot renew --dry-run
sudo grep -i hook /etc/letsencrypt/renewal/molytica.duckdns.org.conf
```

Expect the `certbot.timer` line, `all simulated renewals succeeded`, and `renew_hook = systemctl reload nginx`.

## 9. Verify HTTPS end to end

From the laptop (PowerShell):

```powershell
curl.exe -sI "http://molytica.duckdns.org/predict?x=1"     # 301 → https://molytica.duckdns.org/predict?x=1
curl.exe -sI "https://molytica.duckdns.org/"               # 307 → /visualize, Strict-Transport-Security: max-age=86400
curl.exe -s  "https://molytica.duckdns.org/api/health"     # {"status":"ok"}
curl.exe -si -X OPTIONS "https://molytica.duckdns.org/api/predict" -H "Origin: https://molytica.duckdns.org" -H "Access-Control-Request-Method: POST"   # 200 + access-control-allow-origin
curl.exe -si -X OPTIONS "https://molytica.duckdns.org/api/predict" -H "Origin: https://evil.example" -H "Access-Control-Request-Method: POST"           # 400
curl.exe -sI "http://13.124.161.67/"                       # 301 → https://molytica.duckdns.org/
```

- [ ] Supabase → Authentication → URL Configuration: **Site URL** `https://molytica.duckdns.org`; add redirect
      `https://molytica.duckdns.org/auth/callback` (keep Vercel/localhost entries until cutover is done).
- [ ] Local trainer (Anaconda Prompt): `set ALLOWED_ORIGINS=https://molytica.duckdns.org` then `molytica-train`.
      Allow Chrome's "access devices on your local network" prompt if shown.
- [ ] Browser checklist on `https://molytica.duckdns.org`: padlock; every tab; register/login and stay logged in after
      refresh; predict lung/prostate/melanoma; dataset upload **> 1 MB** (proves `client_max_body_size`); model upload +
      predict with it (proves the volume is writable); Train tab detects the local trainer; no Console errors.

> **Chrome "Dangerous" label.** Seen on first deploy despite a valid certificate. It is Safe Browsing reputation, not
> TLS: a brand-new `*.duckdns.org` host with a login form looks like phishing to Chrome's heuristics (Google's public
> list showed no flags). Options: report a false positive at `safebrowsing.google.com/safebrowsing/report_error/`,
> request review via Google Search Console, or — the lasting fix — move to a real domain (no image rebuild needed).

## 10. Cutover

- [ ] Decide the final domain **before** sharing the URL or retiring Vercel (see the note above).
- [ ] `NEXT_PUBLIC_API_URL`: nothing to switch — the prod bundle uses relative `/api`.
- [ ] Watch for 24–48 h: `dc ps`, `dc logs --tail 100 backend`, `sudo tail -50 /var/log/nginx/error.log`, `free -h`.
- [ ] **Suspend** (not delete) the Render service; pause the Vercel project or redirect it to the new site.
- [ ] Supabase: remove the old Vercel URLs from the redirect list (keep localhost for dev).
- [ ] Trainer: release an update adding `https://molytica.duckdns.org` to `DEFAULT_ORIGINS`, so users don't need
      `ALLOWED_ORIGINS`.
- [ ] After a stable week: raise HSTS `max-age` to `31536000` in `deploy/nginx/molytica.conf`, copy it to the box,
      `sudo cp` it into place, `sudo nginx -t && sudo systemctl reload nginx`.

## Changing the domain later

No image rebuild (relative `/api`). Point the new name's DNS at the Elastic IP; change `server_name` and the
certificate paths in both `deploy/nginx/*.conf`; run steps 5 → 8 for the new name; update `CORS_ORIGINS` in
`.env.prod` and `dc up -d`; add the new redirect URL in Supabase; update the trainer origin.

## Operations reference

| Task | How |
|---|---|
| Status / logs | `dc ps` · `dc logs -f backend` (Ctrl+C stops following, not the app) · `sudo tail -f /var/log/nginx/error.log` |
| Deploy a new version | laptop: step 1 with the new `<SHA>` → box: edit both tags in `.env.prod` → ECR login → `dc pull && dc up -d` → `docker image prune -f` |
| Roll back | set the previous `<SHA>` tags in `.env.prod` → `dc up -d` |
| Restart | `dc restart` (containers also return after reboot: `restart: unless-stopped`) |
| Stop | `dc down` — **never `dc down -v`** (deletes uploaded models in the `published-models` volume) |
| Change Nginx | edit the repo file → `scp` → `sed -i 's/\r$//'` → `sudo cp` → `sudo nginx -t && sudo systemctl reload nginx` |
| Long commands on a flaky connection | run inside `tmux`; after a drop, reconnect and `tmux attach` |
| Save money | stop the instance between demos (disk and Elastic IP still bill) |

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| `ssh` hangs → `Connection timed out` | Home IP changed (dynamic ISP IP); SG allows the old one | SG `smiles-viz-web` → SSH rule → Source **My IP** → save |
| `WARNING: UNPROTECTED PRIVATE KEY FILE!` | `.pem` readable by other users | the `icacls` lines in step 0 |
| `aws` not recognized right after install | terminal started before the PATH change | restart VS Code fully, or reload `$env:Path` from Machine + User |
| `error storing credentials … The stub received bad data` | Windows Credential Manager can't hold the ECR token | the `credHelpers` setup in step 1 |
| PowerShell: `Missing expression after unary operator '--'` | a bash command (with `\`) was typed on the laptop | run it on the box, as one line |
| `set` / `$env:` "syntax is incorrect" | wrong shell syntax | cmd: `set NAME=value`; PowerShell: `$env:NAME = "value"` |
| `nginx -t` → `/run/nginx.pid` Permission denied | ran without `sudo` | `sudo nginx -t` |
| Train tab: "not a secure context … loopback" | page loaded over HTTP | use the HTTPS site |
| Train tab: CORS "No 'Access-Control-Allow-Origin'" over HTTPS | trainer doesn't allow this origin | `ALLOWED_ORIGINS` (step 9) or a trainer release |
| Upload fails with `413` | body over Nginx limit | `client_max_body_size` in the `/api/` location |

## Gotchas (keep in mind)

- `NEXT_PUBLIC_*` is **baked at build**. Supabase URL/key changes → rebuild the frontend image.
- Only Nginx is public. App ports are `127.0.0.1`-bound; never change them to `"3000:3000"`.
- `.env.prod` lives **only on the box** (`chmod 600`). The repo has the keys-only `.env.prod.example`.
- Never build the RDKit image on the box — always pull a tagged image from ECR.
- Never deploy `:latest` — always an immutable `<SHA>` tag, so rollback is one edit.

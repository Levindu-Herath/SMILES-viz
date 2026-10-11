# Phase 2 runbook — AWS + GitHub setup for CI/CD

> **You run every step here, live**, in the AWS console, the GitHub settings and on the box. The repo side
> (workflows, `scripts/deploy.sh`, compose) is already done. **Do steps 1–7 before merging to `main`**:
> the first merge is the first automated deploy.

## What gets wired together

```
push to main ─► GitHub Actions ──OIDC──► IAM role deploy-push-and-run
                  │                         ├─ push images to ECR (smiles-viz-backend / -frontend)
                  │                         └─ ssm:SendCommand to the one instance
                  │                                     │
                  │                     EC2 smiles-viz (instance role smiles-viz-ec2)
                  │                         ├─ SSM agent runs scripts/deploy.sh <SHA> as ubuntu
                  │                         ├─ reads /smiles-viz/prod/* from Parameter Store → .env.prod
                  │                         └─ pulls <SHA> images from ECR, compose up --wait
                  └─ health check: https://molytica.duckdns.org/api/health and /
```

**Two roles, two jobs. Never merge them:**

| Role | Assumed by | May do | May NOT do |
|---|---|---|---|
| `deploy-push-and-run` (new) | GitHub Actions on `main`, via OIDC | push to the 2 ECR repos; send a command to the 1 instance | read secrets; touch any other instance or repo |
| `smiles-viz-ec2` (exists) | the EC2 instance | pull from ECR; read `/smiles-viz/prod/*`; talk to SSM | push images; send commands |

## This deployment

| Item | Value |
|---|---|
| Region | `ap-northeast-2` (set the console region selector to **Asia Pacific (Seoul)** before each step) |
| Account | `256130491262` |
| Repo | `Levindu-Herath/SMILES-viz`. Exact casing matters in the trust policy |
| Instance | `smiles-viz`, ID `i-08055ad64bd9f7db2` |
| Public URL | `https://molytica.duckdns.org` |

---

## 1. GitHub OIDC identity provider (once per AWS account)

IAM → **Identity providers** → **Add provider**:
- Provider type **OpenID Connect**
- Provider URL `https://token.actions.githubusercontent.com`
- Audience `sts.amazonaws.com`

Check: IAM → Identity providers → click `token.actions.githubusercontent.com`. The summary shows
**ARN** `arn:aws:iam::256130491262:oidc-provider/token.actions.githubusercontent.com` and
**Audiences** `sts.amazonaws.com`. (CLI: `aws iam get-open-id-connect-provider --open-id-connect-provider-arn <that ARN>`
→ `"ClientIDList": ["sts.amazonaws.com"]`.)

## 2. Deploy role for GitHub Actions

IAM → **Roles** → **Create role** → **Custom trust policy**, paste:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": {
        "Federated": "arn:aws:iam::256130491262:oidc-provider/token.actions.githubusercontent.com"
      },
      "Action": "sts:AssumeRoleWithWebIdentity",
      "Condition": {
        "StringEquals": {
          "token.actions.githubusercontent.com:aud": "sts.amazonaws.com",
          "token.actions.githubusercontent.com:sub": "repo:Levindu-Herath/SMILES-viz:ref:refs/heads/main"
        }
      }
    }
  ]
}
```

- `sub` must match **exactly**: only pushes to `main` and workflows run from `main` (Rollback) can assume it.
  PRs (`…:pull_request`) and other branches are denied. **Never** widen it with `StringLike` / `*`.
- Skip attaching managed policies → name **`deploy-push-and-run`** → create.

Then role → **Permissions** → **Add permissions → Create inline policy → JSON**. (Instance ID already filled in.)

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "EcrLogin",
      "Effect": "Allow",
      "Action": "ecr:GetAuthorizationToken",
      "Resource": "*"
    },
    {
      "Sid": "EcrPushAndCheck",
      "Effect": "Allow",
      "Action": [
        "ecr:BatchCheckLayerAvailability",
        "ecr:InitiateLayerUpload",
        "ecr:UploadLayerPart",
        "ecr:CompleteLayerUpload",
        "ecr:PutImage",
        "ecr:BatchGetImage",
        "ecr:GetDownloadUrlForLayer",
        "ecr:DescribeImages"
      ],
      "Resource": [
        "arn:aws:ecr:ap-northeast-2:256130491262:repository/smiles-viz-backend",
        "arn:aws:ecr:ap-northeast-2:256130491262:repository/smiles-viz-frontend"
      ]
    },
    {
      "Sid": "RunDeployOnTheBox",
      "Effect": "Allow",
      "Action": "ssm:SendCommand",
      "Resource": [
        "arn:aws:ec2:ap-northeast-2:256130491262:instance/i-08055ad64bd9f7db2",
        "arn:aws:ssm:ap-northeast-2::document/AWS-RunShellScript"
      ]
    },
    {
      "Sid": "ReadCommandResult",
      "Effect": "Allow",
      "Action": "ssm:GetCommandInvocation",
      "Resource": "*"
    }
  ]
}
```

Name it `deploy-push-and-runPolicy`. Copy the **role ARN** for step 6: `arn:aws:iam::256130491262:role/deploy-push-and-run`.

- `ecr:GetAuthorizationToken` has no resource-level scoping. `"*"` is the only valid value.
- `ssm:SendCommand` needs **both** ARNs: the instance (where) and the document (what). Without the document
  ARN the call is denied.
- `DescribeImages` is used by the "skip if this SHA is already in ECR" step and by Rollback's existence check.

## 3. Instance role: SSM agent access + read the app's parameters

IAM → Roles → **`smiles-viz-ec2`** → Add permissions:

- [ ] **Attach policies** → `AmazonSSMManagedInstanceCore` (lets the SSM agent register and receive commands).
- [ ] **Create inline policy → JSON**, name `read-prod-config`:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "ReadProdConfig",
      "Effect": "Allow",
      "Action": "ssm:GetParametersByPath",
      "Resource": [
        "arn:aws:ssm:ap-northeast-2:256130491262:parameter/smiles-viz/prod",
        "arn:aws:ssm:ap-northeast-2:256130491262:parameter/smiles-viz/prod/*"
      ]
    }
  ]
}
```

- A *by-path* read is checked against the path **exactly as passed**. `deploy.sh` passes `/smiles-viz/prod/` (trailing
  slash), which only `…/prod/*` matches (`*` can match nothing). `…/prod` covers callers without the slash.
- SecureStrings use the AWS-managed key `alias/aws/ssm`, whose key policy already lets account principals
  decrypt through SSM, so no `kms:Decrypt` is needed. (A customer-managed key would need it.)
- `AmazonSSMManagedInstanceCore` also grants `ssm:GetParameter(s)` on all parameters. Keep this account's
  Parameter Store limited to this app.
- The role keeps its existing `AmazonEC2ContainerRegistryReadOnly`.

**Box (SSH)**: the SSM agent ships with the Ubuntu 24.04 AMI as a snap. Restart it so it picks up the new role:

```bash
sudo snap restart amazon-ssm-agent
sudo snap services amazon-ssm-agent
```

Expect `enabled  active`. Within ~1 min: **Systems Manager → Fleet Manager** lists `i-08055ad64bd9f7db2` as **Online**.

**Test Run Command.** This runs in the **AWS console, not a terminal**: AWS sends the command to the box through the
SSM agent, which is the same path the workflow will use.

1. Systems Manager → **Run Command** → **Run command**.
2. Command document: search and select **`AWS-RunShellScript`**.
3. Command parameters → **Commands** text box: paste
   ```bash
   sudo -u ubuntu -H bash -c 'cd ~/smiles-viz && whoami && pwd && docker ps --format "{{.Names}} {{.Status}}"'
   ```
4. Target selection: **Choose instances manually** → tick `smiles-viz`.
5. Output options: **untick** "Enable an S3 bucket" → **Run**.
6. When the status is **Success**: click the instance ID → **Output**.

Expect `ubuntu`, `/home/ubuntu/smiles-viz`, and both containers `Up` (backend `(healthy)`). This proves
SSM → root → `sudo -u ubuntu` → docker works.

## 4. Runtime config in Parameter Store

Systems Manager → **Parameter Store** → **Create parameter**, tier **Standard** (free), one per row:

| Name | Type | Value |
|---|---|---|
| `/smiles-viz/prod/ECR_REGISTRY` | String | `256130491262.dkr.ecr.ap-northeast-2.amazonaws.com` |
| `/smiles-viz/prod/SUPABASE_URL` | String | `https://<project>.supabase.co` (from the box's current `.env.prod`) |
| `/smiles-viz/prod/CORS_ORIGINS` | String | `https://molytica.duckdns.org` |
| `/smiles-viz/prod/SUPABASE_SERVICE_ROLE_KEY` | **SecureString** (KMS key `alias/aws/ssm`) | the service-role key |

- The part after `/smiles-viz/prod/` **becomes the env var name** in `.env.prod`, so names are case-sensitive and exact.
- Paste values with **no quotes, no spaces, no trailing newline**.
- Use the console for the secret, not the CLI: a CLI command line ends up in shell history.
- `DEBUG` is not needed (compose defaults it to `false`). To add any runtime variable later, create a parameter
  here and redeploy. No code change needed.
- **From now on `.env.prod` on the box is generated.** Never hand-edit it: change the parameter, then redeploy.

**Box check**: names only, never print the values:

```bash
aws ssm get-parameters-by-path --path /smiles-viz/prod/ --with-decryption --region ap-northeast-2 --query 'Parameters[].Name'
```

Expect the 4 names. `AccessDeniedException` → step 3's inline policy (check the path ARN).

## 5. ECR lifecycle policy: expire old releases

For **each** repo (`smiles-viz-backend`, `smiles-viz-frontend`): ECR → repo → **Lifecycle policy** → **Create rule**:
- Priority `1`, description `keep last 30 releases`
- Image status **Tagged**, tag pattern `*` (wildcard)
- Match criteria **Image count more than** `30` → action expire

Then **Preview/test rules** first and check it would expire nothing today. Then save.

- **Rollback window = the last 30 releases.** Older SHAs can no longer be redeployed.
- **Never add a rule for untagged images.** The Phase 1 images were pushed by Docker Desktop as
  index + image + attestation, and the extra manifests show as *untagged* while still backing a tag. CI pushes
  with `provenance: false` (one plain manifest), so new releases add no untagged entries.
- Storage is billed per GB-month (~$0.10); layers shared between releases are stored once, so 30 releases
  cost far less than 30 × 600 MB.

## 6. GitHub repository variables

GitHub → repo **Settings → Secrets and variables → Actions → Variables** tab → **New repository variable**:

| Variable | Value | Used by |
|---|---|---|
| `AWS_ROLE_ARN` | ARN from step 2 | all AWS steps (OIDC) |
| `AWS_REGION` | `ap-northeast-2` | all AWS steps |
| `EC2_INSTANCE_ID` | `i-08055ad64bd9f7db2` | SSM send-command |
| `PUBLIC_URL` | `https://molytica.duckdns.org` (no trailing slash) | health check |
| `NEXT_PUBLIC_SUPABASE_URL` | same as `SUPABASE_URL` | frontend image build |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | the **anon** (public) key, from the laptop's root `.env` `SUPABASE_ANON_KEY` | frontend image build |

- **Variables, not Secrets, on purpose.** None of these grants access by itself (an ARN is an identifier; the anon
  key is in every visitor's browser). Variables stay readable in logs, which makes debugging possible.
- **The Secrets tab stays empty.** No AWS keys (OIDC), no service-role key (Parameter Store).
- ECR repo names are not variables: they are fixed in `docker-compose.prod.yml` and the workflows alike.

## 7. Box: one-time handover from the manual Phase 1 setup

Nothing to migrate by hand. The first SSM deploy downloads the new `docker-compose.prod.yml` and regenerates
`.env.prod`. Keep a copy of the hand-made file anyway:

```bash
cd ~/smiles-viz && cp -p .env.prod .env.prod.phase1.bak && ls -l .env.prod*
```

Expect both files `-rw-------`. Delete the backup once the first automated deploy is healthy.

## 8. Go live

- [ ] On the laptop: `git status` clean, branch `infra/docker-compose` pushed, latest CI run green.
- [ ] GitHub → **Pull requests → New** → `infra/docker-compose` → `main`. CI runs on the PR. Wait for green.
- [ ] **Merge.** Actions → **Deploy** starts: `ci` → `build-and-push (backend, frontend)` → `deploy / Deploy to EC2`
      → `deploy / Health check`.
- First run expectations: cold GHA cache on `main` (backend build ≈ 2.5 min), ≈ 90 s submodule checkout.
  The deploy job's log ends with the box's `==> Deployed <SHA>` and the health job with a `serving <sha7>` notice.

Checks after the first green deploy:

```bash
# box
cat ~/smiles-viz/deploy-history.log
grep IMAGE_TAG ~/smiles-viz/.env.prod
docker ps --format "{{.Image}}  {{.Status}}"
```

Expect one history line, `IMAGE_TAG=<full SHA>`, both images on that SHA and `(healthy)`. Then click through the
site (login, predict, upload) as in Phase 1 step 9.

## 9. Rehearse rollback (do this once, deliberately)

You need two pipeline releases. Merge any small change (e.g. a README line) and let it deploy.

**A. The health gate fails** (site stays up):
1. Set repo variable `PUBLIC_URL` to `https://molytica.duckdns.org/does-not-exist`.
2. Actions → **Rollback** → Run workflow (branch `main`) with the **current** SHA. That's a fresh run, so it reads
   the changed variable. The redeploy of the same release succeeds, and **Health check fails** with `404`s and the red
   `::error::` annotation.
3. Set `PUBLIC_URL` back to `https://molytica.duckdns.org`.

**B. Manual rollback:**
1. Copy the **previous** release's full SHA (Actions → Deploy → the older green run → commit, or the box's
   `deploy-history.log`).
2. Actions → **Rollback** → **Run workflow** → branch **`main`** → paste the SHA → Run.
3. Expect: `Check the release exists` ✓ → `rollback / Deploy to EC2` ✓ → `rollback / Health check` ✓.
   Box: `grep IMAGE_TAG ~/smiles-viz/.env.prod` shows the older SHA.
4. Roll **forward** again the same way with the newest SHA (or merge the next change).

## Troubleshooting

| Symptom (where) | Cause | Fix |
|---|---|---|
| `Credentials could not be loaded` (configure-aws-credentials) | `AWS_ROLE_ARN` variable missing/empty, or the job lacks `id-token: write` | step 6; for reusable workflows the **calling** job must grant it |
| `Not authorized to perform sts:AssumeRoleWithWebIdentity` | trust policy `sub`/`aud` mismatch (casing!), or run from a non-`main` branch | step 2 policy; run Rollback from `main` |
| `No OpenIDConnect provider found` | step 1 not done | step 1 |
| `AccessDenied … ecr:InitiateLayerUpload` (build-and-push) | deploy role's inline policy missing or wrong repo ARN | step 2 permissions |
| `AccessDeniedException … ssm:SendCommand` | wrong instance ID in policy, or document ARN missing | step 2: both ARNs |
| `InvalidInstanceId` (send-command) | instance not **Online** in Fleet Manager, or wrong `EC2_INSTANCE_ID` | step 3 (role + agent restart), step 6 |
| Box log: `AccessDeniedException … GetParametersByPath` | instance role inline policy missing, or lacks the `…/prod/*` resource (the error names the exact ARN checked) | step 3 |
| Box log: `required variable … is missing a value` | a parameter missing or misnamed (`dc_next config` caught it) | step 4 names, exactly |
| Box log: `curl: (22) … 404` fetching `deploy.sh` | SHA not on GitHub, or repo made private | push first; private repo needs a different script delivery |
| Box log: `container … is unhealthy` / `--wait` timeout | the new release doesn't start | `dc logs --tail 100 backend` on the box; Rollback to the last good SHA |
| Health check: `000` | DNS, security group 443 or TLS failure | `curl -v https://molytica.duckdns.org/api/health` from the laptop |
| Health check: `502` on `/` or `/api/health` | Nginx up but a container is down | `dc ps` on the box |
| Rollback: `… is not in ECR` | SHA typo, short SHA, a pre-Phase-2 tag, or expired by the lifecycle rule | use a full SHA from a green Deploy run |
| Re-run fails with `ImageTagAlreadyExistsException` | the "skip if exists" step was removed or failed silently | restore the step; immutable tags can't be re-pushed |

## After go-live

- [ ] Update the Phase 1 runbook's *Operations reference*: "Deploy a new version" = merge to `main`;
      "Roll back" = Actions → Rollback; `.env.prod` changes = Parameter Store + redeploy.
- [ ] Once a few deploys are green, consider closing SSH (22) entirely and using Session Manager for shell access.
- [ ] Follow-ups: shrink the 2.3 GB submodule checkout; return the git SHA from `/api/health` so the health gate
      can prove *which* version is serving; fix the 4 `react-hooks/set-state-in-effect` warnings and remove the
      ESLint override.

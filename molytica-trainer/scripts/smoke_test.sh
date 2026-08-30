#!/usr/bin/env bash
# Smoke test for the molytica-trainer CPU Docker image.
#
# Builds the image, brings it up via compose, drives a real training run
# through the HTTP API (upload -> validate -> train -> poll), and asserts an
# artifact bundle is written to ./artifacts. Requires: docker, docker compose,
# curl, python3 (stdlib json only).
#
# Windows/PowerShell equivalent (run from molytica-trainer/):
#   docker compose build
#   docker compose up -d
#   # poll until ready:
#   1..60 | ForEach-Object { try { if ((Invoke-WebRequest http://127.0.0.1:5000/health -UseBasicParsing).StatusCode -eq 200) { break } } catch {}; Start-Sleep 2 }
#   $resp = Invoke-RestMethod -Uri http://127.0.0.1:5000/upload -Method Post -Form @{ file = Get-Item "tests\test_data\test_50.csv" }
#   $val  = Invoke-RestMethod -Uri http://127.0.0.1:5000/validate-dataset -Method Post -Body (@{ file_path = $resp.file_path } | ConvertTo-Json) -ContentType "application/json"
#   $job  = Invoke-RestMethod -Uri http://127.0.0.1:5000/train -Method Post -Body (@{ file_path = $resp.file_path; classifier = "logistic_regression" } | ConvertTo-Json) -ContentType "application/json"
#   # poll: Invoke-RestMethod http://127.0.0.1:5000/train/$($job.job_id)/status
#   Get-ChildItem .\artifacts
#   docker compose down

set -euo pipefail
cd "$(dirname "$0")/.."

BASE_URL="http://127.0.0.1:5000"
FIXTURE="tests/test_data/test_50.csv"
TIMEOUT_SECS=120

cleanup() {
  echo "Tearing down..."
  docker compose down
}
trap cleanup EXIT

echo "1) Building image..."
docker compose build

echo "2) Starting container..."
docker compose up -d

echo "3) Waiting for /health..."
elapsed=0
until curl -sf "${BASE_URL}/health" >/dev/null 2>&1; do
  sleep 2
  elapsed=$((elapsed + 2))
  if [ "$elapsed" -ge "$TIMEOUT_SECS" ]; then
    echo "Timed out waiting for the server to become healthy." >&2
    docker compose logs
    exit 1
  fi
done
echo "Server is healthy."

echo "4) Uploading fixture dataset..."
upload_resp=$(curl -sf -X POST "${BASE_URL}/upload" -F "file=@${FIXTURE}")
file_path=$(python3 -c "import json,sys; print(json.loads(sys.argv[1])['file_path'])" "$upload_resp")
echo "Uploaded to: ${file_path}"

echo "5) Validating dataset..."
validate_resp=$(curl -sf -X POST "${BASE_URL}/validate-dataset" \
  -H "Content-Type: application/json" \
  -d "{\"file_path\": \"${file_path}\"}")
is_valid=$(python3 -c "import json,sys; print(json.loads(sys.argv[1])['is_valid'])" "$validate_resp")
if [ "$is_valid" != "True" ]; then
  echo "Dataset failed validation: ${validate_resp}" >&2
  exit 1
fi
echo "Dataset is valid."

echo "6) Starting training job..."
train_resp=$(curl -sf -X POST "${BASE_URL}/train" \
  -H "Content-Type: application/json" \
  -d "{\"file_path\": \"${file_path}\", \"classifier\": \"logistic_regression\"}")
job_id=$(python3 -c "import json,sys; print(json.loads(sys.argv[1])['job_id'])" "$train_resp")
echo "Job started: ${job_id}"

echo "7) Polling job status..."
elapsed=0
status="VALIDATING"
while [ "$status" != "COMPLETED" ] && [ "$status" != "FAILED" ]; do
  sleep 3
  elapsed=$((elapsed + 3))
  status_resp=$(curl -sf "${BASE_URL}/train/${job_id}/status")
  status=$(python3 -c "import json,sys; print(json.loads(sys.argv[1])['status'])" "$status_resp")
  echo "  status=${status} (${elapsed}s elapsed)"
  if [ "$elapsed" -ge "$TIMEOUT_SECS" ]; then
    echo "Timed out waiting for training to finish." >&2
    exit 1
  fi
done

if [ "$status" != "COMPLETED" ]; then
  echo "Training job ended in status ${status}: ${status_resp}" >&2
  exit 1
fi
echo "Training completed."

echo "8) Checking for an artifact bundle under ./artifacts..."
bundle_count=$(find ./artifacts -mindepth 1 -maxdepth 1 -type d | wc -l)
if [ "$bundle_count" -lt 1 ]; then
  echo "No artifact bundle found under ./artifacts" >&2
  exit 1
fi
echo "Found ${bundle_count} artifact bundle(s):"
find ./artifacts -mindepth 1 -maxdepth 1 -type d

echo "Smoke test PASSED."

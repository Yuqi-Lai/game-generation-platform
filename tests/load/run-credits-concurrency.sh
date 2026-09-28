#!/usr/bin/env bash
set -euo pipefail

readonly PROJECT_NAME="forge-credit-load"
readonly COMPOSE=(docker compose -p "$PROJECT_NAME" -f infra/local/compose.yaml -f tests/load/compose.credits.yaml)
readonly LOAD_SECRET="credits-load-test-secret-only-32-characters"
readonly ISSUER="https://credits-load-test.invalid/"
readonly AUDIENCE="https://api.game-generation.local"
readonly EMAIL="loadtest@example.test"
readonly REQUEST_COUNT="${REQUEST_COUNT:-25}"
readonly EXPECTED_ACCEPTED="10"
export LOAD_SECRET ISSUER AUDIENCE EMAIL

cleanup() {
  if [[ "${KEEP_STACK:-0}" != "1" ]]; then
    "${COMPOSE[@]}" down --volumes --remove-orphans >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT

"${COMPOSE[@]}" up -d --build postgres redpanda api

for _ in $(seq 1 60); do
  if curl --silent --fail http://localhost:8080/actuator/health/readiness >/dev/null; then
    break
  fi
  sleep 1
done
curl --silent --fail http://localhost:8080/actuator/health/readiness >/dev/null

ACCESS_TOKEN=$(python3 -c '
import base64, hashlib, hmac, json, os, time
encode = lambda value: base64.urlsafe_b64encode(json.dumps(value, separators=(",", ":")).encode()).rstrip(b"=").decode()
header = encode({"alg": "HS256", "typ": "JWT"})
now = int(time.time())
payload = encode({"iss": os.environ["ISSUER"], "sub": "load-test|owner", "aud": [os.environ["AUDIENCE"]], "iat": now, "exp": now + 3600, "email": os.environ["EMAIL"], "email_verified": True, "name": "Credit Load Owner"})
unsigned = f"{header}.{payload}"
signature = base64.urlsafe_b64encode(hmac.new(os.environ["LOAD_SECRET"].encode(), unsigned.encode(), hashlib.sha256).digest()).rstrip(b"=").decode()
print(f"{unsigned}.{signature}")
')

PROJECT_JSON=$(curl --silent --fail-with-body \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name":"Synthetic Credit Load Test","description":"Disposable local k6 fixture"}' \
  http://localhost:8080/api/v1/projects)
PROJECT_ID=$(printf '%s' "$PROJECT_JSON" | python3 -c 'import json, sys; print(json.load(sys.stdin)["id"])')

docker run --rm --network "${PROJECT_NAME}_default" \
  -e BASE_URL=http://api:8080 \
  -e PROJECT_ID="$PROJECT_ID" \
  -e ACCESS_TOKEN="$ACCESS_TOKEN" \
  -e REQUEST_COUNT="$REQUEST_COUNT" \
  -e EXPECTED_ACCEPTED="$EXPECTED_ACCEPTED" \
  -v "$PWD/tests/load:/scripts:ro" \
  grafana/k6:0.57.0 run /scripts/credits-concurrency.js

BALANCE_JSON=$(curl --silent --fail-with-body \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  "http://localhost:8080/api/v1/projects/$PROJECT_ID/credits")
LEDGER_JSON=$(curl --silent --fail-with-body \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  "http://localhost:8080/api/v1/projects/$PROJECT_ID/credits/ledger")

DB_STATE=$("${COMPOSE[@]}" exec -T postgres psql -U game_generation -d game_generation -At -F '|' -c "
SELECT account.total_granted,
       account.reserved,
       account.consumed,
       account.total_granted - account.reserved - account.consumed AS available,
       (SELECT count(*) FROM generation_job job WHERE job.project_id = account.project_id),
       (SELECT count(*) FROM credit_ledger ledger WHERE ledger.project_id = account.project_id AND ledger.movement_type = 'RESERVE'),
       (SELECT count(DISTINCT ledger.generation_job_id) FROM credit_ledger ledger WHERE ledger.project_id = account.project_id AND ledger.movement_type = 'RESERVE'),
       (SELECT count(*) FROM (
          SELECT generation_job_id FROM credit_ledger
          WHERE project_id = account.project_id AND movement_type = 'RESERVE'
          GROUP BY generation_job_id HAVING count(*) > 1
       ) duplicates)
FROM project_credit_account account
WHERE account.project_id = '$PROJECT_ID';")

BALANCE_JSON="$BALANCE_JSON" LEDGER_JSON="$LEDGER_JSON" DB_STATE="$DB_STATE" python3 -c '
import json, os
balance = json.loads(os.environ["BALANCE_JSON"])
ledger = json.loads(os.environ["LEDGER_JSON"])["entries"]
db = tuple(map(int, os.environ["DB_STATE"].split("|")))
expected_db = (100, 100, 0, 0, 10, 10, 10, 0)
assert db == expected_db, f"unexpected database state: {db}"
assert min(balance["totalGranted"], balance["reserved"], balance["consumed"], balance["available"]) >= 0
assert balance["reserved"] + balance["consumed"] + balance["available"] == balance["totalGranted"]
reserves = [entry for entry in ledger if entry["type"] == "RESERVE"]
assert len(reserves) == 10 and len({entry["generationJobId"] for entry in reserves}) == 10
print("Final API balance:", json.dumps(balance, sort_keys=True))
print("Final PostgreSQL state: granted=100 reserved=100 consumed=0 available=0 jobs=10 reserves=10 distinct_reserved_jobs=10 duplicate_reservations=0")
'

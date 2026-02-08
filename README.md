# EntryServer

> [!IMPORTANT]
> **Project Context & Disclaimer**
> 
> I am not a professional programmer. This project was born out of two goals:
> 1. **Personal Utility:** I wanted a dedicated Android companion for Actual.
> 2. **Learning CI/CD:** I wanted to gain hands-on experience setting up CI/CD pipelines for a web app environment.
>
> Because of this, the codebase was **primarily generated using AI tools**. While the app is functional, the internal logic may not follow standard programming patterns.

EntryServer is a self-hosted Fastify API that bridges to Actual Budget for read/write transaction entry automation.

## Features (MVP)

- `GET /health`
- `GET /budgets`
- `GET /budgets/:budgetId/entries`
- `POST /budgets/:budgetId/entries`
- API key auth on all endpoints except `/health`
- Unified entry model for `income` and `expense`
- Positive API amount contract with internal sign mapping to Actual
- Per-budget write lock and lock timeout handling

## Requirements

- Node.js 20+
- Actual server reachable from EntryServer
- Actual service account password
- For containerized deploys: Docker
- For Kubernetes deploys: Helm 3 + kubectl

Actual config expected for mixed OIDC + service password automation:

- `ACTUAL_ALLOWED_LOGIN_METHODS=openid,password`
- `ACTUAL_OPENID_ENFORCE=false`

## Configuration

Copy and edit env:

```bash
cp .env.example .env
```

Required runtime variables:

- `BRIDGE_API_KEY`
- `ACTUAL_SERVER_URL`
- `ACTUAL_PASSWORD`

Optional:

- `ACTUAL_FILE_PASSWORD`
- `ENTRYSERVER_BUDGET_DISCOVERY_MODE=auto|configured`
- `ENTRYSERVER_BUDGETS_JSON`
- `LOG_LEVEL`, timeout/body/lock tuning vars

## Run Directly (Node)

1. Install deps:

```bash
npm install
```

2. Build:

```bash
npm run build
```

3. Run:

```bash
set -a
source .env
set +a
npm start
```

4. Verify:

```bash
curl -s http://localhost:3000/health
```

## Build Container Image

Build local image:

```bash
docker build -t entryserver:1 .
```

Tag for registry:

```bash
docker tag entryserver:1 ghcr.io/<your-org>/entryserver:1
```

Push:

```bash
docker push ghcr.io/<your-org>/entryserver:1
```

Optional shortcuts via `Makefile`:

```bash
make build-image IMAGE=entryserver TAG=1
make run-image IMAGE=entryserver TAG=1
```

## Run with Docker

### Option A: plain `docker run`

```bash
docker run -d \
  --name entryserver \
  --restart unless-stopped \
  --env-file .env \
  -p 3000:3000 \
  entryserver:1
```

Logs:

```bash
docker logs -f entryserver
```

### Option B: docker compose

```bash
docker compose up --build -d
```

Stop:

```bash
docker compose down
```

## Run with Helm (Kubernetes)

A Helm chart is included at `charts/entryserver`.

### 1. Build and publish image

Use the build/push commands above and note the final image repo/tag.

### 2. Create a values override

Create `values-prod.yaml`:

```yaml
image:
  repository: ghcr.io/<your-org>/entryserver
  tag: "1"

secretEnv:
  BRIDGE_API_KEY: "replace-with-long-random-key"
  ACTUAL_SERVER_URL: "https://actual.example.com"
  ACTUAL_PASSWORD: "replace-with-actual-service-password"
  ACTUAL_FILE_PASSWORD: ""

env:
  LOG_LEVEL: info
  ENTRYSERVER_BUDGET_DISCOVERY_MODE: auto
  ENTRYSERVER_BUDGETS_JSON: ""

ingress:
  enabled: true
  className: nginx
  hosts:
    - host: entryserver.example.com
      paths:
        - path: /
          pathType: Prefix
  tls:
    - hosts:
        - entryserver.example.com
      secretName: entryserver-tls
```

### 3. Install/upgrade

```bash
kubectl create namespace entryserver --dry-run=client -o yaml | kubectl apply -f -
helm upgrade --install entryserver ./charts/entryserver \
  --namespace entryserver \
  -f values-prod.yaml
```

### 4. Verify rollout

```bash
kubectl -n entryserver get pods
kubectl -n entryserver rollout status deploy/entryserver
kubectl -n entryserver get svc,ingress
```

If you did not enable ingress, test with port-forward:

```bash
kubectl -n entryserver port-forward svc/entryserver 3000:3000
curl -s http://127.0.0.1:3000/health
```

## Authentication

Use bridge API key:

```http
Authorization: Bearer <BRIDGE_API_KEY>
```

## API

### `GET /health`

Returns process health and Actual connectivity mode.

### `GET /budgets`

Response:

```json
[
  {
    "id": "budget_abc",
    "name": "Main Budget"
  }
]
```

### `GET /budgets/:budgetId/entries`

Query params:

- `from` (required) `YYYY-MM-DD`
- `to` (required) `YYYY-MM-DD`
- `flow` (optional) `all|income|expense`, default `all`
- `limit` (optional), default `100`
- `offset` (optional), default `0`

Response:

```json
{
  "items": [],
  "limit": 100,
  "offset": 0,
  "total": 0
}
```

### `POST /budgets/:budgetId/entries`

Request:

```json
{
  "amount": 12.34,
  "flow": "expense",
  "date": "2026-02-08",
  "payee": "Coffee Shop",
  "category": "Dining",
  "account": "Checking",
  "notes": "Team meeting"
}
```

Response:

```json
{
  "id": "txn_123",
  "budgetId": "budget_abc",
  "amount": 12.34,
  "flow": "expense",
  "date": "2026-02-08",
  "payee": "Coffee Shop",
  "category": "Dining",
  "account": "Checking",
  "notes": "Team meeting"
}
```

## Domain Rules

- API accepts positive decimal amounts only.
- `flow=expense` writes negative amount to Actual.
- `flow=income` writes positive amount to Actual.
- API responses always return positive amount + flow.
- `account` and `category` must match exact names.
- `payee` resolves by exact name; created if missing.
- Sync runs before reads and before/after writes.

## Error Model

- `400` invalid params/body
- `401` missing/invalid API key
- `404` unknown budget/account/category
- `409` lock timeout/conflict
- `502` upstream Actual failures
- `500` unexpected failures

All errors use envelope:

```json
{
  "error": {
    "code": "validation_error",
    "message": "Invalid request",
    "requestId": "req-123"
  }
}
```

## Curl Examples

```bash
curl -s http://localhost:3000/health
```

```bash
curl -s \
  -H "Authorization: Bearer $BRIDGE_API_KEY" \
  http://localhost:3000/budgets
```

```bash
curl -s \
  -H "Authorization: Bearer $BRIDGE_API_KEY" \
  "http://localhost:3000/budgets/budget_abc/entries?from=2026-02-01&to=2026-02-28&flow=all&limit=100&offset=0"
```

```bash
curl -s -X POST \
  -H "Authorization: Bearer $BRIDGE_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "amount": 12.34,
    "flow": "expense",
    "date": "2026-02-08",
    "payee": "Coffee Shop",
    "category": "Dining",
    "account": "Checking",
    "notes": "Team meeting"
  }' \
  http://localhost:3000/budgets/budget_abc/entries
```

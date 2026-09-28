# poc_expats_api

Backend for the **Expats AI Assistant** proof of concept — an English-language assistant
for foreigners living in Mexico that answers **only from documents an admin has uploaded**,
never from the model's own memory.

NestJS · TypeORM · PostgreSQL + pgvector · Redis/BullMQ · S3-compatible storage · Gemini.

> This is a proof of concept, not the product. It uses its own JWT auth, a shared admin
> key instead of roles, and Gemini in place of Claude. The real build replaces all three.

---

## What it does

1. A question is classified (intent, category, search query) by a small model
2. The question is embedded and matched against document chunks with pgvector
3. The retrieved passages — and nothing else — are given to the answering model
4. Every fact in the response carries the id of the chunk it came from
5. Code verifies that each cited chunk exists and that quoted numbers literally appear in it
6. Anything unverifiable comes back `null`, and the interface says "not available"

**Facts come from the documents. Only the words come from the model.**

---

## Running it locally

Needs Postgres with pgvector, Redis and an S3-compatible store. `docker-compose.yml` in
this repository brings up all three, plus pgAdmin and a MinIO bucket initialiser.

```bash
cp .env.example .env     # fill in GEMINI_API_KEY; the rest have working defaults
docker compose up -d     # Postgres + pgvector, Redis, MinIO, pgAdmin
npm ci
npm run migration:run
npm run start:dev
```

One `.env` drives both: the application settings at the top, and the local container
settings — ports, MinIO buckets, Postgres credentials — at the bottom. A deployed
instance uses hosted services and ignores the second half entirely.

`sample-docs/` has small text files to upload while testing.

`GET /api/health` reports on Postgres, pgvector and Redis together.

---

## Deploying

| Setting | Value |
|---|---|
| Root directory | repo root |
| Build command | `npm ci && npm run build` |
| Start command | `node dist/main.js` |

Set every variable in [.env.example](.env.example). Four of them are what make a public
instance safe, and **the API refuses to start without them when `DEPLOYED=true`**:

| Variable | Why |
|---|---|
| `ADMIN_API_KEY` | `/api/admin` and `/api/documents` can delete the document library |
| `JWT_SECRET` | Must not be the development default, or tokens can be forged |
| `CORS_ORIGINS` | Otherwise any website can call this API as your signed-in user |
| `REGISTRATION_ENABLED=false` | Otherwise anyone can sign up and spend your model quota |

Failing at boot is deliberate. A misconfigured deployment that starts anyway looks
healthy while serving an open delete endpoint.

---

## Two configuration values that will bite

1. **`EMBEDDING_MODEL` must be identical for stored chunks and for questions.** Different
   models put vectors on different scales, so nothing matches — and *no error is raised*.
   Every question is simply refused. A startup guard compares the configured model against
   what is already stored and logs a warning if they disagree.

2. **`RETRIEVAL_MIN_SIMILARITY` belongs to the embedding model, not to taste.**
   `gemini-embedding-001` needs ≈0.65; `Xenova/multilingual-e5-small` needs ≈0.82. Change
   the model and this must move with it.

---

## Frontend

[poc_expats_ui](https://github.com/kuldeepiw/poc_expats_ui)

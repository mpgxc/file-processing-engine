# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Dev
npm run start:local          # API with .env.local (tsx watch, LOCAL=true)
npm run start:workers:local  # SQS pollers simulating Lambda workers
npm run local:dev            # API + workers concurrently

# MiniStack lifecycle
npm run local:up             # bootstrap Docker + DynamoDB/SQS/S3/SES + seed + sync templates
npm run local:down           # docker compose down
npm run local:reset          # down -v + up (full wipe)

# Build
npm run build                # NestJS tsc build (API)
npm run build:lambdas        # esbuild bundles for all 4 Lambda workers

# Test
npm test                     # vitest run (all specs)
npm run test:watch           # vitest watch
npm run test:cov             # with v8 coverage (70% threshold on branches/functions/lines/statements)

# Quality
npm run lint                 # eslint --fix
npm run typecheck            # tsc --noEmit
npm run format               # prettier --write
```

Single test file: `npx vitest run src/engines/csv/csv.engine.spec.ts`

## Architecture

**Two runtimes, one codebase:**

1. **NestJS REST API** — runs on ECS Fargate (`src/main.ts`), uses the **Fastify** adapter (not Express). Accepts `POST /reports/generate` and `GET /reports/:jobId/status`. Validates JWT via `JwtMiddleware`, deduplicates via SHA-256 hash, looks up templates in DynamoDB, publishes to the correct SQS queue, returns 202 (new) or 200 (cache hit).

2. **Lambda SQS Workers** — 4 separate bundles (`src/workers/handlers/{pdf,csv,xlsx,txt}.worker.ts`), each a NestJS standalone app. `BaseWorker` (`src/workers/core/base.worker.ts`) drives the common flow: fetch job + template from DynamoDB → read template from EFS mount → run engine → write output file → upload to S3 → send SES email with presigned URL → update job status to DONE/FAILED.

**Engine Strategy Pattern** (`src/engines/`):

Each format implements `IReportEngine` from `engine.interface.ts`. All engines register themselves in `EnginesModule` via `EngineRegistrar.onModuleInit()`. `EngineRegistry.resolve(format)` dispatches at runtime. Path helpers (`resolveTemplatePath`, `resolveOutputPath`) live in `engine.interface.ts`.

**Data layer:**

- `report_jobs` DynamoDB table — PK: `jobId`, GSI: `dedupHash-index` (for dedup lookup), TTL: `expiresAt`
- `report_templates` DynamoDB table — PK: `templateId`, SK: `version`, GSI: `tenantId-format-index`
- AWS clients in `src/commons/clients/` — thin wrappers around `@aws-sdk/*`, all pointing to `LOCALSTACK_ENDPOINT` when `LOCAL=true`

**Config** (`src/core/config/config.service.ts`): Single Zod-validated config service. `LOCAL=true` env var enables LocalStack endpoint injection and local filesystem mounts instead of EFS.

**Observability**: AWS Lambda Powertools (`src/core/observability/powertools.ts`) for structured logging, metrics, and tracing in Lambda. `metrics.addMetric(...)` used in `ReportsService`.

## Adding a New Report Format

1. Add to `ReportFormat` enum in `src/commons/types/job.types.ts`
2. Create `src/engines/{format}/{format}.engine.ts` implementing `IReportEngine`
3. Register in `src/engines/engines.module.ts`
4. Add `SQS_{FORMAT}_QUEUE_URL` to `ConfigService` schema in `src/core/config/config.service.ts`
5. Create `src/workers/handlers/{format}.worker.ts`
6. Add `build:lambda:{format}` script to `package.json`
7. Add the SQS queue + DLQ in `infra/lib/core-stack.ts` (queues live here, not in `workers-stack.ts`)
8. Add the worker entry to `WORKER_CONFIGS` in `infra/lib/workers-stack.ts`
9. Drop a sample template under `fixtures/templates/{format}/`

## Local Development Notes

- Env: copy `.env.local.example` → `.env.local` before first run
- Templates served from `./fixtures/templates/` locally (mirrors `/mnt/templates` in prod)
- Outputs written to `./fixtures/outputs/` locally (mirrors `/mnt/outputs` in prod)
- MiniStack = LocalStack in `docker-compose.yml`; bootstrapped by `scripts/bootstrap-local.ts`
- Workers run as SQS pollers locally (`scripts/start-local-workers.ts`), not as Lambda handlers

## Path Aliases

Vitest and tsc both resolve `@/` → `src/`, with sub-aliases `@/core`, `@/commons`, `@/features`, `@/engines`, `@/workers`.

## Code Conventions

- `tsconfig.json` uses `module: NodeNext` + `moduleResolution: nodenext`, but the package is CommonJS (no `"type": "module"` in `package.json`), so relative imports are **extensionless** — do not append `.js`. Aliased `@/…` imports likewise have no extension.
- File naming: `kebab-case` with semantic suffix (`*.module.ts`, `*.service.ts`, `*.controller.ts`, `*.repository.ts`, `*.worker.ts`, `*.types.ts`, `*.errors.ts`).
- No `any` — errors are typed via `src/commons/errors/`.

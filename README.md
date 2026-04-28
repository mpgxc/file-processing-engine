# Report Service

Microserviço de geração de relatórios — NestJS REST API (ECS Fargate) + 4 workers Lambda SQS + DynamoDB + S3 Files + SES.

## Visão Geral

```
Internal Service → ALB interno → ECS Fargate (NestJS REST API)
                                    ↓ dedup hash (SHA-256)
                                    ↓ publica na fila correta
           ┌───────────────────────────────────┐
    SQS PDF Queue   SQS CSV   SQS XLSX   SQS TXT
           ↓            ↓         ↓          ↓
    pdf-worker    csv-worker xlsx-worker txt-worker     (Lambda + EFS mount)
           ↓ (NestJS Standalone App)
    /mnt/templates (S3 Files NFS read-only)
    /mnt/outputs   (S3 Files NFS read-write)
           ↓
    SES → Email com link de download (presigned URL 24h)
```

- **API REST**: NestJS rodando em **ECS Fargate** (Docker), atrás de **ALB interno**, com auto-scaling 2-10 tasks
- **Workers**: 4 **Lambdas SQS** (PDF/CSV/XLSX/TXT) com EFS mount para S3 Files

## Pré-requisitos

- Node.js 20+, npm 10+
- AWS CLI v2 configurado
- AWS CDK v2: `npm install -g aws-cdk`
- Docker (para desenvolvimento local com LocalStack)

## Desenvolvimento Local

```bash
# 1. Instalar dependências
npm install

# 2. Subir LocalStack
docker-compose up -d

# 3. Seeder de templates
npm run seed:local

# 4. Subir servidor NestJS local
LOCAL=true JWT_SECRET=dev-secret npm run start:dev
```

## Estrutura do Projeto

```
src/
  config/           ← ConfigService (Zod-validated env vars)
  engines/          ← Strategy pattern: IReportEngine + PDF/CSV/XLSX/TXT
  mail/             ← MailService com Handlebars + SES
  reports/          ← Controller + Service (REST API ECS)
  health/           ← /health endpoint para ALB target group
  auth/             ← JwtMiddleware (jose)
  workers/          ← BaseWorker + factory para os 4 workers SQS
  shared/
    types/          ← Interfaces TypeScript (ReportJob, ReportTemplate, etc.)
    errors/         ← Hierarquia de AppError
    utils/          ← hash.ts (SHA-256), ulid.ts
    clients/        ← DynamoDB, SQS, S3, SES singletons
    repositories/   ← IJobRepository, ITemplateRepository
  observability/    ← Lambda Powertools singletons (Logger, Tracer, Metrics)
  main.ts           ← Entry point do servidor NestJS (ECS Fargate)
  workers/
    pdf-worker.ts   ← Entry point Lambda SQS PDF (1536MB / 5min)
    csv-worker.ts   ← Entry point Lambda SQS CSV (512MB / 3min)
    xlsx-worker.ts  ← Entry point Lambda SQS XLSX (1024MB / 3min)
    txt-worker.ts   ← Entry point Lambda SQS TXT (256MB / 30s)
infra/              ← CDK stacks (Core, Storage, Handler/ECS, Workers, Observability)
Dockerfile          ← Multi-stage build da API NestJS (Alpine + non-root)
fixtures/           ← Templates de exemplo para desenvolvimento local
scripts/            ← seed-local.ts, localstack-init.sh
```

### Adicionar novo formato de relatório

1. Adicionar `NOVO_FORMATO` em `src/shared/types/job.types.ts` (enum ReportFormat)
2. Criar `src/engines/novo.engine.ts` implementando `IReportEngine`
3. Registrar no `src/engines/engines.module.ts`
4. Adicionar `SQS_NOVO_QUEUE_URL` no schema do `ConfigService`
5. Criar `src/workers/novo-worker.ts` e adicionar build script no `package.json`
6. Adicionar fila + worker no CDK `WorkersStack`

## API

### `POST /reports/generate`

```json
{
  "format": "PDF",
  "templateId": "financial-report",
  "params": { "reportTitle": "Relatório Abril", "rows": [] },
  "recipientEmail": "user@example.com",
  "recipientName": "João Silva",
  "locale": "pt-BR"
}
```

**Responses:**
- `202` — Job enfileirado: `{ jobId, status: "PENDING", message }`
- `200` — Cache hit: `{ jobId, status: "DONE", downloadUrl, expiresAt }`
- `400` — Validação falhou
- `401` — JWT inválido ou ausente
- `404` — Template não encontrado

### `GET /reports/:jobId/status`

```json
{ "jobId": "...", "status": "DONE", "downloadUrl": "https://...", "format": "PDF", "createdAt": "..." }
```

## Deduplicação

```
SHA-256(tenantId | userId | format | templateId | SHA-256(canonical(params)))
```

- `DONE` → retorna presigned URL (200), sem re-processar
- `PENDING/PROCESSING` → retorna jobId existente (202)
- Novo → cria job e enfileira (202)

## Templates

| Formato | Path no mount |
|---------|--------------|
| PDF | `/mnt/templates/pdf/{templateId}/{version}.hbs` |
| CSV | `/mnt/templates/csv/{templateId}/{version}.json` |
| XLSX | `/mnt/templates/xlsx/{templateId}/{version}.xlsx` |
| TXT | `/mnt/templates/txt/{templateId}/{version}.hbs` |
| Email | `/mnt/templates/mail/{mailTemplateId}/{locale}.hbs` |

```bash
# Upload de templates sem redeploy
aws s3 sync fixtures/templates/ s3://report-service-templates-{account}/
```

## Deploy

**API (ECS Fargate):**
```bash
# 1. Build & push Docker image para ECR
docker build -t report-service-api .
aws ecr get-login-password | docker login --username AWS --password-stdin <account>.dkr.ecr.<region>.amazonaws.com
docker tag report-service-api:latest <account>.dkr.ecr.<region>.amazonaws.com/report-service-api:latest
docker push <account>.dkr.ecr.<region>.amazonaws.com/report-service-api:latest

# 2. Force new deployment do ECS service (pega a imagem :latest)
aws ecs update-service --cluster report-service --service report-service-api --force-new-deployment
```

**Workers (Lambda):**
```bash
npm run build:lambdas
cd infra && npm install && cdk deploy ReportServiceWorkers
```

**Infra completa (primeira vez):**
```bash
# É preciso ter pelo menos uma imagem em ECR antes do primeiro deploy do HandlerStack
cd infra && cdk deploy ReportServiceCore ReportServiceStorage
# ... build & push da imagem (ver passos acima) ...
cdk deploy --all
```

## Variáveis de Ambiente

Veja `.env.example` para a lista completa.

## Testes

```bash
npm test          # vitest run
npm run test:cov  # com coverage
```

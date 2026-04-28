# Report Service — Prompt Guide de Construção (Serverless)

> Use este documento como guia de prompts sequenciais para construir o microserviço
> de geração de relatórios serverless. Cada seção é um prompt independente para usar
> no Cursor, Copilot, Claude Code ou equivalente.
> 
> Stack: **Node.js 20 · TypeScript · AWS Lambda · SQS · DynamoDB · S3 Files · SES · CDK**

---

## CONTEXTO GLOBAL
> Cole este bloco no início de cada sessão de trabalho como contexto base.

```
Você é um engenheiro backend sênior especializado em Node.js/TypeScript e AWS serverless.
Estamos construindo um microserviço de geração de relatórios com a seguinte arquitetura:

STACK:
- Runtime: Node.js 20, TypeScript strict mode
- Framework: sem framework (handlers Lambda puros + injeção manual de dependências)
- Queue: AWS SQS (uma fila por formato: pdf, csv, xlsx, txt)
- State: AWS DynamoDB (tabela report_jobs + tabela report_templates)
- Storage: AWS S3 Files (NFS mount via S3 Files - NOVO Apr/2026)
  - /mnt/templates → bucket de templates (read-only)
  - /mnt/outputs   → bucket de output (read-write)
- Email: AWS SES (templates .hbs em /mnt/templates/mail/)
- Deploy: AWS CDK (TypeScript)
- Observabilidade: AWS Lambda Powertools (Logger, Tracer, Metrics, Idempotency)

PRINCÍPIOS:
- Cada formato (pdf/csv/xlsx/txt) tem seu próprio Lambda worker e sua própria SQS queue
- Template engine usa Strategy Pattern: interface IReportEngine implementada por cada formato
- Templates de documento e de email ficam em /mnt/templates via S3 Files mount
- Output escrito com fs.writeFileSync('/mnt/outputs/...') — sem SDK upload
- Deduplicação por SHA-256(tenantId+userId+templateId+format+canonical(params))
- Lambda Powertools Idempotency com DynamoDB backend
- Sem NestJS — Lambda puros com DI manual via container simples

ESTRUTURA DE PASTAS:
report-service/
  packages/
    handler/          ← Lambda do handler (ALB trigger)
    workers/
      pdf-worker/     ← Lambda SQS trigger PDF
      csv-worker/     ← Lambda SQS trigger CSV
      xlsx-worker/    ← Lambda SQS trigger XLSX
      txt-worker/     ← Lambda SQS trigger TXT
    engines/          ← pacote compartilhado: IReportEngine + implementações
    shared/           ← tipos, utils, DynamoDB client, SES client
  infra/              ← CDK stacks
  
CONVENÇÕES:
- Arquivos: kebab-case
- Classes/interfaces: PascalCase
- Funções/variáveis: camelCase
- Sem any, sem eslint-disable sem justificativa
- Erros sempre tipados (nunca catch(e: any))
- Async/await, nunca callbacks
```

---

## PROMPT 1 — Estrutura do Monorepo

```
Com base no contexto do report-service acima, crie a estrutura inicial do monorepo.

TAREFAS:
1. Inicialize um monorepo com npm workspaces (não turborepo, não nx — simples npm workspaces)
2. Crie o package.json raiz com workspaces apontando para packages/* e infra
3. Crie o tsconfig.base.json raiz com as seguintes configurações:
   - target: ES2022
   - module: NodeNext
   - moduleResolution: NodeNext
   - strict: true
   - noUncheckedIndexedAccess: true
   - exactOptionalPropertyTypes: true
   - declaration: true
   - declarationMap: true
   - sourceMap: true
4. Crie o .eslintrc.json com @typescript-eslint/recommended
5. Crie o .nvmrc com node 20
6. Crie os package.json de cada package com nome @report-service/{nome}
7. Cada package Lambda deve ter:
   - tsconfig.json estendendo o base
   - esbuild como bundler (não tsc para build final)
   - script build:lambda que gera dist/index.js via esbuild (bundle:true, minify:false, platform:node, target:node20)

NÃO crie os arquivos de implementação ainda, apenas a estrutura e configs.
Mostre o resultado final como árvore de diretórios + conteúdo de cada arquivo de config.
```

---

## PROMPT 2 — Tipos Compartilhados e Contratos

```
No package @report-service/shared, crie todos os tipos TypeScript e contratos da aplicação.

CRIE OS SEGUINTES ARQUIVOS:

1. src/types/job.types.ts
   - enum JobStatus: PENDING | PROCESSING | DONE | FAILED
   - enum ReportFormat: PDF | CSV | XLSX | TXT
   - interface ReportJob:
     jobId: string (ulid)
     tenantId: string
     userId: string
     format: ReportFormat
     templateId: string
     templateVersion: string
     params: Record<string, unknown>
     paramsHash: string  ← SHA-256 do canonical dos params
     dedupHash: string   ← SHA-256(tenantId+userId+format+templateId+paramsHash)
     status: JobStatus
     s3OutputKey?: string
     recipientEmail: string
     recipientName: string
     locale: string (default: 'pt-BR')
     createdAt: string (ISO)
     updatedAt: string (ISO)
     expiresAt: number (unix timestamp para DynamoDB TTL)

2. src/types/template.types.ts
   - interface ReportTemplate:
     templateId: string
     version: string
     format: ReportFormat
     name: string
     description?: string
     s3Key: string  ← caminho no bucket de templates
     mailTemplateId: string
     tenantId: string | 'global'
     isActive: boolean
     createdAt: string

3. src/types/engine.types.ts
   - interface EngineContext:
     job: ReportJob
     template: ReportTemplate
     outputPath: string  ← path completo em /mnt/outputs/...
     templatePath: string  ← path completo em /mnt/templates/...
   - interface EngineResult:
     outputPath: string
     sizeBytes: number
     durationMs: number

4. src/types/api.types.ts
   - interface GenerateReportRequest:
     format: ReportFormat
     templateId: string
     params: Record<string, unknown>
     recipientEmail: string
     recipientName: string
     locale?: string
   - interface GenerateReportResponse (202):
     jobId: string
     status: JobStatus
     message: string
   - interface GenerateReportCacheHit (200):
     jobId: string
     status: 'DONE'
     downloadUrl: string
     expiresAt: string
   - interface JobStatusResponse:
     jobId: string
     status: JobStatus
     downloadUrl?: string
     format: ReportFormat
     createdAt: string

5. src/types/sqs.types.ts
   - interface ReportJobMessage:
     jobId: string
     format: ReportFormat
     dedupHash: string
   (mensagem SQS é mínima — worker busca job completo no DynamoDB)

6. src/errors/app-errors.ts
   - AppError base class com statusCode + errorCode + message
   - JobNotFoundError (404)
   - TemplateNotFoundError (404)
   - DedupHashConflictError (409) — job já em processamento
   - ValidationError (400) com array de field errors
   - EngineError (500) com engineName + originalError

7. src/utils/hash.ts
   - função computeParamsHash(params: Record<string, unknown>): string
     → JSON.stringify com chaves ordenadas → SHA-256 → hex
   - função computeDedupHash(tenantId, userId, format, templateId, paramsHash): string
     → SHA-256 de string concatenada com separador | → hex

8. src/utils/ulid.ts
   - wrapper de geração de ULID (use a lib 'ulid')

Exporte tudo via src/index.ts.
Use apenas libs nativas do Node.js (crypto para SHA-256) — sem dependências externas exceto 'ulid'.
```

---

## PROMPT 3 — Clientes AWS (DynamoDB + SQS + S3 + SES)

```
No package @report-service/shared, crie os clientes AWS com tipagem forte.
Use @aws-sdk/client-dynamodb + @aws-sdk/lib-dynamodb para DynamoDB.
Use @aws-sdk/client-sqs, @aws-sdk/client-s3, @aws-sdk/s3-request-presigner, @aws-sdk/client-ses.

CRIE OS SEGUINTES ARQUIVOS:

1. src/clients/dynamodb.client.ts
   - Singleton DynamoDBDocumentClient com marshall options (removeUndefinedValues: true)
   - Configurado para usar VPC Endpoint via env AWS_DYNAMODB_ENDPOINT (opcional)

2. src/repositories/job.repository.ts
   - Interface IJobRepository com métodos:
     create(job: ReportJob): Promise<void>
     findById(jobId: string): Promise<ReportJob | null>
     findByDedupHash(dedupHash: string): Promise<ReportJob | null>
       → Query no GSI 'dedupHash-index'
     updateStatus(jobId: string, status: JobStatus, extra?: Partial<ReportJob>): Promise<void>
       → UpdateExpression com updatedAt automático
   - Implementação DynamoDbJobRepository
   - TABLE_NAME via env JOBS_TABLE_NAME
   - Todos os erros AWS transformados em AppError tipado

3. src/repositories/template.repository.ts
   - Interface ITemplateRepository:
     findById(templateId: string, version?: string): Promise<ReportTemplate | null>
     findActive(templateId: string, tenantId: string): Promise<ReportTemplate | null>
   - Cache em memória com TTL de 5 minutos (Map com { value, expiresAt })
   - TEMPLATES_TABLE_NAME via env

4. src/clients/sqs.client.ts
   - Wrapper tipado SqsPublisher:
     publishJob(queueUrl: string, message: ReportJobMessage): Promise<{ messageId: string }>
     → MessageGroupId = job.tenantId (para FIFO se necessário)
     → MessageDeduplicationId = job.dedupHash
   - Queue URLs via env: SQS_PDF_QUEUE_URL, SQS_CSV_QUEUE_URL, SQS_XLSX_QUEUE_URL, SQS_TXT_QUEUE_URL
   - Função helper resolveQueueUrl(format: ReportFormat): string

5. src/clients/s3.client.ts
   - Função generatePresignedUrl(s3Key: string, ttlSeconds = 86400): Promise<string>
     → usa @aws-sdk/s3-request-presigner com GetObjectCommand
   - OUTPUT_BUCKET_NAME via env

6. src/clients/ses.client.ts
   - Classe SesMailer:
     send(params: { to: string, name: string, subject: string, htmlBody: string, textBody: string }): Promise<void>
     → usa SendEmailCommand com ReplyToAddresses configurável
   - SES_FROM_ADDRESS via env

Todas as funções/métodos devem logar com Logger do Lambda Powertools (injetado via construtor).
Nunca logue dados sensíveis (emails, params completos — use jobId + dedupHash).
```

---

## PROMPT 4 — Interface IReportEngine e Engines

```
No package @report-service/engines, implemente o Strategy Pattern para geração de relatórios.
Este package é importado pelos 4 worker Lambdas.

IMPORTANTE: Os engines usam fs nativo para ler templates e escrever outputs.
- Templates ficam em /mnt/templates/{format}/{templateId}/{version}.{ext}
- Outputs ficam em /mnt/outputs/{tenantId}/{userId}/{dedupHash}.{ext}
- Paths montados via S3 Files (NFS) — sem SDK calls para ler/escrever arquivo

DEPENDÊNCIAS:
- Engines compartilham: handlebars, pdfkit, @sparticuz/chromium-min, puppeteer-core
- CSV: csv-stringify (streaming)
- XLSX: exceljs
- Tipagem de @report-service/shared

CRIE OS SEGUINTES ARQUIVOS:

1. src/engine.interface.ts
   - interface IReportEngine:
     readonly format: ReportFormat
     generate(ctx: EngineContext): Promise<EngineResult>
   - função resolveTemplatePath(template: ReportTemplate, mountBase = '/mnt/templates'): string
     → `${mountBase}/${template.format.toLowerCase()}/${template.templateId}/${template.version}.${getExtension(template.format)}`
   - função resolveOutputPath(job: ReportJob, mountBase = '/mnt/outputs'): string
     → `${mountBase}/${job.tenantId}/${job.userId}/${job.dedupHash}.${getExtension(job.format)}`
   - função getExtension(format: ReportFormat): string → 'pdf' | 'csv' | 'xlsx' | 'txt'

2. src/engines/pdf.engine.ts
   - Classe PdfEngine implements IReportEngine
   - readonly format = ReportFormat.PDF
   - generate(ctx):
     a. fs.readFileSync(ctx.templatePath, 'utf8') → template Handlebars string
     b. Handlebars.compile(template)(ctx.job.params) → HTML string
     c. Inicia puppeteer com @sparticuz/chromium-min (executablePath via chromium.executablePath())
     d. page.setContent(html) → page.pdf({ format: 'A4', printBackground: true })
     e. fs.mkdirSync(path.dirname(ctx.outputPath), { recursive: true })
     f. fs.writeFileSync(ctx.outputPath, pdfBuffer)
     g. Fecha browser
   - Registra customHelpers Handlebars: formatDate, formatCurrency, formatCPF

3. src/engines/csv.engine.ts
   - Classe CsvEngine implements IReportEngine
   - generate(ctx):
     a. fs.readFileSync(ctx.templatePath, 'utf8') → JSON.parse → CsvSchema
     b. CsvSchema: { columns: Array<{ key: string, header: string, format?: 'date'|'currency'|'cpf' }>, delimiter?: string, bom?: boolean }
     c. fs.mkdirSync path
     d. Cria WriteStream para ctx.outputPath
     e. Se bom: stream.write('\uFEFF')
     f. Usa csv-stringify em modo streaming, pipe para writeStream
     g. Processa ctx.job.params.rows como array, aplica formatadores por coluna
     h. Aguarda finish do stream com Promise wrapping 'finish' event

4. src/engines/xlsx.engine.ts
   - Classe XlsxEngine implements IReportEngine
   - generate(ctx):
     a. const workbook = new ExcelJS.Workbook()
     b. await workbook.xlsx.readFile(ctx.templatePath)
     c. Para cada sheet: lê named ranges definidos no template schema
     d. Template schema: arquivo auxiliar .json no mesmo diretório do .xlsx → {templateId}/{version}.schema.json
        Schema: { sheets: Array<{ name: string, namedRanges: Array<{ name: string, dataKey: string }> }> }
     e. Preenche células pelos named ranges com dados de ctx.job.params
     f. fs.mkdirSync path
     g. await workbook.xlsx.writeFile(ctx.outputPath)

5. src/engines/txt.engine.ts
   - Classe TxtEngine implements IReportEngine
   - generate(ctx):
     a. fs.readFileSync(ctx.templatePath, 'utf8') → Handlebars template
     b. Registra helpers: padLeft(str, n), padRight(str, n), formatDate, formatCurrency, zerofill(n, width)
     c. Handlebars.compile(template)(ctx.job.params) → rendered string
     d. Resolve encoding de ctx.job.params.encoding ?? 'utf8'
     e. fs.mkdirSync path
     f. fs.writeFileSync(ctx.outputPath, rendered, encoding as BufferEncoding)

6. src/engine.registry.ts
   - Classe EngineRegistry com Map<ReportFormat, IReportEngine>
   - register(engine: IReportEngine): void
   - resolve(format: ReportFormat): IReportEngine (lança EngineError se não encontrado)
   - Função createDefaultRegistry(): EngineRegistry que registra os 4 engines

Cada engine deve:
- Medir tempo com Date.now() e retornar no EngineResult
- Medir sizeBytes com fs.statSync após write
- Nunca capturar erros silenciosamente — relançar como EngineError(engineName, error)
```

---

## PROMPT 5 — Mail Service

```
No package @report-service/shared, crie o MailService que usa templates Handlebars
do mount S3 Files e envia via Amazon SES.

ARQUIVO: src/mail/mail.service.ts

INTERFACE IMailService:
  sendReportReady(params: {
    to: string
    recipientName: string
    locale: string
    reportTitle: string
    format: ReportFormat
    downloadUrl: string
    expiresAt: Date
    jobId: string
    tenantName?: string
  }): Promise<void>

IMPLEMENTAÇÃO MailService:
  Constructor recebe: sesMailer: SesMailer, templateRepository: ITemplateRepository

  sendReportReady:
  1. Resolve mailTemplateId via template registry (parâmetro injetado)
  2. Carrega template de: /mnt/templates/mail/{mailTemplateId}/{locale}.hbs
     Se não encontrar locale específico, fallback para pt-BR.hbs
  3. Handlebars.compile(template)(vars) → HTML body
  4. Template de texto simples: /mnt/templates/mail/{mailTemplateId}/{locale}.txt.hbs
  5. Subject: extraído do frontmatter do template (primeira linha: {{!-- subject: Seu relatório está pronto --}})
  6. Chama sesMailer.send()

VARIÁVEIS DISPONÍVEIS NO TEMPLATE:
  recipientName, reportTitle, format (uppercase), downloadUrl,
  expiresAtFormatted (dd/MM/yyyy HH:mm), jobId, tenantName, currentYear

ARQUIVO: src/mail/templates/report-ready/pt-BR.hbs (template padrão embutido)
  Crie um template HTML básico responsivo com:
  - Seção de saudação com {{recipientName}}
  - Box de destaque com botão "Baixar relatório" linkando para {{downloadUrl}}
  - Informação de expiração: "Link válido até {{expiresAtFormatted}}"
  - Footer com {{currentYear}}
  
  Este template embutido serve de fallback quando o mount não está disponível
  (ex: testes locais). Sempre tente o mount primeiro.

ARQUIVO: src/mail/templates/report-ready/pt-BR.txt.hbs
  Versão plain text do mesmo email.

TESTE: src/mail/mail.service.spec.ts
  - Mock do sesMailer
  - Teste: template do mount (mock fs.readFileSync)
  - Teste: fallback para template embutido quando mount falha
  - Teste: fallback de locale (es-MX cai em pt-BR)
```

---

## PROMPT 6 — Lambda Handler (ALB Trigger)

```
No package @report-service/handler, crie o Lambda handler que recebe requests do ALB interno.

ARQUIVO: src/index.ts (entry point Lambda)

O handler deve:
1. Receber ALBEvent do @types/aws-lambda
2. Roteamento simples por path + method (sem framework):
   - POST /reports/generate → handleGenerate
   - GET /reports/{jobId}/status → handleStatus
   - GET /health → handleHealth
3. Middleware pipeline manual:
   - parseBody: JSON.parse do body base64 se necessário
   - validateJwt: verifica header Authorization, decodifica JWT (use jose lib)
     Extrai: tenantId, userId do payload JWT
   - validateSchema: usa zod para validar body
   - errorHandler: captura AppError e retorna statusCode correto

HANDLER handleGenerate:
1. Valida GenerateReportRequest com zod
2. Busca template ativo no TemplateRepository
3. Computa paramsHash e dedupHash
4. Consulta DynamoDB por dedupHash (GSI)
   - Se encontrar com status=DONE:
     → s3.generatePresignedUrl(job.s3OutputKey) → retorna 200 com GenerateReportCacheHit
   - Se encontrar com status=PENDING ou PROCESSING:
     → retorna 202 com jobId existente + mensagem "Job já em processamento"
5. Se não encontrar:
   a. Cria ReportJob com ulid() + status=PENDING
   b. Salva no DynamoDB (create)
   c. Publica na SQS queue do formato correto
   d. Retorna 202 com GenerateReportResponse
6. Lambda Powertools Idempotency no método inteiro usando dedupHash como key

HANDLER handleStatus:
1. Extrai jobId do path
2. Busca job no DynamoDB
3. Se não encontrado → 404 JobNotFoundError
4. Se DONE → inclui downloadUrl (nova presigned URL gerada)
5. Retorna JobStatusResponse

CONFIGURAÇÃO Lambda Powertools:
- Logger: LOG_LEVEL via env, injeta correlationId de cada request
- Tracer: X-Ray com captureLambdaHandler + captureAWSv3Client nos clientes
- Metrics: reportRequests.count, cacheHits.count por namespace ReportService

ENV VARS necessárias:
JOBS_TABLE_NAME, TEMPLATES_TABLE_NAME, JWT_SECRET (ou JWT_JWKS_URI),
SQS_PDF_QUEUE_URL, SQS_CSV_QUEUE_URL, SQS_XLSX_QUEUE_URL, SQS_TXT_QUEUE_URL,
OUTPUT_BUCKET_NAME, LOG_LEVEL

TESTES (src/handler.spec.ts):
- Mock de todos os repositórios e clientes
- Teste dedup hit (status=DONE)
- Teste dedup pending
- Teste novo job
- Teste JWT inválido → 401
- Teste body inválido → 400 com detalhes zod
```

---

## PROMPT 7 — Worker Lambda Base (Padrão reusável)

```
Crie um módulo base para os 4 worker Lambdas em @report-service/shared.
Os workers têm a mesma estrutura — apenas o engine muda.

ARQUIVO: src/worker/base-worker.ts

CLASSE BaseWorker:
  Constructor recebe:
    - engine: IReportEngine
    - jobRepository: IJobRepository
    - templateRepository: ITemplateRepository
    - mailService: IMailService
    - s3Client: S3Client (para presigned URL após write via mount)
    - logger: Logger (Powertools)
    - tracer: Tracer (Powertools)

  MÉTODO processRecord(record: SQSRecord): Promise<void>
    1. Parse SQSRecord body → ReportJobMessage
    2. Busca job no DynamoDB por jobId
    3. Se job não encontrado ou status != PENDING: skip (log warn) → sucesso (não vai para DLQ)
    4. updateStatus(PROCESSING)
    5. Busca template no TemplateRepository
    6. Resolve paths:
       templatePath = resolveTemplatePath(template)
       outputPath = resolveOutputPath(job)
    7. Valida que /mnt/templates existe (fs.existsSync) — se não: lança MountNotAvailableError
    8. Chama engine.generate({ job, template, templatePath, outputPath })
    9. Gera presigned URL: s3.generatePresignedUrl(job.dedupHash + '.' + ext)
       (o S3 key é o mesmo que o path relativo ao bucket — S3 Files sincroniza)
   10. Envia email: mailService.sendReportReady(...)
   11. updateStatus(DONE, { s3OutputKey: relativeKey })
   12. Em caso de erro:
       - updateStatus(FAILED, { errorMessage: err.message })
       - Relança o erro (SQS vai fazer retry → DLQ após maxReceiveCount)

  MÉTODO handler: SQSHandler (exportável como Lambda handler)
    - Lambda Powertools: @logger.injectLambdaContext + @tracer.captureLambdaHandler
    - @metrics.logMetrics
    - Itera event.Records com Promise.allSettled (batch size = 1, mas seguro para futuro)
    - Se algum record falhou: lança o erro para forçar retry do SQS (não usa batchItemFailures)

FACTORY: src/worker/worker.factory.ts
  Função createWorkerHandler(format: ReportFormat): SQSHandler
  - Instancia os clientes (DynamoDBDocumentClient, SQSClient, S3Client, SESClient)
  - Instancia os repositórios
  - Instancia o engine correto da EngineRegistry
  - Instancia o MailService
  - Cria BaseWorker e retorna worker.handler

  Este factory é chamado uma vez no cold start de cada Lambda.
```

---

## PROMPT 8 — Os 4 Worker Lambdas

```
Crie os 4 worker Lambdas usando o BaseWorker e a WorkerFactory.
Cada worker é mínimo — apenas o entry point que instancia via factory.

ARQUIVO: packages/workers/pdf-worker/src/index.ts
  import { createWorkerHandler } from '@report-service/shared/worker/worker.factory'
  import { ReportFormat } from '@report-service/shared'
  export const handler = createWorkerHandler(ReportFormat.PDF)

(mesmo padrão para csv-worker, xlsx-worker, txt-worker)

ARQUIVO: packages/workers/pdf-worker/package.json
  - name: @report-service/pdf-worker
  - dependencies: @report-service/shared, @report-service/engines
  - devDependencies: @types/aws-lambda, typescript, esbuild
  - scripts:
    build: esbuild src/index.ts --bundle --platform=node --target=node20 \
           --outfile=dist/index.js --external:@aws-sdk/* \
           (NÃO external chromium — precisa bundlar)

CONFIGURAÇÕES ESPECÍFICAS POR WORKER:

pdf-worker:
  - Memory: 1536 MB
  - Timeout: 300s (5 min)
  - esbuild: sem external para @sparticuz/chromium-min e puppeteer-core
  - Variável CHROMIUM_PATH não necessária — chromium auto-resolve

csv-worker:
  - Memory: 512 MB
  - Timeout: 180s
  - esbuild: external de pdfkit, puppeteer-core, chromium

xlsx-worker:
  - Memory: 1024 MB
  - Timeout: 180s
  - esbuild: external de pdfkit, puppeteer-core, chromium

txt-worker:
  - Memory: 256 MB
  - Timeout: 30s
  - esbuild: external de pdfkit, puppeteer-core, chromium, exceljs

NOTA SOBRE BUNDLE SIZE:
  O pdf-worker vai ser grande (~50MB+) por causa do chromium.
  Use @sparticuz/chromium-min que é menor (~30MB).
  Configure esbuild com:
    --asset-names=[name] para assets do chromium
    Testar com Lambda container image se bundle > 50MB unzipped

TESTE DE INTEGRAÇÃO LOCAL (src/index.local.ts):
  Script para rodar o worker localmente sem SQS:
  - Lê um evento SQS mockado de fixtures/sqs-event.json
  - Usa LocalStack ou mocks de repositório via env LOCAL=true
  - Útil para testar geração de PDF localmente
```

---

## PROMPT 9 — CDK Stack (Infra)

```
No package infra/, crie as CDK stacks TypeScript para toda a infraestrutura.
Use AWS CDK v2.

ESTRUTURA:
infra/
  bin/app.ts           ← entry point CDK
  lib/
    core-stack.ts      ← DynamoDB, SQS, VPC config
    storage-stack.ts   ← S3 buckets + S3 Files file systems
    handler-stack.ts   ← Lambda handler + ALB interno
    workers-stack.ts   ← 4 Lambda workers + SQS event sources + S3 Files mounts

CRIE OS SEGUINTES ARQUIVOS:

1. lib/core-stack.ts
   DynamoDB report_jobs:
   - partitionKey: jobId (string)
   - GSI: dedupHash-index (partitionKey: dedupHash)
   - billingMode: PAY_PER_REQUEST
   - timeToLiveAttribute: 'expiresAt'
   - pointInTimeRecovery: true

   DynamoDB report_templates:
   - partitionKey: templateId (string), sortKey: version (string)
   - GSI: tenantId-format-index
   - billingMode: PAY_PER_REQUEST

   SQS Queues (uma por formato + DLQ correspondente):
   Para cada formato (pdf, csv, xlsx, txt):
   - report-{format}-dlq: SqsQueue com retentionPeriod 14 dias
   - report-{format}-queue: SqsQueue com
     visibilityTimeout: CfnParameter ou hardcoded (pdf:360s, csv:120s, xlsx:180s, txt:60s)
     deadLetterQueue: { queue: dlq, maxReceiveCount: 3 }
     encryption: QueueEncryption.KMS_MANAGED

2. lib/storage-stack.ts
   S3 Template Store Bucket:
   - blockPublicAccess: BlockPublicAccess.BLOCK_ALL
   - encryption: BucketEncryption.S3_MANAGED
   - versioned: true
   - autoDeleteObjects: false

   S3 Output Bucket:
   - blockPublicAccess: BlockPublicAccess.BLOCK_ALL
   - encryption: BucketEncryption.S3_MANAGED
   - lifecycleRules:
     [ { transitions: [{ storageClass: INFREQUENT_ACCESS, transitionAfter: Duration.days(30) },
                       { storageClass: GLACIER, transitionAfter: Duration.days(90) }],
         expiration: Duration.days(365) } ]

   S3 Files FileSystems:
   NOTA: Use constructs do CDK para EFS + S3 Files (s3files.FileSystem)
   - templateFileSystem: EfsFileSystem backed pelo templateBucket
     via aws_efs.FileSystem com S3 Files integration
   - outputFileSystem: EfsFileSystem backed pelo outputBucket
   - Access Points: templateAP (readOnly path /), outputAP (readWrite path /)
   - Security Group: sgS3Files com regra ingress TCP 2049 do sgLambda

3. lib/handler-stack.ts
   Internal ALB:
   - scheme: internet-facing = false (internal)
   - vpcSubnets: { subnetType: SubnetType.PRIVATE_WITH_EGRESS }

   Lambda Handler:
   - NodejsFunction com entry: packages/handler/src/index.ts
   - bundling: { externalModules: ['@aws-sdk/*'] }
   - memorySize: 256, timeout: Duration.seconds(10)
   - environment: todas as env vars necessárias
   - Sem S3 Files mount (handler não precisa)

   ALB Target Group: LambdaTarget apontando para o handler fn

4. lib/workers-stack.ts
   Para cada formato, crie uma NodejsFunction:

   Função helper createWorkerFunction(scope, format, config):
   - entry: packages/workers/{format}-worker/src/index.ts
   - memorySize: config.memory
   - timeout: Duration.seconds(config.timeout)
   - vpc + vpcSubnets: PRIVATE_WITH_EGRESS
   - securityGroups: [sgLambda]
   - environment: JOBS_TABLE_NAME, TEMPLATES_TABLE_NAME, OUTPUT_BUCKET_NAME, etc.

   S3 Files Mounts:
   Para cada worker:
   fn.addFileSystem(aws_lambda.FileSystem.fromEfsAccessPoint(
     templateAP, '/mnt/templates'
   ))
   fn.addFileSystem(aws_lambda.FileSystem.fromEfsAccessPoint(
     outputAP, '/mnt/outputs'
   ))

   SQS Event Sources:
   fn.addEventSource(new SqsEventSource(queue, {
     batchSize: 1,
     maxConcurrency: config.maxConcurrency,
     reportBatchItemFailures: false,
   }))

   IAM Grants:
   - jobsTable.grantReadWriteData(fn)
   - templatesTable.grantReadData(fn)
   - templateBucket.grantRead(fn)
   - outputBucket.grantReadWrite(fn)
   - Adicionar policy s3files:ClientMount para ambos os file systems
   - queue.grantConsumeMessages(fn)
   - dlq: grantSendMessages via SNS alarm (opcional)

5. bin/app.ts
   const app = new cdk.App()
   const env = { account: process.env.CDK_ACCOUNT, region: process.env.CDK_REGION ?? 'us-east-1' }
   const core = new CoreStack(app, 'ReportServiceCore', { env })
   const storage = new StorageStack(app, 'ReportServiceStorage', { env })
   const handler = new HandlerStack(app, 'ReportServiceHandler', { env, ...outputs from core+storage })
   const workers = new WorkersStack(app, 'ReportServiceWorkers', { env, ...outputs from all stacks })

COMANDOS CDK:
  cdk synth → cdk diff → cdk deploy --all --require-approval never
```

---

## PROMPT 10 — Variáveis de Ambiente e Configuração

```
Crie o sistema de configuração centralizado para todos os Lambdas.

ARQUIVO: packages/shared/src/config/config.ts

Crie uma função getConfig() que:
1. Lê todas as env vars necessárias
2. Valida com zod que nenhuma obrigatória está undefined
3. Retorna um objeto de configuração tipado (nunca retorna string | undefined)
4. Falha fast no cold start se config inválida (não em runtime)

SCHEMA ZOD para HandlerConfig:
  jobsTableName: z.string().min(1)
  templatesTableName: z.string().min(1)
  outputBucketName: z.string().min(1)
  jwtSecret: z.string().optional()
  jwtJwksUri: z.string().url().optional()
  sqsPdfQueueUrl: z.string().url()
  sqsCsvQueueUrl: z.string().url()
  sqsXlsxQueueUrl: z.string().url()
  sqsTxtQueueUrl: z.string().url()
  awsRegion: z.string().default('us-east-1')
  logLevel: z.enum(['DEBUG','INFO','WARN','ERROR']).default('INFO')
  sesFromAddress: z.string().email()
  templatesMountPath: z.string().default('/mnt/templates')
  outputsMountPath: z.string().default('/mnt/outputs')
  
Refinement: jwtSecret OU jwtJwksUri deve estar presente (não ambos vazios)

ARQUIVO: packages/shared/src/config/local.config.ts
  Para desenvolvimento local (env LOCAL=true):
  - templatesMountPath: './fixtures/templates'
  - outputsMountPath: './fixtures/outputs'
  - Cria as pastas se não existirem
  
ARQUIVO: .env.example (na raiz)
  Documente todas as env vars com comentários explicativos.
  
ARQUIVO: .env.test
  Valores para testes unitários (sem valores reais AWS).
```

---

## PROMPT 11 — Testes

```
Crie a suíte de testes para os componentes críticos.
Use Vitest (não Jest) com configuração de workspace para o monorepo.

SETUP:
1. vitest.config.ts na raiz com workspaces apontando para todos os packages
2. vitest.setup.ts com mocks globais para @aws-sdk/* e fs (quando necessário)
3. Cada package com seu vitest.config.ts local

TESTES OBRIGATÓRIOS:

1. packages/shared/src/utils/hash.spec.ts
   - computeParamsHash deve ser determinístico com mesma entrada
   - computeParamsHash deve produzir hash diferente para params diferentes
   - computeParamsHash deve ser ORDER-INDEPENDENT nas chaves (canonical sort)
   - computeDedupHash deve mudar se qualquer campo mudar

2. packages/engines/src/engines/csv.engine.spec.ts
   - Mock fs com vol (use memfs)
   - Cria template schema em /mnt/templates/csv/tpl-001/v1.json
   - Chama generate() com rows de dados
   - Valida que arquivo foi escrito em /mnt/outputs/...
   - Valida headers do CSV
   - Valida formatação de data e currency

3. packages/engines/src/engines/txt.engine.spec.ts
   - Mock fs com memfs
   - Template com padLeft e formatDate helpers
   - Valida encoding latin1 quando configurado

4. packages/handler/src/handler.spec.ts
   - Mock completo de jobRepository, templateRepository, sqsPublisher, s3Client
   - Caso: cache hit (dedupHash encontrado + DONE) → 200 com downloadUrl
   - Caso: dedup PENDING → 202 com jobId existente
   - Caso: novo job → cria + publica SQS → 202
   - Caso: JWT ausente → 401
   - Caso: body inválido (sem recipientEmail) → 400 com detalhes
   - Caso: templateId inexistente → 404

5. packages/shared/src/worker/base-worker.spec.ts
   - Mock de engine, repositórios, mailService
   - Caso happy path: PENDING → PROCESSING → generate() → sendEmail → DONE
   - Caso: job não encontrado → skip sem erro
   - Caso: job já em PROCESSING → skip sem erro (idempotência)
   - Caso: engine.generate() lança erro → status=FAILED → erro relançado para DLQ

6. packages/shared/src/mail/mail.service.spec.ts
   - Mock fs com memfs
   - Caso: template existe no mount → usa do mount
   - Caso: mount não disponível → usa template embutido fallback
   - Caso: locale 'es-MX' → fallback para pt-BR

COBERTURA MÍNIMA:
  packages/shared: 80%
  packages/engines: 70% (engines de arquivo são difíceis sem integração)
  packages/handler: 85%
```

---

## PROMPT 12 — CI/CD Pipeline

```
Crie o pipeline GitHub Actions para o report-service.

ARQUIVO: .github/workflows/ci.yml
  Trigger: push em main e pull_request

  Jobs:
  1. lint-and-typecheck:
     - npm ci
     - npm run lint --workspaces
     - npm run typecheck --workspaces

  2. test:
     - npm ci
     - npm run test --workspaces -- --run (sem watch)
     - Upload coverage para Codecov (opcional)

  3. build:
     - npm ci
     - npm run build --workspaces
     - Upload artifacts: dist/ de cada worker + handler

ARQUIVO: .github/workflows/deploy.yml
  Trigger: push em main (após CI passar)

  Jobs:
  1. deploy-dev:
     Environment: development
     Steps:
     - Checkout
     - Configure AWS credentials (OIDC, não access keys)
     - npm ci && npm run build --workspaces
     - cd infra && npx cdk deploy --all --require-approval never \
         -c environment=dev \
         --outputs-file cdk-outputs.json
     - Upload cdk-outputs.json como artifact

  2. deploy-staging:
     needs: deploy-dev
     Environment: staging (com approval manual)
     (mesmo padrão)

  3. deploy-prod:
     needs: deploy-staging
     Environment: production (com approval manual + reviewer obrigatório)

ARQUIVO: .github/workflows/upload-templates.yml
  Trigger: push em templates/** ou workflow_dispatch

  Permite fazer upload de templates para o S3 sem redeploy:
  Steps:
  - Valida que .hbs compila sem erro (node -e "require('handlebars').compile(fs.readFileSync(...))")
  - Valida que .json de schema é JSON válido
  - aws s3 sync templates/ s3://{TEMPLATE_BUCKET}/
  - Atualiza DynamoDB report_templates com nova version via script

ARQUIVO: scripts/update-template-registry.ts
  Script executado no workflow upload-templates:
  - Lê templates/ recursivamente
  - Para cada template: upsert no DynamoDB report_templates
  - Incrementa version automaticamente (semver patch)
```

---

## PROMPT 13 — Fixtures e Templates de Exemplo

```
Crie fixtures e templates de exemplo para desenvolvimento e testes locais.

ESTRUTURA:
fixtures/
  templates/
    pdf/
      financial-report/
        v1.hbs     ← template HTML para relatório financeiro
    csv/
      transactions/
        v1.json    ← schema de colunas para CSV de transações
    xlsx/
      summary/
        v1.xlsx    ← workbook base (use exceljs para criar programaticamente)
        v1.schema.json
    txt/
      remessa/
        v1.hbs     ← template CNAB 240 simplificado
    mail/
      report-ready/
        pt-BR.hbs
        pt-BR.txt.hbs
  outputs/         ← pasta vazia (criada em dev)
  jobs/
    sample-pdf-job.json
    sample-csv-job.json

1. fixtures/templates/pdf/financial-report/v1.hbs
   Template HTML de relatório financeiro com:
   - Variáveis: {{reportTitle}}, {{period}}, {{generatedAt}}, {{tenantName}}
   - Tabela de transações: {{#each transactions}} {{formatCurrency value}} {{/each}}
   - Seção de totais: {{formatCurrency totalRevenue}}, {{formatCurrency totalExpense}}
   - Header e footer de página usando CSS @page

2. fixtures/templates/csv/transactions/v1.json
   {
     "columns": [
       { "key": "date", "header": "Data", "format": "date" },
       { "key": "description", "header": "Descrição" },
       { "key": "amount", "header": "Valor", "format": "currency" },
       { "key": "status", "header": "Status" },
       { "key": "externalNsu", "header": "NSU Externo" }
     ],
     "delimiter": ";",
     "bom": true
   }

3. fixtures/templates/txt/remessa/v1.hbs
   Template de arquivo de remessa bancária simplificado (CNAB 240 header):
   - Header de arquivo com data/hora no formato correto
   - Segmento P com dados de pagamento
   - Trailer com totais
   - Use helpers padLeft, padRight, zerofill

4. scripts/seed-local.ts
   Script para popular DynamoDB local (LocalStack) com:
   - 2 templates de exemplo (financial-report, transactions)
   - 1 job de exemplo em status PENDING

ARQUIVO: docker-compose.yml
  Para desenvolvimento local com LocalStack:
  services:
    localstack:
      image: localstack/localstack:3
      ports: ['4566:4566']
      environment:
        SERVICES: dynamodb,sqs,s3,ses
        DEFAULT_REGION: us-east-1
      volumes:
        - ./scripts/localstack-init.sh:/etc/localstack/init/ready.d/init.sh
  
  ARQUIVO: scripts/localstack-init.sh
    Cria todos os recursos AWS localmente (tabelas DDB, filas SQS, buckets S3)
```

---

## PROMPT 14 — README e Documentação

```
Crie a documentação completa do projeto.

ARQUIVO: README.md (raiz)

Seções:
1. Visão Geral
   - O que o serviço faz
   - Diagrama ASCII simplificado do fluxo
   - Links para os diagramas de arquitetura HTML

2. Pré-requisitos
   - Node.js 20+, AWS CLI v2, CDK v2
   - Permissões AWS necessárias para deploy

3. Desenvolvimento Local
   - docker-compose up (LocalStack)
   - npm run seed:local
   - Como rodar um worker localmente:
     LOCAL=true node --require ts-node/register packages/workers/csv-worker/src/index.local.ts

4. Estrutura do Projeto
   - Explicação de cada package
   - Como adicionar um novo formato (passo a passo de 5 etapas)

5. Templates
   - Estrutura de paths no S3
   - Como criar um template PDF (com exemplo .hbs)
   - Como criar um schema CSV
   - Como fazer deploy de um novo template (workflow upload-templates)
   - Variáveis disponíveis por tipo de engine

6. API
   Documentação dos endpoints:
   POST /reports/generate
     Request body com schema zod
     Responses: 200 (cache hit), 202 (enfileirado), 400, 401, 404
   GET /reports/{jobId}/status
     Response: JobStatusResponse
   GET /health
     Response: { status: 'ok', version: string }

7. Deduplicação
   - Explicação do hash SHA-256
   - Quando retorna 200 vs 202
   - Como forçar re-geração (campo forceRegenerate: true)

8. Deploy
   - Comandos CDK por ambiente
   - Variáveis de ambiente obrigatórias
   - Como fazer rollback

9. Observabilidade
   - Links para dashboards CloudWatch
   - Queries úteis para CloudWatch Logs Insights
   - Como interpretar X-Ray traces

ARQUIVO: packages/engines/README.md
   - Como implementar um novo IReportEngine
   - Contrato completo da interface
   - Exemplo de engine mínimo

ARQUIVO: CONTRIBUTING.md
   - Fluxo de desenvolvimento (branch → PR → review → merge)
   - Como rodar testes
   - Convenções de código
   - Como adicionar novo formato de relatório
```

---

## CHECKLIST FINAL

> **Status da implementação** — NestJS adaptation (Apr/2026)
> Legenda: ✅ implementado | ⚠️ parcial/pendente deploy | ❌ não implementado

```
FUNCIONAL:
[✅] POST /reports/generate retorna 202 com jobId válido
     → src/reports/reports.controller.ts + reports.service.ts
[✅] Cache hit retorna 200 com presigned URL funcionando
     → ReportsService.generate() detecta status=DONE via GSI dedupHash-index
[⚠️] PDF é gerado corretamente pelo pdf-worker
     → PdfEngine implementado (src/engines/pdf.engine.ts); requer deploy com Chromium
[✅] CSV respeita schema de colunas e BOM encoding
     → CsvEngine com csv-stringify streaming + bom flag (src/engines/csv.engine.ts)
[✅] XLSX preenche named ranges sem corromper o workbook base
     → XlsxEngine com ExcelJS + sidecar .schema.json (src/engines/xlsx.engine.ts)
[✅] TXT respeita encoding latin1 e helpers de formatação
     → TxtEngine com Handlebars + padLeft/padRight/zerofill (src/engines/txt.engine.ts)
[✅] Email é enviado após geração com link funcional
     → MailService (src/mail/mail.service.ts) + SesMailer
[✅] Link expira após 24h
     → generatePresignedUrl(s3Key, 86400) em src/shared/clients/s3.client.ts

S3 FILES:
[⚠️] Lambda workers têm mount /mnt/templates acessível
     → CDK WorkersStack preparado; requer deploy AWS com EFS + S3 Files
[⚠️] Lambda workers têm mount /mnt/outputs acessível
     → idem acima
[⚠️] Security Group permite porta 2049 entre Lambda ENIs e mount targets
     → a definir no CDK WorkersStack (infra/lib/workers-stack.ts) após criação da VPC
[⚠️] IAM role dos workers tem s3files:ClientMount
     → CDK WorkersStack lista a policy; verificar após deploy
[⚠️] Arquivo escrito em /mnt/outputs aparece no S3 output bucket
     → comportamento do S3 Files; verificar em staging
[⚠️] Arquivo em /mnt/templates reflete mudanças do S3 template bucket
     → comportamento do S3 Files; verificar em staging

DEDUPLICAÇÃO:
[✅] Mesmos params + mesmo template retornam o mesmo hash
     → computeParamsHash + computeDedupHash em src/shared/utils/hash.ts
[✅] Params com ordem de chaves diferente produzem o mesmo hash (canonical)
     → sortKeys() recursivo em hash.ts; coberto por testes (hash.spec.ts)
[✅] Job DONE retorna nova presigned URL sem re-processar
     → ReportsService.generate() retorna 200 com nova URL sem criar job
[✅] Job PENDING retorna 202 com jobId existente
     → ReportsService.generate() retorna jobId existente sem criar novo

DLQ:
[✅] Worker falha 3x → mensagem vai para DLQ
     → CDK CoreStack: maxReceiveCount: 3 em todas as filas
[✅] Alerta SNS dispara quando DLQ tem mensagens
     → CDK CoreStack: CloudWatch Alarm por fila (depth >= 1) → SNS alertsTopic
[✅] Status do job atualiza para FAILED antes do erro ser relançado
     → BaseWorker.processRecord() catch: updateStatus(FAILED) → throw

SEGURANÇA:
[✅] JWT é validado em todo request ao handler
     → JwtMiddleware registrado via AppModule.configure() para /reports/*
[✅] tenantId extraído do JWT (não do body)
     → jwt.middleware.ts extrai payload.tenantId / payload.sub
[✅] Presigned URL expira em 24h
     → getSignedUrl com expiresIn: 86400
[✅] S3 buckets sem acesso público
     → CDK StorageStack: blockPublicAccess: BLOCK_ALL em ambos os buckets
[✅] Logs não contêm emails ou dados sensíveis
     → jobId + dedupHash logados; emails e params não logados

CDK / INFRA:
[⚠️] cdk diff não mostra mudanças destrutivas não intencionais
     → verificar após primeiro deploy
[✅] DynamoDB TTL configurado no campo expiresAt
     → CDK CoreStack: timeToLiveAttribute: 'expiresAt'
[✅] SQS com encryption KMS
     → CDK CoreStack: encryption: QueueEncryption.KMS_MANAGED
[✅] Lambda em VPC private subnet
     → CoreStack cria VPC (lookup CDK_VPC_ID ou nova, PRIVATE_ISOLATED); HandlerStack + WorkersStack recebem vpc + sgLambda
[✅] Sem NAT Gateway (todo tráfego via VPC Endpoints)
     → StorageStack: Gateway Endpoints (S3, DynamoDB) + Interface Endpoints (SQS, SES)

OBSERVABILIDADE:
[✅] Logs estruturados com correlationId em todos os handlers
     → src/observability/powertools.ts: Logger singleton; lambda.ts + worker.factory.ts chamam logger.addContext(context)
[✅] X-Ray traces visíveis no console AWS
     → Tracer singleton em powertools.ts; subsegmentos ## handler e ## worker em lambda.ts e worker.factory.ts
[✅] Métrica reportRequests.count incrementando
     → metrics.addMetric('reportRequests') em ReportsService.generate(); 'httpRequests' em lambda.ts; 'sqsRecordsProcessed' nos workers
[✅] Alarm para Lambda error rate > 1% configurado
     → infra/lib/observability-stack.ts: MathExpression errors/invocations*100 para handler + 4 workers
[✅] Alarm para DLQ depth > 0 configurado
     → CDK CoreStack: cloudwatch.Alarm por DLQ → SnsAction(alertsTopic)

BUGS CORRIGIDOS (Apr/2026):
[✅] lambda.ts: variável `handler` duplicada → renomeada para `cachedHandler`
[✅] base-worker.ts: @Inject() faltando nos tokens de repositório
[✅] mail.service.ts: import.meta.dirname incompatível com Node.js 20 → lazy load via fileURLToPath
[✅] reports.controller.ts: @HttpCode(202) fixo → cache hit retornava 202 em vez de 200
[✅] reports.controller.ts: @Res() + passthrough para controle manual de status HTTP
[✅] jwt.middleware.ts: throw em vez de next(err) no Express 4 → corrigido para next(err)
[✅] app.module.ts: JWT via nestApp.use() (Express raw) → migrado para MiddlewareConsumer
[✅] engines.module.ts: OnModuleInit sem bootstrap completo → migrado para OnApplicationBootstrap + ModuleRef
[✅] worker.factory.ts: providers duplicados dos módulos importados → removida duplicação
[✅] GET /health ausente → implementado em src/health/health.controller.ts
[✅] app.exception-filter.ts: sem guarda response.headersSent → adicionado
```

---

> **Dica de uso no Cursor/Claude Code:**
> 
> Use cada prompt em uma sessão separada. Comece sempre colando o **CONTEXTO GLOBAL**
> antes do prompt específico. Para prompts de implementação (5-8), inclua também
> os tipos criados no prompt 2 como contexto adicional.
> 
> Para o CDK (prompt 9), inclua os outputs dos prompts anteriores para que
> o assistente saiba os nomes exatos das constructs e interfaces já criadas.

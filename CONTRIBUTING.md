# Contributing

## Arquitetura

- **API REST** (`src/main.ts`, `src/core/`, `src/features/reporting/`, `src/features/health/`) → roda em **ECS Fargate** (Docker), não Lambda. Build com `nest build` + `Dockerfile`.
- **Workers** (`src/workers/handlers/*.worker.ts`) → 4 **Lambda functions** disparadas por SQS, com mount EFS em `/mnt/templates` e `/mnt/outputs`. Build com esbuild (`npm run build:lambdas`).
- **Camadas compartilhadas**: `src/commons/` (tipos, erros, utils, clients), `src/engines/`, `src/mail/`.

## Fluxo de desenvolvimento

```
main → feature/minha-feature → PR → review → merge
```

```bash
git checkout -b feature/minha-feature
# ... implemente ...
git commit -m "feat: minha feature"
git push origin feature/minha-feature
# Abra PR no GitHub
```

## Como rodar os testes

```bash
npm test              # todos os testes
npm run test:cov      # com cobertura
npm run test:watch    # watch mode
```

## Convenções de código

- Arquivos: `kebab-case` com sufixo semântico:
  - `*.module.ts`, `*.service.ts`, `*.controller.ts`
  - `*.repository.ts`, `*.worker.ts`, `*.handler.ts`
  - `*.types.ts`, `*.errors.ts`
- Classes/interfaces: `PascalCase`
- Funções/variáveis: `camelCase`
- Sem `any` — erros sempre tipados
- `async/await` — nunca callbacks
- Imports com `.js` extension (NodeNext)

## Como adicionar novo formato de relatório

1. `src/commons/types/job.types.ts` → adicionar no enum `ReportFormat`
2. `src/engines/{formato}/{formato}.engine.ts` → implementar `IReportEngine`
3. `src/engines/engines.module.ts` → registrar o engine
4. `src/core/config/config.service.ts` → adicionar `sqsNovoQueueUrl` no schema
5. `src/workers/handlers/{formato}.worker.ts` → entry point mínimo
6. `package.json` → adicionar script `build:lambda:{formato}`
7. `infra/lib/workers-stack.ts` → adicionar no `WORKER_CONFIGS`
8. `infra/lib/core-stack.ts` → adicionar fila SQS + DLQ
9. `fixtures/templates/{formato}/` → criar template de exemplo

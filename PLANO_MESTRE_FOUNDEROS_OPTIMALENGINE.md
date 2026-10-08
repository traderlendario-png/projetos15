# Plano Mestre — FounderOS + OptimalEngine

Data-base: 2026-09-09

## Estado da Fase 0 — Inventário e Ownership

### FounderOS
- 326 arquivos TypeScript/TSX
- 21 páginas `page.tsx`
- 38 rotas de API
- 61 componentes React
- 104 testes Vitest
- Next.js 14.2.13 / React 18.3.1 / Tailwind 3.4.12
- `better-sqlite3` com WAL
- Runtime de agentes local baseado em Promise (`createRuntime(...).run()`)
- 22 conectores TypeScript
- G-Brain atual ainda é um provider via CLI/local fallback, não o SDK do OptimalEngine
- 33 ocorrências de locale/formatação hardcoded relevantes (`en-US`, datas/números/moeda)

### OptimalEngine
- 343 arquivos `.ex`
- 178 arquivos `.exs`
- 168 testes `_test.exs`
- SDK TypeScript `@optimal-engine/client` v0.2.0
- Adapter Vercel AI SDK v6 em `sdks/typescript/src/adapters/ai-sdk.ts`
- Adapter OpenAI Agents em `sdks/typescript/src/adapters/openai-agents.ts`
- MCP nativo com 10 tools: add_memory, ask, forget_memory, grep, profile, recall, render_context, search, wiki_get, workspaces
- Tenant/Workspace/Scope Envelope/WorkspaceAuthPlug já implementados
- DynamicSupervisor para Session e Memory Session já implementado
- L0 Cache, RRF, bandwidth planner, RocksDB e Leapfrog/Trie Join já presentes
- 15 adapters de conectores
- Migration 046 já cria `jobs` e `dead_letter_jobs`
- `Pipeline.Intake` ainda é GenServer síncrono e dispara trabalhos secundários via `Task.start`
- `DerivationLedgerEntry` é rico em lineage, mas ainda não tem `previous_hash`, `entry_hash`, `merkle_root`, assinatura e `key_id`

## Decisões de ownership

| Domínio | Dono canônico |
|---|---|
| Interface, dashboards, billing, sessão humana | FounderOS / Control Plane |
| Tenant/Org/Workspace de conhecimento | OptimalEngine |
| Memória, RAG, facts, claims, graph, lineage | OptimalEngine |
| Ingestão de conhecimento (Notion, Drive, GitHub, Jira, Slack histórico etc.) | OptimalEngine |
| Google/Meta/TikTok Ads | adport |
| WhatsApp/Instagram/Inbox/HITL | Chatwoot |
| Eventos e atribuição server-side | Jitsu |
| Observabilidade de LLM | Langfuse |
| Work items/cycles/projects | Plane |
| Render de vídeo | Remotion worker |
| Experimentação | GrowthBook |
| Cobrança da nossa SaaS | FounderOS / Stripe |

## Duplicações a remover ou transformar em gateway
- `FounderOS/lib/connectors/notion.ts` x `OptimalEngine/connectors/adapters/notion.ex`
- `FounderOS/lib/connectors/slack.ts` x `OptimalEngine/connectors/adapters/slack.ex`
- `FounderOS/lib/connectors/gbrain.ts` deve ser substituído gradualmente por `@optimal-engine/client`
- `FounderOS/lib/connectors/meta-ads.ts` deve ser aposentado quando adport assumir Ads
- `FounderOS/lib/connectors/whatsapp.ts` deve deixar de ser o canal principal quando Chatwoot assumir Inbox/HITL

## Roadmap completo

### Onda 1 — Fundação do Produto
- [x] 0.1 Inventário estático dos dois repositórios
- [x] 0.2 Definição inicial de ownership por domínio
- [x] 0.3 Identificação dos conectores duplicados principais
- [x] 0.4 Validação do SDK TypeScript, MCP, tenancy, jobs/DLQ e gargalo do Intake
- [x] 1.1 Congelar baseline executável canônico do FounderOS (CI verde; instalação local bloqueada por DNS do ambiente)
- [x] 1.2 Confirmar testes, typecheck e build do FounderOS no CI canônico + parser local 326/326
- [x] 1.3 Confirmar compile/format/testes do OptimalEngine no CI canônico Elixir 1.17.3 / OTP 26.2
- [x] 1.4 Congelar baseline nos SHAs canônicos e registrar limitações locais
- [x] 2.0 Preparar compatibilidade de `params/searchParams` e `serverExternalPackages` para Next 15/16
- [x] 2.1a Preparar APIs assíncronas (`params/searchParams`) e `serverExternalPackages`
- [x] 2.1b Gerar candidato Next 15.5.25 + lockfile consistente (`package-lock-only` + `npm ci --dry-run` PASS)
- [ ] 2.1c Gate Next 15 em runner com npm: `npm ci` + testes + typecheck + build (não executado; o candidato Next 16 agora o substitui como alvo de promoção)
- [x] 2.1d-a Migrar fonte Next 15 → Next 16.3.4 + `middleware` → `proxy`
- [x] 2.1d-b Atualizar Node >=20.9, AGENTS version-aware e lockfile Next 16; `package-lock-only` + `npm ci --dry-run` offline PASS
- [x] 2.1d-c Scan estático Next 16: 326/326 TS/TSX, sem APIs removidas detectadas + smoke do access gate PASS
- [x] 2.1d-d Gate runtime Next 16 no GitHub Actions canônico: `npm ci` + Vitest + typecheck + production build PASS no commit `040efdd6…`
- [x] 2.2a Preparar React 18 → React/ReactDOM 19.2.8 + tipos React 19 no candidato
- [x] 2.2b Confirmar React 19 por Vitest/typecheck/build no gate runtime Next 16 (2.1d-d)
- [x] 2.3a Migrar fonte/configuração Tailwind 3 → 4.3.3 (CSS-first `@theme`, PostCSS dedicado, utilitários renomeados)
- [x] 2.3b Regenerar/prunar lockfile Tailwind 4 offline + `npm ci --dry-run --offline` PASS
- [x] 2.3c Scan estático Tailwind 4: 325 TS/TSX, 0 erros sintáticos; CSS parse 0 erros; removidos/deprecated scan limpo
- [ ] 2.3d Gate runtime/visual Tailwind 4: runtime `npm ci` + Vitest + typecheck + build PASS no GitHub Actions; visual regression dos 6 temas ainda pendente
- [x] 2.4a Introduzir PostgreSQL como banco canônico do SaaS Control Plane, separado do legado SQLite e da persistência do OptimalEngine
- [x] 2.4b Criar foundation `User → Organization → Membership → WorkspaceBinding → RegionalPreferences → Plans/Subscriptions`
- [x] 2.5a Introduzir Drizzle ORM 0.45.2 + postgres.js 3.4.9 com versões pinadas
- [x] 2.5b Criar migration runner determinístico com checksum SHA-256 e histórico em `control_plane.schema_migrations`
- [x] 2.5c Criar migration `0001_foundation.sql`, Docker local e health endpoint
- [x] 2.5d Endurecer separação owner/app: `DATABASE_MIGRATION_URL`, role local não-owner e migration standalone-safe com `schema_migrations`
- [ ] 2.5e Gate PostgreSQL vivo: aplicar 0001 com owner, bootstrap com app role e provar isolamento RLS entre duas organizações
- [x] 2.6a Ativar PostgreSQL RLS como segunda barreira por organização + `SET LOCAL` request scope
- [x] 2.6b Criar bootstrap atômico de organização/owner/role e binding opcional para tenant/workspace do OptimalEngine
- [x] 2.6c Implementar identidade humana provider-neutral + sessão opaca PostgreSQL → actor/org/workspace
- [x] 2.6d Implementar enforcement RBAC (owner/admin/operator/viewer + `app.read/app.write` + permissões sensíveis por rota/ação)
- [x] 2.6e Implementar convites, troca de organização/workspace, gestão de role/status e audit append-only de acesso
- [ ] 2.6f Gate RBAC vivo em PostgreSQL: owner/invite/viewer/read-only/session revocation + testes completos
- [ ] 2.7 Aposentar SQLite por domínio conforme cada módulo for reconstruído; sem big-bang migration
- [x] 3.1 Criar contrato i18n do produto (catálogos, provider, resolução por request e formatadores `Intl`) sem acoplar domínio a uma biblioteca
- [ ] 3.1b Adicionar `next-intl` 4.x atrás do contrato atual quando o runner com registry puder regenerar/testar o lockfile; compatibilidade Next 16/React 19 já validada upstream
- [x] 3.2 Criar catálogos `pt-BR`, `pt-PT`, `es-419`, `en-US` com paridade automática (105 chaves nesta fase)
- [x] 3.3 Remover hardcodes de formatter `en-US` no app/components/lib e migrar formatação crítica de número/data/moeda para contexto regional
- [x] 3.4 Separar locale, country, timezone, currency e first-day-of-week; preferência do usuário sobre default da organização
- [x] 3.4b Criar presets de lançamento BR/PT/MX/CO/AR/CL/PE/US e validação de timezone IANA sem acoplar locale a geografia
- [x] 3.5a Persistir preferências individuais em PostgreSQL com self-only RLS + locale cookie não-sensível para troca imediata
- [x] 3.5b Internacionalizar shell, navegação, command palette, temas, Conductor, login/convite e formatadores críticos
- [x] 3.5b-verify Criar `i18n:verify` + testes de locale/catalog; 4 catálogos com 105 chaves e 0 formatter bypasses
- [x] 3.5b-runtime Preparar hardening 7B: locale switch em request único sem 401 esperado, persistência PostgreSQL best-effort autenticada, analytics/calendário no locale ativo, `withControlPlaneScope<T>` sem `any` e `turbopack.root` explícito
- [x] 3.5b-coverage Criar inventário AST reproduzível de copy de UI; baseline 7B = 64/748 callsites catalog-backed (8,6%) e 684 candidatos hardcoded em `app/` + `components/`
- [x] 3.5b-coverage-decision Registrar decisão explícita: não traduzir a UI legada antes do Axiom; preservar o baseline e exigir que cada superfície Axiom nova nasça em `pt-BR`, `pt-PT`, `es-419` e `en-US`
- [x] 3.5b-live-gate Preparar prova real login → locale → PostgreSQL: dev-login, cookie opaco, `user_preferences`, reidratação de sessão; adicionar job PostgreSQL 18 com migrations + RLS/RBAC/i18n live probes
- [x] 3.5b-runtime-ci CI canônico 7B PASS no run `37723669006`: `npm ci`, **115 arquivos / 968 testes**, i18n verify/coverage, typecheck, build, PostgreSQL migrations, RLS live, RBAC live e i18n live
- [ ] 3.5c Migrar copy das telas legadas para os catálogos durante o redesign Axiom (evita traduzir duas vezes UI que será substituída)
- [ ] 3.5d Normalizar/validar telefone E.164 nos domínios CRM/Inbox durante a reconstrução dos módulos
- [ ] 4.1 Criar Axiom Design System
- [ ] 4.2 Integrar shadcn/ui como primitives
- [ ] 4.3 Integrar Xyflow para Agent/Intelligence Graph
- [ ] 4.4 Integrar Motion para microinterações
- [ ] 4.5 Integrar Tremor seletivamente para analytics
- [ ] 4.6 Reconstruir shell, sidebar, command palette e context tabs
- [ ] 4.7 Criar layouts premium de Dashboard, Marketing, Agents, Knowledge, Approvals e Health

### Onda 2 — Integração e Enterprise Core
- [ ] 5.1 Adicionar `@optimal-engine/client` ao FounderOS
- [ ] 5.2 Criar `OptimalEngineProvider` HTTP autenticado
- [ ] 5.3 Substituir o G-Brain provider nas buscas pela API/SDK do OptimalEngine
- [ ] 5.4 Injetar `optimalEngineTools()` nos chats do Vercel AI SDK
- [ ] 5.5 Propagar tenant/workspace/actor em todas as chamadas
- [ ] 5.6 Criar contratos de erro, timeout e tracing entre os dois sistemas
- [ ] 5.7 Manter MCP para clientes/agentes externos, não como transporte web principal
- [ ] 6.1 Racionalizar conectores e remover leitura duplicada
- [ ] 6.2 Criar catálogo único de integrações e ownership
- [ ] 6.3 Toda ação externa deve emitir Signal/Audit no OptimalEngine
- [ ] 7.1 Implementar Job Store API sobre as tabelas `jobs` já existentes
- [ ] 7.2 Implementar claim/lease/heartbeat/retry/idempotency
- [ ] 7.3 Ativar replay da `dead_letter_jobs`
- [ ] 7.4 Migrar `Task.start` crítico para durable jobs
- [ ] 8.1 Migrar `Pipeline.Intake` para Broadway/GenStage
- [ ] 8.2 Particionar demanda por workspace/tenant
- [ ] 8.3 Backpressure, rate limit adaptativo e concorrência configurável
- [ ] 8.4 Integrar quarantine + DLQ + telemetry
- [ ] 9.1 Supervisor de execuções de agentes
- [ ] 9.2 Heartbeat, timeout, cancelamento e isolamento
- [ ] 9.3 Circuit breakers para serviços externos
- [ ] 10.1 Canonicalização do Ledger
- [ ] 10.2 `previous_hash` + `entry_hash`
- [ ] 10.3 Merkle checkpoints
- [ ] 10.4 Assinatura Ed25519/KMS e rotação de chaves
- [ ] 10.5 Verificador de integridade e UI de prova
- [ ] 10.6 Política LGPD para não tornar PII impossível de excluir

### Onda 3 — Marketing Operating System
- [ ] 11.1 Marketing Command Center premium
- [ ] 11.2 Campaign como objeto central
- [ ] 11.3 CRM/pipeline e views inspirados no marketing-dashboard/Twenty sem colar UIs
- [ ] 11.4 Context versionado, AI Sessions, Artifacts e VoC inspirados no Quiver
- [ ] 12.1 Integrar adport
- [ ] 12.2 Preview/policy/approval/apply/audit para Ads
- [ ] 13.1 Integrar Chatwoot
- [ ] 13.2 Inbox unificada e handoff Agent → Humano
- [ ] 14.1 Integrar Jitsu
- [ ] 14.2 Modelo de eventos e atribuição
- [ ] 15.1 Integrar Langfuse
- [ ] 15.2 Custos, tracing, evals e latência por tenant/agent
- [ ] 16.1 Integrar Plane por API
- [ ] 17.1 Remotion Creative Worker
- [ ] 17.2 Templates 9:16 / 1:1 / 16:9 + approval + publishing
- [ ] 18.1 GrowthBook experiments
- [ ] 18.2 Loop insight → experiment → result → Fact

### Onda 4 — Escala LATAM e Global
- [ ] 19.1 Brasil como primeira configuração comercial
- [ ] 19.2 México e Colômbia
- [ ] 19.3 Argentina, Chile e Peru
- [ ] 19.4 Portugal / `pt-PT`
- [ ] 19.5 English / `en-US`
- [ ] 20.1 Multi-currency: BRL, MXN, COP, ARS, CLP, PEN, USD, EUR
- [ ] 20.2 Country-specific tax/billing adapters onde necessário
- [ ] 20.3 Data residency e regional deployment strategy
- [ ] 21.1 SSO/SAML/OIDC
- [ ] 21.2 SCIM
- [ ] 21.3 KMS/secrets manager
- [ ] 21.4 Disaster recovery, restore drills e offsite backups
- [ ] 21.5 Audit export, retention e compliance controls
- [ ] 21.6 Observabilidade p95/p99, SLOs e incident management
- [ ] 22.1 Planos, metering, billing e limites por tenant
- [ ] 22.2 White-label/enterprise deployment se comercialmente necessário

## Próxima ação imediata
A Fase 7B está tecnicamente **verde no GitHub Actions**. O run `37723669006` provou os dois jobs: `verify` e `control-plane-live`.

Evidência consolidada:
- `npm ci` PASS;
- **115 test files / 968 tests PASS**;
- `i18n:verify` PASS — 4 locales, 105 chaves/catalog e 0 formatter bypasses;
- `i18n:coverage` PASS — **64/748 callsites catalog-backed (8,6%) e 684 candidatos hardcoded**;
- TypeScript PASS;
- Next.js 16.3.4 production build PASS;
- PostgreSQL 18 + migrations PASS;
- RLS vivo PASS: isolamento de leitura por organização, diretório de usuários e bloqueio de escrita cross-tenant;
- RBAC vivo PASS: owner, invitation, viewer read-only;
- i18n vivo PASS: anônimo cookie-only, dev-login, cookie de sessão, persistência `user_preferences` e reidratação de sessão em `es-419`.

O gate vivo encontrou e corrigiu ainda dois defeitos que a análise estática não mostrava: binding direto de `Date` em prepared statements de sessão/convite e dependência implícita de `cookies()` fora do request store na prova direta da rota. Os dois estão cobertos pelo CI final.

Decisão explícita sobre o débito de tradução: a UI legada permanece com baseline mensurável de **684 candidatos hardcoded** e será migrada junto da reconstrução Axiom, evitando traduzir superfícies que serão substituídas. O smoke visual dos quatro locales e a regressão visual dos seis temas passam a ser gates da própria Fase 8, sobre o novo shell, e não bloqueiam o início do redesign. As **11 vulnerabilidades npm (4 moderadas, 4 altas, 3 críticas)** ficam como gate obrigatório antes de produção e devem ser triadas sem `npm audit fix --force` às cegas.

**Próxima ação:** promover o PR #1 `phase7b-runtime-hardening → main`. Depois do merge, encerrar formalmente a Fase 7B e iniciar a **Fase 8 — Axiom Design System Premium + novo application shell**.

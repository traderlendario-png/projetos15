# Fase 7B — Runtime Hardening do FounderOS

Data-base: 2026-09-10  
Atualizado: 2026-10-08  
Repositório canônico: `traderlendario-png/projetos15`  
Base canônica observada: `main@040efdd6facbec2a92b56f0a694425e44e2e081a`  
Status: **CI canônico da Fase 7B verde; PR #1 pronto para promoção**

## Por que a 7B existe

A Fase 7 fechou a fundação de internacionalização, PostgreSQL/RLS e RBAC, mas a execução real revelou quatro pontos de hardening que não devem ser carregados para o redesign Axiom:

1. o seletor de idioma fazia dois requests: o segundo era um `PATCH /api/control-plane/me/preferences` autenticado e gerava `401` esperado em modo anônimo/auth disabled;
2. `HomeSocialGraph` e `WeekCalendar` receberam hotfixes de compilação presos ao locale default, em vez de consumir o locale ativo;
3. `withControlPlaneScope<T>` foi temporariamente afrouxado com `any` para contornar o tipo condicional de `postgres.js begin<T>`;
4. o Turbopack não tinha uma raiz explícita do projeto.

A 7B resolve esses quatro pontos e acrescenta os dois gates que faltavam no diagnóstico real: cobertura AST de copy e prova viva login → locale → PostgreSQL antes da Fase 8.

## Evidência real da base no GitHub

A `main` canônica já executou um GitHub Actions real no run `34476459783`, job `102868310050`, em Node `22.23.2` / npm `10.9.8`:

- `npm ci` — PASS;
- Vitest — **113 test files / 961 tests PASS**;
- `npm run typecheck` (`tsc --noEmit`) — PASS;
- `npm run build` — PASS;
- Next.js `16.3.4` / Turbopack — compilação de produção PASS.

Isso fecha os antigos gates runtime de Next 16 e React 19. O gate Tailwind 4 continua parcialmente aberto porque ainda falta a regressão visual dos seis temas.

### Observações do CI que não foram escondidas

O `npm ci` da execução final da 7B reportou **11 vulnerabilidades** no grafo instalado: 4 moderadas, 4 altas e 3 críticas. O log de instalação não contém o detalhamento de `npm audit`, portanto esta fase não tenta adivinhar os pacotes afetados. Isso não bloqueia o redesign Axiom, mas **bloqueia produção** até existir triagem explícita de advisories, dependências transitivas e versões corrigidas.

O build também concluiu com 8 warnings de tracing dinâmico de filesystem, principalmente em fluxos legados de statement/PDF, Obsidian, WhatsApp e credenciais. Não quebram a build atual, mas devem ser eliminados durante a racionalização dos conectores.

## Os 6 erros reais de TypeScript encontrados no primeiro runtime

O primeiro `npx tsc --noEmit` executado no Windows encontrou **6 erros em 4 arquivos**:

1. `components/HomeSocialGraph.tsx:297` — `TS2304`, `fmtNum` não existia no escopo do modal;
2. `components/WeekCalendar.tsx:199` — `TS2304`, `fmtTime` não existia no escopo de `EventBlock`;
3. `lib/control-plane/scope.ts:21` — `TS2322`, `UnwrapPromiseArray<T>` do `postgres.js begin<T>` não era atribuível ao genérico arbitrário `T`;
4. `tests/control-plane-config.test.ts:15` — `TS2352`, cast direto de objeto parcial para `NodeJS.ProcessEnv`;
5. `tests/control-plane-config.test.ts:38` — o mesmo `TS2352`;
6. `tests/control-plane-config.test.ts:51` — o mesmo `TS2352`.

Os hotfixes locais fizeram `tsc` e `next build` passarem, mas dois deles eram frágeis: `HomeSocialGraph`/`WeekCalendar` foram amarrados ao locale default e `scope.ts` foi afrouxado com `any`. A 7B substitui esses atalhos por `useI18n()` ativo e preservação real do genérico do `postgres.js`. Os três casts de teste permanecem explicitamente como `as unknown as NodeJS.ProcessEnv`, que é a forma intencional de construir fixtures parciais diante do `ProcessEnv` ampliado pelo Next 16.

## Mudanças implementadas

### 1. Locale switch em um único request

`components/i18n/LocaleSwitcher.tsx` agora chama apenas:

`POST /api/i18n/locale`

O endpoint continua público e grava o cookie de apresentação. No mesmo request, ele tenta resolver uma sessão humana:

- sem sessão: retorna `200`, `persisted: false`, cookie válido;
- com sessão: persiste `locale` em `control_plane.user_preferences` e retorna `persisted: true`;
- falha da persistência opcional: mantém o cookie e retorna `200`, evitando transformar preferência visual em indisponibilidade do produto.

A persistência autenticada continua passando por `updateUserPreferences`, portanto preserva validação, RLS self-only e audit log já existentes.

### 2. Analytics e calendário no locale ativo

`components/HomeSocialGraph.tsx` deixa de depender de `DEFAULT_LOCALE` para o modal expandido. Tanto o card quanto o modal formatam números pelo `I18nProvider` ativo.

`components/WeekCalendar.tsx` deixa de usar helper global preso ao default. `EventBlock` consome `useI18n()` e formata horários no locale/timezone efetivos da sessão/request.

### 3. PostgreSQL scope sem `any`

`lib/control-plane/scope.ts` volta a manter o tipo real de `postgres.TransactionSql`.

O detalhe importante é o contrato de tipos do `postgres.js 3.4.9`: `begin<T>` retorna `UnwrapPromiseArray<T>`. Se o callback devolve diretamente um genérico `T`, TypeScript não consegue provar que `UnwrapPromiseArray<T>` é sempre `T` para arrays/tuples.

A solução usada é estrutural e sem cast:

```ts
const result = await sql.begin(async (tx) => {
  // SET LOCAL / set_config...
  return { value: await fn(tx) };
});
return result.value;
```

Como o retorno do callback passa a ser um objeto, o tipo condicional não transforma `T`.

### 4. Raiz explícita do Turbopack

`next.config.mjs` agora deriva uma raiz absoluta da própria localização do arquivo:

```js
const projectRoot = dirname(fileURLToPath(import.meta.url));
```

E configura:

```js
turbopack: { root: projectRoot }
```

Isso evita depender de `process.cwd()` e reduz ambiguidade quando existe outro lockfile acima do repositório.

### 5. Verificação de regressão

`scripts/verify-i18n.mjs` passou a verificar também os contratos da 7B:

- switcher sem segundo PATCH;
- endpoint unificado com sessão/persistência opcional;
- ausência de `any` no scope PostgreSQL;
- ausência de default-locale bypass nos dois componentes;
- raiz explícita do Turbopack;
- presença do scanner AST e do probe PostgreSQL vivo.

Foram adicionados dois arquivos de teste:

- `tests/i18n-runtime-hardening.test.ts` — 3 casos de contrato;
- `tests/i18n-locale-route.test.ts` — 4 casos do endpoint real/mocado.

### 6. Inventário AST de cobertura real de tradução

Foi criado `npm run i18n:coverage`, baseado na API AST do TypeScript. Ele mede **callsites de UI**, não apenas paridade de catálogo. A heurística conta:

- chamadas estáticas `t()`/`translate()` com chave literal como copy catalogada;
- JSX text, `placeholder`, `title`, `aria-label`, `alt`, campos de objeto de apresentação e diálogos como candidatos hardcoded;
- exclui URLs, paths, métodos HTTP, nomes de arquivo e outros padrões técnicos óbvios.

Resultado reproduzido sobre o candidato 7B atual em `app/` + `components/`:

- **748** callsites elegíveis estimados;
- **64** callsites catalogados;
- **684** candidatos hardcoded;
- cobertura heurística global: **8,6%**.

Esse número é deliberadamente chamado de *heurístico*: ele é uma métrica de inventário estático, não uma afirmação de que 91,4% de todo texto percebido por um humano está necessariamente sem tradução. O comando aceita `--json=...`.

As dez rotas levantadas no runtime anterior ficaram assim:

| Rota | Hardcoded candidatos | Catálogo detectado | Cobertura heurística |
|---|---:|---:|---:|
| `/brain` | 170 | 0 | 0% |
| `/comms` | 17 | 0 | 0% |
| `/finances` | 34 | 0 | 0% |
| `/funnel` | 47 | 0 | 0% |
| `/integrations` | 14 | 0 | 0% |
| `/personas` | 15 | 0 | 0% |
| `/roadmap` | 7 | 0 | 0% |
| `/skills` | 6 | 0 | 0% |
| `/tasks` | 6 | 0 | 0% |
| `/workflows` | 17 | 0 | 0% |

A decisão consciente é **não traduzir toda a UI legada antes do Axiom**: essas superfícies serão substituídas/reconstruídas na Fase 8 e traduzir a copy antiga agora criaria trabalho descartável. O débito deixa de ser invisível: 684 candidatos ficam registrados como baseline, e cada superfície Axiom nova continua obrigada a nascer nos quatro locales.

### 7. Prova login → locale → PostgreSQL

Além dos testes unitários/contratuais, foi criado `scripts/verify-i18n-live.ts`, que executa contra PostgreSQL real:

1. bootstrap de organização;
2. locale anônimo com cookie-only;
3. **dev-login real**;
4. captura do cookie de sessão;
5. troca para `es-419`;
6. leitura de `control_plane.user_preferences`;
7. `resolveUserSession` para confirmar `regional.locale = es-419`;
8. cleanup.

O job `control-plane-live` no GitHub Actions sobe PostgreSQL 18, cria role não-owner, aplica migrations, executa o RLS live probe, o RBAC live probe e o novo i18n live probe.

A suíte esperada da branch passa de 113/961 na base para **115 arquivos / 968 testes**. Esse número só vira evidência real quando o GitHub Actions da branch/PR concluir.

## Gates executados antes do CI da branch

- `node scripts/verify-i18n.mjs` — **PASS**;
- `node scripts/verify-control-plane.mjs` — **PASS**;
- `node scripts/verify-rbac.mjs` — **PASS**;
- parser TypeScript/TSX global — **385 arquivos / 0 erros sintáticos**;
- probe do genérico `postgres.js begin<T>` — **PASS**;
- `npm run i18n:coverage` — **PASS**, 64/748 catalog-backed (8,6%), 684 candidatos hardcoded.

## Evidência real do CI canônico da 7B

O run final **37723669006** ficou verde nos dois jobs.

### Job `verify`

- `npm ci` — PASS;
- Vitest — **115 test files / 968 tests PASS**;
- `npm run i18n:verify` — PASS, 4 locales, 105 chaves/catalog, placeholder parity, boundary regional/RLS, contratos 7B e 0 formatter bypasses;
- `npm run i18n:coverage` — PASS, **64/748 callsites catalog-backed (8,6%) / 684 candidatos hardcoded**;
- `npm run typecheck` — PASS;
- `npm run build` — PASS em Next.js 16.3.4/Turbopack;
- geração estática — 17/17 páginas;
- build ainda registra os 8 warnings legados de filesystem tracing já documentados.

### Job `control-plane-live`

- PostgreSQL 18 container — PASS;
- criação da role de aplicação não-owner — PASS;
- migrations 0001/0002/0003 — PASS;
- RLS live — **organizationReadIsolation PASS, userDirectoryIsolation PASS, crossTenantWriteIsolation PASS**;
- RBAC live — **owner PASS, invitation PASS, viewerReadOnly PASS**;
- i18n live — **anonymousCookieOnly PASS, devLoginSessionCookie PASS, authenticatedPersistence PASS, databasePreference PASS, sessionRehydrate PASS**.

### Bugs adicionais encontrados pelo gate vivo e corrigidos

O primeiro job vivo revelou que o `postgres.js 3.4.9` estava recebendo objetos `Date` em inserts preparados de `user_sessions.expires_at` e `invitations.expires_at`, causando `ERR_INVALID_ARG_TYPE` no binding. A 7B passou a bindar esses timestamps como ISO 8601, mantendo as colunas `timestamptz`.

O segundo ciclo revelou que chamar `cookies()` de `next/headers` fora de um request store impedia o probe direto da rota. A rota de locale foi endurecida para resolver a sessão a partir de `req.cookies.get(SESSION_COOKIE)`, usando `resolveUserSession`. Isso torna a dependência de sessão explícita no próprio `NextRequest` e deixou o fluxo real testável.

### Gates de produto conscientemente adiados

O **smoke visual browser dos quatro locales** e a **regressão visual dos seis temas** ficam acoplados ao início da Fase 8, porque o Axiom substituirá o shell e várias telas legadas. Executá-los agora como aprovação visual da UI que será descartada geraria evidência de baixo valor. A regra continua: toda superfície Axiom nova deve nascer e ser validada nos quatro locales e nos temas suportados.

A triagem das 11 vulnerabilidades npm é **gate de produção**, não gate de início do redesign.

## Publicação da branch

Em 2026-10-08 a escrita via conector GitHub funcional foi restabelecida. A branch `phase7b-runtime-hardening` foi criada a partir de `main@040efdd6facbec2a92b56f0a694425e44e2e081a` e recebeu a implementação da 7B. A `main` continua intacta.

## Arquivos alterados pela 7B

- `app/api/i18n/locale/route.ts`
- `components/i18n/LocaleSwitcher.tsx`
- `components/HomeSocialGraph.tsx`
- `components/WeekCalendar.tsx`
- `lib/control-plane/scope.ts`
- `next.config.mjs`
- `scripts/verify-i18n.mjs`
- `tests/i18n-runtime-hardening.test.ts`
- `tests/i18n-locale-route.test.ts`
- `scripts/i18n-coverage.mjs`
- `scripts/verify-i18n-live.ts`
- `.github/workflows/ci.yml`
- `package.json`
- `PLANO_MESTRE_FOUNDEROS_OPTIMALENGINE.md`
- `FASE_7B_RUNTIME_HARDENING_REPORT.md`

## Próximo passo

Promover o PR #1 `phase7b-runtime-hardening → main`. Com CI real verde e os gates visuais conscientemente transferidos para a reconstrução Axiom, a Fase 7B pode ser encerrada após o merge. Em seguida, iniciar a Fase 8 — Axiom Design System Premium + novo application shell.

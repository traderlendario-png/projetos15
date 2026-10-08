# Fase 7B — Runtime Hardening do FounderOS

Data-base: 2026-09-10  
Atualizado: 2026-10-08  
Repositório canônico: `traderlendario-png/projetos15`  
Base canônica observada: `main@040efdd6facbec2a92b56f0a694425e44e2e081a`  
Status: **branch de promoção publicada; aguardando CI canônico da 7B**

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

O `npm ci` reportou **5 vulnerabilidades** no grafo instalado: 3 moderadas, 1 alta e 1 crítica. O log não contém o detalhamento de `npm audit`, portanto esta fase não tenta adivinhar os pacotes afetados. Antes de produção deve existir um gate explícito de auditoria/triagem de dependências.

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

- **745** callsites elegíveis estimados;
- **64** callsites catalogados;
- **681** candidatos hardcoded;
- cobertura heurística global: **8,6%**.

Esse número é deliberadamente chamado de *heurístico*: ele é uma métrica de inventário estático, não uma afirmação de que 91,4% de todo texto percebido por um humano está necessariamente sem tradução. O comando aceita `--json=...`.

As dez rotas levantadas no runtime anterior ficaram assim:

| Rota | Hardcoded candidatos | Catálogo detectado | Cobertura heurística |
|---|---:|---:|---:|
| `/brain` | 170 | 0 | 0% |
| `/comms` | 14 | 0 | 0% |
| `/finances` | 34 | 0 | 0% |
| `/funnel` | 47 | 0 | 0% |
| `/integrations` | 14 | 0 | 0% |
| `/personas` | 15 | 0 | 0% |
| `/roadmap` | 7 | 0 | 0% |
| `/skills` | 6 | 0 | 0% |
| `/tasks` | 6 | 0 | 0% |
| `/workflows` | 17 | 0 | 0% |

A decisão consciente é **não traduzir toda a UI legada antes do Axiom**: essas superfícies serão substituídas/reconstruídas na Fase 8 e traduzir a copy antiga agora criaria trabalho descartável. O débito deixa de ser invisível: 681 candidatos ficam registrados como baseline, e cada superfície Axiom nova continua obrigada a nascer nos quatro locales.

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
- `npm run i18n:coverage` — **PASS**, 64/745 catalog-backed (8,6%), 681 candidatos hardcoded.

## Gates que o GitHub Actions da 7B precisa provar

- `npm ci`;
- **115 test files / 968 tests**;
- `npm run i18n:verify`;
- `npm run i18n:coverage`;
- `npm run typecheck`;
- `npm run build`;
- migrations PostgreSQL;
- isolamento RLS vivo;
- RBAC/sessão vivos;
- login → locale → `user_preferences` → sessão reidratada.

Fora do CI de código ainda permanecem como gates de produto:

- smoke browser em `pt-BR`, `pt-PT`, `es-419`, `en-US`;
- regressão visual dos 6 temas;
- triagem das 5 vulnerabilidades npm antes de produção.

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

Abrir o PR `phase7b-runtime-hardening → main`, executar o CI canônico completo e corrigir qualquer regressão encontrada. A Fase 8 continua congelada até a 7B ter evidência verde ou uma pendência conscientemente adiada e documentada.

# Fase 7 — Internacionalização Global do FounderOS

Data: 2026-09-10 (America/Sao_Paulo)  
Base: `FounderOS-PHASE6-IDENTITY-RBAC-CANDIDATE.zip`  
Resultado: **candidato de engenharia da camada i18n/regionalização**

## Objetivo

Preparar o FounderOS para operar desde a fundação em Brasil, Portugal, LATAM e inglês, sem acoplar idioma a país, moeda ou fuso horário e sem duplicar tenancy ou memória do OptimalEngine.

## Locales de lançamento

- `pt-BR` — Português (Brasil), default do produto
- `pt-PT` — Português (Portugal)
- `es-419` — Español (Latinoamérica), catálogo mestre LATAM
- `en-US` — English (United States)

Tags espanholas específicas (`es-MX`, `es-CO`, `es-AR`, `es-CL`, `es-PE` etc.) resolvem inicialmente para `es-419`. A arquitetura permite criar variantes nacionais depois sem alterar contratos de domínio.

## O que foi implementado

### 1. Core i18n adapter-friendly

Criados/ativados:

- `lib/i18n/locales.ts`
- `lib/i18n/catalog.ts`
- `lib/i18n/format.ts`
- `lib/i18n/server.ts`
- `components/i18n/I18nProvider.tsx`
- `components/i18n/LocaleSwitcher.tsx`

A interface de produto usa um contrato próprio sobre `Intl`, evitando espalhar dependência de framework por domínio e componentes. Isso mantém a porta aberta para `next-intl` sem reescrever a aplicação.

### 2. Quatro catálogos com paridade obrigatória

Criados:

- `lib/i18n/messages/pt-BR.json`
- `lib/i18n/messages/pt-PT.json`
- `lib/i18n/messages/es-419.json`
- `lib/i18n/messages/en-US.json`

Estado atual: **105 chaves por catálogo**, com verificação de:

- mesmo conjunto de chaves;
- strings não vazias;
- paridade dos placeholders `{name}` entre traduções.

Shell, navegação, command palette, temas, Orquestrador/Conductor, login, acesso pendente e convite já usam o catálogo.

### 3. Idioma, país, moeda e timezone são independentes

Contrato `RegionalSettings`:

- `locale`
- `country`
- `currency`
- `timezone`
- `firstDayOfWeek`

Exemplos suportados:

- `locale=en-US`, `country=BR`, `currency=BRL`, `timezone=America/Sao_Paulo`
- `locale=es-419`, `country=CO`, `currency=COP`, `timezone=America/Bogota`

Foram adicionados presets de lançamento para:

- Brasil — BRL / America/Sao_Paulo
- Portugal — EUR / Europe/Lisbon
- México — MXN / America/Mexico_City
- Colômbia — COP / America/Bogota
- Argentina — ARS / America/Argentina/Buenos_Aires
- Chile — CLP / America/Santiago
- Peru — PEN / America/Lima
- Estados Unidos — USD / America/New_York

Os presets são sugestões de onboarding; não criam acoplamento entre idioma e geografia.

### 4. Validação de timezone

Preferências de timezone passam a ser validadas como identificadores IANA antes de persistir. Valores inválidos caem para o default seguro na leitura e são rejeitados no patch de preferência do usuário.

### 5. Preferências individuais PostgreSQL + RLS

Migration:

`db/control-plane/0003_i18n_preferences.sql`

Tabela:

`control_plane.user_preferences`

Campos opcionais permitem sobrepor a apresentação por usuário sem mudar as preferências canônicas da organização. A tabela usa RLS self-only com `control_plane.current_actor_id()`.

SHA-256 atual da migration 0003:

`9dc83f2b4cec6478b4fa678fbe1cd91817e801b9c096a1d184881fdaebbb047a`

Precedência:

- locale imediato: cookie → user preference → organization → Accept-Language → pt-BR
- country/currency/timezone/first-day: user → organization → default

### 6. Locale switch sem elevar privilégio

`POST /api/i18n/locale` grava apenas o cookie de apresentação `founderos.locale`.

Para usuário autenticado, o switcher tenta persistir em:

`PATCH /api/control-plane/me/preferences`

Foi corrigido um detalhe de RBAC desta fase: a rota de preferências pessoais não fica presa ao gate legado `app.write`. Assim um `viewer` pode mudar o próprio idioma/formatos, mas a rota continua exigindo sessão real e a RLS permite alterar apenas o próprio registro.

### 7. Trust boundary regional no proxy

`proxy.ts` sobrescreve e propaga:

- `x-founder-locale`
- `x-founder-country`
- `x-founder-currency`
- `x-founder-timezone`
- `x-founder-first-day-of-week`

Valores enviados pelo browser com esses nomes não são tratados como fonte confiável.

### 8. Shell multilíngue

Migrados para a camada i18n:

- Sidebar
- Topbar/breadcrumbs
- Command Palette
- seletor de tema
- Conductor/Orquestrador
- login
- access pending
- accept invite
- locale switcher
- atributo `<html lang>`

`G-Brain` já passa a ser apresentado como Conhecimento / Knowledge / Conocimiento, e `Doctor` como Saúde do sistema / System health / Salud del sistema.

### 9. Formatação regional centralizada

Foi removido o bypass direto de `toLocaleString`, `toLocaleDateString`, `toLocaleTimeString`, `Intl.NumberFormat` e `Intl.DateTimeFormat` das superfícies em `app/`, `components/` e `lib/` fora do core i18n.

Foram migrados, entre outros:

- Finances
- Analytics
- Funnel
- Social audience/history
- newsletters/Beehiiv
- Knowledge client roster
- statement uploader
- workflow monetary metrics
- agent activity timestamps
- weekly calendar
- connector status numeric details

Valores denominados em USD continuam USD; o locale muda apenas a apresentação. O SpeechRecognition do Brain Dump agora acompanha o locale selecionado.

### 10. Conductor e contexto de tela

`screenTitleFor` e `/api/conductor/context` recebem o locale da requisição, mantendo o título apresentado ao usuário alinhado ao contexto enviado ao agente.

### 11. Testes e verificador adicionados

Criados:

- `scripts/verify-i18n.mjs`
- `tests/i18n-locales.test.ts`
- `tests/i18n-catalog.test.ts`
- `docs/architecture/i18n.md`

Novo script:

`npm run i18n:verify`

Ele exige 4 locales, paridade de catálogo/placeholders, presets LATAM, migration/RLS, trust-boundary regional, provider no layout e **zero formatter bypass** fora de `lib/i18n`.

## Decisão sobre `next-intl`

O `next-intl` 4.x foi validado como compatível com Next.js 16 e React 19, mas não foi inserido manualmente no lockfile sem registry. O core atual já está isolado atrás de uma API própria; quando um runner com acesso ao npm estiver disponível, `next-intl` pode ser instalado e integrado por adapter sem contaminar o domínio.

## Gates executados nesta fase

- `node scripts/verify-i18n.mjs` → **PASS**
  - 4 locales
  - 105 chaves/catalog
  - placeholder parity PASS
  - launch region presets PASS
  - migration/RLS/boundary PASS
  - formatter bypasses: 0
- parser TypeScript/TSX global → **384 arquivos / 0 erros sintáticos**
- `node scripts/verify-control-plane.mjs` → **PASS**
- `node scripts/verify-rbac.mjs` → **PASS**
- `npm ci --dry-run --offline --ignore-scripts` → **PASS / 294 packages**
- `npm ci --offline --ignore-scripts` → **BLOCKED**, primeiro pacote ausente do cache: `zod-3.25.76.tgz`

## Gates obrigatórios ainda pendentes antes de produção

Não foram marcados como aprovados sem execução real:

- `npm ci` real
- suíte Vitest completa, incluindo os novos testes i18n
- `tsc --noEmit` semântico
- `next build`
- aplicação da migration 0003 em PostgreSQL real
- RLS live probe com usuários/organizações A/B
- smoke browser dos quatro locales

## Escopo deliberadamente adiado

As telas legadas ainda têm copy em inglês. Elas serão substituídas/reconstruídas na Fase 8; traduzir toda a copy antiga agora criaria uma rodada descartável. A regra congelada é: **cada nova superfície Axiom nasce simultaneamente em pt-BR, pt-PT, es-419 e en-US**.

Também entram nos módulos de CRM/Inbox posteriormente:

- normalização E.164 de telefone;
- variantes espanholas nacionais quando exigidas comercialmente;
- impostos/billing específicos de cada país.

## Próxima fase

**Fase 8 — Axiom Design System Premium + novo application shell.**

Ordem:

1. tokens corporativos e semantic colors;
2. tipografia de UI separada de dados técnicos;
3. primitives acessíveis;
4. sidebar/topbar/workspace switcher novos;
5. command center shell;
6. cards/tables/filters/side panels padronizados;
7. motion tokens e microinterações discretas;
8. skeleton/empty/error/loading states;
9. primeira superfície premium: Intelligence Network / Agents;
10. Dashboard, Marketing, Knowledge, Approvals e Health.

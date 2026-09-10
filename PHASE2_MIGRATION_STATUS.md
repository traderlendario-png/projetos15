# Fase 2 — Modernização do FounderOS

Data: 2026-09-09

## Estado: Next 15 / React 19 — candidato de migração fechado; gate de runtime aguardando instalação completa

Este worktree contém o primeiro salto controlado do FounderOS para a linha Next.js 15 e React 19, sem misturar PostgreSQL, i18n, redesign ou integração com o OptimalEngine.

### Versões pinadas neste gate

- Next.js `15.5.25`
- React `19.2.8`
- React DOM `19.2.8`
- `@types/react` `19.2.18`
- `@types/react-dom` `19.2.7`
- `lucide-react` `0.546.0` (primeira linha selecionada que declara React 19 estável no peer range)
- Node `>=20.0.0` declarado no `package.json`; o CI canônico já usa Node 22.x

### Alterações de compatibilidade já aplicadas

- Request-time dynamic `params` migrados para `Promise<...>` + `await` em todas as rotas dinâmicas detectadas.
- `searchParams` migrados para `Promise<...>` + `await` nas páginas `/org` e `/funnel`.
- Página `/social/[platform]` migrada para async params.
- Testes que invocam handlers/páginas diretamente preparados para contextos assíncronos.
- `experimental.serverComponentsExternalPackages` movido para `serverExternalPackages`.
- `middleware.ts` mantido intencionalmente nesta fase; a troca para `proxy.ts` pertence ao salto Next 16.
- Lockfile regenerado em modo `--package-lock-only --offline` usando o metadata já disponível no cache local.

### Gates que passaram neste ambiente

- `package.json` e `package-lock.json`: JSON válido.
- `npm install --package-lock-only --offline --ignore-scripts`: **PASS**.
- `npm ci --ignore-scripts --dry-run --offline`: **PASS**, 345 pacotes no plano de instalação.
- Parser TypeScript global: **326/326** arquivos `.ts/.tsx` parseados, zero erro sintático.
- Scan de request APIs: zero uso detectado de `cookies()`, `headers()` ou `draftMode()` síncronos.
- Scan de `params/searchParams`: zero assinatura provável remanescente como objeto síncrono.
- Scan React 19: zero ocorrência detectada de `ReactDOM.render`, `findDOMNode`, `React.createFactory` ou APIs legadas selecionadas.
- Scan Next: zero `experimental-edge`, zero `serverComponentsExternalPackages` antigo e zero uso de `NextRequest.geo/ip` detectado.

### Gate que não pôde ser executado localmente

`npm ci --offline` real para na primeira tarball ausente (`zod-3.25.76.tgz`). O container desta sessão não resolve `registry.npmjs.org`; portanto ainda não é tecnicamente correto marcar **testes + typecheck + production build** desta combinação Next 15/React 19 como verdes.

O problema atual é de disponibilidade das tarballs no ambiente, não de inconsistência do lock: o dry-run de `npm ci` e a regeneração `--package-lock-only` passaram.

### Próximo gate obrigatório

Em um runner com acesso normal ao npm:

```bash
npm ci
npm test
npm run typecheck
npm run build
```

Somente depois dos quatro comandos verdes avançaremos para Next 16. No salto Next 16:

1. ✅ renomeado `middleware.ts` → `proxy.ts`;
2. ✅ função `middleware` → `proxy`;
3. atualizar `tests/access-gate.test.ts`;
4. validar Turbopack/build;
5. manter Tailwind 3 durante este gate;
6. migrar Tailwind 4 em patch separado.

### Regra de engenharia

Não misturar neste patch PostgreSQL, i18n, novo layout, Axiom Design System ou `@optimal-engine/client`. O objetivo deste pacote é exclusivamente reduzir o risco do upgrade de framework.


## Phase 3 / Next.js 16

- Candidate target: Next.js 16.3.4 (Active LTS) + React 19.2.8.
- `middleware.ts` migrated to `proxy.ts` and export renamed to `proxy`.
- Node engine floor raised to `>=20.9.0`.
- Turbopack remains the default through plain `next dev` / `next build`.
- No React Compiler or Cache Components opt-in yet; those are separate performance decisions after the compatibility gate.

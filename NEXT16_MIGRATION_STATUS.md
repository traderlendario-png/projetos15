# Next.js 16 migration status

Date: 2026-09-09

## Target

- Next.js 16.3.4
- React 19.2.8
- React DOM 19.2.8
- Node.js >= 20.9.0
- Tailwind CSS remains 3.4.x in this phase on purpose

## Completed in source

- Migrated `middleware.ts` to `proxy.ts`.
- Renamed the exported request-boundary function from `middleware` to `proxy`.
- Updated the access-gate wiring test and source comments.
- Raised the Node.js engine floor to the Next.js 16 minimum.
- Kept `next dev` and `next build` without explicit Turbopack flags because Turbopack is the Next.js 16 default.
- Added the Next.js agent rules block to `AGENTS.md` so future agents use version-matched bundled docs.
- Kept React Compiler and Cache Components disabled for now; both are post-compatibility performance choices.

## Static compatibility scan

No production source usage was found for:

- `next/legacy/image`
- `experimental_ppr`
- `unstable_cacheLife`
- `unstable_cacheTag`
- `unstable_rootParams`
- `next lint`
- parallel route slots that would require a new `default.tsx`

The async `params` / `searchParams` preparation was already performed in the preceding Next.js 15 candidate.

## Gates executed here

- 326 TypeScript/TSX files parsed: PASS, 0 syntax errors.
- `npm install --package-lock-only --offline --ignore-scripts`: PASS.
- `npm ci --dry-run --offline --ignore-scripts`: PASS, 345-package install plan accepted.
- access-gate pure-logic behavioral smoke test: PASS.
- package/lock targets checked: Next 16.3.4, React 19.2.8, `@next/env` 16.3.4, `@swc/helpers` 0.5.23, Next-local PostCSS 8.5.23.

## Gate not executable in this container

A real `npm ci` cannot complete because the local npm cache does not contain all tarballs (first missing package observed: `zod-3.25.76.tgz`) and the shell environment cannot retrieve npm registry packages. Therefore Vitest, full TypeScript semantic typecheck, and a production `next build` must still run in an npm-enabled runner before this candidate is promoted to the deployable baseline.

## Next phase after runtime green

Tailwind CSS 3 -> 4 in a separate migration patch, preserving all FounderOS theme tokens and visual behavior before the Axiom premium redesign begins.

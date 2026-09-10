# Tailwind CSS 4 migration status

## Candidate

- Tailwind CSS: `4.3.3`
- PostCSS plugin: `@tailwindcss/postcss` `4.3.3`
- PostCSS: `8.5.28`
- Next.js: `16.3.4`
- React / ReactDOM: `19.2.8`
- Node engine: `>=20.9.0`

## Completed

- Replaced legacy `@tailwind` directives with `@import "tailwindcss"`.
- Moved `os.*` colors, custom breakpoints, fonts and `*-t` radius tokens from `tailwind.config.ts` to CSS-first `@theme` / `@theme inline`.
- Removed `tailwind.config.ts`.
- Switched PostCSS from `tailwindcss + autoprefixer` to `@tailwindcss/postcss`; v4 handles imports and prefixing.
- Removed the direct `autoprefixer` dependency.
- Renamed the Next font variable to `--font-jetbrains` so Tailwind can own the `--font-mono` theme token.
- Migrated renamed v4 utility semantics used by the app: `shadow-sm -> shadow-xs`, old `backdrop-blur-sm -> backdrop-blur-xs`, old `backdrop-blur -> backdrop-blur-sm`, old `rounded-sm -> rounded-xs`, old `rounded -> rounded-sm`, and `outline-none -> outline-hidden`.
- Added the v3 default border-color compatibility layer recommended by the Tailwind upgrade guide.
- Regenerated/pruned `package-lock.json` offline and validated it with `npm ci --dry-run --offline --ignore-scripts`.
- Parsed all 325 remaining TS/TSX files after removal of `tailwind.config.ts`: 0 syntax errors.
- Parsed `app/globals.css` with `tinycss2`: 0 stylesheet parse errors.

## Runtime gate still required

The current execution environment cannot fetch missing npm tarballs. A real `npm ci --offline` stops at `zod-3.25.76.tgz`, which is not cached. Run the following in CI or a runner with npm registry access before promotion:

```bash
npm ci
npm test
npm run typecheck
npm run build
```

Then perform a browser visual-regression pass on dark, light, midnight, ember, mono and mono-light themes, with special attention to `space-*`, `divide-*`, focus outlines and backdrop blur because Tailwind v4 changed some default semantics.

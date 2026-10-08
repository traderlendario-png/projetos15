import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const locales = ['pt-BR', 'pt-PT', 'es-419', 'en-US'];
const messagesDir = path.join(ROOT, 'lib', 'i18n', 'messages');

function fail(message) {
  console.error(`i18n:verify FAIL — ${message}`);
  process.exit(1);
}

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), 'utf8');
}

function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
}

const catalogs = Object.fromEntries(
  locales.map((locale) => {
    const file = path.join(messagesDir, `${locale}.json`);
    if (!fs.existsSync(file)) fail(`missing catalog ${locale}`);
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
    return [locale, parsed];
  }),
);

const baseKeys = Object.keys(catalogs['pt-BR']).sort();
if (baseKeys.length < 105) fail(`catalog baseline regressed: ${baseKeys.length} keys (expected at least 105)`);
for (const locale of locales) {
  const keys = Object.keys(catalogs[locale]).sort();
  if (keys.length !== baseKeys.length) fail(`${locale} has ${keys.length} keys; pt-BR has ${baseKeys.length}`);
  const missing = baseKeys.filter((key) => !Object.hasOwn(catalogs[locale], key));
  const extra = keys.filter((key) => !Object.hasOwn(catalogs['pt-BR'], key));
  if (missing.length || extra.length) fail(`${locale} key mismatch; missing=${missing.join(',')} extra=${extra.join(',')}`);
  for (const key of baseKeys) {
    if (typeof catalogs[locale][key] !== 'string' || !catalogs[locale][key].trim()) {
      fail(`${locale}:${key} must be a non-empty string`);
    }
  }
}

// ICU-style placeholders must stay identical across translations.
const params = (value) => [...value.matchAll(/\{([A-Za-z0-9_]+)\}/g)].map((m) => m[1]).sort().join(',');
for (const key of baseKeys) {
  const expected = params(catalogs['pt-BR'][key]);
  for (const locale of locales.slice(1)) {
    const actual = params(catalogs[locale][key]);
    if (actual !== expected) fail(`placeholder mismatch ${key}: pt-BR=[${expected}] ${locale}=[${actual}]`);
  }
}

const localesSource = read('lib/i18n/locales.ts');
for (const locale of locales) {
  if (!localesSource.includes(`'${locale}'`)) fail(`SUPPORTED_LOCALES missing ${locale}`);
}
for (const country of ['BR', 'PT', 'MX', 'CO', 'AR', 'CL', 'PE', 'US']) {
  if (!localesSource.includes(`${country}: { country: '${country}'`)) fail(`launch region preset missing ${country}`);
}
if (!localesSource.includes('sanitizeTimezone')) fail('timezone sanitizer missing');

const migration = read('db/control-plane/0003_i18n_preferences.sql');
for (const token of ['control_plane.user_preferences', 'ENABLE ROW LEVEL SECURITY', 'current_actor_id()', ...locales]) {
  if (!migration.includes(token)) fail(`migration contract missing ${token}`);
}

const proxy = read('proxy.ts');
for (const token of ['x-founder-locale', 'x-founder-country', 'x-founder-currency', 'x-founder-timezone', 'x-founder-first-day-of-week']) {
  // Header values are centralized in server.ts; proxy must import and use the map.
  const headerSource = read('lib/i18n/server.ts');
  if (!headerSource.includes(token)) fail(`regional header missing ${token}`);
}
if (!proxy.includes('installRegionalHeaders') || !proxy.includes('LOCALE_COOKIE')) fail('proxy locale boundary missing');

const layout = read('app/layout.tsx');
if (!layout.includes('<I18nProvider regional={regional}>')) fail('RootLayout missing I18nProvider');
if (!layout.includes('<html lang={regional.locale}')) fail('RootLayout missing dynamic html lang');

const apiPolicy = read('lib/control-plane/api-policy.ts');
if (!apiPolicy.includes("path === '/api/control-plane/me/preferences')")) {
  fail('personal preferences endpoint is still trapped behind coarse app.write/app.read policy');
}


// Phase 7B runtime hardening contracts.
const localeSwitcher = read('components/i18n/LocaleSwitcher.tsx');
if (!localeSwitcher.includes("fetch('/api/i18n/locale'")) fail('LocaleSwitcher must use the unified locale endpoint');
if (localeSwitcher.includes('/api/control-plane/me/preferences')) {
  fail('LocaleSwitcher must not perform a second auth-only preferences PATCH');
}

const localeRoute = read('app/api/i18n/locale/route.ts');
for (const token of ['resolveUserSession', 'SESSION_COOKIE', 'updateUserPreferences', 'persisted']) {
  if (!localeRoute.includes(token)) fail(`locale endpoint missing runtime-hardening contract ${token}`);
}

const scopeSource = read('lib/control-plane/scope.ts');
if (/\bas any\b|\btx:\s*any\b/.test(scopeSource)) fail('Control Plane scope must not weaken postgres transaction types to any');
if (!scopeSource.includes('return { value: await fn(tx) };') || !scopeSource.includes('return result.value;')) {
  fail('Control Plane scope generic-preservation wrapper missing');
}

const socialGraph = read('components/HomeSocialGraph.tsx');
for (const token of ['DEFAULT_LOCALE', "from '@/lib/i18n/format'"]) {
  if (socialGraph.includes(token)) fail(`HomeSocialGraph contains default-locale bypass ${token}`);
}
if (!socialGraph.includes("const { number } = useI18n();")) fail('HomeSocialGraph modal must consume active locale number formatting');

const weekCalendar = read('components/WeekCalendar.tsx');
for (const token of ['DEFAULT_LOCALE', 'DEFAULT_REGIONAL_SETTINGS', "from '@/lib/i18n/format'"]) {
  if (weekCalendar.includes(token)) fail(`WeekCalendar contains default-locale bypass ${token}`);
}
if (!weekCalendar.includes('function EventBlock') || !weekCalendar.includes("const { date } = useI18n();")) {
  fail('WeekCalendar event blocks must consume active locale date formatting');
}

const nextConfig = read('next.config.mjs');
for (const token of ['turbopack:', 'root: projectRoot', 'fileURLToPath(import.meta.url)']) {
  if (!nextConfig.includes(token)) fail(`Next/Turbopack root contract missing ${token}`);
}

const packageSource = read('package.json');
for (const token of ['"i18n:coverage": "node scripts/i18n-coverage.mjs"', '"i18n:verify:live": "tsx scripts/verify-i18n-live.ts"']) {
  if (!packageSource.includes(token)) fail(`package script missing ${token}`);
}
const coverageSource = read('scripts/i18n-coverage.mjs');
for (const token of ['createRequire', "require('typescript')", 'Top routes by hardcoded UI copy']) {
  if (!coverageSource.includes(token)) fail(`AST coverage scanner contract missing ${token}`);
}
const liveProbe = read('scripts/verify-i18n-live.ts');
for (const token of ['devLogin', 'control_plane.user_preferences', 'resolveUserSession', "locale: 'es-419'"]) {
  if (!liveProbe.includes(token)) fail(`live i18n persistence probe missing ${token}`);
}

const formatCall = /\.toLocale(?:String|DateString|TimeString)\(/;
const intlCall = /new\s+Intl\.(?:NumberFormat|DateTimeFormat)\(/;
const offenders = [];
for (const root of ['app', 'components', 'lib']) {
  for (const file of walk(path.join(ROOT, root))) {
    if (!/\.(?:ts|tsx|js|jsx)$/.test(file)) continue;
    if (file.includes(`${path.sep}lib${path.sep}i18n${path.sep}`)) continue;
    const text = fs.readFileSync(file, 'utf8');
    if (formatCall.test(text) || intlCall.test(text)) offenders.push(path.relative(ROOT, file));
  }
}
if (offenders.length) fail(`formatter bypass(es) outside lib/i18n: ${offenders.join(', ')}`);

// Pure contract cases mirror the launch matching policy and catch accidental
// changes to the intended LATAM/Portuguese fallback behavior in CI.
function match(tag) {
  if (!tag) return null;
  const normalized = tag.trim().replace('_', '-');
  if (locales.includes(normalized)) return normalized;
  const lower = normalized.toLowerCase();
  if (lower === 'pt-pt' || lower.startsWith('pt-pt-')) return 'pt-PT';
  if (lower === 'pt' || lower.startsWith('pt-')) return 'pt-BR';
  if (lower === 'es' || lower.startsWith('es-')) return 'es-419';
  if (lower === 'en' || lower.startsWith('en-')) return 'en-US';
  return null;
}
const cases = new Map([
  ['es-MX', 'es-419'], ['es-CO', 'es-419'], ['es-AR', 'es-419'],
  ['pt-PT', 'pt-PT'], ['pt-AO', 'pt-BR'], ['en-GB', 'en-US'], ['fr-FR', null],
]);
for (const [input, expected] of cases) {
  if (match(input) !== expected) fail(`locale match contract ${input} -> ${match(input)}; expected ${expected}`);
}

console.log(`i18n:verify PASS — ${locales.length} locales · ${baseKeys.length} keys/catalog · placeholder parity · regional/RLS boundary · phase7b runtime contracts · 0 formatter bypasses`);

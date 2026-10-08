import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const ts = require('typescript');

const ROOT = process.cwd();
const SOURCE_ROOTS = ['app', 'components'];
const VISIBLE_ATTRIBUTES = new Set([
  'alt',
  'aria-label',
  'aria-description',
  'placeholder',
  'title',
]);
const VISIBLE_OBJECT_KEYS = new Set([
  'label',
  'title',
  'description',
  'placeholder',
  'emptyText',
  'helperText',
  'message',
]);
const VISIBLE_CALLS = new Set(['alert', 'confirm', 'prompt', 'toast']);

function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === '.next') continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (/\.(?:ts|tsx|js|jsx)$/.test(entry.name)) out.push(full);
  }
  return out;
}

function normalizeText(value) {
  return value.replace(/\s+/g, ' ').trim();
}

function looksLikeUiText(value) {
  const text = normalizeText(value);
  if (!text || text.length < 2) return false;
  if (!/[\p{L}\p{N}]/u.test(text)) return false;
  if (/^(?:https?:|mailto:|tel:|\/|#|\.|[A-Za-z]:\\)/.test(text)) return false;
  if (/^[A-Z0-9_]+$/.test(text) && text.includes('_')) return false;
  if (/^(?:GET|POST|PUT|PATCH|DELETE|OPTIONS|HEAD)$/i.test(text)) return false;
  if (/^[a-z0-9_-]+\.(?:ts|tsx|js|jsx|json|css|svg|png|jpg|jpeg|webp)$/i.test(text)) return false;
  return true;
}

function propertyNameText(node) {
  if (!node) return null;
  if (ts.isIdentifier(node) || ts.isStringLiteral(node) || ts.isNumericLiteral(node)) return node.text;
  return null;
}

function collectVisibleStringsFromExpression(node, out) {
  if (!node) return;
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
    if (looksLikeUiText(node.text)) out.push(normalizeText(node.text));
    return;
  }
  if (ts.isTemplateExpression(node)) {
    const staticText = normalizeText([
      node.head.text,
      ...node.templateSpans.map((span) => span.literal.text),
    ].join(' '));
    if (looksLikeUiText(staticText)) out.push(staticText);
    return;
  }
  if (ts.isConditionalExpression(node)) {
    collectVisibleStringsFromExpression(node.whenTrue, out);
    collectVisibleStringsFromExpression(node.whenFalse, out);
    return;
  }
  if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.PlusToken) {
    collectVisibleStringsFromExpression(node.left, out);
    collectVisibleStringsFromExpression(node.right, out);
    return;
  }
  if (ts.isArrayLiteralExpression(node)) {
    for (const element of node.elements) collectVisibleStringsFromExpression(element, out);
  }
}

function importSpecifierText(node) {
  return ts.isStringLiteral(node.moduleSpecifier) ? node.moduleSpecifier.text : null;
}

function resolveLocalImport(fromFile, specifier) {
  if (!specifier || (!specifier.startsWith('@/') && !specifier.startsWith('.'))) return null;
  const base = specifier.startsWith('@/')
    ? path.join(ROOT, specifier.slice(2))
    : path.resolve(path.dirname(fromFile), specifier);
  const candidates = [
    base,
    `${base}.ts`, `${base}.tsx`, `${base}.js`, `${base}.jsx`,
    path.join(base, 'index.ts'), path.join(base, 'index.tsx'),
    path.join(base, 'index.js'), path.join(base, 'index.jsx'),
  ];
  return candidates.find((candidate) => fs.existsSync(candidate) && fs.statSync(candidate).isFile()) ?? null;
}

function isTranslationCall(node) {
  if (!ts.isCallExpression(node) || node.arguments.length === 0) return false;
  const callee = node.expression;
  const name = ts.isIdentifier(callee)
    ? callee.text
    : ts.isPropertyAccessExpression(callee)
      ? callee.name.text
      : null;
  if (name !== 't' && name !== 'translate') return false;
  const first = node.arguments[0];
  return ts.isStringLiteral(first) || ts.isNoSubstitutionTemplateLiteral(first);
}

function visibleCallName(node) {
  if (!ts.isCallExpression(node)) return null;
  const callee = node.expression;
  if (ts.isIdentifier(callee)) return callee.text;
  if (ts.isPropertyAccessExpression(callee)) return callee.name.text;
  return null;
}

function analyzeFile(file) {
  const source = fs.readFileSync(file, 'utf8');
  const sourceFile = ts.createSourceFile(
    file,
    source,
    ts.ScriptTarget.Latest,
    true,
    file.endsWith('.tsx') || file.endsWith('.jsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
  const hardcoded = [];
  const translated = [];
  const imports = [];

  function visit(node) {
    if (ts.isImportDeclaration(node)) {
      const specifier = importSpecifierText(node);
      const resolved = resolveLocalImport(file, specifier);
      if (resolved) imports.push(resolved);
    }

    if (isTranslationCall(node)) {
      translated.push(node.arguments[0].text);
    }

    if (ts.isJsxText(node) && looksLikeUiText(node.text)) {
      hardcoded.push(normalizeText(node.text));
    }

    if (ts.isJsxAttribute(node)) {
      const name = node.name.getText(sourceFile);
      if (VISIBLE_ATTRIBUTES.has(name) && node.initializer) {
        if (ts.isStringLiteral(node.initializer) && looksLikeUiText(node.initializer.text)) {
          hardcoded.push(normalizeText(node.initializer.text));
        } else if (ts.isJsxExpression(node.initializer)) {
          collectVisibleStringsFromExpression(node.initializer.expression, hardcoded);
        }
      }
    }

    if (ts.isPropertyAssignment(node)) {
      const key = propertyNameText(node.name);
      if (key && VISIBLE_OBJECT_KEYS.has(key)) {
        collectVisibleStringsFromExpression(node.initializer, hardcoded);
      }
    }

    if (ts.isCallExpression(node)) {
      const callName = visibleCallName(node);
      if (callName && VISIBLE_CALLS.has(callName) && node.arguments[0]) {
        collectVisibleStringsFromExpression(node.arguments[0], hardcoded);
      }
    }

    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return { hardcoded, translated, imports };
}

function routeForPage(file) {
  const rel = path.relative(path.join(ROOT, 'app'), file).replaceAll(path.sep, '/');
  if (!rel.endsWith('/page.tsx') && rel !== 'page.tsx' && !rel.endsWith('/page.jsx') && rel !== 'page.jsx') return null;
  const dir = rel.replace(/\/?page\.(?:tsx|jsx)$/, '');
  return dir ? `/${dir}` : '/';
}

const files = SOURCE_ROOTS.flatMap((root) => walk(path.join(ROOT, root)));
const analyses = new Map(files.map((file) => [file, analyzeFile(file)]));

const fileRows = files.map((file) => {
  const analysis = analyses.get(file);
  const hardcodedCount = analysis.hardcoded.length;
  const translatedCount = analysis.translated.length;
  const total = hardcodedCount + translatedCount;
  return {
    file: path.relative(ROOT, file).replaceAll(path.sep, '/'),
    route: routeForPage(file),
    hardcoded: hardcodedCount,
    translated: translatedCount,
    total,
    coverage: total === 0 ? 100 : Number(((translatedCount / total) * 100).toFixed(1)),
    examples: [...new Set(analysis.hardcoded)].slice(0, 8),
  };
});

const pages = files.filter((file) => routeForPage(file));
const routeRows = pages.map((page) => {
  const seen = new Set();
  const stack = [page];
  let hardcoded = 0;
  let translated = 0;
  while (stack.length) {
    const file = stack.pop();
    if (!file || seen.has(file)) continue;
    seen.add(file);
    const analysis = analyses.get(file);
    if (!analysis) continue;
    hardcoded += analysis.hardcoded.length;
    translated += analysis.translated.length;
    for (const dependency of analysis.imports) {
      if (analyses.has(dependency)) stack.push(dependency);
    }
  }
  const total = hardcoded + translated;
  return {
    route: routeForPage(page),
    hardcoded,
    translated,
    total,
    coverage: total === 0 ? 100 : Number(((translated / total) * 100).toFixed(1)),
    reachableFiles: seen.size,
  };
}).sort((a, b) => b.hardcoded - a.hardcoded || a.route.localeCompare(b.route));

const hardcoded = fileRows.reduce((sum, row) => sum + row.hardcoded, 0);
const translated = fileRows.reduce((sum, row) => sum + row.translated, 0);
const total = hardcoded + translated;
const coverage = total === 0 ? 100 : Number(((translated / total) * 100).toFixed(1));

const result = {
  methodology: {
    roots: SOURCE_ROOTS,
    translated: 'static t()/translate() callsites with literal keys',
    hardcoded: 'heuristic user-visible literals in JSX text/visible attributes/visible object fields/dialog calls',
    note: 'Route totals include statically reachable local components and may overlap across routes; global totals count each file occurrence once.',
  },
  global: { hardcoded, translated, total, coverage },
  routes: routeRows,
  files: fileRows.sort((a, b) => b.hardcoded - a.hardcoded || a.file.localeCompare(b.file)),
};

console.log(`i18n:coverage — ${translated}/${total} UI callsites catalog-backed (${coverage}%) · ${hardcoded} hardcoded candidates`);
console.log('\nTop routes by hardcoded UI copy:');
for (const row of routeRows.slice(0, 15)) {
  console.log(`${row.route.padEnd(28)} hardcoded=${String(row.hardcoded).padStart(4)} translated=${String(row.translated).padStart(4)} coverage=${String(row.coverage).padStart(5)}%`);
}
console.log('\nTop files by hardcoded UI copy:');
for (const row of result.files.slice(0, 20)) {
  console.log(`${row.file.padEnd(56)} hardcoded=${String(row.hardcoded).padStart(4)} translated=${String(row.translated).padStart(4)} coverage=${String(row.coverage).padStart(5)}%`);
}

const jsonArg = process.argv.find((arg) => arg.startsWith('--json='));
if (jsonArg) {
  const out = path.resolve(ROOT, jsonArg.slice('--json='.length));
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, `${JSON.stringify(result, null, 2)}\n`);
  console.log(`\nJSON written to ${path.relative(ROOT, out)}`);
}

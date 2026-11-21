import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import {
  COLLECTION_REGISTRY,
  getCollectionsForExport,
  getCollectionsForModuleDelete,
  REGISTERED_COLLECTION_NAMES,
} from '../collectionRegistry';
import { buildCsvString } from '../csvUtils';
import { isSafeHttpUrl, isSafeInternalRoute, sanitizeStorageFileName } from '../urlUtils';

const ROOT_DIR = path.resolve(process.cwd());

function walkFiles(dir: string, exts: string[]): string[] {
  const results: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === 'dist' || entry.name.startsWith('.')) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...walkFiles(full, exts));
    } else if (exts.some((ext) => entry.name.endsWith(ext))) {
      results.push(full);
    }
  }
  return results;
}

test('COLLECTION_REGISTRY covers every collection in firestore.rules, src/, and server.ts', () => {
  const rulesText = fs.readFileSync(path.join(ROOT_DIR, 'firestore.rules'), 'utf8');
  const rulesMatches = [...rulesText.matchAll(/match\s+\/([a-zA-Z0-9_]+)\/\{[a-zA-Z0-9_]+\}/g)].map(
    (m) => m[1]
  );

  const srcFiles = walkFiles(path.join(ROOT_DIR, 'src'), ['.ts', '.tsx']);
  const srcCollectionMatches: string[] = [];
  for (const file of srcFiles) {
    const content = fs.readFileSync(file, 'utf8');
    for (const m of content.matchAll(/\b(?:collection|doc)\s*\(\s*db\s*,\s*['"]([a-zA-Z0-9_]+)['"]/g)) {
      srcCollectionMatches.push(m[1]);
    }
  }

  const serverText = fs.readFileSync(path.join(ROOT_DIR, 'server.ts'), 'utf8');
  const serverMatches = [
    ...serverText.matchAll(
      /\b(?:fsQuery|fsGetDoc|fsCreateDoc|fsPatchDoc|fsDeleteDoc)\s*\(\s*[^,]+,\s*['"]([a-zA-Z0-9_]+)['"]/g
    ),
  ].map((m) => m[1]);

  const discovered = new Set([...rulesMatches, ...srcCollectionMatches, ...serverMatches]);
  // Connectivity ping doc in firebase.ts & root rule namespace
  discovered.delete('test');
  discovered.delete('databases');

  const missing = [...discovered].filter((name) => !REGISTERED_COLLECTION_NAMES.has(name));
  assert.deepEqual(
    missing,
    [],
    `Unregistered Firestore collections found: ${missing.join(', ')}. Add them to src/lib/collectionRegistry.ts.`
  );
});

test('Salary collections are excluded from Business export unless explicitly included', () => {
  const defaultBiz = getCollectionsForExport('business', false).map((c) => c.name);
  assert.equal(defaultBiz.includes('teamMemberPrivate'), false);
  assert.equal(defaultBiz.includes('salaryRecords'), false);

  const withSalary = getCollectionsForExport('business', true).map((c) => c.name);
  assert.equal(withSalary.includes('teamMemberPrivate'), true);
  assert.equal(withSalary.includes('salaryRecords'), true);
});

test('Immutable audit collections are excluded from client module deletion', () => {
  const bizDeletable = getCollectionsForModuleDelete('business').map((c) => c.name);
  assert.equal(bizDeletable.includes('financeAuditLogs'), false);
  const compDeletable = getCollectionsForModuleDelete('competitor').map((c) => c.name);
  assert.equal(compDeletable.includes('competitorMonthlyReviews'), false);
  assert.equal(compDeletable.includes('rewardEvents'), false);
  assert.ok(COLLECTION_REGISTRY.length >= 45);
});

test('buildCsvString uses UTF-8 BOM and neutralizes spreadsheet formula injection', () => {
  const csv = buildCsvString(
    ['Name', 'Formula', 'NegativeNum', 'FormulaNeg'],
    [['Gen Z Neural-X ₹', '=CMD("calc")', -42.5, '-SUM(A1:A2)']]
  );
  assert.equal(csv.startsWith('\uFEFF'), true);
  assert.ok(csv.includes("'=CMD"));
  assert.ok(csv.includes('-42.5'));
  assert.ok(csv.includes("'-SUM(A1:A2)"));
});

test('URL & storage filename sanitizers block dangerous schemes and path traversal', () => {
  assert.equal(isSafeHttpUrl('https://genzneuralx.com'), true);
  assert.equal(isSafeHttpUrl('javascript:alert(1)'), false);
  assert.equal(isSafeHttpUrl('data:text/html,hi'), false);
  assert.equal(isSafeInternalRoute('/notifications?tab=all'), true);
  assert.equal(isSafeInternalRoute('//evil.com'), false);
  assert.equal(sanitizeStorageFileName('../../etc/passwd'), '__etc_passwd');
});

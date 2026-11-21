import JSZip from 'jszip';
import {
  collection,
  doc,
  documentId,
  getDocs,
  limit,
  orderBy,
  query,
  Query,
  QueryDocumentSnapshot,
  startAfter,
  Timestamp,
  where,
  writeBatch,
} from 'firebase/firestore';
import {
  CollectionRegistryEntry,
  DeleteModuleGroup,
  getCollectionsForExport,
  getCollectionsForModuleDelete,
} from './collectionRegistry';
import { buildCsvString } from './csvUtils';
import { db } from './firebase';
import { logSecurityAuditEvent } from '../services/securityAuditService';

export interface ExportProgress {
  current: number;
  total: number;
  collectionName: string;
  label: string;
  recordsFound: number;
}

export interface ExportResult {
  scope: 'personal' | 'business' | 'competitor' | 'all';
  includesSalary: boolean;
  totalRecords: number;
  collectionCounts: Record<string, number>;
  fileName: string;
}

function serializeValue(val: unknown): unknown {
  if (val === null || val === undefined) return '';
  if (val instanceof Timestamp) return val.toDate().toISOString();
  if (typeof val === 'object' && val !== null && 'toDate' in val && typeof (val as { toDate: () => Date }).toDate === 'function') {
    return (val as { toDate: () => Date }).toDate().toISOString();
  }
  if (Array.isArray(val)) return val.map((v) => serializeValue(v));
  if (typeof val === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(val as Record<string, unknown>)) {
      out[k] = serializeValue(v);
    }
    return out;
  }
  return val;
}

function flattenCsvCell(val: unknown): string | number | boolean | null {
  if (val === null || val === undefined) return '';
  if (typeof val === 'string' || typeof val === 'number' || typeof val === 'boolean') return val;
  return JSON.stringify(val);
}

async function fetchOwnedCollectionPaged(
  colName: string,
  uid: string
): Promise<Record<string, unknown>[]> {
  const results: Record<string, unknown>[] = [];
  let cursor: QueryDocumentSnapshot | null = null;
  const pageSize = 400;

  while (true) {
    const q: Query = cursor
      ? query(
          collection(db, colName),
          where('ownerId', '==', uid),
          orderBy(documentId()),
          startAfter(cursor),
          limit(pageSize)
        )
      : query(
          collection(db, colName),
          where('ownerId', '==', uid),
          orderBy(documentId()),
          limit(pageSize)
        );

    const snap = await getDocs(q);
    for (const d of snap.docs) {
      results.push({
        id: d.id,
        ...(serializeValue(d.data()) as Record<string, unknown>),
      });
    }
    if (snap.docs.length < pageSize) break;
    cursor = snap.docs[snap.docs.length - 1];
  }

  return results;
}

function buildCollectionCsv(rows: Record<string, unknown>[]): string {
  if (rows.length === 0) {
    return buildCsvString(['id', 'notice'], [['', 'No records found']]);
  }
  const keySet = new Set<string>(['id']);
  for (const row of rows) {
    for (const k of Object.keys(row)) {
      keySet.add(k);
    }
  }
  const headers = Array.from(keySet);
  const body = rows.map((row) => headers.map((h) => flattenCsvCell(row[h])));
  return buildCsvString(headers, body);
}

export async function exportGoalXDataZip(params: {
  uid: string;
  actorName: string;
  scope: 'personal' | 'business' | 'competitor' | 'all';
  includeSalary?: boolean;
  onProgress?: (progress: ExportProgress) => void;
}): Promise<ExportResult> {
  const { uid, actorName, scope, includeSalary = false, onProgress } = params;
  const entries: CollectionRegistryEntry[] = getCollectionsForExport(scope, includeSalary);

  const zip = new JSZip();
  const csvFolder = zip.folder('csv');
  const exportPayload: Record<string, Record<string, unknown>[]> = {};
  const collectionCounts: Record<string, number> = {};
  let totalRecords = 0;

  for (let i = 0; i < entries.length; i += 1) {
    const entry = entries[i];
    const rows = await fetchOwnedCollectionPaged(entry.name, uid);
    exportPayload[entry.name] = rows;
    collectionCounts[entry.name] = rows.length;
    totalRecords += rows.length;

    if (csvFolder) {
      csvFolder.file(`${entry.name}.csv`, buildCollectionCsv(rows));
    }

    onProgress?.({
      current: i + 1,
      total: entries.length,
      collectionName: entry.name,
      label: entry.label,
      recordsFound: totalRecords,
    });
  }

  const exportedAtIso = new Date().toISOString();
  const jsonDocument = {
    app: 'GoalX',
    exportedAtIso,
    scope,
    includesSalary: includeSalary,
    totalRecords,
    collectionCounts,
    collections: exportPayload,
  };

  zip.file('goalx_export.json', JSON.stringify(jsonDocument, null, 2));

  const blob = await zip.generateAsync({ type: 'blob' });
  const datePart = exportedAtIso.slice(0, 10);
  const fileName = `goalx_${scope}_export_${datePart}.zip`;

  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', fileName);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);

  await logSecurityAuditEvent({
    uid,
    actorName,
    action: includeSalary ? 'salary_export' : 'data_export',
    details: `Exported ${scope} ZIP (${totalRecords} records across ${entries.length} collections${includeSalary ? ', salary included' : ''}).`,
  });

  return {
    scope,
    includesSalary: includeSalary,
    totalRecords,
    collectionCounts,
    fileName,
  };
}

export async function deleteModuleData(params: {
  uid: string;
  actorName: string;
  moduleGroup: Exclude<DeleteModuleGroup, 'account_only'>;
  onProgress?: (progress: { current: number; total: number; collectionName: string }) => void;
}): Promise<{ deletedCount: number; collectionCounts: Record<string, number> }> {
  const { uid, actorName, moduleGroup, onProgress } = params;
  const entries = getCollectionsForModuleDelete(moduleGroup);
  const collectionCounts: Record<string, number> = {};
  let deletedCount = 0;

  for (let i = 0; i < entries.length; i += 1) {
    const entry = entries[i];
    let colDeleted = 0;

    while (true) {
      const snap = await getDocs(
        query(collection(db, entry.name), where('ownerId', '==', uid), limit(350))
      );
      if (snap.empty) break;

      const batch = writeBatch(db);
      for (const d of snap.docs) {
        batch.delete(doc(db, entry.name, d.id));
      }
      await batch.commit();
      colDeleted += snap.size;
      deletedCount += snap.size;
      if (snap.size < 350) break;
    }

    collectionCounts[entry.name] = colDeleted;
    onProgress?.({
      current: i + 1,
      total: entries.length,
      collectionName: entry.name,
    });
  }

  await logSecurityAuditEvent({
    uid,
    actorName,
    action: 'module_delete',
    details: `Deleted ${moduleGroup} module data (${deletedCount} records across ${entries.length} collections).`,
  });

  return { deletedCount, collectionCounts };
}

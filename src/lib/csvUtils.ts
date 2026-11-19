/**
 * RFC 4180 compliant CSV generator with UTF-8 BOM (\uFEFF) so Excel opens INR (₹)
 * and Tamil/Unicode text cleanly, plus formula-injection neutralization for strings.
 */

function neutralizeFormulaInjection(raw: string): string {
  // Neutralize spreadsheet formula triggers (=, +, @, leading tab/CR, or non-numeric -formula)
  if (/^[=+@\t\r]/.test(raw) || /^-[a-zA-Z(]/.test(raw)) {
    return `'${raw}`;
  }
  return raw;
}

function escapeCsvCell(value: string | number | boolean | null | undefined): string {
  if (value === null || value === undefined) return '';
  const rawStr = typeof value === 'string' ? neutralizeFormulaInjection(value) : String(value);
  if (/[",\r\n]/.test(rawStr)) {
    return `"${rawStr.replace(/"/g, '""')}"`;
  }
  return rawStr;
}

export function buildCsvString(
  headers: string[],
  rows: (string | number | boolean | null | undefined)[][]
): string {
  const lines = [
    headers.map((h) => escapeCsvCell(h)).join(','),
    ...rows.map((row) => row.map((cell) => escapeCsvCell(cell)).join(',')),
  ];
  return '\uFEFF' + lines.join('\r\n');
}

export function downloadCsvFile(
  filename: string,
  headers: string[],
  rows: (string | number | boolean | null | undefined)[][]
): void {
  const csv = buildCsvString(headers, rows);
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', filename.endsWith('.csv') ? filename : `${filename}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

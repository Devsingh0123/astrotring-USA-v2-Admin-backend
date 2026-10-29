/**
 * CSV Formatting Utility (RFC 4180 compliant)
 * Handles character escaping and includes UTF-8 Byte Order Mark (BOM)
 * for automatic UTF-8 character recognition in Microsoft Excel and spreadsheet tools.
 */

/**
 * Escapes a single CSV value following RFC 4180 rules.
 * Handles strings, numbers, dates, booleans, and null/undefined.
 *
 * @param {any} val
 * @returns {string}
 */
export function escapeCsvField(val) {
  if (val === null || val === undefined) return '';
  if (val instanceof Date) return val.toISOString();
  const str = String(val);
  if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

/**
 * Converts an array of field values into a single CSV row.
 *
 * @param {Array<any>} fields
 * @returns {string}
 */
export function toCsvRow(fields) {
  return fields.map(escapeCsvField).join(',');
}

/**
 * Builds a complete CSV file string from headers array and rows of arrays.
 * Prepends UTF-8 BOM (\uFEFF) so Excel opens UTF-8 characters without garbling.
 *
 * @param {Array<string>} headers
 * @param {Array<Array<any>>} rows
 * @returns {string}
 */
export function buildCsv(headers, rows) {
  const headerLine = toCsvRow(headers);
  const dataLines = rows.map((row) => toCsvRow(row));
  return '\uFEFF' + [headerLine, ...dataLines].join('\r\n');
}

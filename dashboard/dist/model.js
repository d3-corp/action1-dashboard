export const fields = ['id', 'name', 'status', 'OS', 'serial', 'manufacturer', 'CPU_name', 'RAM', 'disk', 'address', 'user', 'agent_version', 'reboot_required', 'last_seen', 'critical_missing_updates', 'other_missing_updates', 'critical_vulnerabilities', 'other_vulnerabilities'];
export const numeric = fields.slice(14);
export const count = value => (typeof value === 'number' || typeof value === 'string') && String(value).trim() !== '' && Number.isSafeInteger(Number(value)) && Number(value) >= 0 ? Number(value) : null;
export const text = value => value == null ? '' : typeof value === 'object' ? '' : String(value);
export const isReboot = value => /^(yes|true|1)$/i.test(text(value));

export function normalize(rows) {
  if (!Array.isArray(rows)) throw new Error('Invalid endpoint collection.');
  return rows.map(row => {
    const summaries = {
      critical_missing_updates: row.missing_updates?.critical,
      other_missing_updates: row.missing_updates?.other,
      critical_vulnerabilities: row.vulnerabilities?.critical,
      other_vulnerabilities: row.vulnerabilities?.other,
    };
    const asset = Object.fromEntries(fields.map(field => [field, numeric.includes(field) ? count(row[field] ?? summaries[field]) : text(row[field])]));
    if (!asset.id) throw new Error('An endpoint is missing its ID.');
    asset.name ||= asset.id;
    asset.total_updates = asset.critical_missing_updates === null || asset.other_missing_updates === null ? null : asset.critical_missing_updates + asset.other_missing_updates;
    return asset;
  });
}

export function parseCSV(input) {
  const source = input.replace(/^\uFEFF/, '');
  const rows = []; let row = [], cell = '', quoted = false;
  for (let i = 0; i < source.length; i++) {
    const c = source[i];
    if (c === '"') { if (quoted && source[i + 1] === '"') { cell += '"'; i++; } else quoted = !quoted; }
    else if (c === ',' && !quoted) { row.push(cell); cell = ''; }
    else if ((c === '\n' || c === '\r') && !quoted) {
      if (c === '\r' && source[i + 1] === '\n') i++;
      row.push(cell); if (row.some(Boolean)) rows.push(row); row = []; cell = '';
    } else cell += c;
  }
  if (quoted) throw new Error('Unclosed CSV quote.');
  row.push(cell); if (row.some(Boolean)) rows.push(row);
  const header = rows.shift();
  if (!header || fields.some(field => !header.includes(field)) || new Set(header).size !== header.length) throw new Error('CSV must contain all 18 Action1 inventory columns with unique headers.');
  const records = rows.map(values => {
    if (values.length !== header.length) throw new Error('CSV row has incorrect column count.');
    return Object.fromEntries(header.map((field, i) => [field, values[i]]));
  });
  if (!records.length) throw new Error('CSV contains no endpoint records.');
  if (new Set(records.map(record => record.id)).size !== records.length) throw new Error('Each endpoint needs a unique ID.');
  return normalize(records);
}

export function exportCSV(rows) {
  const safe = value => {
    let cell = String(value ?? '');
    if (/^[\s]*[=+@-]/.test(cell)) cell = "'" + cell;
    return '"' + cell.replaceAll('"', '""') + '"';
  };
  return '\uFEFF' + [fields.map(safe).join(','), ...rows.map(row => fields.map(field => safe(row[field])).join(','))].join('\r\n');
}

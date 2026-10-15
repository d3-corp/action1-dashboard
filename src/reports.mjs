export function csv(items) {
  const keys = [...new Set(items.flatMap(item => Object.keys(item)))];
  const cell = value => {
    let text = value == null ? '' : typeof value === 'object' ? JSON.stringify(value) : String(value);
    if (/^[\s]*[=+@-]/.test(text)) text = "'" + text;
    return '"' + text.replaceAll('"', '""') + '"';
  };
  return [keys.map(cell).join(','), ...items.map(item => keys.map(key => cell(item[key])).join(','))].join('\r\n');
}

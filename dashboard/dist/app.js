import { fields, numeric, normalize, parseCSV, exportCSV, isReboot } from './model.js';

const $ = id => document.getElementById(id);
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const display = value => value === null || value === '' ? 'Unknown' : esc(value);
const state = { assets: [], filtered: [], page: 0, sort: 'critical_vulnerabilities', direction: -1, organizationId: '', nextFrom: null, busy: false, mode: 'empty', truncated: false };

function options() {
  for (const [id, key] of [['status', 'status'], ['os', 'OS']]) {
    const previous = $(id).value;
    $(id).innerHTML = '<option value="">All ' + (id === 'os' ? 'operating systems' : 'statuses') + '</option>' + [...new Set(state.assets.map(asset => asset[key]).filter(Boolean))].sort().map(value => `<option value="${esc(value)}">${esc(value)}</option>`).join('');
    $(id).value = [...$(id).options].some(option => option.value === previous) ? previous : '';
  }
}

function bars(id, items) {
  const max = Math.max(1, ...items.map(item => item[1] || 0));
  $(id).innerHTML = items.map(([label, n, color, kind, value]) => `<div class="barrow"><div class="barlabel">${kind ? `<button data-filter="${esc(kind)}" data-value="${esc(value)}" class="chart-filter">${esc(label)}</button>` : esc(label)}<b>${n === null ? 'Unknown' : n.toLocaleString()}</b></div><div class="track"><div class="bar" style="width:${(n || 0) / max * 100}%;background:${color}"></div></div></div>`).join('') || '<p class="caption">No endpoint data loaded</p>';
}

function render() {
  const q = $('search').value.toLowerCase(), risk = $('risk').value;
  state.filtered = state.assets.filter(asset => (!q || fields.slice(0, 14).some(field => String(asset[field]).toLowerCase().includes(q))) && (!$('status').value || asset.status === $('status').value) && (!$('os').value || asset.OS === $('os').value) && (!risk || (risk === 'critical' ? asset.critical_vulnerabilities > 0 : risk === 'vulnerable' ? asset.critical_vulnerabilities > 0 || asset.other_vulnerabilities > 0 : risk === 'updates' ? asset.critical_missing_updates > 0 || asset.other_missing_updates > 0 : isReboot(asset.reboot_required))));
  state.filtered.sort((a, b) => {
    if (a[state.sort] === null) return b[state.sort] === null ? 0 : 1;
    if (b[state.sort] === null) return -1;
    return state.direction * (typeof a[state.sort] === 'number' ? a[state.sort] - b[state.sort] : String(a[state.sort]).localeCompare(String(b[state.sort])));
  });
  const rows = state.filtered;
  const sum = field => rows.some(asset => asset[field] !== null) ? rows.reduce((total, asset) => total + (asset[field] || 0), 0) : null;
  const tally = (predicate, known) => rows.some(known) ? rows.filter(predicate).length : null;
  const critical = tally(asset => asset.critical_vulnerabilities > 0, asset => asset.critical_vulnerabilities !== null);
  const vulnerable = tally(asset => asset.critical_vulnerabilities > 0 || asset.other_vulnerabilities > 0, asset => asset.critical_vulnerabilities !== null || asset.other_vulnerabilities !== null);
  const reboot = tally(asset => isReboot(asset.reboot_required), asset => asset.reboot_required !== '');
  const labelSum = field => sum(field) === null ? 'Unknown' : sum(field).toLocaleString();
  const metrics = [
    ['Endpoint records', rows.length, `${state.assets.length} records loaded${state.truncated ? ' · Partial inventory' : ''}`, ''],
    ['Critical exposure', critical, `${labelSum('critical_vulnerabilities')} critical findings`, 'critical'],
    ['Vulnerable endpoints', vulnerable, `${labelSum('other_vulnerabilities')} other findings`, 'vulnerable'],
    ['Reboots pending', reboot, `${labelSum('total_updates')} missing updates`, 'reboot'],
  ];
  $('stats').innerHTML = metrics.map(([label, n, sub, riskValue]) => `<button class="card ${riskValue === 'critical' ? 'alert' : ''}" data-filter="risk" data-value="${riskValue}"><span class="label">${label}</span><strong>${n === null ? '—' : n.toLocaleString()}</strong><small>${esc(sub)}</small></button>`).join('');
  bars('exposure', [['Critical findings', sum('critical_vulnerabilities'), '#cc5655', 'risk', 'critical'], ['Other findings', sum('other_vulnerabilities'), '#e4ae56', 'risk', 'vulnerable']]);
  const groups = field => Object.entries(rows.reduce((out, asset) => { const value = asset[field] || 'Unknown'; out[value] = (out[value] || 0) + 1; return out; }, {})).sort((a, b) => b[1] - a[1]);
  bars('connections', groups('status').map(([status, n]) => [status, n, status === 'Connected' ? '#008b80' : '#94a8b1', status === 'Unknown' ? null : 'status', status]));
  bars('systems', groups('OS').map(([os, n]) => [os, n, '#008b80', os === 'Unknown' ? null : 'os', os]));
  const unknown = rows.filter(asset => numeric.some(field => asset[field] === null)).length;
  $('coverage').textContent = unknown ? `${unknown} filtered endpoints have unavailable counts. Metrics use known values only; unknown does not mean zero.` : 'Counts are reported findings across endpoints, not unique CVEs.';
  state.page = Math.min(state.page, Math.max(0, Math.ceil(rows.length / 12) - 1));
  const chunk = rows.slice(state.page * 12, state.page * 12 + 12);
  $('count').textContent = `${rows.length} of ${state.assets.length} loaded records${state.truncated ? ' · Partial inventory' : ''} · Select an asset for details`;
  $('rows').innerHTML = chunk.map(asset => `<tr><td><button data-id="${esc(asset.id)}">${esc(asset.name)}</button><span class="sub">${esc(asset.address || 'No IP recorded')}</span></td><td><span class="badge ${asset.status === 'Connected' ? 'online' : ''}">${esc(asset.status || 'Unknown')}</span></td><td>${esc(asset.OS || 'Unknown')}</td><td>${asset.critical_vulnerabilities > 0 ? `<span class="critical">${asset.critical_vulnerabilities}</span>` : display(asset.critical_vulnerabilities)}</td><td>${display(asset.other_vulnerabilities)}</td><td>${display(asset.total_updates)}${isReboot(asset.reboot_required) ? '<span class="sub">Reboot required</span>' : ''}</td><td>${esc(asset.last_seen || 'Unknown')}</td></tr>`).join('') || `<tr><td colspan="7">${state.mode === 'empty' ? 'Select an organization to load its endpoint inventory.' : 'No endpoints match these filters.'}</td></tr>`;
  $('page-info').textContent = rows.length ? `${state.page * 12 + 1}–${Math.min(state.page * 12 + 12, rows.length)} of ${rows.length}` : '0 results';
  $('prev').disabled = state.page === 0;
  $('next').disabled = (state.page + 1) * 12 >= rows.length;
  $('export').disabled = !state.assets.length || state.busy;
  $('load-more').hidden = !state.truncated || state.mode !== 'live';
  $('load-more').disabled = state.busy || state.nextFrom === null;
  $('refresh').disabled = state.busy;
  $('organization').disabled = state.busy;
  $('import').disabled = state.busy;
  $('inventory').setAttribute('aria-busy', String(state.busy));
}

function clearFilters() { for (const id of ['search', 'status', 'os', 'risk']) $(id).value = ''; state.page = 0; render(); }
function source(name, note, kind = '') {
  $('source-name').textContent = name; $('source-note').textContent = note;
  $('source').className = `source ${kind}`;
  $('connection-label').textContent = kind === 'live' ? 'Action1 connected' : kind === 'loading' ? 'Connecting to Action1' : 'Read-only reporting';
}
function toast(message) { $('toast').textContent = message; $('toast').style.display = 'block'; setTimeout(() => { $('toast').style.display = 'none'; }, 6000); }

async function request(path) {
  const token = document.querySelector('meta[name="dashboard-token"]')?.content;
  if (!token) throw new Error('Start the local dashboard with npm run dashboard, then open its local URL.');
  const response = await fetch(path, { headers: { 'X-Dashboard-Token': token }, cache: 'no-store' });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Cannot load Action1 data.');
  return data;
}

async function loadAssets(append = false) {
  if (state.busy || !$('organization').value) return;
  const organizationId = $('organization').value;
  if (state.organizationId !== organizationId || state.mode !== 'live') {
    state.assets = []; state.nextFrom = null; state.truncated = false;
  }
  state.organizationId = organizationId;
  state.busy = true; render();
  source('Reading Action1 inventory', 'Loading the selected organization. Large inventories can take a moment.', 'loading');
  try {
    const from = append ? state.nextFrom : 0;
    const data = await request(`/api/assets?organizationId=${encodeURIComponent(organizationId)}&from=${from}`);
    const incoming = normalize(data.items);
    state.assets = append ? [...new Map([...state.assets, ...incoming].map(asset => [asset.id, asset])).values()] : incoming;
    state.mode = 'live'; state.truncated = Boolean(data.truncated); state.nextFrom = Number.isSafeInteger(data.nextFrom) && data.nextFrom > from ? data.nextFrom : null;
    const organizationName = $('organization').selectedOptions[0].textContent;
    source(`Action1 · ${organizationName}`, `Retrieved ${new Date(data.retrievedAt).toLocaleString()} · NA-2 · ${state.truncated ? 'Partial inventory — load more records below' : 'All returned records loaded'} · Last-seen timezone unverified`, 'live');
    options(); state.page = 0;
  } catch (error) {
    source('Action1 refresh failed', `${error.message}${state.assets.length ? ' Displaying the previous read; it may be stale.' : ''}`, 'error');
    toast(error.message);
  } finally { state.busy = false; render(); }
}

async function loadOrganizations() {
  state.busy = true; render(); source('Connecting to Action1', 'Unlock or authorize 1Password if prompted.', 'loading');
  try {
    const data = await request('/api/organizations');
    $('organization').innerHTML = '<option value="">Select an organization</option>' + data.items.map(organization => `<option value="${esc(organization.id)}">${esc(organization.name)}</option>`).join('');
    $('organization-note').textContent = data.truncated ? 'Organization list is partial. Only discovered organizations are available.' : 'Choose the organization whose inventory you want to view.';
    source('Action1 ready', data.items.length ? 'Select an organization to retrieve its inventory.' : 'No organizations were returned by the gateway.', 'live');
    if (!data.truncated && data.items.length === 1) $('organization').value = data.items[0].id;
  } catch (error) { source('Action1 connection unavailable', error.message, 'error'); }
  finally { state.busy = false; render(); }
  if ($('organization').value) await loadAssets();
}

for (const id of ['search', 'status', 'os', 'risk']) $(id).addEventListener('input', () => { state.page = 0; render(); });
$('prev').onclick = () => { state.page--; render(); };
$('next').onclick = () => { state.page++; render(); };
$('clear').onclick = clearFilters;
$('organization').onchange = () => {
  if (!$('organization').value) { state.assets = []; state.mode = 'empty'; state.truncated = false; state.organizationId = ''; options(); clearFilters(); source('Action1 ready', 'Select an organization to retrieve its inventory.', 'live'); return; }
  clearFilters(); loadAssets();
};
$('refresh').onclick = () => $('organization').value ? loadAssets() : loadOrganizations();
$('load-more').onclick = () => loadAssets(true);
$('close').onclick = () => $('detail').close();
document.addEventListener('click', event => {
  const filter = event.target.closest('[data-filter]');
  if (filter) { $(filter.dataset.filter).value = filter.dataset.value; state.page = 0; render(); }
  const sort = event.target.closest('[data-sort]');
  if (sort) { state.direction = state.sort === sort.dataset.sort ? -state.direction : 1; state.sort = sort.dataset.sort; render(); }
  const detail = event.target.closest('[data-id]');
  if (detail) {
    const record = state.assets.find(asset => asset.id === detail.dataset.id);
    if (!record) return;
    $('detail-title').textContent = record.name;
    $('detail-body').innerHTML = '<dl>' + fields.map(field => `<dt>${esc(field.replaceAll('_', ' '))}</dt><dd>${record[field] === null || record[field] === '' ? 'Not supplied' : esc(record[field])}</dd>`).join('') + '</dl>';
    $('detail').showModal();
  }
  const nav = event.target.closest('[data-view]');
  if (nav) {
    document.querySelectorAll('.nav').forEach(button => button.classList.toggle('active', button === nav));
    $('title').textContent = nav.dataset.view === 'all' ? 'Asset overview' : nav.dataset.view === 'updates' ? 'Missing updates' : 'Vulnerabilities';
    $('risk').value = nav.dataset.view === 'all' ? '' : nav.dataset.view; state.page = 0; render();
  }
});
$('import').onchange = async event => {
  try {
    const file = event.target.files[0]; if (!file || state.busy) return;
    if (file.size > 10 * 1024 * 1024) throw new Error('CSV must be smaller than 10 MB.');
    const records = parseCSV(await file.text());
    if (state.busy) return;
    state.assets = records; state.mode = 'import'; state.truncated = false; state.nextFrom = null;
    source(`Imported inventory · ${file.name}`, 'Browser-only import · Source date and timezone unverified · Refresh to return to Action1');
    options(); clearFilters(); toast(`Imported ${state.assets.length} endpoint records`);
  } catch (error) { toast(error.message); } finally { event.target.value = ''; }
};
$('export').onclick = () => {
  const url = URL.createObjectURL(new Blob([exportCSV(state.filtered)], { type: 'text/csv;charset=utf-8' }));
  const anchor = document.createElement('a'); anchor.href = url;
  anchor.download = `action1-${state.truncated ? 'partial-' : ''}assets-${new Date().toISOString().slice(0, 10)}.csv`; anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};
options(); render(); loadOrganizations();


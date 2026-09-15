(() => {
'use strict';
const $ = (id) => document.getElementById(id);
const states = 'AC AL AP AM BA CE DF ES GO MA MT MS MG PA PB PR PE PI RJ RN RS RO RR SC SP SE TO'.split(' ');
$('form').elements.state.innerHTML = '<option value="">Selecione</option>' + states.map((s) => '<option>' + s + '</option>').join('');

const digits = (s) => String(s || '').replace(/\D/g, '');
const clean = (s) => String(s || '').trim().replace(/\s+/g, ' ');
const escape = (s) => String(s || '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// ---------- Senha de gestão ----------
const ADMIN_KEY = 'intercnc-admin-pass';
function adminPassword() { return sessionStorage.getItem(ADMIN_KEY) || ''; }
function setAdminPassword(p) { sessionStorage.setItem(ADMIN_KEY, p); }
function clearAdminPassword() { sessionStorage.removeItem(ADMIN_KEY); }

async function api(path, { method = 'GET', body, admin = false } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (admin) headers['x-admin-password'] = adminPassword();
  const res = await fetch(path, { method, headers, body: body ? JSON.stringify(body) : undefined });
  let data = null;
  try { data = await res.json(); } catch { /* sem corpo */ }
  if (!res.ok) {
    const err = new Error((data && data.error) || 'Erro na requisição.');
    err.status = res.status;
    throw err;
  }
  return data;
}

// ---------- Formulário de cadastro ----------
function type() { return $('form').elements.type.value; }
function toggle() {
  const owner = type() === 'Proprietário';
  $('cnpj-field').classList.toggle('hidden', !owner);
  $('cpf-field').classList.toggle('hidden', owner);
  $('form').elements.cnpj.required = owner;
  $('form').elements.cpf.required = !owner;
  $('form').elements.cnpj.disabled = !owner;
  $('form').elements.cpf.disabled = owner;
}
document.querySelectorAll('[name=type]').forEach((el) => el.addEventListener('change', toggle));
toggle();

function validCPF(value) {
  const d = digits(value);
  if (d.length !== 11 || /^(\d)\1+$/.test(d)) return false;
  for (let n = 9; n <= 10; n++) {
    let sum = 0;
    for (let i = 0; i < n; i++) sum += Number(d[i]) * (n + 1 - i);
    let check = (sum * 10) % 11;
    if (check === 10) check = 0;
    if (check !== Number(d[n])) return false;
  }
  return true;
}
function validCNPJ(value) {
  const d = digits(value);
  if (d.length !== 14 || /^(\d)\1+$/.test(d)) return false;
  for (const weights of [[5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2], [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]]) {
    const n = weights.length;
    const sum = weights.reduce((a, w, i) => a + Number(d[i]) * w, 0);
    const mod = sum % 11;
    if (Number(d[n]) !== (mod < 2 ? 0 : 11 - mod)) return false;
  }
  return true;
}

function message(t, error = false) {
  const el = $('form-status');
  el.textContent = t;
  el.className = 'status show' + (error ? ' error' : '');
}

function label(r) {
  const el = $('print-label');
  el.innerHTML = '<div class="brand">INTER<b>CNC</b></div><div class="id">INSCRIÇÃO ' + escape(r.id) + '</div><div class="name">' + escape(r.name) + '</div><div class="detail">' + escape(r.type) + ' · ' + escape(r.role) + '</div><div class="detail">' + escape(r.company) + ' · ' + escape(r.city) + '/' + escape(r.state) + '</div>';
  el.classList.add('printing');
  setTimeout(() => window.print(), 50);
}
window.addEventListener('afterprint', () => $('print-label').classList.remove('printing'));

$('form').addEventListener('reset', () => { setTimeout(toggle, 0); $('form-status').classList.remove('show'); });

$('form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const f = e.currentTarget;
  if (!f.reportValidity()) return;
  const data = new FormData(f);
  const owner = type() === 'Proprietário';
  const documentNumber = digits(data.get(owner ? 'cnpj' : 'cpf'));
  if (owner && !validCNPJ(documentNumber)) { message('CNPJ inválido. Confira os números digitados.', true); f.elements.cnpj.focus(); return; }
  if (!owner && !validCPF(documentNumber)) { message('CPF inválido. Confira os números digitados.', true); f.elements.cpf.focus(); return; }
  const phone = digits(data.get('phone'));
  if (phone.length < 10 || phone.length > 11) { message('Informe um WhatsApp válido com DDD.', true); f.elements.phone.focus(); return; }

  const payload = {
    type: type(),
    name: clean(data.get('name')),
    email: clean(data.get('email')).toLowerCase(),
    phone,
    company: clean(data.get('company')),
    cnpj: documentNumber,
    cpf: documentNumber,
    role: clean(data.get('role')),
    city: clean(data.get('city')),
    state: clean(data.get('state')),
  };

  const submitBtn = f.querySelector('button[type=submit]');
  submitBtn.disabled = true;
  try {
    const r = await api('/api/registros', { method: 'POST', body: payload });
    message('Cadastro realizado! Inscrição ' + r.id + '. A etiqueta será aberta para impressão.');
    label(r);
    f.reset();
    setTimeout(toggle, 0);
  } catch (err) {
    message(err.message || 'Não foi possível salvar. Tente novamente.', true);
  } finally {
    submitBtn.disabled = false;
  }
});

// ---------- Gestão (protegida por senha) ----------
function switchTab(manage) {
  $('register').classList.toggle('hidden', manage);
  $('manage').classList.toggle('hidden', !manage);
  $('tab-register').classList.toggle('active', !manage);
  $('tab-manage').classList.toggle('active', manage);
  if (manage) enterManage();
}
$('tab-register').onclick = () => switchTab(false);
$('tab-manage').onclick = () => switchTab(true);

function adminMessage(t, error = false) {
  const el = $('admin-status');
  el.textContent = t;
  el.className = 'status show' + (error ? ' error' : '');
}

async function enterManage() {
  let required = true;
  try { required = (await api('/api/admin/status')).required; } catch { /* assume que exige senha */ }

  if (!required) { await render(); showContent(); return; }

  if (!adminPassword()) { showGate(); return; }
  // valida a senha guardada tentando carregar a lista
  try {
    await render();
    showContent();
  } catch (err) {
    clearAdminPassword();
    showGate();
    if (err.status === 401) adminMessage('Sessão expirada, informe a senha novamente.', true);
  }
}
function showGate() { $('admin-gate').classList.remove('hidden'); $('admin-content').classList.add('hidden'); }
function showContent() { $('admin-gate').classList.add('hidden'); $('admin-content').classList.remove('hidden'); }

$('admin-login').onclick = async () => {
  const pass = $('admin-password').value;
  if (!pass) { adminMessage('Digite a senha.', true); return; }
  setAdminPassword(pass);
  try {
    await render();
    showContent();
    $('admin-password').value = '';
  } catch (err) {
    clearAdminPassword();
    adminMessage(err.message || 'Senha incorreta.', true);
  }
};
$('admin-password').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('admin-login').click(); });

let lastRecords = [];
async function render() {
  lastRecords = await api('/api/registros', { admin: true });
  const all = lastRecords;
  $('total').textContent = all.length;
  $('owners').textContent = all.filter((r) => r.type === 'Proprietário').length;
  $('employees').textContent = all.filter((r) => r.type === 'Funcionário').length;
  const q = clean($('search').value).toLowerCase();
  const filter = $('filter').value;
  const shown = all.filter((r) => (!filter || r.type === filter) && (!q || [r.name, r.company, r.document, r.id].some((v) => String(v || '').toLowerCase().includes(q)))).reverse();
  $('rows').innerHTML = shown.length
    ? shown.map((r) => '<tr><td>' + escape(r.id) + '</td><td>' + escape(r.name) + '</td><td>' + escape(r.type) + '</td><td>' + escape(r.company) + '</td><td>' + escape(r.city) + ' / ' + escape(r.state) + '</td><td>' + escape(new Date(r.registeredAt).toLocaleString('pt-BR')) + '</td><td><button data-action="print" data-id="' + escape(r.id) + '">Etiqueta</button><button data-action="delete" data-id="' + escape(r.id) + '">Excluir</button></td></tr>').join('')
    : '<tr><td colspan="7" class="empty">Nenhuma inscrição encontrada.</td></tr>';
}
$('search').oninput = render;
$('filter').onchange = render;
$('refresh').onclick = () => render().catch((err) => adminMessage(err.message, true));

$('rows').onclick = async (e) => {
  const b = e.target.closest('button[data-id]');
  if (!b) return;
  const r = lastRecords.find((x) => x.id === b.dataset.id);
  if (!r) return;
  if (b.dataset.action === 'print') { label(r); return; }
  if (confirm('Excluir definitivamente a inscrição de ' + r.name + '?')) {
    try { await api('/api/registros/' + encodeURIComponent(r.id), { method: 'DELETE', admin: true }); await render(); }
    catch (err) { adminMessage(err.message, true); }
  }
};

function download(name, content, mime) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = name;
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 3000);
}
const date = () => new Date().toISOString().slice(0, 10);

$('export').onclick = async () => {
  const a = lastRecords.length ? lastRecords : await api('/api/registros', { admin: true }).catch(() => []);
  if (!a.length) { alert('Não há cadastros para exportar.'); return; }
  const headers = ['ID da inscrição', 'Data do cadastro', 'Perfil', 'Nome completo', 'E-mail', 'WhatsApp', 'Empresa', 'CNPJ', 'CPF', 'Cargo / função', 'Cidade', 'Estado', 'Consentimento comercial', 'Data do consentimento'];
  const csv = (v) => '"' + String(v ?? '').replace(/"/g, '""') + '"';
  const lines = [headers, ...a.map((r) => [r.id, new Date(r.registeredAt).toLocaleString('pt-BR'), r.type, r.name, r.email, r.phone, r.company, r.type === 'Proprietário' ? r.document : '', r.type === 'Funcionário' ? r.document : '', r.role, r.city, r.state, r.consent ? 'Sim' : 'Não', new Date(r.consentAt).toLocaleString('pt-BR')])];
  download('intercnc-inscricoes-' + date() + '.csv', '\uFEFF' + lines.map((row) => row.map(csv).join(';')).join('\r\n'), 'text/csv;charset=utf-8');
};

$('backup').onclick = async () => {
  const a = lastRecords.length ? lastRecords : await api('/api/registros', { admin: true }).catch(() => []);
  download('intercnc-backup-' + date() + '.json', JSON.stringify(a, null, 2), 'application/json');
};

$('restore-button').onclick = () => $('restore-file').click();
$('restore-file').onchange = async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  try {
    const incoming = JSON.parse(await file.text());
    if (!Array.isArray(incoming) || incoming.some((r) => !r.id || !r.name || !r.document || !r.registeredAt)) throw new Error('Formato inválido');
    if (!confirm('Importar até ' + incoming.length + ' inscrições deste backup? Registros com o mesmo ID já existente serão ignorados.')) return;
    const result = await api('/api/registros/import', { method: 'POST', admin: true, body: { records: incoming } });
    await render();
    alert((result.imported || 0) + ' inscrições importadas.');
  } catch (err) {
    alert(err.message || 'Backup inválido ou não foi possível importar os dados.');
  } finally {
    e.target.value = '';
  }
};

$('draw').onclick = async () => {
  if (!lastRecords.length) await render().catch(() => {});
  if (!lastRecords.length) { alert('Não há inscritos para o sorteio.'); return; }
  if (!confirm('Sortear uma inscrição entre os ' + lastRecords.length + ' cadastros?')) return;
  try {
    const r = await api('/api/sorteio', { method: 'POST', admin: true });
    $('winner').classList.remove('hidden');
    $('winner').innerHTML = '<div>Inscrição sorteada</div><strong>' + escape(r.name) + '</strong><div>' + escape(r.id) + ' · ' + escape(r.type) + ' · ' + escape(r.company) + '</div><div style="margin-top:10px">' + escape(r.email) + ' · ' + escape(r.phone) + '</div><button class="secondary" style="margin-top:12px" id="winner-print">Imprimir etiqueta</button>';
    $('winner-print').onclick = () => label(r);
  } catch (err) {
    alert(err.message || 'Não foi possível realizar o sorteio.');
  }
};

$('clear').onclick = async () => {
  if (!lastRecords.length) await render().catch(() => {});
  if (!lastRecords.length) return;
  const text = prompt('Para apagar todos os dados do servidor, digite APAGAR. Faça um backup antes.');
  if (text !== 'APAGAR') return;
  try {
    await api('/api/registros', { method: 'DELETE', admin: true });
    $('winner').classList.add('hidden');
    await render();
  } catch (err) {
    alert(err.message || 'Não foi possível apagar os dados.');
  }
};
})();

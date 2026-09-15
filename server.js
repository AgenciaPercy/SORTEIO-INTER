const express = require('express');
const fs = require('node:fs/promises');
const fssync = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const app = express();
app.use(express.json({ limit: '1mb' }));

// ---------- Armazenamento ----------
// Em produção no Railway, defina a variável DATA_DIR apontando para um Volume
// (ex: /data) para que os cadastros sobrevivam a redeploys/restarts.
// Sem volume configurado, os dados ficam no filesystem efêmero do container
// e são perdidos a cada novo deploy.
const DATA_DIR = process.env.DATA_DIR || __dirname;
const DATA_FILE = path.join(DATA_DIR, 'registros.json');

if (!fssync.existsSync(DATA_DIR)) fssync.mkdirSync(DATA_DIR, { recursive: true });
if (!fssync.existsSync(DATA_FILE)) fssync.writeFileSync(DATA_FILE, '[]');

// Fila simples para evitar duas escritas concorrentes corromperem o arquivo
let writeQueue = Promise.resolve();
function withLock(fn) {
  const result = writeQueue.then(fn, fn);
  writeQueue = result.catch(() => {});
  return result;
}

async function readAll() {
  const raw = await fs.readFile(DATA_FILE, 'utf8').catch(() => '[]');
  try {
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

async function writeAll(arr) {
  const tmp = DATA_FILE + '.tmp';
  await fs.writeFile(tmp, JSON.stringify(arr, null, 2));
  await fs.rename(tmp, DATA_FILE);
}

// ---------- Validação (mesma regra do formulário) ----------
const digits = (s) => String(s || '').replace(/\D/g, '');

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
  for (const weights of [
    [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2],
    [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2],
  ]) {
    const n = weights.length;
    const sum = weights.reduce((a, w, i) => a + Number(d[i]) * w, 0);
    const mod = sum % 11;
    if (Number(d[n]) !== (mod < 2 ? 0 : 11 - mod)) return false;
  }
  return true;
}

const clean = (s) => String(s || '').trim().replace(/\s+/g, ' ');

function genId() {
  return (
    'IC-' +
    Date.now().toString(36).toUpperCase() +
    '-' +
    Math.floor(Math.random() * 65536).toString(36).toUpperCase().padStart(3, '0')
  );
}

// ---------- Autenticação simples da aba Gestão ----------
// Defina ADMIN_PASSWORD nas variáveis de ambiente do Railway.
// Ações de gestão (listar, excluir, sortear, limpar) exigem o cabeçalho
// x-admin-password com esse valor.
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || '';

function timingSafeEqual(a, b) {
  const bufA = Buffer.from(String(a));
  const bufB = Buffer.from(String(b));
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

function requireAdmin(req, res, next) {
  if (!ADMIN_PASSWORD) return next(); // sem senha configurada = gestão aberta para quem tiver o link
  const sent = req.get('x-admin-password') || '';
  if (!sent || !timingSafeEqual(sent, ADMIN_PASSWORD)) {
    return res.status(401).json({ error: 'Senha de gestão inválida.' });
  }
  next();
}

// Diz ao frontend se a senha está ativa, sem exigir autenticação para perguntar isso
app.get('/api/admin/status', (_req, res) => res.json({ required: Boolean(ADMIN_PASSWORD) }));

// ---------- Rotas ----------

// Cadastro público (usado pela tela de inscrição, sem senha)
app.post('/api/registros', async (req, res) => {
  const b = req.body || {};
  const type = b.type === 'Proprietário' ? 'Proprietário' : b.type === 'Funcionário' ? 'Funcionário' : '';
  if (!type) return res.status(400).json({ error: 'Selecione o perfil (Proprietário ou Funcionário).' });

  const owner = type === 'Proprietário';
  const documentNumber = digits(owner ? b.cnpj : b.cpf);
  if (owner && !validCNPJ(documentNumber)) {
    return res.status(400).json({ error: 'CNPJ inválido. Confira os números digitados.' });
  }
  if (!owner && !validCPF(documentNumber)) {
    return res.status(400).json({ error: 'CPF inválido. Confira os números digitados.' });
  }

  const phone = digits(b.phone);
  if (phone.length < 10 || phone.length > 11) {
    return res.status(400).json({ error: 'Informe um WhatsApp válido com DDD.' });
  }

  const name = clean(b.name);
  const email = clean(b.email).toLowerCase();
  const company = clean(b.company);
  const role = clean(b.role);
  const city = clean(b.city);
  const state = clean(b.state);
  if (!name || !email || !company || !city || !state) {
    return res.status(400).json({ error: 'Preencha todos os campos obrigatórios.' });
  }

  const result = await withLock(async () => {
    const all = await readAll();
    const dup = all.some((r) => r.type === type && r.document === documentNumber);
    if (dup) return { error: 'Este documento já foi cadastrado.' };

    const r = {
      id: genId(),
      registeredAt: new Date().toISOString(),
      type,
      name,
      email,
      phone,
      company,
      document: documentNumber,
      role,
      city,
      state,
      consent: true,
      consentAt: new Date().toISOString(),
    };
    all.push(r);
    await writeAll(all);
    return { record: r };
  });

  if (result.error) return res.status(409).json({ error: result.error });
  res.status(201).json(result.record);
});

// Listagem — protegida por senha de gestão
app.get('/api/registros', requireAdmin, async (_req, res) => {
  const all = await readAll();
  res.json(all);
});

// Exclusão individual — protegida
app.delete('/api/registros/:id', requireAdmin, async (req, res) => {
  const result = await withLock(async () => {
    const all = await readAll();
    const next = all.filter((r) => r.id !== req.params.id);
    if (next.length === all.length) return { notFound: true };
    await writeAll(next);
    return { ok: true };
  });
  if (result.notFound) return res.status(404).json({ error: 'Inscrição não encontrada.' });
  res.json({ ok: true });
});

// Limpar tudo — protegida
app.delete('/api/registros', requireAdmin, async (_req, res) => {
  await withLock(() => writeAll([]));
  res.json({ ok: true });
});

// Importar backup JSON — protegida (mescla por id, ignora duplicados)
app.post('/api/registros/import', requireAdmin, async (req, res) => {
  const incoming = (req.body || {}).records;
  if (!Array.isArray(incoming)) return res.status(400).json({ error: 'Formato inválido.' });

  const result = await withLock(async () => {
    const all = await readAll();
    const known = new Set(all.map((r) => r.id));
    const fresh = incoming.filter((r) => r && r.id && r.name && r.document && r.registeredAt && !known.has(r.id));
    await writeAll([...all, ...fresh]);
    return fresh.length;
  });

  res.json({ imported: result });
});

// Sorteio — protegida
app.post('/api/sorteio', requireAdmin, async (_req, res) => {
  const all = await readAll();
  if (!all.length) return res.status(400).json({ error: 'Não há inscritos para o sorteio.' });
  const bytes = new Uint32Array(1);
  crypto.getRandomValues(bytes);
  const winner = all[bytes[0] % all.length];
  res.json(winner);
});

// Verificar senha (usado só para validar o login da aba Gestão)
app.post('/api/admin/login', (req, res) => {
  if (!ADMIN_PASSWORD) return res.status(500).json({ error: 'ADMIN_PASSWORD não configurada no servidor.' });
  const sent = (req.body || {}).password || '';
  if (!timingSafeEqual(sent, ADMIN_PASSWORD)) return res.status(401).json({ error: 'Senha incorreta.' });
  res.json({ ok: true });
});

app.use(express.static(path.join(__dirname, 'public'), { extensions: ['html'] }));

const port = Number(process.env.PORT || 3000);
app.listen(port, '0.0.0.0', () => console.log(`INTERCNC disponível na porta ${port}`));

// خادم منصة "تفوّق ١٢" — بدون أي مكتبات خارجية (Node.js 18+)
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const PORT = Number(process.env.PORT) || 3000;
const ROOT = __dirname;
const PUBLIC_DIR = path.join(ROOT, 'public');
const DATA_DIR = path.join(ROOT, 'data');
const DB_FILE = path.join(DATA_DIR, 'db.json');
const AUTH_FILE = path.join(DATA_DIR, 'auth.json');
const DEFAULT_PASSWORD = process.env.ADMIN_PASSWORD || 'oman2026';
const SESSION_TTL_MS = 8 * 60 * 60 * 1000;
const MAX_BODY = 5 * 1024 * 1024;

// ---------- التخزين ----------
function writeJsonAtomic(file, data) {
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
  fs.renameSync(tmp, file);
}

function loadDb() {
  if (!fs.existsSync(DB_FILE)) {
    const seed = require('./data/seed');
    const db = { subjects: seed, attempts: {} };
    writeJsonAtomic(DB_FILE, db);
    return db;
  }
  return JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
}

let db = loadDb();
const saveDb = () => writeJsonAtomic(DB_FILE, db);

function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return { salt, hash };
}

function loadAuth() {
  if (!fs.existsSync(AUTH_FILE)) {
    const auth = hashPassword(DEFAULT_PASSWORD);
    writeJsonAtomic(AUTH_FILE, auth);
    return auth;
  }
  return JSON.parse(fs.readFileSync(AUTH_FILE, 'utf8'));
}

let auth = loadAuth();

function checkPassword(password) {
  if (typeof password !== 'string') return false;
  const { hash } = hashPassword(password, auth.salt);
  return crypto.timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(auth.hash, 'hex'));
}

// ---------- الجلسات ----------
const sessions = new Map();
const loginFailures = new Map();

function createSession() {
  const token = crypto.randomBytes(32).toString('hex');
  sessions.set(token, Date.now() + SESSION_TTL_MS);
  return token;
}

function isAuthed(req) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  const expires = sessions.get(token);
  if (!expires) return false;
  if (expires < Date.now()) {
    sessions.delete(token);
    return false;
  }
  return true;
}

function tooManyFailures(ip) {
  const entry = loginFailures.get(ip);
  if (!entry) return false;
  if (Date.now() - entry.first > 15 * 60 * 1000) {
    loginFailures.delete(ip);
    return false;
  }
  return entry.count >= 10;
}

function recordFailure(ip) {
  const entry = loginFailures.get(ip) || { count: 0, first: Date.now() };
  entry.count += 1;
  loginFailures.set(ip, entry);
}

// ---------- التحقق من البيانات ----------
const isText = (v, max = 2000) => typeof v === 'string' && v.trim().length > 0 && v.length <= max;
const isId = (v) => typeof v === 'string' && /^[a-z0-9-]{1,64}$/i.test(v);

function validateSubject(s) {
  if (!s || typeof s !== 'object') return 'بيانات المادة غير صالحة';
  if (!isId(s.id)) return 'معرّف المادة غير صالح (حروف إنجليزية وأرقام وشرطة فقط)';
  if (!isText(s.name, 100)) return 'اسم المادة مطلوب';
  if (!['scientific', 'core'].includes(s.category)) return 'تصنيف المادة غير صالح';
  if (s.lang != null && !['ar', 'en'].includes(s.lang)) return 'لغة المحتوى غير صالحة';
  if (!Array.isArray(s.units)) return 'الوحدات غير صالحة';
  for (const [ui, u] of s.units.entries()) {
    if (!isId(u.id) || !isText(u.title, 200)) return `الوحدة رقم ${ui + 1}: العنوان مطلوب`;
    if (!Array.isArray(u.lessons)) return `الوحدة "${u.title}": الدروس غير صالحة`;
    for (const [li, l] of u.lessons.entries()) {
      if (!isId(l.id) || !isText(l.title, 200)) return `الوحدة "${u.title}"، الدرس ${li + 1}: العنوان مطلوب`;
      if (!Array.isArray(l.questions)) return `الدرس "${l.title}": الأسئلة غير صالحة`;
      for (const [qi, q] of l.questions.entries()) {
        const where = `الدرس "${l.title}"، السؤال ${qi + 1}`;
        if (!isId(q.id) || !isText(q.q)) return `${where}: نص السؤال مطلوب`;
        if (!Array.isArray(q.options) || q.options.length < 2 || q.options.length > 6 || !q.options.every((o) => isText(o, 500)))
          return `${where}: يجب أن يحتوي على 2 إلى 6 خيارات غير فارغة`;
        if (!Number.isInteger(q.answer) || q.answer < 0 || q.answer >= q.options.length) return `${where}: حدّد الإجابة الصحيحة`;
        if (q.explanation != null && typeof q.explanation !== 'string') return `${where}: الشرح غير صالح`;
      }
    }
  }
  return null;
}

// ---------- أدوات HTTP ----------
function send(res, status, body) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  });
  res.end(JSON.stringify(body));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > MAX_BODY) {
        reject(Object.assign(new Error('حجم البيانات كبير جداً'), { status: 413 }));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => {
      if (!chunks.length) return resolve({});
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
      } catch {
        reject(Object.assign(new Error('صيغة JSON غير صالحة'), { status: 400 }));
      }
    });
    req.on('error', reject);
  });
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
};

function serveStatic(req, res, pathname) {
  let rel;
  try {
    rel = decodeURIComponent(pathname);
  } catch {
    res.writeHead(400).end();
    return;
  }
  if (rel === '/') rel = '/index.html';
  if (rel === '/admin' || rel === '/admin/') rel = '/admin.html';
  const file = path.normalize(path.join(PUBLIC_DIR, rel));
  if (!file.startsWith(PUBLIC_DIR + path.sep)) {
    res.writeHead(403).end();
    return;
  }
  fs.readFile(file, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('الصفحة غير موجودة');
      return;
    }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
    res.end(data);
  });
}

// ---------- ملخصات للواجهة العامة ----------
const findSubject = (id) => db.subjects.find((s) => s.id === id);

function subjectSummary(s) {
  const lessons = s.units.flatMap((u) => u.lessons);
  return {
    id: s.id,
    name: s.name,
    category: s.category,
    color: s.color,
    icon: s.icon,
    description: s.description || '',
    lang: s.lang || 'ar',
    unitCount: s.units.length,
    lessonCount: lessons.length,
    questionCount: lessons.reduce((n, l) => n + l.questions.length, 0),
  };
}

function subjectOutline(s) {
  return {
    ...subjectSummary(s),
    units: s.units.map((u) => ({
      id: u.id,
      title: u.title,
      lessons: u.lessons.map((l) => ({ id: l.id, title: l.title, questionCount: l.questions.length })),
    })),
  };
}

function findLesson(subject, lessonId) {
  for (const u of subject.units) {
    const l = u.lessons.find((x) => x.id === lessonId);
    if (l) return { unit: u, lesson: l };
  }
  return null;
}

// ---------- التوجيه ----------
async function handleApi(req, res, pathname) {
  const parts = pathname.split('/').filter(Boolean).slice(1); // بعد "api"
  const method = req.method;

  // --- عام ---
  if (method === 'GET' && parts[0] === 'subjects' && parts.length === 1) {
    return send(res, 200, db.subjects.map(subjectSummary));
  }
  if (method === 'GET' && parts[0] === 'subjects' && parts.length === 2) {
    const s = findSubject(parts[1]);
    return s ? send(res, 200, subjectOutline(s)) : send(res, 404, { error: 'المادة غير موجودة' });
  }
  if (method === 'GET' && parts[0] === 'subjects' && parts[2] === 'lessons' && parts.length === 4) {
    const s = findSubject(parts[1]);
    const found = s && findLesson(s, parts[3]);
    if (!found) return send(res, 404, { error: 'الدرس غير موجود' });
    return send(res, 200, {
      subject: { id: s.id, name: s.name, color: s.color, icon: s.icon, lang: s.lang || 'ar' },
      unit: { id: found.unit.id, title: found.unit.title },
      lesson: found.lesson,
    });
  }
  if (method === 'POST' && parts[0] === 'attempts' && parts.length === 1) {
    const body = await readBody(req);
    const s = findSubject(body.subjectId);
    if (!s || !findLesson(s, body.lessonId)) return send(res, 400, { error: 'بيانات غير صالحة' });
    const score = Number(body.score);
    const total = Number(body.total);
    if (!Number.isInteger(score) || !Number.isInteger(total) || total <= 0 || total > 100 || score < 0 || score > total)
      return send(res, 400, { error: 'بيانات غير صالحة' });
    const key = `${s.id}/${body.lessonId}`;
    const stat = db.attempts[key] || { count: 0, sumPercent: 0, passed: 0 };
    const pct = (score / total) * 100;
    stat.count += 1;
    stat.sumPercent += pct;
    if (pct >= 60) stat.passed += 1;
    db.attempts[key] = stat;
    saveDb();
    return send(res, 201, { ok: true });
  }

  // --- الإدارة ---
  if (parts[0] !== 'admin') return send(res, 404, { error: 'غير موجود' });

  if (method === 'POST' && parts[1] === 'login') {
    const ip = req.socket.remoteAddress || '';
    if (tooManyFailures(ip)) return send(res, 429, { error: 'محاولات كثيرة، حاول بعد ١٥ دقيقة' });
    const body = await readBody(req);
    if (!checkPassword(body.password)) {
      recordFailure(ip);
      return send(res, 401, { error: 'كلمة المرور غير صحيحة' });
    }
    loginFailures.delete(ip);
    return send(res, 200, { token: createSession() });
  }

  if (!isAuthed(req)) return send(res, 401, { error: 'يجب تسجيل الدخول' });

  if (method === 'POST' && parts[1] === 'logout') {
    sessions.delete((req.headers.authorization || '').slice(7));
    return send(res, 200, { ok: true });
  }
  if (method === 'GET' && parts[1] === 'data') return send(res, 200, db.subjects);
  if (method === 'GET' && parts[1] === 'stats') return send(res, 200, db.attempts);

  if (method === 'POST' && parts[1] === 'password') {
    const body = await readBody(req);
    if (!checkPassword(body.current)) return send(res, 400, { error: 'كلمة المرور الحالية غير صحيحة' });
    if (typeof body.next !== 'string' || body.next.length < 6)
      return send(res, 400, { error: 'كلمة المرور الجديدة يجب أن تكون ٦ أحرف على الأقل' });
    auth = hashPassword(body.next);
    writeJsonAtomic(AUTH_FILE, auth);
    return send(res, 200, { ok: true });
  }

  if (parts[1] === 'subjects') {
    if (method === 'POST' && parts.length === 2) {
      const body = await readBody(req);
      const err = validateSubject(body);
      if (err) return send(res, 400, { error: err });
      if (findSubject(body.id)) return send(res, 409, { error: 'يوجد مادة بنفس المعرّف' });
      db.subjects.push(body);
      saveDb();
      return send(res, 201, body);
    }
    if (method === 'PUT' && parts.length === 3) {
      const idx = db.subjects.findIndex((s) => s.id === parts[2]);
      if (idx === -1) return send(res, 404, { error: 'المادة غير موجودة' });
      const body = await readBody(req);
      const err = validateSubject(body);
      if (err) return send(res, 400, { error: err });
      if (body.id !== parts[2]) return send(res, 400, { error: 'لا يمكن تغيير معرّف المادة' });
      db.subjects[idx] = body;
      saveDb();
      return send(res, 200, body);
    }
    if (method === 'DELETE' && parts.length === 3) {
      const before = db.subjects.length;
      db.subjects = db.subjects.filter((s) => s.id !== parts[2]);
      if (db.subjects.length === before) return send(res, 404, { error: 'المادة غير موجودة' });
      saveDb();
      return send(res, 200, { ok: true });
    }
  }

  if (method === 'PUT' && parts[1] === 'import') {
    const body = await readBody(req);
    if (!Array.isArray(body)) return send(res, 400, { error: 'الملف يجب أن يحتوي على قائمة مواد' });
    const ids = new Set();
    for (const s of body) {
      const err = validateSubject(s);
      if (err) return send(res, 400, { error: err });
      if (ids.has(s.id)) return send(res, 400, { error: `معرّف مكرر: ${s.id}` });
      ids.add(s.id);
    }
    db.subjects = body;
    saveDb();
    return send(res, 200, { ok: true, count: body.length });
  }

  return send(res, 404, { error: 'غير موجود' });
}

const server = http.createServer(async (req, res) => {
  const { pathname } = new URL(req.url, 'http://localhost');
  try {
    if (pathname.startsWith('/api/')) return await handleApi(req, res, pathname);
    if (req.method !== 'GET' && req.method !== 'HEAD') return res.writeHead(405).end();
    return serveStatic(req, res, pathname);
  } catch (e) {
    const status = e.status || 500;
    if (status === 500) console.error(e);
    if (!res.headersSent) send(res, status, { error: status === 500 ? 'خطأ في الخادم' : e.message });
  }
});

server.on('error', (e) => {
  if (e.code === 'EADDRINUSE') {
    console.error(`✖ المنفذ ${PORT} مستخدم من برنامج آخر. شغّل على منفذ مختلف، مثلاً: PORT=4012 npm start`);
    process.exit(1);
  }
  throw e;
});

server.listen(PORT, () => {
  console.log(`✔ المنصة تعمل على: http://localhost:${PORT}`);
  console.log(`✔ لوحة التحكم:     http://localhost:${PORT}/admin`);
  if (!process.env.ADMIN_PASSWORD) console.log(`  كلمة مرور الإدارة الافتراضية: ${DEFAULT_PASSWORD} (غيّرها من لوحة التحكم)`);
});

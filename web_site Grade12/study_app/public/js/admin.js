// لوحة التحكم: تسجيل الدخول، إدارة المواد والوحدات والدروس والأسئلة، الإحصائيات والإعدادات
const root = document.getElementById('root');
const TOKEN_KEY = 'tf-admin-token';
const ICON_LABELS = { math: 'رياضيات', physics: 'فيزياء', chemistry: 'كيمياء', arabic: 'لغة', islamic: 'إسلامية', oman: 'وطني', english: 'إنجليزي', book: 'كتاب' };

const state = {
  token: store.get(TOKEN_KEY, null, 'session'),
  subjects: [],
  stats: {},
  view: { type: 'dashboard' }, // dashboard | subject | lesson | settings
  draft: null, // نسخة قابلة للتعديل من المادة المفتوحة
  dirty: false,
};

const newId = (prefix) => `${prefix}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
const clone = (o) => JSON.parse(JSON.stringify(o));
const blankQuestion = () => ({ id: newId('q'), q: '', options: ['', '', '', ''], answer: 0, explanation: '' });

async function call(path, opts = {}) {
  try {
    return await api(path, { ...opts, token: state.token });
  } catch (e) {
    if (e.status === 401 && state.token) {
      logout(false);
      toast('انتهت الجلسة، سجّل الدخول مجدداً', 'error');
    }
    throw e;
  }
}

// ---------- الدخول والخروج ----------
function renderLogin() {
  document.getElementById('logoutBtn').hidden = true;
  root.innerHTML = `
    <div class="login-wrap">
      <form class="card login-card" id="loginForm">
        <div class="brand-mark">${icon('lock', 24)}</div>
        <h1 style="margin:0 0 4px;font-size:1.4rem">تسجيل دخول المشرف</h1>
        <p class="muted" style="margin:0 0 20px">أدخل كلمة مرور لوحة التحكم</p>
        <div class="field">
          <label for="pw">كلمة المرور</label>
          <input class="input" type="password" id="pw" autocomplete="current-password" required autofocus>
        </div>
        <p class="error-text" id="loginErr"></p>
        <button class="btn lg" style="width:100%">دخول</button>
      </form>
    </div>`;
  document.getElementById('loginForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = e.target.querySelector('button');
    btn.disabled = true;
    try {
      const { token } = await api('/api/admin/login', { method: 'POST', body: { password: document.getElementById('pw').value } });
      state.token = token;
      store.set(TOKEN_KEY, token, 'session');
      await boot();
    } catch (err) {
      document.getElementById('loginErr').textContent = err.message;
      btn.disabled = false;
    }
  });
}

function logout(callServer = true) {
  if (callServer && state.token) api('/api/admin/logout', { method: 'POST', token: state.token }).catch(() => {});
  state.token = null;
  state.draft = null;
  state.dirty = false;
  store.remove(TOKEN_KEY, 'session');
  renderLogin();
}

async function boot() {
  if (!state.token) return renderLogin();
  root.innerHTML = '<div class="loader"></div>';
  try {
    [state.subjects, state.stats] = await Promise.all([call('/api/admin/data'), call('/api/admin/stats')]);
  } catch (e) {
    if (state.token) root.innerHTML = `<div class="container"><div class="card empty">${esc(e.message)}</div></div>`;
    return;
  }
  const btn = document.getElementById('logoutBtn');
  btn.hidden = false;
  btn.innerHTML = icon('logout', 20);
  render();
}

// ---------- التنقل ----------
function confirmLeave() {
  return !state.dirty || confirm('لديك تغييرات غير محفوظة. هل تريد تجاهلها؟');
}

function go(view) {
  const sameSubject = state.draft && view.id === state.draft.id;
  if (!sameSubject && !confirmLeave()) return;
  if (!sameSubject) {
    const s = state.subjects.find((x) => x.id === view.id);
    state.draft = s ? clone(s) : null;
    state.dirty = false;
  }
  state.view = view;
  render();
  window.scrollTo({ top: 0 });
}

function markDirty() {
  if (state.dirty) return;
  state.dirty = true;
  renderSavebar();
}

// ---------- الهيكل العام ----------
function render() {
  const v = state.view;
  const count = (s) => s.units.reduce((n, u) => n + u.lessons.reduce((m, l) => m + l.questions.length, 0), 0);
  // نعرض المسودة في القائمة الجانبية حتى تظهر تعديلات الاسم واللون مباشرة
  const listed = state.subjects.map((s) => (state.draft && s.id === state.draft.id ? state.draft : s));
  const sideSubject = (s) => `
    <button class="side-item ${v.id === s.id ? 'active' : ''}" data-go="subject" data-id="${esc(s.id)}">
      <span class="dot" style="--c:${safeColor(s.color)}">${icon(s.icon, 17)}</span>
      <span>${esc(s.name)}</span><span class="count">${count(s)}</span>
    </button>`;

  let main = '';
  if (v.type === 'subject' && state.draft) main = subjectView();
  else if (v.type === 'lesson' && state.draft) main = lessonView();
  else if (v.type === 'settings') main = settingsView();
  else main = dashboardView();

  root.innerHTML = `
    <div class="container" style="max-width:1280px;padding-top:24px;padding-bottom:64px">
      <div class="admin-layout">
        <aside class="card sidebar">
          <button class="side-item ${v.type === 'dashboard' ? 'active' : ''}" data-go="dashboard"><span class="dot">${icon('chart', 17)}</span><span>الإحصائيات</span></button>
          <button class="side-item ${v.type === 'settings' ? 'active' : ''}" data-go="settings"><span class="dot">${icon('settings', 17)}</span><span>الإعدادات</span></button>
          <div class="side-sep"></div>
          <div class="side-label">المواد العلمية</div>
          ${listed.filter((s) => s.category === 'scientific').map(sideSubject).join('')}
          <div class="side-label">المواد الأساسية</div>
          ${listed.filter((s) => s.category === 'core').map(sideSubject).join('')}
          <div class="side-sep"></div>
          <button class="side-item" data-act="new-subject" style="color:var(--primary)"><span class="dot">${icon('plus', 17)}</span><span>إضافة مادة</span></button>
        </aside>
        <section id="main">${main}<div id="savebarSlot"></div></section>
      </div>
    </div>`;
  renderSavebar();
}

function renderSavebar() {
  const slot = document.getElementById('savebarSlot');
  if (!slot) return;
  slot.innerHTML = state.dirty
    ? `<div class="savebar">
        <span style="flex:1">لديك تغييرات غير محفوظة</span>
        <button class="btn ghost sm" data-act="discard">تجاهل</button>
        <button class="btn success sm" data-act="save">${icon('check', 16)} حفظ التغييرات</button>
      </div>`
    : '';
}

// ---------- الإحصائيات ----------
function dashboardView() {
  const lessons = state.subjects.flatMap((s) => s.units.flatMap((u) => u.lessons.map((l) => ({ s, l }))));
  const questions = lessons.reduce((n, x) => n + x.l.questions.length, 0);
  const attempts = Object.values(state.stats).reduce((n, x) => n + x.count, 0);
  const rows = lessons
    .map(({ s, l }) => ({ s, l, st: state.stats[`${s.id}/${l.id}`] }))
    .filter((r) => r.st)
    .sort((a, b) => b.st.count - a.st.count);

  return `
    <div class="panel-head"><h2>نظرة عامة</h2></div>
    <div class="kpis">
      <div class="stat card"><b>${state.subjects.length}</b><span>مادة</span></div>
      <div class="stat card"><b>${lessons.length}</b><span>مرحلة (درس)</span></div>
      <div class="stat card"><b>${questions}</b><span>سؤالاً</span></div>
      <div class="stat card"><b>${attempts}</b><span>محاولة اختبار</span></div>
    </div>
    <div class="card panel">
      <div class="panel-head"><h2 style="font-size:1.05rem">أداء الطلاب حسب المرحلة</h2></div>
      ${rows.length ? `
        <div class="table-wrap"><table>
          <thead><tr><th>المادة</th><th>المرحلة</th><th>المحاولات</th><th>متوسط الدرجة</th><th>نسبة الاجتياز</th></tr></thead>
          <tbody>${rows.map(({ s, l, st }) => {
            const avg = Math.round(st.sumPercent / st.count);
            return `<tr>
              <td><span style="color:${safeColor(s.color)}">●</span> ${esc(s.name)}</td>
              <td>${esc(l.title)}</td>
              <td>${st.count}</td>
              <td style="color:${avg >= PASS_PERCENT ? 'var(--success)' : 'var(--danger)'}">${avg}٪</td>
              <td>${Math.round((st.passed / st.count) * 100)}٪</td>
            </tr>`;
          }).join('')}</tbody>
        </table></div>` : '<p class="faint" style="margin:0">لم يُجرِ الطلاب أي اختبار بعد. ستظهر النتائج هنا تلقائياً.</p>'}
    </div>`;
}

// ---------- تحرير المادة ----------
const countPill = (n) =>
  `<span class="pill" style="color:${n >= 10 && n <= 12 ? 'var(--success)' : 'var(--warning)'}" title="يُنصح بـ 10 إلى 12 سؤالاً">${n} سؤال</span>`;

function subjectView() {
  const s = state.draft;
  const units = s.units
    .map((u, ui) => `
      <div class="unit-box">
        <div class="unit-box-head">
          <input class="input" value="${esc(u.title)}" data-unit-title="${ui}" placeholder="عنوان الوحدة" aria-label="عنوان الوحدة">
          <button class="icon-btn sm" data-act="move-unit" data-i="${ui}" data-dir="-1" ${ui === 0 ? 'disabled' : ''} title="أعلى">${icon('up', 16)}</button>
          <button class="icon-btn sm" data-act="move-unit" data-i="${ui}" data-dir="1" ${ui === s.units.length - 1 ? 'disabled' : ''} title="أسفل">${icon('down', 16)}</button>
          <button class="icon-btn sm" data-act="del-unit" data-i="${ui}" title="حذف الوحدة" style="color:var(--danger)">${icon('trash', 16)}</button>
        </div>
        ${u.lessons.map((l, li) => `
          <div class="lesson-row">
            <input class="input" value="${esc(l.title)}" data-lesson-title="${ui}:${li}" placeholder="عنوان الدرس" aria-label="عنوان الدرس">
            ${countPill(l.questions.length)}
            <button class="btn soft sm" data-act="open-lesson" data-u="${ui}" data-l="${li}">${icon('edit', 15)} الأسئلة</button>
            <button class="icon-btn sm" data-act="move-lesson" data-u="${ui}" data-l="${li}" data-dir="-1" ${li === 0 ? 'disabled' : ''} title="أعلى">${icon('up', 16)}</button>
            <button class="icon-btn sm" data-act="move-lesson" data-u="${ui}" data-l="${li}" data-dir="1" ${li === u.lessons.length - 1 ? 'disabled' : ''} title="أسفل">${icon('down', 16)}</button>
            <button class="icon-btn sm" data-act="del-lesson" data-u="${ui}" data-l="${li}" title="حذف الدرس" style="color:var(--danger)">${icon('trash', 16)}</button>
          </div>`).join('')}
        <div class="unit-box-foot"><button class="btn ghost sm" data-act="add-lesson" data-u="${ui}">${icon('plus', 15)} إضافة درس (مرحلة)</button></div>
      </div>`)
    .join('');

  return `
    <div class="card panel">
      <div class="panel-head">
        <span class="subject-icon" style="--c:${safeColor(s.color)};width:44px;height:44px;border-radius:13px">${icon(s.icon, 22)}</span>
        <h2 style="flex:1">${esc(s.name)}</h2>
        <a class="btn ghost sm" href="/#/subject/${encodeURIComponent(s.id)}" target="_blank" rel="noopener">${icon('eye', 15)} معاينة</a>
        <button class="btn danger sm" data-act="del-subject">${icon('trash', 15)} حذف المادة</button>
      </div>
      <div class="form-grid">
        <div class="field"><label>اسم المادة</label><input class="input" data-field="name" value="${esc(s.name)}" maxlength="100"></div>
        <div class="field"><label>التصنيف</label>
          <select class="input" data-field="category">
            <option value="scientific" ${s.category === 'scientific' ? 'selected' : ''}>المواد العلمية</option>
            <option value="core" ${s.category === 'core' ? 'selected' : ''}>المواد الأساسية</option>
          </select></div>
        <div class="field"><label>الأيقونة</label>
          <select class="input" data-field="icon">
            ${SUBJECT_ICONS.map((i) => `<option value="${i}" ${s.icon === i ? 'selected' : ''}>${ICON_LABELS[i]}</option>`).join('')}
          </select></div>
        <div class="field"><label>اللون</label><input class="input" type="color" data-field="color" value="${safeColor(s.color)}"></div>
      </div>
      <div class="form-grid">
        <div class="field"><label>لغة محتوى الأسئلة</label>
          <select class="input" data-field="lang">
            <option value="ar" ${s.lang !== 'en' ? 'selected' : ''}>العربية (من اليمين لليسار)</option>
            <option value="en" ${s.lang === 'en' ? 'selected' : ''}>English (من اليسار لليمين)</option>
          </select></div>
      </div>
      <div class="field" style="margin:0"><label>وصف مختصر</label><input class="input" data-field="description" value="${esc(s.description || '')}" maxlength="200"></div>
    </div>
    <div class="card panel">
      <div class="panel-head">
        <h2 style="flex:1;font-size:1.05rem">الوحدات والدروس</h2>
        <span class="faint" style="font-size:.85rem">كل درس = مرحلة، والطالب يتدرج من الأعلى إلى الأسفل</span>
      </div>
      ${units || '<p class="faint">لا توجد وحدات بعد.</p>'}
      <button class="btn soft" data-act="add-unit">${icon('plus', 16)} إضافة وحدة</button>
    </div>`;
}

// ---------- تحرير أسئلة الدرس ----------
function lessonView() {
  const { u: ui, l: li } = state.view;
  const unit = state.draft.units[ui];
  const lesson = unit && unit.lessons[li];
  if (!lesson) {
    state.view = { type: 'subject', id: state.draft.id };
    return subjectView();
  }
  const n = lesson.questions.length;
  const qs = lesson.questions
    .map((q, qi) => `
      <div class="card q-edit">
        <div class="q-edit-head">
          <b style="flex:1">السؤال ${qi + 1}</b>
          <button class="icon-btn sm" data-act="move-q" data-q="${qi}" data-dir="-1" ${qi === 0 ? 'disabled' : ''} title="أعلى">${icon('up', 16)}</button>
          <button class="icon-btn sm" data-act="move-q" data-q="${qi}" data-dir="1" ${qi === n - 1 ? 'disabled' : ''} title="أسفل">${icon('down', 16)}</button>
          <button class="icon-btn sm" data-act="del-q" data-q="${qi}" title="حذف السؤال" style="color:var(--danger)">${icon('trash', 16)}</button>
        </div>
        <div class="field"><textarea class="input" dir="auto" data-q-text="${qi}" placeholder="نص السؤال" rows="2" aria-label="نص السؤال">${esc(q.q)}</textarea></div>
        <div class="field" style="margin-bottom:6px"><label>الخيارات — حدّد الإجابة الصحيحة بالدائرة</label></div>
        ${q.options.map((o, oi) => `
          <div class="opt-row ${q.answer === oi ? 'is-correct' : ''}">
            <input type="radio" name="ans-${qi}" data-ans="${qi}:${oi}" ${q.answer === oi ? 'checked' : ''} aria-label="الإجابة الصحيحة">
            <input class="input" dir="auto" data-opt-text="${qi}:${oi}" value="${esc(o)}" placeholder="الخيار ${oi + 1}">
            <button class="icon-btn sm" data-act="del-opt" data-q="${qi}" data-o="${oi}" ${q.options.length <= 2 ? 'disabled' : ''} title="حذف الخيار">${icon('x', 15)}</button>
          </div>`).join('')}
        ${q.options.length < 6 ? `<button class="btn ghost sm" data-act="add-opt" data-q="${qi}" style="margin-bottom:12px">${icon('plus', 14)} خيار</button>` : ''}
        <div class="field" style="margin:0"><label>الشرح (يظهر للطالب بعد الإجابة — اختياري)</label>
          <input class="input" dir="auto" data-q-expl="${qi}" value="${esc(q.explanation || '')}"></div>
      </div>`)
    .join('');

  return `
    <div class="crumbs">
      <button data-go="subject" data-id="${esc(state.draft.id)}">${esc(state.draft.name)}</button> /
      <span>${esc(unit.title)}</span> /
      <span>${esc(lesson.title)}</span>
    </div>
    <div class="card panel">
      <div class="panel-head">
        <h2 style="flex:1">أسئلة المرحلة</h2>
        ${countPill(n)}
      </div>
      <div class="field" style="margin:0"><label>عنوان الدرس</label><input class="input" data-lesson-title="${ui}:${li}" value="${esc(lesson.title)}"></div>
    </div>
    ${qs || '<div class="card empty">لا توجد أسئلة بعد. أضف أول سؤال.</div>'}
    <button class="btn soft lg" data-act="add-q" style="width:100%">${icon('plus', 18)} إضافة سؤال</button>`;
}

// ---------- الإعدادات ----------
function settingsView() {
  return `
    <div class="card panel">
      <div class="panel-head"><h2 style="font-size:1.05rem">تغيير كلمة المرور</h2></div>
      <form id="pwForm" style="max-width:420px">
        <div class="field"><label>كلمة المرور الحالية</label><input class="input" type="password" name="current" autocomplete="current-password" required></div>
        <div class="field"><label>كلمة المرور الجديدة (٦ أحرف على الأقل)</label><input class="input" type="password" name="next" minlength="6" autocomplete="new-password" required></div>
        <button class="btn">حفظ كلمة المرور</button>
      </form>
    </div>
    <div class="card panel">
      <div class="panel-head"><h2 style="font-size:1.05rem">النسخ الاحتياطي</h2></div>
      <p class="muted" style="margin-top:0">صدّر بنك الأسئلة كاملاً كملف JSON، أو استورد ملفاً سابقاً. الاستيراد يستبدل جميع المواد الحالية.</p>
      <div style="display:flex;gap:10px;flex-wrap:wrap">
        <button class="btn soft" data-act="export">${icon('download', 16)} تصدير الأسئلة</button>
        <button class="btn ghost" data-act="import">${icon('upload', 16)} استيراد من ملف</button>
      </div>
    </div>`;
}

// ---------- العمليات ----------
function move(arr, i, dir) {
  const j = i + dir;
  if (j < 0 || j >= arr.length) return;
  [arr[i], arr[j]] = [arr[j], arr[i]];
}

async function save() {
  const btn = document.querySelector('[data-act="save"]');
  if (btn) btn.disabled = true;
  try {
    const saved = await call(`/api/admin/subjects/${encodeURIComponent(state.draft.id)}`, { method: 'PUT', body: state.draft });
    const idx = state.subjects.findIndex((s) => s.id === saved.id);
    state.subjects[idx] = saved;
    state.draft = clone(saved);
    state.dirty = false;
    render();
    toast('تم حفظ التغييرات', 'success');
  } catch (e) {
    toast(e.message, 'error');
    if (btn) btn.disabled = false;
  }
}

function newSubjectDialog() {
  if (!confirmLeave()) return;
  const back = document.createElement('div');
  back.className = 'modal-back';
  back.innerHTML = `
    <form class="card modal" role="dialog" aria-modal="true">
      <h2>إضافة مادة جديدة</h2>
      <p class="muted" style="margin:0 0 16px">يمكنك تعديل التفاصيل وإضافة الوحدات بعد الإنشاء.</p>
      <div class="field"><label>اسم المادة</label><input class="input" name="name" required maxlength="100" placeholder="مثال: الأحياء"></div>
      <div class="field"><label>المعرّف (بالإنجليزية، يظهر في الرابط)</label><input class="input" name="id" required pattern="[a-zA-Z0-9\\-]{1,64}" placeholder="biology" dir="ltr"></div>
      <div class="field"><label>التصنيف</label><select class="input" name="category"><option value="scientific">المواد العلمية</option><option value="core">المواد الأساسية</option></select></div>
      <p class="error-text"></p>
      <div style="display:flex;gap:10px;justify-content:flex-end">
        <button type="button" class="btn ghost" data-close>إلغاء</button>
        <button class="btn">إنشاء</button>
      </div>
    </form>`;
  document.body.appendChild(back);
  back.querySelector('input').focus();
  back.addEventListener('click', (e) => {
    if (e.target === back || e.target.closest('[data-close]')) back.remove();
  });
  back.querySelector('form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    const subject = {
      id: String(f.get('id')).trim().toLowerCase(),
      name: String(f.get('name')).trim(),
      category: f.get('category'),
      color: '#4f6bed',
      icon: 'book',
      description: '',
      units: [{ id: newId('u'), title: 'الوحدة الأولى', lessons: [{ id: newId('l'), title: 'الدرس الأول', questions: [] }] }],
    };
    try {
      const created = await call('/api/admin/subjects', { method: 'POST', body: subject });
      state.subjects.push(created);
      state.dirty = false;
      back.remove();
      go({ type: 'subject', id: created.id });
      toast('تم إنشاء المادة', 'success');
    } catch (err) {
      back.querySelector('.error-text').textContent = err.message;
    }
  });
}

async function handleAction(btn) {
  const act = btn.dataset.act;
  const d = state.draft;
  const num = (k) => Number(btn.dataset[k]);
  const lesson = () => d.units[state.view.u].lessons[state.view.l];

  switch (act) {
    case 'save': return save();
    case 'discard':
      if (!confirm('تجاهل كل التغييرات غير المحفوظة؟')) return;
      state.draft = clone(state.subjects.find((s) => s.id === d.id));
      state.dirty = false;
      return render();
    case 'new-subject': return newSubjectDialog();
    case 'del-subject':
      if (!confirm(`حذف مادة "${d.name}" وكل أسئلتها نهائياً؟`)) return;
      try {
        await call(`/api/admin/subjects/${encodeURIComponent(d.id)}`, { method: 'DELETE' });
        state.subjects = state.subjects.filter((s) => s.id !== d.id);
        state.dirty = false;
        state.draft = null;
        go({ type: 'dashboard' });
        toast('تم حذف المادة', 'success');
      } catch (e) {
        toast(e.message, 'error');
      }
      return;
    case 'add-unit':
      d.units.push({ id: newId('u'), title: `الوحدة ${d.units.length + 1}`, lessons: [] });
      break;
    case 'del-unit':
      if (!confirm('حذف الوحدة وكل دروسها؟')) return;
      d.units.splice(num('i'), 1);
      break;
    case 'move-unit': move(d.units, num('i'), num('dir')); break;
    case 'add-lesson':
      d.units[num('u')].lessons.push({ id: newId('l'), title: 'درس جديد', questions: [] });
      break;
    case 'del-lesson':
      if (!confirm('حذف الدرس وكل أسئلته؟')) return;
      d.units[num('u')].lessons.splice(num('l'), 1);
      break;
    case 'move-lesson': move(d.units[num('u')].lessons, num('l'), num('dir')); break;
    case 'open-lesson':
      state.view = { type: 'lesson', id: d.id, u: num('u'), l: num('l') };
      render();
      window.scrollTo({ top: 0 });
      return;
    case 'add-q':
      lesson().questions.push(blankQuestion());
      markDirty();
      render();
      document.querySelector(`[data-q-text="${lesson().questions.length - 1}"]`)?.focus();
      return;
    case 'del-q':
      if (!confirm('حذف هذا السؤال؟')) return;
      lesson().questions.splice(num('q'), 1);
      break;
    case 'move-q': move(lesson().questions, num('q'), num('dir')); break;
    case 'add-opt': lesson().questions[num('q')].options.push(''); break;
    case 'del-opt': {
      const q = lesson().questions[num('q')];
      const o = num('o');
      q.options.splice(o, 1);
      if (q.answer === o) q.answer = 0;
      else if (q.answer > o) q.answer -= 1;
      break;
    }
    case 'export': {
      const blob = new Blob([JSON.stringify(state.subjects, null, 2)], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `tafawwuq12-questions-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
      return;
    }
    case 'import': return document.getElementById('importFile').click();
    default: return;
  }
  markDirty();
  render();
}

// ---------- ربط الأحداث ----------
root.addEventListener('click', (e) => {
  const nav = e.target.closest('[data-go]');
  if (nav) return go({ type: nav.dataset.go, id: nav.dataset.id });
  const btn = e.target.closest('[data-act]');
  if (btn && !btn.disabled) handleAction(btn);
});

// تحديث المسودة أثناء الكتابة دون إعادة الرسم للحفاظ على موضع المؤشر
root.addEventListener('input', (e) => {
  const t = e.target;
  const d = state.draft;
  if (!d) return;
  const ds = t.dataset;
  const lesson = () => d.units[state.view.u].lessons[state.view.l];
  if (ds.field) {
    d[ds.field] = t.value;
  } else if (ds.unitTitle !== undefined) {
    d.units[Number(ds.unitTitle)].title = t.value;
  } else if (ds.lessonTitle !== undefined) {
    const [u, l] = ds.lessonTitle.split(':').map(Number);
    d.units[u].lessons[l].title = t.value;
  } else if (ds.qText !== undefined) {
    lesson().questions[Number(ds.qText)].q = t.value;
  } else if (ds.optText !== undefined) {
    const [q, o] = ds.optText.split(':').map(Number);
    lesson().questions[q].options[o] = t.value;
  } else if (ds.qExpl !== undefined) {
    lesson().questions[Number(ds.qExpl)].explanation = t.value;
  } else {
    return;
  }
  markDirty();
});

root.addEventListener('change', (e) => {
  const t = e.target;
  if (t.dataset.ans !== undefined) {
    const [q, o] = t.dataset.ans.split(':').map(Number);
    state.draft.units[state.view.u].lessons[state.view.l].questions[q].answer = o;
    t.closest('.q-edit').querySelectorAll('.opt-row').forEach((row, i) => row.classList.toggle('is-correct', i === o));
    markDirty();
  } else if (['icon', 'color', 'category', 'name'].includes(t.dataset.field)) {
    render(); // لتحديث الأيقونة واللون والاسم في القائمة الجانبية
  }
});

root.addEventListener('submit', async (e) => {
  if (e.target.id !== 'pwForm') return;
  e.preventDefault();
  const f = new FormData(e.target);
  try {
    await call('/api/admin/password', { method: 'POST', body: { current: f.get('current'), next: f.get('next') } });
    e.target.reset();
    toast('تم تغيير كلمة المرور', 'success');
  } catch (err) {
    toast(err.message, 'error');
  }
});

document.getElementById('importFile').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  e.target.value = '';
  if (!file) return;
  let data;
  try {
    data = JSON.parse(await file.text());
  } catch {
    return toast('الملف ليس بصيغة JSON صحيحة', 'error');
  }
  if (!confirm(`سيتم استبدال جميع المواد الحالية بـ ${Array.isArray(data) ? data.length : 0} مادة من الملف. متابعة؟`)) return;
  try {
    await call('/api/admin/import', { method: 'PUT', body: data });
    state.subjects = await call('/api/admin/data');
    state.draft = null;
    state.dirty = false;
    state.view = { type: 'dashboard' };
    render();
    toast('تم الاستيراد بنجاح', 'success');
  } catch (err) {
    toast(err.message, 'error');
  }
});

document.getElementById('logoutBtn').addEventListener('click', () => {
  if (confirmLeave()) logout();
});

window.addEventListener('beforeunload', (e) => {
  if (state.dirty) e.preventDefault();
});

Theme.init();
boot();

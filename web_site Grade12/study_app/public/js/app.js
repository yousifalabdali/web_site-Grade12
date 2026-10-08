// واجهة الطالب: الرئيسية ← المادة (المراحل) ← الاختبار ← النتيجة
const app = document.getElementById('app');
const OPTION_KEYS = ['أ', 'ب', 'ج', 'د', 'هـ', 'و'];
const OPTION_KEYS_EN = ['A', 'B', 'C', 'D', 'E', 'F'];
// اتجاه محتوى الأسئلة: المواد ذات المحتوى الإنجليزي تُعرض من اليسار لليمين
const contentDir = (lang) => (lang === 'en' ? 'ltr' : 'rtl');

let subjectsCache = null;
const outlineCache = new Map();
let quiz = null; // حالة الاختبار الحالي

// ---------- التقدم (محفوظ في متصفح الطالب) ----------
const Progress = {
  all: () => store.get('tf-progress', {}),
  get: (subjectId, lessonId) => Progress.all()[`${subjectId}/${lessonId}`] || null,
  record(subjectId, lessonId, percent) {
    const all = Progress.all();
    const key = `${subjectId}/${lessonId}`;
    const prev = all[key] || { best: 0, attempts: 0 };
    all[key] = { best: Math.max(prev.best, percent), attempts: prev.attempts + 1 };
    store.set('tf-progress', all);
    return prev.best;
  },
  passed: (subjectId, lessonId) => (Progress.get(subjectId, lessonId)?.best ?? -1) >= PASS_PERCENT,
};

const getName = () => store.get('tf-name', '');

// ---------- تحميل البيانات ----------
async function loadSubjects() {
  if (!subjectsCache) subjectsCache = await api('/api/subjects');
  return subjectsCache;
}

async function loadOutline(id) {
  if (!outlineCache.has(id)) outlineCache.set(id, await api(`/api/subjects/${encodeURIComponent(id)}`));
  return outlineCache.get(id);
}

function flatLessons(outline) {
  return outline.units.flatMap((u) => u.lessons);
}

// المرحلة مفتوحة إذا كانت الأولى أو اجتاز الطالب المرحلة السابقة
function isUnlocked(outline, index) {
  if (index === 0) return true;
  const lessons = flatLessons(outline);
  return Progress.passed(outline.id, lessons[index - 1].id);
}

// ---------- التوجيه ----------
async function route() {
  quiz = null;
  const parts = location.hash.replace(/^#\/?/, '').split('/').filter(Boolean).map(decodeURIComponent);
  window.scrollTo({ top: 0 });
  app.innerHTML = '<div class="loader"></div>';
  try {
    if (parts[0] === 'subject' && parts[1]) await renderSubject(parts[1]);
    else if (parts[0] === 'quiz' && parts[1] && parts[2]) await startQuiz(parts[1], parts[2]);
    else await renderHome();
  } catch (e) {
    app.innerHTML = `<div class="card empty"><p>${esc(e.message)}</p><a class="btn soft" href="#/">العودة للرئيسية</a></div>`;
  }
}

// ---------- الرئيسية ----------
function subjectStats(s) {
  const prefix = `${s.id}/`;
  const entries = Object.entries(Progress.all()).filter(([k]) => k.startsWith(prefix));
  const passed = Math.min(entries.filter(([, v]) => v.best >= PASS_PERCENT).length, s.lessonCount);
  const stars = entries.reduce((n, [, v]) => n + starsFor(v.best), 0);
  return { passed, stars, attempted: entries.length, sumBest: entries.reduce((n, [, v]) => n + v.best, 0) };
}

function subjectCard(s) {
  const st = subjectStats(s);
  const pct = s.lessonCount ? Math.round((st.passed / s.lessonCount) * 100) : 0;
  return `
    <a class="card subject-card" href="#/subject/${encodeURIComponent(s.id)}" style="--c:${safeColor(s.color)}">
      <div class="subject-head">
        <div class="subject-icon">${icon(s.icon, 26)}</div>
        <div>
          <h3>${esc(s.name)}</h3>
          <span class="faint" style="font-size:.8rem">${s.unitCount} وحدات · ${s.lessonCount} مراحل · ${s.questionCount} سؤالاً</span>
        </div>
      </div>
      <p>${esc(s.description)}</p>
      <div class="progress" role="progressbar" aria-valuenow="${pct}" aria-valuemin="0" aria-valuemax="100"><span style="width:${pct}%"></span></div>
      <div class="card-foot"><span>أنجزت ${st.passed} من ${s.lessonCount} مراحل</span><span>${st.stars} ★</span></div>
    </a>`;
}

async function renderHome() {
  const subjects = await loadSubjects();
  const name = getName();
  const totals = subjects.reduce(
    (t, s) => {
      const st = subjectStats(s);
      t.lessons += s.lessonCount;
      t.passed += st.passed;
      t.stars += st.stars;
      t.attempted += st.attempted;
      t.sumBest += st.sumBest;
      return t;
    },
    { lessons: 0, passed: 0, stars: 0, attempted: 0, sumBest: 0 },
  );
  const overall = totals.lessons ? Math.round((totals.passed / totals.lessons) * 100) : 0;
  const avg = totals.attempted ? Math.round(totals.sumBest / totals.attempted) : 0;

  const section = (cat) => {
    const list = subjects.filter((s) => s.category === cat);
    if (!list.length) return '';
    return `
      <h2 class="section-title">${CATEGORY_LABELS[cat]} <span class="pill">${list.length} مواد</span></h2>
      <div class="grid">${list.map(subjectCard).join('')}</div>`;
  };

  app.innerHTML = `
    <section class="card hero">
      <div>
        <h1>${name ? `أهلاً ${esc(name)} 👋` : 'أهلاً بك في تفوّق ١٢ 👋'}</h1>
        <p>اختر مادة وابدأ من المرحلة الأولى. اجتز كل مرحلة بنسبة ${PASS_PERCENT}٪ لتفتح المرحلة التالية.</p>
        <div class="hero-stats">
          <div class="stat"><b>${totals.passed}<small class="faint" style="font-size:.85rem"> / ${totals.lessons}</small></b><span>مراحل مُنجزة</span></div>
          <div class="stat"><b style="color:var(--warning)">${totals.stars}</b><span>نجمة</span></div>
          <div class="stat"><b>${avg}٪</b><span>متوسط أفضل نتائجك</span></div>
        </div>
      </div>
      <div class="ring" style="--p:${overall}"><div><b>${overall}٪</b><small>الإنجاز الكلي</small></div></div>
    </section>
    ${section('scientific')}
    ${section('core')}
    ${subjects.length ? '' : '<div class="card empty">لا توجد مواد بعد.</div>'}
  `;
}

// ---------- صفحة المادة ----------
async function renderSubject(id) {
  const outline = await loadOutline(id);
  const lessons = flatLessons(outline);
  const color = safeColor(outline.color);
  const passed = lessons.filter((l) => Progress.passed(outline.id, l.id)).length;
  const pct = lessons.length ? Math.round((passed / lessons.length) * 100) : 0;

  let index = 0;
  const unitsHtml = outline.units
    .map((u, ui) => {
      const stages = u.lessons
        .map((l) => {
          const i = index++;
          const unlocked = isUnlocked(outline, i);
          const p = Progress.get(outline.id, l.id);
          const done = p && p.best >= PASS_PERCENT;
          const cls = done ? 'done' : unlocked ? '' : 'locked';
          const node = done ? icon('check', 22) : unlocked ? i + 1 : icon('lock', 18);
          const sub = p
            ? `أفضل نتيجة: ${p.best}٪ · ${p.attempts} محاولة`
            : unlocked ? `${l.questionCount} سؤالاً · ابدأ الآن` : 'اجتز المرحلة السابقة لفتح هذه المرحلة';
          const tag = unlocked ? 'a' : 'div';
          const href = unlocked ? ` href="#/quiz/${encodeURIComponent(outline.id)}/${encodeURIComponent(l.id)}"` : ' aria-disabled="true"';
          return `
            <${tag} class="card stage ${cls}"${href}>
              <span class="stage-node">${node}</span>
              <span class="stage-info"><b>المرحلة ${i + 1}: ${esc(l.title)}</b><small>${sub}</small></span>
              ${p ? starsHtml(starsFor(p.best), 15) : unlocked ? `<span style="color:var(--c)">${icon('next', 20)}</span>` : ''}
            </${tag}>`;
        })
        .join('');
      return `
        <section class="unit">
          <h2 class="unit-title"><span class="num">${ui + 1}</span>${esc(u.title)}</h2>
          <div class="path">${stages || '<p class="faint">لا توجد دروس في هذه الوحدة بعد.</p>'}</div>
        </section>`;
    })
    .join('');

  app.innerHTML = `
    <div style="--c:${color}">
      <a class="back" href="#/">${icon('back', 18)} كل المواد</a>
      <section class="card subject-banner">
        <div class="subject-icon">${icon(outline.icon, 32)}</div>
        <div class="grow">
          <h1>${esc(outline.name)}</h1>
          <p class="muted" style="margin:0">${esc(outline.description)}</p>
        </div>
        <div class="ring" style="--p:${pct};--c:${color};width:96px;height:96px"><div style="width:74px;height:74px"><b style="font-size:1.2rem">${passed}/${lessons.length}</b><small>مراحل</small></div></div>
      </section>
      ${unitsHtml || '<div class="card empty">لا توجد وحدات بعد.</div>'}
    </div>`;
}

// ---------- الاختبار ----------
function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

async function startQuiz(subjectId, lessonId) {
  const [outline, data] = await Promise.all([
    loadOutline(subjectId),
    api(`/api/subjects/${encodeURIComponent(subjectId)}/lessons/${encodeURIComponent(lessonId)}`),
  ]);
  const lessons = flatLessons(outline);
  const index = lessons.findIndex((l) => l.id === lessonId);
  if (index === -1) throw new Error('المرحلة غير موجودة');
  if (!isUnlocked(outline, index)) {
    toast('هذه المرحلة مقفلة، اجتز المرحلة السابقة أولاً');
    location.hash = `#/subject/${encodeURIComponent(subjectId)}`;
    return;
  }
  if (!data.lesson.questions.length) throw new Error('لا توجد أسئلة في هذه المرحلة بعد');

  quiz = {
    outline,
    index,
    subject: data.subject,
    lesson: data.lesson,
    color: safeColor(data.subject.color),
    dir: contentDir(data.subject.lang),
    // نخلط ترتيب الأسئلة وترتيب الخيارات في كل محاولة
    questions: shuffle(data.lesson.questions).map((q) => {
      const order = shuffle(q.options.map((_, i) => i));
      return { ...q, options: order.map((i) => q.options[i]), answer: order.indexOf(q.answer) };
    }),
    current: 0,
    picked: [],
    finished: false,
  };
  renderQuestion();
}

function renderQuestion() {
  const { questions, current, picked, color, dir } = quiz;
  const keys = dir === 'ltr' ? OPTION_KEYS_EN : OPTION_KEYS;
  const q = questions[current];
  const chosen = picked[current];
  const answered = chosen !== undefined;
  const score = picked.filter((p, i) => p === questions[i].answer).length;

  const options = q.options
    .map((opt, i) => {
      let cls = '';
      if (answered) cls = i === q.answer ? 'correct' : i === chosen ? 'wrong' : 'dim';
      return `<button class="option ${cls}" data-opt="${i}" ${answered ? 'disabled' : ''}>
        <span class="key">${keys[i]}</span><span class="txt">${rich(opt)}</span>
      </button>`;
    })
    .join('');

  const correct = chosen === q.answer;
  const feedback = answered
    ? `<div class="feedback ${correct ? 'ok' : 'bad'}" role="alert">
        ${icon(correct ? 'check' : 'x', 22)}
        <div><b>${correct ? 'إجابة صحيحة، أحسنت!' : `إجابة خاطئة — الصحيحة: ${rich(q.options[q.answer])}`}</b>
        ${q.explanation ? `<p dir="${dir}">${rich(q.explanation)}</p>` : ''}</div>
      </div>`
    : '';

  const last = current === questions.length - 1;
  app.innerHTML = `
    <div class="quiz-wrap" style="--c:${color}">
      <div class="quiz-top">
        <a class="icon-btn" href="#/subject/${encodeURIComponent(quiz.subject.id)}" aria-label="إنهاء الاختبار" title="إنهاء الاختبار">${icon('x', 20)}</a>
        <div class="progress" aria-hidden="true"><span style="width:${((current + (answered ? 1 : 0)) / questions.length) * 100}%"></span></div>
        <span class="pill" style="color:var(--success)" title="الإجابات الصحيحة">${icon('check', 14)} ${score}</span>
      </div>
      <div class="quiz-meta">
        <span>${esc(quiz.subject.name)} · المرحلة ${quiz.index + 1}: ${esc(quiz.lesson.title)}</span>
        <span>السؤال ${current + 1} من ${questions.length}</span>
      </div>
      <article class="card q-card${answered ? '' : ' enter'}">
        <div class="q-num">سؤال ${current + 1}</div>
        <p class="q-text" dir="${dir}">${rich(q.q)}</p>
        <div class="options" dir="${dir}">${options}</div>
        ${feedback}
      </article>
      <div class="quiz-actions">
        ${answered ? `<button class="btn lg" id="nextBtn">${last ? 'عرض النتيجة' : 'السؤال التالي'} ${icon('next', 18)}</button>` : ''}
      </div>
      <p class="kbd-hint">يمكنك استخدام الأرقام 1–${q.options.length} للاختيار، و Enter للمتابعة</p>
    </div>`;

  if (answered) document.getElementById('nextBtn').focus();
}

function pickOption(i) {
  if (!quiz || quiz.finished) return;
  const q = quiz.questions[quiz.current];
  if (quiz.picked[quiz.current] !== undefined || i < 0 || i >= q.options.length) return;
  quiz.picked[quiz.current] = i;
  renderQuestion();
}

function nextQuestion() {
  if (!quiz || quiz.finished || quiz.picked[quiz.current] === undefined) return;
  if (quiz.current < quiz.questions.length - 1) {
    quiz.current += 1;
    renderQuestion();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  } else {
    finishQuiz();
  }
}

function finishQuiz() {
  quiz.finished = true;
  const { questions, picked, subject, lesson, outline, index, color, dir } = quiz;
  const score = picked.filter((p, i) => p === questions[i].answer).length;
  const total = questions.length;
  const pct = Math.round((score / total) * 100);
  const prevBest = Progress.record(subject.id, lesson.id, pct);
  const stars = starsFor(pct);
  const passed = pct >= PASS_PERCENT;
  api('/api/attempts', { method: 'POST', body: { subjectId: subject.id, lessonId: lesson.id, score, total } }).catch(() => {});

  const next = flatLessons(outline)[index + 1];
  const title = pct >= 90 ? 'ممتاز! أداء رائع 🎉' : pct >= 75 ? 'أحسنت! نتيجة جيدة جداً' : passed ? 'اجتزت المرحلة 👏' : 'حاول مرة أخرى، أنت قادر!';
  const msg = passed
    ? next ? 'تم فتح المرحلة التالية.' : 'أكملت جميع مراحل هذه المادة!'
    : `تحتاج ${PASS_PERCENT}٪ على الأقل لفتح المرحلة التالية. راجع الأخطاء بالأسفل.`;

  const wrong = questions.map((q, i) => ({ q, chosen: picked[i] })).filter(({ q, chosen }) => chosen !== q.answer);

  app.innerHTML = `
    <div class="quiz-wrap" style="--c:${color}">
      <section class="card result">
        <div class="ring" style="--p:${pct};--c:${passed ? 'var(--success)' : 'var(--danger)'}"><div><b>${pct}٪</b><small>${score} من ${total}</small></div></div>
        <div class="result-stars">${starsHtml(stars, 34)}</div>
        <h2>${title}</h2>
        <p class="muted" style="margin:0">${msg}</p>
        ${pct > prevBest && prevBest > 0 ? `<p style="color:var(--success);margin:8px 0 0">رقم قياسي جديد! (السابق ${prevBest}٪)</p>` : ''}
        <div class="result-actions">
          ${passed && next ? `<a class="btn lg" href="#/quiz/${encodeURIComponent(subject.id)}/${encodeURIComponent(next.id)}">المرحلة التالية ${icon('next', 18)}</a>` : ''}
          <button class="btn lg ${passed ? 'ghost' : ''}" id="retryBtn">إعادة المرحلة</button>
          <a class="btn lg ghost" href="#/subject/${encodeURIComponent(subject.id)}">خريطة المراحل</a>
        </div>
      </section>
      ${wrong.length ? `
        <section class="review">
          <h3>مراجعة الأخطاء (${wrong.length})</h3>
          ${wrong.map(({ q, chosen }) => `
            <div class="card review-item">
              <p dir="${dir}">${rich(q.q)}</p>
              <div class="ans bad">${icon('x', 16)} <span>إجابتك: ${rich(q.options[chosen])}</span></div>
              <div class="ans ok">${icon('check', 16)} <span>الصحيحة: ${rich(q.options[q.answer])}</span></div>
              ${q.explanation ? `<div class="why" dir="${dir}">${rich(q.explanation)}</div>` : ''}
            </div>`).join('')}
        </section>` : ''}
    </div>`;
  document.getElementById('retryBtn').addEventListener('click', () => {
    window.scrollTo({ top: 0 });
    startQuiz(subject.id, lesson.id).catch((e) => toast(e.message, 'error'));
  });
}

// ---------- الأحداث ----------
app.addEventListener('click', (e) => {
  const opt = e.target.closest('[data-opt]');
  if (opt) return pickOption(Number(opt.dataset.opt));
  if (e.target.closest('#nextBtn')) return nextQuestion();
});

document.addEventListener('keydown', (e) => {
  if (!quiz || quiz.finished || document.querySelector('.modal-back') || e.ctrlKey || e.metaKey || e.altKey) return;
  const map = { 1: 0, 2: 1, 3: 2, 4: 3, 5: 4, 6: 5, '١': 0, '٢': 1, '٣': 2, '٤': 3, '٥': 4, '٦': 5 };
  if (e.key in map) {
    e.preventDefault();
    pickOption(map[e.key]);
  } else if (e.key === 'Enter' && quiz.picked[quiz.current] !== undefined) {
    e.preventDefault();
    nextQuestion();
  }
});

function askName() {
  const back = document.createElement('div');
  back.className = 'modal-back';
  back.innerHTML = `
    <form class="card modal" role="dialog" aria-modal="true" aria-labelledby="nameTitle">
      <h2 id="nameTitle">ما اسمك؟</h2>
      <p class="muted" style="margin:0 0 16px">نستخدمه للترحيب بك فقط، ويُحفظ على جهازك.</p>
      <div class="field"><input class="input" name="name" maxlength="40" placeholder="اكتب اسمك" value="${esc(getName())}" autocomplete="given-name"></div>
      <div style="display:flex;gap:10px;justify-content:flex-end">
        <button type="button" class="btn ghost" data-close>تخطي</button>
        <button class="btn">حفظ</button>
      </div>
    </form>`;
  document.body.appendChild(back);
  const input = back.querySelector('input');
  input.focus();
  const close = () => {
    if (store.get('tf-name', null) === null) store.set('tf-name', '');
    back.remove();
  };
  back.addEventListener('click', (e) => {
    if (e.target === back || e.target.closest('[data-close]')) close();
  });
  back.addEventListener('keydown', (e) => e.key === 'Escape' && close());
  back.querySelector('form').addEventListener('submit', (e) => {
    e.preventDefault();
    store.set('tf-name', input.value.trim());
    back.remove();
    if (!quiz) route();
  });
}

const nameBtn = document.getElementById('nameBtn');
nameBtn.innerHTML = icon('user', 20);
nameBtn.addEventListener('click', askName);

Theme.init();
window.addEventListener('hashchange', route);
route().then(() => {
  if (store.get('tf-name', null) === null) askName();
});

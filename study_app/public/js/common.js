// أدوات مشتركة بين صفحة الطالب ولوحة التحكم
const ICON_PATHS = {
  math: '<path d="M18 4H6l6 8-6 8h12"/>',
  physics: '<circle cx="12" cy="12" r="1.6"/><ellipse cx="12" cy="12" rx="10" ry="4"/><ellipse cx="12" cy="12" rx="10" ry="4" transform="rotate(60 12 12)"/><ellipse cx="12" cy="12" rx="10" ry="4" transform="rotate(120 12 12)"/>',
  chemistry: '<path d="M9 3h6M10 3v6.5L4.6 18.4A1.8 1.8 0 0 0 6.2 21h11.6a1.8 1.8 0 0 0 1.6-2.6L14 9.5V3"/><path d="M7 15h10"/>',
  arabic: '<path d="M4 19.5V5a2 2 0 0 1 2-2h13v15H6a2 2 0 0 0-2 2v0a2 2 0 0 0 2 2h13"/><path d="M9 8h6M9 12h4"/>',
  islamic: '<path d="M20 14.5A8.5 8.5 0 1 1 9.5 4a6.8 6.8 0 0 0 10.5 10.5Z"/><path d="m17 4 .7 1.6 1.8.2-1.3 1.2.4 1.8-1.6-.9-1.6.9.4-1.8-1.3-1.2 1.8-.2Z"/>',
  oman: '<path d="M5 21V4"/><path d="M5 4h14l-3 4.5L19 13H5"/>',
  english: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/>',
  book: '<path d="M2 4h6a4 4 0 0 1 4 4v13a3 3 0 0 0-3-3H2zM22 4h-6a4 4 0 0 0-4 4v13a3 3 0 0 1 3-3h7z"/>',
  lock: '<rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
  check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
  x: '<path d="M18 6 6 18M6 6l12 12"/>',
  star: '<path fill="currentColor" stroke="none" d="m12 2.8 2.8 5.8 6.3.9-4.6 4.4 1.1 6.3L12 17.2 6.4 20.2l1.1-6.3L2.9 9.5l6.3-.9z"/>',
  back: '<path d="m9 6 6 6-6 6"/>',
  next: '<path d="m15 6-6 6 6 6"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  moon: '<path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  trash: '<path d="M4 7h16M10 11v6M14 11v6M5 7l1 12a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2l1-12M9 7V4h6v3"/>',
  up: '<path d="m6 15 6-6 6 6"/>',
  down: '<path d="m6 9 6 6 6-6"/>',
  edit: '<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="m13.5 6.5 4 4"/>',
  chart: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1"/>',
  logout: '<path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3M10 17l-5-5 5-5M5 12h11"/>',
  download: '<path d="M12 3v12M7 10l5 5 5-5M4 21h16"/>',
  upload: '<path d="M12 21V9M7 14l5-5 5 5M4 3h16"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
  eye: '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>',
  trophy: '<path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0zM17 5h3v2a3 3 0 0 1-3 3M7 5H4v2a3 3 0 0 0 3 3"/>',
};

const SUBJECT_ICONS = ['math', 'physics', 'chemistry', 'arabic', 'islamic', 'oman', 'english', 'book'];

function icon(name, size = 22) {
  const p = ICON_PATHS[name] || ICON_PATHS.book;
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${p}</svg>`;
}

function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

// يعزل المقاطع الرياضية/اللاتينية داخل النص العربي حتى لا تنقلب (مثل e^(x²) أو ΔH)
const ARABIC_RANGE = '؀-ۿݐ-ݿﭐ-﷿ﹰ-﻿';
const LATIN_RUN = new RegExp(`[^${ARABIC_RANGE}\\s:،؛؟.]([^${ARABIC_RANGE}]*[^${ARABIC_RANGE}\\s:،؛؟.])?`, 'g');
const MATHY = /[A-Za-z0-9Ͱ-Ͽ√∫∑∞±×÷=<>^⇌→⇒∝]/;

function rich(value) {
  const text = String(value ?? '');
  let out = '';
  let last = 0;
  for (const m of text.matchAll(LATIN_RUN)) {
    if (!MATHY.test(m[0])) continue;
    out += `${esc(text.slice(last, m.index))}<bdi dir="ltr">${esc(m[0])}</bdi>`;
    last = m.index + m[0].length;
  }
  return out + esc(text.slice(last));
}

// يقبل فقط ألوان hex لمنع حقن CSS
const safeColor = (c) => (/^#[0-9a-f]{3,8}$/i.test(c || '') ? c : '#4f6bed');

const store = {
  get(key, fallback, area = 'local') {
    try {
      const raw = window[`${area}Storage`].getItem(key);
      return raw == null ? fallback : JSON.parse(raw);
    } catch {
      return fallback;
    }
  },
  set(key, value, area = 'local') {
    try {
      window[`${area}Storage`].setItem(key, JSON.stringify(value));
    } catch {
      /* التخزين غير متاح (وضع التصفح الخاص مثلاً) */
    }
  },
  remove(key, area = 'local') {
    try {
      window[`${area}Storage`].removeItem(key);
    } catch {
      /* تجاهل */
    }
  },
};

async function api(path, { method = 'GET', body, token } = {}) {
  const headers = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (token) headers.Authorization = `Bearer ${token}`;
  let res;
  try {
    res = await fetch(path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  } catch {
    throw new Error('تعذر الاتصال بالخادم، تحقق من الاتصال');
  }
  let data = null;
  try {
    data = await res.json();
  } catch {
    /* استجابة بدون محتوى */
  }
  if (!res.ok) {
    const err = new Error((data && data.error) || 'حدث خطأ غير متوقع');
    err.status = res.status;
    throw err;
  }
  return data;
}

function toast(message, type = '') {
  let wrap = document.querySelector('.toast-wrap');
  if (!wrap) {
    wrap = document.createElement('div');
    wrap.className = 'toast-wrap';
    wrap.setAttribute('role', 'status');
    document.body.appendChild(wrap);
  }
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.textContent = message;
  wrap.appendChild(el);
  setTimeout(() => el.remove(), 3200);
}

// ---------- الوضع الليلي ----------
const Theme = {
  current() {
    const saved = store.get('tf-theme', null);
    if (saved === 'dark' || saved === 'light') return saved;
    return matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  },
  apply(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    document.querySelectorAll('[data-theme-toggle]').forEach((b) => {
      b.innerHTML = icon(theme === 'dark' ? 'sun' : 'moon', 20);
      b.setAttribute('aria-label', theme === 'dark' ? 'الوضع النهاري' : 'الوضع الليلي');
      b.title = b.getAttribute('aria-label');
    });
  },
  init() {
    Theme.apply(Theme.current());
    document.addEventListener('click', (e) => {
      if (!e.target.closest('[data-theme-toggle]')) return;
      const next = Theme.current() === 'dark' ? 'light' : 'dark';
      store.set('tf-theme', next);
      Theme.apply(next);
    });
  },
};

function starsHtml(count, size = 16) {
  return `<span class="stars" aria-label="${count} من 3 نجوم">${[1, 2, 3]
    .map((i) => `<span class="${i <= count ? 'on' : ''}">${icon('star', size)}</span>`)
    .join('')}</span>`;
}

const PASS_PERCENT = 60;

function starsFor(percent) {
  if (percent >= 90) return 3;
  if (percent >= 75) return 2;
  if (percent >= PASS_PERCENT) return 1;
  return 0;
}

const CATEGORY_LABELS = { scientific: 'المواد العلمية', core: 'المواد الأساسية' };

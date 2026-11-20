import { firebaseConfig } from './firebase-config.js';

export const params = new URLSearchParams(location.search);
export const DEMO = params.has('demo') || !firebaseConfig || !firebaseConfig.apiKey || !firebaseConfig.databaseURL;

/* ───────────── DB layer (Firebase RTDB or local demo) ───────────── */
let api = null;
export async function initDB() {
  if (api) return api;
  api = DEMO ? createLocalDB() : await createFirebaseDB();
  return api;
}

function clean(v) { return v === undefined ? null : JSON.parse(JSON.stringify(v)); }

async function createFirebaseDB() {
  const V = '10.12.2';
  const appMod = await import(`https://www.gstatic.com/firebasejs/${V}/firebase-app.js`);
  const d = await import(`https://www.gstatic.com/firebasejs/${V}/firebase-database.js`);
  const app = appMod.initializeApp(firebaseConfig);
  const db = d.getDatabase(app);
  let offset = 0;
  d.onValue(d.ref(db, '.info/serverTimeOffset'), s => { offset = s.val() || 0; });
  return {
    set: (p, v) => d.set(d.ref(db, p), clean(v)),
    update: (p, v) => d.update(d.ref(db, p), clean(v)),
    remove: (p) => d.remove(d.ref(db, p)),
    get: async (p) => (await d.get(d.ref(db, p))).val(),
    on: (p, cb) => d.onValue(d.ref(db, p), s => cb(s.val())),
    now: () => Date.now() + offset,
  };
}

function createLocalDB() {
  const KEY = 'facegame-demo-db';
  const ch = 'BroadcastChannel' in window ? new BroadcastChannel('facegame-demo') : null;
  const listeners = new Set();
  const split = p => p.split('/').filter(Boolean);
  const read = () => { try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch { return {}; } };
  const getAt = (t, p) => split(p).reduce((o, k) => (o == null ? undefined : o[k]), t);
  const setAt = (t, p, v) => {
    const ks = split(p); let o = t;
    for (let i = 0; i < ks.length - 1; i++) {
      if (typeof o[ks[i]] !== 'object' || o[ks[i]] === null) o[ks[i]] = {};
      o = o[ks[i]];
    }
    const last = ks[ks.length - 1];
    if (v === null || v === undefined) delete o[last]; else o[last] = clean(v);
  };
  const fire = () => {
    const t = read();
    listeners.forEach(l => {
      const v = getAt(t, l.p) ?? null; const s = JSON.stringify(v);
      if (s !== l.last) { l.last = s; l.cb(v); }
    });
  };
  const write = t => {
    try { localStorage.setItem(KEY, JSON.stringify(t)); }
    catch (e) { alert('데모 저장공간이 가득 찼어요. 진행자 화면에서 게임을 초기화해 주세요.'); }
    ch && ch.postMessage(1); fire();
  };
  if (ch) ch.onmessage = fire;
  window.addEventListener('storage', e => { if (e.key === KEY) fire(); });
  return {
    set(p, v) { const t = read(); setAt(t, p, v); write(t); return Promise.resolve(); },
    update(p, obj) { const t = read(); for (const [k, v] of Object.entries(obj)) setAt(t, p + '/' + k, v); write(t); return Promise.resolve(); },
    remove(p) { return this.set(p, null); },
    get: p => Promise.resolve(getAt(read(), p) ?? null),
    on(p, cb) {
      const l = { p, cb, last: undefined }; listeners.add(l);
      setTimeout(() => { const v = getAt(read(), p) ?? null; l.last = JSON.stringify(v); cb(v); }, 0);
      return () => listeners.delete(l);
    },
    now: () => Date.now(),
  };
}

/* ───────────── utils ───────────── */
export const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const roomPath = room => `rooms/${room}`;
export const DEFAULT_THEME = '나를 닮은 아바타 (자화상)';

/* Avatar markup: drawn head + body with name tag. Size is controlled by CSS var --s (head px). */
export function avatarHTML({ name = '', img = '', drawing = false } = {}) {
  return `
    <div class="av-bubble"></div>
    <div class="av-head">${img ? `<img src="${img}" alt="">` : '<div class="av-blank"></div>'}${drawing ? '<span class="av-pencil">✏️</span>' : ''}</div>
    <div class="av-body"><div class="av-collar"></div><div class="av-tag"><i></i><span>${esc(name)}</span></div></div>`;
}

/* Procedural face for test participants */
const SKINS = ['#f6d7b8', '#f1c27d', '#e0ac69', '#ffe0c7'];
export function botFace(size = 400) {
  const c = document.createElement('canvas'); c.width = c.height = size;
  const g = c.getContext('2d'); const S = size; const r = (a, b) => a + Math.random() * (b - a);
  g.fillStyle = SKINS[Math.floor(Math.random() * SKINS.length)];
  g.beginPath(); g.arc(S / 2, S * 0.53, S * 0.4, 0, Math.PI * 2); g.fill();
  g.lineCap = g.lineJoin = 'round';
  const hair = ['#222', '#5b3a1e', '#c9a227', '#7a4b2a'][Math.floor(Math.random() * 4)];
  g.strokeStyle = hair; g.lineWidth = S * 0.03;
  for (let i = 0; i < 28; i++) { const a = r(Math.PI * 1.05, Math.PI * 1.95); const x = S / 2 + Math.cos(a) * S * 0.4, y = S * 0.53 + Math.sin(a) * S * 0.4; g.beginPath(); g.moveTo(x, y); g.lineTo(x + r(-20, 20), y + r(10, 60)); g.stroke(); }
  g.strokeStyle = '#222'; g.lineWidth = S * 0.018;
  const ey = S * r(0.47, 0.52), ex = S * r(0.13, 0.17);
  [-1, 1].forEach(s => { g.beginPath(); g.arc(S / 2 + s * ex, ey, S * r(0.025, 0.045), 0, Math.PI * 2); g.stroke(); });
  if (Math.random() < 0.4) { [-1, 1].forEach(s => g.strokeRect(S / 2 + s * ex - S * 0.07, ey - S * 0.05, S * 0.14, S * 0.1)); g.beginPath(); g.moveTo(S / 2 - ex + S * 0.07, ey); g.lineTo(S / 2 + ex - S * 0.07, ey); g.stroke(); }
  g.beginPath(); g.moveTo(S / 2, S * 0.55); g.lineTo(S / 2 - S * 0.03, S * 0.62); g.lineTo(S / 2 + S * 0.02, S * 0.63); g.stroke();
  g.strokeStyle = Math.random() < 0.5 ? '#d33' : '#222'; g.lineWidth = S * 0.025;
  g.beginPath(); g.arc(S / 2, S * 0.66, S * r(0.06, 0.12), r(0.1, 0.4) * Math.PI, r(0.6, 0.9) * Math.PI); g.stroke();
  return c.toDataURL('image/png');
}
export const BOT_NAMES = ['김병철', '이화경', '박은경', '최민규', '정하늘', '김다윤', '오세훈', '한지민', '윤도현', '서지수', '장영호', '배수아'];
export const BOT_POINTS = ['후드티 쓴 훈남', '안경이 포인트', '월요일 아침 표정', '웃는 눈이 매력', '머리 자르기 전날', '회의 중 집중모드', '커피 수혈 직후', '야근 3일차', '퇴근 5분 전', '점심 메뉴 고민 중'];

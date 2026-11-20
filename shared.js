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
export function avatarHTML({ name = '', img = '', drawing = false, outfit = null } = {}) {
  return `
    <div class="av-bubble"></div>
    <div class="av-head">${img ? `<img src="${img}" alt="">` : '<div class="av-blank"></div>'}${drawing ? '<span class="av-pencil">✏️</span>' : ''}</div>
    <div class="av-body">${bodySVG(outfit)}<div class="av-tag"><i></i><span>${esc(name)}</span></div></div>`;
}

/* ───────────── outfits ───────────── */
export const OUTFITS = [
  { id: 'shirt', label: '셔츠' }, { id: 'hoodie', label: '후드티' }, { id: 'suit', label: '정장' },
  { id: 'tee', label: '티셔츠' }, { id: 'stripe', label: '줄무늬' }, { id: 'knit', label: '니트' },
];
export const OUTFIT_COLORS = ['#f4f5f7', '#2b2f3a', '#3b4a7a', '#8a8f99', '#e85d5d', '#ff9fc0', '#ffd34d', '#5cb85c', '#6ec6ff', '#9b6cf0'];
export const DEFAULT_OUTFIT = { type: 'shirt', color: '#f4f5f7' };
const shade = (hex, amt) => { const n = parseInt(hex.slice(1), 16); const c = v => Math.max(0, Math.min(255, v)); return '#' + ((1 << 24) | (c((n >> 16) + amt) << 16) | (c(((n >> 8) & 255) + amt) << 8) | c((n & 255) + amt)).toString(16).slice(1); };
export function bodySVG(outfit) {
  const o = outfit || {}; const t = OUTFITS.some(x => x.id === o.type) ? o.type : 'shirt';
  const c = /^#[0-9a-f]{6}$/i.test(o.color || '') ? o.color : '#f4f5f7';
  const d = shade(c, -30), dd = shade(c, -60), l = shade(c, 25);
  const torso = 'M6 76 L6 36 Q6 12 32 9 L68 9 Q94 12 94 36 L94 76 Z';
  let pre = '', inner = '', base = c;
  if (t === 'shirt') inner = `<path d="M36 7 L50 26 L42 31 L32 12 Z" fill="${l}" stroke="${d}" stroke-width="1"/><path d="M64 7 L50 26 L58 31 L68 12 Z" fill="${l}" stroke="${d}" stroke-width="1"/><line x1="50" y1="26" x2="50" y2="76" stroke="${d}" stroke-width="1"/>` + [36, 47, 58, 69].map(y => `<circle cx="50" cy="${y}" r="1.6" fill="${dd}"/>`).join('');
  if (t === 'tee') inner = `<path d="M35 8 Q50 24 65 8" fill="none" stroke="${d}" stroke-width="4" stroke-linecap="round"/>`;
  if (t === 'stripe') { base = '#f7f7f9'; const sc = c === '#f4f5f7' ? '#3b4a7a' : c; inner = [20, 32, 44, 56, 68].map(y => `<rect x="0" y="${y}" width="100" height="5" fill="${sc}"/>`).join('') + `<path d="M35 8 Q50 24 65 8" fill="none" stroke="#d6d9e0" stroke-width="4" stroke-linecap="round"/>`; }
  if (t === 'hoodie') { pre = `<path d="M22 20 Q18 0 50 0 Q82 0 78 20 Z" fill="${d}"/>`; inner = `<path d="M30 9 Q50 32 70 9" fill="${d}" stroke="${dd}" stroke-width="1.2"/><line x1="44" y1="24" x2="43" y2="42" stroke="#fff" stroke-width="2.2" stroke-linecap="round"/><line x1="56" y1="24" x2="57" y2="42" stroke="#fff" stroke-width="2.2" stroke-linecap="round"/><path d="M28 77 L32 58 Q50 54 68 58 L72 77 Z" fill="${d}" opacity=".55"/>`; }
  if (t === 'suit') inner = `<path d="M37 8 L50 42 L63 8 Z" fill="#fff"/><path d="M47 13 L53 13 L55 19 L51.5 46 L48.5 46 L45 19 Z" fill="#d6333f"/><path d="M36 8 L50 46 L41 77 L33 77 L29 14 Z" fill="${d}"/><path d="M64 8 L50 46 L59 77 L67 77 L71 14 Z" fill="${d}"/><circle cx="50" cy="60" r="1.8" fill="${dd}"/><circle cx="50" cy="70" r="1.8" fill="${dd}"/>`;
  if (t === 'knit') inner = `<path d="M36 8 L50 30 L64 8 Z" fill="#fff"/><path d="M37 8 L50 27 L63 8" fill="none" stroke="${d}" stroke-width="4"/><rect x="0" y="64" width="100" height="12" fill="${d}"/>` + Array.from({ length: 24 }, (_, i) => `<line x1="${4 + i * 4}" y1="64" x2="${4 + i * 4}" y2="76" stroke="${dd}" stroke-width=".8"/>`).join('');
  return `<svg class="av-svg" viewBox="0 0 100 76" preserveAspectRatio="none" aria-hidden="true"><clipPath id="avclip"><path d="${torso}"/></clipPath>${pre}<path d="${torso}" fill="${base}"/><g clip-path="url(#avclip)">${inner}</g><path d="${torso}" fill="none" stroke="rgba(0,0,0,.2)" stroke-width="1.2"/></svg>`;
}
export function randomOutfit() { return { type: OUTFITS[Math.floor(Math.random() * OUTFITS.length)].id, color: OUTFIT_COLORS[Math.floor(Math.random() * OUTFIT_COLORS.length)] }; }

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

/* Appointment Guide · Collins Ridge
   Private iPad reference tool. Buyer info never leaves this device except in the signed PDF you save. */
(() => {
'use strict';

const D = window.APP_DATA;
const CACHE = 'ag-v5';
const app = document.getElementById('app');
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const money = (v) => '$' + Math.round(v).toLocaleString('en-US');
const pct = (v) => (Math.round(v * 1000) / 1000).toString() + '%';
const today = () => { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
const usDate = (iso) => { const [y, m, d] = String(iso).split('-'); return m && d ? `${+m}/${+d}/${y}` : iso; };
const LS = {
  get(k, d) { try { const v = localStorage.getItem('ag.' + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem('ag.' + k, JSON.stringify(v)); } catch (e) { /* storage blocked */ } },
  del(k) { try { localStorage.removeItem('ag.' + k); } catch (e) { /* storage blocked */ } }
};
const LINKS = {
  hoaFinder: 'https://claude.ai/artifact/JS2mxm8FD5JbLZCLv1eBxk',
  warrantyFinder: 'https://claude.ai/artifact/L6zWAkXBVHTFLdQQCpeAdv',
  tracker: '../sales-tracker/',
  homeToSell: '../home-to-sell-planner/',
  inventory: '../DRH-Inventory-Dashboard/'
};

/* ---------- state ---------- */
const S = {
  talk: null, stage: 0, obj: 0,
  f: {}, mapPlan: 'All', layers: { avail: true, spec: true, open: true, sold: true, unrel: true },
  sel: null, zoom: 1.5, sort: 'price', planZoom: 1,
  ansCat: 'All', q: '',
  pay: { lot: null, price: null, label: '', routes: ['F035', 'C05', 'C20'], bd: false },
  guest: null, pdf: null, pdfName: ''
};

/* ---------- data with on-device overrides ---------- */
const lotsData = () => { const o = LS.get('lots', null); return o && o.lots ? o.lots : D.lots; };
const lotsAsOf = () => { const o = LS.get('lots', null); return o && o.asOf ? o.asOf : D.lotsAsOf; };
const rates = () => { const o = LS.get('rates', null); return o && o.conv ? o : D.rates; };
const bfcLists = () => {
  const o = LS.get('bfcLots', null);
  if (o) return o;
  const out = { novdec: [], jan: [] };
  Object.entries(D.lots).forEach(([n, l]) => { if (l.bfc) out[l.bfc].push(+n); });
  return out;
};
const bfcOf = (n) => { const b = bfcLists(); return b.novdec.includes(+n) ? 'novdec' : (b.jan.includes(+n) ? 'jan' : ''); };
const plan = (name) => D.plans.find((p) => p.name === name);

const ST = {
  avail: { name: 'Home for sale', bg: '#1F5FD1', fg: '#FFFFFF', bd: '#1F5FD1' },
  spec: { name: 'Spec’d, not started', bg: '#F2B33D', fg: '#1D1F21', bd: '#B9811A' },
  open: { name: 'Open lot', bg: '#FFFFFF', fg: '#1D1F21', bd: '#1D1F21' },
  sold: { name: 'Sold', bg: '#55585C', fg: '#FFFFFF', bd: '#55585C' },
  unrel: { name: 'Not released', bg: '#E7E7E3', fg: '#6B6E72', bd: '#B9B9B4' }
};
const statusOf = (l) => !l ? 'unrel' : (l.c === 'spec' ? (l.ms ? 'avail' : 'spec') : (l.c === 'unreleased' ? 'unrel' : l.c));
const badge = (s) => `<span class="badge" style="background:${ST[s].bg};color:${ST[s].fg};border-color:${ST[s].bd}">${ST[s].name}</span>`;

/* ---------- payment math (D.R. Horton calculator method) ---------- */
const LT = {
  F035: { label: 'FHA 3.5% Down', dp: 0.035, up: 0.0175, mi: 0.0052839, kind: 'govt', rate: 'fha' },
  C05: { label: 'Conventional 5% Down', dp: 0.05, up: 0, mi: 0.0035054, kind: 'conv', rate: 'conv' },
  C10: { label: 'Conventional 10% Down', dp: 0.10, up: 0, mi: 0.0022679, kind: 'conv', rate: 'conv' },
  C20: { label: 'Conventional 20% Down', dp: 0.20, up: 0, mi: 0, kind: 'conv', rate: 'conv' },
  V0: { label: 'VA 0% Down', dp: 0, up: 0.0215, mi: 0, kind: 'govt', rate: 'va' }
};
function pmt(loan, ratePct, n = 360) { const r = ratePct / 100 / 12; return r === 0 ? loan / n : loan * r / (1 - Math.pow(1 + r, -n)); }
function estimate(price, code, ratePct, th) {
  const t = LT[code];
  const down = Math.round(price * t.dp);
  const loan = (price - down) * (1 + t.up);
  const pi = pmt(loan, ratePct);
  const tax = price * 0.0122 / 12, ins = price * 0.00276 / 12, mi = price * t.mi / 12, hoa = th ? 195 : 85;
  const total = pi + tax + ins + mi + hoa;
  const high = total + 0.10 * (tax + ins) + 0.25 * mi;
  return { down, loan, pi, tax, ins, mi, hoa, total, high, rate: ratePct };
}
window.__payTest = { estimate, pmt, LT };

/* ---------- unlock ---------- */
const b64d = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
const b64e = (u8) => btoa(String.fromCharCode.apply(null, Array.from(u8)));
async function deriveKey(pass) {
  const T = window.TALK_LOCKED;
  const norm = pass.toLowerCase().replace(/[^a-z0-9]/g, '');
  const km = await crypto.subtle.importKey('raw', new TextEncoder().encode(norm), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey({ name: 'PBKDF2', salt: b64d(T.salt), iterations: T.iter, hash: 'SHA-256' }, km, { name: 'AES-GCM', length: 256 }, true, ['decrypt']);
}
async function openTalk(key) {
  const T = window.TALK_LOCKED;
  const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: b64d(T.iv) }, key, b64d(T.ct));
  S.talk = JSON.parse(new TextDecoder().decode(pt));
}
async function tryAuto() {
  const raw = LS.get('k', null);
  if (!raw) return false;
  try { const key = await crypto.subtle.importKey('raw', b64d(raw), { name: 'AES-GCM' }, false, ['decrypt']); await openTalk(key); return true; }
  catch (e) { LS.del('k'); return false; }
}

/* ---------- routing ---------- */
const route = () => { const h = location.hash.replace(/^#\/?/, ''); const parts = h.split('/'); return { name: parts[0] || 'menu', arg: decodeURIComponent(parts.slice(1).join('/')) }; };
const go = (h) => { location.hash = '#/' + h; };
let lastRoute = '';
async function render() {
  if (!S.talk && !(await tryAuto())) { app.innerHTML = viewLock(); const p = document.getElementById('pass'); if (p) p.focus(); return; }
  const r = route();
  const v = VIEWS[r.name] || VIEWS.menu;
  app.innerHTML = v(r.arg);
  if (AFTER[r.name]) AFTER[r.name](r.arg);
  const key = r.name + '/' + r.arg;
  if (key !== lastRoute) { window.scrollTo(0, 0); lastRoute = key; }
}
function rerender() { const y = window.scrollY; const ms = document.querySelector('.mapbox'); const mx = ms ? [ms.scrollLeft, ms.scrollTop] : null; render().then(() => { window.scrollTo(0, y); const m2 = document.querySelector('.mapbox'); if (m2 && mx) { m2.scrollLeft = mx[0]; m2.scrollTop = mx[1]; } }); }
window.addEventListener('hashchange', render);

function toast(msg) { const t = document.createElement('div'); t.className = 'toast'; t.textContent = msg; document.body.appendChild(t); setTimeout(() => t.remove(), 2600); }
const top = (title, opts = {}) => `<header class="top">
  ${opts.back ? `<a class="btn" href="#/${opts.back}">← ${esc(opts.backLabel || 'Menu')}</a>` : ''}
  <div><div class="sub">${esc(opts.sub || 'Collins Ridge')}</div><div class="title">${esc(title)}</div></div>
  <div class="grow"></div>${opts.right || ''}</header>`;

/* ---------- views ---------- */
function viewLock() {
  return `<div class="lock"><form class="card" id="unlock">
    <div class="label">Appointment guide</div><h1>Collins Ridge</h1>
    <input type="text" name="username" autocomplete="username" value="Collins Ridge guide" readonly tabindex="-1" aria-hidden="true" style="position:absolute;left:-9999px;width:1px;height:1px;opacity:0">
    <label class="f">Passcode<input type="password" id="pass" name="password" autocomplete="current-password" autocapitalize="off" autocorrect="off" spellcheck="false"></label>
    <label class="check"><input type="checkbox" id="remember" checked> Remember this device</label>
    <button class="btn primary" type="submit">Unlock</button>
    <div class="muted small" id="lockmsg" role="status"></div></form></div>`;
}

const VIEWS = {};
const AFTER = {};

VIEWS.menu = () => {
  const r = rates();
  const tiles = D.library.map((c) => `<a class="tile" href="#/library/${encodeURIComponent(c.cat)}"><b>${esc(c.cat)}</b><span>${c.items.length} document${c.items.length === 1 ? '' : 's'}</span></a>`).join('');
  return `<div class="app">${top('Collins Ridge', {
    sub: 'Appointment guide',
    right: `<a class="btn icon" href="#/talk" aria-label="Talk track" title="Talk track"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M4 6h16M4 12h16M4 18h10"/></svg></a>
      <form id="msearch" class="grow" style="min-width:220px"><input type="search" id="mq" placeholder="Search answers: HOA, warranty, features, area…" aria-label="Search answers"></form>
      <a class="btn dark" href="#/guest">Guest card + WWREA</a>`
  })}
  <main class="wrap">
    <div class="grid g4">
      <a class="tile hero" href="#/plans"><b>Find a home</b><span>Narrow the plan, then pick the lot</span></a>
      <a class="tile" href="#/map"><b>Site map + lots</b><span>For sale, spec’d, open, sold</span></a>
      <a class="tile" href="#/pay"><b>Payment compare</b><span>Builder rate vs. today’s rate</span></a>
      <a class="tile" href="#/next"><b>Next steps</b><span>Deposit to DocuSign</span></a>
    </div>
    <div class="label" style="margin-top:6px">Library</div>
    <div class="grid g4">${tiles}
      <a class="tile" href="#/answers"><b>Quick answers</b><span>${D.answers.length} answers, searchable</span></a>
      <a class="tile" href="${LINKS.hoaFinder}" target="_blank" rel="noopener"><b>HOA Answer Finder ↗</b><span>Your Claude tool</span></a>
      <a class="tile" href="${LINKS.warrantyFinder}" target="_blank" rel="noopener"><b>Warranty Answer Finder ↗</b><span>Your Claude tool</span></a>
    </div>
  </main>
  <footer class="footer"><span class="muted">Lots ${usDate(lotsAsOf())} · Rates ${usDate(r.asOf)}</span><span class="grow"></span>
    <a href="${LINKS.tracker}">Sales tracker ↗</a><a href="${LINKS.homeToSell}" target="_blank" rel="noopener">Home-to-Sell Planner ↗</a><a href="#/settings">Settings</a></footer></div>`;
};
AFTER.menu = () => {
  const f = document.getElementById('msearch');
  if (f) f.addEventListener('submit', (e) => { e.preventDefault(); S.q = document.getElementById('mq').value; S.ansCat = 'All'; go('answers'); });
};

/* talk track (private) */
VIEWS.talk = () => {
  const T = S.talk, n = T.stages.length;
  const rail = T.stages.map((s, i) => `<button data-a="stage" data-i="${i}" class="${S.stage === i ? 'on' : ''}"><span class="n">${i + 1}</span>${esc(s.name)}</button>`).join('')
    + `<button data-a="stage" data-i="${n}" class="${S.stage === n ? 'on' : ''}"><span class="n">!</span>Objections</button>`;
  let body;
  if (S.stage < n) {
    const s = T.stages[S.stage];
    body = `<div><h1 style="font-size:26px">${esc(s.name)}</h1><div class="muted" style="font-size:16px">${esc(s.goal)}</div></div>
    <div class="split"><section class="card main" style="display:flex;flex-direction:column;gap:14px"><div class="label">Ask</div>
      ${s.ask.map((g) => `<div style="display:flex;flex-direction:column;gap:6px"><div class="muted small" style="font-weight:650">${esc(g.h)}</div>${g.q.map((q) => `<p class="q">${esc(q)}</p>`).join('')}</div>`).join('')}</section>
    <div class="side" style="display:flex;flex-direction:column;gap:12px">
      <section class="card" style="display:flex;flex-direction:column;gap:10px"><div class="label">Done when · before moving on</div>
        ${s.done.map((d) => `<div style="display:flex;gap:10px"><span class="box"></span><span>${esc(d)}</span></div>`).join('')}</section>
      <section class="card" style="display:flex;flex-direction:column;gap:8px"><div class="label">Tone · pace · pauses</div>
        <div>${s.tone.map((t) => `<span class="tone">${esc(t)}</span>`).join('')}</div>
        <div><b>Pace:</b> ${esc(s.pace)}</div><div><b>Pause:</b> ${esc(s.pause)}</div></section></div></div>`;
  } else {
    const o = T.objections[S.obj] || T.objections[0];
    body = `<div><h1 style="font-size:26px">Objections</h1><div class="muted">Every objection runs the same flow. Neutral, curious, slow.</div></div>
    <div class="grid g3">${T.flow.map((f) => `<section class="card"><div style="font-weight:700;color:#8FB4F7;margin-bottom:6px">${esc(f.h)}</div>${f.q.map((q) => `<p class="q" style="font-size:16px">${esc(q)}</p>`).join('')}</section>`).join('')}</div>
    <div class="row">${T.principles.map((p) => `<span class="pill">${esc(p)}</span>`).join('')}</div>
    <div class="row">${T.objections.map((x, i) => `<button class="chip ${i === S.obj ? 'on' : ''}" data-a="obj" data-i="${i}">${esc(x.name)}</button>`).join('')}</div>
    <section class="card" style="display:flex;flex-direction:column;gap:8px"><div class="row"><b style="font-size:18px">${esc(o.name)}</b><span style="color:#F2C976">${esc(o.note)}</span></div>
      ${o.lines.map((l) => `<p class="q">${esc(l)}</p>`).join('')}</section>`;
  }
  return `<div class="talk">${top('Talk track', { back: 'menu', backLabel: 'Back to menu', sub: 'Only you see this', right: '<span class="muted small">Plaud catches the details.</span>' })}
    <div class="talk-body"><nav class="talk-rail" aria-label="NEPQ stages">${rail}</nav><main class="talk-main">${body}</main></div></div>`;
};

/* find a home: plans */
const specsFor = (name) => Object.entries(lotsData()).filter(([, l]) => l.c === 'spec' && l.plan === name).map(([n, l]) => ({ n: +n, l }));
VIEWS.plans = () => {
  const f = S.f, PB = priceBands();
  const inBand = (v, k) => { const b = PB.bands.find((x) => x.k === k); return b && v >= b.lo && v < b.hi; };
  const chip = (k, v, t) => `<button class="chip ${f[k] === v ? 'on' : ''}" data-a="filt" data-k="${k}" data-v="${v}">${t}</button>`;
  const want = (h) => { const z = parseSize(h.l.size); if (f.beds && (!z || z.bd !== +f.beds)) return false; if (f.ba && (!z || z.ba !== +f.ba)) return false; return !(f.pr && PB && !inBand(h.l.price, f.pr)); };
  const buildFrom = (p) => p.base ? p.base + minPrem() : 0;
  const canBuild = (p, c) => !!p.base && (!f.beds || c.beds.includes(+f.beds)) && (!f.ba || c.baths.includes(+f.ba)) && (!f.pr || !PB || inBand(buildFrom(p), f.pr));
  const narrowed = !!(f.beds || f.ba || f.pr);
  const match = (p) => {
    if (f.st && p.st !== +f.st) return false;
    if (f.pd === '1' && !p.pd) return false;
    if (f.b1 === '1' && !p.b1) return false;
    if (f.ty && p.type !== f.ty) return false;
    const c = cfg(p);
    if (f.beds && !c.beds.includes(+f.beds)) return false;
    if (f.ba && !c.baths.includes(+f.ba)) return false;
    if (narrowed && !specsFor(p.name).some(want) && !canBuild(p, c)) return false;
    return true;
  };
  const list = D.plans.filter(match);
  const cards = list.map((p) => {
    const c = cfg(p), homes = specsFor(p.name).filter(want);
    const opt = [f.beds && +f.beds !== c.bs ? `${f.beds} bd` : '', f.ba && +f.ba !== c.ts ? `${f.ba} ba` : ''].filter(Boolean).join(' and ');
    const avail = homes.length ? `${homes.length} home${homes.length > 1 ? 's' : ''} for sale${narrowed ? (homes.length > 1 ? ' that match' : ' that matches') : ''} · from ${money(Math.min(...homes.map((h) => h.l.price)))}`
      : (canBuild(p, c) ? `Build on an open lot · from ${money(buildFrom(p))}${opt ? ` <span class="muted small" style="font-weight:500">· ${opt} is an option</span>` : ''}` : 'No homes for sale right now');
    return `<a class="card plancard" href="#/plan/${encodeURIComponent(p.name)}" style="text-decoration:none;color:inherit;display:flex;flex-direction:column;gap:8px">
      <img src="${p.elev}" alt="${esc(p.name)} elevations" loading="lazy">
      <div class="row"><b style="font-size:20px">${esc(p.name)}</b><span class="grow"></span><span class="label">${p.type === 'TH' ? 'Townhome' : 'Single-family'}</span></div>
      <div>${p.sqft} sq ft · ${rng(c.beds)} bd · ${rng(c.baths)} ba · ${p.st} story</div>
      <div class="muted small">${esc(p.note)}</div><div style="font-weight:650">${avail}</div></a>`;
  }).join('');
  const pchips = PB ? PB.bands.map((b) => chip('pr', b.k, `${b.t}<span class="ct" aria-label="${b.n} homes">${b.n}</span>`)).join('') : '';
  return `<div class="app">${top('Find a home', { back: 'menu', right: `<a class="btn" href="#/map">Site map →</a>` })}
  <div class="card" style="border-radius:0;border-left:0;border-right:0;display:flex;flex-wrap:wrap;gap:10px 18px;align-items:center">
    <span class="label">Beds</span>${countChips('beds', (c) => c.beds, chip)}
    <span class="label">Baths</span>${countChips('ba', (c) => c.baths, chip)}
    <span class="label">Stories</span>${chip('st', '1', '1')}${chip('st', '2', '2')}
    <span class="label">First floor</span>${chip('pd', '1', 'Primary down')}${chip('b1', '1', 'Any bedroom')}
    <span class="label">Type</span>${chip('ty', 'SF', 'Single-family')}${chip('ty', 'TH', 'Townhome')}
    ${PB ? `<span class="label">Price</span>${pchips}` : ''}
    ${Object.values(f).some(Boolean) ? '<button class="btn small" data-a="filtclear">Clear</button>' : ''}
  </div>
  <main class="wrap"><div class="muted">${list.length} of ${D.plans.length} plans match. Tap a plan to see the floor plan and its lots.</div><div class="grid g4">${cards}</div></main></div>`;
};
/* Beds and baths: what each plan can be, standard or with options (plan sheets), plus any configuration
   seen in the homes for sale. A home for sale only matches its own built configuration. */
const parseSize = (s) => { const m = /(\d+)\s*bd\s*·\s*([\d.]+)\s*ba/.exec(s || ''); return m ? { bd: +m[1], ba: +m[2] } : null; };
function cfg(p) {
  const beds = new Set([p.bs].concat(p.bo || [])), baths = new Set([p.ts].concat(p.to || []));
  specsFor(p.name).forEach((h) => { const z = parseSize(h.l.size); if (z) { beds.add(z.bd); baths.add(z.ba); } });
  return { beds: [...beds].sort((x, y) => x - y), baths: [...baths].sort((x, y) => x - y), bs: p.bs, ts: p.ts };
}
const rng = (a) => (a.length > 1 ? `${a[0]}–${a[a.length - 1]}` : String(a[0]));
const minPrem = () => { const ps = Object.values(lotsData()).filter((l) => l.c === 'open').map((l) => l.prem || 0); return ps.length ? Math.min(...ps) : 0; };
function countChips(key, pick, chip) {
  const counts = {};
  D.plans.forEach((p) => pick(cfg(p)).forEach((v) => { counts[v] = (counts[v] || 0) + 1; }));
  return Object.keys(counts).map(Number).sort((a, b) => a - b).map((v) => chip(key, String(v), `${v}<span class="ct" aria-label="${counts[v]} plans">${counts[v]}</span>`)).join('');
}

/* Price chips split the homes for sale into thirds, so each chip always has homes in it as inventory changes. */
function priceBands() {
  const prices = Object.values(lotsData()).filter((l) => l.c === 'spec' && l.price).map((l) => l.price).sort((a, b) => a - b);
  const n = prices.length;
  if (n < 3) return null;
  const cut = (k) => {
    const lo = prices[k - 1], hi = prices[k], mid = (lo + hi) / 2;
    for (const step of [5000, 1000]) { const b = Math.round(mid / step) * step; if (b > lo && b <= hi) return b; }
    return hi;
  };
  const c1 = cut(Math.round(n / 3)), c2 = cut(Math.round(2 * n / 3));
  const k = (v) => '$' + Math.round(v / 1000) + 'K';
  const count = (lo, hi) => prices.filter((v) => v >= lo && v < hi).length;
  return { bands: [
    { k: 'lo', lo: 0, hi: c1, t: 'Under ' + k(c1), n: count(0, c1) },
    { k: 'mid', lo: c1, hi: c2, t: `${k(c1).slice(0, -1)}–${k(c2).slice(1)}`, n: count(c1, c2) },
    { k: 'hi', lo: c2, hi: Infinity, t: k(c2) + '+', n: count(c2, Infinity) }
  ] };
}
function optLine(all, std, word) { const o = all.filter((v) => v !== std); return o.length ? `${std} ${word} standard <span class="muted">· ${o.join(' or ')} with options</span>` : `${std} ${word}`; }
function fromPrice(p) { const homes = specsFor(p.name); const m = homes.length ? Math.min(...homes.map((h) => h.l.price)) : 0; return Math.min(m || Infinity, p.base || Infinity) === Infinity ? 0 : Math.min(m || Infinity, p.base || Infinity); }

VIEWS.plan = (name) => {
  const p = plan(name);
  if (!p) return VIEWS.plans();
  const homes = specsFor(p.name).sort((a, b) => a.l.price - b.l.price);
  const opens = Object.entries(lotsData()).filter(([, l]) => l.c === 'open').map(([n, l]) => ({ n: +n, l })).sort((a, b) => a.l.prem - b.l.prem);
  const homeRows = homes.map((h) => `<button class="item" data-a="lotgo" data-n="${h.n}"><span class="sw" style="background:${ST[statusOf(h.l)].bg};border-color:${ST[statusOf(h.l)].bd}"></span><b style="width:70px">Lot ${h.n}</b><span class="grow">${esc(h.l.addr)}${parseSize(h.l.size) ? ` <span class="muted small">· ${parseSize(h.l.size).bd} bd · ${parseSize(h.l.size).ba} ba</span>` : ''}</span><b>${money(h.l.price)}</b></button>`).join('');
  return `<div class="app">${top(p.name, { back: 'plans', backLabel: 'Plans', sub: p.type === 'TH' ? 'Townhome' : 'Single-family', right: `<button class="btn primary" data-a="planmap" data-p="${esc(p.name)}">See ${esc(p.name)} lots on the map</button>` })}
  <main class="wrap"><div class="split">
    <div class="main"><div class="row" style="margin-bottom:8px"><button class="btn small" data-a="pz" data-d="-1" aria-label="Zoom out">−</button><button class="btn small" data-a="pz" data-d="1" aria-label="Zoom in">+</button><span class="muted small">Pinch or use + / − to zoom</span></div>
      <div class="planimg"><img src="${p.img}" alt="${esc(p.name)} floor plan" style="width:${Math.round(100 * S.planZoom)}%"></div></div>
    <aside class="side" style="display:flex;flex-direction:column;gap:12px">
      <section class="card"><div style="font-size:22px;font-weight:700">${p.sqft} sq ft</div><div>${optLine(cfg(p).beds, cfg(p).bs, 'bed')} · ${optLine(cfg(p).baths, cfg(p).ts, 'bath')}</div><div>${p.st} story · 2-car garage</div><div class="muted small" style="margin-top:4px">${esc(p.note)}</div>
        ${p.base ? `<div style="margin-top:8px">Base price from <b>${money(p.base)}</b> <span class="muted small">(drhorton.com)</span></div>` : ''}</section>
      <section class="card list"><div class="label" style="margin-bottom:6px">${homes.length ? 'For sale now' : 'No ' + esc(p.name) + ' homes for sale right now'}</div>${homeRows}</section>
      ${p.type === 'SF' && p.base ? `<section class="card list"><div class="label" style="margin-bottom:6px">Build it on an open lot</div>
        ${opens.slice(0, 6).map((o) => `<button class="item" data-a="lotgo" data-n="${o.n}"><span class="sw" style="background:#fff;border-color:#1D1F21"></span><b style="width:70px">Lot ${o.n}</b><span class="grow muted small">+${money(o.l.prem)} lot premium</span><b>${money(p.base + o.l.prem)}</b></button>`).join('')}
        <div class="muted small" style="margin-top:6px">Base + lot premium. Elevation and options change the final price.</div></section>` : ''}
    </aside></div></main></div>`;
};

/* site map */
VIEWS.map = () => {
  const L = lotsData(), pos = D.pos;
  const fits = (n) => S.mapPlan === 'All' || (L[n] && L[n].plan === S.mapPlan) || (L[n] && L[n].c === 'open' && plan(S.mapPlan) && plan(S.mapPlan).type === 'SF');
  const dots = Object.entries(pos).map(([n, xy]) => {
    const l = L[n], s = statusOf(l), st = ST[s];
    if (!S.layers[s]) return '';
    return `<button class="lot ${String(S.sel) === n ? 'sel' : ''} ${fits(n) ? '' : 'dim'}" data-a="lot" data-n="${n}" aria-label="Lot ${n}, ${st.name}" style="left:${xy[0]}%;top:${xy[1]}%;background:${st.bg};color:${st.fg};border-color:${st.bd}">${n}</button>`;
  }).join('');
  const counts = { avail: 0, spec: 0, open: 0, sold: 0, unrel: 0 };
  Object.values(L).forEach((l) => { counts[statusOf(l)]++; });
  const layers = Object.keys(ST).map((k) => `<button class="item" data-a="layer" data-k="${k}" style="${S.layers[k] ? '' : 'opacity:.45'}"><span class="sw" style="background:${ST[k].bg};border-color:${ST[k].bd}"></span><span class="grow">${ST[k].name}</span><b>${counts[k]}</b></button>`).join('');
  const plans = ['All'].concat(D.plans.map((p) => p.name)).map((p) => `<button class="chip dark ${S.mapPlan === p ? 'on' : ''}" data-a="mplan" data-p="${p}" style="min-height:36px;font-size:14px">${p}</button>`).join('');
  const sellable = Object.entries(L).filter(([n, l]) => ['avail', 'spec', 'open'].includes(statusOf(l)) && S.layers[statusOf(l)] && fits(n)).map(([n, l]) => ({ n: +n, l }));
  sellable.sort((a, b) => S.sort === 'lot' ? a.n - b.n : ((a.l.price || 900000 + a.l.prem) - (b.l.price || 900000 + b.l.prem)));
  const rows = sellable.map((x) => `<button class="item ${S.sel === x.n ? 'sel' : ''}" data-a="lot" data-n="${x.n}"><span class="sw" style="background:${ST[statusOf(x.l)].bg};border-color:${ST[statusOf(x.l)].bd}"></span><b style="width:66px">Lot ${x.n}</b><span class="grow">${esc(x.l.plan || 'Open · your choice')}</span><b>${x.l.price ? money(x.l.price) : '+' + money(x.l.prem)}</b></button>`).join('');
  return `<div class="app">${top('Site map', { back: 'menu', right: `<a class="btn" href="#/plans">← Plans</a>` })}
  <main class="wrap"><div class="split">
    <div class="main"><div class="mapbox" id="mapbox"><div class="zoom"><button class="btn icon" data-a="zoom" data-d="1" aria-label="Zoom in">+</button><button class="btn icon" data-a="zoom" data-d="-1" aria-label="Zoom out">−</button></div>
      <div class="mapinner" style="width:${Math.round(100 * S.zoom)}%"><img src="assets/sitemap.jpg" alt="Collins Ridge site map">${dots}</div></div>
      <div class="muted small" style="margin-top:6px">Lots ${usDate(lotsAsOf())}. Lots 61 and 62 are placed by hand; the map PDF doesn’t label them.</div></div>
    <aside class="side" style="display:flex;flex-direction:column;gap:12px">
      ${S.sel ? lotCard(S.sel) : '<section class="card muted">Tap a lot to see what’s there.</section>'}
      <section class="card list"><div class="label" style="margin-bottom:4px">Show on map</div>${layers}</section>
      <section class="card"><div class="label" style="margin-bottom:8px">Plan</div><div class="row">${plans}</div></section>
      <section class="card list"><div class="row" style="margin-bottom:4px"><span class="label grow">${sellable.length} you can sell</span>
        <button class="chip dark ${S.sort === 'price' ? 'on' : ''}" data-a="sort" data-k="price" style="min-height:34px">Price</button><button class="chip dark ${S.sort === 'lot' ? 'on' : ''}" data-a="sort" data-k="lot" style="min-height:34px">Lot #</button></div>${rows}</section>
    </aside></div></main></div>`;
};
AFTER.map = () => {
  const box = document.getElementById('mapbox'); if (!box || S._mapCentered === S.sel + '|' + S.zoom) return;
  S._mapCentered = S.sel + '|' + S.zoom;
  let x = 0.45, y = 0.5;
  if (S.sel && D.pos[S.sel]) { x = D.pos[S.sel][0] / 100; y = D.pos[S.sel][1] / 100; }
  const inner = box.querySelector('.mapinner'), img = inner && inner.querySelector('img');
  const go = () => { box.scrollLeft = x * inner.offsetWidth - box.clientWidth / 2; box.scrollTop = y * inner.offsetHeight - box.clientHeight / 2; };
  if (img && !img.complete) img.addEventListener('load', go, { once: true }); else go();
};
function lotCard(n) {
  const l = lotsData()[n], s = statusOf(l);
  if (!l) return '';
  let body = '';
  if (s === 'avail' || s === 'spec') {
    const b = bfcOf(n), r = rates();
    body = `<div style="font-size:19px;font-weight:700">${esc(l.plan)}</div><div>${esc(l.addr)}</div><div class="muted">${esc(l.size)}</div>
      <div class="row"><span style="font-size:24px;font-weight:700">${money(l.price)}</span><span class="muted small">${l.ms ? 'Stage M' + esc(l.ms) : 'Not started'}</span></div>
      <div class="small">${b ? `BFC: ${b === 'novdec' ? 'Nov/Dec' : 'Jan'} closing · ${r[b].govt}% govt / ${r[b].conv}% conv` : '<span class="muted">Not on a BFC list</span>'}</div>
      <div class="row"><a class="btn" href="#/plan/${encodeURIComponent(l.plan)}">Floor plan</a><button class="btn primary" data-a="paylot" data-n="${n}">Payment compare</button></div>`;
  } else if (s === 'open') {
    const sf = D.plans.filter((p) => p.type === 'SF' && p.base).sort((a, b) => a.base - b.base);
    body = `<div style="font-size:19px;font-weight:700">Open lot · choose your plan</div><div>${esc(l.addr)}</div><div>Lot premium <b>${money(l.prem)}</b></div>
      <div class="list">${sf.map((p) => `<button class="item" data-a="payopen" data-n="${n}" data-p="${p.name}"><span class="grow">${p.name}</span><span class="muted small">${money(p.base)} + ${money(l.prem)}</span><b>${money(p.base + l.prem)}</b></button>`).join('')}</div>
      <div class="muted small">Base + premium. Tap a plan for its payment compare.</div>`;
  } else if (s === 'sold') {
    body = `<div style="font-size:19px;font-weight:700">Sold${l.plan ? ' · ' + esc(l.plan) : ''}</div><div>${esc(l.addr)}</div>`;
  } else {
    body = /Model/.test(l.st || '') ? `<div style="font-size:19px;font-weight:700">Model home${l.plan ? ' · ' + esc(l.plan) : ''}</div><div>${esc(l.addr)}</div><div class="muted small">Not for sale yet</div>` : `<div style="font-size:19px;font-weight:700">Not released yet</div><div>${esc(l.addr)}</div>`;
  }
  return `<section class="card" style="display:flex;flex-direction:column;gap:8px"><div class="row"><b style="font-size:22px">Lot ${n}</b>${badge(s)}</div>${body}</section>`;
}

/* payment compare */
VIEWS.pay = () => {
  const L = lotsData(), r = rates();
  let price = S.pay.price, label = S.pay.label, th = false, bfc = '';
  if (S.pay.lot && L[S.pay.lot] && L[S.pay.lot].c === 'spec') {
    const l = L[S.pay.lot]; price = l.price; label = `Lot ${S.pay.lot} · ${l.plan} · ${l.addr}`; th = !!l.th; bfc = bfcOf(S.pay.lot);
  }
  const specs = Object.entries(L).filter(([, l]) => l.c === 'spec').sort((a, b) => a[1].price - b[1].price);
  const picker = `<select id="paypick" aria-label="Choose a home"><option value="">Choose a home…</option>
    ${specs.map(([n, l]) => `<option value="${n}" ${String(S.pay.lot) === n ? 'selected' : ''}>Lot ${n} · ${esc(l.plan)} · ${money(l.price)}</option>`).join('')}
    <option value="custom" ${!S.pay.lot && price ? 'selected' : ''}>Custom price</option></select>`;
  const chips = Object.keys(LT).map((k) => `<button class="chip ${S.pay.routes.includes(k) ? 'on' : ''}" data-a="route" data-k="${k}">${LT[k].label.replace(' Down', '')}</button>`).join('');
  let cards = '<div class="card muted">Pick a home or enter a price.</div>';
  if (price) {
    cards = `<div class="grid ${S.pay.routes.length > 2 ? 'g3' : 'g2'}">` + S.pay.routes.map((k) => {
      const t = LT[k], mr = r[t.rate], m = estimate(price, k, mr, th);
      const br = bfc ? r[bfc][t.kind] : null, b = br ? estimate(price, k, br, th) : null;
      const gap = b ? m.pi - b.pi : 0;
      const bd = (e) => `<table class="bd"><tr><td>Principal + interest</td><td>${money(e.pi)}</td></tr><tr><td>Property tax</td><td>${money(e.tax)}</td></tr><tr><td>Home insurance</td><td>${money(e.ins)}</td></tr>
        <tr><td>Mortgage insurance</td><td>${money(e.mi)}</td></tr><tr><td>HOA</td><td>${money(e.hoa)}</td></tr><tr><td><b>Estimate</b></td><td><b>${money(e.total)}</b></td></tr></table>`;
      return `<section class="card route"><div><b style="font-size:19px">${t.label}${b ? ' w/ BFC*' : ''}</b><div class="muted small">${money(m.down)} down · 30-year fixed</div></div>
        ${b ? `<div class="est bfc"><div class="small" style="font-weight:650">With the builder rate (BFC) · ${pct(br)}*</div><div class="amt">${money(b.total)} – ${money(Math.ceil(b.high / 10) * 10)}</div><div class="small">per month, estimated</div>${S.pay.bd ? bd(b) : ''}</div>` : `<div class="est mkt small">No BFC rate on this home. Ask about current incentives.</div>`}
        <div class="est mkt"><div class="small" style="font-weight:650">At today’s rate · ${pct(mr)}</div><div class="amt">${money(m.total)} – ${money(Math.ceil(m.high / 10) * 10)}</div><div class="small">per month, estimated</div>${S.pay.bd ? bd(m) : ''}</div>
        ${b ? `<div class="bar" aria-hidden="true"><i style="width:${Math.round(100 * b.total / m.total)}%"></i></div><div style="font-size:18px;font-weight:700">About ${money(gap)} less per month</div><div class="muted small">About ${money(gap * 12)} less per year</div>` : ''}
        ${m.mi ? `<div class="muted small">Mortgage insurance estimated at ${money(m.mi)}/mo. It varies with credit; the range allows for that.</div>` : ''}</section>`;
    }).join('') + '</div>';
  }
  return `<div class="app">${top('Payment compare', { back: 'menu' })}
  <main class="wrap">
    <section class="card" style="display:flex;flex-direction:column;gap:10px">
      <div class="row"><div style="flex:1 1 320px">${picker}</div><input type="number" id="payprice" inputmode="numeric" placeholder="Price" value="${price ? Math.round(price) : ''}" style="flex:0 1 200px" aria-label="Price"></div>
      ${label ? `<div><b>${esc(label)}</b>${bfc ? ` <span class="badge" style="background:#E6EEFB;color:#163F8C">BFC · ${bfc === 'novdec' ? 'Nov/Dec' : 'Jan'} closing</span>` : ''}</div>` : ''}
      <div class="row">${chips}<span class="grow"></span><button class="btn small" data-a="bd">${S.pay.bd ? 'Hide' : 'Show'} breakdown</button></div>
    </section>
    ${cards}
    <p class="small" style="margin:0">Same method as the drhorton.com calculator: taxes about 1.22% of price, insurance about 0.276%, HOA $85 (townhome $195), FHA upfront MIP financed. Today’s rates are D.R. Horton’s sample rates as of ${usDate(r.asOf)}. Each range starts at the website’s estimate and adds room for taxes, insurance and mortgage insurance running higher. Laura confirms real numbers.</p>
    <details class="card"><summary style="font-weight:650;cursor:pointer;min-height:28px">*Legal disclaimer</summary><div class="legal" style="margin-top:8px">${esc(LEGAL)}</div></details>
  </main></div>`;
};
AFTER.pay = () => {
  const pick = document.getElementById('paypick'), inp = document.getElementById('payprice');
  if (pick) pick.addEventListener('change', () => {
    if (pick.value === 'custom' || pick.value === '') { S.pay.lot = null; S.pay.label = 'Custom price'; S.pay.price = +inp.value || null; }
    else { S.pay.lot = +pick.value; S.pay.price = null; }
    rerender();
  });
  if (inp) inp.addEventListener('change', () => { S.pay.lot = null; S.pay.price = +inp.value || null; S.pay.label = 'Custom price'; rerender(); });
};
const LEGAL = `This is NOT a loan offer. D.R. Horton, the seller, is not a lender and does not offer financing. The above calculator and any related information provide an example of mortgage payments calculated for general informational and educational purposes only, are based on the above sample data points and cannot be used to determine loan terms or costs for any actual mortgage loan. Sample results may not be available to you for financing purposes, or address all loan options or important considerations for home buying and financing decisions. Mortgage loan terms actually available to you depend on factors like the lender and loan type you choose, and are subject to credit approval, market conditions, availability, and other terms and conditions, including closing costs which may increase the monthly payment calculation.

The source of sample rates prepopulated in the calculator for the Conventional 5% Down, Conventional 10% Down, Conventional 20% Down, FHA 3.5% Down and VA 0% Down loan types is Optimal Blue, LLC, OBMMI, and Optimal Blue Mortgage Market Indices, www2.optimalblue.com/OBMMI. Optimal Blue, LLC is and shall remain the exclusive owner of all rights related thereto. If the Loan Type in the calculator includes "w/ BFC*" in the name, it is prepopulated with an example rate involving a Builder Forward Commitment (BFC), such as those that D.R. Horton periodically enters with DHI Mortgage Company, Ltd. (DHIM), its affiliated lender, to lock in a fixed interest rate for a pool of funds. Such rate is only available to qualified borrowers and homes until the pool of funds is depleted or the rate expires, and additional terms and conditions may apply. Not all borrowers or homes will qualify for a BFC rate, and said rate may not apply for all credit profiles. You are not required to obtain mortgage financing through DHIM to purchase a home from D.R. Horton; however, use of DHIM, among other terms and conditions, is required to receive a DHIM-related BFC rate, if available, when purchasing a D.R. Horton home. DHI Mortgage Company, Ltd., 10700 Pecan Park Blvd, Ste#450, Austin, TX 78750. Company NMLS #14622.

** If you select an adjustable-rate mortgage (ARM) program, the sample interest rate and monthly payment shown in the above calculator are based on an introductory rate, which can change after the initial fixed-rate period expires. For example, a 7/6 ARM's introductory rate is fixed for the first 7 years (i.e., 84 months) of the loan, after which the interest rate can change every 6 months. Similarly, a 5/1 ARM's introductory rate is fixed for the first 5 years (i.e., 60 months) of the loan, after which the interest rate can change every 1 year (i.e., 12 months). (Other ARM products may have different initial fixed-rate periods and different rate adjustment periods.) This means that after the initial fixed-rate period, your monthly payment can increase or decrease substantially every 6 or 12 months based on changes in the interest rate, as described in the loan documents. Because the above calculator shows a sample monthly payment based only on the introductory rate, there may be higher monthly payments after the initial fixed-rate period expires.

Property Taxes, Home Insurance, Mortgage Insurance and Homeowners' Association Dues are estimates in the community or locality where the property is located. This calculator and related information should not be construed as financial, legal, or tax advice, or as a commitment to lend. Please consult your own advisor. The calculator and related information are provided "AS-IS" AND WITHOUT REPRESENTATION OR WARRANTIES OF ANY KIND, EITHER EXPRESS OR IMPLIED and without legal obligation on D.R. Horton, including any duty to update or correct information herein. Please contact a mortgage lender of your choosing for actual loan information (e.g., available rates and terms) and for requirements related to loan products they make available to you.`;

/* next steps */
VIEWS.next = () => `<div class="app">${top('Next steps', { back: 'menu' })}
  <main class="wrap"><div class="split">
    <section class="card main" style="display:flex;flex-direction:column;gap:22px;padding:28px 32px"><h1 style="font-size:30px">Step by step, made simple</h1>
      ${[['2% earnest money deposit', 'Electronic, right here.'], ['Contract generated and reviewed', 'We go through it together.'], ['Sign with DocuSign', 'About 20–30 minutes.'], ['Sold sign + photo', 'The fun part.'], ['Meet your loan officer', 'Laura walks you through the info and timeline.']]
        .map((s, i) => `<div style="display:flex;gap:18px;align-items:flex-start"><span style="width:44px;height:44px;flex:none;border-radius:22px;background:#1D1F21;color:#fff;display:inline-flex;align-items:center;justify-content:center;font-size:18px;font-weight:700">${i + 1}</span><div><div style="font-size:21px;font-weight:650">${s[0]}</div><div class="muted" style="font-size:16px">${s[1]}</div></div></div>`).join('')}
    </section>
    <aside class="side" style="display:flex;flex-direction:column;gap:12px">
      <a class="tile hero" href="#/pay"><b>Payment compare →</b><span>How the builder rate stacks up against today’s rate</span></a>
      <section class="card"><div class="label">Your loan officer</div><div style="font-size:19px;font-weight:700;margin-top:4px">Laura Hall · DHI Mortgage</div>
        <div><a href="tel:+19196955604">919.695.5604</a></div><div><a href="mailto:LJHall@dhimortgage.com">LJHall@dhimortgage.com</a></div><div class="muted small">NMLS# 103459 · Company NMLS# 14622</div></section>
      <section class="card"><div class="label">Closing attorney</div><div style="font-weight:650;margin-top:4px">Bagwell Holt Smith</div><div class="small">984.208.0950 · Morrisville</div></section>
    </aside></div></main></div>`;

/* library + answers */
VIEWS.library = (cat) => {
  const cats = cat ? D.library.filter((c) => c.cat === cat) : D.library;
  const extra = { HOA: `<a class="item" href="${LINKS.hoaFinder}" target="_blank" rel="noopener"><b class="grow">HOA Answer Finder ↗</b></a>`, Warranty: `<a class="item" href="${LINKS.warrantyFinder}" target="_blank" rel="noopener"><b class="grow">Warranty Answer Finder ↗</b></a>` };
  return `<div class="app">${top(cat || 'Library', { back: 'menu' })}<main class="wrap">
    ${cats.map((c) => `<section class="card list"><div class="label" style="margin-bottom:6px">${esc(c.cat)}</div>
      ${c.items.map((d) => `<a class="item" href="${d.f}" target="_blank" rel="noopener"><span class="grow" style="font-size:17px">${esc(d.t)}</span><span class="muted small">PDF · ${d.kb >= 1024 ? (d.kb / 1024).toFixed(1) + ' MB' : d.kb + ' KB'}</span></a>`).join('')}
      ${extra[c.cat] || ''}</section>`).join('')}
    <a class="btn" href="#/answers">Quick answers →</a></main></div>`;
};
VIEWS.answers = () => {
  const cats = ['All'].concat([...new Set(D.answers.map((a) => a.c))]);
  return `<div class="app">${top('Quick answers', { back: 'menu' })}<main class="wrap">
    <input type="search" id="aq" placeholder="Search: fence, warranty, dues, Duke, smart home…" value="${esc(S.q)}" aria-label="Search answers">
    <div class="row">${cats.map((c) => `<button class="chip dark ${S.ansCat === c ? 'on' : ''}" data-a="acat" data-c="${esc(c)}">${esc(c)}</button>`).join('')}</div>
    <div id="alist" class="grid">${answerList()}</div></main></div>`;
};
function answerList() {
  const q = S.q.trim().toLowerCase();
  const words = q.split(/\s+/).filter(Boolean);
  const list = D.answers.filter((a) => (S.ansCat === 'All' || a.c === S.ansCat) && words.every((w) => (a.q + ' ' + a.a + ' ' + a.c).toLowerCase().includes(w)));
  if (!list.length) return '<div class="card muted">Nothing matched. Try one word, or check the library.</div>';
  return list.map((a) => `<article class="card"><div class="row"><b class="grow" style="font-size:17px">${esc(a.q)}</b><span class="badge" style="background:#F4F4F2;color:#3E4144">${esc(a.c)}</span></div>
    <div style="margin-top:6px">${esc(a.a)}</div><div class="muted small" style="margin-top:4px">${esc(a.src)}</div></article>`).join('');
}
AFTER.answers = () => {
  const i = document.getElementById('aq');
  i.addEventListener('input', () => { S.q = i.value; document.getElementById('alist').innerHTML = answerList(); });
};

/* settings */
VIEWS.settings = () => {
  const r = rates(), b = bfcLists(), a = LS.get('agent', { name: 'Charles Carper', license: '', firm: '', rel: [] });
  const num = (id, v, lab) => `<label class="f">${lab}<input type="number" step="0.001" id="${id}" value="${v}"></label>`;
  return `<div class="app">${top('Settings', { back: 'menu' })}<main class="wrap">
    <section class="card" style="display:flex;flex-direction:column;gap:12px"><b style="font-size:18px">Rates</b>
      <div class="muted small">Today’s rates: copy from the drhorton.com calculator on any home. BFC: from the latest BFC email.</div>
      <div class="grid g4">${num('r_conv', r.conv, 'Conventional %')}${num('r_fha', r.fha, 'FHA %')}${num('r_va', r.va, 'VA %')}<label class="f">As of<input type="date" id="r_asof" value="${r.asOf}"></label></div>
      <div class="grid g4">${num('r_nd_g', r.novdec.govt, 'BFC Nov/Dec · govt %')}${num('r_nd_c', r.novdec.conv, 'BFC Nov/Dec · conv %')}${num('r_j_g', r.jan.govt, 'BFC Jan · govt %')}${num('r_j_c', r.jan.conv, 'BFC Jan · conv %')}</div>
      <div class="grid g2"><label class="f">Lots on the Nov/Dec BFC lists<input type="text" id="b_nd" value="${b.novdec.join(', ')}"></label><label class="f">Lots on the Jan BFC lists<input type="text" id="b_j" value="${b.jan.join(', ')}"></label></div>
      <div class="row"><button class="btn primary" data-a="saverates">Save rates</button><button class="btn" data-a="resetrates">Reset to built-in</button></div></section>
    <section class="card" style="display:flex;flex-direction:column;gap:12px"><b style="font-size:18px">WWREA agent section</b>
      <div class="grid g3"><label class="f">Agent’s name<input type="text" id="a_name" value="${esc(a.name)}"></label><label class="f">License no.<input type="text" id="a_lic" value="${esc(a.license)}"></label><label class="f">Firm name<input type="text" id="a_firm" value="${esc(a.firm)}"></label></div>
      <div class="label">Default relationship box</div>
      <div class="grid g2">${REL.map((x) => `<label class="check"><input type="checkbox" class="a_rel" value="${x.k}" ${a.rel.includes(x.k) ? 'checked' : ''}> ${x.t}</label>`).join('')}</div>
      <div><button class="btn primary" data-a="saveagent">Save</button></div></section>
    <section class="card" style="display:flex;flex-direction:column;gap:10px"><b style="font-size:18px">Update lots</b>
      <div class="muted small">Import the CSV from your homesales snippet (statuses) or your inventory pull (build stages and prices). Current lots: ${usDate(lotsAsOf())}.</div>
      <input type="file" id="csvfile" accept=".csv,text/csv"><div id="csvmsg" class="small"></div>
      <div><button class="btn" data-a="resetlots">Reset lots to built-in</button></div></section>
    <section class="card" style="display:flex;flex-direction:column;gap:10px"><b style="font-size:18px">Offline</b>
      <div class="muted small">Saves every screen, image and library PDF on this device for models with weak signal.</div>
      <div class="row"><button class="btn primary" data-a="offline">Save everything for offline</button><span id="offmsg" class="small"></span></div></section>
    <section class="card" style="display:flex;flex-direction:column;gap:12px"><b style="font-size:18px">Change passcode</b>
      <div class="muted small">Pick something you’ll remember: at least 8 letters or numbers. Capitals, spaces and dashes don’t count.</div>
      <form id="newpass" style="display:flex;flex-direction:column;gap:12px;position:relative"><input type="text" name="username" autocomplete="username" value="Collins Ridge guide" readonly tabindex="-1" aria-hidden="true" style="position:absolute;left:-9999px;width:1px;height:1px;opacity:0">
        <div class="grid g2"><label class="f">New passcode<input type="password" id="np1" name="new-password" autocomplete="new-password" autocapitalize="off" autocorrect="off" spellcheck="false"></label>
          <label class="f">Type it again<input type="password" id="np2" autocomplete="new-password" autocapitalize="off" autocorrect="off" spellcheck="false"></label></div>
        <div class="row"><button class="btn primary" type="submit">Make the new passcode file</button><button class="btn dark" type="button" data-a="savepassfile" ${S.passFile ? '' : 'disabled'}>Save talk-locked.js</button></div>
        <div id="npmsg" class="small" role="status">${S.passFile ? 'Ready. Tap Save talk-locked.js.' : ''}</div></form>
      <ol class="small" style="margin:0;padding-left:20px;line-height:1.7">
        <li>Make the file, then save talk-locked.js to Files.</li>
        <li>Open <a href="https://github.com/ccarper03/appointment-guide/upload/main/data" target="_blank" rel="noopener">the guide’s data folder on GitHub</a>, choose talk-locked.js, and tap Commit changes.</li>
        <li>Wait a few minutes, reload, and unlock with the new passcode. The old one stops working on every device.</li>
      </ol>
      <div class="muted small">Safari offers to save the passcode in Passwords when you unlock. Say yes, and clearing the cache won’t lock you out.</div></section>
    <section class="card row"><button class="btn" data-a="lock">Lock and forget passcode on this device</button><span class="muted small">Built ${usDate(D.built)}</span></section>
  </main></div>`;
};
AFTER.settings = () => {
  const f = document.getElementById('csvfile'); if (f) f.addEventListener('change', importCSV);
  const np = document.getElementById('newpass'); if (np) np.addEventListener('submit', (e) => { e.preventDefault(); makePassFile(); });
};
async function makePassFile() {
  const msg = document.getElementById('npmsg'), norm = (v) => v.toLowerCase().replace(/[^a-z0-9]/g, '');
  const a = norm(document.getElementById('np1').value), b = norm(document.getElementById('np2').value);
  if (a.length < 8) { msg.textContent = 'Use at least 8 letters or numbers.'; return; }
  if (a !== b) { msg.textContent = 'Those two don’t match.'; return; }
  msg.textContent = 'Making it…';
  try {
    const salt = crypto.getRandomValues(new Uint8Array(16)), iv = crypto.getRandomValues(new Uint8Array(12));
    const km = await crypto.subtle.importKey('raw', new TextEncoder().encode(a), 'PBKDF2', false, ['deriveKey']);
    const key = await crypto.subtle.deriveKey({ name: 'PBKDF2', salt, iterations: 310000, hash: 'SHA-256' }, km, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
    const plain = JSON.stringify(S.talk);
    const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(plain)));
    const back = new TextDecoder().decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ct));
    if (back !== plain) throw new Error('round trip');
    S.passFile = 'window.TALK_LOCKED = ' + JSON.stringify({ salt: b64e(salt), iv: b64e(iv), ct: b64e(ct), iter: 310000 }) + ';\n';
    rerender();
  } catch (err) { msg.textContent = 'Couldn’t make the file. Try again.'; }
}
async function savePassFile() {
  const file = new File([S.passFile], 'talk-locked.js', { type: 'text/javascript' });
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try { await navigator.share({ files: [file], title: 'talk-locked.js' }); toast('Saved. Now upload it to GitHub.'); return; } catch (e) { if (e && e.name === 'AbortError') return; }
  }
  const url = URL.createObjectURL(file), el = document.createElement('a');
  el.href = url; el.download = 'talk-locked.js'; document.body.appendChild(el); el.click(); el.remove(); setTimeout(() => URL.revokeObjectURL(url), 60000);
  toast('Downloaded talk-locked.js. Now upload it to GitHub.');
}

/* ---------- guest card + WWREA ---------- */
const REL = [
  { k: 'buyer', t: 'Buyer Agency', y: 465.0 },
  { k: 'dual', t: 'Dual Agency', y: 387.3 },
  { k: 'desig', t: 'Designated Dual Agency', y: 319.7 },
  { k: 'unrep', t: 'Unrepresented Buyer (Seller subagent)', y: 218.6 }
];
const HEARD = ['Drove by', 'Online search', 'Builder website', 'My agent', 'Friend or family', 'Social media', 'Other'];
const blankGuest = () => ({ f1: '', l1: '', f2: '', l2: '', phone: '', email: '', heard: '', agent: '', aname: '', abroker: '', aphone: '', aemail: '', ack: false });
VIEWS.guest = () => {
  if (!S.guest) S.guest = blankGuest();
  const g = S.guest;
  const inp = (k, lab, type = 'text', ph = '') => `<label class="f">${lab}<input type="${type}" data-g="${k}" value="${esc(g[k])}" placeholder="${ph}" ${type === 'email' ? 'autocapitalize="off"' : ''}></label>`;
  return `<div class="app buyer"><header class="top"><div><div class="sub">Collins Ridge · Hillsborough</div><div class="title">Welcome! This takes about a minute.</div></div><div class="grow"></div>
    <button class="btn small" data-a="guestcancel" title="Hold to cancel">Cancel</button></header>
  <main class="wrap"><div class="split">
    <section class="main" style="display:flex;flex-direction:column;gap:14px">
      <b style="font-size:19px">About you</b>
      <div class="grid g2">${inp('f1', 'First name')}${inp('l1', 'Last name')}</div>
      <div class="grid g2">${inp('f2', 'Second buyer first name (optional)')}${inp('l2', 'Second buyer last name')}</div>
      <div class="grid g2">${inp('phone', 'Phone', 'tel', '(919) 555-0123')}${inp('email', 'Email', 'email', 'you@email.com')}</div>
      <div class="label">How did you hear about us?</div>
      <div class="row" id="heard">${HEARD.map((h) => `<button class="chip ${g.heard === h ? 'on' : ''}" data-a="gheard" data-v="${h}">${h}</button>`).join('')}</div>
      <div class="label">Are you working with a real estate agent?</div>
      <div class="row" id="agentyn"><button class="chip ${g.agent === 'Yes' ? 'on' : ''}" data-a="gagent" data-v="Yes">Yes</button><button class="chip ${g.agent === 'No' ? 'on' : ''}" data-a="gagent" data-v="No">No</button></div>
      <div id="agentf" class="grid g2" ${g.agent === 'Yes' ? '' : 'hidden'} style="padding:14px;background:#F4F4F2;border-radius:12px">${inp('aname', 'Agent name')}${inp('abroker', 'Brokerage')}${inp('aphone', 'Agent phone', 'tel')}${inp('aemail', 'Agent email', 'email')}</div>
    </section>
    <section class="side" style="display:flex;flex-direction:column;gap:12px;flex-basis:440px">
      <b style="font-size:19px">Working With Real Estate Agents</b>
      <div class="formimg"><img src="forms/wwrea.png" alt="Working With Real Estate Agents Disclosure (For Buyers), NC Real Estate Commission form REC 4.27"></div>
      <label class="check"><input type="checkbox" data-g="ack" ${g.ack ? 'checked' : ''}> I received and reviewed the Working With Real Estate Agents disclosure.</label>
      <div class="label">Buyer signature</div>
      <div class="sigpad"><canvas id="sig1" aria-label="Signature pad for the buyer"></canvas><div class="line"></div><div class="hint">Sign with your finger</div><button class="btn small clr" data-a="sigclear" data-s="sig1">Clear</button></div>
      <div id="sig2wrap" ${g.f2 ? '' : 'hidden'}><div class="label" style="margin-bottom:8px">Second buyer signature</div>
        <div class="sigpad"><canvas id="sig2" aria-label="Signature pad for the second buyer"></canvas><div class="line"></div><div class="hint">Sign with your finger</div><button class="btn small clr" data-a="sigclear" data-s="sig2">Clear</button></div></div>
      <button class="btn primary" id="gdone" data-a="guestdone" style="min-height:56px;font-size:18px" disabled>Done · hand back to Charles</button>
      <div class="muted small" id="gwhy"></div>
    </section></div></main></div>`;
};
AFTER.guest = () => {
  document.querySelectorAll('[data-g]').forEach((el) => {
    el.addEventListener(el.type === 'checkbox' ? 'change' : 'input', () => {
      S.guest[el.dataset.g] = el.type === 'checkbox' ? el.checked : el.value;
      if (el.dataset.g === 'f2') document.getElementById('sig2wrap').hidden = !el.value.trim();
      checkGuest();
    });
  });
  ['sig1', 'sig2'].forEach((id) => initSig(document.getElementById(id)));
  checkGuest();
};
function checkGuest() {
  const g = S.guest, s1 = document.getElementById('sig1'), s2 = document.getElementById('sig2');
  const miss = [];
  if (!g.f1.trim() || !g.l1.trim()) miss.push('your name');
  if (!g.ack) miss.push('the disclosure checkbox');
  if (!s1 || !s1.dataset.dirty) miss.push('a signature');
  if (g.f2.trim() && (!s2 || !s2.dataset.dirty)) miss.push('the second signature');
  const b = document.getElementById('gdone'); if (b) b.disabled = miss.length > 0;
  const w = document.getElementById('gwhy'); if (w) w.textContent = miss.length ? 'Still needed: ' + miss.join(', ') + '.' : '';
}
function initSig(c) {
  if (!c) return;
  const ctx = c.getContext('2d');
  const size = () => { const r = c.getBoundingClientRect(); if (!r.width) return; const dpr = window.devicePixelRatio || 1; c.width = r.width * dpr; c.height = r.height * dpr; ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.lineWidth = 2.4; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.strokeStyle = '#0B1F5C'; };
  size();
  let drawing = false, last = null;
  const p = (e) => { const r = c.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
  c.addEventListener('pointerdown', (e) => { drawing = true; last = p(e); c.setPointerCapture(e.pointerId); e.preventDefault(); });
  c.addEventListener('pointermove', (e) => { if (!drawing) return; const q = p(e); ctx.beginPath(); ctx.moveTo(last[0], last[1]); ctx.lineTo(q[0], q[1]); ctx.stroke(); last = q; if (!c.dataset.dirty) { c.dataset.dirty = '1'; checkGuest(); } });
  const end = () => { drawing = false; };
  c.addEventListener('pointerup', end); c.addEventListener('pointercancel', end);
}
function sigPNG(c) {
  if (!c || !c.dataset.dirty) return null;
  const ctx = c.getContext('2d'), w = c.width, h = c.height, d = ctx.getImageData(0, 0, w, h).data;
  let x0 = w, y0 = h, x1 = 0, y1 = 0;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (d[(y * w + x) * 4 + 3] > 10) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  if (x1 <= x0 || y1 <= y0) return null;
  const pad = 6, cw = x1 - x0 + pad * 2, ch = y1 - y0 + pad * 2, o = document.createElement('canvas');
  o.width = cw; o.height = ch; o.getContext('2d').drawImage(c, x0 - pad, y0 - pad, cw, ch, 0, 0, cw, ch);
  return o.toDataURL('image/png');
}

VIEWS.handback = () => {
  if (!S.guest) { setTimeout(() => go('menu')); return ''; }
  return `<div class="app buyer"><main class="wrap" style="align-items:center;justify-content:center;text-align:center;min-height:100vh">
    <h1 style="font-size:34px">Thank you!</h1><p style="font-size:20px;margin:0">Please hand the iPad back to Charles.</p>
    <button class="btn dark hold" id="holdbtn" style="min-height:56px;margin-top:24px;padding:0 28px"><i></i>Charles: press and hold</button></main></div>`;
};
AFTER.handback = () => {
  const b = document.getElementById('holdbtn'); if (!b) return;
  let t = null;
  const start = (e) => { e.preventDefault(); b.classList.add('go'); t = setTimeout(() => go('review'), 900); };
  const stop = () => { b.classList.remove('go'); clearTimeout(t); };
  b.addEventListener('pointerdown', start); b.addEventListener('pointerup', stop); b.addEventListener('pointerleave', stop); b.addEventListener('pointercancel', stop);
};
VIEWS.review = () => {
  if (!S.guest) { setTimeout(() => go('menu')); return ''; }
  const g = S.guest, a = LS.get('agent', { name: 'Charles Carper', license: '', firm: '', rel: [] });
  if (!g.rel) g.rel = a.rel.slice();
  return `<div class="app">${top('Signed WWREA', { sub: 'For Charles' })}<main class="wrap">
    <section class="card" style="display:flex;flex-direction:column;gap:6px"><b style="font-size:19px">${esc(g.f1)} ${esc(g.l1)}${g.f2 ? ' &amp; ' + esc(g.f2) + ' ' + esc(g.l2) : ''}</b>
      <div class="muted">${esc(g.phone)} · ${esc(g.email)} · Heard: ${esc(g.heard || '—')} · Agent: ${esc(g.agent || '—')}${g.agent === 'Yes' ? ' (' + esc(g.aname) + ', ' + esc(g.abroker) + ')' : ''}</div></section>
    <section class="card" style="display:flex;flex-direction:column;gap:10px"><div class="label">Note to agent: check all relationship types that may apply</div>
      <div class="grid g2">${REL.map((x) => `<label class="check"><input type="checkbox" class="relbox" value="${x.k}" ${g.rel.includes(x.k) ? 'checked' : ''}> ${x.t}</label>`).join('')}</div>
      <div class="grid g3"><label class="f">Agent’s name<input type="text" id="ra_name" value="${esc(a.name)}"></label><label class="f">License no.<input type="text" id="ra_lic" value="${esc(a.license)}"></label><label class="f">Firm name<input type="text" id="ra_firm" value="${esc(a.firm)}"></label></div></section>
    <div class="row"><button class="btn primary" data-a="makepdf" style="min-height:54px">${S.pdf ? 'Rebuild signed copy' : 'Prepare signed copy'}</button>
      <button class="btn dark" data-a="sharepdf" style="min-height:54px" ${S.pdf ? '' : 'disabled'}>Save to Files · ${esc(S.pdfName || 'PDF')}</button>
      <button class="btn" data-a="guestfinish" style="min-height:54px">Done · clear buyer info</button></div>
    <div class="muted small">Tap Save to Files, then pick your WWREA folder. The iPad remembers the last folder. Buyer info is cleared from the app when you tap Done.</div>
  </main></div>`;
};

async function loadPdfLib() {
  if (window.PDFLib) return window.PDFLib;
  await new Promise((res, rej) => { const s = document.createElement('script'); s.src = 'vendor/pdf-lib.min.js'; s.onload = res; s.onerror = rej; document.head.appendChild(s); });
  return window.PDFLib;
}
async function buildWWREA() {
  const g = S.guest;
  const agent = { name: document.getElementById('ra_name').value.trim(), license: document.getElementById('ra_lic').value.trim(), firm: document.getElementById('ra_firm').value.trim() };
  g.rel = Array.from(document.querySelectorAll('.relbox:checked')).map((x) => x.value);
  const saved = LS.get('agent', { name: 'Charles Carper', license: '', firm: '', rel: [] });
  LS.set('agent', Object.assign(saved, agent));
  const { PDFDocument, StandardFonts, rgb } = await loadPdfLib();
  const bytes = await (await fetch('forms/wwrea-blank.pdf')).arrayBuffer();
  const pdf = await PDFDocument.load(bytes);
  const page = pdf.getPage(0), font = await pdf.embedFont(StandardFonts.Helvetica), bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const ink = rgb(0.04, 0.12, 0.36), H = 792;
  const put = (s, x, ytop, maxW, size = 10, f = font) => { s = String(s || ''); let sz = size; while (sz > 6 && f.widthOfTextAtSize(s, sz) > maxW) sz -= 0.5; page.drawText(s, { x, y: H - ytop, size: sz, font: f, color: ink }); };
  REL.forEach((r) => { if (g.rel.includes(r.k)) page.drawText('X', { x: 48, y: r.y, size: 13, font: bold, color: ink }); });
  const sig = async (key, x) => {
    const png = g[key]; if (!png) return;
    const img = await pdf.embedPng(png); const sc = Math.min(104 / img.width, 30 / img.height);
    page.drawImage(img, { x, y: H - 684, width: img.width * sc, height: img.height * sc });
  };
  await sig('sig1', 26);
  put(`${g.f1} ${g.l1}`, 144, 682, 112);
  if (g.f2.trim()) { await sig('sig2', 274); put(`${g.f2} ${g.l2}`, 392, 682, 112); }
  const d = new Date(), ds = `${d.getMonth() + 1}/${d.getDate()}/${d.getFullYear()}`;
  put(ds, 512, 682, 80);
  put(agent.name, 25, 733, 215); put(agent.license, 249, 733, 150); put(agent.firm, 405, 733, 185);
  const p2 = pdf.addPage([612, 792]);
  let y = 740;
  const line = (lab, val) => { p2.drawText(lab, { x: 54, y, size: 10, font: bold, color: rgb(0.35, 0.36, 0.38) }); p2.drawText(String(val || '—'), { x: 200, y, size: 11, font, color: rgb(0.1, 0.1, 0.12) }); y -= 24; };
  p2.drawText('Guest Registration', { x: 54, y: 760, size: 18, font: bold, color: rgb(0.1, 0.1, 0.12) }); y = 724;
  line('Date', ds); line('Community', 'Collins Ridge, Hillsborough NC'); line('Buyer', `${g.f1} ${g.l1}`); if (g.f2.trim()) line('Second buyer', `${g.f2} ${g.l2}`);
  line('Phone', g.phone); line('Email', g.email); line('How they heard', g.heard); line('Working with an agent', g.agent || '—');
  if (g.agent === 'Yes') { line('Agent', g.aname); line('Brokerage', g.abroker); line('Agent phone', g.aphone); line('Agent email', g.aemail); }
  line('Sales consultant', agent.name); y -= 8;
  p2.drawText('Signed Working With Real Estate Agents Disclosure is on page 1.', { x: 54, y, size: 10, font, color: rgb(0.35, 0.36, 0.38) });
  S.pdf = await pdf.save();
  const clean = (s) => String(s).replace(/[\\/:*?"<>|]+/g, '').trim();
  const who = `${clean(g.l1)}, ${clean(g.f1)}` + (g.f2.trim() ? ` & ${clean(g.f2)} ${clean(g.l2)}` : '');
  S.pdfName = `WWREA - ${who} - ${today()}.pdf`;
}
async function sharePDF() {
  const file = new File([S.pdf], S.pdfName, { type: 'application/pdf' });
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try { await navigator.share({ files: [file], title: S.pdfName }); toast('Saved'); return; } catch (e) { if (e && e.name === 'AbortError') return; }
  }
  const url = URL.createObjectURL(file), a = document.createElement('a');
  a.href = url; a.download = S.pdfName; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 60000);
  toast('Downloaded ' + S.pdfName);
}

/* ---------- CSV import ---------- */
function parseCSV(text) {
  const rows = []; let row = [], f = '', q = false;
  text = text.replace(/^﻿/, '').replace(/\r\n?/g, '\n');
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"') { if (text[i + 1] === '"') { f += '"'; i++; } else q = false; } else f += c; }
    else if (c === '"') q = true; else if (c === ',') { row.push(f); f = ''; } else if (c === '\n') { row.push(f); rows.push(row); row = []; f = ''; } else f += c;
  }
  if (f || row.length) { row.push(f); rows.push(row); }
  const head = rows.shift() || [];
  return rows.filter((r) => r.length > 1).map((r) => Object.fromEntries(head.map((h, i) => [h.trim(), (r[i] || '').trim()])));
}
const RANK = { 'Closed': 1, 'Submitted - Contract': 2, 'Contract': 3, 'Spec': 4, 'Dirt': 5, 'Unreleased - Spec - Model': 6, 'Unreleased - Spec': 7, 'Unreleased - Dirt': 8 };
const CAT = { 'Closed': 'sold', 'Submitted - Contract': 'sold', 'Contract': 'sold', 'Spec': 'spec', 'Dirt': 'open', 'Unreleased - Spec - Model': 'unreleased', 'Unreleased - Spec': 'unreleased', 'Unreleased - Dirt': 'unreleased' };
const shortAddr = (a) => a.replace(' Street', ' St').replace(' Road', ' Rd').replace(' Lane', ' Ln').replace(' Drive', ' Dr');
const titleCase = (s) => s ? s.charAt(0) + s.slice(1).toLowerCase() : '';
async function importCSV(e) {
  const file = e.target.files[0], msg = document.getElementById('csvmsg');
  if (!file) return;
  const rows = parseCSV(await file.text());
  const cur = JSON.parse(JSON.stringify(lotsData()));
  if (rows.length && 'status' in rows[0] && 'lot' in rows[0]) {
    const best = {};
    rows.forEach((r) => { if (!(r.status in RANK)) return; if (!best[r.lot] || RANK[r.status] < RANK[best[r.lot].status]) best[r.lot] = r; });
    let changed = 0;
    Object.entries(best).forEach(([lot, r]) => {
      const n = String(+lot), c = CAT[r.status], old = cur[n] || {};
      const plan = r.plan ? titleCase(r.plan) : ({ T202: 'Savannah', T203: 'Linville' }[r.planCode] || old.plan || '');
      const next = { c, st: r.status, plan, addr: shortAddr(r.address || old.addr || ''), price: c === 'spec' ? Math.round(+r.price || old.price || 0) : 0,
        prem: c === 'open' ? Math.round(+r.otherAmount || 0) : 0, ms: c === 'spec' ? (old.ms || '') : '', size: c === 'spec' ? (old.size || '') : '', th: +n >= 1000, bfc: old.bfc || '' };
      if (!old.c || old.c !== c || old.price !== next.price) changed++;
      cur[n] = next;
    });
    LS.set('lots', { asOf: today(), lots: cur });
    msg.textContent = `Imported ${Object.keys(best).length} lots from homesales. ${changed} changed.`;
  } else if (rows.length && 'Lot #' in rows[0]) {
    let n = 0;
    rows.forEach((r) => { const k = String(+r['Lot #']); if (cur[k] && cur[k].c === 'spec') { cur[k].ms = r.Milestone || ''; cur[k].price = Math.round(+r.Price || cur[k].price); cur[k].size = `${r.Beds} bd · ${r.Baths} ba · ${(+r.Sqft).toLocaleString('en-US')} sq ft`; n++; } });
    LS.set('lots', { asOf: lotsAsOf(), lots: cur });
    msg.textContent = `Updated build stages and prices on ${n} homes from the inventory pull.`;
  } else {
    msg.textContent = 'That file doesn’t look like a homesales or inventory CSV.';
  }
}

/* ---------- offline ---------- */
async function saveOffline() {
  const m = document.getElementById('offmsg');
  if (!('caches' in window)) { m.textContent = 'This browser can’t save files for offline.'; return; }
  const urls = ['./', 'index.html', 'app.css', 'app.js', 'data/app-data.js', 'data/talk-locked.js', 'vendor/pdf-lib.min.js', 'forms/wwrea-blank.pdf', 'forms/wwrea.png', 'assets/sitemap.jpg', 'manifest.webmanifest']
    .concat(D.plans.flatMap((p) => [p.img, p.elev])).concat(D.library.flatMap((c) => c.items.map((d) => d.f)));
  const c = await caches.open(CACHE); let done = 0, fail = 0;
  for (const u of urls) { try { await c.add(u); } catch (e) { fail++; } done++; m.textContent = `Saving ${done} of ${urls.length}…`; }
  m.textContent = fail ? `Saved ${done - fail} of ${urls.length}. ${fail} didn’t download; try again on Wi-Fi.` : `All ${urls.length} files saved for offline.`;
}

/* ---------- actions ---------- */
const A = {
  stage: (t) => { S.stage = +t.dataset.i; rerender(); },
  obj: (t) => { S.obj = +t.dataset.i; rerender(); },
  filt: (t) => { const k = t.dataset.k, v = t.dataset.v; S.f[k] = S.f[k] === v ? null : v; rerender(); },
  filtclear: () => { S.f = {}; rerender(); },
  pz: (t) => { S.planZoom = Math.min(3, Math.max(1, S.planZoom + (+t.dataset.d) * 0.5)); rerender(); },
  planmap: (t) => { S.mapPlan = t.dataset.p; S.sel = null; go('map'); },
  lotgo: (t) => { S.sel = +t.dataset.n; go('map'); },
  lot: (t) => { S.sel = +t.dataset.n; S._mapCentered = S.sel + '|' + S.zoom; rerender(); },
  layer: (t) => { const k = t.dataset.k; S.layers[k] = !S.layers[k]; rerender(); },
  mplan: (t) => { S.mapPlan = t.dataset.p; rerender(); },
  sort: (t) => { S.sort = t.dataset.k; rerender(); },
  zoom: (t) => { const box = document.getElementById('mapbox'); const fx = box ? (box.scrollLeft + box.clientWidth / 2) / box.scrollWidth : 0.5, fy = box ? (box.scrollTop + box.clientHeight / 2) / box.scrollHeight : 0.5; S.zoom = Math.min(3, Math.max(1, S.zoom + (+t.dataset.d) * 0.5)); S._mapCentered = S.sel + '|' + S.zoom; render().then(() => { const b = document.getElementById('mapbox'); if (b) { b.scrollLeft = fx * b.scrollWidth - b.clientWidth / 2; b.scrollTop = fy * b.scrollHeight - b.clientHeight / 2; } }); },
  paylot: (t) => { S.pay.lot = +t.dataset.n; S.pay.price = null; go('pay'); },
  payopen: (t) => { const n = +t.dataset.n, l = lotsData()[n], p = plan(t.dataset.p); S.pay.lot = null; S.pay.price = p.base + l.prem; S.pay.label = `Lot ${n} · ${p.name} from ${money(p.base)} + ${money(l.prem)} lot premium · not on a BFC list yet`; go('pay'); },
  route: (t) => { const k = t.dataset.k, r = S.pay.routes; S.pay.routes = r.includes(k) ? r.filter((x) => x !== k) : Object.keys(LT).filter((x) => r.includes(x) || x === k); rerender(); },
  bd: () => { S.pay.bd = !S.pay.bd; rerender(); },
  acat: (t) => { S.ansCat = t.dataset.c; rerender(); },
  gheard: (t) => { S.guest.heard = t.dataset.v; document.querySelectorAll('#heard .chip').forEach((c) => c.classList.toggle('on', c === t)); },
  gagent: (t) => { S.guest.agent = t.dataset.v; document.querySelectorAll('#agentyn .chip').forEach((c) => c.classList.toggle('on', c === t)); document.getElementById('agentf').hidden = t.dataset.v !== 'Yes'; },
  sigclear: (t) => { const c = document.getElementById(t.dataset.s); c.getContext('2d').clearRect(0, 0, c.width, c.height); c.dataset.dirty = ''; checkGuest(); },
  guestcancel: () => { if (confirmCancel()) { S.guest = null; go('menu'); } },
  guestdone: () => { S.pdf = null; S.pdfName = ''; S.guest.sig1 = sigPNG(document.getElementById('sig1')); S.guest.sig2 = S.guest.f2.trim() ? sigPNG(document.getElementById('sig2')) : null; go('handback'); },
  makepdf: async (t) => { t.disabled = true; t.textContent = 'Preparing…'; try { await buildWWREA(); rerender(); } catch (e) { toast('Couldn’t build the PDF. Try again.'); t.disabled = false; } },
  sharepdf: () => { if (S.pdf) sharePDF(); },
  guestfinish: () => { S.guest = null; S.pdf = null; S.pdfName = ''; go('menu'); toast('Buyer info cleared'); },
  saverates: () => {
    const v = (id) => +document.getElementById(id).value;
    LS.set('rates', { asOf: document.getElementById('r_asof').value || today(), conv: v('r_conv'), fha: v('r_fha'), va: v('r_va'),
      novdec: { govt: v('r_nd_g'), conv: v('r_nd_c') }, jan: { govt: v('r_j_g'), conv: v('r_j_c') } });
    const nums = (id) => document.getElementById(id).value.split(/[^0-9]+/).filter(Boolean).map(Number);
    LS.set('bfcLots', { novdec: nums('b_nd'), jan: nums('b_j') });
    toast('Rates saved');
  },
  resetrates: () => { LS.del('rates'); LS.del('bfcLots'); rerender(); toast('Back to built-in rates'); },
  saveagent: () => { LS.set('agent', { name: document.getElementById('a_name').value.trim(), license: document.getElementById('a_lic').value.trim(), firm: document.getElementById('a_firm').value.trim(), rel: Array.from(document.querySelectorAll('.a_rel:checked')).map((x) => x.value) }); toast('Saved'); },
  resetlots: () => { LS.del('lots'); rerender(); toast('Back to built-in lots'); },
  offline: () => saveOffline(),
  savepassfile: () => { if (S.passFile) savePassFile(); },
  lock: () => { LS.del('k'); S.talk = null; go('menu'); render(); }
};
function confirmCancel() { const g = S.guest; return !g || (!g.f1 && !g.l1) || window.confirm('Clear this guest card?'); }

document.addEventListener('click', (e) => {
  const t = e.target.closest('[data-a]');
  if (!t || !A[t.dataset.a]) return;
  e.preventDefault();
  A[t.dataset.a](t, e);
});
document.addEventListener('submit', async (e) => {
  if (e.target.id !== 'unlock') return;
  e.preventDefault();
  const msg = document.getElementById('lockmsg'), pass = document.getElementById('pass').value;
  msg.textContent = 'Checking…';
  try {
    const key = await deriveKey(pass); await openTalk(key);
    if (document.getElementById('remember').checked) LS.set('k', b64e(new Uint8Array(await crypto.subtle.exportKey('raw', key))));
    render();
  } catch (err) { msg.textContent = 'That passcode didn’t work.'; }
});

if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => {});
render();
})();

'use strict';
const DB = window.NEGEV_DATA;
DB.people = DB.people.filter(p => !p.hidden); // hidden = kept in data, not shown
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const CHECKED = '22.10.2026';
const CATS = ['יזמות וטכנולוגיה', 'אקדמיה ומחקר', 'רשויות ופיתוח אזורי', 'קרנות והשקעות', 'חינוך וקהילה', 'אקלים ומדבר', 'בריאות'];
const STATUSES = ['לפנות בהמשך', 'נשלחה פנייה', 'נקבעה שיחה', 'התקיימה שיחה'];

const orgById = Object.fromEntries(DB.organizations.map(o => [o.id, o]));
const peopleOf = id => DB.people.filter(p => p.org === id);
const personById = id => DB.people.find(p => p.id === id);
const TYPES = ['חברה', 'חממה ומרכז חדשנות', 'אקדמיה', 'רשות', 'קרן', 'ארגון חברתי', 'תוכנית וקול קורא'];
const TOWNS = ['באר שבע', 'שדרות', 'נתיבות', 'אופקים', 'רהט', 'דימונה', 'ירוחם', 'ערד', 'מצפה רמון', 'עומר', 'אילת', 'להבים', 'קריית גת'];
DB.organizations.forEach(o => { const txt = [o.name, o.en, o.region, o.description, o.value].join(' '); o._towns = TOWNS.filter(t => txt.includes(t)); });
const fmtDate = iso => (iso || '').split('-').reverse().join('.');
const upd = x => x.checked ? `<span class="upd">עודכן ב־${fmtDate(x.checked)}</span>` : '';
/* deadlines: expired ones are hidden everywhere */
function deadlineOf(o) {
  if (!o.deadline) return null;
  const m = o.deadline.match(/(\d{1,2})\.(\d{1,2})\.(\d{4})(?:,?\s*(\d{1,2}):(\d{2}))?/);
  if (!m) return { label: o.deadline, live: !/^חלף/.test(o.deadline), days: null, end: null };
  const end = new Date(+m[3], +m[2] - 1, +m[1], m[4] ? +m[4] : 23, m[5] ? +m[5] : 59);
  return { label: o.deadline, end, live: !/^חלף/.test(o.deadline) && end > new Date(), days: Math.ceil((end - new Date()) / 864e5) };
}
const liveDeadline = o => { const d = deadlineOf(o); return d && d.live ? d : null; };

/* browser-only state */
const store = {
  get(k, d) { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch { return false; } }
};
let saved = store.get('negev-hub-saved', []);
let statuses = store.get('negev-hub-status', {});
if (!Array.isArray(saved)) saved = [];
let mine = store.get('negev-hub-mine', []);
if (!Array.isArray(mine)) mine = [];
function addMine(m) {
  const base = { id: m.id, checked: m.checked, verified: false, provided: false, mine: true, note: 'נוסף על ידך. מופיע רק במכשיר הזה.', bio: m.note || '', source: '', image: '', email: m.email || '', phone: m.phone || '', emailType: '', phoneType: '', org: '' };
  if (m.kind === 'org') { const o = { ...base, name: m.name, en: '', category: 'נוספו על ידך', region: m.region || '', description: m.note || '', value: '', ask: '', url: m.url || '', sources: [], priority: false, type: '', logo: '', _towns: [] }; DB.organizations.push(o); orgById[o.id] = o; }
  else DB.people.push({ ...base, name: m.name, role: [m.role, m.orgName].filter(Boolean).join(' · ') });
}
mine.forEach(addMine);
const state = { tab: 'orgs', view: 'rows', cat: '', type: '', region: '', channel: '', priority: false, hideUnv: false, q: '' };
let animate = true;

/* helpers */
const tel = p => p.replace(/[^\d+]/g, '');
const initials = n => n.replace(/[״׳"']/g, '').replace(/^ד״ר|^עו״ד/, '').trim().split(/\s+/).slice(0, 2).map(w => w[0]).join('');
const tcls = l => /נמסר/.test(l || '') ? 'c-green' : /ארגון|ערוץ/.test(l || '') ? 'c-teal' : 'c-blue';
const monoOf = o => (/[A-Za-z]/.test(o.en) ? o.en.split(/\s+/).slice(0, 2).map(w => w[0]).join('').toUpperCase() : o.name.replace(/[״׳"']/g, '').slice(0, 2));
const isLogo = src => /hinuch/.test(src || '');
const ICON = {
  phone: '<svg viewBox="0 0 24 24"><path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2z"/></svg>',
  mail: '<svg viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/></svg>',
  web: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c3 3.5 3 14.5 0 18M12 3c-3 3.5-3 14.5 0 18"/></svg>',
  star: '<svg viewBox="0 0 24 24"><path d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z"/></svg>'
};
const avatar = (p, cls = '') => p.image
  ? `<img class="avatar ${cls}" src="${esc(p.image)}" alt="${esc(p.name)}" loading="lazy" width="52" height="52">`
  : `<span class="avatar initials ${cls}" aria-hidden="true">${esc(initials(p.name))}</span>`;
const orgMark = o => `<span class="mono" aria-hidden="true">${esc(monoOf(o))}</span>`;
const mailLink = (e, cls = 'btn btn-sm btn-ghost', label = 'מייל') => `<a class="${cls}" href="mailto:${esc(e)}">${ICON.mail}${esc(label)}</a>`;
const telLink = (t, cls = 'btn btn-sm', label = 'התקשרות') => `<a class="${cls}" href="tel:${esc(tel(t))}">${ICON.phone}${esc(label)}</a>`;
const starBtn = (id, name) => `<button class="btn btn-sm btn-ghost save" data-save="${esc(id)}" aria-pressed="${saved.includes(id)}" aria-label="${saved.includes(id) ? 'הסרת' : 'שמירת'} ${esc(name)} ${saved.includes(id) ? 'מהרשימה שלי' : 'ברשימה שלי'}"><span class="l-long">${saved.includes(id) ? 'נשמר ברשימה' : 'שמירה ברשימה'}</span><span class="l-short">${saved.includes(id) ? 'נשמר' : 'שמירה'}</span></button>`;

function toast(msg) {
  const t = $('#toast'); t.textContent = msg; t.classList.add('on');
  clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.remove('on'), 2400);
}

/* filtering */
function haystack(x, o) {
  return [x.name, x.en, x.role, x.bio, x.description, x.value, x.email, x.phone, o?.name, o?.en, o?.category, o?.region].join(' ').toLowerCase();
}
function matchesCommon(x, o) {
  if (state.q && !haystack(x, o).includes(state.q.toLowerCase())) return false;
  if (state.cat && o?.category !== state.cat) return false;
  if (state.type && o?.type !== state.type) return false;
  if (state.region && !(o && (o.region === state.region || o._towns.includes(state.region)))) return false;
  return true;
}
const hasPhone = x => Boolean(x.phone), hasMail = x => Boolean(x.email);
function matchesChannel(x, extra = []) {
  const all = [x, ...extra];
  switch (state.channel) {
    case 'phone': return all.some(hasPhone);
    case 'email': return all.some(hasMail);
    case 'none': return !all.some(hasPhone) && !all.some(hasMail);
    default: return true;
  }
}
function visibleOrgs(list = DB.organizations) {
  return list.filter(o => matchesCommon(o, o) && matchesChannel(o, peopleOf(o.id)) && (!state.priority || o.priority))
    .sort((a, b) => Number(b.priority) - Number(a.priority));
}
function visiblePeople(list = DB.people) {
  return list.filter(p => { const o = orgById[p.org]; return matchesCommon(p, o) && matchesChannel(p) && (!state.priority || o?.priority) && (!state.hideUnv || p.verified); });
}

/* cards */
function orgCard(o) {
  const ps = peopleOf(o.id);
  const faces = ps.slice(0, 4).map(p => avatar(p)).join('');
  const lead = o.logo ? `<img class="avatar logo-img wide" src="${esc(o.logo)}" alt="" loading="lazy">` : orgMark(o);
  return `<article class="card">
    ${starBtn(o.id, o.name)}
    <button class="card-main" data-open="org:${esc(o.id)}" aria-label="פרופיל ${esc(o.name)}">
      <span class="card-head">${lead}<span><h3>${esc(o.name)}</h3><span class="sub-line" dir="ltr" style="display:block;text-align:start">${esc(o.en)}</span></span></span>
      <span class="meta"><span class="tag">${esc(o.category)}</span><span class="tag region">${esc(o.region)}</span>${o.priority ? '<span class="tag first">מומלץ לפנייה ראשונה</span>' : ''}${o.note ? '<span class="tag warn">כדאי לבדוק לפני פנייה</span>' : ''}</span>
      <span class="desc">${esc(o.description)}</span>
      ${ps.length ? `<span class="team"><span class="stack">${faces}</span>${ps.length} ${ps.length === 1 ? 'איש קשר' : 'אנשי קשר'} במיפוי</span>` : '<span class="team">פנייה דרך ערוץ הארגון</span>'}
    </button>
    <div class="card-foot">
      ${o.phone ? telLink(o.phone, 'btn btn-sm', 'התקשרות') : ''}
      ${o.email ? mailLink(o.email) : ''}
      <a class="btn btn-sm btn-ghost" href="${esc(o.url)}" target="_blank" rel="noopener noreferrer">${ICON.web}אתר</a>
    </div>
  </article>`;
}

function personCard(p) {
  const o = orgById[p.org];
  const contact = [
    p.phone ? `<div class="person-contact"><span>${esc(p.phoneType || 'טלפון')}</span><bdi>${esc(p.phone)}</bdi></div>` : '',
    p.email ? `<div class="person-contact"><span>${esc(p.emailType || 'מייל')}</span><bdi>${esc(p.email)}</bdi></div>` : ''
  ].join('');
  return `<article class="card">
    ${starBtn(p.id, p.name)}
    <button class="card-main" data-open="person:${esc(p.id)}" aria-label="פרופיל ${esc(p.name)}">
      <span class="card-head">${avatar(p)}<span><h3>${esc(p.name)}</h3><span class="sub-line">${esc(p.role)}${o ? ' · ' + esc(o.name) : ''}</span></span></span>
      <span class="meta">${p.provided ? '<span class="tag given">קשר שנמסר</span>' : ''}${p.verified ? '' : '<span class="tag warn">התפקיד לא אומת</span>'}${o ? `<span class="tag">${esc(o.category)}</span>` : ''}</span>
      <span class="desc">${esc(p.bio)}</span>
      ${contact}
    </button>
    <div class="card-foot">
      ${p.phone ? telLink(p.phone) : ''}
      ${p.email ? mailLink(p.email) : (!p.phone && o?.email ? mailLink(o.email, 'btn btn-sm btn-ghost', 'מייל הארגון') : '')}
    </div>
  </article>`;
}

/* views */
const TITLES = {
  orgs: ['מי פועל בהייטק בנגב', 'חברות, סטארטאפים, אקדמיה, רשויות וקרנות באזור הנגב, בעיקר הנגב המערבי. מיפוי ראשוני שאינו ממצה.'],
  people: ['האנשים שכדאי להכיר', 'שם, תפקיד וערוץ הקשר המתאים. כל פרט מסומן לפי מקורו.'],
  saved: ['הרשימה שלי', 'גופים ואנשים שסימנת. נשמרים בדפדפן הזה בלבד.'],
  calls: ['קולות קוראים ומענקים', 'מועדים להגשה עם ספירה לאחור, ומסלולי מימון ללא מועד קבוע.'],
  about: ['מקורות ואימות', 'מאיפה הגיע המידע, ומה עדיין לא נבדק.']
};
function regionBar() {
  const sel = $('#region');
  if (sel.options.length < 2) {
    const regs = [...new Set(DB.organizations.map(o => o.region))].sort((x, y) => x.localeCompare(y, 'he'));
    const towns = TOWNS.filter(t => !regs.includes(t)).map(t => [t, DB.organizations.filter(o => o._towns.includes(t)).length]).filter(([, n]) => n);
    sel.innerHTML = '<option value="">כל היישובים והאזורים</option>' + `<optgroup label="אזור">${regs.map(r => `<option>${esc(r)}</option>`).join('')}</optgroup>` + `<optgroup label="יישוב (לפי תיאור הגוף)">${towns.map(([t, n]) => `<option value="${esc(t)}">${esc(t)} (${n})</option>`).join('')}</optgroup>`;
  }
  sel.value = state.region;
  const ts = $('#type');
  if (ts.options.length < 2) ts.innerHTML = '<option value="">כל סוגי הגופים</option>' + TYPES.map(t => [t, DB.organizations.filter(o => o.type === t).length]).filter(([, n]) => n).map(([t, n]) => `<option value="${esc(t)}">${esc(t)} (${n})</option>`).join('');
  ts.value = state.type;
}
function orgRowEl(o) {
  const ps = peopleOf(o.id);
  const lead = o.logo ? `<img class="avatar logo-img wide" src="${esc(o.logo)}" alt="" loading="lazy">` : orgMark(o);
  return `<article class="rw">
    <div class="rw-l"><div class="rw-id">${lead}<div><button class="rw-name" data-open="org:${esc(o.id)}">${esc(o.name)}</button><span class="sub-line sub-en" dir="ltr" style="text-align:start">${esc(o.en)}</span><span class="meta-line">${esc(o.category)} · ${esc(o.region)}</span></div></div>
      <div class="tags">${o.priority ? '<span class="tag first">מומלץ לפנייה ראשונה</span>' : ''}${liveDeadline(o) ? `<span class="tag deadline">מועד: ${esc(o.deadline)}</span>` : ''}<span class="tag t-plain">${esc(o.category)}</span><span class="tag t-plain">${esc(o.region)}</span>${o.note ? '<span class="tag warn">כדאי לבדוק לפני פנייה</span>' : ''}</div></div>
    <div class="rw-r"><p class="desc">${esc(o.description)}</p>${upd(o)}
      ${ps.length ? `<div class="team"><span class="stack">${ps.slice(0, 4).map(p => avatar(p)).join('')}</span>${ps.length} ${ps.length === 1 ? 'איש קשר' : 'אנשי קשר'} במיפוי</div>` : '<div class="team">פנייה דרך ערוץ הארגון</div>'}
      <div class="rw-act">${o.phone ? telLink(o.phone, 'btn btn-sm', 'התקשרות') : ''}${o.email ? mailLink(o.email, 'btn btn-sm btn-ghost') : ''}${starBtn(o.id, o.name)}<button class="tlink" data-open="org:${esc(o.id)}">לפרופיל המלא</button></div></div>
  </article>`;
}
function personRowEl(p) {
  const o = orgById[p.org];
  const lines = [p.phoneNote ? `<div><span class="c-green">קשר שנמסר</span><bdi style="font-family:var(--f)">${esc(p.phoneNote)}</bdi></div>` : '', p.phone ? `<div><span class="${tcls(p.phoneType)}">${esc(p.phoneType || 'טלפון')}</span><bdi>${esc(p.phone)}</bdi></div>` : '', p.email ? `<div><span class="${tcls(p.emailType)}">${esc(p.emailType || 'מייל')}</span><bdi>${esc(p.email)}</bdi></div>` : ''].join('');
  return `<article class="rw">
    <div class="rw-l"><div class="rw-id">${avatar(p)}<div><button class="rw-name" data-open="person:${esc(p.id)}">${esc(p.name)}</button><span class="sub-line">${esc(p.role)}${o ? ' · ' + esc(o.name) : ''}</span></div></div>
      <div class="tags">${p.provided ? '<span class="tag given">קשר שנמסר</span>' : ''}${p.verified ? '' : '<span class="tag warn">התפקיד לא אומת</span>'}</div></div>
    <div class="rw-r"><p class="desc">${esc(p.bio)}</p>${upd(p)}${lines ? `<div class="contact-lines">${lines}</div>` : ''}
      <div class="rw-act">${p.phone ? telLink(p.phone, 'btn btn-sm') : ''}${p.email ? mailLink(p.email, 'btn btn-sm btn-ghost') : (!p.phone && o?.email ? mailLink(o.email, 'btn btn-sm btn-ghost', 'מייל הארגון') : '')}${starBtn(p.id, p.name)}<button class="tlink" data-open="person:${esc(p.id)}">לפרופיל המלא</button></div></div>
  </article>`;
}
const openGroups = new Set(), groupsInit = {};
const catOf = (x, isPerson) => x.mine ? 'נוספו על ידך' : isPerson ? (orgById[x.org]?.category || 'נבחרי ציבור ואנשי מפתח') : x.category;
function grouped(items, isPerson, build, force) {
  const map = new Map([...CATS, 'נבחרי ציבור ואנשי מפתח'].map(k => [k, []]));
  items.forEach(x => { const k = catOf(x, isPerson); if (!map.has(k)) map.set(k, []); map.get(k).push(x); });
  const groups = [...map].filter(([, v]) => v.length);
  if (!groupsInit[state.tab]) {
    groupsInit[state.tab] = true;
    const phone = matchMedia('(max-width:700px)').matches;
    groups.forEach(([k], i) => { if (!phone || i === 0) openGroups.add(k); });
  }
  return groups.map(([k, v]) => `<details class="grp" data-g="${esc(k)}" ${force || openGroups.has(k) ? 'open' : ''}><summary><span>${esc(k)}</span><b>${v.length}</b></summary><div class="rows">${v.map(build).join('')}</div></details>`).join('');
}
function savedShare() {
  if (!saved.length) return '';
  const url = location.origin + location.pathname + '#list=' + saved.map(encodeURIComponent).join(',');
  return `<div class="share-saved"><button class="btn btn-ghost" data-copy="${esc(url)}">העתקת קישור לרשימה</button><p class="small">פתיחת הקישור במכשיר אחר תוסיף לו את אותה רשימה. הרשימה לא נשמרת בשרת, ורק מי שקיבל את הקישור רואה אותה.</p>${vcfBtn('saved', 'שמירת כל הרשימה באנשי הקשר')}</div>`;
}
function render() {
  $$('.tabs button').forEach(b => b.setAttribute('aria-selected', b.dataset.tab === state.tab));
  $('#nSaved').textContent = saved.length;
  $('#title').textContent = TITLES[state.tab][0];
  $('#subtitle').textContent = TITLES[state.tab][1];
  const plain = state.tab === 'about' || state.tab === 'calls';
  $('#filters').hidden = plain;
  const c = $('#content');
  if (plain) { c.innerHTML = state.tab === 'calls' ? callsView() : aboutView(); return; }
  regionBar();
  $$('.chip').forEach(ch => ch.setAttribute('aria-pressed', ch.dataset.cat === state.cat));

  let orgs = [], people = [];
  if (state.tab === 'orgs') orgs = visibleOrgs();
  else if (state.tab === 'people') people = visiblePeople();
  else {
    orgs = visibleOrgs(DB.organizations.filter(o => saved.includes(o.id)));
    people = visiblePeople(DB.people.filter(p => saved.includes(p.id)));
  }
  const total = orgs.length + people.length;
  const noun = state.tab === 'people' ? 'אנשים' : state.tab === 'orgs' ? 'גופים ותוכניות' : 'פריטים';
  $('#count').textContent = `${total} ${noun}`;
  const nf = (state.cat ? 1 : 0) + (state.type ? 1 : 0) + (state.region ? 1 : 0) + (state.channel ? 1 : 0) + (state.priority ? 1 : 0) + (state.hideUnv ? 1 : 0);
  $('#fCount').textContent = nf || '';
  $('#reset').hidden = !(state.q || nf);

  if (!total) {
    c.innerHTML = state.tab === 'saved' && !saved.length
      ? '<div class="empty"><strong>הרשימה שלך ריקה</strong>סמנו כוכב ליד גוף או אדם כדי לשמור אותם כאן.</div>'
      : '<div class="empty"><strong>לא נמצאו תוצאות</strong>נסו מילה אחרת או הסירו חלק מהסינון.</div>';
    return;
  }
  const force = Boolean(state.q || nf);
  if (state.view !== 'rows') c.innerHTML = `<div class="grid ${animate ? 'enter' : ''}">${orgs.map(orgCard).join('')}${people.map(personCard).join('')}</div>`;
  else if (state.tab === 'saved') c.innerHTML = savedShare() + `<div class="rows ${animate ? 'enter' : ''}">${orgs.map(orgRowEl).join('')}${people.map(personRowEl).join('')}</div>`;
  else c.innerHTML = `<div class="${animate ? 'enter' : ''}">${state.tab === 'orgs' ? grouped(orgs, false, orgRowEl, force) : grouped(people, true, personRowEl, force)}</div>`;
  if (animate) { $$('.enter > *', c).forEach((el, i) => el.style.setProperty('--i', i)); animate = false; }
}

function callsView() {
  const live = DB.organizations.map(o => [o, liveDeadline(o)]).filter(([, d]) => d).sort((a, b) => (a[1].end || 0) - (b[1].end || 0));
  const gone = DB.organizations.filter(o => o.deadline && !liveDeadline(o)).length;
  const money = DB.organizations.filter(o => ['קרן', 'תוכנית וקול קורא'].includes(o.type) && !liveDeadline(o));
  const left = d => d.days == null ? '' : d.days <= 0 ? 'היום' : d.days === 1 ? 'מחר' : `נותרו ${d.days} ימים`;
  return `<div class="calls">
    <h2>מועדים קרובים</h2>
    ${live.length ? live.map(([o, d]) => `<button class="call" data-open="org:${esc(o.id)}"><span class="call-main"><strong>${esc(o.name)}</strong><span class="sub-line">עד ${esc(d.label)}</span>${upd(o)}</span><span class="count-down">${left(d)}</span></button>`).join('') : '<p class="small">אין כרגע מועדים פתוחים במיפוי.</p>'}
    ${gone ? `<p class="small">${gone} מועדים שחלפו הוסתרו אוטומטית.</p>` : ''}
    <h2>מימון ומענקים ללא מועד קבוע</h2>
    ${money.map(o => `<button class="call plain" data-open="org:${esc(o.id)}"><span class="call-main"><strong>${esc(o.name)}</strong><span class="sub-line">${esc(o.type)}</span>${upd(o)}</span></button>`).join('')}
    <p class="small">המועדים כפי שפורסמו ביום הבדיקה (${CHECKED}). יש לבדוק עמידה בתנאים בקול הקורא עצמו.</p>
  </div>`;
}
function aboutView() {
  return `<div class="about">
    <h2>מקורות ואימות</h2>
    <div><h3>מה נבדק ומתי</h3><p>המיפוי נבדק ב־${CHECKED}. בכל פרופיל מופיעים קישורים למקורות שעליהם מבוססים התפקידים ותיאורי הפעילות. פרטי הקשר לא נבדקו בשיחה או במשלוח מייל.</p></div>
    <div><h3>סוגי פרטי קשר</h3><ul>
      <li><b>קשר שנמסר:</b> אדם שפרטיו הגיעו בכרטיס קשר. התפקיד מסומן "לא אומת" עד שייבדק במקור ציבורי, ומספר הנייד שלו אינו מוצג.</li>
      <li><b>מקצועי ציבורי:</b> שם, תפקיד, מייל או טלפון שפורסמו באתר הארגון.</li>
      <li><b>ערוץ ארגוני:</b> מייל או טלפון כללי של הגוף. אינו מספר אישי של אדם מסוים.</li></ul></div>
    <div><h3>הסתייגויות שחשוב להכיר</h3><ul>
      <li>Synergy7: נמצאה הודעה על חילופי הנהלה. יש לוודא את מצב המינוי לפני פנייה.</li>
      <li>חינוך מחבר: המחזור המפורסם הסתיים באוגוסט 2026 ואין קול קורא פתוח.</li>
      <li>קיבוץ הייטק ו־Creation Space: האתרים משלבים חזון עם תיאור פעילות, והיקף הביצוע דורש בירור.</li></ul></div>
    <div><h3>מה עוד חסר במיפוי</h3><ul>
      <li>אילת והערבה: אין גוף שפועל שם ממופה. הן מוזכרות רק באינדקס DeserTech ובקרן נס.</li>
      <li>רשויות מקומיות: ממופים אשכולות ורשויות אזוריות בלבד. אין עיריות או מועצות כמו שדרות, נתיבות, אופקים, רהט, דימונה וחבל אשכול.</li>
      <li>חקלאות וטכנולוגיה: יש את מו״פ רמת הנגב ומעבדות מחקר, אך לא חברות Agritech.</li>
      <li>המגזר הבדואי: שני גופים בלבד, אג׳יק מכון הנגב ו־InNegev ברהט.</li>
      <li>סטארטאפים: אין סטארטאפ בודד ממופה, רק חממות וגופים תומכים.</li></ul></div>
    <div><h3>מה אין כאן</h3><p>המיפוי אינו ממצה את הפעילות בנגב. הצעות החיבור הן כיוונים לשיחה, ואינן מעידות על שותפות, משאבים או מימון מוסכמים.</p></div>
    <div id="removal"><h3>בקשה לתיקון או הסרה</h3><p>מי שמופיע כאן ורוצה לתקן פרט או להיות מוסר מהדף יכול לפנות למי ששלח לו את הקישור, והפרט יתוקן או יוסר.</p></div>
    <div><h3>גישה לדף</h3><p>הדף אינו מוגן בסיסמה: כל מי שיש לו את הקישור יכול לפתוח אותו. הוא מסומן לאי־אינדוקס במנועי חיפוש. אם נדרשת הגבלת גישה, מומלץ להעביר אותו מאחורי Cloudflare Access.</p></div>
    <div><h3>תמונות וקרדיטים</h3><p>התמונות והלוגואים נלקחו מעמודי הארגונים הרשמיים לצורך זיהוי בלבד, והזכויות שמורות לבעליהם.</p>
      <ul>${DB.imageCredits.map(c => `<li><a href="${esc(c.url)}" target="_blank" rel="noopener noreferrer">${esc(c.name)}</a></li>`).join('')}</ul></div>
    <div><h3>הרשימה והמעקב</h3><p>כוכבים וסטטוסי פנייה נשמרים בדפדפן ובמכשיר הזה בלבד. את הרשימה אפשר להעביר למכשיר אחר בקישור, מלשונית "שמורים".</p></div>
  </div>`;
}

/* drawer */
let lastFocus = null;
function copyRow(label, value, kind) {
  const href = kind === 'tel' ? 'tel:' + tel(value) : kind === 'mail' ? 'mailto:' + value : '';
  return `<div class="chan-row"><span class="lab">${esc(label)}</span>
    <bdi class="val grow">${esc(value)}</bdi>
    ${href ? `<a class="btn btn-sm ${kind === 'mail' ? 'btn-ghost' : ''}" href="${esc(href)}">${kind === 'tel' ? ICON.phone + 'התקשרות' : ICON.mail + 'מייל'}</a>` : ''}
    <button class="copy" data-copy="${esc(value)}">העתקה</button></div>`;
}
const srcList = urls => `<div><h3>מקורות · נבדק ב־${CHECKED}</h3><div class="srcs">${[...new Set(urls.filter(Boolean))].map(u => { let h = u; try { h = new URL(u).hostname; } catch {} return `<a href="${esc(u)}" target="_blank" rel="noopener noreferrer"><bdi>${esc(h)}</bdi></a>`; }).join('')}</div></div>`;

const actionBar = (phone, email) => (phone || email) ? `<div class="d-actions">${phone ? telLink(phone, 'btn') : ''}${email ? mailLink(email, 'btn btn-ghost') : ''}</div>` : '';
function orgDrawer(o) {
  const ps = peopleOf(o.id);
  const lead = o.logo ? `<img class="avatar logo-img wide" src="${esc(o.logo)}" alt="">` : orgMark(o);
  return `<div class="d-head"><div class="row2">${lead}<div><div class="kick">${esc(o.category)} · ${esc(o.region)}</div><h2>${esc(o.name)}</h2><div class="sub-line" dir="ltr" style="text-align:start">${esc(o.en)}</div></div></div></div>
  <div class="d-body">
    ${o.note ? `<div class="note"><b>לפני פנייה:</b> ${esc(o.note)}</div>` : ''}
    ${liveDeadline(o) ? `<div class="note"><b>מועד:</b> ${esc(o.deadline)}. יש לבדוק עמידה בתנאים בקול הקורא עצמו.</div>` : ''}
    ${vcfBtn('org:' + o.id)}
    <div><h3>מה הגוף עושה</h3><p>${esc(o.description)}</p></div>
    ${o.value ? `<div><h3>תרומה אפשרית ליוזמה</h3><p>${esc(o.value)}</p></div>` : ''}
    ${o.ask ? `<div><h3>מטרת הפנייה ושאלה לפתיחה</h3><p class="ask">${esc(o.ask)}</p></div>` : ''}
    <div><h3>ערוצי הארגון</h3><div class="chan">
      ${o.phone ? copyRow('טלפון ארגוני', o.phone, 'tel') : ''}
      ${o.email ? copyRow('מייל ארגוני כללי', o.email, 'mail') : ''}
      <div class="chan-row"><span class="lab">אתר רשמי</span><a class="grow" href="${esc(o.url)}" target="_blank" rel="noopener noreferrer"><bdi>${esc(o.url)}</bdi></a></div></div>
      <p class="small">ערוצים אלה שייכים לארגון ואינם פרטים אישיים של אדם מסוים.</p></div>
    <div><h3>אנשים במיפוי</h3>${ps.length ? ps.map(p => `<div class="person-row">${avatar(p)}<div><button class="name" data-open="person:${esc(p.id)}">${esc(p.name)}</button><div class="small">${esc(p.role)}</div></div></div>`).join('') : '<p class="small">אין איש קשר מוגדר. מומלץ לפנות דרך הערוץ הארגוני ולבקש את האחראי על שותפויות או פיתוח עסקי.</p>'}</div>
    ${upd(o) ? `<p class="small">${upd(o)}</p>` : ''}
    ${srcList(o.sources)}
    <div><h3>מעקב אישי (בדפדפן הזה בלבד)</h3>
      <select class="status" data-status="${esc(o.id)}" aria-label="סטטוס פנייה"><option value="">ללא סטטוס</option>${STATUSES.map(s => `<option ${statuses[o.id] === s ? 'selected' : ''}>${s}</option>`).join('')}</select></div>
    ${o.mine ? `<button class="btn btn-ghost" data-delmine="${esc(o.id)}">מחיקה מהרשימה שלי</button>` : ''}
    <button class="btn" data-save="${esc(o.id)}" aria-pressed="${saved.includes(o.id)}">${saved.includes(o.id) ? 'הסרה מהרשימה שלי' : 'שמירה ברשימה שלי'}</button>
  </div>${actionBar(o.phone, o.email)}`;
}

function personDrawer(p) {
  const o = orgById[p.org];
  return `<div class="d-head"><div class="row2">${avatar(p)}<div><div class="kick">${o ? esc(o.name) : ''}</div><h2>${esc(p.name)}</h2><div class="sub-line">${esc(p.role)}</div></div></div></div>
  <div class="d-body">
    ${p.note ? `<div class="note"><b>הערת אימות:</b> ${esc(p.note)}</div>` : ''}
    ${p.verified ? '' : '<div class="note">התפקיד או השיוך של אדם זה לא אומתו כמינוי נוכחי.</div>'}
    ${vcfBtn('person:' + p.id)}
    <div><h3>רקע</h3><p>${esc(p.bio)}</p></div>
    <div><h3>פרטי קשר</h3><div class="chan">
      ${p.phone ? copyRow(p.phoneType || 'טלפון', p.phone, 'tel') : ''}
      ${p.phoneNote ? `<p class="small">${esc(p.phoneNote)}</p>` : ''}
      ${p.email ? copyRow(p.emailType || 'מייל', p.email, 'mail') : ''}
      ${!p.phone && !p.email ? '<p class="small">אין פרט קשר ישיר. פנו דרך הארגון.</p>' : ''}</div></div>
    ${o ? `<div><h3>דרך הארגון</h3><div class="chan">${o.phone ? copyRow('טלפון ארגוני', o.phone, 'tel') : ''}${o.email ? copyRow('מייל ארגוני כללי', o.email, 'mail') : ''}</div>
      <p class="small">פרטי הארגון הם ערוץ כללי ואינם של ${esc(p.name)}.</p><p><button class="btn" data-open="org:${esc(o.id)}">לפרופיל ${esc(o.name)}</button></p></div>` : ''}
    ${upd(p) ? `<p class="small">${upd(p)}</p>` : ''}
    ${srcList([p.source])}
    ${p.mine ? `<button class="btn btn-ghost" data-delmine="${esc(p.id)}">מחיקה מהרשימה שלי</button>` : ''}
    <button class="btn" data-save="${esc(p.id)}" aria-pressed="${saved.includes(p.id)}">${saved.includes(p.id) ? 'הסרה מהרשימה שלי' : 'שמירה ברשימה שלי'}</button>
  </div>${actionBar(p.phone, p.email || (!p.phone ? o?.email : ''))}`;
}

function openItem(ref, push = true) {
  const [type, id] = ref.split(':');
  const item = type === 'org' ? orgById[id] : personById(id);
  if (!item) return;
  const dlg = $('#drawer');
  if (!dlg.open) lastFocus = document.activeElement;
  $('#drawerBody').innerHTML = type === 'org' ? orgDrawer(item) : personDrawer(item);
  if (!dlg.open) dlg.showModal();
  dlg.scrollTop = 0;
  if (push) history.replaceState(null, '', '#' + ref);
}
function closeDrawer() { const d = $('#drawer'); if (d.open) d.close(); }

/* save to phone (vCard) */
const vEsc = s => String(s ?? '').replace(/([,;\\])/g, '\\$1').replace(/\n/g, '\\n');
function vcardOf(x, isOrg) {
  const o = isOrg ? null : orgById[x.org];
  const phone = x.phone || o?.phone || '', email = x.email || o?.email || '';
  const words = x.name.replace(/^(פרופ׳|ד״ר|עו״ד)\s*/, '').split(/\s+/);
  const lines = ['BEGIN:VCARD', 'VERSION:3.0', `FN:${vEsc(x.name)}`, isOrg ? `N:${vEsc(x.name)};;;;` : `N:${vEsc(words.length > 1 ? words.slice(-1)[0] : words[0])};${vEsc(words.length > 1 ? words.slice(0, -1).join(' ') : '')};;;`];
  const orgName = isOrg ? x.name : o?.name; if (orgName) lines.push(`ORG:${vEsc(orgName)}`);
  if (!isOrg && x.role) lines.push(`TITLE:${vEsc(x.role)}`);
  if (phone) lines.push(`TEL;TYPE=WORK,VOICE:${phone.replace(/[^\d+]/g, '')}`);
  if (email) lines.push(`EMAIL;TYPE=WORK:${email}`);
  const url = isOrg ? x.url : o?.url; if (url) lines.push(`URL:${url}`);
  const viaOrg = !isOrg && !x.phone && !x.email && (phone || email);
  lines.push(`NOTE:${vEsc('מתוך מפת שותפים בנגב' + (viaOrg ? '. הטלפון והמייל הם של הארגון, לא אישיים.' : ''))}`, 'END:VCARD');
  return lines.join('\r\n');
}
async function saveVcf(text, name) {
  const file = new File([text], name, { type: 'text/vcard' });
  if (navigator.canShare?.({ files: [file] })) { try { await navigator.share({ files: [file] }); return; } catch (e) { if (e.name === 'AbortError') return; } }
  const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(new Blob([text], { type: 'text/vcard;charset=utf-8' })), download: name });
  document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  toast('הקובץ ירד. פתחו אותו כדי להוסיף לאנשי הקשר');
}
const vcfBtn = (ref, label = 'שמירה באנשי הקשר בטלפון') => `<button class="btn btn-ghost vcf" data-vcf="${esc(ref)}">${label}</button>`;

/* add your own contact (stays in this browser) */
const KINDS = { person: 'איש קשר', org: 'חברה או גוף' };
function addMessage(f) {
  return ['הצעה להוספה לאתר "מפת שותפים בנגב"', `סוג: ${KINDS[f.kind]}`, `שם: ${f.name}`, f.role && `תפקיד: ${f.role}`, f.orgName && `ארגון: ${f.orgName}`, f.region && `אזור: ${f.region}`, f.phone && `טלפון: ${f.phone}`, f.email && `מייל: ${f.email}`, f.url && `אתר: ${f.url}`, f.note && `הערה: ${f.note}`].filter(Boolean).join('\n');
}
function readAddForm() {
  const fd = new FormData($('#addForm'));
  const f = Object.fromEntries([...fd].map(([k, v]) => [k, String(v).trim()]));
  f.kind = f.kind === 'org' ? 'org' : 'person';
  return f;
}

/* export */
function csvCell(v) { v = String(v ?? ''); if (/^[=+@\-\t\r]/.test(v)) v = "'" + v; return '"' + v.replaceAll('"', '""') + '"'; }
function downloadCSV(name, rows) {
  const blob = new Blob(['﻿' + rows.map(r => r.map(csvCell).join(',')).join('\r\n')], { type: 'text/csv;charset=utf-8' });
  const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: name });
  document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
const HEAD = ['שם', 'תפקיד', 'ארגון', 'טלפון ארגוני', 'מייל ארגוני', 'תפקיד מאומת', 'הערה', 'מקור', 'נבדק'];
const personRow = p => { const o = orgById[p.org] || {}; return [p.name, p.role, o.name, o.phone, o.email, p.verified ? 'כן' : 'לא', p.note, p.source, DB.updated]; };
const orgRow = o => ['', '', o.name, o.phone, o.email, '', o.note, o.url, DB.updated];
function doExport(kind) {
  let rows = [], name = 'negev-contacts-' + DB.updated + '.csv';
  if (kind === 'people') rows = DB.people.map(personRow);
  else if (kind === 'saved') {
    rows = [...DB.organizations.filter(o => saved.includes(o.id)).map(orgRow), ...DB.people.filter(p => saved.includes(p.id)).map(personRow)];
    name = 'negev-my-list.csv';
  } else {
    const ps = state.tab === 'orgs' ? visibleOrgs().flatMap(o => peopleOf(o.id)) : visiblePeople();
    rows = state.tab === 'orgs' ? visibleOrgs().map(orgRow).concat(ps.map(personRow)) : ps.map(personRow);
    name = 'negev-view.csv';
  }
  if (!rows.length) { toast('אין מה לייצא'); return; }
  downloadCSV(name, [HEAD, ...rows]);
  toast(`יוצאו ${rows.length} שורות`);
}

/* print */
function buildPrint() {
  const orgs = state.tab === 'about' ? DB.organizations : (state.tab === 'people' ? [] : visibleOrgs(state.tab === 'saved' ? DB.organizations.filter(o => saved.includes(o.id)) : DB.organizations));
  const people = state.tab === 'orgs' ? orgs.flatMap(o => peopleOf(o.id)) : (state.tab === 'about' ? DB.people : visiblePeople(state.tab === 'saved' ? DB.people.filter(p => saved.includes(p.id)) : DB.people));
  const row = (c) => `<tr>${c.map(x => `<td>${x}</td>`).join('')}</tr>`;
  $('#printArea').innerHTML = `<h1>מפת שותפים בנגב</h1><div class="pmeta">נבדק ב־${CHECKED} · מסמך מידע, ערוצים ארגוניים בלבד</div>
    ${orgs.length ? `<table><thead><tr><th>גוף</th><th>תחום</th><th>אזור</th><th>ערוץ ארגוני</th><th>הערות</th></tr></thead><tbody>${orgs.map(o => row([esc(o.name), esc(o.category), esc(o.region), `<bdi>${esc([o.phone, o.email].filter(Boolean).join(' · '))}</bdi>`, esc(o.note)])).join('')}</tbody></table><br>` : ''}
    ${people.length ? `<table><thead><tr><th>שם</th><th>תפקיד</th><th>ארגון</th><th>ערוץ ארגוני</th><th>הערות</th></tr></thead><tbody>${people.map(p => row([esc(p.name), esc(p.role), esc(orgById[p.org]?.name), `<bdi>${esc(orgById[p.org]?.phone)}</bdi> <bdi>${esc(orgById[p.org]?.email)}</bdi>`, esc(p.note)])).join('')}</tbody></table>` : ''}`;
}

/* events */
document.addEventListener('click', e => {
  const t = e.target;
  if (t.closest('#fToggle')) { const m = $('#flMore'); const on = !m.classList.contains('open'); m.classList.toggle('open', on); $('#fToggle').setAttribute('aria-expanded', on); return; }
  const rowEl = t.closest('.rw');
  if (rowEl && !t.closest('a,button,select,input,label')) { rowEl.querySelector('[data-open]')?.click(); return; }
  const open = t.closest('[data-open]'); if (open) { openItem(open.dataset.open); return; }
  const sv = t.closest('[data-save]');
  if (sv) {
    const id = sv.dataset.save;
    saved = saved.includes(id) ? saved.filter(x => x !== id) : [...saved, id];
    if (!store.set('negev-hub-saved', saved)) toast('שמירה בדפדפן אינה זמינה');
    else toast(saved.includes(id) ? 'נוסף לרשימה שלי' : 'הוסר מהרשימה שלי');
    render();
    if ($('#drawer').open) { const h = location.hash.slice(1); if (h) openItem(h, false); }
    return;
  }
  const vc = t.closest('[data-vcf]');
  if (vc) {
    const ref = vc.dataset.vcf;
    if (ref === 'saved') {
      const cards = [...DB.organizations.filter(o => saved.includes(o.id)).map(o => vcardOf(o, true)), ...DB.people.filter(p => saved.includes(p.id)).map(p => vcardOf(p, false))];
      if (cards.length) saveVcf(cards.join('\r\n'), 'negev-contacts.vcf'); else toast('הרשימה ריקה');
    } else { const [type, id] = ref.split(':'); const x = type === 'org' ? orgById[id] : personById(id); if (x) saveVcf(vcardOf(x, type === 'org'), `${id}.vcf`); }
    return;
  }
  if (t.closest('#addBtn')) { $('#addForm').reset(); $('#addDlg').showModal(); return; }
  if (t.closest('#closeAdd') || t === $('#addDlg')) { $('#addDlg').close(); return; }
  if (t.closest('#addWhats')) { const f = readAddForm(); if (!f.name) { toast('חסר שם'); $('#addForm [name=name]').focus(); return; } window.open('https://wa.me/?text=' + encodeURIComponent(addMessage(f)), '_blank', 'noopener'); return; }
  if (t.closest('#addCopy')) { const f = readAddForm(); if (!f.name) { toast('חסר שם'); return; } navigator.clipboard?.writeText(addMessage(f)).then(() => toast('ההצעה הועתקה'), () => toast('ההעתקה נחסמה')); return; }
  const dm = t.closest('[data-delmine]');
  if (dm) {
    const id = dm.dataset.delmine; mine = mine.filter(m => m.id !== id); store.set('negev-hub-mine', mine);
    DB.organizations = DB.organizations.filter(o => o.id !== id); DB.people = DB.people.filter(p => p.id !== id); delete orgById[id];
    saved = saved.filter(x => x !== id); store.set('negev-hub-saved', saved);
    closeDrawer(); render(); toast('נמחק מהרשימה שלי'); return;
  }
  const cp = t.closest('[data-copy]');
  if (cp) { navigator.clipboard?.writeText(cp.dataset.copy).then(() => toast('הועתק'), () => toast('ההעתקה נחסמה')); return; }
  const tab = t.closest('[data-tab]'); if (tab) { state.tab = tab.dataset.tab; state.region = ''; animate = true; render(); if (tab.dataset.anchor) $('#' + tab.dataset.anchor)?.scrollIntoView(); else window.scrollTo(0, 0); return; }
  const reg = t.closest('[data-region]'); if (reg) { state.region = state.region === reg.dataset.region ? '' : reg.dataset.region; render(); return; }
  const vw = t.closest('[data-view]'); if (vw) { state.view = vw.dataset.view; animate = true; render(); return; }
  const chip = t.closest('.chip'); if (chip) { state.cat = chip.dataset.cat; render(); return; }
  const ex = t.closest('[data-export]'); if (ex) { doExport(ex.dataset.export); closeMenu(); return; }
  if (t.closest('#exportBtn')) { const pop = $('.menu-pop'); const show = pop.hidden; pop.hidden = !show; $('#exportBtn').setAttribute('aria-expanded', show); return; }
  if (!t.closest('.menu')) closeMenu();
  if (t.closest('#toTop')) { window.scrollTo({ top: 0, behavior: 'smooth' }); return; }
  if (t.closest('#printBtn')) { buildPrint(); window.print(); return; }
  if (t.closest('#reset')) { Object.assign(state, { cat: '', type: '', region: '', channel: '', priority: false, hideUnv: false, q: '' }); $('#q').value = ''; $('#region').value = ''; $('#type').value = ''; $('#priority').checked = false; $('#hideUnv').checked = false; render(); return; }
  if (t.closest('#closeDrawer') || t === $('#drawer')) closeDrawer();
});
function closeMenu() { $('.menu-pop').hidden = true; $('#exportBtn').setAttribute('aria-expanded', false); }
document.addEventListener('submit', e => {
  if (e.target.id !== 'addForm') return;
  e.preventDefault();
  const f = readAddForm();
  if (!f.name) { toast('חסר שם'); return; }
  const m = { ...f, id: 'my-' + Date.now().toString(36), checked: new Date().toISOString().slice(0, 10) };
  mine.push(m); store.set('negev-hub-mine', mine); addMine(m);
  $('#addDlg').close(); state.tab = 'saved'; saved = [...saved, m.id]; store.set('negev-hub-saved', saved); animate = true; render(); window.scrollTo(0, 0);
  toast('נוסף ונשמר ברשימה שלי, במכשיר הזה בלבד');
});
document.addEventListener('change', e => {
  const t = e.target;
  if (t.matches('[data-status]')) { statuses[t.dataset.status] = t.value; store.set('negev-hub-status', statuses); toast('הסטטוס נשמר בדפדפן הזה'); }
  else if (t.id === 'region') { state.region = t.value; render(); }
  else if (t.id === 'type') { state.type = t.value; render(); }
  else if (t.id === 'hideUnv') { state.hideUnv = t.checked; render(); }
  else if (t.id === 'channel') { state.channel = t.value; render(); }
  else if (t.id === 'priority') { state.priority = t.checked; render(); }
  
});
$('#q').addEventListener('input', e => { state.q = e.target.value.trim(); render(); });
document.addEventListener('keydown', e => {
  if (e.key === '/' && !/INPUT|SELECT|TEXTAREA/.test(document.activeElement.tagName) && !$('#drawer').open) { e.preventDefault(); if (state.tab === 'about') { state.tab = 'orgs'; render(); } $('#q').focus(); }
  if (e.key === 'Escape') closeMenu();
});
$('#drawer').addEventListener('close', () => { history.replaceState(null, '', location.pathname + location.search); lastFocus?.focus?.(); });
window.addEventListener('beforeprint', () => { if (!$('#printArea').innerHTML) buildPrint(); });
window.addEventListener('hashchange', () => { const h = location.hash.slice(1); if (h.includes(':')) openItem(h, false); });


/* init */
document.addEventListener('toggle', e => { const d = e.target; if (d.matches?.('details.grp')) { if (d.open) openGroups.add(d.dataset.g); else openGroups.delete(d.dataset.g); } }, true);
window.addEventListener('scroll', () => { $('#toTop').hidden = window.scrollY < 700; }, { passive: true });
(function init() {
  const shared = location.hash.match(/^#list=(.+)$/);
  if (shared) {
    const add = decodeURIComponent(shared[1]).split(',').filter(id => (orgById[id] || personById(id)) && !saved.includes(id));
    if (add.length) { saved = [...saved, ...add]; store.set('negev-hub-saved', saved); setTimeout(() => toast(`נוספו ${add.length} פריטים לרשימה שלי`), 400); }
    history.replaceState(null, '', location.pathname + location.search);
  }
  $('#nOrgs').textContent = DB.organizations.length;
  $('#nPeople').textContent = DB.people.length;
  $('#chips').innerHTML = [['', 'הכול'], ...CATS.map(c => [c, c])].map(([v, l]) => `<button class="chip" data-cat="${esc(v)}" aria-pressed="${v === ''}">${esc(l)}</button>`).join('');
  render();
  const h = location.hash.slice(1); if (h.includes(':')) openItem(h, false);
})();

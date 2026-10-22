'use strict';
const DB = window.NEGEV_DATA;
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const CHECKED = '22.10.2026';
const CATS = ['יזמות וטכנולוגיה', 'אקדמיה ומחקר', 'רשויות ופיתוח אזורי', 'קרנות והשקעות', 'חינוך וקהילה', 'אקלים ומדבר', 'בריאות'];
const STATUSES = ['לפנות בהמשך', 'נשלחה פנייה', 'נקבעה שיחה', 'התקיימה שיחה'];

const orgById = Object.fromEntries(DB.organizations.map(o => [o.id, o]));
const peopleOf = id => DB.people.filter(p => p.org === id);
const personById = id => DB.people.find(p => p.id === id);

/* browser-only state */
const store = {
  get(k, d) { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch { return false; } }
};
let saved = store.get('negev-hub-saved', []);
let statuses = store.get('negev-hub-status', {});
if (!Array.isArray(saved)) saved = [];
const state = { tab: 'orgs', view: 'rows', cat: '', region: '', channel: '', priority: false, pai: false, q: '' };
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
  if (state.region && o?.region !== state.region) return false;
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
  return list.filter(o => matchesCommon(o, o) && matchesChannel(o, peopleOf(o.id)) && (!state.priority || o.priority) && (!state.pai || o.pai))
    .sort((a, b) => Number(b.priority) - Number(a.priority));
}
function visiblePeople(list = DB.people) {
  return list.filter(p => { const o = orgById[p.org]; return matchesCommon(p, o) && matchesChannel(p) && (!state.priority || o?.priority) && (!state.pai || o?.pai); });
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
  orgs: ['מי כבר עובד על חדשנות בנגב', 'מיפוי ראשוני של גופים ותוכניות. הפורמט של היוזמה עדיין פתוח, ושום גוף כאן אינו שותף מוסכם. הסימון "לפנייה ראשונה" הוא הצעת סדר עבודה, לא דירוג.'],
  people: ['האנשים שכדאי להכיר', 'שם, תפקיד וערוץ הקשר המתאים. כל פרט מסומן לפי מקורו.'],
  saved: ['הרשימה שלי', 'גופים ואנשים שסימנת. נשמרים בדפדפן הזה בלבד.'],
  plan: ['תוכנית פעולה', 'מאיפה להתחיל, למי לפנות ומה לעשות בחודש הראשון. אלה כיווני עבודה ולא התחייבות של הגופים.'],
  about: ['מקורות ואימות', 'מאיפה הגיע המידע, ומה עדיין לא נבדק.']
};
function regionBar() {
  const sel = $('#region');
  if (sel.options.length < 2) {
    const names = [...new Set(DB.organizations.map(o => o.region))].sort((x, y) => x.localeCompare(y, 'he'));
    sel.innerHTML += names.map(r => `<option>${esc(r)}</option>`).join('');
  }
  sel.value = state.region;
}
function orgRowEl(o) {
  const ps = peopleOf(o.id);
  const lead = o.logo ? `<img class="avatar logo-img wide" src="${esc(o.logo)}" alt="" loading="lazy">` : orgMark(o);
  return `<article class="rw">
    <div class="rw-l"><div class="rw-id">${lead}<div><button class="rw-name" data-open="org:${esc(o.id)}">${esc(o.name)}</button><span class="sub-line sub-en" dir="ltr" style="text-align:start">${esc(o.en)}</span><span class="meta-line">${esc(o.category)} · ${esc(o.region)}</span></div></div>
      <div class="tags">${o.priority ? '<span class="tag first">מומלץ לפנייה ראשונה</span>' : ''}${o.pai ? '<span class="tag pai">Physical AI</span>' : ''}${o.deadline ? `<span class="tag deadline">מועד: ${esc(o.deadline)}</span>` : ''}<span class="tag t-plain">${esc(o.category)}</span><span class="tag t-plain">${esc(o.region)}</span>${o.note ? '<span class="tag warn">כדאי לבדוק לפני פנייה</span>' : ''}</div></div>
    <div class="rw-r"><p class="desc">${esc(o.description)}</p>
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
    <div class="rw-r"><p class="desc">${esc(p.bio)}</p>${lines ? `<div class="contact-lines">${lines}</div>` : ''}
      <div class="rw-act">${p.phone ? telLink(p.phone, 'btn btn-sm') : ''}${p.email ? mailLink(p.email, 'btn btn-sm btn-ghost') : (!p.phone && o?.email ? mailLink(o.email, 'btn btn-sm btn-ghost', 'מייל הארגון') : '')}${starBtn(p.id, p.name)}<button class="tlink" data-open="person:${esc(p.id)}">לפרופיל המלא</button></div></div>
  </article>`;
}
function render() {
  $$('.tabs button').forEach(b => b.setAttribute('aria-selected', b.dataset.tab === state.tab));
  $('#nSaved').textContent = saved.length;
  $('#title').textContent = TITLES[state.tab][0];
  $('#subtitle').textContent = TITLES[state.tab][1];
  $$('#viewSeg button').forEach(b => b.setAttribute('aria-pressed', b.dataset.view === state.view));
  const about = state.tab === 'about' || state.tab === 'plan';
  $('#filters').hidden = about;
  const c = $('#content');
  if (about) { c.innerHTML = state.tab === 'plan' ? planView() : aboutView(); return; }
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
  const nf = (state.cat ? 1 : 0) + (state.region ? 1 : 0) + (state.channel ? 1 : 0) + (state.priority ? 1 : 0) + (state.pai ? 1 : 0);
  $('#fCount').textContent = nf || '';
  $('#reset').hidden = !(state.q || state.cat || state.region || state.channel || state.priority || state.pai);

  if (!total) {
    c.innerHTML = state.tab === 'saved' && !saved.length
      ? '<div class="empty"><strong>הרשימה שלך ריקה</strong>סמנו כוכב ליד גוף או אדם כדי לשמור אותם כאן.</div>'
      : '<div class="empty"><strong>לא נמצאו תוצאות</strong>נסו מילה אחרת או הסירו חלק מהסינון.</div>';
    return;
  }
  if (state.view === 'rows') c.innerHTML = `<div class="rows ${animate ? 'enter' : ''}">${orgs.map(orgRowEl).join('')}${people.map(personRowEl).join('')}</div>`;
  else c.innerHTML = `<div class="grid ${animate ? 'enter' : ''}">${orgs.map(orgCard).join('')}${people.map(personCard).join('')}</div>`;
  if (animate) { $$('.enter > *', c).forEach((el, i) => el.style.setProperty('--i', i)); animate = false; }
}

function planView() {
  const L = (items) => `<ol class="plan-list">${items.map(t => `<li>${t}</li>`).join('')}</ol>`;
  return `<div class="about plan">
    <div><h3>מאיפה להתחיל</h3><p>רצף ההיכרות המוצע: ספיר ו-SASI, אחריהם Synergy7 ו-BGN, ואז שותף שטח כמו מו״פ רמת הנגב או מפעל דרך מרכז דרום. InNegev ו-SouthUp מתאימות לבדיקת בניית חברות ומעטפת יזמית. זה סדר עבודה מוצע לפי היכולות שנמצאו, לא התחייבות של הגופים לשתף פעולה.</p></div>
    <div><h3>שתי הזדמנויות קרובות</h3><ul>
      <li><b>התארגנות מאגד Fusion-AI:</b> עד 31.10.2026 ב-12:00.</li>
      <li><b>אתרי הרצה לתעשייה:</b> עד 26.11.2026 ב-12:00.</li></ul>
      <p class="small">המועדים כפי שהופיעו בקולות הקוראים ביום הבדיקה. יש לבדוק עמידה בתנאים.</p></div>
    <div><h3>מסלולי היכרות מוצעים</h3>
      <p>לפי מה שנמסר, יש בקבוצה נציגות בכירה מספיר. זה החיבור האישי היחיד שנמסר, ולא אומתה היכרות שלה עם אנשים מסוימים. אלה כיוונים לבקשת היכרות, לא חיבורים שכבר הובטחו.</p>
      ${L(['<b>דרך ספיר:</b> לבקש חיבור ל-SASI, לפקולטה לטכנולוגיה ולמרכז ח״י בספיר. לבדוק גם היכרות עם SouthUp, שמציגה את ספיר כשותפה.','<b>דרך BGN:</b> שולחן עבודה עם חוקרים לפי משימה, לצד Synergy7 לבדיקת תשתית. נכונות לשיתוף והיכרות אישית לא אומתו.','<b>דרך מרכז דרום ופריזמה נגב:</b> לבקש אתגר ייצור ממפעל. דרך מו״פ רמת הנגב: משימה חקלאית ומארח ניסוי עם בעל תפקיד אחראי.'])}</div>
    <div><h3>חודש ראשון מוצע</h3>
      ${L(['להחליט אם בונים אקוסיסטם אזורי, מרכז ניסויים, סטודיו להקמת חברות או מיזם אחד. לכל מודל שותפים ומימון אחרים.','לבחור שני תחומי יישום לפתיחה, למשל חקלאות ורובוטיקה תעשייתית. לדבר עם משתמשי קצה ולדרג כאב, תדירות, בטיחות ויכולת לשלם.','לקיים פגישות מיפוי עם ספיר ו-SASI, Synergy7, BGN ושותף שטח. לבקש צורך, תשתית, איש קשר ותנאי גישה.','להגדיר מדגים אחד ומדדי הצלחה: זמן פעולה, שיעור הצלחה, דיוק ועלות למשימה. להסדיר נתונים, ביטוח, בטיחות ו-IP.','אחרי שיש צורך ומארח, להתאים לקרן ההזנק, למאגד או לאתר הרצה. לבדוק מימון התשתית בנפרד ממימון החברה.'])}</div>
    <div><h3>גבולות הבדיקה של המפה</h3>
      <p>המקורות הם בעיקר אתרי הגופים, דפי חוקרים וקולות קוראים רשמיים, לצד CTech ו-Israel Robotics Hub. אין אישור ישיר לזמינות מעבדות, השקעה, קבלה או היכרות אישית. רוב הדפים אינם מציינים תאריך עדכון.</p>
      <p>לא הושלמו מיפוי מלא של אילת והערבה, החברה הבדואית, בתי חולים, כל המפעלים וחברות הביטחון, או כל הסטארטאפים. חברות לא נכללו רק משום שהן ישראליות ועוסקות ברובוטיקה, ללא קשר אזורי מאומת.</p>
      <p>החממות מספטמבר 2026 מסומנות כהכרזה, לא כתשתית פעילה. מועד מענק 4.91 חלף ב-22.10.2026 ב-13:00, ומסלול הסניפים בסך 35 מיליון ש״ח הוא פרסום מ-2024 ולא אומת כפתוח. לא בוצעה פנייה, הרשמה או התחייבות בשם הקבוצה.</p></div>
  </div>`;
}
function aboutView() {
  return `<div class="about">
    <h2>מקורות ואימות</h2>
    <div><h3>מה נבדק ומתי</h3><p>המיפוי נבדק ב־${CHECKED}. בכל פרופיל מופיעים קישורים למקורות שעליהם מבוססים התפקידים ותיאורי הפעילות. פרטי הקשר לא נבדקו בשיחה או במשלוח מייל.</p></div>
    <div><h3>שלושה סוגי פרטי קשר</h3><ul>
      <li><b>קשר שנמסר:</b> עשרת אנשי הקשר המקוריים, שפרטיהם הגיעו בכרטיסי קשר. מספרי הנייד מסומנים כך גם כאשר התפקיד אומת בנפרד.</li>
      <li><b>מקצועי ציבורי:</b> שם, תפקיד, מייל או טלפון שפורסמו באתר הארגון.</li>
      <li><b>ערוץ ארגוני:</b> מייל או טלפון כללי של הגוף. אינו מספר אישי של אדם מסוים.</li></ul></div>
    <div><h3>הסתייגויות שחשוב להכיר</h3><ul>
      <li>Synergy7: נמצאה הודעה על חילופי הנהלה. יש לוודא את מצב המינוי לפני פנייה.</li>
      <li>חינוך מחבר: המחזור המפורסם הסתיים באוגוסט 2026 ואין קול קורא פתוח.</li>
      <li>קיבוץ הייטק ו־Creation Space: האתרים משלבים חזון עם תיאור פעילות, והיקף הביצוע דורש בירור.</li></ul></div>
    <div><h3>מה אין כאן</h3><p>המיפוי אינו ממצה את הפעילות בנגב. הצעות החיבור הן כיוונים לשיחה, ואינן מעידות על שותפות, משאבים או מימון מוסכמים.</p></div>
    <div><h3>תמונות וקרדיטים</h3><p>התמונות והלוגואים נלקחו מעמודי הארגונים הרשמיים לצורך זיהוי בלבד, והזכויות שמורות לבעליהם.</p>
      <ul>${DB.imageCredits.map(c => `<li><a href="${esc(c.url)}" target="_blank" rel="noopener noreferrer">${esc(c.name)}</a></li>`).join('')}</ul></div>
    <div><h3>הרשימה והמעקב</h3><p>כוכבים וסטטוסי פנייה נשמרים בדפדפן ובמכשיר הזה בלבד. זו אינה עריכה משותפת, ושותפים אחרים לא רואים אותם.</p></div>
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
    ${o.deadline ? `<div class="note"><b>מועד:</b> ${esc(o.deadline)}. יש לבדוק עמידה בתנאים בקול הקורא עצמו.</div>` : ''}
    <div><h3>מה הגוף עושה</h3><p>${esc(o.description)}</p></div>
    ${o.value ? `<div><h3>תרומה אפשרית ליוזמה</h3><p>${esc(o.value)}</p></div>` : ''}
    ${o.ask ? `<div><h3>מטרת הפנייה ושאלה לפתיחה</h3><p class="ask">${esc(o.ask)}</p></div>` : ''}
    <div><h3>ערוצי הארגון</h3><div class="chan">
      ${o.phone ? copyRow('טלפון ארגוני', o.phone, 'tel') : ''}
      ${o.email ? copyRow('מייל ארגוני כללי', o.email, 'mail') : ''}
      <div class="chan-row"><span class="lab">אתר רשמי</span><a class="grow" href="${esc(o.url)}" target="_blank" rel="noopener noreferrer"><bdi>${esc(o.url)}</bdi></a></div></div>
      <p class="small">ערוצים אלה שייכים לארגון ואינם פרטים אישיים של אדם מסוים.</p></div>
    <div><h3>אנשים במיפוי</h3>${ps.length ? ps.map(p => `<div class="person-row">${avatar(p)}<div><button class="name" data-open="person:${esc(p.id)}">${esc(p.name)}</button><div class="small">${esc(p.role)}</div></div></div>`).join('') : '<p class="small">אין איש קשר מוגדר. מומלץ לפנות דרך הערוץ הארגוני ולבקש את האחראי על שותפויות או פיתוח עסקי.</p>'}</div>
    ${srcList(o.sources)}
    <div><h3>מעקב אישי (בדפדפן הזה בלבד)</h3>
      <select class="status" data-status="${esc(o.id)}" aria-label="סטטוס פנייה"><option value="">ללא סטטוס</option>${STATUSES.map(s => `<option ${statuses[o.id] === s ? 'selected' : ''}>${s}</option>`).join('')}</select></div>
    <button class="btn" data-save="${esc(o.id)}" aria-pressed="${saved.includes(o.id)}">${saved.includes(o.id) ? 'הסרה מהרשימה שלי' : 'שמירה ברשימה שלי'}</button>
  </div>${actionBar(o.phone, o.email)}`;
}

function personDrawer(p) {
  const o = orgById[p.org];
  return `<div class="d-head"><div class="row2">${avatar(p)}<div><div class="kick">${o ? esc(o.name) : ''}</div><h2>${esc(p.name)}</h2><div class="sub-line">${esc(p.role)}</div></div></div></div>
  <div class="d-body">
    ${p.note ? `<div class="note"><b>הערת אימות:</b> ${esc(p.note)}</div>` : ''}
    ${p.verified ? '' : '<div class="note">התפקיד או השיוך של אדם זה לא אומתו כמינוי נוכחי.</div>'}
    <div><h3>רקע</h3><p>${esc(p.bio)}</p></div>
    <div><h3>פרטי קשר</h3><div class="chan">
      ${p.phone ? copyRow(p.phoneType || 'טלפון', p.phone, 'tel') : ''}
      ${p.phoneNote ? `<p class="small">${esc(p.phoneNote)}</p>` : ''}
      ${p.email ? copyRow(p.emailType || 'מייל', p.email, 'mail') : ''}
      ${!p.phone && !p.email ? '<p class="small">אין פרט קשר ישיר. פנו דרך הארגון.</p>' : ''}</div></div>
    ${o ? `<div><h3>דרך הארגון</h3><div class="chan">${o.phone ? copyRow('טלפון ארגוני', o.phone, 'tel') : ''}${o.email ? copyRow('מייל ארגוני כללי', o.email, 'mail') : ''}</div>
      <p class="small">פרטי הארגון הם ערוץ כללי ואינם של ${esc(p.name)}.</p><p><button class="btn" data-open="org:${esc(o.id)}">לפרופיל ${esc(o.name)}</button></p></div>` : ''}
    ${srcList([p.source])}
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

/* export */
function csvCell(v) { v = String(v ?? ''); if (/^[=+@\-\t\r]/.test(v)) v = "'" + v; return '"' + v.replaceAll('"', '""') + '"'; }
function downloadCSV(name, rows) {
  const blob = new Blob(['﻿' + rows.map(r => r.map(csvCell).join(',')).join('\r\n')], { type: 'text/csv;charset=utf-8' });
  const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: name });
  document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
const HEAD = ['שם', 'תפקיד', 'ארגון', 'טלפון ישיר', 'מקור הטלפון', 'מייל ישיר', 'סוג המייל', 'טלפון ארגוני', 'מייל ארגוני', 'תפקיד מאומת', 'הערה', 'מקור', 'נבדק'];
const personRow = p => { const o = orgById[p.org] || {}; return [p.name, p.role, o.name, p.phone, p.phoneType, p.email, p.emailType, o.phone, o.email, p.verified ? 'כן' : 'לא', p.note, p.source, DB.updated]; };
const orgRow = o => ['', '', o.name, '', '', '', '', o.phone, o.email, '', o.note, o.url, DB.updated];
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
  $('#printArea').innerHTML = `<h1>מפת שותפים בנגב</h1><div class="pmeta">נבדק ב־${CHECKED} · מסמך לשותפים, מכיל פרטי קשר</div>
    ${orgs.length ? `<table><thead><tr><th>גוף</th><th>תחום</th><th>אזור</th><th>ערוץ ארגוני</th><th>הערות</th></tr></thead><tbody>${orgs.map(o => row([esc(o.name), esc(o.category), esc(o.region), `<bdi>${esc([o.phone, o.email].filter(Boolean).join(' · '))}</bdi>`, esc(o.note)])).join('')}</tbody></table><br>` : ''}
    ${people.length ? `<table><thead><tr><th>שם</th><th>תפקיד</th><th>ארגון</th><th>טלפון</th><th>מייל</th><th>הערות</th></tr></thead><tbody>${people.map(p => row([esc(p.name), esc(p.role), esc(orgById[p.org]?.name), `<bdi>${esc(p.phone)}</bdi> ${p.phone ? '<br>' + esc(p.phoneType) : ''}`, `<bdi>${esc(p.email)}</bdi>`, esc(p.note)])).join('')}</tbody></table>` : ''}`;
}

/* events */
document.addEventListener('click', e => {
  const t = e.target;
  if (t.closest('#fToggle')) { const m = $('#flMore'); const on = !m.classList.contains('open'); m.classList.toggle('open', on); $('#fToggle').setAttribute('aria-expanded', on); return; }
  const rowEl = t.closest('.rw');
  if (rowEl && !t.closest('a,button,select,input,label')) { rowEl.querySelector('[data-open]')?.click(); return; }
  const go = t.closest('[data-go]');
  if (go) { if (go.dataset.go === 'plan') { state.tab = 'plan'; } else { state.tab = 'orgs'; state.pai = true; $('#pai').checked = true; } animate = true; render(); $('#' + (state.tab === 'plan' ? 'content' : 'filters')).scrollIntoView({ behavior: 'smooth', block: 'start' }); return; }
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
  const cp = t.closest('[data-copy]');
  if (cp) { navigator.clipboard?.writeText(cp.dataset.copy).then(() => toast('הועתק'), () => toast('ההעתקה נחסמה')); return; }
  const tab = t.closest('[data-tab]'); if (tab) { state.tab = tab.dataset.tab; state.region = ''; animate = true; render(); window.scrollTo(0, 0); return; }
  const reg = t.closest('[data-region]'); if (reg) { state.region = state.region === reg.dataset.region ? '' : reg.dataset.region; render(); return; }
  const vw = t.closest('[data-view]'); if (vw) { state.view = vw.dataset.view; animate = true; render(); return; }
  const chip = t.closest('.chip'); if (chip) { state.cat = chip.dataset.cat; render(); return; }
  const ex = t.closest('[data-export]'); if (ex) { doExport(ex.dataset.export); closeMenu(); return; }
  if (t.closest('#exportBtn')) { const pop = $('.menu-pop'); const show = pop.hidden; pop.hidden = !show; $('#exportBtn').setAttribute('aria-expanded', show); return; }
  if (!t.closest('.menu')) closeMenu();
  if (t.closest('#printBtn')) { buildPrint(); window.print(); return; }
  if (t.closest('#reset')) { Object.assign(state, { cat: '', region: '', channel: '', priority: false, pai: false, q: '' }); $('#q').value = ''; $('#region').value = ''; $('#priority').checked = false; $('#pai').checked = false; render(); return; }
  if (t.closest('#closeDrawer') || t === $('#drawer')) closeDrawer();
});
function closeMenu() { $('.menu-pop').hidden = true; $('#exportBtn').setAttribute('aria-expanded', false); }
document.addEventListener('change', e => {
  const t = e.target;
  if (t.matches('[data-status]')) { statuses[t.dataset.status] = t.value; store.set('negev-hub-status', statuses); toast('הסטטוס נשמר בדפדפן הזה'); }
  else if (t.id === 'region') { state.region = t.value; render(); }
  else if (t.id === 'channel') { state.channel = t.value; render(); }
  else if (t.id === 'priority') { state.priority = t.checked; render(); }
  else if (t.id === 'pai') { state.pai = t.checked; render(); }
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
(function init() {
  $('#nOrgs').textContent = DB.organizations.length;
  $('#nPeople').textContent = DB.people.length;
  $('#chips').innerHTML = [['', 'הכול'], ...CATS.map(c => [c, c])].map(([v, l]) => `<button class="chip" data-cat="${esc(v)}" aria-pressed="${v === ''}">${esc(l)}</button>`).join('');
  render();
  const h = location.hash.slice(1); if (h.includes(':')) openItem(h, false);
})();

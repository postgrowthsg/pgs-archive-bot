/**
 * Postgrowth SG archive bot (@pgs_archive_bot)
 *
 * Anyone can send the bot a link: they tap a type and up to two themes, and it's added to the
 * Entries tab of this Sheet. A person's first link waits for a core-team (admin) tap; after that
 * their links go straight in. Admins also get a ping for every link, and can add PDFs.
 * The website reads the Entries tab (rows with Status live). No AI anywhere.
 * Spec: personal/cluster-archive/BOT-SPEC.md (v0.3)
 *
 * Setup (once): add BOT_TOKEN (and SHEET_ID, if this isn't opened from the Sheet) in Project Settings → Script Properties, then run setup().
 */

const TZ = 'Asia/Singapore';
const STAY_AWAKE_MS = 3 * 60 * 1000;   // after a message, keep listening this long
const MAX_RUN_MS = 5 * 60 * 1000;      // Apps Script runs are capped at 6 minutes
const PDF_FOLDER_NAME = 'PGS Archive PDFs';

const TABS = {
  entries: { name: 'Entries', headers: ['ID', 'Status', 'Title', 'Link', 'Type', 'Theme 1', 'Theme 2', 'Location', 'Date', 'Authors', 'Description', 'Shared by', 'Date added', 'Archive link'] },
  themes: { name: 'Themes', headers: ['Theme', 'Description', 'Date added'] },
  types: { name: 'Types', headers: ['Type', 'Dot shape'] },
  private: { name: 'Private', headers: ['ID', 'Shared by', 'OK to credit', 'Added by', 'Telegram message', 'Notes'] },
  // Not published: only the core team sees these two tabs.
  summaries: { name: 'Summaries', headers: ['ID', 'Date added', 'Title', 'Link', 'Theme 1', 'One-liner', 'Summary', 'Shared by', 'Used?', 'Used in'] },
  users: { name: 'Users', headers: ['Telegram ID', 'Name', 'Username', 'Status', 'First seen', 'Day', 'Shares today', 'New themes today'] },
};
// Where a resource is about: one region, or blank. The same list is the dropdown in the Sheet (LocationSetup.gs) and drives the site's Singapore & Asia lens.
const LOCATIONS = ['Singapore', 'Southeast Asia', 'East Asia', 'South Asia', 'Central Asia', 'West Asia', 'Europe', 'Africa', 'Oceania', 'North America', 'South America'];
const E = {}; TABS.entries.headers.forEach((h, i) => { E[h] = i + 1; });
const U = {}; TABS.users.headers.forEach((h, i) => { U[h] = i + 1; });

// Limits for people who aren't on the core team
const MAX_SHARES_PER_DAY = 5;
const MAX_NEW_THEMES_PER_DAY = 2;
const MAX_LINE = 200;        // the public one-liner
const MAX_SUMMARY = 1500;    // the private summary
const MAX_THEME = 30;
// Why the bot can be slow, said the same way everywhere. (It wakes once a minute, then stays awake and quick for ~3 minutes.)
const SLOW_REASON = 'I’m a small bot on a free setup with no paid server, so I only check for new messages about once a minute.';
const SLOW_WAIT = 'After you send something, please wait up to a minute for my reply, and don’t send it twice. Once we’re chatting I’m quicker.';
// Short links hide where they go. (youtu.be, pca.st and similar are fine: they name a real site.)
const SHORTENERS = ['bit.ly', 'bitly.com', 't.co', 'tinyurl.com', 'goo.gl', 'ow.ly', 'is.gd', 'buff.ly', 'rebrand.ly', 'cutt.ly', 'shorturl.at',
  'tiny.cc', 'lnkd.in', 'fb.me', 'wp.me', 'rb.gy', 't.ly', 's.id', 'amzn.to', 'dlvr.it', 'ift.tt', 'trib.al', 'v.gd', 'qr.ae'];

const TYPES = [
  ['research', 'square'], ['book', 'triangle'], ['article', 'circle'], ['podcast', 'diamond'],
  ['video', 'star'], ['community resource', 'three-armed'], ['post', 'cross'], ['zine / own writing', '(to choose)'],
];
const STARTER_THEMES = [
  'Degrowth basics', 'Climate & planet', 'Systems & policy', 'Wellbeing', 'Critiques & debates',
  'Singapore & SEA', 'Asia', 'Work & everyday life', 'Measuring progress', 'Technology',
];

// The 25 links from the old postgrowthsg.wordpress.com Resources page, tagged as a first pass.
// Added once by setup() when the archive is empty. Prune them in the Sheet (set Status to hidden, or delete the row).
// [title, link, type, theme 1, theme 2, date, description]
const STARTER_ITEMS = [["Nathalie Roy on degrowth","https://www.linkedin.com/posts/nathalieroy7_sustainability-degrowth-postgrowth-activity-7145729407792431104-ZEvQ","post","Degrowth basics","","2023-12","A LinkedIn post introducing degrowth and post-growth ideas."],["On economic growth (Vaclav Smil interview)","https://www.theguardian.com/books/2019/sep/21/vaclav-smil-interview-growth-must-end-economists","article","Climate & planet","Degrowth basics","2019-09","The Guardian interviews energy scientist Vaclav Smil, who argues growth must end on a finite planet."],["Who still cares about GDP?","https://www.straitstimes.com/asia/who-still-cares-about-gdp-daily-star-contributor","article","Measuring progress","Asia","","A Daily Star contributor, republished in The Straits Times, questions GDP as the measure of progress."],["How entropy leads us to degrowth","https://en.aterraeredonda.com.br/como-a-entropia-nos-leva-ao-decrescimento/","article","Climate & planet","Degrowth basics","","An essay from A Terra é Redonda linking the physics of entropy to the case for degrowth."],["Post-growth: the science of wellbeing within planetary boundaries","https://www.thelancet.com/journals/lanplh/article/PIIS2542-5196(24)00310-3/fulltext","research","Wellbeing","Climate & planet","2024","A review in The Lancet Planetary Health of research on meeting human needs within planetary limits without relying on growth."],["Degrowth economy: the climate solution no one is talking about","https://illuminem.com/energyvoices/cec60ef9-32e5-47be-b914-76cd62cf17ac","article","Climate & planet","","","An Illuminem piece arguing degrowth belongs in the climate debate."],["How to talk about a wellbeing economy","https://youtu.be/MDiGNA5hf1M","video","Wellbeing","Systems & policy","","A short video on framing and communicating a wellbeing economy."],["Life in a ‘degrowth’ economy, and why you might actually enjoy it","https://theconversation.com/life-in-a-degrowth-economy-and-why-you-might-actually-enjoy-it-32224","article","Work & everyday life","Wellbeing","2014","The Conversation on what daily life might feel like in a degrowth economy."],["Less is More (book review)","https://newrepublic.com/article/160692/less-is-more-degrowth-climate-change-book-review","article","Critiques & debates","Climate & planet","2021","The New Republic reviews Jason Hickel’s Less is More and its argument linking degrowth and climate."],["A (friendly) critique of the degrowth movement","https://medium.com/postgrowth/a-friendly-critique-of-the-degrowth-movement-f0bd2297072d","article","Critiques & debates","","","A sympathetic critique of degrowth from the Post Growth publication on Medium."],["‘Degrowth’ economics may be inevitable","https://www.straitstimes.com/opinion/degrowth-economics-may-be-inevitable","article","Degrowth basics","","2023","An opinion piece in The Straits Times, first published in The Conversation, arguing slower growth may be unavoidable."],["Steps towards a post-work, post-growth library economy","https://medium.com/postgrowth/steps-towards-establishing-a-post-work-post-growth-library-economy-1a555dbcda21","article","Work & everyday life","Systems & policy","","Proposes an economy built around sharing, libraries of things and less paid work."],["Degrowing China? By collapse, redistribution or planning","https://monthlyreview.org/2023/07/01/degrowing-china-by-collapse-redistribution-or-planning/","research","Asia","Systems & policy","2023-07","Monthly Review asks how, and whether, China could degrow."],["A Post Growth Deal (EU)","https://www.realpostgrowth.eu/","community resource","Systems & policy","","","Campaign site for a post-growth deal in the European Union."],["Next System Project comparative framework","https://thenextsystem.org/next-system-project-comparative-framework","research","Systems & policy","Critiques & debates","","A framework for comparing proposals for a different economic system."],["Post-growth YouTube playlist","https://www.youtube.com/playlist?list=PL-AYdLMsG8plcg1Bapamlmr4876cXdQvO","video","Degrowth basics","","","A playlist of talks and explainers on post-growth."],["Another Garden City is Possible: a plan for a post-carbon Singapore","https://share.libbyapp.com/title/5614683","book","Singapore & SEA","Climate & planet","2020","Bertrand Seah’s chapter in Eating Chilli Crab in the Anthropocene (ed. Schneider-Mayerson). On Libby."],["The Future is Degrowth","https://share.libbyapp.com/title/9046457","book","Degrowth basics","Systems & policy","2022","Schmelzer, Vansintjan and Vetter’s guide to a world beyond capitalism. On Libby."],["Less is More: How Degrowth Will Save the World","https://share.libbyapp.com/title/5651750","book","Degrowth basics","Climate & planet","2020","Jason Hickel’s widely read case for degrowth. On Libby."],["Post Growth: Life after Capitalism","https://catalogue.nlb.gov.sg/search/card?id=419a1dbc-989f-584a-946a-1b13fd253088&entityType=FormatGroup","book","Wellbeing","Degrowth basics","2021","Tim Jackson on prosperity after growth. In the NLB catalogue."],["Exploring degrowth in Singapore","https://open.spotify.com/episode/5YIFDTs1lWL5XKrkQygfMf","podcast","Singapore & SEA","","","A podcast episode on what degrowth could mean for Singapore."],["Why some economists think abandoning growth could save the planet","https://theconversation.com/degrowth-why-some-economists-think-abandoning-growth-is-the-only-way-to-save-the-planet-podcast-170748","podcast","Degrowth basics","Climate & planet","2021","The Conversation’s podcast on the economics of degrowth."],["How degrowth will reshape technology, with Jason Hickel","https://pca.st/episode/9fbd1ec0-cc4d-4b4f-872a-c08e37787dc4","podcast","Technology","","","Jason Hickel on what degrowth means for technology."],["Degrowth Singapore Facebook group","https://www.facebook.com/groups/3844872028890880/","community resource","Singapore & SEA","","","A Facebook group for degrowth conversations in Singapore."],["Database of degrowth resources","https://explore.degrowth.net/the-degrowth-database/","community resource","Degrowth basics","","","A searchable database of degrowth resources from explore.degrowth.net."]];

const props = PropertiesService.getScriptProperties();

// ---------- Setup ----------

/** Run once from the editor after adding BOT_TOKEN. Safe to rerun. */
function setup() {
  if (!props.getProperty('BOT_TOKEN')) throw new Error('Add BOT_TOKEN in Project Settings → Script Properties first.');
  // Works whether the script is opened from the Sheet or is a standalone project: for the second, add SHEET_ID
  // (the long code in the Sheet's address, between /d/ and /edit) in Script Properties first.
  const ss = props.getProperty('SHEET_ID') ? SpreadsheetApp.openById(props.getProperty('SHEET_ID')) : SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) throw new Error('Add SHEET_ID in Project Settings → Script Properties first (the code in the Sheet’s address, between /d/ and /edit).');
  props.setProperty('SHEET_ID', ss.getId());
  Object.keys(TABS).forEach(k => tab(k));   // creates any missing tab, including Summaries and Users
  // Keep dates as typed text ("2021", "2014-10"), so Sheets doesn't turn them into full dates
  const entries = ss.getSheetByName(TABS.entries.name);
  entries.getRange(1, E.Date, entries.getMaxRows(), 1).setNumberFormat('@');
  entries.getRange(1, E['Date added'], entries.getMaxRows(), 1).setNumberFormat('@');
  if (!props.getProperty('NEXT_ID')) props.setProperty('NEXT_ID', '1');
  if (entries.getLastRow() < 2) importStarter();

  const themes = ss.getSheetByName(TABS.themes.name);
  if (themes.getLastRow() < 2) STARTER_THEMES.forEach(n => themes.appendRow([n, '', today()]));
  const types = ss.getSheetByName(TABS.types.name);
  if (types.getLastRow() < 2) TYPES.forEach(r => types.appendRow(r));
  const first = ss.getSheets()[0];
  if (first.getName() === 'Sheet1' && first.getLastRow() === 0) ss.deleteSheet(first);

  if (!props.getProperty('PDF_FOLDER_ID')) {
    const folder = DriveApp.createFolder(PDF_FOLDER_NAME);
    folder.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    props.setProperty('PDF_FOLDER_ID', folder.getId());
  }

  tg('deleteWebhook', {});
  tg('setMyCommands', { commands: [   // what everyone sees
    { command: 'start', description: 'How this works' },
    { command: 'about', description: 'What the archive holds' },
    { command: 'cancel', description: 'Stop what you’re adding' },
  ] });
  Object.keys(admins()).forEach(setAdminCommands);   // the core team sees more
  setBotProfile();                                    // the text above the Start button

  ScriptApp.getProjectTriggers().forEach(t => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('checkMessages').timeBased().everyMinutes(1).create();
  ScriptApp.newTrigger('archiveLinks').timeBased().everyHours(1).create();
  console.log('Done. PDFs folder: ' + DriveApp.getFolderById(props.getProperty('PDF_FOLDER_ID')).getUrl());
  console.log('Now open @pgs_archive_bot in Telegram and send /start. The first person to do so becomes the owner.');
}

// ---------- Polling (same approach as the Thoughts bot) ----------

function checkMessages() {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(1000)) return;
  try {
    const start = Date.now();
    let lastActivity = 0;
    do {
      const timeout = lastActivity ? 10 : 0;
      const offset = Number(props.getProperty('UPDATE_OFFSET') || 0);
      const updates = tg('getUpdates', { offset, timeout, allowed_updates: ['message', 'callback_query'] }) || [];
      updates.forEach(u => {
        props.setProperty('UPDATE_OFFSET', String(u.update_id + 1));
        try { handleUpdate(u); } catch (err) { console.error(err); notifyError(u, err); }
      });
      if (updates.length) lastActivity = Date.now();
    } while (lastActivity && Date.now() - lastActivity < STAY_AWAKE_MS && Date.now() - start < MAX_RUN_MS);
  } finally {
    lock.releaseLock();
  }
}

function notifyError(u, err) {
  const chat = u.message ? u.message.chat : u.callback_query ? u.callback_query.message.chat : null;
  if (!chat) return;
  if (isAdmin(chat.id)) send(chat.id, '⚠️ Something went wrong: ' + escapeHtml(String(err.message || err)).slice(0, 300));
  else send(chat.id, 'Sorry, something went wrong on my side. Please try again in a minute.');
}

// ---------- Admins ----------

function admins() { return JSON.parse(props.getProperty('ADMINS') || '{}'); }
function isAdmin(chatId) { return Object.prototype.hasOwnProperty.call(admins(), String(chatId)); }
function adminName(chatId) { return admins()[String(chatId)] || ''; }
function nameOf(from) { return [from.first_name, from.last_name].filter(Boolean).join(' ') || from.username || 'admin'; }

function handleUpdate(u) {
  const msg = u.message;
  const tap = u.callback_query;
  const chat = msg ? msg.chat : tap ? tap.message.chat : null;
  if (!chat || chat.type !== 'private') return;
  const from = msg ? msg.from : tap.from;

  const list = admins();
  if (!Object.keys(list).length && msg) {               // first person becomes the owner
    list[String(chat.id)] = nameOf(msg.from);
    props.setProperty('ADMINS', JSON.stringify(list));
    setAdminCommands(chat.id);
    send(chat.id, 'Hello! You’re the first admin of the Postgrowth archive.\n\n' + HELP);
    return;
  }
  if (isAdmin(chat.id)) return tap ? handleTap(tap, null) : handleMessage(msg, null);

  // Anyone else is a member: they can share links. Blocked people get no reply.
  if (msg && acceptInvite(msg)) return;
  const member = touchUser(from, chat.id);
  if (member.status === 'blocked') return;
  return tap ? handleTap(tap, member) : handleMessage(msg, member);
}

function acceptInvite(msg) {
  const code = props.getProperty('INVITE_CODE');
  const text = (msg.text || '').trim();
  if (!code || text !== '/start ' + code) return false;
  props.deleteProperty('INVITE_CODE');
  const list = admins();
  list[String(msg.chat.id)] = nameOf(msg.from);
  props.setProperty('ADMINS', JSON.stringify(list));
  setAdminCommands(msg.chat.id);
  send(msg.chat.id, 'Welcome! You’re now an admin of the Postgrowth archive.\n\n' + HELP);
  Object.keys(list).filter(id => id !== String(msg.chat.id)).forEach(id => send(id, `🔗 ${escapeHtml(nameOf(msg.from))} is now an archive admin.`));
  return true;
}

const HELP = [
  '<b>Add something:</b> forward or paste a message with a link, or send a PDF (only admins can add PDFs). I’ll read the page, then you tap a type and up to two themes, and tap <b>Done</b>. Your own links go live on the site within a few minutes, with no approval and no ping.',
  '',
  '<b>When someone else shares a link</b> you all get a ping. Their first link is held back (it isn’t on the site) until one of you taps <b>Approve</b>, <b>Reject</b> or <b>Block</b>. The first tap decides, and they’re told the result. After an approval their links go live straight away, each with a <b>Hide</b> button on the ping. If something shouldn’t be there, tap Hide, or /block the person. People can share up to ' + MAX_SHARES_PER_DAY + ' links a day.',
  '',
  '<b>What people are told:</b> the link, title, theme and one-liner are public; a longer summary stays with you; their name only shows if they say it’s OK; and you can see who sent what.',
  '',
  '/recent: the last 10 items with their status (live, pending, hidden or rejected), to edit or hide',
  '/hide PGS-0004 · /show PGS-0004: take an item off the site or put it back',
  '/block 123456789 · /unblock 123456789: stop or allow a person (the number is in the ping)',
  '/invite: a one-time link to add another admin',
  '/about: what the archive holds (the same text members see)',
  '/cancel: stop what you’re adding',
  '',
  'Private summaries are in the Summaries tab of the Sheet. Bigger changes: edit the Sheet directly.',
  '',
  '<b>Why I can be slow:</b> ' + SLOW_REASON + ' Once you’re chatting I’m quicker.',
].join('\n');

const ABOUT = [
  'Complex, systemic challenges need ways of knowing that can meet that complexity, so the archive holds many forms and levels of formality:',
  '',
  '<b>Research:</b> journal articles, theses, academic reports',
  '<b>Article:</b> opinion pieces, news and magazine articles, essays',
  '<b>Community resource:</b> guides, toolkits, databases and reports made by a group or movement',
  '<b>Zine / own writing:</b> independently published work, including members’ own',
  '<b>Book:</b> full-length books and chapters',
  '<b>Podcast:</b> audio series and episodes',
  '<b>Video:</b> talks, documentaries, explainers',
  '<b>Post:</b> single posts on social media or blogs',
  '',
  '<b>Resource or effort?</b> If you can read or watch it, it’s a resource, and you can send it to me. If you can join, support or follow it, it’s an effort (a group, campaign or initiative). Efforts are added by the core team: to suggest one, message an organiser.',
  '',
  'More at postgrowthsg.github.io/about.html',
].join('\n');

const WELCOME = [
  'Hi! I help add links to the Postgrowth Singapore resource archive: a map of the articles, papers, books, podcasts and videos we’ve been reading about post-growth (postgrowthsg.github.io).',
  '',
  'To add something, send me a link (links only, no files). I’ll read the page, you pick a type and a theme, and you can add:',
  '• a one-liner on why it’s worth reading (optional, shown on the site)',
  '• a longer summary (optional, only the Postgrowth team sees it)',
  '',
  '<b>What’s public:</b> the link, its title, the theme and your one-liner. Your name is only shown if you say it’s OK. The team can see who sent what.',
  '',
  'Your first link is checked by someone on the team before it appears, and I’ll message you when it’s added. After that your links go straight in (up to ' + MAX_SHARES_PER_DAY + ' a day).',
  '',
  '<b>Please be patient:</b> ' + SLOW_REASON + ' ' + SLOW_WAIT,
  '',
  '/about explains what kinds of things the archive holds. /cancel stops what you’re adding.',
].join('\n');

const MEMBER_HELP = 'Send me a link (links only) and I’ll help you add it to the archive. You pick a type and a theme, and can add a one-liner (public) and a longer summary (only the team sees it).\n\n' + SLOW_REASON + ' ' + SLOW_WAIT + '\n\n/about explains what the archive holds. /cancel stops what you’re adding. /start explains what’s public and what happens to your first link.';

const ADMIN_COMMANDS = [
  { command: 'recent', description: 'The last 10 items, to edit or hide' },
  { command: 'hide', description: 'Take an item off the site, e.g. /hide PGS-0004' },
  { command: 'show', description: 'Put a hidden item back, e.g. /show PGS-0004' },
  { command: 'block', description: 'Stop a person sharing, e.g. /block 123456789' },
  { command: 'unblock', description: 'Allow a person again' },
  { command: 'invite', description: 'Get a link to add another admin' },
  { command: 'about', description: 'What the archive holds' },
  { command: 'cancel', description: 'Stop what you’re adding' },
  { command: 'help', description: 'How this works' },
];
const BOT_DESCRIPTION = [
  'Send me a link to add to the Postgrowth Singapore resource archive: articles, papers, books, podcasts and videos on post-growth.',
  '',
  'Please note: ' + SLOW_REASON + ' After you send something, please wait up to a minute for my reply, and don’t send it twice.',
  '',
  'Press Start to see what’s public and what happens to your first link.',
].join('\n');
const BOT_SHORT_DESCRIPTION = 'Share a link with the Postgrowth SG archive. I can take up to a minute to reply, so please wait.';

/** The text people see in the empty chat, before they press Start. Run once (setup() does this too). */
function setBotProfile() {
  tg('setMyDescription', { description: BOT_DESCRIPTION });
  tg('setMyShortDescription', { short_description: BOT_SHORT_DESCRIPTION });
}

function setAdminCommands(chatId) { tg('setMyCommands', { commands: ADMIN_COMMANDS, scope: { type: 'chat', chat_id: chatId } }); }

// ---------- Messages ----------

function handleMessage(msg, member) {
  const chatId = msg.chat.id;
  const text = (msg.text || msg.caption || '').trim();
  const cmd = text.startsWith('/') ? text.split(/\s+/)[0].toLowerCase().replace(/@.*$/, '') : '';
  const draft = getDraft(chatId);

  if (cmd === '/start') return send(chatId, member ? WELCOME : HELP);
  if (cmd === '/help') return send(chatId, member ? MEMBER_HELP : HELP);
  if (cmd === '/cancel') { clearDraft(chatId); return send(chatId, 'Cancelled. Nothing was saved.'); }
  if (cmd === '/about') return send(chatId, ABOUT);
  if (member) {
    if (cmd) return send(chatId, 'Send me a link and I’ll help you add it to the archive. /help for more.');
  } else {
    if (cmd === '/invite') return sendInvite(chatId);
    if (cmd === '/recent') return sendRecent(chatId);
    if (cmd === '/hide' || cmd === '/show') return setStatus(chatId, text.split(/\s+/)[1], cmd === '/hide' ? 'hidden' : 'live');
    if (cmd === '/block' || cmd === '/unblock') return blockCommand(chatId, text.split(/\s+/)[1], cmd === '/block');
  }

  // Answering a question the bot asked. A forwarded link or PDF instead starts a new item.
  // (A one-liner, summary, description or theme name may contain a link, so those answers never start a new item.)
  const typedAnswers = ['desc', 'line', 'summary', 'newt1', 'newt2'];
  const newThing = msg.document || (draft && !typedAnswers.includes(draft.awaiting) && findUrl(msg));
  if (draft && draft.awaiting && !cmd && text && !newThing) return answerQuestion(chatId, draft, text, member);

  // A PDF
  const doc = msg.document;
  if (doc && (doc.mime_type === 'application/pdf' || /\.pdf$/i.test(doc.file_name || ''))) {
    if (member) return send(chatId, 'I can only take links for now. If it’s a PDF, send me a link to it, or ask someone on the team to add it.');
    return startFromPdf(msg, doc);
  }

  // A link
  const url = findUrl(msg);
  if (url) return startFromLink(msg, url, member);

  send(chatId, member ? 'Send me a link to something you’d like in the archive. /help for more.' : 'Send me a link or a PDF to add it to the archive. /help for more.');
}

function findUrl(msg) {
  const ents = (msg.entities || []).concat(msg.caption_entities || []);
  const src = msg.text || msg.caption || '';
  for (const e of ents) {
    if (e.type === 'text_link' && e.url) return e.url;
    if (e.type === 'url') return src.substr(e.offset, e.length);
  }
  const m = src.match(/https?:\/\/[^\s<>"]+/) || src.match(/\b(?:www\.)?[a-z0-9-]+(?:\.[a-z0-9-]+)*\.[a-z]{2,}\/[^\s<>"]*/i);
  return m ? m[0].replace(/[.,;:!?)\]]+$/, '') : null;
}

function startFromLink(msg, rawUrl, member) {
  const chatId = msg.chat.id;
  const url = /^https?:\/\//i.test(rawUrl) ? rawUrl : 'https://' + rawUrl;
  if (member) {                                         // checks for people outside the core team
    const problem = linkProblem(url) || memberGate(member);
    if (problem) return send(chatId, problem);
  }
  const dup = findByLink(url);
  if (dup && member) {
    return send(chatId, dup.status === 'pending' ? 'Thanks! That link is already waiting for the team to look at it.'
      : dup.status === 'rejected' ? 'Thanks! The team has already looked at that link.'
      : `Thanks! That one is already in the archive (${dup.id}).`);
  }
  const meta = readPage(url);
  const draft = {
    link: url, title: (meta.title || '').slice(0, 300), authors: meta.authors || '', date: meta.date || '', desc: meta.desc || '', pageDesc: meta.desc || '',
    type: '', t1: '', t2: '', loc: '', sharedBy: '', okCredit: '', msgRef: `${chatId}:${msg.message_id}`,
    awaiting: '', step: 'type', themes: themeNames(), dupOf: dup ? dup.id : '',
    member: !!member, line: '', summary: '', newThemes: [],
  };
  saveDraft(chatId, draft);
  if (!draft.title) { draft.awaiting = 'title'; saveDraft(chatId, draft); }
  showCard(chatId, draft, true);
  if (!draft.title) send(chatId, 'I couldn’t read a title from that page. What should it be called? (Type it, or /cancel.)');
}

function startFromPdf(msg, doc) {
  const chatId = msg.chat.id;
  if (doc.file_size && doc.file_size > 20 * 1024 * 1024) return send(chatId, 'That PDF is over 20 MB, which Telegram won’t let bots download. Upload it to the “PGS Archive PDFs” Drive folder yourself, then send me its link.');
  const file = tg('getFile', { file_id: doc.file_id });
  if (!file || !file.file_path) return send(chatId, 'I couldn’t download that PDF. Try again, or send a link instead.');
  const blob = UrlFetchApp.fetch(`https://api.telegram.org/file/bot${props.getProperty('BOT_TOKEN')}/${file.file_path}`).getBlob()
    .setName(doc.file_name || 'resource.pdf');
  const saved = DriveApp.getFolderById(props.getProperty('PDF_FOLDER_ID')).createFile(blob);
  const title = (msg.caption || '').trim() || (doc.file_name || '').replace(/\.pdf$/i, '').replace(/[_-]+/g, ' ').trim();
  const draft = {
    link: saved.getUrl(), title, authors: '', date: '', desc: '', type: 'research', t1: '', t2: '', loc: '',
    sharedBy: '', okCredit: '', msgRef: `${chatId}:${msg.message_id}`, awaiting: '', step: 'type', themes: themeNames(), pdf: true, dupOf: '',
  };
  saveDraft(chatId, draft);
  showCard(chatId, draft, true);
}

/** Reads title, authors, date and description from the page. No AI: just the page's own tags. */
function readPage(url) {
  const out = {};
  try {
    const res = UrlFetchApp.fetch(url, { muteHttpExceptions: true, followRedirects: true, headers: { 'User-Agent': 'Mozilla/5.0 (compatible; PGSArchiveBot/1.0)' } });
    if (res.getResponseCode() >= 400) return out;
    const type = String(res.getHeaders()['Content-Type'] || res.getHeaders()['content-type'] || '');
    if (!/html/i.test(type)) return out;
    const html = res.getContentText().slice(0, 400000);
    const metas = {};
    (html.match(/<meta\b[^>]*>/gi) || []).forEach(tag => {
      const key = ((tag.match(/\b(?:name|property)\s*=\s*["']([^"']+)["']/i) || [])[1] || '').toLowerCase();
      const val = (tag.match(/\bcontent\s*=\s*"([^"]*)"/i) || tag.match(/\bcontent\s*=\s*'([^']*)'/i) || [])[1];
      if (key && val) (metas[key] = metas[key] || []).push(decode(val));
    });
    const first = k => (metas[k] || [])[0];
    const titleTag = (html.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1];
    out.title = clean(first('citation_title') || first('og:title') || first('twitter:title') || (titleTag && decode(titleTag)) || '');
    const authors = metas['citation_author'] || metas['dc.creator'] || metas['author'] || [];
    out.authors = clean(authors.slice(0, 6).join('; ') + (authors.length > 6 ? ' et al.' : ''));
    const d = first('citation_publication_date') || first('citation_date') || first('citation_online_date') || first('article:published_time') || first('dc.date') || '';
    const ym = d.match(/(\d{4})[\/-](\d{1,2})/) || d.match(/(\d{4})/);
    out.date = ym ? (ym[2] ? `${ym[1]}-${('0' + ym[2]).slice(-2)}` : ym[1]) : '';
    out.desc = clean(first('og:description') || first('description') || first('twitter:description') || '').slice(0, 400);
  } catch (err) { console.warn('readPage', url, err); }
  return out;
}

function decode(s) {
  return String(s).replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n)).replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)))
    .replace(/&quot;/g, '"').replace(/&#039;|&apos;/g, '’').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ');
}
function clean(s) { return String(s || '').replace(/\s+/g, ' ').trim(); }

// ---------- The card ----------

function cardText(d) {
  const lines = [];
  if (d.editing) lines.push(`✏️ <b>Editing ${d.editing}</b>`);
  if (d.dupOf && !d.editing) lines.push(`⚠️ This link is already in the archive as <b>${d.dupOf}</b>. You can still add it, or /cancel.`);
  lines.push(`<b>${escapeHtml(d.title || '(no title yet)')}</b>`);
  if (d.authors) lines.push(escapeHtml(d.authors));
  const bits = [d.type, d.date, d.pdf ? 'PDF on Drive' : ''].filter(Boolean);
  if (bits.length) lines.push(escapeHtml(bits.join(' · ')));
  const themes = [d.t1, d.t2].filter(Boolean);
  if (themes.length) lines.push('Themes: ' + escapeHtml(themes.join(' + ')));
  if (d.loc) lines.push('Location: ' + escapeHtml(d.loc));
  if (d.desc) lines.push('\n' + escapeHtml(d.desc.length > 300 ? d.desc.slice(0, 297) + '…' : d.desc));
  if (d.summary) lines.push('\n📝 <i>Private summary</i> (' + d.summary.length + ' characters, only the team sees it)');
  if (d.sharedBy) lines.push(`\nShared by ${escapeHtml(d.sharedBy)}${d.okCredit === 'yes' ? ' (credited on the site)' : d.okCredit === 'no' ? ' (not credited)' : ''}`);
  lines.push('');
  lines.push({ type: 'What kind of resource is it?' + (d.member ? '\n\n<i>I answer quickly while we’re chatting. If I’ve gone quiet for a few minutes, please give me up to a minute.</i>' : ''), t1: 'Pick its main theme.', t2: 'A second theme? (optional)', loc: 'Where is it about? <i>Optional.</i> Pick one region, or tap <b>Skip</b> if it isn’t about a particular place.',
    line: `In a line, why is this worth reading? <i>Optional.</i> It shows on the site. Type it, or tap <b>Skip</b>. (Up to ${MAX_LINE} characters.)`,
    summary: `Want to add a few lines on what it says? <i>Optional.</i> Only the Postgrowth team sees this. Type it, or tap <b>Skip</b>.`,
    review: 'Anything to add? Then tap <b>Done</b>.', credit: `OK to credit ${escapeHtml(d.sharedBy)} on the site?` }[d.step] || '');
  return lines.join('\n');
}

function cardButtons(d) {
  const rows = (items, per) => { const out = []; for (let i = 0; i < items.length; i += per) out.push(items.slice(i, i + per)); return out; };
  const b = (text, data) => ({ text, callback_data: data });
  if (d.step === 'type') return rows(TYPES.map((t, i) => b(t[0], 'ty:' + i)), 2).concat([[b('✖️ Cancel', 'x')]]);
  if (d.step === 't1' || d.step === 't2') {
    const list = d.themes.map((t, i) => (d.step === 't2' && t === d.t1) ? null : b(t, d.step + ':' + i)).filter(Boolean);
    const extra = [b('➕ New theme', d.step + ':new')];
    if (d.step === 't2') extra.push(b('Skip', 't2:skip'));
    return rows(list, 2).concat([extra, [b('← Back', 'back')]]);
  }
  if (d.step === 'loc') return rows(LOCATIONS.map((n, i) => b(n, 'lo:' + i)), 2).concat([[b('Skip', 'lo:skip')], [b('← Back', 'back')]]);
  if (d.step === 'credit') return [[b('Yes, credit them', 'cr:yes'), b('No', 'cr:no')]];
  if (d.step === 'line' || d.step === 'summary') return [[b('Skip', 'sk:' + d.step)], [b('← Back', 'back')]];
  if (d.member) return [
    [b('💬 One-liner', 'ed:line'), b('📝 Summary', 'ed:summary')],
    [b('✏️ Title', 'ed:title'), b('🙋 Shared by', 'ed:shared')],
    [b('📍 Location', 'ed:loc'), b('← Themes', 'back')],
    [b('✅ Done', 'done'), b('✖️ Cancel', 'x')],
  ];
  return [
    [b('✏️ Title', 'ed:title'), b('📝 Description', 'ed:desc')],
    [b('🙋 Shared by', 'ed:shared'), b('📍 Location', 'ed:loc')],
    [b('📅 Date / authors', 'ed:date'), b('🧾 Private summary', 'ed:summary')],
    [b('← Themes', 'back')],
    [b('✅ Done', 'done'), b('✖️ Cancel', 'x')],
  ];
}

/** Sends a new card, or updates the existing one in place. */
function showCard(chatId, d, fresh) {
  const payload = { chat_id: chatId, text: cardText(d), parse_mode: 'HTML', link_preview_options: { is_disabled: true }, reply_markup: { inline_keyboard: cardButtons(d) } };
  if (!fresh && d.cardId) {
    payload.message_id = d.cardId;
    const r = tg('editMessageText', payload);
    if (r) return;
  }
  const sent = tg('sendMessage', payload);
  if (sent) { d.cardId = sent.message_id; saveDraft(chatId, d); }
}

function handleTap(tap, member) {
  const chatId = tap.message.chat.id;
  const data = tap.data || '';
  tg('answerCallbackQuery', { callback_query_id: tap.id });

  if (/^(hide|show|edit|ap|rj|bk|ph|pw):/.test(data)) {   // buttons for the core team only
    if (member) return;
    if (data.startsWith('hide:') || data.startsWith('show:')) return setStatus(chatId, data.slice(5), data.startsWith('hide:') ? 'hidden' : 'live');
    if (data.startsWith('edit:')) return startEdit(chatId, data.slice(5));
    if (/^(ap|rj|bk):/.test(data)) return decide(chatId, tap, data.slice(0, 2), data.slice(3));
    return pingVisibility(chatId, tap, data.slice(3), data.startsWith('pw:'));
  }

  const d = getDraft(chatId);
  if (!d || (d.cardId && d.cardId !== tap.message.message_id)) {
    return tg('editMessageReplyMarkup', { chat_id: chatId, message_id: tap.message.message_id, reply_markup: { inline_keyboard: [] } });
  }
  if (data === 'x') { clearDraft(chatId); return tg('editMessageText', { chat_id: chatId, message_id: d.cardId, text: 'Cancelled. Nothing was saved.' }); }
  if (data === 'back') { d.step = ['review', 't2', 'loc', 'line', 'summary'].includes(d.step) ? 't1' : 'type'; d.awaiting = ''; d.fromReview = false; saveDraft(chatId, d); return showCard(chatId, d); }

  if (data.startsWith('ty:')) { d.type = TYPES[+data.slice(3)][0]; d.step = d.t1 ? 'review' : 't1'; }
  else if (data.startsWith('t1:') || data.startsWith('t2:')) {
    const which = data.slice(0, 2), val = data.slice(3);
    if (val === 'new') { d.awaiting = 'new' + which; saveDraft(chatId, d); return send(chatId, 'Type the new theme’s name (a few words). It’ll be added to the Themes list.'); }
    if (val === 'skip') d.t2 = '';
    else d[which] = d.themes[+val];
    d.step = which === 't1' ? 't2' : (d.editing ? 'review' : 'loc');
    if (d.step === 'line') d.awaiting = 'line';
  }
  else if (data.startsWith('lo:')) {
    const v = data.slice(3);
    d.loc = v === 'skip' ? '' : (LOCATIONS[+v] || '');
    d.step = (d.editing || d.fromReview) ? 'review' : (d.member ? 'line' : 'review');
    d.fromReview = false;
    d.awaiting = d.step === 'line' ? 'line' : '';
  }
  else if (data === 'sk:line') { d.step = 'summary'; d.awaiting = 'summary'; }
  else if (data === 'sk:summary') { d.step = 'review'; d.awaiting = ''; }
  else if (data === 'ed:loc') { d.step = 'loc'; d.awaiting = ''; d.fromReview = true; }   // opened from the review card, so go back there
  else if (data.startsWith('ed:')) {
    const what = data.slice(3);
    d.awaiting = what;
    saveDraft(chatId, d);
    return send(chatId, {
      title: 'Type the title.',
      desc: 'Type a short description (2–3 lines, plain language), or “-” to clear it.',
      line: `Type your one-liner (up to ${MAX_LINE} characters), or “-” to clear it.`,
      summary: `Type your summary (up to ${MAX_SUMMARY} characters). Only the team sees it. “-” clears it.`,
      shared: 'Who shared it? (Name as it should appear.)',
      date: 'Type the year (or year-month like 2023-07), then optionally “;” and the authors. E.g. <code>2021; Jason Hickel</code>. Use “-” to clear.',
    }[what]);
  }
  else if (data.startsWith('cr:')) { d.okCredit = data.slice(3); d.step = 'review'; }
  else if (data === 'done') return finish(chatId, d, member);
  saveDraft(chatId, d);
  showCard(chatId, d);
}

function answerQuestion(chatId, d, text, member) {
  const v = text === '-' ? '' : text;
  const what = d.awaiting;
  d.awaiting = '';
  if (what === 'title') d.title = v || d.title;
  else if (what === 'desc') d.desc = v;
  else if (what === 'line') {
    const t = clean(plain(v));
    if (t.length > MAX_LINE) { d.awaiting = 'line'; saveDraft(chatId, d); return send(chatId, `That’s ${t.length} characters. Could you shorten it to ${MAX_LINE} or fewer and send it again?`); }
    d.line = t; d.desc = t || d.pageDesc || '';
    if (d.step === 'line') { d.step = 'summary'; d.awaiting = 'summary'; }
  }
  else if (what === 'summary') {
    const t = plain(v).replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
    if (t.length > MAX_SUMMARY) { d.awaiting = 'summary'; saveDraft(chatId, d); return send(chatId, `That’s ${t.length} characters. Could you shorten it to ${MAX_SUMMARY} or fewer and send it again?`); }
    d.summary = t;
    if (d.step === 'summary') d.step = 'review';
  }
  else if (what === 'date') {
    const [date, authors] = v.split(';').map(s => (s || '').trim());
    d.date = v ? date : ''; if (authors !== undefined) d.authors = authors;
  }
  else if (what === 'shared') { d.sharedBy = v; if (v) { d.step = 'credit'; } else d.okCredit = ''; }
  else if (what === 'newt1' || what === 'newt2') {
    const chk = checkThemeName(v);
    if (chk.error) { d.awaiting = what; saveDraft(chatId, d); return send(chatId, chk.error + ' Type another name, or /cancel.'); }
    const key = themeKey(chk.name);
    let theme = d.themes.find(t => themeKey(t) === key);
    if (!theme) {
      theme = chk.name.charAt(0).toUpperCase() + chk.name.slice(1);
      if (member) {                                      // added to the Themes list only once the link goes live
        if (member.newThemesToday + d.newThemes.length >= MAX_NEW_THEMES_PER_DAY) {
          d.awaiting = '';
          saveDraft(chatId, d);
          send(chatId, `You’ve added the most new themes allowed today (${MAX_NEW_THEMES_PER_DAY}). Please pick one of the existing themes.`);
          return showCard(chatId, d, true);
        }
        d.newThemes.push(theme);
      } else {
        theme = addTheme(chk.name);
      }
      d.themes.push(theme);
    }
    d[what.slice(3)] = theme;
    d.step = what === 'newt1' ? 't2' : (d.editing ? 'review' : 'loc');
    if (d.step === 'line') d.awaiting = 'line';
  }
  saveDraft(chatId, d);
  showCard(chatId, d, true);   // a fresh card below the typed answer, so it stays in view
}

// ---------- Saving ----------

function finish(chatId, d, member) {
  if (!d.title) { d.awaiting = 'title'; saveDraft(chatId, d); return send(chatId, 'It needs a title first. Type one.'); }
  if (!d.type || !d.t1) { d.step = !d.type ? 'type' : 't1'; saveDraft(chatId, d); return showCard(chatId, d); }
  const sheet = tab('entries');
  const credit = d.okCredit === 'yes' ? d.sharedBy : '';
  let confirm;
  if (d.editing) {
    const row = rowOf(d.editing);
    if (!row) return send(chatId, `Couldn’t find ${d.editing} in the Sheet any more.`);
    const keep = sheet.getRange(row, 1, 1, TABS.entries.headers.length).getValues()[0];
    const vals = [d.editing, keep[E.Status - 1], cell(clean(d.title)), d.link, d.type, cell(d.t1), cell(d.t2), cell(d.loc), cell(d.date), cell(d.authors), cell(d.desc), cell(credit),
      keep[E['Date added'] - 1], d.link === keep[E.Link - 1] ? keep[E['Archive link'] - 1] : ''];
    sheet.getRange(row, 1, 1, vals.length).setValues([vals]);
    if (d.sharedBy) tab('private').appendRow([d.editing, cell(d.sharedBy), d.okCredit, adminName(chatId), d.msgRef, 'edited']);
    if (d.summary) addSummary(d.editing, d, adminName(chatId));
    confirm = `✅ Updated: <b>${escapeHtml(d.title)}</b> (${d.editing})`;
  } else {
    const id = nextId();
    const live = !member || member.status === 'trusted';          // a person's first link waits for a team member
    sheet.appendRow([id, live ? 'live' : 'pending', cell(clean(d.title)), d.link, d.type, cell(d.t1), cell(d.t2), cell(d.loc), cell(d.date), cell(d.authors), cell(d.desc), cell(credit), today(), d.pdf ? '(PDF on Drive)' : '']);
    const by = member ? `${cell(member.name)}${member.username ? ' (@' + cell(member.username) + ')' : ''} [${member.id}]` : adminName(chatId);
    tab('private').appendRow([id, cell(d.sharedBy), d.okCredit, by, d.msgRef, member && !live ? 'first link: waiting for approval' : '']);
    if (d.summary) addSummary(id, d, d.sharedBy || (member ? member.name : adminName(chatId)));
    if (live) ensureThemes([d.t1, d.t2]);
    if (member) { recordShare(member, d.newThemes.length, live ? '' : 'pending'); pingTeam(id, d, member, !live); }
    d.savedId = id;
    confirm = live
      ? `✅ Added to the archive: <b>${escapeHtml(d.title)}</b> (${id})\n${escapeHtml([d.type, d.t1, d.t2].filter(Boolean).join(' · '))}${member ? '\nIt’ll be on the site within a few minutes. Thank you!' : ''}`
      : `⏳ Thanks! <b>${escapeHtml(d.title)}</b> is saved (${id}).\nA team member will look at your first link shortly. Once it’s added, your next links go straight in.`;
  }
  clearDraft(chatId);
  tg('editMessageText', { chat_id: chatId, message_id: d.cardId, parse_mode: 'HTML', link_preview_options: { is_disabled: true }, text: confirm });
}

function addSummary(id, d, by) {
  tab('summaries').appendRow([id, today(), cell(clean(d.title)), d.link, cell(d.t1), cell(d.line || ''), cell(d.summary), cell(by), '', '']);
}

/** Adds the old Resources page links (only if the archive is empty). */
function importStarter() {
  const sheet = tab('entries');
  if (sheet.getLastRow() > 1) { console.log('Entries already has rows, so the starter links were not added.'); return; }
  const rows = STARTER_ITEMS.map(([title, link, type, t1, t2, date, desc]) =>
    [nextId(), 'live', title, link, type, t1, t2, '', date, '', desc, '', today(), '']);
  sheet.getRange(2, 1, rows.length, rows[0].length).setValues(rows);
  console.log(`Added ${rows.length} links from the old Resources page.`);
}

function nextId() {
  const n = Number(props.getProperty('NEXT_ID') || '1');
  props.setProperty('NEXT_ID', String(n + 1));
  return 'PGS-' + ('000' + n).slice(-4);
}

function addTheme(name) {
  const t = name.charAt(0).toUpperCase() + name.slice(1);
  tab('themes').appendRow([t, '', today()]);
  return t;
}

function themeNames() {
  const sh = tab('themes');
  const n = sh.getLastRow() - 1;
  return n > 0 ? sh.getRange(2, 1, n, 1).getValues().map(r => clean(r[0])).filter(Boolean) : [];
}

// ---------- Fixing things ----------

function sendRecent(chatId) {
  const sh = tab('entries');
  const n = sh.getLastRow() - 1;
  if (n < 1) return send(chatId, 'Nothing in the archive yet. Send me a link to add the first one.');
  const rows = sh.getRange(Math.max(2, sh.getLastRow() - 9), 1, Math.min(10, n), TABS.entries.headers.length).getValues().reverse();
  const text = '<b>Latest 10</b>\n' + rows.map(r => `${r[0]}${r[1] !== 'live' ? ` (${r[1]})` : ''} · ${escapeHtml(String(r[2]).slice(0, 60))}`).join('\n');
  const kb = rows.map(r => [{ text: `✏️ ${r[0]}`, callback_data: 'edit:' + r[0] }, r[1] === 'hidden' ? { text: `↩️ Show ${r[0]}`, callback_data: 'show:' + r[0] } : { text: `🙈 Hide ${r[0]}`, callback_data: 'hide:' + r[0] }]);
  tg('sendMessage', { chat_id: chatId, text, parse_mode: 'HTML', reply_markup: { inline_keyboard: kb } });
}

function setStatus(chatId, rawId, status) {
  const id = normaliseId(rawId);
  if (!id) return send(chatId, `Which one? e.g. /${status === 'hidden' ? 'hide' : 'show'} PGS-0004`);
  const row = rowOf(id);
  if (!row) return send(chatId, `I can’t find ${escapeHtml(id)}.`);
  tab('entries').getRange(row, E.Status).setValue(status);
  send(chatId, status === 'hidden' ? `🙈 ${id} is hidden. It’ll leave the site within a few minutes. /show ${id} to bring it back.` : `↩️ ${id} is live again.`);
}

function startEdit(chatId, id) {
  const row = rowOf(id);
  if (!row) return send(chatId, `I can’t find ${escapeHtml(id)}.`);
  const r = tab('entries').getRange(row, 1, 1, TABS.entries.headers.length).getValues()[0];
  const date = r[E.Date - 1] instanceof Date ? Utilities.formatDate(r[E.Date - 1], TZ, 'yyyy') : String(r[E.Date - 1] || '');
  const d = { editing: id, title: r[E.Title - 1], link: r[E.Link - 1], type: r[E.Type - 1], t1: r[E['Theme 1'] - 1], t2: r[E['Theme 2'] - 1],
    loc: r[E.Location - 1], date, authors: r[E.Authors - 1], desc: r[E.Description - 1], sharedBy: r[E['Shared by'] - 1],
    okCredit: r[E['Shared by'] - 1] ? 'yes' : '', step: 'review', awaiting: '', themes: themeNames(), msgRef: '', dupOf: '' };
  saveDraft(chatId, d);
  showCard(chatId, d, true);
}

function normaliseId(raw) {
  const m = String(raw || '').match(/(\d+)/);
  return m ? 'PGS-' + ('000' + Number(m[1])).slice(-4) : '';
}

function rowOf(id) {
  const sh = tab('entries');
  const n = sh.getLastRow() - 1;
  if (n < 1) return 0;
  const ids = sh.getRange(2, 1, n, 1).getValues();
  const i = ids.findIndex(r => r[0] === id);
  return i < 0 ? 0 : i + 2;
}

/** Same link already in the archive? Ignores http/https, www, trailing slashes and tracking bits. */
function findByLink(url) {
  const key = linkKey(url);
  const sh = tab('entries');
  const n = sh.getLastRow() - 1;
  if (n < 1) return null;
  const rows = sh.getRange(2, 1, n, E.Link).getValues();
  const hit = rows.find(r => linkKey(r[E.Link - 1]) === key);
  return hit ? { id: hit[0], status: hit[E.Status - 1] } : null;
}
function linkKey(u) {
  return String(u || '').toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/[?&](utm_[^=&]+|si|fbclid|mibextid|igshid)=[^&]*/g, '').replace(/[?&]$/, '').replace(/\/+$/, '');
}

// ---------- Wayback snapshots (hourly) ----------

/** Asks the Internet Archive to save each new link, a few per run, and stores the snapshot address. */
function archiveLinks() {
  const sh = tab('entries');
  const n = sh.getLastRow() - 1;
  if (n < 1) return;
  const rows = sh.getRange(2, 1, n, TABS.entries.headers.length).getValues();
  let done = 0;
  for (let i = 0; i < rows.length && done < 5; i++) {
    const link = rows[i][E.Link - 1], arch = rows[i][E['Archive link'] - 1];
    if (!link || arch || rows[i][E.Status - 1] !== 'live') continue;   // only links that are on the site
    done++;
    try {
      const res = UrlFetchApp.fetch('https://web.archive.org/save/' + link, { muteHttpExceptions: true, followRedirects: false });
      const loc = res.getHeaders()['Location'] || res.getHeaders()['location'] || res.getHeaders()['Content-Location'] || '';
      const snap = loc ? (loc.startsWith('http') ? loc : 'https://web.archive.org' + loc) : 'https://web.archive.org/web/' + link;
      sh.getRange(i + 2, E['Archive link']).setValue(snap);
    } catch (err) {
      console.warn('archive', link, err);
    }
  }
}

// ---------- Drafts (one per admin, in Script Properties) ----------

function getDraft(chatId) { const s = props.getProperty('DRAFT_' + chatId); return s ? JSON.parse(s) : null; }
function saveDraft(chatId, d) { props.setProperty('DRAFT_' + chatId, JSON.stringify(d)); }
function clearDraft(chatId) { props.deleteProperty('DRAFT_' + chatId); }

// ---------- Invite ----------

function sendInvite(chatId) {
  const code = Utilities.getUuid().replace(/-/g, '').slice(0, 16);
  props.setProperty('INVITE_CODE', code);
  const me = tg('getMe', {});
  send(chatId, `Send this link to the new admin. It works once:\nhttps://t.me/${me.username}?start=${code}\n\nMaking a new link cancels this one.`);
}

// ---------- Helpers ----------

function tab(key) {
  const ss = SpreadsheetApp.openById(props.getProperty('SHEET_ID'));
  let sh = ss.getSheetByName(TABS[key].name);
  if (!sh) {                                            // first use: make the tab
    sh = ss.insertSheet(TABS[key].name);
    sh.appendRow(TABS[key].headers);
    sh.setFrozenRows(1);
    if (key === 'users') { sh.getRange(1, U['First seen'], sh.getMaxRows(), 1).setNumberFormat('@'); sh.getRange(1, U.Day, sh.getMaxRows(), 1).setNumberFormat('@'); }
  }
  return sh;
}
function today() { return Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd'); }

function send(chatId, text) {
  return tg('sendMessage', { chat_id: chatId, text, parse_mode: 'HTML', link_preview_options: { is_disabled: true } });
}

function tg(method, payload) {
  const res = UrlFetchApp.fetch(`https://api.telegram.org/bot${props.getProperty('BOT_TOKEN')}/${method}`, {
    method: 'post', contentType: 'application/json', payload: JSON.stringify(payload), muteHttpExceptions: true,
  });
  const body = JSON.parse(res.getContentText());
  if (!body.ok) console.error(method, body.description);
  return body.result;
}

function escapeHtml(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }


// ---------- People, limits and checks (open to anyone) ----------

/** Text from strangers: no HTML, and nothing that a spreadsheet would read as a formula. */
function plain(s) { return String(s == null ? '' : s).replace(/<[^>]*>/g, '').replace(/[<>]/g, ''); }
function cell(s) { return plain(s).replace(/^[\s=+\-@]+/, ''); }

function userRowNum(id) {
  const sh = tab('users');
  const n = sh.getLastRow() - 1;
  if (n < 1) return 0;
  const i = sh.getRange(2, 1, n, 1).getValues().findIndex(r => String(r[0]) === String(id));
  return i < 0 ? 0 : i + 2;
}

function readUser(row) {
  const r = tab('users').getRange(row, 1, 1, TABS.users.headers.length).getValues()[0];
  const day = r[U.Day - 1] instanceof Date ? Utilities.formatDate(r[U.Day - 1], TZ, 'yyyy-MM-dd') : String(r[U.Day - 1]);
  const sameDay = day === today();                       // the counts start again each day
  return { row, id: String(r[0]), name: String(r[1] || ''), username: String(r[2] || ''), status: String(r[U.Status - 1] || 'new'),
    sharesToday: sameDay ? Number(r[U['Shares today'] - 1]) || 0 : 0, newThemesToday: sameDay ? Number(r[U['New themes today'] - 1]) || 0 : 0 };
}

/** Finds the person in the Users tab, or adds them (status new). */
function touchUser(from, chatId) {
  let row = userRowNum(chatId);
  if (!row) {
    tab('users').appendRow([chatId, cell(nameOf(from)), cell(from.username || ''), 'new', today(), today(), 0, 0]);
    row = userRowNum(chatId);
  }
  return readUser(row);
}

function setUserStatus(id, status) {
  const row = userRowNum(id);
  if (row) tab('users').getRange(row, U.Status).setValue(status);
  return row;
}

function recordShare(member, newThemeCount, status) {
  tab('users').getRange(member.row, U.Day, 1, 3).setValues([[today(), member.sharesToday + 1, member.newThemesToday + newThemeCount]]);
  if (status) tab('users').getRange(member.row, U.Status).setValue(status);
}

function memberGate(member) {
  if (member.status === 'pending') return 'Thanks! Your first link is still waiting for someone on the team to look at it. Once it’s added, you can send the next one.';
  if (member.sharesToday >= MAX_SHARES_PER_DAY) return `You’ve reached today’s limit of ${MAX_SHARES_PER_DAY} links. Please send more tomorrow. Thank you!`;
  return '';
}

function linkProblem(url) {
  if (!/^https:\/\//i.test(url)) return 'I can only take secure (https) links. Could you send the https version?';
  const host = ((url.match(/^https:\/\/([^\/?#:]+)/i) || [])[1] || '').toLowerCase().replace(/^www\./, '');
  if (!host.includes('.') || /^[\d.]+$/.test(host) || host === 'localhost') return 'That doesn’t look like a link to a web page I can use.';
  if (SHORTENERS.includes(host)) return 'That’s a shortened link, so I can’t tell where it goes. Could you send the full link instead?';
  return '';
}

function themeKey(s) { return String(s).toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]+/g, ' ').trim().replace(/s$/, ''); }

function checkThemeName(raw) {
  const one = String(raw || '').trim();
  if (/[\r\n]/.test(one)) return { error: 'A theme name should be one short line.' };
  const name = clean(plain(one)).replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '');
  if (name.length < 2) return { error: 'That’s too short for a theme name.' };
  if (name.length > MAX_THEME) return { error: `Theme names are up to ${MAX_THEME} characters.` };
  if (/https?:|www\.|\.[a-z]{2,}\b|@/i.test(name)) return { error: 'A theme name can’t be a link or an address.' };
  if (/^[\d\s]+$/.test(name)) return { error: 'A theme name needs some words in it.' };
  return { name };
}

/** Adds any theme that isn't in the Themes tab yet (used when a link goes live). */
function ensureThemes(names) {
  const have = themeNames().map(themeKey);
  names.filter(Boolean).forEach(n => { if (!have.includes(themeKey(n))) { addTheme(n); have.push(themeKey(n)); } });
}

function blockCommand(chatId, raw, block) {
  const id = String(raw || '').replace(/\D/g, '');
  if (!id) return send(chatId, `Which person? e.g. /${block ? 'block' : 'unblock'} 123456789 (the number is in the ping).`);
  if (isAdmin(id)) return send(chatId, 'That’s one of the admins.');
  if (!setUserStatus(id, block ? 'blocked' : 'new')) return send(chatId, 'I haven’t seen that number.');
  send(chatId, block ? `🚫 ${id} is blocked. They get no replies. /unblock ${id} to allow them again.` : `✅ ${id} can share links again (their next link will be checked first).`);
}

// ---------- Pings for the core team ----------

function pingText(id, d, member, pending) {
  const who = escapeHtml(member.name) + (member.username ? ' (@' + escapeHtml(member.username) + ')' : '') + ` · ${member.id}`;
  const lines = [pending ? `🆕 <b>First link, needs a decision</b>\nfrom ${who}` : `🔗 <b>New link</b>\nfrom ${who}`, '',
    `<b>${escapeHtml(d.title)}</b> (${id})`, escapeHtml(d.link), escapeHtml([d.type, d.t1, d.t2].filter(Boolean).join(' · '))];
  if (d.newThemes && d.newThemes.length) lines.push('🏷 New theme: ' + escapeHtml(d.newThemes.join(', ')));
  if (d.line) lines.push('💬 ' + escapeHtml(d.line));
  if (d.summary) lines.push('📝 Has a private summary (Summaries tab)');
  if (d.sharedBy) lines.push(`🙋 Credit: ${escapeHtml(d.sharedBy)} (${d.okCredit === 'yes' ? 'OK to show' : 'not shown'})`);
  return lines.join('\n');
}

function pingTeam(id, d, member, pending) {
  const text = pingText(id, d, member, pending);
  const kb = pending ? [[{ text: '✅ Approve', callback_data: 'ap:' + id }, { text: '❌ Reject', callback_data: 'rj:' + id }, { text: '🚫 Block', callback_data: 'bk:' + id }]]
    : [[{ text: '🙈 Hide', callback_data: 'ph:' + id }]];
  const refs = {};
  Object.keys(admins()).forEach(a => {
    const m = tg('sendMessage', { chat_id: a, text, parse_mode: 'HTML', link_preview_options: { is_disabled: true }, reply_markup: { inline_keyboard: kb } });
    if (m) refs[a] = m.message_id;
  });
  if (pending) props.setProperty('PING_' + id, JSON.stringify({ refs, text, userId: member.id }));
}

function userIdFromPrivate(id) {
  const sh = tab('private');
  const n = sh.getLastRow() - 1;
  if (n < 1) return '';
  const hit = sh.getRange(2, 1, n, 4).getValues().find(r => r[0] === id);
  const m = hit && String(hit[3]).match(/\[(\d+)\]\s*$/);
  return m ? m[1] : '';
}

/** Approve, reject or block a first link. The first core-team tap decides; later taps see who did. */
function decide(adminChat, tap, action, rawId) {
  const id = normaliseId(rawId);
  const row = rowOf(id);
  const ping = JSON.parse(props.getProperty('PING_' + id) || 'null');
  const status = row ? tab('entries').getRange(row, E.Status).getValue() : '';
  const edit = (chat, mid, text) => tg('editMessageText', { chat_id: chat, message_id: mid, text, parse_mode: 'HTML', link_preview_options: { is_disabled: true }, reply_markup: { inline_keyboard: [] } });
  const base = ping ? ping.text : escapeHtml(String(tap.message.text || ''));
  if (!row || status !== 'pending') return edit(adminChat, tap.message.message_id, base + `\n\nAlready decided (${escapeHtml(String(status || 'not found'))}).`);

  const entry = tab('entries').getRange(row, 1, 1, TABS.entries.headers.length).getValues()[0];
  const userId = ping ? ping.userId : userIdFromPrivate(id);
  const me = escapeHtml(adminName(adminChat));
  let note;
  if (action === 'ap') {
    tab('entries').getRange(row, E.Status).setValue('live');
    ensureThemes([entry[E['Theme 1'] - 1], entry[E['Theme 2'] - 1]]);
    if (userId) { setUserStatus(userId, 'trusted'); send(userId, `✅ Your link “${escapeHtml(String(entry[E.Title - 1]))}” is now in the archive. Thanks for sharing! Your next links will go straight in.`); }
    note = `✅ Approved by ${me}`;
  } else if (action === 'rj') {
    tab('entries').getRange(row, E.Status).setValue('rejected');
    if (userId) { setUserStatus(userId, 'new'); send(userId, `Thanks for sharing “${escapeHtml(String(entry[E.Title - 1]))}”. The team decided not to add it to the archive this time.`); }
    note = `❌ Rejected by ${me}`;
  } else {
    tab('entries').getRange(row, E.Status).setValue('rejected');
    if (userId) setUserStatus(userId, 'blocked');
    note = `🚫 Blocked by ${me}. /unblock ${userId} to undo.`;
  }
  const refs = ping ? ping.refs : {};
  refs[String(adminChat)] = tap.message.message_id;
  Object.keys(refs).forEach(a => edit(a, refs[a], base + '\n\n' + note));
  props.deleteProperty('PING_' + id);
}

/** The Hide / Show button on a ping for a link that went live straight away. */
function pingVisibility(adminChat, tap, rawId, show) {
  const id = normaliseId(rawId);
  const row = rowOf(id);
  const base = escapeHtml(String(tap.message.text || '')).replace(/\n\n(🙈|↩️).*$/s, '');
  const put = (text, button) => tg('editMessageText', { chat_id: adminChat, message_id: tap.message.message_id, text, parse_mode: 'HTML', link_preview_options: { is_disabled: true }, reply_markup: { inline_keyboard: [[button]] } });
  if (!row) return put(base + '\n\nCan’t find ' + escapeHtml(id) + '.', { text: 'OK', callback_data: 'noop' });
  const status = tab('entries').getRange(row, E.Status).getValue();
  const me = escapeHtml(adminName(adminChat));
  if (show) {
    if (status === 'hidden') tab('entries').getRange(row, E.Status).setValue('live');
    return put(base + `\n\n↩️ Live again (${me})`, { text: '🙈 Hide', callback_data: 'ph:' + id });
  }
  if (status === 'live') tab('entries').getRange(row, E.Status).setValue('hidden');
  put(base + `\n\n🙈 Hidden by ${me}. It leaves the site within a few minutes.`, { text: '↩️ Show again', callback_data: 'pw:' + id });
}

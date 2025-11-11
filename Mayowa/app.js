// Shared Grocery – Collaboration Vertical (manual-only, no background timers)

const now = () => new Date().toISOString();
const ago = (m) => new Date(Date.now() - m*60*1000).toISOString();

const state = {
  you: 'you',
  users: [
    { id:'you',  name:'You',  initials:'YO', role:'Owner', joinedAt: ago(60) },
    { id:'sam',  name:'Sam',  initials:'SA', role:'Member', joinedAt: ago(50) },
    { id:'jane', name:'Jane', initials:'JA', role:'Member', joinedAt: ago(40) }
  ],
  members: ['you','sam','jane'],
  joinRequests: [{ id:'john', name:'John', initials:'JO' }],
  online: true,
  presence: { itemId:null, typing:false },

  search: "",

  list: {
    id:'household',
    budget: { used:135, cap:150 },
    items:[
      { id:'milk',  name:'Milk (1 Gallon)', qty:1, notes:'', price:4,  addedBy:'you',  lastEditedBy:'sam',  lastEditedAt:ago(1), done:false },
      { id:'apples',name:'2 Apples',        qty:2, notes:'', price:3,  addedBy:'sam',  lastEditedBy:'you',  lastEditedAt:ago(0), done:false },
      { id:'rice',  name:'Rice (1kg)',      qty:1, notes:'', price:6,  addedBy:'jane', lastEditedBy:'sam',  lastEditedAt:ago(3), done:false },
      { id:'spin',  name:'Spinach Bag',     qty:1, notes:'', price:8,  addedBy:'sam',  lastEditedBy:'jane', lastEditedAt:ago(8), done:false },
      { id:'pasta', name:'Pasta (Farfalle)',qty:1, notes:'', price:6,  addedBy:'you',  lastEditedBy:'you',  lastEditedAt:ago(2), done:false },
    ]
  },

  queuedEdits: [],
  lastSnapshot: null,
  feed: []
};

/* ---------- DOM ---------- */
const listEl = document.getElementById('list');
const requestsEl = document.getElementById('requests');
const feedEl = document.getElementById('feed');
const testControlsEl = document.getElementById('testControls');

/* ---------- Render ---------- */
function render(){
  document.getElementById('offlineBanner').classList.toggle('on', !state.online);
  document.getElementById('storeSelect').value = localStorage.getItem('store') || 'fresh';

  // Recompute budget (price * qty) and update header + bar
  state.list.budget.used = calcUsed();
  $id('budget').textContent = `$${state.list.budget.used} / $${state.list.budget.cap}`;
  const bt = $id('budgetText'); if (bt) bt.textContent = `$${state.list.budget.used} of $${state.list.budget.cap}`;
  updateBudgetBar();

  renderUserSwitch();
  renderMembers();

  // FILTER -> SORT -> RENDER LIST
  const sort = $id('sortSelect').value;
  let items = state.list.items.filter(it => matches(it, state.search));
  if(sort==='alpha') items.sort((a,b)=> a.name.localeCompare(b.name));
  if(sort==='best')  items.sort((a,b)=> a.price - b.price);
  listEl.innerHTML = '';
  items.forEach(it => listEl.appendChild(renderItem(it)));

  renderRequests();
  renderFeed();
  renderTestControls();
}

/* ---------- User switcher & members row ---------- */
function renderUserSwitch(){
  const sel = $id('userSwitch');
  if(!sel) return;
  sel.innerHTML = '';
  state.members.forEach(uid=>{
    const u = state.users.find(x=>x.id===uid);
    if(!u) return;
    const opt = document.createElement('option');
    opt.value = u.id;
    opt.textContent = `${u.name} (${u.initials})`;
    if(u.id === state.you) opt.selected = true;
    sel.appendChild(opt);
  });
  sel.onchange = (e)=> setCurrentUser(e.target.value);
}

function renderMembers(){
  const row = $id('membersRow');
  if(!row) return;
  row.innerHTML = '';
  state.members.forEach(uid=>{
    const u = state.users.find(x=>x.id===uid);
    if(!u) return;
    const av = document.createElement('div');
    av.className = 'avatar';
    if(u.role === 'Owner') av.classList.add('owner');
    if(uid === state.you) av.classList.add('active');
    av.textContent = u.initials;
    av.title = `${u.name}${uid===state.you ? ' • current' : ''}`;
    av.tabIndex = 0;
    av.setAttribute('role','button');
    av.onclick = ()=> setCurrentUser(uid);
    av.onkeydown = (e)=>{ if(e.key==='Enter' || e.key===' ') { e.preventDefault(); setCurrentUser(uid); } };
    row.appendChild(av);
  });
  const plus = document.createElement('button');
  plus.id = 'addMemberBtn';
  plus.className = 'btn tiny';
  plus.textContent = '+';
  plus.title = 'Invite (stub)';
  plus.onclick = ()=>{ state.joinRequests.push({id:`u${Date.now()}`, name:'Guest', initials:'GU'}); render(); };
  row.appendChild(plus);
}

function setCurrentUser(uid){
  if(!state.members.includes(uid)) return;
  state.you = uid;
  logActivity(`Switched current user to ${nameOf(uid)}`);
  render();
}

/* ---------- List ---------- */
function renderItem(item){
  const el = document.createElement('div');
  el.className = 'item';
  el.dataset.id = item.id;
  if(state.presence.itemId===item.id) el.classList.add('editing-remote');

  const check = document.createElement('button');
  check.className = 'check' + (item.done?' done':'');
  check.title = 'Mark added to cart';
  check.onclick = ()=>{
    item.done=!item.done;
    bumpEdited(item,state.you);
    logActivity(`${nameOf(state.you)} ${item.done?'checked':'unchecked'} ${item.name}`);
    render();
  };

  const content = document.createElement('div'); content.className = 'content';

  const col1 = document.createElement('div');
  const name = document.createElement('div'); name.className='name'; name.textContent = item.name;
  const f = document.createElement('div'); f.className='field';

  const qty = document.createElement('input');
  qty.type='number'; qty.className='qty'; qty.min=0; qty.value=item.qty;
  qty.setAttribute('aria-label',`Quantity for ${item.name}`);

  const notes = document.createElement('input');
  notes.type='text'; notes.placeholder='Notes'; notes.value=item.notes || '';
  notes.setAttribute('aria-label',`Notes for ${item.name}`);

  ['input','change','blur'].forEach(ev =>
    qty.addEventListener(ev, () =>
      onUserEdit(item.id,'qty', Math.max(0, parseInt(qty.value||'0',10)))
    )
  );
  notes.addEventListener('blur', ()=> onUserEdit(item.id,'notes', notes.value));

  f.append(qty, notes); col1.append(name,f);

  const col2 = document.createElement('div');
  const meta = document.createElement('div'); meta.className='meta';
  const price = div('price', `$${item.price}`);
  const chip = document.createElement('span'); chip.className='chip';
  chip.append(avatar(item.lastEditedBy));
  chip.append(text(` last edited by ${nameOf(item.lastEditedBy)} · ${rel(new Date(item.lastEditedAt))}`));
  meta.append(price, chip);

  const del = button('delete-btn','Remove', ()=> removeItem(item.id));
  del.disabled = item.addedBy !== state.you;
  del.title = del.disabled ? 'Only the adder can remove this' : 'Remove';
  col2.append(meta, del);

  content.append(col1,col2);
  el.append(check,content);
  return el;
}

/* ---------- Requests & Activity ---------- */
function renderRequests(){
  requestsEl.innerHTML = '';
  state.joinRequests.forEach(r=>{
    const card = div('request-card');
    const av = div('avatar', r.initials);
    const nm = div('request-name', r.name);
    const acc = button('accept','Accept', ()=>{
      state.members.push(r.id);
      state.users.push({id:r.id,name:r.name,initials:r.initials,role:'Member',joinedAt:now()});
      logActivity(`${r.name} joined the group`);
      state.joinRequests = state.joinRequests.filter(x=>x.id!==r.id);
      render();
    });
    const den = button('deny','Deny', ()=>{
      logActivity(`Denied ${r.name} join request`);
      state.joinRequests = state.joinRequests.filter(x=>x.id!==r.id);
      render();
    });
    card.append(av,nm,acc,den);
    requestsEl.append(card);
  });
}

function renderFeed(){
  feedEl.innerHTML = '';
  state.feed.slice().reverse().forEach(entry=>{
    const li = document.createElement('li');
    li.innerHTML = `<strong>${entry.title}</strong><br><span class="muted">${entry.time}</span>`;
    feedEl.appendChild(li);
  });
}

/* ---------- Contributors Modal ---------- */
const contributorsBackdrop = document.getElementById('contributorsBackdrop');
const contributorsCard = document.getElementById('contributorsCard');
document.getElementById('contributorsBtn').onclick = openContributors;
document.getElementById('contributorsClose').onclick = closeContributors;
document.getElementById('inviteFromModal').onclick = ()=>{ state.joinRequests.push({id:`u${Date.now()}`, name:'Guest', initials:'GU'}); render(); };

function openContributors(){
  const list = document.getElementById('contributorsList');
  list.innerHTML = '';

  const counts = {};
  state.list.items.forEach(it => counts[it.addedBy] = (counts[it.addedBy]||0)+1);

  state.members.forEach(uid=>{
    const u = state.users.find(x=>x.id===uid);
    const li = document.createElement('li'); li.className='contributor';

    const av = div('avatar', (u?.initials||'??')); if(u?.role==='Owner') av.classList.add('owner');
    const info = document.createElement('div');
    const name = document.createElement('div'); name.textContent = `${u?.name||'Unknown'}${u?.id===state.you?' (You)':''}`;
    const meta = document.createElement('div'); meta.innerHTML = `<span class="role">${u?.role||'Member'}</span> • <span class="stat">Joined ${rel(new Date(u?.joinedAt||now()))}</span> • <span class="stat">Items added: ${counts[uid]||0}</span>`;
    info.append(name, meta);

    const actions = document.createElement('div');
    const makeOwner = button('btn tiny','Make owner', ()=>{ alert('Stub: transfer ownership'); });
    const remove = button('btn tiny','Remove', ()=>{ alert('Stub: remove member'); });
    if(u?.role==='Owner'){ makeOwner.disabled = true; }
    actions.append(makeOwner, remove);

    li.append(av, info, actions);
    list.append(li);
  });

  contributorsBackdrop.classList.add('show');
  contributorsBackdrop.removeAttribute('aria-hidden');
  trapFocus(contributorsCard);
}
function closeContributors(){
  contributorsBackdrop.classList.remove('show');
  contributorsBackdrop.setAttribute('aria-hidden','true');
  releaseFocusTrap();
}

/* ---------- Edits, conflicts, presence (manual) ---------- */
let pendingConflict = null;

function onUserEdit(itemId, field, value){
  const item = state.list.items.find(i=>i.id===itemId); if(!item) return;
  if(!state.online){
    state.queuedEdits.push({ts:now(), itemId, field, value});
    logActivity(`Queued ${nameOf(state.you)} ${field} change on ${item.name}`);
    showSnack('Change queued (offline).');
    return;
  }
  state.lastSnapshot = clone(state.list);
  item[field] = value;
  bumpEdited(item,state.you);
  logActivity(`${nameOf(state.you)} changed ${field} of ${item.name}`);
  showSnack('Saved.');
  render();
}

function openManualConflict(itemId){
  const item = state.list.items.find(i=>i.id===itemId); if(!item) return;
  const theirs = { qty: item.qty + 1, notes: (item.notes||'') + (item.notes ? ' (Sam)' : 'Changed by Sam'), lastEditedAt: now() };
  pendingConflict = { itemId, mine:{ qty:item.qty, notes:item.notes }, theirs, keep:{ qty:'mine', notes:'mine' } };
  openConflictModal();
}

/* Conflict modal wiring */
const backdrop = document.getElementById('modalBackdrop');
const modalCard = document.getElementById('modalCard');
const modalClose = document.getElementById('modalClose');

function openConflictModal(){
  $id('mineQty').textContent = pendingConflict.mine.qty;
  $id('mineNotes').textContent = pendingConflict.mine.notes || '—';
  $id('theirsQty').textContent = pendingConflict.theirs.qty;
  $id('theirsNotes').textContent = pendingConflict.theirs.notes || '—';
  $id('remoteTime').textContent = '· just now';
  backdrop.classList.add('show'); backdrop.removeAttribute('aria-hidden'); trapFocus(modalCard);
}
function closeConflictModal(){ backdrop.classList.remove('show'); backdrop.setAttribute('aria-hidden','true'); releaseFocusTrap(); }

$id('keepMineQty').onclick = ()=> pendingConflict.keep.qty = 'mine';
$id('acceptTheirsQty').onclick = ()=> pendingConflict.keep.qty = 'theirs';
$id('keepMineNotes').onclick = ()=> pendingConflict.keep.notes = 'mine';
$id('acceptTheirsNotes').onclick = ()=> pendingConflict.keep.notes = 'theirs';
$id('keepAllMine').onclick = ()=> pendingConflict.keep = {qty:'mine', notes:'mine'};
$id('acceptAllTheirs').onclick = ()=> pendingConflict.keep = {qty:'theirs', notes:'theirs'};
$id('applyResolution').onclick = ()=>{
  const item = state.list.items.find(i=>i.id===pendingConflict.itemId);
  state.lastSnapshot = clone(state.list);
  item.qty = (pendingConflict.keep.qty==='mine') ? pendingConflict.mine.qty : pendingConflict.theirs.qty;
  item.notes = (pendingConflict.keep.notes==='mine') ? pendingConflict.mine.notes : pendingConflict.theirs.notes;
  bumpEdited(item,state.you);
  logActivity(`Conflict resolved on ${item.name}`);
  closeConflictModal(); render();
  showSnack('Conflict resolved.', ()=>{ state.list = state.lastSnapshot; render(); });
  pendingConflict = null;
};
modalClose.onclick = closeConflictModal;
backdrop.addEventListener('click', (e)=>{ if(e.target===backdrop) closeConflictModal(); });
document.addEventListener('keydown', (e)=>{ if(e.key==='Escape' && backdrop.classList.contains('show')) closeConflictModal(); });

/* ---------- Manual test controls ---------- */
function renderTestControls(){
  testControlsEl.innerHTML = '';
  state.list.items.forEach(it=>{
    const row = div('test-row');
    row.append(div('label', it.name));
    row.append(button('btn','Presence 2s', ()=>{ setPresence(it.id,true); setTimeout(()=>setPresence(null,false),2000); }));
    row.append(button('btn','Mark remote edit (qty+1)', ()=>{ it.qty += 1; it.lastEditedBy='sam'; it.lastEditedAt=now(); logActivity(`Sam changed qty on ${it.name}`); render(); }));
    row.append(button('btn','Open conflict now', ()=> openManualConflict(it.id)));
    testControlsEl.append(row);
  });
}

/* ---------- Offline queue ---------- */
$id('offlineToggle').addEventListener('change', (e)=>{
  state.online = !e.target.checked; render(); if(state.online) processQueue();
});
function processQueue(){
  if(state.queuedEdits.length===0) return;
  const q = state.queuedEdits.slice(); state.queuedEdits = [];
  q.forEach(ed=>{
    const item = state.list.items.find(i=>i.id===ed.itemId); if(!item) return;
    const remoteEdited = new Date(item.lastEditedAt), queuedAt = new Date(ed.ts);
    if(remoteEdited > queuedAt && item.lastEditedBy!=='you'){
      pendingConflict = {
        itemId: ed.itemId,
        mine:{ qty: ed.field==='qty'? ed.value : item.qty, notes: ed.field==='notes'? ed.value : item.notes },
        theirs:{ qty:item.qty, notes:item.notes, lastEditedAt:item.lastEditedAt },
        keep:{ qty:'mine', notes:'mine' }
      };
      openConflictModal();
    } else {
      item[ed.field]=ed.value; bumpEdited(item,state.you);
      logActivity(`Synced ${nameOf(state.you)} ${ed.field} on ${item.name}`);
    }
  });
  render();
}

/* ---------- Toolbar + misc ---------- */
$id('openFeed').onclick = ()=>{ $id('feedDrawer').hidden=false; };
$id('closeFeed').onclick = ()=>{ $id('feedDrawer').hidden=true; };
$id('newListBtn').onclick = ()=> logActivity('Started a new list (stub)');
$id('storeSelect').addEventListener('change', e=>{ localStorage.setItem('store', e.target.value); logActivity('Selected store changed'); });
$id('sortSelect').addEventListener('change', render);

/* Search bar */
const searchEl = $id('searchInput');
if (searchEl){
  searchEl.addEventListener('input', (e)=>{ state.search = e.target.value; render(); });
  searchEl.addEventListener('keydown', (e)=>{
    if(e.key==='Escape'){ state.search = ''; searchEl.value=''; render(); }
  });
}

/* Mic stub */
$id('micBtn').onclick = ()=>{ logActivity('Voice search (stub)'); alert('Voice search would start here (stub).'); };

/* ---------- Add Item ---------- */
function addItemFromForm(){
  const name  = $id('addName').value.trim();
  const qty   = Math.max(1, parseInt($id('addQty').value || '1', 10));
  const price = Math.max(0, parseFloat($id('addPrice').value || '0'));
  const notes = $id('addNotes').value.trim();
  if(!name){ showSnack('Please enter an item name.'); $id('addName').focus(); return; }

  const id = `${slugify(name)}-${Date.now()}`;
  const item = {
    id, name, qty, notes,
    price: isNaN(price) ? 0 : price,
    addedBy: state.you,
    lastEditedBy: state.you,
    lastEditedAt: now(),
    done: false
  };

  state.lastSnapshot = clone(state.list);
  state.list.items.push(item);
  state.list.budget.used = calcUsed();
  logActivity(`${nameOf(state.you)} added ${name} (${qty}${notes?`, ${notes}`:''})`);
  showSnack('Item added.', ()=>{ state.list = state.lastSnapshot; render(); });

  // clear + focus
  $id('addName').value = '';
  $id('addQty').value = '1';
  $id('addPrice').value = '';
  $id('addNotes').value = '';
  $id('addName').focus();

  render();
}

const addBtn = $id('addBtn');
if(addBtn){
  addBtn.onclick = addItemFromForm;
  ['addName','addQty','addPrice','addNotes'].forEach(id=>{
    const el = $id(id);
    el && el.addEventListener('keydown', (e)=>{
      if(e.key === 'Enter'){ e.preventDefault(); addItemFromForm(); }
    });
  });
}

/* ---------- Helpers ---------- */
// Build a per-user spending map (HYBRID):
// - One unit of price goes to the adder (addedBy)
// - Any extra quantity beyond 1 goes to the last editor (lastEditedBy)
function computeUserSpend(){
  const map = {};
  state.members.forEach(u=> map[u]=0);

  for(const it of state.list.items){
    const price = Number(it.price) || 0;
    const qty   = Math.max(0, Number(it.qty) || 0);
    if (price <= 0 || qty <= 0) continue;

    const owner = it.addedBy || 'unknown';
    const editor = it.lastEditedBy || owner;

    // owner gets base 1x price
    const ownerQty = Math.min(1, qty);
    map[owner] = (map[owner] || 0) + ownerQty * price;

    // editor gets the rest (if any)
    const extraQty = Math.max(0, qty - ownerQty);
    if (extraQty > 0){
      map[editor] = (map[editor] || 0) + extraQty * price;
    }
  }
  return map;
}

function updateBudgetBar(){
  const pctEl = $id('budgetPct');
  const track = $id('budgetTrack') || ($id('budgetFill') && $id('budgetFill').parentElement);
  if(!track){ if(pctEl){ pctEl.textContent=''; } return; }

  // wipe any previous segments/overlays
  Array.from(track.querySelectorAll('.budget-seg, .cap-over, #budgetFill')).forEach(n=> n.remove());

  const used = Number(state.list.budget.used) || 0;
  const cap  = Math.max(1, Number(state.list.budget.cap) || 1);
  const pct  = Math.min(100, Math.round((used / cap) * 100));
  if(pctEl) pctEl.textContent = pct + '%';

  // build segments by user (hybrid map)
  const spend = computeUserSpend();
  const order = state.members.filter(u => (spend[u]||0) > 0);
  order.forEach(uid=>{
    const seg = document.createElement('div');
    seg.className = 'budget-seg';
    const w = Math.min(100, (spend[uid]/cap)*100);
    seg.style.width = `${w}%`;
    seg.style.background = colorForUser(uid);
    seg.title = `${nameOf(uid)} · $${(spend[uid]||0).toFixed(2)}`;
    track.appendChild(seg);
  });

  // Styles for warn/over
  track.classList.remove('warn','over');
  if(used > cap){
    track.classList.add('over');
    const overlay = document.createElement('div');
    overlay.className = 'cap-over';
    track.appendChild(overlay);
  } else if (pct >= 80){
    track.classList.add('warn');
  }
}

// deterministic user colors
function colorForUser(uid){
  const palette = {
    you:  'linear-gradient(180deg,#60a5fa,#38bdf8)', // blue
    sam:  'linear-gradient(180deg,#c4b5fd,#a78bfa)', // purple
    jane: 'linear-gradient(180deg,#86efac,#34d399)', // green
    john: 'linear-gradient(180deg,#fca5a5,#f87171)', // red-ish
  };
  if (palette[uid]) return palette[uid];

  // fallback deterministic color by hash
  const colors = [
    'linear-gradient(180deg,#facc15,#f59e0b)',
    'linear-gradient(180deg,#fda4af,#fb7185)',
    'linear-gradient(180deg,#93c5fd,#60a5fa)',
    'linear-gradient(180deg,#7dd3fc,#38bdf8)',
    'linear-gradient(180deg,#a7f3d0,#34d399)',
  ];
  let h = 0;
  for (let i=0;i<uid.length;i++) h = (h*31 + uid.charCodeAt(i))>>>0;
  return colors[h % colors.length];
}

function nameOf(uid){ return state.users.find(u=>u.id===uid)?.name || 'Someone'; }
function avatar(uid){
  const u = state.users.find(u=>u.id===uid) || {initials:'??'};
  const span = document.createElement('span'); span.className='avatar-dot'; span.title=nameOf(uid); span.textContent=u.initials.slice(0,2);
  return span;
}
function text(s){ return document.createTextNode(s); }
function div(cls, txt){ const d=document.createElement('div'); if(cls) d.className=cls; if(txt!=null) d.textContent=txt; return d; }
function button(cls, label, cb){ const b=document.createElement('button'); b.className=cls; b.textContent=label; b.onclick=cb; return b; }
function rel(date){
  const diff=Math.max(0,Date.now()-date.getTime());
  const m=Math.floor(diff/60000); if(m<1) return 'just now'; if(m<60) return m+'m ago';
  const h=Math.floor(m/60); if(h<24) return h+'h ago'; const d=Math.floor(h/24); return d+'d ago';
}
function logActivity(title){ state.feed.push({title, time:new Date().toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}); renderFeed(); }
function bumpEdited(item, by){ item.lastEditedBy=by; item.lastEditedAt=now(); }
function clone(x){ return JSON.parse(JSON.stringify(x)); }
function $id(id){ return document.getElementById(id); }
function slugify(s){ return s.toLowerCase().trim().replace(/[^a-z0-9]+/g,'-').replace(/(^-|-$)/g,''); }
function calcUsed(){ return state.list.items.reduce((sum,it)=> sum + (Number(it.price)||0)*(Number(it.qty)||0), 0); }
function matches(it, q){
  if(!q) return true;
  q = q.toLowerCase().trim();
  return it.name.toLowerCase().includes(q) || (it.notes||"").toLowerCase().includes(q);
}

// Presence helper (used by Test Controls)
function setPresence(itemId, typing){ state.presence.itemId=itemId; state.presence.typing=typing; render(); }

/* Snack + focus trap */
function showSnack(msg, undoCb){
  const s=$id('snack'); $id('snackMsg').textContent=msg;
  s.classList.add('show');
  const to=setTimeout(()=>s.classList.remove('show'),3500);
  $id('undoBtn').onclick=()=>{ clearTimeout(to); s.classList.remove('show'); undoCb&&undoCb(); };
}
let trapHandler=null;
function trapFocus(container){
  const f=container.querySelectorAll('button,[href],input,select,textarea,[tabindex]:not([tabindex="-1"])');
  const first=f[0], last=f[f.length-1];
  trapHandler=(e)=>{ if(e.key!=='Tab')return;
    if(e.shiftKey){ if(document.activeElement===first){ last.focus(); e.preventDefault(); } }
    else { if(document.activeElement===last){ first.focus(); e.preventDefault(); } }
  };
  document.addEventListener('keydown',trapHandler); first&&first.focus();
}
function releaseFocusTrap(){ if(trapHandler){ document.removeEventListener('keydown',trapHandler); trapHandler=null; }}

/* Init */
(function init(){ logActivity('You opened the list'); render(); })();

/* ---------- Item removal ---------- */
function removeItem(id){
  state.lastSnapshot = clone(state.list);
  const it = state.list.items.find(x=>x.id===id);
  state.list.items = state.list.items.filter(x=>x.id!==id);
  logActivity(`${nameOf(state.you)} removed ${it?.name || 'item'}`);
  showSnack('Item removed.', ()=>{ state.list = state.lastSnapshot; render(); });
  render();
}

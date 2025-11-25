/* script.js
   Paste your Firebase config in the FIREBASE_CONFIG section below.
   This file handles form submission, optional Firestore realtime sync,
   and the staff dashboard actions.
*/

/* ==========================
   FIREBASE CONFIG - PASTE YOURS HERE
   Example:
   const FIREBASE_CONFIG = {
     apiKey: "...",
     authDomain: "your-project.firebaseapp.com",
     projectId: "your-project-id",
     storageBucket: "your-project.appspot.com",
     messagingSenderId: "...",
     appId: "...",
     measurementId: "G-..."
   };
   ========================== */
const firebaseConfig = {
  apiKey: "AIzaSyBhrmJTuQCv3NrZFuD_kmmAOpNe1otZUPA",
  authDomain: "track-service-request.firebaseapp.com",
  projectId: "track-service-request",
  storageBucket: "track-service-request.firebasestorage.app",
  messagingSenderId: "628846867224",
  appId: "1:628846867224:web:8801f154a222993155e46d",
  measurementId: "G-5GDVJKSJVN"
};
// alias so existing code works without changing the rest
const FIREBASE_CONFIG = firebaseConfig;


// init firebase if config present
let db = null;
if (window.firebase && FIREBASE_CONFIG && FIREBASE_CONFIG.projectId) {
  try {
    if (!firebase.apps || !firebase.apps.length) {
      firebase.initializeApp(FIREBASE_CONFIG);
    }
    db = firebase.firestore();
  } catch (e) {
    console.warn('Firebase init error', e);
  }
}

// helpers
const $ = id => document.getElementById(id);
function escapeHtml(s){ if(!s) return ''; return (s+'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
function formatDate(d){ return d.toLocaleDateString() + ' ' + d.toLocaleTimeString(); }

// submit handler
$('submitBtn').addEventListener('click', async ()=>{
  const name = $('c_name').value.trim();
  const phone = $('c_phone').value.trim();
  const email = ""; // email removed
  const address = $('c_address').value.trim();
  const type = $('c_type').value;
  const desc = $('c_desc').value.trim();
  if(!name || !phone || !address || !desc) { alert('Please fill all required fields'); return; }

  const payload = { name, phone, address, type, desc, createdAt: new Date().toISOString(), resolved:false };
  if (db) {
    try {
      await db.collection('service_requests').add(Object.assign({}, payload, { createdAt: firebase.firestore.FieldValue.serverTimestamp() }));
      // show premium animated success message
const msg = $('successMsg');
msg.classList.add('show');
msg.style.display = 'block';

setTimeout(() => {
    msg.classList.remove('show');
    setTimeout(() => msg.style.display = 'none', 400);
}, 3500);

      document.querySelectorAll('#customerView input, #customerView textarea').forEach(i=>i.value='');
    } catch(e){ console.error(e); alert('Failed to submit to Firestore (check console)'); }
  } else {
    const id = 'local-'+Date.now();
    localStorage.setItem(id, JSON.stringify(payload));
    alert('Request saved locally (no Firebase configured)');
    document.querySelectorAll('#customerView input, #customerView textarea').forEach(i=>i.value='');
  }
});

// staff modal open/close + login with persistent error
$('openStaff').addEventListener('click', () => {
  const pwEl = $('staffPw');
  const errEl = $('pwError');

  if (pwEl) pwEl.value = '';     // clear input
  if (errEl) errEl.style.display = 'none'; // hide error when modal opens

  $('staffModal').style.display = 'flex';
});

$('modalClose').addEventListener('click', () => {
  const pwEl = $('staffPw');
  const errEl = $('pwError');

  if (pwEl) pwEl.value = '';    // clear on close
  if (errEl) errEl.style.display = 'none';

  $('staffModal').style.display = 'none';
});

$('staffLoginBtn').addEventListener('click', () => {
  const pwEl = $('staffPw');
  const errEl = $('pwError');
  const pw = pwEl ? pwEl.value : '';

  if (pw === 'staff123') {
    if (pwEl) pwEl.value = '';        // clear password
    if (errEl) errEl.style.display = 'none'; // hide error
    $('staffModal').style.display = 'none';
    showDashboard();
    return;
  }

  // WRONG PASSWORD → keep error visible
  if (pwEl) pwEl.value = '';
  if (errEl) errEl.style.display = 'block';
  if (pwEl) pwEl.focus();
});



$('logoutBtn').addEventListener('click', ()=>{ $('dashboardView').style.display='none'; $('customerView').style.display='block'; if(window.unsubscribe) { window.unsubscribe(); window.unsubscribe = null; }});

function showDashboard(){
  $('customerView').style.display='none';
  $('dashboardView').style.display='block';
  if(db) subscribeRealtime();
  else loadLocal();
}

// Firestore realtime subscription
function subscribeRealtime(){
  const col = db.collection('service_requests').orderBy('createdAt','desc');
  window.unsubscribe = col.onSnapshot(snap=>{
    const pending = [], completed = [];
    snap.forEach(d=>{
      const data = d.data();
      const id = d.id;
      const item = { id, ...data };
      if(item.resolved) completed.push(item); else pending.push(item);
    });
    renderLists(pending, completed);
  }, err=>{ console.error('snapshot',err); alert('Realtime error: '+err.message) });
}

// local-only loader
function loadLocal(){
  const keys = Object.keys(localStorage).filter(k=>k.startsWith('local-')).sort().reverse();
  const items = keys.map(k=>JSON.parse(localStorage.getItem(k)));
  renderLists(items, []);
}

function renderLists(pending, completed){
  $('statPending').textContent = pending.length;
  $('statCompleted').textContent = completed.length;
  $('statTotal').textContent = (pending.length + completed.length);

  const pList = $('pendingList'); pList.innerHTML='';
  pending.forEach(it=>{
    const div = document.createElement('div'); div.className='request';
    div.innerHTML = `<strong>${escapeHtml(it.name)}</strong><div class=meta>Submitted: ${it.createdAt? (it.createdAt.toDate ? formatDate(it.createdAt.toDate()) : it.createdAt) : ''}</div>
                    <div class=meta>📞 ${escapeHtml(it.phone)} • ${escapeHtml(it.type)}</div>
                    <div style='margin-top:8px;color:#0f172a'>Description:<div style='margin-top:6px;color:var(--muted)'>${escapeHtml(it.desc)}</div></div>`;
    const a = document.createElement('div'); a.className='actions';
    const btn1 = document.createElement('button'); btn1.className='btn-complete'; btn1.textContent='Mark as Completed'; btn1.addEventListener('click', ()=>markCompleted(it));
    const btn2 = document.createElement('button'); btn2.className='btn-delete'; btn2.textContent='Delete'; btn2.addEventListener('click', ()=>deleteReq(it));
    a.append(btn1, btn2);
    div.appendChild(a);
    pList.appendChild(div);
  });

  const cList = $('completedList'); cList.innerHTML='';
  completed.forEach(it=>{
    const div = document.createElement('div'); div.className='request';
    div.innerHTML = `<strong>${escapeHtml(it.name)}</strong><div class=meta>Completed</div>
                     <div class=meta>📞 ${escapeHtml(it.phone)} • ${escapeHtml(it.type)}</div>
                     <div style='margin-top:8px;color:#0f172a'>Description:<div style='margin-top:6px;color:var(--muted)'>${escapeHtml(it.desc)}</div></div>`;
    cList.appendChild(div);
  });
}

function markCompleted(item){
  if(!db){ alert('Local data — cannot toggle resolved in local demo'); return; }
  db.collection('service_requests').doc(item.id).update({ resolved: true }).then(()=>{}).catch(e=>console.error(e));
}
function deleteReq(item){
  if(!db){ alert('Local data — cannot delete in local demo'); return; }
  if(confirm('Delete this request?')) db.collection('service_requests').doc(item.id).delete();
}


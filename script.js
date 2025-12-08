/* ---------- Updated for your Firestore fields ----------
 - Uses collection "staff_users"
 - Expects fields: username, password (plain text), displayName
 - Optional field: active (if present and false, login blocked)
 - Keeps rest of behavior (service_requests, activity_logs) intact
---------------------------------------------------------*/

/* ---------- Init ---------- */
let db = null;
if (window.firebase && typeof firebase !== 'undefined' && typeof FIREBASE_CONFIG !== 'undefined') {
  try {
    if (!firebase.apps || !firebase.apps.length) firebase.initializeApp(FIREBASE_CONFIG);
    db = firebase.firestore();
  } catch (e) { console.warn('Firebase init error', e); }
}

/* ---------- Helpers ---------- */
const $ = id => document.getElementById(id);
function escapeHtml(s){ if(!s) return ''; return (s+'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
function formatDate(d){ return d.toLocaleDateString() + ' ' + d.toLocaleTimeString(); }

/* ---------- State ---------- */
let currentStaff = null; // { id (doc id), username, displayName }

/* ---------- Customer submission (unchanged behavior) ---------- */
$('submitBtn').addEventListener('click', async ()=>{
  const name = $('c_name').value.trim();
  const phone = $('c_phone').value.trim();
  const address = $('c_address').value.trim();
  const type = $('c_type').value;
  const desc = $('c_desc').value.trim();
  if(!name || !phone || !address || !desc) { alert('Please fill all required fields'); return; }

  const payload = { name, phone, address, type, desc, createdAt: new Date().toISOString(), resolved:false };
  if (db) {
    try {
      await db.collection('service_requests').add(Object.assign({}, payload, { createdAt: firebase.firestore.FieldValue.serverTimestamp() }));
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

/* ---------- Staff modal open/close ---------- */
$('openStaff').addEventListener('click', () => {
  const pwEl = $('staffPw'); const errEl = $('pwError'); const userEl = $('staffUser');
  if (pwEl) pwEl.value = '';
  if (userEl) userEl.value = '';
  if (errEl) errEl.style.display = 'none';
  $('staffModal').style.display = 'flex';
});
$('modalClose').addEventListener('click', () => {
  const pwEl = $('staffPw'); const errEl = $('pwError'); const userEl = $('staffUser');
  if (pwEl) pwEl.value = '';
  if (userEl) userEl.value = '';
  if (errEl) errEl.style.display = 'none';
  $('staffModal').style.display = 'none';
});

/* ---------- Staff login using Firestore stored username+plain-password ---------- */
$('staffLoginBtn').addEventListener('click', async () => {
  const userVal = $('staffUser').value.trim();
  const pwVal = $('staffPw').value;
  const errEl = $('pwError');

  if (!db) { alert('Firestore not initialized. Check Firebase config.'); return; }
  if (!userVal || !pwVal) { errEl.style.display='block'; errEl.textContent='Please enter username and password'; return; }

  try {
    // query staff_users collection for username (username should be unique)
    const q = await db.collection('staff_users').where('username','==', userVal).limit(1).get();
    if (q.empty) {
      errEl.style.display='block'; errEl.textContent='Incorrect username or password';
      $('staffPw').value = '';
      return;
    }
    const doc = q.docs[0];
    const data = doc.data();

    // if an 'active' flag exists and is false, block login
    if (typeof data.active !== 'undefined' && data.active === false) {
      errEl.style.display='block'; errEl.textContent='This staff account is inactive';
      return;
    }

    // Plain text password comparison (no hashing)
    if ((data.password||'') !== pwVal) {
      errEl.style.display='block'; errEl.textContent='Incorrect username or password';
      $('staffPw').value = '';
      return;
    }

    // success -> set currentStaff
    currentStaff = {
      id: doc.id,
      username: data.username,
      displayName: data.displayName || data.username
    };

    // clear modal & show dashboard
    $('staffPw').value = '';
    $('staffUser').value = '';
    errEl.style.display = 'none';
    $('staffModal').style.display = 'none';
    showDashboard();

  } catch (e) {
    console.error('staff login error', e);
    errEl.style.display='block';
    errEl.textContent = 'Login failed (check console)';
  }
});

/* ---------- Logout ---------- */
$('logoutBtn').addEventListener('click', ()=>{
  currentStaff = null;
  $('dashboardView').style.display='none';
  $('customerView').style.display='block';
  if(window.unsubscribe){ window.unsubscribe(); window.unsubscribe = null; }
});

function showDashboard(){
  // show dashboard and hide customer view
  $('customerView').style.display='none';
  $('dashboardView').style.display='block';

  // Safe: update header text without breaking anything
  let header = document.querySelector('#dashboardView h1');
  if (header) {
    const staffName = currentStaff?.displayName || '';
    header.textContent = staffName
      ? `Service Requests Dashboard, ${staffName}`
      : `Service Requests Dashboard`;
  }

  // VERY IMPORTANT: start realtime listener
  console.log("Starting realtime Firestore listener…");
  if (db) subscribeRealtime();
  else loadLocal();
}


/* ---------- Firestore realtime subscription ---------- */
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

/* ---------- Local loader fallback ---------- */
function loadLocal(){
  const keys = Object.keys(localStorage).filter(k=>k.startsWith('local-')).sort().reverse();
  const items = keys.map(k=>JSON.parse(localStorage.getItem(k)));
  renderLists(items, []);
}

/* ---------- Render lists (display resolvedBy if present) ---------- */
function renderLists(pending, completed){
  const sp = $('statPending'); const sc = $('statCompleted'); const st = $('statTotal');
  if (sp) sp.textContent = pending.length;
  if (sc) sc.textContent = completed.length;
  if (st) st.textContent = (pending.length + completed.length);

  const pList = $('pendingList'); if(pList) pList.innerHTML='';
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

  const cList = $('completedList'); if(cList) cList.innerHTML='';
  completed.forEach(it=>{
    const div = document.createElement('div'); div.className='request';
    const who = it.resolvedBy && it.resolvedBy.displayName ? ` • Completed by ${escapeHtml(it.resolvedBy.displayName)}` : '';
    div.innerHTML = `<strong>${escapeHtml(it.name)}</strong><div class=meta>Completed${who}</div>
                     <div class=meta>📞 ${escapeHtml(it.phone)} • ${escapeHtml(it.type)}</div>
                     <div style='margin-top:8px;color:#0f172a'>Description:<div style='margin-top:6px;color:var(--muted)'>${escapeHtml(it.desc)}</div></div>`;
    cList.appendChild(div);
  });
}

/* ---------- Actions: markCompleted and delete -> add activity logs with staff info ---------- */
async function markCompleted(item){
  if(!db){ alert('Local data — cannot toggle resolved in local demo'); return; }
  if(!currentStaff) { alert('Please login as staff to perform this action'); return; }

  try {
    await db.collection('service_requests').doc(item.id).update({
      resolved: true,
      resolvedBy: {
        staffDocId: currentStaff.id,
        username: currentStaff.username,
        displayName: currentStaff.displayName
      },
      resolvedAt: firebase.firestore.FieldValue.serverTimestamp()
    });

    await db.collection('activity_logs').add({
      requestId: item.id,
      action: 'markCompleted',
      performedBy: {
        staffDocId: currentStaff.id,
        username: currentStaff.username,
        displayName: currentStaff.displayName
      },
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });
  } catch(e){
    console.error(e);
    alert('Failed to mark completed: '+e.message);
  }
}

async function deleteReq(item){
  if(!db){ alert('Local data — cannot delete in local demo'); return; }
  if(!currentStaff) { alert('Please login as staff to perform this action'); return; }
  if(!confirm('Delete this request?')) return;

  try {
    await db.collection('service_requests').doc(item.id).delete();
    await db.collection('activity_logs').add({
      requestId: item.id,
      action: 'delete',
      performedBy: {
        staffDocId: currentStaff.id,
        username: currentStaff.username,
        displayName: currentStaff.displayName
      },
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });
  } catch(e){
    console.error(e);
    alert('Failed to delete request: '+e.message);
  }
}

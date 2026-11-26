import { SUPABASE_URL, SUPABASE_ANON_KEY, GA4_ID } from './config.js';

const $ = id => document.getElementById(id);
const configured = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);
let supabase, session = null, staff = null, shipments = [], rates = [], leads = [];
let editorMode = '', editingId = null;
let currentTab = 'shipments';
let currentQuoteLock = false;
const WhatsAppNumber = '917573969762';
const vendors = ['Delhivery', 'Blue Dart', 'Gati', 'Trackon', 'Rivigo', 'Skyjets', 'MOVIN', 'Other'];
const rupees = n => '₹' + Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 2, minimumFractionDigits: 0 });
const escapeHtml = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'}[c]));
const dateOnly = d => d ? new Date(String(d).slice(0,10) + 'T00:00:00').toLocaleDateString('en-IN') : '—';
const setStatus = (id, message, kind = '') => { const n = $(id); if(n){n.textContent = message; n.className = 'status ' + kind;} };
const safeError = e => e?.message || 'Something went wrong. Please retry.';

if (GA4_ID && /^G-[A-Z0-9]+$/.test(GA4_ID)) {
  // Analytics remains intentionally disabled until a consent mechanism is implemented.
  console.info('GA4 measurement ID supplied; integrate consent before loading analytics.');
}
$('year').textContent = String(new Date().getFullYear());
$('menuToggle').addEventListener('click', () => { let open = $('nav').classList.toggle('open'); $('menuToggle').setAttribute('aria-expanded',String(open)); });
document.querySelectorAll('[data-nav]').forEach(a => a.addEventListener('click', () => {$('nav').classList.remove('open');$('menuToggle').setAttribute('aria-expanded','false');}));
const route = () => {
  const portal = location.hash === '#portal' || location.hash.startsWith('#portal/');
  $('main').classList.toggle('hidden', portal);
  $('portal').classList.toggle('hidden', !portal);
  document.querySelector('footer').classList.toggle('hidden', portal);
  if(portal) { if(!session || !staff) showLogin(); else showApp(); window.scrollTo({top:0, behavior:'instant'}); }
};
window.addEventListener('hashchange', route);
$('quickWhatsappForm').addEventListener('submit', event => {
  event.preventDefault();
  const fd = new FormData(event.currentTarget);
  const origin = String(fd.get('origin') || '').trim(), destination = String(fd.get('destination') || '').trim();
  const weight = Number(fd.get('weight'));
  if (!/^\d{6}$/.test(origin) || !/^\d{6}$/.test(destination) || !Number.isFinite(weight) || weight <= 0) return;
  const message = `Hello NationXpress, please quote my B2B shipment.\nPickup PIN: ${origin}\nDelivery PIN: ${destination}\nWeight: ${weight} kg\nPlease share service options and pricing.`;
  window.open(`https://wa.me/${WhatsAppNumber}?text=${encodeURIComponent(message)}`, '_blank', 'noopener,noreferrer');
});
$('trackingForm').addEventListener('submit', e => { e.preventDefault(); const carrier = $('trackCarrier').value; if (!/^https:\/\//.test(carrier)) return; window.open(carrier, '_blank', 'noopener,noreferrer'); });
if (!configured) {
  $('setupMessage').textContent = 'Database connection is not configured. Add your Supabase project URL and publishable key in config.js to activate secure login and enquiries.';
  $('quoteSubmit').disabled = true;
  $('quoteSubmit').textContent = 'Enquiries open after setup';
  setStatus('quoteStatus','This site is not yet connected to the enquiry database. Please do not enter personal details.', 'error');
} else {
  try {
    const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2.49.10');
    supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth: { autoRefreshToken: true, persistSession: true, detectSessionInUrl: false } });
    const { data, error } = await supabase.auth.getSession();
    if(error) console.warn('Session not available:', error.message);
    session = data?.session || null;
    if(session) { await loadStaff(); if(staff) await refresh(); }
    supabase.auth.onAuthStateChange((event, updated) => {
      // Avoid querying Supabase synchronously inside the auth state callback.
      session = updated;
      if(!session){staff = null; shipments = []; rates = []; leads = []; showLogin();}
    });
  } catch (e) {
    console.error('Database SDK unavailable', e);
    setStatus('quoteStatus','The enquiry service is temporarily unavailable.', 'error');
    $('quoteSubmit').disabled = true;
    $('setupMessage').textContent = 'Could not load the database client. Check your network and configuration.';
  }
}
route();

$('quoteForm').addEventListener('submit', async e => {
  e.preventDefault();
  if (!supabase || currentQuoteLock) return;
  const form = e.currentTarget, fd = new FormData(form);
  if (String(fd.get('website') || '').trim()) { form.reset(); setStatus('quoteStatus','Enquiry received.','success'); return; }
  const row = {
    company: String(fd.get('company')||'').trim(), contact_name: String(fd.get('contact_name')||'').trim(),
    email: String(fd.get('email')||'').trim(), phone: String(fd.get('phone')||'').trim(),
    origin_pin: String(fd.get('origin_pin')||'').trim(), destination_pin: String(fd.get('destination_pin')||'').trim(),
    weight_kg: Number(fd.get('weight_kg')), service: String(fd.get('service')||''), notes: String(fd.get('notes')||'').trim()
  };
  if(!/^\d{6}$/.test(row.origin_pin) || !/^\d{6}$/.test(row.destination_pin)) { setStatus('quoteStatus', 'Please enter valid six-digit Indian PIN codes.', 'error'); return; }
  currentQuoteLock = true; $('quoteSubmit').disabled = true; setStatus('quoteStatus','Submitting your enquiry…');
  const { error } = await supabase.from('quote_leads').insert(row);
  currentQuoteLock = false; $('quoteSubmit').disabled = false;
  if(error){ console.error(error); setStatus('quoteStatus', 'Could not send your enquiry. Please try again later.', 'error'); return; }
  form.reset(); setStatus('quoteStatus', 'Thanks! Your enquiry was received. Our team can review it in the portal.', 'success');
});

async function loadStaff(){
  if(!supabase || !session) return;
  const { data, error } = await supabase.from('staff_profiles').select('user_id,display_name,role,active').eq('user_id',session.user.id).maybeSingle();
  if(error || !data?.active){staff = null;return;}
  staff = data;
}
function showLogin(){ $('loginView').classList.remove('hidden');$('appView').classList.add('hidden'); }
function showApp(){ if(!staff){showLogin();return;} $('loginView').classList.add('hidden');$('appView').classList.remove('hidden'); $('welcome').textContent = `${staff.display_name || session?.user?.email || 'Staff'} · ${staff.role || 'staff'}`; }
$('loginForm').addEventListener('submit',async e => {
  e.preventDefault(); if(!supabase){setStatus('loginStatus','Please configure Supabase before signing in.','error');return;}
  const fd = new FormData(e.currentTarget);
  setStatus('loginStatus','Signing in…');
  const {data,error} = await supabase.auth.signInWithPassword({email:String(fd.get('email')),password:String(fd.get('password'))});
  if(error){setStatus('loginStatus','Sign-in failed. Check credentials and access.','error');return;}
  session=data.session;
  await loadStaff();
  if(!staff){ await supabase.auth.signOut();session=null;setStatus('loginStatus','This account is not authorized for NationXpress operations.','error');return;}
  e.currentTarget.reset();setStatus('loginStatus','');showApp();await refresh();
});
$('signout').addEventListener('click',async ()=> {if(supabase)await supabase.auth.signOut();session=null;staff=null;showLogin();});
async function refresh(){
  if(!supabase || !session || !staff) return;
  const [s,r,l] = await Promise.all([
    supabase.from('shipments').select('*').order('shipment_date',{ascending:false}).limit(5000),
    supabase.from('party_rates').select('*').order('party'),
    supabase.from('quote_leads').select('*').order('created_at',{ascending:false}).limit(500)
  ]);
  if(s.error || r.error || l.error){ alert('Some records could not load. Confirm Supabase SQL schema and staff access policies.'); console.error(s.error,r.error,l.error); }
  shipments=s.data||[];rates=r.data||[];leads=l.data||[];
  renderAll();
}
function rateFor(s){return rates.find(r=>r.vendor?.toLowerCase()===s.vendor?.toLowerCase() && r.party?.toLowerCase()===s.from_party?.toLowerCase());}
function amounts(s){const rate=rateFor(s);if(!rate)return null;const weight=Number(s.weight_kg)||0;const cost=weight*Number(rate.cost_per_kg||0), billing=weight*Number(rate.sell_per_kg||0);return {cost,billing,margin:billing-cost};}
function stats(){const calculated=shipments.map(amounts).filter(Boolean); const total=key=>calculated.reduce((a,b)=>a+b[key],0);
  const cards=[['Total shipments',shipments.length],['Vendor freight cost',rupees(total('cost'))],['Customer billing',rupees(total('billing'))],['Est. gross margin',rupees(total('margin'))]];
  $('stats').innerHTML=cards.map(([label,value])=>`<div class="stat"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div>`).join('');
}
function badge(value){let v=String(value||'');let clazz=v==='Delivered'||v==='Reconciled'?'green':v==='Exception'?'red':v==='Pending'?'amber':'';return `<span class="tag ${clazz}">${escapeHtml(v||'—')}</span>`;}
function renderShipments(){let q=$('shipmentSearch').value.trim().toLowerCase(),v=$('shipmentVendor').value,st=$('shipmentStatus').value;
  let result=shipments.filter(s=>(!v||s.vendor===v)&&(!st||s.status===st)&&(!q||[s.docket,s.from_party,s.ship_to_party,s.from_location,s.ship_to_location,s.vendor].some(x=>String(x||'').toLowerCase().includes(q))));
  $('shipmentRows').innerHTML=result.map(s=>`<tr><td><b>${escapeHtml(s.docket)}</b></td><td>${dateOnly(s.shipment_date)}</td><td>${escapeHtml(s.vendor)}</td><td>${escapeHtml(s.from_party)}</td><td>${escapeHtml(s.ship_to_party)}</td><td>${escapeHtml(s.from_location)} → ${escapeHtml(s.ship_to_location)}</td><td>${escapeHtml(s.weight_kg)} kg</td><td>${escapeHtml(s.art)}</td><td>${badge(s.status)}</td><td>${badge(s.billing_status)}</td><td>${amounts(s)?rupees(amounts(s).margin):'<span class="tag amber">Rate missing</span>'}</td><td><button class="table-button" data-edit-shipment="${escapeHtml(s.id)}">Edit</button></td></tr>`).join('') || '<tr><td colspan="12" class="empty">No shipments yet. Add a shipment or import a CSV to get started.</td></tr>';
  $('shipmentCount').textContent=`Showing ${result.length} of ${shipments.length} shipments · Up to 5,000 latest records loaded`;
  $('shipmentVendor').innerHTML='<option value="">All carriers</option>'+vendors.concat([...new Set(shipments.map(s=>s.vendor))].filter(v=>!vendors.includes(v))).map(x=>`<option value="${escapeHtml(x)}" ${x===v?'selected':''}>${escapeHtml(x)}</option>`).join('');
}
function renderRates(){ $('rateRows').innerHTML = rates.map(r=>`<tr><td>${escapeHtml(r.vendor)}</td><td>${escapeHtml(r.party)}</td><td>${rupees(r.cost_per_kg)}</td><td>${rupees(r.sell_per_kg)}</td><td>${rupees(Number(r.sell_per_kg)-Number(r.cost_per_kg))}</td><td><button class="table-button" data-edit-rate="${escapeHtml(r.id)}">Edit</button></td></tr>`).join('') || '<tr><td colspan="6" class="empty">No party rates yet.</td></tr>'; }
function renderLeads(){ $('leadRows').innerHTML = leads.map(l=>{const customerPhone=String(l.phone||'').replace(/\D/g,'');const digits=customerPhone.length===10?'91'+customerPhone:customerPhone;const safePhone=/^[1-9]\d{9,14}$/.test(digits)?digits:'';const message=encodeURIComponent(`Hello ${l.contact_name}, this is NationXpress Enterprises regarding your freight enquiry from ${l.origin_pin} to ${l.destination_pin}.`);return `<tr><td>${new Date(l.created_at).toLocaleDateString('en-IN')}</td><td>${escapeHtml(l.company)}</td><td>${escapeHtml(l.contact_name)}</td><td><a href="mailto:${encodeURIComponent(l.email)}">${escapeHtml(l.email)}</a></td><td>${escapeHtml(l.phone)}</td><td>${escapeHtml(l.origin_pin)} → ${escapeHtml(l.destination_pin)}</td><td>${escapeHtml(l.service)}</td><td>${escapeHtml(l.weight_kg)} kg</td><td><select class="lead-status" data-lead-status="${escapeHtml(l.id)}" aria-label="Enquiry status">${['New','Contacted','Quoted','Won','Lost'].map(v=>`<option value="${v}" ${l.status===v?'selected':''}>${v}</option>`).join('')}</select></td><td>${safePhone?`<a class="lead-action" target="_blank" rel="noopener noreferrer" href="https://wa.me/${safePhone}?text=${message}">WhatsApp ↗</a>`:'—'}</td></tr>`;}).join('') || '<tr><td colspan="10" class="empty">No online enquiries received.</td></tr>'; }
function pendingActions(){let a=[];leads.filter(l=>!l.status||l.status==='New').forEach(l=>a.push({title:'New quotation enquiry',detail:`${l.company} · ${l.phone} · ${l.origin_pin} → ${l.destination_pin}`}));shipments.forEach(s=>{if(!rateFor(s))a.push({title:'Missing customer/vendor rate',detail:`${s.docket} · ${s.from_party} · ${s.vendor}`});if(s.status==='Exception')a.push({title:'Delivery exception',detail:`${s.docket} · ${s.ship_to_party}`});else if(s.status!=='Delivered')a.push({title:'Delivery follow-up',detail:`${s.docket} · ${s.status}`});if(s.billing_status!=='Reconciled')a.push({title:'Billing / reconciliation pending',detail:`${s.docket} · ${s.billing_status}`});const amt=amounts(s);if(amt&&amt.margin<0)a.push({title:'Negative margin — check rates',detail:`${s.docket} · ${rupees(amt.margin)}`});if(!s.ship_to_party||!s.from_location||!s.ship_to_location)a.push({title:'Missing shipment fields',detail:s.docket});});return a;}
function renderActions(){const actions=pendingActions();$('actionRows').innerHTML=actions.length?actions.slice(0,200).map(a=>`<div class="action-item"><strong>${escapeHtml(a.title)}</strong><small>${escapeHtml(a.detail)}</small></div>`).join(''):'<div class="empty">No outstanding exceptions in the loaded records.</div>';}
function renderAll(){stats();renderShipments();renderRates();renderLeads();renderActions();}
$('shipmentSearch').addEventListener('input',renderShipments);$('shipmentVendor').addEventListener('change',renderShipments);$('shipmentStatus').addEventListener('change',renderShipments);
document.querySelectorAll('[data-tab]').forEach(b=>b.addEventListener('click',()=>{currentTab=b.dataset.tab; document.querySelectorAll('[data-tab]').forEach(x=>x.classList.toggle('active',x===b));document.querySelectorAll('.tab-panel').forEach(s=>s.classList.toggle('hidden',s.id!=='tab-'+currentTab));}));

const shipmentFields=[
  ['docket','Docket Number','text',true],['shipment_date','Date','date',true],['vendor','Vendor','vendor',true],
  ['weight_kg','Chargeable Weight (kg)','number',true],['from_party','From Party Name','text',true],['ship_to_party','Ship-To Party Name','text',true],
  ['from_location','From Location','text',true],['ship_to_location','Ship-To Location','text',true],['art','ART (pieces)','integer',true],
  ['status','Shipment Status','status',true],['billing_status','Billing Status','billing',true],['notes','Shipment Notes','text',false]
];
const rateFields=[['vendor','Vendor','vendor',true],['party','Customer / From Party','text',true],['cost_per_kg','Vendor Cost / kg (₹)','number',true],['sell_per_kg','Customer Bill / kg (₹)','number',true]];
function fieldMarkup([name,title,type,required],value=''){
  const safe=escapeHtml(value??''); const req=required?'required':'';
  if(type==='vendor'||type==='status'||type==='billing'){
    const items=type==='vendor'?vendors:type==='status'?['Pending','In transit','Delivered','Exception']:['Pending','Billed','Reconciled'];
    return `<label>${escapeHtml(title)}${required?' *':''}<select name="${name}" ${req}>${items.map(x=>`<option value="${escapeHtml(x)}" ${x===value?'selected':''}>${escapeHtml(x)}</option>`).join('')}</select></label>`;
  }
  const inputType=type==='number'||type==='integer'?'number':type;
  const attr=inputType==='number'?`min="0" step="${type==='integer'?'1':'0.01'}"`:type==='text'?'maxlength="200"':'';
  return `<label>${escapeHtml(title)}${required?' *':''}<input name="${name}" type="${inputType}" value="${safe}" ${attr} ${req}></label>`;
}
function openEditor(mode,id=null){
  editorMode=mode;editingId=id;
  const values=mode==='shipment'?shipments.find(s=>s.id===id)||{}:rates.find(r=>r.id===id)||{};
  $('editorTitle').textContent=`${id?'Edit':'New'} ${mode==='shipment'?'shipment':'party rate'}`;
  $('editorFields').innerHTML=(mode==='shipment'?shipmentFields:rateFields).map(f=>fieldMarkup(f,values[f[0]])).join('');
  setStatus('editorStatus','');$('editor').showModal();
}
$('newShipment').addEventListener('click',()=>openEditor('shipment'));
$('newRate').addEventListener('click',()=>openEditor('rate'));
$('shipmentRows').addEventListener('click',e=>{const b=e.target.closest('[data-edit-shipment]');if(b)openEditor('shipment',b.dataset.editShipment);});
$('rateRows').addEventListener('click',e=>{const b=e.target.closest('[data-edit-rate]');if(b)openEditor('rate',b.dataset.editRate);});
$('closeEditor').addEventListener('click',()=>$('editor').close());$('cancelEditor').addEventListener('click',()=>$('editor').close());
$('editorForm').addEventListener('submit',async e=>{
  e.preventDefault();if(!session||!staff)return;
  const fd=new FormData(e.currentTarget);const values=Object.fromEntries(fd.entries());
  let table = editorMode==='shipment'?'shipments':'party_rates';
  let row;
  if(editorMode==='shipment'){
    row={docket:String(values.docket||'').trim(),shipment_date:values.shipment_date,vendor:values.vendor,weight_kg:Number(values.weight_kg),from_party:String(values.from_party||'').trim(),ship_to_party:String(values.ship_to_party||'').trim(),from_location:String(values.from_location||'').trim(),ship_to_location:String(values.ship_to_location||'').trim(),art:Number(values.art),status:values.status,billing_status:values.billing_status,notes:String(values.notes||'').trim()};
    if(!row.docket||!row.from_party||!row.ship_to_party||row.weight_kg<0||!Number.isInteger(row.art)){setStatus('editorStatus','Please check required fields and weight / ART values.','error');return;}
  }else{
    row={vendor:values.vendor,party:String(values.party||'').trim(),cost_per_kg:Number(values.cost_per_kg),sell_per_kg:Number(values.sell_per_kg)};
    if(!row.party||row.cost_per_kg<0||row.sell_per_kg<0){setStatus('editorStatus','Check the party and rates.','error');return;}
  }
  $('saveEditor').disabled=true;setStatus('editorStatus','Saving…');
  const req=editingId?supabase.from(table).update(row).eq('id',editingId):supabase.from(table).insert(row);
  const {error}=await req;
  $('saveEditor').disabled=false;
  if(error){setStatus('editorStatus',`Save failed: ${safeError(error)}`,'error');return;}
  $('editor').close();await refresh();
});

function csvRows(text){
  if(text.charCodeAt(0)===0xFEFF)text=text.slice(1);
  let result=[],row=[],cell='',quoted=false;
  for(let i=0;i<text.length;i++){
    const c=text[i];
    if(c==='"'){if(quoted && text[i+1]==='"'){cell+='"';i++;}else quoted=!quoted;}
    else if(c===','&&!quoted){row.push(cell);cell='';}
    else if((c==='\n'||c==='\r')&&!quoted){if(c==='\r'&&text[i+1]==='\n')i++;row.push(cell);if(row.some(v=>v.trim()))result.push(row);row=[];cell='';}
    else cell+=c;
  }
  if(quoted)throw new Error('CSV contains an unclosed quote.');
  if(cell||row.length){row.push(cell);if(row.some(v=>v.trim()))result.push(row);}
  return result;
}
const canonical = h => String(h||'').trim().toLowerCase().replace(/[^a-z0-9]/g,'');
const headerAliases={docket:['docket','docketnumber','awbno','awb','lrn','waybillno'],weight_kg:['weight','weightkg','chargedweight','chargeableweight','chargeableweightkg'],shipment_date:['date','shipmentdate','pickupdate'],from_party:['fromparty','frompartyname','shippername','clientname'],ship_to_party:['to','shiptoparty','shiptopartyname','receivername','consigneename'],from_location:['origin','fromlocation','pickuplocation'],ship_to_location:['destination','shiptolocation','deliverylocation'],art:['art','pieces','packages'],vendor:['vendor','carrier','cargoname'],status:['status','shipmentstatus','laststatusdesc'],billing_status:['billing','billingstatus']};
$('csvImportButton').addEventListener('click',()=>$('csvFile').click());
$('csvFile').addEventListener('change',async e=>{
  const file=e.currentTarget.files?.[0];if(!file)return;
  if(file.size>3*1024*1024){alert('CSV must be smaller than 3 MB.');e.currentTarget.value='';return;}
  try{
    const rows=csvRows(await file.text());if(rows.length<2)throw new Error('CSV has no data.');
    const headers=rows.shift().map(canonical);const find=key=>headerAliases[key].map(canonical).map(alias=>headers.indexOf(alias)).find(i=>i>=0);
    const required=['docket','weight_kg','shipment_date','from_party','ship_to_party','from_location','ship_to_location','art','vendor'];
    if(required.some(x=>find(x)===undefined))throw new Error('Required columns: Docket Number, Weight, Date, From Party Name, Ship-To Party Name, From Location, Ship-To Location, ART, Vendor.');
    const clean=[];
    for(const cells of rows){const get=k=>{let i=find(k);return i===undefined?'':String(cells[i]||'').trim();};let d=get('shipment_date');
      if(/^\d{2}-[A-Za-z]{3}-\d{2,4}$/.test(d)){const [day,month,y]=d.split('-');const dt=new Date(`${day} ${month} ${y.length===2?'20'+y:y}`);d=Number.isFinite(+dt)?dt.toISOString().slice(0,10):'';}
      else if(/^\d{2}\/\d{2}\/\d{4}$/.test(d)){const [day,month,y]=d.split('/');d=`${y}-${month}-${day}`;}
      const row={docket:get('docket'),weight_kg:Number(get('weight_kg')),shipment_date:d,from_party:get('from_party'),ship_to_party:get('ship_to_party'),from_location:get('from_location'),ship_to_location:get('ship_to_location'),art:Number(get('art')),vendor:get('vendor'),status:get('status')||'Pending',billing_status:get('billing_status')||'Pending'};
      if(!row.docket||!row.vendor||!row.from_party||!/^\d{4}-\d{2}-\d{2}$/.test(row.shipment_date)||!Number.isFinite(row.weight_kg)||row.weight_kg<0||!Number.isInteger(row.art)||row.art<0)continue;
      clean.push(row);
    }
    if(!clean.length)throw new Error('No valid rows. Verify dates (YYYY-MM-DD or DD/MM/YYYY), weights and docket numbers.');
    if(clean.length>500)throw new Error('Please upload up to 500 rows at a time.');
    const {error}=await supabase.from('shipments').upsert(clean,{onConflict:'vendor,docket',ignoreDuplicates:true});
    if(error)throw error;await refresh();alert(`Imported or skipped ${clean.length} valid CSV rows. Existing vendor+docket records were preserved.`);
  }catch(err){alert('Import failed: '+safeError(err));}finally{e.currentTarget.value='';}
});

function safeCsv(v){const str=String(v??'');const clean=/^[\s]*[=+@\-\t\r]/.test(str)?"'"+str:str;return '"'+clean.replace(/"/g,'""')+'"';}
function downloadCsv(filename,headers,rows){const csv='\uFEFF'+[headers,...rows].map(row=>row.map(safeCsv).join(',')).join('\r\n');const blob=new Blob([csv],{type:'text/csv;charset=utf-8'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=filename;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),3000);}
$('exportMis').addEventListener('click',()=>downloadCsv('nationxpress-shipment-mis.csv',['Docket Number','Weight','Date','From Party Name','Ship-To Party Name','From Location','Ship-To Location','ART'],shipments.map(s=>[s.docket,s.weight_kg,s.shipment_date,s.from_party,s.ship_to_party,s.from_location,s.ship_to_location,s.art])));
$('exportBilling').addEventListener('click',()=>downloadCsv('nationxpress-billing.csv',['Docket Number','Date','Vendor','From Party','Ship-To Party','Weight','Cost/kg','Bill/kg','Vendor Cost','Customer Billing','Gross Margin','Shipment Status','Billing Status'],shipments.map(s=>{let r=rateFor(s),a=amounts(s);return[s.docket,s.shipment_date,s.vendor,s.from_party,s.ship_to_party,s.weight_kg,r?.cost_per_kg??'',r?.sell_per_kg??'',a?.cost??'',a?.billing??'',a?.margin??'',s.status,s.billing_status]})));
$('exportRates').addEventListener('click',()=>downloadCsv('nationxpress-party-rates.csv',['Vendor','Customer Party','Cost per kg','Billing per kg'],rates.map(r=>[r.vendor,r.party,r.cost_per_kg,r.sell_per_kg])));

$('leadRows').addEventListener('change', async event => {
  const target = event.target;
  if (!target.matches('[data-lead-status]') || !supabase || !staff) return;
  const id=target.dataset.leadStatus, next=target.value;
  if (!['New','Contacted','Quoted','Won','Lost'].includes(next)) return;
  const lead=leads.find(l=>l.id===id); if(!lead)return;
  const previous=lead.status||'New';target.disabled=true;
  const {error}=await supabase.from('quote_leads').update({status:next}).eq('id',id);
  target.disabled=false;
  if(error){target.value=previous;alert('Could not save status. Check Supabase policies.');return;}
  lead.status=next;renderActions();
});
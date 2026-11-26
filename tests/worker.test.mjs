import test from 'node:test';import assert from 'node:assert/strict';
import {DEFAULTS,dayKey} from '../extension/core/policy.mjs';
class Event {listeners=[];addListener(fn){this.listeners.push(fn);}fire(...args){return Promise.all(this.listeners.map(f=>f(...args)));}}
function area(){let data={};return {async get(keys){if(typeof keys==='string')keys=[keys];return Object.fromEntries(keys.filter(k=>k in data).map(k=>[k,structuredClone(data[k])]))},async set(v){Object.assign(data,structuredClone(v))},async remove(keys){for(const k of Array.isArray(keys)?keys:[keys])delete data[k]},async setAccessLevel(){},clear(){data={}}};}
const local=area(),session=area();let requests=0,removed=[],snapshots={};let tabs=[{id:7,windowId:2,title:'Fixture',url:'https://example.com/task',active:false}];
globalThis.chrome={storage:{local,session},runtime:{id:'fixture-extension',onMessage:new Event(),onInstalled:new Event(),onStartup:new Event(),sendMessage:async()=>{},connectNative(){throw new Error('native deliberately unused')}},tabs:{onActivated:new Event(),onUpdated:new Event(),onRemoved:new Event(),onAttached:new Event(),onReplaced:new Event(),async query(){return tabs},async get(id){const t=tabs.find(t=>t.id===id);if(!t)throw Error('absent');return t},async sendMessage(id,message){if(message.type==='snapshot')return snapshots[id];return {ok:true}},async remove(id){removed.push(id)},async update(id,change){Object.assign(tabs.find(t=>t.id===id),change);return tabs.find(t=>t.id===id)}},windows:{async get(){return {left:0,top:0,width:1000,height:800}},async update(){}},permissions:{async contains(){return true}},alarms:{onAlarm:new Event(),async clear(){},async create(){}},sidePanel:{async setPanelBehavior(){}}};
chrome.runtime.getURL=path=>'chrome-extension://fixture-extension/'+path;
chrome.contextMenus={onClicked:new Event()};
chrome.action={async setBadgeText(){},async setTitle(){}};
globalThis.fetch=async()=>{requests++;return {ok:true,async json(){return {answers:[{type:'choice',name:'lifecycle',choice:'close',confidence:.99,probabilities:[{value:'close',probability:.99}]}],usage:{input_tokens:100,output_tokens:0}}}}};
await import('../extension/worker.mjs');
const send=(message,sender={id:chrome.runtime.id})=>new Promise(resolve=>chrome.runtime.onMessage.listeners[0](message,sender,resolve));
async function reset(){local.clear();session.clear();requests=0;removed=[];tabs=[{id:7,windowId:2,title:'Fixture',url:'https://example.com/task',active:false}];snapshots[7]={at:Date.now(),editable:false,dirty:false,media:false,excerpt:'Finished throwaway duplicate',lastInteraction:Date.now()-120000};await session.set({apiKey:'fixture-key',apiKeyOrigin:'https://api.openai.com'});await local.set({settings:DEFAULTS});}
test('worker persists usage and reuses identical decision without another request',async()=>{await reset();assert((await send({type:'analyze',tabId:7})).ok);const second=await send({type:'analyze',tabId:7});assert(second.data.skipped);assert.equal(requests,1);assert.equal((await local.get(['ledger'])).ledger.requests,1);});
test('legacy daily caps cannot block an actual worker API request above the old totals',async()=>{await reset();await local.set({settings:{...DEFAULTS,maxRequests:20,maxTokens:80000},ledger:{date:dayKey(),requests:200,tokens:1000000,cost:0}});const response=await send({type:'testAPI'});assert.equal(response.ok,true);assert.equal(requests,1);assert.equal((await local.get('ledger')).ledger.requests,201);const state=(await send({type:'state'})).data;assert.equal('maxRequests' in state.settings,false);assert.equal('maxTokens' in state.settings,false);assert((await send({type:'saveSettings',settings:{...state.settings,maxRequests:1,maxTokens:4096}})).ok);const saved=(await local.get('settings')).settings;assert.equal('maxRequests' in saved,false);assert.equal('maxTokens' in saved,false);});
test('changing provider origin never reuses a key saved for another origin',async()=>{await reset();assert((await send({type:'saveSettings',settings:{...DEFAULTS,provider:'chat',endpoint:'https://different.example/v1'}})).ok);assert.equal((await send({type:'state'})).data.keyPresent,false);assert.equal((await send({type:'testAPI'})).ok,false);assert.equal(requests,0);});
test('content scripts cannot invoke cloud calls or configure keys',async()=>{await reset();const sender={id:chrome.runtime.id,tab:tabs[0]};assert.equal((await send({type:'testAPI'},sender)).ok,false);assert.equal((await send({type:'saveSettings',apiKey:'untrusted'},sender)).ok,false);assert.equal(requests,0);});
test('close arm requires visible lease and editing vetoes it',async()=>{await reset();await send({type:'analyze',tabId:7});assert.equal((await send({type:'armClose',tabId:7})).ok,false);await send({type:'lease',visible:true,windowId:2,tabIds:[7]});snapshots[7].dirty=true;assert.equal((await send({type:'armClose',tabId:7})).ok,false);snapshots[7].dirty=false;assert((await send({type:'armClose',tabId:7})).ok);await send({type:'pardon',tabId:7});assert.equal((await local.get('records')).records[7].closeAt,null);assert.equal(removed.length,0);});
test('recovery after service worker/browser restart cancels persisted countdown',async()=>{await reset();await local.set({records:{7:{state:'closing',tabId:7,windowId:2,url:tabs[0].url,closeAt:Date.now()-1000,hash:'h'}}});await chrome.runtime.onStartup.fire();await send({type:'state'});assert.equal((await local.get('records')).records[7].state,'keep');assert.equal(removed.length,0);});

test('hover pause preserves remaining time and resumes only with fresh visible lease',async()=>{
 await reset();await send({type:'analyze',tabId:7});await send({type:'lease',visible:true,windowId:2,tabIds:[7]});await send({type:'armClose',tabId:7});
 assert((await send({type:'pauseClose',tabId:7,paused:true})).ok);let record=(await local.get('records')).records[7];assert.equal(record.state,'paused');assert(record.remainingMs>28000&&record.remainingMs<=30000);assert.equal(record.closeAt,null);
 assert((await send({type:'pauseClose',tabId:7,paused:false})).ok);record=(await local.get('records')).records[7];assert.equal(record.state,'closing');assert(record.closeAt>Date.now());assert.equal(removed.length,0);
});
test('filtering a countdown row out of view cancels closure',async()=>{
 await reset();await send({type:'analyze',tabId:7});await send({type:'lease',visible:true,windowId:2,tabIds:[7]});await send({type:'armClose',tabId:7});
 await send({type:'lease',visible:true,windowId:2,tabIds:[]});assert.equal((await local.get('records')).records[7].state,'keep');assert.equal(removed.length,0);
});
test('normal tab activation preserves a running local watch',async()=>{
 await reset();await send({type:'watch',tabId:7,adapter:{waiting:'Running',done:'Completed'}});await chrome.tabs.onActivated.fire({tabId:7});await send({type:'state'});
 const r=(await local.get('records')).records[7];assert.equal(r.state,'waiting');assert.equal(r.watching,true);assert.equal(r.pardonUntil,undefined);
});
test('page changes after sending preview require a new preview, without API spend',async()=>{
 await reset();const response=await send({type:'analyze',tabId:7,expectedHash:'previous-content-hash'});assert.equal(response.ok,false);assert.equal(requests,0);
});
test('local pardon completes while a cloud request is still in flight and cannot be overwritten',async()=>{
 await reset();const original=globalThis.fetch;let release,completed=false;
 globalThis.fetch=()=>new Promise(resolve=>{release=()=>resolve({ok:true,json:async()=>({answers:[{type:'choice',name:'lifecycle',choice:'close',confidence:.99,probabilities:[{value:'close',probability:.99}]}],usage:{input_tokens:10,output_tokens:0}})});});
 const pending=send({type:'analyze',tabId:7}).then(r=>{completed=true;return r;});
 try{
  for(let i=0;i<20&&!release;i++)await new Promise(resolve=>setImmediate(resolve));assert(release);
  const canceled=await Promise.race([send({type:'pardon',tabId:7}),new Promise((_,reject)=>setTimeout(()=>reject(Error('Pardon blocked by API')),150))]);
  assert(canceled.ok);assert.equal(completed,false);release();const result=await pending;assert(result.data.skipped);assert.equal((await local.get('records')).records[7].state,'keep');
 }finally{globalThis.fetch=original;if(!completed&&release){release();await pending;}}
});
test('low confidence model output remains a protected confirmation item',async()=>{
 await reset();const original=globalThis.fetch;
 globalThis.fetch=async()=>({ok:true,json:async()=>({answers:[{type:'choice',name:'lifecycle',choice:'close',confidence:.3,probabilities:[{value:'close',probability:.8}]}],usage:{input_tokens:10,output_tokens:0}})});
 try{await send({type:'analyze',tabId:7});assert.equal((await local.get('records')).records[7].state,'uncertain');await send({type:'lease',visible:true,windowId:2,tabIds:[7]});assert.equal((await send({type:'armClose',tabId:7})).ok,false);}
 finally{globalThis.fetch=original;}
});
test('organization applies only a current preview and is reversible',async()=>{
 await reset();tabs=[{id:7,windowId:2,title:'A',url:'https://example.com/a',index:0,groupId:-1},{id:8,windowId:2,title:'B',url:'https://example.com/b',index:1,groupId:-1}];
 let nextGroup=100;const reindex=()=>tabs.forEach((t,i)=>t.index=i);
 chrome.tabs.group=async({tabIds})=>{const id=nextGroup++;for(const t of tabs)if(tabIds.includes(t.id))t.groupId=id;return id;};
 chrome.tabs.ungroup=async(ids)=>{for(const t of tabs)if(ids.includes(t.id))t.groupId=-1;};
 chrome.tabs.move=async(id,{index})=>{const i=tabs.findIndex(t=>t.id===id),[t]=tabs.splice(i,1);tabs.splice(index,0,t);reindex();};
 chrome.tabGroups={update:async()=>{},move:async(id,{index})=>{if(index===-1){const group=tabs.filter(t=>t.groupId===id);tabs=[...tabs.filter(t=>t.groupId!==id),...group];reindex();}}};
 const plan=(await send({type:'organizationPlan',windowId:2})).data;assert.equal(plan.tabCount,2);
 assert((await send({type:'organize',plan})).ok);assert(tabs.every(t=>t.groupId===100));assert((await send({type:'undoOrganization'})).ok);assert(tabs.every(t=>t.groupId===-1));assert.deepEqual(tabs.map(t=>t.id),[7,8]);
 const stale=(await send({type:'organizationPlan',windowId:2})).data;tabs[1].url='https://example.com/new';assert.equal((await send({type:'organize',plan:stale})).ok,false);
});

test('failed cloud work revokes automatic review instead of retrying repeatedly',async()=>{
 await reset();const original=globalThis.fetch;
 globalThis.fetch=async()=>{requests++;throw Error('Synthetic transport failure');};
 try{const result=await send({type:'analyze',tabId:7,autoReview:true});assert.equal(result.ok,false);const r=(await local.get('records')).records[7];assert.equal(r.autoReview,false);assert.match(r.apiIssue,/手动重试/);assert.equal(requests,1);}
 finally{globalThis.fetch=original;}
});

test('a hidden panel in another window does not revoke this windows visible reminder',async()=>{
 await reset();await send({type:'analyze',tabId:7});await send({type:'lease',visible:true,windowId:2,tabIds:[7]},{id:chrome.runtime.id,documentId:'visible-pane'});await send({type:'armClose',tabId:7});
 await send({type:'lease',visible:false,windowId:3,tabIds:[]},{id:chrome.runtime.id,documentId:'background-pane'});
 assert.equal((await local.get('records')).records[7].state,'closing');
});
test('new content invalidates a close suggestion and a running countdown',async()=>{
 await reset();await send({type:'analyze',tabId:7});await send({type:'lease',visible:true,windowId:2,tabIds:[7]});
 snapshots[7].excerpt='A new task has started';assert.equal((await send({type:'armClose',tabId:7})).ok,false);
 snapshots[7].excerpt='Finished throwaway duplicate';assert((await send({type:'armClose',tabId:7})).ok);
 const {records}=await local.get('records');records[7].closeAt=Date.now()-1;records[7].remainingMs=0;await local.set({records});snapshots[7].excerpt='New background work';
 await chrome.alarms.onAlarm.fire({name:'close:7'});await send({type:'state'});assert.equal(removed.length,0);assert.equal((await local.get('records')).records[7].state,'keep');
});
test('failed browser removal keeps the page and does not advertise a reopened copy',async()=>{
 await reset();await send({type:'analyze',tabId:7});await send({type:'lease',visible:true,windowId:2,tabIds:[7]});await send({type:'armClose',tabId:7});
 const {records}=await local.get('records');records[7].closeAt=Date.now()-1;records[7].remainingMs=0;await local.set({records});const original=chrome.tabs.remove;chrome.tabs.remove=async()=>{throw Error('Synthetic browser refusal');};
 try{await chrome.alarms.onAlarm.fire({name:'close:7'});await send({type:'state'});assert.equal((await local.get('records')).records[7].state,'keep');assert.equal((await session.get('recentClosed')).recentClosed?.length||0,0);}
 finally{chrome.tabs.remove=original;}
});

test('mutations beyond the bounded excerpt still cancel a countdown',async()=>{await reset();snapshots[7].revision=1;await send({type:'analyze',tabId:7});await send({type:'lease',visible:true,windowId:2,tabIds:[7]});await send({type:'armClose',tabId:7});const {records}=await local.get('records');records[7].closeAt=Date.now()-1;records[7].remainingMs=0;await local.set({records});snapshots[7].revision=2;await chrome.alarms.onAlarm.fire({name:'close:7'});await send({type:'state'});assert.equal(removed.length,0);assert.equal((await local.get('records')).records[7].state,'keep');});

test('cleanup below the execution threshold is a confirmation item rather than an unusable close action',async()=>{await reset();const original=globalThis.fetch;globalThis.fetch=async()=>({ok:true,json:async()=>({answers:[{type:'choice',name:'lifecycle',choice:'close',confidence:.9,probabilities:[{value:'close',probability:.99}]}],usage:{input_tokens:10,output_tokens:0}})});try{await send({type:'analyze',tabId:7});assert.equal((await local.get('records')).records[7].state,'uncertain');}finally{globalThis.fetch=original;}});


test('a cold native connection waits for capabilities; native hover and keep control the actual worker countdown',async()=>{
 await reset();const original=chrome.runtime.connectNative;const messages=[];
 const port={onMessage:new Event(),onDisconnect:new Event(),postMessage(message){messages.push(message);if(message.type==='hello')setTimeout(()=>port.onMessage.fire({type:'status',status:'ready',capabilities:['countdown-v1','visibility-v1']}),20);}};
 chrome.runtime.connectNative=()=>port;
 try{
  await local.set({settings:{...DEFAULTS,nativeEnabled:true}});await send({type:'analyze',tabId:7});await send({type:'lease',visible:true,windowId:2,tabIds:[7]});
  assert((await send({type:'armClose',tabId:7})).ok);assert(messages.some(m=>m.type==='show'&&m.overlay.kind==='countdown'));
  const armed=(await local.get('records')).records[7];await port.onMessage.fire({type:'closeVisibility',tabId:7,visibilityId:armed.visibilityId,visible:true});await send({type:'state'});
  await port.onMessage.fire({type:'closeHover',tabId:7,paused:true});await send({type:'state'});assert.equal((await local.get('records')).records[7].state,'paused');
  await port.onMessage.fire({type:'closeHover',tabId:7,paused:false});await send({type:'state'});assert.equal((await local.get('records')).records[7].state,'closing');
  await port.onMessage.fire({type:'pardon',tabId:7});await send({type:'state'});assert.equal((await local.get('records')).records[7].state,'keep');assert(messages.some(m=>m.type==='hide'));
 }finally{await port.onDisconnect.fire();chrome.runtime.connectNative=original;}
});

test('a successful safe close is offered for URL recovery, and reopening consumes the recovery entry',async()=>{
 await reset();const original=chrome.tabs.create;let opened;
 chrome.tabs.create=async options=>{opened=options;return {id:8,...options};};
 try{
  await send({type:'analyze',tabId:7});await send({type:'lease',visible:true,windowId:2,tabIds:[7]});await send({type:'armClose',tabId:7});
  const {records}=await local.get('records');records[7].closeAt=Date.now()-1;records[7].remainingMs=0;await local.set({records});await chrome.alarms.onAlarm.fire({name:'close:7'});await send({type:'state'});
  assert.deepEqual(removed,[7]);const {recentClosed}=await session.get('recentClosed');assert.equal(recentClosed.length,1);
  const restored=await send({type:'reopen',id:recentClosed[0].id});assert(restored.ok);assert.equal(opened.url,'https://example.com/task');assert.equal(opened.active,false);assert.equal((await session.get('recentClosed')).recentClosed.length,0);assert.equal(requests,1);
 }finally{chrome.tabs.create=original;}
});


test('remembered credentials restore asynchronously, stay out of state/local storage, and never block pardon',async()=>{
 await reset();await session.remove(['apiKey','apiKeyOrigin']);await local.set({settings:{...DEFAULTS,rememberKey:true,credentialRevision:crypto.randomUUID()},records:{7:{tabId:7,state:'closing',hash:'synthetic'}}});
 const original=chrome.runtime.connectNative;let release,ready;const started=new Promise(resolve=>ready=resolve);
 const port={onMessage:new Event(),onDisconnect:new Event(),postMessage(message){if(message.type==='hello')queueMicrotask(()=>port.onMessage.fire({type:'status',status:'ready',capabilities:['credentials-v1']}));if(message.type==='credential.load'){release=()=>port.onMessage.fire({type:'credentialResult',requestId:message.requestId,ok:true,found:true,origin:message.origin,apiKey:'synthetic-hidden-credential'});ready();}}};chrome.runtime.connectNative=()=>port;
 try{
  const first=await send({type:'state'});assert(first.ok);assert.equal(first.data.keyPresent,false);await started;
  const kept=await Promise.race([send({type:'pardon',tabId:7}),new Promise((_,reject)=>setTimeout(()=>reject(Error('Keychain blocked local cancellation')),150))]);assert(kept.ok);const revision=(await local.get('settings')).settings.credentialRevision;assert((await send({type:'saveSettings',scope:'usage',settings:{...DEFAULTS,cooldownSeconds:180}})).ok);assert.equal((await local.get('settings')).settings.credentialRevision,revision);release();
  for(let i=0;i<30&&!(await session.get('apiKey')).apiKey;i++)await new Promise(resolve=>setImmediate(resolve));
  const state=await send({type:'state'});assert(state.data.keyPresent);assert(!JSON.stringify(state).includes('synthetic-hidden-credential'));assert(!JSON.stringify(await local.get(['settings','credentialNamespace','records'])).includes('synthetic-hidden-credential'));assert.equal(requests,0);
 }finally{await port.onDisconnect.fire();chrome.runtime.connectNative=original;}
});

test('only a trusted settings save can remember a key, and forgetting clears persistence plus session',async()=>{
 await reset();const original=chrome.runtime.connectNative;const actions=[];
 const port={onMessage:new Event(),onDisconnect:new Event(),postMessage(message){if(message.type==='hello')queueMicrotask(()=>port.onMessage.fire({type:'status',status:'ready',capabilities:['credentials-v1','credentials-v2']}));if(message.type.startsWith('credential.')){actions.push(message.type);queueMicrotask(()=>port.onMessage.fire({type:'credentialResult',requestId:message.requestId,ok:true,saved:message.type==='credential.save'}));}}};chrome.runtime.connectNative=()=>port;
 try{
  const blocked=await send({type:'restoreKey'},{id:chrome.runtime.id,tab:tabs[0]});assert.equal(blocked.ok,false);assert.equal(actions.length,0);
  const saved=await send({type:'saveSettings',scope:'connection',rememberConsent:true,settings:{...DEFAULTS,rememberKey:true},apiKey:'synthetic-persisted-credential'});assert(saved.ok);assert.deepEqual(actions,['credential.save']);assert.equal((await local.get('settings')).settings.rememberKey,true);assert(!JSON.stringify(await local.get('settings')).includes('synthetic-persisted-credential'));
  assert((await send({type:'forgetKey'})).ok);assert.deepEqual(actions,['credential.save','credential.delete']);assert.equal((await local.get('settings')).settings.rememberKey,false);assert.equal((await session.get('apiKey')).apiKey,undefined);assert.equal(requests,0);
 }finally{await port.onDisconnect.fire();chrome.runtime.connectNative=original;}
});


test('usage settings cannot persist a hidden connection draft, and remembering requires explicit consent',async()=>{
 await reset();assert((await send({type:'saveSettings',scope:'usage',settings:{...DEFAULTS,rememberKey:true,endpoint:'https://different.example/v1',cooldownSeconds:180}})).ok);const saved=(await local.get('settings')).settings;assert.equal(saved.endpoint,DEFAULTS.endpoint);assert.equal(saved.rememberKey,false);assert.equal(saved.cooldownSeconds,180);
 const denied=await send({type:'saveSettings',scope:'connection',settings:{...DEFAULTS,rememberKey:true},apiKey:'synthetic-without-consent'});assert.equal(denied.ok,false);assert.match(denied.error,/保存位置/);assert.equal((await local.get('settings')).settings.rememberKey,false);assert.equal(requests,0);
});


test('unknown secret fields and invalid credential metadata never persist in settings or leak through state',async()=>{
 await reset();assert((await send({type:'saveSettings',settings:{...DEFAULTS,apiKey:'synthetic-extra-secret',credentialRevision:'synthetic-extra-secret'}})).ok);assert(!JSON.stringify((await local.get('settings')).settings).includes('synthetic-extra-secret'));assert(!JSON.stringify(await send({type:'state'})).includes('synthetic-extra-secret'));assert.equal(requests,0);
});


test('hidden Chrome pauses without pardon and the next visible interval resumes the same reminder',async()=>{
 await reset();await send({type:'analyze',tabId:7});await send({type:'lease',visible:true,windowId:2,tabIds:[7]});await send({type:'armClose',tabId:7});
 const first=(await local.get('records')).records[7];await send({type:'lease',visible:false,windowId:2,tabIds:[]});let r=(await local.get('records')).records[7];assert.equal(r.state,'paused');assert(r.visibilityPaused);assert.equal(r.remainingMs,30000);assert.equal(r.pardonUntil,undefined);
 await send({type:'pauseClose',tabId:7,paused:false});assert.equal((await local.get('records')).records[7].state,'paused','pointer leave cannot override hidden-window pause');
 await send({type:'lease',visible:true,windowId:2,tabIds:[7]});r=(await local.get('records')).records[7];assert.equal(r.state,'closing');assert.equal(r.remainingMs,first.remainingMs);assert.equal(r.visibilityId,first.visibilityId);assert.equal(removed.length,0);
});
test('an expired alarm cannot close a hidden page, even with an old visible lease',async()=>{
 await reset();await send({type:'analyze',tabId:7});await send({type:'lease',visible:true,windowId:2,tabIds:[7]});await send({type:'armClose',tabId:7});
 const {records}=await local.get('records');records[7].remainingMs=0;records[7].closeAt=Date.now()-1;await local.set({records});await session.set({chromeFocusedWindow:-1});await chrome.alarms.onAlarm.fire({name:'close:7'});await send({type:'state'});assert.equal(removed.length,0);assert.equal((await local.get('records')).records[7].state,'paused');
});
test('native occlusion pauses this generation and stale visibility cannot resume it',async()=>{
 await reset();const original=chrome.runtime.connectNative;const port={onMessage:new Event(),onDisconnect:new Event(),postMessage(m){if(m.type==='hello')queueMicrotask(()=>port.onMessage.fire({type:'status',status:'ready',capabilities:['countdown-v1','visibility-v1']}));}};chrome.runtime.connectNative=()=>port;
 try{await local.set({settings:{...DEFAULTS,nativeEnabled:true}});await send({type:'analyze',tabId:7});await send({type:'lease',visible:true,windowId:2,tabIds:[7]});await send({type:'armClose',tabId:7});let r=(await local.get('records')).records[7];assert.equal(r.state,'paused');const id=r.visibilityId;
 await port.onMessage.fire({type:'closeVisibility',tabId:7,visibilityId:'old',visible:true});await send({type:'state'});assert.equal((await local.get('records')).records[7].state,'paused');
 await port.onMessage.fire({type:'closeVisibility',tabId:7,visibilityId:id,visible:true});await send({type:'state'});assert.equal((await local.get('records')).records[7].state,'closing');
 await port.onMessage.fire({type:'closeVisibility',tabId:7,visibilityId:id,visible:false});await send({type:'state'});r=(await local.get('records')).records[7];assert.equal(r.state,'paused');assert(r.visibilityPaused);assert.equal(removed.length,0);
 }finally{await port.onDisconnect.fire();chrome.runtime.connectNative=original;}
});

async function waitQueue(predicate){for(let n=0;n<150;n++){const q=(await local.get('analysisQueue')).analysisQueue;if(predicate(q))return q;await new Promise(r=>setImmediate(r));}throw Error('Queue did not reach expected state');}
async function startQueue(){chrome.scripting={async executeScript(){}};const plan=(await send({type:'backlogPlan',windowId:2})).data;const result=await send({type:'backlogStart',planId:plan.id,origins:plan.sites.map(s=>s.origin),consent:true});assert.equal(result.ok,true);return plan;}
test('real worker backlog requires explicit plan consent and rejects content-script control',async()=>{
 await reset();const plan=(await send({type:'backlogPlan',windowId:2})).data;assert.equal(plan.count,1);assert.equal((await send({type:'backlogStart',planId:plan.id,origins:['https://example.com']})).ok,false);assert.equal((await send({type:'backlogStart',planId:plan.id,origins:['https://example.com'],consent:true},{id:chrome.runtime.id,tab:tabs[0]})).ok,false);assert.equal(requests,0);
});
test('real worker backlog analyzes an authorized page and never arms or performs closure',async()=>{
 await reset();await startQueue();await chrome.alarms.onAlarm.fire({name:'backlog'});const q=await waitQueue(q=>q?.phase==='complete');assert.equal(q.jobs[0].status,'analyzed');assert.equal(requests,1);assert.equal(removed.length,0);const r=(await local.get('records')).records[7];assert.equal(r.state,'suggested');assert.equal(r.closeAt,undefined);
});
test('a pinned, active and recently used page can be analyzed but cannot be closed',async()=>{
 await reset();
 Object.assign(tabs[0],{pinned:true,active:true,lastAccessed:Date.now()});
 const plan=await startQueue();
 assert.equal(plan.count,1);
 await chrome.alarms.onAlarm.fire({name:'backlog'});
 await waitQueue(queue=>queue?.phase==='complete');
 assert.equal(requests,1);
 const result=await send({type:'armClose',tabId:7});
 assert.equal(result.ok,false);
 assert.equal(removed.length,0);
});
test('real worker backlog leaves editors local and sends no API request',async()=>{
 await reset();snapshots[7].editable=true;await startQueue();await chrome.alarms.onAlarm.fire({name:'backlog'});const q=await waitQueue(q=>q?.phase==='complete');assert.equal(q.jobs[0].status,'skipped');assert.equal(requests,0);
});
test('backlog plan cannot send a page after URL or model configuration changes',async()=>{
 await reset();chrome.scripting={async executeScript(){}};let plan=(await send({type:'backlogPlan',windowId:2})).data;await local.set({settings:{...DEFAULTS,model:'changed-model'}});assert.equal((await send({type:'backlogStart',planId:plan.id,origins:['https://example.com'],consent:true})).ok,false);await local.set({settings:DEFAULTS});plan=await startQueue();tabs[0].url='https://different.example/private';await chrome.alarms.onAlarm.fire({name:'backlog'});const q=await waitQueue(q=>q?.phase==='complete');assert.equal(q.jobs[0].status,'skipped');assert.equal(requests,0);
});
test('queued analysis stays inside the confirmed service and full page URL during async capture',async()=>{
 for(const change of ['url','model']){
  await reset();
  await startQueue();
  let signal,release;
  const capturing=new Promise(resolve=>signal=resolve);
  chrome.scripting.executeScript=async()=>{
   signal();
   await new Promise(resolve=>release=resolve);
  };
  await chrome.alarms.onAlarm.fire({name:'backlog'});
  await capturing;
  if(change==='url')tabs[0].url+='?thread=changed-after-consent';
  else await local.set({settings:{...DEFAULTS,model:'changed-after-consent'}});
  release();
  const result=await waitQueue(queue=>['blocked','complete'].includes(queue?.phase));
  assert.equal(result.phase,change==='model'?'blocked':'complete');
  assert.equal(requests,0);
 }
});
test('a confirmed plan can be started once and a paused round keeps its jobs',async()=>{
 await reset();
 const first=(await send({type:'backlogPlan',windowId:2})).data;
 const second=(await send({type:'backlogPlan',windowId:2})).data;
 const message={type:'backlogStart',planId:first.id,origins:['https://example.com'],consent:true};
 const results=await Promise.all([send(message),send(message)]);
 assert.equal(results.filter(result=>result.ok).length,1);
 await send({type:'backlogPause'});
 const {analysisQueue}=await local.get('analysisQueue');
 assert.equal((await send({...message,planId:second.id})).ok,false);
 assert.equal((await local.get('analysisQueue')).analysisQueue.id,analysisQueue.id);
});
test('identical evidence in two backlog tabs reuses a result without a second API request',async()=>{
 await reset();tabs[0].url='https://example.com/task?copy=1';tabs.push({...tabs[0],id:8,url:'https://example.com/task?copy=2'});snapshots[8]={...snapshots[7]};const originalNow=Date.now;let clock=originalNow();Date.now=()=>clock;
 try{await startQueue();await chrome.alarms.onAlarm.fire({name:'backlog'});await waitQueue(q=>q?.jobs[0].status==='analyzed');clock+=4000;await chrome.alarms.onAlarm.fire({name:'backlog'});const q=await waitQueue(q=>q?.phase==='complete');assert.equal(q.jobs[1].status,'cached');assert.equal(requests,1);assert.equal(removed.length,0);}finally{Date.now=originalNow;await send({type:'backlogPause'});}
});
test('real backlog pause and local pardon remain responsive during a model request',async()=>{
 await reset();const original=globalThis.fetch;let release;globalThis.fetch=async()=>{requests++;await new Promise(r=>release=r);return {ok:true,json:async()=>({answers:[{type:'choice',name:'lifecycle',choice:'close',confidence:.99,probabilities:[{value:'close',probability:.99}]}],usage:{input_tokens:10,output_tokens:0}})};};
 try{await startQueue();await chrome.alarms.onAlarm.fire({name:'backlog'});for(let n=0;n<150&&!release;n++)await new Promise(r=>setImmediate(r));assert(release);const paused=await Promise.race([send({type:'backlogPause'}),new Promise((_,reject)=>setTimeout(()=>reject(Error('Pause blocked by API')),150))]);assert.equal(paused.ok,true);assert.equal((await send({type:'pardon',tabId:7})).ok,true);release();await waitQueue(q=>q?.jobs[0].status!=='inflight');assert.equal((await local.get('analysisQueue')).analysisQueue.phase,'paused');assert.equal((await local.get('records')).records[7].state,'keep');assert.equal(removed.length,0);}finally{globalThis.fetch=original;if(release)release();await send({type:'backlogPause'});}
});

test('opted-in review restores its page reader after same-URL reload without another user setup',async()=>{
 await reset();const originalNow=Date.now,originalSend=chrome.tabs.sendMessage,originalScripting=chrome.scripting;let now=originalNow(),injected=false;Date.now=()=>now;
 try{
  assert.equal((await send({type:'analyze',tabId:7,autoReview:true})).ok,true);now+=601000;snapshots[7]={...snapshots[7],at:now,excerpt:'Changed public article evidence'};
  chrome.tabs.sendMessage=async(id,message)=>{if(message.type==='snapshot'&&!injected)throw Error('Reader lost after reload');return originalSend(id,message);};chrome.scripting={async executeScript(){injected=true;}};
  await chrome.alarms.onAlarm.fire({name:'review'});for(let n=0;n<150&&requests<2;n++)await new Promise(r=>setImmediate(r));assert(injected);assert.equal(requests,2);await send({type:'state'});
 }finally{Date.now=originalNow;chrome.tabs.sendMessage=originalSend;chrome.scripting=originalScripting;}
});

test('right-click watch binds its submission to the exact top-level document',async()=>{
 await reset();
 const original=chrome.tabs.sendMessage;
 let prompt;
 chrome.scripting={async executeScript(){return [{documentId:'watch-doc'}];}};
 chrome.tabs.sendMessage=async(id,m)=>{if(m.type==='openWatchPrompt')prompt=m;return original(id,m);};
 try{
  await chrome.contextMenus.onClicked.fire({menuItemId:'watch-page',frameId:0},tabs[0]);
  assert(prompt?.token);
  const origin={id:chrome.runtime.id,tab:tabs[0],url:tabs[0].url,frameId:0,documentId:'watch-doc'};
  const watch={type:'watchFromPage',token:prompt.token,adapter:{waiting:'Working',done:'Done'}};
  assert.equal((await send(watch,{...origin,documentId:'other-doc'})).ok,false);
  assert.equal((await send(watch,origin)).ok,true);
  assert.equal((await send(watch,origin)).ok,false);
  assert.equal((await local.get('records')).records[7].watching,true);
  assert.equal(requests,0);
 }finally{chrome.tabs.sendMessage=original;}
});

test('right-click native countdown preserves hidden time and supports keep and close without panel leases',async()=>{
 await reset();
 const original=chrome.runtime.connectNative,actualNow=Date.now;
 let now=actualNow();
 const port={onMessage:new Event(),onDisconnect:new Event(),postMessage(m){
  if(m.type==='hello')queueMicrotask(()=>port.onMessage.fire({type:'status',status:'ready',capabilities:['countdown-v1','visibility-v1']}));
 }};
 chrome.runtime.connectNative=()=>port;
 chrome.scripting={async executeScript(){}};
 Date.now=()=>now;
 try{
  await local.set({settings:{...DEFAULTS,nativeEnabled:true}});
  await chrome.contextMenus.onClicked.fire({menuItemId:'close-reminder'},tabs[0]);
  const read=async()=>(await local.get('records')).records[7];
  const first=await read();
  assert.equal(first.closeSurface,'native');
  assert.equal(first.state,'paused');
  let activeId=first.visibilityId;
  const visibility=async(visible,advance=750,visibilityId=activeId)=>{
   now+=advance;
   snapshots[7].at=now;
   await port.onMessage.fire({type:'closeVisibility',tabId:7,visibilityId,visible});
   await send({type:'state'});
   return read();
  };
  await visibility(true);
  const before=await visibility(true);
  const hidden=await visibility(false);
  assert.equal(hidden.remainingMs,before.remainingMs);
  assert.equal((await visibility(false,11000)).remainingMs,before.remainingMs);
  await chrome.alarms.onAlarm.fire({name:'close:7'});
  await send({type:'state'});
  assert.equal(removed.length,0);
  assert.equal((await visibility(true,0,'stale-id')).state,'paused');
  assert.equal((await visibility(true)).remainingMs,before.remainingMs);
  assert((await visibility(true)).remainingMs<before.remainingMs);
  await port.onMessage.fire({type:'pardon',tabId:7});
  await send({type:'state'});
  assert.equal((await read()).state,'keep');
  assert.equal(removed.length,0);
  await chrome.contextMenus.onClicked.fire({menuItemId:'close-reminder'},tabs[0]);
  activeId=(await read()).visibilityId;
  assert.notEqual(activeId,first.visibilityId);
  for(let sample=0;sample<=40;sample++)await visibility(true);
  assert.deepEqual(removed,[7]);
  assert.equal(await read(),undefined);
  const {recentClosed}=await session.get('recentClosed');
  assert.equal(recentClosed[0].url,tabs[0].url);
  assert.equal(requests,0);
 }finally{Date.now=actualNow;await port.onDisconnect.fire();chrome.runtime.connectNative=original;}
});


test('会话主题复用已有连接，合并重复请求并在内容变化后标记旧缓存', async () => {
  await reset();
  await local.set({threadWorkspaceEnabled: true});
  const conversation = 'topic-fixture-1';
  tabs[0].url = 'https://chatgpt.com/c/' + conversation;
  tabs.push({...tabs[0], id: 8});
  const sender = tab => ({id: chrome.runtime.id, url: tab.url, frameId: 0, tab});
  const value = {conversation, turns: [
    {id: 'private-message-1', question: '沙漠植物如何储水？', heading: '储水组织'},
    {id: 'private-message-2', question: '仙人掌有什么适应性？', heading: '刺与气孔'},
  ]};
  const message = (action, data = value) => ({type: 'threadWorkspace', action, value: data});
  const groups = [{start: 1, end: 2, title: '旱生植物的适应策略'}];
  const original = globalThis.fetch;
  globalThis.fetch = async (url, options) => {
    requests++;
    assert.equal(url, 'https://api.openai.com/v1/responses');
    assert.equal(options.headers.Authorization, 'Bearer fixture-key');
    const body = JSON.parse(options.body);
    assert.equal(body.model, 'gpt-6-luna');
    assert.equal(body.store, false);
    assert.deepEqual(JSON.parse(body.input), [
      {turn: 1, question: value.turns[0].question, heading: value.turns[0].heading},
      {turn: 2, question: value.turns[1].question, heading: value.turns[1].heading},
    ]);
    assert(!options.body.includes(conversation));
    return {ok: true, json: async () => ({
      status: 'completed', output: [{type: 'message', content: [{type: 'output_text', text: JSON.stringify({topics: groups})}]}],
      usage: {input_tokens: 49, output_tokens: 20},
    })};
  };
  try {
    const firstRead = await send(message('topicsRead'), sender(tabs[0]));
    assert(firstRead.ok, firstRead.error);
    assert.equal(firstRead.data.state, 'empty');
    assert.equal(requests, 0);
    const results = await Promise.all(tabs.map(tab => send(message('topicsGenerate'), sender(tab))));
    for (const result of results) assert.deepEqual(result.data, {state: 'ready', groups});
    assert.deepEqual((await send(message('topicsRead'), sender(tabs[0]))).data.groups, groups);
    const changed = {...value, turns: [...value.turns, {id: 'next-message', question: '种子会储水吗？', heading: ''}]};
    assert.equal((await send(message('topicsRead', changed), sender(tabs[0]))).data.state, 'stale');
    assert.equal((await send(message('topicsGenerate', {...value, conversation: 'other-thread'}), sender(tabs[0]))).ok, false);
    assert.equal((await send(message('topicsGenerate'), {...sender(tabs[0]), frameId: 1})).ok, false);
    assert.equal(requests, 1);
    const {ledger} = await local.get('ledger');
    assert.equal(ledger.requests, 1);
    assert.equal(ledger.tokens, 69);
  } finally {
    globalThis.fetch = original;
  }
});

test('不连续的主题不写入缓存，打开概览不会重试失败的请求', async () => {
  await reset();
  await local.set({threadWorkspaceEnabled: true});
  const conversation = 'topic-fixture-2';
  tabs[0].url = 'https://chatgpt.com/c/' + conversation;
  const sender = {id: chrome.runtime.id, url: tabs[0].url, frameId: 0, tab: tabs[0]};
  const value = {conversation, turns: [
    {id: 'message-1', question: '叶子的蒸腾作用', heading: ''},
    {id: 'message-2', question: '夜间气孔', heading: ''},
  ]};
  const original = globalThis.fetch;
  globalThis.fetch = async () => {
    requests++;
    return {ok: true, json: async () => ({status: 'completed', output: [{
      type: 'message', content: [{type: 'output_text', text: '{"topics":[{"start":2,"end":2,"title":"气孔"}]}'}],
    }]})};
  };
  try {
    const response = await send({type: 'threadWorkspace', action: 'topicsGenerate', value}, sender);
    assert.equal(response.ok, false);
    for (let i = 0; i < 3; i++) {
      const read = await send({type: 'threadWorkspace', action: 'topicsRead', value}, sender);
      assert(read.ok, read.error);
      assert.equal(read.data.state, 'empty');
    }
    assert.equal(requests, 1);
  } finally {
    globalThis.fetch = original;
  }
});


test('问答摘要覆盖首尾及旧的第 96 轮边界，尾部变化只重算最后一批', async () => {
  await reset();
  await local.set({threadWorkspaceEnabled: true});
  const conversation='topic-complete-history';
  tabs[0].url='https://chatgpt.com/c/'+conversation;
  const sender={id:chrome.runtime.id,url:tabs[0].url,frameId:0,tab:tabs[0]};
  const value={conversation,format:'summary-v2',turns:Array.from({length:99},(_,index)=>({
    id:'message-'+index,question:'第 '+(index+1)+' 轮提问',answer:'第 '+(index+1)+' 轮完整证据摘录',
    sections:['条件','结论'],
  }))};
  const call=action=>send({type:'threadWorkspace',action,value},sender);
  const original=globalThis.fetch;
  const seen=[];
  globalThis.fetch=async(url,options)=>{
    requests++;
    assert.equal(url,'https://api.openai.com/v1/responses');
    assert(!options.body.includes(conversation));
    assert(!options.body.includes('message-'));
    const evidence=JSON.parse(JSON.parse(options.body).input);
    seen.push(...evidence.map(turn=>turn.question));
    assert(evidence.every(turn=>turn.answer.includes('证据摘录')&&turn.sections.length===2));
    const result={
      topics:[{start:1,end:evidence.length,title:evidence[0].question,summary:'主题的明确结论'}],
      turns:evidence.map(turn=>({turn:turn.turn,question:turn.question,answer:'对应回答摘要'})),
    };
    return {ok:true,json:async()=>({status:'completed',output:[{type:'message',content:[{type:'output_text',text:JSON.stringify(result)}]}],usage:{input_tokens:10,output_tokens:5}})};
  };
  try{
    const empty=await call('topicsRead');
    assert.deepEqual(empty.data,{state:'empty'});assert.equal(requests,0);
    const first=await call('topicsGenerate');assert(first.ok,first.error);
    assert.equal(first.data.summaries.length,99);
    assert.deepEqual(seen,value.turns.map(turn=>turn.question));
    const initial=requests;
    assert.deepEqual((await call('topicsRead')).data,first.data);
    assert.deepEqual((await call('topicsGenerate')).data,first.data);
    assert.equal(requests,initial);
    value.turns.at(-1).answer+='，补一条结论';
    assert.equal((await call('topicsRead')).data.state,'stale');
    assert((await call('topicsGenerate')).ok);
    assert.equal(requests,initial+1);
  }finally{globalThis.fetch=original;}
});


test('完整问答跨批综合只重算变化的证据，概览重开不会重复调用 OpenAI', async () => {
  await reset();
  await local.set({threadWorkspaceEnabled: true});
  const conversation = 'full-summary-fixture';
  tabs[0].url = 'https://chatgpt.com/c/' + conversation;
  const sender = {id:chrome.runtime.id,url:tabs[0].url,frameId:0,tab:tabs[0]};
  const answer = '首段的条件。' + '完整输入中的合成附加说明。'.repeat(3000) + '中段决定。' +
    '合成资料里的其他情况。'.repeat(1400) + '尾段的限制。';
  const value = {conversation,format:'summary-v3',turns:[
    {id:'source-id-1',question:'哪些条件必须先确认？',answer,sections:['初始条件','中段决定','尾段限制']},
    {id:'source-id-2',question:'最后怎么处理？',answer:'核对边界后执行。',sections:['处置顺序']},
  ]};
  const call = action => send({type:'threadWorkspace',action,value},sender);
  const original = globalThis.fetch;
  const requestsSeen = [];
  globalThis.fetch = async (url, options) => {
    assert.equal(url,'https://api.openai.com/v1/responses');
    assert(!options.body.includes(conversation));
    assert(!options.body.includes('source-id-'));
    const request = JSON.parse(options.body);
    const evidence = JSON.parse(request.input);
    const synthesis = !request.text.format.schema.required.includes('turns');
    requestsSeen.push({synthesis,evidence});
    const count = synthesis ? evidence.at(-1).end : evidence.length;
    const result = {
      summary:'两轮问答确定了执行条件，并在核对限制后给出处置顺序。',
      topics:[{start:1,end:count,title:'执行条件与处置顺序',summary:'执行之前依次确认条件、决定和限制。'}],
    };
    if (!synthesis) result.turns = evidence.map(turn=>({
      turn:turn.turn,question:turn.question,answer:'已明确执行前的检查事项。',
    }));
    return new Response(JSON.stringify({status:'completed',output:[
      {type:'message',content:[{type:'output_text',text:JSON.stringify(result)}]},
    ]}),{status:200});
  };
  try {
    assert.deepEqual((await call('topicsRead')).data,{state:'empty'});
    assert.equal(requestsSeen.length,0);
    const initial = await call('topicsGenerate');
    assert(initial.ok,initial.error);
    assert.equal(initial.data.summaries.length,2);
    assert.equal(initial.data.groups[0].end,2);
    assert.equal(requestsSeen[0].evidence[0].answer,answer);
    assert.deepEqual(requestsSeen.map(request=>request.synthesis),[false,false,true]);
    assert.deepEqual(requestsSeen[2].evidence.flatMap(batch => batch.topics), [
      {start:1,end:1,title:'执行条件与处置顺序',summary:'执行之前依次确认条件、决定和限制。'},
      {start:2,end:2,title:'执行条件与处置顺序',summary:'执行之前依次确认条件、决定和限制。'},
    ]);
    assert.deepEqual((await call('topicsRead')).data,initial.data);
    assert.deepEqual((await call('topicsGenerate')).data,initial.data);
    assert.equal(requestsSeen.length,3);
    value.turns[1].answer += '同时保留回滚入口。';
    assert.equal((await call('topicsRead')).data.state,'stale');
    const updated = await call('topicsGenerate');
    assert(updated.ok,updated.error);
    assert.deepEqual(requestsSeen.map(request=>request.synthesis),[false,false,true,false,true]);
    assert.equal(requestsSeen[3].evidence[0].answer,value.turns[1].answer);
  } finally {
    globalThis.fetch = original;
  }
});


test('自动摘要不可重复发起失败请求，关闭自动摘要也不会触发模型', async () => {
  await reset();
  const conversation='auto-summary-fixture';
  tabs[0].url='https://chatgpt.com/c/'+conversation;
  await local.set({threadWorkspaceEnabled:true,threadWorkspacePreferences:{autoTopicSummary:false}});
  const sender={id:chrome.runtime.id,url:tabs[0].url,frameId:0,tab:tabs[0]};
  const value={conversation,format:'summary-v3',turns:[
    {id:'fixture-turn',question:'该怎样处理？',answer:'先核对范围，再处理。',sections:['核对范围']},
  ]};
  const open=()=>send({type:'threadWorkspace',action:'topicsOpen',value},sender);
  const original=globalThis.fetch;
  let calls=0;
  globalThis.fetch=async()=>{calls++;return new Response('{}',{status:429});};
  try {
    assert.deepEqual((await open()).data,{state:'empty'});
    assert.equal(calls,0);
    await local.set({threadWorkspacePreferences:{autoTopicSummary:true}});
    const results=await Promise.all([open(),open(),open()]);
    assert(results.every(result=>result.data?.state==='cooldown'));
    assert.equal(calls,1);
    await session.remove('modelCooldowns');
    assert.equal((await open()).data.state,'cooldown');
    assert.equal(calls,1);
  } finally {
    globalThis.fetch=original;
  }
});

test('提前准备和打开概览共用在途请求，后台标签与关闭偏好不发请求', async () => {
  await reset();
  const conversation='prepare-overview-fixture';
  tabs[0]={...tabs[0],active:true,url:'https://chatgpt.com/c/'+conversation};
  const sender={id:chrome.runtime.id,url:tabs[0].url,frameId:0,tab:tabs[0]};
  const value={conversation,format:'summary-v3',partial:true,turns:[{
    id:'fixture-question',question:'什么时候复盘？',answer:'周一复盘，达标后决定是否启动。',
    sections:['复盘'],navigation:{role:'user',nodeId:'fixture-question',answers:[
      {id:'fixture-answer',nodeId:'fixture-answer',sections:[]},
    ]},
  }]};
  const call=(action,input=value)=>send({type:'threadWorkspace',action,value:input},sender);
  await local.set({threadWorkspaceEnabled:true,threadWorkspacePreferences:{autoTopicSummary:true}});
  const original=globalThis.fetch, windowGet=chrome.windows.get;
  let release,calls=0;
  chrome.windows.get=async()=>({focused:true});
  globalThis.fetch=async()=>{
    calls++;
    await new Promise(resolve=>{release=resolve;});
    const result={summary:'周一复盘后决定是否启动。',topics:[{start:1,end:1,title:'复盘',summary:'安排在周一。'}],
      turns:[{turn:1,question:'何时复盘？',answer:'周一，达标后再决定。'}]};
    return new Response(JSON.stringify({status:'completed',output:[{type:'message',
      content:[{type:'output_text',text:JSON.stringify(result)}]}]}));
  };
  try{
    assert.equal((await call('topicsPrepare')).data.state,'deferred');
    await local.set({threadWorkspacePreferences:{autoTopicSummary:true,prepareTopicSummary:true}});
    tabs[0].active=false;
    assert.equal((await call('topicsPrepare')).data.state,'deferred');
    assert.equal(calls,0);
    tabs[0].active=true;
    const preparing=call('topicsPrepare');
    for(let turn=0;turn<40&&!release;turn++)await new Promise(resolve=>setImmediate(resolve));
    assert(release);
    const opening=call('topicsOpen');
    release();
    const [prepared,opened]=await Promise.all([preparing,opening]);
    assert.equal(prepared.data.historyPending,true);
    assert.equal(opened.data.summary,prepared.data.summary);
    assert.equal(calls,1);
    const evidence={conversation,allowPartial:true,messages:[{id:'fixture-answer',role:'assistant'}]};
    assert.equal((await call('topicsCached',evidence)).data.historyPending,true);
    await call('topicsHistoryProbed',prepared.data.historyKey);
    assert.equal((await call('topicsCached',evidence)).data.historyPending,undefined);
    assert.equal((await call('topicsOpen')).data.state,'ready');
    assert.equal(calls,1);
  }finally{globalThis.fetch=original;chrome.windows.get=windowGet;release?.();}
});

test('未安装 Mac 助手时原生功能保持关闭，并返回可操作的安装提示', async () => {
  await reset();
  const connect = chrome.runtime.connectNative;
  try {
    chrome.runtime.connectNative = () => { throw Error('Missing native host'); };
    assert.equal((await send({type:'nativeCheck'})).data.status,'unavailable');
    for (const type of ['saveNative','saveSwitcher']) {
      const result = await send({type,enabled:true});
      assert.equal(result.ok,false);
      assert.match(result.error,/下载并连接 Mac 助手/);
    }
    const {settings} = await local.get('settings');
    assert.equal(settings.nativeEnabled,false);
    assert.equal(settings.switcherEnabled,false);
  } finally { chrome.runtime.connectNative = connect; }
});

test('新会话的 20 轮适配一次调用，升级前的 16 轮分段仍可命中缓存', async () => {
  await reset();
  const {topicSnapshot,topicBatchLayout,topicSynthesis,saveTopicBatch} = await import('../extension/core/topics.mjs');
  const conversation = 'batch-layout-compatibility';
  const connection = {model:'gpt-6-luna'};
  const value = {conversation,format:'summary-v3',turns:Array.from({length:20},(_,index)=>({
    id:'turn-'+index,question:'明确要求',answer:'检查边界和结论。',sections:['检查条件'],
  }))};
  const newPlan = await topicSnapshot(value,conversation,await topicBatchLayout(local,conversation,connection));
  assert.deepEqual(newPlan.batches.map(batch=>batch.evidence.length),[20]);
  await local.set({threadTopicCache:{['c:'+conversation]:{version:2,model:connection.model,parts:{old:{}}}}});
  const legacyPlan = await topicSnapshot(value,conversation,await topicBatchLayout(local,conversation,connection));
  assert.deepEqual(legacyPlan.batches.map(batch=>batch.evidence.length),[16,4]);
  assert.equal(await topicSynthesis(newPlan,{}),null);
  await saveTopicBatch(local,newPlan,connection,newPlan.batches[0],{summary:'合成结果'});
  assert.equal((await topicBatchLayout(local,conversation,connection)).limit,20);
});


test('局部回复可复用完整缓存，忽略虚拟列表末尾位置，仍识别稳定的新消息和正文修订', async () => {
  await reset();
  const {topicSnapshot,readLatestTopicOverview,saveTopicBatch} = await import('../extension/core/topics.mjs');
  const conversation='partial-cache-fixture',connection={model:'gpt-6-luna'};
  const turns=[1,2].map(n=>({
    id:'question-'+n,question:'原问题 '+n,answer:'原回复 '+n,sections:[],
    navigation:{role:'user',nodeId:'node-q-'+n,answers:[
      {id:'answer-'+n,nodeId:'node-a-'+n,revision:'7:abcd',sections:[]},
    ]},
  }));
  const snapshot=await topicSnapshot({conversation,format:'summary-v3',turns},conversation);
  await saveTopicBatch(local,snapshot,connection,snapshot.batches[0],{
    summary:'会话概要', topics:[{start:1,end:2,title:'概要',summary:'核对两个问题。'}],
    turns:[{turn:1,question:'第一问',answer:'第一答'},{turn:2,question:'第二问',answer:'第二答'}],
  });
  const answer={role:'assistant',id:'current-dom-id',nodeId:'node-a-1',revision:'7:abcd'};
  const read=messages=>readLatestTopicOverview(local,conversation,{conversation,messages,atTail:true});
  const cached=await read([answer]);
  assert.equal(cached.state,'ready');
  assert.deepEqual(cached.entries.map(entry=>entry.id),['question-1','question-2']);
  assert.equal((await read([answer,{role:'user',id:'question-3'}])).state,'stale');
  assert.deepEqual((await read([{...answer,revision:'7:efgh'}])).changed,[answer.id,'answer-1']);
  const strict=await readLatestTopicOverview(local,conversation,{conversation,complete:true,observed:[
    {id:'question-1',role:'user',answerIds:['answer-1']},
  ]});
  assert.equal(strict.state,'stale');
});

test('部分摘要独立保存范围，确认相同正文完整时复用模型结果', async () => {
  await reset();
  const {topicSnapshot,topicBatchLayout,readTopics,rememberTopicOverview,readLatestTopicOverview,saveTopicBatch} =
    await import('../extension/core/topics.mjs');
  const conversation='stalled-history-fixture', connection={model:'gpt-6-luna'};
  const turns=[1,2].map(n=>({
    id:'question-'+n,question:'询问试运行 '+n,answer:'试运行的条件 '+n,sections:[],
    navigation:{role:'user',nodeId:'node-q-'+n,answers:[
      {id:'answer-'+n,nodeId:'node-a-'+n,revision:'7:abcd',sections:[]},
    ]},
  }));
  const partial=await topicSnapshot({conversation,format:'summary-v3',partial:true,turns},conversation);
  await saveTopicBatch(local,partial,connection,partial.batches[0],{
    summary:'确认了试运行的时间与门槛。',
    topics:[{start:1,end:2,title:'试运行安排',summary:'先试运行，达标后复盘。',merge:true}],
    turns:[{turn:1,question:'第一问',answer:'周六启动。'},{turn:2,question:'第二问',answer:'达标后复盘。'}],
  });
  const observed={conversation,messages:[{id:'answer-2',role:'assistant'}],allowPartial:true};
  const partialView=await readLatestTopicOverview(local,conversation,observed);
  assert.equal(partialView.partial,true);
  assert.equal(partialView.groups[0].merge,true);
  assert.equal((await readLatestTopicOverview(local,conversation,{...observed,navigationOnly:true})).state,'empty');
  const complete=await topicSnapshot({conversation,format:'summary-v3',turns},conversation);
  const {view,parts}=await readTopics(local,complete,connection);
  assert.equal(view.state,'ready');
  assert.equal(view.partial,undefined);
  await rememberTopicOverview(local,complete,connection,parts);
  assert.equal((await readLatestTopicOverview(local,conversation,observed)).partial,undefined);
  turns[0].answer='试运行条件已修改。';
  turns[0].navigation.answers[0].revision='9:efgh';
  const revised=await topicSnapshot({conversation,format:'summary-v3',partial:true,turns},conversation);
  await saveTopicBatch(local,revised,connection,revised.batches[0],{
    ...parts[complete.batches[0].digest], summary:'试运行条件已修改，仍需复盘。',
  });
  const afterRevision=await readLatestTopicOverview(local,conversation,observed);
  assert.equal(afterRevision.partial,true);
  assert.match(afterRevision.summary,/条件已修改/);

  const long=Array.from({length:20},(_,index)=>({
    ...turns[0],id:'later-'+index,question:'稍后的问题 '+index,
    navigation:{...turns[0].navigation,answers:[]},
  }));
  const later=await topicSnapshot({conversation,format:'summary-v3',partial:true,turns:long},conversation);
  await saveTopicBatch(local,later,connection,later.batches[0],{
    summary:'末尾二十轮的合成结果。',
    topics:[{start:1,end:20,title:'后续问答',summary:'复用了原结论。'}],
    turns:long.map((turn,index)=>({turn:index+1,question:turn.question,answer:'已确认条件。'})),
  });
  const extended=await topicSnapshot({conversation,format:'summary-v3',turns:[turns[0],...long]},conversation,
    await topicBatchLayout(local,conversation,connection));
  assert.deepEqual(extended.batches.map(batch=>batch.evidence.length),[1,20]);
  assert.equal(extended.batches[1].digest,later.batches[0].digest);
});


test('保存自动验证一次，重复保存和读取状态复用成功结果',async()=>{
 await reset();
 const message={type:'saveSettings',scope:'connection',settings:DEFAULTS,apiKey:'synthetic-auto-test',verify:true};
 assert((await send(message)).ok);
 const checked=await send({type:'state'});
 assert.equal(checked.data.connectionCheck.ok,true);
 assert.equal(requests,1);
 assert((await send({...message,apiKey:''})).ok);
 assert.equal(requests,1);
 assert((await send({...message,apiKey:'synthetic-rotated-test'})).ok);
 assert.equal(requests,2);
});


test('跨窗口移动和休眠同一标签会保留监听，唤醒后只接受新的顶层文档回执', async()=>{
  await reset();
  const original=chrome.scripting;
  chrome.scripting={async executeScript(){return [{documentId:'restored-document'}];}};
  try {
    assert((await send({type:'watch',tabId:7,adapter:{waiting:'Running',done:'Completed'}})).ok);
    const read=async()=>(await local.get('records')).records[7];
    tabs[0].windowId=3;
    await chrome.tabs.onAttached.fire(7,{newWindowId:3,newPosition:0});
    await send({type:'state'});
    assert.equal((await read()).windowId,3);
    tabs[0].discarded=true;
    await chrome.tabs.onUpdated.fire(7,{discarded:true});
    await send({type:'state'});
    assert.equal((await read()).watchSuspended,'sleeping');
    assert.equal((await read()).watching,true);
    tabs[0].discarded=false;
    tabs[0].status='complete';
    await chrome.tabs.onUpdated.fire(7,{discarded:false,status:'complete'});
    await send({type:'state'});
    assert.equal((await read()).watchDocumentId,'restored-document');
    const sender={id:chrome.runtime.id,frameId:0,tab:tabs[0],url:tabs[0].url};
    await send({type:'sensor',snapshot:{observed:'done'}},{...sender,documentId:'old-document'});
    assert.equal((await read()).state,'waiting');
    await send({type:'sensor',snapshot:{observed:'done'}},{...sender,documentId:'restored-document'});
    assert.equal((await read()).state,'resume');
    assert.equal(requests,0);
  } finally {chrome.scripting=original;}
});

test('Chrome 重启只恢复唯一匹配的监听，重复网址无需猜测归属',async()=>{
  await reset();
  const original=chrome.scripting;
  chrome.scripting={async executeScript(){return [{documentId:'after-browser-restart'}];}};
  try {
    const [tab]=tabs;
    assert((await send({type:'watch',tabId:7,adapter:{waiting:'Running',done:'Completed'}})).ok);
    tabs=[{...tab,id:22,status:'complete',windowId:4}];
    await chrome.runtime.onStartup.fire();
    const {records}=await local.get('records');
    assert.equal(records[7],undefined);
    assert.equal(records[22].watching,true);
    assert.equal(records[22].watchDocumentId,'after-browser-restart');
    tabs=[{...tabs[0],id:23},{...tabs[0],id:24,index:1}];
    await chrome.runtime.onStartup.fire();
    assert.deepEqual((await local.get('records')).records,{});
    assert.equal(requests,0);
  } finally {chrome.scripting=original;}
});

test('API 冷却遵守服务端 Retry-After，并在会话存储清空后继续生效',async()=>{
  await reset();
  const original=globalThis.fetch;
  globalThis.fetch=async()=>{
    requests++;
    return new Response('{}',{status:429,headers:{'Retry-After':'71'}});
  };
  try {
    const before=Date.now();
    assert.equal((await send({type:'testAPI'})).ok,false);
    const deadline=(await local.get('modelCooldowns')).modelCooldowns['https://api.openai.com'];
    assert(deadline>=before+71000&&deadline<=Date.now()+71000);
    session.clear();
    await session.set({apiKey:'fixture-key',apiKeyOrigin:'https://api.openai.com'});
    assert.match((await send({type:'testAPI'})).error,/限流/);
    assert.equal(requests,1);
  } finally {globalThis.fetch=original;}
});

import test from 'node:test';import assert from 'node:assert/strict';
import {DEFAULTS,dayKey} from '../extension/core/policy.mjs';
class Event {listeners=[];addListener(fn){this.listeners.push(fn);}fire(...args){return Promise.all(this.listeners.map(f=>f(...args)));}}
function area(){let data={};return {async get(keys){if(typeof keys==='string')keys=[keys];return Object.fromEntries(keys.filter(k=>k in data).map(k=>[k,structuredClone(data[k])]))},async set(v){Object.assign(data,structuredClone(v))},async remove(keys){for(const k of Array.isArray(keys)?keys:[keys])delete data[k]},async setAccessLevel(){},clear(){data={}}};}
const local=area(),session=area();let requests=0,removed=[],snapshots={};let tabs=[{id:7,windowId:2,title:'Fixture',url:'https://example.com/task',active:false}];
globalThis.chrome={storage:{local,session},runtime:{id:'fixture-extension',onMessage:new Event(),onInstalled:new Event(),onStartup:new Event(),sendMessage:async()=>{},connectNative(){throw new Error('native deliberately unused')}},tabs:{onActivated:new Event(),onUpdated:new Event(),onRemoved:new Event(),async query(){return tabs},async get(id){const t=tabs.find(t=>t.id===id);if(!t)throw Error('absent');return t},async sendMessage(id,message){if(message.type==='snapshot')return snapshots[id];return {ok:true}},async remove(id){removed.push(id)},async update(id,change){Object.assign(tabs.find(t=>t.id===id),change);return tabs.find(t=>t.id===id)}},windows:{async get(){return {left:0,top:0,width:1000,height:800}},async update(){}},permissions:{async contains(){return true}},alarms:{onAlarm:new Event(),async clear(){},async create(){}},sidePanel:{async setPanelBehavior(){}}};
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
 const denied=await send({type:'saveSettings',scope:'connection',settings:{...DEFAULTS,rememberKey:true},apiKey:'synthetic-without-consent'});assert.equal(denied.ok,false);assert.match(denied.error,/勾选/);assert.equal((await local.get('settings')).settings.rememberKey,false);assert.equal(requests,0);
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
test('real worker backlog leaves editors local and sends no API request',async()=>{
 await reset();snapshots[7].editable=true;await startQueue();await chrome.alarms.onAlarm.fire({name:'backlog'});const q=await waitQueue(q=>q?.phase==='complete');assert.equal(q.jobs[0].status,'skipped');assert.equal(requests,0);
});
test('backlog plan cannot send a page after URL or model configuration changes',async()=>{
 await reset();chrome.scripting={async executeScript(){}};let plan=(await send({type:'backlogPlan',windowId:2})).data;await local.set({settings:{...DEFAULTS,model:'changed-model'}});assert.equal((await send({type:'backlogStart',planId:plan.id,origins:['https://example.com'],consent:true})).ok,false);await local.set({settings:DEFAULTS});plan=await startQueue();tabs[0].url='https://different.example/private';await chrome.alarms.onAlarm.fire({name:'backlog'});const q=await waitQueue(q=>q?.phase==='complete');assert.equal(q.jobs[0].status,'skipped');assert.equal(requests,0);
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

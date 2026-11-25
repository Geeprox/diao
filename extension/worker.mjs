import {createThreadWorkspace} from './core/thread-workspace.mjs';
import {conversationAt, topicConnection, topicBatchLimit, topicSnapshot, readTopics, readLatestTopicOverview, rememberTopicOverview, requestTopics, saveTopicBatch, topicSynthesis} from './core/topics.mjs';
import {BacklogQueue,backlogPlan,backlogExclusion,backlogWaiting,trackableTab,queueSummary} from './core/backlog.mjs';
import {advanceCountdown,nativeVisibilityFresh} from './core/countdown.mjs';
import {CredentialManager,credentialOrigin,credentialStorage} from './core/credentials.mjs';
import {connectionSyncSlot} from './core/connection-sync.mjs';
import {MRUController} from './core/mru-controller.mjs';
import {DEFAULTS,safeURL,privateURL,boundedEvidence,fingerprint,reserve,settle,mayReevaluate,pardon,mayClose,closeCandidate,visibilityLease,guard} from './core/policy.mjs';
import {invoke,buildRequest} from './core/providers.mjs';
import {duplicates,organizationPlan,identity,scheduledCandidate} from './core/workspace.mjs';

let serial=Promise.resolve(),cloudSerial=Promise.resolve(),configSerial=Promise.resolve(),native=null;
const nativePending=new Map();
let nativeConnection = {status:'unknown'};

function expectNativeHello(port) {
  nativeConnection = {status:'checking'};
  nativeHello = new Promise(resolve => {
    const timeout = setTimeout(() => {
      if (native === port && nativeConnection.status === 'checking') nativeConnection = {status:'unavailable'};
      resolve();
    }, 1500);
    finishNativeHello = () => { clearTimeout(timeout); resolve(); };
  });
}

async function checkNative(refresh = false) {
  if (chrome.runtime.getPlatformInfo && (await chrome.runtime.getPlatformInfo()).os !== 'mac') {
    return {status:'unsupported'};
  }
  const connected = native;
  try {
    const port = await connectNative();
    if (refresh && connected === port && nativeConnection.status !== 'checking') {
      expectNativeHello(port);
      port.postMessage({type:'hello'});
    }
    await nativeHello;
  } catch {
    return {status:'unavailable'};
  }
  return nativeConnection;
}

async function requireNativeAccessibility() {
  const info = await checkNative(true);
  if (info.status === 'ready') return;
  throw Error(info.status === 'accessibility_required' ? '请在 Mac 助手中打开辅助功能设置，授权后再开启。' :
    info.status === 'unsupported' ? '此功能仅适用于支持的 Mac。' : '请先下载并连接 Mac 助手，再开启此功能。');
}
const configRun=fn=>{const task=configSerial.then(fn,fn);configSerial=task.catch(()=>{});return task;};
let nativeCapabilities=new Set(),nativeHello=Promise.resolve(),finishNativeHello=()=>{},activeOverlay=null;
const run=fn=>{const next=serial.then(fn,fn);serial=next.catch(()=>{});return next;};
const cloudRun=fn=>{const next=cloudSerial.then(fn,fn);cloudSerial=next.catch(()=>{});return next;};
const cleanSettings=input=>{const settings={...DEFAULTS};for(const key of Object.keys(DEFAULTS))if(input?.[key]!==undefined)settings[key]=input[key];if(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(input?.credentialRevision||''))settings.credentialRevision=input.credentialRevision;return settings;};
const load=async()=>{const d=await chrome.storage.local.get(['settings','records','ledger','adapters']);return {settings:cleanSettings(d.settings),records:d.records||{},ledger:d.ledger,adapters:d.adapters||[]};};
const session=()=>chrome.storage.session.get(['apiKey','apiKeyOrigin','apiKeyRevision','credentialPersistedOrigin','lease','leases','snapshots','chromeFocusedWindow']);
const saveRecords=records=>chrome.storage.local.set({records});
async function leaseFor(record){if(!record)return null;const {leases={}}=await session();return Object.values(leases).find(lease=>visibilityLease(lease,record))||null;}
const emit=()=>chrome.runtime.sendMessage({type:'updated'}).catch(()=>{});
const mru=new MRUController({chrome,getPort:()=>connectNative(),emit});
const keychain=new CredentialManager({chrome,request:nativeCredential,settings:async()=>(await load()).settings,mutate:run,changed:()=>{emit();void resumeQueueAfterConnection().catch(()=>{});}});
const connectionKey=settings=>JSON.stringify([settings.provider,settings.endpoint,settings.model]);
const profileSlot=settings=>(settings.provider==='chat'||credentialOrigin(settings.endpoint)!==credentialOrigin(DEFAULTS.endpoint)
 ?'compatible':'openai')+'|'+settings.provider;
function copyProfiles(profiles,before,after){
 const next={...profiles};
 for(const settings of [before,after]){
  const {provider,endpoint,model}=settings;
  next[profileSlot(settings)]={provider,endpoint,model};
 }
 return next;
}
const clearAutoReview=records=>Object.fromEntries(Object.entries(records).map(([id,record])=>[id,
 record.autoReview?{...record,autoReview:false}:record]));
const currentKey=(settings,state)=>Boolean(state.apiKey &&
 state.apiKeyOrigin===credentialOrigin(settings.endpoint) &&
 (state.apiKeyRevision||'')===(settings.credentialRevision||''));
let backlogTimer;
function scheduleBacklog(queue){
 clearTimeout(backlogTimer);
 if(queue?.phase!=='running'&&!(queue?.phase==='blocked'&&queue.blockedBy==='backoff')){chrome.alarms.clear('backlog').catch(()=>{});return;}
 const delay=Math.max(0,(queue.nextAt||Date.now())-Date.now());
 chrome.alarms.create('backlog',{when:Date.now()+Math.max(30000,delay)}).catch(()=>{});
 if(delay<=10000){backlogTimer=setTimeout(()=>void backlog.tick().catch(()=>{}),delay);backlogTimer.unref?.();}
}
const backlog=new BacklogQueue({storage:chrome.storage.local,mutate:run,process:processBacklog,emit,schedule:scheduleBacklog});
async function resumeQueueAfterConnection(){const {settings}=await load(),state=await session();if(currentKey(settings,state))await backlog.credentialReady();}
async function processBacklog(job,queue,stillRunning){return cloudRun(async()=>{
 if(!await stillRunning())return {kind:'deferred'};
 const {settings}=await load();
 if(connectionKey(settings)!==queue.connectionKey)return {kind:'blocked',blockedBy:'configuration',reason:'模型连接已变化，请重新确认发送范围。'};
 const tab=await chrome.tabs.get(job.tabId).catch(()=>null);
 if(!tab||tab.url!==job.url||!queue.origins.includes(job.origin))return {kind:'skipped',reason:'网页已关闭或跳转。'};
 const excluded=backlogExclusion(tab);
 if(excluded)return {kind:'skipped',reason:excluded};
 if(backlogWaiting(tab))return {kind:'waiting',reason:'等网页载入后检查。'};
 if(!await chrome.permissions.contains({origins:[job.origin+'/*']}))return {kind:'skipped',reason:'网站读取权限已撤销。'};
 let documentId;
 try{
  const frames=await chrome.scripting.executeScript({target:{tabId:tab.id},files:['sensor.js']});
  documentId=frames?.[0]?.documentId;
 }catch{return {kind:'skipped',reason:'Chrome 不允许读取此网页。'};}
 let snapshot;
 try{snapshot=await readSnapshot(tab.id,documentId);}
 catch{return {kind:'skipped',reason:'网页正在切换，未发送。'};}
 if(snapshot.editable||snapshot.dirty||snapshot.media||tab.audible||['waiting','unknown'].includes(snapshot.observed))
  return {kind:'skipped',reason:'正在编辑、播放或等待任务，保留在本机。'};
 await restoreBeforeRequest();
 try{await credentials(settings);}catch(error){
  return error.code==='provider_backoff'
    ? {kind:'blocked',blockedBy:'backoff',nextAt:error.retryAt,reason:'服务暂时限流，恢复后继续。'}
    : {kind:'blocked',blockedBy:'credentials',reason:error.message};
 }
 if(!await stillRunning())return {kind:'deferred'};
 const result=await analyze(tab.id,true,queue.autoReview,await fingerprint(boundedEvidence(tab,snapshot)),
  {queueId:queue.id,connection:queue.connectionKey,url:job.url,documentId});
 if(result.deferred)return {kind:'deferred'};
 if(result.changed)return {kind:'blocked',blockedBy:'configuration',reason:'模型连接已变化，请重新确认发送范围。'};
 return {kind:result.cached?'cached':result.skipped?'skipped':'analyzed',reason:result.skipped||''};
 });}
async function restoreBeforeRequest(){const {settings}=await load();if(settings.rememberKey)await keychain.restore(settings);}
async function readSnapshot(tabId,documentId){try{return await chrome.tabs.sendMessage(tabId,{type:'snapshot'},documentId?{documentId}:{frameId:0});}catch{throw new Error('尚未授权读取此页；选择“分析页面”或“监听任务”后重试。');}}
async function modelCooldown(settings) {
  const {modelCooldowns={}}=await chrome.storage.local.get('modelCooldowns');
  return modelCooldowns[credentialOrigin(settings.endpoint)] || 0;
}
async function rememberModelCooldown(settings,error) {
  if(error.status!==429)return;
  const origin=credentialOrigin(settings.endpoint),now=Date.now();
  const retryAt=Number.isFinite(error.retryAt)&&error.retryAt>now ? error.retryAt : now+300000;
  error.retryAt=retryAt;
  await run(async()=>{
    const {modelCooldowns={}}=await chrome.storage.local.get('modelCooldowns');
    const live=Object.entries(modelCooldowns).filter(([,until])=>until>now).sort((a,b)=>b[1]-a[1]).slice(0,31);
    await chrome.storage.local.set({modelCooldowns:{...Object.fromEntries(live),[origin]:Math.max(retryAt,modelCooldowns[origin]||0)}});
  });
}
async function credentials(settings) {
  const [s,retryAt]=await Promise.all([session(),modelCooldown(settings)]);
  if(Date.now()<retryAt)throw Object.assign(new Error('模型服务暂时限流，稍后可再试。'),{code:'provider_backoff',retryAt});
  if(!currentKey(settings,s)){
    const {credentialStatus}=await chrome.storage.session.get('credentialStatus');
    const reason=settings.rememberKey?(credentialStatus?.reason||'打开模型连接，恢复已保存的密钥。'):'请先保存模型连接。';
    throw Object.assign(new Error(reason),{code:'connection_required'});
  }
  if(!await chrome.permissions.contains({origins:[new URL(settings.endpoint).origin+'/*']}))throw Object.assign(new Error('打开模型连接，保存并授权 API 地址。'),{code:'connection_required'});
  return s.apiKey;
}
async function analyze(tabId,manual=false,autoReview,expectedHash,scope={}) {
  await restoreBeforeRequest();
  const context=await run(async()=>{
    const {settings,records,ledger}=await load();
    if(scope.queueId){
      const queue=await backlog.read();
      if(queue?.id!==scope.queueId||queue.phase!=='running')return {deferred:true};
    }
    if(scope.connection&&scope.connection!==connectionKey(settings)){
      if(scope.queueId)return {changed:true};
      throw Error('模型连接已变化，请重新预览发送内容。');
    }
    const tab=await chrome.tabs.get(tabId).catch(()=>null);
    if(scope.queueId&&tab?.url!==scope.url)return {skipped:'网页已关闭或跳转。'};
    if(!safeURL(tab?.url)||tab.incognito)throw new Error('选择非隐身的普通网页后重试。');
    if(!manual&&(privateURL(tab.url)||records[tabId]?.autoReview!==true))return {skipped:'此页只接受手动分析。'};
    const snapshot=await readSnapshot(tabId,scope.documentId).catch(error=>{
      if(scope.queueId)return null;
      throw error;
    });
    if(!snapshot)return {skipped:'网页已重新载入，未发送。'};
    const evidence=boundedEvidence(tab,snapshot),hash=await fingerprint(evidence),prior=records[tabId];
    const old=prior?.url===tab.url&&prior?.windowId===tab.windowId?prior:undefined;
    if(manual&&expectedHash&&expectedHash!==hash)throw new Error('页面内容已变化，重新预览发送内容后再分析。');
    if(manual&&old&&typeof autoReview==='boolean'){old.autoReview=autoReview&&!privateURL(tab.url);records[tabId]=old;if(old.autoReview){settings.autoAnalyze=true;await chrome.storage.local.set({settings});}await saveRecords(records);}
    if(!mayReevaluate(old,hash))return {skipped:'本次已保留；有新内容且冷却结束后才重新评估。'};
    if(old?.hash===hash&&old.provider===settings.provider&&old.model===settings.model&&old.endpoint===settings.endpoint&&old.decisionAt>Date.now()-86400000){if(manual){old.evidenceRevision=snapshot.revision;records[tabId]=old;await saveRecords(records);}return {skipped:'内容未变，已复用上次判断。',cached:true};}
    const shared=Object.values(records).find(r=>r.hash===hash&&r.provider===settings.provider&&r.model===settings.model&&r.endpoint===settings.endpoint&&r.decision&&r.decisionAt>Date.now()-86400000);
    if(shared){
      const decision=shared.decision,uncertain=decision.confidence<0.7||(decision.state==='close'&&decision.confidence<0.95);
      records[tabId]={...old,tabId,url:tab.url,windowId:tab.windowId,title:tab.title,hash,evidenceRevision:snapshot.revision,provider:settings.provider,model:settings.model,endpoint:settings.endpoint,decisionAt:shared.decisionAt,decision,state:uncertain?'uncertain':decision.state==='close'?'suggested':decision.state,reason:decision.reason,autoReview:manual&&typeof autoReview==='boolean'?autoReview&&!privateURL(tab.url):old?.autoReview||false};
      if(records[tabId].autoReview){settings.autoAnalyze=true;await chrome.storage.local.set({settings});}
      if(old?.watching&&old.observed==='done')Object.assign(records[tabId],{state:'resume',reason:watchReadyReason(old.watchAdapter)});
      await saveRecords(records);emit();return {skipped:'相同内容，已复用其他标签的判断。',cached:true};
    }
    if(old?.attemptAt>Date.now()-settings.cooldownSeconds*1000)return {skipped:'调用间隔保护生效，稍后再试。'};
    const key=await credentials(settings);buildRequest(settings,evidence);
    const request=reserve(ledger,settings,evidence);
    const attempt={...old,tabId,url:tab.url,windowId:tab.windowId,title:tab.title,attemptAt:Date.now(),evidenceRevision:snapshot.revision,lastInteraction:Math.max(snapshot.lastInteraction||0,tab.lastAccessed||Date.now()),state:old?.state||'keep',autoReview:manual&&typeof autoReview==='boolean'?autoReview:old?.autoReview||false};
    if(privateURL(tab.url))attempt.autoReview=false;
    records[tabId]=attempt;
    if(manual&&attempt.autoReview){settings.autoAnalyze=true;await chrome.storage.local.set({settings});}
    await chrome.storage.local.set({ledger:request.ledger,records});
    return {settings,tab,evidence,hash,attempt,key,reserved:request.reserved};
  });
  if(context.skipped||context.changed||context.deferred)return context;
  try {
    const result=await invoke(context.settings,context.key,context.evidence);
    return await run(async()=>{
      const {records,ledger}=await load(),current=await chrome.tabs.get(tabId).catch(()=>null),latest=records[tabId];
      const nextLedger=settle(ledger,context.reserved,result.usage,context.settings);
      if(!current||current.url!==context.tab.url||latest?.attemptAt!==context.attempt.attemptAt||latest.pardonUntil>Date.now()){
        await chrome.storage.local.set({ledger:nextLedger});return {skipped:'页面或操作状态已变化，本次判断已丢弃。'};
      }
      const uncertain=result.decision.confidence<0.7||(result.decision.state==='close'&&result.decision.confidence<0.95);
      records[tabId]={...latest,hash:context.hash,provider:context.settings.provider,model:context.settings.model,endpoint:context.settings.endpoint,decisionAt:Date.now(),state:uncertain?'uncertain':result.decision.state==='close'?'suggested':result.decision.state,decision:result.decision,apiIssue:null,reason:uncertain?'模型判断仍不确定，保留此页，等待你确认。':result.decision.reason};
      // A page's explicit local completion signal remains stronger than a model guess.
      if(latest.watching&&latest.observed==='done')Object.assign(records[tabId],{state:'resume',reason:watchReadyReason(latest.watchAdapter)});
      await chrome.storage.local.set({records,ledger:nextLedger});emit();return {...result,uncertain};
    });
  } catch(error) {
    await rememberModelCooldown(context.settings,error);
    await run(async()=>{const {records}=await load(),r=records[tabId];if(r?.attemptAt===context.attempt.attemptAt){records[tabId]={...r,autoReview:false,apiIssue:'分析未完成，自动复查已暂停。检查连接后可手动重试。'};await saveRecords(records);emit();}});
    throw error;
  }
}
async function adoptSyncedConnection(id,{passphrase,passkeyKey,automatic=false}={}) {
  const remote = await keychain.sync.info();
  const {settings:current} = await load();
  if (!remote || (id && remote.id!==id)) throw Error('同步连接已变化，请重新打开模型连接。');
  const origin = credentialOrigin(remote.settings.endpoint);
  if (automatic && origin !== credentialOrigin(current.endpoint)) {
    throw Error('同步连接的 API 地址已改变，请在此设备重新授权。');
  }
  if (!await chrome.permissions.contains({origins:[origin+'/*']})) throw Error('请先授权同步连接的 API 地址。');
  const {apiKey} = await keychain.sync.load({id:remote.id,passphrase,passkeyKey});
  keychain.invalidate();
  await run(async()=>{
    const {settings:latest,records} = await load();
    const settings={...latest,...remote.settings,rememberKey:true,credentialStorage:'sync',credentialRevision:remote.id};
    const changed=connectionKey(settings)!==connectionKey(latest);
    const {connectionProfiles}=await chrome.storage.local.get('connectionProfiles');
    await chrome.storage.local.set({settings:{...settings,autoAnalyze:changed?false:settings.autoAnalyze},
      connectionProfiles:copyProfiles(connectionProfiles,latest,settings),
      ...(changed?{records:clearAutoReview(records)}:{})});
    await chrome.storage.session.set({apiKey,apiKeyOrigin:origin,apiKeyRevision:remote.id,credentialPersistedOrigin:origin,
      credentialStatus:{phase:'ready',persisted:true,storage:'sync',reason:'已连接 · Chrome 同步'}});
  });
  emit();
  void resumeQueueAfterConnection().catch(()=>{});
  return {revision:remote.id};
}

async function refreshSyncedConnection() {
  const {settings} = await load();
  const inSync = credentialStorage(settings)==='sync';
  if (!inSync) {emit();return;}
  const current = await keychain.sync.info();
  if (current?.id===settings.credentialRevision) {
    void keychain.restore(settings);
    return;
  }
  keychain.invalidate();
  await chrome.storage.session.remove(['apiKey','apiKeyOrigin','apiKeyRevision','credentialPersistedOrigin','credentialStatus']);
  if (current) {
    try { await adoptSyncedConnection(current.id,{automatic:true}); }
    catch (error) { await keychain.status('unlock_required',error.message); }
  } else {
    await run(async()=>{
      const {settings:latest} = await load();
      await chrome.storage.local.set({settings:{...latest,rememberKey:false,credentialStorage:'session',credentialRevision:crypto.randomUUID()}});
    });
  }
  emit();
}

async function verifySavedConnection(revision) {
  return cloudRun(async()=>{
    const {settings} = await load();
    if (settings.credentialRevision !== revision) return;
    const {connectionCheck:prior} = await chrome.storage.local.get('connectionCheck');
    if (prior?.revision===revision && (prior.ok || Date.now()-prior.at<60000)) return;
    const publish = async result=>{
      if ((await load()).settings.credentialRevision!==revision) return;
      await chrome.storage.local.set({connectionCheck:{revision,at:Date.now(),...result}});
      emit();
    };
    await publish({pending:true});
    try { await testAPI(); await publish({ok:true}); }
    catch (error) { await publish({ok:false,reason:error.message}); }
  });
}

async function testAPI() {
  await restoreBeforeRequest();
  const context=await run(async()=>{
    const {settings,ledger}=await load(),key=await credentials(settings);
    const evidence={title:'Synthetic build task',url:'https://example.com/task',excerpt:'Build completed successfully. Review the result.',signals:{editable:false,dirty:false,media:false,observed:'done'}};
    buildRequest(settings,evidence);const reservation=reserve(ledger,settings,evidence);
    await chrome.storage.local.set({ledger:reservation.ledger});
    return {settings,key,evidence,reserved:reservation.reserved};
  });
  const start=Date.now();
  try {
    const result=await invoke(context.settings,context.key,context.evidence);
    await run(async()=>{const {ledger}=await load();await chrome.storage.local.set({ledger:settle(ledger,context.reserved,result.usage,context.settings)});});
    await chrome.storage.session.set({connectionCheck:{provider:context.settings.provider,at:Date.now(),ok:true}});
    return {...result,provider:context.settings.provider,elapsedMs:Date.now()-start};
  }catch(error){await rememberModelCooldown(context.settings,error);throw error;}
}
async function connectNative(){
  if(native)return native;
  const port=chrome.runtime.connectNative('app.tabpilot.bridge');native=port;
  expectNativeHello(port);
  port.onDisconnect.addListener(()=>{
    const linkError = chrome.runtime.lastError?.message || '';
    for(const [id,pending] of nativePending)if(pending.port===port){clearTimeout(pending.timer);pending.reject(Error('辅助程序连接中断，密钥未保存或恢复。'));nativePending.delete(id);}
    if (native !== port) return;
    native = null;
    activeOverlay = null;
    nativeCapabilities.clear();
    nativeConnection = {status:/host (?:was )?not found|no such native application/i.test(linkError) ? 'missing' : 'disconnected'};
    finishNativeHello();
    mru.disconnected();
    chrome.storage.session.set({nativeStatus:{status:nativeConnection.status,reason:'Mac 助手未连接。'}}).then(emit);
  });
  port.onMessage.addListener(message=>{
    if(message.type==='credentialResult'){
      const pending=nativePending.get(message.requestId);if(!pending||pending.port!==port)return;nativePending.delete(message.requestId);clearTimeout(pending.timer);if(message.ok===true)pending.resolve(message);
      else{
        const reason=message.code==='forbidden'
          ?'macOS 无法验证当前 Chrome 的原生连接。如果 Chrome 刚更新，请完整退出后重新打开，再恢复已保存的连接。'
          :message.error||'无法访问 macOS 钥匙串。';
        pending.reject(Object.assign(Error(reason),{code:message.code,status:message.status,requiresInteraction:message.requiresInteraction}));
      }
      return;
    }
    if(message.type?.startsWith('mru')){mru.receive(message);return;}
    if(Array.isArray(message.capabilities))nativeCapabilities=new Set(message.capabilities);
    if (message.type === 'status') {
      if (['ready','accessibility_required'].includes(message.status)) {
        nativeConnection = {status:message.status, version:message.version};
        finishNativeHello();
      }
      chrome.storage.session.set({nativeStatus:message}).then(emit);
    }
    if(message.type==='closeVisibility'&&Number.isInteger(message.tabId))run(async()=>{
      if(activeOverlay?.port!==port||activeOverlay.visibilityId!==message.visibilityId||activeOverlay.tabId!==message.tabId)return;
      const {records}=await load(),record=records[message.tabId];
      if(!record||record.visibilityId!==message.visibilityId||!['closing','paused'].includes(record.state))return;
      records[message.tabId]={...record,nativeVisible:message.visible===true,nativeVisibleAt:Date.now(),nativeVisibilityId:message.visibilityId};
      await saveRecords(records);
      await updateCountdownVisibility(message.tabId,undefined,true);
    });
    if(activeOverlay?.port!==port||activeOverlay.kind!=='countdown'||activeOverlay.tabId!==message.tabId)return;
    if(message.type==='closeHover')run(()=>pauseClose(message.tabId,message.paused===true));
    if(message.type==='pardon')run(()=>cancelClose(message.tabId,true));
  });
  port.postMessage({type:'hello'});return port;
}
async function nativeCredential(action,payload){
  const port=await connectNative();await nativeHello;
  if(!nativeCapabilities.has('credentials-v1'))throw Error('记住连接需要已安装的 macOS 辅助程序 0.4.0 或更新版本。');
  if(action==='save'&&!nativeCapabilities.has('credentials-v2'))throw Error('长期保存需要 0.5.0 或更新的稳定签名辅助程序。请更新后重试，无需重新导入已有密钥。');
  const requestId=crypto.randomUUID();
  return new Promise((resolve,reject)=>{const timer=setTimeout(()=>{nativePending.delete(requestId);reject(Error('钥匙串操作未完成。请在本机允许访问后重试。'));},payload.interactive?60000:5000);nativePending.set(requestId,{resolve,reject,timer,port});try{port.postMessage({type:'credential.'+action,requestId,...payload});}catch(error){clearTimeout(timer);nativePending.delete(requestId);reject(error);}});
}
async function nativeShow(tabId,kind="resume") {
  const {settings,records}=await load();if(!settings.nativeEnabled)throw new Error('在设置中启用已安装的 macOS 辅助程序后重试。');
  if(kind==='resume'&&activeOverlay?.kind==='countdown')return {skipped:'关闭提醒结束后可查看此事项。'};
  const tab=await chrome.tabs.get(tabId),w=await chrome.windows.get(tab.windowId),siblings=await chrome.tabs.query({windowId:tab.windowId}),labels=[tab.title];
  if(tab.incognito||records[tabId]?.url&&records[tabId].url!==tab.url)throw Error('标签页已变化。');
  if(tab.groupId>=0){const group=await chrome.tabGroups.get(tab.groupId);labels.push(tab.title+' - 属于“'+group.title+'”群组',tab.title+' - Part of '+group.title+' group');}
  if(tab.pinned)labels.push(tab.title+' - 已固定',tab.title+' - Pinned');
  const port=await connectNative();
  if(kind==='countdown')await nativeHello;
  if(kind==='countdown'&&!nativeCapabilities.has('countdown-v1'))return {skipped:'辅助程序需要更新；倒计时仍在侧栏显示。'};
  const r=records[tabId];
  activeOverlay={port,tabId,kind,visibilityId:kind==='countdown'?r.visibilityId:null};
  const overlay=kind==='countdown'?{kind,closeAt:r.closeAt,paused:r.state==='paused',remainingMs:r.remainingMs,visibilityId:r.visibilityId}:undefined;
  port.postMessage({type:'show',target:{tabId,title:tab.title,labels,otherTitles:siblings.filter(t=>t.id!==tabId).map(t=>t.title),window:{left:w.left,top:w.top,width:w.width,height:w.height},titleCount:siblings.filter(t=>t.title===tab.title).length},message:kind==='countdown'?'关闭提醒':'可以继续了',duration:kind==='countdown'?60:20,overlay});
  return {ok:true};
}
async function cancelClose(tabId,explicit=false) {
  const {records}=await load(),record=records[tabId];
  if(record&&(explicit||['closing','paused'].includes(record.state))) {
    records[tabId]=pardon(record);await saveRecords(records);await chrome.alarms.clear('close:'+tabId);
    hideOverlay(tabId);emit();
  }
  return {ok:true};
}
function hideOverlay(tabId){
  if(!activeOverlay||tabId!==undefined&&activeOverlay.tabId!==tabId)return;
  const {port}=activeOverlay;
  activeOverlay=null;
  try{port.postMessage({type:'hide'});}catch{}
}
async function countdownVisible(record,settings){
  const {chromeFocusedWindow}=await session();
  if(Number.isInteger(chromeFocusedWindow)&&chromeFocusedWindow!==record.windowId)return false;
  const window=await chrome.windows.get(record.windowId).catch(()=>null);
  if(!window||window.focused===false||window.state==='minimized')return false;
  if(record.closeSurface==='native'){
    return settings.nativeEnabled&&activeOverlay?.tabId===record.tabId
      &&activeOverlay.visibilityId===record.visibilityId
      &&nativeCapabilities.has('visibility-v1')&&nativeVisibilityFresh(record);
  }
  return !!await leaseFor(record);
}
function eligibleToClose(tab,snapshot,record){
  return record.closeIntent==='manual'?!guard(tab,snapshot):closeCandidate(tab,snapshot,record.decision);
}
async function matchesCloseEvidence(tab,snapshot,record){
  return tab&&snapshot&&tab.url===record.url&&tab.windowId===record.windowId
    &&(record.evidenceRevision??0)===(snapshot.revision??0)
    &&eligibleToClose(tab,snapshot,record)
    &&await fingerprint(boundedEvidence(tab,snapshot))===record.hash;
}
async function updateCountdownVisibility(tabId,hovered,nativeSample=false){
  const {records,settings}=await load(),record=records[tabId];
  if(!record||!['closing','paused'].includes(record.state))return {ok:true};
  const visible=await countdownVisible(record,settings);
  // 原生计时只消费来自浮标的采样。侧栏刷新、系统闹钟与焦点事件只负责暂停。
  if(record.closeSurface==='native'&&visible&&!nativeSample&&hovered===undefined)return {ok:true};
  const next=advanceCountdown(record,{visible,hovered});
  if(next.state==='closing'&&record.state==='paused'){
    const tab=await chrome.tabs.get(tabId).catch(()=>null),snapshot=await readSnapshot(tabId).catch(()=>null);
    if(!await matchesCloseEvidence(tab,snapshot,record))return cancelClose(tabId);
  }
  records[tabId]=next;
  await saveRecords(records);
  if(next.state==='paused')await chrome.alarms.clear('close:'+tabId);
  else if(next.closeSurface==='native'){
    if(nativeSample&&next.remainingMs===0)await finishClose(tabId);
  }else if(record.state!=='closing'||Math.abs((record.closeAt||0)-next.closeAt)>100||record.remainingMs>0&&next.remainingMs===0){
    await chrome.alarms.create('close:'+tabId,{when:next.closeAt});
  }
  syncNativeCountdown(tabId,next);
  emit();
  return {ok:true};
}
async function pauseClose(tabId,pause){return updateCountdownVisibility(tabId,pause);}
function syncNativeCountdown(tabId,record){
  if(activeOverlay?.tabId===tabId&&activeOverlay.visibilityId===record.visibilityId){
    activeOverlay.port.postMessage({type:'overlayUpdate',tabId,overlay:{kind:'countdown',closeAt:record.closeAt,paused:record.state==='paused',remainingMs:record.remainingMs,visibilityId:record.visibilityId}});
  }
}
async function finishClose(tabId){
  const {records,settings}=await load(),record=records[tabId];
  if(!record||record.state!=='closing'||record.remainingMs!==0)return;
  const tab=await chrome.tabs.get(tabId).catch(()=>null),snapshot=await readSnapshot(tabId).catch(()=>null);
  if(!await matchesCloseEvidence(tab,snapshot,record))return cancelClose(tabId);
  if(!await countdownVisible(record,settings))return updateCountdownVisibility(tabId);
  if(!mayClose(record,tab,snapshot,await leaseFor(record),Date.now(),record.closeSurface==='native'))return cancelClose(tabId);
  const {recentClosed=[]}=await chrome.storage.session.get('recentClosed');
  const entry={id:crypto.randomUUID(),title:tab.title,url:tab.url,windowId:tab.windowId,at:Date.now()};
  try{await chrome.tabs.remove(tabId);}catch{return cancelClose(tabId);}
  delete records[tabId];
  await saveRecords(records);
  await chrome.storage.session.set({recentClosed:[entry,...recentClosed.filter(x=>Date.now()-x.at<1800000)].slice(0,20)});
  hideOverlay(tabId);
  emit();
}
async function armClose(tabId,{manual=false}={}){
  const {records,settings}=await load(),record=records[tabId];
  const tab=await chrome.tabs.get(tabId),snapshot=await readSnapshot(tabId);
  if(['closing','paused'].includes(record?.state))throw Error('此页已有关闭提醒。');
  if(manual){
    const reason=guard(tab,snapshot);
    if(reason)throw Error(reason);
  }else if(!record||!await matchesCloseEvidence(tab,snapshot,record)||record.pardonUntil>Date.now()){
    throw Error('页面受保护或内容已变化。请保留此页并重新分析。');
  }
  let surface='panel';
  if(settings.nativeEnabled){
    if(activeOverlay?.kind==='countdown')throw Error('请先处理标签栏上已有的关闭提醒。');
    const port=await connectNative().catch(()=>null);
    if(port){
      await nativeHello;
      if(nativeCapabilities.has('countdown-v1')&&nativeCapabilities.has('visibility-v1'))surface='native';
    }
  }
  if(surface==='panel'&&(manual||!await leaseFor(record)))throw Error(manual?
    '标签栏关闭提醒需要 Mac 助手。请打开 Tab Cadence 的「设置 → macOS」，下载安装助手并开启标签提醒。':
    '请从可见的管理面板开始关闭提醒，或在 Tab Cadence 的「设置 → macOS」安装助手并开启标签提醒。');
  const next={...record,tabId,windowId:tab.windowId,url:tab.url,title:tab.title,state:'paused',closeSurface:surface,
    closeIntent:manual?'manual':'suggestion',hash:await fingerprint(boundedEvidence(tab,snapshot)),
    evidenceRevision:snapshot.revision??0,closeAt:null,remainingMs:30000,counting:false,hoverPaused:false,
    visibilityPaused:true,visibilityId:crypto.randomUUID(),nativeVisible:false,nativeVisibleId:null,nativeVisibleAt:null};
  records[tabId]=next;
  await saveRecords(records);
  try{
    if(surface==='native'){
      const result=await nativeShow(tabId,'countdown');
      if(!result.ok)throw Error('暂时无法显示标签浮标。');
    }
    await updateCountdownVisibility(tabId);
  }catch(error){await cancelClose(tabId);throw error;}
  emit();
  return {ok:true};
}
async function restoreOrder(source) {
  const units=[];const seen=new Set();
  for(const tab of [...source].sort((a,b)=>a.index-b.index)) {
    if(tab.pinned)continue;
    if(tab.groupId>=0){if(seen.has(tab.groupId))continue;seen.add(tab.groupId);units.push({groupId:tab.groupId,index:tab.index});}
    else units.push({id:tab.id,index:tab.index});
  }
  for(const item of units)if(item.groupId>=0)await chrome.tabGroups.move(item.groupId,{index:item.index});else await chrome.tabs.move(item.id,{index:item.index});
}
async function applyOrganization(plan) {
  const source=await chrome.tabs.query({windowId:plan?.windowId});
  if(!plan||identity(source)!==plan.identity)throw new Error('标签已变化；重新预览整理方案后再应用。');
  const fresh=organizationPlan(source,plan.windowId);
  if(JSON.stringify(fresh.groups)!==JSON.stringify(plan.groups))throw new Error('整理方案已变化；重新预览后再应用。');
  if(!fresh.groups.length)return {groups:0};
  const transaction={source,created:[],windowId:plan.windowId,at:Date.now()};
  try {
    for(const group of fresh.groups){
      const id=await chrome.tabs.group({tabIds:group.tabIds,createProperties:{windowId:plan.windowId}});
      transaction.created.push({id,tabIds:group.tabIds});
      await chrome.tabGroups.update(id,{title:group.title,color:'grey',collapsed:false});
      await chrome.tabGroups.move(id,{index:-1});
    }
    transaction.after=identity(await chrome.tabs.query({windowId:plan.windowId}));
    await chrome.storage.session.set({organizationUndo:transaction});emit();return {groups:fresh.groups.length};
  } catch(error) {
    for(const g of transaction.created)await chrome.tabs.ungroup(g.tabIds).catch(()=>{});
    await restoreOrder(source).catch(()=>{});
    throw new Error('整理未完成，已尝试还原；检查标签栏后重新预览。');
  }
}
async function undoOrganization() {
  const {organizationUndo:t}=await chrome.storage.session.get('organizationUndo');
  if(!t)throw new Error('没有可撤销的整理；先预览并应用方案。');
  if(identity(await chrome.tabs.query({windowId:t.windowId}))!==t.after)throw new Error('标签结构已再次变化，为保留新操作，请在 Chrome 中调整分组。');
  for(const group of t.created)await chrome.tabs.ungroup(group.tabIds);
  await restoreOrder(t.source);await chrome.storage.session.remove('organizationUndo');emit();return {ok:true};
}
async function topicConversation(sender) {
  const tab = await chrome.tabs.get(sender.tab.id).catch(() => null);
  if (!tab || tab.incognito || !await threadWorkspace.status().then(state => state.enabled)) {
    throw new Error('当前 ChatGPT 页面未获对话工具授权。');
  }
  return conversationAt(tab.url);
}

const topicActions = ['topicsRead','topicsOpen','topicsGenerate','topicsConnection','topicsCached'];
const attemptKey = 'threadTopicAttempts';
async function rememberTopicAttempt(storage, key, value) {
  const { [attemptKey]: current = {} } = await storage.get(attemptKey);
  const retained = Object.entries(current).filter(([id, state]) => id !== key && state.until > Date.now()).slice(-31);
  if (value) retained.push([key,value]);
  await storage.set({[attemptKey]:Object.fromEntries(retained)});
}
async function conversationTopics(action, value, sender) {
  const conversation = await topicConversation(sender);
  if (action === 'topicsConnection') {
    if (!conversation) throw Error('当前会话无法打开模型连接。');
    await chrome.tabs.create({url:chrome.runtime.getURL('sidepanel.html')+'?view=connection'});
    return {opened:true};
  }
  const automatic = action === 'topicsOpen';
  const storage = chrome.storage.local;
  if (action === 'topicsCached') return readLatestTopicOverview(storage, conversation, value);
  const settings = (await load()).settings;
  let connection;
  try {
    connection = topicConnection(settings);
  } catch (error) {
    if (automatic || action === 'topicsRead') return {state:'connection',description:error.message};
    throw error;
  }
  const snapshot = await topicSnapshot(value, conversation, await topicBatchLimit(storage, conversation, connection));
  if (action === 'topicsRead') return (await readTopics(storage,snapshot,connection)).view;
  if (automatic) {
    const {threadWorkspacePreferences} = await storage.get('threadWorkspacePreferences');
    if (threadWorkspacePreferences?.autoTopicSummary === false) return (await readTopics(storage,snapshot,connection)).view;
  }
  const key = await fingerprint({conversation,model:connection.model,revision:settings.credentialRevision||'',batches:snapshot.batches.map(batch=>batch.digest)});
  return cloudRun(async () => {
    const {view, parts} = await readTopics(storage, snapshot, connection);
    if (view.state === 'ready') { await rememberTopicOverview(storage, snapshot, connection); return view; }
    if (automatic) {
      const previous = (await storage.get(attemptKey))[attemptKey]?.[key];
      if (previous?.until > Date.now()) return {state:previous.state,description:previous.description};
    }
    await restoreBeforeRequest();
    let attempted = false;
    async function generate(batch) {
      if (parts[batch.digest]) return;
      const context = await run(async () => {
        if (await topicConversation(sender) !== snapshot.conversation) throw new Error('已切换会话，分析已停止。');
        const {settings, ledger} = await load();
        if (topicConnection(settings).model !== connection.model) throw new Error('模型已更改，请重新打开概览。');
        const key = await credentials(settings);
        const reservation = reserve(ledger, settings, batch.evidence);
        await storage.set({ledger: reservation.ledger});
        return {settings, key, reservation};
      });
      await rememberTopicAttempt(storage,key,{state:'error',until:Date.now() + 120000,description:'上次生成尚未确认完成。'});
      attempted = true;
      let response;
      try {
        response = await requestTopics(connection, context.key, batch, snapshot.detailed);
      } catch (error) {
        await rememberModelCooldown(context.settings,error);
        await run(() => settleTopicUsage(context, error.usage));
        emit();
        throw error;
      }
      await run(async () => {
        await settleTopicUsage(context, response.usage);
        await saveTopicBatch(storage, snapshot, connection, batch, response.result);
        emit();
      });
      parts[batch.digest] = response.result;
    }
    try {
      for (const batch of snapshot.batches) await generate(batch);
      const synthesis = await topicSynthesis(snapshot, parts);
      if (synthesis) await generate(synthesis);
      if (attempted) await rememberTopicAttempt(storage,key,null);
      return (await readTopics(storage, snapshot, connection)).view;
    } catch (error) {
      const quota = error.status === 429 || error.code === 'provider_backoff';
      const needsConnection = error.code === 'connection_required' || [401,403].includes(error.status);
      const result = needsConnection ? {state:'connection',description:'连接未就绪，可在模型连接中恢复。'} :
        quota ? {state:'cooldown',description:'OpenAI 请求受限，请稍后再试。'} :
        {state:'error',description:['invalid_topic_output','model_connection'].includes(error.code)||Number.isInteger(error.status) ? error.message : '摘要暂未生成，可重试。'};
      if (attempted) await rememberTopicAttempt(storage,key,{...result,until:quota ? error.retryAt || Date.now()+300000 : Date.now()+120000});
      if (automatic) return result;
      throw error;
    }
  });
}

async function settleTopicUsage(context, usage) {
  if (!usage) return;
  const {ledger} = await load();
  if (ledger?.date !== context.reservation.ledger.date) return;
  await chrome.storage.local.set({ledger: settle(ledger, context.reservation.reserved, usage, context.settings)});
}


const threadWorkspace=createThreadWorkspace(chrome,conversationTopics);
function isPanelSender(sender) {
  const url=chrome.runtime.getURL?.('sidepanel.html');
  return Boolean(url&&(sender.url===url||sender.url===url+'?view=connection'));
}
async function onMessage(message,sender) {
  const m=message;
  if(m.type==='threadWorkspace')return threadWorkspace.handle(m,sender);
  const isPanel=isPanelSender(sender);
  if(sender.tab&&!isPanel){
    if(sender.id!==chrome.runtime.id||sender.frameId>0||sender.tab.incognito)throw Error('来源不受信任。');
    if(m.type==='watchFromPage')return submitWatchFromPage(m,sender);
    if(m.type==='interact'){
      const {records}=await load(),r=records[sender.tab.id];
      if(r){records[sender.tab.id]={...r,lastInteraction:Date.now()};await saveRecords(records);}
      await cancelClose(sender.tab.id);return {ok:true};
    }
    if(m.type==='sensor'){
      if(!m.snapshot||sender.url&&sender.url!==sender.tab.url)return {ok:true};
      const {snapshots={}}=await session();snapshots[sender.tab.id]=m.snapshot;await chrome.storage.session.set({snapshots});
      const {records,settings}=await load(),record=records[sender.tab.id];
      if(record?.watching&&record.url===sender.tab.url&&(!record.watchDocumentId||sender.documentId===record.watchDocumentId)){
        if(m.snapshot.observed==='done'&&record.observed!=='done'){
          records[sender.tab.id]={...record,state:'resume',observed:'done',watchSuspended:null,reason:watchReadyReason(record.watchAdapter)};
          await saveRecords(records);emit();if(settings.nativeEnabled)await nativeShow(sender.tab.id).catch(()=>{});
        }else if(record.observed!=='done'&&m.snapshot.observed!==record.observed){
          const waiting=m.snapshot.observed==='waiting';
          records[sender.tab.id]={...record,observed:m.snapshot.observed,state:waiting?'waiting':'uncertain',reason:waiting?'正在本地监听，完成后提醒。':'暂未匹配到唯一状态，请返回页面检查或调整监听文案。'};
          await saveRecords(records);emit();
        }
      }
      return {ok:true};
    }
    throw new Error('此操作只能从扩展面板发起。');
  }
  if(sender.id!==chrome.runtime.id)throw new Error('来源不受信任。');
  if(m.type==='state'){
    const d=await load(),s=await session(),extra=await chrome.storage.session.get(['nativeStatus','switcherStatus','organizationUndo','recentClosed','credentialStatus']),tabs=(await chrome.tabs.query({})).filter(t=>!t.incognito);
    const [syncConnection,{connectionCheck,connectionProfiles}] = await Promise.all([
      keychain.sync.info().catch(()=>null),chrome.storage.local.get(['connectionCheck','connectionProfiles'])]);
    if(d.settings.rememberKey&&!currentKey(d.settings,s))void keychain.restore(d.settings);
    const liveRecords=Object.fromEntries(tabs.filter(t=>d.records[t.id]?.url===t.url&&d.records[t.id]?.windowId===t.windowId).map(t=>[t.id,d.records[t.id]]));
    return {...d,analysisQueue:queueSummary(await backlog.read()),credentialSaved:s.credentialPersistedOrigin===credentialOrigin(d.settings.endpoint),credentialStatus:extra.credentialStatus,keychainAvailable:nativeCapabilities.has('credentials-v1'),records:liveRecords,keyPresent:currentKey(d.settings,s),nativeStatus:extra.nativeStatus,switcherStatus:extra.switcherStatus,syncConnection,connectionProfiles,connectionCheck:connectionCheck?.revision===d.settings.credentialRevision?connectionCheck:null,canUndoOrganization:!!extra.organizationUndo,recentClosed:(extra.recentClosed||[]).filter(r=>Date.now()-r.at<1800000).map(({id,title,at})=>({id,title,at})),duplicates:duplicates(tabs),tabs};
  }
  if(m.type==='backlogPlan'){
    const {settings}=await load();let tabs=await chrome.tabs.query({});
    if(chrome.windows.getAll){const windows=await chrome.windows.getAll({windowTypes:['normal']});const ids=new Set(windows.map(w=>w.id));tabs=tabs.filter(t=>ids.has(t.windowId));}
    const plan=backlogPlan(tabs,Number.isInteger(m.windowId)?m.windowId:null),id=crypto.randomUUID();
    await run(async()=>{
      const now=Date.now(),{backlogPlans={}}=await chrome.storage.session.get('backlogPlans');
      const active=Object.entries(backlogPlans).filter(([,entry])=>now-entry.createdAt<=600000).slice(-7);
      await chrome.storage.session.set({backlogPlans:{...Object.fromEntries(active),
        [id]:{...plan,id,connectionKey:connectionKey(settings),createdAt:now}}});
    });
    return {id,count:plan.targets.length,excluded:plan.skipped.length,waiting:plan.waiting,local:plan.local,
      unavailable:plan.unavailable,sites:plan.sites,endpointOrigin:credentialOrigin(settings.endpoint)};
  }
  if(m.type==='backlogStart'){
    const {plan,origins}=await run(async()=>{
      const {backlogPlans={}}=await chrome.storage.session.get('backlogPlans'),{settings}=await load();
      const plan=backlogPlans[m.planId];
      if(m.consent!==true||!plan||plan.id!==m.planId||Date.now()-plan.createdAt>600000||
        plan.connectionKey!==connectionKey(settings))throw Error('发送范围已变化，请重新检查网页。');
      const origins=Array.isArray(m.origins)?[...new Set(m.origins)]:[];
      const available=new Set(plan.sites.map(site=>site.origin));
      if(!origins.length||!origins.every(origin=>available.has(origin))||
        !await chrome.permissions.contains({origins:origins.map(origin=>origin+'/*')}))throw Error('选择网站并允许读取后再开始。');
      delete backlogPlans[m.planId];
      await chrome.storage.session.set({backlogPlans});
      return {plan,origins};
    });
    await backlog.start(plan,origins,plan.connectionKey,m.autoReview===true);
    return {ok:true};
  }
  if(m.type==='backlogStop'){await backlog.stop();return {ok:true};}
  if(m.type==='backlogDismiss'){await backlog.dismiss();return {ok:true};}
  if(m.type==='backlogPause'){await backlog.pause();return {ok:true};}
  if(m.type==='backlogResume'){await backlog.resume();return {ok:true};}
  if(m.type==='nativeCheck')return checkNative(m.refresh===true);
  if(m.type==='saveSwitcher'){
    if(typeof m.enabled!=='boolean')throw new Error('重新选择快捷切换开关后重试。');
    if (m.enabled) await requireNativeAccessibility();
    const {settings}=await load();await chrome.storage.local.set({settings:{...settings,switcherEnabled:m.enabled}});await mru.configure(m.enabled);return {ok:true};
  }
  if(m.type==='saveSettings'){
    const {settings:previous}=await load();
    const scopeFields=m.scope==='usage'?['cooldownSeconds','inputPrice','outputPrice','autoAnalyze']:m.scope==='connection'?['provider','endpoint','model','rememberKey','credentialStorage']:null;
    if(m.scope==='usage'&&m.apiKey)throw Error('请在模型连接页保存密钥。');
    const requested=scopeFields?Object.fromEntries(scopeFields.filter(key=>key in (m.settings||{})).map(key=>[key,m.settings[key]])):m.settings;
    const s=cleanSettings({...previous,...requested});
    if (m.scope==='connection' && s.provider==='decisions') Object.assign(s,{endpoint:DEFAULTS.endpoint,model:DEFAULTS.model});
    if(!['decisions','responses','chat'].includes(s.provider)||!s.model?.trim()||!Number.isFinite(s.cooldownSeconds)||s.cooldownSeconds<60||s.cooldownSeconds>3600||![s.inputPrice,s.outputPrice].every(x=>Number.isFinite(x)&&x>=0&&x<=1000))throw new Error('检查调用设置：单页间隔需为 60–3600 秒，费用单价需为有效非负数。');
    buildRequest(s,{});
    if(m.scope==='usage'){await run(async()=>{const {settings:latest}=await load();await chrome.storage.local.set({settings:{...latest,cooldownSeconds:s.cooldownSeconds,inputPrice:s.inputPrice,outputPrice:s.outputPrice,autoAnalyze:s.autoAnalyze}});});emit();return {ok:true};}
    s.rememberKey = s.rememberKey === true;
    s.credentialStorage = credentialStorage(s);
    const persistsNewKey = s.rememberKey && (!!m.apiKey?.trim() || !previous.rememberKey ||
      credentialStorage(previous) !== s.credentialStorage || credentialOrigin(previous.endpoint) !== credentialOrigin(s.endpoint));
    if (persistsNewKey && m.rememberConsent !== true) throw Error('请选择密钥保存位置后再保存连接。');
    const oldSession = await session();
    const prepared = await keychain.prepareSave(s,m.apiKey,previous,{passphrase:m.syncPassphrase,expectedId:m.syncId,passkey:m.passkey,passkeyKey:m.passkeyKey});
    const sameCredential = connectionKey(s)===connectionKey(previous) && prepared.apiKey===oldSession.apiKey;
    if (s.credentialStorage!=='sync') s.credentialRevision = sameCredential && previous.credentialRevision || crypto.randomUUID();
    await run(async () => {
      const {settings:latest,records} = await load();
      s.nativeEnabled = latest.nativeEnabled;
      s.switcherEnabled = latest.switcherEnabled;
      const {connectionCheck,connectionProfiles}=await chrome.storage.local.get(['connectionCheck','connectionProfiles']);
      const verified=sameCredential&&connectionCheck?.ok&&connectionCheck.revision===previous.credentialRevision;
      const changed=connectionKey(s)!==connectionKey(latest);
      if(changed)s.autoAnalyze=false;
      await chrome.storage.local.set({settings:s,connectionProfiles:copyProfiles(connectionProfiles,latest,s),
        ...(changed?{records:clearAutoReview(records)}:{}),
        ...(verified?{connectionCheck:{...connectionCheck,revision:s.credentialRevision}}:{})});
      if (prepared.apiKey) {
        await chrome.storage.session.set({apiKey:prepared.apiKey,apiKeyOrigin:prepared.origin,apiKeyRevision:s.credentialRevision,
          credentialPersistedOrigin:prepared.persisted ? prepared.origin : null,
          credentialStatus:{phase:prepared.persisted ? 'ready' : 'session',persisted:prepared.persisted,
            storage:prepared.storage,reason:prepared.reason}});
      } else {
        await chrome.storage.session.remove(['apiKey','apiKeyOrigin','apiKeyRevision','credentialPersistedOrigin','credentialStatus']);
      }
    });
    if(!s.nativeEnabled&&!s.switcherEnabled&&s.credentialStorage!=='keychain'){native?.postMessage({type:'hide'});native?.disconnect();native=null;}
    emit();void resumeQueueAfterConnection().catch(()=>{});
    if (m.scope==='connection' && m.verify===true && prepared.apiKey) await verifySavedConnection(s.credentialRevision);
    return {ok:true};
  }
  if (m.type==='unlockSync') {
    const passphrase=typeof m.syncPassphrase==='string'&&m.syncPassphrase.length<=256?m.syncPassphrase:'';
    const passkeyKey=typeof m.passkeyKey==='string'&&m.passkeyKey.length===43?m.passkeyKey:'';
    if (!passphrase&&!passkeyKey) throw Error('请验证此设备后恢复连接。');
    const {revision} = await adoptSyncedConnection(m.syncId,{passphrase,passkeyKey});
    await verifySavedConnection(revision);
    return {ok:true};
  }
  if(m.type==='restoreKey'){const {settings}=await load();if(!await keychain.restore(settings,{interactive:true,force:true})){const {credentialStatus}=await chrome.storage.session.get('credentialStatus');throw Error(credentialStatus?.reason||'尚未保存连接。');}return {ok:true};}
  if(m.type==='saveNative'){if(m.enabled===true)await requireNativeAccessibility();const {settings}=await load();await chrome.storage.local.set({settings:{...settings,nativeEnabled:m.enabled===true}});if(!m.enabled){hideOverlay();const {records}=await load();for(const [id,record] of Object.entries(records))if(record.closeSurface==='native'&&['closing','paused'].includes(record.state))await cancelClose(Number(id));}emit();return {ok:true};}
  if(m.type==='forgetKey'){const {settings}=await load();await keychain.forget(settings);await run(async()=>{const {settings:latest}=await load();await chrome.storage.local.set({settings:{...latest,rememberKey:false,credentialStorage:'session',credentialRevision:crypto.randomUUID()}});await chrome.storage.session.remove(['apiKey','apiKeyOrigin','apiKeyRevision','credentialPersistedOrigin','connectionCheck','credentialStatus']);await chrome.storage.local.remove('connectionCheck');});emit();return {ok:true};}
  if(m.type==='snapshot'){const tab=await chrome.tabs.get(m.tabId);return boundedEvidence(tab,await readSnapshot(m.tabId));}
  if(m.type==='captureText'){return chrome.tabs.sendMessage(m.tabId,{type:'selection'});}
  if(m.type==='watchPage'){
    const tab=await chrome.tabs.get(m.tabId);
    if(!trackableTab(tab)||tab.url!==m.url||backlogWaiting(tab))throw Error('等目标网页载入后再开始监听。');
    if(!await chrome.permissions.contains({origins:[new URL(tab.url).origin+'/*']}))throw Error('请允许读取此网站。');
    return openWatchPrompt(tab,{pick:m.pick===true,focus:true});
  }
  if(m.type==='watch')return beginWatch(m.tabId,m.adapter);
  if(m.type==='stopWatch'){
    const {records}=await load();if(records[m.tabId])records[m.tabId]={...records[m.tabId],watching:false,state:'keep',reason:'已停止监听。'};
    await saveRecords(records);await chrome.tabs.sendMessage(m.tabId,{type:'adapter',adapter:null}).catch(()=>{});emit();return {ok:true};
  }
  if(m.type==='autoReview'){
    const {records}=await load();if(records[m.tabId])records[m.tabId]={...records[m.tabId],autoReview:false};await saveRecords(records);emit();return {ok:true};
  }
  if(m.type==='pardon')return cancelClose(m.tabId,true);
  if(m.type==='pauseClose')return pauseClose(m.tabId,m.paused===true);
  if(m.type==='nativeShow')return nativeShow(m.tabId);
  if(m.type==='nativeHide'){hideOverlay();return {ok:true};}
  if(m.type==='lease'){
    const {leases:previous={}}=await session(),key=sender.documentId||'window:'+m.windowId;
    previous[key]={visible:m.visible,windowId:m.windowId,tabIds:Array.isArray(m.tabIds)?m.tabIds.filter(Number.isInteger):[],at:Date.now()};
    const leases=Object.fromEntries(Object.entries(previous).filter(([,value])=>Date.now()-value.at<=6000).sort((a,b)=>b[1].at-a[1].at).slice(0,32));
    await chrome.storage.session.set({leases});
    const {records}=await load();for(const [id,r]of Object.entries(records))if(['closing','paused'].includes(r.state)){if(r.closeSurface!=='native'&&m.visible===true&&m.windowId===r.windowId&&!Object.values(leases).some(lease=>visibilityLease(lease,r)))await cancelClose(Number(id));else await updateCountdownVisibility(Number(id));}
    return {ok:true};
  }
  if(m.type==='armClose')return armClose(m.tabId);
  if(m.type==='activate'){
    await cancelClose(m.tabId);const {records}=await load(),r=records[m.tabId];
    if(r?.state==='resume'){records[m.tabId]={...r,state:'keep',watching:false,reason:'已接手。需要继续等待时可重新开始监听。'};await saveRecords(records);await chrome.tabs.sendMessage(m.tabId,{type:'adapter',adapter:null}).catch(()=>{});emit();}
    const tab=await chrome.tabs.update(m.tabId,{active:true});await chrome.windows.update(tab.windowId,{focused:true});return {ok:true};
  }
  if(m.type==='organizationPlan')return organizationPlan(await chrome.tabs.query({windowId:m.windowId}),m.windowId);
  if(m.type==='organize')return applyOrganization(m.plan);
  if(m.type==='undoOrganization')return undoOrganization();
  if(m.type==='reopen'){
    const {recentClosed=[]}=await chrome.storage.session.get('recentClosed'),entry=recentClosed.find(r=>r.id===m.id&&Date.now()-r.at<1800000);
    if(!entry||!safeURL(entry.url))throw new Error('记录已过期；可在 Chrome 的最近关闭页面中查找。');
    await chrome.tabs.create({url:entry.url,active:false,windowId:entry.windowId}).catch(()=>chrome.tabs.create({url:entry.url,active:false}));
    await chrome.storage.session.set({recentClosed:recentClosed.filter(r=>r.id!==entry.id)});emit();return {ok:true};
  }
  throw new Error('无法识别操作；重新打开面板后重试。');
}
chrome.runtime.onMessage.addListener((m,sender,reply)=>{
  if(m.type==='updated')return;
  const cloud=['analyze','testAPI'].includes(m.type);
  const topics=m.type==='threadWorkspace'&&topicActions.includes(m.action);
  const operation=topics?threadWorkspace.handle(m,sender):cloud?cloudRun(async()=>{
    if(sender.id!==chrome.runtime.id||sender.tab&&!isPanelSender(sender))throw new Error('此操作只能从扩展面板发起。');
    return m.type==='testAPI'?testAPI():analyze(m.tabId,true,m.autoReview,m.expectedHash,
      {connection:m.expectedConnection});
  }):['saveSettings','forgetKey','restoreKey','unlockSync'].includes(m.type)?configRun(()=>onMessage(m,sender)):['backlogPlan','backlogStart','backlogPause','backlogResume','backlogDismiss','backlogStop'].includes(m.type)?onMessage(m,sender):run(()=>onMessage(m,sender));
  operation.then(data=>reply({ok:true,data}),error=>reply({ok:false,error:error.message}));return true;
});
chrome.alarms.onAlarm.addListener(alarm=>{
  if(alarm.name==='backlog'){void backlog.tick().catch(()=>{});return;}
  if(alarm.name==='review') {
    cloudRun(async()=>{
      const {settings,records}=await load();if(!settings.autoAnalyze||Date.now()<await modelCooldown(settings))return;
      const candidate=scheduledCandidate(await chrome.tabs.query({}),records);if(!candidate||privateURL(candidate.url))return;
      try{
        if(!await chrome.permissions.contains({origins:[new URL(candidate.url).origin+'/*']}))throw Error('网站读取授权已撤销。');
        await chrome.scripting.executeScript({target:{tabId:candidate.id},files:['sensor.js']});
        await analyze(candidate.id,false);
      }catch{await run(async()=>{const {records}=await load(),record=records[candidate.id];if(record?.url===candidate.url&&record.autoReview){record.autoReview=false;record.apiIssue='自动复查已暂停；确认网站授权与连接后可重新开启。';await saveRecords(records);emit();}});}
    }).catch(()=>{});return;
  }
  if(!alarm.name.startsWith('close:'))return;
  run(async()=>{
    const id=Number(alarm.name.slice(6)),{records}=await load(),record=records[id];
    if(!record||record.closeSurface==='native')return;
    if(record.remainingMs===0)await finishClose(id);else await updateCountdownVisibility(id);
  }).catch(()=>{});
});
chrome.tabs.onActivated.addListener(({tabId})=>run(async()=>{
  await cancelClose(tabId);
  const {records}=await load(),record=records[tabId];
  if(record?.state==='resume'){
    records[tabId]={...record,state:'keep',watching:false,reason:'已接手。'};
    await saveRecords(records);
    await chrome.tabs.sendMessage(tabId,{type:'adapter',adapter:null}).catch(()=>{});
    hideOverlay(tabId);
    emit();
  }
}));
// 页面的监听随标签移动，关闭授权和计时只对原窗口有效。
async function observeTabLifecycle(tabId, change={}) {
  const tab=await chrome.tabs.get(tabId).catch(()=>null);
  const {records,settings}=await load();
  const previous=records[tabId];
  if(!tab||!previous||tab.incognito)return;
  if(tab.url!==previous.url){
    await chrome.alarms.clear('close:'+tabId);
    await chrome.tabs.sendMessage(tabId,{type:'adapter',adapter:null},{frameId:0}).catch(()=>{});
    delete records[tabId];
    await saveRecords(records);hideOverlay(tabId);emit();
    return;
  }
  const moved=tab.windowId!==previous.windowId;
  const closing=['closing','paused'].includes(previous.state);
  let record=closing&&(moved||change.status==='loading'||tab.discarded||tab.audible||tab.pinned)
    ? pardon(previous) : {...previous};
  if(closing&&record.state==='keep'){await chrome.alarms.clear('close:'+tabId);hideOverlay(tabId);}
  record.windowId=tab.windowId;record.title=tab.title;
  if(record.watching&&record.watchAdapter&&record.observed!=='done'){
    if(tab.discarded){
      record.watchSuspended='sleeping';
      record.watchDocumentId=null;
      record.reason='唤醒这个标签后继续监听。';
    }else if(change.status==='complete'||change.restored===true){
      try{
        const [frame]=await chrome.scripting.executeScript({target:{tabId},files:['sensor.js']});
        const current=await chrome.tabs.get(tabId);
        if(current.url!==record.url||current.incognito)return;
        const target=frame?.documentId?{documentId:frame.documentId}:{frameId:0};
        await chrome.tabs.sendMessage(tabId,{type:'adapter',adapter:record.watchAdapter,
          wasWaiting:record.observed==='waiting'||record.state==='waiting'},target);
        record.watchDocumentId=frame?.documentId||null;
        record.watchSuspended=null;
        if(previous.watchSuspended){record.state='waiting';record.reason='正在监听，完成后提醒。';}
      }catch{
        record.watchSuspended='unavailable';
        record.watchDocumentId=null;
        record.state='uncertain';
        record.reason='暂时无法读取此页。右键「开始监听」即可恢复。';
      }
    }
  }
  records[tabId]=record;
  await saveRecords(records);
  if(moved&&record.state==='resume'&&settings.nativeEnabled){
    hideOverlay(tabId);
    if(!tab.discarded)await nativeShow(tabId).catch(()=>{});
  }
  emit();
}
chrome.tabs.onUpdated.addListener((tabId,change)=>{
  if(change.status==='complete'||change.discarded===false||'url' in change)void backlog.wake(tabId).catch(()=>{});
  if(['url','status','audible','discarded','pinned','title'].some(key=>key in change))
    void run(()=>observeTabLifecycle(tabId,change)).catch(()=>{});
});
chrome.tabs.onAttached?.addListener(tabId=>{ void run(()=>observeTabLifecycle(tabId)).catch(()=>{}); });
chrome.tabs.onReplaced?.addListener((added,removed)=>{
 void backlog.wake(removed).catch(()=>{});
 void run(async()=>{
  const tab=await chrome.tabs.get(added).catch(()=>null);
  const {records}=await load(),record=records[removed];
  if(!record)return;
  delete records[removed];hideOverlay(removed);await chrome.alarms.clear('close:'+removed);
  if(tab&&!tab.incognito&&tab.url===record.url){
    const next=['closing','paused'].includes(record.state)?pardon(record):record;
    records[added]={...next,tabId:added,windowId:tab.windowId,watchDocumentId:null};
  }
  await saveRecords(records);
  if(records[added])await observeTabLifecycle(added,{restored:tab.status==='complete'});
  emit();
}).catch(()=>{});});

chrome.tabs.onRemoved.addListener(tabId=>{void backlog.wake(tabId).catch(()=>{});return run(async()=>{const {records}=await load();delete records[tabId];await saveRecords(records);const {snapshots={}}=await session();delete snapshots[tabId];await chrome.storage.session.set({snapshots});await chrome.storage.session.remove('watchPrompt:'+tabId);hideOverlay(tabId);emit();});});
chrome.tabs.onCreated?.addListener(()=>emit());
chrome.runtime.onInstalled.addListener(()=>{chrome.storage.session.setAccessLevel({accessLevel:'TRUSTED_CONTEXTS'});chrome.sidePanel.setPanelBehavior({openPanelOnActionClick:true});void registerTabMenus().catch(()=>{});chrome.alarms.create('review',{periodInMinutes:5});});
chrome.runtime.onStartup.addListener(()=>run(async()=>{
  const {records:prior}=await load();
  const tabs=(await chrome.tabs.query({})).filter(tab=>!tab.incognito);
  const byId=new Map(tabs.map(tab=>[tab.id,tab]));
  const byUrl=new Map();
  for(const tab of tabs){
    const same=byUrl.get(tab.url)||[];
    same.push(tab);byUrl.set(tab.url,same);
  }
  const records={};
  const watching=Object.values(prior).filter(record=>record.watching);
  const restored=new Set();
  for(const [id,record] of Object.entries(prior)){
    let tab=byId.get(Number(id));
    if(tab?.url!==record.url)tab=null;
    // Chrome 重启可能换标签 ID。只在来源和目标均唯一时恢复原监听。
    if(!tab&&record.watching&&byUrl.get(record.url)?.length===1&&
       watching.filter(item=>item.url===record.url).length===1)tab=byUrl.get(record.url)[0];
    if(!tab||records[tab.id])continue;
    const next=['closing','paused'].includes(record.state)?pardon(record):record;
    records[tab.id]={...next,tabId:tab.id,windowId:tab.windowId,autoReview:false,watchDocumentId:null};
    if(next.watching&&tab.status==='complete')restored.add(tab.id);
  }
  const queue=await backlog.read();if(queue){queue.autoReview=false;if(['running','waiting','blocked'].includes(queue.phase)){queue.phase='paused';queue.reason='浏览器已重启，可确认后继续本轮分析。';}await chrome.storage.local.set({analysisQueue:queue});}
  await saveRecords(records);
  for(const id of restored)await observeTabLifecycle(id,{restored:true});
  await chrome.alarms.create('review',{periodInMinutes:5});emit();
}));
mru.start().catch(()=>mru.report('unavailable','快捷切换未连接；在设置中重新保存后重试。'));

chrome.storage.onChanged?.addListener((changes,area)=>{
  if (area==='sync' && connectionSyncSlot in changes) void configRun(refreshSyncedConnection).catch(()=>{});
});

Promise.all([chrome.storage.local.setAccessLevel({accessLevel:'TRUSTED_CONTEXTS'}),chrome.storage.session.setAccessLevel({accessLevel:'TRUSTED_CONTEXTS'})]).then(async()=>{await configRun(refreshSyncedConnection);const {settings}=await load();if(settings.rememberKey)void keychain.restore(settings);if(settings.nativeEnabled)await connectNative();}).catch(()=>{});

chrome.windows.onFocusChanged?.addListener(windowId=>run(async()=>{await chrome.storage.session.set({chromeFocusedWindow:windowId});const {records,settings}=await load();if(windowId>=0&&settings.rememberKey)void keychain.restore(settings);for(const [id,r]of Object.entries(records))if(['closing','paused'].includes(r.state))await updateCountdownVisibility(Number(id));}));

void backlog.recover().catch(()=>{});

void run(()=>threadWorkspace.reconcile()).catch(()=>{});
chrome.permissions.onRemoved?.addListener(({origins=[]})=>{if(origins.includes('https://chatgpt.com/*'))void run(()=>threadWorkspace.revoke()).catch(()=>{});});
chrome.tabs.onRemoved.addListener(id=>{void run(()=>threadWorkspace.removeTab(id)).catch(()=>{});});


function watchReadyReason(adapter){
  if(adapter?.kind==='region')return '你选中的状态区域已变化，可以返回查看。';
  return adapter?.kind?'页面显示任务已结束，可以返回检查。':'你设定的完成文案已出现，可以返回检查。';
}
async function beginWatch(tabId,input,expectedURL,documentId){
  const tag=input?.kind;
  const picked=tag==='region', automatic=tag==='busy'||tag==='chat';
  const target=typeof input?.target==='string'?input.target.trim():'';
  const baseline=typeof input?.baseline==='string'?input.baseline.trim():'';
  let adapter;
  if(picked||automatic){
    if(tag!=='chat'&&(!target||target.length>1024)||picked&&(!baseline||baseline.length>160)){
      throw Error('请选择页面中一小块可见的状态文字。');
    }
    adapter=tag==='chat'?{kind:tag}:picked?{kind:tag,target,baseline}:{kind:tag,target};
  }else{
    const waiting=typeof input?.waiting==='string'?input.waiting.trim():'';
    const done=typeof input?.done==='string'?input.done.trim():'';
    if(!waiting||!done||done===waiting||waiting.length>160||done.length>160){
      throw Error('填写不同的等待与完成文案，每项最多 160 字。');
    }
    adapter={waiting,done};
  }
  const tab=await chrome.tabs.get(tabId);
  if(!safeURL(tab.url)||tab.incognito||expectedURL&&tab.url!==expectedURL)throw Error('页面已变化。请在目标网页重新开始监听。');
  await cancelClose(tabId);
  await chrome.tabs.sendMessage(tabId,{type:'adapter',adapter},documentId?{documentId}:{frameId:0});
  const {records,adapters}=await load(),url=new URL(tab.url),scope=url.origin+url.pathname;
  records[tabId]={...records[tabId],tabId,windowId:tab.windowId,title:tab.title,url:tab.url,state:'waiting',
    observed:null,watching:true,watchAdapter:adapter,watchSuspended:null,watchDocumentId:documentId||null,
    reason:'正在本地监听，完成后提醒。'};
  if(automatic)await saveRecords(records);
  else{
    const rule=picked?{kind:tag,target}:adapter;
    await chrome.storage.local.set({records,adapters:[...adapters.filter(item=>item.scope!==scope),{...rule,scope}].slice(-100)});
  }
  emit();
  return {ok:true};
}
async function submitWatchFromPage(message,sender){
  const key='watchPrompt:'+sender.tab.id;
  const prompt=(await chrome.storage.session.get(key))[key];
  if(!prompt||prompt.token!==message.token||prompt.url!==sender.url
    ||prompt.documentId!==sender.documentId||Date.now()-prompt.at>600000){
    throw Error('监听窗口已过期。请用右键菜单重新打开。');
  }
  if(message.adapter?.kind&&message.adapter.kind!=='region')throw Error('请重新选择状态区域。');
  const result=await beginWatch(sender.tab.id,message.adapter,prompt.url,prompt.documentId);
  await chrome.storage.session.remove(key);
  return result;
}
function createMenu(properties){
  return new Promise((resolve,reject)=>chrome.contextMenus.create(properties,()=>{
    const error=chrome.runtime.lastError;
    if(error)reject(Error(error.message));else resolve();
  }));
}
async function registerTabMenus(){
  if(!chrome.contextMenus)return;
  await new Promise(resolve=>chrome.contextMenus.removeAll(resolve));
  const web=['http://*/*','https://*/*'];
  const watch={id:'watch-page',title:'开始监听',documentUrlPatterns:web};
  try{
    await createMenu({...watch,contexts:['tab','page','selection']});
    await createMenu({id:'close-reminder',title:'30 秒后关闭，可保留',contexts:['tab'],documentUrlPatterns:web});
  }catch{
    // 较早 Chrome 没有标签条扩展菜单，网页与文字选区入口仍可使用。
    try{await createMenu({...watch,contexts:['page','selection']});}catch{}
  }
}
async function openWatchPrompt(tab,{pick=false,focus=false}={}){
  const [{documentId}]=await chrome.scripting.executeScript({target:{tabId:tab.id},files:['sensor.js','watch-prompt.js']});
  const current=await chrome.tabs.get(tab.id);
  if(current.url!==tab.url)throw Error('网页已变化。请重新开始监听。');
  const url=new URL(current.url),{adapters}=await load(),scope=url.origin+url.pathname;
  const saved=adapters.find(item=>item.scope===scope);
  const detection=pick?null:await chrome.tabs.sendMessage(tab.id,{type:'watchRule',saved},{documentId});
  if(detection?.adapter){
    await beginWatch(tab.id,detection.adapter,current.url,documentId);
    await chrome.tabs.sendMessage(tab.id,{type:'showWatchNotice',text:'已开始监听。'},{documentId}).catch(()=>{});
    return {listening:true};
  }
  if(!current.active)await chrome.tabs.update(tab.id,{active:true});
  if(focus)await chrome.windows.update(tab.windowId,{focused:true});
  const {text:selection=''}=await chrome.tabs.sendMessage(tab.id,{type:'selection'},{documentId}).catch(()=>({}));
  const token=crypto.randomUUID(),key='watchPrompt:'+tab.id;
  await chrome.storage.session.set({[key]:{token,url:current.url,documentId,at:Date.now()}});
  try{
    await chrome.tabs.sendMessage(tab.id,{type:'openWatchPrompt',token,selection,adapter:saved},{documentId});
  }catch(error){await chrome.storage.session.remove(key);throw error;}
  return {listening:false};
}
async function showMenuError(tab,error){
  await chrome.action.setBadgeText({tabId:tab.id,text:'!'}).catch(()=>{});
  await chrome.action.setTitle({tabId:tab.id,title:String(error.message||'请重新打开网页后重试。')}).catch(()=>{});
  try{
    await chrome.scripting.executeScript({target:{tabId:tab.id},files:['watch-prompt.js']});
    await chrome.tabs.sendMessage(tab.id,{type:'showWatchNotice',text:error.message},{frameId:0});
  }catch{}
}
function handleTabMenu(info,tab){
  if(!tab||tab.incognito||!safeURL(tab.url)||info.frameId>0)return;
  if(!['watch-page','close-reminder'].includes(info.menuItemId))return;
  return run(async()=>{
    await chrome.action.setBadgeText({tabId:tab.id,text:''});
    await chrome.action.setTitle({tabId:tab.id,title:'打开设置与管理'});
    if(info.menuItemId==='watch-page'){
      await openWatchPrompt(tab);
    }else{
      await chrome.scripting.executeScript({target:{tabId:tab.id},files:['sensor.js']});
      await armClose(tab.id,{manual:true});
    }
  }).catch(error=>showMenuError(tab,error));
}
chrome.contextMenus?.onClicked.addListener(handleTabMenu);

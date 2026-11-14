import {createThreadWorkspace} from './core/thread-workspace.mjs';
import {BacklogQueue,backlogPlan,backlogExclusion,queueSummary} from './core/backlog.mjs';
import {advanceCountdown,nativeVisibilityFresh} from './core/countdown.mjs';
import {CredentialManager,credentialOrigin} from './core/credentials.mjs';
import {MRUController} from './core/mru-controller.mjs';
import {DEFAULTS,safeURL,privateURL,boundedEvidence,fingerprint,reserve,settle,mayReevaluate,pardon,mayClose,closeCandidate,visibilityLease,guard} from './core/policy.mjs';
import {invoke,buildRequest} from './core/providers.mjs';
import {duplicates,organizationPlan,identity,scheduledCandidate} from './core/workspace.mjs';

let serial=Promise.resolve(),cloudSerial=Promise.resolve(),configSerial=Promise.resolve(),native=null;
const nativePending=new Map();
const configRun=fn=>{const task=configSerial.then(fn,fn);configSerial=task.catch(()=>{});return task;};
let nativeCapabilities=new Set(),nativeHello=Promise.resolve(),finishNativeHello=()=>{},activeOverlay=null;
const run=fn=>{const next=serial.then(fn,fn);serial=next.catch(()=>{});return next;};
const cloudRun=fn=>{const next=cloudSerial.then(fn,fn);cloudSerial=next.catch(()=>{});return next;};
const cleanSettings=input=>{const settings={...DEFAULTS};for(const key of Object.keys(DEFAULTS))if(input?.[key]!==undefined)settings[key]=input[key];if(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(input?.credentialRevision||''))settings.credentialRevision=input.credentialRevision;return settings;};
const load=async()=>{const d=await chrome.storage.local.get(['settings','records','ledger','adapters']);return {settings:cleanSettings(d.settings),records:d.records||{},ledger:d.ledger,adapters:d.adapters||[]};};
const session=()=>chrome.storage.session.get(['apiKey','apiKeyOrigin','credentialPersistedOrigin','lease','leases','snapshots','backoffUntil','chromeFocusedWindow']);
const saveRecords=records=>chrome.storage.local.set({records});
async function leaseFor(record){if(!record)return null;const {leases={}}=await session();return Object.values(leases).find(lease=>visibilityLease(lease,record))||null;}
const emit=()=>chrome.runtime.sendMessage({type:'updated'}).catch(()=>{});
const mru=new MRUController({chrome,getPort:()=>connectNative(),emit});
const keychain=new CredentialManager({chrome,request:nativeCredential,settings:async()=>(await load()).settings,mutate:run,changed:()=>{emit();void resumeQueueAfterConnection().catch(()=>{});}});
const connectionKey=settings=>JSON.stringify([settings.provider,settings.endpoint,settings.model]);
let backlogTimer;
function scheduleBacklog(queue){
 clearTimeout(backlogTimer);
 if(queue?.phase!=='running'&&!(queue?.phase==='blocked'&&queue.blockedBy==='backoff')){chrome.alarms.clear('backlog').catch(()=>{});return;}
 const delay=Math.max(0,(queue.nextAt||Date.now())-Date.now());
 chrome.alarms.create('backlog',{when:Date.now()+Math.max(30000,delay)}).catch(()=>{});
 if(delay<=10000){backlogTimer=setTimeout(()=>void backlog.tick().catch(()=>{}),delay);backlogTimer.unref?.();}
}
const backlog=new BacklogQueue({storage:chrome.storage.local,mutate:run,process:processBacklog,emit,schedule:scheduleBacklog});
async function resumeQueueAfterConnection(){const {settings}=await load(),state=await session();if(state.apiKey&&state.apiKeyOrigin===credentialOrigin(settings.endpoint))await backlog.credentialReady();}
async function processBacklog(job,queue,stillRunning){return cloudRun(async()=>{
 if(!await stillRunning())return {kind:'deferred'};
 const {settings}=await load();if(connectionKey(settings)!==queue.connectionKey)return {kind:'blocked',blockedBy:'configuration',reason:'模型连接已变化，请重新选择并确认发送范围。'};
 await restoreBeforeRequest();
 const current=await session();if(Date.now()<(current.backoffUntil||0))return {kind:'blocked',blockedBy:'backoff',nextAt:current.backoffUntil,reason:'服务商要求冷却，稍后继续；不会重发已失败的页面。'};
 try{await credentials(settings);}catch(error){return {kind:'blocked',blockedBy:'credentials',reason:error.message};}
 const tab=await chrome.tabs.get(job.tabId).catch(()=>null);
 if(!tab||tab.windowId!==job.windowId||tab.url!==job.url||!queue.origins.includes(new URL(tab.url).origin))return {kind:'skipped',reason:'页面已关闭、移动或跳转，未发送。'};
 const excluded=backlogExclusion(tab);if(excluded)return {kind:'skipped',reason:excluded+'，未发送。'};
 if(!await chrome.permissions.contains({origins:[job.origin+'/*']}))return {kind:'skipped',reason:'此网站未获读取授权，未发送。'};
 try{await chrome.scripting.executeScript({target:{tabId:tab.id},files:['sensor.js']});}catch{return {kind:'skipped',reason:'此页面不允许读取，未发送。'};}
 const snapshot=await readSnapshot(tab.id);
 if(snapshot.editable||snapshot.dirty||snapshot.media||['waiting','unknown'].includes(snapshot.observed)||Date.now()-Math.max(snapshot.lastInteraction||0,tab.lastAccessed||0)<60000)return {kind:'skipped',reason:'页面有编辑、媒体或未完成任务，已保留且未发送。'};
 if(!await stillRunning())return {kind:'deferred'};
 const result=await analyze(tab.id,true,queue.autoReview,await fingerprint(boundedEvidence(tab,snapshot)));
 return {kind:result.cached?'cached':result.skipped?'skipped':'analyzed',reason:result.skipped||''};
 });}
async function restoreBeforeRequest(){const {settings}=await load();if(settings.rememberKey)await keychain.restore(settings);}
async function readSnapshot(tabId){try{return await chrome.tabs.sendMessage(tabId,{type:'snapshot'},{frameId:0});}catch{throw new Error('尚未授权读取此页；选择“分析页面”或“监听任务”后重试。');}}
async function credentials(settings) {
  const s=await session();
  if(Date.now()<(s.backoffUntil||0))throw Object.assign(new Error('API 正在冷却；五分钟后再试。'),{code:'provider_backoff',retryAt:s.backoffUntil});
  if(!s.apiKey||s.apiKeyOrigin!==new URL(settings.endpoint).origin){const {credentialStatus}=await chrome.storage.session.get('credentialStatus');throw new Error(settings.rememberKey?(credentialStatus?.reason||'连接尚未恢复，请在模型连接中解锁并恢复，无需重新导入。'):'请先配置模型连接并保存。');}
  if(!await chrome.permissions.contains({origins:[new URL(settings.endpoint).origin+'/*']}))throw new Error('打开设置，保存并授权 API 域名后重试。');
  return s.apiKey;
}
async function analyze(tabId,manual=false,autoReview,expectedHash) {
  await restoreBeforeRequest();
  const context=await run(async()=>{
    const {settings,records,ledger}=await load();
    const tab=await chrome.tabs.get(tabId);
    if(!safeURL(tab.url)||tab.incognito)throw new Error('选择非隐身的普通网页后重试。');
    if(!manual&&(privateURL(tab.url)||records[tabId]?.autoReview!==true))return {skipped:'此页只接受手动分析。'};
    const snapshot=await readSnapshot(tabId),evidence=boundedEvidence(tab,snapshot),hash=await fingerprint(evidence),prior=records[tabId],old=prior?.url===tab.url&&prior?.windowId===tab.windowId?prior:undefined;
    if(manual&&expectedHash&&expectedHash!==hash)throw new Error('页面内容已变化，重新预览发送内容后再分析。');
    if(manual&&old&&typeof autoReview==='boolean'){old.autoReview=autoReview&&!privateURL(tab.url);records[tabId]=old;if(old.autoReview){settings.autoAnalyze=true;await chrome.storage.local.set({settings});}await saveRecords(records);}
    if(!mayReevaluate(old,hash))return {skipped:'本次已保留；有新内容且冷却结束后才重新评估。'};
    if(old?.hash===hash&&old.provider===settings.provider&&old.model===settings.model&&old.endpoint===settings.endpoint&&old.decisionAt>Date.now()-86400000){if(manual){old.evidenceRevision=snapshot.revision;records[tabId]=old;await saveRecords(records);}return {skipped:'内容未变，已复用上次判断。',cached:true};}
    const shared=Object.values(records).find(r=>r.hash===hash&&r.provider===settings.provider&&r.model===settings.model&&r.endpoint===settings.endpoint&&r.decision&&r.decisionAt>Date.now()-86400000);
    if(shared){
      const decision=shared.decision,uncertain=decision.confidence<0.7||(decision.state==='close'&&decision.confidence<0.95);
      records[tabId]={...old,tabId,url:tab.url,windowId:tab.windowId,title:tab.title,hash,evidenceRevision:snapshot.revision,provider:settings.provider,model:settings.model,endpoint:settings.endpoint,decisionAt:shared.decisionAt,decision,state:uncertain?'uncertain':decision.state==='close'?'suggested':decision.state,reason:decision.reason,autoReview:manual&&typeof autoReview==='boolean'?autoReview&&!privateURL(tab.url):old?.autoReview||false};
      if(records[tabId].autoReview){settings.autoAnalyze=true;await chrome.storage.local.set({settings});}
      if(old?.watching&&old.observed==='done')Object.assign(records[tabId],{state:'resume',reason:'你设定的完成文案已出现，可以返回检查。'});
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
  if(context.skipped)return context;
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
      if(latest.watching&&latest.observed==='done')Object.assign(records[tabId],{state:'resume',reason:'你设定的完成文案已出现，可以返回检查。'});
      await chrome.storage.local.set({records,ledger:nextLedger});emit();return {...result,uncertain};
    });
  } catch(error) {
    if(error.status===429)await chrome.storage.session.set({backoffUntil:Date.now()+300000});
    await run(async()=>{const {records}=await load(),r=records[tabId];if(r?.attemptAt===context.attempt.attemptAt){records[tabId]={...r,autoReview:false,apiIssue:'分析未完成，自动复查已暂停。检查连接后可手动重试。'};await saveRecords(records);emit();}});
    throw error;
  }
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
  }catch(error){if(error.status===429)await chrome.storage.session.set({backoffUntil:Date.now()+300000});throw error;}
}
async function connectNative(){
  if(native)return native;
  const port=chrome.runtime.connectNative('app.tabpilot.bridge');native=port;
  nativeHello=new Promise(resolve=>{const timeout=setTimeout(resolve,1500);finishNativeHello=()=>{clearTimeout(timeout);resolve();};});
  port.onDisconnect.addListener(()=>{
    void chrome.runtime.lastError;
    for(const [id,pending] of nativePending)if(pending.port===port){clearTimeout(pending.timer);pending.reject(Error('辅助程序连接中断，密钥未保存或恢复。'));nativePending.delete(id);}
    if(native!==port)return;native=null;activeOverlay=null;nativeCapabilities.clear();finishNativeHello();mru.disconnected();chrome.storage.session.set({nativeStatus:{status:'disconnected',reason:'辅助程序连接已断开；检查安装和系统授权后重新启用。'}}).then(emit);
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
    if(message.type==='status'){finishNativeHello();chrome.storage.session.set({nativeStatus:message}).then(emit);}
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
  if(surface==='panel'&&(manual||!await leaseFor(record)))throw Error('请在设置中启用 macOS 标签提醒，或从可见的管理面板开始关闭提醒。');
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
const threadWorkspace=createThreadWorkspace(chrome);
async function onMessage(message,sender) {
  const m=message;
  if(m.type==='threadWorkspace')return threadWorkspace.handle(m,sender);
  const isPanel=typeof sender.url==='string'&&sender.url===chrome.runtime.getURL?.('sidepanel.html');
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
      if(record?.watching&&record.url===sender.tab.url){
        if(m.snapshot.observed==='done'&&record.observed!=='done'){
          records[sender.tab.id]={...record,state:'resume',observed:'done',reason:'你设定的完成文案已出现，可以返回检查。'};
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
    const d=await load(),s=await session(),extra=await chrome.storage.session.get(['nativeStatus','switcherStatus','connectionCheck','organizationUndo','recentClosed','credentialStatus']),tabs=(await chrome.tabs.query({})).filter(t=>!t.incognito);
    if(d.settings.rememberKey&&(!s.apiKey||s.apiKeyOrigin!==credentialOrigin(d.settings.endpoint)))void keychain.restore(d.settings);
    const liveRecords=Object.fromEntries(tabs.filter(t=>d.records[t.id]?.url===t.url&&d.records[t.id]?.windowId===t.windowId).map(t=>[t.id,d.records[t.id]]));
    return {...d,analysisQueue:queueSummary(await backlog.read()),credentialSaved:s.credentialPersistedOrigin===credentialOrigin(d.settings.endpoint),credentialStatus:extra.credentialStatus,keychainAvailable:nativeCapabilities.has('credentials-v1'),records:liveRecords,keyPresent:!!s.apiKey&&s.apiKeyOrigin===new URL(d.settings.endpoint).origin,nativeStatus:extra.nativeStatus,switcherStatus:extra.switcherStatus,connectionCheck:extra.connectionCheck,canUndoOrganization:!!extra.organizationUndo,recentClosed:(extra.recentClosed||[]).filter(r=>Date.now()-r.at<1800000).map(({id,title,at})=>({id,title,at})),duplicates:duplicates(tabs),tabs};
  }
  if(m.type==='backlogPlan'){
    const {settings}=await load();let tabs=await chrome.tabs.query({});
    if(chrome.windows.getAll){const windows=await chrome.windows.getAll({windowTypes:['normal']});const ids=new Set(windows.map(w=>w.id));tabs=tabs.filter(t=>ids.has(t.windowId));}
    const plan=backlogPlan(tabs,Number.isInteger(m.windowId)?m.windowId:null),id=crypto.randomUUID();
    await chrome.storage.session.set({backlogPlan:{...plan,id,connectionKey:connectionKey(settings),createdAt:Date.now()}});
    return {id,count:plan.targets.length,excluded:plan.skipped.length,sites:plan.sites,endpointOrigin:credentialOrigin(settings.endpoint)};
  }
  if(m.type==='backlogStart'){
    const {backlogPlan:plan}=await chrome.storage.session.get('backlogPlan'),{settings}=await load();
    if(m.consent!==true||!plan||plan.id!==m.planId||Date.now()-plan.createdAt>600000||plan.connectionKey!==connectionKey(settings))throw Error('发送范围已变化或过期，请重新打开自动分析预览。');
    const origins=Array.isArray(m.origins)?[...new Set(m.origins)].filter(origin=>plan.sites.some(site=>site.origin===origin)):[];
    if(!origins.length||!await chrome.permissions.contains({origins:origins.map(origin=>origin+'/*')}))throw Error('选择网站并允许读取后再开始。');
    await backlog.start(plan,origins,plan.connectionKey,m.autoReview===true);await chrome.storage.session.remove('backlogPlan');return {ok:true};
  }
  if(m.type==='backlogPause'){await backlog.pause();return {ok:true};}
  if(m.type==='backlogResume'){await backlog.resume();return {ok:true};}
  if(m.type==='saveSwitcher'){
    if(typeof m.enabled!=='boolean')throw new Error('重新选择快捷切换开关后重试。');
    const {settings}=await load();await chrome.storage.local.set({settings:{...settings,switcherEnabled:m.enabled}});await mru.configure(m.enabled);return {ok:true};
  }
  if(m.type==='saveSettings'){
    const {settings:previous}=await load();
    const scopeFields=m.scope==='usage'?['cooldownSeconds','inputPrice','outputPrice','autoAnalyze']:m.scope==='connection'?['provider','endpoint','model','rememberKey']:null;
    if(m.scope==='usage'&&m.apiKey)throw Error('请在模型连接页保存密钥。');
    const requested=scopeFields?Object.fromEntries(scopeFields.filter(key=>key in (m.settings||{})).map(key=>[key,m.settings[key]])):m.settings;
    const s=cleanSettings({...previous,...requested});
    if(!['decisions','responses','chat'].includes(s.provider)||!s.model?.trim()||!Number.isFinite(s.cooldownSeconds)||s.cooldownSeconds<60||s.cooldownSeconds>3600||![s.inputPrice,s.outputPrice].every(x=>Number.isFinite(x)&&x>=0&&x<=1000))throw new Error('检查调用设置：单页间隔需为 60–3600 秒，费用单价需为有效非负数。');
    buildRequest(s,{});
    if(m.scope==='usage'){await run(async()=>{const {settings:latest}=await load();await chrome.storage.local.set({settings:{...latest,cooldownSeconds:s.cooldownSeconds,inputPrice:s.inputPrice,outputPrice:s.outputPrice,autoAnalyze:s.autoAnalyze}});});emit();return {ok:true};}
    s.rememberKey=s.rememberKey===true;
    const persistsNewKey=s.rememberKey&&(!!m.apiKey?.trim()||!previous.rememberKey||credentialOrigin(previous.endpoint)!==credentialOrigin(s.endpoint));
    if(persistsNewKey&&m.rememberConsent!==true)throw Error('请勾选“记住连接”，再点击“保存到钥匙串并连接”。');
    const prepared=await keychain.prepareSave(s,m.apiKey,previous);s.credentialRevision=crypto.randomUUID();
    await run(async()=>{const {settings:latest}=await load();s.nativeEnabled=latest.nativeEnabled;s.switcherEnabled=latest.switcherEnabled;await chrome.storage.local.set({settings:s});if(prepared.apiKey)await chrome.storage.session.set({apiKey:prepared.apiKey,apiKeyOrigin:prepared.origin,credentialPersistedOrigin:prepared.persisted?prepared.origin:null,credentialStatus:{phase:prepared.persisted?'ready':'session',persisted:prepared.persisted,reason:prepared.persisted?'连接已实际保存到 macOS 钥匙串。':'连接在当前浏览器会话可用。'}});else if(credentialOrigin(previous.endpoint)!==prepared.origin)await chrome.storage.session.remove(['apiKey','apiKeyOrigin','credentialPersistedOrigin','credentialStatus']);});
    if(!s.nativeEnabled&&!s.switcherEnabled&&!s.rememberKey){native?.postMessage({type:'hide'});native?.disconnect();native=null;}
    emit();void resumeQueueAfterConnection().catch(()=>{});return {ok:true};
  }
  if(m.type==='restoreKey'){const {settings}=await load();if(!await keychain.restore(settings,{interactive:true,force:true})){const {credentialStatus}=await chrome.storage.session.get('credentialStatus');throw Error(credentialStatus?.reason||'尚未保存连接。');}return {ok:true};}
  if(m.type==='saveNative'){const {settings}=await load();await chrome.storage.local.set({settings:{...settings,nativeEnabled:m.enabled===true}});if(m.enabled){const port=await connectNative();port.postMessage({type:'hello'});}else {hideOverlay();const {records}=await load();for(const [id,record] of Object.entries(records))if(record.closeSurface==='native'&&['closing','paused'].includes(record.state))await cancelClose(Number(id));}emit();return {ok:true};}
  if(m.type==='forgetKey'){const {settings}=await load();await keychain.forget(settings);await run(async()=>{const {settings:latest}=await load();await chrome.storage.local.set({settings:{...latest,rememberKey:false,credentialRevision:crypto.randomUUID()}});await chrome.storage.session.remove(['apiKey','apiKeyOrigin','credentialPersistedOrigin','connectionCheck','credentialStatus']);});emit();return {ok:true};}
  if(m.type==='snapshot'){const tab=await chrome.tabs.get(m.tabId);return boundedEvidence(tab,await readSnapshot(m.tabId));}
  if(m.type==='captureText'){return chrome.tabs.sendMessage(m.tabId,{type:'selection'});}
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
  const operation=cloud?cloudRun(async()=>{
    if(sender.tab||sender.id!==chrome.runtime.id)throw new Error('此操作只能从扩展面板发起。');
    return m.type==='testAPI'?testAPI():analyze(m.tabId,true,m.autoReview,m.expectedHash);
  }):['saveSettings','forgetKey','restoreKey'].includes(m.type)?configRun(()=>onMessage(m,sender)):['backlogPlan','backlogStart','backlogPause','backlogResume'].includes(m.type)?onMessage(m,sender):run(()=>onMessage(m,sender));
  operation.then(data=>reply({ok:true,data}),error=>reply({ok:false,error:error.message}));return true;
});
chrome.alarms.onAlarm.addListener(alarm=>{
  if(alarm.name==='backlog'){void backlog.tick().catch(()=>{});return;}
  if(alarm.name==='review') {
    cloudRun(async()=>{
      const {settings,records}=await load();if(!settings.autoAnalyze)return;
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
chrome.tabs.onUpdated.addListener((tabId,change)=>{
  if(change.status==='complete')void run(async()=>{
    const {records}=await load(),record=records[tabId],tab=await chrome.tabs.get(tabId).catch(()=>null);
    if(!tab||!record?.watching||tab.url!==record.url||!record.watchAdapter)return;
    try{
      await chrome.scripting.executeScript({target:{tabId},files:['sensor.js']});
      await chrome.tabs.sendMessage(tabId,{type:'adapter',adapter:record.watchAdapter},{frameId:0});
    }catch{
      records[tabId]={...record,watching:false,state:'uncertain',reason:'需要重新右键开始监听。'};
      await saveRecords(records);
      emit();
    }
  });
  if(!change.url&&!change.audible)return;
  run(async()=>{
    await cancelClose(tabId);
    if(change.url){await chrome.tabs.sendMessage(tabId,{type:'adapter',adapter:null}).catch(()=>{});const {records}=await load(),r=records[tabId];if(r&&r.url!==change.url){records[tabId]={...r,autoReview:false,watching:false,state:'keep',reason:'页面地址已变化，重新选择监听或分析。'};await saveRecords(records);}}
    emit();
  });
});
chrome.tabs.onRemoved.addListener(tabId=>run(async()=>{const {records}=await load();delete records[tabId];await saveRecords(records);const {snapshots={}}=await session();delete snapshots[tabId];await chrome.storage.session.set({snapshots});await chrome.storage.session.remove('watchPrompt:'+tabId);hideOverlay(tabId);emit();}));
chrome.runtime.onInstalled.addListener(()=>{chrome.storage.session.setAccessLevel({accessLevel:'TRUSTED_CONTEXTS'});chrome.sidePanel.setPanelBehavior({openPanelOnActionClick:true});void registerTabMenus().catch(()=>{});chrome.alarms.create('review',{periodInMinutes:5});});
chrome.runtime.onStartup.addListener(()=>run(async()=>{
  const {records}=await load();for(const [id,r]of Object.entries(records)){
    records[id]={...r,autoReview:false};
    if(['closing','paused'].includes(r.state))records[id]=pardon(records[id]);
    if(r.watching)records[id]={...records[id],watching:false,state:'keep',reason:'浏览器已重启，选择“监听任务”以继续。'};
  }
  const queue=await backlog.read();if(queue){queue.autoReview=false;if(queue.phase==='running'||queue.phase==='blocked'){queue.phase='paused';queue.reason='浏览器已重启，可确认后继续本轮分析。';}await chrome.storage.local.set({analysisQueue:queue});}
  await saveRecords(records);await chrome.alarms.create('review',{periodInMinutes:5});
}));
mru.start().catch(()=>mru.report('unavailable','快捷切换未连接；在设置中重新保存后重试。'));

Promise.all([chrome.storage.local.setAccessLevel({accessLevel:'TRUSTED_CONTEXTS'}),chrome.storage.session.setAccessLevel({accessLevel:'TRUSTED_CONTEXTS'})]).then(async()=>{const {settings}=await load();if(settings.rememberKey)void keychain.restore(settings);}).catch(()=>{});

chrome.windows.onFocusChanged?.addListener(windowId=>run(async()=>{await chrome.storage.session.set({chromeFocusedWindow:windowId});const {records,settings}=await load();if(windowId>=0&&settings.rememberKey)void keychain.restore(settings);for(const [id,r]of Object.entries(records))if(['closing','paused'].includes(r.state))await updateCountdownVisibility(Number(id));}));

void backlog.recover().catch(()=>{});

void run(()=>threadWorkspace.reconcile()).catch(()=>{});
chrome.permissions.onRemoved?.addListener(({origins=[]})=>{if(origins.includes('https://chatgpt.com/*'))void run(()=>threadWorkspace.revoke()).catch(()=>{});});
chrome.tabs.onRemoved.addListener(id=>{void run(()=>threadWorkspace.removeTab(id)).catch(()=>{});});


async function beginWatch(tabId,input,expectedURL){
  const adapter={waiting:typeof input?.waiting==='string'?input.waiting.trim():'',done:typeof input?.done==='string'?input.done.trim():''};
  if(!adapter.waiting||!adapter.done||adapter.done===adapter.waiting||adapter.done.length>160||adapter.waiting.length>160){
    throw Error('填写不同的等待与完成文案，每项最多 160 字。');
  }
  const tab=await chrome.tabs.get(tabId);
  if(!safeURL(tab.url)||tab.incognito||expectedURL&&tab.url!==expectedURL)throw Error('页面已变化。请在目标网页重新开始监听。');
  await cancelClose(tabId);
  await chrome.tabs.sendMessage(tabId,{type:'adapter',adapter},{frameId:0});
  const {records,adapters}=await load(),url=new URL(tab.url),scope=url.origin+url.pathname;
  records[tabId]={...records[tabId],tabId,windowId:tab.windowId,title:tab.title,url:tab.url,state:'waiting',
    observed:null,watching:true,watchAdapter:adapter,reason:'正在本地监听，完成后提醒。'};
  await chrome.storage.local.set({records,adapters:[...adapters.filter(item=>item.scope!==scope),{...adapter,scope}].slice(-100)});
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
  const result=await beginWatch(sender.tab.id,message.adapter,prompt.url);
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
async function openWatchPrompt(tab){
  if(!tab.active)await chrome.tabs.update(tab.id,{active:true});
  await chrome.scripting.executeScript({target:{tabId:tab.id},files:['sensor.js']});
  const [{documentId}]=await chrome.scripting.executeScript({target:{tabId:tab.id},files:['watch-prompt.js']});
  const {text:selection=''}=await chrome.tabs.sendMessage(tab.id,{type:'selection'},{documentId}).catch(()=>({}));
  const current=await chrome.tabs.get(tab.id);
  if(current.url!==tab.url)throw Error('网页已变化。请重新开始监听。');
  const url=new URL(current.url),{adapters}=await load(),scope=url.origin+url.pathname;
  const token=crypto.randomUUID(),key='watchPrompt:'+tab.id;
  await chrome.storage.session.set({[key]:{token,url:current.url,documentId,at:Date.now()}});
  try{
    await chrome.tabs.sendMessage(tab.id,{type:'openWatchPrompt',token,selection,adapter:adapters.find(item=>item.scope===scope)},{documentId});
  }catch(error){await chrome.storage.session.remove(key);throw error;}
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

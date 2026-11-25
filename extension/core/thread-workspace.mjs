// ChatGPT 工作台只使用自己的一组本地偏好、缓存与逐标签会话数据。
const origin='https://chatgpt.com';
const match=origin+'/*';
const id='tabpilot-thread-workspace';
const historyId='tabcadence-thread-history';
const scripts=[
 {id:historyId,matches:[match],js:['thread-history.js'],allFrames:false,runAt:'document_start',world:'MAIN',persistAcrossSessions:true},
 {id,matches:[match],js:['threaddeck.js'],allFrames:false,runAt:'document_idle',world:'ISOLATED',persistAcrossSessions:true},
];
const flag='threadWorkspaceEnabled',prefs='threadWorkspacePreferences',cache='threadWorkspaceCache';
const settingsKey='prompt-rail:settings';
const cacheKey=key=>typeof key==='string'&&key.length<=420&&/^prompt-rail:cache:(owner-v2:chatgpt%3Achatgpt\.com%2F|chatgpt:)/.test(key);
const sessionKey=key=>typeof key==='string'&&/^prompt-rail:(tab-queue|editor-recovery):[a-zA-Z0-9_-]{1,64}$/.test(key);
const bytes=value=>new TextEncoder().encode(JSON.stringify(value)).length;
function bounded(map,key,value,limit){
 const entries=Object.entries(map||{}).filter(([k])=>k!==key);
 if(value!==null)entries.push([key,value]);
 while(entries.length>32||bytes(entries)>limit)entries.shift();
 return Object.fromEntries(entries);
}
export function createThreadWorkspace(chrome, handleTopics){
 const {local,session}=chrome.storage;
 const grants=()=>chrome.permissions.contains({origins:[match]});
 const status=async()=>({enabled:(await local.get(flag))[flag]===true&&await grants()});
 const registered=()=>chrome.scripting.getRegisteredContentScripts({ids:[historyId,id]});
 async function register(){
  const current=new Set((await registered()).map(script=>script.id));
  const present=scripts.filter(script=>current.has(script.id));
  const missing=scripts.filter(script=>!current.has(script.id));
  if(present.length)await chrome.scripting.updateContentScripts(present);
  if(missing.length)await chrome.scripting.registerContentScripts(missing);
 }
 async function unregister(){
  const current=await registered();
  if(current.length)await chrome.scripting.unregisterContentScripts({ids:current.map(script=>script.id)});
 }
 async function refreshTabs(enabled){
  const tabs=await chrome.tabs.query({url:[match]});
  const results=await Promise.allSettled(tabs.filter(t=>Number.isInteger(t.id)&&!t.incognito&&!t.discarded).map(async t=>{
   if(enabled)await chrome.scripting.executeScript({target:{tabId:t.id},files:['thread-history.js'],world:'MAIN'});
   const ping=()=>chrome.tabs.sendMessage(t.id,{type:'THREAD_PILOT_SWITCH',enabled},{frameId:0});
   try{await ping();return;}catch{if(!enabled)return;}
   await chrome.scripting.executeScript({target:{tabId:t.id},files:['threaddeck.js'],world:'ISOLATED'});
  }));
  return results.filter(r=>r.status==='rejected').length;
 }
 async function setEnabled(enabled){
  if(typeof enabled!=='boolean')throw Error('请选择是否启用对话工作台。');
  if(enabled){
   if(!await grants())throw Error('需先允许访问 chatgpt.com。');
   await register();
   try{await local.set({[flag]:true});}catch(e){await unregister();throw e;}
  }else{
   await local.set({[flag]:false});await unregister();
  }
  return {enabled,refreshNeeded:await refreshTabs(enabled)};
 }
 function trustedPanel(sender){
  const panel = chrome.runtime.getURL('sidepanel.html');
  return sender.id===chrome.runtime.id&&(sender.url===panel||sender.url===panel+'?view=connection');
 }
 function trustedPage(sender){
  if(sender.id!==chrome.runtime.id||sender.frameId!==0||!Number.isInteger(sender.tab?.id)||sender.tab.incognito)return false;
  try{return new URL(sender.url).origin===origin && (!sender.origin||sender.origin===origin);}
  catch{return false;}
 }
 async function handle(m,sender){
  const panel=trustedPanel(sender),page=trustedPage(sender);
  if(!panel&&!page)throw Error('无权访问对话工作台。');
  if(m.action==='status')return status();
  if(m.action==='setEnabled'&&panel)return setEnabled(m.value);
  if(!page||!await grants())throw Error('当前页面未获对话工作台授权。');
  const active=(await local.get(flag))[flag]===true;
  const tabSlot='threadWorkspaceTab:'+sender.tab.id;
  if(m.action==='session'||m.action==='sessionSet'){
   const previous=(await session.get(tabSlot))[tabSlot]||{};
   if(m.action==='session')return active?previous:{};
   // 停用时仍允许已建立的事务保存收尾回执，不允许触发任何发送。
   if(!sessionKey(m.key)||!(m.value===null||typeof m.value==='string'&&bytes(m.value)<=512000))throw Error('队列超过本机保存范围。');
   await session.set({[tabSlot]:bounded(previous,m.key,m.value,1024000)});return true;
  }
  if(!active)throw Error('对话工作台未启用。');
  if(m.action==='chatBackoff'){
   const now=Date.now(),key='threadChatBackoffUntil';
   const previous=(await session.get(key))[key]||0;
   if(!Number.isFinite(m.value)||m.value<=now||m.value>now+86400000)return previous;
   const until=Math.max(previous,m.value);
   if(until>previous){
    await session.set({[key]:until});
    const tabs=await chrome.tabs.query({url:[match]});
    void Promise.allSettled(tabs.filter(tab=>!tab.incognito&&!tab.discarded&&tab.id!==sender.tab.id).map(tab=>
      chrome.tabs.sendMessage(tab.id,{type:'THREAD_PILOT_CHAT_BACKOFF',until},{frameId:0})));
   }
   return until;
  }
  if(['topicsRead','topicsOpen','topicsGenerate','topicsConnection','topicsCached'].includes(m.action)&&handleTopics)return handleTopics(m.action,m.value,sender);
  if(m.key===settingsKey){
   if(m.action==='get')return (await local.get(prefs))[prefs]||null;
   if(m.action==='set'&&m.value&&typeof m.value==='object'&&!Array.isArray(m.value)&&bytes(m.value)<=16384){await local.set({[prefs]:m.value});return true;}
  }
  if(m.action==='keys'||cacheKey(m.key)){
   const previous=(await local.get(cache))[cache]||{};
   if(m.action==='keys')return Object.keys(previous);
   if(m.action==='get')return previous[m.key]??null;
   if(m.action==='remove'||m.action==='set'&&m.value&&typeof m.value==='object'&&bytes(m.value)<=512000){
    await local.set({[cache]:bounded(previous,m.key,m.action==='remove'?null:m.value,3000000)});return true;
   }
  }
  throw Error('无法识别工作台数据操作。');
 }
 async function reconcile(){
  if(!chrome.scripting?.getRegisteredContentScripts)return;
  if((await status()).enabled)await register();else await unregister();
 }
 return {handle,status,reconcile,revoke:()=>setEnabled(false),removeTab:tabId=>session.remove('threadWorkspaceTab:'+tabId)};
}

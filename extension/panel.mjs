import {backlogPlan} from './core/backlog.mjs';
import {DEFAULTS,dayKey,safeURL,privateURL,fingerprint} from './core/policy.mjs';
import {duplicates,attentionOrder,organizationPlan} from './core/workspace.mjs';

const $=s=>document.querySelector(s),preview=!globalThis.chrome?.runtime?.id;
let chatEnabled=false,chatReady=false,chatRequest=0;
let importedKey='',credentialNotice='',switcherDirty=false,data,filter='all',targetId,targetEvidence,view='workspace',preferences='connection',currentWindowId=1,organization,backlogPreview;
const hovered=new Set(),focused=new Set(),analyzingTabs=new Set();
const demo={
 settings:{...DEFAULTS},
 records:{1:{state:'resume',reason:'你设定的“构建成功”已出现，可以返回检查。',watching:true},2:{state:'waiting',reason:'正在本地监听，完成后提醒。',watching:true},4:{state:'suggested',reason:'相同网址已在另一个标签中打开。',decision:{state:'close',confidence:.98}},6:{state:'uncertain',reason:'状态文案同时出现，返回页面检查或调整监听。',watching:true}},
 tabs:[{id:1,index:0,title:'生产构建 · 页面响应速度优化',url:'https://example.com/build/583',windowId:1,groupId:-1},{id:2,index:1,title:'月度报表 · 数据导出',url:'https://example.com/exports',windowId:1,groupId:-1},{id:3,index:2,title:'Chrome 扩展开发文档',url:'https://developer.chrome.com/docs/extensions',active:true,windowId:1,groupId:-1},{id:4,index:3,title:'CSS Grid Layout · MDN',url:'https://developer.mozilla.org/zh-CN/docs/Web/CSS/CSS_grid_layout',windowId:1,groupId:-1},{id:5,index:4,title:'CSS Grid Layout · MDN',url:'https://developer.mozilla.org/zh-CN/docs/Web/CSS/CSS_grid_layout',windowId:1,groupId:-1},{id:6,index:5,title:'部署检查 · 等待状态确认',url:'https://example.org/deploy/42',windowId:1,groupId:-1}],
 ledger:{date:dayKey(),requests:2,tokens:1340,cost:.00013},keyPresent:false,recentClosed:[]
};
async function rpc(type,args={}) {
 if(preview){
  if(type==='threadWorkspace'){if(args.action==='setEnabled')chatEnabled=args.value;return {enabled:chatEnabled,refreshNeeded:0};}
  if(type==='state')return {...structuredClone(demo),duplicates:duplicates(demo.tabs)};
  if(type==='backlogPlan'){const plan=backlogPlan(demo.tabs,args.windowId??null);return {id:'synthetic-plan',count:plan.targets.length,excluded:plan.skipped.length,sites:plan.sites,endpointOrigin:'https://api.openai.com'};}
  if(type==='backlogStart'){demo.analysisQueue={phase:'running',total:3,completed:0,analyzed:0,cached:0,skipped:0,failed:0,currentTitle:'Chrome 扩展开发文档'};return {ok:true};}
  if(type==='backlogPause')demo.analysisQueue={...demo.analysisQueue,phase:'paused',reason:'已暂停，可随时继续。'};
  if(type==='backlogResume')demo.analysisQueue={...demo.analysisQueue,phase:'running',reason:''};
  if(type==='testAPI'||type==='analyze')throw Error('界面预览不调用 API；在 Chrome 中打开已加载的 Tab Cadence 后测试。');
  if(type==='snapshot')return {title:demo.tabs.find(t=>t.id===args.tabId)?.title,url:'https://example.com/task',excerpt:'构建成功，可以检查结果。',signals:{observed:'done',editable:false,dirty:false,media:false}};
  if(type==='captureText')return {text:'任务已完成'};
  if(type==='saveSettings'){demo.settings=args.settings;demo.keyPresent=!!args.apiKey||demo.keyPresent;}
  if(type==='forgetKey'){demo.keyPresent=false;demo.credentialSaved=false;demo.settings.rememberKey=false;demo.credentialStatus=null;}
  if(type==='restoreKey'){demo.keyPresent=true;demo.credentialSaved=true;demo.credentialStatus={phase:'ready',reason:'连接已恢复，密钥保存在这台 Mac 的钥匙串中。'};}
  if(type==='saveNative')demo.settings.nativeEnabled=args.enabled;
  if(type==='saveSwitcher'){demo.settings.switcherEnabled=args.enabled;demo.switcherStatus={reason:args.enabled?'合成预览，请在实际扩展中验证快捷键。':'尚未启用。'};}
  if(type==='pardon')demo.records[args.tabId]={state:'keep',reason:'已保留本次。'};
  if(type==='watch')demo.records[args.tabId]={state:'waiting',watching:true,reason:'正在本地监听，完成后提醒。'};
  if(type==='stopWatch')delete demo.records[args.tabId];
  if(type==='organizationPlan')return organizationPlan(demo.tabs,args.windowId);
  if(type==='organize'){demo.canUndoOrganization=true;return {groups:args.plan.groups.length};}
  if(type==='undoOrganization')demo.canUndoOrganization=false;
  if(type==='armClose'){demo.records[args.tabId]={...demo.records[args.tabId],state:'closing',closeAt:Date.now()+30000};}
  if(type==='pauseClose'){const r=demo.records[args.tabId];if(args.paused&&r.state==='closing')Object.assign(r,{state:'paused',remainingMs:r.closeAt-Date.now(),closeAt:null});else if(!args.paused&&r.state==='paused')Object.assign(r,{state:'closing',closeAt:Date.now()+r.remainingMs});}
  return {ok:true};
 }
 const result=await chrome.runtime.sendMessage({type,...args});
 if(!result?.ok)throw Error(result?.error||'扩展未响应；重新打开侧栏后重试。');
 return result.data;
}
function status(text,error=false){$(error?'#error':'#status').textContent=text;$(error?'#status':'#error').textContent='';}
async function task(fn){try{await fn();}catch(error){status(error.message,true);}}
function button(label,action,style='secondary',key) {
 const b=document.createElement('button');b.type='button';b.textContent=label;b.className=style;if(key)b.dataset.action=key;
 b.addEventListener('click',()=>{b.disabled=true;task(()=>action(b)).finally(()=>{if(b.isConnected)b.disabled=false;});});return b;
}
const labels={resume:'待接手',waiting:'等待中',keep:'保留',closing:'即将关闭',paused:'已暂停',suggested:'建议清理',uncertain:'待确认'};
function scopedTabs(){return data.tabs.filter(t=>!t.incognito&&($('#scope').value==='all'||t.windowId===currentWindowId));}
function tabState(t){return data.records[t.id]?.state||'keep';}
function matchesFilter(t){const s=tabState(t);return filter==='all'||(filter==='suggested'?['suggested','closing','paused'].includes(s):s===filter);}
function makeRow(t) {
 if(!['closing','paused'].includes(data.records[t.id]?.state)){hovered.delete(t.id);focused.delete(t.id);}
 const r=data.records[t.id]||{state:'keep'},row=document.createElement('article');row.className='tab-row';row.dataset.state=r.state;row.dataset.tabId=t.id;
 const meta=document.createElement('div');meta.className='row-meta';const site=document.createElement('bdi');site.className='site';
 try{site.textContent=new URL(t.url).hostname||'浏览器页面';}catch{site.textContent='浏览器页面';}
 const badge=document.createElement('span');badge.className='badge';badge.textContent=t.active&&r.state==='keep'?'正在使用':labels[r.state]||'保留';meta.append(site,badge);
 const title=document.createElement('h2');title.className='tab-title';title.append(button(t.title||'无标题页面',()=>rpc('activate',{tabId:t.id}),'title-button','activate'));
 const reason=document.createElement('p');reason.className='reason';
 const duplicate=data.duplicates?.[t.id];
 reason.textContent=analyzingTabs.has(t.id)?'正在分析页面…':(r.reason?(r.reason+(r.apiIssue?' '+r.apiIssue:'')):r.apiIssue)||(duplicate?.extra?'此网址已在另一个标签中打开，分析后可检查是否适合清理。':safeURL(t.url)?'未开始监听或分析。':'浏览器页面，可切换，支持的网页才能监听或分析。');
 const actions=document.createElement('div');actions.className='row-actions';
 if(r.state==='resume')actions.append(button('返回接手',async()=>{await rpc('activate',{tabId:t.id});await refresh();},'secondary','resume'));
 if(['closing','paused'].includes(r.state)){
  const ring=document.createElement('span');ring.className='countdown';ring.dataset.deadline=r.closeAt||'';ring.dataset.remaining=r.remainingMs||'';ring.setAttribute('aria-hidden','true');ring.append(document.createElement('span'));actions.append(ring);
  actions.append(button('保留本次',async()=>{await rpc('pardon',{tabId:t.id});hovered.delete(t.id);focused.delete(t.id);await refresh();status('已取消本次关闭；有新内容且冷却结束后才重新评估。');},'secondary','pardon'));
  const hint=document.createElement('span');hint.className='hint';hint.textContent=r.state==='paused'?(r.visibilityPaused?'窗口与提醒可见后继续':'移开后继续倒计时'):'仅在窗口与提醒可见时计时';actions.append(hint);
  const synchronize=async()=>{
   const paused=hovered.has(t.id)||focused.has(t.id);
   if((paused&&data.records[t.id]?.state==='closing')||(!paused&&data.records[t.id]?.state==='paused')){await rpc('pauseClose',{tabId:t.id,paused});await refresh();}
  };
  row.addEventListener('pointerenter',()=>{hovered.add(t.id);task(synchronize);});
  row.addEventListener('pointerleave',()=>{if(!row.isConnected)return;hovered.delete(t.id);task(synchronize);});
  row.addEventListener('focusin',e=>{if(e.target.matches(':focus-visible')){focused.add(t.id);task(synchronize);}});
  row.addEventListener('focusout',e=>{if(!row.isConnected||row.contains(e.relatedTarget))return;focused.delete(t.id);task(synchronize);});
 }else if(r.state==='suggested'){
  actions.append(button('开始 30 秒关闭提醒',async()=>{await heartbeat();await rpc('armClose',{tabId:t.id});await refresh();status('关闭提醒已开始。看不见提醒时暂停，选择「保留」可取消。');},'danger','arm'));
  actions.append(button('保留本次',async()=>{await rpc('pardon',{tabId:t.id});await refresh();},'secondary','pardon'));
 }else if(safeURL(t.url))actions.append(button(r.watching?'调整监听':'监听任务',()=>openWatch(t),'secondary','watch'));
 const details=document.createElement('details');const summary=document.createElement('summary');summary.textContent='页面操作与详情';summary.dataset.action='details';
 const more=document.createElement('div');more.className='row-actions';
 if(safeURL(t.url)){
  const analyzeButton=button(analyzingTabs.has(t.id)?'正在分析…':'分析页面',()=>openAnalysis(t),'secondary','analyze');analyzeButton.disabled=analyzingTabs.has(t.id);more.append(analyzeButton);
  if(r.state==='suggested'||r.state==='resume')more.append(button(r.watching?'调整监听':'监听任务',()=>openWatch(t),'secondary','watch-more'));
 }
 if(r.watching)more.append(button('停止监听',async()=>{await rpc('stopWatch',{tabId:t.id});await refresh();status('已停止此页的本地监听。');},'secondary','stop-watch'));
 if(r.autoReview)more.append(button('停止自动复查',async()=>{await rpc('autoReview',{tabId:t.id});await refresh();status('已停止此页的自动复查。');},'secondary','stop-review'));
 if(data.settings.nativeEnabled)more.append(button('显示标签提醒',async()=>{await rpc('nativeShow',{tabId:t.id});status('已请求显示提醒；定位状态可在 macOS 设置中查看。');},'secondary','native'));
 const address=document.createElement('p');address.className='full-url';address.dir='auto';address.textContent=t.url||'地址暂不可用';
 details.append(summary,more,address);row.append(meta,title,reason);if(actions.childNodes.length)row.append(actions);row.append(details);return row;
}
function render() {
 const scoped=scopedTabs().filter(tab=>['resume','waiting','suggested','uncertain','closing','paused'].includes(tabState(tab))||analyzingTabs.has(tab.id)),records=scoped.map(t=>data.records[t.id]).filter(Boolean),today=data.ledger?.date===dayKey()?data.ledger:null;
 const resume=records.filter(r=>r.state==='resume').length,waiting=records.filter(r=>r.state==='waiting').length,suggested=records.filter(r=>['suggested','closing','paused'].includes(r.state)).length;
 $('#waiting-count').textContent=resume;$('#watching-count').textContent=waiting;$('#suggested-count').textContent=suggested;
 $('#request-count').textContent=String(today?.requests||0);
 $('#usage-summary').textContent='今日已调用 '+(today?.requests||0)+' 次，累计约 '+new Intl.NumberFormat('zh-CN').format(today?.tokens||0)+' token。';
 $('.filters').hidden=scoped.length===0;
 $('#item-search').hidden=scoped.length<6&&!$('#tab-search').value.trim();
 const query=$('#tab-search').value.trim().toLocaleLowerCase(),tabs=attentionOrder(scoped,data.records).filter(t=>matchesFilter(t)&&((t.title||'')+' '+(t.url||'')).toLocaleLowerCase().includes(query));
 $('#tab-count').textContent=query||filter!=='all'?tabs.length+' / '+scoped.length:scoped.length;
 const active=document.activeElement,activeRow=active?.closest('[data-tab-id]'),focusKey=active?.dataset.action,focusId=activeRow?.dataset.tabId;
 const opened=new Set([...$('#tabs').querySelectorAll('article details[open]')].map(n=>n.closest('article').dataset.tabId));
 $('#tabs').replaceChildren();
 if(!tabs.length){
  const empty=document.createElement('div');empty.className='empty';const h=document.createElement('h2'),p=document.createElement('p');
  h.textContent=query?'没有找到“'+$('#tab-search').value.trim()+'”':filter==='all'?'暂无需要处理的事项':filter==='resume'?'暂时没有待接手事项':filter==='waiting'?'暂时没有等待中的任务':'暂时没有清理建议';
  p.textContent=query?'换个关键词，或清除筛选条件。':filter==='all'?'在网页或标签上点右键，选择「开始监听」。':'可切回全部事项查看其他进展。';
  empty.append(h,p);
  if(query||filter!=='all')empty.append(button('显示全部事项',()=>{filter='all';$('#tab-search').value='';updateFilters();render();}));
  $('#tabs').append(empty);
 }
 for(const tab of tabs){const row=makeRow(tab);if(opened.has(String(tab.id)))row.querySelector('details').open=true;$('#tabs').append(row);}
 if(focusId&&focusKey)$('#tabs').querySelector('[data-tab-id="'+focusId+'"] [data-action="'+focusKey+'"]')?.focus({preventScroll:true});
 $('#undo-organization').hidden=!data.canUndoOrganization;
 $('#recovery').hidden=!data.recentClosed?.length;$('#recent-closed').replaceChildren();
 for(const entry of data.recentClosed||[])$('#recent-closed').append(button('重新打开：'+entry.title,async()=>{await rpc('reopen',{id:entry.id});await refresh();status('已在后台重新打开网址。');}));
 renderBacklog();updateCountdown();
}
function renderBacklog(){
 const q=data.analysisQueue||{phase:'idle'},active=q.phase==='running';
 $('#backlog-status').hidden=q.phase==='idle';$('#backlog-open').disabled=active;
 if(q.phase==='idle')return;
 $('#backlog-title').textContent=active?'正在逐页分析':q.phase==='complete'?'本轮分析完成':q.blockedBy==='credentials'?'等待恢复模型连接':q.phase==='blocked'?'分析已暂停':'已暂停分析';
 $('#backlog-count').textContent=(q.completed||0)+' / '+(q.total||0);
 $('#backlog-progress').max=Math.max(1,q.total||0);$('#backlog-progress').value=q.completed||0;
 $('#backlog-current').textContent=active&&q.currentTitle?'正在分析：'+q.currentTitle:'';
 $('#backlog-note').textContent=(q.reason?q.reason+' ':'')+'已分析 '+(q.analyzed||0)+' · 复用 '+(q.cached||0)+' · 略过 '+(q.skipped||0)+(q.failed?' · 未完成 '+q.failed:'');
 $('#backlog-pause').hidden=!active;$('#backlog-resume').hidden=!['paused','blocked'].includes(q.phase)||q.blockedBy==='credentials';$('#backlog-connect').hidden=q.blockedBy!=='credentials';
 $('#backlog-resume').textContent=q.blockedBy==='configuration'?'重新选择网站':'继续分析';
}
async function openBacklog(){
 if(!data.keyPresent&&!preview){preferences='connection';openView('settings');status('先恢复模型连接，再开始自动分析，无需逐页导入或设置。');return;}
 backlogPreview=await rpc('backlogPlan',{windowId:$('#scope').value==='all'?null:currentWindowId});
 $('#backlog-sites').replaceChildren();$('#backlog-auto-review').checked=false;$('#backlog-error').textContent='';$('#backlog-endpoint').textContent=backlogPreview.endpointOrigin;
 $('#backlog-plan-summary').textContent='将依次分析 '+backlogPreview.count+' 个页面。另有 '+backlogPreview.excluded+' 个正在使用、最近操作、固定、播放、休眠或不支持的页面保持原样。';
 for(const site of backlogPreview.sites){
  const label=document.createElement('label');label.className='check';const input=document.createElement('input');input.type='checkbox';input.checked=true;input.value=site.origin;input.dataset.count=site.count;input.addEventListener('change',updateBacklogSelection);
  const host=document.createElement('bdi');host.textContent=new URL(site.origin).host;const count=document.createElement('span');count.textContent=site.count+' 页';label.append(input,host,count);$('#backlog-sites').append(label);
 }
 updateBacklogSelection();$('#backlog-dialog').showModal();
}
function updateBacklogSelection(){
 const count=[...$('#backlog-sites').querySelectorAll('input:checked')].reduce((sum,input)=>sum+Number(input.dataset.count),0);
 $('#backlog-plan-summary').textContent='将依次分析 '+count+' 个页面；另有 '+backlogPreview.excluded+' 个受保护或不支持的页面不参与。';$('#backlog-start').disabled=count===0;
}
$('#backlog-open').addEventListener('click',()=>task(openBacklog));
$('#backlog-pause').addEventListener('click',()=>task(async()=>{await rpc('backlogPause');await refresh();}));
$('#backlog-resume').addEventListener('click',()=>task(async()=>{if(data.analysisQueue?.blockedBy==='configuration')return openBacklog();await rpc('backlogResume');await refresh();}));
$('#backlog-connect').addEventListener('click',()=>{preferences='connection';openView('settings');});
$('#backlog-results').addEventListener('click',()=>{filter='suggested';updateFilters();render();$('#tabs').scrollIntoView({block:'start'});});
$('#backlog-start').addEventListener('click',()=>task(async()=>{
 const b=$('#backlog-start'),origins=[...$('#backlog-sites').querySelectorAll('input:checked')].map(input=>input.value);$('#backlog-error').textContent='';
 if(!origins.length){$('#backlog-error').textContent='选择至少一个网站后开始。';return;}
 b.disabled=true;
 try{
  // 网站授权直接由这次点击发起，避免异步操作丢失 Chrome 的用户手势。
  if(!preview&&!await chrome.permissions.request({origins:origins.map(origin=>origin+'/*')}))throw Error('未获得网站读取授权，尚未发送任何页面。');
  await rpc('backlogStart',{planId:backlogPreview.id,origins,consent:true,autoReview:$('#backlog-auto-review').checked});$('#backlog-dialog').close();await refresh();status('已开始逐页分析。可随时暂停，页面不会自动关闭。');
 }catch(error){$('#backlog-error').textContent=error.message;}finally{b.disabled=false;}
}));
function updateFilters(){document.querySelectorAll('[data-filter]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.filter===filter)));}
async function refresh(){data=await rpc('state');render();if(data.keyPresent&&data.credentialStatus?.phase==='ready'&&credentialNotice!==data.credentialStatus.reason){credentialNotice=data.credentialStatus.reason;status(credentialNotice);}$('#native-status').textContent=data.nativeStatus?.reason||data.nativeStatus?.status||'尚未连接。';$('#switcher-status').textContent=data.switcherStatus?.reason||'尚未启用。';$('#native-enabled').checked=data.settings.nativeEnabled;if(view==='settings')updateCredentialUI();if(!switcherDirty)$('#switcher-enabled').checked=data.settings.switcherEnabled;}
async function prepare(tab){
 if(preview)return;
 if(!safeURL(tab.url)||tab.incognito)throw Error('选择非隐身的普通网页后重试。');
 if(!await chrome.permissions.request({origins:[new URL(tab.url).origin+'/*']}))throw Error('尚未授权读取页面；再次选择监听或分析以授权。');
 await chrome.scripting.executeScript({target:{tabId:tab.id},files:['sensor.js']});
}
async function openWatch(tab){
 await prepare(tab);targetId=tab.id;
 $('#adapter-page').textContent=tab.title;$('#adapter-error').textContent='';
 const url=new URL(tab.url),adapter=data.adapters?.find(a=>a.scope===url.origin+url.pathname);
 $('#waiting-text').value=adapter?.waiting||'';$('#done-text').value=adapter?.done||'';
 $('#adapter-dialog').showModal();
}
async function openAnalysis(tab){
 await prepare(tab);targetId=tab.id;targetEvidence=await rpc('snapshot',{tabId:tab.id});
 const e=targetEvidence;$('#evidence').textContent=e.title+'\n'+e.url+'\n\n'+(e.excerpt||'未提取正文。')+'\n\n页面信号：'+(e.signals.editable?'有编辑控件；':'')+(e.signals.dirty?'有未提交输入；':'')+(e.signals.media?'有媒体播放；':'')+(e.signals.observed==='done'?'匹配完成文案':e.signals.observed==='waiting'?'匹配等待文案':'未匹配任务状态');
 $('#auto-review-label').hidden=privateURL(tab.url);$('#auto-review').checked=data.records[tab.id]?.autoReview===true&&!privateURL(tab.url);$('#auto-review-hint').textContent=privateURL(tab.url)?'本地和内网页面仅支持手动分析。':'启用后，此页闲置至少 10 分钟才复查，可随时停止。';
 $('#analyze-dialog').returnValue='';$('#analyze-dialog').showModal();
}
function openView(next){
 view=next;$('#workspace').hidden=next!=='workspace';$('#settings').hidden=next!=='settings';$('#settings-toggle').setAttribute('aria-label',next==='settings'?'返回管理':'打开设置');$('#settings-toggle').title=next==='settings'?'返回管理':'打开设置';
 document.title=next==='settings'?'Tab Cadence · 设置':'Tab Cadence · 管理';if(next==='settings'){fillSettings();openPreferences(preferences);}$('#main').focus({preventScroll:true});window.scrollTo(0,0);
}
function openPreferences(next){
 preferences=next;document.querySelectorAll('[data-preferences]').forEach(n=>n.setAttribute('aria-pressed',String(n.dataset.preferences===next)));
 document.querySelectorAll('[data-settings-section]').forEach(n=>n.hidden=n.dataset.settingsSection!==next);
 $('#settings-form').hidden=next==='native'||next==='chat';updateSaveLabel();
 if(next==='chat')void refreshChatSettings();
}
const fields={provider:'provider',endpoint:'endpoint',model:'model',cooldownSeconds:'cooldown',inputPrice:'input-price',outputPrice:'output-price'};
function fillSettings(){switcherDirty=false;
 for(const[k,id]of Object.entries(fields))$('#'+id).value=data.settings[k];
 $('#native-enabled').checked=data.settings.nativeEnabled;$('#switcher-enabled').checked=data.settings.switcherEnabled;$('#auto-analyze').checked=data.settings.autoAnalyze;
 $('#remember-key').checked=data.settings.rememberKey===true;updateCredentialUI();updateSaveLabel();
 $('#key-file').disabled=preview;syncProvider();
}
function updateSaveLabel(){$('#save-settings').textContent=preferences==='connection'?($('#remember-key').checked?'保存到钥匙串并连接':'保存并授权连接'):'保存调用设置';}
function updateCredentialUI(){
 const phase=data.credentialStatus?.phase||'',remembered=data.settings.rememberKey===true;
 $('#restore-key').hidden=!remembered||data.keyPresent;$('#restore-key').textContent=phase==='restoring'?'正在恢复…':'解锁并恢复连接';$('#restore-key').disabled=phase==='restoring';$('#connection-recovery').hidden=$('#restore-key').hidden;
 $('#key-state').dataset.phase=phase;
 if(importedKey||$('#api-key').value.trim())return;
 $('#api-key').placeholder=data.keyPresent?'已配置，留空保留':remembered&&['unlock_required','unavailable','restoring'].includes(phase)?'先恢复已保存连接，无需重新填写':'sk-…';
 $('#key-state').textContent=data.keyPresent?(data.credentialSaved?'已保存到 macOS 钥匙串，重载和重启后自动恢复。':remembered?'当前会话可用。点击保存，确认长期保存在这台 Mac。':'当前会话已配置密钥，留空保存会保留。'):(data.credentialStatus?.reason||(remembered?'正在恢复已保存连接…':'尚未配置密钥。首次配置可填写或从本机文件填入。'));
}
$('#remember-key').addEventListener('change',updateSaveLabel);
$('#restore-key').addEventListener('click',()=>task(async()=>{const b=$('#restore-key');b.disabled=true;try{importedKey='';$('#api-key').value='';await rpc('restoreKey');await refresh();updateCredentialUI();status('已恢复保存的连接。');}finally{b.disabled=false;}}));
function syncProvider(){
 const decision=$('#provider').value==='decisions';$('#model').readOnly=decision;$('#endpoint').readOnly=decision;
 if(decision){$('#model').value='gpt-6-luna';$('#endpoint').value='https://api.openai.com/v1';}
 $('#model-hint').textContent=decision?'Decisions 使用 gpt-6-luna。':'填写服务商支持的模型名称。';
}
const undo=button('撤销整理',async()=>{await rpc('undoOrganization');await refresh();status('已撤销本次分组整理。');});undo.id='undo-organization';undo.hidden=true;$('.workspace-toolbar').append(undo);
$('#settings-toggle').addEventListener('click',()=>openView(view==='settings'?'workspace':'settings'));
$('#back').addEventListener('click',()=>openView('workspace'));
$('#usage-link').addEventListener('click',()=>{preferences='usage';openView('settings');});
document.querySelectorAll('[data-preferences]').forEach(b=>b.addEventListener('click',()=>openPreferences(b.dataset.preferences)));
document.querySelectorAll('[data-filter]').forEach(b=>b.addEventListener('click',()=>{filter=b.dataset.filter;updateFilters();render();}));
$('#scope').addEventListener('change',render);$('#tab-search').addEventListener('input',render);
$('#refresh').addEventListener('click',()=>task(async()=>{await refresh();status('标签列表已更新。');}));
$('#provider').addEventListener('change',()=>{syncProvider();$('#input-price').value=0;$('#output-price').value=0;});
$('#settings-form').addEventListener('submit',e=>{
 e.preventDefault();task(async()=>{
  const scope=preferences==='usage'?'usage':'connection',settings={...data.settings};
  for(const[k,id]of Object.entries(fields)){const connectionField=['provider','endpoint','model'].includes(k);if((scope==='connection')!==connectionField)continue;settings[k]=connectionField?$('#'+id).value.trim():Number($('#'+id).value);}
  if(scope==='connection')settings.rememberKey=$('#remember-key').checked;else settings.autoAnalyze=$('#auto-analyze').checked;
  $('#settings-error').textContent='';const b=$('#save-settings');b.disabled=true;
  const imported=importedKey,typed=$('#api-key').value;
  try{
   if(!preview&&scope==='connection'){const u=new URL(settings.endpoint);if(u.protocol!=='https:')throw Error('填写完整的 HTTPS API 地址后重试。');if(!await chrome.permissions.request({origins:[u.origin+'/*']}))throw Error('未授权 API 地址；再次保存以选择授权。');}
   await rpc('saveSettings',{scope,settings,rememberConsent:scope==='connection'&&settings.rememberKey,apiKey:scope==='connection'?(imported||typed):''});
   if(scope==='connection'){if(importedKey===imported)importedKey='';if($('#api-key').value===typed)$('#api-key').value='';}
   await refresh();if(scope==='connection')fillSettings();status(scope==='usage'?'调用设置已保存。':settings.rememberKey?'已保存到 macOS 钥匙串，今后会自动恢复连接。':'设置已保存。');
  }catch(error){$('#settings-error').textContent=error.message;}finally{b.disabled=false;}
 });
});
$('#api-key').addEventListener('input',()=>{importedKey='';});
$('#endpoint').addEventListener('input',()=>{importedKey='';});
$('#forget-key').addEventListener('click',()=>task(async()=>{importedKey='';$('#api-key').value='';await rpc('forgetKey');await refresh();fillSettings();status('连接密钥已从本机移除。');}));
$('#key-file').addEventListener('change',()=>task(async()=>{
 const input=$('#key-file'),file=input.files?.[0];
 try{
  if(!file||preview)return;if(file.size>32768)throw Error('选择小于 32 KB 的 API 配置文件。');
  const text=await file.text(),match=text.match(/^\s*(?:export\s+)?OPENAI_API_KEY\s*=\s*(?:"([^"\r\n]+)"|'([^'\r\n]+)'|([^#\s\r\n]+))\s*(?:#.*)?$/m),key=match?.[1]||match?.[2]||match?.[3];
  if(!key||key.length>512)throw Error('文件中没有可识别的 OPENAI_API_KEY；选择安全配置流程生成的 env 文件。');
  importedKey=key;$('#api-key').value='';$('#key-state').textContent='已从本机文件读入密钥，保存后生效。';status('已在本机读入密钥，保存后生效。');
 }finally{input.value='';}
}));
$('#test-api').addEventListener('click',()=>task(async()=>{
 const b=$('#test-api');b.disabled=true;b.textContent='正在测试…';
 try{const result=await rpc('testAPI');$('#api-receipt').hidden=false;$('#api-receipt').textContent='连接通过 · '+result.provider+' · '+result.elapsedMs+' ms · 输入 '+(result.usage?.input_tokens??result.usage?.prompt_tokens??'未知')+' token';await refresh();status('合成样本测试完成。');}
 finally{b.disabled=false;b.textContent='测试连接';await refresh().catch(()=>{});}
}));
$('#native-enabled').addEventListener('change',()=>task(async()=>{await rpc('saveNative',{enabled:$('#native-enabled').checked});await refresh();status('原生提醒设置已保存。');}));
$('#hide-native').addEventListener('click',()=>task(async()=>{await rpc('nativeHide');status('已请求隐藏原生提醒。');}));
$('#analyze-dialog').addEventListener('close',()=>{
 if($('#analyze-dialog').returnValue==='send')task(async()=>{
  const tabId=targetId,evidence=targetEvidence,autoReview=$('#auto-review').checked;
  if(analyzingTabs.has(tabId))return;analyzingTabs.add(tabId);render();status('正在分析页面…');
  try{const result=await rpc('analyze',{tabId,autoReview,expectedHash:await fingerprint(evidence)});status(result.skipped||(result.uncertain?'判断仍不确定，已保留页面供你确认。':'分析完成，建议已更新。'));}
  finally{analyzingTabs.delete(tabId);await refresh();}
 });
});
$('#close-adapter').addEventListener('click',()=>$('#adapter-dialog').close());
$('#adapter-form').addEventListener('submit',e=>{
 e.preventDefault();task(async()=>{
  try{await rpc('watch',{tabId:targetId,adapter:{waiting:$('#waiting-text').value.trim(),done:$('#done-text').value.trim()}});$('#adapter-dialog').close();await refresh();status('本地监听已开始，完成后会标为待接手。');}
  catch(error){$('#adapter-error').textContent=error.message;}
 });
});
document.querySelectorAll('[data-capture]').forEach(b=>b.addEventListener('click',()=>task(async()=>{
 try{const result=await rpc('captureText',{tabId:targetId});if(!result.text)throw Error('先在目标页面选中一段完整状态文案，再返回取用。');
 $('#adapter-error').textContent='';$('#'+b.dataset.capture).value=result.text;$('#'+b.dataset.capture).focus();}
 catch(error){$('#adapter-error').textContent=error.message;}
})));
$('#organize').addEventListener('click',()=>task(async()=>{
 organization=await rpc('organizationPlan',{windowId:currentWindowId});$('#organization-plan').replaceChildren();
 if(!organization.groups.length){const p=document.createElement('p');p.className='hint';p.textContent='当前窗口没有需要合并的同站标签。';$('#organization-plan').append(p);}
 for(const group of organization.groups){const row=document.createElement('div');row.className='plan-row';const name=document.createElement('bdi');name.textContent=group.title;const count=document.createElement('span');count.textContent=group.tabIds.length+' 个标签';row.append(name,count);$('#organization-plan').append(row);}
 $('#apply-organization').disabled=!organization.groups.length;$('#organize-dialog').returnValue='';$('#organize-dialog').showModal();
}));
$('#organize-dialog').addEventListener('close',()=>{if($('#organize-dialog').returnValue==='apply')task(async()=>{const result=await rpc('organize',{plan:organization});await refresh();status('已整理为 '+result.groups+' 个网站分组，可在上方撤销。');});});
$('#switcher-enabled').addEventListener('change',()=>{switcherDirty=true;});
$('#switcher-form').addEventListener('submit',e=>{
 e.preventDefault();const b=$('#save-switcher');b.disabled=true;$('#switcher-error').textContent='';
 task(async()=>{try{await rpc('saveSwitcher',{enabled:$('#switcher-enabled').checked});switcherDirty=false;await refresh();}catch(error){$('#switcher-error').textContent=error.message;}finally{b.disabled=false;}});
});
function updateCountdown(){
 document.querySelectorAll('.countdown').forEach(n=>{
  const remaining=n.dataset.deadline?Math.max(0,Number(n.dataset.deadline)-Date.now()):Number(n.dataset.remaining);
  n.firstElementChild.textContent=Math.ceil(remaining/1000);n.style.setProperty('--remaining',Math.max(0,Math.min(1,remaining/30000)));
 });
}
async function heartbeat(){updateCountdown();if(preview)return;try{const w=await chrome.windows.getCurrent();const tabIds=[...document.querySelectorAll('.tab-row')].filter(n=>{const r=n.getBoundingClientRect();return view==='workspace'&&!document.querySelector('dialog[open]')&&r.height>0&&r.width>0&&r.top>=0&&r.bottom<=innerHeight;}).map(n=>Number(n.dataset.tabId));await rpc('lease',{visible:document.visibilityState==='visible'&&w.focused,windowId:w.id,tabIds});}catch{}}
if(preview){
 $('#preview-note').hidden=false;$('#mode-label').textContent='合成预览 · 本机交互';
 const state=new URLSearchParams(location.search).get('state');if(state==='empty')demo.tabs=[];
 if(state?.startsWith('backlog-')){demo.keyPresent=true;demo.analysisQueue={phase:state.slice(8),total:18,completed:7,analyzed:5,cached:2,skipped:0,failed:0,currentTitle:'Chrome 扩展开发文档',reason:state==='backlog-paused'?'已暂停，可随时继续。':''};}
 if(state==='keychain-locked'){demo.settings.rememberKey=true;demo.credentialStatus={phase:'unlock_required',reason:'macOS 需要确认钥匙串访问。选择“解锁并恢复连接”，在系统对话框允许 Tab Cadence；无需重新导入密钥。'};}
 if(state==='keychain-ready'){demo.settings.rememberKey=true;demo.keyPresent=true;demo.credentialSaved=true;demo.credentialStatus={phase:'ready'};}
 if(state==='error')status('API 额度或速率受限；在设置中检查账户余额，冷却后重试。',true);
}else{
 try{currentWindowId=(await chrome.windows.getCurrent()).id;}catch{}
 chrome.runtime.onMessage.addListener(m=>{if(m.type==='updated')refresh().catch(()=>{});});
}
try{
 await refresh();const state=new URLSearchParams(location.search).get('state');
 if(state==='settings'||state?.startsWith('keychain-'))openView('settings');
 if(state==='loading'){$('#tabs').setAttribute('aria-busy','true');$('#tabs').textContent='正在读取标签列表…';}
}catch(error){status(error.message+' 可选择刷新重试。',true);}
setInterval(heartbeat,1000);document.addEventListener('visibilitychange',heartbeat);await heartbeat();

function paintChatSettings(message){
 const control=$('#chat-enable');
 control.disabled=!chatReady;
 control.className=chatEnabled?'secondary':'primary';
 control.textContent=chatEnabled?'停用对话工具':'授权并启用';
 $('#chat-status').textContent=message??(chatEnabled?'已启用。回到 ChatGPT 使用。':'仅在授权的 ChatGPT 页面启用。');
}
async function refreshChatSettings(){
 const request=++chatRequest;
 try{
  const state=await rpc('threadWorkspace',{action:'status'});
  if(request!==chatRequest)return;
  chatEnabled=state.enabled;chatReady=true;paintChatSettings();
 }catch(error){if(request===chatRequest)$('#chat-status').textContent=error.message;}
}
$('#chat-enable').addEventListener('click',()=>{
 const value=!chatEnabled;
 ++chatRequest;chatReady=false;paintChatSettings(value?'正在启用…':'正在停用…');
 void (async()=>{
  if(value&&!preview&&!await chrome.permissions.request({origins:['https://chatgpt.com/*']}))throw Error('需要允许访问 chatgpt.com 才能启用。');
  const result=await rpc('threadWorkspace',{action:'setEnabled',value});
  chatEnabled=result.enabled;
  return result.refreshNeeded?'已保存。刷新未生效的 ChatGPT 页面。':undefined;
 })().then(message=>{chatReady=true;paintChatSettings(message);},error=>{chatReady=true;paintChatSettings(error.message);});
});

import {backlogPlan,backlogWaiting,trackableTab} from './core/backlog.mjs';
import {DEFAULTS,dayKey,safeURL,privateURL,fingerprint} from './core/policy.mjs';
import {credentialOrigin,credentialStorage} from './core/credentials.mjs';
import {createSyncPasskey,recoverSyncPasskey} from './core/passkey.mjs';
import {generatePairingCode} from './core/connection-sync.mjs';
import {duplicates,attentionOrder,organizationPlan} from './core/workspace.mjs';

const $=s=>document.querySelector(s),preview=!globalThis.chrome?.runtime?.id;
let chatEnabled=false,chatReady=false,chatRequest=0;
let helperStatus='unknown',helperVersion='',helperChecking=false,helperUpdates=false;
const helperNeedsInstall = () => helperStatus==='missing';
let importedKey='',switcherDirty=false,data,filter='all',targetId,targetEvidence,view='workspace',preferences='connection',currentWindowId=1,organization,backlogPreview,targetConnection;
let backlogView='check',backlogVersion=0,startingBacklog=false,workspaceScroll=0,viewMotion;
const hovered=new Set(),focused=new Set(),analyzingTabs=new Set(),renderedRows=new Map();
let recentSignature='';
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
  if(type==='backlogPlan'){const plan=backlogPlan(demo.tabs,args.windowId??null);return {id:'synthetic-plan',count:plan.targets.length,excluded:plan.skipped.length,sites:plan.sites,waiting:plan.waiting,local:plan.local,unavailable:plan.unavailable,endpointOrigin:'https://api.openai.com'};}
  if(type==='backlogStart'){demo.analysisQueue={phase:'running',total:3,completed:0,analyzed:0,cached:0,skipped:0,failed:0,currentTitle:'Chrome 扩展开发文档'};return {ok:true};}
  if(type==='backlogDismiss')demo.analysisQueue=null;
  if(type==='backlogStop')demo.analysisQueue={...demo.analysisQueue,phase:'complete',reason:'本轮已结束。'};
  if(type==='backlogPause')demo.analysisQueue={...demo.analysisQueue,phase:'paused',reason:'已暂停，可随时继续。'};
  if(type==='backlogResume')demo.analysisQueue={...demo.analysisQueue,phase:'running',reason:''};
  if(type==='testAPI'||type==='analyze')throw Error('界面预览不调用 API；在 Chrome 中打开已加载的 Diao 后测试。');
  if(type==='snapshot')return {title:demo.tabs.find(t=>t.id===args.tabId)?.title,url:'https://example.com/task',excerpt:'构建成功，可以检查结果。',signals:{observed:'done',editable:false,dirty:false,media:false}};
  if(type==='saveSettings'){demo.settings=args.settings;demo.keyPresent=!!args.apiKey||demo.keyPresent;}
  if(type==='forgetKey'){demo.keyPresent=false;demo.credentialSaved=false;demo.settings.rememberKey=false;demo.credentialStatus=null;}
  if(type==='restoreKey'){demo.keyPresent=true;demo.credentialSaved=true;demo.credentialStatus={phase:'ready',reason:'连接已恢复，密钥保存在这台 Mac 的钥匙串中。'};}
  if(type==='nativeCheck')return {status:demo.nativeSetup||'ready'};
  if(type==='saveNative')demo.settings.nativeEnabled=args.enabled;
  if(type==='saveSwitcher'){demo.settings.switcherEnabled=args.enabled;demo.switcherStatus={reason:args.enabled?'合成预览，请在实际扩展中验证快捷键。':'尚未启用。'};}
  if(type==='pardon')demo.records[args.tabId]={state:'keep',reason:'已保留本次。'};
  if(type==='watchPage'){demo.records[args.tabId]={state:'waiting',watching:true,reason:'正在监听状态变化。'};return {listening:true};}
  if(type==='stopWatch')delete demo.records[args.tabId];
  if(type==='setAutoGroupLinks'){demo.autoGroupLinks=args.enabled;return {enabled:args.enabled};}
  if(type==='setTabTidyHours'){demo.tabTidyHours=args.hours;return {hours:args.hours};}
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
function scopedTabs(){return data.tabs.filter(t=>!t.incognito);}
function checkScope(){return $('#scope').value==='all'?null:currentWindowId;}
function say(node,value){if(node.textContent!==value)node.textContent=value;}
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
  actions.append(button('保留',async()=>{await rpc('pardon',{tabId:t.id});hovered.delete(t.id);focused.delete(t.id);await refresh();status('已取消本次关闭；有新内容且冷却结束后才重新评估。');},'secondary','pardon'));
  const hint=document.createElement('span');hint.className='hint close-note';actions.append(hint);
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
  actions.append(button('保留',async()=>{await rpc('pardon',{tabId:t.id});await refresh();},'secondary','pardon'));
 }else if(r.state!=='resume'&&safeURL(t.url))actions.append(button(r.watching?'重选状态':'开始监听',()=>openWatch(t),'secondary','watch'));
 const details=document.createElement('details');const summary=document.createElement('summary');summary.textContent='页面操作与详情';summary.dataset.action='details';
 const more=document.createElement('div');more.className='row-actions';
 if(safeURL(t.url)){
  const analyzeButton=button(analyzingTabs.has(t.id)?'正在分析…':'分析页面',()=>openAnalysis(t),'secondary','analyze');analyzeButton.disabled=analyzingTabs.has(t.id);more.append(analyzeButton);
  if(r.state==='suggested'||r.state==='resume')more.append(button(r.watching?'重选状态':'开始监听',()=>openWatch(t),'secondary','watch-more'));
 }
 if(r.watching)more.append(button('停止监听',async()=>{await rpc('stopWatch',{tabId:t.id});await refresh();status('已停止此页的本地监听。');},'secondary','stop-watch'));
 if(r.autoReview)more.append(button('停止自动复查',async()=>{await rpc('autoReview',{tabId:t.id});await refresh();status('已停止此页的自动复查。');},'secondary','stop-review'));
 if(data.settings.nativeEnabled&&['resume','closing','paused'].includes(r.state))more.append(button('显示标签提醒',async()=>{await rpc('nativeShow',{tabId:t.id});status('已请求显示提醒；定位状态可在 macOS 设置中查看。');},'secondary','native'));
 const address=document.createElement('p');address.className='full-url';address.dir='auto';address.textContent=t.url||'地址暂不可用';
 details.append(summary,more,address);row.append(meta,title,reason);if(actions.childNodes.length)row.append(actions);row.append(details);return row;
}
function render() {
 const scoped=scopedTabs().filter(tab=>['resume','waiting','suggested','uncertain','closing','paused'].includes(tabState(tab))||analyzingTabs.has(tab.id)),records=scoped.map(t=>data.records[t.id]).filter(Boolean),today=data.ledger?.date===dayKey()?data.ledger:null;
 const resume=records.filter(r=>r.state==='resume').length,waiting=records.filter(r=>r.state==='waiting').length,suggested=records.filter(r=>['suggested','closing','paused'].includes(r.state)).length;
 for(const [id,count] of [['#waiting-count',resume],['#watching-count',waiting],['#suggested-count',suggested]]){
  const element=$(id);
  element.hidden=!count;
  say(element,String(count));
 }
 $('#request-count').textContent=String(today?.requests||0);
 $('#usage-link').hidden=!today?.requests;
 $('#usage-summary').textContent='今日已调用 '+(today?.requests||0)+' 次，累计约 '+new Intl.NumberFormat('zh-CN').format(today?.tokens||0)+' token。';
 $('.filters').hidden=scoped.length===0;
 $('#item-search').hidden=scoped.length<6&&!$('#tab-search').value.trim();
 const query=$('#tab-search').value.trim().toLocaleLowerCase(),tabs=attentionOrder(scoped,data.records).filter(t=>matchesFilter(t)&&((t.title||'')+' '+(t.url||'')).toLocaleLowerCase().includes(query));
 $('#tab-count').hidden=scoped.length===0;
 $('#tab-count').textContent=query||filter!=='all'?tabs.length+' / '+scoped.length:scoped.length;
 const container=$('#tabs');
 const shown=new Set(tabs.map(tab=>tab.id));
 for(const [id,entry] of renderedRows){
  if(shown.has(id))continue;
  hovered.delete(id);
  focused.delete(id);
  entry.node.remove();
  renderedRows.delete(id);
 }
 if(!tabs.length){
  const title=query?'未找到匹配的事项':filter==='all'?'暂无待处理事项':
   filter==='resume'?'暂无待接手事项':filter==='waiting'?'暂无等待中的任务':'暂无清理建议';
  if(container.firstElementChild?.dataset.empty!==title){
   const empty=document.createElement('div');empty.className='empty';empty.dataset.empty=title;
   const h=document.createElement('h2');h.textContent=title;empty.append(h);
   if(!query&&filter==='all'){
    const p=document.createElement('p');
    p.textContent='在网页上右键选择「开始监听」。有进展时，会提醒你回来。';
    empty.append(p);
   }else empty.append(button('查看全部事项',()=>{filter='all';$('#tab-search').value='';updateFilters();render();},'text-button'));
   container.replaceChildren(empty);
  }
 }else{
  container.querySelector('.empty')?.remove();
  for(const [index,tab] of tabs.entries()){
   const record=data.records[tab.id],closing=['closing','paused'].includes(record?.state);
   const key=JSON.stringify([tab.title,tab.url,tab.active,closing?'close':record?.state,
    closing?'':record?.reason,record?.watching,record?.autoReview,record?.apiIssue,
    data.settings.nativeEnabled,data.duplicates?.[tab.id]?.extra,analyzingTabs.has(tab.id)]);
   let entry=renderedRows.get(tab.id);
   if(entry?.key!==key){
    const node=makeRow(tab),old=entry?.node;
    if(old){
     const active=old.contains(document.activeElement)?document.activeElement.dataset.action:null;
     node.querySelector('details').open=old.querySelector('details').open;
     old.replaceWith(node);
     if(active)node.querySelector('[data-action="'+active+'"]')?.focus({preventScroll:true});
    }
    entry={key,node};renderedRows.set(tab.id,entry);
   }
   const {node}=entry;
   if(container.children[index]!==node)container.insertBefore(node,container.children[index]||null);
   if(closing){
    node.dataset.state=record.state;
    say(node.querySelector('.badge'),labels[record.state]);
    say(node.querySelector('.reason'),record.reason||'');
    say(node.querySelector('.close-note'),record.state==='paused'?
     (record.visibilityPaused?'提醒可见后继续':'移开后继续计时'):'提醒可见时计时');
    const ring=node.querySelector('.countdown');
    ring.dataset.deadline=record.closeAt||'';
    ring.dataset.remaining=record.remainingMs||'';
   }
  }
 }
 $('#undo-organization').hidden=!data.canUndoOrganization;
 const recent=data.recentClosed||[],signature=recent.map(entry=>entry.id).join('|');
 $('#recovery').hidden=!recent.length;
 if(signature!==recentSignature){
  recentSignature=signature;
  $('#recent-closed').replaceChildren(...recent.map(entry=>button('重新打开 '+entry.title,async()=>{
   await rpc('reopen',{id:entry.id});await refresh();status('已在后台重新打开。');
  })));
 }
 renderBacklog();updateCountdown();
}
function renderBacklog(){
 const q=data.analysisQueue||{phase:'idle'},running=q.phase==='running',waiting=q.phase==='waiting';
 $('#backlog-status').hidden=q.phase==='idle';
 if(q.phase==='idle')return;
 say($('#backlog-title'),running?'正在分析网页':waiting?'等待网页载入':q.phase==='complete'?'网页检查完成':q.blockedBy==='credentials'?'恢复模型连接后继续':'分析已暂停');
 say($('#backlog-count'),(q.completed||0)+' / '+(q.total||0));
 $('#backlog-progress').max=Math.max(1,q.total||0);
 $('#backlog-progress').value=q.completed||0;
 say($('#backlog-current'),running&&q.currentTitle?q.currentTitle:'');
 const results=[q.analyzed&&'已分析 '+q.analyzed,q.cached&&'复用 '+q.cached,q.waiting&&'等候 '+q.waiting,
  q.skipped&&'未发送 '+q.skipped,q.failed&&'未完成 '+q.failed].filter(Boolean);
 say($('#backlog-note'),[q.reason,results.join(' · ')].filter(Boolean).join(' '));
 $('#backlog-pause').hidden=!(running||waiting);
 $('#backlog-resume').hidden=!['paused','blocked'].includes(q.phase)||q.blockedBy==='credentials';
 $('#backlog-connect').hidden=q.blockedBy!=='credentials';
 $('#backlog-dismiss').hidden=q.phase!=='complete'||Boolean(q.currentTitle);
 $('#backlog-stop').hidden=!['waiting','paused','blocked'].includes(q.phase);
 $('#backlog-results').hidden=!scopedTabs().some(tab=>['suggested','closing','paused'].includes(tabState(tab)));
 $('#backlog-resume').textContent=q.blockedBy==='configuration'?'重新选择网站':'继续分析';
}
function renderWatchList(){
 const term=$('#watch-search').value.trim().toLocaleLowerCase(),scope=checkScope();
 const tabs=scopedTabs().filter(tab=>trackableTab(tab)&&(scope===null||tab.windowId===scope)&&
  ((tab.title||'')+' '+tab.url).toLocaleLowerCase().includes(term));
 const list=$('#watch-list'),items=document.createDocumentFragment();
 for(const tab of tabs){
  const item=document.createElement('li'),waiting=backlogWaiting(tab),watching=data.records[tab.id]?.watching;
  const itemButton=button(tab.title||'无标题网页',async()=>{
   try{
    if(waiting){await rpc('activate',{tabId:tab.id});$('#backlog-dialog').close();return;}
    await openWatch(tab,{pick:watching});
    $('#backlog-dialog').close();
   }catch(error){$('#backlog-error').textContent=error.message;}
  },'watch-tab');
  const site=document.createElement('bdi');
  site.textContent=[new URL(tab.url).hostname,waiting?'打开网页':watching?'重选状态':''].filter(Boolean).join(' · ');
  itemButton.append(site);item.append(itemButton);items.append(item);
 }
 list.replaceChildren(items);
 $('#watch-list-empty').hidden=tabs.length>0;
}
function showCheckView(next){
 backlogView=next;
 const picking=next==='watch';
 $('#backlog-options').hidden=picking;
 $('#watch-selection').hidden=!picking;
 say($('#backlog-dialog-title'),picking?'选择要监听的网页':'添加事项');
 $('#backlog-error').textContent='';
 if(picking){$('#watch-search').value='';renderWatchList();$('#watch-search').focus();}
 else $('#backlog-dialog-title').focus({preventScroll:true});
}
async function readBacklogPlan(){
 const request=++backlogVersion;
 backlogPreview=null;
 $('#backlog-sites').replaceChildren();
 $('#backlog-start').disabled=true;
 say($('#backlog-plan-summary'),'正在检查网页…');
 const plan=await rpc('backlogPlan',{windowId:checkScope()});
 if(request!==backlogVersion)return;
 backlogPreview=plan;
 $('#backlog-sites').replaceChildren();
 $('#backlog-endpoint').textContent=plan.endpointOrigin;
 for(const site of plan.sites){
  const label=document.createElement('label');label.className='check';
  const input=document.createElement('input');input.type='checkbox';input.checked=true;input.value=site.origin;
  input.dataset.count=site.count;input.dataset.waiting=site.waiting||0;
  input.addEventListener('change',updateBacklogSelection);
  const host=document.createElement('bdi');host.textContent=new URL(site.origin).host;
  const count=document.createElement('span');count.textContent=site.count+' 页';
  label.append(input,host,count);$('#backlog-sites').append(label);
 }
 updateBacklogSelection();
}
async function openBacklog(){
 const dialog=$('#backlog-dialog');
 if(!dialog.open){$('#backlog-auto-review').checked=false;dialog.showModal();}
 showCheckView('check');
 await readBacklogPlan();
}
function updateBacklogSelection(){
 if(!backlogPreview||startingBacklog){$('#backlog-start').disabled=true;return;}
 const chosen=[...$('#backlog-sites').querySelectorAll('input:checked')];
 const count=chosen.reduce((sum,input)=>sum+Number(input.dataset.count),0);
 const sleeping=chosen.reduce((sum,input)=>sum+Number(input.dataset.waiting),0);
 const details=[
  count-sleeping+' 页可分析',sleeping&&sleeping+' 页载入后分析',
  backlogPreview.local&&backlogPreview.local+' 页仅本机监听',
  backlogPreview.unavailable&&backlogPreview.unavailable+' 页受 Chrome 限制'
 ].filter(Boolean);
 say($('#backlog-plan-summary'),details.join(' · '));
 const connected=data.keyPresent||preview;
 $('#backlog-setup-connection').hidden=connected||!backlogPreview.count;
 $('#backlog-ready').hidden=!connected||!backlogPreview.count;
 const queue=data.analysisQueue;
 const running=queue?.blockedBy!=='configuration'&&['running','waiting','paused','blocked'].includes(queue?.phase);
 $('#backlog-start').disabled=!count||running;
 $('#backlog-start').textContent=running?'先完成当前一轮':count?'分析 '+count+' 个网页':'开始分析';
}
$('#backlog-open').addEventListener('click',()=>task(openBacklog));
$('#scope').addEventListener('change',()=>task(async()=>{
 if(backlogView==='watch')renderWatchList();
 await readBacklogPlan();
}));
$('#watch-picker-open').addEventListener('click',()=>showCheckView('watch'));
$('#watch-search').addEventListener('input',renderWatchList);
$('#watch-back').addEventListener('click',()=>showCheckView('check'));
$('#backlog-setup-connection').addEventListener('click',()=>{$('#backlog-dialog').close();preferences='connection';openView('settings');});
$('#backlog-pause').addEventListener('click',()=>task(async()=>{await rpc('backlogPause');await refresh();}));
$('#backlog-stop').addEventListener('click',()=>task(async()=>{await rpc('backlogStop');await refresh();}));
$('#backlog-dialog').addEventListener('close',()=>{++backlogVersion;backlogPreview=null;});
$('#backlog-dismiss').addEventListener('click',()=>task(async()=>{await rpc('backlogDismiss');await refresh();}));
$('#backlog-resume').addEventListener('click',()=>task(async()=>{if(data.analysisQueue?.blockedBy==='configuration')return openBacklog();await rpc('backlogResume');await refresh();}));
$('#backlog-connect').addEventListener('click',()=>{preferences='connection';openView('settings');});
$('#backlog-results').addEventListener('click',()=>{filter='suggested';updateFilters();render();$('#tabs').scrollIntoView({block:'start'});});
$('#backlog-start').addEventListener('click',()=>task(async()=>{
 if(startingBacklog||!backlogPreview)return;
 const start=$('#backlog-start'),version=backlogVersion;
 const origins=[...$('#backlog-sites').querySelectorAll('input:checked')].map(input=>input.value);
 const consent={planId:backlogPreview.id,origins,consent:true,autoReview:$('#backlog-auto-review').checked};
 const controls=[...document.querySelectorAll('#scope,#backlog-sites input,#backlog-auto-review,#watch-picker-open')];
 startingBacklog=true;
 controls.forEach(control=>control.disabled=true);
 $('#backlog-error').textContent='';
 start.disabled=true;start.textContent='正在开始…';
 try{
  if(!preview&&!await chrome.permissions.request({origins:origins.map(origin=>origin+'/*')}))throw Error('未允许读取所选网站。');
  if(!$('#backlog-dialog').open||version!==backlogVersion)return;
  await rpc('backlogStart',consent);
  $('#backlog-dialog').close();await refresh();
 }catch(error){$('#backlog-error').textContent=error.message;}
 finally{
  startingBacklog=false;
  controls.forEach(control=>control.disabled=false);
  updateBacklogSelection();
 }
}));
function updateFilters(){document.querySelectorAll('[data-filter]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.filter===filter)));}
function paintHelperSetup() {
 const install=helperNeedsInstall(),authorization=helperStatus==='accessibility_required';
 const unavailable=['disconnected','unavailable'].includes(helperStatus);
 $('#helper-discovery').hidden=!(install||authorization);
 $('#helper-discovery-link').textContent=install?'安装 Mac 助手':'完成 Mac 助手设置';
 $('#helper-setup').hidden=['ready','unknown','updating'].includes(helperStatus);
 $('#helper-title').textContent=install?'安装 Mac 助手':
  authorization?'需要辅助功能权限':helperStatus==='unsupported'?'此设备不支持 Mac 功能':'连接 Mac 助手';
 $('#helper-instructions').textContent=install?
  '下载后打开助手，按提示安装。':
  authorization?'打开 Diao Bridge，在系统设置中允许辅助功能访问。':
  unavailable?'打开已安装的 Diao Bridge，按提示完成连接。':'';
 $('#helper-download').hidden=!install;
 $('#helper-release').hidden=!install;
 $('#helper-check').hidden=!unavailable;
 $('#helper-check').disabled=helperChecking;
 $('#helper-check').textContent=helperChecking?'正在连接…':'重新连接';
 const phase=data?.helperUpdate?.phase||'idle';
 const updating=['checking','staged','installing'].includes(phase);
 const labels={checking:'正在检查更新…',staged:'更新已就绪，空闲时安装。',installing:'正在更新并重新连接…',current:'已是最新版。',installed:'更新完成。',failed:'更新未完成，可以重试。'};
 $('#helper-health').hidden=helperStatus!=='ready'&&!updating;
 $('#helper-connected').textContent=helperVersion?'Mac 助手 · '+helperVersion:'Mac 助手';
 $('#helper-update-status').textContent=labels[phase]||(helperUpdates?'自动更新已开启。':'');
 $('#helper-check-update').hidden=!helperUpdates;
 $('#helper-check-update').disabled=updating;
 $('#helper-update').hidden=helperUpdates||helperStatus!=='ready';
 $('#native-controls').hidden=helperStatus!=='ready';
 $('#hide-native').hidden=helperStatus!=='ready'||!data?.settings.nativeEnabled;
 $('#keychain-option').hidden=selectedStorage()!=='keychain'&&!data?.keychainAvailable;
 $('#keychain-helper').hidden=selectedStorage()!=='keychain'||helperStatus==='ready';
}
async function checkHelper(refresh=false) {
 if(helperChecking)return;
 helperChecking=true;paintHelperSetup();
 try{
  const state=await rpc('nativeCheck',{refresh});
  helperStatus=state.status;helperVersion=state.release||state.version||'';helperUpdates=state.updatesAvailable===true;
 }catch{helperStatus='unavailable';helperVersion='';}
 finally{helperChecking=false;paintHelperSetup();}
}
function openHelperSettings() {
 preferences='native';openView('settings');if(!$('#helper-setup').hidden)$('#helper-title').focus({preventScroll:true});
}
for(const id of ['#helper-discovery-link','#keychain-helper'])$(id).addEventListener('click',openHelperSettings);
$('#helper-check').addEventListener('click',()=>void checkHelper(true));
$('#helper-check-update').addEventListener('click',()=>void task(async()=>{await rpc('helperCheckUpdate');}));

async function refresh(){
 const previous = data;
 data = await rpc('state');
 render();
 if(view==='settings'&&preferences==='native'&&data.helperUpdate?.phase==='installed'&&previous?.helperUpdate?.phase!=='installed')void checkHelper(true);
 say($('#native-status'),data.settings.nativeEnabled?(data.nativeStatus?.reason||'已开启，事项有进展时会提醒。'):'');
 say($('#switcher-status'),data.settings.switcherEnabled?(data.switcherStatus?.reason||'已开启。'):'');
 $('#native-enabled').checked=data.settings.nativeEnabled;
 if(view==='settings'){
  if(previous?.settings.credentialRevision!==data.settings.credentialRevision && !connectionDirty) fillSettings();
  updateCredentialUI();
 }
 if(!switcherDirty)$('#switcher-enabled').checked=data.settings.switcherEnabled;
 if(!$('#auto-group-links').disabled)$('#auto-group-links').checked=data.autoGroupLinks!==false;
 if(!$('#tab-tidy-hours').disabled)$('#tab-tidy-hours').value=String(data.tabTidyHours||0);
 if($('#backlog-dialog').open)updateBacklogSelection();
 paintHelperSetup();
}
async function prepare(tab){
 if(preview)return;
 if(!safeURL(tab.url)||tab.incognito)throw Error('选择非隐身的普通网页后重试。');
 if(!await chrome.permissions.request({origins:[new URL(tab.url).origin+'/*']}))throw Error('尚未授权读取页面；再次选择监听或分析以授权。');
 await chrome.scripting.executeScript({target:{tabId:tab.id},files:['sensor.js']});
}
async function openWatch(tab,{pick=data.records[tab.id]?.watching===true}={}){
 if(!trackableTab(tab)||backlogWaiting(tab))throw Error('请在网页载入后开始监听。');
 if(!preview&&!await chrome.permissions.request({origins:[new URL(tab.url).origin+'/*']}))throw Error('未允许读取此网站。');
 const result=await rpc('watchPage',{tabId:tab.id,url:tab.url,pick});
 await refresh();
 if(result.listening)status('已开始监听「'+(tab.title||'这张网页')+'」。');
}
async function openAnalysis(tab){
 await prepare(tab);
 const {provider,endpoint,model}=data.settings;
 targetConnection=JSON.stringify([provider,endpoint,model]);
 say($('#analysis-endpoint'),new URL(endpoint).host);
 targetId=tab.id;targetEvidence=await rpc('snapshot',{tabId:tab.id});
 const e=targetEvidence;$('#evidence').textContent=e.title+'\n'+e.url+'\n\n'+(e.excerpt||'未提取正文。')+'\n\n页面信号：'+(e.signals.editable?'有编辑控件；':'')+(e.signals.dirty?'有未提交输入；':'')+(e.signals.media?'有媒体播放；':'')+(e.signals.observed==='done'?'匹配完成文案':e.signals.observed==='waiting'?'匹配等待文案':'未匹配任务状态');
 $('#auto-review-label').hidden=privateURL(tab.url);$('#auto-review').checked=data.records[tab.id]?.autoReview===true&&!privateURL(tab.url);$('#auto-review-hint').textContent=privateURL(tab.url)?'本地和内网页面仅支持手动分析。':'启用后，此页闲置至少 10 分钟才复查，可随时停止。';
 $('#analyze-dialog').returnValue='';$('#analyze-dialog').showModal();
}
function settleView(element){
 viewMotion?.cancel();
 if(matchMedia('(prefers-reduced-motion: reduce)').matches)return;
 viewMotion=element.animate([{opacity:.72},{opacity:1}],{duration:165,easing:'cubic-bezier(.2,.8,.2,1)'});
}
function openView(next){
 if(view===next){if(next==='settings')openPreferences(preferences);return;}
 if(view==='workspace')workspaceScroll=window.scrollY;
 view=next;
 const isSettings=next==='settings',surface=isSettings?$('#settings'):$('#workspace');
 $('#workspace').hidden=isSettings;$('#settings').hidden=!isSettings;$('#settings-toggle').hidden=isSettings;
 document.title=isSettings?'Diao · 设置':'Diao · 管理';
 if(isSettings){fillSettings();openPreferences(preferences,{motion:false});}
 (isSettings?$('#settings-title'):$('#settings-toggle')).focus({preventScroll:true});
 window.scrollTo(0,isSettings?0:workspaceScroll);
 settleView(surface);
}
function openPreferences(next,{motion=true}={}){
 const changed=preferences!==next;
 preferences=next;
 document.querySelectorAll('[data-preferences]').forEach(n=>n.setAttribute('aria-pressed',String(n.dataset.preferences===next)));
 document.querySelectorAll('[data-settings-section]').forEach(n=>n.hidden=n.dataset.settingsSection!==next);
 const form=$('#settings-form');
 form.hidden=['native','chat','tabs'].includes(next);
 updateSaveLabel();
 if(next==='connection')updateCredentialUI();
 if(next==='chat')void refreshChatSettings();
 if(next==='native')void checkHelper(true);
 if(motion&&changed)settleView(form.hidden?document.querySelector('[data-settings-section='+next+']'):form);
}
const usageFields={cooldownSeconds:'cooldown',inputPrice:'input-price',outputPrice:'output-price'};
const checked=name=>$('input[name='+name+']:checked').value;
const selectedStorage=()=>checked('credentialStorage');
const service=()=>checked('apiService');
const selectedProvider=()=>checked(service()==='openai'?'provider':'compatibleProtocol');
const checkOption=(name,value)=>{ $("input[name="+name+"][value="+value+"]").checked=true; };
let connectionDirty=false,activeProvider='decisions',activeService='openai',savingConnection=false,unlockingSync=false;
const providerDrafts=new Map();
const draftKey=(kind,provider)=>kind+'|'+provider;
function originOf(value){
 try{return credentialOrigin(value);}
 catch{return '';}
}
function currentEndpoint(){
 return activeService==='openai'?DEFAULTS.endpoint:$('#endpoint').value.trim();
}
function savedForDraft(){
 return data?.keyPresent&&originOf(currentEndpoint())===originOf(data.settings.endpoint);
}
function clearKeyDraft(){importedKey='';$('#api-key').value='';}
function fillSettings(){
 switcherDirty=false;
 connectionDirty=false;
 for(const [key,id] of Object.entries(usageFields))$('#'+id).value=data.settings[key];
 $('#native-enabled').checked=data.settings.nativeEnabled;
 $('#switcher-enabled').checked=data.settings.switcherEnabled;
 $('#auto-analyze').checked=data.settings.autoAnalyze;
 activeProvider=data.settings.provider;
 activeService=activeProvider==='chat'||originOf(data.settings.endpoint)!==originOf(DEFAULTS.endpoint)?'compatible':'openai';
 checkOption('apiService',activeService);
 checkOption(activeService==='openai'?'provider':'compatibleProtocol',activeProvider);
 providerDrafts.clear();
 for(const [slot,fields] of Object.entries(data.connectionProfiles||{}))providerDrafts.set(slot,fields);
 providerDrafts.set(draftKey(activeService,activeProvider),{endpoint:data.settings.endpoint,model:data.settings.model});
 const mode=credentialStorage(data.settings);
 checkOption('credentialStorage',mode==='session'&&!data.settings.credentialStorage?'profile':mode);
 $('#key-file').disabled=preview;
 showProviderFields();
 updateSaveLabel();
 updateCredentialUI();
}
function updateSaveLabel(){
 const mode=selectedStorage(),hints={
  profile:'重启 Chrome 后自动恢复。',
  sync:'新设备登录同一 Chrome 账号后，验证一次即可恢复。',
  keychain:'保存在 macOS 钥匙串。',
  session:'仅在当前 Chrome 会话可用。',
 };
 say($('#credential-storage-hint'),hints[mode]);
 if(data)paintHelperSetup();
 if(!savingConnection)$('#save-settings').textContent=preferences==='connection'?'保存连接':'保存调用设置';
}
function updateCredentialUI(){
 if(preferences!=='connection'||!data)return;
 const phase=data.credentialStatus?.phase,mode=credentialStorage(data.settings),remote=data.syncConnection;
 const showingSaved=savedForDraft();
 const remoteMatches=remote&&originOf(remote.settings.endpoint)===originOf(currentEndpoint());
 const showRecovery=remote&&(remoteMatches||!data.settings.credentialRevision)&&
  (!showingSaved||remote.id!==data.settings.credentialRevision);
 $('#sync-recovery').hidden=!showRecovery;
 $('#sync-unlock').hidden=Boolean(remote?.passkey);
 $('#unlock-sync').disabled=unlockingSync;
 if(!unlockingSync)$('#unlock-sync').textContent=remote?.passkey?'验证并恢复':'解锁此设备';
 say($('#sync-origin'),showRecovery?
  new URL(remote.settings.endpoint).host+' · '+(remote.passkey
   ? (showingSaved?'验证后切换到同步连接。':'验证这台设备即可恢复。')
   :'在此设备输入配对码或原同步口令。'):'');
 const activeSync=remoteMatches&&showingSaved&&mode==='sync'&&remote.id===data.settings.credentialRevision;
 $('#sync-setup').hidden=selectedStorage()!=='sync'||Boolean(remote&&!activeSync);
 const pair=$('#sync-pair');
 pair.disabled=savingConnection;
 pair.textContent=activeSync?'生成新配对码':'用配对码保存';
 $('#sync-upgrade').hidden=!activeSync||Boolean(remote?.passkey);
 $('#sync-upgrade').disabled=savingConnection;
 const restore=$('#restore-key');
 restore.hidden=mode!=='keychain'||showingSaved||phase==='missing'||originOf(currentEndpoint())!==originOf(data.settings.endpoint);
 restore.disabled=phase==='restoring';
 restore.textContent=phase==='restoring'?'正在恢复…':'解锁钥匙串';
 $('#connection-recovery').hidden=restore.hidden;
 $('#api-key').placeholder=showingSaved?'已保存 · 可替换':'粘贴 API Key';
 if(!importedKey)say($('#key-state'),showingSaved
  ? {profile:'已保存在当前 Chrome 配置。',sync:'已连接 · Chrome 同步',keychain:'已保存至钥匙串。',session:'此会话已连接。'}[mode]
  : !showRecovery&&originOf(currentEndpoint())===originOf(data.settings.endpoint)&&['unavailable','unlock_required'].includes(phase)
   ? data.credentialStatus.reason : '');
 $('#key-state').dataset.phase=phase||'';
 $('#forget-key').hidden=originOf(currentEndpoint())!==originOf(data.settings.endpoint)||
  !data.keyPresent&&(!data.settings.rememberKey||phase==='missing');
 $('#forget-key').textContent=mode==='sync'?'从同步中移除':'移除密钥';
 const sameSettings=selectedProvider()===data.settings.provider&&
  currentEndpoint()===data.settings.endpoint&&$('#model').value.trim()===data.settings.model;
 const receipt=$('#api-receipt'),check=showingSaved&&sameSettings?data.connectionCheck:null;
 say(receipt,check?.pending?'正在验证连接…':check?.ok?'连接验证通过':check?.reason||'');
 receipt.classList.toggle('error',Boolean(check?.reason));
}
for(const option of document.querySelectorAll('input[name=credentialStorage]')){
 option.addEventListener('change',()=>{connectionDirty=true;updateSaveLabel();updateCredentialUI();});
}
$('#restore-key').addEventListener('click',()=>task(async()=>{await rpc('restoreKey');await refresh();}));
function showProviderFields(){
 const official=activeService==='openai',decision=activeProvider==='decisions';
 const draft=providerDrafts.get(draftKey(activeService,activeProvider));
 $('#openai-protocols').hidden=!official;
 $('#compatible-protocols').hidden=official;
 $('#credential-label').textContent=official?'OpenAI API Key':'服务 API Key';
 $('#provider-fields').hidden=decision;
 $('#endpoint-field').hidden=official;
 $('#endpoint').disabled=official;
 $('#model').disabled=decision;
 $('#endpoint').value=official?DEFAULTS.endpoint:draft?.endpoint||'';
 $('#model').value=decision?DEFAULTS.model:draft?.model||(official?DEFAULTS.model:'');
}
for(const option of document.querySelectorAll('input[name=apiService],input[name=provider],input[name=compatibleProtocol]')){
 option.addEventListener('change',()=>{
  const previousOrigin=originOf(currentEndpoint());
  providerDrafts.set(draftKey(activeService,activeProvider),{endpoint:currentEndpoint(),model:$('#model').value});
  const serviceChanged=activeService!==service();
  activeService=service();
  activeProvider=selectedProvider();
  connectionDirty=true;
  showProviderFields();
  if(serviceChanged||previousOrigin!==originOf(currentEndpoint()))clearKeyDraft();
  $('#settings-error').textContent='';
  updateCredentialUI();
 });
}
async function authorizeEndpoint(endpoint){
 if(preview)return;
 const url=new URL(endpoint);
 if(url.protocol!=='https:'||url.username||url.password||url.search||url.hash)throw Error('请填写完整的 HTTPS API 地址。');
 if(!await chrome.permissions.request({origins:[url.origin+'/*']}))throw Error('请授权此 API 地址。');
}
const undo=button('撤销网站分组',async()=>{await rpc('undoOrganization');await refresh();status('已撤销网站分组。');});
undo.id='undo-organization';undo.hidden=true;$('.tidy-tools').append(undo);
$('#auto-group-links').addEventListener('change',event=>task(async()=>{
 const control=event.currentTarget;
 control.disabled=true;
 try {
  const result=await rpc('setAutoGroupLinks',{enabled:control.checked});
  data.autoGroupLinks=result.enabled;
 } catch(error) {
  control.checked=data.autoGroupLinks!==false;
  throw error;
 } finally {control.disabled=false;}
}));
$('#tab-tidy-hours').addEventListener('change',event=>{
 const control=event.currentTarget, result=$('#tab-tidy-result');
 control.disabled=true;result.hidden=false;say(result,'正在保存…');
 void (async()=>{
  try{
   const saved=await rpc('setTabTidyHours',{hours:Number(control.value)});
   control.value=String(saved.hours);
   say(result,saved.hours?'已开启自动收纳':'已关闭自动收纳');
  }catch(error){
   control.value=String(data.tabTidyHours||0);
   say(result,error.message);
  }finally{control.disabled=false;await refresh();}
 })().catch(error=>say(result,error.message));
});
$('#settings-toggle').addEventListener('click',()=>openView(view==='settings'?'workspace':'settings'));
$('#back').addEventListener('click',()=>openView('workspace'));
$('#usage-link').addEventListener('click',()=>{preferences='usage';openView('settings');});
document.querySelectorAll('[data-preferences]').forEach(b=>b.addEventListener('click',()=>openPreferences(b.dataset.preferences)));
document.querySelectorAll('[data-filter]').forEach(b=>b.addEventListener('click',()=>{filter=b.dataset.filter;updateFilters();render();}));
$('#tab-search').addEventListener('input',render);
$('#settings-form').addEventListener('submit',event=>{event.preventDefault();void saveConnection();});
$('#sync-upgrade').addEventListener('click',()=>void saveConnection({upgrade:true}));
const pairingDialog=$('#sync-pairing');
const pairingValue=$('#sync-pairing-value');
const pairingClose=$('#sync-pairing-close');
const pairingConfirm=$('#sync-pairing-confirm');
const pairingCopy=$('#sync-pairing-copy');
function showPairingCode(code=''){
 const ready=Boolean(code);
 pairingValue.value=code;
 pairingCopy.textContent='复制';
 $('#sync-pairing-code').hidden=!ready;
 $('#sync-pairing-help').textContent=ready?'保存配对码。每台新设备首次恢复连接时输入一次。':'更换验证方式后，其他设备需用新码恢复连接。';
 $('#sync-pairing-error').textContent='';
 pairingConfirm.hidden=ready;
 pairingClose.textContent=ready?'完成':'取消';
 if(!pairingDialog.open)pairingDialog.showModal();
 (ready?pairingCopy:pairingClose).focus();
}
$('#sync-pair').addEventListener('click',()=>{
 if(data.syncConnection)showPairingCode();
 else void saveConnection({pair:true});
});
pairingConfirm.addEventListener('click',()=>void saveConnection({pair:true}));
pairingCopy.addEventListener('click',async()=>{
 try{await navigator.clipboard.writeText(pairingValue.value);pairingCopy.textContent='已复制';}
 catch{pairingValue.focus();pairingValue.select();}
});
pairingDialog.addEventListener('cancel',event=>{if(savingConnection)event.preventDefault();});
pairingDialog.addEventListener('close',()=>{pairingValue.value='';});
async function saveConnection({upgrade=false,pair=false}={}){
 if(savingConnection)return;
 const scope=preferences==='usage'?'usage':'connection',settings={...data.settings},remote=data.syncConnection;
 if(scope==='connection'){
  settings.provider=selectedProvider();
  settings.endpoint=currentEndpoint();
  settings.model=$('#model').value.trim();
  settings.credentialStorage=selectedStorage();
  settings.rememberKey=settings.credentialStorage!=='session';
 }else{
  for(const [key,id] of Object.entries(usageFields))settings[key]=Number($('#'+id).value);
  settings.autoAnalyze=$('#auto-analyze').checked;
 }
 const error=$(pairingDialog.open?'#sync-pairing-error':'#settings-error'),save=$('#save-settings');
 error.textContent='';
 save.disabled=true;savingConnection=true;save.textContent='正在保存…';
 pairingConfirm.disabled=pairingClose.disabled=true;
 try{
  let passkeyOptions,pairingCode;
  const apiKey=scope==='connection'?(importedKey||$('#api-key').value):'';
  if(scope==='connection'){
   if(!settings.model||!originOf(settings.endpoint))throw Error('填写有效的 HTTPS API 地址和模型。');
   const sync=settings.credentialStorage==='sync';
   if(sync&&remote&&apiKey&&remote.id!==data.settings.credentialRevision){
    throw Error('恢复已同步的连接后再更新。');
   }
   if(sync&&remote&&originOf(remote.settings.endpoint)!==originOf(settings.endpoint)){
    throw Error('这份同步连接属于另一个 API 地址。这个地址可先保存在此设备。');
   }
   if(sync&&!remote&&!apiKey&&!savedForDraft())throw Error('先填写或导入 API Key。');
   await authorizeEndpoint(settings.endpoint);
   if(sync&&pair)pairingCode=generatePairingCode();
   else if(sync&&(!remote||upgrade)){
    if(preview)throw Error('请在 Chrome 中验证通行密钥。');
    passkeyOptions=await createSyncPasskey();
   }
  }
  await rpc('saveSettings',{scope,settings,rememberConsent:scope==='connection'&&settings.rememberKey,
   verify:true,apiKey,syncId:remote?.id,...passkeyOptions,...(pairingCode&&{pairingCode})});
  if(pairingCode)showPairingCode(pairingCode);
  if(scope==='connection'){clearKeyDraft();connectionDirty=false;}
  await refresh();
  if(scope==='connection')fillSettings();
  else status('调用设置已保存。');
 }catch(cause){error.textContent=cause.message;}
 finally{
  savingConnection=false;save.disabled=false;
  pairingConfirm.disabled=pairingClose.disabled=false;
  updateSaveLabel();updateCredentialUI();
 }
}
$('#sync-unlock').addEventListener('keydown',event=>{
 if(event.key==='Enter'){event.preventDefault();$('#unlock-sync').click();}
});
$('#unlock-sync').addEventListener('click',async()=>{
 const remote=data.syncConnection,input=$('#sync-unlock'),control=$('#unlock-sync');
 if(!remote||unlockingSync)return;
 if(!remote.passkey&&!input.value){input.focus();return;}
 unlockingSync=true;control.disabled=true;control.textContent='正在恢复…';$('#sync-error').textContent='';
 try{
  await authorizeEndpoint(remote.settings.endpoint);
  const passkeyKey=remote.passkey?await recoverSyncPasskey(remote.passkey):undefined;
  await rpc('unlockSync',{syncId:remote.id,syncPassphrase:input.value,passkeyKey});
  input.value='';clearKeyDraft();connectionDirty=false;
  await refresh();fillSettings();
 }catch(error){$('#sync-error').textContent=error.message;}
 finally{unlockingSync=false;updateCredentialUI();}
});
$('#api-key').addEventListener('input',()=>{importedKey='';connectionDirty=true;updateCredentialUI();});
let editedOrigin='';
$('#endpoint').addEventListener('focus',()=>{editedOrigin=originOf(currentEndpoint());});
$('#endpoint').addEventListener('input',()=>{
 const next=originOf(currentEndpoint());
 if(editedOrigin!==next)clearKeyDraft();
 editedOrigin=next;connectionDirty=true;updateCredentialUI();
});
$('#model').addEventListener('input',()=>{connectionDirty=true;updateCredentialUI();});
$('#forget-key').addEventListener('click',()=>task(async()=>{
 if(credentialStorage(data.settings)==='sync'&&!window.confirm('从 Chrome 同步中移除密钥？已连接的设备随后会断开。'))return;
 await rpc('forgetKey');
 importedKey='';$('#api-key').value='';$('#key-state').textContent='';
 await refresh();fillSettings();
}));
$('#key-file').addEventListener('change',()=>task(async()=>{
 const input=$('#key-file'),file=input.files?.[0];
 try{
  if(!file||preview)return;
  if(file.size>32768)throw Error('请选择小于 32 KB 的配置文件。');
  const text=await file.text(),match=text.match(/^\s*(?:export\s+)?OPENAI_API_KEY\s*=\s*(?:"([^"\r\n]+)"|'([^'\r\n]+)'|([^#\s\r\n]+))\s*(?:#.*)?$/m),key=match?.[1]||match?.[2]||match?.[3];
  if(!key||key.length>512)throw Error('文件中找不到有效的 OPENAI_API_KEY。');
  importedKey=key;$('#api-key').value='';$('#key-state').textContent='密钥已导入，保存后连接。';
  connectionDirty=true;
 }finally{input.value='';}
}));
$('#native-enabled').addEventListener('change',()=>task(async()=>{
 try{await rpc('saveNative',{enabled:$('#native-enabled').checked});await refresh();status('原生提醒设置已保存。');}
 catch(error){$('#native-enabled').checked=data.settings.nativeEnabled;await checkHelper();throw error;}
}));
$('#hide-native').addEventListener('click',()=>task(async()=>{await rpc('nativeHide');status('已请求隐藏原生提醒。');}));
$('#analyze-dialog').addEventListener('close',()=>{
 if($('#analyze-dialog').returnValue==='send')task(async()=>{
  const tabId=targetId,evidence=targetEvidence,expectedConnection=targetConnection,autoReview=$('#auto-review').checked;
  if(analyzingTabs.has(tabId))return;analyzingTabs.add(tabId);render();status('正在分析页面…');
  try{const result=await rpc('analyze',{tabId,autoReview,expectedConnection,expectedHash:await fingerprint(evidence)});status(result.skipped||(result.uncertain?'判断仍不确定，已保留页面供你确认。':'分析完成，建议已更新。'));}
  finally{analyzingTabs.delete(tabId);await refresh();}
 });
});
$('#organize').addEventListener('click',()=>task(async()=>{
 organization=await rpc('organizationPlan',{windowId:currentWindowId});$('#organization-plan').replaceChildren();
 if(!organization.groups.length){const p=document.createElement('p');p.className='hint';p.textContent='当前窗口没有需要合并的同站标签。';$('#organization-plan').append(p);}
 for(const group of organization.groups){const row=document.createElement('div');row.className='plan-row';const name=document.createElement('bdi');name.textContent=group.title;const count=document.createElement('span');count.textContent=group.tabIds.length+' 个标签';row.append(name,count);$('#organization-plan').append(row);}
 $('#apply-organization').disabled=!organization.groups.length;$('#organize-dialog').returnValue='';$('#organize-dialog').showModal();
}));
$('#organize-dialog').addEventListener('close',()=>{if($('#organize-dialog').returnValue==='apply')task(async()=>{const result=await rpc('organize',{plan:organization});await refresh();status('已整理为 '+result.groups+' 个网站分组。');});});
$('#switcher-enabled').addEventListener('change',()=>{
 const control=$('#switcher-enabled');
 switcherDirty=true;control.disabled=true;$('#switcher-error').textContent='';
 say($('#switcher-status'),'正在应用…');
 void (async()=>{
  try{await rpc('saveSwitcher',{enabled:control.checked});}
  catch(error){$('#switcher-error').textContent=error.message;await checkHelper();}
  finally{switcherDirty=false;control.disabled=false;await refresh();}
 })().catch(error=>{$('#switcher-error').textContent=error.message;});
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
 if(state==='helper-missing')demo.nativeSetup='missing';
 if(state==='helper-permission')demo.nativeSetup='accessibility_required';
 if(state==='sync-recovery')demo.syncConnection={id:'preview',settings:{...DEFAULTS},passkey:{credentialId:'preview'}};
 if(state?.startsWith('backlog-')){demo.keyPresent=true;demo.analysisQueue={phase:state.slice(8),total:18,completed:7,analyzed:5,cached:2,skipped:0,failed:0,currentTitle:'Chrome 扩展开发文档',reason:state==='backlog-paused'?'已暂停，可随时继续。':''};}
 if(state==='keychain-locked'){demo.settings.rememberKey=true;demo.credentialStatus={phase:'unlock_required',reason:'macOS 需要确认钥匙串访问。选择“解锁并恢复连接”，在系统对话框允许 Diao；无需重新导入密钥。'};}
 if(state==='keychain-ready'){demo.settings.rememberKey=true;demo.keyPresent=true;demo.credentialSaved=true;demo.credentialStatus={phase:'ready'};}
 if(state==='error')status('API 额度或速率受限；在设置中检查账户余额，冷却后重试。',true);
}else{
 try{currentWindowId=(await chrome.windows.getCurrent()).id;}catch{}
 chrome.runtime.onMessage.addListener(m=>{if(m.type==='updated')refresh().catch(()=>{});});
}
try{
 await refresh();void checkHelper();const state=new URLSearchParams(location.search).get('state');
 if(state==='settings'||state==='sync-recovery'||state?.startsWith('keychain-')||new URLSearchParams(location.search).get('view')==='connection')openView('settings');
 if(state==='helper-missing'||state==='helper-permission')openHelperSettings();
 if(state==='loading'){$('#tabs').setAttribute('aria-busy','true');$('#tabs').textContent='正在读取标签列表…';}
}catch(error){status(error.message+' 可选择刷新重试。',true);}
setInterval(heartbeat,1000);
document.addEventListener('visibilitychange',()=>{
 void heartbeat();
 if(document.visibilityState==='visible'&&view==='settings'&&preferences==='native')void checkHelper(true);
});
window.addEventListener('focus',()=>{if(view==='settings'&&preferences==='native')void checkHelper(true);});
await heartbeat();

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

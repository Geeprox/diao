import {safeURL,privateURL} from './policy.mjs';

export function trackableTab(tab) {
 if (tab.incognito || !safeURL(tab.url)) return false;
 const {hostname,pathname} = new URL(tab.url);
 return hostname !== 'chromewebstore.google.com' &&
  !(hostname === 'chrome.google.com' && pathname.startsWith('/webstore'));
}

export function backlogExclusion(tab) {
 if (tab.incognito) return '隐身页面';
 if (!trackableTab(tab)) return 'Chrome 不允许读取此页面';
 if (privateURL(tab.url)) return '本地或内网页面';
 return '';
}

export function backlogWaiting(tab) {
 return tab.discarded || tab.status === 'loading';
}

export function backlogPlan(tabs,windowId=null) {
 const targets=[],skipped=[],sites=new Map();
 for(const tab of tabs) {
  if(tab.incognito || windowId!==null&&tab.windowId!==windowId)continue;
  const reason=backlogExclusion(tab);
  if(reason) {
   skipped.push({tabId:tab.id,mode:trackableTab(tab)?'local':'unavailable',reason});
   continue;
  }
  const origin=new URL(tab.url).origin, waiting=Boolean(backlogWaiting(tab));
  targets.push({tabId:tab.id,windowId:tab.windowId,url:tab.url,origin,
   title:String(tab.title||'无标题网页').slice(0,160),waiting});
  const site=sites.get(origin)||{origin,count:0,waiting:0};
  site.count++;
  if(waiting)site.waiting++;
  sites.set(origin,site);
 }
 return {targets,skipped,sites:[...sites.values()],windowId,
  waiting:targets.filter(target=>target.waiting).length,
  local:skipped.filter(tab=>tab.mode==='local').length,
  unavailable:skipped.filter(tab=>tab.mode==='unavailable').length};
}

function settlePhase(queue) {
 if(queue.phase!=='running'||queue.jobs.some(job=>job.status==='pending'||job.status==='inflight'))return;
 const waiting=queue.jobs.some(job=>job.status==='waiting');
 queue.phase=waiting?'waiting':'complete';
 queue.reason=waiting?'网页载入后会继续检查。':'';
}

export function queueSummary(queue){
 if(!queue)return {phase:'idle',total:0,completed:0,analyzed:0,cached:0,skipped:0,failed:0,waiting:0};
 const count=status=>queue.jobs.filter(j=>j.status===status).length;
 const analyzed=count('analyzed'),cached=count('cached'),skipped=count('skipped'),failed=count('failed');
 return {id:queue.id,phase:queue.phase,total:queue.jobs.length,completed:analyzed+cached+skipped+failed,
  analyzed,cached,skipped,failed,waiting:count('waiting'),
  currentTitle:queue.jobs.find(j=>j.status==='inflight')?.title||'',
  reason:queue.reason||'',blockedBy:queue.blockedBy||'',nextAt:queue.nextAt||0,excluded:queue.excluded||0};
}
export class BacklogQueue {
 constructor({storage,mutate,process,emit=()=>{},schedule=()=>{},now=()=>Date.now()}){Object.assign(this,{storage,mutate,process,emit,schedule,now});this.busy=false;}
 async read(){return (await this.storage.get('analysisQueue')).analysisQueue||null;}
 async write(queue){await this.storage.set({analysisQueue:queue});this.emit();this.schedule(queue);return queue;}
 async recover(){return this.mutate(async()=>{
  const q=await this.read();if(!q)return null;
  // 服务工作线程中断后，不重发结果未知的请求，避免重复计费。
  for(const job of q.jobs){
   if(job.status==='inflight'){job.status='failed';job.reason='上次请求结果不明，未自动重发。';}
   if(job.status==='waiting'&&q.phase==='waiting')job.status='pending';
  }
  if(q.phase==='waiting'){q.phase='running';q.nextAt=this.now();}
  settlePhase(q);
  return this.write(q);
 });}
 async start(plan,origins,connectionKey,autoReview=false){return this.mutate(async()=>{
  const existing=await this.read();
  if(existing&&['running','waiting','paused','blocked'].includes(existing.phase)&&existing.blockedBy!=='configuration'){
   throw Error('本轮仍有待处理网页，请先继续或结束本轮。');
  }
  const selected=new Set(origins),jobs=plan.targets.filter(t=>selected.has(t.origin)).sort((a,b)=>Number(a.waiting)-Number(b.waiting)).map(t=>({...t,status:'pending'}));
  if(!jobs.length)throw Error('没有可分析的页面，选择至少一个网站后重试。');
  const q={id:crypto.randomUUID(),phase:'running',connectionKey,autoReview,origins:[...selected],jobs,excluded:plan.skipped.length,createdAt:this.now(),nextAt:this.now(),reason:'',blockedBy:''};
  return this.write(q);
 });}
 async dismiss(){return this.mutate(async()=>{
  const queue=await this.read();
  if(queue?.phase!=='complete'||queue.jobs.some(job=>job.status==='inflight'))return;
  await this.storage.remove('analysisQueue');
  this.emit();
  this.schedule(null);
 });}
 async stop(){return this.mutate(async()=>{
  const queue=await this.read();
  if(!queue||queue.phase==='complete')return queue;
  for(const job of queue.jobs)if(['pending','waiting'].includes(job.status))job.status='skipped';
  queue.phase='complete';queue.reason='本轮已结束。';
  return this.write(queue);
 });}
 async pause(){return this.mutate(async()=>{const q=await this.read();if(!q)return null;q.phase='paused';q.reason=q.jobs.some(j=>j.status==='inflight')?'当前页完成后暂停，不再发起下一页。':'已暂停，可随时继续。';return this.write(q);});}
 async resume(){return this.mutate(async()=>{const q=await this.read();if(!q)return null;q.phase='running';q.reason='';q.blockedBy='';q.nextAt=this.now();
  for(const job of q.jobs)if(job.status==='waiting')job.status='pending';
  return this.write(q);
 });}
 async wake(tabId) {return this.mutate(async()=>{
  const q=await this.read(),job=q?.jobs.find(item=>item.tabId===tabId);
  if(!job||!['waiting','inflight'].includes(job.status))return q;
  if(job.status==='inflight')job.recheck=true;
  else job.status='pending';
  if(q.phase==='waiting'){
   q.phase='running';q.reason='';q.nextAt=this.now();
  }
  return this.write(q);
 });}
 async credentialReady(){return this.mutate(async()=>{const q=await this.read();if(q?.phase!=='blocked'||q.blockedBy!=='credentials')return q;q.phase='running';q.reason='';q.blockedBy='';q.nextAt=this.now();return this.write(q);});}
 async tick(){
  if(this.busy)return;this.busy=true;
  let chosen;
  try{
   chosen=await this.mutate(async()=>{
    const q=await this.read();if(!q)return null;
    if(q.phase==='blocked'&&q.blockedBy==='backoff'&&this.now()>=q.nextAt){q.phase='running';q.blockedBy='';q.reason='';}
    if(q.phase!=='running'||q.nextAt>this.now()){this.schedule(q);return null;}
    const job=q.jobs.find(j=>j.status==='pending');
    if(!job){settlePhase(q);await this.write(q);return null;}
    job.status='inflight';await this.write(q);return {queue:q,job:{...job}};
   });
   if(!chosen)return;
   let result;
   try{
    result=await this.process(chosen.job,chosen.queue,async()=>{const current=await this.read();return current?.id===chosen.queue.id&&current.phase==='running';});
   }catch(error){
    result={kind:'failed',reason:error.message||'分析未完成，未自动重发。',pause:true,blockedBy:error.status===429?'backoff':'request',nextAt:error.status===429?error.retryAt||this.now()+300000:0};
   }
   await this.mutate(async()=>{
    const q=await this.read();if(q?.id!==chosen.queue.id)return;
    const job=q.jobs.find(j=>j.tabId===chosen.job.tabId&&j.url===chosen.job.url);if(!job||job.status!=='inflight')return;
    job.status=['blocked','deferred'].includes(result.kind)||result.kind==='waiting'&&job.recheck?'pending':result.kind;
    delete job.recheck;
    job.reason=result.reason||'';
    if(result.kind==='blocked'&&q.phase==='running'){q.phase='blocked';q.blockedBy=result.blockedBy||'credentials';q.reason=result.reason;q.nextAt=result.nextAt||0;}
    else if(result.pause&&q.phase==='running'){q.phase='blocked';q.blockedBy=result.blockedBy;q.reason=result.reason;q.nextAt=result.nextAt||0;}
    else{q.nextAt=this.now()+3000;}
    settlePhase(q);
    await this.write(q);
   });
  }finally{this.busy=false;}
 }
}

import {safeURL,privateURL} from './policy.mjs';

export function backlogExclusion(tab){
 if(tab.incognito)return '隐身页面';
 if(!safeURL(tab.url))return '浏览器或不支持的页面';
 if(privateURL(tab.url))return '本地或内网页面';
 if(tab.discarded)return '休眠页面';
 if(tab.pinned)return '固定页面';
 if(tab.audible)return '正在播放声音';
 if(tab.active)return '正在使用';
 if(tab.lastAccessed&&Date.now()-tab.lastAccessed<60000)return '最近使用';
 if(tab.status==='loading')return '正在加载';
 return '';
}
export function backlogPlan(tabs,windowId=null){
 const targets=[],skipped=[];
 for(const tab of tabs){
  if(windowId!==null&&tab.windowId!==windowId)continue;
  const reason=backlogExclusion(tab);
  if(reason){skipped.push({tabId:tab.id,reason});continue;}
  targets.push({tabId:tab.id,windowId:tab.windowId,url:tab.url,origin:new URL(tab.url).origin,title:String(tab.title||'无标题页面').slice(0,160)});
 }
 const sites=new Map();for(const target of targets)sites.set(target.origin,(sites.get(target.origin)||0)+1);
 return {targets,skipped,sites:[...sites].map(([origin,count])=>({origin,count})),windowId};
}
export function queueSummary(queue){
 if(!queue)return {phase:'idle',total:0,completed:0,analyzed:0,cached:0,skipped:0,failed:0};
 const count=status=>queue.jobs.filter(j=>j.status===status).length;
 const analyzed=count('analyzed'),cached=count('cached'),skipped=count('skipped'),failed=count('failed');
 return {id:queue.id,phase:queue.phase,total:queue.jobs.length,completed:analyzed+cached+skipped+failed,analyzed,cached,skipped,failed,currentTitle:queue.jobs.find(j=>j.status==='inflight')?.title||'',reason:queue.reason||'',blockedBy:queue.blockedBy||'',nextAt:queue.nextAt||0,excluded:queue.excluded||0};
}
export class BacklogQueue {
 constructor({storage,mutate,process,emit=()=>{},schedule=()=>{},now=()=>Date.now()}){Object.assign(this,{storage,mutate,process,emit,schedule,now});this.busy=false;}
 async read(){return (await this.storage.get('analysisQueue')).analysisQueue||null;}
 async write(queue){await this.storage.set({analysisQueue:queue});this.emit();this.schedule(queue);return queue;}
 async recover(){return this.mutate(async()=>{
  const q=await this.read();if(!q)return null;
  // 服务工作线程中断后，不重发结果未知的请求，避免重复计费。
  for(const job of q.jobs)if(job.status==='inflight'){job.status='failed';job.reason='上次请求结果不明，未自动重发。';}
  return this.write(q);
 });}
 async start(plan,origins,connectionKey,autoReview=false){return this.mutate(async()=>{
  const selected=new Set(origins),jobs=plan.targets.filter(t=>selected.has(t.origin)).map(t=>({...t,status:'pending'}));
  if(!jobs.length)throw Error('没有可分析的页面，选择至少一个网站后重试。');
  const q={id:crypto.randomUUID(),phase:'running',connectionKey,autoReview,origins:[...selected],jobs,excluded:plan.skipped.length,createdAt:this.now(),nextAt:this.now(),reason:'',blockedBy:''};
  return this.write(q);
 });}
 async pause(){return this.mutate(async()=>{const q=await this.read();if(!q)return null;q.phase='paused';q.reason=q.jobs.some(j=>j.status==='inflight')?'当前页完成后暂停，不再发起下一页。':'已暂停，可随时继续。';return this.write(q);});}
 async resume(){return this.mutate(async()=>{const q=await this.read();if(!q)return null;q.phase='running';q.reason='';q.blockedBy='';q.nextAt=this.now();return this.write(q);});}
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
    if(!job){q.phase='complete';q.reason='本轮分析完成。建议不会自动关闭页面。';await this.write(q);return null;}
    job.status='inflight';await this.write(q);return {queue:q,job:{...job}};
   });
   if(!chosen)return;
   let result;
   try{
    result=await this.process(chosen.job,chosen.queue,async()=>{const current=await this.read();return current?.id===chosen.queue.id&&current.phase==='running';});
   }catch(error){
    result={kind:'failed',reason:error.message||'分析未完成，未自动重发。',pause:true,blockedBy:error.status===429?'backoff':'request',nextAt:error.status===429?this.now()+300000:0};
   }
   await this.mutate(async()=>{
    const q=await this.read();if(q?.id!==chosen.queue.id)return;
    const job=q.jobs.find(j=>j.tabId===chosen.job.tabId&&j.url===chosen.job.url);if(!job||job.status!=='inflight')return;
    job.status=['blocked','deferred'].includes(result.kind)?'pending':result.kind;job.reason=result.reason||'';
    if(result.kind==='blocked'&&q.phase==='running'){q.phase='blocked';q.blockedBy=result.blockedBy||'credentials';q.reason=result.reason;q.nextAt=result.nextAt||0;}
    else if(result.pause&&q.phase==='running'){q.phase='blocked';q.blockedBy=result.blockedBy;q.reason=result.reason;q.nextAt=result.nextAt||0;}
    else{q.nextAt=this.now()+3000;}
    if(q.phase==='running'&&!q.jobs.some(j=>j.status==='pending')){q.phase='complete';q.reason='本轮分析完成。建议不会自动关闭页面。';}
    await this.write(q);
   });
  }finally{this.busy=false;}
 }
}

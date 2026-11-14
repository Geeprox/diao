import test from 'node:test';
import assert from 'node:assert/strict';
import {BacklogQueue,backlogPlan,queueSummary} from '../extension/core/backlog.mjs';
const tabs=()=>[1,2,3].map(id=>({id,windowId:1,url:'https://example.com/'+id,title:'Page '+id,active:false}));
function setup(process){let data={},serial=Promise.resolve(),now=1000,scheduled=[];const storage={async get(){return structuredClone(data);},async set(value){Object.assign(data,structuredClone(value));}};const mutate=fn=>{const task=serial.then(fn,fn);serial=task.catch(()=>{});return task;};const q=new BacklogQueue({storage,mutate,process,schedule:value=>scheduled.push(structuredClone(value)),now:()=>now});return {q,storage,scheduled,advance:()=>now+=3000,plan:backlogPlan(tabs())};}
test('backlog plan excludes private, internal, active, pinned, audible and discarded pages',()=>{
 const sample=tabs();for(const extra of [{incognito:true},{url:'chrome://settings'},{url:'http://127.0.0.1/x'},{active:true},{pinned:true},{audible:true},{discarded:true}])sample.push({...tabs()[0],id:sample.length+1,...extra});const p=backlogPlan(sample);assert.equal(p.targets.length,3);assert.equal(p.skipped.length,7);assert.deepEqual(p.sites,[{origin:'https://example.com',count:3}]);assert.equal(backlogPlan(sample,99).targets.length,0);
});
test('backlog is single-flight, proceeds page by page and never closes a tab',async()=>{
 let count=0,release;const f=setup(async()=>{count++;if(count===1)await new Promise(r=>release=r);return {kind:'analyzed'};});await f.q.start(f.plan,['https://example.com'],'connection');const running=f.q.tick();for(let i=0;i<20&&!release;i++)await new Promise(r=>setImmediate(r));await f.q.tick();assert.equal(count,1);release();await running;f.advance();await f.q.tick();f.advance();await f.q.tick();const q=await f.q.read();assert.equal(q.phase,'complete');assert.equal(queueSummary(q).analyzed,3);
});
test('pause remains responsive during a request and finishing it cannot undo the pause',async()=>{
 let release;const f=setup(async()=>{await new Promise(r=>release=r);return {kind:'analyzed'};});await f.q.start(f.plan,['https://example.com'],'connection');const running=f.q.tick();for(let i=0;i<20&&!release;i++)await new Promise(r=>setImmediate(r));await f.q.pause();release();await running;assert.equal((await f.q.read()).phase,'paused');assert.equal(queueSummary(await f.q.read()).completed,1);
});
test('recovery never automatically replays an in-flight API request with unknown result',async()=>{
 const seen=[];const f=setup(async job=>{seen.push(job.tabId);return {kind:'cached'};});await f.q.start(f.plan,['https://example.com'],'connection');let q=await f.q.read();q.jobs[0].status='inflight';await f.storage.set({analysisQueue:q});await f.q.recover();await f.q.tick();assert.deepEqual(seen,[2]);q=await f.q.read();assert.equal(q.jobs[0].status,'failed');assert.equal(queueSummary(q).cached,1);
});
test('missing credentials block without consuming the page, then recovery resumes automatically',async()=>{
 let available=false,calls=0;const f=setup(async()=>{calls++;return available?{kind:'analyzed'}:{kind:'blocked',blockedBy:'credentials',reason:'先解锁连接'};});await f.q.start(f.plan,['https://example.com'],'connection');await f.q.tick();assert.equal((await f.q.read()).phase,'blocked');assert.equal((await f.q.read()).jobs[0].status,'pending');available=true;await f.q.credentialReady();await f.q.tick();assert.equal(queueSummary(await f.q.read()).analyzed,1);assert.equal(calls,2);
});
test('a failed request pauses and resuming moves on without replaying the failed page',async()=>{
 const seen=[];const f=setup(async job=>{seen.push(job.tabId);if(job.tabId===1)throw Error('Network failure');return {kind:'analyzed'};});await f.q.start(f.plan,['https://example.com'],'connection');await f.q.tick();assert.equal((await f.q.read()).phase,'blocked');await f.q.resume();await f.q.tick();assert.deepEqual(seen,[1,2]);
});
test('manual pause cannot be undone by credential recovery',async()=>{
 const f=setup(async()=>({kind:'analyzed'}));await f.q.start(f.plan,['https://example.com'],'connection');await f.q.pause();await f.q.credentialReady();assert.equal((await f.q.read()).phase,'paused');
});

test('automatic analysis also excludes link-local, private IPv6 and single-label intranet hosts',()=>{
 for(const url of ['http://169.254.1.2/status','http://100.64.0.1/','http://[fd00::1]/','http://[fe80::1]/','http://[::ffff:127.0.0.1]/','http://printer/','https://service.home.arpa/'])assert.equal(backlogPlan([{id:1,windowId:1,url}]).targets.length,0,url);
});

test('recently used tabs stay local instead of being analyzed immediately',()=>{
 assert.equal(backlogPlan([{...tabs()[0],lastAccessed:Date.now()-1000}]).targets.length,0);assert.equal(backlogPlan([{...tabs()[0],lastAccessed:Date.now()-120000}]).targets.length,1);
});
test('provider backoff waits and never replays the rate-limited page',async()=>{
 const seen=[];const f=setup(async job=>{seen.push(job.tabId);if(job.tabId===1)throw Object.assign(Error('Rate limited'),{status:429});return {kind:'analyzed'};});await f.q.start(f.plan,['https://example.com'],'connection');await f.q.tick();assert.equal((await f.q.read()).blockedBy,'backoff');await f.q.tick();assert.deepEqual(seen,[1]);for(let n=0;n<100;n++)f.advance();await f.q.tick();assert.deepEqual(seen,[1,2]);
});

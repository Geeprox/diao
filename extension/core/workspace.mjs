import {safeURL} from './policy.mjs';

// A query or fragment may identify different work. Only exact URLs count as duplicates.
export function duplicates(tabs) {
  const byURL=new Map(), result={};
  for(const tab of tabs) {
    if(tab.incognito||!safeURL(tab.url))continue;
    const key=tab.windowId+' '+new URL(tab.url).href;
    if(!byURL.has(key))byURL.set(key,[]);
    byURL.get(key).push(tab);
  }
  for(const list of byURL.values())if(list.length>1) {
    const ordered=[...list].sort((a,b)=>Number(!!(b.active||b.pinned))-Number(!!(a.active||a.pinned))||(b.lastAccessed||0)-(a.lastAccessed||0)||a.index-b.index);
    for(const tab of list)result[tab.id]={count:list.length,keeperId:ordered[0].id,extra:tab.id!==ordered[0].id};
  }
  return result;
}
export function identity(tabs) {
  return JSON.stringify([...tabs].sort((a,b)=>a.id-b.id).map(t=>[t.id,t.windowId,t.url,t.index,t.groupId??-1,!!t.pinned]));
}
export function organizationPlan(tabs,windowId) {
  const source=tabs.filter(t=>t.windowId===windowId&&!t.incognito).sort((a,b)=>a.index-b.index);
  const eligible=source.filter(t=>!t.pinned&&(t.groupId??-1)<0&&safeURL(t.url));
  const sites=new Map();
  for(const tab of eligible) {
    const name=new URL(tab.url).hostname;
    if(!sites.has(name))sites.set(name,[]);
    sites.get(name).push(tab.id);
  }
  const groups=[...sites].filter(([,ids])=>ids.length>1).map(([title,tabIds])=>({title,tabIds})).sort((a,b)=>a.title.localeCompare(b.title));
  return {windowId,identity:identity(source),groups,tabCount:groups.reduce((n,g)=>n+g.tabIds.length,0)};
}
export function attentionOrder(tabs,records={}) {
  const rank={resume:0,closing:1,paused:1,waiting:2,suggested:3,keep:4};
  return [...tabs].sort((a,b)=>(rank[records[a.id]?.state]??4)-(rank[records[b.id]?.state]??4)||(b.lastAccessed||0)-(a.lastAccessed||0)||a.index-b.index);
}
export function scheduledCandidate(tabs,records,now=Date.now()) {
  return tabs.filter(t=>{
    const r=records[t.id];
    return r?.autoReview===true&&r.url===t.url&&!t.active&&!t.pinned&&!t.audible&&!t.discarded&&!t.incognito&&safeURL(t.url)
      &&now-(r.lastInteraction||t.lastAccessed||now)>=10*60000
      &&now-(r.attemptAt||0)>=10*60000&&!['closing','paused'].includes(r.state);
  }).sort((a,b)=>(records[a.id].attemptAt||0)-(records[b.id].attemptAt||0))[0]||null;
}

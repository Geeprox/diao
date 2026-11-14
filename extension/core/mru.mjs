// Only live tab IDs are remembered. A held-Control gesture freezes its own order.
export class RecentTabs {
  constructor(order=[]){this.order=[...new Set(order.filter(Number.isInteger))];this.tabs=new Map();this.gesture=null;}
  reconcile(tabs){
    const live=tabs.filter(t=>Number.isInteger(t.id)&&!t.incognito);
    this.tabs=new Map(live.map(t=>[t.id,t]));this.order=this.order.filter(id=>this.tabs.has(id));
    const known=new Set(this.order);
    for(const t of [...live].sort((a,b)=>(b.lastAccessed||0)-(a.lastAccessed||0)||(a.index||0)-(b.index||0)))if(!known.has(t.id)){this.order.push(t.id);known.add(t.id);}
    if(this.gesture){const g=this.gesture;g.ids=g.ids.filter(id=>this.tabs.get(id)?.windowId===g.windowId);if(!g.ids.length)this.gesture=null;}
  }
  touch(id){if(this.tabs.has(id))this.order=[id,...this.order.filter(x=>x!==id)];}
  step({gesture,windowId,direction,activeId}){
    if(!Number.isSafeInteger(gesture)||gesture<1||![1,-1].includes(direction))return null;
    if(this.tabs.get(activeId)?.windowId!==windowId)return null;
    if(!this.gesture||this.gesture.token!==gesture){
      const ids=[activeId,...this.order.filter(id=>id!==activeId&&this.tabs.get(id)?.windowId===windowId)];
      if(ids.length<2)return null;
      this.gesture={token:gesture,windowId,origin:activeId,ids,selected:activeId};
    }
    const g=this.gesture;if(g.windowId!==windowId||g.ids.length<2)return null;
    let index=g.ids.indexOf(g.selected);if(index<0)index=g.ids.indexOf(activeId);if(index<0)index=0;
    g.selected=g.ids[(index+direction+g.ids.length)%g.ids.length];return g.selected;
  }
  finish(token,{cancel=false}={}){
    const g=this.gesture;if(!g||g.token!==token)return null;this.gesture=null;
    const selected=cancel&&this.tabs.get(g.origin)?.windowId===g.windowId?g.origin:g.selected;
    if(!cancel)this.touch(selected);return selected;
  }
  view(){const g=this.gesture;if(!g)return null;const index=g.ids.indexOf(g.selected),start=Math.max(0,Math.min(index-4,g.ids.length-9));return{gesture:g.token,selectedId:g.selected,index:index+1,total:g.ids.length,items:g.ids.slice(start,start+9).map(id=>this.tabs.get(id)).filter(Boolean)};}
}

import {RecentTabs} from './mru.mjs';
export class MRUController {
  constructor({chrome,getPort,emit=()=>{}}){
    this.chrome=chrome;this.getPort=getPort;this.emit=emit;this.model=new RecentTabs();this.enabled=false;this.port=null;this.ackTimer=null;this.queue=Promise.resolve();this.expected=new Map();this.icons=new Map();
    const on=(event,fn)=>event?.addListener((...args)=>{if(!this.enabled)return;this.enqueue(()=>fn(...args)).catch(()=>{});});
    on(chrome.tabs.onActivated,async({tabId})=>{const anticipated=this.expected.get(tabId);this.expected.delete(tabId);if(anticipated>Date.now()){await this.sync();return;}await this.readTabs();if(this.model.gesture)this.model.finish(this.model.gesture.token);this.model.touch(tabId);await this.persist();await this.sync();});
    on(chrome.tabs.onRemoved,()=>this.sync());on(chrome.tabs.onCreated,()=>this.sync());on(chrome.tabs.onAttached,()=>this.sync());on(chrome.tabs.onDetached,()=>this.sync());
    on(chrome.windows.onFocusChanged,async()=>{if(this.model.gesture){this.model.finish(this.model.gesture.token);await this.persist();}await this.sync();});
    on(chrome.windows.onBoundsChanged,()=>this.sync());
  }
  enqueue(fn){const task=this.queue.then(fn,fn);this.queue=task.catch(()=>{});return task;}
  async start(){const {mruOrder=[]}=await this.chrome.storage.session.get('mruOrder');this.model=new RecentTabs(mruOrder);const {settings}=await this.chrome.storage.local.get('settings');return this.configure(!!settings?.switcherEnabled);}
  async report(status,reason){await this.chrome.storage.session.set({switcherStatus:{status,reason}});this.emit();}
  async readTabs(){for(const [id,until] of this.expected)if(until<Date.now())this.expected.delete(id);this.model.reconcile(await this.chrome.tabs.query({}));}
  async persist(){await this.chrome.storage.session.set({mruOrder:this.model.order});}
  async configure(enabled){this.enabled=!!enabled;clearTimeout(this.ackTimer);return this.enqueue(async()=>{if(!this.enabled){this.model.gesture=null;this.port?.postMessage({type:'mruConfigure',enabled:false});await this.report('disabled','尚未启用。');return;}await this.report('connecting','正在连接辅助程序…');await this.sync();this.ackTimer=setTimeout(()=>this.report('unavailable','辅助程序版本过旧或未响应；更新辅助程序并重新加载扩展后重试。').catch(()=>{}),2500);});}
  async sync(){
    if(!this.enabled)return;
    await this.readTabs();const w=await this.chrome.windows.getLastFocused();const tabs=[...this.model.tabs.values()].filter(t=>t.windowId===w.id);const active=tabs.find(t=>t.active);
    this.port=await this.getPort();
    this.port.postMessage({type:'mruConfigure',enabled:true,context:w.type==='normal'&&!w.incognito&&w.focused&&active?{windowId:w.id,activeId:active.id,count:tabs.length,window:{left:w.left,top:w.top,width:w.width,height:w.height}}:null});
  }
  disconnected(){clearTimeout(this.ackTimer);this.port=null;this.model.gesture=null;if(this.enabled)this.report('disconnected','辅助程序已断开；检查安装后，重新保存快捷切换设置。').catch(()=>{});}
  showPreview(view) {
    this.port?.postMessage({type:'mruPreview',...view,items:view.items.map(tab=>{
      const key=iconKey(tab);
      return {id:tab.id,title:String(tab.title||'无标题页面').slice(0,180),
        site:site(tab.url),kind:iconKind(tab.url),icon:key ? this.icons.get(key)?.data : undefined};
    })});
  }
  loadPreviewIcons(view) {
    const port=this.port;
    const missing=view.items.filter(tab=>{
      const key=iconKey(tab);
      return key && !this.icons.has(key);
    });
    if(!missing.length)return;
    // 首帧用系统符号。网站图标异步读取 Chrome 的本地资源。
    const requests=missing.map(tab=>{
      const key=iconKey(tab);
      if(this.icons.has(key))return this.icons.get(key).pending;
      const entry={};
      this.icons.set(key,entry);
      if(this.icons.size>128)this.icons.delete(this.icons.keys().next().value);
      entry.pending=cachedFavicon(this.chrome,tab.url).then(data=>{entry.data=data;return Boolean(data);});
      return entry.pending;
    });
    void Promise.all(requests).then(loaded=>{
      if(!loaded.some(Boolean))return;
      return this.enqueue(()=>{
        const current=this.model.view();
        if(this.enabled && this.port===port && current?.gesture===view.gesture)this.showPreview(current);
      });
    }).catch(()=>{});
  }
  receive(message){return this.enqueue(async()=>{
    if(message.type==='mruStatus'){clearTimeout(this.ackTimer);await this.report(message.status,message.reason);return;}
    if(!this.enabled||!Number.isSafeInteger(message.gesture))return;
    if(message.type==='mruStep'){
      const w=await this.chrome.windows.getLastFocused();if(!w.focused||w.type!=='normal'||w.incognito||w.id!==message.windowId){this.model.gesture=null;this.port?.postMessage({type:'mruDismiss',gesture:message.gesture});return;}
      await this.readTabs();const active=[...this.model.tabs.values()].find(t=>t.active&&t.windowId===w.id);
      const id=this.model.step({...message,activeId:active?.id});if(id==null)return;
      const target=await this.chrome.tabs.get(id).catch(()=>null);if(!this.enabled||!target||target.incognito||target.windowId!==w.id){await this.sync();return;}
      if(!target.active){this.expected.set(id,Date.now()+2000);await this.chrome.tabs.update(id,{active:true});}
      const view=this.model.view();
      if(view) {
        this.showPreview(view);
        this.loadPreviewIcons(view);
      }
    }else if(message.type==='mruEnd'){
      const g=this.model.gesture;if(!g||g.token!==message.gesture)return;
      const w=await this.chrome.windows.getLastFocused();
      const id=this.model.finish(message.gesture,{cancel:!!message.cancelled});
      if(message.cancelled&&w.focused&&w.id===g.windowId&&id!=null){const target=await this.chrome.tabs.get(id).catch(()=>null);if(target&&target.windowId===w.id&&!target.incognito&&!target.active){this.expected.set(id,Date.now()+2000);await this.chrome.tabs.update(id,{active:true});}}
      await this.persist();await this.sync();
    }
  }).catch(async()=>{this.model.gesture=null;this.port?.postMessage({type:'mruDismiss'});await this.report('unavailable','暂时无法切换；重新保存快捷切换设置后重试。');});}
}
function site(raw){try{const url=new URL(raw);return /^https?:$/.test(url.protocol) ? url.hostname.replace(/^www\./i,'').slice(0,100) : '';}catch{return '';}}
function iconKind(raw) {
  try {
    const url=new URL(raw);
    if(url.protocol==='chrome:')return ['extensions','settings','history','downloads','bookmarks'].includes(url.hostname) ? url.hostname : 'browser';
    if(url.protocol==='chrome-extension:')return 'extensions';
    if(url.protocol==='file:')return 'file';
  } catch {}
  return 'web';
}
function iconKey(tab) {
  return /^https?:\/\//i.test(tab.url||'') && tab.favIconUrl ? JSON.stringify([tab.url,tab.favIconUrl]) : '';
}
async function cachedFavicon(chrome, page) {
  try {
    const url=new URL(chrome.runtime.getURL('/_favicon/'));
    url.searchParams.set('pageUrl',page);
    url.searchParams.set('size','32');
    const response=await fetch(url,{signal:AbortSignal.timeout(1000)});
    if(!response.ok)return;
    const bytes=new Uint8Array(await response.arrayBuffer());
    if(bytes.length>3072 || bytes.length<8 || bytes[0]!==137 || bytes[1]!==80 || bytes[2]!==78 || bytes[3]!==71)return;
    return btoa(String.fromCharCode(...bytes));
  } catch {}
}

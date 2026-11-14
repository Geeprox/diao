(() => {
  if(globalThis.__tabPilotSensor)return;
  let dirty=false,lastInteraction=0,timer,adapter=null,lastSignature='',lastSent=0,revision=0;
  const visible=element=>!!(element.getClientRects().length&&getComputedStyle(element).visibility!=='hidden');
  function snapshot(includeExcerpt=true){
    const editable=[...document.querySelectorAll('input:not([type=hidden]),textarea,[contenteditable=true],iframe')].some(visible);
    let observed=null;
    if(adapter){
      const walker=document.createTreeWalker(document.querySelector('main,[role=main],article')||document.body,NodeFilter.SHOW_TEXT);
      let waiting=false,done=false,node,count=0;
      while((node=walker.nextNode())&&count++<6000){
        const parent=node.parentElement,value=node.textContent.trim();
        if(!parent||parent.closest('script,style,pre,code,textarea,[contenteditable=true]')||!visible(parent))continue;
        if(value===adapter.waiting)waiting=true;if(value===adapter.done)done=true;
      }
      observed=waiting===done?'unknown':done?'done':'waiting';
    }
    const root=document.querySelector('main,article,[role=main]')||document.body;
    return {at:Date.now(),revision,dirty,editable,lastInteraction,media:[...document.querySelectorAll('audio,video')].some(element=>!element.paused),visibility:document.visibilityState,observed,excerpt:!includeExcerpt||editable?'':(root?.innerText||'').slice(0,1600)};
  }
  function changed(){
    if(!adapter||timer)return;
    timer=setTimeout(()=>{
      timer=null;const state=snapshot(false),signature=JSON.stringify([state.observed,state.dirty,state.editable,state.media]);
      if(signature!==lastSignature){lastSignature=signature;chrome.runtime.sendMessage({type:'sensor',snapshot:state}).catch(()=>{});}
    },2000);
  }
  document.addEventListener('input',()=>{dirty=true;lastInteraction=Date.now();changed();},true);
  for(const event of ['pointerdown','keydown'])document.addEventListener(event,()=>{
    lastInteraction=Date.now();
    if(lastInteraction-lastSent>=750){lastSent=lastInteraction;chrome.runtime.sendMessage({type:'interact'}).catch(()=>{});}
  },true);
  const observer=new MutationObserver(()=>{revision++;changed();});
  observer.observe(document.documentElement,{subtree:true,childList:true,characterData:true,attributes:true});
  chrome.runtime.onMessage.addListener((message,sender,reply)=>{
    if(message.type==='selection'){
      const selection=window.getSelection(),parent=selection?.anchorNode?.parentElement;
      reply({text:parent?.closest('input,textarea,[contenteditable=true]')?'':String(selection||'').trim().slice(0,160)});
    }
    if(message.type==='snapshot')reply(snapshot());
    if(message.type==='adapter'){
      adapter=message.adapter;lastSignature='';clearTimeout(timer);timer=null;
      if(adapter)changed();
      reply({ok:true});
    }
  });
  globalThis.__tabPilotSensor={snapshot};
})();

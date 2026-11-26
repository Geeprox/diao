(() => {
  if(globalThis.__tabPilotSensor)return;
  let dirty=false,lastInteraction=0,timer,adapter=null,lastSignature='',lastSent=0,revision=0;
  let pendingDone=false, seenWaiting=false;
  const visible=element=>!!(element.getClientRects().length&&getComputedStyle(element).visibility!=='hidden');
  const stateRoot=()=>[...document.querySelectorAll('[data-thread-find-target="conversation"],[data-testid="conversation-thread"]')].find(visible)
    || [...document.querySelectorAll('main,[role=main],article')].find(visible)||document.body;
  const controls='script,style,pre,code,input,textarea,select,button,a,[contenteditable]:not([contenteditable=false]),tab-pilot-watch';
  const normalized=value=>value.trim().replace(/\s+/g,' ');
  const regionText=element=>normalized(element.innerText||'');
  const assistant='[data-message-author-role="assistant"],[data-chatgpt-search-unit-key$=":assistant"]';
  const generatedImage='[data-talvt-turn-state] [data-chatgpt-search-message-ids]:not([data-chatgpt-search-unit-key]):has([data-testid="generated-image-gallery"] [data-testid="generated-image-preview"] img)';
  const terminal='[data-state="complete"],[data-state="completed"],[data-status="completed"],[data-status="finished_successfully"],[data-talvt-turn-state="complete"]';
  function unique(selector){
    try{const found=document.querySelectorAll(selector);return found.length===1?found[0]:null;}catch{return null;}
  }
  function targetFor(element){
    const selectorFor=node=>{
      if(node.id){
        const selector='#'+CSS.escape(node.id);
        if(unique(selector)===node)return selector;
      }
      const testId=node.getAttribute('data-testid');
      const selector=testId?'[data-testid='+CSS.escape(testId)+']':'';
      return selector&&unique(selector)===node?selector:'';
    };
    const path=[];
    for(let node=element;node&&node!==document.body;node=node.parentElement){
      const stable=selectorFor(node);
      if(stable)return [stable,...path].join(' > ');
      let index=1;
      for(let sibling=node.previousElementSibling;sibling;sibling=sibling.previousElementSibling){
        if(sibling.localName===node.localName)index++;
      }
      path.unshift(CSS.escape(node.localName)+':nth-of-type('+index+')');
    }
    return ['body',...path].join(' > ');
  }
  function pickRegion(element){
    const root=stateRoot();
    if(!root||!element||element.closest(controls))return null;
    for(let node=element;node&&node!==root&&root.contains(node);node=node.parentElement){
      const text=regionText(node);
      if(!visible(node)||text.length>160||node.querySelector(controls))break;
      if(text)return {kind:'region',target:targetFor(node),baseline:text};
    }
    return null;
  }
  function findWatchRule(saved){
    if(saved?.kind==='region'){
      const picked=pickRegion(unique(saved.target));
      if(picked?.target===saved.target)return picked;
    }
    if(saved?.waiting&&saved?.done&&observe(saved)==='waiting')return saved;
    if(location.origin==='https://chatgpt.com'&&chatGenerating())return {kind:'chat'};
    const signals=[...(stateRoot()||document).querySelectorAll('[aria-busy=true]')]
      .filter(node=>visible(node)&&!node.closest(controls));
    if(signals.length===1)return {kind:'busy',target:targetFor(signals[0])};
    return null;
  }
  function recoverWatch(rule){
    if(rule.kind==='busy'){
      const match=findWatchRule();
      return match?.kind==='busy' && match.target!==rule.target ? match : null;
    }
    if(rule.kind!=='region')return null;
    // 状态节点被重新挂载时，以原来的可见文字重新定位。多个匹配时继续观察。
    const root=stateRoot();
    const matches=new Map();
    for(const element of root.querySelectorAll('p,span,div,[role=status],[aria-live]')){
      if(element.childElementCount||normalized(element.textContent||'')!==rule.baseline)continue;
      const picked=pickRegion(element);
      if(picked)matches.set(picked.target,picked);
      if(matches.size>1)return null;
    }
    return matches.values().next().value||null;
  }
  const chatComposer='[data-composer-markdown][contenteditable=true],#prompt-textarea';
  function chatGenerating(){
    const editor=[...document.querySelectorAll(chatComposer)].find(visible);
    const composer=editor?.closest('form,[data-composer-surface-variant]');
    const stop='button[data-testid="stop-button"],button[data-testid="composer-stop-button"],button[aria-label="停止"],button[aria-label="Stop generating"]';
    if([...((composer||document).querySelectorAll(stop))].some(visible))return true;
    const latest=[...stateRoot().querySelectorAll('[data-talvt-turn-state]')].filter(visible).at(-1);
    return /^(streaming|pending|running|generating)$/.test(latest?.getAttribute('data-talvt-turn-state')||'');
  }
  function observe(rule){
    if(rule.kind==='chat'){
      if(chatGenerating())return 'waiting';
      const composer=[...document.querySelectorAll(chatComposer)].find(visible);
      const answer=[...stateRoot().querySelectorAll(assistant+','+generatedImage)].filter(node=>
        visible(node)&&!node.closest('[data-user-message-bubble],[data-chatgpt-search-unit-key$=":user"]')).at(-1);
      const turn=answer?.closest('[data-turn-key],[data-testid^="conversation-turn-"]');
      for(let node=answer;node&&node!==stateRoot();node=node.parentElement){
        if(node.matches(terminal)&&composer){
          const pendingImage=[...node.querySelectorAll('[data-testid*="imagegen"] img,[data-testid*="generated-image"] img')]
            .some(image=>!image.complete || !image.naturalWidth);
          if(!pendingImage)return 'done';
        }
        if(node===turn)break;
      }
      return 'unknown';
    }
    if(rule.kind==='busy'||rule.kind==='region'){
      const node=unique(rule.target);
      if(!node||!visible(node))return 'unknown';
      if(rule.kind==='busy'){
        if(node.getAttribute('aria-busy')==='true')return 'waiting';
        return node.getAttribute('aria-busy')==='false'?'done':'unknown';
      }
      const text=regionText(node);
      if(!text||text.length>160||node.querySelector(controls))return 'unknown';
      return text===rule.baseline?'waiting':'done';
    }
    const walker=document.createTreeWalker(stateRoot(),NodeFilter.SHOW_TEXT);
    let waiting=false,done=false,node,count=0;
    while((node=walker.nextNode())&&count++<6000){
      const parent=node.parentElement,value=node.textContent.trim();
      if(!parent||parent.closest('script,style,pre,code,textarea,[contenteditable=true]')||!visible(parent))continue;
      if(value===rule.waiting)waiting=true;
      if(value===rule.done)done=true;
    }
    return waiting===done?'unknown':done?'done':'waiting';
  }
  function snapshot(includeExcerpt=true){
    // 页面搜索框和嵌入媒体不会阻止检查阅读内容。存在编辑区域时仍不提取正文。
    const editorSelector='textarea:not([readonly]),[contenteditable]:not([contenteditable=false]),input[type=password],input[type=email],input[type=tel],input:not([type]),input[type=text]';
    const editable=[...document.querySelectorAll(editorSelector)]
      .some(node=>!node.readOnly&&!node.disabled&&!node.closest('[role=search],search')&&visible(node));
    const embedded=[...document.querySelectorAll('iframe')].some(visible);
    const observed=adapter?observe(adapter):null;
    const root=[...document.querySelectorAll('main,article,[role=main]')].find(visible)||document.body;
    return {at:Date.now(),revision,dirty,editable,embedded,lastInteraction,media:[...document.querySelectorAll('audio,video')].some(element=>!element.paused),visibility:document.visibilityState,observed,excerpt:!includeExcerpt||editable?'':(root?.innerText||'').slice(0,1600)};
  }
  function changed(){
    if(!adapter||timer)return;
    timer=setTimeout(()=>{
      timer=null;const state=snapshot(false);
      const recovered=state.observed==='unknown' && recoverWatch(adapter);
      if(recovered){
        adapter=recovered;
        state.observed='waiting';
        state.recovered=recovered;
      }
      if(state.observed==='waiting')seenWaiting=true;
      if(adapter?.kind&&state.observed==='done'&&!seenWaiting)state.observed='unknown';
      if(state.observed==='done'&&adapter?.kind&&!pendingDone){
        pendingDone=true;
        changed();
        return;
      }
      pendingDone=false;
      const signature=JSON.stringify([state.observed,state.dirty,state.editable,state.media,adapter.target]);
      if(signature!==lastSignature){lastSignature=signature;chrome.runtime?.sendMessage({type:'sensor',snapshot:state}).catch(()=>{});}
    },2000);
  }
  document.addEventListener('input',()=>{dirty=true;lastInteraction=Date.now();changed();},true);
  for(const event of ['pointerdown','keydown'])document.addEventListener(event,()=>{
    lastInteraction=Date.now();
    if(lastInteraction-lastSent>=750){lastSent=lastInteraction;chrome.runtime?.sendMessage({type:'interact'}).catch(()=>{});}
  },true);
  const observer=new MutationObserver(()=>{revision++;changed();});
  observer.observe(document.documentElement,{subtree:true,childList:true,characterData:true,attributes:true});
  chrome.runtime.onMessage.addListener((message,sender,reply)=>{
    if(message.type==='selection'){
      const selection=window.getSelection(),parent=selection?.anchorNode?.parentElement;
      reply({text:parent?.closest('input,textarea,[contenteditable=true]')?'':String(selection||'').trim().slice(0,160)});
    }
    if(message.type==='watchRule')reply({adapter:findWatchRule(message.saved)});
    if(message.type==='snapshot')reply(snapshot());
    if(message.type==='watchResume'){
      const rule=message.adapter;
      const current=observe(rule);
      reply({adapter:current==='unknown'?(recoverWatch(rule)||rule):rule});
    }
    if(message.type==='adapter'){
      adapter=message.adapter;pendingDone=false;
      seenWaiting=!!adapter&&(message.wasWaiting===true||observe(adapter)==='waiting');
      lastSignature='';clearTimeout(timer);timer=null;
      if(adapter)changed();
      reply({ok:true});
    }
  });
  globalThis.__tabPilotSensor={snapshot,pickRegion};
})();

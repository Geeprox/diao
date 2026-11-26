(() => {
  if (globalThis.tabPilotWatchPrompt) return;
  globalThis.tabPilotWatchPrompt = true;
  let host;
  let endPicking;
  let toastTimer;

  const tr=globalThis.DiaoLocale?.text||(text=>text);
  function element(tag, text) {
    const node = document.createElement(tag);
    if (text) node.textContent = tr(text);
    return node;
  }

  function surface() {
    endPicking?.();
    host?.remove();
    clearTimeout(toastTimer);
    host = element('tab-pilot-watch');
    document.documentElement.append(host);
    const shadow = host.attachShadow({mode:'closed'});
    const sheet = new CSSStyleSheet();
    sheet.replaceSync(`
       :host { all:initial; font:14px/1.5 system-ui; color-scheme:light dark; color:var(--ink);
        --surface:#fff; --ink:#171717; --secondary:#5e5e5e; --line:#8b8b8b;
        --soft:#f0f0f0; --on-ink:#fff; --focus:#3c638f; --danger:#a5322a; }
      @media(prefers-color-scheme:dark) {
        :host { --surface:#262626; --ink:#f4f4f4; --secondary:#bcbcbc; --line:#808080;
          --soft:#383838; --on-ink:#171717; --focus:#aecbf2; --danger:#ffaaa4; }
      }
      @media(prefers-reduced-motion:no-preference) {
        button { transition:background-color 110ms cubic-bezier(.2,.8,.2,1) }
        dialog[open], .picker, .notice { animation:appear 165ms cubic-bezier(.2,.8,.2,1) }
        @keyframes appear { from { opacity:0; transform:translateY(-3px) } to { opacity:1; transform:none } }
      }
      * { box-sizing:border-box }
      dialog { width:min(420px,calc(100% - 32px)); color:inherit; background:var(--surface);
        border:0; border-radius:16px; padding:22px; box-shadow:0 12px 40px #0003; }
      dialog::backdrop { background:#0005 }
      h2 { margin:0 0 5px; font-size:20px; font-weight:650; letter-spacing:-.025em }
      p { margin:0; color:var(--secondary); font-size:13px; overflow-wrap:anywhere }
      label { display:block; font-size:13px; font-weight:600; margin-top:16px }
      input { display:block; width:100%; margin-top:5px; padding:8px 10px; min-height:40px;
        border:1px solid var(--line); border-radius:8px; background:var(--surface); color:inherit; font:inherit }
      input::placeholder { color:var(--secondary); opacity:1 }
      input:focus-visible,button:focus-visible { outline:2px solid var(--focus); outline-offset:3px }
      .actions { display:flex; flex-wrap:wrap; gap:8px; justify-content:flex-end; margin-top:18px }
      button { font:inherit; cursor:pointer; min-height:36px; padding:6px 12px; border-radius:8px;
        border:1px solid var(--line); background:var(--surface); color:inherit }
      button:hover { background:var(--soft) }
      button[type=submit] { border-color:var(--ink); background:var(--ink); color:var(--on-ink); font-weight:600 }
      button[type=submit]:hover { background:color-mix(in srgb,var(--ink) 85%,var(--surface)) }
      button:disabled { opacity:.6; cursor:default }
      .picker { position:fixed; z-index:2147483647; inset:18px 18px auto auto;
        width:min(318px,calc(100% - 36px)); padding:14px 16px; border-radius:14px;
        background:var(--surface); box-shadow:0 6px 26px #0003; }
      .picker h2 { font-size:16px; margin-bottom:4px }
      .picker .actions { margin-top:10px }
      .highlight { position:fixed; z-index:2147483646; pointer-events:none;
        outline:2px solid var(--focus); outline-offset:3px; border-radius:5px; background:color-mix(in srgb,var(--focus) 14%,transparent); }
      .error { margin-top:9px; color:var(--danger) }
      .error:empty { display:none }
      .notice { position:fixed; z-index:2147483647; inset:18px 18px auto auto;
        max-width:min(340px,calc(100% - 36px)); padding:10px 14px; border:1px solid var(--line);
        border-radius:12px; background:var(--soft); color:var(--ink); font:13px/1.5 system-ui; }
    `);
    shadow.adoptedStyleSheets = [sheet];
    return shadow;
  }

  function notice(text) {
    const shadow = surface();
    const label = element('p', String(text).slice(0,300));
    label.className = 'notice';
    label.setAttribute('role','status');
    shadow.append(label);
    const current = host;
    toastTimer = setTimeout(() => current.remove(), 3500);
  }

  async function submit(token,adapter) {
    const result = await chrome.runtime.sendMessage({type:'watchFromPage',token,adapter});
    if(!result?.ok)throw Error(result?.error||'未能开始监听，请重新使用右键菜单。');
  }

  function pickStatus(message) {
    const shadow=surface();
    const current=host;
    const toolbar=element('section');
    toolbar.className='picker';
    toolbar.setAttribute('aria-label',tr('选择网页状态'));
    const heading=element('h2','点选网页上的任务状态');
    const help=element('p','点选状态文字。下次在此页可直接监听。');
    help.setAttribute('role','status');
    const actions=element('div');
    actions.className='actions';
    const manual=element('button','手动填文案');
    const cancel=element('button','取消');
    manual.addEventListener('click',()=>showPrompt(message));
    cancel.addEventListener('click',()=>{endPicking?.();current.remove();});
    actions.append(manual,cancel);
    toolbar.append(heading,help,actions);
    const highlight=element('div');
    highlight.className='highlight';
    highlight.hidden=true;
    shadow.append(highlight,toolbar);
    const signal=new AbortController();
    const listen={capture:true,signal:signal.signal};
    const previousFocus=document.activeElement;
    let saving=false,frame=0,pointer;
    endPicking=()=>{
      cancelAnimationFrame(frame);
      signal.abort();
      endPicking=null;
      if(previousFocus instanceof HTMLElement&&previousFocus.isConnected)previousFocus.focus({preventScroll:true});
    };
    function inspect(event) {
      const node=event.target;
      return node instanceof Element&&node!==current?globalThis.__tabPilotSensor?.pickRegion(node):null;
    }
    document.addEventListener('pointermove',event=>{
      pointer=event;
      if(frame)return;
      frame=requestAnimationFrame(()=>{
        frame=0;
        const rule=inspect(pointer),target=rule&&document.querySelector(rule.target);
        highlight.hidden=!target;
        if(!target)return;
        const {left,top,width,height}=target.getBoundingClientRect();
        Object.assign(highlight.style,{left:left+'px',top:top+'px',width:width+'px',height:height+'px'});
      });
    },listen);
    document.addEventListener('pointerdown',event=>{
      if(event.target===current||!event.isTrusted||event.button!==0)return;
      event.preventDefault();
      event.stopImmediatePropagation();
    },listen);
    document.addEventListener('click',async event=>{
      if(event.target===current||!event.isTrusted||event.button!==0)return;
      event.preventDefault();
      event.stopImmediatePropagation();
      if(saving)return;
      const rule=inspect(event);
      if(!rule){help.textContent='请点击状态文字，例如页面上的「正在执行」。';return;}
      saving=true;
      manual.disabled=cancel.disabled=true;
      help.textContent='正在开始监听…';
      try{
        await submit(message.token,rule);
        if(host===current&&current.isConnected)notice('已开始监听。');
      }catch(error){if(host===current)help.textContent=error.message;}
      finally{saving=false;manual.disabled=cancel.disabled=false;}
    },listen);
    document.addEventListener('keydown',event=>{
      if(event.key!=='Escape')return;
      event.preventDefault();
      event.stopImmediatePropagation();
      if(saving)return;
      endPicking?.();
      current.remove();
    },listen);
    cancel.focus({preventScroll:true});
  }

  function showPrompt({token, selection, adapter}) {
    const shadow = surface();
    const dialog = element('dialog');
    dialog.setAttribute('aria-labelledby','watch-title');
    const form = element('form');
    const heading = element('h2','监听此页');
    heading.id = 'watch-title';
    form.append(heading, element('p','填写网页上实际显示的文字。匹配到完成文案时提醒。'));
    const inputs = {};
    for (const [key,label,placeholder] of [
      ['waiting','等待时','例如：正在执行'],
      ['done','完成时','例如：任务已完成'],
    ]) {
      const field = element('label',label);
      const input = element('input');
      input.required = true;
      input.maxLength = 160;
      input.placeholder = placeholder;
      input.value = (key === 'done' && selection ? selection : adapter?.[key]) || '';
      inputs[key] = input;
      field.append(input);
      form.append(field);
    }
    const error = element('p');
    error.className = 'error';
    error.setAttribute('role','alert');
    const actions = element('div');
    actions.className = 'actions';
    const cancel = element('button','取消');
    cancel.type = 'button';
    cancel.addEventListener('click',() => dialog.close());
    const start = element('button','开始监听');
    start.type = 'submit';
    actions.append(cancel,start);
    form.append(error,actions);
    dialog.append(form);
    shadow.append(dialog);
    const current = host;
    const previousFocus = document.activeElement;
    dialog.addEventListener('cancel',event=>{if(start.disabled)event.preventDefault();});
    dialog.addEventListener('close',() => {
      current.remove();
      if(host===current&&previousFocus instanceof HTMLElement&&previousFocus.isConnected)previousFocus.focus({preventScroll:true});
    });
    form.addEventListener('submit',async event => {
      event.preventDefault();
      if(start.disabled)return;
      start.disabled=cancel.disabled=true;
      start.textContent='正在开始…';
      error.textContent='';
      try{
        await submit(token,{waiting:inputs.waiting.value,done:inputs.done.value});
        if(host===current&&current.isConnected){
          dialog.close();
          if(previousFocus instanceof HTMLElement&&previousFocus.isConnected)previousFocus.focus({preventScroll:true});
          notice('已开始监听。');
        }
      }catch(failure){if(host===current)error.textContent=failure.message;}
      finally{start.disabled=cancel.disabled=false;start.textContent=tr('开始监听');}
    });
    dialog.showModal();
    (inputs.waiting.value ? inputs.done : inputs.waiting).focus();
  }

  chrome.runtime.onMessage.addListener((message,sender,reply) => {
    if(sender.id!==chrome.runtime.id)return;
    if(message.type==='openWatchPrompt')pickStatus(message);
    else if(message.type==='showWatchNotice')notice(message.text);
    else return;
    reply({ok:true});
  });
})();

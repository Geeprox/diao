(() => {
  if (globalThis.tabPilotWatchPrompt) return;
  globalThis.tabPilotWatchPrompt = true;
  let host;
  let toastTimer;

  function element(tag, text) {
    const node = document.createElement(tag);
    if (text) node.textContent = text;
    return node;
  }

  function surface() {
    host?.remove();
    clearTimeout(toastTimer);
    host = element('tab-pilot-watch');
    document.documentElement.append(host);
    const shadow = host.attachShadow({mode:'closed'});
    const sheet = new CSSStyleSheet();
    sheet.replaceSync(`
      :host { all:initial; font:14px/1.5 system-ui; color:#202b26; color-scheme:light; }
      * { box-sizing:border-box }
      dialog { width:min(420px,calc(100% - 32px)); color:inherit; background:#fff;
        border:0; border-radius:16px; padding:22px; box-shadow:0 12px 40px #18271d38; }
      dialog::backdrop { background:#18271d44 }
      h2 { margin:0 0 5px; font-size:20px; font-weight:650; letter-spacing:-.025em }
      p { margin:0; color:#566159; font-size:13px; overflow-wrap:anywhere }
      label { display:block; font-size:13px; font-weight:600; margin-top:16px }
      input { display:block; width:100%; margin-top:5px; padding:8px 10px; min-height:40px;
        border:1px solid #7d8880; border-radius:8px; background:white; color:inherit; font:inherit }
      input::placeholder { color:#566159; opacity:1 }
      input:focus-visible,button:focus-visible { outline:2px solid #235c45; outline-offset:3px }
      .actions { display:flex; flex-wrap:wrap; gap:8px; justify-content:flex-end; margin-top:18px }
      button { font:inherit; cursor:pointer; min-height:36px; padding:6px 12px; border-radius:8px;
        border:1px solid #7d8880; background:#fff; color:inherit }
      button:hover { background:#e7f0e9 }
      button[type=submit] { border-color:#235c45; background:#235c45; color:white; font-weight:600 }
      button[type=submit]:hover { background:#194831 }
      button:disabled { opacity:.6; cursor:default }
      .error { margin-top:9px; color:#9c352d }
      .error:empty { display:none }
      .notice { position:fixed; z-index:2147483647; inset:18px 18px auto auto;
        max-width:min(340px,calc(100% - 36px)); padding:10px 14px; border:1px solid #c7d7c9;
        border-radius:12px; background:#e7f0e9; color:#234735; font:13px/1.5 system-ui; }
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

  function showPrompt({token, selection, adapter}) {
    const shadow = surface();
    const dialog = element('dialog');
    dialog.setAttribute('aria-labelledby','watch-title');
    const form = element('form');
    const heading = element('h2','监听此页');
    heading.id = 'watch-title';
    form.append(heading, element('p','填写网页上显示的两种状态。完成后可在管理事项查看；启用 Mac 标签提醒时也会在标签旁提示。'));
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
    dialog.addEventListener('close',() => {
      current.remove();
      if(previousFocus instanceof HTMLElement&&previousFocus.isConnected)previousFocus.focus({preventScroll:true});
    });
    form.addEventListener('submit',async event => {
      event.preventDefault();
      if(start.disabled)return;
      start.disabled = true;
      error.textContent = '';
      try {
        const result = await chrome.runtime.sendMessage({type:'watchFromPage', token,
          adapter:{waiting:inputs.waiting.value,done:inputs.done.value}});
        if(!result?.ok)throw Error(result?.error||'未能开始监听，请重新打开右键菜单。');
        dialog.close();
        notice('已开始监听。');
      } catch (failure) { error.textContent = failure.message; }
      finally { start.disabled = false; }
    });
    dialog.showModal();
    (inputs.waiting.value ? inputs.done : inputs.waiting).focus();
  }

  chrome.runtime.onMessage.addListener((message,sender,reply) => {
    if(sender.id!==chrome.runtime.id)return;
    if(message.type==='openWatchPrompt')showPrompt(message);
    else if(message.type==='showWatchNotice')notice(message.text);
    else return;
    reply({ok:true});
  });
})();

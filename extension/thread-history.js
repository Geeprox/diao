// 只复用 ChatGPT 自己已成功取得的、当前会话的历史响应。
(() => {
  const installed = Symbol.for('tabCadence.historyObserver');
  if (window[installed]) return;
  Object.defineProperty(window, installed, {value: true});
  const limit = 8 * 1024 * 1024;
  let indexEnabled = true;
  let generation = 0;
  let readers = 0;
  let sequence = 0;
  const snapshots = [];
  let send = null;
  const conversation = (path = location.pathname) => path.match(/\/c\/([A-Za-z0-9_-]{8,128})\/?$/)?.[1];
  const invalidate = () => { generation++; snapshots.length = 0; send = null; };
  const publish = snapshot => {
    if (!indexEnabled || snapshot.id !== conversation()) return;
    document.dispatchEvent(new CustomEvent('tab-cadence:history', {detail: snapshot}));
  };
  window.navigation?.addEventListener('navigate', event => {
    const next = new URL(event.destination.url);
    if (next.origin !== location.origin || conversation(next.pathname) !== conversation()) invalidate();
  });
  document.addEventListener('tab-cadence:history-stop', () => { indexEnabled = false; invalidate(); });
  document.addEventListener('tab-cadence:history-request', () => {
    indexEnabled = true;
    for (const snapshot of snapshots) publish(snapshot);
  });
  document.addEventListener('tab-cadence:send-arm', event => {
    const nonce = event.detail;
    if (!indexEnabled || typeof nonce !== 'string' || !/^[a-f0-9-]{36}$/i.test(nonce)) return;
    send = {nonce, generation, until: Date.now() + 3500};
  });

  function reportRateLimit(response, id, epoch) {
    if (response?.status !== 429 || !indexEnabled || epoch !== generation || id !== conversation()) return;
    const after = response.headers.get('retry-after')?.trim();
    const now = Date.now();
    const delay = after && /^\d+(?:\.\d+)?$/.test(after) ? Number(after)*1000 :
      Math.max(0,Date.parse(after)-now) || 0;
    document.dispatchEvent(new CustomEvent('tab-cadence:chat-backoff',{
      detail:{id: id || '', until:now + Math.min(delay || 60000,86400000)},
    }));
  }

  async function observeSend(body, result, scope) {
    if (typeof body !== 'string' || body.length > 2 * 1024 * 1024) return;
    const data = JSON.parse(body);
    if ((data.conversation_id || data.conversationId) !== scope.id ||
        (data.action && data.action !== 'next' && data.action !== 'continue')) return;
    const message = Array.isArray(data.messages) ? data.messages.at(-1) : null;
    if (message?.author?.role !== 'user' || typeof message.id !== 'string' || message.id.length > 220 ||
        (message.recipient && message.recipient !== 'all') || !Array.isArray(message.content?.parts)) return;
    const prompt = message.content.parts.filter(part => typeof part === 'string').join('\n\n')
      .replace(/[\u200B\uFEFF]/g, '').replace(/\s+/g, ' ').trim();
    if (!prompt) return;
    const [response,digest] = await Promise.all([
      result, crypto.subtle.digest('SHA-256', new TextEncoder().encode(prompt)),
    ]);
    if (!response.ok || !indexEnabled || generation !== scope.generation || conversation() !== scope.id) return;
    // 页面事件仅携带身份和摘要值，不转交请求正文、头或令牌。
    const hash = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
    document.dispatchEvent(new CustomEvent('tab-cadence:sent-id', {detail:{nonce:scope.nonce,id:message.id,hash}}));
  }

  async function observe(response, scope) {
    if (!response?.ok || !indexEnabled || scope.generation !== generation || scope.id !== conversation() ||
        !/json/i.test(response.headers.get('content-type') || '') ||
        Number(response.headers.get('content-length') || 0) > limit || readers >= 2) return;
    let reader;
    try { reader = response.clone().body?.getReader(); } catch { return; }
    if (!reader) return;
    readers++;
    const cancel = () => { void reader.cancel().catch(() => {}); };
    const timeout = setTimeout(cancel, 10000);
    try {
      let bytes = 0;
      let text = '';
      const decoder = new TextDecoder();
      while (indexEnabled && scope.generation === generation && scope.id === conversation()) {
        const {done, value} = await reader.read();
        if (!indexEnabled || scope.generation !== generation || scope.id !== conversation()) return;
        if (done) {
          const snapshot = {id: scope.id, sequence: ++sequence, startedAt: scope.startedAt, partial: scope.partial,
            text: text + decoder.decode(), bytes};
          snapshots.push(snapshot);
          while (snapshots.length > 8 || snapshots.reduce((total, item) => total + item.bytes, 0) > 2 * limit) snapshots.shift();
          publish(snapshot);
          return;
        }
        bytes += value.byteLength;
        if (bytes > limit) return;
        text += decoder.decode(value, {stream: true});
      }
    } catch {
      // 原生请求、响应和会话都不依赖观察器。
    } finally {
      clearTimeout(timeout);
      cancel();
      try { reader.releaseLock(); } catch {}
      readers--;
    }
  }

  window.fetch = new Proxy(window.fetch, {
    apply(fetch, receiver, args) {
      const result = Reflect.apply(fetch, receiver, args);
      if (!indexEnabled) return result;
      try {
        const [input, options] = args;
        const method = String(options?.method || input?.method || 'GET').toUpperCase();
        const url = new URL(input?.url || input, location.href);
        if (method === 'POST' && indexEnabled && url.origin === location.origin &&
            /^\/backend-api\/(?:f\/)?conversation\/?$/.test(url.pathname)) {
          const id = conversation(), epoch = generation;
          void result.then(response=>reportRateLimit(response,id,epoch),()=>{}).catch(()=>{});
          if (send?.generation === generation && send.until >= Date.now()) {
            const body = options && Object.getOwnPropertyDescriptor(options, 'body')?.value;
            void observeSend(body, result, {...send,id}).catch(() => {});
          }
          return result;
        }
        if (method !== 'GET') return result;
        const matched = url.pathname.match(/^\/backend-api\/(?:f\/)?conversation\/([A-Za-z0-9_-]{8,128})\/?$/);
        if (url.origin !== location.origin || !matched) return result;
        const id = matched[1];
        const startedAt = Date.now();
        const partial = [...url.searchParams.keys()].some(key => /^(cursor|before|after|offset|page|page_token|limit)$/i.test(key));
        // 宿主在提交站内导航前可能已经开始加载对话。只在收到响应时匹配当前会话，
        // 不读取预载的其他对话，也不发出补读请求。
        void result.then(response => {
          if (id !== conversation()) return;
          reportRateLimit(response,id,generation);
          return observe(response,{id,generation,startedAt,partial});
        }, () => {}).catch(() => {});
      } catch {}
      return result;
    }
  });
})();

// ThreadDeck 1.10.1（MIT，ThreadDeck contributors）本地工作台迁移。
// ChatGPT 虚拟化线程的“常驻 turn 占位锚点”策略参考了 Loongphy 的
// ChatGPT Always-On Conversation TOC（MIT）：
// https://github.com/Loongphy/chatgpt-usage/blob/0b6c6192f63493c366e3c7fb278c32664bf42815/chatgpt-always-toc.user.js

(() => {
  'use strict';

  if (window.top !== window.self) return;
  if (window.__THREADDECK_LOADED__ || window.__PROMPT_RAIL_LOADED__) return;
  const runtimeId = chrome.runtime?.id;
  if (!runtimeId) return;
  const documentRoot = document.documentElement;
  const retireEvent = 'diao:retire:' + runtimeId;
  if (documentRoot?.hasAttribute('data-threaddeck-instance')) {
    if (documentRoot.getAttribute('data-threaddeck-owner') !== runtimeId) return;
    document.dispatchEvent(new Event(retireEvent));
  }
  documentRoot?.setAttribute('data-threaddeck-instance','1.13.0');
  documentRoot?.setAttribute('data-threaddeck-owner',runtimeId);
  window.__THREADDECK_LOADED__ = true;
  // Backward-compatible guard: prevents a hot-updated v0.5 tab from loading both products.
  window.__PROMPT_RAIL_LOADED__ = true;

  const APP_VERSION = '1.13.0';
  const PRODUCT_NAME = '对话工作台';
  const STORAGE_PREFIX = 'prompt-rail:';
  const SETTINGS_KEY = `${STORAGE_PREFIX}settings`;
  const CACHE_PREFIX = `${STORAGE_PREFIX}cache:`;
  const MAX_CACHE_ITEMS = 5000;
  const MAX_CACHED_TEXT = 320;
  const ANSWER_OUTLINE_CACHE_SCHEMA = 14;
  const TIMELINE_CACHE_SCHEMA = 1;
  const SCAN_DEBOUNCE_MS = 180;
  const ROUTE_POLL_MS = 650;
  const CHATGPT_API_TIMEOUT_MS = 12000;
  const CHATGPT_API_REFRESH_DEBOUNCE_MS = 1200;
  const CHATGPT_API_RETRY_COOLDOWN_MS = 15000;
  const CHATGPT_NATIVE_VERIFY_TIMEOUT_MS = 1800;
  const CHATGPT_SEEK_MAX_ROUNDS = 5;
  const CHATGPT_ANCHOR_STABILIZE_MS = 2200;
  const CHATGPT_ANCHOR_POLL_MS = 72;
  const MAX_ANSWER_MATCH_TEXT = 1200;
  // Long prose is deliberately rare and summary-only. Stable navigation uses headings
  // and whole top-level list containers, which survive Markdown renderer differences.
  const LONG_PARAGRAPH_MIN_WEIGHT = 520;
  const LONG_PARAGRAPH_MIN_SENTENCE_WEIGHT = 380;
  const LONG_PARAGRAPH_MIN_SENTENCES = 5;
  const ANSWER_BLOCK_MOUNT_TIMEOUT_MS = 3400;
  const NAVIGATION_TOP_OFFSET_PX = 84;
  const NAVIGATION_SETTLE_TIMEOUT_MS = 900;
  const REVIEW_SELECTION_MIN_CHARS = 1;
  const REVIEW_SELECTION_MAX_CHARS = 32768; // save limit; larger selections keep an explanatory action
  const NATIVE_SELECTION_TOOLBAR_FALLBACK_MS = 150;
  const NATIVE_SELECTION_PRIMARY_SELECTOR = '[role="presentation"].bg-surface-elevated-secondary button.cursor-interaction,button[data-testid*="ask-chatgpt" i]';
  const NATIVE_SELECTION_PENDING_TTL_MS = 30000;
  const NATIVE_SELECTION_TOOLBAR_MAX_DISTANCE_PX = 230;
  const QUEUE_POLL_MS = 80;
  const QUEUE_IDLE_SETTLE_MS = 40;
  const QUEUE_SEND_VERIFY_MS = 2800;
  const QUEUE_SESSION_PREFIX = `${STORAGE_PREFIX}tab-queue:`;
  const QUEUE_DOCK_GAP_PX = 8;
  const QUEUE_DOCK_MAX_HEIGHT_PX = 286;
  const CHATGPT_ACTIVITY_SETTLE_MS = 180;
  const CHATGPT_ACTIVITY_STREAM_RECENT_MS = 300;
  const CHATGPT_DISPATCH_ARM_MS = 10 * 60 * 1000;
  const CHATGPT_DISPATCH_REJECT_MS = 1600;
  const CHATGPT_NETWORK_STALE_MS = 2 * 60 * 1000;
  const CHATGPT_NETWORK_QUIET_RELEASE_MS = 520;
  const CHATGPT_GENERATION_LEASE_MAX_MS = 30 * 60 * 1000;
  const CHATGPT_GENERATION_COMPLETE_STABLE_MS = 460;
  const CHATGPT_PENDING_TURN_MAX_MS = 30 * 60 * 1000;
  const CONSUMED_COMMENT_ID_TTL_MS = 24 * 60 * 60 * 1000;
  const MAX_CONSUMED_COMMENT_IDS = 400;
  const COMMENT_SUBMISSION_RECEIPT_TIMEOUT_MS = 15000;
  const QUEUE_EDIT_GRACE_MS = 700;
  const COMMENT_BADGE_GAP_PX = 6;
  const COMMENT_POPOVER_GAP_PX = 2;
  const COMMENT_POPOVER_MAX_WIDTH_PX = 430;
  const ANSWER_OUTLINE_MODES = new Set(['off', 'stable']);
  const ANSWER_OUTLINE_ORIGINS = new Set([
    'markdown-document-heading', 'dom-document-heading',
    'markdown-section-title', 'dom-section-title',
    'markdown-list-section', 'dom-list-section',
  ]);
  // Inline SVG stays smaller than base64, inherits currentColor, and is easier to
  // tune when ChatGPT/Codex adjusts icon weight. All queue actions use this one
  // 20 px optical grid so their stroke, cap and spacing remain consistent.
  const THREADDECK_ICON_PATHS = Object.freeze({
    // Codex-like optical grid: fewer segments, lighter stroke and rounded endpoints.
    queue: '<path d="M4.5 5.6h7.1"/><path d="M4.5 9.75h9.65"/><path d="M4.5 13.9h6.25"/><path d="m12.15 12.25 2.15 1.65-2.15 1.65"/>',
    redirect: '<path d="m7.9 5.4-3.15 3.15L7.9 11.7"/><path d="M5 8.55h6.05a4.2 4.2 0 0 1 4.2 4.2v1.5"/>',
    trash: '<path d="M5.15 6.25h9.7"/><path d="M8 4.1h4"/><path d="m6.65 6.25.55 9h5.6l.55-9"/>',
    more: '<circle cx="5" cy="10" r=".96"/><circle cx="10" cy="10" r=".96"/><circle cx="15" cy="10" r=".96"/>',
    close: '<path d="m6 6 8 8M14 6l-8 8"/>',
    check: '<path d="m5.25 10.2 3.05 3.05 6.45-6.55"/>',
    search: '<circle cx="8.5" cy="8.5" r="4.75"/><path d="m12 12 3.5 3.5"/>',
    pin: '<path d="m10 11-5 5m5-12 6 6-3 1.25-1.5 3.25-6-6L9 7z"/>',
    settings: '<path d="M6 4v12m8-12v12M3.75 8h4.5m3.5 4h4.5"/>',
    annotation: '<path d="M4.25 3.75h11.5v8.5H9l-3.75 3v-3H4.25zM10 6.5v3M8.5 8h3"/>',
    chevron: '<path d="m8 5.5 4.5 4.5L8 14.5"/>',
    clock: '<circle cx="10" cy="10" r="6.25"/><path d="M10 6.55v3.75l2.55 1.55"/>',
  });

  const DEFAULT_SETTINGS = Object.freeze({
    enabled: true,
    minPrompts: 1,
    smoothScroll: true,
    hideNativeChatGptRail: true,
    rememberPrompts: true,
    // `showAnswerOutline` is kept as a migration alias for v0.5 settings.
    showAnswerOutline: true,
    answerOutlineMode: 'stable',
    enableAnswerJump: true,
    prefetchHistoryOnOutline: true,
    enableInlineComments: true,
    enterQueuesWhileGenerating: true,
    autoRunQueue: true,
    allowBackgroundQueue: true,
    showQueueDock: true,
    navigationStyle: 'rail',
    pinchTopics: true,
    autoTopicSummary: true,
    prepareTopicSummary: false,
    rightOffset: 12,
    hideBelowWidth: 720,
    sites: Object.freeze({
      chatgpt: true,
    }),
  });

  const SITE_CONFIGS = {
    chatgpt: {
      id: 'chatgpt',
      label: 'ChatGPT',
      hosts: ['chatgpt.com'],
      nativeToc: true,
      roots: ['#thread', 'infinite-scroller.chat-history', 'main#main', 'main'],
      userSelectors: [
        '[data-user-message-bubble]',
        '[data-conversation-role="user"]',
        'user-query',
        '[data-message-author-role="user"]',
        '[data-message-role="user"]',
        '[data-role="user"]',
        '[data-author-role="user"]',
        '[data-turn="user"] message-content',
        'section[data-turn="user"] message-content',
        '[data-turn="user"]',
      ],
      anchorSelectors: [
        '[data-turn="user"]',
        'section[data-turn="user"]',
        '[data-turn-id-container]',
        '[data-testid^="conversation-turn-"]',
        'user-query',
        '[data-message-author-role="user"]',
        '[data-message-role="user"]',
        '[data-role="user"]',
        '[data-author-role="user"]',
      ],
      textSelectors: [
        'message-content',
        '.user-message-bubble-color',
        '.whitespace-pre-wrap',
        '[data-message-author-role="user"]',
      ],
      assistantSelectors: [
        'section[data-turn="assistant"]',
        '[data-message-author-role="assistant"]',
      ],
      assistantAnchorSelectors: [
        'section[data-turn="assistant"]',
        '[data-turn="assistant"]',
        '[data-testid^="conversation-turn-"]',
        '[data-message-author-role="assistant"]',
      ],
      scrollSelectors: [
        'infinite-scroller.chat-history',
        '[class~="scrollbar-gutter"]',
        '[class*="scrollbar-gutter"]',
        '[data-radix-scroll-area-viewport]',
        '#thread',
        'main#main',
        'main',
      ],
    }
  };


  const EXTENSION_ENV = true;
  let pilotActive = false;
  async function pilotRpc(action,key,value) {
    const reply=await chrome.runtime.sendMessage({type:'threadWorkspace',action,key,value});
    if(!reply?.ok)throw Error('无法保存对话工作台的数据。');
    return reply.data;
  }
  const storage = {
    async get(key,fallback){return (await pilotRpc('get',key)) ?? fallback;},
    async set(key,value){await pilotRpc('set',key,value);},
    async remove(key){await pilotRpc('remove',key);},
    async keys(){return await pilotRpc('keys');},
  };
  // 草稿及回执按标签隔离；发送前等后台确认保存，网页无法直接读取。
  let sessionValues=Object.create(null),sessionWrite=Promise.resolve(true);
  const workspaceSession={
    async load(){sessionValues=Object.assign(Object.create(null),await pilotRpc('session')||{});},
    getItem(key){return sessionValues[key]??null;},
    setItem(key,value){
      sessionValues[key]=value;
      sessionWrite=sessionWrite.then(()=>pilotRpc('sessionSet',key,value)).then(()=>true,()=>{
        td.storageOK=false;showToast('队列未能保存，请检查后再发送',3000);return false;
      });
    },
    removeItem(key){delete sessionValues[key];sessionWrite=sessionWrite.then(()=>pilotRpc('sessionSet',key,null)).then(()=>true,()=>false);},
    flush(){return sessionWrite;},
  };
  let settings = mergeSettings(DEFAULT_SETTINGS, {});
  let site = resolveSite();
  if (!site) return;

  let routeKey = getRouteKey();
  let routeHref = location.href;
  let cacheRecords = [];
  let entries = [];
  let mountedEntries = [];
  let mountedByKey = new Map();
  let activeIndex = -1;
  let navHost = null;
  let shadowRoot = null;
  let navigatorEl = null;
  let railEl = null;
  let listEl = null;
  const tr = globalThis.DiaoLocale?.text || (text=>text);
  let toastEl = null;
  let toastTimer = null;
  let settingsLayerEl = null;
  let settingsFormEl = null;
  let selectionActionEl = null;
  let nativeSelectionButtonEl = null;
  let nativeSelectionToolbarEl = null;
  let nativeSelectionFallbackTimer = null;
  let nativeSelectionSearchLifecycle = null;
  let nativeSelectionObserver = null;
  let nativeSelectionSuppressionObserver = null;
  let nativeSelectionSuppressionRaf = null;
  let suppressedNativeSelectionToolbarEls = new Set();
  let nativeSelectionSuppressionRect = null;
  let nativeSelectionIntegrationToken = 0;
  let workflowLauncherEl = null;
  let workflowPanelEl = null;
  let workflowBodyEl = null;
  let queueDockEl = null;
  let queueDockListEl = null;
  let queueMenuEl = null;
  let queueDockPositionRaf = null;
  let queueMenuPositionRaf = null;
  let queueDockCollapsed = false;
  let queueDragId = '';
  let queueDropId = '';
  let queueDropAfter = false;
  let workflowOpen = false;
  let workflowTab = 'comments';
  let pendingSelection = null;
  let reviewComments = [];
  let reviewHighlight = null;
  // Annotation text remains owned by ChatGPT. Hit-test Ranges, never wrap its
  // React/ProseMirror text in <mark>, and never overlay pointer-catching boxes.
  let reviewAnchorObserver = null;
  let reviewAnchorTimer = null;
  let reviewHitGesture = null;
  let reviewHitInstalled = false;
  let promptQueue = [];
  let queuePaused = false;
  let queueProcessing = false;
  let queueTimer = null;
  let queueLastBusyAt = 0;
  let queueHoldUntil = 0;
  let queueRouteKey = '';
  let queueDraft = '';
  let queueMenuOpenId = '';
  let queueLastRenderedPhase = '';
  let queuePreviousPhase = 'idle';
  let queueLastEditAt = 0;
  let queueIdleDispatchTimer = null;
  let workflowSaveTimer = null;
  let reviewHighlightStyleEl = null;
  let commentBadgeLayerEl = null;
  let commentPopoverEl = null;
  let commentPopoverBodyEl = null;
  let commentAggregateBadgeEl = null;
  let commentPositionRaf = null;
  let activeCommentMode = '';
  let activeCommentId = '';
  let activeCommentAnswerKey = '';
  let activeCommentAnchor = null;
  let activeCommentWasNew = false;
  let chatGptActivityPhase = 'idle';
  let chatGptActivityEvidence = [];
  let chatGptActivityChangedAt = 0;
  let chatGptActivitySettlingUntil = 0;
  let chatGptDispatchArmedAt = 0;
  let chatGptDispatchArmedUntil = 0;
  let chatGptDispatchStrongSeen = false;
  let chatGptDispatchBaselineSignature = '';
  let chatGptDispatchExpectedText = '';
  let chatGptDispatchBaselineUserSignature = '';
  let chatGptDispatchAcceptedAt = 0;
  let chatGptDispatchSawStop = false;
  let chatGptDispatchSawNetwork = false;
  let chatGptDispatchCompletionCandidateSince = 0;
  let chatGptNetworkStartedAt = 0;
  let chatGptNetworkLastChunkAt = 0;
  let chatGptNetworkLastEndedAt = 0;
  let chatGptNetworkTokenSerial = 0;
  let chatGptNetworkTokens = new Map();
  let chatGptLastAssistantSignature = '';
  let chatGptLastAssistantChangedAt = 0;
  let chatGptLatestObservedUserSignature = '';
  let chatGptLatestObservedUserChangedAt = 0;
  let chatGptStructuralCompletionCandidateSince = 0;
  let chatGptStopLastSeenAt = 0;
  let chatGptStopMissingSince = 0;
  let chatGptActivityMonitorInstalled = false;
  let pendingCommentBridgeInstalled = false;
  let reviewSelectionListenersInstalled = false;
  let consumedReviewCommentIds = new Map();
  let pendingCommentSubmissionInFlight = false;
  let pendingCommentSubmissionReceipt = null;
  let pendingCommentSubmissionBypassDepth = 0;
  let nativeComposerDispatchBypassDepth = 0;
  let composerIntentGuardUntil = 0;
  let composerIntentGuardButton = null;
  let composerIntentGuardRect = null;
  let currentScrollRoot = null;
  let refreshTimer = null;
  let cacheWriteTimer = null;
  let scrollRaf = null;
  let routeTimer = null;
  let bodyObserver = null;
  let themeObserver = null;
  let nativeTocObserver = null;
  let nativeTocGroup = null;
  let nativeTocOriginalStyle = null;
  let nativeTocSuppressionStyleEl = null;
  let nativeTocSuppressionObserver = null;
  let nativeTocSuppressionRaf = null;
  let nativeTocMarkedGroups = new Set();
  let nativeHoverSignature = '';
  let chatGptConversationId = '';
  let chatGptConversationKind = '';
  let chatGptApiRecords = [];
  let chatGptApiStatus = 'idle';
  let chatGptApiError = '';
  let chatGptApiFetchPromise = null;
  let chatGptApiRefreshTimer = null;
  let chatGptApiFetchedAt = 0;
  let chatGptApiFailedAt = 0;
  let chatGptSkeleton = null;
  let expandedPromptKeys = new Set();
  let activeAnswerKey = '';
  let userNavigationEpoch = 0;
  let navigationToken = 0;
  let renderSignature = '';
  let destroyed = false;
  // v1.1: one route epoch, one dispatch transaction, one event gateway.
  // Never write to an editor discovered after an await; never equate a changed
  // draft or a closed HTTP stream with a successfully submitted user message.
  const td = {
    epoch: 0, controller: new AbortController(), ready: false, tx: null, staged: null,
    run: null, lastUser: '', lastFinal: '', finalChangedAt: 0, settleSince: 0,
    activityCache: null, activityAt: 0, activityDirty: true, activityScans: 0,
    editorRevision: new WeakMap(), writing: false, composing: false,
    allowButton: null, allowForm: null, gesture: null, beforeInputNewline: false,
    enterGuard: null,
    routeStartedAt: Date.now(), wakeTimer: null, pumping: false, log: [],
    outlineCache: new Map(), search: '', expandAll: new Set(), storageOK: true,
    networkReaders: new Set(), manualCompletion: '', observedNativeStart: 0,
    nativeIntent: null, pointerHold: null, editingQueueId: '', queueRenderKey: '', menuRenderKey: '',
  };


  /* Route isolation contract (1.10): a pathname is a navigation intent, NOT proof
   * that React has replaced the transcript. Nodes, async jobs and stored rows each
   * need an owner. No elapsed-time heuristic can transfer a message to a new chat. */
  const TD_INDEX_OWNER_SCHEMA = 2;
  const tdRouteFence = { nodes:new WeakMap(), decisions:new WeakMap(), blocked:0, rejectedPayloads:0, quarantined:0, retired:new Set(), transitions:0 };
  const TD_CONVERSATION_ATTRS = ['data-chatgpt-selection-conversation-id','data-conversation-id'];
  function tdRouteNodeSignature(node) {
    if (!(node instanceof Element)) return '';
    return ['data-chatgpt-selection-message-id','data-message-id','data-node-id',
      'data-chatgpt-search-message-ids','data-turn-key','data-turn-id','data-turn-id-container']
      .map(a=>node.getAttribute(a)||'').join('|');
  }
  function tdRouteExplicitId(node) {
    for (let n=node,depth=0;n instanceof Element&&depth<40;n=tdDomParent(n),depth++) {
      for (const a of TD_CONVERSATION_ATTRS) {
        const v=n.getAttribute(a);
        if (v && /^[A-Za-z0-9_-]{8,128}$/.test(v)) return v;
      }
    }
    return '';
  }
  function tdRouteAllowsUncached(node) {
    if (!(node instanceof Element) || !node.isConnected || getRouteKey()!==routeKey) return false;
    const loc=getChatGptConversationLocator(); if(!loc.id) return false;
    // A share URL has a different ID than the underlying conversation. Do not
    // compare those namespaces. Its records are still owned by the share route.
    const expected=loc.kind==='share' ? '' : loc.id;
    const explicit=tdRouteExplicitId(node);
    if(expected && explicit) return explicit===expected;
    // User bubbles often expose conversation ID only on a sibling answer in the
    // SAME turn. Never infer from an arbitrary main/body containing several chats.
    const turn=tdDomClosest(node,'[data-turn-key],[data-turn-id-container],[data-testid^="conversation-turn-"]');
    if(expected && turn && !turn.matches('main,body,html')) {
      const owners=new Set(Array.from(turn.querySelectorAll('[data-chatgpt-selection-conversation-id]'))
        .map(n=>n.getAttribute('data-chatgpt-selection-conversation-id')).filter(Boolean));
      if(owners.size && !(owners.size===1 && owners.has(expected))) {
        // 本地会话标识来自当前可见线程，和地址栏的服务端会话 ID 属于不同命名空间。
        const root=tdDomClosest(turn,'[data-thread-find-target="conversation"][data-chatgpt-conversation-selection-target]');
        const localOwner=root?.getAttribute('data-chatgpt-conversation-selection-target') || '';
        if(owners.size!==1 || !/^local-chatgpt:[0-9a-f-]{36}$/i.test(localOwner) ||
          !owners.has(localOwner) || !tdDomTreeShown(root)) return false;
      }
    }
    for(let n=node,depth=0;n instanceof Element&&depth<35;n=tdDomParent(n),depth++) {
      if(n.matches('main,body,html,form,#thread')) break;
      const prior=tdRouteFence.nodes.get(n),signature=tdRouteNodeSignature(n);
      if(prior && prior.owner!==routeKey) {
        // Reusing an element is allowed ONLY after its explicit message address
        // changes. Changing text or waiting 700ms is not a new identity.
        if(signature && signature!==prior.signature && signature.replace(/\|/g,'')) continue;
        tdRouteFence.blocked++; return false;
      }
    }
    return true;
  }
  function tdRouteAllows(node) {
    if(!(node instanceof Element)||getRouteKey()!==routeKey)return false;
    const sig=tdRouteNodeSignature(node)+'|'+TD_CONVERSATION_ATTRS.map(a=>node.getAttribute(a)||'').join('|');
    const old=tdRouteFence.decisions.get(node);
    if(old&&old.epoch===td.epoch&&old.revision===tdDomState.revision&&old.scopeRevision===tdDomScopes.revision&&old.signature===sig)return old.allowed;
    const allowed=tdRouteAllowsUncached(node);
    tdRouteFence.decisions.set(node,{epoch:td.epoch,revision:tdDomState.revision,scopeRevision:tdDomScopes.revision,signature:sig,allowed});
    return allowed;
  }
  function tdRouteRememberNode(node) {
    if(!(node instanceof Element)||node.matches('main,body,html,form,#thread')||!tdRouteAllows(node))return;
    tdRouteFence.nodes.set(node,{owner:routeKey,signature:tdRouteNodeSignature(node)});
  }
  function tdRouteRetireDom() {
    // Snapshot before clearing the old route. This is cold-path work, never runs
    // from pointermove/selectionchange and never searches or changes the editor.
    const all=new Set([...mountedEntries.map(e=>e.target),...(tdDomScopes.census?.markers||[]),
      ...(tdDomScopes.census?.renderers||[])]);
    for(const e of entries) {if(e.target)all.add(e.target);for(const a of e.answerRecords||[])if(a.target)all.add(a.target);}
    for(const node of all)if(node instanceof Element&&!node.matches('main,body,html,form,#thread'))
      tdRouteFence.nodes.set(node,{owner:routeKey,signature:tdRouteNodeSignature(node)});
    tdRouteFence.decisions=new WeakMap();tdRouteFence.transitions++;
  }
  function tdStampIndex(records, owner=routeKey) {
    return (records||[]).filter(e=>e && (!e.ownerKey||e.ownerKey===owner)).map(e=>({...e,
      ownerKey:owner,ownerSchema:TD_INDEX_OWNER_SCHEMA,
      answerRecords:(e.answerRecords||[]).filter(a=>!a.ownerKey||a.ownerKey===owner).map(a=>({...a,ownerKey:owner})),
      answerBlocks:(e.answerBlocks||[]).filter(b=>!b.ownerKey||b.ownerKey===owner).map(b=>({...b,ownerKey:owner}))}));
  }
  function tdOwnedIndex(records) {
    return (records||[]).filter(e=>e?.ownerKey===routeKey && e.ownerSchema===TD_INDEX_OWNER_SCHEMA);
  }
  function tdPayloadBelongs(data, resource) {
    if(!resource || resource.key!==getChatGptConversationResource()?.key)return false;
    if(resource.kind==='share')return true;
    const id=data?.conversation_id || data?.conversationId;
    if(id && String(id)!==resource.id){tdRouteFence.rejectedPayloads++;return false;}
    return true;
  }

  // Editing and submitting are disjoint intents. A DOM beforeinput event is
  // NEVER a send command. A handler cancelling an event is not an edit receipt.
  const tdNewlineEvents=new WeakSet();
  const tdNewline={active:null,last:null};
  function tdNewlineShape(editor) {
    return editor instanceof HTMLTextAreaElement ? editor.value : editor.innerHTML;
  }
  function tdProseMirrorView(editor) {
    const node=tdEditorPageNode(editor),views=[node?.pmViewDesc?.view,editor.pmViewDesc?.view,node?.editor?.view];
    for(let p=node?.parentElement,i=0;p&&i<3&&!p.matches('main,body,html');p=p.parentElement,i++)views.push(p.editor?.view);
    return views.find(v=>tdEditorSameNode(v?.dom,editor)&&!v.isDestroyed&&v.editable!==false&&typeof v.dispatch==='function')||null;
  }
  function tdFinishNewline(op,method) {
    if(tdNewline.active!==op)return;
    tdNewline.active=null;
    if(!tdAlive(op.scope)||!op.editor.isConnected)return;
    const changed=tdNewlineShape(op.editor)!==op.before;
    tdNewline.last={method,changed};
    if(!changed)showToast('网页编辑器未接受换行，未提交或入队；草稿保持不变',2300);
    td.activityDirty=true;
  }

  // 1.8.1: no automatic additional conversation/session GETs. Native responses
  // are observed, never replayed. Only a manual read obtains a private permit.
  const TD_READ_KEY='threaddeck:read-budget:v1';
  const TD_CIRCUIT_PREFIX='threaddeck:read-circuit:v1:';
  const TD_READ_LOCK='threaddeck:manual-read:v1';
  const TD_READ_PERMIT=Symbol('manual-read-permit');
  const TD_READ_LIMIT=8*1024*1024, TD_READ_GAP=60000;
  const tdReads={own:0,job:null,snap:null,pending:[],seen:new Set(),graph:null,timer:null,observing:0,seq:0,
    appliedSeq:0,appliedEpoch:-1,token:'',tokenUntil:0,localUntil:0,storageOK:true,
    additional:0,observed:0,adopted:0,denied:0,limited:0,skipped:0,lastReason:''};
  function tdReadRetryAt(value,now=Date.now()) {
    const text=String(value||'').trim();
    if(/^\d+(?:\.\d+)?$/.test(text)&&Number.isFinite(Number(text)))return Math.min(8640000000000000,now+Number(text)*1000);
    const date=text?Date.parse(text):NaN;return Number.isFinite(date)?Math.max(now,date):0;
  }
  function tdReadState() {
    return {until:0,next:0,active:0};
  }
  function tdReadCircuit(status,retryAfter='') {
    return 0;
  }
  function tdReadDenied(reason,until=0) {
    tdReads.denied++;tdReads.lastReason=reason;
    return Object.assign(new Error(reason==='cooldown'?'会话补读正在冷却，已保留本地目录':
      reason==='budget'?'补读已限频，请稍后再试':reason==='in-flight'?'已有标签页正在补读，没有新增请求':
      reason==='coordination'?'无法安全协调补读，继续使用页面和缓存':'使用页面数据和本地缓存，没有新增请求'),
      {name:'ReadDeferredError',localPolicy:true,reason,retryAt:until});
  }
  function tdReadDiagnostic() {
    return {mode:'local-only',additionalRequests:0};
  }
  function tdReadWaitText() {
    return '等待 ChatGPT 加载消息。可以在对话里往上滚动，已加载的内容会自动加入大纲。';
  }
  function tdReadResource(input,init={}) {
    const {method,url}=requestMethodAndUrl(input,init);if(method!=='GET')return null;
    try{const u=new URL(url,location.href),m=u.pathname.match(/^\/backend-api\/(conversation|share)\/([A-Za-z0-9_-]{8,128})\/?$/);
      return u.origin===location.origin&&m?{kind:m[1],id:m[2],key:`${m[1]}:${m[2]}`,partial:[...u.searchParams.keys()].some(k=>/^(?:cursor|before|after|offset|page|page_token|limit)$/i.test(k))}:null;
    }catch{return null;}
  }
  function tdReadBusy(){return tdSelectionBusy()||tdSendingCritical()||!!tdEditor.active;}
  function tdQueueHistory(pending) {
    if (pending.observerSequence) {
      if (tdReads.seen.has(pending.observerSequence)) return;
      tdReads.seen.add(pending.observerSequence);
      if (tdReads.seen.size > 128) tdReads.seen.delete(tdReads.seen.values().next().value);
    }
    tdReads.pending.push(pending);
    while (tdReads.pending.length > 8) tdReads.pending.shift();
    tdReadAdoptLater();
  }
  function tdReadAdoptLater(delay=100) {
    if (tdReads.timer !== null || !tdReads.pending.length) return;
    tdReads.timer = setTimeout(async () => {
      tdReads.timer = null;
      if (!settings.enabled) { tdReads.pending.length = 0; return; }
      if (tdReadBusy() || chatGptApiFetchPromise) { tdReadAdoptLater(180); return; }
      const pending = tdReads.pending.shift();
      try {
        if (!pending || pending.epoch !== td.epoch ||
            pending.resource.key !== getChatGptConversationResource()?.key) return;
        const data = unwrapChatGptConversationPayload(JSON.parse(pending.text));
        if (!tdPayloadBelongs(data, pending.resource)) return;
        if (!isPlainObject(data?.mapping) && !Array.isArray(data?.linear_conversation)) return;
        const previous = tdReads.snap;
        const complete = tdSnapshotInfo(data, pending.resource).complete;
        // 顺序只用来阻止旧整份会话覆盖新版。分页可乱序到达。
        if (complete && previous?.resource.key === pending.resource.key &&
            previous.complete && previous.startedAt > pending.startedAt) return;
        tdReads.snap = {...pending, text:null, data, complete, seq:++tdReads.seq};
        await ensureChatGptConversationData({reason:'observed-host-response'});
      } catch (error) {
        tdLog('observed-json-unavailable',error?.name);
      } finally {
        tdReadAdoptLater();
      }
    }, delay);
  }
  function tdObserveRead(response,resource,meta) {
    if(!settings.enabled||!resource)return;
    tdReads.observed++;
    if(response?.status===429){tdReadCircuit(429,response.headers?.get('retry-after'));return;}
    if(meta.epoch!==td.epoch)return;
    if(!response?.ok||resource.key!==getChatGptConversationResource()?.key||!/json/i.test(response.headers?.get('content-type')||''))return;
    if(Number(response.headers.get('content-length')||0)>TD_READ_LIMIT||tdReads.observing>=2){tdReads.skipped++;return;}
    let reader;try{reader=response.clone().body?.getReader();}catch{return;}if(!reader)return;
    tdReads.observing++;
    const stop=()=>{try{void reader.cancel().catch(()=>{});}catch{}};
    const timer=setTimeout(stop,30000);
    void(async()=>{
      const decoder=new TextDecoder(),parts=[];let bytes=0;
      try{
        while(settings.enabled&&meta.epoch===td.epoch&&resource.key===getChatGptConversationResource()?.key){
          const {done,value}=await reader.read();
          if(meta.epoch!==td.epoch||resource.key!==getChatGptConversationResource()?.key)return;
          if(done){parts.push(decoder.decode());
            tdQueueHistory({...meta,resource,text:parts.join('')});
            return;
          }
          bytes+=value?.byteLength||0;if(bytes>TD_READ_LIMIT){tdReads.skipped++;return;}
          parts.push(decoder.decode(value,{stream:true}));
        }
      }catch{/* Observation cannot fail the native fetch. */}
      finally{clearTimeout(timer);tdReads.observing--;stop();try{reader.releaseLock();}catch{}}
    })();
  }
  async function tdManualRead(){throw tdReadDenied('local-only');}
  const tdReceiptBindings = new Map();
  let tdChatBackoffUntil = 0;
  function tdChatBackoff(until) {
    if (!Number.isFinite(until) || until<=Date.now() || until>Date.now()+86400000) return;
    tdChatBackoffUntil=Math.max(tdChatBackoffUntil,until);
    tdWake(0);
  }
  function tdArmReceiptObserver(tx) {
    const nonce = crypto.randomUUID();
    if (!crypto.subtle) return;
    const hash = crypto.subtle.digest('SHA-256', new TextEncoder().encode(normalizeInlineReviewText(tx.payload)))
      .then(bytes=>Array.from(new Uint8Array(bytes), byte=>byte.toString(16).padStart(2,'0')).join('')).catch(()=>'');
    tdReceiptBindings.set(nonce,{tx,hash});
    setTimeout(()=>tdReceiptBindings.delete(nonce),30000);
    document.dispatchEvent(new CustomEvent('tab-cadence:send-arm',{detail:nonce}));
  }
  function tdListenHistory() {
    document.addEventListener('tab-cadence:chat-backoff',event=>{
      const value=event.detail, resource=getChatGptConversationResource();
      if(!tdEnabled()||value?.id!==resource?.id) return;
      tdChatBackoff(value.until);
      void pilotRpc('chatBackoff',null,value.until).then(tdChatBackoff).catch(()=>{});
    });
    void pilotRpc('chatBackoff').then(tdChatBackoff).catch(()=>{});
    document.addEventListener('tab-cadence:sent-id', async event => {
      const value=event.detail;
      const binding=tdReceiptBindings.get(value?.nonce);
      if (!binding || typeof value.id!=='string' || value.id.length>220 ||
          typeof value.hash!=='string' || !/^[a-f0-9]{64}$/.test(value.hash)) return;
      const {tx,hash}=binding;
      const {id,hash:observed,nonce}=value;
      if (observed!==await hash || !tdAlive(tx.scope) || !tx.clicked) return;
      const receipt=tx.item.sendReceipt;
      if (!receipt || receipt.ackedAt || receipt.baselineIds.includes(id) || receipt.requestIds.length) return;
      // 仍需以新出现的对应用户消息确认上屏，HTTP 成功只补足发送身份。
      receipt.requestIds=[id];
      receipt.requestState='ok';
      tdReceiptBindings.delete(nonce);
      saveWorkflowState();
      td.activityDirty=true;
      tdWake(0);
    });
    document.addEventListener('tab-cadence:history', event => {
      if (!tdEnabled()) return;
      const value=event.detail;
      const resource=getChatGptConversationResource();
      if (resource?.kind!=='conversation' || value?.id!==resource.id ||
          typeof value.text!=='string' || value.text.length>TD_READ_LIMIT ||
          !Number.isFinite(value.startedAt) || value.startedAt>Date.now()) return;
      // 页面提供的历史只用于索引和概览，不能确认发送回执或解锁自动续发。
      tdQueueHistory({resource:{...resource,partial:value.partial===true},text:value.text,startedAt:value.startedAt,
        epoch:td.epoch,serial:tdTurn.serial,outlineOnly:true,observerSequence:value.sequence});
    });
  }
  const tdRequestLoadedHistory=()=>document.dispatchEvent(new Event('tab-cadence:history-request'));

  const tdInteraction={skipped:0,fullMutationPasses:0,resumes:0,dirty:false,dirtyHighlights:false,dirtyCache:false};
  function tdDeferInteraction(reason='') {
    if(!tdSelectionBusy())return false;
    tdInteraction.skipped++;tdInteraction.dirty=true;tdSelection.deferred=true;return true;
  }
  function tdResumeSelectionWork() {
    if(tdSelectionBusy())return;
    if(tdInteraction.dirty||tdSelection.deferred){
      tdInteraction.dirty=false;tdSelection.deferred=false;tdInteraction.resumes++;
      tdDomScopes.census=null;tdDomScopes.revision++;tdDomState.revision++;tdAdaptive.at=-Infinity;
      if(tdInteraction.dirtyHighlights){tdInteraction.dirtyHighlights=false;tdReviewIndexes=new WeakMap();tdReviewRevision++;}
      scheduleRefresh('selection-released',220);if(reviewComments.length)tdScheduleReviewRestore(180);
      scheduleNativeTocSuppressionScan();scheduleQueueDockPosition();scheduleInlineCommentPosition();
    }
    if(tdInteraction.dirtyCache){tdInteraction.dirtyCache=false;scheduleCacheWrite();}
    tdReadAdoptLater(120);scheduleChatGptApiRefresh('selection-released',180);td.activityDirty=true;
  }

  // 1.7.3: index, DOM adapter and UI are separate failure domains. Diagnostics
  // include startup/request failures instead of silently reporting all zeros.
  const tdHealth = {
    started: performance.now(), stage: 'created', complete: false, steps: [], faults: [],
    requests: [], serial: 0, payload: null, lastGood: null, recovery: null,
    picker: null, picked: null, selectionSample: null, menuInstalled: false,
  };
  function tdHealthFault(stage, error) {
    const name = /^[A-Za-z][A-Za-z0-9]*$/.test(String(error?.name || '')) ? error.name : 'Error';
    // Never emit error.message: browser errors can embed selectors containing IDs.
    const stack = String(error?.stack || '');
    const frame = stack.match(/:(\d+):(\d+)\)?(?:\n|$)/);
    const entry = {stage, name, line: frame ? Number(frame[1]) : null,
      column: frame ? Number(frame[2]) : null, atMs: Math.round(performance.now()-tdHealth.started)};
    const last = tdHealth.faults.at(-1);
    if (!last || last.stage !== stage || last.name !== name || entry.atMs-last.atMs>2000) {
      tdHealth.faults.push(entry); if(tdHealth.faults.length>24)tdHealth.faults.shift();
      tdLog('component-fault',`${stage}/${name}`);
    }
  }
  function tdSafeTask(stage, fn, fallback = null) {
    try {return fn();} catch(error) {tdHealthFault(stage,error);return fallback;}
  }
  async function tdBootStep(stage, fn) {
    tdHealth.stage=stage;
    const step={stage,state:'running',ms:0};tdHealth.steps.push(step);
    const start=performance.now();
    try {const result=await fn();step.state='ok';return result;}
    catch(error){step.state='failed';tdHealthFault(`boot:${stage}`,error);return null;}
    finally{step.ms=Math.round(performance.now()-start);}
  }
  function tdRequestBegin(endpoint) {
    const kind = endpoint === '/api/auth/session' ? 'session' : endpoint.startsWith('/backend-api/share/') ? 'share' : 'conversation';
    const req={serial:++tdHealth.serial,kind,state:'pending',http:null,start:performance.now(),elapsedMs:0};
    tdHealth.requests.push(req);if(tdHealth.requests.length>12)tdHealth.requests.shift();return req;
  }
  function tdHealthSummary() {
    return {boot:{stage:tdHealth.stage,complete:tdHealth.complete,steps:tdHealth.steps.slice()},
      api:{status:chatGptApiStatus,inFlight:Boolean(chatGptApiFetchPromise),freshCount:chatGptApiRecords.length,
        cacheCount:cacheRecords.length,payload:tdHealth.payload,
        requests:tdHealth.requests.map(({start,...r})=>({...r,elapsedMs:r.state==='pending'?Math.round(performance.now()-start):r.elapsedMs}))},
      ui:{ready:td.ready,hostConnected:Boolean(navHost?.isConnected),navigationHidden: navigatorEl?.hidden ?? null,
        enabled:settings.enabled,minimum:settings.minPrompts,narrow:settings.hideBelowWidth>0&&innerWidth<settings.hideBelowWidth,
        selectionListeners:reviewSelectionListenersInstalled,routeWatcher:routeTimer!==null},
      faults:tdHealth.faults.slice(),picked:tdHealth.picked,selectionSample:tdHealth.selectionSample};
  }
  function tdRequestEnd(req, state, error = null) {
    if(!req)return;req.state=state;req.elapsedMs=Math.round(performance.now()-req.start);
    if(error)req.error=/^[A-Za-z][A-Za-z0-9]*$/.test(String(error.name||''))?error.name:'Error';
    tdSafeTask('index-status',tdRecoveryStatus);
  }
  function tdRememberGoodIndex() {
    if(!entries.length || getRouteKey()!==routeKey)return;
    tdHealth.lastGood={key:routeKey,items:entries.slice()};
  }
  function tdRestoreIndexAfterDomFailure(previous) {
    // Only an exact route key may reuse an in-memory snapshot. No cross-chat cache.
    const base=chatGptApiRecords.length?chatGptApiRecords:cacheRecords.length?cacheRecords:
      previous.length?previous:tdHealth.lastGood?.key===routeKey?tdHealth.lastGood.items:[];
    if(!base.length)return;
    entries=base.map((e)=>({...e,target:null,skeletonTarget:null,nativeButton:null,
      answerBlocks:(e.answerBlocks||[]).map(b=>({...b,target:null,skeletonTarget:null})),
      answerRecords:(e.answerRecords||[]).map(a=>({...a,target:null,skeletonTarget:null}))}));
    mountedEntries=[];mountedByKey.clear();
    lastScanStats={...createScanStats(),source:chatGptApiRecords.length?'conversation-api:dom-degraded':'cache:dom-degraded'};
    tdSafeTask('fallback-outline',()=>enforceAnswerOutlines(entries));
    tdSafeTask('fallback-render',()=>renderEntries(true));
  }
  async function tdRecoverIndex(loadEarlier = false) {
    if (!settings.enabled || !isCurrentPageEligible()) return false;
    tdRequestLoadedHistory();
    await ensureChatGptConversationData({reason:'local-recovery'});
    await refreshNow('local-recovery');
    if (loadEarlier) await tdOutlineLoadHistory(true);
    return true;
  }
  function tdSetOutlinePinned(pinned) {
    navigatorEl.dataset.pinned = String(pinned);
    shadowRoot.querySelector('.td-pin')?.setAttribute('aria-pressed',String(pinned));
    if (pinned) void tdOutlineLoadHistory();
    else tdOutlineStopHistory();
  }
  function tdRecoveryStatus() {
    if(!shadowRoot||!navigatorEl||!railEl)return;
    const empty=!entries.length;
    let panel=shadowRoot.querySelector('.td-recovery-state');
    if(!panel){
      panel=document.createElement('div');panel.className='td-recovery-state';panel.hidden=true;
      const title=document.createElement('strong');title.className='td-recovery-title';
      const text=document.createElement('div');text.className='td-recovery-text';text.setAttribute('role','status');
      const controls=document.createElement('div');controls.className='td-recovery-actions';
      for(const [label,fn] of [['刷新大纲',()=>tdRecoverIndex(true)]]){
        const b=document.createElement('button');b.type='button';b.className='dialog-button';b.textContent=label;
        b.addEventListener('click',()=>{void fn();});controls.appendChild(b);
      }
      panel.append(title,text,controls);listEl.after(panel);
      const style=document.createElement('style');style.textContent=`
        .td-recovery-state{padding:16px;font:13px/1.6 var(--apr-font);color:var(--apr-muted)}
        .td-recovery-title{display:block;color:var(--apr-text);margin-bottom:6px;font-weight:550}
        .td-recovery-actions{display:flex;gap:6px;margin-top:12px;flex-wrap:wrap}
        .td-recovery-trigger{appearance:none;width:28px;height:34px;border:1px solid var(--apr-panel-border);border-radius:9px;background:var(--apr-panel-bg);color:var(--apr-muted);cursor:pointer;font:18px var(--apr-font)}
        .navigator[data-empty="true"] .td-minimap{display:none!important}
        .navigator[data-empty="true"] .rail{display:flex!important}
        .td-recovery-state[hidden],.td-probe-layer[hidden]{display:none!important}
        .td-probe-layer{position:fixed;inset:0;z-index:2147483647;display:grid;place-items:center;background:rgba(0,0,0,.24);font:13px/1.5 var(--apr-font)}
        .td-probe-card{box-sizing:border-box;width:min(620px,calc(100vw - 32px));max-height:80vh;padding:20px;border-radius:16px;background:var(--apr-dialog-bg);color:var(--apr-text);border:1px solid var(--apr-panel-border);box-shadow:var(--apr-shadow)}
        .td-probe-card textarea{box-sizing:border-box;width:100%;height:270px;resize:vertical;border:1px solid var(--apr-panel-border);border-radius:8px;padding:10px;background:var(--apr-input);color:var(--apr-text);font:12px/1.5 monospace;margin:12px 0}
        .td-probe-card h3{margin:0 0 8px;font-size:15px}.td-probe-card p{margin:0;color:var(--apr-muted)}
        .td-probe-actions{display:flex;justify-content:flex-end;gap:8px}
        .td-probe-instruction{position:fixed;top:18px;left:50%;transform:translateX(-50%);max-width:calc(100vw - 32px);padding:10px 16px;border-radius:10px;box-shadow:var(--apr-shadow);background:var(--apr-dialog-bg);color:var(--apr-text);font:13px/1.5 var(--apr-font);pointer-events:none;z-index:2147483647}
      `;shadowRoot.appendChild(style);
    }
    panel.hidden=!empty;navigatorEl.dataset.empty=String(empty);
    const old=railEl.querySelector('.td-recovery-trigger');
    if(!empty){old?.remove();return;}
    const capture = tdHistory.capture;
    const loading=chatGptApiStatus==='loading' || (capture && tdAlive(capture.scope) && capture.history.running),cooldown=tdReadState();
    panel.querySelector('.td-recovery-title').textContent=loading?'正在读取对话目录':chatGptApiStatus==='error'?'目录读取失败':'暂未取得会话目录';
    const request=tdHealth.requests.at(-1);
    panel.querySelector('.td-recovery-text').textContent=loading?'正在识别已加载的消息':tdReadWaitText();
    const retry=panel.querySelector('button');retry.disabled=Boolean(loading)||Math.max(cooldown.until,cooldown.next)>Date.now();retry.textContent=loading?'读取中…':'刷新大纲';
    const subtitle=shadowRoot.querySelector('.panel-subtitle');if(subtitle)subtitle.textContent=loading?'读取中':'暂无可定位的消息';
    if(!old){const b=document.createElement('button');b.type='button';b.className='td-recovery-trigger';b.textContent='⋮';b.title='对话目录状态';b.setAttribute('aria-label','对话目录状态');b.addEventListener('click',()=>tdSetOutlinePinned(navigatorEl.dataset.pinned!=='true'));railEl.appendChild(b);}
  }

  // Read-only identity discovery. A renamed data attribute is accepted ONLY when
  // its complete value equals a message ID already read for this exact branch.
  // There is no fuzzy text matching, positional pairing or React state access.
  const tdAdaptive = {epoch:-1,at:-Infinity,domRevision:-1,ids:new WeakMap(),roles:new WeakMap(),nodes:[],byId:new Map(),attributes:[],truncated:false};
  function tdAdaptiveDiscover(force=false) {
    if(tdAdaptive.epoch===td.epoch&&!force&&performance.now()-tdAdaptive.at<600)return;
    const known=tdDomKnownRoles();
    tdAdaptive.epoch=td.epoch;tdAdaptive.at=performance.now();
    tdAdaptive.ids=new WeakMap();tdAdaptive.roles=new WeakMap();tdAdaptive.nodes=[];tdAdaptive.byId=new Map();tdAdaptive.attributes=[];
    if(!known.size)return;
    const attrs=new Set();let budget=24000;tdAdaptive.truncated=false;
    const surfaces=[document,...tdDomScopes.shadows.keys()];
    for(const surface of surfaces){
      const walker=document.createTreeWalker(surface,NodeFilter.SHOW_ELEMENT,{acceptNode(n){
        if(n.matches('script,style,svg,nav,aside,button,input,textarea,select,[role="button"],[role="navigation"],#threaddeck-host,#prompt-rail-host,[contenteditable="true"],[contenteditable="plaintext-only"],[data-threaddeck-internal]'))return NodeFilter.FILTER_REJECT;
        return NodeFilter.FILTER_ACCEPT;
      }});
      for(let node=walker.nextNode();node;node=walker.nextNode()){
        if(--budget<0){tdAdaptive.truncated=true;break;}
        if(!(node instanceof HTMLElement))continue;
        const ids=[];
        for(const attr of node.attributes){
          if(attr.name!=='id'&&!attr.name.startsWith('data-'))continue;
          if(attr.value.length<8||attr.value.length>180||!known.has(attr.value))continue;
          if(!['user','assistant'].includes(known.get(attr.value)))continue;
          ids.push(attr.value);attrs.add(attr.name);
        }
        const roles=new Set(ids.map(id=>known.get(id)));
        if(!ids.length||roles.size!==1)continue;
        tdAdaptive.ids.set(node,[...new Set(ids)]);tdAdaptive.roles.set(node,[...roles][0]);tdAdaptive.nodes.push(node);
        for(const id of ids){if(!tdAdaptive.byId.has(id))tdAdaptive.byId.set(id,new Set());tdAdaptive.byId.get(id).add(node);}
      }
      if(budget<0)break;
    }
    tdAdaptive.attributes=[...attrs].sort();
  }
  function tdAdaptiveReset() {
    tdAdaptive.epoch=-1;tdAdaptive.at=-Infinity;tdAdaptive.ids=new WeakMap();tdAdaptive.roles=new WeakMap();
    tdAdaptive.nodes=[];tdAdaptive.byId.clear();tdAdaptive.attributes=[];
  }
  function tdAdaptiveValidIds(node) {
    // Revalidate before each use: a framework can recycle the same DOM object.
    const ids=tdAdaptive.ids.get(node)||[];
    if(tdAdaptive.epoch!==td.epoch||!node?.isConnected)return [];
    return ids.filter(id=>[...node.attributes].some(a=>(a.name==='id'||a.name.startsWith('data-'))&&a.value===id));
  }

  // Deliberately selector-independent diagnostics. Never serialize DOM text,
  // input values, URLs, IDs, tokens, or arbitrary attribute VALUES.
  function tdStructureShape(node) {
    if(!(node instanceof Element))return null;
    const tags={};for(const child of [...node.children].slice(0,160))tags[child.localName]=(tags[child.localName]||0)+1;
    const rect=node.getBoundingClientRect();
    const role=node.getAttribute('role');
    return {tag:node.localName,attributes:node.getAttributeNames().filter(n=>/^[\w:-]{1,64}$/.test(n)).sort().slice(0,40),
      classes:[...node.classList].filter(c=>/^[a-zA-Z][\w:-]{0,64}$/.test(c)&&!/\d{6}|[a-f0-9]{16}/i.test(c)).slice(0,20),
      role:['main','article','log','list','listitem','textbox','region','button','dialog','toolbar'].includes(role)?role:null,
      editable:isInsideComposer(node),childCount:node.childElementCount,childTags:tags,
      visible:rect.width>0&&rect.height>0,display:getComputedStyle(node).display,
      shadow:node.shadowRoot?.mode||null};
  }
  function tdStructurePath(node) {
    const result=[];for(let n=nodeAsElement(node),i=0;n&&i<18;i++,n=tdDomParent(n)){result.push(tdStructureShape(n));if(n===document.documentElement)break;}return result;
  }
  function tdRawDomInventory() {
    const result={readyState:document.readyState,elements:0,textNodesOutsideEditors:0,tags:{},dataAttributes:{},customElements:{},truncated:false};
    const walker=document.createTreeWalker(document,NodeFilter.SHOW_ELEMENT|NodeFilter.SHOW_TEXT,{acceptNode(n){
      if(n.nodeType===1&&n.matches('script,style,svg,nav,aside,button,input,textarea,select,[role="navigation"],#threaddeck-host,#prompt-rail-host,[contenteditable="true"],[contenteditable="plaintext-only"],[data-threaddeck-internal]'))return NodeFilter.FILTER_REJECT;
      return NodeFilter.FILTER_ACCEPT;
    }});
    let budget=30000;
    for(let n=walker.nextNode();n;n=walker.nextNode()){
      if(--budget<0){result.truncated=true;break;}
      if(n.nodeType===3){if(n.nodeValue?.trim())result.textNodesOutsideEditors++;continue;}
      result.elements++;const tag=n.localName;
      result.tags[tag]=(result.tags[tag]||0)+1;
      if(tag.includes('-'))result.customElements[tag]=(result.customElements[tag]||0)+1;
      for(const name of n.getAttributeNames())if(name.startsWith('data-')&&name.length<64)result.dataAttributes[name]=(result.dataAttributes[name]||0)+1;
    }
    const limit=o=>Object.fromEntries(Object.entries(o).sort((a,b)=>b[1]-a[1]).slice(0,60));
    result.tags=limit(result.tags);result.dataAttributes=limit(result.dataAttributes);result.customElements=limit(result.customElements);
    return result;
  }
  function tdShowDiagnosticText(text) {
    if(!shadowRoot){console.info('[ThreadDeck diagnostic]',text);return;}
    shadowRoot.querySelector('.td-probe-layer')?.remove();
    const layer=document.createElement('div');layer.className='td-probe-layer';layer.setAttribute('data-threaddeck-internal','');
    const card=document.createElement('div');card.className='td-probe-card';card.setAttribute('role','dialog');card.setAttribute('aria-modal','true');card.setAttribute('aria-label','页面结构诊断');
    const h=document.createElement('h3');h.textContent='页面结构诊断已采集';
    const p=document.createElement('p');p.textContent='只包含结构、数量和运行状态，不包含对话正文、草稿、登录凭证或会话 ID。';
    const textarea=document.createElement('textarea');textarea.readOnly=true;textarea.value=text;textarea.setAttribute('aria-label','诊断 JSON');
    const actions=document.createElement('div');actions.className='td-probe-actions';
    const copy=document.createElement('button');copy.type='button';copy.className='dialog-button primary';copy.textContent='复制诊断';
    copy.addEventListener('click',async()=>{try{await navigator.clipboard.writeText(text);copy.textContent='已复制';}catch{textarea.focus();textarea.select();copy.textContent='已选中，请按 Cmd/Ctrl+C';}});
    const close=document.createElement('button');close.type='button';close.className='dialog-button';close.textContent='关闭';
    const finish=()=>{layer.remove();window.removeEventListener('keydown',key,true);};
    const key=e=>{if(e.key==='Escape'){e.preventDefault();e.stopImmediatePropagation();finish();}};
    close.addEventListener('click',finish);layer.addEventListener('pointerdown',e=>{if(e.target===layer)finish();});window.addEventListener('keydown',key,true);
    actions.append(close,copy);card.append(h,p,textarea,actions);layer.appendChild(card);shadowRoot.appendChild(layer);copy.focus({preventScroll:true});
  }
  function tdPickBodyDiagnostic() {
    tdHealth.picker?.();
    if(navigatorEl)navigatorEl.dataset.pinned='false';
    if(settingsLayerEl)settingsLayerEl.hidden=true;
    shadowRoot?.querySelector('.td-probe-layer')?.remove();
    const notice=document.createElement('div');notice.className='td-probe-instruction';notice.textContent='请单击一处回答正文（不必选中文字）。Esc 取消；仅采集结构，不读取正文。';
    shadowRoot?.appendChild(notice);
    let timer;const scope=tdScope();
    const finish=()=>{notice.remove();clearTimeout(timer);window.removeEventListener('pointerdown',pick,true);window.removeEventListener('keydown',key,true);scope.signal.removeEventListener('abort',finish);tdHealth.picker=null;};
    const key=e=>{if(e.key==='Escape'){e.preventDefault();e.stopImmediatePropagation();finish();}};
    const pick=e=>{
      if(e.button!==0)return;
      const target=e.composedPath?.()[0]||e.target,el=nodeAsElement(target);
      if(!el||tdDomClosest(el,'#threaddeck-host,#prompt-rail-host'))return;
      e.preventDefault();e.stopImmediatePropagation();
      if(isInsideComposer(el)){notice.textContent='点到输入框了。请单击页面上方已生成的回答文字；Esc 取消。';return;}
      tdHealth.picked={kind:'explicit-body-click',ancestors:tdStructurePath(el)};
      finish();
      const result=tdDiagnostic();result.rawStructure=tdRawDomInventory();
      const text=JSON.stringify(result,null,2);tdShowDiagnosticText(text);
    };
    window.addEventListener('pointerdown',pick,true);window.addEventListener('keydown',key,true);scope.signal.addEventListener('abort',finish,{once:true});
    timer=setTimeout(finish,30000);tdHealth.picker=finish;
  }
  function tdInstallDiagnosticWatch() {
 window.addEventListener('error',event=>{
   const stack=String(event.error?.stack||'');
   if(/(?:threaddeck|tdDom|tdNav|tdBoot|captureReviewSelection|refreshNow)/i.test(stack))tdHealthFault('runtime',event.error);
 });
}


  // v1.7: status proof is intentionally independent of the rendered outline/cache.
  // A missing virtualized answer is missing evidence, not a running generation.
  const tdTurn = {
    serial: 0, proof: null, receipt: null, timer: null, pending: false, lastAttempt: 0,
    attempts: 0, failures: 0, unknownSince: 0, lastStrongAt: 0, source: '',
    revision: 0, unchanged: 0, fingerprint: '', changedAt: 0, checkToken: 0,
  };
  const tdDispatch = { last: null, recoveryBusy: false };
  const TD_STATE_CHECK_TIMEOUT_MS = 28000;
  const tdPerf = { highlightBuilds: 0, highlightPasses: 0, highlightMaxSliceMs: 0,
    editorMs: 0, editorMethod: '', send: null };
  let tdReviewRevision = 0;
  let tdReviewIndexes = new WeakMap();
  let tdReviewRootRevisions = new WeakMap();
  let tdReviewPainted = new Map();
  let tdReviewRestoreToken = 0;
  let tdReviewLifecycleInstalled = false;
  let tdSendCriticalUntil = 0;

  function tdResetTurnVerifier() {
    clearTimeout(tdTurn.timer);
    Object.assign(tdTurn, { serial: tdTurn.serial + 1, proof: null, receipt: null, timer: null,
      pending: false, lastAttempt: 0, attempts: 0, failures: 0, unknownSince: 0,
      lastStrongAt: 0, source: '', revision: 0, unchanged: 0, fingerprint: '', changedAt: 0, checkToken: tdTurn.checkToken + 1 });
    tdDispatch.last = null;
  }
  function tdMessageIdentity(nodeId, message) {
    return [...new Set([nodeId, message?.id, message?.metadata?.turn_id,
      message?.metadata?.turn_exchange_id].filter(v => typeof v === 'string' && v))];
  }
  function tdSectionIdentity(section) {
    if(!(section instanceof Element))return [];
    const role=tdDomRole(section)||((section.matches('[data-user-message-bubble]')||section.querySelector('[data-user-message-bubble]'))?'user':'assistant');
    const address=tdMessageAddress(section,role);
    return address.identityTokens;
  }
  // v1.7.6: an absent/ambiguous completion fact is UNKNOWN, not proof of RUNNING.
  // These private-page fields are compatibility evidence, not an official protocol.
  function tdTurnMessageFact(message) {
    const m=message || {}, meta=m.metadata || {};
    const types=[m.content?.content_type,meta.message_type,meta.content_type,meta.type];
    if (types.some(v=>/^(?:reasoning_recap|model_editable_context|user_editable_context)$/.test(String(v||''))))
      return {passive:true};
    const status=String(m.status || meta.status || '').toLowerCase();
    const channel=String(m.channel || meta.channel || meta.message_channel || '').toLowerCase();
    const end=typeof m.end_turn==='boolean' ? m.end_turn : typeof meta.end_turn==='boolean' ? meta.end_turn : null;
    const recipient=m.recipient==null || m.recipient==='all';
    // null and omitted recipient both mean no tool recipient. The general outline
    // filter predates that variant, so don't let it veto this independent proof.
    const hidden=hiddenChatGptMessage(m.recipient==null ? {...m,recipient:'all'} : m);
    const analysis=/^(?:analysis|commentary|reasoning|thinking|tool)$/.test(channel) ||
      types.some(v=>/^(?:analysis|reasoning|thinking|thoughts?|tool)$/.test(String(v||'')));
    const final=recipient && !hidden && !analysis && (!channel || channel==='final');
    const active=/^(?:in_progress|running|streaming|pending|queued|processing)$/.test(status);
    const success=/^(?:finished_successfully|completed|complete|succeeded)$/.test(status);
    const stopped=/^(?:cancelled|canceled|interrupted|failed|error|finished_partial)$/.test(status);
    const explicitFinal=meta.is_final===true || meta.final===true;
    const conflict=(active && (end===true || explicitFinal)) ||
      (typeof m.end_turn==='boolean' && typeof meta.end_turn==='boolean' && m.end_turn!==meta.end_turn);
    let state='unknown', reason='no-terminal-evidence';
    if (conflict) reason='conflicting-terminal-flags';
    else if (final && !active && end!==false && (end===true || success || explicitFinal)) {
      state='complete'; reason=end===true?'explicit-end-turn':success?'final-success-status':'explicit-final';
    } else if (recipient && stopped && end!==false) { state='complete'; reason='terminal-interruption'; }
    else if (active || end===false || !recipient) {
      state='running'; reason=active?'explicit-active-status':end===false?'explicit-open-turn':'tool-call';
    } else if (analysis) { state='running'; reason='analysis-awaiting-final'; }
    return {passive:false, hidden, final, status, channel, ended:end, terminal:state==='complete',state,reason};
  }

  function tdAnswerCompletionEvidence(section) {
    if (!(section instanceof HTMLElement) || !section.isConnected || isReasoningOrCollapsedOutlineContext(section)) return '';
    const imageTurn = tdGeneratedImageTurn(section);
    if (imageTurn) return imageTurn.matches('[data-talvt-turn-state="complete"]') ? 'image-turn-terminal-state' : '';
    const terminal = '[data-state="complete"],[data-state="completed"],[data-status="complete"],[data-status="completed"],[data-status="finished_successfully"],[data-turn-status="completed"],[data-turn-status="complete"],[data-talvt-turn-state="complete"]';
    if (section.matches(terminal)) return 'message-terminal-state';
    const candidates = [section];
    const own = tdSectionIdentity(section);
    // 回答容器与实际消息节点可能分开，终态必须属于当前回答。
    for (const node of tdDomQueryAll(section, terminal)) {
      if (tdDomExplicitRole(node) !== 'assistant' || isReasoningOrCollapsedOutlineContext(node, section)) continue;
      if (tdOwnMessageIds(node).some(id => own.includes(id))) return 'message-terminal-state';
    }
    for (let n = tdDomParent(section), depth = 0; n && depth < 8; n = tdDomParent(n), depth++) {
      if (n.matches('main,body,html,form,#thread,[data-thread-find-target]') || n.contains(getChatGptComposer())) break;
      // Do not borrow feedback/terminal chrome from a sibling answer or another turn.
      const other = tdDomQueryAll(n, tdDomRoleSelector('assistant') + ',[data-chatgpt-selection-message-id]')
        .some(x => x !== section && !section.contains(x) && !x.contains(section) &&
          !isReasoningOrCollapsedOutlineContext(x, n) &&
          (tdDomExplicitRole(x) === 'assistant' || x.hasAttribute('data-chatgpt-selection-message-id')) &&
          !tdSectionIdentity(x).some(id => own.includes(id)));
      if (other) break;
      candidates.push(n);
      if (n.matches('[data-turn-key],[data-turn-id-container],[data-testid^="conversation-turn-"]')) break;
    }
    for (const candidate of candidates) {
      if (candidate.matches(terminal)) return 'turn-terminal-state';
      for (const control of safeQueryAll(candidate, 'button,[role="button"]')) {
        if (!isElementVisible(control) || control.closest('#threaddeck-host,#prompt-rail-host,pre,code,details,[hidden],[aria-hidden="true"],[data-user-message-bubble]')) continue;
        const hint = normalizeText([control.getAttribute('data-testid'), control.getAttribute('data-test-id'),
          control.getAttribute('data-action'), control.getAttribute('aria-label'), control.getAttribute('title')].filter(Boolean).join(' ')).toLowerCase();
        if (/good-response-turn-action-button|bad-response-turn-action-button|thumbs[- ](?:up|down)|(?:good|bad|helpful|unhelpful)[ -]response|response[-_](?:good|bad|like|dislike)|(?:like|dislike)[-_]response|这个回答(?:有帮助|没有帮助)|回答(?:有帮助|无帮助)|赞同回答|反对回答|^(?:评价回复|rate this response|rate response)$/.test(hint)) return 'answer-feedback-controls';
      }
    }
    return '';
  }

  function tdAnswerImages(section, content) {
    const production = '[data-testid*="imagegen"],[data-testid*="generated-image"],[data-message-content]';
    return tdDomQueryAll(section, 'img').filter(image => {
      const authored = content?.contains(image);
      const gallery = image.closest(production);
      if (!authored && !gallery) return false;
      // 打开大图的按钮也是回答内容。头像、引用小图和操作栏不参与判断。
      if (image.closest('nav,aside,[hidden],[aria-hidden="true"],[data-testid*="citation"],[data-testid*="avatar"]'))
        return false;
      if (!gallery && image.closest('button') && Math.max(image.naturalWidth,image.width) < 64) return false;
      return !isReasoningOrCollapsedOutlineContext(image, section);
    });
  }

  function tdFinalSnapshotFor(section) {
    if (!(section instanceof HTMLElement)) return {section:null,root:null,key:'',text:'',hasContent:false,signature:'',completed:false,completionReason:''};
    const root=findAssistantContentRoot(section);
    const text=root?normalizeText(root.textContent||''):'';
    const images=tdAnswerImages(section, root);
    const loaded=images.filter(image=>image.complete && image.naturalWidth>=64 && image.naturalHeight>=64);
    const hasContent=Boolean(text || loaded.length);
    const loading=images.some(image=>!image.complete && (image.width>=64 || image.height>=64 ||
      image.closest('[data-testid*="imagegen"],[data-testid*="generated-image"]')));
    const key=tdNodeKey(section);
    const signature=hasContent ? key+':'+text.length+':'+hashString(text.slice(-512))+
      ':'+loaded.map(image=>hashString(image.currentSrc||image.src)).join(',') : '';
    const reason=hasContent && !loading ? tdAnswerCompletionEvidence(section) : '';
    return {section,root,key,text,hasContent,signature,completed:Boolean(reason),completionReason:reason};
  }

  function tdRecordDispatch(reason, activity = null) {
    const phase=activity?.phase || td.activityCache?.phase || '';
    if (tdDispatch.last?.reason!==reason || tdDispatch.last?.phase!==phase) {
      tdDispatch.last={reason,phase,at:Date.now()};
      if (reason!=='empty-queue') tdLog('send-gate',reason);
    }
    return false;
  }

  function tdDispatchDiagnostic(activity) {
    const composer=getChatGptComposer(), controls=tdSafeTask('send-controls',()=>({
      send:Boolean(findChatGptSendButton()),steer:Boolean(tdFindSteerControl(true)),stop:Boolean(findChatGptStopControl())
    }),{send:false,steer:false,stop:false});
    const blockers=[];
    if (!tdEnabled()) blockers.push('not-ready');
    if (td.tx || queueProcessing) blockers.push('transaction-active');
    if (tdEditor.active || td.writing) blockers.push('editor-active');
    if (composer && tdEditorBlocked(composer)) blockers.push('editor-recovery-required');
    if (td.composing) blockers.push('ime-active');
    if (!composer) blockers.push('composer-missing');
    if (composerHasAttachments(composer)) blockers.push('attachments');
    if (tdIntentBusy(activity)) blockers.push('waiting-for-turn');
    if (promptQueue.length) {
      if (queuePaused) blockers.push('queue-paused');
      if (!settings.autoRunQueue) blockers.push('auto-send-off');
      if (getComposerText(composer) && !(td.staged?.composer===composer && td.staged.expected===getComposerText(composer))) blockers.push('composer-draft');
      if (queueMenuOpenId) blockers.push('queue-menu-open');
      if (activeCommentMode==='compose') blockers.push('annotation-editing');
      if (shadowRoot?.activeElement?.matches?.('[data-queue-text]')) blockers.push('queue-editing');
      if (promptQueue[0]?.status==='uncertain') blockers.push('uncertain-send');
    }
    return {blockers,controls,preflight:tdDispatch.preflight?{...tdDispatch.preflight}:null,explicitSubmitAvailable:!td.tx&&!queueProcessing&&!tdEditor.active,
      last:tdDispatch.last?{reason:tdDispatch.last.reason,phase:tdDispatch.last.phase,ageMs:Date.now()-tdDispatch.last.at}:null,
      proofMatchesCurrent:Boolean(activity.proofApplies),exactFinalMounted:Boolean(activity.sameVisibleMessage),
      localFinalCompleted:Boolean(activity.localFinalCompleted),localFinalReason:activity.localFinalReason||'',
      run:td.run?{source:td.run.source,accepted:Boolean(td.run.accepted),ageMs:Date.now()-td.run.startedAt,
        hasExpected:Boolean(td.run.expected),hasUserIdentity:Boolean(td.run.userKey),scopedEnd:Boolean(td.run.networkFinal)}:null};
  }


  function tdPreferredSendControl(intent='queue') {
    const send=findChatGptSendButton();
    if(intent!=='native-now'&&intent!=='steer')return send;
    const steer=tdFindSteerControl(true);
    if(intent==='steer')return steer;
    const ui=tdReadActiveUI(tdFinalSnapshot());
    const proof=tdTurn.proof;
    const running=Boolean(ui.stopControl||ui.indicator||proof?.state==='running'&&tdProofApplies(proof,tdLocalUserSnapshot(),td.run));
    return running?(steer||send):(send||steer);
  }

  async function tdSubmitOnce() {
    if (tdDispatch.recoveryBusy) return false;
    tdDispatch.recoveryBusy=true;
    try {
      const composer=getChatGptComposer();
      if (composer && getComposerText(composer)) return await tdSendComposerNow(composer);
      if (promptQueue.length) return await tdInterjectQueueItem(promptQueue[0].id);
      showToast('输入框和队列都为空，没有发送任何内容',2000); return false;
    } finally { tdDispatch.recoveryBusy=false; }
  }

  function tdUncertainDraft(text) {
    const normalized=normalizeInlineReviewText(text);
    return promptQueue.some(item=>item.status==='uncertain' &&
      normalized===normalizeInlineReviewText(composePromptWithReviewComments(item.text,item.comments||[])));
  }

  function tdExtractTurnProof(conversation, startedAt, serial) {
    if (!(typeof conversation?.current_node === 'string' && conversation.mapping?.[conversation.current_node]) &&
        !conversation?.linear_conversation?.length) return null;
    const chain = walkChatGptActiveBranch(conversation);
    if (!chain.length) return null;
    const knownUsers = new Set(); let user = null, userMessage = null, last = null;
    for (const {nodeId, node} of chain) {
      const m = node?.message; if (!m?.author) continue;
      if (m.author.role === 'user') {
        if (hiddenChatGptMessage(m.recipient==null ? {...m,recipient:'all'} : m) && !chatGptAutomationMetadata(m)?.isTrigger) continue;
        const ids = tdMessageIdentity(nodeId, m); ids.forEach(id => knownUsers.add(id));
        user = {ids}; userMessage = m; last = null;
      } else if (m.author.role === 'assistant' && user) {
        const fact = tdTurnMessageFact(m);
        if (fact.passive) continue;
        // Hidden bookkeeping without explicit activity must not erase a terminal
        // final. Analysis/tool requests with explicit open state still invalidate it.
        if (last?.terminal && fact.hidden && fact.state === 'unknown') continue;
        last = {...fact, ids: tdMessageIdentity(nodeId, m)};
      } else if (m.author.role === 'tool' && user) {
        // A tool return is never itself end-of-turn. An unexpected trailing tool
        // after a final is a conflict to recheck, not a manufactured running proof.
        last = {ids:[nodeId], terminal:false, state:last?.terminal ? 'unknown' : 'running',
          status:'tool', channel:'tool', final:false, ended:false, reason:'tool-return'};
      }
    }
    if (!user) return null;
    user.digest = hashString(normalizeInlineReviewText(extractChatGptMessageRawText(userMessage)));
    return {epoch:td.epoch, serial, startedAt, receivedAt:Date.now(), user, knownUsers,
      answer:last, state:last?.state || 'unknown', reason:last?.reason || 'no-answer-evidence'};
  }
  function tdAcceptTurnProof(conversation, startedAt, serial) {
    if(!tdPayloadBelongs(conversation,getChatGptConversationResource()))return false;
    tdReceiptObserveConversation(conversation,startedAt);
    if (serial !== tdTurn.serial) { tdLog('turn-proof-discarded','newer-local-turn'); return false; }
    const proof = tdExtractTurnProof(conversation, startedAt, serial);
    if (!proof || (tdTurn.proof && proof.startedAt < tdTurn.proof.startedAt)) return false;
    const previous=tdTurn.proof;
    if (previous?.state==='complete' && previous.epoch===proof.epoch && previous.serial===proof.serial &&
        proof.state!=='complete' && previous.user.ids.some(id=>proof.user.ids.includes(id)) &&
        previous.answer?.ids.some(id=>proof.answer?.ids.includes(id))) {
      tdLog('turn-proof-stale','terminal-pair-preserved'); return true;
    }
    const fingerprint = hashString(JSON.stringify([proof.user.ids,proof.answer?.ids,proof.state,
      proof.answer?.status,proof.answer?.channel,proof.answer?.ended,proof.reason]));
    if (fingerprint === tdTurn.fingerprint) tdTurn.unchanged++;
    else { tdTurn.fingerprint=fingerprint; tdTurn.unchanged=0; tdTurn.changedAt=Date.now(); }
    tdTurn.revision++; tdTurn.proof=proof; tdTurn.source='conversation-status'; tdTurn.failures=0;
    if (td.run && proof.state==='running' && tdProofApplies(proof,tdLocalUserSnapshot(),td.run)) {
      td.run.seenOpenAnswerIds=[...(proof.answer?.ids||[])]; td.run.seenOpenUserIds=[...proof.user.ids];
    }
    td.activityDirty=true; tdWake(0); tdLog('turn-proof',proof.state+'/'+proof.reason);
    return true;
  }
  function tdProofApplies(proof, user, run) {
    if (!proof || proof.epoch !== td.epoch || proof.serial !== tdTurn.serial) return false;
    if (run) {
      if (proof.startedAt < run.startedAt) return false;
      if (run.expected) return proof.user.digest === hashString(normalizeInlineReviewText(run.expected)) &&
        (run.userKey ? proof.user.ids.includes(run.userKey) || tdSectionIdentity(user.section).some(id => proof.user.ids.includes(id)) :
          !proof.user.ids.includes(run.baseline));
      if (run.userKey && !proof.user.ids.includes(run.userKey)) return false;
      if (['observed-network','observed-busy'].includes(run.source) && proof.state === 'complete' &&
          run.initialCompleted && proof.answer?.ids.includes(run.initialFinalKey) &&
          !(proof.answer.ids.some(id=>run.seenOpenAnswerIds?.includes(id)) && proof.user.ids.some(id=>run.seenOpenUserIds?.includes(id)))) return false;
      // Direct UI activity wins in the evaluator. A GET started during that exact
      // generation may validly finish afterwards: last UI poll time isn't a turn ID.
      return true;
    }
    const ids=[...new Set([...tdReceiptUserIds(user.section),...tdSectionIdentity(user.section)])];
    return !user.section || ids.some(id=>proof.knownUsers.has(id));
  }
  function tdScheduleTurnCheck(delay=160,force=false) {
 // Completion/receipt checks are local consumers, never independent GET loops.
 if(!tdEnabled())return;
 const snap=tdReads.snap;
 if(snap&&!snap.outlineOnly&&snap.resource.key===getChatGptConversationResource()?.key&&snap.epoch===td.epoch&&snap.serial===tdTurn.serial&&
    snap.seq!==tdTurn.passiveSequence&&!tdSelectionBusy()&&tdPayloadBelongs(snap.data,snap.resource)&&tdSnapshotInfo(snap.data,snap.resource).complete){
   tdTurn.passiveSequence=snap.seq;tdAcceptTurnProof(snap.data,snap.startedAt,snap.serial);
 }
 tdTurn.pending=false;if(!tdTurn.proof)tdTurn.source='local-ui+passive';
}
  function tdRememberCompletion(reason) {
    const user=tdLocalUserSnapshot(), final=tdFinalSnapshot();
    const proof=reason==='exact-final-controls'||reason==='own-final-controls' ? null : tdProofApplies(tdTurn.proof,user,td.run)?tdTurn.proof:null;
    const userIds=proof?.user?.ids?.length ? [...proof.user.ids] : [...new Set([...tdReceiptUserIds(user.section),...tdSectionIdentity(user.section)])];
    const answerIds=proof?.answer?.ids?.length ? [...proof.answer.ids] : tdSectionIdentity(final.section);
    if (td.run?.userKey && !userIds.includes(td.run.userKey)) userIds.push(td.run.userKey);
    tdTurn.receipt={epoch:td.epoch,serial:tdTurn.serial,userIds,answerIds,knownUsers:new Set(userIds),reason};
  }
  function tdCompleteCurrentRun(reason) {
    tdRememberCompletion(reason);
    td.run = null; td.settleSince = 0; chatGptNetworkTokens.clear();
    tdTurn.unknownSince = 0; tdTurn.source = reason;
    tdLog('turn-completed', reason);
    scheduleChatGptApiRefresh('turn-completed', 900);
  }
  function tdSendingCritical() {
    return Boolean(td.tx && !td.tx.clicked) || performance.now() < tdSendCriticalUntil;
  }

  function tdLog(event, detail = '') {
    // No conversation IDs, text, access tokens, DOM snapshots or URLs in diagnostics.
    td.log.push({ at: new Date().toISOString(), event, detail: String(detail).slice(0, 140) });
    if (td.log.length > 120) td.log.shift();
  }
  function tdScope() { return { epoch: td.epoch, key: routeKey, signal: td.controller.signal }; }
  function tdAlive(scope) {
    return Boolean(scope && scope.epoch === td.epoch && scope.key === routeKey &&
      getRouteKey() === scope.key && !scope.signal.aborted && !destroyed);
  }
  function tdEnabled() {
    return Boolean(td.ready && settings.enabled && site.id === 'chatgpt' &&
      isCurrentPageEligible() && !isChatGptSharePage() && getRouteKey() === routeKey);
  }
  function tdInvalidate() {
    if(tdEditor.active && !tdEditor.active.acceptedCleanup && tdAlive(tdEditor.active.scope))tdEditorRollback(tdEditor.active);
    tdHealth.picker?.(); tdHealth.picked=null;tdHealth.selectionSample=null;tdAdaptiveReset();
    tdLiveReset(); tdDomScopes.census=null;tdDomScopes.lastAttempt=null;tdDomScopes.lastAnswerSelection=null;tdDomState.revision++; tdDomState.lastShape = []; tdDomState.selection = 'not-selected';
    // Persist the old item's uncertain state before the current route is replaced.
    const accepted=Boolean(td.tx && (td.tx.confirmed || td.tx.item.sendReceipt?.ackedAt));
    if(accepted){td.tx.confirmed=true;promptQueue=promptQueue.filter(q=>q.id!==td.tx.item.id);}
    if (td.tx?.direct && !accepted && !promptQueue.some(row => row.id === td.tx.item.id)) {
      if (td.tx.clicked) promptQueue.push(td.tx.item);
      else { td.tx.abandoned = true; if (td.tx.item.comments?.length) restorePendingReviewSnapshot(td.tx.item.comments); }
    }
    if (td.tx && !accepted) {
      td.tx.item.status = td.tx.clicked ? 'uncertain' : 'waiting';
      td.tx.item.error = td.tx.clicked ? '页面已切换，请先核对这条问题是否已经发送' : '';
      if (td.tx.clicked) queuePaused = true;
    }
    saveWorkflowState();
    td.controller.abort();
    for (const reader of td.networkReaders) { try { void reader.cancel().catch(() => {}); } catch {} }
    td.networkReaders.clear();
    td.epoch += 1;
    td.controller = new AbortController();
    td.ready = false; td.tx = null; td.staged = null; td.gesture = null;
    td.nativeIntent = null; td.enterGuard = null; td.beforeInputNewline = false;
    td.pointerHold = null; td.editingQueueId = ''; td.menuRenderKey = '';
    tdResetMinimap();
    tdZoomReset();
    td.allowButton = null; td.allowForm = null; td.run = null; td.manualCompletion = '';
    td.lastUser = ''; td.lastFinal = ''; td.finalChangedAt = 0; td.settleSince = 0;
    td.activityDirty = true; td.activityCache = null; td.routeStartedAt = Date.now();
    const search = shadowRoot?.querySelector('.td-search');
    if (search) search.value = '';
    const clearSearch = shadowRoot?.querySelector('.outline-search-clear');
    if (clearSearch) clearSearch.hidden = true;
    td.search = ''; td.expandAll.clear(); td.outlineCache.clear();
    window.clearTimeout(td.wakeTimer); td.wakeTimer = null;
    tdDispatch.preflight=null;
    tdLog('route-cancel');
  }
  function tdDelay(ms, scope) {
    return new Promise((resolve) => {
      if (scope && !tdAlive(scope)) return resolve(false);
      const timer = setTimeout(() => { scope?.signal.removeEventListener('abort', abort); resolve(!scope || tdAlive(scope)); }, ms);
      function abort() { clearTimeout(timer); resolve(false); }
      scope?.signal.addEventListener('abort', abort, { once: true });
    });
  }
  async function tdUntil(test, timeout, scope, interval = 60) {
    const start = Date.now();
    do {
      if (!tdAlive(scope)) return false;
      if (test()) return true;
      if (!(await tdDelay(interval, scope))) return false;
    } while (Date.now() - start < timeout);
    return false;
  }
  // v1.7.5: full-document writes are NOT synthetic paste-at-selection operations.
  // Prefer a verified editor-owned transaction. Unknown editors get one native
  // replacement, only after a full DOM selection has survived reconciliation.
  const tdEditor = { active: null, last: null, receipts: new WeakMap(), blocked: new WeakMap() };
  function tdEditorSameNode(a,b) { try { return a === b || Boolean(a?.isSameNode?.(b)); } catch { return false; } }
  function tdEditorPageNode(node) {
    return node;
  }
  function tdEditorLexicalText(json) {
    const read = n => {
      if (!n) return '';
      if (n.type === 'text' || n.type === 'code-highlight') return String(n.text || '');
      if (n.type === 'linebreak') return '\n';
      if (n.type === 'tab') return '\t';
      return (n.children || []).map(read).join(n.type === 'root' || n.type === 'list' ? '\n' : '');
    };
    return normalizeMultilineText(read(json?.root || json));
  }
  function tdEditorResolve(composer) {
    const node = tdEditorPageNode(composer);
    if (composer instanceof HTMLTextAreaElement || composer instanceof HTMLInputElement) {
      const proto = composer instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
      return { kind:'text-control', snapshot:()=>composer.value, text:()=>getComposerText(composer),
        write(value) { Object.getOwnPropertyDescriptor(proto,'value').set.call(composer,value); dispatchComposerInput(composer,value || null); },
        restore(value) { this.write(value); } };
    }
    // Instance discovery is optional and tightly scoped to the exact composer.
    // Never walk React fibers or call arbitrary application callbacks.
    try {
      const editor = node.__lexicalEditor || composer.__lexicalEditor;
      if (editor && tdEditorSameNode(editor.getRootElement?.(),composer) &&
          ['getEditorState','parseEditorState','setEditorState'].every(k=>typeof editor[k] === 'function')) {
        return { kind:'lexical',
          snapshot:()=>editor.getEditorState(),
          text:()=>tdEditorLexicalText(editor.getEditorState().toJSON()),
          valid() { return tdEditorSameNode(editor.getRootElement(),composer) && editor.isEditable?.() !== false; },
          supports() {
            const allowed = new Set(['root','paragraph','text','linebreak','tab','heading','quote','list','listitem','link','autolink','code','code-highlight']);
            const check=n=>allowed.has(n.type) && (!n.children || n.children.every(check));
            return check(editor.getEditorState().toJSON().root);
          },
          write(value) {
            const children=[];
            value.split('\n').forEach((line,i)=>{
              if(i) children.push({type:'linebreak',version:1});
              if(line) children.push({type:'text',version:1,text:line,format:0,detail:0,mode:'normal',style:''});
            });
            const json={root:{type:'root',version:1,format:'',indent:0,direction:null,children:[
              {type:'paragraph',version:1,format:'',indent:0,direction:null,textFormat:0,textStyle:'',children}
            ]}};
            editor.setEditorState(editor.parseEditorState(JSON.stringify(json)),{tag:'threaddeck-replace'});
          },
          restore(state) { editor.setEditorState(state,{tag:'threaddeck-rollback'}); }
        };
      }
    } catch { /* Try the next explicitly supported editor. */ }
    try {
      const views=[node.pmViewDesc?.view,composer.pmViewDesc?.view,node.editor?.view];
      for(let parent=node.parentElement,depth=0;parent && depth<3;parent=parent.parentElement,depth++) {
        if(parent.matches('main,body,html'))break;
        views.push(parent.editor?.view);
      }
      const view=views.find(v=>tdEditorSameNode(v?.dom,composer));
      if (view && tdEditorSameNode(view.dom,composer) && typeof view.dispatch === 'function' &&
          view.state?.schema?.nodes?.paragraph && typeof view.state.doc?.textBetween === 'function') {
        return { kind:'prosemirror', snapshot:()=>({doc:view.state.doc,selection:view.state.selection}),
          text:()=>normalizeMultilineText(view.state.doc.textBetween(0,view.state.doc.content.size,'\n','\n')),
          valid:()=>!view.isDestroyed && view.editable !== false && tdEditorSameNode(view.dom,composer),
          supports() { let ok=true; view.state.doc.descendants(n=>{ if(n.isLeaf && !n.isText && n.type.name !== 'hard_break')ok=false; }); return ok; },
          write(value) {
            const schema=view.state.schema;
            const nodes=value.split('\n').map(line=>schema.nodes.paragraph.create(null,line?schema.text(line):null));
            const tr=view.state.tr.replaceWith(0,view.state.doc.content.size,nodes);
            if(typeof view.state.selection.constructor.atEnd === 'function') tr.setSelection(view.state.selection.constructor.atEnd(tr.doc));
            view.dispatch(tr.setMeta('threaddeck','replace'));
          },
          restore(state) {
            const tr=view.state.tr.replaceWith(0,view.state.doc.content.size,state.doc.content);
            try { tr.setSelection(state.selection.constructor.fromJSON(tr.doc,state.selection.toJSON())); } catch { /* Document restoration still applies. */ }
            view.dispatch(tr.setMeta('threaddeck','rollback'));
          }
        };
      }
    } catch { /* Native contenteditable fallback; no framework private-state writes. */ }
    return {kind:'native-contenteditable',snapshot:()=>null,text:()=>getComposerText(composer)};
  }
  function tdEditorOwned(rec) {
    try {
      return Boolean(rec && tdAlive(rec.scope) && settings.enabled && !td.composing &&
        rec.composer.isConnected && rec.composer === getChatGptComposer() &&
        (td.editorRevision.get(rec.composer)||0) === rec.revision && rec.adapter.valid?.() !== false);
    } catch { return false; }
  }
  function tdEditorFailureText() {
    const last=tdEditor.last;
    if(last?.recovery === 'blocked') return '合并写入未通过校验，已停止发送；原问题和注释已备份，可在设置的“诊断与恢复”中复制';
    if(last?.recovery === 'restored') return '合并写入未通过校验，已恢复原问题；注释保留，没有发送';
    if(last?.reason === 'draft-changed') return '输入框或草稿已变化，已取消合并；没有发送';
    return '未能确认编辑器完整替换内容，已停止；问题和注释没有提交';
  }
  function tdEditorRecord(rec,phase,reason='') {
    rec.phase=phase;
    tdEditor.last={adapter:rec.adapter.kind,phase,reason,recovery:rec.recovery||'',
      beforeChars:rec.expected.length,intendedChars:rec.value.length,actualChars:getComposerText(rec.composer).length,
      replacementCount:rec.attempted?1:0,fullSelection:rec.fullSelection||false,
      elapsedMs:Math.round(performance.now()-rec.started)};
  }
  function tdEditorBackup(rec) {
    // Only on a failed, owned write. Never infer or strip A/Q-looking text.
    tdEditor.blocked.set(rec.composer,rec);
    try { workspaceSession.setItem(`prompt-rail:editor-recovery:${hashString(rec.scope.key)}`,
      JSON.stringify({route:rec.scope.key,before:rec.expected,merged:rec.value,observed:rec.observed,at:Date.now()})); } catch { /* In-memory receipt remains. */ }
  }
  function tdEditorBlocked(composer) {
    let rec=tdEditor.blocked.get(composer);
    if(!rec) {
      try {
        const raw=JSON.parse(workspaceSession.getItem(`prompt-rail:editor-recovery:${hashString(routeKey)}`)||'null');
        if(raw?.route===routeKey && Date.now()-raw.at < 86400000 && raw.observed === getComposerText(composer))
          rec={expected:raw.before,value:raw.merged,observed:raw.observed,scope:tdScope(),composer};
      } catch { /* Optional recovery. */ }
    }
    if(rec && tdAlive(rec.scope) && rec.observed === getComposerText(composer)) {
      if(tdRecoverVerifiedMerge(composer,rec))return null;
      return rec;
    }
    tdEditor.blocked.delete(composer);
    try { workspaceSession.removeItem(`prompt-rail:editor-recovery:${hashString(routeKey)}`); } catch {}
    return null;
  }
  function tdEditorRollback(rec) {
    if(!rec || rec.committed || !rec.attempted || !tdEditorOwned(rec)) return false;
    const now=getComposerText(rec.composer);
    let modelText=null;
    try { modelText=rec.adapter.text(); } catch { /* A failed owner must not break route cleanup. */ }
    if(now===rec.expected && modelText===rec.expected) { rec.recovery='restored'; return true; }
    // A changed user draft is not ours to restore. Synchronous partial mutations
    // are captured before yielding; delayed unknown mutations must not be guessed.
    if(now!==rec.observed && now!==rec.value) return false;
    const wasWriting=td.writing; td.writing=true;
    try {
      if(rec.adapter.restore) rec.adapter.restore(rec.snapshot);
      else if(rec.nativeUndoable && typeof document.execCommand === 'function') {
        rec.composer.focus({preventScroll:true});
        document.execCommand('undo',false,null);
      }
      const restored=getComposerText(rec.composer)===rec.expected && rec.adapter.text()===rec.expected;
      rec.recovery=restored?'restored':'blocked';
      if(!restored) {rec.observed=getComposerText(rec.composer);tdEditorBackup(rec);}
      tdEditorRecord(rec,restored?'rolled-back':'blocked',restored?'':'rollback-unavailable');
      return restored;
    } catch { rec.recovery='blocked';rec.observed=getComposerText(rec.composer);tdEditorBackup(rec);return false; }
    finally {td.writing=wasWriting;}
  }
  function tdRollbackPreparedEditor(tx) {
    if(!tx || tx.clicked) return false;
    const rec=tx.editorWrite || tdEditor.receipts.get(tx.composer);
    return rec?.scope?.epoch===tx.scope.epoch && rec.scope.key===tx.scope.key && rec.expected===tx.expected ? tdEditorRollback(rec) : false;
  }
  function tdAnnotationQuestion(composer,text) {
    const rec=tdEditor.receipts.get(composer);
    // Only recognise OUR unsubmitted output on the SAME live composer/route.
    // This is not a text heuristic: arbitrary prompts starting with 【注释】
    // must remain verbatim. Preserve edits the user made after the known prefix.
    if(rec && rec.attempted && !rec.committed && tdAlive(rec.scope) &&
       rec.generatedPrefix && text.startsWith(rec.generatedPrefix))
      return text.slice(rec.generatedPrefix.length);
    return text;
  }
  function tdEditorSelection(composer) {
    const selection=composer.ownerDocument.getSelection();
    if(!selection || selection.rangeCount!==1) return false;
    const range=selection.getRangeAt(0);
    if(!composer.contains(range.startContainer)||!composer.contains(range.endContainer))return false;
    const before=composer.ownerDocument.createRange(),after=composer.ownerDocument.createRange();
    before.selectNodeContents(composer);before.setEnd(range.startContainer,range.startOffset);
    after.selectNodeContents(composer);after.setStart(range.endContainer,range.endOffset);
    return !normalizeInlineReviewText(before.toString()) && !normalizeInlineReviewText(after.toString()) &&
      normalizeInlineReviewText(range.toString())===normalizeInlineReviewText(composer.textContent);
  }
  function tdEditorSelectAll(composer) {
    const doc=composer.ownerDocument,selection=doc.getSelection();
    if(!selection)return false;
    const range=doc.createRange();range.selectNodeContents(composer);
    selection.removeAllRanges();selection.addRange(range);
    // Model editors often consume selectionchange on the next task. This is a
    // selection notification, NOT a pretend paste/default-action notification.
    doc.dispatchEvent(new Event('selectionchange'));
    return tdEditorSelection(composer);
  }
  async function tdEditorFrame(scope) {
    return new Promise(resolve=>{
      let frame=null,timer=null,done=false;
      const finish=()=>{if(done)return;done=true;cancelAnimationFrame(frame);clearTimeout(timer);scope.signal.removeEventListener('abort',finish);resolve(tdAlive(scope));};
      scope.signal.addEventListener('abort',finish,{once:true});frame=requestAnimationFrame(finish);timer=setTimeout(finish,90);
      if(!tdAlive(scope))finish();
    });
  }
  async function tdWriteEditor(composer,value,expected,scope) {
    if(tdEditor.active || !tdAlive(scope) || !settings.enabled || !composer?.isConnected ||
        composer!==getChatGptComposer() || td.composing || getComposerText(composer)!==expected)return false;
    value=normalizeMultilineText(value);
    const adapter=tdEditorResolve(composer);
    const rec={composer,scope,adapter,expected,value,observed:expected,revision:td.editorRevision.get(composer)||0,
      started:performance.now(),attempted:false,nativeUndoable:false,phase:'preflight',recovery:'',snapshot:null};
    tdEditor.active=rec;tdEditor.receipts.set(composer,rec);
    if(td.tx?.composer===composer) {
      td.tx.editorWrite=rec;
      const prefix=formatReviewCommentsPrefix(td.tx.item?.comments || []);
      if(prefix && value.startsWith(prefix+'\n\n本轮问题：\n'))rec.generatedPrefix=prefix+'\n\n本轮问题：\n';
    }
    let inputObserved=false,nativeInput=false;
    const input=e=>{inputObserved=true;if(e.isTrusted && /^(?:insertText|insertHTML|deleteContentBackward|deleteContent)$/.test(e.inputType||''))nativeInput=true;};
    composer.addEventListener('input',input,true);
    try {
      if(adapter.valid?.()===false || adapter.supports?.()===false || adapter.text()!==expected ||
          composer.querySelector?.('[contenteditable="false"]')) {
        tdEditorRecord(rec,'rejected','unsupported-or-unsynced-editor');return false;
      }
      rec.snapshot=adapter.snapshot();
      if(value===expected) {tdEditorRecord(rec,'verified');return true;}
      composer.focus({preventScroll:true});
      if(adapter.kind==='native-contenteditable') {
        if(!composer.isContentEditable || composer.editContext || typeof document.execCommand !== 'function') {
          tdEditorRecord(rec,'rejected','native-replace-unavailable');return false;
        }
        // Two turns of the event loop allow a framework selection to reconcile.
        // Any intervening typing, navigation or composer replacement cancels this write.
        if(!tdEditorSelectAll(composer) || !await tdEditorFrame(scope) || !await tdDelay(0,scope) ||
            !tdEditorOwned(rec) || getComposerText(composer)!==expected) {
          tdEditorRecord(rec,'cancelled','draft-changed');return false;
        }
        rec.fullSelection=tdEditorSelection(composer);
        if(!rec.fullSelection) {tdEditorRecord(rec,'rejected','full-selection-lost');return false;}
      }
      if(!tdEditorOwned(rec)||getComposerText(composer)!==expected){tdEditorRecord(rec,'cancelled','draft-changed');return false;}
      const wasWriting=td.writing;td.writing=true;
      try {
        rec.attempted=true;
        if(adapter.write)adapter.write(value);
        else {
          const safe=value.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
            .replace(/"/g,'&quot;').replace(/'/g,'&#39;').replace(/\n/g,'<br>');
          // No synthetic paste path and no second insert if an owner changes text.
          const ok=value?document.execCommand(value.includes('\n')?'insertHTML':'insertText',false,value.includes('\n')?safe:value):document.execCommand('delete',false,null);
          rec.nativeUndoable=Boolean(ok&&nativeInput);
        }
        rec.observed=getComposerText(composer);
        // A model transaction already notifies its owner. Replaying an InputEvent
        // containing the same text here could make that owner insert it again.
        if(adapter.kind==='native-contenteditable' && !inputObserved && rec.observed===value)
          dispatchComposerInput(composer,value||null);
      } catch(error) {
        // A handler may throw AFTER modifying its model. Capture that partial
        // output before leaving this synchronous operation so rollback owns it.
        rec.observed=getComposerText(composer);
        throw error;
      } finally {td.writing=wasWriting;}
      tdPerf.editorMethod=`${adapter.kind}-replace`;
      // Always wait for model/DOM reconciliation before reading or clicking Send.
      for(let i=0;i<2;i++) {
        if(!await tdEditorFrame(scope)||!tdEditorOwned(rec)) {tdEditorRecord(rec,'cancelled','draft-changed');return false;}
      }
      if(getComposerText(composer)!==value || adapter.text()!==value) {
        tdEditorRollback(rec);
        if(rec.recovery!=='restored' && tdEditorOwned(rec)) {rec.observed=getComposerText(composer);rec.recovery='blocked';tdEditorBackup(rec);}
        tdEditorRecord(rec,'rejected','replacement-mismatch');return false;
      }
      rec.observed=value;
      tdEditor.blocked.delete(composer);
      try{workspaceSession.removeItem(`prompt-rail:editor-recovery:${hashString(scope.key)}`);}catch{}
      tdEditorRecord(rec,'verified');return true;
    } catch(error) {
      if(rec.attempted) {
        tdEditorRollback(rec);
        if(rec.recovery!=='restored' && tdEditorOwned(rec)) {rec.observed=getComposerText(composer);rec.recovery='blocked';tdEditorBackup(rec);}
      }
      tdEditorRecord(rec,'rejected',error?.name||'editor-error');tdLog('editor-write-failed',error?.name||'Error');return false;
    } finally {
      composer.removeEventListener('input',input,true);
      if(tdEditor.active===rec)tdEditor.active=null;
      tdPerf.editorMs=Math.round((performance.now()-rec.started)*10)/10;td.activityDirty=true;
    }
  }

  // Submission acknowledgements are not generation-completion proofs. Their only
  // authority is to retire ONE local outbox record, never to release the next turn.
  const tdOutbox = { pauseOwner: '', last: null, checks: 0, decision:null, runtime: new WeakMap() };
  const TD_USER_BODY = '[data-user-message-bubble],message-content,.user-message-bubble-color,.whitespace-pre-wrap,[data-message-content]';
  const TD_USER_SELECTOR = '[data-user-message-bubble],[data-conversation-role="user"],[data-message-author-role="user"],[data-message-role="user"],[data-author-role="user"],[data-role="user"],[data-turn="user"],user-query';
  const TD_USER_IDS = ['data-chatgpt-selection-message-id','data-message-id','data-node-id','data-chatgpt-search-message-ids','data-turn-key','data-turn-id','data-turn-id-container'];
  function tdReceiptIdsOn(node) {
    if (!(node instanceof Element)) return [];
    const ids = [];
    for (const name of TD_USER_IDS) {
      const value=node.getAttribute(name); if (!value || value.length>4096) continue;
      if (name==='data-chatgpt-search-message-ids' && value.trim().startsWith('[')) {
        try { const list=JSON.parse(value); if(Array.isArray(list))ids.push(...list.filter(v=>typeof v==='string' && v.length>=8 && v.length<220)); } catch {}
      } else if (value.length>=8 && value.length<220) ids.push(value);
    }
    return [...new Set(ids)];
  }
  function tdReceiptUserIds(section) {
    return tdMessageAddress(section,'user').identityTokens;
  }
  function tdReceiptUserCandidates() {
    // Fresh user messages must not depend on an API snapshot knowing their IDs.
    // The bubble and explicit role are page semantics, not text-based inference.
    const found=tdDomQueryAll(document,TD_USER_SELECTOR).filter(n=>tdDomSafe(n) && tdDomTreeShown(n) &&
      !isInsideComposer(n) && !tdDomClosest(n,'[hidden],[aria-hidden="true"],details:not([open])'));
    return found.filter(n=>!found.some(o=>o!==n && tdDomContains(n,o))).sort(compareDomOrder);
  }
  function tdReceiptReadText(source) {
    // Detached clone.innerText falls back to textContent and loses block breaks.
    // Read authored blocks without layout queries and never insert whitespace
    // between inline spans (important for CJK and split syntax highlighting).
    const chunks=[];let budget=60000;
    const block=/^(P|DIV|LI|H[1-6]|SECTION|ARTICLE|PRE|BLOCKQUOTE|UL|OL)$/;
    function visit(node,depth=0) {
      if(--budget<0 || depth>100)return;
      if(node.nodeType===Node.TEXT_NODE){chunks.push(node.nodeValue||'');return;}
      if(!(node instanceof Element) || node.matches('button,[role="button"],svg,script,style,input,textarea,select,[aria-hidden="true"],[hidden],.sr-only,[data-testid*="action" i],[data-threaddeck-internal]'))return;
      if(node.tagName==='BR'){chunks.push('\n');return;}
      const boundary=block.test(node.tagName);
      if(boundary)chunks.push('\n');
      for(const child of node.childNodes)visit(child,depth+1);
      if(boundary)chunks.push('\n');
    }
    visit(source);
    return budget<0 ? '' : normalizeMultilineText(chunks.join(''));
  }
  function tdReceiptSerialize(raw) {
    if(!raw || raw.schema!==1 || typeof raw.route!=='string' || !Number.isFinite(raw.startedAt))return null;
    const ids=values=>[...new Set((Array.isArray(values)?values:[]).filter(v=>typeof v==='string'&&v.length>=1&&v.length<220))].slice(0,12000);
    return {schema:1,routeKey:typeof raw.routeKey==='string'?raw.routeKey:'',route:raw.route,startedAt:raw.startedAt,
      baselineIds:ids(raw.baselineIds),tailIds:ids(raw.tailIds),
      tailAnchors:(Array.isArray(raw.tailAnchors)?raw.tailAnchors:[]).filter(a=>a&&['user','assistant'].includes(a.role))
        .slice(-2).map(a=>({role:a.role,ids:ids(a.ids).slice(0,16)})),
      requestIds:ids(raw.requestIds).slice(0,16),requestState:['pending','ok','failed'].includes(raw.requestState)?raw.requestState:'',
      fullBaseline:raw.fullBaseline===true,ackedAt:Number(raw.ackedAt)||0,ackIds:ids(raw.ackIds).slice(0,16),
      source:['dom-user','conversation-user','request-dom-user','stream-user','stream-parent'].includes(raw.source)?raw.source:'',serial:Number(raw.serial)||0};
  }
  function tdReceiptBegin(tx,payload) {
    const candidates=tdReceiptUserCandidates(),ids=new Set(),nodes=new WeakMap();let tail=[];
    for(const n of candidates){const own=tdReceiptUserIds(n);own.forEach(id=>ids.add(id));nodes.set(n,own);if(own.length)tail=own;}
    // Keep the ACTUAL mounted tail independently of the (possibly older) cache.
    const tailAnchors=[];
    const lastUser=candidates.at(-1)||null;
    if(lastUser&&tail.length)tailAnchors.push({role:'user',ids:[...tail]});
    const lastAnswer=getLatestAssistantSection();
    if(lastAnswer && (!lastUser||compareDomOrder(lastUser,lastAnswer)<0)) {
      const address=tdMessageAddress(lastAnswer,'assistant');
      if(address.identityTokens.length)tailAnchors.push({role:'assistant',ids:address.identityTokens});
    }
    const records=tdOwnedIndex(chatGptApiRecords.length?chatGptApiRecords:cacheRecords);
    for(const r of records)if(isUserAnchoredEntry(r)){
      const own=[r.nodeId,r.messageId].filter(Boolean);own.forEach(id=>ids.add(id));if(!lastUser&&own.length)tail=own;
    }
    if(tx.baseline.key)ids.add(tx.baseline.key);
    tx.payload=normalizeMultilineText(payload);
    tx.sendRevision=td.editorRevision.get(tx.composer)||0;
    // "ready" may mean a historical page, not a complete current branch. A
    // negative full-baseline test alone cannot establish a new submission.
    tx.item.sendReceipt={schema:1,routeKey,route:hashString(routeKey),startedAt:tx.item.attemptedAt,
      baselineIds:[...ids],tailIds:tail,tailAnchors,requestIds:[],requestState:'',
      fullBaseline:false,ackedAt:0,ackIds:[],source:'',serial:tdTurn.serial};
    tdOutbox.runtime.set(tx.item,{payload:normalizeInlineReviewText(payload),baseline:new Set(ids),nodes,
      last:lastUser,scope:tx.scope,lastCheck:0,revision:-1,tx,navigationEpoch:userNavigationEpoch});
    tx.resumeAfterAck=!queuePaused;
  }
  function tdReceiptAck(item,ids,source) {
    const receipt=item.sendReceipt;
    if(!receipt || (receipt.routeKey && receipt.routeKey!==routeKey) || receipt.route!==hashString(routeKey) || receipt.ackedAt)return Boolean(receipt?.ackedAt);
    receipt.ackedAt=Date.now();receipt.ackIds=ids.slice(0,16);receipt.source=source;
    tdOutbox.last={source,latencyMs:Math.max(0,receipt.ackedAt-receipt.startedAt)};
    const expected=composePromptWithReviewComments(item.text,item.comments||[]);
    if(td.run && td.run.serial===receipt.serial && normalizeInlineReviewText(td.run.expected)===normalizeInlineReviewText(expected)) {
      td.run.accepted=true;td.run.userKey=ids[0]||td.run.userKey;
      td.run.inputReceipt={epoch:td.epoch,serial:receipt.serial,ids:ids.slice(0,16)};
    }
    tdLog('submission-ack',source);
    tdCommitItem(item,source); // retire one outbox item exactly once, independently of generation
    const runtime=tdOutbox.runtime.get(item);
    if(runtime?.tx && td.tx!==runtime.tx)void tdCleanupAcceptedEditor(runtime.tx);
    td.activityDirty=true;tdWake(0);
    return true;
  }
  function tdReceiptCheck(item,payload) {
    const receipt=item?.sendReceipt;
    if(!receipt || (receipt.routeKey && receipt.routeKey!==routeKey) || receipt.route!==hashString(routeKey))return false;
    if(receipt.ackedAt)return true;
    if(tdSelectionBusy())return false;
    let runtime=tdOutbox.runtime.get(item);
    if(!runtime){runtime={payload:normalizeInlineReviewText(payload),baseline:new Set(receipt.baselineIds||[]),nodes:null,
      last:null,scope:tdScope(),lastCheck:0,revision:-1};tdOutbox.runtime.set(item,runtime);}
    if(!tdAlive(runtime.scope))return false;
    if(runtime.payload!==normalizeInlineReviewText(payload))return false;
    const now=performance.now();
    if(now-runtime.lastCheck<110 && runtime.revision===tdDomState.revision)return false;
    runtime.lastCheck=now;runtime.revision=tdDomState.revision;tdOutbox.checks++;
    const candidates=tdReceiptUserCandidates();
    const rows=candidates.map(section=>({section,ids:tdReceiptUserIds(section)}));
    // Re-resolve identities, not the Element saved before clicking Send. The
    // entire transcript can be re-mounted while the logical messages stay put.
    const anchors=[];
    const descriptors=receipt.tailAnchors?.length?receipt.tailAnchors:
      (receipt.tailIds?.length?[{role:'user',ids:receipt.tailIds}]:[]);
    for(const anchor of descriptors) {
      const found=anchor.role==='user'?rows.filter(r=>r.ids.some(id=>anchor.ids.includes(id))).map(r=>r.section):
        [tdDomFindExact(anchor.ids,'assistant')].filter(Boolean);
      if(found.length===1)anchors.push(found[0]);
    }
    if(runtime.last?.isConnected && rows.some(r=>r.section===runtime.last&&r.ids.some(id=>runtime.baseline.has(id))) && !anchors.includes(runtime.last))anchors.push(runtime.last);
    const report={phase:'checking',candidates:rows.length,anchors:anchors.length,unaddressed:0,known:0,
      unmatched:0,withoutOrder:0,matching:0,requestBound:!!receipt.requestIds?.length,requestState:receipt.requestState||''};
    const matches=[];
    for(const {section,ids} of rows) {
      if(!ids.length){report.unaddressed++;continue;}
      if(ids.some(id=>runtime.baseline.has(id))){report.known++;continue;}
      const bound=receipt.requestIds?.some(id=>ids.includes(id));
      if(bound && receipt.requestState==='failed'){report.unmatched++;continue;}
      // A positive outgoing ID is useful only WITH a real rendered user message.
      // The request/HTTP status alone is never a successful receipt. A known
      // request failure is left to native retry UX, not silently re-submitted.
      if(bound && receipt.requestState!=='failed' && normalizeInlineReviewText(chatGptUserSectionText(section))) {
        matches.push({ids,source:'request-dom-user'});continue;
      }
      const old=runtime.nodes?.get(section);
      const replaced=Boolean(old?.length&&!old.some(id=>ids.includes(id)));
      const after=anchors.some(anchor=>anchor!==section &&
        !(anchor.compareDocumentPosition(section)&Node.DOCUMENT_POSITION_DISCONNECTED) && compareDomOrder(anchor,section)<0);
      const sameTailReplacement=replaced&&runtime.last===section&&runtime.navigationEpoch===userNavigationEpoch;
      if(!after&&!sameTailReplacement){report.withoutOrder++;continue;}
      if(normalizeInlineReviewText(chatGptUserSectionText(section))!==runtime.payload){report.unmatched++;continue;}
      matches.push({ids,source:'dom-user'});
    }
    // Multiple rendered views of the SAME ID are one logical receipt; two new
    // IDs with equal prose are ambiguous and must not consume each other.
    const logical=[];
    for(const match of matches) {
      const known=logical.find(m=>m.ids.some(id=>match.ids.includes(id)));
      if(known){known.ids=[...new Set([...known.ids,...match.ids])];if(match.source==='request-dom-user')known.source=match.source;}
      else logical.push(match);
    }
    const bound=logical.filter(m=>m.source==='request-dom-user');
    const chosen=bound.length===1?bound[0]:logical.length===1?logical[0]:null;
    report.matching=logical.length;
    report.phase=chosen?'matched':logical.length>1?'ambiguous':!rows.length?'no-rendered-user':report.withoutOrder?'tail-not-mounted':report.unmatched?'text-not-equal':'waiting-for-new-user';
    tdOutbox.decision=report;
    if(chosen)return tdReceiptAck(item,chosen.ids,chosen.source);
    if(Date.now()-receipt.startedAt>350)tdScheduleTurnCheck(250);
    return false;
  }

  // v1.10.1: positive correlation survives complete virtual-list replacement
  // and host presentation changes (folded long prompts, rendered Markdown).
  // Observe only an already-serialized JSON request belonging to the one clicked
  // local transaction. Never consume a Request body stream or clone it here.
  const TD_RECEIPT_REQUEST_LIMIT = 2 * 1024 * 1024;
  function tdReceiptIsUserMessage(message) {
    if(message?.author?.role!=='user')return false;
    // null/absent recipient means no special routing; do not mistake it for
    // a hidden tool message. This normalization is receipt-local, not an
    // alteration of the host payload or of the answer-outline parser.
    const visible=message.recipient==null?{...message,recipient:'all'}:message;
    return !hiddenChatGptMessage(visible)&&!chatGptAutomationMetadata(message)?.isTrigger;
  }
  function tdReceiptBindRequest(input,init,token) {
    const tx=td.tx,record=chatGptNetworkTokens.get(token);
    if(!tx?.clicked||!tx.item.sendReceipt||!tdAlive(tx.scope)||!record||record.serial!==tx.item.sendReceipt.serial)return;
    const body=init&&typeof init==='object'?Object.getOwnPropertyDescriptor(init,'body')?.value:null;
    if(typeof body!=='string'||body.length>TD_RECEIPT_REQUEST_LIMIT)return;
    let data;try{data=JSON.parse(body);}catch{return;}
    const resource=getChatGptConversationResource(),rid=data?.conversation_id||data?.conversationId;
    if(!resource||!rid||rid!==resource.id)return;
    if(data.action && !['next','continue'].includes(data.action))return;
    const messages=Array.isArray(data.messages)?data.messages:[];
    if(!messages.length||messages.length>128)return;
    const m=messages.at(-1);
    if(!tdReceiptIsUserMessage(m))return;
    const runtime=tdOutbox.runtime.get(tx.item),receipt=tx.item.sendReceipt;
    if(!runtime||normalizeInlineReviewText(extractChatGptMessageRawText(m))!==runtime.payload)return;
    const id=typeof m.id==='string'?m.id:'';
    if(!id||id.length>220||runtime.baseline.has(id))return;
    // A second request/retry does not get to reassign the logical local send.
    if(receipt.requestIds?.length&&!receipt.requestIds.includes(id))return;
    receipt.requestIds=[id];receipt.requestState='pending';
    record.receiptBinding={item:tx.item,scope:tx.scope,payload:runtime.payload,ids:[id]};
    saveWorkflowState();tdLog('submission-request-bound');
  }
  function tdReceiptRequestOutcome(token,response) {
    const binding=chatGptNetworkTokens.get(token)?.receiptBinding;
    if(!binding||!tdAlive(binding.scope))return;
    const r=binding.item.sendReceipt;if(!r||r.ackedAt)return;
    r.requestState=response?.ok?'ok':'failed';
    saveWorkflowState();tdWake(0);
  }
  function tdReceiptObserveGeneration(obj,token) {
    const binding=chatGptNetworkTokens.get(token)?.receiptBinding;
    if(!binding||!tdAlive(binding.scope)||binding.item.sendReceipt?.ackedAt||obj?.error||obj?.data?.error)return;
    const declared=obj?.conversation_id||obj?.data?.conversation_id;
    if(declared && declared!==getChatGptConversationId())return;
    const m=obj?.message||obj?.data?.message;
    if(!m||typeof m.id!=='string'||!m.id||m.id.length>220)return;
    const r=binding.item.sendReceipt;
    if(!r||r.requestState==='failed'||r.baselineIds.includes(m.id))return;
    if(tdReceiptIsUserMessage(m) &&
        normalizeInlineReviewText(extractChatGptMessageRawText(m))===binding.payload) {
      tdReceiptAck(binding.item,[m.id],'stream-user');return;
    }
    // Only an explicit parent relation to the actual transmitted USER id can
    // prove acceptance from an assistant event. Generic stream activity, final
    // completion, and [DONE] never acknowledge an arbitrary pending prompt.
    const parent=m.parent_id||obj.parent_message_id||obj.data?.parent_message_id;
    if(m.author?.role==='assistant'&&typeof parent==='string'&&binding.ids.includes(parent) &&
        !/^(?:error|failed|cancelled|canceled)$/.test(String(m.status||'')))
      tdReceiptAck(binding.item,[parent],'stream-parent');
  }

  function tdReceiptObserveConversation(conversation,startedAt) {
    if(!tdPayloadBelongs(conversation,getChatGptConversationResource()))return;
    const items=[...(td.tx?.clicked?[td.tx.item]:[]),...promptQueue.filter(q=>q.attemptedAt&&['sending','uncertain'].includes(q.status))];
    const seen=new Set(),pending=items.filter(q=>{if(seen.has(q.id))return false;seen.add(q.id);return !q.sendReceipt?.ackedAt;});
    if(!pending.length)return;
    const users=walkChatGptActiveBranch(conversation).filter(({node})=>tdReceiptIsUserMessage(node?.message));
    for(const item of pending) {
      let receipt=item.sendReceipt;
      // Legacy uncertain rows have no baseline set. Only a fresh API message
      // timestamp after the recorded attempt can migrate them automatically.
      if(!receipt && item.attemptedAt)receipt=item.sendReceipt={schema:1,route:hashString(routeKey),startedAt:item.attemptedAt,
        baselineIds:item.baselineKey?[item.baselineKey]:[],tailIds:[],fullBaseline:false,ackedAt:0,ackIds:[],source:'',serial:0};
      if(!receipt || (receipt.routeKey && receipt.routeKey!==routeKey) || receipt.route!==hashString(routeKey) || startedAt<receipt.startedAt)continue;
      const baseline=new Set(receipt.baselineIds||[]),tail=new Set(receipt.tailIds||[]);
      const anchor=users.findIndex(({nodeId,node})=>[nodeId,node.message?.id].filter(Boolean).some(id=>tail.has(id)));
      const text=normalizeInlineReviewText(composePromptWithReviewComments(item.text,item.comments||[]));
      const matches=[];
      users.forEach(({nodeId,node},i)=>{
        const m=node.message,ids=[...new Set([nodeId,m.id].filter(Boolean))],created=Number(m.create_time);
        if(ids.some(id=>baseline.has(id)))return;
        if(anchor>=0 ? i<=anchor : !(Number.isFinite(created)&&created>0&&created*1000>=receipt.startedAt-1000))return;
        if(normalizeInlineReviewText(extractChatGptMessageRawText(m))===text)matches.push(ids);
      });
      if(matches.length===1)tdReceiptAck(item,matches[0],'conversation-user');
    }
  }
  function tdPauseForReceipt(tx) {
    if(tx?.resumeAfterAck && !queuePaused)tdOutbox.pauseOwner=tx.item.id;
    queuePaused=true;
  }


  // v1.8: one accepted send has one completion path. Editor residues are scoped
  // capabilities: same route, same Element, same value, no intervening input.
  const tdAcceptedDrafts = new WeakMap();
  function tdDraftSubmissionOwner(composer,text) {
    const normalized=normalizeInlineReviewText(text);if(!normalized)return null;
    const tx=td.tx;
    if(tx?.clicked&&tx.composer===composer&&tdAlive(tx.scope)&&
       [tx.payload,tx.written].some(value=>value&&normalizeInlineReviewText(value)===normalized))return tx.item;
    const residue=tdAcceptedDrafts.get(composer);
    if(residue&&tdAlive(residue.scope)&&(td.editorRevision.get(composer)||0)===residue.sendRevision&&normalized===normalizeInlineReviewText(residue.payload))return residue.item;
    return promptQueue.find(q=>q.attemptedAt&&['sending','uncertain'].includes(q.status)&&
      normalized===normalizeInlineReviewText(composePromptWithReviewComments(q.text,q.comments||[])))||null;
  }
  async function tdCleanupAcceptedEditor(tx) {
    if(!tx||(!tx.confirmed&&!tx.item.sendReceipt?.ackedAt)||tx.cleanupDone)return false;
    if(tx.cleanupPromise)return tx.cleanupPromise;
    tx.cleanupPromise=(async()=>{
      if(!tdAlive(tx.scope))return false;
      const composer=tx.composer,payload=tx.payload||tx.written;
      // Editor remount or user input revokes ownership; never hunt for a new editor.
      if(!composer?.isConnected||composer!==getChatGptComposer()||!payload)return false;
      const current=getComposerText(composer);
      if(!current){tx.cleanupDone=true;tdAcceptedDrafts.delete(composer);return true;}
      if(current!==payload||(td.editorRevision.get(composer)||0)!==tx.sendRevision||td.composing||composerHasAttachments(composer)) {
        tx.cleanupDone=true;tdLog('sent-draft-preserved','changed-or-unowned');return false;
      }
      tdAcceptedDrafts.set(composer,tx);
      if(tdEditor.active||td.writing)return false;
      const clearing=tdWriteEditor(composer,'',payload,tx.scope);
      if(tdEditor.active?.composer===composer)tdEditor.active.acceptedCleanup=true;
      const clear=await clearing;
      if(clear){tx.cleanupDone=true;tdAcceptedDrafts.delete(composer);tdEditor.receipts.delete(composer);tdLog('sent-draft-cleared');}
      else tdLog('sent-draft-retained','safe-clear-unavailable');
      return clear;
    })();
    try{return await tx.cleanupPromise;}finally{tx.cleanupPromise=null;}
  }
  async function tdAwaitSubmission(tx,payload) {
    const acknowledged=await tdUntil(()=>Boolean(tx.confirmed)||tdHasEcho(payload,tx.baseline.key,tx.item),6500,tx.scope,90);
    if(!tdAlive(tx.scope))return Boolean(tx.confirmed||tx.item.sendReceipt?.ackedAt);
    if(acknowledged||tx.confirmed||tx.item.sendReceipt?.ackedAt) {
      tdCommitItem(tx.item,tx.item.sendReceipt?.source||'exact-user-echo');
      await tdCleanupAcceptedEditor(tx);
      return true;
    }
    return false;
  }

  // Native text selection owns the gesture. Hot events store endpoints only:
  // no text indexing, layout reads, toolbar reparenting or focus changes.
  const tdSelection = {installed:false,down:false,pointerId:null,keyboard:false,sample:null,
    timer:null,serial:0,moved:false,x:0,y:0,deferred:false,events:0,analyses:0,maxSnapshotMs:0,lastAnalyzed:null,frozen:null,recoveryReason:'',lastError:'',lengthCheck:null,releasePoint:null};
  function tdSelectionBusy(){return tdSelection.down||tdSelection.keyboard;}
  function tdSelectionAllowed(node) {
    const el=nodeAsElement(node);
    return el && !isInsideComposer(el) && !tdDomClosest(el,'#threaddeck-host,#prompt-rail-host,button,[role="button"],input,textarea,select,nav,aside,[data-threaddeck-internal]');
  }
  function tdSelectionSnapshot() {
 if(!settings.enabled||!settings.enableInlineComments||td.tx)return null;
 const began=performance.now();tdSelection.events++;
 try{const s=window.getSelection();if(!s||s.isCollapsed||s.rangeCount!==1)return null;
   if(tdSelectionBusy()){
     const previous=tdSelection.sample;
     if (previous?.anchor===s.anchorNode && previous.focus===s.focusNode &&
         previous.ao===s.anchorOffset && previous.fo===s.focusOffset) return previous;
     tdSelection.sample={range:null,anchor:s.anchorNode,focus:s.focusNode,ao:s.anchorOffset,fo:s.focusOffset,epoch:td.epoch,serial:tdSelection.serial,at:performance.now()};
     return tdSelection.sample;
   }
   if(!tdSelectionAllowed(s.anchorNode)||!tdSelectionAllowed(s.focusNode))return null;
   tdSelection.sample={range:s.getRangeAt(0).cloneRange(),anchor:s.anchorNode,focus:s.focusNode,ao:s.anchorOffset,fo:s.focusOffset,epoch:td.epoch,serial:tdSelection.serial,at:performance.now()};
   return tdSelection.sample;
 }catch{return null;}finally{tdSelection.maxSnapshotMs=Math.max(tdSelection.maxSnapshotMs,performance.now()-began);}
}
  function tdPauseSelectionIntegration() {
    nativeSelectionIntegrationToken++;
    stopNativeSelectionSearch();
    if(nativeSelectionSuppressionRaf!==null){cancelAnimationFrame(nativeSelectionSuppressionRaf);nativeSelectionSuppressionRaf=null;}
    // Do not remove/reinsert the existing native toolbar's children mid-drag.
  }
  // Save a bounded, exact path after release, BEFORE the host remounts the text.
  // cloneRange is live too; never use its mutated endpoints as an immutable record.
  function tdSelectionFreeze() {
    const sample = tdSelection.sample;
    if (!sample || sample.epoch !== td.epoch || sample.serial !== tdSelection.serial) return;
    if(!sample.range){const s=window.getSelection();if(!s||s.isCollapsed||s.rangeCount!==1)return;sample.range=s.getRangeAt(0).cloneRange();}
    const range = sample.range;
    if (!range || range.collapsed || !range.startContainer.isConnected || !range.endContainer.isConnected) return;
    const root = tdDomClosest(nodeAsElement(range.startContainer),
      '[data-chatgpt-selection-message-id],[data-message-id],[data-conversation-role="assistant"],[data-message-author-role="assistant"]');
    if (!root || !root.contains(range.endContainer) || isInsideComposer(root)) return;
    if (range.startContainer !== range.endContainer || range.startContainer.nodeType !== Node.TEXT_NODE ||
        range.endOffset - range.startOffset > REVIEW_SELECTION_MAX_CHARS) return;
    const quote = normalizeInlineReviewText(range.startContainer.nodeValue.slice(range.startOffset,range.endOffset));
    if (quote.length < REVIEW_SELECTION_MIN_CHARS) return;
    const path = node => { const p=[]; for(let n=node;n && n!==root;n=n.parentNode) {
      if (!n.parentNode || p.length >= 40) return null;
      p.unshift(Array.prototype.indexOf.call(n.parentNode.childNodes,n));
    } return p; };
    tdSelection.frozen = {root, ids: tdReceiptIdsOn(root), start: path(range.startContainer), end: path(range.endContainer),
      so:range.startOffset, eo:range.endOffset, quote, epoch:td.epoch, serial:tdSelection.serial, at:performance.now()};
  }
  function tdSelectionSavedRange() {
    const saved=tdSelection.sample, frozen=tdSelection.frozen;
    if (!saved || saved.epoch!==td.epoch || saved.serial!==tdSelection.serial) return null;
    if (saved.range && !saved.range.collapsed && saved.range.startContainer.isConnected && saved.range.endContainer.isConnected && performance.now()-saved.at<1800 && (!frozen || normalizeInlineReviewText(saved.range.toString())===frozen.quote)) return saved.range.cloneRange();
    if (!frozen || frozen.epoch!==td.epoch || frozen.serial!==tdSelection.serial || performance.now()-frozen.at>1800) return null;
    let root=frozen.root;
    if (!root.isConnected) {
      const hits=tdDomQueryAll(document,'[data-chatgpt-selection-message-id],[data-message-id]')
        .filter(n=>tdReceiptIdsOn(n).some(id=>frozen.ids.includes(id)) && tdDomSafe(n));
      if (hits.length!==1) return null;
      root=hits[0];
    }
    const at=path=>path?.reduce((node,i)=>node?.childNodes[i],root);
    const a=at(frozen.start), b=at(frozen.end);
    if (!a || !b || !a.isConnected || !b.isConnected) return null;
    try {
      const range=new Range();range.setStart(a,frozen.so);range.setEnd(b,frozen.eo);
      if (range.collapsed || normalizeInlineReviewText(range.toString())!==frozen.quote) return null;
      tdSelection.recoveryReason='exact-path-after-remount';return range;
    } catch { return null; }
  }
  function tdSelectionSchedule(delay=36) {
    if (tdSelectionBusy()) return;
    // A leading bounded task cannot be starved by a stream of selectionchange events.
    if (tdSelection.timer!==null) return;
    const serial=tdSelection.serial,epoch=td.epoch;
    tdSelection.timer=setTimeout(()=>{
      tdSelection.timer=null;
      if (serial!==tdSelection.serial||epoch!==td.epoch||tdSelectionBusy()||reviewHitGesture?.released)return;
      try {captureReviewSelection();} catch(error) {tdSelection.lastError=String(error?.name||'Error');tdLog('selection-release-failed',tdSelection.lastError);}
    },delay);
  }
  function tdSelectionReset() {
    clearTimeout(tdSelection.timer);tdSelection.timer=null;
    tdSelection.serial++;tdSelection.down=false;tdSelection.keyboard=false;tdSelection.pointerId=null;
    tdSelection.sample=null;tdSelection.lastAnalyzed=null;tdSelection.frozen=null;
  }
  function tdInstallSelectionGesture() {
    if(tdSelection.installed)return;tdSelection.installed=true;
    window.addEventListener('pointerdown',event=>{
      // 触摸选区由系统长按和 selectionchange 处理。两指手势不能被划词状态截获。
      if(!settings.enabled||event.pointerType==='touch'||event.button!==0||event.isPrimary===false)return;
      const node=event.composedPath?.()[0]||event.target;
      if(!tdSelectionAllowed(node)) {
        if (!tdDomClosest(nodeAsElement(node),'#threaddeck-host,[data-threaddeck-selection-comment]')) {tdSelectionReset();hideSelectionAction();}
        return;
      }
      tdSelection.serial++;tdSelection.down=true;tdSelection.pointerId=event.pointerId;tdSelection.sample=null;tdSelection.frozen=null;tdSelection.recoveryReason='';tdSelection.lastError='';
      tdSelection.lastAnalyzed=null;tdSelection.moved=false;tdSelection.x=event.clientX;tdSelection.y=event.clientY;
      clearTimeout(tdSelection.timer);tdSelection.timer=null;
      tdPauseSelectionIntegration();
      tdInteraction.skipped=0;tdInteraction.fullMutationPasses=0;
    },{capture:true,passive:true});
    window.addEventListener('pointermove',event=>{
      if(!tdSelection.down||event.pointerId!==tdSelection.pointerId)return;
      if(!(event.buttons&1)){tdSelectionSnapshot();tdSelectionFreeze();tdSelection.down=false;tdSelection.pointerId=null;tdResumeSelectionWork();tdSelectionSchedule();return;}
      if(Math.hypot(event.clientX-tdSelection.x,event.clientY-tdSelection.y)>4)tdSelection.moved=true;
    },{capture:true,passive:true});
    window.addEventListener('pointerup',event=>{
      if(event.pointerId!==tdSelection.pointerId)return;
      tdSelection.releasePoint={x:event.clientX,y:event.clientY,serial:tdSelection.serial};
      tdSelectionSnapshot();tdSelectionFreeze();tdSelection.down=false;tdSelection.pointerId=null;
      tdSelectionSchedule(36);
      tdResumeSelectionWork();
      tdWake(120);
    },{capture:true,passive:true});
    window.addEventListener('pointercancel',()=>{tdSelectionReset();hideSelectionAction();reviewHitGesture=null;tdResumeSelectionWork();tdWake(150);},{capture:true,passive:true});
    window.addEventListener('blur',()=>{tdSelectionReset();hideSelectionAction();reviewHitGesture=null;tdResumeSelectionWork();},{capture:true,passive:true});
    document.addEventListener('visibilitychange',()=>{if(document.hidden){tdSelectionReset();hideSelectionAction();}});
    window.addEventListener('keydown',event=>{
      if(event.shiftKey&&['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Home','End','PageUp','PageDown'].includes(event.key) &&
          tdSelectionAllowed(window.getSelection()?.anchorNode)){
        tdSelection.keyboard=true;tdPauseSelectionIntegration();clearTimeout(tdSelection.timer);tdSelection.timer=null;
      }
    },{capture:true,passive:true});
    window.addEventListener('keyup',event=>{
      if(tdSelection.keyboard&&(event.key==='Shift'||event.key.startsWith('Arrow')||['Home','End','PageUp','PageDown'].includes(event.key))){
        tdSelection.keyboard=false;tdSelectionSnapshot();tdSelectionFreeze();tdResumeSelectionWork();tdSelectionSchedule(60);
      }
    },{capture:true,passive:true});
  }

  function tdNodeKey(node) {
    if(!(node instanceof Element))return '';
    const role=tdDomRole(node)||((node.matches('[data-user-message-bubble]')||node.querySelector('[data-user-message-bubble]'))?'user':'assistant');
    const address=tdMessageAddress(node,role);
    return address.messageId||address.nodeId||'';
  }
  function tdLocalUserSnapshot() {
    const section=tdReceiptUserCandidates().at(-1)||getChatGptUserSections().at(-1)||null;
    const ids=tdReceiptUserIds(section);
    return {section,text:chatGptUserSectionText(section),ids,key:ids[0]||tdNodeKey(section)};
  }
  function tdHasEcho(payload,baselineKey='',item=td.tx?.item) {
 if(item?.sendReceipt)return tdReceiptCheck(item,payload);
 const snapshot=tdLocalUserSnapshot();
 return Boolean(snapshot.section&&snapshot.key!==baselineKey&&normalizeInlineReviewText(snapshot.text)===normalizeInlineReviewText(payload));
}
  function tdFinalSnapshot() {
    const section=getLatestAssistantSection();
    return tdFinalSnapshotFor(section);
  }
  function tdReadActiveUI(final) {
    const composer = getChatGptComposer();
    const controls = tdComposerControlFacts(composer);
    const dock = controls.scope.form || controls.scope.roots[0];
    const stopControl = controls.facts.find(fact=>fact.kind==='stop' && fact.enabled)?.button || findChatGptStopControl();
    const turn = final.section?.closest('[data-talvt-turn-state],[data-turn-status],[data-turn-key],article');
    const turnState = turn?.getAttribute('data-talvt-turn-state') || turn?.getAttribute('data-turn-status') || '';
    let steerControl = tdChooseComposerControl('steer',true,controls).button;
    let indicator = /^(?:streaming|pending|in_progress|running|generating|awaiting_response)$/.test(turnState) ? turn : null;
    // Only current answer/composer chrome may prove activity. Never scan arbitrary
    // answer prose for words like "thinking" or "调整方向".
    for (const scope of [dock, final.section].filter(Boolean)) {
      const nodes = safeQueryAll(scope, 'button,[role="button"],[role="status"],[aria-busy="true"],[data-state="streaming"],[data-status="in_progress"],[data-status="running"],[role="progressbar"],[class*="result-streaming"]');
      if (scope.matches?.('[aria-busy="true"],[data-state="streaming"],[data-status="in_progress"],[data-status="running"]')) nodes.push(scope);
      for (const node of nodes) {
        if (!(node instanceof HTMLElement) || !isElementVisible(node)) continue;
        if (node.closest('#threaddeck-host,#prompt-rail-host,[hidden],[aria-hidden="true"],details:not([open])') || !tdDomTreeShown(node)) continue;
        // A wide form may wrap historical turns as well as the composer.
        // Activity chrome in those turns does not belong to the input area.
        if(scope===dock && tdDomClosest(node,tdDomRoleSelector('user')+','+tdDomRoleSelector('assistant')+',[data-user-message-bubble],[data-chatgpt-selection-message-id]'))continue;
        if (node.matches('button,[role="button"]')) {
          const hint = getButtonAccessibleText(node);
          if (scope === dock && /^(?:.*\bsteer\b|调整方向|更改方向|adjust direction)/i.test(hint)) steerControl = node;
        } else {
          const state = `${node.getAttribute('data-state') || ''} ${node.getAttribute('data-status') || ''}`;
          const active = node.getAttribute('aria-busy') === 'true' || /\b(streaming|in_progress|running)\b/.test(state) ||
            node.classList.contains('result-streaming') || node.getAttribute('role') === 'progressbar';
          const inAuthoredBody = Boolean(node.closest(TD_DOM_CONTENT));
          const statusText = !inAuthoredBody && node.getAttribute('role') === 'status' ? normalizeText(node.getAttribute('aria-label') || node.textContent).slice(0, 120) : '';
          if (((!inAuthoredBody || node===final.section || node===final.root) && active) || /^(?:正在(?:思考|推理|规划|搜索|生成(?:图片|图像))|(?:思考|推理|规划|搜索|生图)中|thinking(?:\s|…|\.)|reasoning(?:\s|…|\.)|(?:generating|creating) (?:an? |your )?image)/i.test(statusText)) indicator = node;
        }
      }
    }
    return { stopControl, steerControl: (stopControl || indicator) ? steerControl : null,
      steerAvailable: steerControl, indicator, composer };
  }
  function tdArmRun(source, expected = '', baseline = null) {
    const user = baseline || tdLocalUserSnapshot();
    tdTurn.serial++; tdTurn.proof = null; tdTurn.receipt = null; tdTurn.unknownSince = 0;
    tdTurn.fingerprint=''; tdTurn.unchanged=0; tdTurn.changedAt=Date.now(); tdTurn.attempts=0; tdTurn.failures=0; tdTurn.source='';
    clearTimeout(tdTurn.timer); tdTurn.timer=null; tdTurn.checkToken++; tdTurn.pending=false; tdTurn.lastAttempt=0;
    const initialFinal = tdFinalSnapshot();
    td.run = { serial: tdTurn.serial, lastStrongAt: 0, key: user.key, baseline: user.key, source, expected, startedAt: Date.now(), accepted: false, sawBusy: false, userKey: '', finalKey: '', initialFinal: initialFinal.signature, initialFinalKey: initialFinal.key, initialCompleted: initialFinal.completed, networkFinal: false };
    td.settleSince = 0; td.activityDirty = true;
    tdLog('turn-start', source);
    tdLiveWatch();
  }
  function tdCommitItem(item,reason) {
    if(!item)return false;
    if(item.sendReceipt?.routeKey&&item.sendReceipt.routeKey!==routeKey)return false;
    if(item.sendReceipt?.route&&item.sendReceipt.route!==hashString(routeKey))return false;
    const tx=td.tx?.item.id===item.id?td.tx:null;
    const present=promptQueue.some(row=>row.id===item.id);
    if(tx)tx.confirmed=true;
    if(item.status==='sent'&&!present)return true;
    if(!present&&!tx)return false;
    item.status='sent';item.error='';
    if(item.comments?.length){markReviewCommentsConsumed(item.comments);removePendingReviewSnapshot(item.comments);}
    promptQueue=promptQueue.filter(row=>row.id!==item.id);
    if(td.staged?.id===item.id)td.staged=null;
    if(tdOutbox.pauseOwner===item.id){tdOutbox.pauseOwner='';if(!promptQueue.some(q=>q.status==='uncertain'||q.status==='failed'))queuePaused=false;}
    saveWorkflowState();renderWorkflowPanel();tdLog('send-confirmed',reason);
    if(settingsFormEl?.querySelector('.td-support[open]'))tdRenderRecoveryRows();
    return true;
  }
  function tdReconcileUncertain() {
    for(const item of [...promptQueue]) {
      if(td.tx?.item.id===item.id||!item.attemptedAt)continue;
      if(!['uncertain','sending','sent'].includes(item.status))continue;
      const payload=composePromptWithReviewComments(item.text,item.comments||[]);
      if(item.sendReceipt&&tdReceiptCheck(item,payload))tdCommitItem(item,item.sendReceipt.source||'late-user-echo');
      else tdScheduleTurnCheck(250);
    }
  }
  function tdWake(delay = 0) {
    if (!td.ready || td.wakeTimer !== null) return;
    const scope=tdScope();
    td.wakeTimer=window.setTimeout(async()=>{
      td.wakeTimer=null;
      if (!tdAlive(scope) || !tdEnabled()) return;
      if(tdSelectionBusy()){tdSelection.deferred=true;return;}
      // Settle an active generation even when its outbox is already empty.
      try { if (td.run || promptQueue.length) getChatGptActivitySnapshot(); } catch(error) { tdLog('activity-check-error',error?.name); }
      try { tdReconcileUncertain(); } catch(error) { tdLog('echo-check-error',error?.name); }
      try { updateQueueDockRuntimeState(); } catch(error) { tdLog('queue-ui-error',error?.name); }
      try { await processPromptQueue(); }
      catch(error) { if(!tdAlive(scope))return; tdLog('queue-error',error?.name); queuePaused=true; tdRecordDispatch('queue-error'); }
    },delay);
  }
  function tdDiagnostic() {
    const a = tdSafeTask('diagnostic-activity',getChatGptActivitySnapshot,{phase:'unavailable',evidence:['diagnostic-error']});
    return {
      product: PRODUCT_NAME, version: APP_VERSION,
      isolation:{schema:TD_INDEX_OWNER_SCHEMA,rejectedNodes:tdRouteFence.blocked,rejectedPayloads:tdRouteFence.rejectedPayloads,quarantinedLegacyRows:tdRouteFence.quarantined,transitions:tdRouteFence.transitions,allEntriesOwned:entries.every(e=>e.ownerKey===routeKey)},
      newline:tdNewline.last,
      contracts: {
        identity: 'native-address-v1', additionalReads: 'none',
        lastSnapshot: tdHealth.snapshot || null,
        indexedEvents: entries.length,
        addressedEvents: entries.filter(e=>tdNavRecordIds(e).length).length,
        indexedChapters: entries.reduce((n,e)=>n+(e.answerBlocks||[]).length,0),
        addressedChapters: entries.reduce((n,e)=>n+(e.answerBlocks||[]).filter(b=>b.answerMessageId||b.answerNodeId).length,0),
        localOnly:!chatGptApiRecords.length,
      },
      readSafety:tdReadDiagnostic(),
      interactionWork:{deferred:tdInteraction.skipped,fullMutationPasses:tdInteraction.fullMutationPasses,resumes:tdInteraction.resumes},
      submission:{acceptedResidual:Boolean(tdAcceptedDrafts.get(getChatGptComposer())),pending:promptQueue.filter(q=>q.attemptedAt&&q.status==='uncertain').length,last:tdOutbox.last,checks:tdOutbox.checks,decision:tdOutbox.decision},
      selectionPerformance:{dragging:tdSelectionBusy(),snapshots:tdSelection.events,analyses:tdSelection.analyses,releaseRecovery:tdSelection.recoveryReason,lastError:tdSelection.lastError,savedRange:Boolean(tdSelection.frozen),maxSnapshotMs:Math.round(tdSelection.maxSnapshotMs*100)/100},
      dom: tdSafeTask('diagnostic-dom',tdDomDiagnostic,{adapter:'failed'}),
      runtime: tdHealthSummary(),
      dispatch: tdDispatchDiagnostic(a),
      routeType: getChatGptConversationLocator().kind || 'home',
      phase: a.phase, evidence: a.evidence, manualNativeReady: Boolean(a.manualNativeReady), currentPairVerified: Boolean(a.currentPair),
      turnVerification: {pending:tdTurn.pending,attempts:tdTurn.attempts,failures:tdTurn.failures,proof:tdTurn.proof?.state||'none',proofAgeMs:tdTurn.proof?Date.now()-tdTurn.proof.receivedAt:null,source:a.completionSource||tdTurn.source,
        reason:tdTurn.proof?.reason||'',answerStatus:tdTurn.proof?.answer?.status||'',channel:tdTurn.proof?.answer?.channel||'',
        endTurn:tdTurn.proof?.answer?.ended??null,unchanged:tdTurn.unchanged,unchangedForMs:tdTurn.changedAt?Date.now()-tdTurn.changedAt:0,
        applies:Boolean(a.proofApplies),exactFinalMounted:Boolean(a.sameVisibleMessage),localFinalCompleted:Boolean(a.localFinalCompleted)},
      highlights: {saved:reviewComments.length,painted:tdReviewPainted.size,restoreScheduled:reviewAnchorTimer!==null,indexBuilds:tdPerf.highlightBuilds},
      performance: {editorWrite:tdEditor.last,editorMs:tdPerf.editorMs,editorMethod:tdPerf.editorMethod,highlightMaxSliceMs:Math.round(tdPerf.highlightMaxSliceMs*10)/10,send:tdPerf.send?{comments:tdPerf.send.comments,prepareMs:tdPerf.send.prepareMs,echoMs:tdPerf.send.echoMs}:null},
      epoch: td.epoch, activityScans: td.activityScans,
      composer: Boolean(getChatGptComposer()), queueCount: promptQueue.length,
      queueStates: promptQueue.map((item) => item.status), paused: queuePaused,
      comments: reviewComments.length, transaction: td.tx ? (td.tx.clicked ? 'awaiting-echo' : 'preparing') : null,
      indexSource: lastScanStats.source, indexCount: entries.length,
      storageAvailable: td.storageOK, navigation: tdNavigation.last, history: tdHistory.bridge?.snapshot() || { installed: false }, liveIndex: { extras: tdLive.extra.size, patches: tdLive.patches.size, revision: tdLive.revision, reconciliations: tdLive.syncs }, logs: td.log.slice(),
    };
  }
  async function tdCopyDiagnostic() {
    const report=tdDiagnostic();report.rawStructure=tdSafeTask('diagnostic-inventory',tdRawDomInventory,{});
    const json = JSON.stringify(report, null, 2);
    try { await navigator.clipboard.writeText(json); showToast('已复制诊断（不含问题、回答、批注或会话 ID）', 2300); }
    catch { tdShowDiagnosticText(json); }
  }

/*
Embedded Marked lexer (MIT). Isolated; no HTML renderer is called.
Distribution source: Gradio MarkdownCode-DBmitoTT.js
SHA-256 of source distribution: a788b3a4ad05d417c5220623891b3830d12b8a71f390a842f9f09c9cb16333a2
## Marked

Copyright (c) 2018+, MarkedJS (https://github.com/markedjs/)
Copyright (c) 2011-2018, Christopher Jeffrey (https://github.com/chjj/)

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
THE SOFTWARE.

## Markdown

Copyright © 2004, John Gruber
http://daringfireball.net/
All rights reserved.

Redistribution and use in source and binary forms, with or without modification, are permitted provided that the following conditions are met:

* Redistributions of source code must retain the above copyright notice, this list of conditions and the following disclaimer.
* Redistributions in binary form must reproduce the above copyright notice, this list of conditions and the following disclaimer in the documentation and/or other materials provided with the distribution.
* Neither the name “Markdown” nor the names of its contributors may be used to endorse or promote products derived from this software without specific prior written permission.

This software is provided by the copyright holders and contributors “as is” and any express or implied warranties, including, but not limited to, the implied warranties of merchantability and fitness for a particular purpose are disclaimed. In no event shall the copyright owner or contributors be liable for any direct, indirect, incidental, special, exemplary, or consequential damages (including, but not limited to, procurement of substitute goods or services; loss of use, data, or profits; or business interruption) however caused and on any theory of liability, whether in contract, strict liability, or tort (including negligence or otherwise) arising in any way out of the use of this software, even if advised of the possibility of such damage.
*/
const TDMarkdownLexer = (() => {
function ae(){return{async:!1,breaks:!1,extensions:null,gfm:!0,hooks:null,pedantic:!1,renderer:null,silent:!1,tokenizer:null,walkTokens:null}}let z=ae();function Oe(s){z=s}const ve=/[&<>"']/,ot=new RegExp(ve.source,"g"),$e=/[<>"']|&(?!(#\d{1,7}|#[Xx][a-fA-F0-9]{1,6}|\w+);)/,lt=new RegExp($e.source,"g"),ct={"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"},fe=s=>ct[s];function y(s,e){if(e){if(ve.test(s))return s.replace(ot,fe)}else if($e.test(s))return s.replace(lt,fe);return s}const pt=/&(#(?:\d+)|(?:#x[0-9A-Fa-f]+)|(?:\w+));?/ig;function dt(s){return s.replace(pt,(e,t)=>(t=t.toLowerCase(),t==="colon"?":":t.charAt(0)==="#"?t.charAt(1)==="x"?String.fromCharCode(parseInt(t.substring(2),16)):String.fromCharCode(+t.substring(1)):""))}const ht=/(^|[^\[])\^/g;function g(s,e){let t=typeof s=="string"?s:s.source;e=e||"";const n={replace:(r,a)=>{let i=typeof a=="string"?a:a.source;return i=i.replace(ht,"$1"),t=t.replace(r,i),n},getRegex:()=>new RegExp(t,e)};return n}function ge(s){try{s=encodeURI(s).replace(/%25/g,"%")}catch{return null}return s}const U={exec:()=>null};function De(s,e){const t=s.replace(/\|/g,(a,i,u)=>{let o=!1,c=i;for(;--c>=0&&u[c]==="\\";)o=!o;return o?"|":" |"}),n=t.split(/ \|/);let r=0;if(n[0].trim()||n.shift(),n.length>0&&!n[n.length-1].trim()&&n.pop(),e)if(n.length>e)n.splice(e);else for(;n.length<e;)n.push("");for(;r<n.length;r++)n[r]=n[r].trim().replace(/\\\|/g,"|");return n}function Z(s,e,t){const n=s.length;if(n===0)return"";let r=0;for(;r<n&&s.charAt(n-r-1)===e;)r++;return s.slice(0,n-r)}function ft(s,e){if(s.indexOf(e[1])===-1)return-1;let t=0;for(let n=0;n<s.length;n++)if(s[n]==="\\")n++;else if(s[n]===e[0])t++;else if(s[n]===e[1]&&(t--,t<0))return n;return-1}function me(s,e,t,n){const r=e.href,a=e.title?y(e.title):null,i=s[1].replace(/\\([\[\]])/g,"$1");if(s[0].charAt(0)!=="!"){n.state.inLink=!0;const u={type:"link",raw:t,href:r,title:a,text:i,tokens:n.inlineTokens(i)};return n.state.inLink=!1,u}return{type:"image",raw:t,href:r,title:a,text:y(i)}}function gt(s,e){const t=s.match(/^(\s+)(?:```)/);if(t===null)return e;const n=t[1];return e.split(`
`).map(r=>{const a=r.match(/^\s+/);if(a===null)return r;const[i]=a;return i.length>=n.length?r.slice(n.length):r}).join(`
`)}class W{options;rules;lexer;constructor(e){this.options=e||z}space(e){const t=this.rules.block.newline.exec(e);if(t&&t[0].length>0)return{type:"space",raw:t[0]}}code(e){const t=this.rules.block.code.exec(e);if(t){const n=t[0].replace(/^ {1,4}/gm,"");return{type:"code",raw:t[0],codeBlockStyle:"indented",text:this.options.pedantic?n:Z(n,`
`)}}}fences(e){const t=this.rules.block.fences.exec(e);if(t){const n=t[0],r=gt(n,t[3]||"");return{type:"code",raw:n,lang:t[2]?t[2].trim().replace(this.rules.inline.anyPunctuation,"$1"):t[2],text:r}}}heading(e){const t=this.rules.block.heading.exec(e);if(t){let n=t[2].trim();if(/#$/.test(n)){const r=Z(n,"#");(this.options.pedantic||!r||/ $/.test(r))&&(n=r.trim())}return{type:"heading",raw:t[0],depth:t[1].length,text:n,tokens:this.lexer.inline(n)}}}hr(e){const t=this.rules.block.hr.exec(e);if(t)return{type:"hr",raw:t[0]}}blockquote(e){const t=this.rules.block.blockquote.exec(e);if(t){let n=t[0].replace(/\n {0,3}((?:=+|-+) *)(?=\n|$)/g,`
    $1`);n=Z(n.replace(/^ *>[ \t]?/gm,""),`
`);const r=this.lexer.state.top;this.lexer.state.top=!0;const a=this.lexer.blockTokens(n);return this.lexer.state.top=r,{type:"blockquote",raw:t[0],tokens:a,text:n}}}list(e){let t=this.rules.block.list.exec(e);if(t){let n=t[1].trim();const r=n.length>1,a={type:"list",raw:"",ordered:r,start:r?+n.slice(0,-1):"",loose:!1,items:[]};n=r?`\\d{1,9}\\${n.slice(-1)}`:`\\${n}`,this.options.pedantic&&(n=r?n:"[*+-]");const i=new RegExp(`^( {0,3}${n})((?:[	 ][^\\n]*)?(?:\\n|$))`);let u="",o="",c=!1;for(;e;){let l=!1;if(!(t=i.exec(e))||this.rules.block.hr.test(e))break;u=t[0],e=e.substring(u.length);let h=t[2].split(`
`,1)[0].replace(/^\t+/,S=>" ".repeat(3*S.length)),d=e.split(`
`,1)[0],p=0;this.options.pedantic?(p=2,o=h.trimStart()):(p=t[2].search(/[^ ]/),p=p>4?1:p,o=h.slice(p),p+=t[1].length);let A=!1;if(!h&&/^ *$/.test(d)&&(u+=d+`
`,e=e.substring(d.length+1),l=!0),!l){const S=new RegExp(`^ {0,${Math.min(3,p-1)}}(?:[*+-]|\\d{1,9}[.)])((?:[ 	][^\\n]*)?(?:\\n|$))`),C=new RegExp(`^ {0,${Math.min(3,p-1)}}((?:- *){3,}|(?:_ *){3,}|(?:\\* *){3,})(?:\\n+|$)`),_=new RegExp(`^ {0,${Math.min(3,p-1)}}(?:\`\`\`|~~~)`),I=new RegExp(`^ {0,${Math.min(3,p-1)}}#`);for(;e;){const N=e.split(`
`,1)[0];if(d=N,this.options.pedantic&&(d=d.replace(/^ {1,4}(?=( {4})*[^ ])/g,"  ")),_.test(d)||I.test(d)||S.test(d)||C.test(e))break;if(d.search(/[^ ]/)>=p||!d.trim())o+=`
`+d.slice(p);else{if(A||h.search(/[^ ]/)>=4||_.test(h)||I.test(h)||C.test(h))break;o+=`
`+d}!A&&!d.trim()&&(A=!0),u+=N+`
`,e=e.substring(N.length+1),h=d.slice(p)}}a.loose||(c?a.loose=!0:/\n *\n *$/.test(u)&&(c=!0));let m=null,x;this.options.gfm&&(m=/^\[[ xX]\] /.exec(o),m&&(x=m[0]!=="[ ] ",o=o.replace(/^\[[ xX]\] +/,""))),a.items.push({type:"list_item",raw:u,task:!!m,checked:x,loose:!1,text:o,tokens:[]}),a.raw+=u}a.items[a.items.length-1].raw=u.trimEnd(),a.items[a.items.length-1].text=o.trimEnd(),a.raw=a.raw.trimEnd();for(let l=0;l<a.items.length;l++)if(this.lexer.state.top=!1,a.items[l].tokens=this.lexer.blockTokens(a.items[l].text,[]),!a.loose){const h=a.items[l].tokens.filter(p=>p.type==="space"),d=h.length>0&&h.some(p=>/\n.*\n/.test(p.raw));a.loose=d}if(a.loose)for(let l=0;l<a.items.length;l++)a.items[l].loose=!0;return a}}html(e){const t=this.rules.block.html.exec(e);if(t)return{type:"html",block:!0,raw:t[0],pre:t[1]==="pre"||t[1]==="script"||t[1]==="style",text:t[0]}}def(e){const t=this.rules.block.def.exec(e);if(t){const n=t[1].toLowerCase().replace(/\s+/g," "),r=t[2]?t[2].replace(/^<(.*)>$/,"$1").replace(this.rules.inline.anyPunctuation,"$1"):"",a=t[3]?t[3].substring(1,t[3].length-1).replace(this.rules.inline.anyPunctuation,"$1"):t[3];return{type:"def",tag:n,raw:t[0],href:r,title:a}}}table(e){const t=this.rules.block.table.exec(e);if(!t||!/[:|]/.test(t[2]))return;const n=De(t[1]),r=t[2].replace(/^\||\| *$/g,"").split("|"),a=t[3]&&t[3].trim()?t[3].replace(/\n[ \t]*$/,"").split(`
`):[],i={type:"table",raw:t[0],header:[],align:[],rows:[]};if(n.length===r.length){for(const u of r)/^ *-+: *$/.test(u)?i.align.push("right"):/^ *:-+: *$/.test(u)?i.align.push("center"):/^ *:-+ *$/.test(u)?i.align.push("left"):i.align.push(null);for(const u of n)i.header.push({text:u,tokens:this.lexer.inline(u)});for(const u of a)i.rows.push(De(u,i.header.length).map(o=>({text:o,tokens:this.lexer.inline(o)})));return i}}lheading(e){const t=this.rules.block.lheading.exec(e);if(t)return{type:"heading",raw:t[0],depth:t[2].charAt(0)==="="?1:2,text:t[1],tokens:this.lexer.inline(t[1])}}paragraph(e){const t=this.rules.block.paragraph.exec(e);if(t){const n=t[1].charAt(t[1].length-1)===`
`?t[1].slice(0,-1):t[1];return{type:"paragraph",raw:t[0],text:n,tokens:this.lexer.inline(n)}}}text(e){const t=this.rules.block.text.exec(e);if(t)return{type:"text",raw:t[0],text:t[0],tokens:this.lexer.inline(t[0])}}escape(e){const t=this.rules.inline.escape.exec(e);if(t)return{type:"escape",raw:t[0],text:y(t[1])}}tag(e){const t=this.rules.inline.tag.exec(e);if(t)return!this.lexer.state.inLink&&/^<a /i.test(t[0])?this.lexer.state.inLink=!0:this.lexer.state.inLink&&/^<\/a>/i.test(t[0])&&(this.lexer.state.inLink=!1),!this.lexer.state.inRawBlock&&/^<(pre|code|kbd|script)(\s|>)/i.test(t[0])?this.lexer.state.inRawBlock=!0:this.lexer.state.inRawBlock&&/^<\/(pre|code|kbd|script)(\s|>)/i.test(t[0])&&(this.lexer.state.inRawBlock=!1),{type:"html",raw:t[0],inLink:this.lexer.state.inLink,inRawBlock:this.lexer.state.inRawBlock,block:!1,text:t[0]}}link(e){const t=this.rules.inline.link.exec(e);if(t){const n=t[2].trim();if(!this.options.pedantic&&/^</.test(n)){if(!/>$/.test(n))return;const i=Z(n.slice(0,-1),"\\");if((n.length-i.length)%2===0)return}else{const i=ft(t[2],"()");if(i>-1){const o=(t[0].indexOf("!")===0?5:4)+t[1].length+i;t[2]=t[2].substring(0,i),t[0]=t[0].substring(0,o).trim(),t[3]=""}}let r=t[2],a="";if(this.options.pedantic){const i=/^([^'"]*[^\s])\s+(['"])(.*)\2/.exec(r);i&&(r=i[1],a=i[3])}else a=t[3]?t[3].slice(1,-1):"";return r=r.trim(),/^</.test(r)&&(this.options.pedantic&&!/>$/.test(n)?r=r.slice(1):r=r.slice(1,-1)),me(t,{href:r&&r.replace(this.rules.inline.anyPunctuation,"$1"),title:a&&a.replace(this.rules.inline.anyPunctuation,"$1")},t[0],this.lexer)}}reflink(e,t){let n;if((n=this.rules.inline.reflink.exec(e))||(n=this.rules.inline.nolink.exec(e))){const r=(n[2]||n[1]).replace(/\s+/g," "),a=t[r.toLowerCase()];if(!a){const i=n[0].charAt(0);return{type:"text",raw:i,text:i}}return me(n,a,n[0],this.lexer)}}emStrong(e,t,n=""){let r=this.rules.inline.emStrongLDelim.exec(e);if(!r||r[3]&&n.match(/[\p{L}\p{N}]/u))return;if(!(r[1]||r[2]||"")||!n||this.rules.inline.punctuation.exec(n)){const i=[...r[0]].length-1;let u,o,c=i,l=0;const h=r[0][0]==="*"?this.rules.inline.emStrongRDelimAst:this.rules.inline.emStrongRDelimUnd;for(h.lastIndex=0,t=t.slice(-1*e.length+i);(r=h.exec(t))!=null;){if(u=r[1]||r[2]||r[3]||r[4]||r[5]||r[6],!u)continue;if(o=[...u].length,r[3]||r[4]){c+=o;continue}else if((r[5]||r[6])&&i%3&&!((i+o)%3)){l+=o;continue}if(c-=o,c>0)continue;o=Math.min(o,o+c+l);const d=[...r[0]][0].length,p=e.slice(0,i+r.index+d+o);if(Math.min(i,o)%2){const m=p.slice(1,-1);return{type:"em",raw:p,text:m,tokens:this.lexer.inlineTokens(m)}}const A=p.slice(2,-2);return{type:"strong",raw:p,text:A,tokens:this.lexer.inlineTokens(A)}}}}codespan(e){const t=this.rules.inline.code.exec(e);if(t){let n=t[2].replace(/\n/g," ");const r=/[^ ]/.test(n),a=/^ /.test(n)&&/ $/.test(n);return r&&a&&(n=n.substring(1,n.length-1)),n=y(n,!0),{type:"codespan",raw:t[0],text:n}}}br(e){const t=this.rules.inline.br.exec(e);if(t)return{type:"br",raw:t[0]}}del(e){const t=this.rules.inline.del.exec(e);if(t)return{type:"del",raw:t[0],text:t[2],tokens:this.lexer.inlineTokens(t[2])}}autolink(e){const t=this.rules.inline.autolink.exec(e);if(t){let n,r;return t[2]==="@"?(n=y(t[1]),r="mailto:"+n):(n=y(t[1]),r=n),{type:"link",raw:t[0],text:n,href:r,tokens:[{type:"text",raw:n,text:n}]}}}url(e){let t;if(t=this.rules.inline.url.exec(e)){let n,r;if(t[2]==="@")n=y(t[0]),r="mailto:"+n;else{let a;do a=t[0],t[0]=this.rules.inline._backpedal.exec(t[0])?.[0]??"";while(a!==t[0]);n=y(t[0]),t[1]==="www."?r="http://"+t[0]:r=t[0]}return{type:"link",raw:t[0],text:n,href:r,tokens:[{type:"text",raw:n,text:n}]}}}inlineText(e){const t=this.rules.inline.text.exec(e);if(t){let n;return this.lexer.state.inRawBlock?n=t[0]:n=y(t[0]),{type:"text",raw:t[0],text:n}}}}const Dt=/^(?: *(?:\n|$))+/,mt=/^( {4}[^\n]+(?:\n(?: *(?:\n|$))*)?)+/,Et=/^ {0,3}(`{3,}(?=[^`\n]*(?:\n|$))|~{3,})([^\n]*)(?:\n|$)(?:|([\s\S]*?)(?:\n|$))(?: {0,3}\1[~`]* *(?=\n|$)|$)/,H=/^ {0,3}((?:-[\t ]*){3,}|(?:_[ \t]*){3,}|(?:\*[ \t]*){3,})(?:\n+|$)/,bt=/^ {0,3}(#{1,6})(?=\s|$)(.*)(?:\n+|$)/,ze=/(?:[*+-]|\d{1,9}[.)])/,Pe=g(/^(?!bull |blockCode|fences|blockquote|heading|html)((?:.|\n(?!\s*?\n|bull |blockCode|fences|blockquote|heading|html))+?)\n {0,3}(=+|-+) *(?:\n+|$)/).replace(/bull/g,ze).replace(/blockCode/g,/ {4}/).replace(/fences/g,/ {0,3}(?:`{3,}|~{3,})/).replace(/blockquote/g,/ {0,3}>/).replace(/heading/g,/ {0,3}#{1,6}/).replace(/html/g,/ {0,3}<[^\n>]+>\n/).getRegex(),ue=/^([^\n]+(?:\n(?!hr|heading|lheading|blockquote|fences|list|html|table| +\n)[^\n]+)*)/,Ft=/^[^\n]+/,oe=/(?!\s*\])(?:\\.|[^\[\]\\])+/,At=g(/^ {0,3}\[(label)\]: *(?:\n *)?([^<\s][^\s]*|<.*?>)(?:(?: +(?:\n *)?| *\n *)(title))? *(?:\n+|$)/).replace("label",oe).replace("title",/(?:"(?:\\"?|[^"\\])*"|'[^'\n]*(?:\n[^'\n]+)*\n?'|\([^()]*\))/).getRegex(),kt=g(/^( {0,3}bull)([ \t][^\n]+?)?(?:\n|$)/).replace(/bull/g,ze).getRegex(),ee="address|article|aside|base|basefont|blockquote|body|caption|center|col|colgroup|dd|details|dialog|dir|div|dl|dt|fieldset|figcaption|figure|footer|form|frame|frameset|h[1-6]|head|header|hr|html|iframe|legend|li|link|main|menu|menuitem|meta|nav|noframes|ol|optgroup|option|p|param|search|section|summary|table|tbody|td|tfoot|th|thead|title|tr|track|ul",le=/<!--(?:-?>|[\s\S]*?(?:-->|$))/,wt=g("^ {0,3}(?:<(script|pre|style|textarea)[\\s>][\\s\\S]*?(?:</\\1>[^\\n]*\\n+|$)|comment[^\\n]*(\\n+|$)|<\\?[\\s\\S]*?(?:\\?>\\n*|$)|<![A-Z][\\s\\S]*?(?:>\\n*|$)|<!\\[CDATA\\[[\\s\\S]*?(?:\\]\\]>\\n*|$)|</?(tag)(?: +|\\n|/?>)[\\s\\S]*?(?:(?:\\n *)+\\n|$)|<(?!script|pre|style|textarea)([a-z][\\w-]*)(?:attribute)*? */?>(?=[ \\t]*(?:\\n|$))[\\s\\S]*?(?:(?:\\n *)+\\n|$)|</(?!script|pre|style|textarea)[a-z][\\w-]*\\s*>(?=[ \\t]*(?:\\n|$))[\\s\\S]*?(?:(?:\\n *)+\\n|$))","i").replace("comment",le).replace("tag",ee).replace("attribute",/ +[a-zA-Z:_][\w.:-]*(?: *= *"[^"\n]*"| *= *'[^'\n]*'| *= *[^\s"'=<>`]+)?/).getRegex(),Me=g(ue).replace("hr",H).replace("heading"," {0,3}#{1,6}(?:\\s|$)").replace("|lheading","").replace("|table","").replace("blockquote"," {0,3}>").replace("fences"," {0,3}(?:`{3,}(?=[^`\\n]*\\n)|~{3,})[^\\n]*\\n").replace("list"," {0,3}(?:[*+-]|1[.)]) ").replace("html","</?(?:tag)(?: +|\\n|/?>)|<(?:script|pre|style|textarea|!--)").replace("tag",ee).getRegex(),Ct=g(/^( {0,3}> ?(paragraph|[^\n]*)(?:\n|$))+/).replace("paragraph",Me).getRegex(),ce={blockquote:Ct,code:mt,def:At,fences:Et,heading:bt,hr:H,html:wt,lheading:Pe,list:kt,newline:Dt,paragraph:Me,table:U,text:Ft},Ee=g("^ *([^\\n ].*)\\n {0,3}((?:\\| *)?:?-+:? *(?:\\| *:?-+:? *)*(?:\\| *)?)(?:\\n((?:(?! *\\n|hr|heading|blockquote|code|fences|list|html).*(?:\\n|$))*)\\n*|$)").replace("hr",H).replace("heading"," {0,3}#{1,6}(?:\\s|$)").replace("blockquote"," {0,3}>").replace("code"," {4}[^\\n]").replace("fences"," {0,3}(?:`{3,}(?=[^`\\n]*\\n)|~{3,})[^\\n]*\\n").replace("list"," {0,3}(?:[*+-]|1[.)]) ").replace("html","</?(?:tag)(?: +|\\n|/?>)|<(?:script|pre|style|textarea|!--)").replace("tag",ee).getRegex(),xt={...ce,table:Ee,paragraph:g(ue).replace("hr",H).replace("heading"," {0,3}#{1,6}(?:\\s|$)").replace("|lheading","").replace("table",Ee).replace("blockquote"," {0,3}>").replace("fences"," {0,3}(?:`{3,}(?=[^`\\n]*\\n)|~{3,})[^\\n]*\\n").replace("list"," {0,3}(?:[*+-]|1[.)]) ").replace("html","</?(?:tag)(?: +|\\n|/?>)|<(?:script|pre|style|textarea|!--)").replace("tag",ee).getRegex()},yt={...ce,html:g(`^ *(?:comment *(?:\\n|\\s*$)|<(tag)[\\s\\S]+?</\\1> *(?:\\n{2,}|\\s*$)|<tag(?:"[^"]*"|'[^']*'|\\s[^'"/>\\s]*)*?/?> *(?:\\n{2,}|\\s*$))`).replace("comment",le).replace(/tag/g,"(?!(?:a|em|strong|small|s|cite|q|dfn|abbr|data|time|code|var|samp|kbd|sub|sup|i|b|u|mark|ruby|rt|rp|bdi|bdo|span|br|wbr|ins|del|img)\\b)\\w+(?!:|[^\\w\\s@]*@)\\b").getRegex(),def:/^ *\[([^\]]+)\]: *<?([^\s>]+)>?(?: +(["(][^\n]+[")]))? *(?:\n+|$)/,heading:/^(#{1,6})(.*)(?:\n+|$)/,fences:U,lheading:/^(.+?)\n {0,3}(=+|-+) *(?:\n+|$)/,paragraph:g(ue).replace("hr",H).replace("heading",` *#{1,6} *[^
]`).replace("lheading",Pe).replace("|table","").replace("blockquote"," {0,3}>").replace("|fences","").replace("|list","").replace("|html","").replace("|tag","").getRegex()},Ue=/^\\([!"#$%&'()*+,\-./:;<=>?@\[\]\\^_`{|}~])/,_t=/^(`+)([^`]|[^`][\s\S]*?[^`])\1(?!`)/,He=/^( {2,}|\\)\n(?!\s*$)/,Tt=/^(`+|[^`])(?:(?= {2,}\n)|[\s\S]*?(?:(?=[\\<!\[`*_]|\b_|$)|[^ ](?= {2,}\n)))/,G="\\p{P}\\p{S}",St=g(/^((?![*_])[\spunctuation])/,"u").replace(/punctuation/g,G).getRegex(),Bt=/\[[^[\]]*?\]\([^\(\)]*?\)|`[^`]*?`|<[^<>]*?>/g,Rt=g(/^(?:\*+(?:((?!\*)[punct])|[^\s*]))|^_+(?:((?!_)[punct])|([^\s_]))/,"u").replace(/punct/g,G).getRegex(),It=g("^[^_*]*?__[^_*]*?\\*[^_*]*?(?=__)|[^*]+(?=[^*])|(?!\\*)[punct](\\*+)(?=[\\s]|$)|[^punct\\s](\\*+)(?!\\*)(?=[punct\\s]|$)|(?!\\*)[punct\\s](\\*+)(?=[^punct\\s])|[\\s](\\*+)(?!\\*)(?=[punct])|(?!\\*)[punct](\\*+)(?!\\*)(?=[punct])|[^punct\\s](\\*+)(?=[^punct\\s])","gu").replace(/punct/g,G).getRegex(),Lt=g("^[^_*]*?\\*\\*[^_*]*?_[^_*]*?(?=\\*\\*)|[^_]+(?=[^_])|(?!_)[punct](_+)(?=[\\s]|$)|[^punct\\s](_+)(?!_)(?=[punct\\s]|$)|(?!_)[punct\\s](_+)(?=[^punct\\s])|[\\s](_+)(?!_)(?=[punct])|(?!_)[punct](_+)(?!_)(?=[punct])","gu").replace(/punct/g,G).getRegex(),Nt=g(/\\([punct])/,"gu").replace(/punct/g,G).getRegex(),Ot=g(/^<(scheme:[^\s\x00-\x1f<>]*|email)>/).replace("scheme",/[a-zA-Z][a-zA-Z0-9+.-]{1,31}/).replace("email",/[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+(@)[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+(?![-_])/).getRegex(),vt=g(le).replace("(?:-->|$)","-->").getRegex(),$t=g("^comment|^</[a-zA-Z][\\w:-]*\\s*>|^<[a-zA-Z][\\w-]*(?:attribute)*?\\s*/?>|^<\\?[\\s\\S]*?\\?>|^<![a-zA-Z]+\\s[\\s\\S]*?>|^<!\\[CDATA\\[[\\s\\S]*?\\]\\]>").replace("comment",vt).replace("attribute",/\s+[a-zA-Z:_][\w.:-]*(?:\s*=\s*"[^"]*"|\s*=\s*'[^']*'|\s*=\s*[^\s"'=<>`]+)?/).getRegex(),Q=/(?:\[(?:\\.|[^\[\]\\])*\]|\\.|`[^`]*`|[^\[\]\\`])*?/,zt=g(/^!?\[(label)\]\(\s*(href)(?:\s+(title))?\s*\)/).replace("label",Q).replace("href",/<(?:\\.|[^\n<>\\])+>|[^\s\x00-\x1f]*/).replace("title",/"(?:\\"?|[^"\\])*"|'(?:\\'?|[^'\\])*'|\((?:\\\)?|[^)\\])*\)/).getRegex(),Ge=g(/^!?\[(label)\]\[(ref)\]/).replace("label",Q).replace("ref",oe).getRegex(),qe=g(/^!?\[(ref)\](?:\[\])?/).replace("ref",oe).getRegex(),Pt=g("reflink|nolink(?!\\()","g").replace("reflink",Ge).replace("nolink",qe).getRegex(),pe={_backpedal:U,anyPunctuation:Nt,autolink:Ot,blockSkip:Bt,br:He,code:_t,del:U,emStrongLDelim:Rt,emStrongRDelimAst:It,emStrongRDelimUnd:Lt,escape:Ue,link:zt,nolink:qe,punctuation:St,reflink:Ge,reflinkSearch:Pt,tag:$t,text:Tt,url:U},Mt={...pe,link:g(/^!?\[(label)\]\((.*?)\)/).replace("label",Q).getRegex(),reflink:g(/^!?\[(label)\]\s*\[([^\]]*)\]/).replace("label",Q).getRegex()},se={...pe,escape:g(Ue).replace("])","~|])").getRegex(),url:g(/^((?:ftp|https?):\/\/|www\.)(?:[a-zA-Z0-9\-]+\.?)+[^\s<]*|^email/,"i").replace("email",/[A-Za-z0-9._+-]+(@)[a-zA-Z0-9-_]+(?:\.[a-zA-Z0-9-_]*[a-zA-Z0-9])+(?![-_])/).getRegex(),_backpedal:/(?:[^?!.,:;*_'"~()&]+|\([^)]*\)|&(?![a-zA-Z0-9]+;$)|[?!.,:;*_'"~)]+(?!$))+/,del:/^(~~?)(?=[^\s~])([\s\S]*?[^\s~])\1(?=[^~]|$)/,text:/^([`~]+|[^`~])(?:(?= {2,}\n)|(?=[a-zA-Z0-9.!#$%&'*+\/=?_`{\|}~-]+@)|[\s\S]*?(?:(?=[\\<!\[`*~_]|\b_|https?:\/\/|ftp:\/\/|www\.|$)|[^ ](?= {2,}\n)|[^a-zA-Z0-9.!#$%&'*+\/=?_`{\|}~-](?=[a-zA-Z0-9.!#$%&'*+\/=?_`{\|}~-]+@)))/},Ut={...se,br:g(He).replace("{2,}","*").getRegex(),text:g(se.text).replace("\\b_","\\b_| {2,}\\n").replace(/\{2,\}/g,"*").getRegex()},V={normal:ce,gfm:xt,pedantic:yt},M={normal:pe,gfm:se,breaks:Ut,pedantic:Mt};class B{tokens;options;state;tokenizer;inlineQueue;constructor(e){this.tokens=[],this.tokens.links=Object.create(null),this.options=e||z,this.options.tokenizer=this.options.tokenizer||new W,this.tokenizer=this.options.tokenizer,this.tokenizer.options=this.options,this.tokenizer.lexer=this,this.inlineQueue=[],this.state={inLink:!1,inRawBlock:!1,top:!0};const t={block:V.normal,inline:M.normal};this.options.pedantic?(t.block=V.pedantic,t.inline=M.pedantic):this.options.gfm&&(t.block=V.gfm,this.options.breaks?t.inline=M.breaks:t.inline=M.gfm),this.tokenizer.rules=t}static get rules(){return{block:V,inline:M}}static lex(e,t){return new B(t).lex(e)}static lexInline(e,t){return new B(t).inlineTokens(e)}lex(e){e=e.replace(/\r\n|\r/g,`
`),this.blockTokens(e,this.tokens);for(let t=0;t<this.inlineQueue.length;t++){const n=this.inlineQueue[t];this.inlineTokens(n.src,n.tokens)}return this.inlineQueue=[],this.tokens}blockTokens(e,t=[]){this.options.pedantic?e=e.replace(/\t/g,"    ").replace(/^ +$/gm,""):e=e.replace(/^( *)(\t+)/gm,(u,o,c)=>o+"    ".repeat(c.length));let n,r,a,i;for(;e;)if(!(this.options.extensions&&this.options.extensions.block&&this.options.extensions.block.some(u=>(n=u.call({lexer:this},e,t))?(e=e.substring(n.raw.length),t.push(n),!0):!1))){if(n=this.tokenizer.space(e)){e=e.substring(n.raw.length),n.raw.length===1&&t.length>0?t[t.length-1].raw+=`
`:t.push(n);continue}if(n=this.tokenizer.code(e)){e=e.substring(n.raw.length),r=t[t.length-1],r&&(r.type==="paragraph"||r.type==="text")?(r.raw+=`
`+n.raw,r.text+=`
`+n.text,this.inlineQueue[this.inlineQueue.length-1].src=r.text):t.push(n);continue}if(n=this.tokenizer.fences(e)){e=e.substring(n.raw.length),t.push(n);continue}if(n=this.tokenizer.heading(e)){e=e.substring(n.raw.length),t.push(n);continue}if(n=this.tokenizer.hr(e)){e=e.substring(n.raw.length),t.push(n);continue}if(n=this.tokenizer.blockquote(e)){e=e.substring(n.raw.length),t.push(n);continue}if(n=this.tokenizer.list(e)){e=e.substring(n.raw.length),t.push(n);continue}if(n=this.tokenizer.html(e)){e=e.substring(n.raw.length),t.push(n);continue}if(n=this.tokenizer.def(e)){e=e.substring(n.raw.length),r=t[t.length-1],r&&(r.type==="paragraph"||r.type==="text")?(r.raw+=`
`+n.raw,r.text+=`
`+n.raw,this.inlineQueue[this.inlineQueue.length-1].src=r.text):this.tokens.links[n.tag]||(this.tokens.links[n.tag]={href:n.href,title:n.title});continue}if(n=this.tokenizer.table(e)){e=e.substring(n.raw.length),t.push(n);continue}if(n=this.tokenizer.lheading(e)){e=e.substring(n.raw.length),t.push(n);continue}if(a=e,this.options.extensions&&this.options.extensions.startBlock){let u=1/0;const o=e.slice(1);let c;this.options.extensions.startBlock.forEach(l=>{c=l.call({lexer:this},o),typeof c=="number"&&c>=0&&(u=Math.min(u,c))}),u<1/0&&u>=0&&(a=e.substring(0,u+1))}if(this.state.top&&(n=this.tokenizer.paragraph(a))){r=t[t.length-1],i&&r.type==="paragraph"?(r.raw+=`
`+n.raw,r.text+=`
`+n.text,this.inlineQueue.pop(),this.inlineQueue[this.inlineQueue.length-1].src=r.text):t.push(n),i=a.length!==e.length,e=e.substring(n.raw.length);continue}if(n=this.tokenizer.text(e)){e=e.substring(n.raw.length),r=t[t.length-1],r&&r.type==="text"?(r.raw+=`
`+n.raw,r.text+=`
`+n.text,this.inlineQueue.pop(),this.inlineQueue[this.inlineQueue.length-1].src=r.text):t.push(n);continue}if(e){const u="Infinite loop on byte: "+e.charCodeAt(0);if(this.options.silent){console.error(u);break}else throw new Error(u)}}return this.state.top=!0,t}inline(e,t=[]){return this.inlineQueue.push({src:e,tokens:t}),t}inlineTokens(e,t=[]){let n,r,a,i=e,u,o,c;if(this.tokens.links){const l=Object.keys(this.tokens.links);if(l.length>0)for(;(u=this.tokenizer.rules.inline.reflinkSearch.exec(i))!=null;)l.includes(u[0].slice(u[0].lastIndexOf("[")+1,-1))&&(i=i.slice(0,u.index)+"["+"a".repeat(u[0].length-2)+"]"+i.slice(this.tokenizer.rules.inline.reflinkSearch.lastIndex))}for(;(u=this.tokenizer.rules.inline.blockSkip.exec(i))!=null;)i=i.slice(0,u.index)+"["+"a".repeat(u[0].length-2)+"]"+i.slice(this.tokenizer.rules.inline.blockSkip.lastIndex);for(;(u=this.tokenizer.rules.inline.anyPunctuation.exec(i))!=null;)i=i.slice(0,u.index)+"++"+i.slice(this.tokenizer.rules.inline.anyPunctuation.lastIndex);for(;e;)if(o||(c=""),o=!1,!(this.options.extensions&&this.options.extensions.inline&&this.options.extensions.inline.some(l=>(n=l.call({lexer:this},e,t))?(e=e.substring(n.raw.length),t.push(n),!0):!1))){if(n=this.tokenizer.escape(e)){e=e.substring(n.raw.length),t.push(n);continue}if(n=this.tokenizer.tag(e)){e=e.substring(n.raw.length),r=t[t.length-1],r&&n.type==="text"&&r.type==="text"?(r.raw+=n.raw,r.text+=n.text):t.push(n);continue}if(n=this.tokenizer.link(e)){e=e.substring(n.raw.length),t.push(n);continue}if(n=this.tokenizer.reflink(e,this.tokens.links)){e=e.substring(n.raw.length),r=t[t.length-1],r&&n.type==="text"&&r.type==="text"?(r.raw+=n.raw,r.text+=n.text):t.push(n);continue}if(n=this.tokenizer.emStrong(e,i,c)){e=e.substring(n.raw.length),t.push(n);continue}if(n=this.tokenizer.codespan(e)){e=e.substring(n.raw.length),t.push(n);continue}if(n=this.tokenizer.br(e)){e=e.substring(n.raw.length),t.push(n);continue}if(n=this.tokenizer.del(e)){e=e.substring(n.raw.length),t.push(n);continue}if(n=this.tokenizer.autolink(e)){e=e.substring(n.raw.length),t.push(n);continue}if(!this.state.inLink&&(n=this.tokenizer.url(e))){e=e.substring(n.raw.length),t.push(n);continue}if(a=e,this.options.extensions&&this.options.extensions.startInline){let l=1/0;const h=e.slice(1);let d;this.options.extensions.startInline.forEach(p=>{d=p.call({lexer:this},h),typeof d=="number"&&d>=0&&(l=Math.min(l,d))}),l<1/0&&l>=0&&(a=e.substring(0,l+1))}if(n=this.tokenizer.inlineText(a)){e=e.substring(n.raw.length),n.raw.slice(-1)!=="_"&&(c=n.raw.slice(-1)),o=!0,r=t[t.length-1],r&&r.type==="text"?(r.raw+=n.raw,r.text+=n.text):t.push(n);continue}if(e){const l="Infinite loop on byte: "+e.charCodeAt(0);if(this.options.silent){console.error(l);break}else throw new Error(l)}}return t}}class J{options;constructor(e){this.options=e||z}code(e,t,n){const r=(t||"").match(/^\S*/)?.[0];return e=e.replace(/\n$/,"")+`
`,r?'<pre><code class="language-'+y(r)+'">'+(n?e:y(e,!0))+`</code></pre>
`:"<pre><code>"+(n?e:y(e,!0))+`</code></pre>
`}blockquote(e){return`<blockquote>
${e}</blockquote>
`}html(e,t){return e}heading(e,t,n){return`<h${t}>${e}</h${t}>
`}hr(){return`<hr>
`}list(e,t,n){const r=t?"ol":"ul",a=t&&n!==1?' start="'+n+'"':"";return"<"+r+a+`>
`+e+"</"+r+`>
`}listitem(e,t,n){return`<li>${e}</li>
`}checkbox(e){return"<input "+(e?'checked="" ':"")+'disabled="" type="checkbox">'}paragraph(e){return`<p>${e}</p>
`}table(e,t){return t&&(t=`<tbody>${t}</tbody>`),`<table>
<thead>
`+e+`</thead>
`+t+`</table>
`}tablerow(e){return`<tr>
${e}</tr>
`}tablecell(e,t){const n=t.header?"th":"td";return(t.align?`<${n} align="${t.align}">`:`<${n}>`)+e+`</${n}>
`}strong(e){return`<strong>${e}</strong>`}em(e){return`<em>${e}</em>`}codespan(e){return`<code>${e}</code>`}br(){return"<br>"}del(e){return`<del>${e}</del>`}link(e,t,n){const r=ge(e);if(r===null)return n;e=r;let a='<a href="'+e+'"';return t&&(a+=' title="'+t+'"'),a+=">"+n+"</a>",a}image(e,t,n){const r=ge(e);if(r===null)return n;e=r;let a=`<img src="${e}" alt="${n}"`;return t&&(a+=` title="${t}"`),a+=">",a}text(e){return e}}class de{strong(e){return e}em(e){return e}codespan(e){return e}del(e){return e}html(e){return e}text(e){return e}link(e,t,n){return""+n}image(e,t,n){return""+n}br(){return""}}class R{options;renderer;textRenderer;constructor(e){this.options=e||z,this.options.renderer=this.options.renderer||new J,this.renderer=this.options.renderer,this.renderer.options=this.options,this.textRenderer=new de}static parse(e,t){return new R(t).parse(e)}static parseInline(e,t){return new R(t).parseInline(e)}parse(e,t=!0){let n="";for(let r=0;r<e.length;r++){const a=e[r];if(this.options.extensions&&this.options.extensions.renderers&&this.options.extensions.renderers[a.type]){const i=a,u=this.options.extensions.renderers[i.type].call({parser:this},i);if(u!==!1||!["space","hr","heading","code","table","blockquote","list","html","paragraph","text"].includes(i.type)){n+=u||"";continue}}switch(a.type){case"space":continue;case"hr":{n+=this.renderer.hr();continue}case"heading":{const i=a;n+=this.renderer.heading(this.parseInline(i.tokens),i.depth,dt(this.parseInline(i.tokens,this.textRenderer)));continue}case"code":{const i=a;n+=this.renderer.code(i.text,i.lang,!!i.escaped);continue}case"table":{const i=a;let u="",o="";for(let l=0;l<i.header.length;l++)o+=this.renderer.tablecell(this.parseInline(i.header[l].tokens),{header:!0,align:i.align[l]});u+=this.renderer.tablerow(o);let c="";for(let l=0;l<i.rows.length;l++){const h=i.rows[l];o="";for(let d=0;d<h.length;d++)o+=this.renderer.tablecell(this.parseInline(h[d].tokens),{header:!1,align:i.align[d]});c+=this.renderer.tablerow(o)}n+=this.renderer.table(u,c);continue}case"blockquote":{const i=a,u=this.parse(i.tokens);n+=this.renderer.blockquote(u);continue}case"list":{const i=a,u=i.ordered,o=i.start,c=i.loose;let l="";for(let h=0;h<i.items.length;h++){const d=i.items[h],p=d.checked,A=d.task;let m="";if(d.task){const x=this.renderer.checkbox(!!p);c?d.tokens.length>0&&d.tokens[0].type==="paragraph"?(d.tokens[0].text=x+" "+d.tokens[0].text,d.tokens[0].tokens&&d.tokens[0].tokens.length>0&&d.tokens[0].tokens[0].type==="text"&&(d.tokens[0].tokens[0].text=x+" "+d.tokens[0].tokens[0].text)):d.tokens.unshift({type:"text",text:x+" "}):m+=x+" "}m+=this.parse(d.tokens,c),l+=this.renderer.listitem(m,A,!!p)}n+=this.renderer.list(l,u,o);continue}case"html":{const i=a;n+=this.renderer.html(i.text,i.block);continue}case"paragraph":{const i=a;n+=this.renderer.paragraph(this.parseInline(i.tokens));continue}case"text":{let i=a,u=i.tokens?this.parseInline(i.tokens):i.text;for(;r+1<e.length&&e[r+1].type==="text";)i=e[++r],u+=`
`+(i.tokens?this.parseInline(i.tokens):i.text);n+=t?this.renderer.paragraph(u):u;continue}default:{const i='Token with "'+a.type+'" type was not found.';if(this.options.silent)return console.error(i),"";throw new Error(i)}}}return n}parseInline(e,t){t=t||this.renderer;let n="";for(let r=0;r<e.length;r++){const a=e[r];if(this.options.extensions&&this.options.extensions.renderers&&this.options.extensions.renderers[a.type]){const i=this.options.extensions.renderers[a.type].call({parser:this},a);if(i!==!1||!["escape","html","link","image","strong","em","codespan","br","del","text"].includes(a.type)){n+=i||"";continue}}switch(a.type){case"escape":{const i=a;n+=t.text(i.text);break}case"html":{const i=a;n+=t.html(i.text);break}case"link":{const i=a;n+=t.link(i.href,i.title,this.parseInline(i.tokens,t));break}case"image":{const i=a;n+=t.image(i.href,i.title,i.text);break}case"strong":{const i=a;n+=t.strong(this.parseInline(i.tokens,t));break}case"em":{const i=a;n+=t.em(this.parseInline(i.tokens,t));break}case"codespan":{const i=a;n+=t.codespan(i.text);break}case"br":{n+=t.br();break}case"del":{const i=a;n+=t.del(this.parseInline(i.tokens,t));break}case"text":{const i=a;n+=t.text(i.text);break}default:{const i='Token with "'+a.type+'" type was not found.';if(this.options.silent)return console.error(i),"";throw new Error(i)}}}return n}}class j{options;constructor(e){this.options=e||z}static passThroughHooks=new Set(["preprocess","postprocess","processAllTokens"]);preprocess(e){return e}postprocess(e){return e}processAllTokens(e){return e}}class Ze{defaults=ae();options=this.setOptions;parse=this.#e(B.lex,R.parse);parseInline=this.#e(B.lexInline,R.parseInline);Parser=R;Renderer=J;TextRenderer=de;Lexer=B;Tokenizer=W;Hooks=j;constructor(...e){this.use(...e)}walkTokens(e,t){let n=[];for(const r of e)switch(n=n.concat(t.call(this,r)),r.type){case"table":{const a=r;for(const i of a.header)n=n.concat(this.walkTokens(i.tokens,t));for(const i of a.rows)for(const u of i)n=n.concat(this.walkTokens(u.tokens,t));break}case"list":{const a=r;n=n.concat(this.walkTokens(a.items,t));break}default:{const a=r;this.defaults.extensions?.childTokens?.[a.type]?this.defaults.extensions.childTokens[a.type].forEach(i=>{const u=a[i].flat(1/0);n=n.concat(this.walkTokens(u,t))}):a.tokens&&(n=n.concat(this.walkTokens(a.tokens,t)))}}return n}use(...e){const t=this.defaults.extensions||{renderers:{},childTokens:{}};return e.forEach(n=>{const r={...n};if(r.async=this.defaults.async||r.async||!1,n.extensions&&(n.extensions.forEach(a=>{if(!a.name)throw new Error("extension name required");if("renderer"in a){const i=t.renderers[a.name];i?t.renderers[a.name]=function(...u){let o=a.renderer.apply(this,u);return o===!1&&(o=i.apply(this,u)),o}:t.renderers[a.name]=a.renderer}if("tokenizer"in a){if(!a.level||a.level!=="block"&&a.level!=="inline")throw new Error("extension level must be 'block' or 'inline'");const i=t[a.level];i?i.unshift(a.tokenizer):t[a.level]=[a.tokenizer],a.start&&(a.level==="block"?t.startBlock?t.startBlock.push(a.start):t.startBlock=[a.start]:a.level==="inline"&&(t.startInline?t.startInline.push(a.start):t.startInline=[a.start]))}"childTokens"in a&&a.childTokens&&(t.childTokens[a.name]=a.childTokens)}),r.extensions=t),n.renderer){const a=this.defaults.renderer||new J(this.defaults);for(const i in n.renderer){if(!(i in a))throw new Error(`renderer '${i}' does not exist`);if(i==="options")continue;const u=i,o=n.renderer[u],c=a[u];a[u]=(...l)=>{let h=o.apply(a,l);return h===!1&&(h=c.apply(a,l)),h||""}}r.renderer=a}if(n.tokenizer){const a=this.defaults.tokenizer||new W(this.defaults);for(const i in n.tokenizer){if(!(i in a))throw new Error(`tokenizer '${i}' does not exist`);if(["options","rules","lexer"].includes(i))continue;const u=i,o=n.tokenizer[u],c=a[u];a[u]=(...l)=>{let h=o.apply(a,l);return h===!1&&(h=c.apply(a,l)),h}}r.tokenizer=a}if(n.hooks){const a=this.defaults.hooks||new j;for(const i in n.hooks){if(!(i in a))throw new Error(`hook '${i}' does not exist`);if(i==="options")continue;const u=i,o=n.hooks[u],c=a[u];j.passThroughHooks.has(i)?a[u]=l=>{if(this.defaults.async)return Promise.resolve(o.call(a,l)).then(d=>c.call(a,d));const h=o.call(a,l);return c.call(a,h)}:a[u]=(...l)=>{let h=o.apply(a,l);return h===!1&&(h=c.apply(a,l)),h}}r.hooks=a}if(n.walkTokens){const a=this.defaults.walkTokens,i=n.walkTokens;r.walkTokens=function(u){let o=[];return o.push(i.call(this,u)),a&&(o=o.concat(a.call(this,u))),o}}this.defaults={...this.defaults,...r}}),this}setOptions(e){return this.defaults={...this.defaults,...e},this}lexer(e,t){return B.lex(e,t??this.defaults)}parser(e,t){return R.parse(e,t??this.defaults)}#e(e,t){return(n,r)=>{const a={...r},i={...this.defaults,...a};this.defaults.async===!0&&a.async===!1&&(i.silent||console.warn("marked(): The async option was set to true by an extension. The async: false option sent to parse will be ignored."),i.async=!0);const u=this.#t(!!i.silent,!!i.async);if(typeof n>"u"||n===null)return u(new Error("marked(): input parameter is undefined or null"));if(typeof n!="string")return u(new Error("marked(): input parameter is of type "+Object.prototype.toString.call(n)+", string expected"));if(i.hooks&&(i.hooks.options=i),i.async)return Promise.resolve(i.hooks?i.hooks.preprocess(n):n).then(o=>e(o,i)).then(o=>i.hooks?i.hooks.processAllTokens(o):o).then(o=>i.walkTokens?Promise.all(this.walkTokens(o,i.walkTokens)).then(()=>o):o).then(o=>t(o,i)).then(o=>i.hooks?i.hooks.postprocess(o):o).catch(u);try{i.hooks&&(n=i.hooks.preprocess(n));let o=e(n,i);i.hooks&&(o=i.hooks.processAllTokens(o)),i.walkTokens&&this.walkTokens(o,i.walkTokens);let c=t(o,i);return i.hooks&&(c=i.hooks.postprocess(c)),c}catch(o){return u(o)}}}#t(e,t){return n=>{if(n.message+=`
Please report this to https://github.com/markedjs/marked.`,e){const r="<p>An error occurred:</p><pre>"+y(n.message+"",!0)+"</pre>";return t?Promise.resolve(r):r}if(t)return Promise.reject(n);throw n}}}const $=new Ze;function f(s,e){return $.parse(s,e)}f.options=f.setOptions=function(s){return $.setOptions(s),f.defaults=$.defaults,Oe(f.defaults),f};f.getDefaults=ae;f.defaults=z;f.use=function(...s){return $.use(...s),f.defaults=$.defaults,Oe(f.defaults),f};f.walkTokens=function(s,e){return $.walkTokens(s,e)};f.parseInline=$.parseInline;f.Parser=R;f.parser=R.parse;f.Renderer=J;f.TextRenderer=de;f.Lexer=B;f.lexer=B.lex;f.Tokenizer=W;f.Hooks=j;f.parse=f;f.options;f.setOptions;f.use;f.walkTokens;f.parseInline;R.parse;B.lex;
return Object.freeze({ lex: (text) => B.lex(text, {gfm:true, breaks:false, pedantic:false}) });
})();

/* ThreadDeck answer outline v2.
 * A document-level outline, not a collection of whichever list scores highest.
 * Markdown and mounted DOM are converted to the SAME small block tree, then use
 * the same section selector. No HTML from an answer is rendered by this engine.
 */
const TDAnswerOutline = (() => {
  'use strict';
  const entities = {amp:'&',lt:'<',gt:'>',quot:'"',apos:"'",nbsp:' ',ndash:'–',mdash:'—',hellip:'…',copy:'©',reg:'®'};
  const clean = (text) => String(text || '')
    .replace(/[^]*/g, ' ').replace(/[\u200B\uFEFF]/g, '')
    .replace(/&(#x[\da-f]+|#\d+|[a-z]+);/gi, (all, code) => {
      if (code[0] !== '#') return entities[code.toLowerCase()] ?? all;
      const n = code[1].toLowerCase() === 'x' ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
      return n > 0 && n <= 0x10ffff && !(n >= 0xd800 && n <= 0xdfff) ? String.fromCodePoint(n) : '\uFFFD';
    }).replace(/\s+/g, ' ').trim();

  function inlineText(tokens) {
    return (tokens || []).map((token) => {
      if (token.type === 'html') return '';
      if (token.type === 'br') return '\n';
      if (token.tokens) return inlineText(token.tokens);
      return String(token.text || '');
    }).join('');
  }
  function bodyText(token) {
    if (!token) return '';
    if (token.type === 'list') return token.items.map((item) => item.tokens.map(bodyText).join(' ')).join(' ');
    return clean(token.tokens ? inlineText(token.tokens) : token.text);
  }
  function splitNumber(title) {
    const text = clean(title);
    // Not a version number, a decimal, or an arbitrary digit at the start of prose.
    const match = text.match(/^((?:\d{1,4}[.)、](?!\d)|[一二三四五六七八九十百零〇两]+[、.)）]|[（(](?:\d{1,4}|[一二三四五六七八九十百零〇两]+)[)）]))\s*(\S[\s\S]*)$/);
    return match ? {marker:match[1], title:match[2]} : {marker:'', title:text};
  }
  function headingLike(text) {
    const value = clean(text);
    return value.length >= 2 && value.length <= 160 && !/[。！？!?]/.test(value.replace(/[？?]$/, '')) &&
      !/(?:\.{3}|…{2})$/.test(value) && !/^https?:\/\//i.test(value);
  }
  function leadingStrong(token) {
    const tokens = (token?.tokens || []).filter((t) => t.type !== 'text' || clean(t.text));
    const first = tokens[0];
    if (first?.type !== 'strong') return null;
    const title = clean(inlineText(first.tokens) || first.text);
    const restRaw = inlineText(tokens.slice(1));
    const rest = clean(restRaw);
    return title ? {title, rest, separateLine:/^[ \t]*\n/.test(restRaw), pure: !rest || /^[：:]$/.test(rest)} : null;
  }
  function paragraphTitle(token) {
    if (!token || !['paragraph', 'text'].includes(token.type)) return null;
    const strong = leadingStrong(token);
    if ((strong?.pure || strong?.separateLine) && headingLike(strong.title)) return {...splitNumber(strong.title), type:'soft'};
    // Common Chinese enumerated section labels are paragraphs rather than Markdown lists.
    const line = String(token.text || bodyText(token)).split('\n')[0].trim();
    const numbered = splitNumber(clean(line.replace(/^\*\*([\s\S]*)\*\*$/, '$1')));
    if (numbered.marker && headingLike(numbered.title) && !/^\d{1,4}[.)]$/.test(numbered.marker)) {
      return {...numbered, type:'soft'};
    }
    return null;
  }
  function listRecord(item, list, index) {
    const children = (item.tokens || []).filter((t) => t.type !== 'space');
    const first = children.find((t) => ['paragraph','text','heading'].includes(t.type));
    if (!first) return null;
    const strong = leadingStrong(first);
    const text = bodyText(first);
    let title = strong?.title || text;
    if (!strong && first.type !== 'heading') {
      // This shortening is only a fallback for a list with no authored title.
      // Explicit headings and strong titles are NEVER cut at a colon or first sentence.
      const topic = title.match(/^(.{2,64}?)[：:](?!\/)(.+)$/);
      title = topic ? topic[1] : title.split(/[。！？](?:\s*|$)/)[0];
    }
    title = clean(title);
    if (!title) return null;
    const hasBody = children.length > 1 || Boolean(strong?.rest && !/^[：:]$/.test(strong.rest));
    const meaningful = (first.tokens || []).filter((t) => t.type !== 'text' || clean(t.text));
    const linkOnly = meaningful.length > 0 && meaningful.every((t) => t.type === 'link' || (t.type === 'text' && /^[。.,，;；\s]*$/.test(t.text))) && !hasBody;
    const marker = list.ordered ? `${Number.isFinite(item.value) ? item.value : Number(list.start || 1) + index}.` : '•';
    return {title, marker, strong:Boolean(strong), hasBody, linkOnly, target:item.target || null,
      structured:first.type === 'heading' || (headingLike(title) && hasBody && Boolean(strong || children.length > 1)),
      raw:bodyText(first)};
  }
  function visibleRootTokens(tokens) {
    const result = [];
    // HTML details may be emitted as several tokens separated by blank lines. Keep
    // suppression across token boundaries; never descend into code/quotes/tables.
    const suppressed = [];
    let inComment = false;
    for (const token of tokens || []) {
      if (token.type === 'html') {
        const raw = token.raw || token.text || '';
        const wasSuppressed = suppressed.length > 0 || inComment;
        const matches = raw.match(/<!--|-->|<\/?(?:details|summary|think|analysis|script|style|pre|blockquote)\b[^>]*>/gi) || [];
        for (const tag of matches) {
          if (tag === '<!--') { inComment = true; continue; }
          if (tag === '-->') { inComment = false; continue; }
          if (inComment) continue;
          const m = tag.match(/^<(\/)?([\w-]+)/); if (!m) continue;
          const name = m[2].toLowerCase();
          if (m[1]) { const at=suppressed.lastIndexOf(name); if(at>=0) suppressed.splice(at); }
          else if (!/\/>$/.test(tag)) suppressed.push(name);
        }
        // HTML is never an outline title. Its only job here is the exclusion boundary.
        if (wasSuppressed || matches.length || token.type === 'html') continue;
      }
      if (suppressed.length || inComment || ['space','code','blockquote','table','def'].includes(token.type)) continue;
      result.push(token);
    }
    return result;
  }

  function select(tokens) {
    const root = visibleRootTokens(tokens);
    const headingCount = root.filter((t) => t.type === 'heading' && bodyText(t)).length;
    const softCandidates = new Map();
    for (let i=0; i<root.length; i++) {
      const title = paragraphTitle(root[i]);
      if (title) softCandidates.set(i, title);
    }
    const hasSkeleton = headingCount > 0 || softCandidates.size > 0;
    // A lone document title does not make all the answer's following list sections
    // disappear. A real multi-heading answer, however, does not promote local steps.
    const onlyDocumentTitle = headingCount === 1 && root[0]?.type === 'heading' && softCandidates.size === 0;
    const blocks = [];
    const headingStack = [];
    let softParent = null;
    const append = (record, parent = null) => {
      const split = record.marker ? {title:clean(record.title), marker:record.marker} : splitNumber(record.title);
      if (!split.title) return null;
      const item = {...record, ...split, ordinal:blocks.length,
        parentOrdinal:parent?.ordinal ?? -1, depth:parent ? parent.depth+1 : 0};
      blocks.push(item); return item;
    };
    for (let i=0; i<root.length; i++) {
      const token = root[i];
      if (token.type === 'heading') {
        const level = Math.max(1, Math.min(6, Number(token.depth)||1));
        while (headingStack.length && headingStack.at(-1).headingLevel >= level) headingStack.pop();
        const record = append({type:'heading', title:bodyText(token), headingLevel:level, target:token.target || null}, headingStack.at(-1));
        if (record) headingStack.push(record);
        softParent = null; continue;
      }
      if (softCandidates.has(i)) {
        const title = softCandidates.get(i);
        softParent = append({...title, headingLevel:null, target:token.target || null}, headingStack.at(-1));
        continue;
      }
      if (token.type !== 'list') continue;
      const records = (token.items || []).map((item, index) => listRecord(item, token, index)).filter(Boolean);
      if (!records.length || records.every((r) => r.linkOnly)) continue;
      const structuralCount = records.filter((r) => r.structured).length;
      const isSectionList = structuralCount > 0 && structuralCount >= Math.ceil(records.length / 2);
      if (hasSkeleton && !onlyDocumentTitle && !isSectionList) continue;
      const parent = softParent || headingStack.at(-1) || null;
      // Every useful sibling group is retained, in source order. No largest-group
      // heuristic and no preference for numbered fragments over document headings.
      for (const record of records) {
        if (record.linkOnly) continue;
        append({...record, type:'list-section', headingLevel:null}, parent);
      }
    }
    return blocks;
  }

  function parse(text) {
    const source = String(text || '').replace(/\r\n?/g,'\n');
    if (!source.trim()) return [];
    return select(TDMarkdownLexer.lex(source));
  }

  // The DOM adapter deliberately creates block tokens rather than rendering back
  // to Markdown. Parent/child boundaries and emphasized titles are not guessed.
  function fromDOM(roots, excluded) {
    function reject(element) {
      if (!(element instanceof Element)) return false;
      return element.matches('button,[role="button"],nav,aside,script,style,svg,input,textarea,select,[contenteditable="true"],.sr-only,[data-testid*="action"],details,summary,blockquote,pre,table,[hidden],[aria-hidden="true"]') || excluded(element);
    }
    function inline(node) {
      if (node.nodeType === 3) return [{type:'text', text:node.textContent || ''}];
      if (!(node instanceof Element) || reject(node)) return [];
      if (node.tagName === 'BR') return [{type:'br'}];
      const tokens = Array.from(node.childNodes).flatMap(inline);
      if (['STRONG','B','EM','I','CODE','A'].includes(node.tagName)) {
        const type = {STRONG:'strong',B:'strong',EM:'em',I:'em',CODE:'codespan',A:'link'}[node.tagName];
        return [{type, tokens, text:inlineText(tokens)}];
      }
      return tokens;
    }
    function read(node) {
      if (!(node instanceof Element) || reject(node)) return [];
      const tag = node.tagName;
      const heading = /^H([1-6])$/.exec(tag)?.[1] || (node.getAttribute('role') === 'heading' ? node.getAttribute('aria-level') || '2' : '');
      if (heading) return [{type:'heading', depth:Number(heading), tokens:inline(node), target:node}];
      if (tag === 'OL' || tag === 'UL') {
        const start = Number(node.getAttribute('start')) || 1;
        const items = Array.from(node.children).filter((n)=>n.tagName === 'LI').map((li)=> {
          const tokens = [];
          let pending = [];
          const flush = () => { if (clean(inlineText(pending))) tokens.push({type:'text',tokens:pending}); pending=[]; };
          for (const child of li.childNodes) {
            if (child instanceof Element && /^(P|DIV|SECTION|ARTICLE|H[1-6]|OL|UL|PRE|BLOCKQUOTE|TABLE|DETAILS)$/.test(child.tagName)) {
              flush(); tokens.push(...read(child));
            } else pending.push(...inline(child));
          }
          flush();
          return {type:'list_item',tokens,target:li,value:li.hasAttribute('value')?Number(li.getAttribute('value')):null};
        });
        return [{type:'list',ordered:tag === 'OL',start,items,target:node}];
      }
      if (tag === 'P') return [{type:'paragraph', tokens:inline(node), text:inlineText(inline(node)), target:node}];
      if (tag === 'HR') return [{type:'hr'}];
      const hasBlocks = Array.from(node.children).some(child =>
        /^(P|DIV|SECTION|ARTICLE|H[1-6]|OL|UL|PRE|BLOCKQUOTE|TABLE|DETAILS)$/.test(child.tagName) ||
        child.getAttribute('role') === 'heading' || child.querySelector('[role="heading"]'));
      if (!hasBlocks && clean(node.textContent)) return [{type:'paragraph',tokens:inline(node),text:inlineText(inline(node)),target:node}];
      return Array.from(node.children).flatMap(read);
    }
    const tokens = roots.flatMap(read);
    return select(tokens);
  }
  return Object.freeze({parse, fromDOM, select, clean});
})();

  function tdBuildDocumentOutline(records, metadata = {}, dom = false) {
    return records.map((record, index) => {
      const kind = record.type === 'heading' ? 'heading' : record.type === 'soft' ? 'section-title' : 'numbered-section';
      const origin = record.type === 'heading' ? 'document-heading' : record.type === 'soft' ? 'section-title' : 'list-section';
      const title = TDAnswerOutline.clean(record.title);
      const fingerprint = hashString(`${kind}:${title.normalize('NFKC')}`);
      return {
        key: '', kind, outlineOrigin: `${dom ? 'dom' : 'markdown'}-${origin}`,
        label: title, text: title, sectionTitle: title, matchText: title,
        identityText: title.normalize('NFKC').toLowerCase(), fingerprint,
        prefixKey: title.slice(0,160), suffixKey: title.slice(-144),
        locatorKey: `${kind}:${index}`, kindOrdinal: index, outlineOrdinal: index,
        outlineIndex: index, blockIndex: index,
        outlineDepth: record.depth || 0, parentOutlineOrdinal: record.parentOrdinal ?? -1,
        headingLevel: record.headingLevel || null, marker: record.marker || '',
        itemCount: record.type === 'list-section' ? 1 : 0,
        firstItem: title, lastItem: title, firstMarker: record.marker || '', lastMarker: record.marker || '',
        listSignature: '', navigable: false, summaryOnly: true,
        answerNodeId: metadata.answerNodeId || '', answerMessageId: metadata.answerMessageId || '',
        answerOrdinal: Number.isFinite(metadata.answerOrdinal) ? metadata.answerOrdinal : 0,
        identityTokens: [metadata.answerNodeId, metadata.answerMessageId].filter(Boolean),
        source: dom ? 'dom-answer' : 'conversation-api-answer',
        target: dom ? record.target || null : null, skeletonTarget: null, turnId: '',
        mappingConfidence: dom ? 'dom-document-structure' : '',
      };
    });
  }

  function tdInstallInterface() {
    if (!shadowRoot || shadowRoot.querySelector('.td-search')) return;
    const panel = shadowRoot.querySelector('.preview-panel');
    const search = document.createElement('input'); search.className = 'td-search'; search.type = 'search';
    search.placeholder = tr('搜索问答与章节'); search.setAttribute('aria-label',search.placeholder);
    const searchBox = document.createElement('div');
    searchBox.className = 'outline-search';
    const searchIcon = document.createElement('span');
    searchIcon.className = 'outline-search-icon';
    searchIcon.innerHTML = threadDeckIcon('search');
    const clear = document.createElement('button');
    clear.type = 'button'; clear.className = 'outline-search-clear'; clear.hidden = true;
    clear.setAttribute('aria-label','清除搜索');
    clear.innerHTML = threadDeckIcon('close');
    searchBox.append(searchIcon, search, clear);
    panel.insertBefore(searchBox, listEl);
    clear.addEventListener('click', () => {
      search.value = ''; search.dispatchEvent(new Event('input')); search.focus();
    });
    const tools = panel.querySelector('.zoom-actions');
    tools.querySelector('[data-action="open-settings"]').innerHTML = threadDeckIcon('settings');
    search.addEventListener('input', () => { clear.hidden = !search.value; td.search = search.value.trim().toLocaleLowerCase(); renderEntries(true); });
    search.addEventListener('keydown', (event) => { if (event.key === 'Escape' && search.value) { event.stopPropagation(); search.value = ''; search.dispatchEvent(new Event('input')); } });
    const pin = document.createElement('button'); pin.className = 'icon-button td-pin'; pin.type = 'button';
    pin.innerHTML = threadDeckIcon('pin');
    pin.setAttribute('aria-label','固定大纲');
    pin.setAttribute('aria-pressed','false');
    pin.title = '固定大纲';
    pin.addEventListener('click',()=>tdSetOutlinePinned(navigatorEl.dataset.pinned!=='true'));
    tools.insertBefore(pin, tools.querySelector('[data-action="open-settings"]'));
    const style = document.createElement('style');
    style.textContent = `
      .preview-panel { width:min(400px,calc(100vw - 72px)); max-height:min(640px,calc(100dvh - 80px)); }
      .navigator[data-pinned="true"] .preview-panel {opacity:1;visibility:visible;pointer-events:auto;transform:translate(0,-50%) scale(1)}
      .preview-panel .panel-header{padding:12px 12px 9px 16px;border-bottom:0;min-height:0;gap:8px}
      .preview-panel .panel-title{font-size:14px;line-height:20px}
      .preview-panel .panel-subtitle{font-size:11px;line-height:16px}
      .preview-panel .zoom-actions{gap:2px}
      .preview-panel .icon-button{width:28px;height:28px;border-radius:7px}
      .preview-panel .zoom-button{font-weight:550;color:var(--apr-muted);min-height:28px;padding-inline:7px}
      .preview-panel .icon-button svg{width:18px;height:18px;stroke-width:1.55}
      .td-pin[aria-pressed="true"]{background:var(--apr-hover);color:var(--apr-text)}
      .outline-search{flex:0 0 auto;display:flex;align-items:center;gap:7px;margin:0 16px 8px;padding:0 8px 0 10px;min-height:35px;border:1px solid transparent;border-radius:9px;background:var(--apr-input);color:var(--apr-muted)}
      .outline-search:focus-within{border-color:var(--apr-muted);background:var(--apr-panel-bg)}
      .outline-search-icon,.outline-search-clear{display:grid;place-items:center;flex:none}
      .outline-search-icon svg,.outline-search-clear svg{display:block;width:16px;height:16px;stroke-width:1.55}
      .td-search{appearance:none;display:block;flex:1;min-width:0;box-sizing:border-box;margin:0;border:0;outline:0;background:none;color:var(--apr-text);font:inherit;font-size:13px;line-height:20px;padding:5px 0}
      .td-search::-webkit-search-cancel-button{appearance:none}
      .td-search::placeholder{color:var(--apr-muted);opacity:1}
      .outline-search-clear{appearance:none;border:0;padding:0;width:24px;height:24px;border-radius:6px;background:none;color:var(--apr-muted);cursor:pointer}
      .outline-search-clear:hover{background:var(--apr-hover);color:var(--apr-text)}
      .outline-search-clear:focus-visible{outline:1px solid currentColor}
      .outline-search-clear[hidden]{display:none}
      .preview-panel .preview-list{padding:0 8px 8px}
      .preview-panel .question-row{border-radius:8px}
      .preview-panel .preview-item{min-height:39px;padding:7px 8px}
      .preview-panel .preview-text{font-size:13px;line-height:19px}
      .preview-panel .answer-toggle{width:42px;flex-basis:42px;padding-right:7px}
      .preview-panel .chevron{width:15px;height:15px;flex:none}
      .preview-panel .empty-outline{padding:14px 8px;color:var(--apr-muted)}
      .preview-panel .td-outline-coverage{padding:7px 12px 7px 16px;font-size:11px;line-height:16px;color:var(--apr-muted);border-top:1px solid var(--apr-panel-border)}
      .td-outline-coverage:not([hidden]){display:flex;align-items:center;justify-content:space-between;gap:8px}
      .td-outline-coverage button{padding:4px 8px;font:inherit;white-space:nowrap}
      .td-outline-coverage[hidden]{display:none}
      .answer-list {margin:4px 10px 10px 22px;padding:2px 0 2px 10px}
      .answer-item{opacity:1;color:var(--apr-text);gap:8px;padding:5px 6px;line-height:20px;cursor:default}
      .answer-text{font-size:13px;line-height:21px;display:block;overflow:visible;white-space:normal;overflow-wrap:anywhere;-webkit-line-clamp:unset}
      .answer-item{padding-left:calc(6px + var(--td-outline-depth,0) * 12px);align-items:flex-start}
      button.answer-item{cursor:pointer;text-align:left;font:inherit;font-size:12px}
      button.answer-item:hover{background:var(--apr-hover);color:var(--apr-text)}
      button.answer-item:focus-visible{outline:2px solid var(--apr-text);outline-offset:-2px}
      button.answer-item[aria-busy="true"]{cursor:progress}
      .answer-item[data-depth="0"][data-outline-kind="heading"] .answer-text{font-weight:550}
      .answer-item:not([data-depth="0"]){color:var(--apr-muted)}
      .td-marker[hidden]{display:none}
      .td-marker{min-width:20px;width:auto!important;flex-basis:auto!important;white-space:nowrap}
      .answer-list .answer-item + .answer-item[data-depth="0"]{margin-top:3px}
      .td-marker{flex:0 0 18px;color:var(--apr-muted);font-size:12px;line-height:20px;font-variant-numeric:tabular-nums;text-align:right}
      .td-outline-more{appearance:none;border:0;background:transparent;color:var(--apr-muted);font:inherit;font-size:12px;padding:5px 8px;cursor:pointer}
      .preview-text{line-height:20px}.question-row{margin-top:3px}.preview-list{scrollbar-gutter:stable;overscroll-behavior:contain}
      .queue-dock-text{font-weight:500!important;font-size:14px!important;line-height:21px!important}
      .queue-dock-item[data-status="uncertain"] .queue-dock-meta,.queue-dock-item[data-status="failed"] .queue-dock-meta{color:#b45309}
      :host([data-theme="dark"]) .queue-dock-item[data-status="uncertain"] .queue-dock-meta{color:#fbbf24}
      .queue-item-menu{position:fixed!important;z-index:2147483647!important;max-width:min(310px,calc(100vw - 24px))}
      .queue-dock-controls button:focus-visible,.icon-button:focus-visible,.answer-toggle:focus-visible{outline:2px solid var(--apr-text);outline-offset:2px}
      .selection-action{z-index:2147483646!important}.comment-popover{z-index:2147483647!important}
    `;
    shadowRoot.appendChild(style);
    // A true portal: the menu is not a descendant of the scrolling/clipped queue.
    shadowRoot.appendChild(queueMenuEl);
    tdInstallQueueDismissal();
    tdInstallMinimap();
    shadowRoot.addEventListener('click', (event) => {
      const node = event.target?.closest?.('[data-action]'); const action = node?.dataset.action || '';
      if (!action.startsWith('td-')) return;
      event.preventDefault(); event.stopPropagation();
      const item = promptQueue.find((q) => q.id === node.dataset.queueId);
      if (action === 'td-diagnostic') { void tdCopyDiagnostic(); return; }
      if(action==='td-support'){tdCloseQueueMenu();tdOpenSupport();return;}
      if (action === 'td-submit-once' && item) { void tdInterjectQueueItem(item.id); return; }
      if (action === 'td-show-all') { td.expandAll.add(node.dataset.promptKey); renderEntries(true); return; }
      if (action === 'td-acknowledge' && item && !queueProcessing) {
        // Explicit recovery action: retire only this local record; no resend.
        tdOutbox.pauseOwner=item.id;
        if(item.sendReceipt){item.sendReceipt.ackedAt=Date.now();item.sendReceipt.source='user-confirmed';}
        tdCommitItem(item,'user-confirmed');
        const original=tdOutbox.runtime.get(item)?.tx;if(original){original.confirmed=true;void tdCleanupAcceptedEditor(original);}
      }
      if (action === 'td-retry' && item && !queueProcessing) {
        if(item.status==='uncertain'&&Date.now()>Number(node.dataset.retryArmedUntil||0)){node.dataset.retryArmedUntil=String(Date.now()+10000);node.textContent='再次点击：确认未上屏并重试（可能重复）';return;}
        item.sendReceipt=null;item.attemptedAt=0;tdOutbox.runtime.delete(item);
        item.status = 'waiting'; item.error = ''; queuePaused = false;
        if (td.run?.source === 'queue-dispatch') td.run = null;
        td.activityDirty = true;
        // Do not overwrite the draft left by the previous uncertain send.
        const composer = getChatGptComposer();
        const payload = composePromptWithReviewComments(item.text,item.comments);
        if (composer && getComposerText(composer) === payload) td.staged = { id:item.id,composer,expected:payload,scope:tdScope() };
      }

      if (action === 'td-recheck-turn' && !queueProcessing) {
        tdScheduleTurnCheck(0, true); td.activityDirty = true;
        showToast('正在重新核对当前轮次，不会中断回答或重复发送', 1700);
      }

      tdCloseQueueMenu(); saveWorkflowState(); renderWorkflowPanel(); tdWake(80);
    });
    shadowRoot.addEventListener('focusout', (event) => {
      if (event.target?.matches?.('[data-queue-text]')) requestAnimationFrame(() => {
        if (!shadowRoot.activeElement?.matches?.('[data-queue-text]')) td.editingQueueId = '';
        renderQueueDock(); tdWake(120);
      });
    });
    // Keyboard ordering is available in addition to drag-and-drop.
    shadowRoot.addEventListener('keydown', (event) => {
      const handle = event.target?.closest?.('[data-queue-drag-handle]');
      if (handle && event.altKey && ['ArrowUp','ArrowDown'].includes(event.key)) {
        event.preventDefault(); moveQueuedPrompt(handle.dataset.queueDragHandle,event.key === 'ArrowUp' ? -1 : 1);
      }
      if (event.key === 'Escape' && queueMenuOpenId) tdCloseQueueMenu({ restoreFocus: true });
    });
    const autoRow = settingsFormEl.querySelector('[name="autoRunQueue"]')?.closest('.setting-row');
    if (autoRow) {
      const row = autoRow.cloneNode(true); row.querySelector('input').name='allowBackgroundQueue';
      row.querySelector('.setting-name').textContent='允许后台标签页继续队列';
      row.querySelector('.setting-description').textContent='在当前会话后台继续发送。关闭标签页后停止。';
      autoRow.after(row);
    }
    const diagnostics = document.createElement('button'); diagnostics.className = 'dialog-button'; diagnostics.type = 'button';
    diagnostics.textContent = '复制诊断'; diagnostics.addEventListener('click',tdCopyDiagnostic);
    settingsFormEl.querySelector('.settings-footer').insertBefore(diagnostics,settingsFormEl.querySelector('.footer-group'));
    const resize = new ResizeObserver(() => { scheduleQueueDockPosition(); scheduleInlineCommentPosition(); });
    const bind = () => { resize.disconnect(); const anchor = findChatGptComposerDockAnchor(); if (anchor) resize.observe(anchor); };
    bind();
    // Rebind when the composer is actually replaced, not on every response token.
    let prior = getChatGptComposer();
    window.setInterval(() => { if(tdDeferInteraction('composer-rebind'))return; const current = getChatGptComposer(); if (current !== prior) { prior = current; bind(); } },1500);
  }

  function reasonForAutoScroll() { return !shadowRoot?.activeElement && !(navigatorEl?.matches(':hover')); }

  let lastScanStats = createScanStats();

  function createScanStats() {
    return {
      source: 'none',
      nativeCount: 0,
      skeletonCount: 0,
      apiCount: 0,
      apiStatus: chatGptApiStatus,
      apiError: chatGptApiError,
      mountedCount: 0,
      answerBlockCount: 0,
      cachedCount: 0,
      selectorHits: {},
      scrollRoot: '',
      route: routeKey,
    };
  }

  function mergeSettings(defaults, raw) {
    const source = raw && typeof raw === 'object' ? raw : {};
    const result = {
      ...defaults,
      ...source,
      sites: {
        chatgpt: true,
      },
    };
    for (const key of [
      'enabled',
      'smoothScroll',
      'enableAnswerJump',
      'pinchTopics',
      'autoTopicSummary',
      'prepareTopicSummary',
      'prefetchHistoryOnOutline',
      'hideNativeChatGptRail',
      'rememberPrompts',
      'enableInlineComments',
      'enterQueuesWhileGenerating',
      'autoRunQueue',
      'allowBackgroundQueue',
      'showQueueDock',
    ]) {
      result[key] = result[key] !== false;
    }

    const hasExplicitOutlineMode = typeof source.answerOutlineMode === 'string';
    const migratedMode = source.showAnswerOutline === false ? 'off' : 'stable';
    result.answerOutlineMode = hasExplicitOutlineMode && ANSWER_OUTLINE_MODES.has(source.answerOutlineMode)
      ? source.answerOutlineMode
      : migratedMode;
    result.showAnswerOutline = result.answerOutlineMode !== 'off';
    result.navigationStyle = result.navigationStyle === 'minimap' ? 'minimap' : 'rail';
    // Hide the native rail while ours is visible, unless explicitly disabled.
    result.hideNativeChatGptRail = source.hideNativeChatGptRail !== false;

    result.minPrompts = clampNumber(result.minPrompts, 1, 50, 1);
    result.rightOffset = clampNumber(result.rightOffset, 0, 120, 12);
    result.hideBelowWidth = clampNumber(result.hideBelowWidth, 0, 2000, 720);
    return result;
  }

  function clampNumber(value, min, max, fallback) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? Math.min(max, Math.max(min, parsed)) : fallback;
  }

  function normalizeHost(hostname) {
    return String(hostname || '').toLowerCase().replace(/^www\./, '');
  }

  function resolveSite() { return SITE_CONFIGS.chatgpt.hosts.includes(normalizeHost(location.hostname)) ? SITE_CONFIGS.chatgpt : null; }

  function getRouteKey() {
    const loc = getChatGptConversationLocator();
    const path = loc.id ? `/${loc.kind === 'share' ? 'share' : 'c'}/${loc.id}` : location.pathname.replace(/\/$/, '') || '/';
    // Query/hash changes are not conversation changes. Do not reset a running queue.
    return `${site.id}:${location.hostname}${path}`;
  }

  function getChatGptConversationLocator() {
    if (site.id !== 'chatgpt') return { id: '', kind: '' };
    const segments = location.pathname.split('/').filter(Boolean);
    for (const routeKind of ['c', 'share']) {
      const routeIndex = segments.lastIndexOf(routeKind);
      if (routeIndex < 0 || routeIndex + 1 >= segments.length) continue;
      let value = '';
      try {
        value = decodeURIComponent(segments[routeIndex + 1]);
      } catch {
        continue;
      }
      if (/^[A-Za-z0-9_-]{8,128}$/.test(value)) {
        return { id: value, kind: routeKind === 'share' ? 'share' : 'conversation' };
      }
    }
    return { id: '', kind: '' };
  }

  function getChatGptConversationResource() {
    const locator = getChatGptConversationLocator();
    return locator.id ? { ...locator, key: `${locator.kind}:${locator.id}` } : null;
  }

  function getChatGptConversationId() {
    return getChatGptConversationLocator().id;
  }

  function isChatGptSharePage() {
    return site.id === 'chatgpt' && getChatGptConversationLocator().kind === 'share';
  }

  function isCurrentPageEligible() {
    // ChatGPT 首页、新建对话页没有稳定的会话 ID。页面里的推荐问题不能被当成会话内容。
    // 公开分享页拥有稳定 share ID，可以建立只读时间线。
    if (site.id === 'chatgpt') return Boolean(getChatGptConversationId());
    return true;
  }

  function isPlainObject(value) {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
  }

  function entryAnchorRole(entry) {
    const explicit = String(entry?.anchorRole || '').toLowerCase();
    if (explicit === 'assistant' || explicit === 'user') return explicit;
    return entry?.kind === 'automation-run' ? 'assistant' : 'user';
  }

  function isUserAnchoredEntry(entry) {
    return entryAnchorRole(entry) === 'user';
  }

  function isAutomationTimelineEntry(entry) {
    return entry?.kind === 'automation-run' || entryAnchorRole(entry) === 'assistant';
  }

  function getPageFetch() {
    return null;
  }

  async function requestChatGptJson(endpoint,init={},label='ChatGPT request') {
    throw tdReadDenied('local-only');
  }

  const CHATGPT_HIDDEN_CONTENT_TYPES = new Set([
    'thoughts',
    'thought',
    'thinking',
    'reasoning',
    'reasoning_recap',
    'analysis',
    'chain_of_thought',
    'model_editable_context',
    'user_editable_context',
  ]);

  function hiddenChatGptMessage(message) {
    const metadata = isPlainObject(message?.metadata) ? message.metadata : {};
    if (
      metadata.is_visually_hidden_from_conversation === true ||
      metadata.is_visually_hidden === true ||
      metadata.hidden === true ||
      metadata.is_hidden === true ||
      metadata.is_reasoning === true ||
      metadata.is_thought === true ||
      metadata.is_analysis === true
    ) {
      return true;
    }
    if (message?.recipient != null && message.recipient !== 'all') return true;
    const contentType = String(message?.content?.content_type || '').toLowerCase();
    if (CHATGPT_HIDDEN_CONTENT_TYPES.has(contentType)) return true;
    const semanticType = [
      metadata.message_type,
      metadata.content_type,
      metadata.category,
      metadata.kind,
      metadata.type,
      metadata.channel,
      metadata.message_channel,
      message?.channel,
      message?.content?.type,
    ].map((value) => String(value || '').toLowerCase()).join(' ');
    return /(?:^|[_\s-])(reasoning|thinking|thoughts?|analysis|commentary|tool|chain[_\s-]*of[_\s-]*thought|cot)(?:$|[_\s-])/.test(semanticType);
  }

  function chatGptMessageCanSupplyAnswerOutline(message) {
    if (!isPlainObject(message) || hiddenChatGptMessage(message)) return false;
    const metadata = isPlainObject(message.metadata) ? message.metadata : {};
    const contentType = String(message?.content?.content_type || message?.content?.type || '').toLowerCase();
    const semanticType = [
      contentType,
      metadata.message_type,
      metadata.content_type,
      metadata.category,
      metadata.kind,
      metadata.type,
      metadata.channel,
      metadata.message_channel,
      message.channel,
    ].map((value) => String(value || '').toLowerCase()).join(' ');
    if (/(?:reasoning|thinking|thoughts?|analysis|commentary|tool|execution|computer|chain[_\s-]*of[_\s-]*thought|cot|system|context)/i.test(semanticType)) {
      return false;
    }
    // Final ChatGPT answers are normally text/markdown-like. Unknown empty types are
    // allowed for rollout compatibility, but explicit non-text payloads are excluded.
    if (contentType && !/(?:^|[_-])(text|markdown|multimodal)(?:$|[_-])/.test(contentType)) return false;
    return true;
  }

  function chatGptAssistantOutlineCandidateScore(message, rawText = '') {
    if (!chatGptMessageCanSupplyAnswerOutline(message)) return Number.NEGATIVE_INFINITY;
    const metadata = isPlainObject(message.metadata) ? message.metadata : {};
    const contentType = String(message?.content?.content_type || message?.content?.type || '').toLowerCase();
    const channel = String(message.channel || metadata.channel || metadata.message_channel || '').toLowerCase();
    const status = String(message.status || metadata.status || '').toLowerCase();
    const finishType = String(metadata?.finish_details?.type || metadata?.finish_type || '').toLowerCase();
    let score = 0;
    if (/^(?:text|markdown|multimodal_text)$/.test(contentType)) score += 24;
    else if (/(?:text|markdown|multimodal)/.test(contentType)) score += 14;
    if (channel === 'final') score += 90;
    if (message.end_turn === true || metadata.end_turn === true) score += 80;
    if (metadata.is_final === true || metadata.final === true) score += 80;
    if (/finished|complete|success|stop/.test(status)) score += 35;
    if (/stop|complete|success/.test(finishType)) score += 30;
    if (message.end_turn === false || metadata.end_turn === false) score -= 12;
    if (/^\s*(?:[-+*]|\d{1,4}[.)])\s+/m.test(rawText)) score += 5;
    return score;
  }

  function chatGptAutomationMetadata(message) {
    const metadata = isPlainObject(message?.metadata) ? message.metadata : {};
    const triggerCheckpoint = isPlainObject(metadata.notification_trigger_checkpoint)
      ? metadata.notification_trigger_checkpoint
      : {};
    const role = String(message?.author?.role || '').toLowerCase();
    const authorType = String(metadata.real_author_type || '').toLowerCase();
    const triggerSource = String(triggerCheckpoint.source || '').toLowerCase();
    const asyncSource = normalizeText(metadata.async_source || '');
    const automationId = normalizeText(
      metadata.automation_id ||
      (authorType === 'automation' ? metadata.real_author_id : '') ||
      (triggerSource === 'automations' ? asyncSource : ''),
    );
    const automationTitle = normalizeText(
      metadata.automation_title ||
      metadata.real_author_title ||
      metadata.task_title ||
      '',
    );
    const exchangeId = normalizeText(metadata.turn_exchange_id || metadata.working_turn_id || '');
    const triggeredAtText = normalizeText(triggerCheckpoint.triggered_at || metadata.triggered_at || '');
    const triggeredAtNumeric = Number(triggeredAtText);
    const triggeredAtMs = triggeredAtText && !Number.isFinite(triggeredAtNumeric)
      ? Date.parse(triggeredAtText)
      : Number.NaN;
    const messageCreateTime = Number(message?.create_time ?? message?.update_time);
    const createTime = Number.isFinite(triggeredAtNumeric) && triggeredAtNumeric > 0
      ? (triggeredAtNumeric > 1e12 ? triggeredAtNumeric / 1000 : triggeredAtNumeric)
      : Number.isFinite(triggeredAtMs)
        ? triggeredAtMs / 1000
        : Number.isFinite(messageCreateTime) && messageCreateTime > 0
          ? (messageCreateTime > 1e12 ? messageCreateTime / 1000 : messageCreateTime)
          : null;
    const visuallyHidden = metadata.is_visually_hidden_from_conversation === true ||
      metadata.is_visually_hidden === true || metadata.hidden === true || metadata.is_hidden === true;
    const hasAutomationMarker = Boolean(
      authorType === 'automation' ||
      triggerSource === 'automations' ||
      automationId ||
      (automationTitle && asyncSource && asyncSource !== 'web'),
    );
    if (!hasAutomationMarker) return null;
    return {
      automationId,
      automationTitle: automationTitle || '定时任务',
      exchangeId,
      createTime,
      triggerSource,
      isTrigger: role === 'user' && (authorType === 'automation' || (visuallyHidden && Boolean(automationId))),
      isOutput: role === 'assistant' && hasAutomationMarker,
    };
  }

  function sameAutomationRun(record, automation) {
    if (!record || record.kind !== 'automation-run' || !automation) return false;
    if (record.exchangeId && automation.exchangeId) return record.exchangeId === automation.exchangeId;
    if (record.automationId && automation.automationId && record.automationId === automation.automationId) {
      if (!record._bestVisibleAssistant) return true;
      const left = Number(record.createTime);
      const right = Number(automation.createTime);
      return !(Number.isFinite(left) && Number.isFinite(right) && Math.abs(left - right) > 120);
    }
    return false;
  }

  function extractFirstMarkdownHeading(rawText) {
    const lines = normalizeMultilineText(rawText).split('\n');
    let inFence = false;
    let fenceCharacter = '';
    const headings = [];
    for (const line of lines) {
      const trimmed = line.trim();
      const fence = trimmed.match(/^(```+|~~~+)/);
      if (fence) {
        const character = fence[1][0];
        if (!inFence) {
          inFence = true;
          fenceCharacter = character;
        } else if (character === fenceCharacter) {
          inFence = false;
          fenceCharacter = '';
        }
        continue;
      }
      if (inFence) continue;
      const match = line.match(/^\s{0,3}(#{1,3})\s+(.+?)\s*#*\s*$/);
      if (!match) continue;
      const title = stripMarkdownForOutline(match[2]);
      if (title) headings.push({ level: match[1].length, title });
    }
    const preferred = headings.find((item) => item.level === 1) || headings[0];
    return preferred ? truncateText(preferred.title, 150) : '';
  }

  function automationEventTitle(rawText, automationTitle = '') {
    const heading = extractFirstMarkdownHeading(rawText);
    if (heading) return heading;
    const lines = normalizeMultilineText(rawText).split('\n');
    let inFence = false;
    let fenceCharacter = '';
    for (const line of lines) {
      const trimmed = line.trim();
      const fence = trimmed.match(/^(```+|~~~+)/);
      if (fence) {
        const character = fence[1][0];
        if (!inFence) {
          inFence = true;
          fenceCharacter = character;
        } else if (character === fenceCharacter) {
          inFence = false;
          fenceCharacter = '';
        }
        continue;
      }
      if (inFence || !trimmed || /^(?:>|[-+*]\s|\d{1,4}[.)]\s|\|)/.test(trimmed)) continue;
      const title = stripMarkdownForOutline(trimmed);
      if (title) return truncateText(title, 150);
    }
    return normalizeText(automationTitle) || '定时任务运行';
  }

  function formatTimelineTime(value) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric) || numeric <= 0) return '';
    const date = new Date(numeric > 1e12 ? numeric : numeric * 1000);
    if (!Number.isFinite(date.getTime())) return '';
    const now = new Date();
    try {
      return new Intl.DateTimeFormat('zh-CN', {
        ...(date.getFullYear() !== now.getFullYear() ? { year: 'numeric' } : {}),
        month: 'numeric',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      }).format(date);
    } catch {
      return date.toLocaleString();
    }
  }

  function automationEventMetaText(entry) {
    const title = normalizeText(entry?.automationTitle || '定时任务');
    const eventTitle = normalizeText(entry?.eventTitle || entry?.text || '');
    const time = formatTimelineTime(entry?.createTime);
    return [title && title !== eventTitle ? title : '', time].filter(Boolean).join(' · ');
  }

  function chatGptAttachmentLabel(message) {
    const metadata = isPlainObject(message?.metadata) ? message.metadata : {};
    const attachments = Array.isArray(metadata.attachments) ? metadata.attachments : [];
    const firstNamed = attachments.find((item) => {
      const name = item?.name || item?.file_name || item?.filename || item?.original_name;
      return typeof name === 'string' && name.trim();
    });
    if (firstNamed) {
      const name = firstNamed.name || firstNamed.file_name || firstNamed.filename || firstNamed.original_name;
      return `文件提问：${normalizeText(name)}`;
    }

    const parts = Array.isArray(message?.content?.parts) ? message.content.parts : [];
    const hasMedia = parts.some((part) => {
      if (!isPlainObject(part)) return false;
      const type = String(part.content_type || part.type || '').toLowerCase();
      return Boolean(part.asset_pointer || part.file_id) || /(image|audio|video|file|media|attachment)/.test(type);
    });
    return hasMedia ? '图片或文件提问' : '';
  }

  function normalizeMultilineText(text) {
    return String(text || '')
      .replace(/[\u200B\uFEFF]/g, '')
      .replace(/\r\n?/g, '\n')
      .replace(/[ \t]+\n/g, '\n')
      .replace(/\n{4,}/g, '\n\n\n')
      .trim();
  }

  function normalizeInlineReviewText(text) {
    return String(text || '')
      .replace(/[\u200B\uFEFF]/g, '')
      .replace(/\r\n?/g, '\n')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function threadDeckIcon(name, className = '') {
    const body = THREADDECK_ICON_PATHS[name] || '';
    const classAttribute = className ? ` class="${className}"` : '';
    return `<svg${classAttribute} viewBox="0 0 20 20" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" vector-effect="non-scaling-stroke">${body}</svg>`;
  }

  function chatGptTextFromPart(part) {
    if (typeof part === 'string') return part;
    if (typeof part === 'number' || typeof part === 'boolean') return String(part);
    if (!isPlainObject(part)) return '';
    if (typeof part.text === 'string') return part.text;
    if (isPlainObject(part.text) && typeof part.text.value === 'string') return part.text.value;
    if (typeof part.content === 'string' && /text/i.test(String(part.content_type || part.type || ''))) {
      return part.content;
    }
    if (Array.isArray(part.parts)) return part.parts.map(chatGptTextFromPart).filter(Boolean).join('\n\n');
    return '';
  }

  function extractChatGptMessageRawText(message) {
    const content = message?.content;
    let text = '';
    if (typeof content === 'string') {
      text = content;
    } else if (isPlainObject(content)) {
      if (Array.isArray(content.parts)) text = content.parts.map(chatGptTextFromPart).filter(Boolean).join('\n\n');
      else if (typeof content.text === 'string') text = content.text;
      else if (isPlainObject(content.text) && typeof content.text.value === 'string') text = content.text.value;
      else if (typeof content.result === 'string') text = content.result;
      else text = chatGptTextFromPart(content);
    }
    return String(text || '').replace(/\r\n?/g, '\n').replace(/[\u200B\uFEFF]/g, '');
  }

  function stripMarkdownForOutline(text) {
    return normalizeMultilineText(text)
      // ChatGPT stores citations as private-use marker tokens in conversation JSON,
      // while the renderer turns them into pills/links. Remove those presentation-only
      // tokens before building identities so API text and rendered text stay comparable.
      .replace(/(?:cite|filecite)[^]*/g, ' ')
      .replace(/[^]*/g, ' ')
      .replace(/(?:\[\d{1,3}\]|【\d{1,3}】|[¹²³⁴⁵⁶⁷⁸⁹⁰]+)/g, ' ')
      .replace(/^\s*```[^\n]*$/gm, '')
      .replace(/^\s*~~~[^\n]*$/gm, '')
      .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
      .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
      .replace(/<[^>]+>/g, ' ')
      .replace(/^\s{0,3}#{1,6}\s+/gm, '')
      .replace(/^\s*>\s?/gm, '')
      .replace(/^\s*(?:[-+*]|\d+[.)])\s+/gm, '')
      .replace(/^\s*\|?\s*:?-{3,}:?(?:\s*\|\s*:?-{3,}:?)+\s*\|?\s*$/gm, '')
      .replace(/[|]/g, ' ')
      .replace(/[*_~`]+/g, '')
      .replace(/\\([\\`*{}\[\]()#+\-.!_>])/g, '$1')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function outlineLabelFromText(text, max = 92) {
    const clean = normalizeText(text);
    if (!clean) return '';
    const sentenceMatch = clean.match(/^(.{4,}?[。！？!?](?:[”’」』】])?)(?:\s|$)/);
    return truncateText(sentenceMatch?.[1] || clean, max);
  }

  function semanticTextWeight(text) {
    const clean = normalizeText(text);
    let weight = 0;
    for (const character of clean) {
      const codePoint = character.codePointAt(0) || 0;
      if (/[A-Za-z0-9]/.test(character)) weight += 1;
      else if (codePoint > 255) weight += 2;
      else if (!/\s/.test(character)) weight += 0.2;
    }
    return weight;
  }

  function sentenceBoundaryCount(text) {
    const clean = normalizeText(text);
    const cjk = clean.match(/[。！？]+/g)?.length || 0;
    const latin = clean.match(/[.!?](?=\s|$|[”’"')\]}])/g)?.length || 0;
    return cjk + latin;
  }

  function isDeterministicLongParagraph(text) {
    const clean = stripMarkdownForOutline(text);
    if (!clean) return false;
    const weight = semanticTextWeight(clean);
    if (weight >= LONG_PARAGRAPH_MIN_WEIGHT) return true;
    return weight >= LONG_PARAGRAPH_MIN_SENTENCE_WEIGHT && sentenceBoundaryCount(clean) >= LONG_PARAGRAPH_MIN_SENTENCES;
  }

  function normalizeOutlineIdentityText(text) {
    const clean = stripMarkdownForOutline(text);
    try {
      return clean.normalize('NFKC').toLowerCase().replace(/\s+/g, ' ').trim();
    } catch {
      return clean.toLowerCase().replace(/\s+/g, ' ').trim();
    }
  }

  function outlinePrefixKey(text) {
    return normalizeOutlineIdentityText(text).slice(0, 160);
  }

  function outlineSuffixKey(text) {
    const identity = normalizeOutlineIdentityText(text);
    return identity.slice(Math.max(0, identity.length - 144));
  }

  function resolveAnswerOutlineMode(metadata = {}) {
    const requested = metadata.outlineMode || metadata.mode || settings.answerOutlineMode || 'stable';
    return ANSWER_OUTLINE_MODES.has(requested) ? requested : 'stable';
  }


  function createAnswerOutlineBlock(kind, raw, metadata = {}) {
    const items = Array.isArray(metadata.items)
      ? metadata.items.map((item) => stripMarkdownForOutline(item)).filter(Boolean)
      : [];
    const sourceText = items.length && kind !== 'numbered-section' ? items.join('\n') : stripMarkdownForOutline(raw);
    const matchText = stripMarkdownForOutline(sourceText);
    if (!matchText) return null;
    if (kind === 'prose-summary' && !isDeterministicLongParagraph(matchText)) return null;

    const headingLevel = Number.isFinite(metadata.headingLevel) ? metadata.headingLevel : null;
    const marker = normalizeText(metadata.marker || '');
    const firstItem = stripMarkdownForOutline(metadata.firstItem || items[0] || '');
    const lastItem = stripMarkdownForOutline(metadata.lastItem || items[items.length - 1] || firstItem);
    const itemCount = Math.max(0, Number.isFinite(metadata.itemCount) ? metadata.itemCount : items.length);
    const sectionTitle = stripMarkdownForOutline(metadata.sectionTitle || firstItem || '');
    let label = '';

    if (kind === 'heading') {
      label = truncateText(matchText, 96);
    } else if (kind === 'numbered-section') {
      const title = sectionTitle || outlineLabelFromText(matchText, 96);
      label = `${marker ? `${marker} ` : ''}${truncateText(title, 108)}`.trim();
    } else if (kind === 'ordered-list' || kind === 'unordered-list') {
      // A plain list is represented by a compact excerpt of its real answer text.
      // Major numbered sections are split earlier and therefore do not collapse into
      // one opaque “list summary” row.
      const previewItems = (items.length ? items : [firstItem || matchText])
        .map((item) => outlineLabelFromText(item, 56))
        .filter(Boolean)
        .slice(0, 3);
      label = `${previewItems.join(' · ')}${itemCount > previewItems.length ? ' · …' : ''}`;
    } else {
      label = outlineLabelFromText(matchText, 96);
    }
    if (!normalizeText(label)) return null;

    const kindOrdinal = Number.isFinite(metadata.kindOrdinal) ? metadata.kindOrdinal : 0;
    const outlineOrdinal = Number.isFinite(metadata.outlineOrdinal) ? metadata.outlineOrdinal : 0;
    const identity = normalizeOutlineIdentityText(matchText);
    const navigable = metadata.navigable !== false && ['heading', 'numbered-section', 'ordered-list', 'unordered-list'].includes(kind);
    return {
      key: '',
      kind,
      outlineOrigin: normalizeText(metadata.outlineOrigin || ''),
      label: truncateText(label, 132),
      text: truncateText(label, 132),
      matchText: truncateText(matchText, MAX_ANSWER_MATCH_TEXT),
      identityText: truncateText(identity, MAX_ANSWER_MATCH_TEXT),
      fingerprint: hashString(`${kind}:${identity}`),
      prefixKey: outlinePrefixKey(matchText),
      suffixKey: outlineSuffixKey(matchText),
      locatorKey: `${kind}:${kindOrdinal}`,
      kindOrdinal,
      outlineOrdinal,
      marker,
      headingLevel,
      itemCount,
      sectionTitle: truncateText(sectionTitle, 180),
      firstItem: truncateText(firstItem, 260),
      lastItem: truncateText(lastItem, 260),
      firstMarker: normalizeText(metadata.firstMarker || marker),
      lastMarker: normalizeText(metadata.lastMarker || ''),
      listSignature: items.length ? hashString(items.map(normalizeOutlineIdentityText).join('|')) : '',
      navigable,
      summaryOnly: !navigable,
      sourceStartLine: Number.isFinite(metadata.sourceStartLine) ? metadata.sourceStartLine : null,
      sourceEndLine: Number.isFinite(metadata.sourceEndLine) ? metadata.sourceEndLine : null,
      blockIndex: -1,
      outlineIndex: -1,
      answerNodeId: metadata.answerNodeId || '',
      answerMessageId: metadata.answerMessageId || '',
      answerOrdinal: Number.isFinite(metadata.answerOrdinal) ? metadata.answerOrdinal : 0,
      identityTokens: [metadata.answerNodeId, metadata.answerMessageId].filter(Boolean),
      source: 'conversation-api-answer',
      target: null,
      skeletonTarget: null,
      turnId: '',
      mappingConfidence: '',
    };
  }

  function parseAnswerOutlineBlocks(rawText, metadata = {}) {
    if (resolveAnswerOutlineMode(metadata) === 'off') return [];
    const text = String(rawText || '').replace(/\r\n?/g, '\n');
    if (!text.trim()) return [];
    let base = td.outlineCache.get(text);
    if (!base) {
      try { base = tdBuildDocumentOutline(TDAnswerOutline.parse(text)); }
      catch (error) { tdLog('outline-parse-failed', error?.name || 'Error'); return []; }
      if (text.length < 300000) {
        td.outlineCache.set(text, base);
        while (td.outlineCache.size > 80) td.outlineCache.delete(td.outlineCache.keys().next().value);
      }
    }
    return base.map((block) => ({ ...block,
      answerNodeId: metadata.answerNodeId || '', answerMessageId: metadata.answerMessageId || '',
      answerOrdinal: Number.isFinite(metadata.answerOrdinal) ? metadata.answerOrdinal : 0,
      identityTokens: [metadata.answerNodeId, metadata.answerMessageId].filter(Boolean),
    }));
  }

  function chatGptNodeTime(node) {
    const message = isPlainObject(node?.message) ? node.message : {};
    const values = [message.update_time, message.create_time, node?.update_time, node?.create_time]
      .map(Number)
      .filter((value) => Number.isFinite(value) && value > 0);
    return values.length ? Math.max(...values) : 0;
  }

  function inferChatGptLeafNodeId(mapping) {
    if (!isPlainObject(mapping)) return '';
    const ids = Object.keys(mapping);
    if (!ids.length) return '';
    const hasChild = new Set();
    for (const [nodeId, rawNode] of Object.entries(mapping)) {
      const node = isPlainObject(rawNode) ? rawNode : {};
      for (const child of Array.isArray(node.children) ? node.children : []) {
        if (typeof child === 'string' && Object.prototype.hasOwnProperty.call(mapping, child)) hasChild.add(nodeId);
      }
      const parent = typeof node.parent === 'string' ? node.parent : '';
      if (parent && Object.prototype.hasOwnProperty.call(mapping, parent)) hasChild.add(parent);
    }
    const leaves = ids.filter((id) => !hasChild.has(id));
    const candidates = leaves.length ? leaves : ids;
    const score = (leafId) => {
      let depth = 0;
      let visibleCount = 0;
      let latestTime = 0;
      let nodeId = leafId;
      const visited = new Set();
      while (nodeId && !visited.has(nodeId)) {
        visited.add(nodeId);
        const node = mapping[nodeId];
        if (!isPlainObject(node)) break;
        depth += 1;
        latestTime = Math.max(latestTime, chatGptNodeTime(node));
        if (isPlainObject(node.message) && !hiddenChatGptMessage(node.message)) visibleCount += 1;
        const parent = typeof node.parent === 'string' ? node.parent : '';
        if (!parent || !Object.prototype.hasOwnProperty.call(mapping, parent)) break;
        nodeId = parent;
      }
      return { latestTime, depth, visibleCount, leafId };
    };
    return candidates
      .map(score)
      .sort((left, right) => (
        right.latestTime - left.latestTime ||
        right.depth - left.depth ||
        right.visibleCount - left.visibleCount ||
        left.leafId.localeCompare(right.leafId)
      ))[0]?.leafId || '';
  }

  function walkChatGptActiveBranch(conversation) {
    const mapping = isPlainObject(conversation?.mapping) ? conversation.mapping : null;

    // Public share payloads expose `linear_conversation`, which is the authoritative
    // displayed branch. Its `current_node` can point at a highlighted historical
    // message rather than the final item, so prefer this sequence whenever present.
    const linearConversation = Array.isArray(conversation?.linear_conversation)
      ? conversation.linear_conversation
      : [];
    if (linearConversation.length) {
      const seen = new Set();
      return linearConversation.map((rawNode, index) => {
        if (!isPlainObject(rawNode)) return null;
        const rawId = typeof rawNode.id === 'string'
          ? rawNode.id
          : typeof rawNode?.message?.id === 'string'
            ? rawNode.message.id
            : `linear-node-${index}`;
        if (!rawId || seen.has(rawId)) return null;
        seen.add(rawId);
        const mapped = mapping && isPlainObject(mapping[rawId]) ? mapping[rawId] : null;
        const node = mapped
          ? { ...mapped, ...rawNode, message: rawNode.message || mapped.message }
          : rawNode;
        return { nodeId: rawId, node };
      }).filter(Boolean);
    }

    if (!mapping) return [];
    const explicitCurrentNode = typeof conversation?.current_node === 'string' ? conversation.current_node : '';
    const currentNode = explicitCurrentNode && Object.prototype.hasOwnProperty.call(mapping, explicitCurrentNode)
      ? explicitCurrentNode
      : inferChatGptLeafNodeId(mapping);
    if (!currentNode) return [];

    const reverse = [];
    const visited = new Set();
    let nodeId = currentNode;
    while (nodeId && !visited.has(nodeId)) {
      visited.add(nodeId);
      const node = mapping[nodeId];
      if (!isPlainObject(node)) break;
      reverse.push({ nodeId, node });
      const parent = node.parent;
      if (parent === null || parent === undefined || parent === '') break;
      if (typeof parent !== 'string' || !Object.prototype.hasOwnProperty.call(mapping, parent)) break;
      nodeId = parent;
    }
    return reverse.reverse();
  }

  function parseChatGptPromptRecords(conversation) {
    const records = [];
    let currentEvent = null;

    const finalizeEventAnswer = (event) => {
      if (!event) return;
      const candidate = event._bestVisibleAssistant;
      if (!candidate) {
        if (event.anchorRole === 'assistant') {
          const index = records.indexOf(event);
          if (index >= 0) records.splice(index, 1);
        }
        return;
      }

      const useful = event._visibleAnswers.filter(answer => answer === candidate || answer.finalChannel || answer.completed);
      event.answerRecords = useful.map((answer, answerOrdinal) => {
        const blocks = parseAnswerOutlineBlocks(answer.rawText, {
          answerNodeId: answer.nodeId, answerMessageId: answer.messageId, answerOrdinal,
        });
        return {...answer, answerOrdinal, blocks, outlineRawText:answer.rawText,
          outlineSchema:ANSWER_OUTLINE_CACHE_SCHEMA, identityTokens:[answer.nodeId,answer.messageId].filter(Boolean),
          skeletonTarget:null,turnId:''};
      });
      event.answerBlocks = event.answerRecords.flatMap(answer => answer.blocks).map((block, outlineIndex) => ({
        ...block, blockIndex:outlineIndex, outlineIndex, parentKey:event.key,
        key:'chatgpt-answer:'+(block.answerNodeId||block.answerMessageId||event.nodeId)+':'+outlineIndex,
      }));

      if (event.kind === 'automation-run') {
        event.nodeId = candidate.nodeId;
        event.messageId = candidate.messageId;
        event.anchorRole = 'assistant';
        event.identityTokens = Array.from(new Set([
          ...(event.identityTokens || []),
          candidate.nodeId,
          candidate.messageId,
        ].filter(Boolean)));
        event.text = automationEventTitle(candidate.rawText, event.automationTitle);
        event.eventTitle = event.text;
        if (Number.isFinite(Number(candidate.createTime))) {
          event.createTime = candidate.createTime;
        }
        if (!event.automationTitle && candidate.automationTitle) event.automationTitle = candidate.automationTitle;
        if (!event.automationId && candidate.automationId) event.automationId = candidate.automationId;
        if (!event.exchangeId && candidate.exchangeId) event.exchangeId = candidate.exchangeId;
      }

      if (event.kind === 'assistant-output') {
        event.text = event.answerBlocks[0]?.label || outlineLabelFromText(candidate.rawText);
      }
      delete event._visibleAnswers;
      delete event._bestVisibleAssistant;
      delete event._bestVisibleAssistantScore;
    };

    const createPromptEvent = (nodeId, message) => {
      const rawQuestion = extractChatGptMessageRawText(message);
      const text = normalizeText(rawQuestion) || chatGptAttachmentLabel(message);
      if (!text) return null;
      const messageId = typeof message.id === 'string' ? message.id : '';
      const event = {
        key: `chatgpt-api:${nodeId}`,
        kind: 'prompt',
        anchorRole: 'user',
        text,
        rawQuestion,
        nodeId,
        messageId,
        identityTokens: [nodeId, messageId].filter(Boolean),
        orderHint: records.length,
        source: 'conversation-api',
        createTime: Number.isFinite(Number(message.create_time)) ? Number(message.create_time) : null,
        answerBlocks: [],
        answerRecords: [],
        skeletonTarget: null,
        turnId: '',
        _visibleAnswers: [],
        _bestVisibleAssistant: null,
        _bestVisibleAssistantScore: Number.NEGATIVE_INFINITY,
      };
      records.push(event);
      return event;
    };

    const createAutomationEvent = (nodeId, message, automation, fromOutput = false) => {
      const messageId = typeof message?.id === 'string' ? message.id : '';
      const seed = automation?.exchangeId || nodeId || messageId || `${records.length}`;
      const event = {
        key: `chatgpt-automation:${seed}`,
        kind: 'automation-run',
        anchorRole: 'assistant',
        text: automation?.automationTitle || '定时任务运行',
        eventTitle: '',
        nodeId: fromOutput ? nodeId : '',
        messageId: fromOutput ? messageId : '',
        triggerNodeId: fromOutput ? '' : nodeId,
        triggerMessageId: fromOutput ? '' : messageId,
        identityTokens: [nodeId, messageId].filter(Boolean),
        orderHint: records.length,
        source: 'conversation-api',
        createTime: Number.isFinite(Number(automation?.createTime)) ? Number(automation.createTime) : null,
        automationId: automation?.automationId || '',
        automationTitle: automation?.automationTitle || '定时任务',
        exchangeId: automation?.exchangeId || '',
        answerBlocks: [],
        answerRecords: [],
        skeletonTarget: null,
        turnId: '',
        _visibleAnswers: [],
        _bestVisibleAssistant: null,
        _bestVisibleAssistantScore: Number.NEGATIVE_INFINITY,
      };
      records.push(event);
      return event;
    };

    const considerAssistantCandidate = (event, nodeId, message, automation) => {
      if (!event || !chatGptMessageCanSupplyAnswerOutline(message)) return;
      const parts = Array.isArray(message.content?.parts) ? message.content.parts : [];
      const imageReply = parts.some(part=>/^image(?:_|$)/i.test(part?.content_type || part?.type || ''));
      const rawText = extractChatGptMessageRawText(message) || (imageReply ? '图片回复' : '');
      if (!rawText) return;
      const candidateScore = chatGptAssistantOutlineCandidateScore(message, rawText);
      const answer = {
        nodeId,
        finalChannel: message.channel === 'final' || message.metadata?.is_final === true,
        messageId: typeof message.id === 'string' ? message.id : '',
        rawText,
        imageReply,
        completed: message.end_turn === true || message.status === 'finished_successfully',
        createTime: Number.isFinite(Number(automation?.createTime))
          ? Number(automation.createTime)
          : Number.isFinite(Number(message.create_time))
            ? Number(message.create_time)
            : null,
        automationId: automation?.automationId || '',
        automationTitle: automation?.automationTitle || '',
        exchangeId: automation?.exchangeId || '',
      };
      const prior = event._visibleAnswers.findIndex(item => item.nodeId === nodeId ||
        (answer.messageId && item.messageId === answer.messageId));
      if (prior < 0) event._visibleAnswers.push(answer); else event._visibleAnswers[prior] = answer;
      if (candidateScore >= event._bestVisibleAssistantScore) {
        event._bestVisibleAssistantScore = candidateScore;
        event._bestVisibleAssistant = answer;
      }
    };

    for (const { nodeId, node } of walkChatGptActiveBranch(conversation)) {
      const message = node.message;
      if (!isPlainObject(message)) continue;
      const role = String(message?.author?.role || '');
      const automation = chatGptAutomationMetadata(message);

      // Scheduled-task triggers are intentionally hidden in the visible thread.
      // They still delimit a new timeline event, while their repeated prompt text
      // remains hidden from the outline.
      if (role === 'user' && automation?.isTrigger) {
        finalizeEventAnswer(currentEvent);
        currentEvent = createAutomationEvent(nodeId, message, automation, false);
        continue;
      }

      if (hiddenChatGptMessage(message)) continue;

      if (role === 'user') {
        finalizeEventAnswer(currentEvent);
        currentEvent = createPromptEvent(nodeId, message);
        continue;
      }

      if (role !== 'assistant') continue;

      // Some public-share payloads omit or redact the hidden trigger node. Strong
      // automation metadata on the assistant output still recovers an independent
      // task-run event at its correct position in the branch.
      if (automation?.isOutput && !sameAutomationRun(currentEvent, automation)) {
        finalizeEventAnswer(currentEvent);
        currentEvent = createAutomationEvent(nodeId, message, automation, true);
      }
      if (!currentEvent || (currentEvent.kind === 'assistant-output' && currentEvent._bestVisibleAssistant?.completed)) {
        if (!chatGptMessageCanSupplyAnswerOutline(message)) continue;
        finalizeEventAnswer(currentEvent);
        currentEvent = createAutomationEvent(nodeId, message, automation, true);
        Object.assign(currentEvent,{key:'chatgpt-output:'+nodeId,kind:'assistant-output',text:'回答',automationTitle:''});
      }

      if (currentEvent.kind === 'automation-run' && automation) {
        if (!currentEvent.automationId && automation.automationId) currentEvent.automationId = automation.automationId;
        if ((!currentEvent.automationTitle || currentEvent.automationTitle === '定时任务') && automation.automationTitle) {
          currentEvent.automationTitle = automation.automationTitle;
        }
        if (!currentEvent.exchangeId && automation.exchangeId) currentEvent.exchangeId = automation.exchangeId;
        if (automation.isOutput && Number.isFinite(Number(automation.createTime))) {
          // The assistant output carries the actual automation trigger checkpoint when
          // available. Prefer it over the hidden trigger node's occasionally stale or
          // synthetic create_time value.
          currentEvent.createTime = automation.createTime;
        } else if (!Number.isFinite(Number(currentEvent.createTime)) && Number.isFinite(Number(automation.createTime))) {
          currentEvent.createTime = automation.createTime;
        }
      }
      considerAssistantCandidate(currentEvent, nodeId, message, automation);
    }

    finalizeEventAnswer(currentEvent);
    return tdStampIndex(records.map((record, index) => ({ ...record, orderHint: index })));
  }

  function unwrapChatGptConversationPayload(payload) {
    let value=payload;
    for(let depth=0;depth<4;depth++){
      if(isPlainObject(value?.mapping)||Array.isArray(value?.linear_conversation))return value;
      const next=['conversation','data','result'].map(k=>value?.[k]).find(v=>isPlainObject(v) &&
        (isPlainObject(v.mapping)||Array.isArray(v.linear_conversation)||isPlainObject(v.conversation)));
      if(!next)break;value=next;
    }
    return value;
  }

  async function fetchChatGptConversation(resource,{allowNetwork=false}={}) {
 if(!resource?.key)throw tdReadDenied('resource');
 if(allowNetwork)return tdManualRead(resource,tdScope());
 if(tdReads.snap?.resource.key===resource.key)return tdReads.snap.data;
 throw tdReadDenied('passive');
}

  function resetChatGptApiState() {
    window.clearTimeout(chatGptApiRefreshTimer);
    chatGptApiRefreshTimer = null;
    tdHealth.payload=null;
    tdHealth.snapshot=null;
    const resource = getChatGptConversationResource();
    chatGptConversationId = resource?.id || '';
    chatGptConversationKind = resource?.kind || '';
    chatGptApiRecords = [];
    chatGptApiStatus = chatGptConversationId ? 'idle' : 'unavailable';
    chatGptApiError = '';
    chatGptApiFetchPromise = null;
    chatGptApiFetchedAt = 0;
    chatGptApiFailedAt = 0;
  }

  
  // Passive payloads are not all authoritative snapshots. History paging can
  // return only one segment; absence from a segment is never a deletion proof.
  function tdSnapshotInfo(data, resource = {}) {
    if(resource.partial)return {complete:false,reason:'paged-request'};
    for(const key of ['has_more','has_more_before','has_more_after','is_partial','truncated']){
      if(data?.[key]===true)return {complete:false,reason:'partial-response'};
    }
    if(Array.isArray(data?.linear_conversation)&&data.linear_conversation.length)return {complete:true,reason:'linear-view'};
    if(!isPlainObject(data?.mapping)||typeof data?.current_node!=='string')return {complete:false,reason:'missing-branch-root'};
    let id=data.current_node;const seen=new Set();
    while(id&&!seen.has(id)){
      seen.add(id);const node=data.mapping[id];
      if(!node)return {complete:false,reason:'missing-parent'};
      if(node.parent===null||node.parent===undefined||node.parent==='')return {complete:true,reason:'rooted-branch'};
      if(typeof node.parent!=='string')return {complete:false,reason:'invalid-parent'};
      id=node.parent;
    }
    return {complete:false,reason:'cyclic-or-empty'};
  }
  function tdStitchHistory(data, record, complete) {
    if (!isPlainObject(data.mapping) || typeof data.current_node !== 'string') return null;
    const old = tdReads.graph;
    const branch = walkChatGptActiveBranch(data);
    const knowsBeginning = complete || (data.has_more_before === false &&
      tdSnapshotInfo({mapping:data.mapping,current_node:data.current_node}).complete);
    const rootId = knowsBeginning ? branch[0]?.nodeId : '';
    if (complete) {
      if (!old || record.startedAt >= old.fullAt) {
        tdReads.graph = {mapping:Object.assign(Object.create(null), data.mapping), tip:data.current_node,
          tips:new Set([data.current_node]), rootId, fullAt:record.startedAt, rooted:true};
      }
      return null;
    }
    const graph = old || {mapping:Object.create(null), tip:data.current_node, tips:new Set(),
      rootId:'', fullAt:0, rooted:false};
    if (Object.keys(graph.mapping).length + Object.keys(data.mapping).length > 30000) return null;
    for (const [id,node] of Object.entries(data.mapping)) {
      if (!isPlainObject(node)) continue;
      const prior = graph.mapping[id];
      if (!prior || (!prior.message && node.message)) graph.mapping[id] = node;
      else if (!prior.parent && typeof node.parent === 'string' && !graph.rooted) graph.mapping[id] = {...prior,parent:node.parent};
    }
    if (rootId) graph.rootId ||= rootId;
    graph.tips.add(data.current_node);
    if (graph.tips.size > 12) graph.tips.delete(graph.tips.values().next().value);
    const joined = {mapping:graph.mapping,current_node:graph.tip};
    let currentPath = walkChatGptActiveBranch(joined);
    // 中段最后到达时，也可以连上此前已收到的末段。
    for (const tip of graph.tips) {
      if (tip === graph.tip) continue;
      const path = walkChatGptActiveBranch({mapping:graph.mapping,current_node:tip});
      if (path.length > currentPath.length && path.some(item => item.nodeId === graph.tip)) {
        graph.tip = tip;
        currentPath = path;
      }
    }
    joined.current_node = graph.tip;
    tdReads.graph = graph;
    if (currentPath.length <= 1 || !currentPath.some(item => Object.hasOwn(data.mapping,item.nodeId))) return null;
    const rooted = Boolean(graph.rootId && currentPath[0].nodeId === graph.rootId && tdSnapshotInfo(joined).complete);
    if (rooted) graph.rooted = true;
    return {data:joined, complete:rooted};
  }

  function tdMergeObservedIndex(base, incoming, data, complete) {
    if(complete)return incoming;
    if(!base.length)return incoming;
    const out=base.map(e=>({...e})), replacements=new Map();
    const find=row=>{
      const ids=tdNavRecordIds(row),role=entryAnchorRole(row);
      const hits=out.filter(e=>entryAnchorRole(e)===role&&tdNavRecordIds(e).some(id=>ids.includes(id)));
      return hits.length===1?hits[0]:null;
    };
    for(const row of incoming){
      const prior=find(row);if(!prior)continue;
      const key=prior.key,answers=prior.answerRecords||[],blocks=prior.answerBlocks||[];
      const freshIds=(row.answerRecords||[]).flatMap(tdNavRecordIds);
      const sameAnswer=freshIds.length&&answers.flatMap(tdNavRecordIds).some(id=>freshIds.includes(id));
      const keep=(!row.answerRecords?.length&&answers.length)||(sameAnswer&&
        answers.some(a=>a.completed===true)&&!(row.answerRecords||[]).some(a=>a.completed===true));
      Object.assign(prior,row,{key});
      if(keep){prior.answerRecords=answers;prior.answerBlocks=blocks;}
      replacements.set(row,prior);
    }
    for(let i=0;i<incoming.length;i++){
      const row=incoming[i];if(replacements.has(row))continue;
      const next=incoming.slice(i+1).map(e=>replacements.get(e)||find(e)).find(Boolean);
      const prev=[...incoming.slice(0,i)].reverse().map(e=>replacements.get(e)||find(e)).find(Boolean);
      let at=next?out.indexOf(next):prev?out.indexOf(prev)+1:-1;
      if(at<0){
        // A missing parent in this response may still be an exact cached message.
        const parent=data?.mapping?.[row.nodeId||row.messageId]?.parent;
        if(parent){const owner=out.findIndex(e=>[...tdNavRecordIds(e),...(e.answerRecords||[]).flatMap(tdNavRecordIds)].includes(parent));if(owner>=0)at=owner+1;}
      }
      if(at<0)continue; // No adjacency evidence: never guess insertion by percentage.
      out.splice(at,0,row);replacements.set(row,row);
    }
    for(const e of out)for(const b of e.answerBlocks||[])b.parentKey=e.key;
    return out.map((e,i)=>({...e,orderHint:i}));
  }

async function ensureChatGptConversationData({force=false,reason='manual',allowNetwork=false}={}) {
 if(site.id!=='chatgpt'||!settings.enabled)return false;
 const scope=tdScope(),resource=getChatGptConversationResource();if(!resource){chatGptApiStatus='unavailable';return false;}
 if(`${chatGptConversationKind}:${chatGptConversationId}`!==resource.key)resetChatGptApiState();
 if(chatGptApiFetchPromise)return chatGptApiFetchPromise;
 const snap=tdReads.snap;
 const apply=snap?.resource.key===resource.key&&(tdReads.appliedSeq!==snap.seq||tdReads.appliedEpoch!==td.epoch);
 if(!allowNetwork&&!apply){if(chatGptApiRecords.length)return true;chatGptApiStatus='passive';return false;}
 if(tdReadBusy()&&!allowNetwork){scheduleChatGptApiRefresh('deferred-adoption',200);return false;}
 if(allowNetwork){chatGptApiStatus='loading';tdSafeTask('manual-read-ui',tdRecoveryStatus);}
 const job=Promise.resolve().then(async()=>{
   try{
     if(allowNetwork)await fetchChatGptConversation(resource,{allowNetwork:true});
     if(!tdAlive(scope))return false;
     const record=tdReads.snap;if(record?.resource.key!==resource.key)return false;
     const data=record.data;
     if(!tdPayloadBelongs(data,resource))return false;
     // Preserve original request timestamp and serial; never turn old cached
     // content into a newly fetched completion proof.
     const snapshotInfo=tdSnapshotInfo(data,record.resource);record.partial=!snapshotInfo.complete;
     if (snapshotInfo.complete && tdReads.graph?.fullAt > record.startedAt) {
       tdReads.appliedSeq=record.seq;tdReads.appliedEpoch=td.epoch;return false;
     }
     if(!record.outlineOnly&&record.epoch===td.epoch&&record.serial===tdTurn.serial) {
       if(snapshotInfo.complete)tdAcceptTurnProof(data,record.startedAt,record.serial);
       else tdReceiptObserveConversation(data,record.startedAt);
     }
     if(!await tdDelay(0,scope))return false;
     while(tdReadBusy())if(!await tdDelay(120,scope))return false;
     tdHealth.payload={mapping:isPlainObject(data?.mapping),mappingNodes:isPlainObject(data?.mapping)?Object.keys(data.mapping).length:0,
       linearNodes:Array.isArray(data?.linear_conversation)?data.linear_conversation.length:0,hasCurrentNode:typeof data?.current_node==='string'};
     if(!tdHealth.payload.mapping&&!Array.isArray(data?.linear_conversation))throw Object.assign(new Error('响应结构尚未识别，原目录已保留'),{name:'UnsupportedPayloadError'});
     const joined=tdStitchHistory(data,record,snapshotInfo.complete);
     const indexData=joined?.data || data;
     const parsed=record.records||parseChatGptPromptRecords(indexData);record.records=parsed;
     const base = chatGptApiRecords.length ? chatGptApiRecords : cacheRecords.filter(entry =>
       entry.source === 'conversation-api' && entry.timelineSchema === TIMELINE_CACHE_SCHEMA && tdNavRecordIds(entry).length);
     const merged=tdMergeObservedIndex(base,parsed,indexData,snapshotInfo.complete);
     const complete=snapshotInfo.complete || Boolean(joined?.complete && parsed.length >= merged.length) ||
       Boolean(tdHealth.snapshot?.complete && merged.length === base.length);
     tdHealth.snapshot={complete,reason:joined?.complete?'stitched-branch':snapshotInfo.reason,incoming:parsed.length,retained:merged.length};
     if(!merged.length&&base.length){
       tdReads.appliedSeq=record.seq;tdReads.appliedEpoch=td.epoch;return true;
     }
     if(!tdAlive(scope)||resource.key!==getChatGptConversationResource()?.key)return false;
     chatGptConversationId=resource.id;chatGptConversationKind=resource.kind;tdAdaptive.at=-Infinity;
     tdSafeTask('index-live-reconcile',()=>tdLiveReconcileApi(merged));chatGptApiRecords=tdStampIndex(merged,scope.key);tdDomState.revision++;
     chatGptApiStatus='ready';chatGptApiError='';chatGptApiFetchedAt=record.startedAt;chatGptApiFailedAt=0;
     tdReads.appliedSeq=record.seq;tdReads.appliedEpoch=td.epoch;tdReads.adopted++;
     if(settings.rememberPrompts){cacheRecords=merged.map(buildCacheRecord).slice(-MAX_CACHE_ITEMS);scheduleCacheWrite();}
     scheduleRefresh('observed-index-ready',0);return true;
   }catch(error){
     if(!tdAlive(scope))return false;
     chatGptApiStatus=chatGptApiRecords.length?'ready':'passive';chatGptApiError=String(error?.message||'补读未完成');chatGptApiFailedAt=Date.now();
     // A single incompatible response cannot cause an endless parse/reconcile loop.
     if(tdReads.snap?.resource.key===resource.key){tdReads.appliedSeq=tdReads.snap.seq;tdReads.appliedEpoch=td.epoch;}
     tdLog(error.localPolicy?'read-policy':'read-unavailable',error.reason||String(error?.status||error?.name||'Error'));
     if(allowNetwork)showToast(chatGptApiError,3200);tdSafeTask('read-status',tdRecoveryStatus);return false;
   }
 });chatGptApiFetchPromise=job;
 try{return await job;}finally{
   if(chatGptApiFetchPromise===job){chatGptApiFetchPromise=null;tdLive.apiAgain=false;
     if(tdAlive(scope)&&tdReads.snap?.resource.key===resource.key&&tdReads.snap.seq!==tdReads.appliedSeq)scheduleChatGptApiRefresh('new-observed',180);
   }
 }
}

  function scheduleChatGptApiRefresh(reason='mutation',delay=180) {
 // Legacy callers, including force refresh and route recovery, may adopt ONLY an
 // existing native response. This function cannot grant a network permit.
 if(!settings.enabled||chatGptApiRefreshTimer!==null)return;
 const resource=getChatGptConversationResource(),snap=tdReads.snap;
 if(!resource||snap?.resource.key!==resource.key||(snap.seq===tdReads.appliedSeq&&tdReads.appliedEpoch===td.epoch))return;
 const scope=tdScope();chatGptApiRefreshTimer=setTimeout(()=>{
   chatGptApiRefreshTimer=null;if(!tdAlive(scope)||!settings.enabled)return;
   if(tdReadBusy()){scheduleChatGptApiRefresh(reason,200);return;}
   void ensureChatGptConversationData({reason});
 },Math.max(80,Math.min(1200,delay)));
}

  function cacheStorageKey(key=routeKey) { return `${CACHE_PREFIX}owner-v2:${encodeURIComponent(key)}`; }

  function hashString(input) {
    let hash = 2166136261;
    const text = String(input || '');
    for (let index = 0; index < text.length; index += 1) {
      hash ^= text.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0).toString(36);
  }

  function normalizeText(text) {
    return String(text || '')
      .replace(/[\u200B-\u200D\uFEFF]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function truncateText(text, max = 90) {
    const clean = normalizeText(text);
    if (clean.length <= max) return clean;
    return `${clean.slice(0, Math.max(1, max - 1))}…`;
  }

  function isGenericTocLabel(text) {
    const value = normalizeText(text);
    if (!value) return true;
    return /^(prompts?|questions?|messages?|问题|提问|提示词|消息)\s*#?\s*\d+$/i.test(value);
  }

  // v1.7.2: transcript discovery is evidence-driven, never `querySelector('main')`.
  // Only DOM we can already read is used. No private framework state, closed
  // shadow-root interception, remote script, or content transmission is involved.
  const tdDomScopes = {
    shadows: new Map(), revision: 0, census: null, scannedAt: -Infinity,
    rebindTimer: null, selectionSerial: 0, lastAnswerSelection: null,
    lastAttempt: null, recoveryAt: -Infinity,
  };
  const TD_DOM_SCOPE_EXCLUDE = 'nav,aside,[role="navigation"],#threaddeck-host,#prompt-rail-host,button,[role="button"],input,textarea,select,[contenteditable="true"],[contenteditable="plaintext-only"],[data-threaddeck-internal]';
  const TD_DOM_EVIDENCE = '[data-conversation-role],[data-user-message-bubble],[data-chatgpt-selection-message-id],[data-chatgpt-search-message-ids],[data-message-author-role],[data-message-role],[data-author-role],[data-turn],[data-role="assistant"],[data-role="user"],user-query,[data-message-id],[data-node-id],[data-turn-id],[data-turn-id-container],[data-item-id],[data-id],[id^="message-"],[id^="message:"],[id^="turn-"],[id^="turn:"]';
  function tdDomParent(node) {
    if (!node) return null;
    return node.parentElement || (node.getRootNode?.() instanceof ShadowRoot ? node.getRootNode().host : null);
  }
  function tdDomContains(root, node) {
    if (!root || !node) return false;
    if (root === node || root.contains?.(node)) return true;
    let current = node;
    for (let i=0; current && i<24; i++) {
      const tree = current.getRootNode?.();
      if (!(tree instanceof ShadowRoot)) break;
      current = tree.host;
      if (root === current || root.contains?.(current)) return true;
    }
    return false;
  }
  function tdDomClosest(node, selector) {
    let current = node instanceof Element ? node : node?.parentElement;
    for (let depth=0; current && depth<100; depth++, current=tdDomParent(current)) {
      if (current.matches(selector)) return current;
    }
    return null;
  }
  function tdDomRegisterRoot(root) {
    if (!(root instanceof ShadowRoot) || root.mode !== 'open' || !root.host.isConnected ||
        tdDomClosest(root.host, '#threaddeck-host,#prompt-rail-host,[data-threaddeck-internal]')) return false;
    if (tdDomScopes.shadows.has(root)) return false;
    // Bound retained objects. Disconnected roots are disposed before admitting more.
    for (const [old, observer] of tdDomScopes.shadows) if (!old.host.isConnected) {
      observer.disconnect(); tdDomScopes.shadows.delete(old);
    }
    if (tdDomScopes.shadows.size >= 48) return false;
    const observer = new MutationObserver(mutations => tdDomObserveDiscovery(mutations));
    observer.observe(root, {childList:true, subtree:true, attributes:true,
      attributeFilter:['class','id','data-message-id','data-node-id','data-turn-id','data-message-author-role','data-turn','hidden','aria-hidden']});
    tdDomScopes.shadows.set(root, observer); tdDomScopes.revision++; tdDomScopes.census=null;
    root.addEventListener('selectionchange', () => {tdSelectionSnapshot();if(!tdSelectionBusy())tdSelectionSchedule();}, true);
    if (td.ready && tdDomScopes.rebindTimer === null) {
      const scope=tdScope();
      tdDomScopes.rebindTimer=setTimeout(()=>{tdDomScopes.rebindTimer=null;if(tdAlive(scope)){observePage();scheduleRefresh('new-open-root',0); if(reviewComments.length) {tdStopReviewAnchorWatch();updateReviewHighlights();}}},0);
    }
    return true;
  }
  function tdDomDiscoverRoots(force = false, subtree = document) {
    if(tdDeferInteraction('tdDomDiscoverRoots'))return;
    if (subtree === document && !force && performance.now()-tdDomScopes.scannedAt<2000) return;
    if (subtree === document) tdDomScopes.scannedAt=performance.now();
    const stack=[subtree],visited=new Set(); let budget=16000;
    while(stack.length && budget>0) {
      const root=stack.pop();
      if(visited.has(root))continue;visited.add(root);
      if(root instanceof Element && tdDomClosest(root,TD_DOM_SCOPE_EXCLUDE)) continue;
      // Bounded traversal: querySelectorAll('*') allocated the ENTIRE subtree
      // before the old 16000-node budget was even applied.
      const nodes=[];if(root instanceof Element)nodes.push(root);
      const walker=document.createTreeWalker(root,NodeFilter.SHOW_ELEMENT);
      for(let n=walker.nextNode();n&&nodes.length<budget;n=walker.nextNode())nodes.push(n);
      for(const node of nodes) {
        if(--budget<0) break;
        if(node.shadowRoot){tdDomRegisterRoot(node.shadowRoot);if(tdDomScopes.shadows.has(node.shadowRoot)&&!visited.has(node.shadowRoot))stack.push(node.shadowRoot);}
      }
    }
  }
  function tdDomObserveDiscovery(mutations) {
    if(tdDeferInteraction('scope-observer'))return;
    let dirty=false;
    for(const m of mutations) {
      const node=nodeAsElement(m.target) || (m.target instanceof ShadowRoot ? m.target.host : null);
      if(node && tdDomClosest(node,'#threaddeck-host,#prompt-rail-host,[data-threaddeck-selection-comment],[data-threaddeck-internal]'))continue;
      if(node && isInsideComposer(node))continue;
      dirty=true;
      for(const child of m.addedNodes || []) if(child instanceof Element) tdDomDiscoverRoots(false,child);
    }
    if(dirty) {tdDomScopes.census=null;tdDomScopes.revision++;}
  }
  function tdDomQueryAll(root, selector) {
    const scope=root || document, result=new Set(safeQueryAll(scope,selector));
    if(scope instanceof Element && scope.matches(selector)) result.add(scope);
    for(const [shadow,observer] of tdDomScopes.shadows) {
      if(!shadow.host.isConnected) {observer.disconnect();tdDomScopes.shadows.delete(shadow);continue;}
      if(shadow===scope || tdDomContains(scope,shadow.host)) for(const node of safeQueryAll(shadow,selector))result.add(node);
    }
    return [...result];
  }
  function tdDomTreeShown(node, memo = new WeakMap()) {
    if(!(node instanceof HTMLElement) || !node.isConnected)return false;
    if(memo.has(node))return memo.get(node);
    const style=getComputedStyle(node);
    const hidden=node.matches('[hidden],[aria-hidden="true"],[inert]') || style.display==='none' || style.visibility==='hidden';
    const parent=tdDomParent(node);
    const ok=!hidden && (!parent || tdDomTreeShown(parent,memo)); memo.set(node,ok);return ok;
  }
  function tdDomCensus(force = false) {
    const old=tdDomScopes.census,now=performance.now();
    if(!force && old && old.epoch===td.epoch && old.revision===tdDomScopes.revision &&
      old.domRevision===tdDomState.revision && now-old.at<1500 && old.root?.isConnected)return old;
    // Full open-shadow discovery happens only at first use or on explicit recovery.
    if(tdDomScopes.scannedAt===-Infinity || force)tdDomDiscoverRoots(force);
    const visible=new WeakMap(),eligible=n=>tdDomSafe(n)&&!isInsideComposer(n)&&tdDomTreeShown(n,visible)&&!isReasoningOrCollapsedOutlineContext(n);
    const standard=tdDomQueryAll(document,TD_DOM_EVIDENCE);
    const hasRole=role=>standard.some(n=>tdDomExplicitRole(n)===role || tdDomIds(n).some(id=>tdDomKnownRoles().get(id)===role));
    if(tdAdaptive.nodes.length || !hasRole('user') || !hasRole('assistant'))tdAdaptiveDiscover();
    const markers=[...new Set([...standard,...tdAdaptive.nodes])].filter(eligible);
    const renderers=tdDomQueryAll(document,TD_DOM_CONTENT).filter(eligible);
    const known=tdDomKnownRoles();
    const strong=markers.filter(n=>tdDomExplicitRole(n) || tdDomIds(n).some(id=>known.has(id)) || n.hasAttribute('data-turn-id-container') || n.hasAttribute('data-message-id'));
    const semantic=tdDomQueryAll(document,'article,[role="article"],[data-testid^="conversation-turn-"]').filter(eligible);
    // Unknown unrelated `data-id` attributes alone never establish a transcript.
    const evidence=strong.length?strong:renderers.length?renderers:semantic;
    const candidates=tdDomQueryAll(document,'main,[role="main"],#thread,infinite-scroller.chat-history,[data-testid="conversation-thread"]').filter(eligible);
    let root=null,reason='no-message-evidence';
    if(evidence.length) {
      const spanning=candidates.filter(n=>evidence.every(e=>tdDomContains(n,e)));
      // Prefer the narrowest semantic scope that still spans EVERY rendered turn.
      root=spanning.find(n=>!spanning.some(other=>other!==n&&tdDomContains(n,other))) || null;
      if(root)reason='evidence-spanning-root';
      else {
        root=evidence[0];
        while(root && !evidence.every(n=>tdDomContains(root,n)))root=tdDomParent(root);
        // Do not let a single message become its own search boundary.
        while(root && (root.matches(TD_DOM_BOUNDARY+','+TD_DOM_CONTENT)||tdDomExplicitRole(root)))root=tdDomParent(root);
        reason='common-transcript-ancestor';
      }
    }
    root=root || document.body || document.documentElement;
    const perRoot=candidates.slice(0,12).map(n=>({node:n,shape:tdDomShape(n),
      identityNodes:markers.filter(m=>tdDomContains(n,m)).length,rendererNodes:renderers.filter(m=>tdDomContains(n,m)).length,selected:n===root}));
    const result={root,reason,markers,renderers,semantic,evidence,candidates:perRoot,
      epoch:td.epoch,revision:tdDomScopes.revision,domRevision:tdDomState.revision,at:now};
    tdDomScopes.census=result;return result;
  }
  function tdDomObserveRoots(observer, options) {
    if(document.documentElement)observer.observe(document.documentElement,options);
    for(const shadow of tdDomScopes.shadows.keys())if(shadow.host.isConnected)observer.observe(shadow,options);
  }
  function tdDomSelectionRange(selection=window.getSelection()) {
    if(!selection || selection.rangeCount!==1 || selection.isCollapsed)return null;
    for(const node of [selection.anchorNode,selection.focusNode])tdDomRegisterRoot(node?.getRootNode?.());
    try {
      if(tdDomScopes.shadows.size && typeof selection.getComposedRanges==='function') {
        const ranges=selection.getComposedRanges({shadowRoots:[...tdDomScopes.shadows.keys()]});
        const r=ranges.length===1?ranges[0]:null;
        if(r && r.startContainer.getRootNode()===r.endContainer.getRootNode()) {
          const range=new Range();range.setStart(r.startContainer,r.startOffset);range.setEnd(r.endContainer,r.endOffset);return range;
        }
      }
      return selection.getRangeAt(0).cloneRange();
    }catch{return null;}
  }
  function tdDomRememberSelection(stage, range, successful = false) {
    const start=nodeAsElement(range?.startContainer);
    if(!start || isInsideComposer(start) || tdDomClosest(start,'#threaddeck-host,#prompt-rail-host'))return;
    const shapes=[];
    for(let n=start,i=0;n&&i<9;i++,n=tdDomParent(n)){shapes.push(tdDomShape(n));if(n===document.body)break;}
    const previous=tdDomScopes.lastAttempt;
    const same=previous?.node===start && previous.stage===stage;
    const record={node:start,stage,at:Date.now(),epoch:td.epoch,serial:same?previous.serial:++tdDomScopes.selectionSerial,ancestors:shapes};
    tdDomScopes.lastAttempt=record;
    if(successful)tdDomScopes.lastAnswerSelection=record;
    tdDomState.lastShape=shapes;
  }

  // v1.7.1: one DOM identity adapter for navigation and review anchoring.
  // None of these selectors claims to be an official ChatGPT DOM contract.
  const TD_DOM_ROLE_ATTRS = ['data-conversation-role', 'data-message-author-role', 'data-message-role', 'data-author-role', 'data-turn', 'data-role'];
  const TD_DOM_ID_ATTRS = ['data-chatgpt-selection-message-id', 'data-turn-key', 'data-message-id', 'data-node-id', 'data-turn-id', 'data-turn-id-container', 'data-item-id', 'data-id', 'id'];
  const TD_DOM_CONTENT = '[data-markdown-text-style="assistant-message"],[data-markdown-text-style][data-selected-text-overlay-target],[data-markdown-copy="contents"],.markdown,.prose,message-content,[data-message-content],[data-testid="message-content"]';
  const TD_DOM_GENERATED_IMAGE = '[data-chatgpt-search-message-ids]:not([data-chatgpt-search-unit-key]):has([data-testid="generated-image-gallery"] [data-testid="generated-image-preview"] img)';
  const TD_DOM_BOUNDARY = '[data-chatgpt-selection-message-id],[data-chatgpt-search-message-ids],[data-conversation-role],[data-turn-key],[data-message-id],[data-node-id],[data-turn-id],[data-turn-id-container],[data-item-id],[data-testid^="conversation-turn-"],[data-testid="conversation-turn"],article,[role="article"]';
  const tdDomState = { revision: 0, roleMapRevision: -1, roleMap: new Map(), selection: 'not-selected', nav: 'none', lastShape: [] };
  const tdDomRoleSelector = role => TD_DOM_ROLE_ATTRS.map(attr => `[${attr}="${role}"]`).join(',') +
    `,[data-chatgpt-search-unit-key$=":${role}"][data-chatgpt-search-message-ids]` +
    (role === 'user' ? ',user-query,[data-user-message-bubble]' : role === 'assistant' ? ','+TD_DOM_GENERATED_IMAGE : '');
  function tdGeneratedImageTurn(node) {
    if (!(node instanceof Element) || !node.matches(TD_DOM_GENERATED_IMAGE) ||
        tdDomSearchMessageIds(node).length!==1 ||
        node.closest('[data-user-message-bubble],[data-chatgpt-search-unit-key$=":user"]')) return null;
    return node.closest('[data-talvt-turn-state]');
  }
  const tdDomExplicitRole = node => {
    if (!(node instanceof Element)) return '';
    for (const attr of TD_DOM_ROLE_ATTRS) {
      const value = node.getAttribute(attr)?.toLowerCase();
      if (value === 'user' || value === 'assistant' || value === 'tool' || value === 'system') return value;
    }
    if(node.matches('user-query,[data-user-message-bubble]')) return 'user';
    // 真实消息搜索单元同时声明角色和原生消息 ID。聚合多个不同消息的容器不作证。
    const searchRole=node.getAttribute('data-chatgpt-search-unit-key')?.match(/^[a-zA-Z0-9_.:-]{1,180}:(assistant|user)$/)?.[1];
    if (searchRole && tdDomSearchMessageIds(node).length===1) return searchRole;
    // 图片消息可能只有一个原生消息 ID 和图像预览，宿主未给它标记作者。
    return tdGeneratedImageTurn(node) ? 'assistant' : '';
  };
  // One exact decoder for the observed scalar/array search-message attribute.
  // Membership is equality of complete tokens, never substring/UUID extraction.
  const tdMessageListCache = new WeakMap();
  function tdDomSearchMessageIds(node) {
    if (!(node instanceof Element)) return [];
    const raw = node.getAttribute('data-chatgpt-search-message-ids') || '';
    if (!raw || raw.length > 16384) return [];
    const prior = tdMessageListCache.get(node);
    if (prior?.raw === raw) return prior.ids;
    let values = [];
    const value = raw.trim();
    if (value.startsWith('[') || value.startsWith('"')) {
      try { const parsed = JSON.parse(value); values = Array.isArray(parsed) ? parsed : typeof parsed === 'string' ? [parsed] : []; } catch {}
    } else values = value.split(/[\s,]+/);
    const ids = [...new Set(values.filter(v => typeof v === 'string' && /^[A-Za-z0-9_.:-]{8,220}$/.test(v)))];
    tdMessageListCache.set(node, {raw, ids});
    return ids;
  }

  function tdDomIds(node) {
    if (!(node instanceof Element)) return [];
    const ids = [];
    for (const attr of TD_DOM_ID_ATTRS) {
      const value = node.getAttribute(attr);
      if (!value || value.length > 220) continue;
      ids.push(value);
      // Anchored, known prefixes only; never search for a UUID substring in text.
      if (attr === 'id') {
        const m = value.match(/^(?:message|turn|conversation-turn)[-:]([0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12})$/i);
        if (m) ids.push(m[1]);
      }
    }
    ids.push(...tdDomSearchMessageIds(node));
    return [...new Set([...ids,...tdAdaptiveValidIds(node)])];
  }
  function tdDomKnownRoles() {
    if (tdDomState.roleMapRevision === tdDomState.revision) return tdDomState.roleMap;
    const map = new Map();
    const add = (record, role) => {
      for (const id of [record?.nodeId, record?.messageId, record?.answerNodeId, record?.answerMessageId].filter(Boolean)) {
        if (!map.has(id)) map.set(id, role);
        else if (map.get(id) !== role) map.set(id, 'ambiguous');
      }
    };
    for (const entry of [...chatGptApiRecords, ...entries]) {
      add(entry, entryAnchorRole(entry));
      for (const answer of entry.answerRecords || []) add(answer, 'assistant');
    }
    tdDomState.roleMap = map; tdDomState.roleMapRevision = tdDomState.revision;
    return map;
  }
  function tdDomRole(node) {
    const explicit = tdDomExplicitRole(node);
    if (explicit) return explicit;
    if (!(node instanceof Element)) return '';
    const map = tdDomKnownRoles(), roles = new Set(tdDomIds(node).map(id => map.get(id)).filter(Boolean));
    if (roles.size === 1 && !roles.has('ambiguous')) return [...roles][0];
    if (roles.size) return '';
    // Modern selection targets carry the message ID but the enclosing unit carries
    // its author. Read that explicit role; never infer authors from alternating rows.
    if (node.hasAttribute('data-chatgpt-selection-message-id')) {
      const owner = tdDomClosest(tdDomParent(node), tdDomRoleSelector('assistant') + ',' + tdDomRoleSelector('user'));
      if (owner && !owner.matches('main,body,html,form')) {
        if(owner.hasAttribute('data-chatgpt-search-unit-key') &&
          !tdDomSearchMessageIds(owner).includes(node.getAttribute('data-chatgpt-selection-message-id'))) return '';
        return tdDomExplicitRole(owner);
      }
    }
    return '';
  }
  function tdDomSafe(node) {
    return node instanceof HTMLElement && node.isConnected && tdRouteAllows(node) && !tdDomClosest(node,TD_DOM_SCOPE_EXCLUDE);
  }
  function tdDomContent(node) {
    if (!(node instanceof HTMLElement)) return [];
    const choices = [ ...(node.matches(TD_DOM_CONTENT) ? [node] : []), ...tdDomQueryAll(node, TD_DOM_CONTENT) ];
    const clean = choices.filter(n => tdDomSafe(n) && !isReasoningOrCollapsedOutlineContext(n, node));
    return clean.filter(n => !clean.some(other => other !== n && other.contains(n)));
  }
  function tdDomHasForeignRole(node, role) {
    const own = tdDomRole(node);
    if (own && own !== role) return true;
    if(tdAdaptive.nodes.some(n=>n!==node&&tdDomContains(node,n)&&tdAdaptiveValidIds(n).length&&tdAdaptive.roles.get(n)!==role&&!isReasoningOrCollapsedOutlineContext(n,node)))return true;
    return tdDomQueryAll(node, TD_DOM_ROLE_ATTRS.map(attr => `[${attr}]`).join(',') + ',user-query')
      .some(n => { const r = tdDomExplicitRole(n); return r && r !== role &&
        !isReasoningOrCollapsedOutlineContext(n, node); });
  }
  function tdDomHasOtherMessage(node, ids = []) {
    // Distinct final-message IDs in one wrapper are not interchangeable.
    const nested = [...new Set([...tdDomQueryAll(node, '[data-message-id],[data-node-id]'),...tdAdaptive.nodes.filter(n=>n!==node&&tdDomContains(node,n)&&tdAdaptiveValidIds(n).length)])]
      .filter(n => !isReasoningOrCollapsedOutlineContext(n, node));
    const top = nested.filter(n => !nested.some(p => p !== n && p.contains(n)));
    return top.length > 1 && top.some(n => !tdDomIds(n).some(id => ids.includes(id)));
  }
  function tdDomMessageFromNode(node, role, expectedIds = [], visibility) {
    let current = node instanceof Element ? node : node?.parentElement;
    const origin = current; let provisional = null;
    if (!tdDomSafe(current) || !tdDomTreeShown(current,visibility) || isInsideComposer(current) || isReasoningOrCollapsedOutlineContext(current)) return null;
    const conversation = getChatGptThreadRoot() || firstMatchingRoot(site.roots);
    // A zero-evidence shell must not veto a directly verified message elsewhere.
    if (conversation && !tdDomContains(conversation,current) && !tdDomIds(current).some(id=>tdDomKnownRoles().has(id))) return null;
    for (let depth = 0; current instanceof HTMLElement && depth < 20; depth++, current = tdDomParent(current)) {
      if (current.matches('main,body,html,#thread') || !tdDomSafe(current)) break;
      if (isReasoningOrCollapsedOutlineContext(current)) return null;
      const actual = tdDomRole(current);
      if (actual && actual !== role) return null;
      const ids = tdDomIds(current), exact = expectedIds.length && ids.some(id => expectedIds.includes(id));
      if ((actual === role || exact) && !tdDomHasForeignRole(current, role) && !tdDomHasOtherMessage(current, expectedIds.length ? expectedIds : ids)) {
        if (expectedIds.length && ids.length && !exact && ids.some(id => tdDomKnownRoles().has(id))) return null;
        if (current.hasAttribute('data-turn-id-container') && !tdDomContent(current).length && !normalizeText(current.textContent)) return null;
        if (ids.length || exact) return current;
        provisional = current;
      }
      // A semantic message wrapper with a sibling author marker. Do not climb to
      // the thread just because some other answer in it has an assistant role.
      if (current.matches(TD_DOM_BOUNDARY) && !tdDomHasForeignRole(current, role) && !tdDomHasOtherMessage(current, expectedIds)) {
        const markers = tdDomQueryAll(current, tdDomRoleSelector(role));
        const roots = tdDomContent(current);
        if (markers.length && roots.some(root => tdDomContains(root,origin))) return current;
        // Render-only fallback is for local selection, not proof for an API ID.
        if (!expectedIds.length && role === 'assistant' && current.matches('article,[role="article"],[data-testid^="conversation-turn-"]') &&
            roots.length && roots.some(root => tdDomContains(root,origin)) &&
            current.querySelector('button[data-testid="copy-turn-action-button"],button[data-testid="good-response-turn-action-button"]')) return current;
      }
    }
    return provisional;
  }
  function tdDomRoleRoots(role, visibility = new WeakMap()) {
    const root = getChatGptThreadRoot() || firstMatchingRoot(site.roots);
    const candidates = tdDomQueryAll(root, tdDomRoleSelector(role) + ',[data-chatgpt-selection-message-id],[data-turn-key],[data-message-id],[data-node-id],[data-turn-id],[data-turn-id-container],[data-item-id],[data-id],[id^="message-"],[id^="message:"],[id^="turn-"],[id^="turn:"]');
    candidates.push(...tdAdaptive.nodes.filter(n=>tdDomContains(root,n)));
    const found = new Set();
    for (const node of candidates) {
      if (tdDomRole(node) !== role) continue;
      const section = tdDomMessageFromNode(node, role, undefined, visibility);
      if (section) found.add(section);
    }
    const sections = [...found];
    sections.forEach(tdRouteRememberNode);
    return sections.filter(node => !sections.some(other => other !== node && other.contains(node))).sort(compareDomOrder);
  }
  function tdDomFindExact(ids, role) {
    getChatGptThreadRoot();
    const wanted = [...new Set((ids || []).filter(id => typeof id === 'string' && id))];
    const listNodes = tdDomQueryAll(document, '[data-chatgpt-search-message-ids]');
    let rawCandidates = 0, groupedCandidates = 0;
    for (const id of wanted) {
      const escaped = cssEscape(id);
      const selectors = TD_DOM_ID_ATTRS.map(attr => `[${attr}="${escaped}"]`);
      if (/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(id)) {
        for (const prefix of ['message-','message:','turn-','turn:','conversation-turn-']) selectors.push(`[id="${prefix}${escaped}"]`);
      }
      const grouped = listNodes.filter(node => tdDomSearchMessageIds(node).includes(id));
      groupedCandidates += grouped.length;
      const candidates = new Set([...tdDomQueryAll(document, selectors.join(',')), ...grouped, ...(tdAdaptive.byId.get(id) || [])]);
      rawCandidates += candidates.size;
      const hits = new Set();
      for (const node of candidates) {
        if (!tdDomSafe(node)) continue;
        const groupedIds=tdDomSearchMessageIds(node);
        // A multi-message search result is not a message. A separately identified
        // child can still match via its own ID, but never borrow the whole group.
        if (groupedIds.some(value => !wanted.includes(value))) continue;
        const match = tdDomMessageFromNode(node, role, wanted);
        if (match) {
          const leaves=tdDomQueryAll(match, role === 'user' ? '[data-user-message-bubble]' : '[data-chatgpt-selection-message-id]')
            .filter(n => tdDomSafe(n) && tdDomTreeShown(n) && !isReasoningOrCollapsedOutlineContext(n,match));
          if (role==='user' && leaves.filter(n=>!leaves.some(o=>o!==n&&n.contains(o))).length>1) continue;
          if (role==='assistant' && leaves.some(n=>!wanted.includes(n.getAttribute('data-chatgpt-selection-message-id')))) continue;
          hits.add(match);
        }
      }
      const visible = [...hits].filter(n => tdNavVisibleTarget(n));
      const owners = visible.filter(n => !visible.some(o => n !== o && tdDomContains(o,n)));
      // Prefer a uniquely identified inner message to a search-unit envelope.
      // The envelope's author labels are not part of the answer's chapter tree.
      const canonical = owners.map(owner => {
        const explicit = visible.filter(n => tdDomContains(owner,n) &&
          ['data-chatgpt-selection-message-id','data-message-id','data-node-id'].some(a => wanted.includes(n.getAttribute(a))));
        const inner = explicit.filter(n => !explicit.some(o => n !== o && tdDomContains(n,o)));
        return inner.length === 1 ? inner[0] : owner;
      });
      tdDomState.exactLookup = {role, requested: wanted.length, candidates: rawCandidates,
        groupedCandidates, accepted: canonical.length, reason: canonical.length === 1 ? 'exact-message' : canonical.length > 1 ? 'ambiguous-identity' : 'candidate-rejected'};
      if (canonical.length === 1) { tdDomState.nav = 'exact-identity'; return canonical[0]; }
      if (canonical.length > 1) { tdDomState.nav = 'ambiguous-identity'; return null; }
    }
    tdDomState.exactLookup = {role, requested: wanted.length, candidates: rawCandidates,
      groupedCandidates, accepted: 0, reason: rawCandidates ? 'candidate-rejected' : 'identity-not-mounted'};
    return null;
  }
  function tdDomRect(node) {
    const rect = node.getBoundingClientRect();
    if (rect.width > 0 && rect.height > 0) return rect;
    if (getComputedStyle(node).display !== 'contents') return rect;
    const rects = [...node.children].filter(n => tdDomSafe(n) && !isReasoningOrCollapsedOutlineContext(n, node))
      .map(n => n.getBoundingClientRect()).filter(r => r.width > 0 && r.height > 0);
    if (!rects.length) return rect;
    const left = Math.min(...rects.map(r => r.left)), top = Math.min(...rects.map(r => r.top));
    return new DOMRect(left, top, Math.max(...rects.map(r => r.right)) - left, Math.max(...rects.map(r => r.bottom)) - top);
  }
  function tdDomShape(node) {
    if (!(node instanceof Element)) return null;
    return { tag: node.tagName.toLowerCase(), role: tdDomExplicitRole(node) || 'unmarked',
      identityAttributes: TD_DOM_ID_ATTRS.filter(attr => node.hasAttribute(attr)),
      roleAttributes: TD_DOM_ROLE_ATTRS.filter(attr => node.hasAttribute(attr)),
      renderer: node.matches(TD_DOM_CONTENT), inForm: Boolean(node.closest('form')),
      editable: isInsideComposer(node), excludedContext: isReasoningOrCollapsedOutlineContext(node), display: getComputedStyle(node).display };
  }
  function tdDomDiagnostic() {
    const c=tdDomCensus(true),root=c.root;
    const users=tdDomRoleRoots('user'),assistants=tdDomRoleRoots('assistant');
    const selection=window.getSelection(),range=tdDomSelectionRange(selection);
    const currentAncestors=[];
    for(let node=nodeAsElement(range?.startContainer || selection?.anchorNode),i=0;node&&i<9;i++,node=tdDomParent(node)) {
      currentAncestors.push(tdDomShape(node));if(node===document.body)break;
    }
    const saved=record=>record&&record.epoch===td.epoch?{
      stage:record.stage,ageMs:Date.now()-record.at,sequence:record.serial,ancestors:record.ancestors}:null;
    const plainIds='[data-chatgpt-selection-message-id],[data-chatgpt-search-message-ids],[data-turn-key],[data-message-id],[data-node-id],[data-turn-id],[data-turn-id-container],[data-item-id]';
    return {adapter:'native-address-v1',commentsEnabled:settings.enableInlineComments,answerJumpEnabled:settings.enableAnswerJump,
      root:tdDomShape(root),rootReason:c.reason,users:users.length,assistants:assistants.length,
      identityNodes:tdDomQueryAll(root,plainIds).length,rendererNodes:tdDomQueryAll(root,TD_DOM_CONTENT).length,
      document:{identityNodes:safeQueryAll(document,plainIds).length,rendererNodes:safeQueryAll(document,TD_DOM_CONTENT).length,
        semanticMessages:safeQueryAll(document,tdDomRoleSelector('assistant')+','+tdDomRoleSelector('user')).length,
        mainCount:safeQueryAll(document,'main,[role="main"]').length,openShadowRoots:tdDomScopes.shadows.size,
        frameCount:safeQueryAll(document,'iframe').length},
      scopeCandidates:c.candidates.map(({node,...item})=>item),
      openSurfaces:[...tdDomScopes.shadows.keys()].filter(r=>r.host.isConnected).map(r=>({host:tdDomShape(r.host),
        identityNodes:safeQueryAll(r,plainIds).length,rendererNodes:safeQueryAll(r,TD_DOM_CONTENT).length})).slice(0,12),
      messageSamples:[...users.slice(-1),...assistants.slice(-2)].map(tdDomShape),
      selection:{stage:tdDomState.selection,lengthCheck:tdSelection.lengthCheck,
        pending:Boolean(pendingSelection),integrationActive:Boolean(nativeSelectionFallbackTimer!==null || nativeSelectionButtonEl?.isConnected),hasRange:Boolean(range&&!range.collapsed),
        nativeButton:Boolean(nativeSelectionButtonEl?.isConnected),nativeButtonVisible:tdDomActionVisible(nativeSelectionButtonEl),
        fallback:Boolean(selectionActionEl&&!selectionActionEl.hidden),currentAncestors,
        lastAttempt:saved(tdDomScopes.lastAttempt),lastAnswer:saved(tdDomScopes.lastAnswerSelection)},
      adaptive:{matchedNodes:tdAdaptive.nodes.filter(n=>tdAdaptiveValidIds(n).length).length,attributes:tdAdaptive.attributes,truncated:tdAdaptive.truncated},
      lastResolution:tdDomState.nav,exactLookup:tdDomState.exactLookup || null};
  }

  function safeQueryAll(root, selector) {
    try {
      return Array.from((root || document).querySelectorAll(selector));
    } catch (error) {
      tdHealthFault('selector-query',error);
      return [];
    }
  }

  function firstMatchingRoot(selectors) {
    for (const selector of selectors || []) {
      try {
        const node = document.querySelector(selector);
        if (node) return node;
      } catch {
        // Ignore a selector that a site/browser does not support.
      }
    }
    return document;
  }

  function getChatGptThreadRoot() {
    if (site.id !== 'chatgpt') return null;
    return tdDomCensus().root;
  }

  function isChatGptPhantomTurnId(turnId) {
    const value = String(turnId || '');
    return !value || value.startsWith('client-created-');
  }

  function findChatGptTurnSection(turnId, expectedRole = '') {
    if (!turnId) return null;
    if (expectedRole) return tdDomFindExact([turnId], expectedRole);
    return tdDomFindExact([turnId], 'assistant') || tdDomFindExact([turnId], 'user');
  }

  function scanChatGptSkeleton(apiRecords = []) {
    if (site.id !== 'chatgpt' || !isCurrentPageEligible()) return null;
    const root = getChatGptThreadRoot();
    if (!root?.isConnected) return null;

    const elements = tdDomQueryAll(root, '[data-turn-id-container]').filter(node =>
      tdDomSafe(node) && !node.parentElement?.closest('[data-turn-id-container]'));

    const mountedById = new Map();
    for (const section of tdDomQueryAll(root, 'section[data-turn][data-turn-id]')) {
      const id = normalizeText(section.getAttribute('data-turn-id'));
      if (id) mountedById.set(id, section);
    }

    const userIds = new Set();
    const assistantIds = new Set();
    const hasAutomationRuns = (apiRecords || []).some(isAutomationTimelineEntry);
    for (const record of apiRecords || []) {
      const roleIds = entryAnchorRole(record) === 'assistant' ? assistantIds : userIds;
      for (const value of [record.nodeId, record.messageId]) if (value) roleIds.add(value);
      for (const answer of record.answerRecords || []) {
        for (const value of [answer.nodeId, answer.messageId]) if (value) assistantIds.add(value);
      }
    }

    const turns = elements.map((element, index) => {
      const turnId = normalizeText(element.getAttribute('data-turn-id-container'));
      const mountedSection = mountedById.get(turnId) || element.querySelector('section[data-turn]');
      let role = mountedSection?.getAttribute('data-turn') || '';
      if (!role && userIds.has(turnId)) role = 'user';
      if (!role && assistantIds.has(turnId)) role = 'assistant';
      return {
        turnId,
        element,
        index,
        role,
        mountedSection: mountedSection instanceof Element ? mountedSection : null,
        phantom: isChatGptPhantomTurnId(turnId),
      };
    });

    const realTurns = turns.filter((turn) => !turn.phantom);
    const manualPromptCount = (apiRecords || []).filter(isUserAnchoredEntry).length;
    let userParity = null;

    // Ordinary conversations are close to user/assistant alternation, so parity is a useful
    // fallback for rollout-specific placeholders that do not expose a role. Automation
    // timelines are intentionally not 1:1; applying parity there would misclassify a task
    // output as a user turn and break navigation. In that case only explicit DOM/API roles
    // participate in the skeleton.
    // Untyped placeholders stay untyped; alternating parity is not identity.

    return {
      root,
      turns,
      realTurns,
      userTurns: realTurns.filter((turn) => turn.role === 'user'),
      assistantTurns: realTurns.filter((turn) => turn.role === 'assistant'),
      userParity,
    };
  }

  function attachSkeletonTurn(target, turn) {
    if (!target || !turn?.element?.isConnected) return;
    target.skeletonTarget = turn.element;
    target.turnId = turn.turnId;
    target.skeletonIndex = turn.index;
    if (turn.mountedSection?.isConnected) target.target = turn.mountedSection;
    target.identityTokens = Array.from(new Set([...(target.identityTokens || []), turn.turnId].filter(Boolean)));
  }

  function assignSkeletonByOrder(items, turns, getAssignedTurnId, assign) { /* Deliberately no positional identity assignment. */ }

  function attachChatGptSkeleton(records, skeleton) {
    if (!records.length || !skeleton?.realTurns?.length) return records;
    const byId = new Map(skeleton.realTurns.map((turn) => [turn.turnId, turn]));

    for (const record of records) {
      const direct = [record.nodeId, record.messageId].map((id) => byId.get(id)).find(Boolean);
      if (direct) attachSkeletonTurn(record, direct);
      for (const answer of record.answerRecords || []) {
        const answerTurn = [answer.nodeId, answer.messageId].map((id) => byId.get(id)).find(Boolean);
        if (answerTurn) attachSkeletonTurn(answer, answerTurn);
      }
    }

    const manualRecords = records.filter(isUserAnchoredEntry);
    assignSkeletonByOrder(
      manualRecords,
      skeleton.userTurns,
      (record) => record.turnId,
      (record, turn) => {
        if (!record.turnId) attachSkeletonTurn(record, turn);
      },
    );

    const answers = records.flatMap((record) => record.answerRecords || []);
    assignSkeletonByOrder(
      answers,
      skeleton.assistantTurns,
      (answer) => answer.turnId,
      (answer, turn) => {
        if (!answer.turnId) attachSkeletonTurn(answer, turn);
      },
    );

    for (const record of records) {
      if (isAutomationTimelineEntry(record) && !record.skeletonTarget?.isConnected) {
        const answer = (record.answerRecords || []).find((candidate) => candidate.skeletonTarget?.isConnected);
        if (answer) {
          record.skeletonTarget = answer.skeletonTarget;
          record.target = answer.target || null;
          record.turnId = answer.turnId || '';
          record.skeletonIndex = answer.skeletonIndex;
          record.identityTokens = Array.from(new Set([
            ...(record.identityTokens || []),
            ...(answer.identityTokens || []),
            answer.turnId,
          ].filter(Boolean)));
        }
      }
      for (const block of record.answerBlocks || []) {
        const answer = (record.answerRecords || []).find((candidate) => candidate.answerOrdinal === block.answerOrdinal);
        if (!answer) continue;
        block.skeletonTarget = answer.skeletonTarget || null;
        block.turnId = answer.turnId || '';
        block.skeletonIndex = answer.skeletonIndex;
        block.identityTokens = Array.from(new Set([
          ...(block.identityTokens || []),
          ...(answer.identityTokens || []),
          answer.turnId,
        ].filter(Boolean)));
      }
    }
    return records;
  }

  function buildEntriesFromChatGptSkeleton(skeleton, visibleDomEntries) {
    if (!skeleton?.userTurns?.length) return [];
    const userTurnIds = new Set(skeleton.userTurns.map((turn) => turn.turnId));
    const visibleByTurnId = new Map();
    for (const mounted of visibleDomEntries || []) {
      for (const token of getEntryIdentityTokens(mounted)) {
        if (userTurnIds.has(token)) visibleByTurnId.set(token, mounted);
      }
    }
    return skeleton.userTurns.map((turn, index) => {
      const mounted = visibleByTurnId.get(turn.turnId) || null;
      const cached = cacheRecords.find(r=>tdNavRecordIds(r).includes(turn.turnId)) || null;
      return {
        ownerKey:routeKey,ownerSchema:TD_INDEX_OWNER_SCHEMA,
        key: `chatgpt-skeleton:${turn.turnId}`,
        kind: 'prompt',
        text: mounted?.text || cached?.text || `问题 ${index + 1}`,
        target: mounted?.target || turn.mountedSection || null,
        skeletonTarget: turn.element,
        turnId: turn.turnId,
        nodeId: '',
        messageId: '',
        identityTokens: [turn.turnId, ...(mounted?.identityTokens || [])],
        orderHint: index,
        source: 'chatgpt-skeleton',
        mountedIndex: mounted?.mountedIndex ?? null,
        answerBlocks: Array.isArray(cached?.answerBlocks)
          ? cached.answerBlocks.map(cloneAnswerBlockForRuntime).filter(Boolean)
          : [],
        answerRecords: Array.isArray(cached?.answerRecords)
          ? cached.answerRecords.map(cloneAnswerRecordForRuntime).filter(Boolean)
          : [],
      };
    });
  }

  function closestBySelectors(element, selectors) {
    if (!(element instanceof Element)) return null;
    for (const selector of selectors || []) {
      try {
        if (element.matches(selector)) return element;
        const match = element.closest(selector);
        if (match) return match;
      } catch {
        // Ignore invalid or unsupported selectors.
      }
    }
    return null;
  }

  function compareDomOrder(a,b) {
    if(a===b)return 0;
    let relation=a.compareDocumentPosition(b);
    if(relation & Node.DOCUMENT_POSITION_DISCONNECTED) {
      const chain=n=>{const out=[];for(let i=0;n&&i<100;i++,n=tdDomParent(n))out.unshift(n);return out;};
      const left=chain(a),right=chain(b);let i=0;while(left[i]&&left[i]===right[i])i++;
      if(!left[i])return -1;if(!right[i])return 1;
      relation=left[i].compareDocumentPosition(right[i]);
      if(relation & Node.DOCUMENT_POSITION_DISCONNECTED)return 0;
    }
    return relation & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : relation & Node.DOCUMENT_POSITION_PRECEDING ? 1 : 0;
  }

  function isInsideComposer(element) {
    if (!(element instanceof Element)) return false;
    // A form or a main is not itself an editor; inheritance crosses open hosts.
    return Boolean(tdDomClosest(element,'textarea,input,#prompt-textarea,rich-textarea,input-area-v2,[data-testid="composer"],[contenteditable="true"],[contenteditable="plaintext-only"]') ||
      (element instanceof HTMLElement && element.isContentEditable));
  }

  function isLikelySidebarElement(element) {
    if (!(element instanceof Element)) return false;
    const sidebar = element.closest('nav, aside, [role="navigation"]');
    if (!sidebar) return false;
    const main = element.closest('main, #thread, chat-window, .scroller, .desktop-layout-content');
    return !main;
  }

  function extractCleanText(element, textSelectors = []) {
    if (!(element instanceof Element)) return '';

    let textRoot = element;
    let bestLength = normalizeText(element.textContent).length;
    for (const selector of textSelectors || []) {
      for (const candidate of safeQueryAll(element, selector)) {
        const candidateLength = normalizeText(candidate.textContent).length;
        if (candidateLength > 0 && (bestLength === 0 || candidateLength <= bestLength || candidateLength > 12)) {
          textRoot = candidate;
          bestLength = candidateLength;
          break;
        }
      }
      if (textRoot !== element) break;
    }

    const clone = textRoot.cloneNode(true);
    safeQueryAll(
      clone,
      [
        'button',
        '[role="button"]',
        'svg',
        'canvas',
        'video',
        'audio',
        'script',
        'style',
        '[aria-hidden="true"]',
        '[class*="toolbar" i]',
        '[class*="actions" i]',
        '[class*="action-bar" i]',
        '[class*="menu" i]',
        '[class*="icon" i]',
        '[data-testid*="action" i]',
      ].join(','),
    ).forEach((node) => node.remove());

    let text = normalizeText(clone.textContent);
    text = text
      .replace(/^(You said|你说|用户|User)\s*[:：]?\s*/i, '')
      .replace(/\s*(Copy|Edit|复制|编辑|重试|重新生成)\s*$/i, '')
      .trim();

    if (text) return text;

    const imageCount = element.querySelectorAll('img, video').length;
    const fileLabels = safeQueryAll(
      element,
      '[aria-label*="file" i], [aria-label*="upload" i], [class*="file" i], [class*="attachment" i]',
    )
      .map((node) => normalizeText(node.getAttribute('aria-label') || node.textContent))
      .filter(Boolean);

    if (fileLabels.length) return `文件提问：${truncateText(fileLabels[0], 80)}`;
    if (imageCount > 0) return '图片提问';
    return '';
  }


  function isSupportedOutlineKind(kind) {
    return ['heading', 'section-title', 'numbered-section'].includes(kind);
  }

  function isAnswerOutlineBlock(block) {
    return Boolean(block && isSupportedOutlineKind(block.kind) &&
      ANSWER_OUTLINE_ORIGINS.has(block.outlineOrigin) &&
      normalizeText(block.sectionTitle || block.label || block.text));
  }

  function isNavigableAnswerBlock(block) {
    // v1.4: stored summaryOnly/navigable flags belong to the old static view.
    // Capability comes from the current setting and the stable outline contract.
    return settings.enableAnswerJump !== false && settings.answerOutlineMode !== 'off' && isAnswerOutlineBlock(block);
  }

  function normalizeAnswerOutlineBlocks(rawBlocks) {
    const result = []; const seen = new Set();
    for (const block of Array.isArray(rawBlocks) ? rawBlocks : []) {
      if (!isAnswerOutlineBlock(block)) continue;
      const title = normalizeText(block.sectionTitle || block.label || block.text);
      const id = `${block.answerNodeId || block.answerMessageId || block.answerOrdinal}:${block.outlineOrdinal}:${block.fingerprint}`;
      if (seen.has(id)) continue;
      seen.add(id);
      result.push({...block, label:title, text:title, sectionTitle:title,
        navigable:false, summaryOnly:true, outlineIndex:result.length, blockIndex:result.length});
    }
    return result;
  }

  function rebuildBlocksForAnswerRecord(record, entry, answerIndex, existingBlocks = []) {
    const answerOrdinal = Number.isFinite(record?.answerOrdinal) ? record.answerOrdinal : answerIndex;
    const rawText = String(record?.rawText || '');
    const unchanged = record?.outlineSchema === ANSWER_OUTLINE_CACHE_SCHEMA && record?.outlineRawText === rawText && Array.isArray(record?.blocks);
    const parsed = unchanged ? normalizeAnswerOutlineBlocks(record.blocks) : rawText
      ? parseAnswerOutlineBlocks(rawText, {
        answerNodeId: record?.nodeId || '',
        answerMessageId: record?.messageId || '',
        answerOrdinal,
        outlineMode: 'stable',
      })
      : normalizeAnswerOutlineBlocks(record?.blocks);
    return parsed.map((block, outlineIndex) => {
      const prior = existingBlocks.find((candidate) => (
        candidate &&
        Number(candidate.answerOrdinal || 0) === answerOrdinal &&
        candidate.kind === block.kind &&
        candidate.outlineOrdinal === block.outlineOrdinal &&
        candidate.fingerprint === block.fingerprint
      )) || null;
      return {
        ...block,
        key: `strict-answer:${entry?.key || 'entry'}:${answerOrdinal}:${outlineIndex}:${block.fingerprint}`,
        parentKey: entry?.key || prior?.parentKey || '',
        answerOrdinal,
        blockIndex: outlineIndex,
        outlineIndex,
        target: prior?.target?.isConnected ? prior.target : null,
        skeletonTarget: prior?.skeletonTarget?.isConnected ? prior.skeletonTarget : null,
        turnId: prior?.turnId || record?.turnId || '',
        mappingConfidence: prior?.mappingConfidence || '',
      };
    });
  }

  function enforceAnswerOutlines(rawEntries) {
    for (const entry of Array.isArray(rawEntries) ? rawEntries : []) {
      const existingBlocks = Array.isArray(entry.answerBlocks) ? entry.answerBlocks : [];
      const records = Array.isArray(entry.answerRecords) ? entry.answerRecords : [];
      let rebuiltFromRawAnswer = false;
      const rebuiltBlocks = [];
      entry.answerRecords = records.map((record, answerIndex) => {
        const hasRawText = Boolean(normalizeMultilineText(record?.rawText || ''));
        if (hasRawText) rebuiltFromRawAnswer = true;
        const blocks = rebuildBlocksForAnswerRecord(record, entry, answerIndex, existingBlocks);
        rebuiltBlocks.push(...blocks);
        return { ...record, blocks, outlineSchema: ANSWER_OUTLINE_CACHE_SCHEMA, outlineRawText: String(record?.rawText || '') };
      });

      // API answers are regenerated from their current raw Markdown on every refresh.
      // One document-level contract survives parsing, merging, caching and rendering.
      // No later list-only filter may silently throw away actual answer headings.
      const sourceBlocks = rebuiltFromRawAnswer ? rebuiltBlocks : (existingBlocks.length ? existingBlocks : rebuiltBlocks);
      entry.answerBlocks = normalizeAnswerOutlineBlocks(sourceBlocks).map((block, index) => ({
        ...block,
        key: `strict-answer:${entry.key}:${block.answerOrdinal || 0}:${block.outlineOrdinal}:${block.fingerprint}`,
        parentKey: block.parentKey || entry.key || '',
        outlineIndex: index,
        blockIndex: index,
      }));
    }
    return rawEntries;
  }

  function outlineContextSignature(element) {
    if (!(element instanceof Element)) return '';
    // Attribute metadata only: scanning textContent here classified any answer
    // discussing "reasoning" as the reasoning panel itself.
    return ['class','id','data-testid','data-role','data-channel','aria-label'].map((key) => element.getAttribute(key) || '').join(' ');
  }

  function isReasoningOrCollapsedOutlineContext(node, boundary = null) {
    let current = node instanceof Element ? node : node?.parentElement;
    let depth = 0;
    while (current && depth++ < 18) {
      if (current.matches('details,summary,[hidden],[aria-hidden="true"],[data-channel="analysis"],[data-channel="commentary"]')) return true;
      const signature = outlineContextSignature(current);
      if (/(?:reasoning|thinking|thought|chain[-_]of[-_]thought|analysis[-_](?:trace|panel|content)|思考过程|推理过程)/i.test(signature)) return true;
      if (current === boundary) break;
      current = tdDomParent(current);
    }
    return false;
  }

  function findAssistantContentRoot(anchor) {
    if (!(anchor instanceof Element) || isReasoningOrCollapsedOutlineContext(anchor, anchor)) return null;
    const choices = [];
    for (const selector of ['[data-markdown-text-style][data-selected-text-overlay-target]','.markdown','.prose','message-content','[data-message-content]','[data-testid="message-content"]',tdDomRoleSelector('assistant')]) {
      if (anchor.matches(selector)) choices.push(anchor);
      choices.push(...tdDomQueryAll(anchor,selector));
    }
    const clean = [...new Set(choices)].filter((node) => node instanceof HTMLElement &&
      node.isConnected && normalizeText(node.textContent) && !isReasoningOrCollapsedOutlineContext(node,anchor) &&
      !node.closest('button,nav,aside,[data-testid*="action"]'));
    const leaves = clean.filter((a) => !clean.some((b) => a !== b && a.contains(b))).sort(compareDomOrder);
    return leaves.at(-1) || (tdDomSafe(anchor) && tdDomRole(anchor)==='assistant' && normalizeText(anchor.textContent) ? anchor : null);
  }

  function findAssistantOutlineRoots(anchor) {
    if (!(anchor instanceof Element) || isReasoningOrCollapsedOutlineContext(anchor)) return [];
    const allowed = (node) => node instanceof HTMLElement && node.isConnected &&
      normalizeText(node.textContent) && !isReasoningOrCollapsedOutlineContext(node, anchor) &&
      !node.closest('button,nav,aside,[data-testid*="action"]');
    const topmost = (nodes) => [...new Set(nodes)].filter((node) => !nodes.some((other) => other !== node && other.contains(node))).sort(compareDomOrder);
    // 优先读取作者正文片段，避免把定时任务名称、复制和重载按钮收入章节。
    const markdown = [ ...(anchor.matches(TD_DOM_CONTENT) ? [anchor] : []), ...tdDomQueryAll(anchor, TD_DOM_CONTENT) ].filter(allowed);
    if (markdown.length) return topmost(markdown);
    const messages = [ ...(anchor.matches(tdDomRoleSelector('assistant') + ',message-content') ? [anchor] : []),
      ...tdDomQueryAll(anchor, tdDomRoleSelector('assistant') + ',message-content') ].filter(allowed);
    if (messages.length) return topmost(messages);
    return allowed(anchor) ? [anchor] : [];
  }

  function collectRenderedAnswerBlocks(answerAnchor) {
    const roots = findAssistantOutlineRoots(answerAnchor);
    if (!roots.length) return [];
    const items = TDAnswerOutline.fromDOM(roots, (node) => isReasoningOrCollapsedOutlineContext(node, answerAnchor));
    return tdBuildDocumentOutline(items, {}, true);
  }

  function characterGramSimilarity(left, right) {
    const a = normalizeOutlineIdentityText(left);
    const b = normalizeOutlineIdentityText(right);
    if (!a || !b) return 0;
    if (a === b) return 1;
    if ((a.startsWith(b) || b.startsWith(a)) && Math.min(a.length, b.length) >= 40) return 0.94;
    const grams = (value) => {
      const compact = value.replace(/\s+/g, ' ');
      const set = new Set();
      const size = compact.length > 36 ? 3 : 2;
      for (let index = 0; index <= compact.length - size; index += 1) set.add(compact.slice(index, index + size));
      return set;
    };
    const leftSet = grams(a.slice(0, 720));
    const rightSet = grams(b.slice(0, 720));
    if (!leftSet.size || !rightSet.size) return 0;
    let intersection = 0;
    for (const value of leftSet) if (rightSet.has(value)) intersection += 1;
    return intersection / Math.max(leftSet.size, rightSet.size);
  }

  function mapAnswerBlocksToRendered(apiBlocks, domBlocks) {
    const plan = tdNavMatchOutline(apiBlocks || [], domBlocks || []);
    for (const block of apiBlocks || []) {
      const match = plan.get(block);
      block.target = match?.block.target || null;
      block.domBlockIndex = match?.index ?? null;
      block.mappingConfidence = match?.confidence || '';
    }
    return plan.size;
  }

  function findAssistantSectionForAnswer(answer) {
    if (!answer) return null;
    const ids = tdNavRecordIds(answer);
    const exact = tdDomFindExact(ids, 'assistant');
    if (exact) return exact;
    // No positional aliases and no stale cached element without an identity proof.
    return !ids.length && answer.target?.isConnected ? findAssistantAnchorFromNode(answer.target) : null;
  }

  function attachRenderedAnswerTargets(records) {
    for (const record of records || []) {
      for (const answer of record.answerRecords || []) {
        const section = findAssistantSectionForAnswer(answer);
        if (!section) continue;
        answer.target = section;
        if (isAutomationTimelineEntry(record) && !record.target?.isConnected) {
          record.target = section;
          record.skeletonTarget = answer.skeletonTarget || record.skeletonTarget || null;
          record.turnId = answer.turnId || record.turnId || '';
          record.skeletonIndex = Number.isFinite(answer.skeletonIndex)
            ? answer.skeletonIndex
            : record.skeletonIndex;
          record.identityTokens = Array.from(new Set([
            ...(record.identityTokens || []),
            ...(answer.identityTokens || []),
            answer.nodeId,
            answer.messageId,
            answer.turnId,
          ].filter(Boolean)));
        }
        const apiBlocks = (record.answerBlocks || []).filter((block) => block.answerOrdinal === answer.answerOrdinal);
        if (!apiBlocks.length && !String(answer.rawText || '').trim()) {
          const blocks = collectRenderedAnswerBlocks(section).map((block, index) => ({...block,
            key:`dom-answer:${record.key}:${answer.answerOrdinal}:${index}`, parentKey:record.key,
            answerOrdinal:answer.answerOrdinal || 0, answerNodeId:answer.nodeId || '', answerMessageId:answer.messageId || ''}));
          record.answerBlocks = [...(record.answerBlocks || []), ...blocks];
          answer.blocks = blocks;
        }
      }
    }
  }

  function scanAssistantAnchors(config = site) {
    return tdDomRoleRoots('assistant');
  }

  function attachGenericAnswerBlocks(promptEntries, assistantAnchors) {
    if (!promptEntries.length || !assistantAnchors.length) return;
    const prompts = promptEntries.filter(prompt => prompt.target?.isConnected).sort((a,b) => compareDomOrder(a.target,b.target));
    let cursor = 0;
    for (const [index, prompt] of prompts.entries()) {
      const next = prompts[index+1]?.target;
      while (cursor < assistantAnchors.length && compareDomOrder(assistantAnchors[cursor],prompt.target) <= 0) cursor++;
      const answers = [];
      while (cursor < assistantAnchors.length && (!next || compareDomOrder(assistantAnchors[cursor],next) < 0)) {
        const target = assistantAnchors[cursor++];
        if (!findAssistantOutlineRoots(target).length && !tdAnswerImages(target,findAssistantContentRoot(target)).length) continue;
        const address = tdMessageAddress(target,'assistant');
        const answerOrdinal = answers.length;
        const blocks = (settings.answerOutlineMode === 'off' ? [] : collectRenderedAnswerBlocks(target)).map((block, i) => ({
          ...block, key:'dom-answer:'+prompt.key+':'+(address.messageId || answerOrdinal)+':'+i,
          parentKey:prompt.key, answerOrdinal, answerNodeId:address.nodeId, answerMessageId:address.messageId,
          identityTokens:address.identityTokens, turnId:address.turnId, skeletonTarget:null,
        }));
        answers.push({...address,answerOrdinal,target,skeletonTarget:null,completed:Boolean(tdAnswerCompletionEvidence(target)),
          rawText:'',outlineRawText:'',outlineSchema:ANSWER_OUTLINE_CACHE_SCHEMA,blocks});
      }
      if (!answers.length) continue;
      prompt.answerRecords = answers;
      prompt.answerBlocks = answers.flatMap(answer => answer.blocks);
    }
  }

  // v1.9.0 integration release:
  // - zero automatic metadata reads; native IDs work without a server role map;
  // - all outline items carry an answer address, including the cold DOM fallback;
  // - partial native pages cannot delete full history or prove the current turn ended;
  // - receipts, selection, live indexing and navigation share message identities.
  // v1.9: one route-scoped message address for DOM-only, cached and API paths.
  // A renderer/role is not an address. Never promote a thread ID or row ordinal
  // to a message ID, and never require a backend lookup to read native IDs.
  const TD_ADDRESS_FIELDS = ['data-chatgpt-selection-message-id','data-message-id','data-node-id'];
  let tdAddressCache = new WeakMap();
  function tdOwnMessageIds(node) {
    if (!(node instanceof Element)) return [];
    const ids=TD_ADDRESS_FIELDS.map(a=>node.getAttribute(a)).filter(v=>typeof v==='string'&&v.length>0&&v.length<=220);
    if (!ids.length && node.id) {
      const m=node.id.match(/^(?:message|turn|conversation-turn)[-:]([0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12})$/i);
      if(m)ids.push(m[1]);
    }
    return [...new Set(ids)];
  }
  function tdMessageAddress(section, role) {
    const empty={nodeId:'',messageId:'',identityTokens:[],turnId:'',addressSource:'unaddressed'};
    if(!(section instanceof Element)||!section.isConnected||!tdRouteAllows(section)||isInsideComposer(section))return empty;
    const revision=tdDomState.revision;
    const cached=tdAddressCache.get(section);
    if(cached?.revision===revision&&cached.epoch===td.epoch&&cached.role===role)return cached.value;
    const actual=tdDomExplicitRole(section);
    if(actual&&actual!==role)return empty;
    const clean=n=>n instanceof Element&&n.isConnected&&!isInsideComposer(n)&&
      !isReasoningOrCollapsedOutlineContext(n,section)&&
      !tdDomClosest(n,'button,[role="button"],nav,aside,#threaddeck-host,#prompt-rail-host');
    const nativeSelector=TD_ADDRESS_FIELDS.map(a=>`[${a}]`).join(',');
    let direct=tdOwnMessageIds(section), primaryNode=direct.length?section:null;
    if(!direct.length) {
      const children=tdDomQueryAll(section,nativeSelector).filter(clean);
      const leaves=children.filter(n=>!children.some(o=>o!==n&&tdDomContains(n,o)));
      const groups=leaves.map(n=>({node:n,ids:tdOwnMessageIds(n)})).filter(x=>x.ids.length);
      const distinct=groups.filter((g,i)=>!groups.slice(0,i).some(p=>g.ids.some(id=>p.ids.includes(id))));
      if(distinct.length===1){direct=distinct[0].ids;primaryNode=distinct[0].node;}
      if(distinct.length>1)return empty;
    }
    let turnId='',source=direct.length?'native-message':'', grouped=[];
    // Ancestors only until the smallest single-message unit. Spanning another
    // author/message revokes any aliases from that ancestor.
    for(let n=section,depth=0;n&&depth<14;n=tdDomParent(n),depth++){
      if(n.matches('main,body,html,form,#thread,[data-thread-find-target]'))break;
      if(!clean(n))break;
      if(n!==section) {
        const peers=tdDomQueryAll(n,tdDomRoleSelector(role))
          .filter(p=>clean(p)&&!tdDomContains(p,section)&&!tdDomContains(section,p));
        if(peers.length)break;
        const foreign=tdDomQueryAll(n,tdDomRoleSelector(role==='user'?'assistant':'user')).filter(clean);
        if(foreign.length)break;
      }
      if(!direct.length){const ids=tdOwnMessageIds(n);if(ids.length){direct=ids;primaryNode=n;source='native-message';}}
      const searchIds=tdDomSearchMessageIds(n);
      if(searchIds.length===1 && (!direct.length||direct.includes(searchIds[0])))grouped=searchIds;
      // A single search token can address an explicitly typed bubble. Multi-ID
      // aggregations can never establish identity by themselves.
      if(searchIds.length>1&&!direct.length)break;
      const t=n.getAttribute('data-turn-key')||n.getAttribute('data-turn-id')||n.getAttribute('data-turn-id-container');
      if(t&&t.length<=220&&!turnId)turnId=t;
    }
    if(!direct.length&&grouped.length){direct=grouped;source='native-search-unit';}
    if(!direct.length&&turnId){direct=[turnId];source='native-turn';}
    const known=tdDomKnownRoles();
    if(direct.some(id=>known.has(id)&&known.get(id)!==role&&known.get(id)!=='ambiguous'))return empty;
    const preferred=primaryNode?.getAttribute('data-chatgpt-selection-message-id')||
      primaryNode?.getAttribute('data-message-id')||direct[0]||'';
    const messageId=direct.includes(preferred)?preferred:direct[0]||'';
    const nodeId=primaryNode?.getAttribute('data-node-id')||messageId;
    const value={nodeId,messageId,identityTokens:[...new Set([messageId,nodeId,...direct].filter(Boolean))],turnId,addressSource:source||'unaddressed'};
    tdAddressCache.set(section,{revision,epoch:td.epoch,role,value});
    return value;
  }

  const STRONG_DOM_ID_ATTRIBUTES = [
    'data-message-id',
    'data-turn-id',
    'data-turn-id-container',
    'data-node-id',
    'data-id',
    'id',
  ];

  const STABLE_DOM_ID_ATTRIBUTES = [
    ...STRONG_DOM_ID_ATTRIBUTES,
    'data-testid',
    'data-index',
    'data-row-index',
    'aria-posinset',
  ];

  function collectDomIdentityTokens(anchor, candidate) {
    const role=tdDomExplicitRole(anchor)||tdDomExplicitRole(candidate)||'user';
    return tdMessageAddress(anchor,role).identityTokens;
  }

  function extractStableId(anchor, candidate) {
    const nodes = [anchor, candidate].filter(Boolean);
    for (const node of nodes) {
      if (!(node instanceof Element)) continue;
      for (const attribute of STABLE_DOM_ID_ATTRIBUTES) {
        const value = normalizeText(node.getAttribute(attribute));
        if (value && value.length < 220) return `${attribute}:${value}`;
      }
    }
    return '';
  }

  function extractOrderHint(anchor) {
    if (!(anchor instanceof Element)) return null;
    for (const attribute of ['data-index', 'data-row-index', 'aria-posinset']) {
      const parsed = Number.parseInt(anchor.getAttribute(attribute), 10);
      if (Number.isFinite(parsed)) return parsed;
    }
    const testId = anchor.getAttribute('data-testid') || '';
    const testIdMatch = testId.match(/(?:turn|message|row)[-_]?(\d+)/i);
    if (testIdMatch) return Number.parseInt(testIdMatch[1], 10);
    return null;
  }

  function createDomEntry(anchor, candidate, text, index, occurrenceMap) {
    const role=tdDomExplicitRole(anchor)||tdDomExplicitRole(candidate)||'user';
    const address=tdMessageAddress(anchor,role);
    // Identity-less live entries remain readable, but cannot poison persisted
    // message addresses with ancestor IDs such as "main"/"thread-content".
    const textHash=hashString(text.slice(0,240));
    const occurrence=(occurrenceMap.get(textHash)||0)+1;occurrenceMap.set(textHash,occurrence);
    const key=address.messageId?`message:${role}:${address.messageId}`:`unaddressed:${textHash}:${occurrence}`;
    return {key,text,...address,kind:role==='assistant'?'assistant-output':'prompt',anchorRole:role,
      target:anchor,nativeButton:null,nativeActive:false,orderHint:null,source:'dom',mountedIndex:index};
  }

  function scanBySelectors(config = site) {
    const root = getChatGptThreadRoot() || firstMatchingRoot(config.roots);
    const candidates = [];
    const selectorHits = {};

    for (const selector of config.userSelectors || []) {
      const hits = tdDomQueryAll(root, selector);
      selectorHits[selector] = hits.length;
      candidates.push(...hits);
    }

    candidates.push(...tdDomRoleRoots('user'));
    const uniqueAnchors = new Map();
    for (const candidate of candidates) {
      if (!(candidate instanceof Element) || !candidate.isConnected) continue;
      if (!tdDomSafe(candidate) || !tdDomTreeShown(candidate) || isInsideComposer(candidate) || isLikelySidebarElement(candidate)) continue;
      const anchor = tdDomMessageFromNode(candidate, 'user') || candidate;
      if (!(anchor instanceof Element) || !anchor.isConnected || isInsideComposer(anchor)) continue;
      const text = extractCleanText(candidate, config.textSelectors) || extractCleanText(anchor, config.textSelectors);
      if (!text) continue;

      tdRouteRememberNode(anchor); tdRouteRememberNode(candidate);
      const previous = uniqueAnchors.get(anchor);
      if (!previous || text.length > previous.text.length) uniqueAnchors.set(anchor, { anchor, candidate, text });
    }

    const rows = Array.from(uniqueAnchors.values()).sort((left, right) => compareDomOrder(left.anchor, right.anchor));
    const occurrenceMap = new Map();
    const scanned = rows.map((row, index) =>
      createDomEntry(row.anchor, row.candidate, row.text, index, occurrenceMap),
    );

    return { entries: tdStampIndex(scanned), selectorHits };
  }

  function scanDoubao() {
    const scroller = document.querySelector('.scroller');
    const result = [];
    const selectorHits = { '.v_list_row': 0, 'generic-fallback': 0 };
    const occurrenceMap = new Map();

    if (scroller) {
      const rows = safeQueryAll(scroller, '.v_list_row');
      selectorHits['.v_list_row'] = rows.length;
      for (const row of rows) {
        const userBubble =
          row.querySelector('[class*="flex-row"][class*="justify-end"]') ||
          row.querySelector('[class*="justify-end"]');
        if (!userBubble) continue;

        const item =
          row.querySelector('.inner-item-BjaxFt') ||
          row.querySelector('[class*="inner-item-"]') ||
          row.querySelector('[data-message-author-role="user"], [data-message-role="user"], [data-role="user"]') ||
          userBubble;
        const text = extractCleanText(item, site.textSelectors) || extractCleanText(userBubble, site.textSelectors);
        if (!text) continue;
        result.push(createDomEntry(row, item, text, result.length, occurrenceMap));
      }
    }

    const generic = scanBySelectors(site);
    selectorHits['generic-fallback'] = generic.entries.length;
    const seenTargets = new Set(result.map((entry) => entry.target));
    for (const entry of generic.entries) {
      if (!seenTargets.has(entry.target)) result.push(entry);
    }

    result.sort((left, right) => compareDomOrder(left.target, right.target));
    return { entries: result, selectorHits };
  }

  function chooseNativeTocGroup(buttons) {
    const candidates = new Map();
    const buttonSet = new Set(buttons);

    for (const button of buttons) {
      let ancestor = button.parentElement;
      for (let depth = 0; ancestor && depth < 7; depth += 1, ancestor = ancestor.parentElement) {
        if (ancestor === document.body || ancestor === document.documentElement) break;
        if (!candidates.has(ancestor)) candidates.set(ancestor, new Set());
        candidates.get(ancestor).add(button);
      }
    }

    return (
      Array.from(candidates.entries())
        .map(([group, groupedButtonSet]) => {
          const groupedButtons = safeQueryAll(group, 'button[data-toc-item-index]').filter((button) =>
            buttonSet.has(button),
          );
          const uniqueCount = new Set(groupedButtons.map((button) => button.dataset.tocItemIndex)).size;
          if (uniqueCount < 2 && buttons.length > 1) return { group, score: -Infinity };

          const rect = group.getBoundingClientRect();
          const visibleBonus = rect.width > 0 && rect.height > 0 ? 10000 : 0;
          const rightSideBonus = rect.left > window.innerWidth * 0.55 ? 1500 : 0;
          const compactnessPenalty = Math.min(1800, Math.max(0, rect.width * rect.height) / 150);
          const depthBonus = group.parentElement ? 50 : 0;
          return {
            group,
            score: visibleBonus + rightSideBonus + uniqueCount * 500 + groupedButtons.length * 10 + depthBonus - compactnessPenalty,
          };
        })
        .sort((left, right) => right.score - left.score)[0]?.group || null
    );
  }

  function extractNativeTocIndex(button, fallbackIndex) {
    const parsed = Number.parseInt(button.dataset.tocItemIndex, 10);
    if (Number.isFinite(parsed) && parsed >= 0) return parsed;
    const aria = normalizeText(button.getAttribute('aria-label'));
    const match = aria.match(/(\d+)$/);
    return match ? Math.max(0, Number.parseInt(match[1], 10) - 1) : fallbackIndex;
  }

  

  

  function observeNativeToc(group) {
    if (nativeTocGroup === group && nativeTocObserver) return;
    nativeTocObserver?.disconnect();
    nativeTocGroup = group;
    nativeTocObserver = new MutationObserver(() => scheduleRefresh('native-toc'));
    nativeTocObserver.observe(group, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['aria-label', 'data-toc-active', 'data-toc-item-index'],
    });
  }

  function collectNativeIdentityTokens(button) {
    if (!(button instanceof Element)) return [];
    const tokens = new Set();
    for (const attribute of [
      'data-message-id',
      'data-turn-id',
      'data-turn-id-container',
      'data-node-id',
      'data-id',
      'aria-controls',
      'href',
    ]) {
      const rawValue = normalizeText(button.getAttribute(attribute));
      if (!rawValue || rawValue.length >= 300) continue;
      const value = rawValue.startsWith('#') ? rawValue.slice(1) : rawValue;
      if (value) tokens.add(value);
      const uuidMatches = rawValue.match(/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/gi);
      uuidMatches?.forEach((match) => tokens.add(match));
    }
    return Array.from(tokens);
  }

  function scanChatGptNative(visibleDomEntries) {
    const buttons=safeQueryAll(document,'button[data-toc-item-index]').filter(b=>b.isConnected);
    if(!buttons.length)return null;
    const group=chooseNativeTocGroup(buttons);if(!group)return null;
    const known=[...visibleDomEntries,...tdOwnedIndex(chatGptApiRecords),...tdOwnedIndex(cacheRecords)];
    const found=[];
    for(const button of safeQueryAll(group,'button[data-toc-item-index]')) {
      const ids=collectNativeIdentityTokens(button),label=normalizeText(button.getAttribute('aria-label'));
      const candidates=known.filter(e=>isUserAnchoredEntry(e)&&(ids.some(id=>tdNavRecordIds(e).includes(id))||
        (!isGenericTocLabel(label)&&label===normalizeText(e.text))));
      const unique=new Map(candidates.map(e=>[tdNavRecordIds(e).join('|'),e]));
      if(unique.size!==1)continue;
      const match=[...unique.values()][0];if(!tdNavRecordIds(match).length)continue;
      found.push({...match,target:null,nativeButton:button,nativeActive:button.hasAttribute('data-toc-active'),
        nativeRawIndex:extractNativeTocIndex(button,found.length),nativeLabel:label,nativeLabelGeneric:isGenericTocLabel(label),source:'native'});
    }
    observeNativeToc(group);return {entries:tdStampIndex(found),group};
  }

  function textsLikelyMatch(left, right) {
    const a = normalizeText(left);
    const b = normalizeText(right);
    if (!a || !b) return false;
    if (a === b) return true;
    const headA = a.slice(0, 140);
    const headB = b.slice(0, 140);
    return headA === headB || (Math.min(a.length, b.length) >= 24 && (a.startsWith(headB) || b.startsWith(headA)));
  }

  function getEntryIdentityTokens(entry) {
    const tokens = new Set();
    for (const value of entry?.identityTokens || []) {
      const normalized = normalizeText(value);
      if (normalized) tokens.add(normalized);
    }
    for (const value of [entry?.messageId, entry?.nodeId]) {
      const normalized = normalizeText(value);
      if (normalized) tokens.add(normalized);
    }
    return tokens;
  }

  function mountedEntryExactlyMatchesApi(mounted, apiRecord) {
    if(!mounted||!apiRecord||entryAnchorRole(mounted)!==entryAnchorRole(apiRecord))return false;
    const a=tdNavRecordIds(mounted),b=tdNavRecordIds(apiRecord);
    return a.length>0&&b.length>0&&a.some(id=>b.includes(id));
  }

  function attachRuntimeTarget(record, mounted) {
    record.target = mounted.target;
    record.runtimeKey = mounted.key;
    record.mountedIndex = mounted.mountedIndex;
    record.identityTokens = Array.from(new Set([
      ...(record.identityTokens || []),
      ...(mounted.identityTokens || []),
    ]));
  }

  function mapMountedEntriesToRecords(records, visibleDomEntries) {
    const used=new Set();
    for(const mounted of visibleDomEntries) {
      const ids=tdNavRecordIds(mounted);
      const hits=records.filter(r=>isUserAnchoredEntry(r)&&!used.has(r)&&tdNavRecordIds(r).some(id=>ids.includes(id)));
      if(hits.length!==1)continue;
      attachRuntimeTarget(hits[0],mounted);used.add(hits[0]);
    }
  }

  function pickViewportMountedEntry(visibleDomEntries) {
    const mounted = visibleDomEntries.filter((entry) => entry.target?.isConnected);
    if (!mounted.length) return null;
    const rootRect =
      currentScrollRoot &&
      currentScrollRoot !== document.scrollingElement &&
      currentScrollRoot !== document.documentElement &&
      currentScrollRoot !== document.body
        ? currentScrollRoot.getBoundingClientRect()
        : { top: 0, height: window.innerHeight };
    const focusY = Math.max(rootRect.top + 80, Math.min(window.innerHeight * 0.3, rootRect.top + rootRect.height * 0.32));
    let best = null;
    for (const entry of mounted) {
      const rect = entry.target.getBoundingClientRect();
      const before = rect.top <= focusY + 8;
      const distance = before ? focusY - rect.top : Math.abs(rect.top - focusY) + 10000;
      if (!best || distance < best.distance) best = { entry, distance };
    }
    return best?.entry || null;
  }

  function findRecordIndexForMounted(records, mounted) {
    if (!mounted) return -1;
    const byTarget = records.findIndex((record) => (
      isUserAnchoredEntry(record) && record.target === mounted.target && mounted.target?.isConnected
    ));
    if (byTarget >= 0) return byTarget;

    const exact = [];
    records.forEach((record, index) => {
      if (isUserAnchoredEntry(record) && mountedEntryExactlyMatchesApi(mounted, record)) exact.push(index);
    });
    if (exact.length === 1) return exact[0];

    const likely = [];
    records.forEach((record, index) => {
      if (isUserAnchoredEntry(record) && textsLikelyMatch(mounted.text, record.text)) likely.push(index);
    });
    return likely.length === 1 ? likely[0] : -1;
  }

  function mapNativeEntriesToRecords(records, nativeEntries, visibleDomEntries) {
    const assigned=new Set();let mappedCount=0;
    for(const native of nativeEntries||[]){
      const nativeIds=[...getEntryIdentityTokens(native)];
      let matches=records.filter((r,i)=>isUserAnchoredEntry(r)&&!assigned.has(i)&&
        nativeIds.length&&tdNavRecordIds(r).some(id=>nativeIds.includes(id)));
      let confidence='exact-native-id';
      if(!matches.length&&!native.nativeLabelGeneric){
        // Exact complete text can identify a unique original native action;
        // shortened/prefix labels and positional offsets are not sufficient.
        const label=normalizeText(native.nativeLabel);
        const all=records.filter(r=>isUserAnchoredEntry(r)&&normalizeText(r.text)===label);
        const sameLabels=nativeEntries.filter(n=>normalizeText(n.nativeLabel)===label);
        if(label&&all.length===1&&sameLabels.length===1&&!assigned.has(records.indexOf(all[0]))){
          matches=all;confidence='exact-native-label';
        }
      }
      if(matches.length!==1)continue;
      const entry=matches[0],i=records.indexOf(entry);assigned.add(i);
      Object.assign(entry,{nativeButton:native.nativeButton||null,nativeActive:Boolean(native.nativeActive),
        nativeRawIndex:native.nativeRawIndex,nativeMappedIndex:i,nativeMappingConfidence:confidence});
      mappedCount++;
    }
    return {mappedCount,offset:null,confidence:mappedCount?'exact-actions':'none'};
  }

  function cloneAnswerBlockForRuntime(block) {
    if (!block || typeof block !== 'object' || !isAnswerOutlineBlock(block)) return null;
    const kind = block.kind;
    const matchText = truncateText(block.matchText || block.text || block.label || '', MAX_ANSWER_MATCH_TEXT);
    const identityText = truncateText(
      block.identityText || normalizeOutlineIdentityText(matchText),
      MAX_ANSWER_MATCH_TEXT,
    );
    const kindOrdinal = Number.isFinite(block.kindOrdinal) ? block.kindOrdinal : 0;
    const outlineOrdinal = Number.isFinite(block.outlineOrdinal)
      ? block.outlineOrdinal
      : Number.isFinite(block.outlineIndex)
        ? block.outlineIndex
        : 0;
    return {
      ...block,
      key: block.key || '',
      kind,
      outlineOrigin: normalizeText(block.outlineOrigin || ''),
      label: normalizeText(block.label || block.text || '回答章节'),
      text: normalizeText(block.text || block.label || '回答章节'),
      matchText,
      identityText,
      fingerprint: block.fingerprint || hashString(`${kind}:${identityText}`),
      prefixKey: block.prefixKey || outlinePrefixKey(matchText),
      suffixKey: block.suffixKey || outlineSuffixKey(matchText),
      locatorKey: block.locatorKey || `${kind}:${kindOrdinal}`,
      kindOrdinal,
      outlineOrdinal,
      marker: normalizeText(block.marker || ''),
      itemCount: Number.isFinite(block.itemCount) ? block.itemCount : 0,
      sectionTitle: normalizeText(block.sectionTitle || ''),
      outlineDepth: Number.isFinite(block.outlineDepth) ? block.outlineDepth : 0,
      parentOutlineOrdinal: Number.isFinite(block.parentOutlineOrdinal) ? block.parentOutlineOrdinal : -1,
      firstItem: truncateText(block.firstItem || '', 260),
      lastItem: truncateText(block.lastItem || '', 260),
      firstMarker: normalizeText(block.firstMarker || ''),
      lastMarker: normalizeText(block.lastMarker || ''),
      listSignature: block.listSignature || '',
      navigable: block.navigable !== false && kind !== 'prose-summary',
      summaryOnly: block.summaryOnly === true || kind === 'prose-summary',
      identityTokens: Array.from(new Set(Array.isArray(block.identityTokens) ? block.identityTokens.filter(Boolean) : [])),
      mappingConfidence: '',
      target: null,
      skeletonTarget: null,
    };
  }

  function cloneAnswerRecordForRuntime(answer) {
    if (!answer || typeof answer !== 'object') return null;
    return {
      ...answer,
      identityTokens: Array.from(new Set(Array.isArray(answer.identityTokens) ? answer.identityTokens.filter(Boolean) : [])),
      blocks: Array.isArray(answer.blocks) ? answer.blocks.map(cloneAnswerBlockForRuntime).filter(Boolean) : [],
      target: null,
      skeletonTarget: null,
    };
  }

  function mergeChatGptIndexWithRuntime(baseRecords, visibleDomEntries, nativeEntries = []) {
    const records = baseRecords.map((record, index) => ({
      ...record,
      key: record.key || `chatgpt-api-cache:${index}`,
      kind: record.kind || 'prompt',
      anchorRole: entryAnchorRole(record),
      identityTokens: Array.from(getEntryIdentityTokens(record)),
      orderHint: Number.isFinite(record.orderHint) ? record.orderHint : index,
      source: record.source || 'conversation-api',
      target: null,
      skeletonTarget: null,
      turnId: '',
      runtimeKey: '',
      nativeButton: null,
      nativeActive: false,
      nativeRawIndex: null,
      nativeMappedIndex: null,
      nativeMappingConfidence: '',
      mountedIndex: null,
      answerBlocks: Array.isArray(record.answerBlocks)
        ? record.answerBlocks.map(cloneAnswerBlockForRuntime).filter(Boolean)
        : [],
      answerRecords: Array.isArray(record.answerRecords)
        ? record.answerRecords.map(cloneAnswerRecordForRuntime).filter(Boolean)
        : [],
    }));

    mapMountedEntriesToRecords(records, visibleDomEntries);
    attachChatGptSkeleton(records, chatGptSkeleton);
    attachRenderedAnswerTargets(records);
    const nativeCalibration = mapNativeEntriesToRecords(records, nativeEntries, visibleDomEntries);
    records.nativeCalibration = nativeCalibration;
    return records;
  }

  function buildCacheRecord(entry) {
    const answerBlocks = (Array.isArray(entry.answerBlocks) ? entry.answerBlocks : [])
      .filter(isAnswerOutlineBlock)
      
      .map((block, index) => {
        const kind = block.kind;
        const matchText = truncateText(block.matchText || block.text || block.label || '', MAX_ANSWER_MATCH_TEXT);
        const identityText = truncateText(
          block.identityText || normalizeOutlineIdentityText(matchText),
          MAX_ANSWER_MATCH_TEXT,
        );
        const kindOrdinal = Number.isFinite(block.kindOrdinal) ? block.kindOrdinal : 0;
        const outlineOrdinal = Number.isFinite(block.outlineOrdinal)
          ? block.outlineOrdinal
          : Number.isFinite(block.outlineIndex)
            ? block.outlineIndex
            : index;
        return {
          key: block.key || `cached-answer:${entry.key}:${index}`,
          kind,
          outlineOrigin: normalizeText(block.outlineOrigin || ''),
          label: normalizeText(block.label || block.text || '回答章节'),
          text: normalizeText(block.text || block.label || '回答章节'),
          matchText,
          identityText,
          fingerprint: block.fingerprint || hashString(`${kind}:${identityText}`),
          prefixKey: block.prefixKey || outlinePrefixKey(matchText),
          suffixKey: block.suffixKey || outlineSuffixKey(matchText),
          locatorKey: block.locatorKey || `${kind}:${kindOrdinal}`,
          kindOrdinal,
          outlineOrdinal,
          marker: normalizeText(block.marker || ''),
          itemCount: Number.isFinite(block.itemCount) ? block.itemCount : 0,
          sectionTitle: normalizeText(block.sectionTitle || ''),
      outlineDepth: Number.isFinite(block.outlineDepth) ? block.outlineDepth : 0,
      parentOutlineOrdinal: Number.isFinite(block.parentOutlineOrdinal) ? block.parentOutlineOrdinal : -1,
          firstItem: truncateText(block.firstItem || '', 260),
          lastItem: truncateText(block.lastItem || '', 260),
          firstMarker: normalizeText(block.firstMarker || ''),
          lastMarker: normalizeText(block.lastMarker || ''),
          listSignature: block.listSignature || '',
          navigable: block.navigable !== false && kind !== 'prose-summary',
          summaryOnly: block.summaryOnly === true || kind === 'prose-summary',
          headingLevel: Number.isFinite(block.headingLevel) ? block.headingLevel : null,
          blockIndex: Number.isFinite(block.blockIndex) ? block.blockIndex : index,
          outlineIndex: Number.isFinite(block.outlineIndex) ? block.outlineIndex : outlineOrdinal,
          answerNodeId: block.answerNodeId || '',
          answerMessageId: block.answerMessageId || '',
          answerOrdinal: Number.isFinite(block.answerOrdinal) ? block.answerOrdinal : 0,
          parentKey: entry.key,
          identityTokens: Array.from(new Set(Array.isArray(block.identityTokens) ? block.identityTokens.filter(Boolean) : [])),
          source: block.source || 'cache-answer',
          turnId: block.turnId || '',
        };
      });

    const answerRecords = (Array.isArray(entry.answerRecords) ? entry.answerRecords : []).map((answer, index) => ({
      nodeId: answer.nodeId || '',
      messageId: answer.messageId || '',
      identityTokens: Array.from(new Set(Array.isArray(answer.identityTokens) ? answer.identityTokens.filter(Boolean) : [])),
      answerOrdinal: Number.isFinite(answer.answerOrdinal) ? answer.answerOrdinal : index,
      turnId: answer.turnId || '',
    }));

    return {
      ownerKey: entry.ownerKey || routeKey, ownerSchema: TD_INDEX_OWNER_SCHEMA,
      key: entry.key,
      kind: entry.kind || 'prompt',
      anchorRole: entryAnchorRole(entry),
      text: truncateText(entry.text, MAX_CACHED_TEXT),
      eventTitle: truncateText(entry.eventTitle || '', MAX_CACHED_TEXT),
      orderHint: Number.isFinite(entry.orderHint) ? entry.orderHint : null,
      source: entry.source || 'cache',
      nodeId: entry.nodeId || '',
      messageId: entry.messageId || '',
      triggerNodeId: entry.triggerNodeId || '',
      triggerMessageId: entry.triggerMessageId || '',
      identityTokens: Array.from(getEntryIdentityTokens(entry)),
      createTime: Number.isFinite(entry.createTime) ? entry.createTime : null,
      automationId: entry.automationId || '',
      automationTitle: truncateText(entry.automationTitle || '', 180),
      exchangeId: entry.exchangeId || entry.turnExchangeId || '',
      timelineSchema: TIMELINE_CACHE_SCHEMA,
      answerOutlineSchema: ANSWER_OUTLINE_CACHE_SCHEMA,
      answerBlocks,
      answerRecords,
      lastSeenAt: Date.now(),
    };
  }

  function getScrollMetrics(root = currentScrollRoot) {
    if (!root || root === document.documentElement || root === document.body || root === document.scrollingElement) {
      const scrolling = document.scrollingElement || document.documentElement;
      const top = window.scrollY || scrolling.scrollTop || 0;
      const height = Math.max(0, scrolling.scrollHeight - window.innerHeight);
      return { top, max: height, ratio: height > 0 ? top / height : 0 };
    }
    const max = Math.max(0, root.scrollHeight - root.clientHeight);
    return { top: root.scrollTop, max, ratio: max > 0 ? root.scrollTop / max : 0 };
  }

  function mergeMountedWithCache(scannedEntries) {
    if(!settings.rememberPrompts)return scannedEntries;
    const hasAddress=record=>Boolean(record?.nodeId||record?.messageId||
      tdNavRecordIds({...record,target:null}).length);
    // Discard only old, unaddressable DOM rows. API history and all saved
    // annotations/outbox records are separate and are never cleared here.
    const cached=cacheRecords.filter(r=>hasAddress(r)).map(record=>({...record,target:null,skeletonTarget:null,
      answerBlocks:record.answerOutlineSchema===ANSWER_OUTLINE_CACHE_SCHEMA?
        (record.answerBlocks||[]).map(cloneAnswerBlockForRuntime).filter(Boolean):[],
      answerRecords:record.answerOutlineSchema===ANSWER_OUTLINE_CACHE_SCHEMA?
        (record.answerRecords||[]).map(cloneAnswerRecordForRuntime).filter(Boolean):[]}));
    const sequence=[], seen=new Map();
    for(const row of cached){
      const key=`${entryAnchorRole(row)}:${tdNavRecordIds(row).join('|')}`;
      if(seen.has(key))continue;
      seen.set(key,row);sequence.push(row);
    }
    const find=row=>{
      const ids=tdNavRecordIds(row),role=entryAnchorRole(row);
      const hits=sequence.filter(r=>entryAnchorRole(r)===role&&ids.length&&tdNavRecordIds(r).some(id=>ids.includes(id)));
      return hits.length===1?hits[0]:null;
    };
    const matched=new Map();
    for(const fresh of scannedEntries){
      const prior=find(fresh);if(!prior)continue;
      const oldBlocks=prior.answerBlocks||[],newBlocks=fresh.answerBlocks||[];
      const oldSign=oldBlocks.map(tdNavBlockSignature),newSign=newBlocks.map(tdNavBlockSignature);
      const oldAnswerIds=(prior.answerRecords||[]).flatMap(tdNavRecordIds),freshAnswerIds=(fresh.answerRecords||[]).flatMap(tdNavRecordIds);
      const sameAnswer=freshAnswerIds.some(id=>oldAnswerIds.includes(id));
      let cursor=0;for(const key of oldSign)if(key===newSign[cursor])cursor++;
      const preserve=oldBlocks.length>newBlocks.length&&sameAnswer&&cursor===newSign.length;
      const key=prior.key;
      Object.assign(prior,fresh,{key,text:fresh.text||prior.text});
      if(preserve){
        prior.answerBlocks=oldBlocks.map(b=>({...b,parentKey:key}));
        // Retain complete cached chapters; runtime resolution always rematches
        // them within the exact current answer, not at a remembered pixel offset.
        prior.answerRecords=(fresh.answerRecords||[]).map(a=>({...a,blocks:prior.answerBlocks.filter(b=>b.answerOrdinal===a.answerOrdinal)}));
      }else prior.answerBlocks=newBlocks.map(b=>({...b,parentKey:key}));
      matched.set(fresh,prior);
    }
    for(let i=0;i<scannedEntries.length;i++){
      const row=scannedEntries[i];if(matched.has(row))continue;
      const next=scannedEntries.slice(i+1).map(r=>matched.get(r)||find(r)).find(Boolean);
      const at=next?sequence.indexOf(next):sequence.length;
      sequence.splice(Math.max(0,at),0,row);matched.set(row,row);
    }
    for(const row of sequence){
      for(const b of row.answerBlocks||[])b.parentKey=row.key;
      // Cache-only records keep addresses, never a DOM lease. Mounted rows above
      // keep their original elements for immediate navigation.
    }
    cacheRecords=sequence.filter(hasAddress).map(buildCacheRecord).slice(-MAX_CACHE_ITEMS);
    scheduleCacheWrite();
    return sequence.slice(-MAX_CACHE_ITEMS);
  }

  async function loadSettings() {
    settings = mergeSettings(DEFAULT_SETTINGS, await storage.get(SETTINGS_KEY, {}));
    if (!pilotActive) settings.enabled=false;
  }

  async function loadCache() {
    if(!settings.rememberPrompts){cacheRecords=[];return;}
    const scope=tdScope(),key=routeKey;
    let payload=await storage.get(cacheStorageKey(key),null);
    if(!tdAlive(scope))return;
    let legacy=false;
    if(!payload){legacy=true;payload=await storage.get(`${CACHE_PREFIX}${site.id}:${hashString(key)}`,null);}
    if(!tdAlive(scope))return;
    if(!payload||payload.routeKey!==key||!Array.isArray(payload.items)||
       (payload.updatedAt&&Date.now()-payload.updatedAt>30*86400000)){cacheRecords=[];return;}
    const liveIds=legacy?new Set(scanBySelectors(site).entries.flatMap(tdNavRecordIds)):null;
    cacheRecords=payload.items.filter(item=>item&&typeof item.key==='string'&&typeof item.text==='string'&&
      (legacy?((item.ownerKey===key&&item.ownerSchema===TD_INDEX_OWNER_SCHEMA)||tdNavRecordIds(item).some(id=>liveIds.has(id))):
        item.ownerKey===key&&item.ownerSchema===TD_INDEX_OWNER_SCHEMA)).slice(-MAX_CACHE_ITEMS)
      .map(item=>({...item,ownerKey:key,ownerSchema:TD_INDEX_OWNER_SCHEMA,
        answerBlocks:item.answerOutlineSchema===ANSWER_OUTLINE_CACHE_SCHEMA?item.answerBlocks||[]:[],
        answerRecords:item.answerOutlineSchema===ANSWER_OUTLINE_CACHE_SCHEMA?item.answerRecords||[]:[]}));
    if(legacy)tdRouteFence.quarantined=Math.max(0,payload.items.length-cacheRecords.length);
    if(legacy)tdLog('legacy-index-quarantined','only-current-mounted-identities-adopted');
  }

  function scheduleCacheWrite() {
    if (!settings.rememberPrompts || (!cacheRecords.length && chatGptApiStatus !== 'ready')) return;
    const scope = tdScope();
    window.clearTimeout(cacheWriteTimer);
    cacheWriteTimer = window.setTimeout(async () => {
      if (!tdAlive(scope)) return;
      if(tdSelectionBusy()){tdInteraction.dirtyCache=true;tdSelection.deferred=true;return;}
      const payload = {
        version: 3,
        timelineSchema: TIMELINE_CACHE_SCHEMA,
        answerOutlineSchema: ANSWER_OUTLINE_CACHE_SCHEMA,
        routeKey,
        updatedAt: Date.now(),
        items: tdOwnedIndex(cacheRecords).slice(-MAX_CACHE_ITEMS),
      };
      try { await storage.set(cacheStorageKey(scope.key), payload); }
      catch(error){if(tdAlive(scope))tdLog('index-cache-unavailable',error?.name);}
    }, 500);
  }

  async function clearCurrentCache() {
    cacheRecords = [];
    await storage.remove(cacheStorageKey());
    scheduleRefresh('clear-current-cache', 0);
  }

  async function clearAllCaches() {
    const keys = await storage.keys();
    await Promise.all(keys.filter((key) => key.startsWith(CACHE_PREFIX)).map((key) => storage.remove(key)));
    cacheRecords = [];
    scheduleRefresh('clear-all-cache', 0);
  }

  function findScrollableAncestor(element) {
  const root=tdNavScrollChain(element)[0];
  return root && !tdNavScrollInfo(root).doc ? root : null;
}

  function findScrollRoot() {
  const target=mountedEntries.find(entry=>entry.target?.isConnected)?.target ||
    tdDomRoleRoots('user')[0] || tdDomRoleRoots('assistant')[0] ||
    document.querySelector('[data-thread-user-message-navigation-content]') || getChatGptThreadRoot();
  return tdNavScrollRoot(target);
}

  function attachScrollRoot(nextRoot) {
    if (currentScrollRoot === nextRoot) return;
    const previous = currentScrollRoot;
    if (previous && previous !== document.scrollingElement && previous !== document.documentElement && previous !== document.body) {
      previous.removeEventListener('scroll', onScroll);
    }
    window.removeEventListener('scroll', onScroll);

    currentScrollRoot = nextRoot;
    if (!nextRoot || nextRoot === document.scrollingElement || nextRoot === document.documentElement || nextRoot === document.body) {
      window.addEventListener('scroll', onScroll, { passive: true });
    } else {
      nextRoot.addEventListener('scroll', onScroll, { passive: true });
    }
  }

  function setScrollRatio(root, ratio) {
    const value = Math.min(1, Math.max(0, ratio));
    if (!root || root === document.scrollingElement || root === document.documentElement || root === document.body) {
      const scrolling = document.scrollingElement || document.documentElement;
      const max = Math.max(0, scrolling.scrollHeight - window.innerHeight);
      window.scrollTo({ top: max * value, behavior: 'auto' });
      return;
    }
    const max = Math.max(0, root.scrollHeight - root.clientHeight);
    root.scrollTo({ top: max * value, behavior: 'auto' });
  }

  function isDocumentScrollRoot(root) {
    return !root || root === document.scrollingElement || root === document.documentElement || root === document.body;
  }

  function getRootScrollTop(root) {
    if (isDocumentScrollRoot(root)) return window.scrollY || (document.scrollingElement || document.documentElement).scrollTop || 0;
    return root.scrollTop;
  }

  function getRootScrollMax(root) {
    if (isDocumentScrollRoot(root)) {
      const scrolling = document.scrollingElement || document.documentElement;
      return Math.max(0, scrolling.scrollHeight - window.innerHeight);
    }
    return Math.max(0, root.scrollHeight - root.clientHeight);
  }

  function scrollRootTo(root, top, behavior = 'auto') {
    const value = Math.min(getRootScrollMax(root), Math.max(0, Number(top) || 0));
    const scrollBehavior = behavior === 'smooth' ? 'smooth' : 'auto';
    if (isDocumentScrollRoot(root)) window.scrollTo({ top: value, behavior: scrollBehavior });
    else root.scrollTo({ top: value, behavior: scrollBehavior });
  }

  function scrollRootBy(root, delta, behavior = 'auto') {
    scrollRootTo(root, getRootScrollTop(root) + delta, behavior);
  }

  async function waitForScrollSettled(root, token, timeout = NAVIGATION_SETTLE_TIMEOUT_MS) {
    const startedAt = Date.now();
    let previous = getRootScrollTop(root);
    let stableFrames = 0;
    while (Date.now() - startedAt < timeout) {
      if (token !== navigationToken) return false;
      await sleep(50);
      const current = getRootScrollTop(root);
      if (Math.abs(current - previous) <= 0.75) stableFrames += 1;
      else stableFrames = 0;
      previous = current;
      if (stableFrames >= 3) return true;
    }
    return token === navigationToken;
  }

  function getTargetScrollTop(target, root) {
    const targetRect = target.getBoundingClientRect();
    if (isDocumentScrollRoot(root)) {
      return getRootScrollTop(root) + targetRect.top - NAVIGATION_TOP_OFFSET_PX;
    }
    const rootRect = root.getBoundingClientRect();
    const localOffset = Math.min(NAVIGATION_TOP_OFFSET_PX, Math.max(24, rootRect.height * 0.12));
    return root.scrollTop + targetRect.top - rootRect.top - localOffset;
  }

  async function scrollTargetIntoView(target, token = navigationToken) {
    if (!(target instanceof Element) || !target.isConnected || token !== navigationToken) return false;
    const root = findScrollableAncestor(target) || currentScrollRoot || findScrollRoot();
    const behavior = settings.smoothScroll ? 'smooth' : 'auto';
    scrollRootTo(root, getTargetScrollTop(target, root), behavior);
    if (behavior === 'smooth') {
      // Some browsers schedule the first smooth-scroll frame with a short delay. Do not mistake that delay for "settled".
      await sleep(90);
      await waitForScrollSettled(root, token);
    }
    else await sleep(34);
    if (!(target instanceof Element) || !target.isConnected || token !== navigationToken) return false;

    // Smooth scrolling and sticky headers can leave a small residual offset. Correct it once without animation.
    const desiredTop = isDocumentScrollRoot(root)
      ? NAVIGATION_TOP_OFFSET_PX
      : root.getBoundingClientRect().top + Math.min(NAVIGATION_TOP_OFFSET_PX, Math.max(24, root.getBoundingClientRect().height * 0.12));
    const residual = target.getBoundingClientRect().top - desiredTop;
    if (Math.abs(residual) > 3) {
      scrollRootBy(root, residual, 'auto');
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      await sleep(40);
    }
    return target.isConnected && token === navigationToken;
  }

  function cssEscape(value) {
    if (typeof CSS !== 'undefined' && typeof CSS.escape === 'function') return CSS.escape(String(value));
    return String(value).replace(/[^a-zA-Z0-9_-]/g, (character) => `\\${character}`);
  }

  function findIdentityTarget(entry) {
    const ids = Array.from(getEntryIdentityTokens(entry)).filter((value) => value && !value.includes(':'));
    const attributes = ['data-message-id', 'data-turn-id', 'data-turn-id-container', 'data-node-id', 'data-id'];
    const conversationRoot = firstMatchingRoot(site.roots);
    const expectedRole = entryAnchorRole(entry);
    const anchorSelectors = expectedRole === 'assistant'
      ? (site.assistantAnchorSelectors || site.assistantSelectors || [])
      : site.anchorSelectors;
    for (const id of ids) {
      const escaped = cssEscape(id);
      const selectors = attributes.map((attribute) => `[${attribute}="${escaped}"]`);
      selectors.push(`#${escaped}`);
      for (const selector of selectors) {
        let node = null;
        try {
          node = document.querySelector(selector);
        } catch {
          node = null;
        }
        if (!(node instanceof Element) || !node.isConnected || isInsideComposer(node)) continue;
        if (conversationRoot instanceof Element && !conversationRoot.contains(node)) continue;
        if (node.closest('button, [role="button"], nav, aside, [role="navigation"]')) continue;
        const anchor = closestBySelectors(node, anchorSelectors);
        if (
          anchor instanceof Element &&
          anchor.isConnected &&
          !isInsideComposer(anchor) &&
          !isLikelySidebarElement(anchor)
        ) {
          const role = anchor.getAttribute('data-turn') || anchor.getAttribute('data-message-author-role') || '';
          if (role && role !== expectedRole) continue;
          return anchor;
        }
      }
    }
    return null;
  }

  function findMountedMatch(entry, index = -1) {
    if (!entry) return null;

    if (entry.target?.isConnected) {
      return mountedEntries.find((candidate) => candidate.target === entry.target) || {
        ...entry,
        target: entry.target,
        source: entry.source || 'runtime-target',
      };
    }

    if (entry.runtimeKey) {
      const runtime = mountedByKey.get(entry.runtimeKey);
      if (runtime?.target?.isConnected) return runtime;
    }

    const direct = mountedByKey.get(entry.key);
    if (direct?.target?.isConnected) return direct;

    const identityTarget = findIdentityTarget(entry);
    if (identityTarget) {
      const scanned = mountedEntries.find((candidate) => candidate.target === identityTarget);
      return scanned || {
        key: entry.runtimeKey || entry.key,
        text: entry.text,
        target: identityTarget,
        identityTokens: Array.from(getEntryIdentityTokens(entry)),
        source: 'identity-query',
      };
    }

    // The mounted-entry scanner indexes user turns only. Automation events anchor to
    // assistant output, so falling through to prompt-text matching could jump to an
    // unrelated manual question with similar wording.
    if (!isUserAnchoredEntry(entry)) return null;

    const exactCandidates = mountedEntries.filter(
      (candidate) => candidate.target?.isConnected && mountedEntryExactlyMatchesApi(candidate, entry),
    );
    if (exactCandidates.length === 1) return exactCandidates[0];

    const likelyCandidates = mountedEntries.filter(
      (candidate) => candidate.target?.isConnected && textsLikelyMatch(candidate.text, entry.text),
    );
    if (Number.isInteger(index) && index >= 0) {
      const mappedCandidates = likelyCandidates.filter((candidate) => findRecordIndexForMounted(entries, candidate) === index);
      if (mappedCandidates.length === 1) return mappedCandidates[0];
    }

    const fullIndexMatches = entries.filter((candidate) => textsLikelyMatch(candidate.text, entry.text));
    if (likelyCandidates.length === 1 && fullIndexMatches.length === 1) return likelyCandidates[0];
    return null;
  }

  function getMountedEntryRange() {
    const indexes = [];
    entries.forEach((entry, index) => {
      if (entry.target?.isConnected) indexes.push(index);
    });
    for (const mounted of mountedEntries) {
      if (!mounted.target?.isConnected) continue;
      const index = findRecordIndexForMounted(entries, mounted);
      if (index >= 0) indexes.push(index);
    }
    if (!indexes.length) return null;
    return { min: Math.min(...indexes), max: Math.max(...indexes) };
  }

  function getViewportEntryIndex() {
    const mounted = pickViewportMountedEntry(mountedEntries);
    return findRecordIndexForMounted(entries, mounted);
  }

  function getConversationLoadSignature(root) {
    const first = mountedEntries.find((entry) => entry.target?.isConnected);
    const last = [...mountedEntries].reverse().find((entry) => entry.target?.isConnected);
    const height = root && !isDocumentScrollRoot(root)
      ? root.scrollHeight
      : (document.scrollingElement || document.documentElement).scrollHeight;
    const firstId = Array.from(getEntryIdentityTokens(first))[0] || first?.text || '';
    const lastId = Array.from(getEntryIdentityTokens(last))[0] || last?.text || '';
    const range = getMountedEntryRange();
    return `${mountedEntries.length}:${height}:${hashString(firstId)}:${hashString(lastId)}:${range?.min ?? -1}:${range?.max ?? -1}`;
  }

  // v1.5: bounded, intention-driven history warming. A retained native turn may
  // be unmounted even when its data is already in memory. We warm ONLY selected
  // exact-ID turn containers through their existing visibility observer. We do
  // not disable virtualization globally, synthesize wheel events, or fetch/send
  // conversations via a private write endpoint.
  const tdHistory = {
    bridge: null, pending: null, timer: null, releaseTimer: null, uiTimer: null,
    statusEl: null, capture: null, sequence: 0, lastScroll: 0, gestureUntil: 0, ignoreScrollUntil: 0,
    openedAt: 0, warmed: 0, lastResult: '', preserveCancel: null,
  };
  const TD_HISTORY_WINDOW = 3;
  const TD_HISTORY_MAX_TURNS = 6;
  const TD_HISTORY_TTL_MS = 12000;

  function tdInstallHistoryBridge() {
    if(tdHistory.bridge)return;
    tdHistory.bridge={warm(){return false;},release(){},snapshot(){return {
      activeTurns:0,delivered:0,installed:true,mode:'native-observer-untouched'};}};
  }

  function tdHistoryPanelOpen() {
    const panel = shadowRoot?.querySelector('.preview-panel');
    return Boolean(settings.enabled && !navigatorEl?.hidden && panel &&
      getComputedStyle(panel).visibility !== 'hidden' && getComputedStyle(panel).pointerEvents !== 'none');
  }
  function tdHistoryStatus(text = '') {
    tdHistory.lastResult = text;
    if (!tdHistory.statusEl) return;
    tdHistory.statusEl.textContent = text; tdHistory.statusEl.hidden = !text;
  }
  function tdHistoryReset() {
    tdOutlineStopHistory();
    tdHistory.sequence++; clearTimeout(tdHistory.timer); clearTimeout(tdHistory.releaseTimer);
    tdHistory.timer = null; tdHistory.pending = null; tdHistory.gestureUntil = 0;
    tdHistory.ignoreScrollUntil = 0; tdHistory.preserveCancel?.(); tdHistory.preserveCancel = null;
    tdHistory.bridge?.release(); tdHistoryStatus('');
  }
  function tdHistoryKeepReadingPosition() {
    tdHistory.preserveCancel?.();
    const scope = tdScope(), epoch = userNavigationEpoch;
    const root = currentScrollRoot || findScrollRoot();
    const box = isDocumentScrollRoot(root) ? { top: 0, bottom: innerHeight } : root.getBoundingClientRect();
    const nodes = [...tdDomRoleRoots('user'), ...tdDomRoleRoots('assistant')].sort(compareDomOrder);
    const anchor = nodes.find(node => {
      if (!tdNavVisibleTarget(node)) return false;
      const r = node.getBoundingClientRect(); return r.top >= box.top && r.top < box.bottom - 30;
    }) || nodes.find(node => {
      if (!tdNavVisibleTarget(node)) return false;
      const r = node.getBoundingClientRect(); return r.top < box.top && r.bottom > box.top + 30;
    });
    if (!anchor) return;
    // Keep a retained wrapper rather than the inner message: the native
    // virtualizer may recycle the message between layout and observer delivery.
    const stableAnchor = anchor.closest('[data-turn-id-container]') || anchor;
    const top = stableAnchor.getBoundingClientRect().top;
    let raf = null, stopped = false, checks = 0;
    const end = () => { stopped = true; if (raf !== null) cancelAnimationFrame(raf); ro.disconnect(); clearTimeout(timer); };
    const check = () => {
      raf = null;
      if (stopped || !tdAlive(scope) || userNavigationEpoch !== epoch || tdNavigation.current || !stableAnchor.isConnected || checks++ > 12) { end(); return; }
      const delta = stableAnchor.getBoundingClientRect().top - top;
      if (Math.abs(delta) > 1) {
        const scale = !isDocumentScrollRoot(root) && root.offsetHeight ? root.getBoundingClientRect().height / root.offsetHeight : 1;
        scrollRootBy(root, delta / (scale || 1), 'auto');
      }
    };
    const ro = new ResizeObserver(() => { if (raf === null && !stopped) raf = requestAnimationFrame(check); });
    const thread = tdNavConversationRoot(); if (thread instanceof Element) ro.observe(thread);
    if (root instanceof Element) ro.observe(root);
    const timer = setTimeout(end, 1100);
    tdHistory.preserveCancel = end;
  }
  function tdHistoryEntryRecords(entry) {
    const seen = new Set();
    return [entry, ...(entry.answerRecords || [])].filter(record => {
      if (!record) return false;
      const key = `${record === entry ? entryAnchorRole(entry) : 'assistant'}:${tdNavRecordIds(record).join('|')}`;
      if (seen.has(key)) return false;
      seen.add(key); return true;
    });
  }
  function tdHistoryIntent() {
    if(!settings.prefetchHistoryOnOutline||!tdHistoryPanelOpen()||tdSelectionBusy())return;
    // Index preview is purely local. A speculative hover/scroll cannot invoke
    // host paging, synthetic visibility, scroll correction or a native button.
    tdHistoryStatus('本地目录已就绪；仅点击目标时尝试网页原生定位');
  }
  function tdInstallHistoryUi() {
    if (!listEl || tdHistory.statusEl) return;
    const status = document.createElement('div'); status.className = 'td-history-status'; status.hidden = true;
    status.setAttribute('role', 'status'); status.setAttribute('aria-live', 'polite');
    shadowRoot.querySelector('.preview-panel').appendChild(status); tdHistory.statusEl = status;
    const style = document.createElement('style'); style.textContent = '.td-history-status{font-size:11px;line-height:17px;color:var(--apr-faint);padding:6px 12px;border-top:1px solid var(--apr-panel-border);pointer-events:none}.preview-list{overflow-anchor:none}';
    shadowRoot.appendChild(style);
    const row = document.createElement('label'); row.className = 'setting-row';
    row.innerHTML = '<span class="setting-copy"><span class="setting-name">回溯大纲时显示定位状态</span><span class="setting-description">点击大纲中的目标时自动加载原文。</span></span><span class="switch"><input type="checkbox" name="prefetchHistoryOnOutline"><span class="switch-track"></span></span>';
    settingsFormEl.querySelector('[name="enableAnswerJump"]')?.closest('.setting-row')?.after(row);
    listEl.addEventListener('wheel', event => {
      if (event.ctrlKey || event.deltaY >= 0) return;
      tdHistoryIntent();
    }, { passive: true });
    listEl.addEventListener('pointerdown', () => { tdHistory.gestureUntil = Date.now() + 10000; tdHistory.lastScroll = listEl.scrollTop; }, { passive: true });
    let touchY = null;
    listEl.addEventListener('touchstart', e => { touchY = e.touches[0]?.clientY; tdHistory.lastScroll = listEl.scrollTop; }, { passive: true });
    listEl.addEventListener('touchmove', e => { const y = e.touches[0]?.clientY; if (touchY !== null && y > touchY + 3) tdHistoryIntent(); touchY = y; }, { passive: true });
    listEl.addEventListener('keydown', e => { if (['ArrowUp','PageUp','Home'].includes(e.key)) tdHistoryIntent(); });
    listEl.addEventListener('scroll', () => {
      const old = tdHistory.lastScroll, next = listEl.scrollTop; tdHistory.lastScroll = next;
      if (next < old - 2 && Date.now() > tdHistory.ignoreScrollUntil && Date.now() < tdHistory.gestureUntil) tdHistoryIntent();
    }, { passive: true });
    navigatorEl.addEventListener('pointerleave', () => {
      clearTimeout(tdHistory.releaseTimer);
      tdHistory.releaseTimer = setTimeout(() => {
        if (tdHistoryPanelOpen()) return;
        clearTimeout(tdHistory.timer); tdHistory.sequence++; tdHistory.bridge?.release('outline'); tdHistoryStatus('');
      }, 280);
    });
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) { tdHistoryReset(); return; }
      const scene = tdZoom.scene;
      if (scene?.topicState === 'connection' && settings.autoTopicSummary) scene.localCacheRead = false;
      if (scene?.progress >= .999) tdZoomScheduleSettled(scene);
      else if (!scene) tdZoomPrepare();
    });
  }

  // A click is explicit navigation, unlike speculative warming. If a rollout
  // discarded even the turn placeholders, bounded native history paging is
  // allowed here only. It never runs from a panel hover/scroll prefetch.
  async function tdNavLoadMissingHistory(req, record) {
    const located=tdNavResolve(req);if(located)return located;
    if(!tdNavAlive(req)||tdReadState().until>Date.now())return null;
    const capture = tdHistory.capture;
    const captured = tdNavRecordIds(record).map(id=>capture?.history.messages.get(id))
      .find(row=>row?.role === (req.block ? 'assistant' : entryAnchorRole(record)));
    const scrollRoot = capture?.history.root;
    if (captured && tdAlive(capture.scope) && scrollRoot?.isConnected) {
      const mounted = await tdNavMountCaptured(req,captured,scrollRoot);
      if (mounted || !tdNavAlive(req)) return mounted;
    }
    const now=Date.now();
    if(now-Number(tdHistory.lastExplicitLoad||0)<2000){req.method='history-load-budget';return null;}
    const index = req.overviewRecords || entries;
    const positionById = new Map();
    let sequence = 0;
    for (const entry of index) {
      for (const message of tdHistoryEntryRecords(entry)) {
        const role = message === entry ? entryAnchorRole(entry) : 'assistant';
        for (const id of tdNavRecordIds(message)) positionById.set(role+':'+id,sequence);
        sequence++;
      }
    }
    const role = req.block ? 'assistant' : entryAnchorRole(record);
    const wanted = tdNavRecordIds(record).map(id=>positionById.get(role+':'+id)).find(Number.isInteger);
    if (wanted === undefined) return null;
    const viewportRoot = tdZoom.scene?.viewportRoot;
    const root = viewportRoot?.isConnected ? viewportRoot : findScrollRoot();
    const view = tdNavClientBox(root);
    const middle = (view.top + view.bottom) / 2;
    let nearby = null;
    // 以阅读视口附近的已确认消息判断方向。离屏保留的同轮提问不代表该回答已挂载。
    for (const author of ['user','assistant']) {
      for (const node of tdDomRoleRoots(author)) {
        if (!tdNavVisibleTarget(node)) continue;
        const position = tdMessageAddress(node,author).identityTokens.map(id=>positionById.get(author+':'+id)).find(Number.isInteger);
        if (position === undefined || position === wanted) continue;
        const box = tdDomRect(node);
        const distance = Math.abs((box.top+box.bottom)/2-middle);
        if (!nearby || distance < nearby.distance) nearby = {position,distance};
      }
    }
    if (!nearby) return null;
    const direction = wanted < nearby.position ? 'up' : 'down';
    tdHistory.lastExplicitLoad = now;
    tdNavLockRoot(req,root);
    req.method = 'native-history-windows';
    req.paging = direction;
    showToast('正在加载目标原文…',6800);
    const initial = tdNavScrollInfo(root).top;
    const deadline = performance.now() + 6500;
    const thread = tdZoom.scene?.root || tdNavConversationRoot();
    let closest = Infinity, rebounds = 0, stableSince = 0, observedRange = -1, signaled = false;
    let result = null;
    try {
      while (tdNavAlive(req) && root.isConnected && !document.hidden && performance.now() < deadline) {
        const info = tdNavScrollInfo(root);
        const boundary = direction === 'up' ? info.min : info.max;
        const remaining = boundary - info.top;
        const distance = Math.abs(remaining);
        if (distance > 3) {
          stableSince = 0;
          if (distance < closest - 4) { closest = distance; rebounds = 0; }
          else rebounds++;
          const recovered = rebounds >= 2;
          if (!signaled || recovered) {
            tdSignalHostReadingScroll(root,remaining);
            signaled = true;
          }
          if (recovered) { closest = Infinity; rebounds = 0; }
          const stride = Math.max(80,info.height * .74);
          // 保留与当前阅读窗口的重叠，逐段触发 ChatGPT 自己的虚拟列表挂载。
          tdNavWriteScroll(req,root,recovered ? boundary : info.top + Math.sign(remaining)*Math.min(distance,stride));
        } else {
          const busy = direction === 'up' && tdZoomEarlierMessagesPending(thread);
          if (!stableSince || busy || observedRange !== info.range) stableSince = performance.now();
          observedRange = info.range;
          if (!busy && performance.now() - stableSince > 1100) break;
        }
        result = await tdNavWait(req,()=>tdNavResolve(req),210);
        if (result) return result;
      }
      return null;
    } finally {
      if (!result && tdNavAlive(req) && root.isConnected && !document.hidden) tdNavWriteScroll(req,root,initial);
    }
  }


  // v1.5: authoritative history + a route-local live tail. A successful GET is a
  // snapshot, not a live subscription. DOM mutations must be allowed to add new
  // user turns and grow the current answer before the next server reconciliation.
  const tdLive = {
    extra: new Map(), patches: new Map(), domCache: new WeakMap(), retiredIds: new Set(),
    revision: 0, parses: 0, syncs: 0, apiStartedAt: 0, apiAgain: false, pendingShells: new Map(), seenShells: new Set(),
    settleTimer: null, watchdog: null, unknownAnswers: new Set(), watchUntil: 0, lastPulse: '', lastMutationAt: 0,
  };
  const TD_LIVE_API_MIN_INTERVAL_MS = 2600;
  const TD_LIVE_DOM_REFRESH_MS = 360;
  const TD_LIVE_MAX_EXTRA = 128;

  function tdLiveReset() {
    tdHistoryReset();
    tdLive.retiredIds = new Set(mountedEntries.flatMap(tdLiveIds));
    tdLive.extra.clear(); tdLive.patches.clear(); tdLive.unknownAnswers.clear(); tdLive.pendingShells.clear(); tdLive.seenShells.clear(); tdLive.domCache = new WeakMap();
    tdLive.revision = 0; tdLive.apiStartedAt = 0; tdLive.apiAgain = false;
    clearTimeout(tdLive.settleTimer); clearTimeout(tdLive.watchdog);
    tdLive.settleTimer = null; tdLive.watchdog = null; tdLive.watchUntil = 0; tdLive.lastPulse = '';
  }
  function tdLiveDomIdentity(node, role) {
    return tdMessageAddress(node, role);
  }
  function tdLiveIds(record) {
    const explicit = [record?.nodeId, record?.messageId].filter(Boolean);
    if (explicit.length) return [...new Set(explicit)];
    if (record?.target?.isConnected) {
      const identity = tdLiveDomIdentity(record.target, entryAnchorRole(record));
      if (identity.identityTokens.length) return identity.identityTokens;
    }
    return [...getEntryIdentityTokens(record)].filter(id => !id.includes(':') && id !== 'thread' && id !== 'main');
  }
  function tdLiveSame(a, b) {
    const ids = tdLiveIds(a), others = tdLiveIds(b);
    return ids.some(id => others.includes(id));
  }
  function tdLiveMigrateKey(oldKey, newKey) {
    if (!oldKey || oldKey === newKey) return;
    if (expandedPromptKeys.delete(oldKey)) expandedPromptKeys.add(newKey);
    if (tdNavigation.current?.entryKey === oldKey) tdNavigation.current.entryKey = newKey;
    for (const patch of tdLive.patches.values()) if (patch.entryKey === oldKey) patch.entryKey = newKey;
    for (const item of tdLive.extra.values()) {
      if (item.beforeKey === oldKey) item.beforeKey = newKey;
    }
  }
  function tdLiveReconcileApi(records) {
    const ids = new Set(records.flatMap(tdLiveIds));
    for (const id of ids) tdLive.retiredIds.delete(id);
    const answerIds = new Set(records.flatMap(record => (record.answerRecords || []).flatMap(tdLiveIds)));
    for (const id of answerIds) tdLive.unknownAnswers.delete(id);
    for (const [key, value] of tdLive.extra) {
      const actual = value.target?.isConnected ? tdLiveDomIdentity(value.target, 'user') : null;
      const clientIdentity = tdLiveIds(value).some(id => /^(?:client-created-|client-|temp-)/.test(id));
      const match = records.find(record => isUserAnchoredEntry(record) && (tdLiveSame(record, value) ||
        (clientIdentity && actual && tdLiveSame(record, actual) && normalizeText(record.text) === normalizeText(value.text))));
      if (!match) continue;
      tdLiveMigrateKey(key, match.key); tdLive.extra.delete(key);
    }
    for (const [key, patch] of tdLive.patches) {
      const event = records.find(e => e.key === patch.entryKey || tdLiveSame(e, patch.owner));
      if (!event) continue;
      const answer = (event.answerRecords || []).find(a => tdLiveSame(a, patch.answer));
      if (!answer) continue;
      const actual = (event.answerBlocks || []).filter(b => b.answerOrdinal === answer.answerOrdinal).map(tdNavBlockSignature);
      const expected = patch.blocks.map(tdNavBlockSignature);
      // A stale server snapshot must not shrink the live answer. Drop the overlay
      // only when every observed authored heading has been acknowledged in order.
      let cursor = 0; for (const key of actual) if (key === expected[cursor]) cursor++;
      if (answer.completed && (expected.length ? cursor === expected.length : patch.answer.completed && actual.length === 0)) tdLive.patches.delete(key);
    }
    tdLive.syncs++;
  }

  function tdLiveIndex(baseRecords, visible) {
    const records = [...baseRecords];
    // Retain unacknowledged turns across virtualization while the GET catches up.
    for (const value of tdLive.extra.values()) {
      if (records.some(record => tdLiveSame(record, value))) continue;
      const next = value.beforeKey ? records.findIndex(record => record.key === value.beforeKey) : -1;
      records.splice(next >= 0 ? next : records.length, 0, value);
    }
    let additions = 0;
    for (let i = 0; i < visible.length; i++) {
      const mounted = visible[i], identity = tdLiveDomIdentity(mounted.target, 'user');
      if (!tdNavVisibleTarget(mounted.target) || mounted.target.closest('[data-author-type="automation"],[data-real-author-type="automation"]')) continue;
      if (identity.identityTokens.some(id => tdLive.retiredIds.has(id))) continue;
      const own = { ...mounted, ...identity };
      if (!identity.identityTokens.length) continue; // No invented identity / duplicate "continue" matching.
      const known = records.find(record => isUserAnchoredEntry(record) && tdLiveSame(record, own));
      if (known) continue;
      // An optimistic client-created wrapper may acquire the server message ID.
      // Reconcile only the SAME connected message node, never global equal text.
      const remapped = [...tdLive.extra.values()].find(record => record.target === mounted.target && record.target?.isConnected);
      if (remapped) {
        Object.assign(remapped, identity, { text: mounted.text });
        continue;
      }
      // 虚拟列表中前一条可见提问与新提问之间可能还有未挂载的轮次。
      const following = visible.slice(i + 1).map(row => records.find(e => tdLiveSame(e, row))).find(Boolean);
      const record = { ...own, key: `live:${identity.messageId || identity.nodeId}`, kind: 'prompt', anchorRole: 'user',
        source: 'live-dom', answerBlocks: [], answerRecords: [], beforeKey: following?.key || '',
        observedAt: Date.now(), liveRevision: ++tdLive.revision };
      records.splice(following ? records.indexOf(following) : records.length, 0, record);
      tdLive.extra.set(record.key, record); additions++;
    }
    if (additions) {
      while (tdLive.extra.size > TD_LIVE_MAX_EXTRA) tdLive.extra.delete(tdLive.extra.keys().next().value);
      scheduleChatGptApiRefresh('live-user', 650); tdLiveWatch();
      tdLog('live-index-add', String(additions));
    }
    return records;
  }

  // A new turn can arrive outside the reader's viewport with only an empty
  // native placeholder. Do not force-mount it or infer its text/role by parity;
  // request a bounded metadata reconciliation instead. Historical page-in before
  // the last known event does NOT trigger these extra reads.
  function tdLiveDetectPendingShells(records, skeleton) {
    if (!records.length || !skeleton?.realTurns?.length) return;
    const known = new Set(records.flatMap(e => [...tdLiveIds(e), ...(e.answerRecords || []).flatMap(tdLiveIds)]));
    const turns = skeleton.realTurns, present = new Set(turns.map(t => t.turnId));
    const now = Date.now();
    for (const [id, item] of tdLive.pendingShells) {
      if (known.has(id) || !present.has(id) || now - item.seenAt > 12000) tdLive.pendingShells.delete(id);
    }
    let lastKnown = -1;
    for (let i = 0; i < turns.length; i++) if (known.has(turns[i].turnId)) lastKnown = i;
    if (lastKnown < 0) return;
    let request = false;
    for (const turn of turns.slice(lastKnown + 1, lastKnown + 17)) {
      const id = turn.turnId;
      if (!id || known.has(id) || tdLive.retiredIds.has(id)) continue;
      let item = tdLive.pendingShells.get(id);
      if (!item) {
        if (tdLive.seenShells.has(id)) continue;
        tdLive.seenShells.add(id);
        item = { seenAt: now, sync: tdLive.syncs, reads: 1 }; tdLive.pendingShells.set(id, item); request = true;
      } else if (item.sync !== tdLive.syncs && item.reads < 4 && now - item.seenAt < 10000) {
        item.sync = tdLive.syncs; item.reads++; request = true;
      }
    }
    while (tdLive.pendingShells.size > 32) tdLive.pendingShells.delete(tdLive.pendingShells.keys().next().value);
    while (tdLive.seenShells.size > 256) tdLive.seenShells.delete(tdLive.seenShells.values().next().value);
    if (request) { scheduleChatGptApiRefresh('new-unmounted-turn', 650); tdLiveWatch(); }
  }

  function tdLiveComplete(section) {
    return Boolean(section?.matches('[data-status="finished_successfully"],[data-status="complete"],[data-state="complete"],[data-state="completed"]') ||
      section?.querySelector('[data-testid="copy-turn-action-button"],[data-testid="good-response-turn-action-button"],[data-testid="bad-response-turn-action-button"]'));
  }
  function tdMergeLiveOutline(existing, rendered) {
    if (!existing.length) return rendered;
    if (!rendered.length) return existing;
    const matches = tdNavMatchOutline(existing, rendered);
    const canonical = new Map([...matches].map(([old, match]) => [match.block, old]));
    const existingPaths = tdNavParentPaths(existing);
    const renderedPaths = tdNavParentPaths(rendered);
    const known = new Set(existing.map(block => tdNavBlockSignature(block) + existingPaths.get(block)));
    const ordered = rendered.flatMap(block => {
      if (canonical.has(block)) return [canonical.get(block)];
      return known.has(tdNavBlockSignature(block) + renderedPaths.get(block)) ? [] : [block];
    });
    const merged = tdMergeObservedOrder(existing,ordered);
    const domByOrdinal = new Map(rendered.map(block => [block.outlineOrdinal, block]));
    const apiByOrdinal = new Map(existing.map(block => [block.outlineOrdinal, block]));
    const positions = new Map(merged.map((block, index) => [block, index]));
    return merged.map((block, index) => {
      const match = matches.get(block)?.block;
      const authored = match || block;
      const parents = match || domByOrdinal.get(block.outlineOrdinal) === block ? domByOrdinal : apiByOrdinal;
      const parent = parents.get(authored.parentOutlineOrdinal);
      return {...block, target:match?.target || block.target, outlineOrdinal:index,
        parentOutlineOrdinal:positions.get(canonical.get(parent) || parent) ?? -1};
    });
  }

  function tdLiveApplyAnswers(records) {
    const anchors = scanAssistantAnchors(site), selected = new Map();
    const mountedPrompts = records.filter(e => isUserAnchoredEntry(e) && e.target?.isConnected).sort((a,b) => compareDomOrder(a.target,b.target));
    let cursor = 0, previous = null;
    for (const section of anchors) {
      if (!findAssistantOutlineRoots(section).length) continue;
      const identity = tdLiveDomIdentity(section, 'assistant');
      if (!identity.identityTokens.length) continue;
      while (cursor < mountedPrompts.length && compareDomOrder(mountedPrompts[cursor].target, section) < 0) previous = mountedPrompts[cursor++];
      const exact = records.find(e => (e.answerRecords || []).some(a => tdLiveSame(a, identity)) || (isAutomationTimelineEntry(e) && tdLiveSame(e, identity)));
      const owner = exact || previous;
      if (!owner) continue;
      if (!exact && (owner.answerRecords || []).some(answer => tdNavFindTurn(answer, 'assistant'))) {
        // A scheduled output may have no visible user trigger. Do not glue a
        // second unrelated final answer onto the previous manual question.
        const key = identity.messageId || identity.nodeId;
        if (!tdLive.unknownAnswers.has(key)) {
          tdLive.unknownAnswers.add(key); scheduleChatGptApiRefresh('unmapped-assistant', 500);
          if (tdLive.unknownAnswers.size > 64) tdLive.unknownAnswers.delete(tdLive.unknownAnswers.values().next().value);
        }
        continue;
      }
      // Only a final visible content root, not tool/reasoning/intermediate traces,
      // may become this event's live answer. Known answer IDs beat proximity.
      if (isReasoningOrCollapsedOutlineContext(section)) continue;
      selected.set(identity.messageId || identity.nodeId, { owner, section, identity });
    }
    for (const { owner, section, identity } of selected.values()) {
      const roots = findAssistantOutlineRoots(section);
      const text = roots.map(root => root.textContent || '').join('\n');
      const fingerprint = hashString(text), completed = tdLiveComplete(section);
      const old = tdLive.domCache.get(section);
      const changed = old && old.fingerprint !== fingerprint;
      const previousAnswer = (owner.answerRecords || []).find(answer => tdLiveSame(answer, identity));
      const apiHasCompleteRaw = Boolean(previousAnswer?.rawText && previousAnswer?.completed !== false);
      const liveOwner = tdLive.extra.has(owner.key) || owner.source === 'live-dom';
      const alreadyManaged = tdLive.patches.has(identity.messageId || identity.nodeId);
      const busyHere = Boolean(section.matches('[data-status="in_progress"],[data-state="streaming"],[aria-busy="true"]') ||
        section.querySelector('[data-status="in_progress"],[data-state="streaming"],[aria-busy="true"],.result-streaming'));
      if (old?.fingerprint === fingerprint && old.completed === completed &&
          old.previousRaw === previousAnswer?.rawText && !changed) continue;
      tdLive.domCache.set(section, { fingerprint, completed, identity, previousRaw:previousAnswer?.rawText });
      if (!text.trim()) continue;
      const parsed = collectRenderedAnswerBlocks(section); tdLive.parses++;
      const previousBlocks = previousAnswer ? (owner.answerBlocks || []).filter(b => b.answerOrdinal === previousAnswer.answerOrdinal) : [];
      const priorPatch = tdLive.patches.get(identity.messageId || identity.nodeId);
      const keep = apiHasCompleteRaw || Boolean(previousAnswer && !liveOwner && !busyHere);
      const baseline = keep ? previousBlocks : [];
      const observed = tdMergeLiveOutline(baseline, parsed);
      // 把已读到的历史章节保留到网页重新挂载后，默认按消息和标题位置拼接。
      const completeBlocks = keep && priorPatch?.blocks.length > observed.length ?
        tdMergeLiveOutline(priorPatch.blocks, observed) : observed;
      if (keep && !alreadyManaged && completeBlocks.length === previousBlocks.length &&
          completeBlocks.every((block, i) => tdNavBlockSignature(block) === tdNavBlockSignature(previousBlocks[i]))) continue;
      const revision = ++tdLive.revision;
      const visibleRawText = roots.map(root => root.innerText || '').filter(Boolean).join('\n\n');
      const answer = { ...previousAnswer, ...identity,
        answerOrdinal: previousAnswer?.answerOrdinal ?? (owner.answerRecords || []).length,
        completed: previousAnswer?.completed || completed, target: section,
        outlineSchema: ANSWER_OUTLINE_CACHE_SCHEMA, rawText: previousAnswer?.rawText || '',
        visibleRawText, blocks: completeBlocks };
      const patch = { entryKey: owner.key, owner: { nodeId: owner.nodeId, messageId: owner.messageId, identityTokens: tdLiveIds(owner) },
        answer, blocks: completeBlocks, fingerprint, textLength: text.length, revision, changedAt: Date.now() };
      tdLive.patches.set(identity.messageId || identity.nodeId, patch);
      if (completed && (!old || !old.completed)) scheduleChatGptApiRefresh('live-final', 350);
      else tdLiveSettle();
    }
    for (const patch of tdLive.patches.values()) {
      const owner = records.find(e => e.key === patch.entryKey || tdLiveSame(e, patch.owner));
      if (!owner) continue;
      const ordinal = patch.answer.answerOrdinal || 0;
      const blocks = patch.blocks.map((b, i) => ({ ...b, answerOrdinal: ordinal, answerNodeId: patch.answer.nodeId,
        answerMessageId: patch.answer.messageId, parentKey: owner.key,
        key: `strict-answer:${owner.key}:${ordinal}:${b.outlineOrdinal}:${b.fingerprint}`,
        outlineIndex: i, blockIndex: i }));
      const answer = {...patch.answer, blocks, outlineSchema: ANSWER_OUTLINE_CACHE_SCHEMA};
      const others = (owner.answerRecords || []).filter(record => !tdLiveSame(record, answer));
      if (others.some(record => record.answerOrdinal === ordinal)) continue;
      owner.answerRecords = [...others, answer].sort((a, b) => a.answerOrdinal - b.answerOrdinal);
      owner.answerBlocks = (owner.answerBlocks || []).filter(block => block.answerOrdinal !== ordinal)
        .concat(blocks).sort((a, b) => a.answerOrdinal - b.answerOrdinal)
        .map((block, index) => ({...block, outlineIndex:index,blockIndex:index}));
      const extra = tdLive.extra.get(owner.key);
      if (extra) { extra.answerBlocks = owner.answerBlocks; extra.answerRecords = owner.answerRecords; }
    }
    while (tdLive.patches.size > 128) tdLive.patches.delete(tdLive.patches.keys().next().value);
  }
  function tdLiveSettle() {
    if(tdDeferInteraction('tdLiveSettle'))return;
    clearTimeout(tdLive.settleTimer); const scope = tdScope();
    tdLive.settleTimer = setTimeout(() => {
      tdLive.settleTimer = null;
      if (!tdAlive(scope) || !settings.enabled) return;
      scheduleRefresh('live-settled', 0);
      // A paused reasoning stream is not a completion signal. Reconcile after a
      // quiet DOM interval only; this does not release the sending state machine.
      if (!findChatGptStopControl() && (tdLive.extra.size || tdLive.patches.size || tdLive.unknownAnswers.size || tdLive.pendingShells.size)) {
        scheduleChatGptApiRefresh('live-settled', 400);
      }
    }, 950);
  }
  function tdLiveWatch() {
    tdLive.watchUntil = Date.now() + 30000;
    if (tdLive.watchdog !== null) return;
    const scope = tdScope();
    const pulse = () => {
      tdLive.watchdog = null;
      if (!tdAlive(scope) || !settings.enabled || !isCurrentPageEligible()) return;
      if (!document.hidden && !tdSelectionBusy()) {
        const user = tdLocalUserSnapshot(), final = tdFinalSnapshot();
        const key = `${user.key}:${final.signature}:${final.completed}`;
        if (key !== tdLive.lastPulse) { tdLive.lastPulse = key; scheduleRefresh('live-watchdog', 0); }
      }
      if (Date.now() < tdLive.watchUntil || td.run || chatGptNetworkTokens.size) tdLive.watchdog = setTimeout(pulse, document.hidden ? 5000 : 1500);
    };
    tdLive.watchdog = setTimeout(pulse, 1500);
  }
  function tdLiveNetworkFinal() {
    if (!settings.enabled || !isCurrentPageEligible()) return;
    scheduleRefresh('live-network-final', 0); scheduleChatGptApiRefresh('live-network-final', 450); tdLiveWatch();
  }

  function tdReconcileOutlineChildren(parent, fragment, selector) {
    const old = new Map([...parent.children].map(node => [node.getAttribute(selector), node]));
    let cursor = parent.firstChild;
    for (const fresh of [...fragment.children]) {
      const key = fresh.getAttribute(selector), previous = key ? old.get(key) : null;
      const node = previous && previous.isEqualNode(fresh) ? previous : fresh;
      if (node !== cursor) parent.insertBefore(node, cursor);
      else cursor = cursor.nextSibling;
      if (node === fresh && previous?.parentNode === parent && previous !== fresh) {
        if (cursor === previous) cursor = previous.nextSibling;
        previous.remove();
      }
      if (key) old.delete(key);
    }
    for (const node of old.values()) if (node.parentNode === parent) node.remove();
  }

  // v1.4 navigation is independent of outline extraction and queue dispatch.
  // Every destination is an address (route + message identity + outline path),
  // never a cached screen coordinate, a list percentage or an unverified index.
  const tdNavigation = { current: null, last: null, sequence: 0, parses: 0 };
  const TD_NAV_MOUNT_MS = 4200;
  const TD_NAV_GUARD_MS = 1500;

  function tdNavTitle(block) {
    return TDAnswerOutline.clean(block?.sectionTitle || block?.label || block?.text || '')
      .normalize('NFKC').replace(/[\u200B-\u200D\uFEFF]/g, '').replace(/\s+/g, ' ').trim();
  }
  function tdNavBlockSignature(block) {
    return JSON.stringify([block?.kind || '', tdNavTitle(block), block?.headingLevel || 0,
      normalizeText(block?.marker || '').normalize('NFKC')]);
  }
  function tdNavParentPaths(blocks) {
    const byOrdinal = new Map(blocks.map((b, i) => [Number.isFinite(b.outlineOrdinal) ? b.outlineOrdinal : i, b]));
    const memo = new Map();
    const pathFor = (block, seen = new Set()) => {
      if (memo.has(block)) return memo.get(block);
      const ordinal = block?.parentOutlineOrdinal, parent = byOrdinal.get(ordinal);
      if (!Number.isFinite(ordinal) || ordinal < 0 || !parent || seen.has(parent)) return [];
      const next = new Set(seen); next.add(parent);
      const path = [...pathFor(parent, next), tdNavBlockSignature(parent)]; memo.set(block, path); return path;
    };
    return new Map(blocks.map((b) => [b, JSON.stringify(pathFor(b))]));
  }
  function tdNavParentPath(block, blocks) { return tdNavParentPaths(blocks).get(block) || '[]'; }

  function tdNavMatchOutline(apiBlocks, domBlocks) {
    const api = apiBlocks.filter(isAnswerOutlineBlock);
    const dom = domBlocks.filter((b) => isAnswerOutlineBlock(b) && b.target?.isConnected);
    const matches = new Map(); const used = new Set();
    const aKeys = api.map(tdNavBlockSignature), dKeys = dom.map(tdNavBlockSignature);
    const assign = (ai, di, confidence) => {
      if (matches.has(api[ai]) || used.has(di) || aKeys[ai] !== dKeys[di]) return false;
      matches.set(api[ai], { block: dom[di], index: di, confidence }); used.add(di); return true;
    };
    // Identical complete sequences can disambiguate repeated headings by occurrence.
    // Equal counts alone are NEVER sufficient evidence.
    if (api.length && api.length === dom.length && aKeys.every((key, i) => key === dKeys[i])) {
      api.forEach((_, i) => assign(i, i, 'exact-sequence')); return matches;
    }
    const groups = (keys) => {
      const map = new Map(); keys.forEach((key, i) => { if (!map.has(key)) map.set(key, []); map.get(key).push(i); }); return map;
    };
    const ag = groups(aKeys), dg = groups(dKeys);
    for (const [key, ai] of ag) {
      const di = dg.get(key);
      if (ai.length === 1 && di?.length === 1) assign(ai[0], di[0], 'unique-exact-title');
    }
    // Duplicate titles in different chapters need their authored ancestor path.
    const ap = tdNavParentPaths(api), dp = tdNavParentPaths(dom);
    const ac = groups(api.map((b, i) => `${ap.get(b)}|${aKeys[i]}`));
    const dc = groups(dom.map((b, i) => `${dp.get(b)}|${dKeys[i]}`));
    for (const [key, ai] of ac) {
      const di = dc.get(key);
      if (!key.startsWith('[]|') && ai.length === 1 && di?.length === 1) assign(ai[0], di[0], 'exact-chapter-path');
    }
    // Fill only identical, bounded subsequences between verified anchors. This
    // handles partial DOMs without confusing the second "Summary" with the first.
    const anchors = [...matches.entries()].map(([b, m]) => ({ a: api.indexOf(b), d: m.index })).sort((x, y) => x.a - y.a);
    if (anchors.every((x, i) => !i || x.d > anchors[i - 1].d)) {
      const bounds = [{ a: -1, d: -1 }, ...anchors, { a: api.length, d: dom.length }];
      for (let i = 1; i < bounds.length; i++) {
        const l = bounds[i - 1], r = bounds[i], count = r.a - l.a - 1;
        if (!count || count !== r.d - l.d - 1) continue;
        let equal = true;
        for (let n = 1; n <= count; n++) if (aKeys[l.a + n] !== dKeys[l.d + n]) { equal = false; break; }
        if (equal) for (let n = 1; n <= count; n++) assign(l.a + n, l.d + n, 'anchored-exact-sequence');
      }
    }
    return matches;
  }

  function tdNavRecordIds(record) {
    const primary=[record?.nodeId,record?.messageId,record?.answerNodeId,record?.answerMessageId].filter(Boolean);
    if(primary.length)return [...new Set(primary)];
    if(record?.target?.isConnected){
      const native=tdMessageAddress(record.target,entryAnchorRole(record));
      if(native.identityTokens.length)return native.identityTokens;
    }
    // Old fallback caches may contain arbitrary DOM ancestor IDs. They are not
    // valid message addresses. Do not use "id:thread" or generic layout IDs.
    return [...new Set([record?.turnId,...(record?.identityTokens||[])].filter(id=>
      typeof id==='string'&&/^(?:[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}|(?:client-created-|message-|turn-)[A-Za-z0-9_-]{8,})$/i.test(id)))];
  }
  function tdNavIdentityOn(node) {
    if(!(node instanceof Element))return [];
    return tdDomIds(node);
  }
  function tdNavConversationRoot() { return getChatGptThreadRoot() || firstMatchingRoot(site.roots) || document.body; }
  function tdNavInConversation(node) {
    const root = tdNavConversationRoot();
    return node instanceof Element && node.isConnected && tdRouteAllows(node) && tdDomContains(root,node) && !isInsideComposer(node) &&
      !tdDomClosest(node,'button,[role="button"],nav,aside,[role="navigation"],#threaddeck-host,#prompt-rail-host');
  }
  function tdNavVisibleTarget(node) {
    if (!tdNavInConversation(node) || tdDomClosest(node,'[hidden],[aria-hidden="true"],details:not([open])')) return false;
    const rect = tdDomRect(node);
    if (rect.width <= 0 || rect.height <= 0) return false;
    const style = getComputedStyle(node);
    return style.display !== 'none' && style.visibility !== 'hidden';
  }
  function tdNavRoleNode(node, role, ids) {
    if (!tdNavInConversation(node)) return null;
    const direct = tdDomMessageFromNode(node, role, ids);
    if (direct) return direct;
    const candidates = safeQueryAll(node, tdDomRoleSelector(role)).map(n => tdDomMessageFromNode(n, role, ids)).filter(Boolean);
    const unique = [...new Set(candidates)].filter(n => !candidates.some(o => o !== n && o.contains(n)));
    return unique.length === 1 ? unique[0] : null;
  }

  function tdNavFindTurn(record, role) {
    if (!record) return null;
    const ids = tdNavRecordIds(record);
    const exact = tdDomFindExact(ids, role);
    if (exact && tdNavVisibleTarget(exact)) return exact;
    // A cached Element is usable only with a fresh identity proof (or for a
    // DOM-only record, a complete, unique user-text match). React may recycle it.
    if (!ids.length && role === 'user' && record.target?.isConnected) {
      const peers = entries.filter((e) => normalizeText(e.text) === normalizeText(record.text));
      const text = tdNavPlainUserText(record.target);
      if (peers.length === 1 && text === normalizeText(record.text) && tdNavVisibleTarget(record.target)) return record.target;
    }
    return null;
  }
  function tdNavPlainUserText(node) {
    const bubble = node.querySelector('message-content,.whitespace-pre-wrap,.user-message-bubble-color,[data-message-author-role="user"]') || node;
    return normalizeText(bubble.innerText || bubble.textContent || '');
  }
  function tdNavFindSkeleton(record) {
    const ids = tdNavRecordIds(record), root = tdNavConversationRoot();
    for (const id of ids) {
      for (const node of tdDomQueryAll(root, `[data-turn-id-container="${cssEscape(id)}"]`)) {
        if (tdNavInConversation(node) && node.getBoundingClientRect().height > 0) return node;
      }
    }
    return null;
  }

  function tdNavLiveEntry(req) {
    if (!tdAlive(req.scope)) return null;
    const entry = req.overviewEntry || entries.find((e) => e.key === req.entryKey);
    if (!entry) return null;
    const ids = tdNavRecordIds(entry);
    if (req.entryIds.length && !req.entryIds.some((id) => ids.includes(id))) return null;
    return entry;
  }
  function tdNavLiveBlock(req, entry) {
    if (!entry || !req.block) return null;
    const answerBlocks = (entry.answerBlocks || []).filter((b) => {
      if (req.block.answerIds.length) return req.block.answerIds.some((id) => [b.answerNodeId, b.answerMessageId].includes(id));
      return b.answerOrdinal === req.block.answerOrdinal;
    });
    const candidates = answerBlocks.filter((b) => tdNavBlockSignature(b) === req.block.signature);
    const withKey = candidates.filter((b) => b.key === req.block.key && b.outlineOrdinal === req.block.ordinal);
    if (withKey.length === 1) return withKey[0];
    if (candidates.length === 1) return candidates[0];
    const withPath = candidates.filter((b) => tdNavParentPath(b, answerBlocks) === req.block.path);
    return withPath.length === 1 ? withPath[0] : null;
  }
  function tdNavAnswer(req, entry, block) {
    const record = answerRecordForBlock(entry, block);
    if (record) return record;
    return block ? { nodeId: block.answerNodeId, messageId: block.answerMessageId, turnId: block.turnId,
      identityTokens: block.identityTokens || [], answerOrdinal: block.answerOrdinal } : null;
  }
  function tdNavResolve(req) {
    const entry = tdNavLiveEntry(req); if (!entry) {req.resolution={stage:'event-changed'};return null;}
    if (!req.block) {
      const target = tdNavFindTurn(entry, entryAnchorRole(entry));
      req.resolution={stage:target?'message-ready':'message-unresolved',identity:tdDomState.exactLookup || null};
      if (target) { req.method = 'message-id'; req.section = target; }
      return target;
    }
    const block = tdNavLiveBlock(req, entry); if (!block) {req.resolution={stage:'chapter-changed'};return null;}
    const answer = tdNavAnswer(req, entry, block), section = tdNavFindTurn(answer, 'assistant');
    req.resolution={stage:section?'answer-ready':'answer-unresolved',identity:tdDomState.exactLookup || null};
    if (!section) return null;
    req.section = section;
    if (!req.rendered || req.rendered.section !== section || req.outlineDirty ||
        req.rendered.blocks.some((b) => !b.target?.isConnected)) {
      req.rendered = { section, blocks: collectRenderedAnswerBlocks(section) };
      req.outlineDirty = false; tdNavigation.parses++;
    }
    const apiBlocks = (entry.answerBlocks || []).filter((b) => b.answerOrdinal === block.answerOrdinal);
    const apiSignature = JSON.stringify(apiBlocks.map((b) => [b.outlineOrdinal, b.parentOutlineOrdinal, tdNavBlockSignature(b)]));
    if (!req.rendered.plan || req.rendered.apiSignature !== apiSignature) {
      const plan = tdNavMatchOutline(apiBlocks, req.rendered.blocks);
      req.rendered.plan = new Map([...plan].map(([b, m]) => [`${b.outlineOrdinal}:${tdNavBlockSignature(b)}`, m]));
      req.rendered.apiSignature = apiSignature;
    }
    const match = req.rendered.plan.get(`${block.outlineOrdinal}:${tdNavBlockSignature(block)}`);
    req.resolution={...req.resolution,stage:match?'chapter-matched':'chapter-unmatched',sourceChapters:apiBlocks.length,renderedChapters:req.rendered.blocks.length,matchedChapters:req.rendered.plan.size};
    if (!match || !tdNavVisibleTarget(match.block.target)) return null;
    req.method = match.confidence;
    return match.block.target;
  }
  function tdNavAlive(req) {
    return tdNavigation.current === req && !req.controller.signal.aborted && tdAlive(req.scope) &&
      navigationAlive(req.token, req.epoch) && settings.enabled && (!req.block || settings.enableAnswerJump);
  }
  function tdNavCancel(reason = 'cancelled') {
    const req = tdNavigation.current; if (!req) return;
    if (!req.result) tdNavRecordResult(req, reason);
    req.controller.abort();
    for (const cleanup of req.cleanups) { try { cleanup(); } catch { /* Best-effort DOM teardown. */ } }
    req.cleanups.clear();
    if (tdNavigation.current === req) tdNavigation.current = null;
    tdNavMarkBusy(null);
  }
  function tdNavRecordResult(req,result,errorPx=null) {
  req.result=result;
  tdNavigation.last={result,kind:req.block?'answer-section':'conversation-event',method:req.method || '',
    elapsedMs:Math.round(performance.now()-req.started),errorPx:Number.isFinite(errorPx)?Math.round(errorPx*100)/100:null,
    corrections:req.corrections,verification:req.verification || null,resolution:req.resolution || null,
    scrolling:{root:req.root?.isConnected ? tdNavScrollSnapshot(req.root) : null,
      nativeFallback:Boolean(req.nativeReveal),writes:(req.scrollWrites || []).slice()}};
  tdLog('navigation',`${result}/${req.method || 'none'}`);
}
  function tdNavMarkBusy(req) {
    if (!shadowRoot) return;
    shadowRoot.querySelectorAll('[aria-busy="true"].answer-item,[aria-busy="true"].preview-item').forEach((node) => node.removeAttribute('aria-busy'));
    if (req) {
      const selector = req.block ? `[data-answer-key="${cssEscape(req.block.key)}"]` : `.preview-item[data-entry-key="${cssEscape(req.entryKey)}"]`;
      shadowRoot.querySelector(selector)?.setAttribute('aria-busy', 'true');
    }
  }
  function tdNavBegin(entry, block = null) {
    tdNavCancel('superseded');
    const siblings = (entry.answerBlocks || []).filter((b) => b.answerOrdinal === block?.answerOrdinal);
    const req = {
      id: ++tdNavigation.sequence, scope: tdScope(), controller: new AbortController(), cleanups: new Set(),
      token: ++navigationToken, epoch: ++userNavigationEpoch, entryKey: entry.key, entryIds: tdNavRecordIds(entry),
      block: block ? { key: block.key, ordinal: block.outlineOrdinal, signature: tdNavBlockSignature(block),
        path: tdNavParentPath(block, siblings), answerOrdinal: block.answerOrdinal,
        answerIds: [block.answerNodeId, block.answerMessageId].filter(Boolean) } : null,
      started: performance.now(), corrections: 0, method: '', result: '', rendered: null,
      outlineDirty: true, section: null, root: null, lastTarget: null,
    };
    tdNavigation.current = req;
    const observer = new MutationObserver((mutations) => {
      if (!tdNavAlive(req)) return;
      if (mutations.some((m) => m.type !== 'attributes' || ['data-message-id','data-turn-id','hidden','aria-hidden','open'].includes(m.attributeName))) req.outlineDirty = true;
    });
    const root = tdNavConversationRoot();
    tdDomObserveRoots(observer, { childList: true, subtree: true, characterData: true,
      attributes: true, attributeFilter: ['data-message-id','data-turn-id','hidden','aria-hidden','open'] });
    req.cleanups.add(() => observer.disconnect());
    tdNavMarkBusy(req);
    return req;
  }
  
  // v1.7.4: independently verify movement and readable viewport arrival.
function tdNavScrollInfo(root) {
  const actual = root || document.scrollingElement || document.documentElement;
  const doc = actual === document.scrollingElement || actual === document.documentElement;
  const style = getComputedStyle(actual);
  const height = doc ? (document.documentElement.clientHeight || innerHeight) : actual.clientHeight;
  const range = Math.max(0, actual.scrollHeight - height);
  const reverse = !doc && /flex/.test(style.display) && style.flexDirection === 'column-reverse';
  const rect = doc ? {top:0,left:0,width:innerWidth,height:innerHeight} : actual.getBoundingClientRect();
  const scale = !doc && actual.offsetHeight > 0 ? rect.height / actual.offsetHeight : 1;
  return {root:actual, doc, style, height, range, min:reverse ? -range : 0,
    max:reverse ? 0 : range, top:doc ? (window.scrollY || actual.scrollTop || 0) : actual.scrollTop,
    scale:Number.isFinite(scale) && scale > .05 ? scale : 1};
}

function tdNavScrollChain(target) {
  const chain=[];
  for (let n=tdDomParent(target), depth=0; n && depth<100; n=tdDomParent(n),depth++) {
    if (!(n instanceof HTMLElement)) continue;
    if (n === document.scrollingElement || n === document.documentElement) break;
    const s=tdNavScrollInfo(n);
    if (s.style.display === 'none' || s.style.display === 'contents' || s.height<=0) continue;
    if (/^(auto|scroll|overlay|hidden)$/.test(s.style.overflowY) && s.range>1) chain.push(n);
  }
  const doc=document.scrollingElement || document.documentElement;
  if (doc && tdNavScrollInfo(doc).range>1) chain.push(doc);
  return [...new Set(chain)];
}

function tdNavClientBox(root) {
  const s=tdNavScrollInfo(root);
  if(s.doc) return {left:0,top:0,right:innerWidth,bottom:innerHeight,width:innerWidth,height:innerHeight};
  const r=s.root.getBoundingClientRect(), sx=s.root.offsetWidth ? r.width/s.root.offsetWidth : s.scale;
  const left=r.left+s.root.clientLeft*sx, top=r.top+s.root.clientTop*s.scale;
  return {left,top,right:left+s.root.clientWidth*sx,bottom:top+s.height*s.scale,
    width:s.root.clientWidth*sx,height:s.height*s.scale};
}

function tdNavIsOverlay(node) {
  for (let n=node, i=0; n && i<8; n=tdDomParent(n),i++) {
    if (/^(fixed|sticky)$/.test(getComputedStyle(n).position)) return true;
    if(n===document.body) break;
  }
  return false;
}

function tdNavViewport(target) {
  const vv=window.visualViewport;
  let left=vv?.offsetLeft || 0, top=vv?.offsetTop || 0;
  let right=Math.min(innerWidth,left+(vv?.width || innerWidth));
  let bottom=Math.min(innerHeight,top+(vv?.height || innerHeight));
  for(let n=tdDomParent(target), depth=0; n && depth<100; n=tdDomParent(n),depth++) {
    if(!(n instanceof HTMLElement))continue;
    const st=getComputedStyle(n);
    if(st.display==='none' || st.visibility==='hidden')return {left,top,right,bottom:top,hidden:true};
    if(st.display==='contents')continue;
    const r=tdNavClientBox(n);
    if(/^(hidden|clip|auto|scroll|overlay)$/.test(st.overflowY)){top=Math.max(top,r.top);bottom=Math.min(bottom,r.bottom);}
    if(/^(hidden|clip|auto|scroll|overlay)$/.test(st.overflowX)){left=Math.max(left,r.left);right=Math.min(right,r.right);}
    if(n===document.documentElement)break;
  }
  const tr=tdDomRect(target);
  for(const h of safeQueryAll(document,'header,[role="banner"],[data-app-shell-page-header],[data-testid="conversation-header"]')) {
    const r=h.getBoundingClientRect();
    if(r.height>0 && r.height<200 && r.top<=top+48 && r.bottom>top && r.right>tr.left && r.left<tr.right && tdNavIsOverlay(h)) top=Math.max(top,r.bottom+8);
  }
  // Only the compact, actual composer can obstruct a destination. Never treat an
  // app-wide <form> wrapping the transcript as a footer.
  const composer=findChatGptComposerDockAnchor() || getChatGptComposer();
  if(composer instanceof HTMLElement && isElementVisible(composer) && tdNavIsOverlay(composer)) {
    const r=composer.getBoundingClientRect();
    if(r.height>0 && r.height<innerHeight*.55 && r.bottom>=bottom-60 && r.top>top && r.right>tr.left && r.left<tr.right)bottom=Math.min(bottom,r.top-8);
  }
  return {left,top,right,bottom,hidden:false};
}

function tdNavStartIsPainted(target, viewport) {
  const rect=tdDomRect(target), left=Math.max(rect.left,viewport.left), right=Math.min(rect.right,viewport.right);
  if(right-left<2)return false;
  const y=rect.top+Math.min(12,rect.height/2);
  const tree=target.getRootNode();
  const surface=tree instanceof ShadowRoot && typeof tree.elementsFromPoint==='function' ? tree : document;
  for(const fraction of [.15,.5,.85]) {
    const x=left+(right-left)*fraction;
    const hit=surface.elementsFromPoint(x,y).find(n=>!tdDomClosest(n,'#threaddeck-host,#prompt-rail-host'));
    if(hit && (hit===target || tdDomContains(target,hit)))return true;
  }
  // pointer-events:none has no hit-test surface, but still paints readable text.
  return getComputedStyle(target).pointerEvents==='none';
}

function tdNavVerification(target) {
  if(!target?.isConnected || !tdNavVisibleTarget(target))return {ok:false,visible:false,reason:'target-unmounted'};
  const chain=tdNavScrollChain(target), root=chain[0] || document.scrollingElement || document.documentElement;
  const rect=tdDomRect(target), viewport=tdNavViewport(target);
  const lineHeight=Math.min(20,rect.height);
  const visible=!viewport.hidden && viewport.bottom-viewport.top>=lineHeight && rect.top>=viewport.top-2 &&
    rect.top+lineHeight<=viewport.bottom+2 && rect.right>viewport.left && rect.left<viewport.right;
  const painted=visible && tdNavStartIsPainted(target,viewport);
  const geometry=tdNavGeometry(root,target);
  const remaining=Math.max(0,...chain.map(n=>tdNavGeometry(n,target).travel));
  // A clamped destination is not evidence of arrival. It may have zero remaining
  // scroll yet be thousands of pixels outside a clipped viewport (v1.7.3 bug).
  const ok=visible && painted && remaining<=4;
  return {ok,visible,painted,remainingScrollPx:Math.round(remaining*100)/100,
    alignmentErrorPx:Math.round(geometry.error*100)/100,boundaryLimited:geometry.limited,
    targetTop:Math.round(rect.top*100)/100,targetBottom:Math.round(rect.bottom*100)/100,
    viewportTop:Math.round(viewport.top*100)/100,viewportBottom:Math.round(viewport.bottom*100)/100,
    reason:ok ? 'viewport-verified' : !visible ? 'target-outside-reading-viewport' : !painted ? 'target-occluded' : 'alignment-pending'};
}

function tdNavScrollSnapshot(root) {
  const s=tdNavScrollInfo(root);
  return {tag:s.root.tagName.toLowerCase(),document:s.doc,overflowY:s.style.overflowY,
    display:s.style.display,clientHeight:s.height,scrollHeight:s.root.scrollHeight,
    min:s.min,max:s.max,top:Math.round(s.top*100)/100};
}

function tdNavWriteScroll(req,root,to,target=null) {
  if(!tdNavAlive(req))return false;
  const s=tdNavScrollInfo(root), value=Math.max(s.min,Math.min(s.max,Number(to)||0));
  const before=target?.isConnected ? tdDomRect(target).top : null;
  let writeMethod='scrollTo';
  try {
    if(s.doc)window.scrollTo({top:value,behavior:'instant'});
    else s.root.scrollTo({top:value,behavior:'instant'});
  } catch { writeMethod='scrollTop'; }
  if(writeMethod==='scrollTop' || (Math.abs(tdNavScrollInfo(root).top-s.top)<.5 && Math.abs(value-s.top)>1)) {
    // One readback-checked native property assignment when a host wraps scrollTo.
    try { s.root.scrollTop=value;writeMethod='scrollTop'; } catch { /* Verify actual arrival below. */ }
  }
  const after=tdNavScrollInfo(root).top;
  const writes=req.scrollWrites || (req.scrollWrites=[]);
  writes.push({...tdNavScrollSnapshot(root),writeMethod,before:s.top,requested:value,after,
    targetBefore:before,targetAfter:target?.isConnected ? tdDomRect(target).top : null});
  if(writes.length>12)writes.shift();
  return Math.abs(after-s.top)>.5;
}

function tdNavNativeReveal(req,target) {
  if(!tdNavAlive(req) || req.nativeReveal || !target?.isConnected)return false;
  req.nativeReveal=true;
  for(const root of tdNavScrollChain(target))tdNavLockRoot(req,root);
  let box=target;
  if(getComputedStyle(target).display==='contents')box=[...target.children].find(n=>n.getBoundingClientRect().height>0) || target;
  try { Element.prototype.scrollIntoView.call(box,{block:'start',inline:'nearest',behavior:'instant'});return true; }
  catch { return false; }
}

async function tdNavVerifyArrival(req,target) {
  for(let pass=0;pass<4 && tdNavAlive(req);pass++) {
    const resolved=tdNavResolve(req);
    if(resolved)target=resolved;
    else {target=await tdNavWait(req,()=>tdNavResolve(req),700);if(!target)return null;}
    req.verification=tdNavVerification(target);
    if(req.verification.ok) {
      // Read again after a frame; do not declare success using pre-scroll geometry.
      if(!await tdNavFrame(req))return null;
      const fresh=tdNavResolve(req);if(!fresh)continue;
      req.verification=tdNavVerification(fresh);
      if(req.verification.ok)return fresh;
      target=fresh;
    }
    if(pass===1){tdNavNativeReveal(req,target);if(!await tdNavFrame(req))return null;target=tdNavResolve(req)||target;}
    req.corrections++;
    if(!await tdNavPlace(req,target,false))return null;
  }
  req.verification=target?.isConnected ? tdNavVerification(target) : {ok:false,reason:'target-unmounted'};
  return req.verification.ok ? target : null;
}

function tdNavScrollRoot(target) {
  return tdNavScrollChain(target)[0] || document.scrollingElement || document.documentElement;
}
  function tdNavTop(root,target) {
  const box=tdNavClientBox(root);
  let desired=box.top+Math.min(NAVIGATION_TOP_OFFSET_PX,Math.max(24,box.height*.12));
  const tr=tdDomRect(target);
  for(const header of safeQueryAll(document,'header,[role="banner"],[data-app-shell-page-header],[data-testid="conversation-header"],#page-header')) {
    const hr=header.getBoundingClientRect();
    if(hr.height<=0 || hr.height>200 || hr.top>box.top+48 || hr.bottom<=box.top || hr.right<=tr.left || hr.left>=tr.right)continue;
    if(tdNavIsOverlay(header))desired=Math.max(desired,hr.bottom+12);
  }
  return Math.min(box.top+box.height*.4,desired);
}
  function tdNavGeometry(root,target) {
  const s=tdNavScrollInfo(root), desired=tdNavTop(root,target), actual=tdDomRect(target).top;
  const wanted=s.top+(actual-desired)/s.scale;
  const scroll=Math.max(s.min,Math.min(s.max,wanted));
  return {scroll,desired,error:Math.abs(actual-desired),travel:Math.abs(scroll-s.top)*s.scale,
    limited:Math.abs(scroll-wanted)*s.scale>2};
}
  function tdNavLockRoot(req, root, attribute = 'data-threaddeck-scroll-lock') {
    if (req.root === root) return;
    req.root = root;
    if (!document.getElementById('threaddeck-navigation-style')) {
      const style = document.createElement('style'); style.id = 'threaddeck-navigation-style';
      style.textContent = `:is([data-threaddeck-scroll-lock],[data-threaddeck-history-lock]){scroll-behavior:auto!important;overflow-anchor:none!important;scroll-snap-type:none!important}
        [data-threaddeck-nav-hit]{outline:2px solid color-mix(in srgb, currentColor 22%, transparent);outline-offset:5px;border-radius:3px}
        @media(prefers-reduced-motion:reduce){[data-threaddeck-nav-hit]{transition:none}}`;
      document.documentElement.appendChild(style);
    }
    const actual = isDocumentScrollRoot(root) ? (document.scrollingElement || document.documentElement) : root;
    const prior = actual.getAttribute(attribute), tag = String(req.id);
    actual.setAttribute(attribute, tag);
    req.cleanups.add(() => {
      if (actual.getAttribute(attribute) !== tag) return;
      if (prior === null) actual.removeAttribute(attribute); else actual.setAttribute(attribute, prior);
    });
  }
  function tdNavFrame(req) {
    return new Promise((resolve) => {
      if (!tdNavAlive(req)) { resolve(false); return; }
      let done = false; let frame = null; let timer = null;
      const finish = () => {
        if (done) return; done = true; cancelAnimationFrame(frame); clearTimeout(timer);
        req.controller.signal.removeEventListener('abort', finish); resolve(tdNavAlive(req));
      };
      req.controller.signal.addEventListener('abort', finish, { once: true });
      frame = requestAnimationFrame(finish); timer = setTimeout(finish, 100);
    });
  }
  async function tdNavPlace(req,target,allowAnimation=false) {
  if(!tdNavAlive(req) || !tdNavVisibleTarget(target))return false;
  const exactPlacement=tdNavResolve(req)===target;
  const chain=tdNavScrollChain(target), roots=chain.length ? chain : [document.scrollingElement || document.documentElement];
  for(const root of roots) {
    if(!tdNavAlive(req) || !target.isConnected)return tdNavAlive(req);
    if(exactPlacement && tdNavResolve(req)!==target)return tdNavAlive(req);
    tdNavLockRoot(req,root);
    const geometry=tdNavGeometry(root,target), info=tdNavScrollInfo(root), start=info.top;
    const near=geometry.travel<=Math.min(520,info.height*.65);
    const animate=allowAnimation && roots.length===1 && settings.smoothScroll && near && geometry.travel>5 && !matchMedia('(prefers-reduced-motion: reduce)').matches;
    if(animate) {
      const began=performance.now();let progress=0;
      while(tdNavAlive(req) && progress<1) {
        progress=Math.min(1,(performance.now()-began)/140);
        tdNavWriteScroll(req,root,start+(geometry.scroll-start)*(1-Math.pow(1-progress,3)),target);
        if(!await tdNavFrame(req))return false;
        if(exactPlacement && tdNavResolve(req)!==target)return tdNavAlive(req);
      }
    } else if(geometry.travel>.5)tdNavWriteScroll(req,root,geometry.scroll,target);
  }
  tdNavLockRoot(req,roots[0]);
  if(!await tdNavFrame(req))return false;
  return tdNavAlive(req);
}
  async function tdNavWait(req, provider, timeout = TD_NAV_MOUNT_MS) {
    const start = performance.now();
    while (tdNavAlive(req) && performance.now() - start < timeout) {
      const target = provider(); if (target && tdNavVisibleTarget(target)) return target;
      // At most one bounded exact-ID/outline probe per 80 ms. No whole-thread
      // refresh, no API refetch and no ratio-based sweeping while waiting.
      if (!await new Promise((resolve) => {
        const finish = () => { clearTimeout(timer); req.controller.signal.removeEventListener('abort', finish); resolve(tdNavAlive(req)); };
        const timer = setTimeout(finish, 80); req.controller.signal.addEventListener('abort', finish, { once: true });
      })) return null;
    }
    return null;
  }
  function tdSignalHostReadingScroll(root, delta) {
    if (Math.abs(delta)<4 || !root || !(root.matches('[data-mcp-app-scroll-host][data-app-action-timeline-scroll]') ||
        root.querySelector('[data-thread-find-target="conversation"] [data-virtualized-turn]'))) return;
    // 先让宿主退出自动跟随末尾，再由浏览器滚到已知的阅读位置。
    root.dispatchEvent(new WheelEvent('wheel',{deltaY:delta,bubbles:true,cancelable:true}));
  }

  async function tdNavMountCaptured(req, captured, root) {
    const initial = tdNavScrollInfo(root);
    const estimate = Math.max(initial.min,Math.min(initial.max,captured.top - Math.min(65,initial.height * .15)));
    const boundary = estimate <= initial.top ? initial.min : initial.max;
    tdNavLockRoot(req,root);
    req.method = 'recorded-native-position';
    req.paging = boundary === initial.min ? 'up' : 'down';
    for (const top of new Set([estimate,boundary])) {
      if (!tdNavAlive(req) || !root.isConnected) return null;
      tdSignalHostReadingScroll(root,top-tdNavScrollInfo(root).top);
      tdNavWriteScroll(req,root,top);
      let corrections = 0;
      const target = await tdNavWait(req,() => {
        const exact = tdNavResolve(req);
        if (exact || corrections >= 2) return exact;
        const info = tdNavScrollInfo(root);
        const aim = Math.max(info.min,Math.min(info.max,top));
        // 只有同一消息占位能把这次跳转细化为章节位置。
        const anchor = tdNavFindTurn(captured.address,captured.role);
        const desired = anchor ? tdNavGeometry(root,anchor).scroll : aim;
        if (Math.abs(info.top-desired) >= 12) {
          corrections++;
          tdNavWriteScroll(req,root,desired,anchor);
        }
        return null;
      },900);
      if (target) return target;
    }
    return null;
  }

  function tdNavHighlight(req, target) {
    if (req.lastTarget === target) return;
    if (req.lastTarget?.getAttribute('data-threaddeck-nav-hit') === String(req.id)) req.lastTarget.removeAttribute('data-threaddeck-nav-hit');
    req.lastTarget = target; target.setAttribute('data-threaddeck-nav-hit', String(req.id));
    req.cleanups.add(() => { if (target.getAttribute('data-threaddeck-nav-hit') === String(req.id)) target.removeAttribute('data-threaddeck-nav-hit'); });
  }
  function tdNavGuard(req) {
  let frame=null,running=false,observed=null,attempts=0;
  const resize=new ResizeObserver(()=>schedule());
  const run=async()=>{
    frame=null;
    if(!tdNavAlive(req)||running)return;
    const target=tdNavResolve(req);if(!target)return;
    if(observed!==target){observed=target;resize.observe(target);tdNavHighlight(req,target);}
    const proof=tdNavVerification(target);
    if(proof.ok)return;
    if(attempts++>=4){req.verification=proof;tdNavRecordResult(req,'position-not-stable',proof.alignmentErrorPx);tdNavCancel('position-not-stable');return;}
    running=true;
    try {
      req.corrections++;
      await tdNavPlace(req,target,false);
      if(!tdNavAlive(req))return;
      const current=tdNavResolve(req);if(!current){schedule();return;}
      req.verification=tdNavVerification(current);
      if(req.verification.ok)tdNavRecordResult(req,'located',req.verification.alignmentErrorPx);
      else schedule();
    } finally {running=false;}
  };
  const schedule=()=>{if(frame===null && tdNavAlive(req))frame=requestAnimationFrame(()=>{void run().catch(()=>{if(tdNavAlive(req))tdNavCancel('guard-error');});});};
  const observer=new MutationObserver(schedule);
  tdDomObserveRoots(observer,{childList:true,characterData:true,subtree:true});
  if(req.section)resize.observe(req.section);
  if(req.root instanceof Element)resize.observe(req.root);
  const thread=tdNavConversationRoot();if(thread instanceof Element)resize.observe(thread);
  window.addEventListener('scroll',schedule,{capture:true,passive:true});
  window.addEventListener('resize',schedule,{passive:true});
  const timer=setTimeout(()=>{if(tdNavigation.current===req)tdNavCancel('guard-complete');},TD_NAV_GUARD_MS);
  req.cleanups.add(()=>{clearTimeout(timer);if(frame!==null)cancelAnimationFrame(frame);resize.disconnect();observer.disconnect();
    window.removeEventListener('scroll',schedule,true);window.removeEventListener('resize',schedule);});
  schedule();
}
  function tdNavNativeButton(entry) {
    if (!isUserAnchoredEntry(entry)) return null;
    const button = entry.nativeButton, index = entries.findIndex((e) => e.key === entry.key);
    if (!(button instanceof HTMLButtonElement) || !button.isConnected) return null;
    if (entry.source !== 'native' && !(entry.nativeMappedIndex === index && ['exact-native-id','exact-native-label'].includes(entry.nativeMappingConfidence))) return null;
    return button;
  }
  async function tdNavAfterHostLayout(req) {
    const thread = tdZoom.scene?.root || tdZoomRoot();
    if (thread && req.paging === 'up' && tdZoomEarlierMessagesPending(thread)) {
      // 早期章节可能先挂载。等 ChatGPT 完成分页和滚动校正后，再核对落点。
      await tdUntil(() => !tdNavAlive(req) || !tdZoomEarlierMessagesPending(thread),1800,req.scope,80);
    }
    if (!await tdDelay(160,req.scope) || !tdNavAlive(req)) return null;
    let target = tdNavResolve(req);
    if (req.paging && req.root?.isConnected && (!target || !tdNavVerification(target).visible)) {
      // 先让宿主收到回到分页边界的滚动，再将准确章节放进视口。
      const root = req.root;
      const info = tdNavScrollInfo(root);
      const boundary = req.paging === 'up' ? info.min : info.max;
      tdSignalHostReadingScroll(root,boundary-info.top);
      tdNavWriteScroll(req,root,boundary);
      if (!await tdNavFrame(req)) return null;
      target = await tdNavWait(req,() => tdNavResolve(req),900);
    }
    if (target && tdNavAlive(req)) {
      const root = tdNavScrollRoot(target);
      tdSignalHostReadingScroll(root,tdNavGeometry(root,target).scroll-tdNavScrollInfo(root).top);
    }
    return tdNavVerifyArrival(req,target);
  }

  async function tdNavRun(entry, block = null, overviewRecords = null) {
    if (!entry || !settings.enabled || !isCurrentPageEligible() || getRouteKey() !== routeKey ||
        (block && !isNavigableAnswerBlock(block))) return { result: 'disabled' };
    tdHistory.preserveCancel?.();
    tdOutlineStopHistory();
    const req = tdNavBegin(entry, block);
    if (overviewRecords) {
      req.overviewEntry = entry;
      req.overviewRecords = overviewRecords;
    }
    try {
      let target = tdNavResolve(req);
      if (!target && !tdDomRoleRoots('user').length && !tdDomRoleRoots('assistant').length) {
        tdDomCensus(true);
        showToast('正在重新识别正文区域…',1800);
        target=await tdNavWait(req,()=>tdNavResolve(req),1200);
        if(!tdNavAlive(req))return {result:'cancelled'};
        if(!target && !tdDomRoleRoots('user').length && !tdDomRoleRoots('assistant').length)throw new Error('transcript-not-recognized');
      }
      if (!target) {
        const current = tdNavLiveEntry(req), liveBlock = req.block ? tdNavLiveBlock(req, current) : null;
        if (!current || (req.block && !liveBlock)) throw new Error('destination-changed');
        const record = liveBlock ? tdNavAnswer(req, current, liveBlock) : current;
        // The message may be present while its content-visibility subtree or the
        // individual section is not. Its exact message container is still a safe
        // mounting anchor; never pick another answer by text similarity.
        const mountedAnswer = liveBlock ? tdNavFindTurn(record, 'assistant') : null;
        const anchor = mountedAnswer || tdNavFindSkeleton(record);
        if (anchor) {
          req.method = 'message-placeholder';
          if (anchor.hasAttribute('data-turn-id-container') && tdReadState().until<=Date.now()) tdHistory.bridge?.warm(anchor, { owner: 'navigation', ttl: 7000 });
          showToast('正在加载目标内容…', TD_NAV_MOUNT_MS + 500);
          if (!await tdNavPlace(req, anchor, false)) return { result: 'cancelled' };
        } else {
          const native = tdNavNativeButton(current);
          if (native) {
            req.method = 'verified-native'; native.click();
            showToast('正在等待目标内容加载…', TD_NAV_MOUNT_MS + 500);
          } else {
            target = await tdNavLoadMissingHistory(req, record);
            if (!tdNavAlive(req)) return { result: 'cancelled' };
            if (!target) throw new Error(req.resolution?.stage === 'chapter-unmatched' ? 'section-unresolved' : req.resolution?.identity?.reason === 'ambiguous-identity' ? 'ambiguous-message' : 'history-not-available');
          }
        }
        target = target || await tdNavWait(req, () => tdNavResolve(req));
        if (!tdNavAlive(req)) return { result: 'cancelled' };
        if (!target) throw new Error(liveBlock ? 'section-unresolved' : 'message-unmounted');
      }
      const settleHost = Boolean(overviewRecords || req.paging);
      const placed = await tdNavPlace(req, target, true);
      if (!tdNavAlive(req) || !placed && !settleHost) return { result: 'cancelled' };
      // 每次滚动后重新匹配原文。概览和按需分页还要等宿主结束滚动校正。
      let exact = tdNavResolve(req);
      if (!settleHost && !exact) {
        exact = await tdNavWait(req, () => tdNavResolve(req), 1000);
        if (!tdNavAlive(req)) return { result: 'cancelled' };
        if (!exact) throw new Error('target-remounted');
      }
      exact = settleHost ? await tdNavAfterHostLayout(req) : await tdNavVerifyArrival(req, exact);
      if (!tdNavAlive(req)) return {result:'cancelled'};
      if (!exact) throw new Error('scroll-did-not-reach-target');
      const error = req.verification.alignmentErrorPx;
      const live = tdNavLiveEntry(req), index = entries.indexOf(live);
      if (index >= 0) setActiveIndex(index, false);
      setActiveAnswerKey(req.block ? tdNavLiveBlock(req, live)?.key || '' : '');
      tdNavHighlight(req, exact); tdNavMarkBusy(null); tdNavRecordResult(req, 'located', error);
      if (toastEl) toastEl.dataset.visible = 'false';
      tdNavGuard(req);
      return { ...tdNavigation.last };
    } catch (error) {
      if (!tdNavAlive(req)) return { result: 'cancelled' };
      const code = error?.message || 'navigation-error';
      tdNavRecordResult(req, code); tdNavCancel(code);
      const message = code === 'scroll-did-not-reach-target' ? '已找到对应正文，但未能将其移入可阅读区域；没有把节点匹配当作跳转成功，滚动诊断已保留' : code === 'transcript-not-recognized' ? '未识别到当前页面正文；已保留页面结构诊断，未滚动或修改输入框' : code === 'history-not-available' ? '页面尚未提供目标历史内容，按需加载未成功；没有跳到相似消息，可稍后重试' : code === 'no-stable-anchor' ? '目标尚未加载，页面也未提供可核对的锚点；请先手动加载该部分后重试' :
        code === 'section-unresolved' ? '已到达目标回答，但章节还不能唯一确认；已停止，未跳到相似内容' :
        code === 'destination-changed' ? '会话内容已变化，请重新选择目标' :
        '目标正文尚未稳定加载，请稍后重试；未按位置比例或相似文字猜测';
      showToast(message, 3200);
      return { ...tdNavigation.last };
    } finally {
      if (!req.result && tdNavigation.current === req) tdNavCancel('cancelled');
    }
  }


  function navigationAlive(token, epoch) {
    return token === navigationToken && epoch === userNavigationEpoch;
  }

  function desiredViewportTop(root) {
    if (isDocumentScrollRoot(root)) return NAVIGATION_TOP_OFFSET_PX;
    const rect = root.getBoundingClientRect();
    return rect.top + Math.min(NAVIGATION_TOP_OFFSET_PX, Math.max(24, rect.height * 0.12));
  }


  async function animateRootScroll(root, destination, token, epoch, duration = 280) {
    const start = getRootScrollTop(root);
    const end = Math.min(getRootScrollMax(root), Math.max(0, destination));
    const distance = end - start;
    if (Math.abs(distance) < 2) return navigationAlive(token, epoch);
    const startedAt = performance.now();
    return new Promise((resolve) => {
      const frame = (now) => {
        if (!navigationAlive(token, epoch)) {
          resolve(false);
          return;
        }
        const progress = Math.min(1, Math.max(0, (now - startedAt) / duration));
        const eased = 1 - Math.pow(1 - progress, 3);
        scrollRootTo(root, start + distance * eased, 'auto');
        if (progress >= 1) resolve(true);
        else requestAnimationFrame(frame);
      };
      requestAnimationFrame(frame);
    });
  }

  function scheduleAnchorReassert(targetProvider, root, token, epoch) {
    const delays = [180, 460, 860, 1320, 1780, CHATGPT_ANCHOR_STABILIZE_MS];
    for (const delay of delays) {
      window.setTimeout(() => {
        if (!navigationAlive(token, epoch)) return;
        const target = targetProvider();
        if (!(target instanceof Element) || !target.isConnected) return;
        const residual = target.getBoundingClientRect().top - desiredViewportTop(root);
        if (Math.abs(residual) > 5) scrollRootBy(root, residual, 'auto');
      }, delay);
    }
  }

  async function jumpToPersistentAnchor(anchor, token, epoch, targetProvider = () => anchor) {
    if (!(anchor instanceof Element) || !anchor.isConnected || !navigationAlive(token, epoch)) return null;
    const root = findScrollableAncestor(anchor) || currentScrollRoot || findScrollRoot();
    const destination = getTargetScrollTop(anchor, root);
    const distance = Math.abs(destination - getRootScrollTop(root));
    if (settings.smoothScroll && distance <= 640) {
      const ok = await animateRootScroll(root, destination, token, epoch, Math.min(320, 190 + distance * 0.16));
      if (!ok) return null;
    } else {
      scrollRootTo(root, destination, 'auto');
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    }
    if (!navigationAlive(token, epoch)) return null;
    scheduleAnchorReassert(targetProvider, root, token, epoch);
    return root;
  }

  async function waitForChatGptTarget(provider, token, epoch, timeout = CHATGPT_ANCHOR_STABILIZE_MS) {
    const startedAt = Date.now();
    while (Date.now() - startedAt <= timeout) {
      if (!navigationAlive(token, epoch)) return null;
      const target = provider();
      if (target instanceof Element && target.isConnected) return target;
      await sleep(CHATGPT_ANCHOR_POLL_MS);
    }
    return null;
  }

  function exactChatGptPromptTarget(entry) {
    if (!entry) return null;
    const anchorRole = entryAnchorRole(entry);
    if (entry.turnId) {
      const section = findChatGptTurnSection(entry.turnId, anchorRole);
      if (section) return section;
    }
    const target = findIdentityTarget(entry);
    if (target?.isConnected) return target;
    if (entry.target?.isConnected) return entry.target;
    return null;
  }

  async function navigateViaChatGptSkeleton(entry, index, token, epoch) {
    const anchor = entry?.skeletonTarget;
    if (!(anchor instanceof Element) || !anchor.isConnected) return false;
    const eventLabel = isAutomationTimelineEntry(entry) ? '任务运行' : '问题';
    showToast(`正在跳转到对应${eventLabel}…`);
    const targetProvider = () => exactChatGptPromptTarget(entry) || anchor;
    const root = await jumpToPersistentAnchor(anchor, token, epoch, targetProvider);
    if (!root || !navigationAlive(token, epoch)) return false;

    setActiveIndex(index, true);
    const exact = await waitForChatGptTarget(() => exactChatGptPromptTarget(entry), token, epoch, 1450);
    if (!navigationAlive(token, epoch)) return false;
    if (exact) {
      entry.target = exact;
      const residual = exact.getBoundingClientRect().top - desiredViewportTop(root);
      if (Math.abs(residual) > 3) scrollRootBy(root, residual, 'auto');
      scheduleAnchorReassert(() => exactChatGptPromptTarget(entry) || anchor, root, token, epoch);
      showToast(`已定位到对应${eventLabel}`, 900);
    } else {
      showToast(`已跳到对应${eventLabel}位置，页面仍在挂载内容`, 1400);
    }
    return true;
  }

  function answerRecordForBlock(entry, block) {
    return (entry?.answerRecords || []).find((answer) => answer.answerOrdinal === block?.answerOrdinal) || null;
  }

  function refreshRenderedAnswerBlock(entry, block) {
    const answer = answerRecordForBlock(entry, block);
    const section = tdNavFindTurn(answer || {nodeId:block?.answerNodeId,messageId:block?.answerMessageId}, 'assistant');
    if (!section) return null;
    const sameAnswer = (entry.answerBlocks || []).filter((b) => b.answerOrdinal === block.answerOrdinal);
    mapAnswerBlocksToRendered(sameAnswer, collectRenderedAnswerBlocks(section));
    return block.target?.isConnected ? block.target : null;
  }

  function setActiveAnswerKey(key) {
    activeAnswerKey = key || '';
    if (!shadowRoot) return;
    shadowRoot.querySelectorAll('[data-answer-key]').forEach((button) => {
      button.dataset.active = String(Boolean(activeAnswerKey) && button.dataset.answerKey === activeAnswerKey);
      if (button.dataset.active === 'true') button.setAttribute('aria-current','location'); else button.removeAttribute('aria-current');
    });
  }

  async function navigateToAnswerBlock(promptIndex, blockIndex) {
    const entry = entries[promptIndex];
    // UI indexes are indexes of the visible outline contract, not a raw cache array.
    const block = entry?.answerBlocks?.filter(isAnswerOutlineBlock)[blockIndex];
    if (!block) return {result:'missing-block'};
    return tdNavRun(entry, block);
  }

  async function finalizeLocatedEntry(index, mounted, token) {
    if (!mounted?.target?.isConnected || token !== navigationToken) return false;
    const didScroll = await scrollTargetIntoView(mounted.target, token);
    if (!didScroll || token !== navigationToken) return false;
    setActiveIndex(index, true);
    showToast('已精确定位', 900);
    return true;
  }

  

  async function navigateToEntry(index) {
    if (!Number.isInteger(index) || index < 0 || index >= entries.length) return {result:'missing-entry'};
    return tdNavRun(entries[index]);
  }

  async function locateChatGptEntry(index, token) {
    const entry = entries[index];
    if (!isUserAnchoredEntry(entry)) {
      // A percentage seek assumes one visible user turn per index. Scheduled-task
      // timelines intentionally violate that relation, so stop instead of guessing.
      showToast('该任务运行尚未挂载稳定锚点，已取消跳转以避免错位', 2600);
      return false;
    }
    let root = currentScrollRoot || findScrollRoot();
    const originalMetrics = getScrollMetrics(root);
    const desiredRatio = entries.length > 1 ? index / (entries.length - 1) : 0;
    const attempts = [desiredRatio, desiredRatio - 0.025, desiredRatio + 0.025, desiredRatio - 0.07, desiredRatio + 0.07]
      .slice(0, CHATGPT_SEEK_MAX_ROUNDS)
      .map((ratio) => Math.min(1, Math.max(0, ratio)));

    showToast('页面缺少稳定锚点，正在尝试加载目标问题…');
    for (const ratio of attempts) {
      if (token !== navigationToken) return false;
      root = currentScrollRoot || root;
      setScrollRatio(root, ratio);
      await sleep(230);
      if (token !== navigationToken) return false;
      await refreshNow('chatgpt-emergency-seek');
      const mounted = findMountedMatch(entries[index], index);
      if (mounted && await finalizeLocatedEntry(index, mounted, token)) return true;
    }

    if (token === navigationToken) {
      setScrollRatio(currentScrollRoot || root, originalMetrics.ratio);
      showToast('未找到稳定锚点，已恢复原位置；未按相似文本猜测', 2800);
    }
    return false;
  }

  async function locateGenericEntry(index, token) {
    let root = currentScrollRoot || findScrollRoot();
    const originalMetrics = getScrollMetrics(root);
    const desiredRatio = entries.length > 1 ? index / (entries.length - 1) : 0;
    const attempts = [desiredRatio, desiredRatio - 0.04, desiredRatio + 0.04, desiredRatio - 0.1, desiredRatio + 0.1]
      .map((ratio) => Math.min(1, Math.max(0, ratio)))
      .filter((ratio, position, array) => array.indexOf(ratio) === position);

    showToast('正在定位已缓存的问题…');
    for (const ratio of attempts) {
      if (token !== navigationToken) return false;
      root = currentScrollRoot || root;
      setScrollRatio(root, ratio);
      await sleep(320);
      await refreshNow('locate-index');
      const mounted = findMountedMatch(entries[index], index);
      if (mounted && await finalizeLocatedEntry(index, mounted, token)) return true;
    }

    let previousSignature = '';
    let stagnantRounds = 0;
    for (let round = 0; round < 20; round += 1) {
      if (token !== navigationToken) return false;
      root = currentScrollRoot || findScrollRoot();
      const range = getMountedEntryRange();
      const direction = range && index > range.max ? 1 : 0;
      setScrollRatio(root, direction);
      await sleep(round < 4 ? 420 : 560);
      await refreshNow(direction === 0 ? 'load-older' : 'load-newer');

      const mounted = findMountedMatch(entries[index], index);
      if (mounted && await finalizeLocatedEntry(index, mounted, token)) return true;

      const signature = getConversationLoadSignature(currentScrollRoot || root);
      if (signature === previousSignature) stagnantRounds += 1;
      else stagnantRounds = 0;
      previousSignature = signature;
      if (stagnantRounds >= 4) break;
    }

    if (token === navigationToken) {
      root = currentScrollRoot || root;
      setScrollRatio(root, originalMetrics.ratio);
      showToast('该站点尚未挂载这条历史消息，已恢复原位置', 2400);
    }
    return false;
  }

  async function locateCachedEntry(entry, index, token) {
    if (site.id === 'chatgpt' && entries[index]?.source?.startsWith('conversation-api')) {
      if (isAutomationTimelineEntry(entry)) {
        showToast('页面尚未挂载这次任务运行，暂时无法可靠定位', 2200);
        return false;
      }
      return locateChatGptEntry(index, token);
    }
    return locateGenericEntry(index, token);
  }

  function sleep(milliseconds) {
    return new Promise((resolve) => window.setTimeout(resolve, milliseconds));
  }


  function makeLocalId(prefix = 'item') {
    try {
      if (typeof crypto?.randomUUID === 'function') return `${prefix}:${crypto.randomUUID()}`;
    } catch {
      // Fall through to the timestamp/random fallback.
    }
    return `${prefix}:${Date.now().toString(36)}:${Math.random().toString(36).slice(2, 10)}`;
  }

  function isElementVisible(element) {
    if (!(element instanceof Element) || !element.isConnected) return false;
    const style = getComputedStyle(element);
    if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) === 0) return false;
    const rect = element.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  }

  function workflowStorageKey(key = routeKey) {
    return `${QUEUE_SESSION_PREFIX}${hashString(key || 'unknown-route')}`;
  }

  function serializeReviewComment(comment) {
    const answerTokens = Array.from(new Set(Array.isArray(comment.answerTokens) ? comment.answerTokens.filter(Boolean) : []));
    return {
      id: comment.id,
      quote: normalizeInlineReviewText(comment.quote || '').slice(0, REVIEW_SELECTION_MAX_CHARS),
      note: normalizeMultilineText(comment.note || ''),
      prefix: truncateText(comment.prefix || '', 180),
      suffix: truncateText(comment.suffix || '', 180),
      answerTokens,
      answerKey: normalizeText(comment.answerKey || '') || reviewAnswerKeyFromTokens(answerTokens),
      // Optional disambiguator for a repeated quote, verified against quote context.
      occurrence: Number.isInteger(comment.occurrence) ? comment.occurrence : -1,
      occurrenceCount: Number.isInteger(comment.occurrenceCount) ? comment.occurrenceCount : 0,
      createdAt: Number.isFinite(comment.createdAt) ? comment.createdAt : Date.now(),
    };
  }
  function serializeQueueItem(item) {
    const statuses = new Set(['waiting', 'preparing', 'sending', 'uncertain', 'failed']);
    return {
      id: item.id || makeLocalId('queue'), text: normalizeMultilineText(item.text || ''),
      source: item.source || 'manual', status: statuses.has(item.status) ? item.status : 'waiting',
      createdAt: Number.isFinite(item.createdAt) ? item.createdAt : Date.now(),
      error: truncateText(item.error || '', 240), baselineKey: item.baselineKey || '', attemptedAt: Number(item.attemptedAt || 0),
      sendReceipt:tdReceiptSerialize(item.sendReceipt),
      comments: (Array.isArray(item.comments) ? item.comments : []).filter((c) => c && normalizeInlineReviewText(c.quote)).slice(0,100).map(serializeReviewComment),
    };
  }

  function serializePendingCommentSubmissionReceipt(receipt = pendingCommentSubmissionReceipt) {
    if (!receipt || receipt.committed) return null;
    const comments = Array.isArray(receipt.comments)
      ? receipt.comments.map(serializeReviewComment).filter((comment) => comment.quote)
      : [];
    const payload = normalizeMultilineText(receipt.payload || '');
    if (!comments.length || !payload) return null;
    return {
      id: receipt.id || makeLocalId('comment-submit'),
      comments,
      payload,
      baselineUserSignature: normalizeText(receipt.baselineUserSignature || ''),
      startedAt: Number.isFinite(receipt.startedAt) ? receipt.startedAt : Date.now(),
      detached: receipt.detached !== false,
      committed: false,
    };
  }

  function pruneConsumedReviewCommentIds(now = Date.now()) {
    for (const [id, consumedAt] of consumedReviewCommentIds) {
      if (!id || !Number.isFinite(consumedAt) || now - consumedAt > CONSUMED_COMMENT_ID_TTL_MS) {
        consumedReviewCommentIds.delete(id);
      }
    }
    if (consumedReviewCommentIds.size > MAX_CONSUMED_COMMENT_IDS) {
      const oldestFirst = Array.from(consumedReviewCommentIds.entries())
        .sort((left, right) => left[1] - right[1]);
      for (const [id] of oldestFirst.slice(0, consumedReviewCommentIds.size - MAX_CONSUMED_COMMENT_IDS)) {
        consumedReviewCommentIds.delete(id);
      }
    }
  }

  function isReviewCommentConsumed(commentOrId) {
    const id = typeof commentOrId === 'string' ? commentOrId : commentOrId?.id;
    if (!id) return false;
    pruneConsumedReviewCommentIds();
    return consumedReviewCommentIds.has(id);
  }

  function markReviewCommentsConsumed(comments, consumedAt = Date.now()) {
    for (const comment of Array.isArray(comments) ? comments : []) {
      const id = normalizeText(comment?.id || '');
      if (id) consumedReviewCommentIds.set(id, consumedAt);
    }
    pruneConsumedReviewCommentIds(consumedAt);
  }

  function serializedConsumedReviewCommentIds() {
    pruneConsumedReviewCommentIds();
    return Array.from(consumedReviewCommentIds.entries())
      .sort((left, right) => left[1] - right[1])
      .slice(-MAX_CONSUMED_COMMENT_IDS)
      .map(([id, consumedAt]) => ({ id, consumedAt }));
  }

  function pendingReviewSnapshot() {
    return reviewComments
      .filter((comment) => comment && !isReviewCommentConsumed(comment) && normalizeInlineReviewText(comment.quote))
      .map(serializeReviewComment);
  }

  function removePendingReviewSnapshot(comments) {
    const ids = new Set((comments || []).map((comment) => comment?.id).filter(Boolean));
    if (!ids.size) return;
    reviewComments = reviewComments.filter((comment) => !ids.has(comment.id));
    updateReviewHighlights();
    scheduleWorkflowSave();
    syncInlineCommentBadges();
    if (activeCommentMode) closeInlineCommentPopover({ discardEmptyNew: false });
  }

  function restorePendingReviewSnapshot(comments) {
    const incoming = Array.isArray(comments) ? comments : [];
    if (!incoming.length) return;
    const existingIds = new Set(reviewComments.map((comment) => comment.id));
    for (const raw of incoming) {
      const comment = serializeReviewComment(raw);
      if (!comment.id || !comment.quote || isReviewCommentConsumed(comment) || existingIds.has(comment.id)) continue;
      existingIds.add(comment.id);
      reviewComments.push({ ...comment, range: null });
    }
    updateReviewHighlights();
    scheduleWorkflowSave();
    syncInlineCommentBadges();
  }

  function saveWorkflowState() {
    if (!queueRouteKey || queueRouteKey !== routeKey) return;
    window.clearTimeout(workflowSaveTimer); workflowSaveTimer = null;
    try {
      workspaceSession.setItem(workflowStorageKey(queueRouteKey), JSON.stringify({
        version: APP_VERSION, routeKey:queueRouteKey, queuePaused, queueDockCollapsed,
        comments: reviewComments.filter((c) => !isReviewCommentConsumed(c)).map(serializeReviewComment),
        queue: [...promptQueue.filter(q=>q.status!=='sent'&&!q.sendReceipt?.ackedAt), ...(td.tx?.direct && !td.tx.confirmed && !td.tx.abandoned && !promptQueue.some(q => q.id === td.tx.item.id) ? [td.tx.item] : [])].map(serializeQueueItem),
        commentReceipt: serializePendingCommentSubmissionReceipt(),
        consumedCommentIds: serializedConsumedReviewCommentIds(),
      }));
      td.storageOK = true;
    } catch {
      if (td.storageOK) { tdLog('storage-unavailable'); showToast('浏览器未能保存队列，请勿刷新或关闭标签页', 3300); }
      td.storageOK = false;
    }
  }

  function scheduleWorkflowSave(delay = 120) {
    window.clearTimeout(workflowSaveTimer);
    const scope = tdScope();
    workflowSaveTimer = window.setTimeout(() => { if (tdAlive(scope)) saveWorkflowState(); }, delay);
  }

  function clearReviewHighlights() {
    try {
      if (typeof CSS !== 'undefined' && CSS.highlights) CSS.highlights.delete('threaddeck-review');
    } catch {
      // Older browsers may not implement the HighlightRegistry.
    }
    reviewHighlight = null;
    tdReviewPainted.clear();
  }

  function resetWorkflowState() {
    tdOutbox.pauseOwner='';tdOutbox.runtime=new WeakMap();tdOutbox.decision=null;tdSelectionReset();
    window.clearTimeout(workflowSaveTimer);
    workflowSaveTimer = null;
    clearReviewHighlights();
    tdStopReviewAnchorWatch();
    reviewHitGesture = null;
    hideSelectionAction();
    closeInlineCommentPopover({ discardEmptyNew: false });
    restoreSuppressedNativeSelectionToolbar();
    clearInlineCommentBadges();
    reviewComments = [];
    promptQueue = [];
    queuePaused = false;
    queueDockCollapsed = false;
    queueProcessing = false;
    queueLastBusyAt = 0;
    queueHoldUntil = 0;
    queueRouteKey = '';
    queueDraft = '';
    queueMenuOpenId = '';
    queueLastRenderedPhase = '';
    queuePreviousPhase = 'idle';
    queueLastEditAt = 0;
    window.clearTimeout(queueIdleDispatchTimer);
    queueIdleDispatchTimer = null;
    pendingCommentSubmissionReceipt = null;
    consumedReviewCommentIds.clear();
    clearQueueDockDropIndicators();
    resetChatGptActivityState();
    renderWorkflowPanel();
  }
  function loadWorkflowState() {
    resetWorkflowState();
    if (!isCurrentPageEligible() || isChatGptSharePage()) return;
    queueRouteKey = routeKey;
    try {
      const parsed = JSON.parse(workspaceSession.getItem(workflowStorageKey(routeKey)) || 'null');
      if (parsed && typeof parsed === 'object' && (!parsed.routeKey || parsed.routeKey===routeKey)) {
        for (const c of (Array.isArray(parsed.consumedCommentIds) ? parsed.consumedCommentIds : []).slice(-MAX_CONSUMED_COMMENT_IDS)) {
          if (c?.id && Number.isFinite(c.consumedAt)) consumedReviewCommentIds.set(c.id, c.consumedAt);
        }
        pruneConsumedReviewCommentIds();
        reviewComments = (Array.isArray(parsed.comments) ? parsed.comments : []).filter((c) => c && c.quote && !isReviewCommentConsumed(c)).slice(0,100).map((c) => ({ ...serializeReviewComment(c), range: null }));
        promptQueue = (Array.isArray(parsed.queue) ? parsed.queue : []).filter((q) => q && normalizeMultilineText(q.text)).slice(0,100).map((q) => {
          const item = serializeQueueItem(q);
          if (item.status === 'sending' || item.status === 'uncertain') {
            item.status = 'uncertain'; item.error = '上次提交结果待确认；请先检查会话，再选择已发送或重试';
          } else if (item.status === 'preparing') item.status = 'waiting';
          return item;
        });
        promptQueue=promptQueue.filter(item=>{if(!item.sendReceipt?.ackedAt)return true;markReviewCommentsConsumed(item.comments||[]);return false;});
        reviewComments=reviewComments.filter(c=>!isReviewCommentConsumed(c));
        const receipt = parsed.commentReceipt;
        if (receipt?.payload && receipt.comments?.length) {
          const marker = '\n本轮问题：\n'; const index = receipt.payload.lastIndexOf(marker);
          const text = index >= 0 ? receipt.payload.slice(index + marker.length) : receipt.payload;
          const comments = index >= 0 ? receipt.comments.map(serializeReviewComment) : [];
          if (!promptQueue.some((q) => q.id === receipt.id)) promptQueue.unshift({ id: receipt.id || makeLocalId('receipt'), text,
            comments, status: 'uncertain', source: 'recovery', createdAt: receipt.startedAt || Date.now(),
            baselineKey: '', error: '旧版批注发送结果待核对' });
          const ids = new Set(receipt.comments.map((c) => c.id));
          reviewComments = reviewComments.filter((c) => !ids.has(c.id));
        }
        queuePaused = promptQueue.length > 0 || Boolean(parsed.queuePaused);
        queueDockCollapsed = Boolean(parsed.queueDockCollapsed);
      }
    } catch { tdLog('restore-failed'); }
    queueHoldUntil = Date.now() + 400;
    updateReviewHighlights(); renderWorkflowPanel();
    if (promptQueue.length) tdLog('queue-restored-paused', String(promptQueue.length));
  }

  function ensureReviewHighlightStyle() {
    if (reviewHighlightStyleEl?.isConnected) return;
    reviewHighlightStyleEl = document.createElement('style');
    reviewHighlightStyleEl.id = 'threaddeck-review-highlight-style';
    reviewHighlightStyleEl.textContent = `
      ::highlight(threaddeck-review) {
        background-color: rgba(245, 184, 35, 0.30);
        text-decoration: underline;
        text-decoration-color: rgba(194, 120, 0, 0.72);
        text-decoration-thickness: 1.5px;
        text-underline-offset: 2px;
      }
    `;
    (document.head || document.documentElement).appendChild(reviewHighlightStyleEl);
  }



  function updateReviewHighlights() {
    const ids = new Set(reviewComments.map(c=>c.id));
    for (const [id,range] of tdReviewPainted) if (!ids.has(id)) {
      try { reviewHighlight?.delete(range); } catch {} tdReviewPainted.delete(id);
    }
    if (!settings.enabled || !settings.enableInlineComments || !reviewComments.length || isChatGptSharePage()) {
      clearReviewHighlights(); tdStopReviewAnchorWatch(); return;
    }
    tdEnsureReviewAnchorWatch();
    clearTimeout(reviewAnchorTimer); reviewAnchorTimer=null; tdReviewRestoreToken++;
    tdScheduleReviewRestore(0);
  }
  function tdScheduleReviewRestore(delay = 60) {
    if(reviewAnchorTimer!==null || !reviewComments.length)return;
    const scope=tdScope(),token=++tdReviewRestoreToken;
    reviewAnchorTimer=setTimeout(()=>{
      reviewAnchorTimer=null;
      if(!tdAlive(scope)||token!==tdReviewRestoreToken||!settings.enabled||!settings.enableInlineComments)return;
      if(tdSelectionBusy()){tdSelection.deferred=true;return;}
      if(tdSendingCritical()){tdScheduleReviewRestore(120);return;}
      const comments=reviewComments.slice(),catalog=tdReviewSectionCatalog(),revision=tdReviewRevision;let cursor=0;
      const step=()=>{
        reviewAnchorTimer=null;
        if(!tdAlive(scope)||token!==tdReviewRestoreToken||!settings.enableInlineComments)return;
        if(tdSelectionBusy()){tdSelection.deferred=true;return;}
      if(tdSendingCritical()){tdScheduleReviewRestore(120);return;}
        const start=performance.now();tdPerf.highlightPasses++;
        if(typeof CSS!=='undefined'&&CSS.highlights&&typeof Highlight==='function'){
          ensureReviewHighlightStyle();
          for(const root of tdDomScopes.shadows.keys()) if(root.host.isConnected && !root.querySelector('style[data-threaddeck-highlight]')) {
            const style=document.createElement('style');style.dataset.threaddeckHighlight='';style.dataset.threaddeckInternal='';style.textContent=reviewHighlightStyleEl.textContent;root.appendChild(style);
          }
          if(!reviewHighlight)reviewHighlight=new Highlight();
          CSS.highlights.set('threaddeck-review',reviewHighlight);
        }
        do {
          const c=comments[cursor++];if(!c)break;
          if(!reviewComments.includes(c))continue;
          const r=findRangeForReviewComment(c,catalog),old=tdReviewPainted.get(c.id);
          if(old&&old!==r){reviewHighlight?.delete(old);tdReviewPainted.delete(c.id);}
          if(r){reviewHighlight?.add(r);tdReviewPainted.set(c.id,r);}
        }while(cursor<comments.length&&performance.now()-start<5);
        tdPerf.highlightMaxSliceMs=Math.max(tdPerf.highlightMaxSliceMs,performance.now()-start);
        if(cursor<comments.length)reviewAnchorTimer=setTimeout(step,0);
        else if(revision!==tdReviewRevision)tdScheduleReviewRestore(70);
        else if(activeCommentMode==='compose'){
          const c=reviewComments.find(v=>v.id===activeCommentId),r=c&&tdLiveReviewRange(c);
          if(r)activeCommentAnchor=r;scheduleInlineCommentPosition();
        }
      };
      step();
    },delay);
  }
  function tdStopReviewAnchorWatch() {
    reviewAnchorObserver?.disconnect();reviewAnchorObserver=null;
    clearTimeout(reviewAnchorTimer);reviewAnchorTimer=null;tdReviewRestoreToken++;
    tdReviewIndexes=new WeakMap();tdReviewRootRevisions=new WeakMap();
  }
  function tdEnsureReviewAnchorWatch() {
    // document-start may run before body exists. Observing the document/root is
    // essential: otherwise restored comments never see hydration/remount events.
    if(!tdReviewLifecycleInstalled){
      tdReviewLifecycleInstalled=true;
      document.addEventListener('DOMContentLoaded',()=>{if(reviewComments.length)updateReviewHighlights();},{once:true});
      window.addEventListener('pageshow',()=>{if(reviewComments.length)updateReviewHighlights();});
      document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible'&&reviewComments.length)updateReviewHighlights();});
    }
    if(reviewAnchorObserver||!reviewComments.length)return;
    reviewAnchorObserver=new MutationObserver(mutations=>{
      if(tdDeferInteraction('highlight-observer')){tdInteraction.dirtyHighlights=true;return;}
      let relevant=false;const changed=new Set();
      for(const m of mutations){
        const el=nodeAsElement(m.target);
        if(el?.closest('#threaddeck-host,#threaddeck-review-highlight-style,[contenteditable="true"],[data-threaddeck-native-comment]'))continue;
        const root=el&&findAssistantAnchorFromNode(el);
        if(root){changed.add(root);relevant=true;}
        else if(m.type==='childList')relevant ||= [...m.addedNodes,...m.removedNodes].some(n=>n instanceof Element&&
          (n.matches(TD_DOM_BOUNDARY + ',' + tdDomRoleSelector('assistant') + ',main,body')||n.querySelector(TD_DOM_BOUNDARY + ',' + tdDomRoleSelector('assistant'))));
        else if(m.type==='attributes'&&el?.matches('main,[data-turn-id-container],[data-message-id],[data-turn]'))relevant=true;
      }
      for(const root of changed){tdReviewRootRevisions.set(root,(tdReviewRootRevisions.get(root)||0)+1);tdReviewIndexes.delete(root);}
      if(relevant){tdReviewRevision++;tdScheduleReviewRestore(70);}
    });
    tdDomObserveRoots(reviewAnchorObserver,{childList:true,subtree:true,characterData:true,attributes:true,
      attributeFilter:['data-message-id','data-turn-id','data-turn-id-container','data-node-id','data-message-author-role','data-message-role','data-author-role','data-role','data-item-id','data-turn','hidden','aria-hidden','data-state','data-channel']});
  }

  function tdReviewHitAt(x, y, target) {
    if (!tdEnabled() || !settings.enableInlineComments || !reviewComments.length || td.tx) return null;
    const element = nodeAsElement(target);
    if (!element || element.closest('a,button,[role="button"],input,textarea,select,[contenteditable="true"],#threaddeck-host')) return null;
    const section = findAssistantAnchorFromNode(element);
    if (!section) return null;
    const hits = [];
    for (const comment of reviewComments) {
      const range = tdLiveReviewRange(comment);
      if (!range || findAssistantAnchorFromNode(range.startContainer) !== section) continue;
      // Never use the union bounding box: blank space between wrapped lines is not a highlight.
      const rects = Array.from(range.getClientRects()).filter(r => r.width > 0 && r.height > 0);
      const rect = rects.find(r => x >= r.left && x <= r.right && y >= r.top && y <= r.bottom);
      if (rect) hits.push({ comment, range, rect, area: rects.reduce((sum, r) => sum + r.width * r.height, 0) });
    }
    // Overlapping annotations: the most specific selection wins; latest breaks equal ties.
    hits.sort((a, b) => a.area - b.area || b.comment.createdAt - a.comment.createdAt);
    return hits[0] || null;
  }

  function tdOpenReviewFromHighlight(commentId) {
    const comment = reviewComments.find(c => c.id === commentId);
    const range = comment && findRangeForReviewComment(comment);
    if (!range) return false;
    openInlineCommentComposer(commentId, range, false);
    return true;
  }

  function tdInstallReviewHitTesting() {
 if(reviewHitInstalled)return;reviewHitInstalled=true;
 window.addEventListener('pointerdown',event=>{
   reviewHitGesture=null;
   if(event.button!==0||event.altKey||event.ctrlKey||event.metaKey||event.shiftKey||event.isPrimary===false||!reviewComments.length)return;
   const el=nodeAsElement(event.composedPath?.()[0]||event.target);
   if(!tdSelectionAllowed(el)||el.closest('a'))return;
   // Do not index text or hit-test rectangles until a click has been established.
   reviewHitGesture={pointerId:event.pointerId,x:event.clientX,y:event.clientY,at:performance.now(),scope:tdScope(),released:false};
 },{capture:true,passive:true});
 window.addEventListener('pointerup',event=>{
   const g=reviewHitGesture;if(!g||g.pointerId!==event.pointerId)return;
   const selection=window.getSelection();
   if(!tdAlive(g.scope)||tdSelection.moved||Math.hypot(event.clientX-g.x,event.clientY-g.y)>5||
       (selection&&!selection.isCollapsed)||performance.now()-g.at>1200){reviewHitGesture=null;return;}
   g.released=true;
 },{capture:true,passive:true});
 window.addEventListener('pointercancel',()=>{reviewHitGesture=null;},{capture:true,passive:true});
 window.addEventListener('click',event=>{
   const g=reviewHitGesture;reviewHitGesture=null;
   if(!g?.released||!tdAlive(g.scope)||event.button!==0||event.detail!==1||event.altKey||event.ctrlKey||event.metaKey||event.shiftKey)return;
   const hit=tdReviewHitAt(event.clientX,event.clientY,event.composedPath?.()[0]||event.target);if(!hit)return;
   event.preventDefault();event.stopImmediatePropagation();clearTimeout(tdSelection.timer);tdSelection.timer=null;
   tdOpenReviewFromHighlight(hit.comment.id);
 },true);
}

  function nodeAsElement(node) {
    if (node instanceof Element) return node;
    return node?.parentElement instanceof Element ? node.parentElement : null;
  }

  function findAssistantAnchorFromNode(node) {
    const element = nodeAsElement(node);
    if (!element || isInsideComposer(element) || isLikelySidebarElement(element)) return null;
    return tdDomMessageFromNode(element, 'assistant');
  }

  function buildNormalizedTextIndex(root) {
    if (!(root instanceof Element)) return {text:'', pieces:[], pointAt:()=>null};
    const started = performance.now(), revision = tdReviewRootRevisions.get(root) || 0;
    const cached = tdReviewIndexes.get(root);
    if (cached?.revision === revision) return cached.index;
    const pieces = [], chunks = [];
    let length = 0, previousBlock = null, space = true, previousNode = null;
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {acceptNode(node) {
      const parent = node.parentElement;
      if (!parent || !node.nodeValue || parent.closest('button,[role="button"],script,style,textarea,input,[contenteditable="true"]') ||
          isReasoningOrCollapsedOutlineContext(parent, root)) return NodeFilter.FILTER_REJECT;
      return NodeFilter.FILTER_ACCEPT;
    }});
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const value = node.nodeValue || '';
      const block = node.parentElement.closest('p,li,h1,h2,h3,h4,h5,h6,pre,blockquote,div,section');
      // Selection.toString inserts visual paragraph boundaries; textContent does not.
      const hasBr = previousNode && previousNode.parentElement === node.parentElement && (()=>{
        let n = previousNode.nextSibling; while(n && n!==node){if(n.nodeName==='BR')return true;n=n.nextSibling;} return false;
      })();
      if (length && !space && (block !== previousBlock || hasBr)) {
        chunks.push(' '); pieces.push({start:length++, length:1, node, offsets:Uint32Array.of(0), virtual:true}); space = true;
      }
      const offsets = new Uint32Array(value.length); let count=0, chunk='';
      for (let i=0;i<value.length;i++) {
        const char=value[i]; if (/[\u200B-\u200D\uFEFF]/.test(char)) continue;
        const ws=/\s/.test(char);
        if (ws && space) continue;
        offsets[count++]=i; chunk+=ws?' ':char; space=ws;
      }
      if (count) { pieces.push({start:length,length:count,node,offsets:offsets.subarray(0,count),virtual:false});chunks.push(chunk);length+=count; }
      previousBlock=block;previousNode=node;
    }
    const text=chunks.join('').trimEnd();
    const index={text,pieces,pointAt(pos) {
      if (pos<0 || pos>=text.length)return null;
      let lo=0,hi=pieces.length-1;
      while(lo<=hi){const mid=(lo+hi)>>1,p=pieces[mid];if(pos<p.start)hi=mid-1;else if(pos>=p.start+p.length)lo=mid+1;else{
        const offset=p.offsets[pos-p.start];return {node:p.node,start:offset,end:p.virtual?offset:offset+1};
      }}return null;
    }};
    tdReviewIndexes.set(root,{revision,index});tdPerf.highlightBuilds++;
    tdPerf.highlightMaxSliceMs=Math.max(tdPerf.highlightMaxSliceMs,performance.now()-started);
    return index;
  }
  function createRangeFromNormalizedMatch(index, start, length) {
    if (!index || start<0 || length<=0)return null;
    const first=index.pointAt(start),last=index.pointAt(start+length-1);
    if(!first?.node?.isConnected || !last?.node?.isConnected)return null;
    try {const range=new Range();range.setStart(first.node,first.start);range.setEnd(last.node,last.end);return range;}catch{return null;}
  }

  function tdReviewIdentityTokens(section) {
    if (!(section instanceof Element)) return [];
    const nodes = new Set([section]);
    let parent = tdDomParent(section);
    for (let depth = 0; parent && depth < 5; depth++, parent = tdDomParent(parent)) {
      if (parent.matches('main,body,html,nav,aside,#thread,form') || tdDomHasForeignRole(parent,'assistant') || tdDomHasOtherMessage(parent,tdDomIds(section))) break;
      if (tdDomIds(parent).length) nodes.add(parent);
    }
    const tokens = new Set();
    for (const node of nodes) {
      for (const id of tdDomIds(node)) tokens.add(id);
      for (const attr of TD_DOM_ID_ATTRS) {
        const value = node.getAttribute(attr);
        if (value && value.length < 220) tokens.add(`${attr}:${value}`);
      }
    }
    return [...tokens];
  }

  function tdReviewSectionCatalog() {
    const catalog = new Map();
    for (const root of tdDomRoleRoots('assistant')) for (const id of tdReviewIdentityTokens(root)) {
      if (!catalog.has(id)) catalog.set(id, new Set());
      catalog.get(id).add(root);
    }
    return catalog;
  }

  function tdFindReviewSection(tokens, catalog = null) {
    const expected=new Set((tokens||[]).flatMap(token=>[token,String(token).replace(/^(?:data-message-id|data-turn-id|data-turn-id-container|data-node-id|id):/,'')]));
    if(!expected.size)return null;
    const byId=catalog || tdReviewSectionCatalog(),roots=new Set();
    for(const id of expected)for(const root of byId.get(id)||[])roots.add(root);
    return roots.size===1?[...roots][0]:null;
  }

  function buildReviewLocator(section, range, quote) {
    const root = section;
    const index = buildNormalizedTextIndex(root);
    const normalizedQuote = normalizeText(quote);
    const matches = [];
    for (let cursor = 0; normalizedQuote && cursor <= index.text.length - normalizedQuote.length;) {
      const found = index.text.indexOf(normalizedQuote, cursor);
      if (found < 0) break;
      matches.push(found);
      cursor = found + 1;
    }
    const occurrence = matches.findIndex((found) => {
      const first = index.pointAt(found);
      const last = index.pointAt(found + normalizedQuote.length - 1);
      try {
        return range.comparePoint(first.node, first.start) === 0 &&
          range.comparePoint(last.node, last.end) === 0;
      } catch { return false; }
    });
    const matchIndex = occurrence >= 0 ? matches[occurrence] : matches.length === 1 ? matches[0] : -1;
    return {
      prefix: matchIndex >= 0 ? index.text.slice(Math.max(0, matchIndex - 140), matchIndex) : '',
      suffix: matchIndex >= 0 ? index.text.slice(matchIndex + normalizedQuote.length, matchIndex + normalizedQuote.length + 140) : '',
      occurrence,
      occurrenceCount: matches.length,
      answerTokens: tdReviewIdentityTokens(section),
    };
  }


  function tdLiveReviewRange(comment) {
    const range = comment?.range;
    try {
      if (!(range instanceof Range) || range.collapsed || !range.startContainer?.isConnected ||
          !range.endContainer?.isConnected) return null;
      if (normalizeText(range.toString()).replace(/\s/g,'') !== normalizeText(comment.quote).replace(/\s/g,'')) return null;
      const start = findAssistantAnchorFromNode(range.startContainer);
      if (!start || start !== findAssistantAnchorFromNode(range.endContainer)) return null;
      return range;
    } catch { return null; }
  }

  function findRangeForReviewComment(comment, catalog = null) {
    const live = tdLiveReviewRange(comment);
    if (live) return live;
    if (!comment) return null;
    comment.range = null;
    const answer = {
      identityTokens: Array.isArray(comment.answerTokens) ? comment.answerTokens : [],
      target: null, skeletonTarget: null, turnId: '',
    };
    // An unanchored debug/legacy comment must not attach to an arbitrary answer.
    if (!answer.identityTokens.length) return null;
    const section = tdFindReviewSection(answer.identityTokens, catalog);
    if (!section) return null;
    const root = section;
    const index = buildNormalizedTextIndex(root);
    const quote = normalizeText(comment.quote);
    if (!quote) return null;
    const wantedPrefix = normalizeText(comment.prefix);
    const wantedSuffix = normalizeText(comment.suffix);
    const candidates = [];
    for (let cursor = 0; cursor <= index.text.length - quote.length;) {
      const found = index.text.indexOf(quote, cursor);
      if (found < 0) break;
      const prefix = index.text.slice(Math.max(0, found - wantedPrefix.length), found);
      const suffix = index.text.slice(found + quote.length, found + quote.length + wantedSuffix.length);
      const score = Number(Boolean(wantedPrefix && prefix.endsWith(wantedPrefix))) +
        Number(Boolean(wantedSuffix && suffix.startsWith(wantedSuffix)));
      candidates.push({ found, score, occurrence: candidates.length });
      cursor = found + 1;
    }
    if (!candidates.length) return null;
    const ranked = [...candidates].sort((a, b) => b.score - a.score);
    let best = ranked[0];
    if (ranked.length > 1 && best.score === ranked[1].score) {
      const ordinal = candidates[comment.occurrence];
      if (candidates.length !== comment.occurrenceCount || !ordinal || ordinal.score < 1 || ordinal.score !== best.score) return null;
      best = ordinal;
    }
    const range = createRangeFromNormalizedMatch(index, best.found, quote.length);
    if (range && !range.collapsed) comment.range = range;
    return range;
  }

  function reviewAnswerKeyFromTokens(tokens = []) {
    const values = Array.from(new Set((tokens || []).map((value) => normalizeText(value)).filter(Boolean))).sort();
    if (!values.length) return '';
    const strong = values.find((value) => /^[0-9a-f]{8}-[0-9a-f-]{20,}$/i.test(value))
      || values.find((value) => !value.includes(':') && value.length >= 8)
      || values[0];
    return `answer:${hashString(strong || values.join('|'))}`;
  }

  function getReviewAnswerKey(section, suppliedTokens = []) {
    if (!(section instanceof Element)) return reviewAnswerKeyFromTokens(suppliedTokens);
    const direct = [
      section.getAttribute('data-turn-id'),
      section.getAttribute('data-message-id'),
      section.getAttribute('data-node-id'),
      section.id,
    ].map(normalizeText).find(Boolean);
    if (direct) return `answer:${hashString(direct)}`;
    const tokens = suppliedTokens.length
      ? suppliedTokens
      : collectDomIdentityTokens(section, findAssistantContentRoot(section) || section);
    return reviewAnswerKeyFromTokens(tokens);
  }

  const ALL_COMMENTS_KEY = '__threaddeck_all_comments__';

  function commentsForAnswer(answerKey) {
    if (!answerKey || answerKey === ALL_COMMENTS_KEY) return reviewComments.slice();
    return reviewComments.filter((comment) => (
      (comment.answerKey || reviewAnswerKeyFromTokens(comment.answerTokens || [])) === answerKey
    ));
  }

  function findSectionForReviewComments(comments) {
    const first = comments?.[0];
    if (!first) return null;
    const answer = {
      identityTokens: Array.isArray(first.answerTokens) ? first.answerTokens : [],
      target: null,
      skeletonTarget: null,
      turnId: '',
    };
    return tdFindReviewSection(answer.identityTokens) || findAssistantSectionForAnswer(answer);
  }

  function clearInlineCommentBadges() {
    if (commentAggregateBadgeEl?.isConnected) commentAggregateBadgeEl.remove();
    commentAggregateBadgeEl = null;
    if (commentBadgeLayerEl) commentBadgeLayerEl.replaceChildren();
    scheduleQueueDockPosition();
  }

  function scheduleInlineCommentPosition() {
    if(tdSelectionBusy()){tdSelection.deferred=true;return;}
    if (commentPositionRaf !== null) return;
    commentPositionRaf = requestAnimationFrame(() => {
      commentPositionRaf = null;
      if(tdDeferInteraction('comment-frame'))return;
      positionInlineCommentBadges();
      positionInlineCommentPopover();
    });
  }

  function commentDockReferenceRect() {
    // Comments belong to the next prompt, so the single aggregate pill always hugs
    // the composer's upper edge. The prompt queue reserves this height and stacks
    // above it; the pill never follows individual answers or floats above the queue.
    const anchor = findChatGptComposerDockAnchor();
    if (!(anchor instanceof HTMLElement) || !isElementVisible(anchor)) return null;
    return anchor.getBoundingClientRect();
  }

  function positionInlineCommentBadges() {
    const button = commentAggregateBadgeEl;
    if (!(button instanceof HTMLElement) || !button.isConnected || !reviewComments.length) return;
    const referenceRect = commentDockReferenceRect();
    if (!referenceRect || referenceRect.width < 120 || referenceRect.bottom < 0 || referenceRect.top > window.innerHeight) {
      button.hidden = true;
      return;
    }
    button.hidden = false;
    const width = button.offsetWidth || 96;
    const height = button.offsetHeight || 36;
    const viewportMargin = 10;
    const left = Math.min(
      window.innerWidth - width - viewportMargin,
      Math.max(viewportMargin, referenceRect.right - width - 16),
    );
    // One conversation-level annotation pill is attached to the top edge of the
    // current composer stack (the queue when present, otherwise the composer).
    const top = Math.max(viewportMargin, referenceRect.top - height - COMMENT_BADGE_GAP_PX);
    button.style.left = `${Math.round(left)}px`;
    button.style.top = `${Math.round(top)}px`;
  }

  function syncInlineCommentBadges() {
    if (!commentBadgeLayerEl) return;
    if (
      site.id !== 'chatgpt' ||
      !isCurrentPageEligible() ||
      isChatGptSharePage() ||
      !settings.enabled ||
      !settings.enableInlineComments ||
      !reviewComments.length
    ) {
      clearInlineCommentBadges();
      return;
    }
    if (!(commentAggregateBadgeEl instanceof HTMLButtonElement) || !commentAggregateBadgeEl.isConnected) {
      commentBadgeLayerEl.replaceChildren();
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'comment-aggregate-badge';
      button.dataset.action = 'comment-open-thread';
      button.innerHTML = '<svg viewBox="0 0 18 18" aria-hidden="true"><path d="M3.5 4.25h11v7.5H8.25L5 14.5v-2.75H3.5z"/></svg><span></span>';
      commentBadgeLayerEl.appendChild(button);
      commentAggregateBadgeEl = button;
    }
    const label = tr('{0} 条批注', reviewComments.length);
    const labelNode = commentAggregateBadgeEl.querySelector('span');
    if (labelNode) labelNode.textContent = label;
    commentAggregateBadgeEl.setAttribute('aria-label', label);
    commentAggregateBadgeEl.title = label;
    scheduleInlineCommentPosition();
    scheduleQueueDockPosition();
  }

  function closeInlineCommentPopover({ discardEmptyNew = false } = {}) {
    if (discardEmptyNew && activeCommentWasNew && activeCommentId) {
      const comment = reviewComments.find((item) => item.id === activeCommentId);
      if (comment && !normalizeMultilineText(comment.note)) {
        reviewComments = reviewComments.filter((item) => item.id !== activeCommentId);
        updateReviewHighlights();
        scheduleWorkflowSave();
        syncInlineCommentBadges();
      }
    }
    activeCommentMode = '';
    activeCommentId = '';
    activeCommentAnswerKey = '';
    activeCommentAnchor = null;
    activeCommentWasNew = false;
    if (commentPopoverEl) {
      commentPopoverEl.hidden = true;
      delete commentPopoverEl.dataset.mode;
      delete commentPopoverEl.dataset.placement;
      delete commentPopoverEl.dataset.multiline;
    }
    if (commentPopoverBodyEl) commentPopoverBodyEl.replaceChildren();
    // Stop watching once the composer closes, but keep the old native portal hidden.
    // ChatGPT may leave it mounted after Selection is cleared. The next real text
    // selection restores it synchronously before we integrate the button again.
    stopNativeSelectionSuppressionObserver();
  }

  function openInlineCommentComposer(commentId, anchor, isNew = false) {
    const comment = reviewComments.find((item) => item.id === commentId);
    if (!comment || !commentPopoverEl || !commentPopoverBodyEl) return;
    activeCommentMode = 'compose';
    activeCommentId = commentId;
    activeCommentAnswerKey = comment.answerKey || reviewAnswerKeyFromTokens(comment.answerTokens || []);
    activeCommentAnchor = anchor || comment.range || null;
    activeCommentWasNew = isNew;
    const anchorRect = activeCommentAnchorRect();
    const toolbar = nativeSelectionToolbarEl;
    const rect = anchorRect ? { left: anchorRect.left, right: anchorRect.right, top: anchorRect.top,
      bottom: anchorRect.bottom, width: anchorRect.width, height: anchorRect.height } : null;
    dismissNativeSelectionToolbar(toolbar, rect);
    hideSelectionAction();
    try { window.getSelection()?.removeAllRanges(); } catch {}
    renderInlineCommentPopover();
    const scope = tdScope();
    window.setTimeout(() => {
      if (!tdAlive(scope) || tdSelectionBusy() || activeCommentMode !== 'compose' || activeCommentId !== commentId) return;
      const input = commentPopoverEl?.querySelector('[data-comment-compose]');
      if (input instanceof HTMLTextAreaElement) {
        input.focus({ preventScroll: true });
        input.setSelectionRange(input.value.length, input.value.length);
      }
    }, 0);
  }

  function openInlineCommentThread(answerKey = ALL_COMMENTS_KEY, anchor = null) {
    const key = answerKey || ALL_COMMENTS_KEY;
    if (!commentsForAnswer(key).length || !commentPopoverEl || !commentPopoverBodyEl) return;
    activeCommentMode = 'thread';
    activeCommentAnswerKey = key;
    activeCommentId = '';
    activeCommentAnchor = anchor || commentAggregateBadgeEl || null;
    activeCommentWasNew = false;
    renderInlineCommentPopover();
  }

  function saveActiveCommentComposer({ showFeedback = true } = {}) {
    const textarea = commentPopoverEl?.querySelector('[data-comment-compose]');
    const comment = reviewComments.find((item) => item.id === activeCommentId);
    if (!comment || !(textarea instanceof HTMLTextAreaElement)) return false;
    comment.note = textarea.value;
    activeCommentWasNew = false;
    scheduleWorkflowSave();
    syncInlineCommentBadges();
    closeInlineCommentPopover();
    if (showFeedback) showToast(tr('批注已保存'), 1000);
    return true;
  }

  function renderInlineCommentPopover() {
    if (!commentPopoverEl || !commentPopoverBodyEl || !activeCommentMode) return;
    const fragment = document.createDocumentFragment();
    if (activeCommentMode === 'compose') {
      const comment = reviewComments.find((item) => item.id === activeCommentId);
      if (!comment) {
        closeInlineCommentPopover();
        return;
      }
      const shell = createWorkflowElement('div', 'comment-compose-shell');
      const textarea = createWorkflowElement('textarea', 'comment-compose-input');
      textarea.rows = 1;
      textarea.placeholder = tr('写下批注');
      textarea.value = comment.note || '';
      textarea.dataset.commentCompose = comment.id;
      textarea.setAttribute('aria-label', tr('写下批注'));
      textarea.setAttribute('aria-keyshortcuts', 'Enter Alt+Enter Shift+Enter');
      const send = createWorkflowElement('button', 'comment-compose-send');
      send.type = 'button';
      send.dataset.action = 'comment-compose-save';
      send.setAttribute('aria-label', tr('保存批注'));
      send.title = tr('保存批注');
      send.innerHTML = threadDeckIcon('check');
      shell.append(textarea, send);
      fragment.appendChild(shell);
    } else {
      const comments = commentsForAnswer(activeCommentAnswerKey);
      if (!comments.length) {
        closeInlineCommentPopover();
        return;
      }
      const header = createWorkflowElement('div', 'comment-thread-header');
      header.appendChild(createWorkflowElement('strong', 'comment-thread-title', tr('{0} 条批注', comments.length)));
      const close = createWorkflowElement('button', 'comment-thread-close');
      close.type = 'button';
      close.dataset.action = 'comment-popover-close';
      close.setAttribute('aria-label', tr('关闭批注'));
      close.innerHTML = '<svg viewBox="0 0 18 18" aria-hidden="true"><path d="m5 5 8 8M13 5l-8 8"/></svg>';
      header.appendChild(close);
      fragment.appendChild(header);
      const list = createWorkflowElement('div', 'comment-thread-list');
      comments.forEach((comment, index) => {
        const card = createWorkflowElement('article', 'comment-thread-card');
        const quote = createWorkflowElement('button', 'comment-thread-quote', truncateText(comment.quote, 180));
        quote.type = 'button';
        quote.dataset.action = 'jump-comment';
        quote.dataset.commentId = comment.id;
        quote.title = comment.quote;
        const note = createWorkflowElement('textarea', 'comment-thread-note');
        note.rows = 2;
        note.placeholder = tr('批注 {0}', index + 1);
        note.value = comment.note || '';
        note.dataset.commentNote = comment.id;
        const remove = createWorkflowElement('button', 'comment-thread-delete');
        remove.type = 'button';
        remove.dataset.action = 'remove-comment';
        remove.dataset.commentId = comment.id;
        remove.setAttribute('aria-label', tr('删除批注 {0}', index + 1));
        remove.title = tr('删除');
        remove.innerHTML = threadDeckIcon('trash');
        card.append(quote, note, remove);
        list.appendChild(card);
      });
      fragment.appendChild(list);
    }
    commentPopoverBodyEl.replaceChildren(fragment);
    commentPopoverEl.dataset.mode = activeCommentMode;
    commentPopoverEl.hidden = false;
    requestAnimationFrame(() => {
      const compose = commentPopoverEl.querySelector('.comment-compose-input');
      if (compose instanceof HTMLTextAreaElement) {
        tdResizeCommentComposer(compose);
      }
      scheduleInlineCommentPosition();
    });
  }


  function tdResizeCommentComposer(input) {
    if (!(input instanceof HTMLTextAreaElement) || !commentPopoverEl) return;
    input.style.height = 'auto';
    const natural = input.scrollHeight;
    const limit = Math.max(48, Math.min(224, window.innerHeight - 140));
    const multiline = input.value.includes('\n') || natural > 32;
    commentPopoverEl.dataset.multiline = String(multiline);
    input.style.maxHeight = `${limit}px`;
    input.style.height = `${Math.min(limit, Math.max(24, natural))}px`;
    input.style.overflowY = natural > limit ? 'auto' : 'hidden';
  }

  function activeCommentAnchorRect() {
    const anchor = activeCommentAnchor;
    try {
      if (anchor instanceof Range) return anchor.getBoundingClientRect();
      if (anchor instanceof Element) return anchor.getBoundingClientRect();
      if (anchor && Number.isFinite(anchor.left) && Number.isFinite(anchor.top)) return anchor;
    } catch {
      // Fall back to the answer badge.
    }
    return commentAggregateBadgeEl?.getBoundingClientRect?.() || null;
  }

  function positionInlineCommentPopover() {
    if (!commentPopoverEl || commentPopoverEl.hidden) return;
    const anchorRect = activeCommentAnchorRect();
    if (!anchorRect) {
      commentPopoverEl.hidden = true;
      return;
    }

    let contentRect = null;
    if (activeCommentMode === 'compose') {
      const comment = reviewComments.find((item) => item.id === activeCommentId);
      const section = comment ? findSectionForReviewComments([comment]) : null;
      const content = section ? (findAssistantContentRoot(section) || section) : null;
      if (content instanceof Element && isElementVisible(content)) contentRect = content.getBoundingClientRect();
    }

    const viewportMargin = 10;
    const availableWidth = Math.max(280, window.innerWidth - viewportMargin * 2);
    const contextualWidth = contentRect?.width >= 300
      ? Math.min(COMMENT_POPOVER_MAX_WIDTH_PX, Math.max(300, contentRect.width * 0.72))
      : COMMENT_POPOVER_MAX_WIDTH_PX;
    const width = Math.min(contextualWidth, availableWidth);
    const nextWidth = `${Math.round(width)}px`;
    if (commentPopoverEl.style.width !== nextWidth) {
      commentPopoverEl.style.width = nextWidth;
      tdResizeCommentComposer(commentPopoverEl.querySelector('[data-comment-compose]'));
    }
    const popoverRect = commentPopoverEl.getBoundingClientRect();

    let minLeft = viewportMargin;
    let maxLeft = window.innerWidth - popoverRect.width - viewportMargin;
    if (contentRect && contentRect.width >= popoverRect.width) {
      minLeft = Math.max(minLeft, contentRect.left);
      maxLeft = Math.min(maxLeft, contentRect.right - popoverRect.width);
    }
    if (maxLeft < minLeft) {
      minLeft = viewportMargin;
      maxLeft = window.innerWidth - popoverRect.width - viewportMargin;
    }
    const preferredLeft = anchorRect.left + anchorRect.width / 2 - popoverRect.width / 2;
    const left = Math.min(maxLeft, Math.max(minLeft, preferredLeft));

    // Codex places the compact comment composer immediately above the selected text.
    // Keep the bottom edge visually attached to the selection, and only flip below
    // when the viewport cannot fit the composer above it.
    const above = anchorRect.top - popoverRect.height - COMMENT_POPOVER_GAP_PX;
    const below = anchorRect.bottom + COMMENT_POPOVER_GAP_PX;
    const canPlaceAbove = above >= viewportMargin;
    const top = canPlaceAbove
      ? above
      : Math.min(window.innerHeight - popoverRect.height - viewportMargin, below);
    commentPopoverEl.dataset.placement = canPlaceAbove ? 'above' : 'below';
    commentPopoverEl.style.left = `${Math.round(left)}px`;
    commentPopoverEl.style.top = `${Math.round(Math.max(viewportMargin, top))}px`;
  }

  function ensureNativeSelectionSuppressionStyle() {
    if (document.getElementById('threaddeck-native-selection-suppression')) return;
    const style = document.createElement('style');
    style.id = 'threaddeck-native-selection-suppression';
    style.textContent = '[data-threaddeck-suppressed="true"]{opacity:0!important;visibility:hidden!important;pointer-events:none!important;}';
    (document.head || document.documentElement).appendChild(style);
  }

  function stopNativeSelectionSuppressionObserver() {
    if (nativeSelectionSuppressionObserver) nativeSelectionSuppressionObserver.disconnect();
    nativeSelectionSuppressionObserver = null;
    if (nativeSelectionSuppressionRaf !== null) cancelAnimationFrame(nativeSelectionSuppressionRaf);
    nativeSelectionSuppressionRaf = null;
  }

  function suppressNativeSelectionToolbar(toolbar) {
    if(tdDeferInteraction('native-selection-suppression'))return;
    if (!(toolbar instanceof HTMLElement) || !toolbar.isConnected) return false;
    ensureNativeSelectionSuppressionStyle();
    if (toolbar.dataset.threaddeckSuppressed !== 'true') {
      toolbar.dataset.threaddeckSuppressed = 'true';
    }
    suppressedNativeSelectionToolbarEls.add(toolbar);
    return true;
  }

  function restoreSuppressedNativeSelectionToolbar(toolbar = null) {
    if (toolbar instanceof HTMLElement) {
      suppressedNativeSelectionToolbarEls.delete(toolbar);
      if (toolbar.isConnected) toolbar.removeAttribute('data-threaddeck-suppressed');
      return;
    }
    stopNativeSelectionSuppressionObserver();
    nativeSelectionSuppressionRect = null;
    const candidates = new Set([
      ...suppressedNativeSelectionToolbarEls,
      ...safeQueryAll(document, '[data-threaddeck-suppressed="true"]'),
    ]);
    for (const candidate of candidates) {
      if (candidate instanceof HTMLElement && candidate.isConnected) {
        // Only remove our attribute. Never restore the toolbar's whole inline
        // `style`: ChatGPT reuses its portal and updates left/top/transform.
        candidate.removeAttribute('data-threaddeck-suppressed');
      }
    }
    suppressedNativeSelectionToolbarEls.clear();
  }

  function suppressReplacementNativeSelectionToolbar() {
    if(tdSelectionBusy())return;
    if (!nativeSelectionSuppressionRect) return;
    const match = findNativeSelectionToolbar(nativeSelectionSuppressionRect);
    if (match?.root instanceof HTMLElement) suppressNativeSelectionToolbar(match.root);
  }

  function keepNativeSelectionToolbarSuppressed(selectionRect, toolbar = nativeSelectionToolbarEl) {
    stopNativeSelectionSuppressionObserver();
    nativeSelectionSuppressionRect = selectionRect && Number.isFinite(selectionRect.left)
      ? { ...selectionRect }
      : null;
    suppressNativeSelectionToolbar(toolbar);
    if (!document.documentElement || !nativeSelectionSuppressionRect) return;

    const queueSuppressionCheck = () => {
      if (nativeSelectionSuppressionRaf !== null) return;
      nativeSelectionSuppressionRaf = requestAnimationFrame(() => {
        nativeSelectionSuppressionRaf = null;
        suppressReplacementNativeSelectionToolbar();
      });
    };
    nativeSelectionSuppressionObserver = new MutationObserver(queueSuppressionCheck);
    nativeSelectionSuppressionObserver.observe(document.documentElement, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['class', 'style', 'role', 'hidden', 'aria-label', 'aria-hidden', 'data-state', 'data-side', 'data-testid'],
    });
    queueSuppressionCheck();
  }

  function dismissNativeSelectionToolbar(toolbar = nativeSelectionToolbarEl, selectionRect = pendingSelection?.selectionRect) {
    stopNativeSelectionSearch();
    if (nativeSelectionButtonEl?.isConnected) nativeSelectionButtonEl.remove();
    nativeSelectionButtonEl = null;
    nativeSelectionToolbarEl = null;

    // Suppress ChatGPT's native selection popover for the full lifetime of the
    // ThreadDeck comment composer. The previous 360 ms timeout made it reappear
    // over the composer, and React can replace the portal while it is open.
    restoreSuppressedNativeSelectionToolbar();
    keepNativeSelectionToolbarSuppressed(selectionRect, toolbar);
  }

  function stopNativeSelectionSearch() {
    clearTimeout(nativeSelectionFallbackTimer);
    nativeSelectionSearchLifecycle?.abort();
    nativeSelectionFallbackTimer = null;
    nativeSelectionSearchLifecycle = null;
    nativeSelectionObserver?.disconnect();
    nativeSelectionObserver = null;
  }

  function clearNativeSelectionAction() {
    stopNativeSelectionSearch();
    if (nativeSelectionButtonEl?.isConnected) nativeSelectionButtonEl.remove();
    for (const orphan of safeQueryAll(document, '[data-threaddeck-selection-comment="true"]')) orphan.remove();
    nativeSelectionButtonEl = null;
    nativeSelectionToolbarEl = null;
  }

  function hideSelectionAction(clearPending = true) {
    nativeSelectionIntegrationToken += 1;
    clearNativeSelectionAction();
    if (clearPending) pendingSelection = null;
    if (selectionActionEl) selectionActionEl.hidden = true;
  }

  function positionSelectionAction(rect) {
    if (!selectionActionEl || !rect) return;
    const width = 78, height = 34, gap = 8;
    const obstacles = [];
    const composer = getComposerBoundary();
    if (composer) obstacles.push(composer.getBoundingClientRect());
    for (const node of safeQueryAll(document, '[popover]:popover-open,[role="toolbar"],[role="menu"],[data-radix-popper-content-wrapper],[data-state="open"][data-side],[data-testid*="selection" i]')) {
      if (node.closest('#threaddeck-host,#prompt-rail-host') || !isElementVisible(node)) continue;
      const r = node.getBoundingClientRect();
      if (r.width < 640 && r.height < 160 && rectDistance(r, rect) < 260) obstacles.push(r);
    }
    const placements = [
      [rect.right + gap, rect.top], [rect.right - width, rect.top - height - gap],
      [rect.left, rect.bottom + gap], [rect.left - width - gap, rect.top],
      ...obstacles.flatMap(r => [[r.right + gap, r.top], [r.left - width - gap, r.top], [r.left, r.top - height - gap], [r.left, r.bottom + gap]])
    ].map(([x,y]) => {
      const left = Math.min(Math.max(gap, x), Math.max(gap, innerWidth - width - gap));
      const top = Math.min(Math.max(gap, y), Math.max(gap, innerHeight - height - gap));
      const box = {left,top,right:left+width,bottom:top+height,width,height};
      return {box,score:obstacles.reduce((n,r) => n + rectOverlapRatio(box,r)*10000,0) + rectOverlapRatio(box,rect)*500 + rectDistance(box,rect)};
    }).sort((a,b) => a.score-b.score);
    const box = placements[0].box;
    const left = `${Math.round(box.left)}px`, top = `${Math.round(box.top)}px`;
    if (selectionActionEl.style.left !== left) selectionActionEl.style.left = left;
    if (selectionActionEl.style.top !== top) selectionActionEl.style.top = top;
    if (selectionActionEl.hidden) selectionActionEl.hidden = false;
    tdDomState.selection = 'fallback-visible';
  }

  function rectDistance(left, right) {
    if (!left || !right) return Number.POSITIVE_INFINITY;
    const dx = left.right < right.left ? right.left - left.right : right.right < left.left ? left.left - right.right : 0;
    const dy = left.bottom < right.top ? right.top - left.bottom : right.bottom < left.top ? left.top - right.bottom : 0;
    return Math.hypot(dx, dy);
  }

  function rectOverlapRatio(left, right) {
    if (!left || !right || left.width <= 0 || left.height <= 0 || right.width <= 0 || right.height <= 0) return 0;
    const width = Math.max(0, Math.min(left.right, right.right) - Math.max(left.left, right.left));
    const height = Math.max(0, Math.min(left.bottom, right.bottom) - Math.max(left.top, right.top));
    const area = width * height;
    return area / Math.max(1, Math.min(left.width * left.height, right.width * right.height));
  }

  function elementActionText(element) {
    if (!(element instanceof Element)) return '';
    const parts = [
      element.getAttribute('aria-label'),
      element.getAttribute('title'),
      element.getAttribute('data-testid'),
      element.getAttribute('data-slot'),
      element.getAttribute('data-action'),
      element.textContent,
    ];
    for (const control of safeQueryAll(element, 'button, [role="button"]')) {
      parts.push(
        control.getAttribute('aria-label'),
        control.getAttribute('title'),
        control.getAttribute('data-testid'),
        control.getAttribute('data-action'),
        control.textContent,
      );
    }
    return normalizeText(parts.filter(Boolean).join(' ')).toLowerCase();
  }

  function isNativeSelectionPrimaryAction(element) {
    const text = elementActionText(element);
    if (!text) return false;
    return /(?:ask\s*chatgpt|ask\s+about\s+(?:this|selection)|询问\s*chatgpt|詢問\s*chatgpt|问问\s*chatgpt|問問\s*chatgpt|向\s*chatgpt\s*(?:提问|提問|询问|詢問)|add\s+to\s+(?:chat|conversation)|添加到(?:聊天|对话|對話)|加入(?:聊天|对话|對話)|引用到(?:聊天|对话|對話))/.test(text);
  }

  function getComposerBoundary() {
    const composer = getChatGptComposer();
    if (!(composer instanceof HTMLElement)) return null;
    // 找不到明确的输入区容器时，只采用与正文隔离的直接父级。
    const turns = TD_DOM_ROLE_ATTRS.map(a => `[${a}="assistant"],[${a}="user"]`).join(',') +
      ',[data-turn-id-container],[data-testid^="conversation-turn-"]';
    let fallback = composer;
    let node = composer.parentElement;
    for (let i = 0; node && i < 7; i++, node = node.parentElement) {
      if (node.matches('main,body,html,#thread') || node.querySelector(turns)) break;
      if (node.matches('[data-testid="composer"],form,input-area-v2,[class*="composer" i]')) return node;
      if (i === 0) fallback = node;
    }
    return fallback;
  }

  function elementBelongsToConversationTurn(element) {
    if (!(element instanceof Element)) return false;
    return Boolean(element.closest(tdDomRoleSelector('assistant') + ',' + tdDomRoleSelector('user') + ',' + TD_DOM_BOUNDARY));
  }

  function hasFloatingOverlayAncestorInsideTurn(element) {
    if (!(element instanceof HTMLElement)) return false;
    const turn = element.closest(tdDomRoleSelector('assistant') + ',' + tdDomRoleSelector('user') + ',' + TD_DOM_BOUNDARY);
    if (!(turn instanceof Element)) return false;
    let current = element;
    for (let depth = 0; current instanceof HTMLElement && depth < 8; depth += 1, current = current.parentElement) {
      const rect = current.getBoundingClientRect();
      const style = getComputedStyle(current);
      const role = normalizeText(current.getAttribute('role')).toLowerCase();
      const explicit = current.matches(
        '[popover]:popover-open, [data-radix-popper-content-wrapper], [data-floating-ui-portal], [data-state="open"][data-side], [data-slot*="popover" i], [data-testid*="selection" i]',
      );
      if (
        (explicit || ['fixed', 'absolute'].includes(style.position)) &&
        rect.width >= 28 && rect.width <= Math.min(560, window.innerWidth - 12) &&
        rect.height >= 22 && rect.height <= 112
      ) return true;
      if (current === turn) break;
    }
    return false;
  }

  function isNativeSelectionToolbarDecoy(element) {
    if (!(element instanceof HTMLElement) || !element.isConnected || element.getRootNode() !== document) return true;
    if (element === navHost || element.closest('#prompt-rail-host, #threaddeck-host')) return true;
    if (element.closest('nav, aside, [role="navigation"]')) return true;
    // A few ChatGPT rollouts mount the transient selection portal inside the
    // assistant turn. Reject persistent turn controls, but allow a compact
    // fixed/absolute toolbar with genuine selection semantics.
    if (elementBelongsToConversationTurn(element) && !hasFloatingOverlayAncestorInsideTurn(element)) return true;

    const composer = getChatGptComposer();
    const boundary = getComposerBoundary();
    for (const region of [composer, boundary]) {
      if (!(region instanceof HTMLElement)) continue;
      if (element === region || region.contains(element) || element.contains(region)) return true;
      const elementRect = element.getBoundingClientRect();
      const regionRect = region.getBoundingClientRect();
      if (rectOverlapRatio(elementRect, regionRect) >= 0.34) return true;
      const centerX = elementRect.left + elementRect.width / 2;
      const centerY = elementRect.top + elementRect.height / 2;
      if (
        centerX >= regionRect.left && centerX <= regionRect.right &&
        centerY >= regionRect.top && centerY <= regionRect.bottom
      ) return true;
    }

    // Never mount into the persistent action row at the end of an answer. Those rows
    // commonly contain Copy/Retry controls and were the main source of the drifting
    // button reported in v0.7.4.
    if (safeQueryAll(element, '[data-turn], [data-message-author-role], #prompt-textarea, [contenteditable="true"]').length) {
      return true;
    }
    return false;
  }

  function isCompactFloatingOverlay(element) {
    if (!(element instanceof HTMLElement) || !isElementVisible(element)) return false;
    const rect = element.getBoundingClientRect();
    if (rect.width < 28 || rect.height < 22 || rect.width > Math.min(560, window.innerWidth - 12) || rect.height > 112) {
      return false;
    }
    const role = (element.getAttribute('role') || '').toLowerCase();
    const explicitOverlay = Boolean(
      role === 'toolbar' ||
      role === 'menu' ||
      element.matches('[data-radix-popper-content-wrapper], [data-radix-menu-content], [data-floating-ui-portal], [data-headlessui-portal], [data-state="open"][data-side], [data-slot*="popover" i], [data-testid*="selection" i]'),
    );
    const style = getComputedStyle(element);
    return explicitOverlay || ['fixed', 'absolute'].includes(style.position);
  }

  function findCompactFloatingRoot(element) {
    if (!(element instanceof HTMLElement)) return null;
    let current = element;
    let best = null;
    for (let depth = 0; current && depth < 9; depth += 1, current = current.parentElement) {
      if (current === document.body || current === document.documentElement) break;
      if (isNativeSelectionToolbarDecoy(current)) continue;
      if (isCompactFloatingOverlay(current)) best = current;
      const rect = current.getBoundingClientRect();
      if (rect.width > 640 || rect.height > 150) break;
    }
    return best;
  }

  function nativeToolbarGeometryScore(element, selectionRect) {
    if (!(element instanceof HTMLElement) || !selectionRect) return Number.NEGATIVE_INFINITY;
    const rect = element.getBoundingClientRect();
    const distance = rectDistance(rect, selectionRect);
    if (distance > NATIVE_SELECTION_TOOLBAR_MAX_DISTANCE_PX) return Number.NEGATIVE_INFINITY;

    const horizontalGap = rect.right < selectionRect.left
      ? selectionRect.left - rect.right
      : selectionRect.right < rect.left
        ? rect.left - selectionRect.right
        : 0;
    const verticalGap = rect.bottom < selectionRect.top
      ? selectionRect.top - rect.bottom
      : selectionRect.bottom < rect.top
        ? rect.top - selectionRect.bottom
        : 0;
    if (horizontalGap > 260 || verticalGap > 150) return Number.NEGATIVE_INFINITY;

    let score = 14 - distance / 18;
    if (horizontalGap === 0) score += 2.5;
    if (verticalGap <= 56) score += 3;
    if (rect.bottom <= selectionRect.top + 18 || rect.top >= selectionRect.bottom - 18) score += 1.5;
    return score;
  }

  function findNativeSelectionToolbar(selectionRect) {
    let best = null;
    // ChatGPT 的选区气泡位于页面自身的浮层。通用工具条及扩展的影子根不参与匹配。
    for (const anchor of safeQueryAll(document,NATIVE_SELECTION_PRIMARY_SELECTOR)) {
      if (!isElementVisible(anchor) || !isNativeSelectionPrimaryAction(anchor) || isNativeSelectionToolbarDecoy(anchor)) continue;
      const root = findCompactFloatingRoot(anchor);
      if (!root) continue;
      const score = nativeToolbarGeometryScore(root,selectionRect);
      if (Number.isFinite(score) && (!best || score > best.score)) best = {root,anchor,score};
    }
    return best;
  }

  function findNativeToolbarButtonContainer(toolbar, anchorButton = null) {
    if (!(toolbar instanceof HTMLElement)) return null;
    const anchor = anchorButton instanceof HTMLElement && toolbar.contains(anchorButton)
      ? anchorButton
      : safeQueryAll(toolbar, 'button, [role="button"]').find((button) => (
        isElementVisible(button) && !button.matches('[data-threaddeck-selection-comment="true"]')
      )) || null;
    if (!(anchor instanceof HTMLElement)) return toolbar;

    let current = anchor.parentElement;
    let oneActionFallback = current;
    while (current && toolbar.contains(current)) {
      const rect = current.getBoundingClientRect();
      if (rect.width > 580 || rect.height > 112) break;
      const style = getComputedStyle(current);
      const actionChildren = Array.from(current.children).filter((child) => {
        if (!(child instanceof HTMLElement) || !isElementVisible(child)) return false;
        return child.matches('button, [role="button"]') || Boolean(child.querySelector('button, [role="button"]'));
      });
      if (actionChildren.length >= 2 && ['flex', 'inline-flex', 'grid', 'inline-grid'].includes(style.display)) return current;
      if (actionChildren.length >= 1 && !oneActionFallback) oneActionFallback = current;
      if (current === toolbar) break;
      current = current.parentElement;
    }
    return oneActionFallback || anchor.parentElement || toolbar;
  }

  function tdDomActionVisible(button) {
    if (!(button instanceof HTMLElement) || !isElementVisible(button)) return false;
    const r = button.getBoundingClientRect(), x = r.left + r.width / 2, y = r.top + r.height / 2;
    if (x < 0 || y < 0 || x >= innerWidth || y >= innerHeight) return false;
    for (let p = button; p; p = tdDomParent(p)) {
      const style = getComputedStyle(p);
      if (style.display === 'none' || style.visibility !== 'visible' || Number(style.opacity) < .8) return false;
      const box = p.getBoundingClientRect();
      if (/(hidden|clip|auto|scroll)/.test(style.overflowX) && (x < box.left || x > box.right)) return false;
      if (/(hidden|clip|auto|scroll)/.test(style.overflowY) && (y < box.top || y > box.bottom)) return false;
      if (p.matches('body,html')) break;
    }
    const tree = button.getRootNode();
    const hit = (tree.elementsFromPoint?.(x,y) || document.elementsFromPoint(x,y))[0];
    return hit === button || button.contains(hit);
  }

  function createNativeSelectionButton(toolbar, template) {
    const tree = toolbar.getRootNode();
    if (!tree.getElementById?.('threaddeck-selection-style')) {
      const style = document.createElement('style');
      style.id = 'threaddeck-selection-style';
      style.textContent = [
        '[data-threaddeck-selection-comment="true"]{appearance:none;display:inline-flex;align-items:center;justify-content:center;gap:5px;',
        'margin:0;min-block-size:var(--td-selection-height,28px);padding-block:0;padding-inline:var(--td-selection-padding,8px);',
        'border:0;border-radius:var(--td-selection-radius,0px);font:inherit;font-size:var(--td-selection-size,14px);',
        'font-weight:var(--td-selection-weight,400);line-height:var(--td-selection-line,1.3);letter-spacing:var(--td-selection-tracking,normal);',
        'white-space:nowrap;cursor:pointer;flex:none;color:var(--td-selection-ink,currentColor);',
        'opacity:1;background:var(--td-selection-surface,Canvas);transition:background-color 120ms cubic-bezier(.2,.7,.3,1)}',
        '[data-threaddeck-selection-comment="true"]:hover,[data-threaddeck-selection-comment="true"]:active{',
        'background:color-mix(in srgb,var(--td-selection-surface,Canvas) 91%,var(--td-selection-ink,currentColor))}',
        '[data-threaddeck-selection-comment="true"]:focus-visible{outline:2px solid currentColor;outline-offset:-2px}',
        '[data-threaddeck-selection-comment="true"] svg{width:16px;height:16px;flex:none}',
        '@media(prefers-reduced-motion:reduce){[data-threaddeck-selection-comment="true"]{transition:none}}',
      ].join('');
      (tree instanceof ShadowRoot ? tree : document.documentElement).append(style);
    }
    const button = document.createElement('button');
    button.type = 'button';
    button.dataset.threaddeckSelectionComment = 'true';
    tdDomState.selection = 'native-button-created';
    button.setAttribute('aria-label', tr('添加批注'));
    button.innerHTML = threadDeckIcon('annotation');
    const label = document.createElement('span');
    label.textContent = tr('批注');
    button.append(label);
    const sibling = template || toolbar;
    const inherited = getComputedStyle(sibling);
    const surface = tdZoomBackground(sibling.parentElement, document.documentElement);
    button.style.fontFamily = inherited.fontFamily;
    button.style.setProperty('--td-selection-height', Math.max(28,Math.min(44,sibling.getBoundingClientRect().height))+'px');
    button.style.setProperty('--td-selection-radius', inherited.borderRadius);
    button.style.setProperty('--td-selection-padding', inherited.paddingInline || '8px');
    button.style.setProperty('--td-selection-size', inherited.fontSize);
    button.style.setProperty('--td-selection-weight', inherited.fontWeight);
    button.style.setProperty('--td-selection-line', inherited.lineHeight);
    button.style.setProperty('--td-selection-tracking', inherited.letterSpacing);
    button.style.setProperty('--td-selection-ink', inherited.color);
    if(surface)button.style.setProperty('--td-selection-surface',surface);

    const preserveSelection = (event) => {
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
    };
    button.addEventListener('pointerdown', preserveSelection, true);
    button.addEventListener('mousedown', preserveSelection, true);
    button.addEventListener('click', (event) => {
      preserveSelection(event);
      if (pendingSelection) addPendingReviewComment();
    }, true);
    return button;
  }

  function attachNativeSelectionAction(match) {
    const toolbar = match?.root;
    const anchor = match?.anchor;
    if (!(toolbar instanceof HTMLElement) || !toolbar.isConnected || isNativeSelectionToolbarDecoy(toolbar)) return false;
    let button = toolbar.querySelector('[data-threaddeck-selection-comment="true"]');
    if (!(button instanceof HTMLButtonElement) || button !== nativeSelectionButtonEl) {
      const container = findNativeToolbarButtonContainer(toolbar,anchor);
      if (!(container instanceof HTMLElement) || isNativeSelectionToolbarDecoy(container)) return false;
      // 复用同一个按钮。宿主复制的节点没有原点击处理器。
      button?.remove();
      nativeSelectionButtonEl?.remove();
      button = createNativeSelectionButton(toolbar,anchor);
      container.appendChild(button);
    }
    nativeSelectionButtonEl = button;
    nativeSelectionToolbarEl = toolbar;
    // 先移开我们自己的备用入口，再检查组合按钮能否点到。
    const showFallback = selectionActionEl && !selectionActionEl.hidden;
    if (showFallback) selectionActionEl.hidden = true;
    const visible = tdDomActionVisible(button);
    if (showFallback && !visible) selectionActionEl.hidden = false;
    return visible;
  }

  function scheduleNativeSelectionIntegration(selectionRect) {
    if (tdSelectionBusy()) return;
    const token = ++nativeSelectionIntegrationToken;
    clearNativeSelectionAction();
    if (selectionActionEl) selectionActionEl.hidden = true;

    const lifecycle = new AbortController();
    nativeSelectionSearchLifecycle = lifecycle;
    const alive = () => !lifecycle.signal.aborted && token === nativeSelectionIntegrationToken &&
      !document.hidden && !tdSelectionBusy() && pendingSelection;
    const attach = () => {
      if (!alive()) return false;
      try {
        const match = findNativeSelectionToolbar(selectionRect);
        return Boolean(match && attachNativeSelectionAction(match));
      } catch (error) {
        tdSelection.lastError = String(error?.name || 'Error');
        return false;
      }
    };

    // 宿主迟到的浮层与重挂载都属于同一选区。只在相关 DOM 变化后重新结合。
    const matchesPrimary = node => node instanceof HTMLElement &&
      (node.matches(NATIVE_SELECTION_PRIMARY_SELECTOR) || node.querySelector(NATIVE_SELECTION_PRIMARY_SELECTOR));
    const reconcile = () => {
      if (!alive()) return;
      if (attach()) selectionActionEl.hidden = true;
      else if (nativeSelectionFallbackTimer === null) positionSelectionAction(selectionRect);
    };
    let queued = false;
    const queueAttach = () => {
      if (queued || !alive()) return;
      queued = true;
      requestAnimationFrame(() => {
        queued = false;
        reconcile();
      });
    };
    nativeSelectionObserver = new MutationObserver(records => {
      if (nativeSelectionToolbarEl && !nativeSelectionToolbarEl.isConnected) {
        queueAttach();
        return;
      }
      if (records.some(record => record.type === 'attributes'
        ? matchesPrimary(record.target)
        : Array.from(record.addedNodes).some(matchesPrimary) ||
          record.removedNodes.length > 0 && nativeSelectionToolbarEl?.contains(record.target))) queueAttach();
    });
    nativeSelectionObserver.observe(document.body || document.documentElement, {
      childList:true, subtree:true, attributes:true,
      attributeFilter:['class','hidden','style','role','aria-label','aria-hidden','data-state','data-testid'],
    });
    const onHostAnimationEnd = event => { if (matchesPrimary(event.target)) queueAttach(); };
    for (const name of ['animationend','transitionend']) {
      document.addEventListener(name,onHostAnimationEnd,{capture:true,signal:lifecycle.signal});
    }
    nativeSelectionFallbackTimer = setTimeout(() => {
      nativeSelectionFallbackTimer = null;
      reconcile();
    }, NATIVE_SELECTION_TOOLBAR_FALLBACK_MS);
    queueAttach();
  }

  function tdSelectionAnchorRect(range) {
    let clip = {left:0,top:0,right:innerWidth,bottom:innerHeight};
    const common = nodeAsElement(range.commonAncestorContainer);
    for (let n=common;n && !n.matches('html,body');n=tdDomParent(n)) {
      const style=getComputedStyle(n);
      if (style.display==='contents') continue;
      const r=n.getBoundingClientRect();
      if (/(auto|scroll|hidden|clip)/.test(style.overflowX)) {clip.left=Math.max(clip.left,r.left);clip.right=Math.min(clip.right,r.right);}
      if (/(auto|scroll|hidden|clip)/.test(style.overflowY)) {clip.top=Math.max(clip.top,r.top);clip.bottom=Math.min(clip.bottom,r.bottom);}
    }
    const rects=Array.from(range.getClientRects()).filter(r=>r.width>0 && r.height>0);
    const visible=rects.map(r=>({left:Math.max(r.left,clip.left),right:Math.min(r.right,clip.right),top:Math.max(r.top,clip.top),bottom:Math.min(r.bottom,clip.bottom)}))
      .filter(r=>r.right>r.left && r.bottom>r.top).map(r=>({...r,width:r.right-r.left,height:r.bottom-r.top}));
    const point=tdSelection.releasePoint;
    if (point?.serial===tdSelection.serial && visible.length) {
      const distance=r=>Math.hypot(Math.max(r.left-point.x,0,point.x-r.right),Math.max(r.top-point.y,0,point.y-r.bottom));
      return visible.reduce((best,r)=>distance(r)<distance(best)?r:best,visible[0]);
    }
    return visible.at(-1) || null;
  }

  function captureReviewSelection() {
    if(tdSelectionBusy()){tdSelectionSnapshot();return;}
    tdSelection.analyses++;
    if (td.writing || !settings.enabled || td.tx || (activeCommentMode === 'compose' && shadowRoot?.activeElement?.matches?.('[data-comment-compose]'))) return;
    const nativeSelection = window.getSelection();
    const saved=tdSelection.sample;
    const frozenRange=tdSelectionSavedRange();
    const nativeAnswerSelection=nativeSelection&&!nativeSelection.isCollapsed&&tdSelectionAllowed(nativeSelection.anchorNode)&&tdSelectionAllowed(nativeSelection.focusNode);
    const nativeRange=nativeAnswerSelection?tdDomSelectionRange(nativeSelection):null;
    const usableNative=nativeRange && !nativeRange.collapsed && nativeRange.startContainer.isConnected && nativeRange.endContainer.isConnected;
    const selection=usableNative?nativeSelection:frozenRange?{rangeCount:1,isCollapsed:false,
      anchorNode:frozenRange.startContainer,focusNode:frozenRange.endContainer,getRangeAt:()=>frozenRange}:nativeSelection;
    // A new non-collapsed selection means ChatGPT is about to reuse or replace its
    // native portal. Restore every portal we suppressed for the previous comment
    // before evaluating the new selection, even if inline comments were disabled.
    if (selection && selection.rangeCount === 1 && !selection.isCollapsed && suppressedNativeSelectionToolbarEls.size) {
      restoreSuppressedNativeSelectionToolbar();
    }
    if (
      site.id !== 'chatgpt' ||
      !isCurrentPageEligible() ||
      isChatGptSharePage() ||
      !settings.enableInlineComments ||
      !selectionActionEl
    ) {
      hideSelectionAction();
      return;
    }
    if (!selection || selection.rangeCount !== 1 || selection.isCollapsed) {
      // ChatGPT may briefly collapse the browser Selection while lazily mounting its
      // first native selection toolbar. Keep the captured Range during that grace
      // window so our button can still be injected on the very first selection.
      if (pendingSelection && Date.now() - Number(pendingSelection.capturedAt || 0) < NATIVE_SELECTION_PENDING_TTL_MS) return;
      hideSelectionAction();
      return;
    }
    const range = tdDomSelectionRange(selection);
    if(!range || range.collapsed)return;
    const prior=tdSelection.lastAnalyzed;
    if(prior&&prior.epoch===td.epoch&&prior.serial===tdSelection.serial&&prior.a===range.startContainer&&prior.b===range.endContainer&&prior.ao===range.startOffset&&prior.bo===range.endOffset&&pendingSelection&&
      (tdDomActionVisible(nativeSelectionButtonEl)||selectionActionEl&&!selectionActionEl.hidden))return;
    tdSelection.lastAnalyzed={epoch:td.epoch,serial:tdSelection.serial,a:range.startContainer,b:range.endContainer,ao:range.startOffset,bo:range.endOffset};
    if(isInsideComposer(nodeAsElement(range.startContainer)) || tdDomClosest(nodeAsElement(range.startContainer),"#threaddeck-host,#prompt-rail-host")){hideSelectionAction();return;}
    tdDomState.lastShape = [];
    for (let n = nodeAsElement(range.startContainer), i = 0; n && i < 7; n = tdDomParent(n), i++) { tdDomState.lastShape.push(tdDomShape(n)); if (n.matches('main,body')) break; }
    let startSection = findAssistantAnchorFromNode(range.startContainer);
    if(!startSection && performance.now()-tdDomScopes.recoveryAt>1200){tdDomScopes.recoveryAt=performance.now();tdDomCensus(true);startSection=findAssistantAnchorFromNode(range.startContainer);}
    const endSection = findAssistantAnchorFromNode(range.endContainer);
    if (!startSection || startSection !== endSection) {
      tdDomState.selection = !startSection ? 'answer-container-not-recognized' : 'cross-message-selection';
      tdDomRememberSelection(tdDomState.selection,range);
      hideSelectionAction();
      return;
    }
    tdDomState.selection = 'answer-recognized';
    tdDomRememberSelection('answer-recognized',range,true);
    tdHealth.selectionSample={kind:'settled-non-editor-selection',ancestors:tdStructurePath(range.startContainer)};
    const selectedText = range.toString();
    const quote = normalizeInlineReviewText(selectedText);
    const tooLong = quote.length > REVIEW_SELECTION_MAX_CHARS;
    tdSelection.lengthCheck = {rawChars:selectedText.length,normalizedChars:quote.length,
      minimum:REVIEW_SELECTION_MIN_CHARS,maximum:REVIEW_SELECTION_MAX_CHARS,
      reason:!quote ? 'empty' : tooLong ? 'over-save-limit' : 'accepted'};
    if (!quote) {
      tdDomState.selection='empty-selection';tdDomRememberSelection('empty-selection',range,true);
      hideSelectionAction();return;
    }
    const rect = tdSelectionAnchorRect(range);
    if (!rect || (!rect.width && !rect.height)) {
      tdDomRememberSelection('selection-geometry-missing',range,true);
      hideSelectionAction();
      return;
    }
    const rectSnapshot = {
      left: rect.left,
      right: rect.right,
      top: rect.top,
      bottom: rect.bottom,
      width: rect.width,
      height: rect.height,
    };
    // The previous native toolbar is only restored after a new valid answer selection
    // exists. This avoids resurrecting a stale popup on transient collapsed Selection
    // events while still allowing ChatGPT to reuse its portal for the next selection.
    restoreSuppressedNativeSelectionToolbar();
    const answerTokens = tdReviewIdentityTokens(startSection);
    const sameSelection = Boolean(
      pendingSelection &&
      pendingSelection.section === startSection &&
      pendingSelection.quoteLength === quote.length && pendingSelection.quote === (tooLong ? quote.slice(0,REVIEW_SELECTION_MAX_CHARS+1) : quote) &&
      Math.abs(Number(pendingSelection.selectionRect?.top || 0) - rectSnapshot.top) < 2 &&
      Math.abs(Number(pendingSelection.selectionRect?.left || 0) - rectSnapshot.left) < 2
    );
    pendingSelection = {
      range: range.cloneRange(),
      quote: tooLong ? quote.slice(0,REVIEW_SELECTION_MAX_CHARS+1) : quote,
      quoteLength:quote.length,tooLong,
      section: startSection,
      answerTokens,
      answerKey: getReviewAnswerKey(startSection, answerTokens),
      selectionRect: rectSnapshot,
      capturedAt: Date.now(),
      locatorReady:false,
    };
    // The browser commonly emits pointerup, mouseup and selectionchange for the same
    // first selection. Reinitialising here would remove the button we just injected.
    tdDomState.selection=tooLong?'selection-too-long':'selection-ready';
    tdDomRememberSelection(tdDomState.selection,range,true);
    if (!sameSelection || !nativeSelectionObserver) {
      scheduleNativeSelectionIntegration(rectSnapshot);
    }
  }
  function addPendingReviewComment() {
    if (!pendingSelection?.quote || !(pendingSelection.range instanceof Range)) {
      showToast('请先在回答中选择一段文字', 1600);
      return;
    }
    const captured = pendingSelection;
    if(captured.tooLong){showToast(`所选文本超过 ${REVIEW_SELECTION_MAX_CHARS.toLocaleString()} 字符，请缩小选区后添加注释；未截断或提交任何内容`,4500);return;}
    if(!captured.range.startContainer.isConnected || !captured.range.endContainer.isConnected)return;
    Object.assign(captured,buildReviewLocator(captured.section,captured.range,captured.quote));
    captured.locatorReady=true;
    const comment = {
      id: makeLocalId('comment'),
      quote: captured.quote,
      note: '',
      prefix: captured.prefix || '',
      suffix: captured.suffix || '',
      occurrence: captured.occurrence,
      occurrenceCount: captured.occurrenceCount,
      answerTokens: captured.answerTokens || [],
      answerKey: captured.answerKey || reviewAnswerKeyFromTokens(captured.answerTokens || []),
      createdAt: Date.now(),
      range: captured.range.cloneRange(),
    };
    reviewComments.push(comment);
    // openInlineCommentComposer owns native-toolbar dismissal for add and edit alike.
    updateReviewHighlights();
    scheduleWorkflowSave();
    syncInlineCommentBadges();
    openInlineCommentComposer(comment.id, comment.range, true);
  }
  async function jumpToReviewComment(commentId) {
    const comment = reviewComments.find((item) => item.id === commentId);
    if (!comment) return;
    const range = findRangeForReviewComment(comment);
    if (!range) {
      showToast('原文当前未挂载或无法唯一匹配', 2200);
      return;
    }
    const target = nodeAsElement(range.startContainer);
    if (!target) return;
    const token = ++navigationToken;
    const ok = await scrollTargetIntoView(target, token);
    if (!ok || token !== navigationToken) return;
    const root = findScrollableAncestor(target) || currentScrollRoot || findScrollRoot();
    const rect = range.getBoundingClientRect();
    const residual = rect.top - desiredViewportTop(root);
    if (Math.abs(residual) > 3) scrollRootBy(root, residual, 'auto');
    openInlineCommentComposer(comment.id, range, false);
  }

  function getChatGptComposer() {
    const selectors = ['#prompt-textarea[contenteditable="true"]', 'textarea#prompt-textarea', '[data-testid="composer"] [contenteditable="true"]', 'form textarea[data-testid="prompt-textarea"]', '[data-composer-markdown][contenteditable="true"][role="textbox"]', 'form textarea[placeholder]', 'form [contenteditable="true"][role="textbox"]'];
    for (const selector of selectors) {
      const found = safeQueryAll(document, selector).find((node) => node instanceof HTMLElement && node.isConnected &&
        isElementVisible(node) && !node.closest('#threaddeck-host,#prompt-rail-host,[data-message-author-role],nav,aside,[role="dialog"]'));
      if (found) return found;
    }
    return null;
  }

  function getComposerText(composer = getChatGptComposer()) {
    if (!composer) return '';
    if (composer instanceof HTMLTextAreaElement || composer instanceof HTMLInputElement) return normalizeMultilineText(composer.value);
    // innerText depends on CSS and may turn <div><br></div> into TWO newlines.
    // Read editor blocks deterministically; do not mutate the editor to normalise it.
    const blocks = new Set(['P','DIV','LI','H1','H2','H3','H4','H5','H6','PRE','BLOCKQUOTE']);
    const read = (node, depth = 0) => {
      if (node.nodeType === Node.TEXT_NODE) return node.nodeValue || '';
      if (!(node instanceof Element) || depth > 60) return '';
      if (node.matches('script,style,[aria-hidden="true"],.ProseMirror-trailingBreak')) return '';
      if (node.tagName === 'BR') return '\n';
      if (node.childNodes.length === 1 && node.firstChild instanceof HTMLBRElement) return '';
      let value = ''; let hasNode = false; let previousBlock = false;
      for (const child of node.childNodes) {
        const block = child instanceof Element && blocks.has(child.tagName);
        if (hasNode && (block || previousBlock)) value += '\n';
        value += read(child, depth + 1);
        hasNode = true; previousBlock = block;
      }
      return value;
    };
    return normalizeMultilineText(read(composer).replace(/\u00a0/g,' '));
  }

  function dispatchComposerInput(composer, data = null) {
    if (!(composer instanceof HTMLElement)) return;
    try {
      composer.dispatchEvent(new InputEvent('input', {
        bubbles: true,
        composed: true,
        inputType: data ? 'insertText' : 'deleteContent',
        data,
      }));
    } catch {
      composer.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
    }
    composer.dispatchEvent(new Event('change', { bubbles: true, composed: true }));
  }


  function composerHasAttachments(composer = getChatGptComposer()) {
    if (!composer) return false;
    const container = composer.closest('form,[data-composer-surface-variant]') || composer.parentElement?.parentElement || composer.parentElement;
    if (!(container instanceof Element)) return false;
    const selectors = [
      '[data-testid="composer-attachment"]',
      '[data-testid*="attachment"][data-state]',
      'button[aria-label*="remove file" i]',
      'button[aria-label*="移除文件" i]',
      'button[aria-label*="删除附件" i]',
      '[class*="attachment" i] img',
      '[class*="file-pill" i]',
    ];
    return selectors.some((selector) => safeQueryAll(container, selector).some(isElementVisible));
  }

  // v1.9.1: logical submission ownership must not depend on the visual dock's
  // height/width score. The queue dock remains presentation-only.
  const TD_COMPOSER_SHELLS = '[data-testid="composer"],[data-composer-surface-variant],[data-composer-layout],[data-composer-input-variant]';
  const TD_CONTROL_EXCLUDED = '#threaddeck-host,#prompt-rail-host,nav,aside,[role="navigation"],'+
    '[data-message-author-role],[data-conversation-role],[data-user-message-bubble],'+
    '[data-chatgpt-selection-message-id],[data-chatgpt-search-message-ids],'+
    '[data-turn="assistant"],[data-turn="user"],[data-testid^="conversation-turn-"],'+
    '[contenteditable="true"],textarea,input';

  function tdComposerControlScope(composer = getChatGptComposer()) {
    if (!(composer instanceof HTMLElement) || !composer.isConnected) return {composer:null,form:null,roots:[]};
    const form = composer.form instanceof HTMLFormElement ? composer.form : composer.closest('form');
    const roots = new Set();
    const add = node => { if (node instanceof HTMLElement && node.isConnected &&
      !node.matches('main,body,html,#thread,[role="main"]') && !node.closest(TD_CONTROL_EXCLUDED)) roots.add(node); };
    // Include the actual form even if a rollout wraps the transcript in it;
    // individual candidate controls are still excluded from authored messages.
    if (form) roots.add(form);
    let node = composer.parentElement;
    for (let depth=0;node && depth<10;depth++,node=node.parentElement) {
      if (node.matches('main,body,html,#thread,[role="main"]')) break;
      if (node.querySelector('[data-thread-find-target],[data-conversation-role],[data-message-author-role],[data-user-message-bubble]')) break;
      if (depth<2 || node.matches(TD_COMPOSER_SHELLS) || node===form) add(node);
      if (node===form) break;
    }
    return {composer,form,roots:[...roots].filter(root=>![...roots].some(other=>other!==root&&other.contains(root)))};
  }

  function tdControlBelongs(button, scope) {
    if (!(button instanceof HTMLElement) || !scope.composer || !button.isConnected ||
        !button.matches('button,[role="button"]') || button.closest(TD_CONTROL_EXCLUDED)) return false;
    const form = button.form instanceof HTMLFormElement ? button.form : button.closest('form');
    if (form && form !== scope.form) return false;
    if (button.hasAttribute('form') && button.form !== scope.form) return false;
    if (!scope.roots.some(root=>root.contains(button)) && !(scope.form && button.form===scope.form)) return false;
    const shell=button.closest(TD_COMPOSER_SHELLS);
    if (shell && !shell.contains(scope.composer) &&
        shell.querySelector('textarea,[contenteditable="true"]')) return false;
    const popup=button.closest('[role="dialog"],[role="menu"],[role="listbox"]');
    if (popup && !popup.contains(scope.composer)) return false;
    return true;
  }

  function tdControlName(button) {
    const values=['aria-label','title','data-testid','data-test-id','data-action'].map(k=>button.getAttribute(k)||'');
    const ids=(button.getAttribute('aria-labelledby')||'').trim().split(/\s+/).filter(Boolean).slice(0,8);
    const root=button.getRootNode();
    for (const id of ids) {
      const label=root.getElementById?.(id) || button.ownerDocument.getElementById(id);
      if (label && !label.matches('textarea,input,[contenteditable="true"]') &&
          !label.closest('[data-message-author-role],[data-conversation-role],#threaddeck-host'))
        values.push((label.textContent||'').slice(0,160));
    }
    values.push((button.textContent||'').slice(0,240));
    // data-state is runtime state, not an accessible action name. In particular
    // "closed" must not disable the otherwise valid icon-only fallback.
    return normalizeText(values.join(' ')).toLowerCase();
  }

  function tdControlEnabled(button) {
    return Boolean(button?.isConnected && isElementVisible(button) &&
      !button.disabled && !button.matches(':disabled') &&
      !button.closest('[inert],[hidden],[aria-hidden="true"],[aria-disabled="true"]') &&
      getComputedStyle(button).pointerEvents !== 'none');
  }

  function tdControlFact(button, scope) {
    if (!tdControlBelongs(button,scope) || !isElementVisible(button) ||
        button.closest('[hidden],[aria-hidden="true"]')) return null;
    const hint=tdControlName(button), enabled=tdControlEnabled(button);
    const fact=(kind,score,evidence)=>({button,kind,score,evidence,enabled});
    // Negative actions always win. Never turn a voice/Stop/upload control into
    // Send just because an author left type="submit" on it.
    if (/\bstop\b|stop-button|stop generating|停止生成|停止响应|停止回答|中止回答|^停止$/.test(hint) || looksLikeStopGlyph(button))
      return fact('stop',100,'stop');
    if (/cancel|interrupt|abort|voice|microphone|audio|model|attach|upload|file|tools?|delete|remove|retry|regenerate|取消|中止|语音|麦克风|模型|附件|上传|工具|添加|删除|移除|重试|重新生成/i.test(hint)) return fact('other',0,'excluded-action');
    if (/\bsteer\b|adjust direction|调整方向|更改方向|发送插话|^插话$/.test(hint))return fact('steer',100,'steer-label');
    const testId=`${button.getAttribute('data-testid')||''} ${button.getAttribute('data-test-id')||''} ${button.getAttribute('data-action')||''}`;
    if (/(?:^|\s)(?:send-button|send-message|send-prompt|composer-send|composer-submit|send|submit)(?:$|\s)/i.test(testId))return fact('send',100,'action-attribute');
    if (/(?:\bsend(?:\s+(?:message|prompt))?\b|\bsubmit\b|发送|提交问题)/i.test(hint))return fact('send',90,button.hasAttribute('aria-labelledby')?'referenced-label':'action-label');
    if (button.getAttribute('type')==='submit' && scope.form && button.form===scope.form)return fact('send',80,'form-submit');
    const svg=button.querySelector('svg'),use=svg?.querySelector('use');
    if (svg && /arrow[-_]?up|\bsend\b/i.test(`${svg.getAttribute('data-icon')||''} ${use?.getAttribute('href')||use?.getAttribute('xlink:href')||''}`))return fact('send',60,'named-send-icon');
    if (!hint && svg) {
      // Preserve the old narrow, recognized arrow path fallback. Geometry alone
      // and arbitrary SVGs are not permission to click a button.
      const r=button.getBoundingClientRect();
      const bounds=scope.composer.getBoundingClientRect();
      const paths=safeQueryAll(svg,'path').map(n=>n.getAttribute('d')||'').join(' ');
      if (r.width>=24 && r.width<=72 && r.height>=24 && r.height<=72 && r.right>=bounds.right-85 &&
          /(?:M\s*12\s+19.*[Vv].*(?:5|6)|[mM]\s*5\s+12.*7[- ,]7|[mM]\s*7\s+10.*5[- ,]5)/i.test(paths))
        return fact('send',45,'recognized-arrow');
    }
    return fact('other',0,'unrecognized');
  }

  function tdComposerControlFacts(composer = getChatGptComposer()) {
    const scope=tdComposerControlScope(composer), candidates=new Set();
    for (const root of scope.roots) for (const b of safeQueryAll(root,'button,[role="button"]')) candidates.add(b);
    // HTML form ownership also includes submitters rendered outside its subtree.
    for (const b of Array.from(scope.form?.elements || [])) if(b.matches?.('button,[role="button"]'))candidates.add(b);
    const facts=[...candidates].map(b=>tdControlFact(b,scope)).filter(Boolean);
    return {scope,facts};
  }

  function tdChooseComposerControl(kind='send', requireEnabled=true, state=tdComposerControlFacts()) {
    const matches=state.facts.filter(f=>f.kind===kind && (!requireEnabled||f.enabled)).sort((a,b)=>b.score-a.score);
    if(!matches.length)return {button:null,reason:'missing',kind,eligible:0,state};
    const peers=matches.filter(f=>f.score===matches[0].score);
    if(peers.length!==1)return {button:null,reason:'ambiguous',kind,eligible:peers.length,state};
    return {...matches[0],reason:'resolved',eligible:1,state};
  }

  function findChatGptSendButton() {
    return tdChooseComposerControl('send',true).button;
  }


  function getButtonAccessibleText(button) {
    if (!(button instanceof HTMLElement)) return '';
    return normalizeText([
      button.getAttribute('aria-label'),
      button.getAttribute('title'),
      button.getAttribute('data-testid'),
      button.getAttribute('data-test-id'),
      button.getAttribute('data-state'),
      button.getAttribute('data-action'),
      button.textContent,
    ].filter(Boolean).join(' ')).toLowerCase();
  }

  function looksLikeStopGlyph(button) {
    if (!(button instanceof HTMLElement)) return false;
    const svg = button.querySelector('svg'); if (!(svg instanceof SVGElement)) return false;
    const use = svg.querySelector('use');
    const hint = `${svg.getAttribute('data-icon') || ''} ${svg.getAttribute('aria-label') || ''} ${use?.getAttribute('href') || ''}`;
    if (/stop|interrupt|停止|中止/i.test(hint)) return true;
    for (const rect of safeQueryAll(svg, 'rect')) {
      const w = Number(rect.getAttribute('width')), h = Number(rect.getAttribute('height'));
      if (w >= 5 && h >= 5 && Math.abs(w-h) <= Math.max(w,h)*.16 && !rect.matches('[fill="none"]')) return true;
    }
    // Closed arrow paths also contain H/V commands. Sample the geometry instead
    // of treating every closed orthogonal path as a Stop square.
    for (const path of safeQueryAll(svg, 'path')) {
      if (!(path instanceof SVGPathElement) || !/[zZ]\s*$/.test(path.getAttribute('d') || '')) continue;
      try {
        const r = path.getBBox(), length = path.getTotalLength();
        if (r.width < 5 || r.height < 5 || r.width/r.height < .82 || r.width/r.height > 1.22) continue;
        const ratio = length/(2*(r.width+r.height)); if (ratio < .88 || ratio > 1.08) continue;
        let edges=0;
        for (let i=0;i<32;i++) { const p=path.getPointAtLength(length*i/32); const dx=Math.min(Math.abs(p.x-r.x),Math.abs(p.x-r.x-r.width))/r.width; const dy=Math.min(Math.abs(p.y-r.y),Math.abs(p.y-r.y-r.height))/r.height; if(Math.min(dx,dy)<.055)edges++; }
        if (edges >= 28) return true;
      } catch { /* Unrendered symbols are not a reliable stop signal. */ }
    }
    return false;
  }

  function findChatGptStopControl() {
    if (site.id !== 'chatgpt' || !isCurrentPageEligible() || isChatGptSharePage()) return null;
    const composer = getChatGptComposer();
    const scope = tdComposerControlScope(composer);
    const logical = tdComposerControlFacts(composer).facts.find(f=>f.kind==='stop');
    if (logical) return logical.button;
    const dock = scope.form || scope.roots.at(-1);
    const latest = getLatestAssistantSection();
    for (const root of [dock, latest].filter(Boolean)) {
      for (const button of safeQueryAll(root, 'button,[role="button"]')) {
        if (!(button instanceof HTMLElement) || !isElementVisible(button) || button.closest('details:not([open]),[aria-hidden="true"],#threaddeck-host')) continue;
        const label = getButtonAccessibleText(button);
        if (/stop-button|stop generating|stop response|停止生成|停止响应|停止回答|中止回答|^stop$|^停止$/.test(label) ||
            (root === dock && !/voice|语音|麦克风|attach|附件/.test(label) && looksLikeStopGlyph(button))) return button;
      }
    }
    return null;
  }

  function getChatGptAssistantSections() { return tdDomRoleRoots('assistant'); }

  function getLatestAssistantSection() {
    return getChatGptAssistantSections().at(-1) || null;
  }

  function getChatGptUserSections() { return tdDomRoleRoots('user'); }

  function chatGptUserSectionText(section) {
 if(!(section instanceof HTMLElement))return '';
 const bubble=section.matches(TD_USER_BODY)?section:safeQueryAll(section,TD_USER_BODY).find(n=>!n.closest('button,[role="button"]'));
 return tdReceiptReadText(bubble||section);
}







  function resetChatGptActivityState() {
    chatGptActivityPhase = 'idle'; chatGptActivityEvidence = [];
    tdResetTurnVerifier();
    chatGptNetworkTokens.clear(); td.activityCache = null; td.activityDirty = true;
    td.run = null; td.lastUser = ''; td.lastFinal = ''; td.finalChangedAt = 0; td.settleSince = 0;
  }



  function markChatGptNetworkStart() {
    if (!settings.enabled || !isCurrentPageEligible() || isChatGptSharePage() || getRouteKey() !== routeKey) return '';
    // Regenerate/native background starts need a new local generation identity too.
    // Otherwise the previous completed proof can hide a newly opened stream.
    if (!td.run || (tdTurn.proof?.state==='complete' && tdProofApplies(tdTurn.proof,tdLocalUserSnapshot(),td.run))) tdArmRun('observed-network');
    const token = `n${++chatGptNetworkTokenSerial}`;
    chatGptNetworkTokens.set(token, { epoch: td.epoch, serial: tdTurn.serial, startedAt: Date.now(), lastActivityAt: Date.now() });
    td.activityDirty = true; tdWake();
    return token;
  }

  function markChatGptNetworkChunk(token) {
    const record = chatGptNetworkTokens.get(token);
    if (!record || record.epoch !== td.epoch) return;
    record.lastActivityAt = Date.now(); td.activityDirty = true;
  }

  function markChatGptNetworkEnd(token) {
    if (chatGptNetworkTokens.delete(token)) { td.activityDirty = true; tdWake(80); }
    // EOF means transport completion only. The UI/current turn owns queue release.
  }

  function requestMethodAndUrl(input, init = {}) {
    let method = normalizeText(init?.method || '').toUpperCase();
    let url = '';
    try {
      if (typeof input === 'string' || input instanceof URL) url = String(input);
      else if (input && typeof input.url === 'string') {
        url = input.url;
        if (!method && input.method) method = String(input.method).toUpperCase();
      }
      url = new URL(url, location.href).href;
    } catch {
      url = String(url || '');
    }
    return { method: method || 'GET', url };
  }

  function isLikelyChatGptGenerationRequest(input, init = {}) {
    const { method, url } = requestMethodAndUrl(input, init);
    if (method !== 'POST') return false;
    try {
      const target = new URL(url, location.href);
      if (target.origin !== location.origin) return false;
      // Exclude prepare, title, feedback, moderation and ordinary conversation GETs.
      return /^\/backend-api\/(?:f\/)?conversation\/?$/.test(target.pathname) ||
        /^\/backend-api\/conversation\/[\w-]+\/(?:resume|continue|stream)\/?$/.test(target.pathname);
    } catch { return false; }
  }

  function monitorChatGptResponse(response, token) {
    const record = chatGptNetworkTokens.get(token);
    if (!record) return;
    tdReceiptRequestOutcome(token,response);
    if (!response?.ok) { markChatGptNetworkEnd(token); tdLog('generation-http-error', String(response?.status || 0)); return; }
    const type = response.headers?.get('content-type') || '';
    if (!/event-stream|ndjson|json/i.test(type)) { markChatGptNetworkEnd(token); return; }
    const scope = tdScope();
    let reader;
    try { reader = response.clone().body?.getReader(); } catch {}
    if (!reader) { markChatGptNetworkEnd(token); return; }
    td.networkReaders.add(reader);
    const stop = () => { try { void reader.cancel().catch(() => {}); } catch {} };
    scope.signal.addEventListener('abort', stop, { once: true });
    const timeout = setTimeout(stop, 30 * 60 * 1000);
    void (async () => {
      const decoder = new TextDecoder(); let bytes = 0; let tail = ''; let droppedLine = false;
      try {
        while (tdAlive(scope)) {
          const { value, done } = await reader.read();
          while(tdSelectionBusy()&&tdAlive(scope))if(!await tdDelay(80,scope))return;
          if (done) {
            tail+=decoder.decode();
            if(!droppedLine && tail.trim().startsWith('{') && tail.length<=131072)try{tdReceiptObserveGeneration(JSON.parse(tail),token);}catch{}
            break;
          }
          bytes += value?.byteLength || 0;
          if (bytes > 8 * 1024 * 1024) { stop(); break; }
          markChatGptNetworkChunk(token);
          // Parse complete, bounded protocol records. Never join state flags from
          // different chunks/messages or mistake [DONE] for a finished final answer.
          tail += decoder.decode(value, { stream: true });
          let newline;
          while ((newline = tail.indexOf('\n')) >= 0) {
            const line = tail.slice(0,newline).replace(/^data:\s*/, '').trim(); tail = tail.slice(newline+1);
            if (droppedLine) { droppedLine=false; continue; }
            if (!line.startsWith('{') || line.length>131072) continue;
            try {
              const obj=JSON.parse(line), msg=obj.message || obj.data?.message;
              tdReceiptObserveGeneration(obj,token);
              if (msg?.author?.role === 'assistant' && msg.end_turn === true && (!msg.channel || msg.channel==='final') &&
                  (!msg.recipient || msg.recipient==='all') && msg.status==='finished_successfully') {
                if (td.run && record.serial === td.run.serial) { td.run.networkFinal=true; td.run.networkFinalSerial=record.serial; }
                td.activityDirty=true;
                tdLiveNetworkFinal();
              }
            } catch { /* Patch/delta records do not establish final completion. */ }
          }
          if(tail.length>131072){tail='';droppedLine=true;}

        }
      } catch { /* Observation failure must not interfere with the original fetch. */ }
      finally {
        clearTimeout(timeout); scope.signal.removeEventListener('abort', stop);
        td.networkReaders.delete(reader); try { reader.releaseLock(); } catch {}
        if (tdAlive(scope)) markChatGptNetworkEnd(token);
      }
    })();
  }

  function installChatGptActivityMonitor() {
    chatGptActivityMonitorInstalled=true;
  }



  // UI identities remain usable during a failed read-only history/status request.
  // This is a same-tail check, not a "looks old enough" completion timeout.
  function tdCurrentPair(user, final, run) {
    if (!user.section || !final.section || !final.hasContent || compareDomOrder(user.section, final.section) >= 0) return false;
    const imageTurn = tdGeneratedImageTurn(final.section);
    if (imageTurn && user.section.closest('[data-talvt-turn-state]') !== imageTurn) return false;
    const userIds = [...new Set([...tdSectionIdentity(user.section), ...tdReceiptUserIds(user.section)])];
    const answerIds = tdSectionIdentity(final.section);
    if (!userIds.length || !answerIds.length) return false;
    // A mounted historical pair cannot stand in for a known later conversation event.
    const tail = [...(chatGptApiRecords.length ? chatGptApiRecords : entries)].reverse().find(e => isUserAnchoredEntry(e));
    if (tail && tdNavRecordIds(tail).length && !tdNavRecordIds(tail).some(id => userIds.includes(id))) {
      const sameLocalUser = tail.target?.isConnected && (tail.target===user.section || tail.target.contains(user.section) || user.section.contains(tail.target));
      const laterLocalUser = sameLocalUser || tail.target?.isConnected && compareDomOrder(tail.target, user.section) < 0;
      if (!laterLocalUser && !run?.expected) return false;
    }
    const proof = tdTurn.proof;
    if (proof && proof.epoch === td.epoch && proof.serial === tdTurn.serial &&
        !proof.user.ids.some(id => userIds.includes(id)) && !run?.expected) return false;
    if (run?.expected) {
      const input=run.inputReceipt;
      const exactInput=input?.epoch===td.epoch && input.serial===run.serial && input.ids.some(id=>userIds.includes(id));
      // A receipt proves WHICH input this is, not that its answer has ended.
      // All final-message/order/activity checks above and in the evaluator remain.
      return user.key!==run.baseline &&
        (exactInput || normalizeInlineReviewText(user.text)===normalizeInlineReviewText(run.expected)) &&
        (!run.userKey || userIds.includes(run.userKey) || user.key===run.userKey);
    }
    if (run) return final.key !== run.initialFinalKey ||
      (run.sawBusy && (final.signature !== run.initialFinal ||
        (user.key === run.baseline && !run.initialCompleted && final.completed)));
    return true;
  }
  function tdNormalSendReady(composer = getChatGptComposer()) {
    const button = findChatGptSendButton();
    if (!composer || !button || button.disabled || button.getAttribute('aria-disabled') === 'true') return false;
    const hint = getButtonAccessibleText(button);
    if (/stop|cancel|steer|停止|取消|调整方向|插话|继续生成|continue generating/i.test(hint)) return false;
    // The resolver has already checked the exact send semantics or safe arrow glyph.
    return true;
  }

  function getChatGptActivitySnapshot() {
    if (!settings.enabled || !isCurrentPageEligible() || isChatGptSharePage() || getRouteKey() !== routeKey) {
      return { phase: 'idle', busy: false, evidence: [], networkPending: 0 };
    }
    if(tdSelectionBusy()){tdSelection.deferred=true;return td.activityCache||{phase:'selecting',busy:true,evidence:['native-selection'],networkPending:0};}
    const now = Date.now();
    if (!td.activityDirty && td.activityCache && now - td.activityAt < 120) return td.activityCache;
    td.activityDirty = false; td.activityAt = now; td.activityScans++;
    const user = tdLocalUserSnapshot();
    let final = tdFinalSnapshot();
    const proofCandidate=tdTurn.proof;
    if (tdProofApplies(proofCandidate,user,td.run) && proofCandidate.answer?.ids?.length) {
      const exact=tdDomFindExact(proofCandidate.answer.ids,'assistant');
      if (exact) final=tdFinalSnapshotFor(exact);
    }
    const ui = tdReadActiveUI(final);
    const finalAfterUser = Boolean(final.section && (!user.section || compareDomOrder(user.section, final.section) < 0));
    const finalIsVerifiedLatest=Boolean(tdProofApplies(tdTurn.proof,user,td.run) &&
      tdSectionIdentity(final.section).some(id=>tdTurn.proof.answer?.ids.includes(id)));
    const hasAnswer = Boolean((finalAfterUser || finalIsVerifiedLatest) && final.hasContent);
    if (user.key) td.lastUser = user.key;
    if (final.signature && final.signature !== td.lastFinal) { td.lastFinal = final.signature; td.finalChangedAt = now; }
    const stable = hasAnswer && now - td.finalChangedAt >= 450;
    let network = [...chatGptNetworkTokens.values()].filter(meta => meta.epoch === td.epoch && meta.serial === tdTurn.serial && now - meta.startedAt < 30 * 60 * 1000);
    const direct = Boolean(ui.stopControl || ui.steerControl || ui.indicator);
    const missingAnswer = Boolean(user.section && !hasAnswer);
    if (direct && !td.run) tdArmRun('observed-busy', '', user);
    if (direct) { tdTurn.lastStrongAt = now; if (td.run) td.run.lastStrongAt = now; }
    const proof = tdTurn.proof;
    const proofApplies = tdProofApplies(proof, user, td.run);
    // An exact rendered message reaching its terminal controls is newer than a
    // stale API snapshot of THAT SAME message in_progress. A different/historical
    // response cannot supply this proof (important during regeneration).
    const sameVisibleMessage = Boolean(proofApplies && hasAnswer &&
      tdSectionIdentity(final.section).some(id => proof.answer?.ids.includes(id)));
    const currentPair = tdCurrentPair(user, final, td.run);
    const exactDomEnd = !direct && stable && final.completed && (sameVisibleMessage || currentPair);
    if (!td.run && exactDomEnd) tdRememberCompletion('exact-final-controls');
    const receipt=tdTurn.receipt;
    const localReceipt = currentPair && [...tdReceiptUserIds(user.section),...tdSectionIdentity(user.section)].some(id => receipt?.userIds?.includes(id)) &&
      tdSectionIdentity(final.section).some(id => receipt?.answerIds?.includes(id));
    const receiptApplies=Boolean(!td.run&&receipt?.epoch===td.epoch&&receipt.serial===tdTurn.serial&&
      (localReceipt || proofApplies && proof.state === 'complete' && proof.user.ids.some(id=>receipt.userIds?.includes(id)) &&
      proof.answer?.ids.some(id=>receipt.answerIds?.includes(id))));
    const serverDone = Boolean(proofApplies && proof.state === 'complete') || receiptApplies || exactDomEnd;
    // A long-lived in-progress proof triggers rechecks; elapsed time never proves completion.
    const serverRunning = Boolean(!serverDone && proofApplies && proof.state === 'running');
    const serverUnknown = Boolean(!serverDone && proofApplies && proof.state === 'unknown');
    let run = td.run;
    if (run) {
      if (direct || network.length) run.accepted = true;
      if (!run.userKey && run.expected && user.key !== run.baseline &&
          normalizeInlineReviewText(user.text) === normalizeInlineReviewText(run.expected)) {
        run.userKey = user.key; run.accepted = true;
      }
      if (direct) run.sawBusy = true;
      const ownsUser = Boolean(run.userKey && (run.userKey === user.key || tdSectionIdentity(user.section).includes(run.userKey)));
      const ownFinal = hasAnswer && (currentPair || ownsUser && final.key !== run.initialFinalKey);
      const domDone = stable && ownFinal && final.completed && (!serverRunning || exactDomEnd);
      const streamDone = Boolean(run.networkFinal && run.networkFinalSerial === run.serial);
      // Protocol/API completion can release a virtualized turn even when no answer
      // DOM is mounted. A stable final of a DIFFERENT user can never release it.
      const canComplete = !direct && (serverDone || streamDone || domDone);
      if (canComplete) {
        if (!td.settleSince) td.settleSince = now;
        if (now - td.settleSince >= 160) {
          tdCompleteCurrentRun(serverDone ? 'verified-current-branch' : streamDone ? 'scoped-end-turn' : 'own-final-controls');
          network = []; run = null;
        }
      } else td.settleSince = 0;
      if (td.run && !run?.accepted && !direct && !network.length && now - td.run.startedAt > 7000 && !td.tx) {
        td.run = null; run = null; tdLog('turn-latch-expired','unaccepted-send');
      }
    }
    const idleProof = !direct && (serverDone || !td.run && stable && final.completed && currentPair && !serverRunning && (!proof || sameVisibleMessage));
    const unresolved = !idleProof && (hasAnswer || missingAnswer || serverRunning || serverUnknown || Boolean(td.run) || network.length > 0);
    const evidence = [];
    if (ui.stopControl) evidence.push('stop-control');
    if (ui.steerControl) evidence.push('steer-control');
    if (ui.indicator) evidence.push('active-ui');
    if (serverDone) evidence.push('verified-end-turn');
    else if (serverRunning) evidence.push('verified-in-progress');
    else if (serverUnknown) evidence.push('server-state-inconclusive');
    if (missingAnswer) evidence.push('answer-not-mounted');
    if (td.run) evidence.push('current-turn-latch');
    if (network.length && !idleProof) evidence.push('network-active');
    let phase = 'idle';
    if (direct) phase = hasAnswer ? 'streaming' : 'planning';
    else if (td.run) phase = td.settleSince ? 'settling' : (hasAnswer ? 'settling' : 'planning');
    else if (unresolved) phase = serverRunning && tdTurn.unchanged < 2 ? 'planning' : 'unknown';
    else if (!idleProof && (now - td.routeStartedAt < 400 || hasAnswer && !stable)) phase = 'settling';
    if (unresolved && !direct) {
      if (!tdTurn.unknownSince) tdTurn.unknownSince = now;
      tdScheduleTurnCheck();
    } else if (idleProof) {
      tdTurn.unknownSince = 0;
      if (tdTurn.timer !== null) { clearTimeout(tdTurn.timer); tdTurn.timer = null; }
    }
    if (td.tx && !td.tx.clicked) phase = 'submitting';
    // Manual intent and unattended auto-dispatch have different authority.
    // A failed read-only verifier may NOT veto an explicit native send when a
    // current answer exists, the normal send control is ready and there is no
    // positive evidence of an ongoing generation. It does not release the queue.
    const manualNativeReady = !direct && !td.tx && tdNormalSendReady() &&
      (serverDone || !network.length && hasAnswer && (stable || final.completed) && currentPair);
    const result = {phase, busy: phase !== 'idle', evidence, manualNativeReady, currentPair,
      stopControl: ui.stopControl, steerControl: ui.steerControl, busyIndicator: ui.indicator,
      pendingTurn: unresolved, networkPending: idleProof ? 0 : network.length,
      generationLease: Boolean(td.run), dispatchArmed: Boolean(td.tx || td.run),
      strongEvidenceSeen: Boolean(direct || td.run?.accepted || serverRunning),
      rechecking: tdTurn.pending, proofReason: proof?.reason || '', proofApplies, sameVisibleMessage,
      localFinalCompleted: Boolean(final.completed), localFinalReason: final.completionReason || '',
      completionSource: exactDomEnd ? 'current-dom-terminal' : receiptApplies ? 'scoped-completion-receipt' : serverDone ? 'conversation-status' : idleProof ? 'final-controls' : '',
    };
    chatGptActivityPhase = phase; chatGptActivityEvidence = evidence; td.activityCache = result;
    return result;
  }

  function isChatGptGenerating() {
    return getChatGptActivitySnapshot().busy;
  }


  const TD_SEND_READY_LIMIT_MS = 5000;
  function tdSendPreflightRecord(tx, state, started, checks) {
    if(!tdAlive(tx.scope))return;
    const counts={send:0,steer:0,stop:0,disabled:0};
    for(const f of state.controls?.facts||[]){if(f.kind in counts)counts[f.kind]++;if(!f.enabled&&f.kind!=='other')counts.disabled++;}
    const previous=tdDispatch.preflight;
    tdDispatch.preflight={stage:state.status,reason:state.reason||'',elapsedMs:Math.round(performance.now()-started),checks,
      intent:tx.intent||'queue',controls:counts,action:state.choice?.kind||'',evidence:state.choice?.evidence||'',
      editorSame:state.editorSame!==false,textMatches:state.textMatches!==false,modelMatches:state.modelMatches!==false};
    if(previous?.stage!==state.status||previous?.reason!==state.reason)tdLog('send-preflight',`${state.status}/${state.reason||''}`);
  }
  function tdInspectPreparedSend(tx,payload) {
    const cancel=(reason,extra={})=>({status:'cancelled',reason,...extra});
    if(tx.cancelled)return cancel('operation-cancelled');
    if(!tdAlive(tx.scope)||!settings.enabled)return cancel('route-changed');
    const composer=tx.composer;
    if(!composer?.isConnected||composer!==getChatGptComposer())return cancel('editor-replaced',{editorSame:false});
    if(td.composing)return cancel('ime-active');
    if(getComposerText(composer)!==payload)return cancel('draft-changed',{textMatches:false});
    if(composerHasAttachments(composer))return cancel('attachments-changed');
    const edit=tx.editorWrite;
    try {
      if(edit && !tdEditorOwned(edit))return cancel('editor-ownership-changed');
      if(edit && edit.adapter.text()!==payload)return cancel('editor-model-changed',{modelMatches:false});
      if(!edit && (td.editorRevision.get(composer)||0)!==tx.preflightRevision)return cancel('draft-revision-changed');
    }catch{return cancel('editor-model-unavailable',{modelMatches:false});}
    const controls=tdComposerControlFacts(composer);
    const send=tdChooseComposerControl('send',true,controls),steer=tdChooseComposerControl('steer',true,controls);
    const live=tdReadActiveUI({section:getLatestAssistantSection()});
    const running=Boolean(live.stopControl||live.indicator);
    const explicit=tx.intent==='native-now'||tx.intent==='steer';
    if(!explicit && running)return cancel('active-turn-observed',{controls});
    let choice=send;
    if(tx.intent==='steer')choice=steer;
    else if(tx.intent==='native-now') {
      const proof=tdTurn.proof;
      const preferSteer=running||proof?.state==='running'&&tdProofApplies(proof,tdLocalUserSnapshot(),td.run);
      choice=preferSteer?(steer.button?steer:send):(send.button?send:steer);
    }
    if(choice.button)return {status:'ready',reason:'control-ready',controls,choice,button:choice.button};
    const kinds=tx.intent==='steer'?['steer']:explicit?['send','steer']:['send'];
    const relevant=controls.facts.filter(f=>kinds.includes(f.kind));
    const reason=(send.reason==='ambiguous'||explicit&&steer.reason==='ambiguous')?'control-ambiguous':
      relevant.length&&relevant.every(f=>!f.enabled)?'control-disabled':'control-not-found';
    return {status:'waiting',reason,controls,choice};
  }
  async function tdWaitPreparedSend(tx,payload) {
    const started=performance.now();let checks=0;
    // Bounded local readiness only. No HTTP, editor rewrite, click or retry is
    // performed while waiting; changed drafts/routes abort instead of waiting.
    while(tdAlive(tx.scope)) {
      const state=tdSelectionBusy()?{status:'waiting',reason:'selection-active'}:tdInspectPreparedSend(tx,payload);
      tdSendPreflightRecord(tx,state,started,++checks);
      if(state.status!=='waiting')return state;
      if(performance.now()-started>=TD_SEND_READY_LIMIT_MS) {
        const timeout={...state,status:'cancelled',reason:`${state.reason}-timeout`};
        tdSendPreflightRecord(tx,timeout,started,checks);return timeout;
      }
      if(!await tdDelay(85,tx.scope))break;
    }
    const cancelled={status:'cancelled',reason:'route-changed'};
    tdSendPreflightRecord(tx,cancelled,started,checks);return cancelled;
  }
  function tdSendPreflightText(reason) {
    if(/editor-replaced|route-changed/.test(reason))return '页面或输入框已重新挂载，已取消本次发送；没有写入新输入框';
    if(/draft-changed|draft-revision|ownership/.test(reason))return '发送准备期间草稿发生变化，已取消；保留当前编辑内容';
    if(/model/.test(reason))return '编辑器内部内容尚未与草稿一致，已停止发送，内容已保留';
    if(reason==='ime-active')return '输入法仍在编辑，已停止发送；请完成输入后再提交';
    if(reason==='attachments-changed')return '附件状态已变化，已停止自动提交；草稿和注释保留';
    if(reason==='active-turn-observed')return '检测到当前轮次仍在执行，没有插话或中断回答';
    if(reason.startsWith('control-ambiguous'))return '识别到多个发送控件，无法安全确定目标；未点击任何按钮';
    if(reason.startsWith('control-disabled'))return '网页发送按钮仍未启用，内容已保留；没有重复插入或发送';
    if(reason.startsWith('control-not-found'))return '未识别到属于当前输入框的发送控件，内容已保留；没有点击其他按钮';
    return '本次发送已取消，问题和注释保留';
  }

  function tdEditorMirrorEcho(event,composer) {
    // Some owners emit a redundant, synthetic input after rendering a transaction.
    // It is not another edit if the very same operation still owns identical
    // model + DOM text and no intervening revision has occurred.
    const rec=tdEditor.receipts.get(composer),tx=td.tx;
    if(event.isTrusted || !rec || !tx || tx.clicked || tx.composer!==composer || tx.editorWrite!==rec ||
       !rec.attempted || rec.phase!=='verified' || !tdEditorOwned(rec))return false;
    try{return getComposerText(composer)===rec.value && rec.adapter.text()===rec.value;}
    catch{return false;}
  }
  async function tdRestoreUnsubmittedDraft(tx,payload) {
    // A successful merge followed by unavailable controls is not a corrupt draft.
    // Restore only the still-owned exact text, once, through the same verified
    // writer. No undo guessing, page-model mutation, or second send attempt.
    if(tx.clicked || tx.cancelled || !tdAlive(tx.scope) || !tx.editorWrite ||
       tx.editorWrite.phase!=='verified' || !tdEditorOwned(tx.editorWrite) ||
       getComposerText(tx.composer)!==payload || tx.expected===payload)return false;
    const restored=await tdWriteEditor(tx.composer,tx.expected,payload,tx.scope);
    if(restored){
      tx.written='';
      if(tdDispatch.preflight)tdDispatch.preflight.recovery='original-restored';
    }
    return restored;
  }

  function tdRecoverVerifiedMerge(composer,rec) {
    // Upgrade recovery is read-only and requires a prior operation record plus
    // the EXACT currently pending annotation set. It never strips an arbitrary
    // user-authored "注释" prefix, and cannot release uncertain/sent operations.
    if(!rec || !tdAlive(rec.scope) || td.tx || tdEditor.active || rec.observed!==rec.value ||
       !rec.expected || !rec.value || rec.value===rec.expected || getComposerText(composer)!==rec.value ||
       tdDraftSubmissionOwner(composer,rec.value))return false;
    const comments=settings.enableInlineComments?pendingReviewSnapshot():[];
    if(!comments.length || composePromptWithReviewComments(rec.expected,comments)!==rec.value)return false;
    try {
      const adapter=tdEditorResolve(composer);
      if(adapter.valid?.()===false || adapter.supports?.()===false || adapter.text()!==rec.value)return false;
      const prefix=formatReviewCommentsPrefix(comments)+'\n\n本轮问题：\n';
      tdEditor.receipts.set(composer,{composer,scope:tdScope(),adapter,expected:rec.expected,value:rec.value,
        observed:rec.value,revision:td.editorRevision.get(composer)||0,attempted:true,committed:false,
        phase:'verified',generatedPrefix:prefix,nativeUndoable:false,started:performance.now()});
      tdEditor.blocked.delete(composer);
      try{workspaceSession.removeItem(`prompt-rail:editor-recovery:${hashString(routeKey)}`);}catch{}
      tdLog('editor-recovery','verified-previous-merge');return true;
    } catch{return false;}
  }


  async function sendPromptText(rawText) {
    const tx = td.tx;
    if (!tx || !tdAlive(tx.scope) || !settings.enabled || tx.cancelled) return false;
    const payload = normalizeMultilineText(rawText);
    const composer = tx.composer;
    tx.preflightRevision=td.editorRevision.get(composer)||0;
    if (!payload || !composer?.isConnected || composer !== getChatGptComposer() || composerHasAttachments(composer)) return false;
    if (getComposerText(composer) !== tx.expected) return false;
    if (getComposerText(composer) !== payload && !await tdWriteEditor(composer, payload, tx.expected, tx.scope)) {
      tx.reason = tdEditorFailureText(); return false;
    }
    tx.written = payload;
    if(tdPerf.send)tdPerf.send.prepareMs=Math.round(performance.now()-tdPerf.send.startedAt);
    if (!(await tdDelay(0, tx.scope)) || tx.cancelled) return false;
    const readiness = await tdWaitPreparedSend(tx,payload);
    if (readiness.status !== 'ready') {
      tx.reason=tdSendPreflightText(readiness.reason);
      tdRecordDispatch(readiness.reason);
      if(/^control-(?:disabled|not-found|ambiguous)/.test(readiness.reason)) {
        const restored=await tdRestoreUnsubmittedDraft(tx,payload);
        if(restored)tx.reason+='；已恢复原问题，注释仍保留';
      }
      return false;
    }
    // Re-read at the dispatch boundary: a readiness observation never licenses
    // a detached/replaced/disabled button. There is no await between this and click.
    const current = tdInspectPreparedSend(tx,payload);
    if(current.status!=='ready' || current.button !== readiness.button || !tdControlEnabled(current.button)) {
      const reason=current.status==='ready'?'control-replaced':current.reason;
      tx.reason=tdSendPreflightText(reason);tdRecordDispatch(reason);return false;
    }
    tx.baseline = tdLocalUserSnapshot();
    tx.item.baselineKey = tx.baseline.key;
    tx.item.status = 'sending'; tx.item.attemptedAt = Date.now();
    // 先存回执，再尝试点击。保存失败或路由变化不会发送。
    tdArmRun(['steer','native-now'].includes(tx.intent) ? 'native-steer' : tx.direct ? tx.item.source : 'queue-dispatch', payload, tx.baseline);
    tdReceiptBegin(tx,payload);saveWorkflowState();
    const armedRun=td.run;
    const stored=await workspaceSession.flush();
    const finalCheck=tdAlive(tx.scope)&&pilotActive?tdInspectPreparedSend(tx,payload):null;
    if(!stored||finalCheck?.status!=='ready'||finalCheck.choice?.kind!==current.choice?.kind||tdSelectionBusy()){
      if(td.run===armedRun && tdAlive(tx.scope))td.run=null;
      tx.reason=!stored?'队列未能保存，未发送':'页面或草稿已经变化，未发送';
      return false;
    }
    const button = finalCheck.button;
    tx.clicked = true;
    tdArmReceiptObserver(tx);
    if (tx.editorWrite) tx.editorWrite.committed = true;
    const priorReceipt=tdEditor.receipts.get(composer);
    if(priorReceipt && tdAlive(priorReceipt.scope))priorReceipt.committed=true;
    td.allowButton = button; td.allowForm = button.form || composer.closest('form');
    try { button.click(); }
    catch (error) { tx.reason = '原生发送事件异常'; tdLog('native-send-error', error?.name); }
    finally { td.allowButton = null; td.allowForm = null; }
    tdLog('send-clicked', tx.intent || (tx.direct ? 'annotations' : 'queue'));
    const acknowledged = await tdAwaitSubmission(tx,payload);
    if(tdPerf.send)tdPerf.send.echoMs=Math.round(performance.now()-tdPerf.send.startedAt);
    if (!acknowledged) tx.reason = '正在自动核对这条问题是否已上屏；不会重复发送';
    return acknowledged;
  }


  function addPromptToQueue(rawText, { source = 'manual', front = false, silent = false, comments = [] } = {}) {
    const text = normalizeMultilineText(rawText);
    if (!text || !tdEnabled()) return false;
    if (promptQueue.length >= 100) { showToast('队列已达 100 条，请先处理现有问题', 2400); return false; }
    const item = { id: makeLocalId('queue'), text, source, status: 'waiting', createdAt: Date.now(), error: '',
      comments: Array.isArray(comments) ? comments.map(serializeReviewComment) : [] };
    if (front && !queueProcessing) promptQueue.unshift(item); else promptQueue.push(item);
    saveWorkflowState(); renderWorkflowPanel(); updateWorkflowVisibility(); tdWake(100);
    if (!silent) showToast(`已排队 · 第 ${promptQueue.length} 条`, 1100);
    return true;
  }

  function removeQueuedPrompt(id) {
    const item=promptQueue.find(row=>row.id===id);
    if (!item) return;
    const tx=td.tx?.item.id===id ? td.tx : null;
    if (tx?.clicked) { showToast('已交给 ChatGPT，不能从本地队列撤回；正在核对发送结果',2500); return; }
    if (item.status==='uncertain' && !window.confirm('这条问题可能已经发送。删除只移除本地记录，不会撤回 ChatGPT 消息。确定移除？')) return;
    if (tx) tx.cancelled=true;
    promptQueue=promptQueue.filter(row=>row.id!==id);
    if (item.status!=='uncertain' && item.comments?.length) restorePendingReviewSnapshot(item.comments);
    if (td.staged?.id===id) td.staged=null;
    if (td.editingQueueId===id) td.editingQueueId='';
    if (queueMenuOpenId===id) tdCloseQueueMenu();
    saveWorkflowState(); renderWorkflowPanel(); updateWorkflowVisibility(); tdWake(200);
  }


  function moveQueuedPrompt(id, direction) {
    if (queueProcessing) return;
    const from = promptQueue.findIndex((row) => row.id === id); const to = from + direction;
    if (from < 0 || to < 0 || to >= promptQueue.length) return;
    [promptQueue[from], promptQueue[to]] = [promptQueue[to], promptQueue[from]];
    saveWorkflowState(); renderQueueDock(); tdWake();
  }

  function clearQueuedPrompts() {
    if (!promptQueue.length || queueProcessing) return;
    if (!window.confirm(`清空 ${promptQueue.length} 条本地排队问题？未发送问题的批注会恢复为待提交。`)) return;
    const comments = promptQueue.filter((row) => row.status !== 'uncertain').flatMap((row) => row.comments || []);
    promptQueue = []; td.staged = null;
    if (comments.length) restorePendingReviewSnapshot(comments);
    saveWorkflowState(); renderWorkflowPanel(); updateWorkflowVisibility();
  }

  async function processPromptQueue({ force = false, itemId = '', intent = 'queue' } = {}) {
    if(tdSelectionBusy())return tdRecordDispatch('native-selection-active');
    if (tdNewline.active) return tdRecordDispatch('newline-sync');
    if (!tdEnabled() || queueProcessing || td.tx || tdEditor.active || !promptQueue.length || td.composing) return tdRecordDispatch(
      !tdEnabled()?'not-ready':queueProcessing||td.tx?'transaction-active':tdEditor.active?'editor-active':td.composing?'ime-active':'empty-queue');
    const item = itemId ? promptQueue.find(q => q.id === itemId) : promptQueue[0];
    if (!item || !normalizeMultilineText(item.text) || item.status==='uncertain' || (item.status==='failed' && intent!=='native-now')) return tdRecordDispatch(!item?'missing-item':item.status==='uncertain'?'uncertain-send':item.status==='failed'?'failed-preflight':'empty-prompt');
    if (!force && (!settings.autoRunQueue || queuePaused)) return tdRecordDispatch(queuePaused?'queue-paused':'auto-send-off');
    if (!force && Date.now()<tdChatBackoffUntil) return tdRecordDispatch('chat-rate-limited');
    const activity = getChatGptActivitySnapshot();
    if (intent === 'queue' && tdIntentBusy(activity)) return tdRecordDispatch('waiting-for-turn',activity);
    if (!force && (Date.now() < queueHoldUntil || Date.now()-queueLastEditAt < 600 || td.pointerHold || queueMenuOpenId)) return tdRecordDispatch(queueMenuOpenId?'queue-menu-open':td.pointerHold?'pointer-gesture':'edit-grace');
    if (document.visibilityState !== 'visible' && !force && !settings.allowBackgroundQueue) return tdRecordDispatch('background-paused');
    const focused = shadowRoot?.activeElement;
    if (focused?.matches?.('[data-queue-text]') || activeCommentMode === 'compose') return tdRecordDispatch(activeCommentMode==='compose'?'annotation-editing':'queue-editing');
    const composer = getChatGptComposer();
    if (!composer || composerHasAttachments(composer)) return tdRecordDispatch(!composer?'composer-missing':'attachments');
    const existing = getComposerText(composer);
    const staged = td.staged;
    const ownsDraft = staged?.id === item.id && staged.composer === composer && staged.expected === existing && tdAlive(staged.scope);
    if(item.sendReceipt?.ackedAt){tdCommitItem(item,item.sendReceipt.source);return true;}
    if (existing && !ownsDraft) {
      if (force) showToast('输入框中有草稿，已保留。Command+Enter 可立即提交这份草稿；清空后才能发送队列项',3300);
      return tdRecordDispatch('composer-draft');
    }
    const scope = tdScope();
    const tx = { scope,item,composer,expected:existing,clicked:false,written:'',reason:'',intent,cancelled:false };
    td.tx = tx; queueProcessing = true; tdRecordDispatch(intent==='native-now'?'manual-once':'preparing');
    item.status = 'preparing'; item.error = ''; tdCloseQueueMenu(); renderWorkflowPanel();
    let sent = false;
    try {
      if (intent==='interrupt') { tx.reason='此版本不自动停止回答，请使用网页原生停止操作';return false; }
      sent = await sendPromptText(composePromptWithReviewComments(item.text,item.comments));
      if (!tdAlive(scope)) return false;
      if (sent) {
        tdCommitItem(item,'exact-user-echo'); td.staged=null; queueHoldUntil=Date.now()+200;
        showToast(promptQueue.length ? `已发送 · 剩余 ${promptQueue.length} 条` : '已发送',1000);
        return true;
      }
      return false;
    } finally {
      if (tdAlive(scope) && td.tx === tx) {
        sent=sent||tx.confirmed||Boolean(item.sendReceipt?.ackedAt);
        if(sent)try{await tdCleanupAcceptedEditor(tx);}catch(error){tdLog('sent-cleanup-error',error?.name);}
        if (!tdAlive(scope) || td.tx!==tx) return;
        if (!sent && !tx.cancelled) {
          item.status=tx.clicked?'uncertain':'failed';
          item.error=tx.reason || '发送前校验失败，请检查当前输入框'; if(tx.clicked)tdPauseForReceipt(tx);else queuePaused=true;
          showToast(item.error,3200); tdLog(tx.clicked?'send-uncertain':'send-preflight-failed');
        }
        if (!sent && !tx.clicked) tdRollbackPreparedEditor(tx);
        if (!tdAlive(scope) || td.tx!==tx) return;
        td.tx=null; queueProcessing=false; td.activityDirty=true;
        saveWorkflowState(); renderWorkflowPanel(); updateWorkflowVisibility(); tdWake(250);
      }
    }
  }


  // v1.3 separates native idle sends from actual queued work. An initial harmless
  // layout-settle is not a running model, but unknown/pending runs still fail closed.
  function tdIntentBusy(activity, manual = false) {
    if(!activity)return !manual;
    if(manual) {
      // Preserve real running turns, including the silent gap before any answer.
      // An API/cache snapshot, missing DOM or missing send-button selector alone
      // never authorizes hijacking an explicit Enter into our queue.
      if(activity.stopControl||activity.busyIndicator)return true;
      if(activity.manualNativeReady||activity.evidence?.includes('verified-end-turn'))return false;
      const run=td.run;
      if(run && ['native-direct','native-button','native-form','queue-dispatch','annotation-direct','native-steer','command-enter','observed-network','observed-busy'].includes(run.source)) {
        if(run.networkFinal&&run.networkFinalSerial===run.serial)return false;
        const user=tdLocalUserSnapshot(),final=tdFinalSnapshot();
        const pair=tdCurrentPair(user,final,run);
        // A final explicitly decorated by the host beats an orphaned local latch.
        if(pair&&final.completed)return false;
        if(pair&&final.hasContent&&Date.now()-td.finalChangedAt>=450&&!activity.networkPending)return false;
        if(activity.networkPending)return true;
        if(run.accepted && (!final.hasContent||!pair))return true;
        if(!run.accepted&&Date.now()-run.startedAt<1800)return true;
      }
      return false;
    }
    if(activity.phase==='settling'&&!activity.generationLease&&!activity.dispatchArmed&&
       !activity.pendingTurn&&!activity.networkPending&&!activity.stopControl&&!activity.busyIndicator)return false;
    return activity.busy;
  }

  async function tdSendWithAnnotations(composer,text,comments, { intent = 'queue', source = 'annotation-direct' } = {}) {
    if (td.tx || !tdEnabled()) return false;
    const scope=tdScope();
    const question=tdAnnotationQuestion(composer,text);
    const item={id:makeLocalId('direct'),text:question,source,status:'preparing',createdAt:Date.now(),error:'',comments};
    const tx={scope,item,composer,expected:text,clicked:false,written:'',reason:'',direct:true,cancelled:false,intent};
    td.tx=tx; queueProcessing=true;
    removePendingReviewSnapshot(comments); saveWorkflowState(); renderWorkflowPanel();
    let sent=false;
    tdPerf.send={startedAt:performance.now(),comments:comments.length,prepareMs:0,echoMs:0};
    tdSendCriticalUntil=performance.now()+500;
    try {
      if (!(await tdDelay(0,scope))) return false;
      sent=await sendPromptText(composePromptWithReviewComments(item.text,comments));
      if (!tdAlive(scope)) return false;
      if (sent) {
        tx.confirmed=true;
        markReviewCommentsConsumed(comments); removePendingReviewSnapshot(comments);
        if(td.run && td.run.serial===item.sendReceipt?.serial){td.run.accepted=true;td.run.userKey=item.sendReceipt.ackIds[0]||td.run.userKey;}
        tdLog('annotations-confirmed');
      } else if (tx.clicked) {
        if(tx.confirmed||item.sendReceipt?.ackedAt){tdCommitItem(item,item.sendReceipt?.source||'accepted');return true;}
        item.status='uncertain';item.error=tx.reason;if(!promptQueue.some(q=>q.id===item.id))promptQueue.unshift(item);tdPauseForReceipt(tx);
        tdLog('annotation-send-uncertain'); showToast(tx.reason,3200);
      } else {
        tdRollbackPreparedEditor(tx);
        restorePendingReviewSnapshot(comments);
        showToast(tx.reason || '未能发送，原问题和批注已保留',3000);
      }
      return sent;
    } catch(error) {
      if (tdAlive(scope)) {
        if(tx.confirmed||item.sendReceipt?.ackedAt){tdCommitItem(item,item.sendReceipt?.source||'accepted');return true;}
        if (tx.clicked) { item.status='uncertain';if(!promptQueue.some(q=>q.id===item.id))promptQueue.unshift(item);tdPauseForReceipt(tx); }
        else { tdRollbackPreparedEditor(tx); restorePendingReviewSnapshot(comments); }
        tdLog('annotation-send-error',error?.name);
      }
      return false;
    } finally {
      if (tdAlive(scope) && td.tx===tx) {
        if(tx.confirmed||item.sendReceipt?.ackedAt)try{await tdCleanupAcceptedEditor(tx);}catch(error){tdLog('sent-cleanup-error',error?.name);}
        if (!tdAlive(scope) || td.tx!==tx) return;
        td.tx=null; queueProcessing=false; td.activityDirty=true;
        saveWorkflowState(); renderWorkflowPanel(); tdWake(200);
      }
    }
  }

  function tdFindSteerControl(requireEnabled=false) {
    return tdChooseComposerControl('steer',requireEnabled).button;
  }


  async function tdInterjectQueueItem(id) {
    const item=promptQueue.find(q=>q.id===id);
    if (!item) return false;
    if (item.status==='uncertain') { showToast('这条可能已经发送。请先核对上屏结果，不能直接重发',3000); return false; }
    if (queueProcessing || td.tx || tdEditor.active || td.composing) { showToast('当前正在处理输入或核对发送结果，请稍候',2300); return false; }
    if (activeCommentMode==='compose') { showToast('请先保存或关闭正在编辑的注释',2300); return false; }
    const focused=shadowRoot?.activeElement;
    if (focused?.matches?.('[data-queue-text]')) focused.blur();
    td.editingQueueId=''; tdCloseQueueMenu(); td.activityDirty=true;
    tdLog('manual-submit-once','queue');
    // force bypasses local completion/paused/menu gates only for THIS item.
    // sendPromptText still checks the native control, editor and exact user echo.
    return processPromptQueue({force:true,itemId:id,intent:'native-now'});
  }

  function tdSyncMoreButtons() {
    queueDockEl?.querySelectorAll('[data-action="queue-dock-more"]').forEach(button=>{
      button.setAttribute('aria-haspopup','menu');
      button.setAttribute('aria-expanded',String(button.dataset.queueId===queueMenuOpenId && !queueMenuEl?.hidden));
    });
  }
  function tdCloseQueueMenu({restoreFocus=false}={}) {
    const id=queueMenuOpenId;
    queueMenuOpenId=''; td.menuRenderKey='';
    if (queueMenuEl) queueMenuEl.hidden=true;
    tdSyncMoreButtons();
    if (restoreFocus && id) queueDockEl?.querySelector(`[data-action="queue-dock-more"][data-queue-id="${cssEscape(id)}"]`)?.focus({preventScroll:true});
    tdWake(150);
  }
  function tdInstallQueueDismissal() {
    const closeOutside=(event)=>{
      const path=event.composedPath?.() || [];
      const internal=path.includes(queueMenuEl) || path.some(node=>node instanceof Element && node.matches('[data-action="queue-dock-more"]'));
      if (queueMenuOpenId && !internal) tdCloseQueueMenu();
      // Preserve node identity until pointerup/click and keep the auto-dispatcher
      // from consuming an item while its delete/edit control is being pressed.
      if (path.includes(queueDockEl) || path.includes(queueMenuEl)) {
        td.pointerHold={id:event.pointerId,at:Date.now()}; queueHoldUntil=Date.now()+450;
      }
    };
    window.addEventListener('pointerdown',closeOutside,true);
    const release=()=>{ td.pointerHold=null; queueHoldUntil=Math.max(queueHoldUntil,Date.now()+180); tdWake(200); };
    window.addEventListener('pointerup',release,true);
    window.addEventListener('pointercancel',release,true);
    window.addEventListener('blur',()=>{release();tdCloseQueueMenu();});
    window.addEventListener('keydown',event=>{
      if (event.key==='Escape' && queueMenuOpenId) {
        event.preventDefault();event.stopImmediatePropagation();tdCloseQueueMenu({restoreFocus:true});
      }
    },true);
    window.addEventListener('focusin',event=>{
      if (!queueMenuOpenId) return;
      const path=event.composedPath?.() || [];
      if (!path.includes(queueMenuEl) && !path.some(n=>n instanceof Element && n.matches('[data-action="queue-dock-more"]'))) tdCloseQueueMenu();
    },true);
    queueMenuEl?.addEventListener('keydown',event=>{
      if (!['ArrowDown','ArrowUp','Home','End'].includes(event.key)) return;
      const buttons=[...queueMenuEl.querySelectorAll('button:not(:disabled)')]; if (!buttons.length) return;
      event.preventDefault();event.stopPropagation();
      const current=buttons.indexOf(shadowRoot.activeElement);
      const index=event.key==='Home'?0:event.key==='End'?buttons.length-1:event.key==='ArrowDown'?(current+1)%buttons.length:(current-1+buttons.length)%buttons.length;
      buttons[index].focus({preventScroll:true});
    });
    const style=document.createElement('style');
    style.textContent=`
      .queue-dock-text:focus{background:var(--apr-input);border-radius:5px;outline:1px solid var(--apr-panel-border);outline-offset:3px}
      .queue-dock-item:focus-within{background:var(--apr-hover)}
      .queue-dock-controls button{min-width:32px;min-height:32px;touch-action:manipulation}
      .queue-dock-direction:disabled{opacity:.45;cursor:default}
      .queue-item-menu button:focus-visible{outline:2px solid var(--apr-text);outline-offset:-2px;border-radius:5px}
      @media (prefers-reduced-motion:reduce){.navigator *,.queue-dock *{transition:none!important;scroll-behavior:auto!important}}
    `;
    shadowRoot.appendChild(style);
  }

  // Optional, dependency-free document minimap. Geometry mode maps real retained
  // DOM/skeleton positions. If the host has discarded those positions, use an
  // explicitly labelled index mode; never pretend estimated text length is a
  // measured page coordinate or seek repeatedly while a pointer is dragging.
  const tdMinimap = {
    el:null,canvas:null,slider:null,tip:null,modeEl:null,raf:null,frames:0,
    cache:new Map(),layout:null,drag:null,hover:-1,dirty:true,resize:null,
  };
  function tdResetMinimap() {
    const drag=tdMinimap.drag;tdMinimap.drag=null;
    if(drag?.raf!==null && drag?.raf!==undefined)cancelAnimationFrame(drag.raf);
    try{if(drag)tdMinimap.canvas?.parentElement.releasePointerCapture(drag.id);}catch{}
    tdMinimap.cache.clear();tdMinimap.layout=null;tdMinimap.hover=-1;
    if (tdMinimap.raf!==null) cancelAnimationFrame(tdMinimap.raf);
    tdMinimap.raf=null;if(tdMinimap.tip)tdMinimap.tip.hidden=true;
  }
  function tdInvalidateMinimapContent() {
    tdMinimap.dirty=true;
    if (tdMinimap.cache.size>MAX_CACHE_ITEMS) tdMinimap.cache.clear();
    tdScheduleMinimap(true);
  }
  function tdMinimapSource(entry) {
    const answers=entry.answerRecords || [];
    let raw=answers.map(a=>a.rawText || '').filter(Boolean).join('\n\n');
    if (!raw) {
      const nodes=answers.map(a=>a.target).filter(n=>n instanceof Element && n.isConnected);
      raw=nodes.map(n=>findAssistantContentRoot(n)?.textContent || '').filter(Boolean).join('\n');
    }
    if (!raw) raw=(entry.answerBlocks || []).map(b=>b.label || b.text || '').join('\n');
    return raw;
  }
  function tdMinimapRows(entry) {
    const key=entry.key || entry.text;
    const rawParts=(entry.answerRecords || []).map(a=>a.rawText || '');
    const labels=(entry.answerBlocks || []).map(b=>b.label || b.text || '').join('\n');
    const prior=tdMinimap.cache.get(key);
    if(prior && prior.prompt===entry.text && prior.labels===labels && rawParts.length===prior.rawParts.length && rawParts.every((raw,i)=>raw===prior.rawParts[i]))return prior;
    const raw=tdMinimapSource(entry);
    const text=(entry.text || '')+'\n\n'+raw;
    const rows=[];let units=0;let fence=false;
    for (const line of text.split('\n')) {
      const trimmed=line.trim();
      if (/^(```|~~~)/.test(trimmed)) {fence=!fence;continue;}
      const kind=units===0?'question':fence?'code':/^#{1,6}\s|^\*\*[^*]+\*\*/.test(trimmed)?'heading':'body';
      const clean=line.replace(/!?\[([^\]]*)\]\([^)]*\)/g,'$1').replace(/[\uE200-\uE20F][^\uE20F]*\uE20F/g,'').replace(/^\s*#{1,6}\s+/,'').replace(/[*`]/g,'');
      const width=[...clean].reduce((n,ch)=>n+(ch.charCodeAt(0)>255?2:1),0);
      const count=Math.max(1,Math.ceil(width/86));
      for(let n=0;n<count;n++) rows.push({u:units+n,width:Math.min(86,Math.max(0,width-n*86)),kind,indent:Math.min(18,(line.match(/^\s*/)?.[0].length || 0))});
      units+=count;
      // Bounded processing of enormous raw answers. The map is a visual summary;
      // complete answer navigation remains in the untruncated outline model.
      if(units>12000)break;
    }
    const sampled=rows.length>180 ? rows.filter((_,i)=>i===0 || i===rows.length-1 || i%Math.ceil(rows.length/180)===0) : rows;
    const value={prompt:entry.text,rawParts,labels,units:Math.max(3,units+2),rows:sampled};tdMinimap.cache.set(key,value);return value;
  }
  function tdMinimapMeasuredStart(entry,root,scroll,rootTop) {
    const node=[entry.target,entry.skeletonTarget].find(n=>n instanceof HTMLElement && n.isConnected && (isDocumentScrollRoot(root) || root.contains(n)));
    if (!node) return null;
    const rect=node.getBoundingClientRect();
    if (!rect.width || !Number.isFinite(rect.top))return null;
    return Math.max(0,rect.top-rootTop+scroll);
  }
  function tdMinimapLayout() {
    const root=currentScrollRoot || findScrollRoot();
    const documentRoot=isDocumentScrollRoot(root);
    const rr=documentRoot?{top:0,bottom:window.innerHeight,height:window.innerHeight}:root.getBoundingClientRect();
    const view=documentRoot?window.innerHeight:root.clientHeight;
    const total=Math.max(view,getRootScrollMax(root)+view);
    const scroll=getRootScrollTop(root);
    const specs=entries.map((e,i)=>({index:i,key:e.key,entry:e,data:tdMinimapRows(e),measured:tdMinimapMeasuredStart(e,root,scroll,rr.top)}));
    const allMeasured=specs.length>0 && specs.every((s,i)=>s.measured!==null && (i===0 || s.measured>=specs[i-1].measured+1));
    const mode=allMeasured?'geometry':'index';
    let units=0;
    for(let i=0;i<specs.length;i++) {
      const spec=specs[i];
      spec.start=allMeasured?spec.measured:units;
      spec.end=allMeasured?(specs[i+1]?.measured ?? total):units+spec.data.units;
      spec.end=Math.max(spec.start+1,spec.end);
      units=spec.end;
    }
    const extent=mode==='geometry'?total:Math.max(1,units);
    let from=0,to=1;
    if(mode==='geometry') {
      const anchor=findChatGptComposerDockAnchor();const bottom=anchor?.getBoundingClientRect().top;
      const visibleTop=Math.max(rr.top,Math.min(80,rr.bottom-40));
      const visibleBottom=Number.isFinite(bottom) && bottom>visibleTop ? Math.min(rr.bottom,bottom-8):rr.bottom;
      from=(scroll+Math.max(0,visibleTop-rr.top))/extent;
      to=(scroll+Math.max(1,visibleBottom-rr.top))/extent;
    } else {
      const index=Math.max(0,Math.min(specs.length-1,activeIndex));const active=specs[index];
      from=active?active.start/extent:0;to=active?active.end/extent:1;
    }
    return {root,mode,items:specs,extent,from:Math.max(0,Math.min(1,from)),to:Math.max(0,Math.min(1,to)),view,scroll};
  }
  function tdUpdateMinimapVisibility() {
    if (!navigatorEl || !tdMinimap.el)return;
    const enabled=settings.navigationStyle==='minimap';
    navigatorEl.dataset.navigationStyle=enabled?'minimap':'rail';
    tdMinimap.el.hidden=!enabled;railEl.hidden=enabled;
    if(enabled)tdScheduleMinimap();else {tdMinimap.drag=null;tdMinimap.tip.hidden=true;}
  }
  function tdScheduleMinimap(dirty=false) {
    if(dirty)tdMinimap.dirty=true;
    if(!tdMinimap.el || settings.navigationStyle!=='minimap' || tdMinimap.raf!==null)return;
    tdMinimap.raf=requestAnimationFrame(()=>{tdMinimap.raf=null;tdDrawMinimap();});
  }
  function tdDrawMinimap() {
    if(!tdMinimap.el || navigatorEl.hidden || settings.navigationStyle!=='minimap')return;
    const c=tdMinimap.canvas;const box=c.getBoundingClientRect();if(box.height<1||box.width<1)return;
    const layout=tdMinimapLayout();tdMinimap.layout=layout;tdMinimap.frames++;
    const ratio=Math.min(2,window.devicePixelRatio || 1);
    const w=Math.round(box.width*ratio),h=Math.round(box.height*ratio);
    if(c.width!==w)c.width=w;if(c.height!==h)c.height=h;
    const ctx=c.getContext('2d');ctx.setTransform(ratio,0,0,ratio,0,0);ctx.clearRect(0,0,box.width,box.height);
    const style=getComputedStyle(navigatorEl);const ink=style.getPropertyValue('--apr-text').trim()||'#333';
    ctx.fillStyle=ink;
    let lastY=-2;
    for(const spec of layout.items) {
      const y0=spec.start/layout.extent*box.height;
      const segment=(spec.end-spec.start)/layout.extent*box.height;
      if(segment<1) {
        if(y0-lastY<.6)continue;ctx.globalAlpha=.38;ctx.fillRect(5,y0,Math.max(14,box.width-12),.8);lastY=y0;continue;
      }
      for(const row of spec.data.rows) {
        const y=y0+(row.u/spec.data.units)*segment;
        if(y-lastY<.85 && row.kind==='body')continue;
        if(!row.width)continue;
        const width=Math.max(1,(box.width-13-row.indent*.45)*row.width/86);
        ctx.globalAlpha=row.kind==='question'?.74:row.kind==='heading'?.6:row.kind==='code'?.42:.25;
        ctx.fillRect(5+row.indent*.45,y,width,Math.min(1.3,Math.max(.75,segment/spec.data.units*.68)));lastY=y;
      }
    }
    ctx.globalAlpha=1;
    let top=layout.from*box.height;
    const height=Math.min(box.height,Math.max(16,(layout.to-layout.from)*box.height));
    top=Math.max(0,Math.min(box.height-height,top));
    if(tdMinimap.drag?.mode==='index')top=Math.max(0,Math.min(box.height-height,tdMinimap.drag.y));
    tdMinimap.slider.style.top=`${top}px`;tdMinimap.slider.style.height=`${height}px`;
    tdMinimap.slider.setAttribute('aria-valuenow',String(Math.round(layout.from*100)));
    const fullIndex=chatGptApiStatus==='ready';
    tdMinimap.modeEl.textContent=layout.mode==='geometry'?(fullIndex?'正文':'已加载'):'索引';
    tdMinimap.modeEl.title=layout.mode==='geometry'?(fullIndex?'根据正文和保留的占位节点映射真实滚动位置':'完整会话接口尚未就绪；这里只反映当前已知或已加载内容，不保证覆盖全部历史'):'部分历史位置尚未挂载：显示完整会话索引，松手后按消息定位，不估算未加载内容的页面坐标';
    tdMinimap.el.dataset.mapping=layout.mode;
    tdMinimap.dirty=false;
  }
  function tdMinimapHit(clientY) {
    const layout=tdMinimap.layout;if(!layout?.items.length)return null;
    const rect=tdMinimap.canvas.getBoundingClientRect();const ratio=Math.max(0,Math.min(1,(clientY-rect.top)/rect.height));const value=ratio*layout.extent;
    let lo=0,hi=layout.items.length-1;
    while(lo<hi){const mid=Math.ceil((lo+hi)/2);if(layout.items[mid].start<=value)lo=mid;else hi=mid-1;}
    return {spec:layout.items[lo],ratio,y:ratio*rect.height};
  }
  function tdMinimapTooltip(clientY) {
    const hit=tdMinimapHit(clientY);if(!hit)return;
    const entry=hit.spec.entry;
    const tip=tdMinimap.tip;
    if(tdMinimap.hover!==hit.spec.index) {
      tdMinimap.hover=hit.spec.index;tip.replaceChildren();
      const title=document.createElement('strong');title.textContent=truncateText(entry.text || '会话事件',120);tip.appendChild(title);
      const labels=(entry.answerBlocks||[]).filter(isAnswerOutlineBlock).slice(0,4);
      for(const block of labels){const line=document.createElement('div');line.textContent=(block.marker?block.marker+' ':'')+block.label;tip.appendChild(line);}
      const hint=document.createElement('small');hint.textContent=tdMinimap.layout.mode==='geometry'?'点击定位 · 拖动视口 · 滚轮滚动':'历史正文未完全挂载 · 松手后按消息定位';tip.appendChild(hint);
    }
    tip.hidden=false;
    const nav=navigatorEl.getBoundingClientRect();tip.style.top=`${Math.max(30,Math.min(nav.height-120,clientY-nav.top))}px`;
  }
  function tdMinimapMove(clientY) {
    const d=tdMinimap.drag;const layout=tdMinimap.layout;if(!d||!layout)return;
    const hit=tdMinimapHit(clientY);if(!hit)return;
    d.y=hit.y;d.entry=hit.spec.index;
    if(d.mode==='geometry') {
      // At most one scroll write per animation frame, including pointer coalescing.
      d.nextClientY=clientY;
      if(d.raf!==null)return;
      d.raf=requestAnimationFrame(()=>{
        d.raf=null;if(tdMinimap.drag!==d||!tdAlive(d.scope))return;
        const r=tdMinimap.canvas.getBoundingClientRect();const current=tdMinimap.layout;
        const wanted=((d.nextClientY-r.top-d.grab)/r.height)*current.extent-d.offset;
        scrollRootTo(current.root,wanted,'auto');tdScheduleMinimap();
      });
    } else {tdMinimap.slider.style.top=`${Math.max(0,hit.y-8)}px`;}
  }
  function tdInstallMinimap() {
    if(tdMinimap.el || !navigatorEl)return;
    const wrap=document.createElement('div');wrap.className='td-minimap';wrap.hidden=true;
    const tools=document.createElement('div');tools.className='td-minimap-tools';
    const outline=document.createElement('button');outline.type='button';outline.textContent='大纲';outline.title='展开或收起完整大纲';
    outline.addEventListener('click',()=>tdSetOutlinePinned(navigatorEl.dataset.pinned!=='true'));
    const mode=document.createElement('span');mode.className='td-minimap-mode';tools.append(outline,mode);
    const track=document.createElement('div');track.className='td-minimap-track';
    const canvas=document.createElement('canvas');canvas.setAttribute('aria-hidden','true');
    const slider=document.createElement('div');slider.className='td-minimap-slider';slider.tabIndex=0;slider.setAttribute('role','scrollbar');slider.setAttribute('aria-label','会话缩略图视口');slider.setAttribute('aria-orientation','vertical');slider.setAttribute('aria-valuemin','0');slider.setAttribute('aria-valuemax','100');
    const tip=document.createElement('div');tip.className='td-minimap-tip';tip.hidden=true;tip.setAttribute('role','tooltip');
    track.append(canvas,slider);wrap.append(tools,track,tip);navigatorEl.insertBefore(wrap,railEl);
    Object.assign(tdMinimap,{el:wrap,canvas,slider,tip,modeEl:mode});
    const style=document.createElement('style');style.textContent=`
      .navigator[data-navigation-style="minimap"]{top:86px;bottom:96px;height:auto;width:86px;transform:none;min-height:100px}
      .td-minimap{height:100%;width:86px;border-left:1px solid var(--apr-panel-border);background:var(--apr-panel-bg);position:relative;border-radius:4px;overflow:visible}
      .td-minimap-tools{height:26px;display:flex;align-items:center;justify-content:space-between;padding:0 5px;color:var(--apr-muted);font-size:10px;gap:4px}
      .td-minimap-tools button{appearance:none;border:0;background:transparent;color:var(--apr-muted);font-size:11px;cursor:pointer;padding:2px 3px;border-radius:3px}
      .td-minimap-tools button:hover{background:var(--apr-hover);color:var(--apr-text)}
      .td-minimap-mode{font-size:10px;cursor:help}.td-minimap-track{position:relative;height:calc(100% - 26px);touch-action:none;cursor:crosshair;user-select:none}
      .td-minimap-track canvas{display:block;width:100%;height:100%;pointer-events:none}
      .td-minimap-slider{position:absolute;left:0;right:0;min-height:16px;background:var(--apr-active-row);border-left:2px solid var(--apr-bar-hover);cursor:grab;touch-action:none;transition:background .12s}
      .td-minimap-track:hover .td-minimap-slider{background:color-mix(in srgb,var(--apr-text) 15%,transparent)}
      .td-minimap[data-dragging="true"] .td-minimap-slider{cursor:grabbing;background:color-mix(in srgb,var(--apr-text) 20%,transparent)}
      .td-minimap-slider:focus-visible{outline:2px solid var(--apr-text);outline-offset:-2px}
      .td-minimap-tip{position:absolute;right:calc(100% + 10px);width:285px;padding:11px 13px;background:var(--apr-panel-bg);border:1px solid var(--apr-panel-border);border-radius:9px;box-shadow:var(--apr-shadow);font-size:12px;line-height:19px;pointer-events:none;z-index:5;overflow:hidden}
      .td-minimap-tip strong{display:block;margin-bottom:6px;font-weight:550;line-height:20px}.td-minimap-tip div{color:var(--apr-muted);white-space:nowrap;text-overflow:ellipsis;overflow:hidden}.td-minimap-tip small{display:block;margin-top:7px;color:var(--apr-faint);font-size:10px}
      .navigator[data-navigation-style="minimap"] .preview-panel{top:0;right:calc(100% + 10px);transform:none;max-height:calc(100dvh - 180px);}
      .navigator[data-navigation-style="minimap"]:not([data-pinned="true"]) .preview-panel{opacity:0;visibility:hidden;pointer-events:none;transform:none}
      .navigator[data-navigation-style="minimap"][data-pinned="true"] .preview-panel{opacity:1;visibility:visible;pointer-events:auto;transform:none}
      .navigator[data-navigation-style="minimap"][data-pinned="true"] .td-minimap-tip{display:none}
    `;shadowRoot.appendChild(style);
    const release=(event,cancel=false)=>{
      const d=tdMinimap.drag;if(!d)return;
      if(event.pointerId!==undefined && event.pointerId!==d.id)return;
      if(d.raf!==null)cancelAnimationFrame(d.raf);
      if(!cancel && d.mode==='geometry' && tdAlive(d.scope)){
        const rect=canvas.getBoundingClientRect();const layout=tdMinimap.layout;
        scrollRootTo(layout.root,((event.clientY-rect.top-d.grab)/rect.height)*layout.extent-d.offset,'auto');
      }
      tdMinimap.drag=null;wrap.dataset.dragging='false';tip.hidden=true;
      try{track.releasePointerCapture(d.id);}catch{}
      if(!cancel && d.mode==='index' && Number.isInteger(d.entry) && tdAlive(d.scope))void navigateToEntry(d.entry);
      tdScheduleMinimap(true);
    };
    track.addEventListener('pointerdown',event=>{
      if(event.button!==0 || !tdMinimap.layout)return;
      event.preventDefault();event.stopPropagation();navigationToken++;userNavigationEpoch++;
      const rect=canvas.getBoundingClientRect();const sr=slider.getBoundingClientRect();const layout=tdMinimap.layout;
      const grabbed=event.target===slider;const hit=tdMinimapHit(event.clientY);
      tdMinimap.drag={id:event.pointerId,scope:tdScope(),mode:layout.mode,grab:grabbed?event.clientY-sr.top:sr.height/2,offset:layout.from*layout.extent-layout.scroll,raf:null,y:hit?.y || 0,entry:hit?.spec.index};
      track.setPointerCapture(event.pointerId);wrap.dataset.dragging='true';tip.hidden=true;
      tdMinimapMove(event.clientY);
    });
    track.addEventListener('pointermove',event=>{if(tdMinimap.drag)tdMinimapMove(event.clientY);else tdMinimapTooltip(event.clientY);});
    window.addEventListener('keydown',event=>{
      if(event.key==='Escape' && tdMinimap.drag){event.preventDefault();event.stopPropagation();release({pointerId:tdMinimap.drag.id},true);}
    },true);
    window.addEventListener('blur',()=>{if(tdMinimap.drag)release({pointerId:tdMinimap.drag.id},true);});
    track.addEventListener('pointerup',event=>release(event));track.addEventListener('pointercancel',event=>release(event,true));
    track.addEventListener('lostpointercapture',event=>release(event,true));
    track.addEventListener('pointerleave',()=>{if(!tdMinimap.drag)tip.hidden=true;});
    track.addEventListener('wheel',event=>{
      if(!tdMinimap.layout)return;event.preventDefault();event.stopPropagation();navigationToken++;userNavigationEpoch++;
      const unit=event.deltaMode===1?18:event.deltaMode===2?tdMinimap.layout.view:1;
      scrollRootBy(tdMinimap.layout.root,event.deltaY*unit,'auto');tdScheduleMinimap();
    },{passive:false});
    slider.addEventListener('keydown',event=>{
      if(!['ArrowUp','ArrowDown','PageUp','PageDown','Home','End'].includes(event.key)||!tdMinimap.layout)return;
      event.preventDefault();event.stopPropagation();navigationToken++;userNavigationEpoch++;
      const layout=tdMinimap.layout;
      if(layout.mode==='index') {
        const index=event.key==='Home'?0:event.key==='End'?entries.length-1:Math.max(0,Math.min(entries.length-1,activeIndex+(/Up/.test(event.key)?-1:1)));
        void navigateToEntry(index);return;
      }
      const top=event.key==='Home'?0:event.key==='End'?getRootScrollMax(layout.root):getRootScrollTop(layout.root)+(/Up/.test(event.key)?-1:1)*(/Page/.test(event.key)?layout.view*.8:80);
      scrollRootTo(layout.root,top,'auto');tdScheduleMinimap();
    });
    tdMinimap.resize=new ResizeObserver(()=>tdScheduleMinimap(true));tdMinimap.resize.observe(track);
    const row=document.createElement('label');row.className='setting-row';
    row.innerHTML='<span class="setting-copy"><span class="setting-name">右侧导航样式</span><span class="setting-description">普通导航保持原交互。Minimap 是可切换的正文缩略图：支持点击、拖动视口、滚轮与键盘；历史位置未加载时降级为会话索引。</span></span><select class="select-input" name="navigationStyle"><option value="rail">普通导航条</option><option value="minimap">Minimap（试用）</option></select>';
    settingsFormEl.querySelector('[name="answerOutlineMode"]')?.closest('.setting-row')?.before(row);
    tdUpdateMinimapVisibility();
  }


  function formatReviewCommentsPrefix(rawComments = reviewComments) {
    return (Array.isArray(rawComments) ? rawComments : [])
      .filter((comment) => comment && normalizeInlineReviewText(comment.quote))
      .map(serializeReviewComment)
      .map((comment, index) => {
        const quote = normalizeInlineReviewText(comment.quote).replace(/^>+\s*/, '');
        const note = normalizeMultilineText(comment.note);
        return `【注释 ${index + 1}】\n所选文本：${quote}\n用户评论：${note}`;
      }).join('\n\n');
  }

  function composePromptWithReviewComments(rawQuestion, rawComments = reviewComments) {
    const question = normalizeMultilineText(rawQuestion);
    if (!question) return '';
    const prefix = formatReviewCommentsPrefix(rawComments);
    return prefix ? `${prefix}\n\n本轮问题：\n${question}` : question;
  }







  function isChatGptComposerSubmitIntentButton(button, composer = getChatGptComposer(), glyphOnly = false) {
    const fact=tdControlFact(button,tdComposerControlScope(composer));
    return Boolean(fact && (fact.kind==='send'||(!glyphOnly&&fact.kind==='steer')));
  }


  function tdInsertLineBreak(editor) {
    if(!(editor instanceof HTMLElement)||!editor.isConnected||td.composing||tdEditor.active||td.tx)return false;
    if(tdNewline.active)return false;
    if(editor instanceof HTMLTextAreaElement&&(editor.disabled||editor.readOnly))return false;
    const op={editor,scope:tdScope(),before:tdNewlineShape(editor)},oldWriting=td.writing;
    tdNewline.active=op;td.writing=true;
    try {
      if(editor instanceof HTMLTextAreaElement) {
        editor.setRangeText('\n',editor.selectionStart,editor.selectionEnd,'end');
        editor.dispatchEvent(new InputEvent('input',{bubbles:true,composed:true,inputType:'insertLineBreak',data:null}));
        tdFinishNewline(op,'text-control');return true;
      }
      const selection=window.getSelection();
      if(!editor.isContentEditable||!selection?.rangeCount){tdNewline.active=null;return false;}
      const range=selection.getRangeAt(0);
      if(!editor.contains(range.startContainer)||!editor.contains(range.endContainer)){tdNewline.active=null;return false;}
      const view=tdProseMirrorView(editor);
      if(view?.state?.schema) {
        const state=view.state,kind=state.schema.nodes.hard_break||state.schema.nodes.hardBreak;
        if(kind&&typeof state.tr.replaceSelectionWith==='function') {
          let tr=state.tr;
          if(typeof view.posAtDOM==='function'&&typeof state.selection.constructor.create==='function') {
            const a=view.posAtDOM(range.startContainer,range.startOffset),b=view.posAtDOM(range.endContainer,range.endOffset);
            tr=tr.setSelection(state.selection.constructor.create(state.doc,a,b));
          }
          view.dispatch(tr.replaceSelectionWith(kind.create(),true).setMeta('threaddeck','newline').scrollIntoView());
          const changed=!view.state.doc.eq(state.doc);
          tdFinishNewline(op,'prosemirror-hard-break');return changed;
        }
      }
      // Ask the owner's standard Shift+Enter handler, not beforeinput. Synthetic
      // key events have no browser edit default: acknowledgement is an actual
      // document change. A cancelled key with no edit is explicitly unconfirmed.
      const key=new KeyboardEvent('keydown',{key:'Enter',code:'Enter',shiftKey:true,bubbles:true,composed:true,cancelable:true});
      tdNewlineEvents.add(key);editor.dispatchEvent(key);
      if(tdNewlineShape(editor)!==op.before){tdFinishNewline(op,'owner-keymap');return true;}
      if(key.defaultPrevented) {
        requestAnimationFrame(()=>tdFinishNewline(op,'owner-keymap-deferred'));
        return true; // Receipt is checked above; no second insertion can race it.
      }
      // One browser editing transaction. No manufactured cancellable beforeinput
      // and no raw DOM replacement; the editor sees the browser's edit events.
      const ok=typeof document.execCommand==='function'&&document.execCommand('insertLineBreak',false,null);
      tdFinishNewline(op,'native-line-break');return Boolean(ok&&tdNewlineShape(editor)!==op.before);
    } catch(error) {tdNewline.active=null;tdLog('newline-failed',error?.name);return false;}
    finally {td.writing=oldWriting;}
  }

  async function tdSendComposerNow(composer) {
    if (tdNewline.active || tdEditor.active || tdEditorBlocked(composer)) { showToast('请先完成或恢复当前草稿合并，没有发送',2400); return false; }
    if (!settings.enabled || td.tx || td.composing || td.writing || !composer?.isConnected || composer !== getChatGptComposer()) {
      if (td.tx) showToast('上一条发送正在确认，请稍候；当前草稿已保留', 2200);
      return false;
    }
    const text = getComposerText(composer);
    if (!text) return false;
    const owner=tdDraftSubmissionOwner(composer,text);
    if(owner){tdReconcileUncertain();showToast(owner.sendReceipt?.ackedAt?'这条已经发送，不会重复提交':'这条正在核对上屏，不会重复提交',2200);return false;}
    if (tdUncertainDraft(text)) { tdRecordDispatch('uncertain-send'); showToast('这份内容可能已经提交，请先核对队列中的上屏结果；没有重复发送',3300); return false; }
    if (composerHasAttachments(composer)) {
      showToast('附件草稿已保留；请使用网页原生发送按钮提交', 2300);
      return false;
    }
    // Only controls already offered by the webpage are eligible. Never equate
    // "guide this turn" with an unannounced stop/cancel followed by a new turn.
    const control = tdPreferredSendControl('native-now');
    if (!control || control.disabled || control.getAttribute('aria-disabled') === 'true') {
      tdRecordDispatch('native-control-unavailable');
      showToast('网页当前没有可用的发送／调整方向控件。内容已保留，未停止回答', 3600);
      return false;
    }
    if (!tdEnabled()) {
      // A brand-new chat has no stable ID yet. No annotations/queue may cross into it.
      if (isCurrentPageEligible() || isChatGptSharePage() || getRouteKey() !== routeKey) return false;
      td.allowButton = control; td.allowForm = composer.closest('form');
      try { control.click(); } finally { td.allowButton = null; td.allowForm = null; }
      return true;
    }
    const comments = settings.enableInlineComments ? pendingReviewSnapshot() : [];
    td.nativeIntent = null;
    return tdSendWithAnnotations(composer, text, comments, { intent: 'native-now', source: 'command-enter' });
  }

  function installPendingCommentSubmissionBridge() {
    if (pendingCommentBridgeInstalled) return;
    pendingCommentBridgeInstalled = true;
    const stop = (event) => { event.preventDefault(); event.stopImmediatePropagation(); event.stopPropagation(); };
    const composerTarget = (event, composer) => composer && (event.composedPath?.().includes(composer) || composer.contains(event.target));
    const nativeContinuation = (event, composer) => {
      const intent = td.nativeIntent;
      if (!intent || !tdAlive(intent.scope) || intent.composer !== composer || Date.now() > intent.until) return false;
      if (event.type === 'submit' && !intent.formPassed && getComposerText(composer) === intent.text) {
        intent.formPassed = true; return true;
      }
      return false;
    };
    const passNative = (event, composer, text, source) => {
      const receipt=tdEditor.receipts.get(composer);
      if(receipt && tdAlive(receipt.scope))receipt.committed=true;
      // A DOM click may generate a form submit; that is one gesture, not a second send.
      td.nativeIntent = { scope: tdScope(), composer, text, until: Date.now()+1000, formPassed: event.type === 'submit' };
      tdArmRun(source, text);
      tdLog('send-native', event.type);
      return false;
    };
    const handle = (event, composer, forceQueue = false) => {
      if (!tdEnabled() || td.composing) return false;
      if (tdNewline.active || tdEditor.active || td.writing) { stop(event); return true; }
      if (tdEditorBlocked(composer)) { stop(event); showToast('上次合并尚未恢复。请先修改草稿，或在“诊断与恢复”中复制备份；没有重复插入或发送',3600); return true; }
      if (nativeContinuation(event, composer)) return false;
      const text = getComposerText(composer);
      if (!text) return false;
      if (event.repeat) { stop(event); return true; }
      const owner=tdDraftSubmissionOwner(composer,text);
      if(owner){stop(event);tdReconcileUncertain();showToast(owner.sendReceipt?.ackedAt?'这条已发送；保留了未能安全清除的草稿':'这条正在核对上屏，不会重复入队或发送',2200);return true;}
      const activity = getChatGptActivitySnapshot();
      if(activity.phase==='unknown')tdScheduleTurnCheck(0,true);
      const waiting = forceQueue || tdIntentBusy(activity, true) || promptQueue.length > 0 || Boolean(td.tx);
      const comments = settings.enableInlineComments ? pendingReviewSnapshot() : [];
      if (!settings.enterQueuesWhileGenerating && !promptQueue.length && !td.tx && !comments.length && !forceQueue) {
        return passNative(event, composer, text, 'native-queue-disabled');
      }
      if (composerHasAttachments(composer)) {
        if (waiting || comments.length) {
          stop(event); showToast('附件草稿已保留：请等待当前回答结束；批注暂不自动合并到附件消息', 3300); return true;
        }
        return passNative(event, composer, text, 'native-attachment');
      }
      // The important fast path: do NOT enqueue, rewrite, clear, or replay an idle
      // ordinary send. Observe its lifecycle and let the original trusted event run.
      if (!waiting && !comments.length) return passNative(event, composer, text, 'native-direct');
      stop(event);
      if (td.tx && !td.tx.clicked && td.tx.composer === composer) {
        showToast('正在准备上一条问题，请稍候', 1200); return true;
      }
      if (!waiting) { void tdSendWithAnnotations(composer, text, comments); return true; }
      const scope = tdScope();
      if (!addPromptToQueue(tdAnnotationQuestion(composer,text), { source: forceQueue ? 'shortcut' : 'manual', silent: true, comments })) return true;
      const item = promptQueue.at(-1);
      if (comments.length) removePendingReviewSnapshot(comments);
      // Capture is committed only after clearing exactly the captured draft.
      // The writer guards another Enter during its short reconciliation window.
      item.status='preparing';
      void (async()=>{
        const cleared=await tdWriteEditor(composer,'',text,scope);
        if(!tdAlive(scope))return;
        if(!cleared) {
          promptQueue=promptQueue.filter(q=>q.id!==item.id);
          if(comments.length)restorePendingReviewSnapshot(comments);
          showToast(tdEditorFailureText(),3200);
        } else {item.status='waiting';showToast(`已排队 · 第 ${promptQueue.length} 条`,1000);}
        saveWorkflowState();renderWorkflowPanel();tdWake(80);
      })();
      saveWorkflowState(); renderWorkflowPanel();
      return true;
    };
    const key = (event) => {
      if (!(event instanceof KeyboardEvent) || tdNewlineEvents.has(event) || !['Enter','NumpadEnter'].includes(event.code) && event.key!=='Enter') return;
      const composer = getChatGptComposer();
      if (!composerTarget(event, composer)) return;
      if (!settings.enabled || isChatGptSharePage() || event.key !== 'Enter') return;
      if (event.isComposing || event.keyCode === 229 || td.composing) {
        td.beforeInputNewline = true;
        return; // Never turn an IME confirmation into an application send.
      }
      if (td.allowButton || td.allowForm) return;
      td.nativeIntent = null;
      td.enterGuard = null;
      td.beforeInputNewline = false;
      // Newline modifiers take precedence, including Cmd+Option+Enter.
      if(event.shiftKey&&!event.altKey){td.beforeInputNewline=true;return;}
      if (event.altKey) {
        stop(event);
        td.beforeInputNewline = true;
        td.enterGuard = { composer, href: location.href, until: Date.now() + 1500, kind: 'newline' };
        if (!tdInsertLineBreak(composer)) showToast('编辑器暂未接受换行，草稿已保留；没有发送或排队', 2300);
        return;
      }
      if (event.metaKey || event.ctrlKey) {
        stop(event);
        td.enterGuard = { composer, href: location.href, until: Date.now() + 1500, kind: 'immediate' };
        if (!event.repeat) void tdSendComposerNow(composer);
        return;
      }
      if (handle(event, composer, false)) {
        td.enterGuard = { composer, href: location.href, until: Date.now() + 1500, kind: 'managed-send' };
      }
    };
    const button = (event) => {
      if ('button' in event && event.button !== 0) return;
      const target = event.composedPath?.().find((node) => node instanceof HTMLElement && node.matches('button,[role="button"]'));
      if (!target || target === td.allowButton || target.disabled || target.getAttribute('aria-disabled') === 'true') return;
      if (event.type === 'pointerdown' || (event.type === 'click' && event.isTrusted && event.detail > 0)) {
        td.enterGuard = null; td.beforeInputNewline = false;
      } else if (td.enterGuard?.composer === getChatGptComposer() && td.enterGuard.href === location.href && Date.now() < td.enterGuard.until) {
        const editor = getChatGptComposer();
        if (isChatGptComposerSubmitIntentButton(target, editor)) { stop(event); return; }
      }
      const composer = getChatGptComposer();
      if (!composer) return;
      if (td.gesture && td.gesture.button === target && event.type !== 'pointerdown') {
        const captured = td.gesture.captured;
        if (captured) stop(event);
        else if (td.nativeIntent) td.nativeIntent.until=Date.now()+1000;
        if (event.type === 'click') td.gesture = null;
        return;
      }
      if (!isChatGptComposerSubmitIntentButton(target, composer)) return;
      if (event.type === 'pointerdown' || event.type === 'click') td.nativeIntent = null;
      const captured = handle(event, composer, false);
      // Both pass-through and captured gestures must survive pointerdown -> click.
      if (event.type !== 'click') td.gesture = { button: target, captured, until: Date.now() + 1200 };
    };
    window.addEventListener('pointerup',()=>{const current=td.gesture;setTimeout(()=>{if(td.gesture===current)td.gesture=null;},1200);},true);
    window.addEventListener('pointercancel',()=>{td.gesture=null;td.nativeIntent=null;},true);
    window.addEventListener('blur',()=>{td.gesture=null;td.nativeIntent=null;});
    window.addEventListener('keydown', key, true);
    for (const type of ['keypress', 'keyup']) window.addEventListener(type, (event) => {
      const guard = td.enterGuard;
      if (event.key !== 'Enter' || !guard || guard.composer !== getChatGptComposer() || guard.href !== location.href ||
          Date.now() > guard.until || !composerTarget(event, guard.composer)) return;
      stop(event);
      if (type === 'keyup') {
        const previous = guard;
        window.setTimeout(() => { if (td.enterGuard === previous) { td.enterGuard = null; td.beforeInputNewline = false; } }, 0);
      }
    }, true);
    for (const type of ['pointerdown','mousedown','click']) window.addEventListener(type, button, true);
    window.addEventListener('submit', (event) => {
      if (event.target === td.allowForm) return;
      const guard = td.enterGuard;
      if (guard && Date.now() < guard.until && guard.href === location.href && event.target instanceof Element && event.target.contains(guard.composer)) { stop(event); return; }
      const composer = getChatGptComposer();
      if (composer && event.target instanceof Element && event.target.contains(composer)) handle(event, composer);
    }, true);
    // beforeinput is deliberately NOT intercepted as a send intent.
    window.addEventListener('compositionstart', (event) => { if (composerTarget(event, getChatGptComposer())) td.composing = true; }, true);
    window.addEventListener('compositionend', () => { td.composing = false; td.beforeInputNewline = false; tdWake(100); }, true);
    window.addEventListener('keyup', (event) => { if (event.key === 'Enter' && !td.enterGuard) td.beforeInputNewline = false; }, true);
    window.addEventListener('input', (event) => {
      const composer = getChatGptComposer();
      if (composerTarget(event, composer)) {
        if (!td.writing && !tdEditorMirrorEcho(event,composer)) td.editorRevision.set(composer, (td.editorRevision.get(composer) || 0) + 1);
        td.activityDirty = true; tdWake(100);
      }
    }, true);
  }


  function createWorkflowElement(tag, className = '', textContent = '') {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (textContent) element.textContent = textContent;
    return element;
  }




  function findChatGptComposerDockAnchor() {
    const composer = getChatGptComposer();
    if (!(composer instanceof HTMLElement)) return null;
    const composerRect = composer.getBoundingClientRect();
    const candidates = [];
    const seen = new Set();
    const append = (element) => {
      if (!(element instanceof HTMLElement) || seen.has(element) || !isElementVisible(element)) return;
      seen.add(element);
      candidates.push(element);
    };
    append(composer.closest('[data-testid="composer"]'));
    append(composer.closest('form'));
    let current = composer.parentElement;
    for (let depth = 0; current && depth < 6; depth += 1, current = current.parentElement) append(current);

    let best = null;
    let bestScore = Number.NEGATIVE_INFINITY;
    for (const candidate of candidates) {
      const rect = candidate.getBoundingClientRect();
      if (rect.width < Math.max(260, composerRect.width * 0.72) || rect.height > 320) continue;
      if (rect.bottom < 0 || rect.top > window.innerHeight) continue;
      let score = 0;
      if (candidate.tagName === 'FORM') score += 5;
      if (candidate.hasAttribute('data-testid')) score += 3;
      if (candidate.querySelector('button[data-testid="send-button"], button[type="submit"]')) score += 4;
      score -= Math.abs(rect.bottom - composerRect.bottom) / 60;
      score -= Math.max(0, rect.width - 980) / 180;
      score -= Math.max(0, rect.height - 180) / 45;
      if (score > bestScore) {
        best = candidate;
        bestScore = score;
      }
    }
    return best || composer.closest('form') || composer.parentElement;
  }

  function positionQueueDock() {
    queueDockPositionRaf = null;
    if (!queueDockEl || queueDockEl.hidden) return;
    const anchor = findChatGptComposerDockAnchor();
    if (!(anchor instanceof HTMLElement)) {
      queueDockEl.hidden = true;
      return;
    }
    const rect = anchor.getBoundingClientRect();
    if (rect.width < 260 || rect.top < 24 || rect.left > window.innerWidth - 40 || rect.right < 40) {
      queueDockEl.hidden = true;
      return;
    }
    const maxWidth = Math.min(920, window.innerWidth - 24);
    const width = Math.max(280, Math.min(rect.width, maxWidth));
    const left = Math.min(
      Math.max(12, rect.left + (rect.width - width) / 2),
      Math.max(12, window.innerWidth - width - 12),
    );
    const commentReserve = (
      settings.enableInlineComments &&
      reviewComments.length > 0 &&
      commentAggregateBadgeEl instanceof HTMLElement &&
      !commentAggregateBadgeEl.hidden
    ) ? (commentAggregateBadgeEl.offsetHeight || 36) + COMMENT_BADGE_GAP_PX : 0;
    const bottom = Math.max(10, window.innerHeight - rect.top + QUEUE_DOCK_GAP_PX + commentReserve);
    queueDockEl.style.left = `${Math.round(left)}px`;
    queueDockEl.style.width = `${Math.round(width)}px`;
    queueDockEl.style.bottom = `${Math.round(bottom)}px`;
    queueDockEl.style.maxHeight = `${Math.min(QUEUE_DOCK_MAX_HEIGHT_PX, Math.max(86, rect.top - 34 - commentReserve))}px`;
    scheduleQueueDockMenuPosition();
  }

  function scheduleQueueDockPosition() {
    if(tdDeferInteraction('scheduleQueueDockPosition'))return;
    if (queueDockPositionRaf !== null) return;
    queueDockPositionRaf = requestAnimationFrame(positionQueueDock);
  }

  function clearQueueDockDropIndicators() {
    if (!queueDockEl) return;
    queueDockEl.querySelectorAll('[data-drop-before], [data-drop-after], [data-dragging]').forEach((item) => {
      item.removeAttribute('data-drop-before');
      item.removeAttribute('data-drop-after');
      item.removeAttribute('data-dragging');
    });
    queueDropId = '';
    queueDropAfter = false;
  }

  function reorderQueuedPrompt(dragId, targetId, after = false) {
    if (queueProcessing) return false;
    if (!dragId || !targetId || dragId === targetId || queueProcessing) return false;
    const sourceIndex = promptQueue.findIndex((item) => item.id === dragId);
    if (sourceIndex < 0) return false;
    const [item] = promptQueue.splice(sourceIndex, 1);
    let targetIndex = promptQueue.findIndex((candidate) => candidate.id === targetId);
    if (targetIndex < 0) {
      promptQueue.splice(sourceIndex, 0, item);
      return false;
    }
    if (after) targetIndex += 1;
    promptQueue.splice(Math.max(0, Math.min(promptQueue.length, targetIndex)), 0, item);
    scheduleWorkflowSave();
    renderWorkflowPanel();
    return true;
  }

  function queueDockStatusLabel() {
    const head = promptQueue[0];
    if (queueProcessing) return td.tx?.clicked ? '已点击发送，正在确认上屏' : td.tx?.intent === 'interrupt' ? '正在停止当前回答，随后插话' : '准备发送';
    if (head?.status === 'uncertain') return '提交结果待核对 · 不会自动重发';
    if (head?.status === 'failed') return head.error || '发送前校验未通过';
    if (Date.now()<tdChatBackoffUntil) return 'ChatGPT 暂时限流 · 恢复后续发';
    if (queuePaused) return '已暂停 · 点击右侧 … 恢复';
    if (head && !normalizeMultilineText(head.text)) return '问题内容为空 · 请编辑或删除';
    if (!settings.enabled) return '对话工具已停用';
    if (document.visibilityState !== 'visible' && !settings.allowBackgroundQueue) return '返回此标签页后继续';
    const activity = getChatGptActivitySnapshot();
    if (activity.phase === 'unknown') return tdTurn.failures ? '状态核对暂不可用 · 可点立即提交' : '当前状态待核对 · 可点立即提交';
    if (activity.phase === 'planning') return '等待思考或推理完成 · 可立即提交这一条';
    if (activity.phase === 'streaming') return '等待当前回答完成';
    if (activity.phase === 'settling') return '正在核对最终回答 · 可在 … 查看状态';
    if (composerHasAttachments()) return '输入框有附件 · 暂不自动发送';
    if (getComposerText() && !td.staged) return '保留你的输入草稿 · 清空后续发';
    if (activeCommentMode === 'compose') return '等待保存当前批注';
    if (shadowRoot?.activeElement?.matches?.('[data-queue-text]')) return '正在编辑队列 · 移开焦点后续发';
    return settings.autoRunQueue ? '即将发送下一条' : '自动发送已关闭';
  }
  function updateQueueDockRuntimeState() {
    if (!queueDockEl) return;
    const eligible = (
      site.id === 'chatgpt' &&
      isCurrentPageEligible() &&
      !isChatGptSharePage() &&
      settings.enabled && settings.showQueueDock &&
      promptQueue.length > 0
    );
    if (!eligible) {
      queueDockEl.hidden = true;
      if (queueMenuEl) queueMenuEl.hidden = true;
      return;
    }
    if (queueDockEl.hidden) queueDockEl.hidden = false;
    const activity = getChatGptActivitySnapshot();
    const status = queueDockEl.querySelector('[data-queue-primary-status]');
    if (status) {
      const firstCommentCount = Array.isArray(promptQueue[0]?.comments) ? promptQueue[0].comments.length : 0;
      const text = `${queueDockStatusLabel()}${firstCommentCount ? ` · ${firstCommentCount} 条批注` : ''}`;
      if (status.textContent !== text) status.textContent = text;
    }
    queueDockEl.querySelectorAll('[data-action="queue-dock-send-item"]').forEach((button) => {
      if (button instanceof HTMLButtonElement) button.disabled = queueProcessing || activity.busy || !promptQueue.length;
    });
    queueDockEl.querySelectorAll('[data-action="queue-dock-interject"]').forEach((button) => {
      const item = promptQueue.find(q => q.id === button.dataset.queueId);
      button.disabled = queueProcessing || !item || !normalizeMultilineText(item.text) || ['sending','preparing','uncertain'].includes(item.status);
      const label = activity.steerControl ? '插话' : '立即提交';
      const copy = button.querySelector('span'); if (copy && copy.textContent !== label) copy.textContent = label;
      button.title = '立即提交这一条，跳过 本地等待；不会停止回答，不改变其他队列项';
    });
    if (activity.phase !== queueLastRenderedPhase) {
      queueLastRenderedPhase = activity.phase;
      queueDockEl.dataset.activity = activity.phase;
    }
    scheduleQueueDockPosition();
  }
  function resizeQueueDockTextarea(textarea) {
    if (!(textarea instanceof HTMLTextAreaElement)) return;
    textarea.style.height = 'auto';
    textarea.style.height = `${Math.min(68, Math.max(24, textarea.scrollHeight))}px`;
  }

  function positionQueueDockMenu() {
    queueMenuPositionRaf = null;
    if (!queueMenuEl || queueMenuEl.hidden || !queueMenuOpenId || !queueDockEl || queueDockEl.hidden) return;
    const anchor = queueDockEl.querySelector(`[data-action="queue-dock-more"][data-queue-id="${cssEscape(queueMenuOpenId)}"]`);
    if (!(anchor instanceof HTMLElement) || !isElementVisible(anchor)) {
      queueMenuEl.hidden = true;
      return;
    }
    const anchorRect = anchor.getBoundingClientRect();
    const menuRect = queueMenuEl.getBoundingClientRect();
    const gap = 7;
    let top = anchorRect.top - menuRect.height - gap;
    if (top < 8) top = Math.min(window.innerHeight - menuRect.height - 8, anchorRect.bottom + gap);
    const left = Math.min(
      window.innerWidth - menuRect.width - 8,
      Math.max(8, anchorRect.right - menuRect.width),
    );
    queueMenuEl.style.left = `${Math.round(left)}px`;
    queueMenuEl.style.top = `${Math.round(Math.max(8, top))}px`;
  }

  function scheduleQueueDockMenuPosition() {
    if (queueMenuPositionRaf !== null) return;
    queueMenuPositionRaf = requestAnimationFrame(positionQueueDockMenu);
  }

  function renderQueueDockMenu() {
    if(!queueMenuEl)return;
    const item=promptQueue.find(q=>q.id===queueMenuOpenId);
    if(!item||queueDockEl?.hidden){queueMenuEl.hidden=true;td.menuRenderKey='';return;}
    const key=[item.id,item.status,queuePaused,queueProcessing].join('|');
    if(td.menuRenderKey===key&&!queueMenuEl.hidden){scheduleQueueDockMenuPosition();return;}
    td.menuRenderKey=key;const fragment=document.createDocumentFragment();
    const add=(label,action,disabled=false)=>{const b=document.createElement('button');b.type='button';b.textContent=label;b.dataset.action=action;b.dataset.queueId=item.id;b.disabled=disabled;b.setAttribute('role','menuitem');fragment.append(b);};
    if(item.status==='uncertain'||item.status==='failed')add('诊断与恢复…','td-support');
    else add('编辑问题','queue-dock-edit',['preparing','sending'].includes(item.status));
    add(queuePaused?'继续队列':'暂停队列','queue-dock-pause',queueProcessing);
    add('清空队列…','queue-dock-clear',queueProcessing);
    queueMenuEl.replaceChildren(fragment);queueMenuEl.hidden=false;scheduleQueueDockMenuPosition();
  }

  function renderQueueDock() {
    if(tdDeferInteraction('renderQueueDock'))return;
    if (!queueDockEl || !queueDockListEl) return;
    const eligible=site.id==='chatgpt' && isCurrentPageEligible() && !isChatGptSharePage() && settings.enabled && settings.showQueueDock && promptQueue.length>0;
    queueDockEl.hidden=!eligible;
    if (!eligible) {
      if (queueDockListEl.childElementCount) queueDockListEl.replaceChildren();
      if (queueMenuOpenId) tdCloseQueueMenu();
      if (queueMenuEl) queueMenuEl.hidden=true;
      td.queueRenderKey=''; return;
    }
    // Keyed reconciliation. Never replace a textarea/button between pointerdown
    // (which moves focus) and click (which performs edit/delete). Stream refreshes
    // update text/status without invalidating the browser's pending gesture.
    const existing=new Map([...queueDockListEl.children].map(row=>[row.dataset.queueDockItem,row]));
    let cursor=queueDockListEl.firstElementChild;
    for (let index=0;index<promptQueue.length;index++) {
      const item=promptQueue[index]; let row=existing.get(item.id);
      if (!row) {
        row=document.createElement('article'); row.className='queue-dock-item'; row.dataset.queueDockItem=item.id; row.setAttribute('role','listitem');
        const handle=document.createElement('span'); handle.className='queue-dock-handle'; handle.dataset.queueDragHandle=item.id;
        handle.setAttribute('role','button');handle.tabIndex=0;handle.title='拖动排序；Option/Alt + ↑↓ 也可排序';handle.innerHTML=threadDeckIcon('queue');
        const main=document.createElement('div');main.className='queue-dock-main';
        const text=document.createElement('textarea');text.className='queue-dock-text';text.rows=1;text.dataset.queueText=item.id;text.spellcheck=false;
        text.addEventListener('focus',()=>{td.editingQueueId=item.id;queueLastEditAt=Date.now();});
        const meta=document.createElement('div');meta.className='queue-dock-meta';main.append(text,meta);
        const controls=document.createElement('div');controls.className='queue-dock-controls';
        const interject=document.createElement('button');interject.type='button';interject.className='queue-dock-direction';
        interject.dataset.action='queue-dock-interject';interject.dataset.queueId=item.id;interject.innerHTML=threadDeckIcon('redirect')+'<span>插话</span>';
        const remove=document.createElement('button');remove.type='button';remove.className='queue-dock-icon';remove.dataset.action='queue-dock-remove';remove.dataset.queueId=item.id;remove.title=tr('删除');remove.innerHTML=threadDeckIcon('trash');
        const more=document.createElement('button');more.type='button';more.className='queue-dock-icon';more.dataset.action='queue-dock-more';more.dataset.queueId=item.id;more.setAttribute('aria-label','更多队列操作');more.title=tr('更多');more.innerHTML=threadDeckIcon('more');
        controls.append(interject,remove,more);row.append(handle,main,controls);
      }
      existing.delete(item.id);
      if (row!==cursor) queueDockListEl.insertBefore(row,cursor);
      cursor=row.nextElementSibling;
      row.dataset.status=item.status || 'waiting';row.setAttribute('aria-label',`第 ${index+1} 条排队问题`);
      const handle=row.querySelector('[data-queue-drag-handle]');handle.draggable=!queueProcessing && !['sending','preparing','uncertain'].includes(item.status);handle.setAttribute('aria-label',`拖动第 ${index+1} 条排队问题`);
      const text=row.querySelector('[data-queue-text]');
      if (shadowRoot.activeElement!==text && text.value!==item.text) text.value=item.text;
      text.disabled=['sending','preparing','uncertain'].includes(item.status);text.setAttribute('aria-label',`队列第 ${index+1} 条内容`);
      const meta=row.querySelector('.queue-dock-meta');
      if (index===0) meta.dataset.queuePrimaryStatus='true';else delete meta.dataset.queuePrimaryStatus;
      const count=(item.comments||[]).length;
      const label=(index===0?queueDockStatusLabel():`排队第 ${index+1} 条`)+(count?` · ${count} 条批注`:'');
      if (meta.textContent!==label) meta.textContent=label;
      const remove=row.querySelector('[data-action="queue-dock-remove"]');
      // Preflight is cancellable; only a native send already fired is irreversible.
      remove.disabled=item.status==='sending';remove.title=remove.disabled?'已交给 ChatGPT，等待确认，无法从本地撤回':'删除';remove.setAttribute('aria-label',`删除第 ${index+1} 条排队问题`);
    }
    for (const row of existing.values()) row.remove();
    renderQueueDockMenu();tdSyncMoreButtons();updateQueueDockRuntimeState();
    requestAnimationFrame(()=>{
      queueDockListEl?.querySelectorAll('.queue-dock-text').forEach(resizeQueueDockTextarea);
      scheduleQueueDockPosition();
    });
  }


  function renderWorkflowPanel() {
    renderQueueDock();
    syncInlineCommentBadges();
  }
  function openWorkflow(tab = 'comments') {
    if (tab === 'comments') {
      if (reviewComments.length) openInlineCommentThread(ALL_COMMENTS_KEY, commentAggregateBadgeEl);
      else showToast('选中回答中的文字后即可添加批注', 1500);
      return;
    }
    if (!promptQueue.length) showToast('当前没有排队问题', 1400);
    else {
      renderQueueDock();
      scheduleQueueDockPosition();
    }
  }

  function updateWorkflowVisibility() {
    const eligible = settings.enabled && site.id === 'chatgpt' && isCurrentPageEligible() && !isChatGptSharePage();
    if (!eligible || !settings.enableInlineComments) {
      hideSelectionAction();
      closeInlineCommentPopover({ discardEmptyNew: false });
      clearInlineCommentBadges();
    } else {
      syncInlineCommentBadges();
    }
    renderQueueDock();
  }
  function installReviewSelectionListeners() {
 if(reviewSelectionListenersInstalled)return;reviewSelectionListenersInstalled=true;tdInstallSelectionGesture();
 document.addEventListener('selectionchange',()=>{tdSelectionSnapshot();if(!tdSelectionBusy())tdSelectionSchedule(36);},true);
 document.addEventListener('selectstart',()=>{if(tdSelectionBusy())return;tdSelection.serial++;tdSelection.sample=null;tdPauseSelectionIntegration();},true);
 // 只在选区已稳定时检查恢复。宿主清除选区后，释放暂存范围与观察器。
 window.setInterval(()=>{
   if(document.hidden||tdSelectionBusy()||td.tx||!settings.enabled||!settings.enableInlineComments||activeCommentMode==='compose')return;
   const s=window.getSelection();
   if(!s || s.isCollapsed){
     if(pendingSelection && Date.now()-pendingSelection.capturedAt>=NATIVE_SELECTION_PENDING_TTL_MS)hideSelectionAction();
     return;
   }
   if(s.rangeCount===1&&!tdDomActionVisible(nativeSelectionButtonEl)&&selectionActionEl?.hidden&&nativeSelectionFallbackTimer===null)tdSelectionSchedule(24);
 },650);
}

  function startQueueWatcher() {
    window.clearInterval(queueTimer);
    queueTimer = window.setInterval(() => {
      if (!tdEnabled()) return;
      if (promptQueue.length || td.tx || td.run || pendingCommentSubmissionReceipt) {
        td.activityDirty = true; tdWake();
      }
    }, 450);
    window.addEventListener('visibilitychange', () => { td.activityDirty = true; tdWake(); });
    window.addEventListener('pageshow', () => { td.activityDirty = true; tdWake(100); });
  }

  const tdZoom = {
    root: null, listener: null, surface: null, backdrop: null, list: null, stream: null,
    button: null, index: null, records: [],
    scene: null, preparation: null, control: false, tail: null, frame: 0, settle: 0,
  };
  const tdZoomReducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  const tdZoomExcluded = 'input,textarea,select,button,[contenteditable],[role="textbox"],[role="dialog"],nav,aside';
  const tdZoomBubble = '.user-message-bubble-color,[class*="message-surface"],[data-user-message-bubble]';
  const tdZoomChunk = 56;
  const tdZoomHistoryBudget = 36;
  const tdZoomHistoryTimeout = 12000;

  function tdZoomRoot() {
    const declared = document.querySelector('[data-thread-find-target="conversation"], [data-testid="conversation-thread"]');
    if (declared instanceof HTMLElement && declared.offsetWidth > 0 && declared.offsetHeight > 0) return declared;
    const detected = getChatGptThreadRoot();
    if (detected instanceof HTMLElement && !detected.matches('body,html')) return detected;
    return document.querySelector('main,[role="main"]');
  }

  function tdZoomHistoryPosition(root, node) {
    const view = tdNavClientBox(root), info = tdNavScrollInfo(root);
    return info.top + (node.getBoundingClientRect().top - view.top) / info.scale;
  }

  function tdZoomNativeScroll(root, top) {
    const info = tdNavScrollInfo(root);
    const options = {top:Math.min(info.max, Math.max(info.min, top)),behavior:'instant'};
    if (info.doc) window.scrollTo(options);
    else root.scrollTo(options);
  }

  function tdZoomCaptureHistory(scene, root) {
    const capture = scene.history;
    const viewport = tdNavClientBox(root), info = tdNavScrollInfo(root);
    const revision = [tdDomState.revision,tdDomScopes.revision,info.range,info.height,viewport.width].join(':');
    const last = capture.sample;
    // 视口内滚动不会改变已挂载消息的内容或绝对位置。
    if (last?.thread === scene.root && last.root === root && last.revision === revision) return false;
    const visibility = new WeakMap();
    const rows = ['user','assistant'].flatMap(role => tdDomRoleRoots(role,visibility)
      .filter(target => tdDomContains(scene.root,target))
      .map(target => ({target,role,address:tdMessageAddress(target,role)})))
      .filter(row => row.address.messageId)
      .sort((a,b) => compareDomOrder(a.target,b.target));
    const encountered = new Set(), sample = [];
    for (const {target, role, address} of rows) {
      const id = address.messageId;
      if (encountered.has(id)) continue;
      encountered.add(id);
      const previous = capture.messages.get(id);
      let rendered = role === 'user' ? tdZoomQuestionText({target}) : tdZoomAnswerText({target});
      if (!rendered && role === 'assistant') {
        const exact = tdDomFindExact([id],role);
        if (exact && exact !== target && tdDomContains(scene.root,exact)) rendered = tdZoomAnswerText({target:exact});
      }
      const raw = !rendered || role === 'user' && previous?.raw?.startsWith(rendered) ? previous?.raw || '' : rendered;
      if (!raw && !target.closest('[data-talvt-turn-state="complete"]') && !target.querySelector('[data-talvt-turn-state="complete"]')) continue;
      const blocks = role === 'assistant' && previous?.raw !== raw ? collectRenderedAnswerBlocks(target) : previous?.blocks || [];
      const top = info.top + (target.getBoundingClientRect().top - viewport.top) / info.scale;
      const turn = target.closest('[data-turn-key]')?.getAttribute('data-turn-key') || '';
      sample.push({id,role,address,raw,blocks,target,top,turn});
    }
    if (!sample.length) return false;
    capture.sample = {thread:scene.root,root,revision};
    const same = sample.find(message => capture.messages.has(message.id));
    capture.links ||= new Set();
    const mounted = new Map(sample.map(({id},index) => [id,index]));
    for (const link of capture.links) {
      const [before,after] = link.split('\u001f');
      if (mounted.has(before) && mounted.has(after) && mounted.get(before) >= mounted.get(after)) capture.links.delete(link);
    }
    for (let index = 1; index < sample.length; index++) capture.links.add(sample[index-1].id+'\u001f'+sample[index].id);
    capture.mounted = mounted;
    if (capture.complete && sample.some(message => capture.messages.get(message.id)?.raw !== message.raw)) {
      capture.complete = false;
      capture.attempted = false;
      capture.resume = null;
    }
    if (same) {
      const shift = same.top - capture.messages.get(same.id).top;
      if (Math.abs(shift) > 2) for (const row of capture.messages.values()) row.top += shift;
    }
    capture.order = tdMergeObservedOrder(capture.order,sample.map(message => message.id),true);
    for (const message of sample) capture.messages.set(message.id,message);
    tdZoomReconcileHistoryOrder(capture);
    return true;
  }

  function tdMergeObservedOrder(base, observed, preserveKnown = false) {
    // 章节可以随正文更新。会话只在有完整的顺序证据时才重排已知轮次。
    const existing = new Set(base);
    const anchors = observed.filter(item => existing.has(item));
    const seen = new Set(anchors);
    let anchorIndex = 0;
    const ordered = preserveKnown ? base : base.map(item => seen.has(item) ? anchors[anchorIndex++] : item);
    let pending = [], previous;
    const before = new Map();
    for (const item of observed) {
      if (!existing.has(item)) { pending.push(item); continue; }
      if (pending.length) { before.set(item,pending); pending = []; }
      previous = item;
    }
    const result = ordered.flatMap(item => [...(before.get(item) || []), item, ...(!preserveKnown && item === previous ? pending : [])]);
    if (preserveKnown || !anchors.length) result.push(...pending);
    return result;
  }

  function tdZoomReconcileHistoryOrder(capture) {
    // 虚拟列表有时会先换掉整个视口。之后可见的相邻消息能重新连接这些片段。
    const inbound=new Map(capture.order.map(id=>[id,0])), successors=new Map();
    for (const link of capture.links) {
      const [before,after]=link.split('\u001f');
      if (!inbound.has(before) || !inbound.has(after) || before===after) continue;
      const next=successors.get(before) || [];
      next.push(after);
      successors.set(before,next);
      inbound.set(after,inbound.get(after)+1);
    }
    const ordered=capture.order.filter(id=>inbound.get(id)===0);
    for (let index=0; index<ordered.length; index++) {
      for (const id of successors.get(ordered[index]) || []) {
        const remaining=inbound.get(id)-1;
        inbound.set(id,remaining);
        if (!remaining) ordered.push(id);
      }
    }
    const linked=ordered.length===capture.order.length && ordered.every((id,index)=>!index ||
      capture.links.has(ordered[index-1]+'\u001f'+id));
    if (linked) capture.order = ordered;
    capture.gap = !linked;
    if (!linked) capture.complete = false;
  }

  function tdZoomCapturedRecords(scene) {
    const records = [];
    let entry = null;
    for (const id of scene.history.order) {
      const row = scene.history.messages.get(id);
      if (!row.raw) { entry = null; continue; }
      if (row.role === 'user' || !entry || entry.anchorRole === 'assistant' || (row.turn && entry.turnKey && row.turn !== entry.turnKey)) {
        const title = row.role === 'user' ? row.raw : row.blocks[0]?.label || truncateText(row.raw.split('\n')[0],100);
        entry = {...row.address,key:`overview:${row.role}:${id}`,kind:row.role==='user'?'prompt':'assistant-output',
          anchorRole:row.role,text:title,rawQuestion:row.role==='user'?row.raw:'',target:row.target,turnKey:row.turn,
          answerRecords:[],answerBlocks:[]};
        records.push(entry);
      }
      if (row.role === 'user') continue;
      const answerOrdinal = entry.answerRecords.length;
      const blocks = row.blocks.map((block,index) => ({...block,key:`overview:${id}:${index}`,
        parentKey:entry.key,answerOrdinal,answerMessageId:id,answerNodeId:row.address.nodeId}));
      entry.answerRecords.push({...row.address,target:row.target,answerOrdinal,rawText:row.raw,blocks,
        outlineSchema:ANSWER_OUTLINE_CACHE_SCHEMA,outlineRawText:row.raw});
      entry.answerBlocks.push(...blocks);
    }
    return records;
  }

  function tdOutlineCapture(root) {
    const thread = tdZoomRoot();
    if (!thread) return null;
    let capture = tdHistory.capture;
    if (!capture || !tdAlive(capture.scope)) {
      capture = {root:thread,scope:tdScope(),history:{messages:new Map(),order:[]}};
      tdHistory.capture = capture;
    }
    capture.root = thread;
    capture.history.root = root;
    tdZoomCaptureHistory(capture,root);
    return capture;
  }

  function tdOutlineSavedOrder(records) {
    const order = tdHistory.verifiedOrder;
    if (!order || !tdAlive(order.scope)) return records;
    const byId = new Map(records.flatMap(entry=>tdNavRecordIds(entry).map(id=>[entryAnchorRole(entry)+':'+id,entry])));
    const observed = new Set();
    for (const {role,id,nodeId} of order.entries) {
      const entry = byId.get(role+':'+id) || byId.get(role+':'+nodeId);
      if (entry) observed.add(entry);
    }
    return tdMergeObservedOrder(records,[...observed]);
  }

  function tdOutlineReadSavedOrder() {
    if (!entries.some(entry=>entry.target?.isConnected || entry.answerRecords?.some(answer=>answer.target?.isConnected)) ||
        tdHealth.snapshot?.complete || tdHistory.capture?.history.complete || tdAlive(tdHistory.verifiedOrder?.scope)) return;
    const prior = tdHistory.orderLookup;
    const sameRoute = prior && tdAlive(prior.scope);
    if (sameRoute && (prior.pending || prior.revision === tdDomState.revision || prior.attempts >= 2)) return;
    const scope = tdScope(), revision = tdDomState.revision;
    const lookup = {scope,revision,pending:true,attempts:(sameRoute ? prior.attempts : 0)+1};
    tdHistory.orderLookup = lookup;
    void tdZoomCachedOverview({records:tdZoomRecords(),complete:false},true).then(result=>{
      lookup.pending = false;
      if (!tdAlive(scope) || result?.state !== 'ready' ||
          tdHistory.capture?.history.complete || tdAlive(tdHistory.verifiedOrder?.scope)) return;
      tdHistory.verifiedOrder = {scope,entries:result.entries};
      if (tdZoom.scene) tdZoom.scene.deferredRefresh = true;
      else scheduleRefresh('cached-outline-order',0);
    });
  }

  function tdOutlineMergeHistory(base, root) {
    const capture = tdOutlineCapture(root);
    const authoritative = tdHealth.snapshot?.complete === true;
    if (!capture?.history.order.length) return authoritative ? base : tdOutlineSavedOrder(base);
    const observed = tdZoomCapturedRecords(capture);
    const identity = (row,role=entryAnchorRole(row)) => tdNavRecordIds(row).map(id=>role+':'+id);
    const same = (record,other,role) => identity(record,role).some(id => identity(other,role).includes(id));
    const covered = new Map(base.flatMap(item=>identity(item).map(id=>[id,item])));
    const previousOwner = new Map(base.flatMap(item=>(item.answerRecords || [])
      .flatMap(answer=>identity(answer,'assistant').map(id=>[id,item]))));
    const observedTurns = new Map(observed.flatMap(row=>identity(row).map(id=>[id,row.turnKey])));
    const standalone = new Set(observed.filter(row=>{
      if (entryAnchorRole(row)!=='assistant' || !row.turnKey) return false;
      const owner = identity(row).map(id=>previousOwner.get(id)).find(Boolean);
      if (!owner || entryAnchorRole(owner)==='assistant') return true;
      // 如果提问尚未挂载，不能仅凭一条回复猜测它是独立轮次。
      return identity(owner).some(id=>observedTurns.get(id) && observedTurns.get(id)!==row.turnKey);
    }).flatMap(row=>identity(row)));
    const merged = base.map(item=>{
      const answers = item.answerRecords || [];
      if (!isUserAnchoredEntry(item)) return item;
      const attached = answers.filter(answer=>!identity(answer,'assistant').some(id=>standalone.has(id)));
      if (attached.length === answers.length) return item;
      const ordinals = new Set(attached.map(answer=>answer.answerOrdinal));
      return {...item,answerRecords:attached,answerBlocks:(item.answerBlocks || []).filter(block=>ordinals.has(block.answerOrdinal))};
    });
    const byKey = new Map(merged.map(entry => [entry.key,entry]));
    const ordered = [], visited = new Set();
    for (const row of observed) {
      const id = identity(row);
      const match = id.map(key=>covered.get(key)).find(Boolean);
      const oldOwner = id.map(key=>previousOwner.get(key)).find(Boolean);
      // 分段正文的第一条回答可能属于上一段已索引的提问。由相同消息身份认领。
      if (!match && oldOwner && !id.some(key=>standalone.has(key))) continue;
      const current = match ? byKey.get(match.key) : {...row,source:'native-history'};
      if (visited.has(current.key)) continue;
      visited.add(current.key);
      ordered.push(current);
      if (!match) continue;
      const known = current.answerRecords || [];
      const nativeAnswers = row.answerRecords.map(answer=>known.find(record=>same(record,answer,'assistant')) || answer);
      const answers = tdMergeObservedOrder(known,nativeAnswers);
      current.answerRecords = answers.map((answer,answerOrdinal)=>{
        const native = row.answerRecords.find(record=>same(record,answer,'assistant'));
        const original = answer.blocks?.length ? answer.blocks :
          (current.answerBlocks || []).filter(block=>block.answerOrdinal===answer.answerOrdinal);
        const outline = native && native !== answer ? tdMergeLiveOutline(original,native.blocks) : original;
        const blocks = outline.map(block=>({...block,parentKey:current.key,answerOrdinal}));
        return {...answer, answerOrdinal, blocks, target:native?.target?.isConnected ? native.target : answer.target,
          visibleRawText:native?.rawText || answer.visibleRawText};
      });
      current.answerBlocks = current.answerRecords.flatMap(answer=>answer.blocks);
      if (!current.rawQuestion && row.rawQuestion) current.rawQuestion = row.rawQuestion;
    }
    // 完整网页采集可以替换旧的 DOM 缓存。当前会话原生快照仍用于未挂载的源记录。
    if (capture.history.complete && !authoritative) return ordered;
    const records = tdMergeObservedOrder(merged,ordered,authoritative || capture.history.gap === true);
    return authoritative ? records : tdOutlineSavedOrder(records);
  }

  async function tdOutlineLoadHistory(manual = false) {
    if (site.id !== 'chatgpt' || !settings.enabled || !isCurrentPageEligible() || tdZoom.scene ||
        (tdHealth.snapshot?.complete === true && entries.length)) return;
    if (tdHistory.capture?.history.running || !manual && tdHistory.capture?.history.attempted) return;
    const capture = tdOutlineCapture(currentScrollRoot || findScrollRoot());
    if (!capture || capture.history.complete) return;
    try { await tdZoomRecoverHistory(capture,manual); }
    catch (error) { tdHealthFault('outline-history',error); }
  }

  function tdOutlineStopHistory() {
    const capture = tdHistory.capture;
    if (!capture?.history.running || capture.history.cancelled) return;
    capture.history.cancelled = true;
    tdZoomRestoreHistory(capture);
  }

  function tdZoomRestoreHistory(scene) {
    const capture = scene.history;
    const root = capture.root, origin = capture.origin;
    capture.origin = null;
    try {
      if (!root?.isConnected || !tdAlive(scene.scope) || !origin) return;
      const reference = capture.messages.get(origin.id);
      const mounted = reference?.target;
      const target = mounted?.isConnected && tdDomIds(mounted).includes(reference.id) ? mounted :
        reference && tdNavFindTurn(reference.address,reference.role);
      const info = tdNavScrollInfo(root);
      const shift = target ? tdZoomHistoryPosition(root,target) - origin.absolute :
        origin.atEnd ? info.max - origin.max : (reference ? reference.top - origin.absolute : 0);
      tdZoomNativeScroll(root,origin.top + shift);
    } finally {
      for (const unlock of capture.scrollLock?.cleanups || []) unlock();
      capture.scrollLock = null;
    }
  }

  function tdZoomEarlierMessagesPending(thread) {
    const indicator = thread.firstElementChild?.querySelector(':scope > [role="status"] > [data-loading-indicator]');
    return Boolean(indicator && tdDomTreeShown(indicator));
  }

  function tdZoomReplyRunning() {
    const activity = getChatGptActivitySnapshot();
    return Boolean(activity.strongEvidenceSeen || activity.stopControl || activity.steerControl ||
      activity.networkPending || activity.generationLease || td.tx);
  }

  async function tdZoomRecoverHistory(scene, manual = false) {
    const capture = scene.history;
    if (scene.complete || capture.running || (!manual && capture.attempted)) return;
    const outline = scene === tdHistory.capture;
    capture.cancelled = false;
    const alive = () => (outline ? tdHistory.capture === scene && !tdZoom.scene : tdZoom.scene === scene) &&
      tdAlive(scene.scope) && !document.hidden && !capture.cancelled;
    const update = (state,text) => {
      if (outline) {
        tdRenderOutlineCoverage();
        scheduleRefresh('outline-history',0);
      } else tdZoomTopicControls(scene,state,text);
    };
    // 宿主正在生成时等待终态。历史分页退避不影响已读取的回答。
    const parked = () => tdZoomMoving(scene) || tdReadBusy() || tdZoomReplyRunning();
    const historyBackoff = () => Math.max(tdReadState().until,tdChatBackoffUntil) > Date.now();
    if (!alive() || parked()) {
      update('history-retry',document.hidden?'回到此标签页后可继续补齐':'对话空闲后可继续补齐历史');
      return;
    }
    if (historyBackoff()) {
      if (!outline) queueMicrotask(()=>tdZoomHistoryStalled(scene));
      return;
    }
    capture.attempted = true;
    capture.exhausted = false;
    const resume = capture.resume;
    const root = findScrollRoot();
    capture.root = root;
    if (manual) capture.sample = null;
    const first = tdNavScrollInfo(root);
    tdZoomCaptureHistory(scene,root);
    const reference = [...capture.messages.values()].find(row => Math.abs(row.top - first.top) <= first.height);
    capture.origin = {top:first.top,max:first.max,atEnd:first.max-first.top<4,
      id:reference?.id,absolute:reference?.top};
    const initialCount = capture.order.length;
    capture.running = true;
    capture.scrollLock = {id: 'history', cleanups: new Set()};
    tdNavLockRoot(capture.scrollLock,root,'data-threaddeck-history-lock');
    update('history','正在补齐对话历史…');
    const until = performance.now() + (outline ? 24000 : tdZoomHistoryTimeout);
    let steps = 0, signaled = false;
    let finish = false, refine = false;
    const limits = {head:false,tail:capture.origin.atEnd && !capture.refined,...resume?.limits};
    let sampleFrame = 0;
    // 原生虚拟列表可能在两次滚动之间短暂挂载交叠的问答。
    const remounts = new MutationObserver(() => {
      if (sampleFrame || !alive() || scene.complete) return;
      sampleFrame = requestAnimationFrame(() => {
        sampleFrame = 0;
        if (!alive() || scene.complete) return;
        tdZoomCaptureHistory(scene,root);
      });
    });
    try {
      remounts.observe(scene.root,{childList:true,subtree:true,attributes:true,
        attributeFilter:['hidden','data-turn-key','data-talvt-turn-state']});
      // 概览覆盖正文期间驱动宿主滚动。每一步保留与上一个视口的重叠，既能挂载虚拟消息，
      // 也能触发 ChatGPT 自己的分页；扩展不构造会话请求或翻页令牌。
      if (resume?.top !== undefined) {
        tdZoomNativeScroll(root,resume.top);
        await tdDelay(190,scene.scope);
      }
      for (const edge of ['head','tail']) {
        if (limits[edge] && (edge === 'head' || !capture.order.some(id=>!capture.messages.get(id)?.raw))) continue;
        limits[edge] = false;
        let idleAt = 0, previousMark = '';
        let closest = Infinity, rebounds = 0, reachedEdge = false;
        while (alive() && !parked() && !historyBackoff() && !scene.complete && performance.now() < until && steps < (outline ? 72 : tdZoomHistoryBudget)) {
          const info = tdNavScrollInfo(root);
          const boundary = edge === 'head' ? info.min : info.max;
          const remain = boundary - info.top;
          const distance = Math.abs(remain);
          const loadingEarlier = edge === 'head' && tdZoomEarlierMessagesPending(scene.root);
          tdZoomCaptureHistory(scene,root);
          if (distance < 4) {
            reachedEdge = true;
            const marker = `${info.min}:${info.max}:${capture.order.length}`;
            const pending = loadingEarlier || tdReads.pending.length || chatGptApiFetchPromise ||
              scene.root.matches('[aria-busy="true"]') || [...scene.root.querySelectorAll('[role="progressbar"],[aria-busy="true"]')].some(n=>tdDomTreeShown(n));
            if (pending || marker !== previousMark) { idleAt = performance.now(); previousMark = marker; }
            if (!pending && performance.now() - idleAt >= 760) { limits[edge] = true; break; }
            if (!await tdDelay(180,scene.scope)) break;
          } else {
            idleAt = 0;
            if (distance < closest - info.height * .12) { closest = distance; rebounds = 0; }
            else rebounds++;
            const stride = Math.max(80,info.height * (capture.refined ? .42 : .74));
            // 无论是否仍在分页，宿主重挂载都可能反复改写滚动位置。
            const jumpToBoundary = (reachedEdge && loadingEarlier) || rebounds >= 2;
            if (jumpToBoundary) { closest = Infinity; rebounds = 0; }
            if (!signaled) {
              tdSignalHostReadingScroll(root,remain);
              signaled = true;
            }
            tdZoomNativeScroll(root,jumpToBoundary ? boundary : info.top + Math.sign(remain)*Math.min(distance,stride));
            steps++;
            if (!await tdDelay(160,scene.scope)) break;
          }
        }
      }
      const missingText=capture.order.filter(id=>!capture.messages.get(id)?.raw).length;
      const reachedBoth = limits.head && limits.tail;
      finish = reachedBoth && capture.order.length > 0 && !capture.gap && !missingText;
      // 两端都已访问后再用细步长补齐掉载的正文或片段之间的重叠。
      refine = reachedBoth && (capture.gap || missingText > 0) && !capture.refined;
      if (refine) capture.refined = true;
      if (!outline && tdZoom.scene===scene) tdZoom.surface.dataset.historyCoverage=JSON.stringify({
        head:limits.head,tail:limits.tail,messages:capture.order.length,gap:Boolean(capture.gap),missingText,
      });
      capture.resume = reachedBoth ? null : {limits,top:tdNavScrollInfo(root).top};
    } finally {
      remounts.disconnect();
      cancelAnimationFrame(sampleFrame);
      tdZoomRestoreHistory(scene);
      capture.running = false;
      if (outline) update('history-retry','');
    }
    if (!alive()) {
      // 切走标签或反向捏合中断后，仍打开的概览可以继续补齐。
      if (!outline && tdZoom.scene === scene && tdAlive(scene.scope) && !scene.complete) {
        capture.attempted = false;
        if (!document.hidden && !scene.pending && !tdZoomMoving(scene)) tdZoomScheduleSettled(scene);
      }
      return;
    }
    if (scene.complete) return;
    if (finish) {
      capture.complete = true;
      if (outline) tdRenderOutlineCoverage();
      else tdZoomRefreshHistory(scene,true);
    } else if (parked() || !historyBackoff() && (refine || capture.order.length > initialCount && steps>0)) {
      // 有新内容才进入下一段；发送打断时等宿主的下一次状态变更。
      capture.attempted = false;
      if (!parked()) setTimeout(()=>{
        if (alive()) void tdZoomRecoverHistory(scene).catch(()=>{
          if (!outline) tdZoomHistoryStalled(scene);
        });
      },350);
    } else if (!outline) tdZoomHistoryStalled(scene);
  }

  function tdZoomHistoryStalled(scene) {
    if (tdZoom.scene !== scene || !tdAlive(scene.scope)) return;
    if (scene.historyKey && scene.history.attempted) {
      const proof = scene.historyKey;
      void chrome.runtime.sendMessage({type:'threadWorkspace',action:'topicsHistoryProbed',value:proof}).catch(()=>{});
      const ready = tdZoom.preparation?.view;
      if (ready?.historyKey === proof) ready.historyPending = false;
    }
    scene.historyKey = null;
    // 网页不再补载时，允许使用已有正文生成部分摘要。
    scene.history.attempted = true;
    scene.history.exhausted = true;
    tdZoomTopicControls(scene,scene.summaries?.size ? 'ready' : 'history-retry');
    tdZoomRefreshHistory(scene,true);
  }

  function tdZoomOpen() { return Boolean(tdZoom.scene); }

  function tdZoomRecords() {
    if (tdZoom.index === entries) return tdZoom.records;
    const unique = new Map();
    for (const entry of entries) {
      const role = entryAnchorRole(entry);
      if (role !== 'user' && !(entry.answerRecords || []).length) continue;
      const id = entry.messageId || entry.nodeId || entry.answerRecords?.[0]?.messageId;
      if (!id) continue;
      const key = role + ':' + id;
      const prior = unique.get(key);
      if (!prior || (!prior.target?.isConnected && entry.target?.isConnected)) unique.set(key, entry);
    }
    tdZoom.index = entries;
    tdZoom.records = [...unique.values()];
    return tdZoom.records;
  }

  function tdZoomReady() {
    return tdEnabled() && settings.sites[site.id] !== false;
  }

  function tdZoomMoving(scene = tdZoom.scene) {
    return scene && tdZoom.scene === scene && (scene.gestureProgress !== undefined || tdZoom.frame !== 0);
  }

  function tdZoomScheduleSettled(scene) {
    clearTimeout(scene.settledWork);
    // 等合拢后的画面完成绘制，并留出反向捏合的输入窗口。
    scene.settledWork = setTimeout(() => {
      scene.settledWork = 0;
      if (tdZoom.scene !== scene || !tdAlive(scene.scope) || tdZoomMoving(scene) || document.hidden) return;
      tdZoomApplyTopics(scene);
      tdZoomExtend();
      if (!tdZoomAdvancePreparedHistory(scene)) void tdZoomLoadTopics(scene);
      if (scene.deferredRefresh) {
        scene.deferredRefresh = false;
        scheduleRefresh('overview-motion-settled',0);
      }
    },scene.cacheLookup && scene.warmCacheReady ? 0 : 110);
  }

  function tdZoomClearEffects(scene) {
    for (const animation of scene.effects) animation.cancel();
    scene.effects.length = 0;
  }

  function tdZoomFinish(scene = tdZoom.scene) {
    if (!scene || tdZoom.scene !== scene) return;
    clearTimeout(tdZoom.settle);
    clearTimeout(scene.settledWork);
    cancelAnimationFrame(tdZoom.frame);
    tdZoom.frame = 0;
    tdZoomStopHistory(scene);
    tdZoomRestoreHistory(scene);
    tdZoomMaskTranscript(scene,false);
    if (tdAlive(scene.scope) && scene.history.order.length) {
      tdHistory.capture = {scope:scene.scope,root:scene.root,history:scene.history};
    }
    tdZoomClearEffects(scene);
    tdZoomClearFades(scene);
    scene.observer?.disconnect();
    scene.resize?.disconnect();
    scene.layoutEvents?.abort();
    tdZoom.surface.hidden = true;
    const summary = tdZoom.surface.querySelector('.zoom-conversation-summary');
    summary.hidden = true;
    summary.textContent = '';
    const topics = tdZoom.surface.querySelector('.zoom-topic-index');
    topics.hidden = true;
    topics.replaceChildren();
    delete navHost.dataset.overview;
    tdZoom.surface.querySelector('.zoom-stream').replaceChildren();
    tdZoom.button?.setAttribute('aria-expanded', 'false');
    tdZoom.scene = null;
    if (scene.deferredRefresh || scene.history.complete) scheduleRefresh('overview-motion-finished',0);
    // 键盘关闭时恢复进入之前的焦点，保留输入框光标和草稿。
    if (scene.restoreFocus && scene.previousFocus?.isConnected) scene.previousFocus.focus({preventScroll:true});
  }

  function tdZoomReset() {
    tdZoomFinish();
    tdZoom.listener?.abort();
    tdZoom.root = null;
    tdZoom.listener = null;
    tdZoom.tail = null;
    tdZoom.touch = null;
    tdZoom.index = null;
    tdZoom.records = [];
    clearTimeout(tdZoom.preparation?.timer);
    tdZoom.preparation = null;
  }

  function tdZoomQuestionText(entry) {
    const target = entry.target?.isConnected ? tdZoomUserBubble(entry.target) : null;
    return normalizeMultilineText(entry.rawQuestion || target?.innerText || entry.text || '');
  }

  function tdZoomQuestionLabel(entry) {
    const question = tdZoomQuestionText(entry);
    // 批注拼接的引文依然保留在原文和摘要证据中。问句气泡直接呈现本轮问题。
    const delimiter = '\n本轮问题：\n';
    const start = question.startsWith('【注释 1】') ? question.lastIndexOf(delimiter) : -1;
    return (start >= 0 ? question.slice(start + delimiter.length) : question) || '打开原提问';
  }

  function tdZoomNativeNode(record, role) {
    return record?.target?.isConnected ? record.target : tdNavFindTurn(record, role);
  }

  function tdZoomUserBubble(target) {
    return target?.matches(tdZoomBubble) ? target : target?.querySelector(tdZoomBubble) || target;
  }

  function tdZoomVisibleSources(scene) {
    const sources = new Map();
    for (const entry of mountedEntries) {
      const user = entry.target;
      if (!user?.isConnected || !tdZoomIntersects(user, scene.bounds)) continue;
      sources.set(entry.messageId || entry.nodeId, tdZoomUserBubble(user));
    }
    for (const entry of scene.records.slice(scene.first, scene.last)) {
      for (const answer of entry.answerRecords || []) {
        const target = answer.target;
        if (target?.isConnected && tdZoomIntersects(target, scene.bounds)) sources.set(answer.messageId || answer.nodeId, findAssistantContentRoot(target) || target);
      }
    }
    return sources;
  }

  function tdZoomIntersects(node, bounds) {
    const box = node.getBoundingClientRect();
    return box.bottom > bounds.top && box.top < bounds.bottom && box.width > 0 && box.height > 0;
  }

  function tdZoomBackground(element, stop) {
    for (let node = element; node && node !== stop; node = tdDomParent(node)) {
      const color = getComputedStyle(node).backgroundColor;
      if (color !== 'transparent' && color !== 'rgba(0, 0, 0, 0)') return color;
    }
    return '';
  }

  function tdZoomReadTheme(scene) {
    const {root} = scene;
    const userReference = scene.userReference?.isConnected ? scene.userReference :
      mountedEntries.find(entry=>entry.target?.isConnected)?.target;
    const bubble = tdZoomUserBubble(userReference);
    const answer = scene.records.find(entry => entry.answerRecords?.some(record => record.target?.isConnected));
    const target = answer?.answerRecords.find(record => record.target?.isConnected)?.target;
    const body = findAssistantContentRoot(target) || root;
    const text = getComputedStyle(body);
    const message = getComputedStyle(bubble || root);
    const page = getComputedStyle(root);
    const bubbleScope = userReference?.closest('article,[data-turn-key],[data-turn="user"]');
    const token = name => page.getPropertyValue(name).trim();
    const values = {
      '--zoom-background': tdZoomBackground(root) || token('--main-surface-primary') || 'Canvas',
      '--zoom-ink': text.color,
      '--zoom-muted': token('--text-secondary') || text.color,
      '--zoom-font': text.fontFamily,
      '--zoom-size': text.fontSize,
      '--zoom-bubble-font': message.fontFamily,
      '--zoom-bubble-ink': message.color,
      '--zoom-bubble': tdZoomBackground(bubble, bubbleScope || root) || token('--message-surface') ||
        'color-mix(in srgb, var(--zoom-ink) 8%, transparent)',
      '--zoom-radius': message.borderTopLeftRadius !== '0px' ? message.borderTopLeftRadius : '1.25em',
      '--zoom-scheme': page.colorScheme,
    };
    for (const [name, value] of Object.entries(values)) {
      if (tdZoom.surface.style.getPropertyValue(name) !== value) tdZoom.surface.style.setProperty(name, value);
    }
  }

  function tdZoomLayout(scene) {
    const {root} = scene;
    if (!root.isConnected) return false;
    if (!scene.reference.isConnected) scene.reference = mountedEntries.find(entry=>entry.target?.isConnected)?.target || root;
    if (!scene.viewportRoot?.isConnected) scene.viewportRoot = findScrollRoot();

    // 阅读区的可视边界属于滚动视口。挂载新消息时正文的外框会移动，但遮罩留在原处。
    const view = tdNavViewport(root);
    const viewport = tdNavClientBox(scene.viewportRoot);
    const rootBox = root.getBoundingClientRect();
    const inDocument = isDocumentScrollRoot(scene.viewportRoot);
    const wrapper = scene.reference.closest('[class*="thread-content-max-width"],[class*="thread-content-width"],[class*="turn-messages"]');
    const column = wrapper?.getBoundingClientRect() || rootBox;
    const left = Math.max(view.left, inDocument ? rootBox.left : viewport.left, 0);
    const right = Math.min(view.right, inDocument ? rootBox.right : viewport.right, innerWidth);
    const top = Math.max(view.top, viewport.top, 0);
    const composer = getComposerBoundary(), box = composer?.getBoundingClientRect();
    const composerEdge = box && tdNavIsOverlay(composer) && box.height < innerHeight / 2 &&
      box.top > top && box.left < right && box.right > left ? box.top : viewport.bottom;
    const bottom = Math.min(viewport.bottom, composerEdge, innerHeight);
    if (view.hidden || right-left < 140 || bottom-top < 100) return Boolean(scene.bounds);
    scene.bounds = {left,top,right,bottom};
    const size = Math.min(right-left,column.width > 320 && column.width < 930 ? column.width : 768);
    const center = wrapper && column.width <= 930 ? (column.left + column.right) / 2 : (left + right) / 2;
    const columnLeft = Math.max(left, Math.min(right-size,center-size/2));
    Object.assign(tdZoom.surface.style,{left:left+'px',top:top+'px',width:right-left+'px',height:bottom-top+'px'});
    tdZoom.surface.style.setProperty('--zoom-column-width',size+'px');
    tdZoom.surface.style.setProperty('--zoom-column-left',columnLeft-left+'px');
    tdZoomReadTheme(scene);
    return true;
  }

  function tdZoomCanJump(scene, destination) {
    return tdZoom.scene === scene && tdAlive(scene.scope) && !scene.pending &&
      scene.records.some(entry => entry.key === destination.key);
  }

  function tdZoomPlace(scene, destination, screenY) {
    const entry = scene.records.find(record => record.key === destination.key);
    if (!entry) return false;
    const answer = destination.answerId && entry.answerRecords?.find(record => (record.messageId || record.nodeId) === destination.answerId);
    if (destination.answerId && !answer) return false;
    const node = tdNavFindTurn(answer || entry, answer ? 'assistant' : entryAnchorRole(entry));
    if (!node) return false;
    tdZoomClearEffects(scene);
    const root = tdNavScrollRoot(node);
    const view = tdNavViewport(node);
    const preferred = Math.min(view.bottom - 55, Math.max(view.top + 16, screenY));
    const info = tdNavScrollInfo(root);
    const max = info.doc ? getRootScrollMax(root) : info.max;
    const top = Math.min(max, Math.max(info.min, info.top + (node.getBoundingClientRect().top - preferred) / info.scale));
    const instant = {top, behavior:'instant'};
    if (info.doc) window.scrollTo(instant);
    else root.scrollTo(instant);
    const placed = node.getBoundingClientRect();
    if (placed.top < view.top-3 || placed.top+Math.min(18, placed.height) > view.bottom) return false;
    scene.reference = tdNavFindTurn(entry, entryAnchorRole(entry)) || scene.reference;
    scene.userReference = scene.reference;
    return true;
  }

  async function tdZoomJump(scene, destination, chapter = null) {
    if (!tdZoomCanJump(scene,destination)) return;
    const entry = scene.records.find(record=>record.key===destination.key);
    const answer = destination.answerId && entry.answerRecords?.find(record=>
      (record.messageId || record.nodeId) === destination.answerId);
    if (destination.answerId && !answer) return;
    const target = answer && !chapter ? {...entry,...answer,anchorRole:'assistant',kind:'assistant-output'} : entry;
    tdZoomStopHistory(scene);
    scene.pending = true;
    tdZoom.surface.dataset.locating = 'true';
    try {
      let result = await tdZoomSeekCaptured(scene,destination,chapter);
      if (result.result === 'unavailable') result = await tdNavRun(target,chapter,scene.records);
      if (tdZoom.scene !== scene || !tdAlive(scene.scope)) return;
      if (result.result !== 'located') {
        tdZoomTopicControls(scene,scene.topicState,'原文暂未定位，可再试一次');
        return;
      }
      scene.reference = tdNavFindTurn(answer || entry,answer ? 'assistant' : entryAnchorRole(entry)) || scene.reference;
      if (entryAnchorRole(entry) === 'user') scene.userReference = tdNavFindTurn(entry,'user') || scene.userReference;
      // 点击已核对的章节只做视觉交接，避免位移动画改变原文的几何定位。
      tdZoomClearEffects(scene);
      tdZoomAnimate(scene,0);
    } finally {
      if (tdZoom.scene === scene) {
        scene.pending = false;
        delete tdZoom.surface.dataset.locating;
      }
    }
  }

  function tdZoomStopHistory(scene) {
    if (!scene.history.running || scene.history.cancelled) return;
    scene.history.cancelled = true;
    scene.history.attempted = false;
    tdZoomRestoreHistory(scene);
    tdZoomTopicControls(scene,'history-retry','已暂停补齐历史');
  }

  async function tdZoomSeekCaptured(scene, destination, chapter = null) {
    const entry = scene.records.find(record => record.key === destination.key);
    if (!entry) return {result:'unavailable'};
    const id = destination.answerId || entry.messageId || entry.nodeId;
    const captured = scene.history.messages.get(id);
    const root = scene.history.root;
    if (!captured || !root?.isConnected) return {result:'unavailable'};
    const initial = tdNavScrollInfo(root).top;
    const focusEntry = chapter ? entry : {...entry,...captured.address,anchorRole:captured.role,target:captured.target};
    const req = tdNavBegin(focusEntry,chapter);
    req.overviewEntry = focusEntry;
    const scope = scene.scope;
    let arrived = false;
    try {
      for (let pass=0; pass<2 && tdNavAlive(req); pass++) {
        const target = tdNavResolve(req) || await tdNavMountCaptured(req,captured,root);
        if (!target) break;
        await tdNavPlace(req,target);
        const landed = await tdNavAfterHostLayout(req);
        if (!tdNavAlive(req)) return {result:'cancelled'};
        if (!landed) continue;
        arrived = true;
        tdNavHighlight(req,landed);
        tdNavRecordResult(req,'located',req.verification.alignmentErrorPx);
        tdNavGuard(req);
        return {result:'located'};
      }
      return {result:'unavailable'};
    } finally {
      if (!arrived && tdNavigation.current === req) {
        tdNavCancel('overview-target-unavailable');
        if (tdZoom.scene === scene && tdAlive(scope)) tdZoomNativeScroll(root,initial);
      }
    }
  }

  function tdZoomLine(scene, record, text, role, answerId = '', digest = false) {
    const row = document.createElement('button');
    row.type = 'button';
    row.className = 'zoom-line';
    row.dataset.role = role;
    if (digest) row.dataset.digest = 'true';
    const label = document.createElement('span');
    label.className = 'zoom-line-label';
    label.textContent = text;
    row.append(label);
    row.title = digest ? tr(role === 'assistant' ? '定位原回复' : '定位原问题') : text;
    const destination = {key:record.key, answerId};
    scene.destinations.set(row, destination);
    const id = answerId || record.messageId || record.nodeId;
    if (id) scene.rows.set(id, row);
    row.addEventListener('click', () => { void tdZoomJump(scene,destination); });
    return row;
  }

  function tdZoomChapters(entry, answer = null) {
    return (entry.answerBlocks || []).filter(block => isAnswerOutlineBlock(block) && (!answer ||
      block.answerOrdinal === answer.answerOrdinal));
  }

  function tdZoomAnswerText(answer) {
    const raw = normalizeMultilineText(answer.rawText || answer.outlineRawText || '')
      .replace(/[\uE000-\uF8FF][^\n\uE000-\uF8FF]*[\uE000-\uF8FF]/g, '');
    const rendered = normalizeMultilineText(answer.visibleRawText || '');
    const host = answer.target?.isConnected ? answer.target : null;
    if (answer.imageReply || host && tdGeneratedImageTurn(host)?.matches('[data-talvt-turn-state="complete"]')) {
      const marker = '此轮已生成图片。';
      if (raw.endsWith(marker)) return raw;
      const authored = raw && raw !== '图片回复' ? raw : '';
      return [authored, marker].filter(Boolean).join('\n\n');
    }
    if (raw && rendered) {
      // 网页可能补上较早快照尚无的章节正文。保留源文本，并按规范化后的行去重。
      const plain = stripMarkdownForOutline(raw);
      const additions = new Map();
      for (const text of rendered.split(/\n+/)) {
        const line = stripMarkdownForOutline(text);
        if (line && !plain.includes(line)) additions.set(line,text.trim());
      }
      return [raw,...additions.values()].join('\n\n');
    }
    if (raw || rendered) return raw || rendered;
    if (!host) return '';
    const content = findAssistantContentRoot(host);
    const text = findAssistantOutlineRoots(host).map(root => root.matches(TD_DOM_CONTENT) ? root.innerText || '' :
      extractCleanText(root).replace(/^(?:ChatGPT 说|ChatGPT said)\s*[:：]?\s*/i,'')).filter(Boolean).join('\n\n');
    return normalizeMultilineText(text) || (tdAnswerImages(host, content).length ? '此轮包含图片回复。' : '');
  }

  function tdZoomEntryId(entry) {
    return entry?.messageId || entry?.nodeId || entry?.answerRecords?.[0]?.messageId;
  }

  const tdZoomReadable = new WeakMap();

  function tdZoomReadableMessage(record, role) {
    const target = record?.target;
    if (!target?.isConnected) return null;
    const cached = tdZoomReadable.get(target);
    if (cached?.revision === tdDomState.revision && cached.role === role) return cached.value;
    let value = null;
    if (role === 'user' || tdAnswerCompletionEvidence(target)) {
      const body = role === 'user' ? tdZoomQuestionText({target}) : tdZoomAnswerText({target});
      if (body) value = {body,revision:body.length + ':' + hashString(body)};
    }
    tdZoomReadable.set(target,{revision:tdDomState.revision,role,value});
    return value;
  }

  function tdZoomMatchingRevision(record, role, text) {
    const live = tdZoomReadableMessage(record,role);
    // 只把完整展示、已用于本次摘要的正文作为后续比对依据。
    return live && normalizeText(stripMarkdownForOutline(live.body)) === normalizeText(stripMarkdownForOutline(text))
      ? live.revision : '';
  }

  function tdZoomTopicRequest(scene) {
    const locator = getChatGptConversationLocator();
    if (locator.kind !== 'conversation') return null;
    const changed = scene.revisedMessages;
    return {
      conversation: locator.id,
      format: 'summary-v3',
      partial: !scene.complete,
      historyProbed:scene.history?.exhausted === true,
      turns: (scene.digestDraft || scene.records).map(entry => {
        const role = entryAnchorRole(entry), id = tdZoomEntryId(entry);
        const freshQuestion = changed?.has(id) && tdZoomReadableMessage(entry,'user');
        const question = role === 'assistant' ? '' : freshQuestion?.body || tdZoomQuestionText(entry) || '附件或图片提问';
        const answers = (entry.answerRecords || []).map(answer => {
          const id = answer.messageId || answer.nodeId;
          const fresh = changed?.has(id) && tdZoomReadableMessage(answer,'assistant');
          const text = fresh?.body || tdZoomAnswerText(answer);
          const blocks = fresh ? collectRenderedAnswerBlocks(answer.target) : tdZoomChapters(entry,answer);
          return {text, blocks, revised:Boolean(fresh), navigation:{id,nodeId:answer.nodeId,revision:tdZoomMatchingRevision(answer,'assistant',text),
            sections:blocks.map(block=>({kind:block.kind,label:block.label,marker:block.marker,
              ordinal:block.outlineOrdinal,parent:block.parentOutlineOrdinal,depth:block.outlineDepth,level:block.headingLevel}))}};
        });
        const sections = answers.some(answer=>answer.revised) ? answers.flatMap(answer=>answer.blocks) : tdZoomChapters(entry);
        return {id,question,answer:answers.map(answer=>answer.text).filter(Boolean).join('\n\n'),
          sections:sections.map(block=>[block.marker,block.label].filter(Boolean).join(' ')),
          navigation:{role,nodeId:entry.nodeId,revision:role==='user' ? tdZoomMatchingRevision(entry,role,question) : '',
            answers:answers.map(answer=>answer.navigation)}};
      }),
    };
  }

  function tdZoomCachedOverview(scene, navigationOnly = false) {
    const locator = getChatGptConversationLocator();
    if (locator.kind !== 'conversation') return Promise.resolve(null);
    const evidence = {conversation:locator.id,complete:scene.complete,navigationOnly,allowPartial:!navigationOnly};
    if (scene.complete) {
      evidence.observed = scene.records.map(entry=>{
        const role = entryAnchorRole(entry);
        const answers = (entry.answerRecords || []).filter(answer=>answer.messageId || answer.nodeId);
        return {id:tdZoomEntryId(entry),nodeId:entry.nodeId,role,
          revision:role==='user' ? tdZoomReadableMessage(entry,role)?.revision : undefined,
          answerIds:answers.map(answer=>answer.messageId || answer.nodeId),
          answerAliases:answers.map(answer=>answer.nodeId),
          answerRevisions:answers.map(answer=>tdZoomReadableMessage(answer,'assistant')?.revision)};
      });
      if (!evidence.observed.length) return Promise.resolve(null);
    } else {
      // 虚拟列表有时先显示回答，再补上它所属的提问。只核对实际挂载的消息和页面顺序。
      evidence.messages = tdZoomMountedEvidence(scene.records);
      if (!evidence.messages.length) return Promise.resolve(null);
    }
    return pilotRpc('topicsCached',null,evidence).catch(()=>null);
  }

  function tdZoomRecordRevision(entry) {
    return hashString([entry.rawQuestion || entry.text,...tdZoomChapters(entry).map(block=>block.label),
      ...(entry.answerRecords || []).map(answer=>answer.rawText || answer.visibleRawText || '')].join('\n'));
  }

  function tdZoomPrepare() {
    if (tdZoom.scene || !tdZoom.root?.isConnected || !tdZoomReady() || document.hidden || !document.hasFocus() ||
        getChatGptConversationLocator().kind !== 'conversation') return;
    const records = tdZoomRecords();
    if (!records.length) return;
    const outline = tdHistory.capture;
    const complete = tdHealth.snapshot?.complete === true || Boolean(outline?.history.complete && tdAlive(outline.scope));
    const generate = settings.autoTopicSummary !== false && settings.prepareTopicSummary && !tdReadBusy() && !tdZoomReplyRunning() &&
      Boolean(complete || tdZoomReadableMessage(records.at(-1)?.answerRecords?.at(-1),'assistant'));
    const revision = tdDomState.revision;
    const prior = tdZoom.preparation;
    if (prior && tdAlive(prior.scope) && prior.records === records && prior.revision === revision &&
        prior.complete === complete && prior.generate === generate) return;
    const key = JSON.stringify([complete,generate,records.map(entry=>[tdZoomEntryId(entry),
      (entry.answerRecords || []).map(answer=>answer.messageId || answer.nodeId),tdZoomRecordRevision(entry)])]);
    if (prior && tdAlive(prior.scope)) {
      if (prior.key === key) {
        Object.assign(prior,{records,revision});
        return;
      }
      if (prior.running) return;
    }
    clearTimeout(prior?.timer);
    const lastView = prior && tdAlive(prior.scope) ? prior.view || prior.lastView : null;
    const preparation = {scope:tdScope(),records,complete,generate,revision,key,lastView,timer:0};
    tdZoom.preparation = preparation;
    preparation.timer = setTimeout(async()=>{
      if (tdZoom.preparation !== preparation || !tdAlive(preparation.scope)) return;
      if (tdZoom.scene || document.hidden || !document.hasFocus()) { tdZoom.preparation = null; return; }
      preparation.running = true;
      try {
        const cached = await tdZoomCachedOverview(preparation);
        if (cached?.state === 'ready') { preparation.view = cached; return; }
        if (!generate || tdZoom.scene || document.hidden || !document.hasFocus() || tdReadBusy() || tdZoomReplyRunning() ||
            !tdAlive(preparation.scope) || tdZoom.preparation !== preparation) return;
        if (cached?.changed?.length) preparation.revisedMessages = new Set(cached.changed);
        const request = tdZoomTopicRequest(preparation);
        if (!request?.turns.some(turn=>turn.answer)) return;
        const reply = await chrome.runtime.sendMessage({type:'threadWorkspace',action:'topicsPrepare',value:request});
        if (reply?.data?.state === 'ready') {
          preparation.view = {...reply.data,entries:request.turns.map(turn=>({id:turn.id,...turn.navigation}))};
        } else if (reply?.data?.state === 'deferred' && tdZoom.preparation === preparation) tdZoom.preparation = null;
      } catch {} finally {
        preparation.running = false;
        if (tdZoom.preparation === preparation && tdAlive(preparation.scope)) tdZoomPrepare();
      }
    },generate ? (complete ? 1050 : 2400) : 75);
  }

  function tdZoomMountedEvidence(records) {
    const mounted = new Map();
    const add = (record,role) => {
      if (!record.target?.isConnected) return;
      const {messageId:id,nodeId} = tdMessageAddress(record.target,role);
      const key = role+':'+id;
      if (!id || mounted.has(key)) return;
      mounted.set(key,{record,role,id,nodeId});
    };
    for (const record of records) {
      if (entryAnchorRole(record) === 'user') add(record,'user');
      for (const answer of record.answerRecords || []) add(answer,'assistant');
    }
    return [...mounted.values()].sort((a,b)=>compareDomOrder(a.record.target,b.record.target)).map(({record,...address})=>({
      ...address,revision:tdZoomReadableMessage(record,address.role)?.revision,
    }));
  }

  function tdZoomRecordsFromCache(saved, records) {
    const byId = new Map(records.flatMap(entry=>tdNavRecordIds(entry).map(id=>[entryAnchorRole(entry)+':'+id,entry])));
    const origins = {'heading':'dom-document-heading','section-title':'dom-section-title','numbered-section':'dom-list-section'};
    return saved.map(entry=>{
      const exact = byId.get(entry.role+':'+entry.id) || byId.get(entry.role+':'+entry.nodeId);
      const key = exact?.key || 'cached-overview:'+entry.role+':'+entry.id;
      const answerRecords = entry.answers.map((answer,answerOrdinal)=>{
        const original = exact?.answerRecords?.find(record=>tdNavRecordIds(record).some(id=>id===answer.id || id===answer.nodeId));
        const blocks = answer.sections.map(section=>({
          key:key+':'+answerOrdinal+':'+section.ordinal,
          kind:section.kind, outlineOrigin:origins[section.kind],label:section.label,sectionTitle:section.label,
          marker:section.marker,headingLevel:section.level,outlineOrdinal:section.ordinal,
          parentOutlineOrdinal:section.parent,outlineDepth:section.depth,
          answerOrdinal,answerMessageId:answer.id,answerNodeId:answer.nodeId,parentKey:key,
        }));
        return {...original,messageId:answer.id,nodeId:answer.nodeId,answerOrdinal,blocks};
      });
      return {...exact,key,anchorRole:entry.role,messageId:entry.id,nodeId:entry.nodeId,
        answerRecords,answerBlocks:answerRecords.flatMap(answer=>answer.blocks)};
    });
  }

  function tdZoomChunkEdge(scene, index, direction) {
    const group = scene.topics?.find(topic=>topic.merge && topic.start - 1 < index && index < topic.end);
    return group ? (direction < 0 ? group.start - 1 : group.end) : index;
  }

  function tdZoomDisplayGroups(scene, start, end) {
    if (!scene.topics) return [{start,end:end-1}];
    return scene.topics.flatMap(group => {
      const from = Math.max(start,group.start - 1), to = Math.min(end - 1,group.end - 1);
      return from <= to ? [{...group,start:from,end:to,merge:group.merge && from === group.start-1 && to === group.end-1}] : [];
    });
  }

  function tdZoomInstallDigest(scene, digest) {
    if (digest.entries) {
      scene.records = tdZoomRecordsFromCache(digest.entries,scene.digestDraft || scene.records);
      tdZoomRememberDigest(scene,digest.entries,digest.partial);
    }
    scene.digestDraft = null;
    scene.topics = digest.groups;
    scene.complete = !digest.partial;
    scene.digestPartial = digest.partial === true;
    scene.summaries = new Map((digest.summaries || []).map(turn=>[turn.turn-1,turn]));
    scene.cachedOverview = true;
    scene.localCacheRead = true;
    scene.historyKey = digest.historyPending && !scene.history.attempted ? digest.historyKey : null;
    if (digest.partial && !scene.historyKey) { scene.history.attempted = true; scene.history.exhausted = true; }
    const summary = tdZoom.surface.querySelector('.zoom-conversation-summary');
    summary.textContent = digest.summary || '';
    summary.hidden = !summary.textContent;
    tdZoomRenderTopicIndex(scene);
  }

  function tdZoomAdvancePreparedHistory(scene) {
    if (!scene.complete && scene.historyKey && !scene.history.attempted && !scene.history.running &&
        !tdZoomReplyRunning() && !document.hidden) {
      void tdZoomRecoverHistory(scene).catch(()=>tdZoomHistoryStalled(scene));
      return true;
    }
    return false;
  }

  function tdZoomApplyTopics(scene) {
    if (!scene.nextTopics || scene.progress < .999 || scene.pending || tdZoomMoving(scene) || scene.settledWork) return;
    const list = tdZoom.list;
    const top = list.getBoundingClientRect().top;
    let anchor;
    for (const [id, row] of scene.rows) {
      const box = row.getBoundingClientRect();
      if (box.bottom <= top || box.top >= top + list.clientHeight) continue;
      if (!anchor || box.top < anchor.y) anchor = {id, y: box.top, focused: shadowRoot.activeElement === row};
    }
    const oldScroll = list.scrollTop;
    tdZoomClearEffects(scene);
    const first = tdZoomEntryId(scene.records[scene.first]);
    tdZoomInstallDigest(scene,scene.nextTopics);
    const start = Math.max(0,scene.records.findIndex(entry=>tdZoomEntryId(entry)===first));
    scene.first = tdZoomChunkEdge(scene,start,-1);
    scene.last = tdZoomChunkEdge(scene,Math.min(scene.records.length,start+tdZoomChunk),1);
    scene.nextTopics = null;
    scene.rows.clear();
    tdZoom.stream.replaceChildren();
    tdZoomRender(scene, scene.first, scene.last);
    if (anchor) {
      const row = scene.rows.get(anchor.id);
      const entryIndex = row?.getClientRects().length ? -1 : scene.records.findIndex(entry=>
        tdZoomEntryId(entry) === anchor.id || entry.answerRecords?.some(answer=>(answer.messageId || answer.nodeId) === anchor.id));
      const group = scene.topics?.find(topic=>topic.merge && entryIndex >= topic.start - 1 && entryIndex < topic.end);
      const visible = group ? tdZoom.stream.querySelector('.zoom-topic[data-topic-start="' + (group.start - 1) + '"] > .zoom-sources > summary') : row;
      if (visible?.getClientRects().length) {
        list.scrollTop += visible.getBoundingClientRect().top - anchor.y;
        if (anchor.focused) visible.focus({preventScroll:true});
      }
    }
    tdZoomTopicControls(scene,'ready');
    tdZoomAdvancePreparedHistory(scene);
    // 更新分组标题时保持原来的阅读位置，也保留用户已滚动过的状态。
    scene.initialScroll += list.scrollTop - oldScroll;
  }

  function tdZoomRenderTopicIndex(scene) {
    const index = tdZoom.surface.querySelector('.zoom-topic-index');
    index.replaceChildren();
    for (const group of scene.topics || []) {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = group.title;
      button.addEventListener('click', () => {
        if (tdZoom.scene !== scene || scene.pending) return;
        const start = group.start - 1;
        const list = tdZoom.list;
        if (start < scene.first || start >= scene.last) {
          scene.first = start;
          scene.last = tdZoomChunkEdge(scene,Math.min(scene.records.length,start+tdZoomChunk),1);
          scene.rows.clear();
          tdZoom.stream.replaceChildren();
          tdZoomRender(scene, scene.first, scene.last);
        }
        const section = list.querySelector('.zoom-topic[data-topic-start="' + start + '"]');
        if (section) list.scrollTop += section.getBoundingClientRect().top - list.getBoundingClientRect().top - 13;
      });
      index.append(button);
    }
    index.hidden = !index.childElementCount;
  }

  function tdZoomTopicControls(scene, state, description = '') {
    const button = tdZoom.surface.querySelector('.zoom-ai');
    const status = tdZoom.surface.querySelector('.zoom-ai-status');
    const complete = scene.summaries?.size ? !scene.digestPartial : scene.complete;
    const coverage = complete ? '完整会话' : scene.summaries?.size ? '已读问答' : '';
    const historyAction = state === 'history-retry' || state === 'ready' && !complete && !scene.historyKey;
    const labels = {connection:'模型连接',error:'重试',cooldown:'重试'};
    const label = historyAction ? '继续补齐' : labels[state];
    tdZoom.surface.querySelector('.zoom-coverage').textContent = coverage ? tr('{0} · {1} 轮',tr(coverage),scene.records.length) : '';
    button.hidden = !label;
    if (label) button.textContent = tr(label);
    button.dataset.action = state === 'connection' ? 'topic-connection' : historyAction ? 'recover-topics-history' : 'generate-topics';
    scene.topicState = state;
    const empty = tdZoom.stream?.querySelector('.zoom-unprepared');
    status.textContent = empty ? '' : tr(description);
    status.hidden = Boolean(empty) || !description;
    if (empty) empty.textContent = tr(description || ({
      connection:'连接 OpenAI 后即可生成摘要。',
      'history-retry':'网页暂未提供更早的消息。',
      local:'暂无可用的摘要。',
      error:'摘要暂未生成。',
    }[state] || '正在整理对话摘要…'));
  }

  async function tdZoomLoadTopics(scene, retry = false) {
    if (document.hidden || tdZoomMoving(scene) || scene.topicRequestPending || (!retry && (scene.settledWork || scene.localCacheRead)) ||
        (retry && !['error','cooldown'].includes(scene.topicState))) return;
    scene.topicRequestPending = true;
    try {
      if (!retry && scene.cacheLookup) {
        let cached = await scene.cacheLookup;
        scene.cacheLookup = null;
        if (!scene.complete && !cached?.changed?.length && tdZoom.scene === scene &&
            tdAlive(scene.scope) && tdDomState.revision !== scene.cacheDOMRevision) {
          // 首帧之后可能出现新消息。复核当前取到的记录，再使用缓存或补历史。
          const latest = await tdZoomCachedOverview({...scene,records:tdZoomRecords()});
          if (latest?.state === 'stale' || latest?.state === 'ready') cached = latest;
        }
        if (tdZoom.scene !== scene || !tdAlive(scene.scope)) return;
        if (cached?.changed?.length) {
          scene.revisedMessages = new Set(cached.changed);
          tdZoomCaptureHistory(scene,scene.viewportRoot);
          scene.complete = tdHealth.snapshot?.complete === true || scene.history.complete;
        }
        if (cached?.state === 'ready' && (!cached.partial || !scene.complete)) {
          scene.localCacheRead = true;
          scene.nextTopics = cached;
          tdZoomApplyTopics(scene);
          return;
        }
      }
      if (!scene.complete && !scene.history.exhausted) {
        if (!scene.history.attempted && !scene.history.running) {
          void tdZoomRecoverHistory(scene).catch(()=>tdZoomHistoryStalled(scene));
        }
        // 优先补齐网页历史。只有宿主确实没交出更多正文时才生成已读部分。
        if (!scene.complete && !scene.history.exhausted) return;
      }
      if (tdZoomReplyRunning()) {
        tdZoomTopicControls(scene,'working','回复完成后更新摘要');
        return;
      }
      const request = scene.topicRequest ||= tdZoomTopicRequest(scene);
      if (!request) { tdZoomTopicControls(scene,'local','原文索引'); return; }
      if (request.partial && !request.turns.some(turn=>turn.answer)) {
        scene.topicRequest = null;
        tdZoomTopicControls(scene,'history-retry','等待网页载入回答');
        return;
      }
      scene.localCacheRead = true;
      const useModel = settings.autoTopicSummary !== false;
      tdZoomTopicControls(scene,'working',useModel ?
        (scene.digestDraft ? '正在更新摘要…' : request.partial ? '正在概括已读取的问答…' : '正在生成摘要…') : '正在读取摘要…');
      const action = retry ? 'topicsGenerate' : useModel ? 'topicsOpen' : 'topicsRead';
      const reply = await chrome.runtime.sendMessage({type:'threadWorkspace',action,value:request});
      if (tdZoom.scene !== scene || !tdAlive(scene.scope) || request !== scene.topicRequest) return;
      if (!reply?.ok) throw new Error(reply?.error || '摘要暂未生成。');
      const result = reply.data;
      if (result.state === 'ready') {
        const entries = request.turns.map(turn=>({id:turn.id,...turn.navigation}));
        scene.nextTopics = {...result,entries};
        tdZoomApplyTopics(scene);
      } else if (result.state === 'deferred') {
        if (!scene.deferredTopicRetried) {
          scene.deferredTopicRetried = true;
          scene.localCacheRead = false;
          scene.reloadTopics = true;
        } else tdZoomTopicControls(scene,'local');
      } else if (['empty','stale'].includes(result.state)) {
        tdZoomTopicControls(scene,request.partial ? 'history-retry' : 'local');
      } else tdZoomTopicControls(scene,result.state,result.description);
    } catch (error) {
      if (tdZoom.scene === scene && tdAlive(scene.scope)) tdZoomTopicControls(scene,'error',error.message||'摘要暂未生成。');
    } finally {
      scene.topicRequestPending = false;
      if (scene.reloadTopics && tdZoom.scene === scene && tdAlive(scene.scope)) {
        scene.reloadTopics = false;
        void tdZoomLoadTopics(scene);
      }
    }
  }

  function tdZoomRender(scene, start, end, prepend = false) {
    const list = tdZoom.list;
    const stream = tdZoom.stream;
    const fragment = document.createDocumentFragment();
    if (settings.autoTopicSummary !== false && !scene.summaries?.size) {
      if (!stream.querySelector('.zoom-unprepared')) {
        const pending = document.createElement('p');
        pending.className = 'zoom-empty zoom-unprepared';
        pending.textContent = tr('正在整理对话摘要…');
        stream.append(pending);
      }
      return;
    }
    if (!scene.records.length) {
      const empty = document.createElement('p');
      empty.className = 'zoom-empty';
      empty.textContent = tr('找到的问答与章节会显示在这里。');
      fragment.append(empty);
    }
    for (const group of tdZoomDisplayGroups(scene, start, end)) {
      const section = document.createElement('section');
      section.className = 'zoom-topic';
      section.dataset.topicStart = String(group.start);
      if (group.title) {
        const title = document.createElement('h3');
        title.textContent = group.title;
        section.append(title);
      }
      if (group.summary && group.end > group.start) {
        const overview = document.createElement('p');
        overview.className = 'zoom-summary';
        overview.textContent = group.summary;
        section.append(overview);
      }
      let exchanges = section;
      if (group.merge) {
        section.dataset.merged = 'true';
        const sources = document.createElement('details');
        sources.className = 'zoom-sources';
        const toggle = document.createElement('summary');
        toggle.innerHTML = threadDeckIcon('chevron');
        toggle.append(tr('原始问答'));
        const key = tdZoomEntryId(scene.records[group.start]);
        const expanded = scene.expandedTopics ||= new Set();
        sources.open = expanded.has(key);
        exchanges = document.createElement('div');
        exchanges.className = 'zoom-source-turns';
        sources.addEventListener('toggle',()=>{
          if (!sources.isConnected) return;
          if (sources.open) {
            expanded.add(key);
            if (!exchanges.childElementCount) renderExchanges();
          } else expanded.delete(key);
        });
        sources.append(toggle,exchanges);
        section.append(sources);
        if (sources.open) renderExchanges();
      } else renderExchanges();
      function renderExchanges() {
        for (let index = group.start; index <= group.end; index++) {
          const entry = scene.records[index];
          const summary = scene.summaries?.get(index);
          const question = summary?.question || tdZoomQuestionLabel(entry);
          const exchange = document.createElement('div');
          exchange.className = 'zoom-exchange';
          if (entryAnchorRole(entry) === 'user') exchange.append(tdZoomLine(scene,entry,question,'user','',Boolean(summary?.question)));
          const answers = entry.answerRecords || [];
          if (answers.length > 1 && summary?.answer) {
            const digest = document.createElement('p');
            digest.className = 'zoom-turn-summary';
            digest.textContent = summary.answer;
            exchange.append(digest);
          }
          for (const [answerIndex, answer] of answers.entries()) {
            const id = answer.messageId || answer.nodeId;
            if (!id) continue;
            const chapters = tdZoomChapters(entry, answer);
            const digest = answers.length === 1 && summary?.answer;
            const label = digest || (settings.autoTopicSummary===false
              ? tdZoomAnswerText(answer).trim().split(/\n+/u).find(line=>line.trim())?.slice(0,160) : '');
            if (label) exchange.append(tdZoomLine(scene,entry,label,'assistant',id,Boolean(digest)));
            if (chapters.length) {
              const chapterList = document.createElement('details');
              chapterList.className = 'zoom-chapters';
              const expandedChapters = scene.expandedChapters ||= new Set();
              chapterList.open = expandedChapters.has(id);
              chapterList.addEventListener('toggle',()=>{
                if (!chapterList.isConnected) return;
                if (chapterList.open) { expandedChapters.add(id); renderChapters(); }
                else expandedChapters.delete(id);
              });
              const toggle = document.createElement('summary');
              toggle.innerHTML = threadDeckIcon('chevron');
              toggle.append(tr('章节'));
              chapterList.append(toggle);
              toggle.addEventListener('click',renderChapters,{once:true});
              function renderChapters() {
                if (chapterList.childElementCount > 1) return;
                for (const chapter of chapters) {
                  const navigation = document.createElement('button');
                  navigation.type = 'button';
                  navigation.className = 'zoom-chapter';
                  navigation.textContent = chapter.label;
                  navigation.style.setProperty('--chapter-level', Math.min(4, chapter.outlineDepth || 0));
                  navigation.addEventListener('click',()=>{ void tdZoomJump(scene,{key:entry.key,answerId:id},chapter); });
                  chapterList.append(navigation);
                }
              }
              if (chapterList.open) renderChapters();
              exchange.append(chapterList);
            }
          }
          exchanges.append(exchange);
        }
      }
      fragment.append(section);
    }
    const before = prepend ? list.scrollHeight : 0;
    if (prepend) {
      stream.prepend(fragment);
      const insertedHeight = list.scrollHeight - before;
      list.scrollTop += insertedHeight;
      scene.initialScroll += insertedHeight;
    } else {
      stream.append(fragment);
    }
  }

  function tdZoomExtend() {
    const scene = tdZoom.scene;
    if (!scene || scene.progress < .999 || scene.pending || tdZoomMoving(scene)) return;
    const list = tdZoom.list;
    if (list.scrollTop < 180 && scene.first > 0) {
      const start = tdZoomChunkEdge(scene,Math.max(0,scene.first-tdZoomChunk),-1);
      const prior = scene.first;
      scene.first = start;
      tdZoomRender(scene, start, prior, true);
    }
    if (list.scrollHeight - list.clientHeight - list.scrollTop < 240 && scene.last < scene.records.length) {
      const prior = scene.last;
      scene.last = tdZoomChunkEdge(scene,Math.min(scene.records.length,prior+tdZoomChunk),1);
      tdZoomRender(scene, prior, scene.last);
    }
  }

  function tdZoomBuildEffects(scene) {
    tdZoomClearEffects(scene);
    if (tdZoomReducedMotion.matches) return;
    const effects = [];
    for (const [id, node] of tdZoomVisibleSources(scene)) {
      const row = scene.rows.get(id);
      if (!row?.isConnected) continue;
      const compact = row.getBoundingClientRect();
      if (compact.bottom <= scene.bounds.top || compact.top >= scene.bounds.bottom || !compact.width || !compact.height) continue;
      const original = node.getBoundingClientRect();
      const rightAligned = row.dataset.role === 'user';
      const x = rightAligned ? original.right-compact.right : original.left-compact.left;
      const y = original.top-compact.top;
      effects.push({node,row,x,y,origin:rightAligned ? 'right top' : 'left top'});
    }
    // 批量测量初始位置，再一起创建动画，避免逐条动画强制后续测量刷新布局。
    for (const {node,row,x,y,origin} of effects) {
      const source = node.animate([
        {translate:'none', scale:'none', transformOrigin:origin},
        {translate:(-x)+'px '+(-y)+'px', scale:'.87', transformOrigin:origin},
      ], {duration:1000, fill:'both'});
      const preview = row.animate([
        {translate:x+'px '+y+'px', scale:'1.15', transformOrigin:origin},
        {translate:'none', scale:'none', transformOrigin:origin},
      ], {duration:1000, fill:'both'});
      for (const effect of [source, preview]) {
        effect.pause();
        effect.currentTime = scene.progress*1000;
        scene.effects.push(effect);
      }
    }
  }

  function tdZoomClearFades(scene) {
    for (const fade of scene.sourceFades) fade.cancel();
    scene.sourceFades.length = 0;
  }

  const tdZoomTranscriptMask = 'data-threaddeck-overview-mask';

  function tdZoomContainsPageControls(root,composer) {
    const headers = root.querySelectorAll('header,[role="banner"],[data-app-shell-page-header],[data-testid="conversation-header"]');
    return Boolean(composer && tdDomContains(root,composer)) || [...headers].some(node=>!elementBelongsToConversationTurn(node));
  }

  function tdZoomMaskTranscript(scene,masked) {
    if (!masked) {
      scene.root.removeAttribute(tdZoomTranscriptMask);
      return;
    }
    if (!tdZoom.maskStyle?.isConnected) {
      tdZoom.maskStyle = document.createElement('style');
      tdZoom.maskStyle.textContent = `[${tdZoomTranscriptMask}="body"],
        [${tdZoomTranscriptMask}="turns"] :is(${TD_DOM_BOUNDARY},[data-user-message-bubble],${TD_DOM_CONTENT}) {
          filter:opacity(0)!important;
          pointer-events:none!important;
        }`;
      (document.head || document.documentElement).append(tdZoom.maskStyle);
    }
    // 隐藏绘制和指针目标，保留宿主原文布局供补齐与精确跳转使用。
    scene.root.setAttribute(tdZoomTranscriptMask,scene.includesChrome ? 'turns' : 'body');
  }

  function tdZoomFadeOriginal(scene) {
    if (scene.sourceFades.length) return;
    const {root,includesChrome} = scene;
    const composer = getComposerBoundary();
    // 有些页面的 main 同时拥有输入框。只在独立正文节点上整体淡出。
    const sources = includesChrome ? [...tdZoomVisibleSources(scene).values()] : [root];
    const blocks = [...new Set(sources.map(node => {
      if (!includesChrome) return node;
      const turn = node.closest('article,[data-turn-key],[data-testid^="conversation-turn-"]');
      return turn && (!composer || !tdDomContains(turn, composer)) ? turn : node;
    }))];
    const fades = blocks.map(node=>({node,opacity:getComputedStyle(node).opacity}));
    for (const {node,opacity} of fades) {
      // 文字只交接一次，避免相同文字以不同字号同时绘制造成重影。
      const fade = node.animate([{opacity, offset:0}, {opacity, offset:.15}, {opacity:0, offset:.77}, {opacity:0, offset:1}],
        {duration:1000, fill:'both'});
      fade.pause();
      fade.currentTime = scene.progress*1000;
      scene.sourceFades.push(fade);
    }
  }

  function tdZoomPaint(scene, value) {
    scene.progress = Math.max(0, Math.min(1, value));
    const p = scene.progress;
    const {backdrop,list,stream} = tdZoom;
    const settled = p >= .999;
    if (list.inert === settled) {
      list.inert = !settled;
      tdZoom.surface.dataset.settled = String(settled);
      tdZoomMaskTranscript(scene,settled);
    }
    // 仅更新参与过渡的图层，避免每帧让摘要和章节从头计算继承样式。
    backdrop.style.opacity = settled ? '1' : String(Math.max(0,Math.min(1,(p-.32)*1.7)));
    list.style.opacity = settled ? '1' : String(Math.max(0,Math.min(1,(p-.16)*1.72)));
    stream.style.transform = settled || tdZoomReducedMotion.matches ? '' : 'scaleY(' + (.96+.04*p) + ')';
    for (const effect of scene.effects) effect.currentTime = p*1000;
    for (const fade of scene.sourceFades) fade.currentTime = p*1000;
  }

  function tdZoomAnimate(scene, destination) {
    if (tdZoom.scene !== scene) return;
    cancelAnimationFrame(tdZoom.frame);
    if (destination === 0) tdZoomFadeOriginal(scene);
    const from = scene.progress;
    const duration = (tdZoomReducedMotion.matches ? 90 : destination === 0 ? 210 : 270) *
      Math.max(.54, Math.abs(destination-from));
    const started = performance.now();
    function frame(time) {
      if (tdZoom.scene !== scene || !tdAlive(scene.scope)) return;
      const fraction = Math.max(0, Math.min(1, (time-started)/duration));
      const eased = 1-Math.pow(1-fraction, 3);
      tdZoomPaint(scene, from+(destination-from)*eased);
      if (fraction < 1) tdZoom.frame = requestAnimationFrame(frame);
      else if (destination === 0) tdZoomFinish(scene);
      else {
        tdZoom.frame = 0;
        tdZoomClearEffects(scene);
        // 正文由绘制遮罩接管，释放开场动画。
        tdZoomClearFades(scene);
        const list = tdZoom.list;
        if (scene.keyboard) list.focus({preventScroll:true});
        tdZoomScheduleSettled(scene);
      }
    }
    tdZoom.frame = requestAnimationFrame(frame);
  }

  function tdZoomShow(y, keyboard = false) {
    if (tdZoom.scene || !tdZoomReady() || !tdZoom.root || !settingsLayerEl?.hidden || activeCommentMode || tdSelectionBusy()) return null;
    tdOutlineStopHistory();
    const records = tdZoomRecords();
    let nearest = null;
    const consider = (entry, message) => {
      if (!message.target?.isConnected) return;
      const box = message.target.getBoundingClientRect();
      if (!box.width || !box.height) return;
      const distance = y < box.top ? box.top-y : Math.max(0, y-box.bottom);
      if (!nearest || distance < nearest.distance) nearest = {entry,message,distance};
    };
    for (const entry of records) {
      consider(entry, entry);
      for (const answer of entry.answerRecords || []) consider(entry, answer);
    }
    const reference = nearest?.message.target || (records[0] && tdZoomNativeNode(records[0],entryAnchorRole(records[0]))) || tdZoom.root;
    const recordIndex = Math.max(0, records.indexOf(nearest?.entry));
    const userReference = records[recordIndex]?.target;
    const outline = tdHistory.capture;
    const history = outline && tdAlive(outline.scope) ? outline.history : null;
    const scene = {root:tdZoom.root,viewportRoot:findScrollRoot(),scope:tdScope(),reference,userReference,keyboard,progress:0,initialScroll:0,
      records,complete:records.length > 0 && (tdHealth.snapshot?.complete === true || history?.complete === true),
      rows:new Map(),destinations:new WeakMap(),effects:[],sourceFades:[],pending:false,
      first:Math.max(0,recordIndex-18),last:Math.min(records.length,recordIndex+19),
      previousFocus:shadowRoot.activeElement || document.activeElement,restoreFocus:keyboard,
      history:history ? {...history,origin:null,running:false,cancelled:false,messages:new Map(history.messages),
        order:[...history.order],links:new Set(history.links)} :
        {messages:new Map(),order:[],attempted:false,running:false,complete:false,gap:false}};
    if (!tdZoomLayout(scene)) return null;
    scene.includesChrome = tdZoomContainsPageControls(scene.root,getComposerBoundary());
    tdZoom.scene = scene;
    delete tdZoom.surface.dataset.historyCoverage;
    tdZoom.surface.hidden = false;
    const prepared = tdZoom.preparation;
    const sameRoute = prepared && tdAlive(prepared.scope);
    const ready = sameRoute && prepared.view && prepared.records === records &&
      prepared.revision === tdDomState.revision && (!prepared.view.partial || !scene.complete);
    const available = sameRoute && (prepared.view || prepared.lastView);
    if (available) {
      const focus = tdZoomEntryId(records[recordIndex]);
      const {complete,history:{attempted,exhausted}}=scene;
      tdZoomInstallDigest(scene,available);
      if (!ready) {
        // 更新在途时保留已可读的摘要，新的内容到齐后再整体替换。
        Object.assign(scene,{complete,digestDraft:records,localCacheRead:false,historyKey:null});
        Object.assign(scene.history,{attempted,exhausted});
      }
      const index = Math.max(0,scene.records.findIndex(entry=>tdZoomEntryId(entry)===focus));
      scene.first = tdZoomChunkEdge(scene,Math.max(0,index-18),-1);
      scene.last = tdZoomChunkEdge(scene,Math.min(scene.records.length,index+19),1);
    }
    navHost.dataset.overview = 'true';
    tdZoom.button?.setAttribute('aria-expanded', 'true');
    tdZoomRender(scene, scene.first, scene.last);
    const list = tdZoom.list;
    const anchor = nearest?.message || records[recordIndex];
    const row = scene.rows.get(anchor?.messageId || anchor?.nodeId);
    if (row) list.scrollTop = Math.max(0, row.getBoundingClientRect().top-y);
    tdZoom.surface.style.setProperty('--zoom-origin-y',Math.min(scene.bounds.bottom - scene.bounds.top,Math.max(0,y-scene.bounds.top))+'px');
    scene.initialScroll = list.scrollTop;
    tdZoomBuildEffects(scene);
    tdZoomFadeOriginal(scene);
    tdZoomPaint(scene, 0);
    const relayout = () => {
      if (tdZoom.scene !== scene) return;
      const old = scene.bounds;
      if (!tdZoomLayout(scene)) tdZoomFinish(scene);
      else if (scene.progress < .999 && Object.keys(old).some(key=>Math.abs(old[key]-scene.bounds[key])>1))
        tdZoomBuildEffects(scene);
    };
    scene.observer = new MutationObserver(() => tdZoomReadTheme(scene));
    const themeNodes = new Set([tdZoomUserBubble(userReference)]);
    for (let node=scene.root; node; node=tdDomParent(node)) themeNodes.add(node);
    for (const element of themeNodes) {
      if (element) scene.observer.observe(element, {attributes:true});
    }
    scene.resize = new ResizeObserver(relayout);
    scene.resize.observe(scene.viewportRoot);
    const composer = getComposerBoundary();
    if (composer) scene.resize.observe(composer);
    scene.layoutEvents = new AbortController();
    const resizeOptions = {passive:true,signal:scene.layoutEvents.signal};
    window.addEventListener('resize',relayout,resizeOptions);
    window.visualViewport?.addEventListener('resize',relayout,resizeOptions);
    scene.cacheDOMRevision = tdDomState.revision;
    if (!ready) scene.cacheLookup = tdZoomCachedOverview({...scene,records}).then(cached=>{
      scene.warmCacheReady = cached?.state === 'ready';
      return cached;
    });
    tdZoomTopicControls(scene,ready?'ready':available?'working':'checking',available&&!ready?'正在更新摘要…':'');
    return scene;
  }

  function tdZoomClose() {
    const scene = tdZoom.scene;
    if (!scene) return;
    if (scene.pending) {
      tdNavCancel('zoom-dismissed');
      tdZoomFinish(scene);
      return;
    }
    tdZoomStopHistory(scene);
    clearTimeout(tdZoom.settle);
    delete scene.gestureProgress;
    tdZoomBuildEffects(scene);
    tdZoomAnimate(scene, 0);
  }

  function tdZoomDestinationAt(scene, target, y) {
    const direct = scene.destinations.get(target?.closest?.('.zoom-line'));
    if (direct) return direct;
    let nearest = null, distance = Infinity;
    for (const row of scene.rows.values()) {
      const bounds = row.getBoundingClientRect();
      if (bounds.bottom <= scene.bounds.top || bounds.top >= scene.bounds.bottom) continue;
      const delta = Math.min(Math.abs(bounds.top-y), Math.abs(bounds.bottom-y));
      if (delta < distance) { nearest = row; distance = delta; }
    }
    return nearest && scene.destinations.get(nearest);
  }

  function tdZoomGestureTarget(event) {
    if (!settings.pinchTopics || !tdZoomReady() || !settingsLayerEl?.hidden || activeCommentMode ||
        tdSelectionBusy() || window.getSelection()?.isCollapsed === false) return null;
    const path = event.composedPath();
    const target = path[0];
    const transcript = target instanceof Element && tdDomContains(tdZoom.root,target) &&
      !isInsideComposer(target) && !tdDomClosest(target,tdZoomExcluded);
    const overview = tdZoom.scene && path.includes(tdZoom.surface);
    return transcript || overview ? {target,transcript} : null;
  }

  function tdZoomScrub(delta, y, target, transcript) {
    let scene = tdZoom.scene;
    if (!scene) {
      if (delta < 0 || !transcript) return;
      scene = tdZoomShow(y);
      if (!scene) return;
    }
    if (!tdAlive(scene.scope)) { tdZoomFinish(scene); return; }
    if (scene.pending) return;
    clearTimeout(tdZoom.settle);
    if (scene.gestureProgress === undefined) {
      clearTimeout(scene.settledWork);
      scene.settledWork = 0;
      cancelAnimationFrame(tdZoom.frame);
      tdZoom.frame = 0;
      tdZoomStopHistory(scene);
      if (scene.progress >= .999 && delta < 0) {
        const list = tdZoom.list;
        const destination = tdZoomDestinationAt(scene,target,y);
        if (destination && Math.abs(list.scrollTop - scene.initialScroll) > 4) tdZoomPlace(scene,destination,y);
        tdZoomFadeOriginal(scene);
        tdZoomBuildEffects(scene);
      }
    }
    scene.gestureProgress = Math.max(0,Math.min(1,(scene.gestureProgress ?? scene.progress) + delta));
    if (!tdZoom.frame) tdZoom.frame = requestAnimationFrame(()=>{
      tdZoom.frame = 0;
      if (tdZoom.scene === scene) tdZoomPaint(scene,scene.gestureProgress);
    });
    tdZoom.settle = setTimeout(()=>{
      if (tdZoom.scene !== scene) return;
      const targetProgress = scene.gestureProgress;
      cancelAnimationFrame(tdZoom.frame);
      tdZoom.frame = 0;
      delete scene.gestureProgress;
      tdZoomPaint(scene,targetProgress);
      tdZoomAnimate(scene,targetProgress >= .44 ? 1 : 0);
    },110);
  }

  function tdZoomWheel(event) {
    if (!event.isTrusted || !event.ctrlKey || tdZoom.control || event.altKey || event.shiftKey ||
        event.metaKey || event.deltaMode !== 0 || !event.deltaY || !event.cancelable) return;
    const now = performance.now(), direction = Math.sign(event.deltaY);
    const continuing = tdZoom.tail && now - tdZoom.tail.time < 165;
    const hit = tdZoomGestureTarget(event);
    if (!continuing && (!hit || Math.abs(event.deltaX) > Math.abs(event.deltaY))) return;
    // 一次已接管的手势直到结束都由对话处理。物理 Control 和浏览器缩放快捷键照常。
    event.preventDefault();
    tdZoom.tail = {direction,time:now};
    tdZoomScrub(Math.max(-80,Math.min(80,event.deltaY))/62,event.clientY,hit?.target,hit?.transcript);
  }

  function tdZoomTouch(event) {
    if (event.type === 'touchcancel' || event.type === 'touchend' && event.touches.length < 2) {
      tdZoom.touch = null;
      return;
    }
    if (!event.isTrusted || event.touches.length !== 2 || !event.cancelable) return;
    const hit = tdZoom.touch?.hit || tdZoomGestureTarget(event);
    if (!hit) return;
    const [a,b] = event.touches;
    const separation = Math.hypot(a.clientX-b.clientX,a.clientY-b.clientY);
    if (!tdZoom.touch && separation < 24) return;
    event.preventDefault();
    const prior = tdZoom.touch?.separation;
    tdZoom.touch = {hit,separation};
    if (prior) tdZoomScrub(Math.max(-.35,Math.min(.35,Math.log(prior/separation)*3.6)),
      (a.clientY+b.clientY)/2,hit.target,hit.transcript);
  }

  function tdZoomRememberDigest(scene, entries, partial) {
    const identities = new Map();
    const add = (message,role) => {
      for (const id of [message.id,message.nodeId].filter(Boolean)) identities.set(role+':'+id,message.revision);
    };
    for (const entry of entries) {
      if (entry.role === 'user') add(entry,'user');
      for (const answer of entry.answers) add(answer,'assistant');
    }
    scene.digestIdentities = identities;
    if (!partial) tdHistory.verifiedOrder = {scope:scene.scope,entries};
  }

  function tdZoomRefreshHistory(scene, recovered = false) {
    if (!scene || scene.progress < .999 || scene.pending || tdZoomMoving(scene) || scene.history.running) return;
    const indexed = tdZoomRecords();
    const authoritative = tdHealth.snapshot?.complete === true && indexed.length > 0;
    const changed = [];
    let newMessage = false;
    if (scene.digestIdentities?.size) {
      for (const {id,nodeId,role,revision} of tdZoomMountedEvidence(indexed)) {
        if (!revision) continue;
        const identity = scene.digestIdentities.has(role+':'+id) ? role+':'+id : role+':'+nodeId;
        if (!scene.digestIdentities.has(identity)) newMessage = true;
        else {
          const prior = scene.digestIdentities.get(identity);
          if (prior && prior !== revision) changed.push(id,nodeId);
        }
      }
      if (changed.length) scene.revisedMessages = new Set(changed);
      if (changed.length || newMessage) tdZoomCaptureHistory(scene,scene.viewportRoot);
    }
    // 保留已读摘要，除非有新增消息、正文修订或宿主确认了完整范围。
    const previous = scene.digestDraft || scene.records;
    const readMore = recovered && scene.history.order.length >
      previous.reduce((count,entry)=>count+(entryAnchorRole(entry)==='user'?1:0)+(entry.answerRecords?.length||0),0);
    if (!changed.length && !newMessage && scene.cachedOverview && !authoritative && !scene.history.complete && !readMore) {
      tdZoomAdvancePreparedHistory(scene);
      return;
    }
    const captured = tdZoomCapturedRecords(scene);
    const records = authoritative || (!scene.history.complete && (scene.history.gap || captured.length < indexed.length)) ? indexed : captured;
    const complete = authoritative || scene.history.complete;
    const identity = entry=>[tdZoomEntryId(entry),...(entry.answerRecords || []).map(answer=>answer.messageId || answer.nodeId)].join('/');
    const sameOrder = records.length === previous.length && records.every((entry,index)=>
      identity(entry)===identity(previous[index]) &&
      (scene.cachedOverview && !scene.digestDraft || tdZoomRecordRevision(entry)===tdZoomRecordRevision(previous[index])));
    if (!records.length || (scene.digestDraft || !changed.length && !newMessage) && sameOrder && complete === scene.complete) {
      void tdZoomLoadTopics(scene);
      return;
    }
    if (scene.summaries?.size && settings.autoTopicSummary !== false) {
      if (tdZoomReplyRunning()) {
        tdZoomTopicControls(scene,'working','回复完成后更新摘要');
        return;
      }
      if (!scene.digestDraft && !complete && !scene.history.exhausted) scene.history.attempted = false;
      // 保留当前完整摘要和阅读位置，新证据准备好后再整体替换。
      scene.digestDraft = records;
      scene.complete = complete;
      scene.reloadTopics = scene.topicRequestPending;
      scene.topicRequest = null;
      scene.localCacheRead = false;
      scene.nextTopics = null;
      void tdZoomLoadTopics(scene);
      return;
    }
    const list = tdZoom.list;
    const listTop = list.getBoundingClientRect().top;
    const anchor = [...scene.rows].find(([,row]) => row.getBoundingClientRect().bottom > listTop);
    const priorTop = anchor?.[1].getBoundingClientRect().top;
    const oldScroll = list.scrollTop;
    const shift = records.findIndex(record => record.key === scene.records[scene.first]?.key);
    scene.first = Math.max(0, shift - Math.floor(tdZoomChunk / 2));
    scene.last = Math.min(records.length, scene.first + tdZoomChunk);
    scene.records = records;
    scene.complete = complete;
    scene.cachedOverview = false;
    scene.localCacheRead = false;
    scene.reloadTopics = scene.topicRequestPending;
    scene.digestIdentities = null;
    scene.topicRequest = null;
    scene.nextTopics = null;
    scene.topics = null;
    scene.summaries = null;
    tdZoom.surface.querySelector('.zoom-conversation-summary').hidden = true;
    tdZoomRenderTopicIndex(scene);
    scene.rows.clear();
    tdZoom.stream.replaceChildren();
    tdZoomRender(scene, scene.first, scene.last);
    const row = scene.rows.get(anchor?.[0]);
    if (row) list.scrollTop += row.getBoundingClientRect().top - priorTop;
    scene.initialScroll += list.scrollTop - oldScroll;
    void tdZoomLoadTopics(scene);
  }

  function tdSyncSemanticZoom() {
    if (!tdZoom.button || !tdZoom.surface) return;
    const ready = tdZoomReady();
    tdZoom.button.hidden = !ready;
    tdZoom.button.title = tr(settings.autoTopicSummary ? '打开概览并使用已配置的 OpenAI 连接生成摘要' : '打开概览');
    if (!ready) {
      if (tdZoom.root || tdZoom.scene) tdZoomReset();
      return;
    }
    const root = tdZoomRoot();
    if (tdZoom.scene?.root.isConnected && tdAlive(tdZoom.scene.scope)) {
      tdZoomRefreshHistory(tdZoom.scene);
      return;
    }
    if (root === tdZoom.root) {
      if (!tdZoom.scene) tdZoomPrepare();
      return;
    }
    tdZoomReset();
    tdZoom.root = root;
    if (root) {
      tdZoom.listener = new AbortController();
      const gestureOptions = {capture:true,passive:false,signal:tdZoom.listener.signal};
      window.addEventListener('wheel',tdZoomWheel,gestureOptions);
      for (const type of ['touchstart','touchmove','touchend','touchcancel'])
        window.addEventListener(type,tdZoomTouch,gestureOptions);
      window.addEventListener('focus',tdZoomPrepare,{signal:tdZoom.listener.signal});
      tdZoomPrepare();
    }
  }


  function ensureUi() {
    if (navHost?.isConnected) return;

    navHost = document.createElement('div');
    navHost.id = 'threaddeck-host';
    navHost.style.setProperty('all', 'initial', 'important');
    navHost.style.setProperty('position', 'static', 'important');
    navHost.style.setProperty('z-index', '2147483646', 'important');
    document.documentElement.appendChild(navHost);
    shadowRoot = navHost.attachShadow({ mode: 'open' });
    shadowRoot.innerHTML = `
      <style>
        :host {
          all: initial;
          --apr-right: 12px;
          --apr-panel-bg: #fff;
          --apr-dialog-bg: #ffffff;
          --apr-panel-border: rgba(13, 13, 13, 0.10);
          --apr-text: #171717;
          --apr-muted: #606060;
          --apr-faint: rgba(13, 13, 13, 0.38);
          --apr-hover: rgba(13, 13, 13, 0.06);
          --apr-active-row: rgba(13, 13, 13, 0.095);
          --apr-input: rgba(13, 13, 13, 0.045);
          --apr-bar: rgba(13, 13, 13, 0.32);
          --apr-bar-hover: rgba(13, 13, 13, 0.58);
          --apr-bar-active: #171717;
          --apr-accent: #171717;
          --apr-on-accent: #fff;
          --apr-accent-hover: #333;
          --apr-focus: #3c638f;
          --apr-shadow: 0 14px 40px rgba(0, 0, 0, 0.14), 0 2px 8px rgba(0, 0, 0, 0.08);
          --apr-font: ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        }

        :host([data-theme="dark"]) {
          --apr-panel-bg: #252525;
          --apr-dialog-bg: #232323;
          --apr-accent: #f4f4f4;
          --apr-on-accent: #171717;
          --apr-accent-hover: #dcdcdc;
          --apr-focus: #aecbf2;
          --apr-panel-border: rgba(255, 255, 255, 0.11);
          --apr-text: #f7f7f8;
          --apr-muted: rgba(255, 255, 255, 0.62);
          --apr-faint: rgba(255, 255, 255, 0.40);
          --apr-hover: rgba(255, 255, 255, 0.075);
          --apr-active-row: rgba(255, 255, 255, 0.12);
          --apr-input: rgba(255, 255, 255, 0.07);
          --apr-bar: rgba(255, 255, 255, 0.34);
          --apr-bar-hover: rgba(255, 255, 255, 0.62);
          --apr-bar-active: rgba(255, 255, 255, 0.96);
          --apr-shadow: 0 14px 42px rgba(0, 0, 0, 0.42), 0 2px 10px rgba(0, 0, 0, 0.32);
        }

        * { box-sizing: border-box; }
        button, input, textarea { font: inherit; }
        button { color: inherit; }
        [hidden] { display: none !important; }

        .navigator {
          position: fixed;
          z-index: 2147483646;
          right: var(--apr-right);
          top: 50%;
          transform: translateY(-50%);
          width: 26px;
          min-height: 28px;
          pointer-events: auto;
          color: var(--apr-text);
          font-family: var(--apr-font);
          -webkit-font-smoothing: antialiased;
          text-rendering: geometricPrecision;
        }

        :host([data-overview="true"]) .navigator { display:none; }

        .compact-rail {
          position: relative;
          z-index: 2;
          width: 26px;
          max-height: min(480px, calc(100vh - 118px));
          overflow-y: auto;
          overscroll-behavior: contain;
          scrollbar-width: none;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: flex-start;
          gap: 4px;
          padding: 8px 3px;
          border-radius: 999px;
        }
        .compact-rail::-webkit-scrollbar { display: none; }

        .rail-item {
          appearance: none;
          border: 0;
          padding: 0;
          margin: 0;
          width: 20px;
          height: 4px;
          min-height: 4px;
          display: grid;
          place-items: center;
          background: transparent;
          cursor: pointer;
          outline: none;
          flex: 0 0 4px;
        }
        .rail-item::after {
          content: "";
          width: 12px;
          height: 1px;
          min-height: 1px;
          border-radius: 999px;
          background: var(--apr-bar);
          transition: width 130ms ease, height 130ms ease, background-color 130ms ease;
        }
        .rail-item:hover::after,
        .rail-item:focus-visible::after { width: 16px; height: 2px; background: var(--apr-bar-hover); }
        .rail-item[data-active="true"]::after { width: 16px; height: 2px; background: var(--apr-bar-active); }
        .rail-item[data-entry-kind="automation-run"] {
          height: 7px;
          min-height: 7px;
          flex-basis: 7px;
        }
        .rail-item[data-entry-kind="automation-run"]::after {
          width: 5px;
          height: 5px;
          border-radius: 50%;
        }
        .rail-item[data-entry-kind="automation-run"]:hover::after,
        .rail-item[data-entry-kind="automation-run"]:focus-visible::after,
        .rail-item[data-entry-kind="automation-run"][data-active="true"]::after {
          width: 7px;
          height: 7px;
        }

        .preview-panel {
          color:var(--apr-text);
          position: absolute;
          z-index: 1;
          right: 25px;
          top: 50%;
          width: min(370px, calc(100vw - 72px));
          max-height: min(520px, calc(100vh - 80px));
          overflow: hidden;
          display: flex;
          flex-direction: column;
          border: 1px solid var(--apr-panel-border);
          border-radius: 16px;
          background: var(--apr-panel-bg);
          box-shadow: var(--apr-shadow);
          opacity: 0;
          visibility: hidden;
          pointer-events: none;
          transform: translate(8px, -50%) scale(0.985);
          transform-origin: right center;
          transition: opacity 140ms ease, transform 160ms ease, visibility 140ms linear;
        }
        .navigator:hover .preview-panel,
        .navigator:focus-within .preview-panel {
          opacity: 1;
          visibility: visible;
          pointer-events: auto;
          transform: translate(0, -50%) scale(1);
        }


        .zoom-actions { display:flex; align-items:center; gap:3px; flex:none; }
        .zoom-button {
          min-height:32px; border-radius:7px; padding:3px 9px; border:0;
          color:var(--apr-accent); background:transparent; font-size:12px; font-weight:650; cursor:pointer;
        }
        .zoom-button:hover, .zoom-button:focus-visible { background:var(--apr-hover); }
        .semantic-zoom {
          position:fixed; z-index:2147483644; isolation:isolate;
          --zoom-inset:clamp(14px, 2.4vw, 26px);
          --zoom-reply-fill:color-mix(in srgb, var(--zoom-background), var(--zoom-ink) 6%);
          --zoom-summary-fill:color-mix(in srgb, var(--zoom-background), var(--zoom-bubble) 22%);
          --zoom-line-color:color-mix(in srgb, var(--zoom-ink) 10%, transparent);
          display:grid; grid-template-rows:auto minmax(0,1fr);
          overflow:hidden; color:var(--zoom-ink); color-scheme:var(--zoom-scheme, normal);
          font-family:var(--zoom-font); font-size:var(--zoom-size); line-height:1.5;
          pointer-events:auto;
        }
        .zoom-backdrop {
          position:absolute; inset:0; z-index:-1; pointer-events:none;
          background-color:Canvas;
          background-image:linear-gradient(var(--zoom-background),var(--zoom-background));
          opacity:0;
        }
        .zoom-list {
          position:relative; min-height:0; overflow:auto; overscroll-behavior:contain;
          outline:none; scrollbar-width:thin; opacity:0;
          scroll-padding-block:12px 24px;
        }
        .zoom-stream {
          display:grid; gap:26px; box-sizing:border-box; width:var(--zoom-column-width); margin-left:var(--zoom-column-left);
          padding:15px var(--zoom-inset) 36px;
          transform-origin:50% var(--zoom-origin-y,50%);
        }
        .zoom-topic { display:flex; flex-direction:column; align-items:start; gap:10px; }
        .zoom-topic + .zoom-topic { border-top:1px solid var(--zoom-line-color); padding-top:18px; }
        .zoom-topic h3 {
          margin:0; color:var(--zoom-ink); font-size:1em; line-height:1.35;
          font-weight:650; letter-spacing:-.018em; overflow-wrap:anywhere;
        }
        .zoom-empty { margin:4px 0; color:var(--zoom-muted); font-size:.83em; line-height:1.55; }
        .zoom-exchange { display:flex; flex-direction:column; width:100%; align-items:start; gap:8px; }
        .zoom-exchange + .zoom-exchange { margin-top:7px; }
        .zoom-line, .zoom-turn-summary, .zoom-topic[data-merged] > .zoom-summary {
          box-sizing:border-box; display:block; width:fit-content; max-width:88%; margin:0;
          padding:.52em .88em; border:0; border-radius:var(--zoom-radius);
          text-align:start; font-size:.9em; line-height:1.48; overflow-wrap:anywhere;
        }
        .zoom-line { cursor:pointer; transform-origin:left center; }
        .zoom-line[data-role="user"], .zoom-topic[data-merged] > h3 {
          align-self:end; padding:.48em .88em; background:var(--zoom-bubble);
          color:var(--zoom-bubble-ink); border-radius:var(--zoom-radius); font-family:var(--zoom-bubble-font);
          transform-origin:right center;
        }
        .zoom-topic[data-merged] > h3 { max-width:88%; font-size:.9em; font-weight:550; }
        .zoom-line[data-role="assistant"], .zoom-turn-summary, .zoom-topic[data-merged] > .zoom-summary {
          align-self:start; background:var(--zoom-reply-fill); color:var(--zoom-ink);
        }
        .zoom-line-label { display:-webkit-box; -webkit-box-orient:vertical; -webkit-line-clamp:3; overflow:hidden; white-space:pre-line; }
        .zoom-line[data-role="assistant"]:not([data-digest]) { color:var(--zoom-muted); font-size:.76em; }
        .zoom-line[data-role="assistant"] .zoom-line-label { -webkit-line-clamp:4; }
        .zoom-line[data-digest="true"] .zoom-line-label { display:block; overflow:visible; }
        .zoom-line:hover { text-decoration:underline; text-underline-offset:.2em; }
        .zoom-summary { margin:0 0 3px; color:var(--zoom-muted); font-size:.84em; line-height:1.52; overflow-wrap:anywhere; }
        .zoom-sources { width:100%; min-width:0; color:var(--zoom-muted); font-size:.8em; }
        .zoom-source-turns { font-size:1.25em; margin-top:8px; }
        .zoom-conversation-summary {
          box-sizing:border-box;width:calc(var(--zoom-column-width) - 2 * var(--zoom-inset));
          margin:12px 0 9px calc(var(--zoom-column-left) + var(--zoom-inset));
          padding:13px clamp(12px,2.4vw,19px);border-radius:15px;border:1px solid var(--zoom-line-color);
          font-size:1.04em;font-weight:550;line-height:1.56;letter-spacing:-.01em;
          max-height:min(9em, 30vh);overflow:auto;scrollbar-width:thin;overflow-wrap:anywhere;
          color:var(--zoom-ink);background:var(--zoom-summary-fill);
        }
        .zoom-conversation-summary[hidden], .zoom-topic-index[hidden] { display:none; }
        .zoom-topic-index{
          box-sizing:border-box;width:var(--zoom-column-width);margin-left:var(--zoom-column-left);
          display:flex;gap:7px;overflow-x:auto;scrollbar-width:thin;padding:1px var(--zoom-inset) 8px;
          background:var(--zoom-background);
        }
        .zoom-topic-index button{
          appearance:none;flex:0 0 auto;max-width:min(260px,75%);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;
          min-height:27px;border:0;border-radius:99px;padding:4px 10px;font:inherit;font-size:.75em;line-height:1.35;
          color:var(--zoom-ink);background:color-mix(in srgb,var(--zoom-ink) 7%,transparent);cursor:pointer;
        }
        .zoom-topic-index button:hover{background:color-mix(in srgb,var(--zoom-ink) 13%,transparent)}
        .zoom-topic-index button:focus-visible{outline:1px solid currentColor;outline-offset:-2px}
        .zoom-toolbar {
          position:relative; z-index:2;
          display:flex; justify-content:space-between; align-items:center; gap:10px;
          min-height:46px; padding:6px clamp(12px, 2.4vw, 24px);
          background:var(--zoom-background);
          border-bottom:1px solid color-mix(in srgb, var(--zoom-ink) 13%, transparent);
          visibility:hidden;
        }
        .semantic-zoom[data-settled="true"] .zoom-toolbar { visibility:visible; }
        .semantic-zoom:not([data-settled="true"]) .zoom-conversation-summary,
        .semantic-zoom:not([data-settled="true"]) .zoom-topic-index { visibility:hidden; }
        .zoom-context, .zoom-controls { display:flex; min-width:0; align-items:center; gap:9px; }
        .zoom-context strong { font-size:.86em; font-weight:650; white-space:nowrap; }
        .zoom-coverage { color:var(--zoom-muted); font-size:.72em; white-space:nowrap; }
        .zoom-return, .zoom-ai {
          flex:none; min-height:30px; padding:4px 9px; border:0; border-radius:8px;
          color:var(--zoom-ink); background:color-mix(in srgb, var(--zoom-ink) 7%, transparent);
          font-size:.75em; font-weight:600; cursor:pointer;
        }
        .zoom-return { width:30px; padding:6px; background:transparent; line-height:0; }
        .zoom-return svg { width:16px; height:16px; fill:none; stroke:currentColor; stroke-width:1.5; stroke-linecap:round; }
        .zoom-ai-status {
          color:var(--zoom-muted); font-size:.73em; line-height:1.25; max-width:32ch;
          overflow-wrap:anywhere;
        }
        .zoom-chapters { width:100%; padding-inline-start:5px; color:var(--zoom-muted); font-size:.76em; }
        .zoom-chapters summary, .zoom-sources summary {
          display:flex; align-items:center; gap:3px; width:fit-content; min-height:26px;
          padding:2px 6px 2px 2px; border-radius:6px; cursor:pointer; list-style:none;
        }
        .zoom-chapters summary::-webkit-details-marker, .zoom-sources summary::-webkit-details-marker { display:none; }
        .zoom-chapters summary svg, .zoom-sources summary svg { width:13px; height:13px; flex:none; }
        .zoom-chapters[open] > summary svg, .zoom-sources[open] > summary svg { transform:rotate(90deg); }
        .zoom-chapters summary:hover, .zoom-sources summary:hover { background:color-mix(in srgb, var(--zoom-ink) 7%, transparent); }
        .zoom-chapter {
          display:block; max-width:100%; min-height:25px; text-align:start; padding:4px calc(13px + var(--chapter-level) * 9px);
          border:0; border-radius:6px; background:transparent; color:var(--zoom-ink); cursor:pointer;
        }
        .zoom-return:hover, .zoom-ai:hover, .zoom-chapter:hover { background:color-mix(in srgb, var(--zoom-ink) 13%, transparent); }
        .zoom-line:focus-visible, .zoom-return:focus-visible, .zoom-ai:focus-visible, .zoom-chapter:focus-visible,
        .zoom-chapters summary:focus-visible, .zoom-sources summary:focus-visible {
          outline:2px solid currentColor; outline-offset:2px;
        }
        @media (max-width:620px) {
          .zoom-context { display:grid; gap:1px; }
          .zoom-context strong, .zoom-coverage { line-height:1.2; }
          .zoom-ai-status { max-width:20ch; }
        }
        .semantic-zoom[data-locating="true"] { cursor:progress; }


        .panel-header {
          flex: 0 0 auto;
          min-height: 48px;
          padding: 9px 9px 8px 14px;
          border-bottom: 1px solid var(--apr-panel-border);
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 10px;
        }
        .panel-heading { min-width: 0; }
        .panel-title { font-size: 13px; line-height: 18px; font-weight: 650; letter-spacing: -0.01em; }
        .panel-subtitle { font-size: 11px; line-height: 15px; color: var(--apr-muted); }
        .icon-button {
          appearance: none;
          border: 0;
          width: 30px;
          height: 30px;
          border-radius: 9px;
          background: transparent;
          display: grid;
          place-items: center;
          cursor: pointer;
          color: var(--apr-muted);
          outline: none;
        }
        .icon-button:hover, .icon-button:focus-visible { background: var(--apr-hover); color: var(--apr-text); }
        .icon-button svg { width: 17px; height: 17px; fill: none; stroke: currentColor; stroke-width: 1.8; }

        .preview-list {
          flex: 1 1 auto;
          min-height: 0;
          max-height: min(468px, calc(100vh - 132px));
          overflow-y: auto;
          overscroll-behavior: contain;
          scrollbar-width: thin;
          scrollbar-color: var(--apr-muted) transparent;
          padding: 6px;
        }
        .preview-list::-webkit-scrollbar, .settings-scroll::-webkit-scrollbar { width: 8px; }
        .preview-list::-webkit-scrollbar-track, .settings-scroll::-webkit-scrollbar-track { background: transparent; }
        .preview-list::-webkit-scrollbar-thumb, .settings-scroll::-webkit-scrollbar-thumb {
          background: color-mix(in srgb, var(--apr-muted) 48%, transparent);
          border: 2px solid transparent;
          border-radius: 999px;
          background-clip: padding-box;
        }

        .outline-group { border-radius: 11px; }
        .question-row { display: flex; align-items: stretch; min-width: 0; border-radius: 10px; }
        .question-row[data-active="true"] { background: var(--apr-active-row); }
        .preview-item {
          appearance: none;
          border: 0;
          min-width: 0;
          flex: 1 1 auto;
          min-height: 38px;
          padding: 8px 8px 8px 10px;
          border-radius: 10px;
          background: transparent;
          color: var(--apr-text);
          display: flex;
          align-items: center;
          text-align: left;
          cursor: pointer;
          outline: none;
        }
        .question-row:hover { background: var(--apr-hover); }
        .question-row[data-active="true"]:hover { background: var(--apr-active-row); }
        .preview-item:focus-visible { box-shadow: inset 0 0 0 2px color-mix(in srgb, var(--apr-accent) 62%, transparent); }
        .preview-item[data-source="cache"] { color: var(--apr-muted); }
        .preview-item[data-entry-kind="automation-run"] {
          align-items: flex-start;
          gap: 8px;
          min-height: 48px;
          padding-left: 8px;
        }
        .event-icon {
          width: 16px;
          height: 16px;
          flex: 0 0 16px;
          margin-top: 1px;
          color: var(--apr-muted);
        }
        .event-icon svg {
          display: block;
          width: 16px;
          height: 16px;
          fill: none;
          stroke: currentColor;
          stroke-width: 1.45;
        }
        .preview-copy {
          min-width: 0;
          flex: 1 1 auto;
          display: flex;
          flex-direction: column;
          gap: 1px;
        }
        .event-meta {
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          color: var(--apr-muted);
          font-size: 11px;
          line-height: 15px;
          font-variant-numeric: tabular-nums;
        }
        .preview-text {
          display: -webkit-box;
          -webkit-box-orient: vertical;
          -webkit-line-clamp: 2;
          overflow: hidden;
          font-size: 13px;
          line-height: 18px;
          letter-spacing: -0.005em;
          word-break: break-word;
        }

        .answer-toggle {
          appearance: none;
          border: 0;
          width: 38px;
          flex: 0 0 38px;
          padding: 0 7px 0 2px;
          border-radius: 9px;
          background: transparent;
          color: var(--apr-muted);
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: flex-end;
          gap: 3px;
          outline: none;
        }
        .answer-toggle:hover, .answer-toggle:focus-visible { color: var(--apr-text); }
        .answer-count { font-size: 10px; line-height: 14px; font-variant-numeric: tabular-nums; }
        .chevron { width: 12px; height: 12px; transition: transform 130ms ease; }
        .answer-toggle[aria-expanded="true"] .chevron { transform: rotate(90deg); }

        .answer-list {
          position: relative;
          margin: 1px 5px 6px 17px;
          padding: 2px 0 2px 11px;
          border-left: 1px solid var(--apr-panel-border);
        }
        .answer-item {
          appearance: none;
          border: 0;
          width: 100%;
          min-height: 31px;
          padding: 5px 8px;
          border-radius: 8px;
          background: transparent;
          color: var(--apr-muted);
          display: flex;
          align-items: flex-start;
          gap: 0;
          text-align: left;
          cursor: pointer;
          outline: none;
        }
        .answer-item:hover:not([data-static="true"]), .answer-item:focus-visible:not([data-static="true"]) { background: var(--apr-hover); color: var(--apr-text); outline: none; }
        .answer-item[data-active="true"] { background: var(--apr-active-row); color: var(--apr-text); }
        .answer-item[data-static="true"] { cursor: default; opacity: .78; }
        .answer-text {
          min-width: 0;
          display: -webkit-box;
          -webkit-box-orient: vertical;
          -webkit-line-clamp: 2;
          overflow: hidden;
          font-size: 12px;
          line-height: 17px;
          word-break: break-word;
        }
        .empty-outline { padding: 15px 12px; color: var(--apr-muted); font-size: 12px; line-height: 18px; }

        .toast {
          position: absolute;
          right: 25px;
          top: calc(50% + min(280px, 42vh));
          width: max-content;
          max-width: min(370px, calc(100vw - 72px));
          padding: 7px 10px;
          border-radius: 10px;
          background: var(--apr-panel-bg);
          border: 1px solid var(--apr-panel-border);
          color: var(--apr-text);
          box-shadow: var(--apr-shadow);
          font-size: 12px;
          line-height: 17px;
          opacity: 0;
          visibility: hidden;
          transform: translateY(-4px);
          transition: opacity 120ms ease, transform 120ms ease, visibility 120ms linear;
          pointer-events: none;
        }
        .toast[data-visible="true"] { opacity: 1; visibility: visible; transform: translateY(0); }

        .selection-action {
          position: fixed;
          z-index: 2147483647;
          display: inline-flex;
          align-items: center;
          gap: 5px;
          min-height: 34px;
          padding: 0 10px;
          border: 0;
          border-radius: 9px;
          background: var(--apr-panel-bg);
          color: var(--apr-text);
          box-shadow: var(--apr-shadow);
          cursor: pointer;
          font-family: var(--apr-font);
          font-size: 12px;
          font-weight: 620;
          white-space: nowrap;
        }
        .selection-action { transition:background-color 120ms cubic-bezier(.2,.7,.3,1); }
        .selection-action svg { width:16px; height:16px; flex:none; }
        .selection-action:hover, .selection-action:active {
          background:color-mix(in srgb,var(--apr-text) 8%,var(--apr-panel-bg));
        }
        .selection-action:focus-visible { outline:2px solid var(--apr-text); outline-offset:2px; }
        @media (prefers-reduced-motion:reduce) { .selection-action { transition:none; } }

        .queue-dock {
          position: fixed;
          z-index: 2147483645;
          left: 50%;
          bottom: 132px;
          width: min(920px, calc(100vw - 24px));
          max-height: 286px;
          overflow: visible;
          color: var(--apr-text);
          font-family: var(--apr-font);
          pointer-events: none;
        }
        .queue-dock-list {
          max-height: inherit;
          overflow-y: auto;
          overscroll-behavior: contain;
          scrollbar-width: thin;
          display: flex;
          flex-direction: column;
          gap: 7px;
          padding: 2px;
          pointer-events: auto;
        }
        .queue-dock-item {
          position: relative;
          min-height: 62px;
          padding: 9px 10px 9px 11px;
          border: 1px solid color-mix(in srgb, var(--apr-panel-border) 92%, transparent);
          border-radius: 12px;
          display: grid;
          grid-template-columns: 24px minmax(0, 1fr) auto;
          align-items: center;
          gap: 9px;
          background: var(--apr-dialog-bg);
        }
        .queue-dock-item[data-status="sending"] { opacity: .68; }
        .queue-dock-item[data-dragging="true"] { opacity: .34; }
        .queue-dock-item[data-drop-before="true"]::before,
        .queue-dock-item[data-drop-after="true"]::after {
          content: "";
          position: absolute;
          z-index: 4;
          left: 12px;
          right: 12px;
          height: 2px;
          border-radius: 999px;
          background: var(--apr-accent);
          pointer-events: none;
        }
        .queue-dock-item[data-drop-before="true"]::before { top: -5px; }
        .queue-dock-item[data-drop-after="true"]::after { bottom: -5px; }
        .queue-dock-handle {
          width: 24px;
          height: 34px;
          display: grid;
          place-items: center;
          border-radius: 8px;
          color: var(--apr-faint);
          cursor: grab;
          touch-action: none;
          user-select: none;
        }
        .queue-dock-handle:hover, .queue-dock-handle:focus-visible { background: var(--apr-hover); color: var(--apr-muted); outline: none; }
        .queue-dock-handle:active { cursor: grabbing; }
        .queue-dock-handle svg { width: 19.5px; height: 19.5px; display: block; }
        .queue-dock-main { min-width: 0; display: flex; flex-direction: column; gap: 2px; }
        .queue-dock-text {
          appearance: none;
          width: 100%;
          min-height: 24px;
          max-height: 68px;
          padding: 0;
          border: 0;
          outline: 0;
          resize: none;
          overflow-y: auto;
          background: transparent;
          color: var(--apr-text);
          font-family: var(--apr-font);
          font-size: 15px;
          line-height: 22px;
          font-weight: 590;
          letter-spacing: -.012em;
        }
        .queue-dock-text:disabled { opacity: .7; }
        .queue-dock-meta {
          min-height: 16px;
          color: var(--apr-faint);
          font-size: 11px;
          line-height: 16px;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .queue-dock[data-activity="planning"] .queue-dock-meta { color: var(--apr-muted); }
        .queue-dock-controls { display: flex; align-items: center; justify-content: flex-end; gap: 0; }
        .queue-dock-direction, .queue-dock-icon {
          appearance: none;
          height: 36px;
          border: 0;
          border-radius: 9px;
          background: transparent;
          color: var(--apr-faint);
          cursor: pointer;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          font-family: var(--apr-font);
        }
        .queue-dock-direction { padding: 0 8px; gap: 5px; font-size: 12px; font-weight: 560; white-space: nowrap; letter-spacing: -.006em; }
        .queue-dock-icon { width: 32px; padding: 0; }
        .queue-dock-direction:hover:not(:disabled), .queue-dock-direction:focus-visible:not(:disabled),
        .queue-dock-icon:hover:not(:disabled), .queue-dock-icon:focus-visible:not(:disabled) {
          background: var(--apr-hover); color: var(--apr-text); outline: none;
        }
        .queue-dock-direction:disabled, .queue-dock-icon:disabled { opacity: .35; cursor: default; }
        .queue-dock-direction svg, .queue-dock-icon svg { width: 19px; height: 19px; display: block; flex: none; }
        .queue-dock-icon[data-action="queue-dock-remove"] svg { width: 18.5px; height: 18.5px; }
        .queue-dock-icon[data-action="queue-dock-remove"]:hover:not(:disabled),
        .queue-dock-icon[data-action="queue-dock-remove"]:focus-visible:not(:disabled) { color: #c43b34; background: rgba(196, 59, 52, .075); }
        .queue-dock-icon circle { fill: currentColor; stroke: none; }
        .queue-item-menu {
          position: fixed;
          z-index: 2147483647;
          left: 0;
          top: 0;
          width: 190px;
          padding: 6px;
          border: 1px solid var(--apr-panel-border);
          border-radius: 12px;
          background: var(--apr-dialog-bg);
          box-shadow: var(--apr-shadow);
          display: flex;
          flex-direction: column;
          gap: 2px;
          pointer-events: auto;
        }
        .queue-item-menu button {
          appearance: none;
          min-height: 34px;
          padding: 0 10px;
          border: 0;
          border-radius: 8px;
          background: transparent;
          color: var(--apr-text);
          text-align: left;
          cursor: pointer;
          font-family: var(--apr-font);
          font-size: 12px;
        }
        .queue-item-menu button:hover:not(:disabled), .queue-item-menu button:focus-visible:not(:disabled) { background: var(--apr-hover); outline: none; }
        .queue-item-menu button:disabled { opacity: .38; cursor: default; }
        .queue-item-menu .danger-text { color: #c6362e; }

        .comment-badge-layer {
          position: fixed;
          inset: 0;
          z-index: 2147483643;
          pointer-events: none;
          font-family: var(--apr-font);
        }
        .comment-aggregate-badge {
          position: fixed;
          min-height: 36px;
          padding: 0 13px;
          border: 1px solid var(--apr-panel-border);
          border-radius: 999px;
          background: color-mix(in srgb, var(--apr-dialog-bg) 98%, transparent);
          color: var(--apr-text);
          box-shadow: 0 2px 7px rgba(0, 0, 0, .06);
          display: inline-flex;
          align-items: center;
          gap: 7px;
          pointer-events: auto;
          cursor: pointer;
          font-family: var(--apr-font);
          font-size: 13px;
          line-height: 18px;
          font-weight: 620;
          white-space: nowrap;
        }
        .comment-aggregate-badge:hover, .comment-aggregate-badge:focus-visible { background: var(--apr-hover); outline: none; }
        .comment-aggregate-badge svg { width: 17px; height: 17px; fill: none; stroke: currentColor; stroke-width: 1.45; stroke-linecap: round; stroke-linejoin: round; }
        .comment-popover {
          position: fixed;
          z-index: 2147483647;
          width: min(430px, calc(100vw - 24px));
          max-height: min(540px, calc(100vh - 24px));
          overflow: hidden;
          border: 1px solid var(--apr-panel-border);
          border-radius: 18px;
          background: var(--apr-dialog-bg);
          color: var(--apr-text);
          box-shadow: 0 16px 44px rgba(0, 0, 0, .16), 0 2px 8px rgba(0, 0, 0, .07);
          font-family: var(--apr-font);
        }
        .comment-popover[data-mode="compose"] { border-radius: 24px; }
        .comment-popover[data-mode="compose"][data-multiline="true"] { border-radius: 16px; }
        .comment-popover[data-multiline="true"] .comment-compose-shell { padding: 10px 9px 10px 14px; align-items: flex-end; }
        .comment-popover-body { max-height: inherit; overflow-y: auto; }
        .comment-popover[data-mode="compose"] .comment-popover-body { overflow: visible; }
        .comment-compose-shell {
          min-height: 48px;
          padding: 6px 7px 6px 15px;
          display: flex;
          align-items: center;
          gap: 8px;
        }
        .comment-compose-input {
          appearance: none;
          min-width: 0;
          flex: 1 1 auto;
          min-height: 24px;
          max-height: 224px;
          box-sizing: border-box;
          padding: 1px 0;
          overflow-wrap: anywhere;
          overscroll-behavior: contain;
          border: 0;
          outline: 0;
          resize: none;
          background: transparent;
          color: var(--apr-text);
          font-family: var(--apr-font);
          font-size: 15px;
          line-height: 21px;
          font-weight: 550;
        }
        .comment-compose-input::placeholder { color: var(--apr-muted); }
        .comment-compose-shell:focus-within { box-shadow: inset 0 0 0 1px var(--apr-panel-border); }
        .queue-dock-icon:focus-visible, .comment-compose-send:focus-visible,
        .comment-aggregate-badge:focus-visible, .selection-action:focus-visible {
          outline:2px solid currentColor; outline-offset:2px;
        }
        .comment-compose-send {
          appearance: none;
          width: 34px;
          height: 34px;
          flex: 0 0 34px;
          padding: 0;
          border: 0;
          border-radius: 50%;
          background: #0d0d0d;
          color: #fff;
          display: grid;
          place-items: center;
          cursor: pointer;
        }
        :host([data-theme="dark"]) .comment-compose-send { background: #f4f4f4; color: #0d0d0d; }
        .comment-compose-send:hover, .comment-compose-send:focus-visible { opacity: .86; outline: none; }
        .comment-compose-send svg { width: 19px; height: 19px; display: block; stroke-width: 1.72; }
        .comment-thread-header {
          min-height: 48px;
          padding: 8px 9px 8px 15px;
          border-bottom: 1px solid var(--apr-panel-border);
          display: flex;
          align-items: center;
          justify-content: space-between;
        }
        .comment-thread-title { font-size: 14px; line-height: 20px; }
        .comment-thread-close, .comment-thread-delete {
          appearance: none;
          width: 32px;
          height: 32px;
          border: 0;
          border-radius: 9px;
          background: transparent;
          color: var(--apr-muted);
          display: grid;
          place-items: center;
          cursor: pointer;
        }
        .comment-thread-close:hover, .comment-thread-delete:hover { background: var(--apr-hover); color: var(--apr-text); }
        .comment-thread-close svg, .comment-thread-delete svg { width: 17px; height: 17px; fill: none; stroke: currentColor; stroke-width: 1.45; stroke-linecap: round; }
        .comment-thread-list { max-height: 380px; overflow-y: auto; padding: 8px; display: flex; flex-direction: column; gap: 8px; }
        .comment-thread-card {
          display: grid;
          grid-template-columns: minmax(0, 1fr) 32px;
          gap: 7px;
          padding: 9px;
          border: 1px solid var(--apr-panel-border);
          border-radius: 13px;
          background: var(--apr-input);
        }
        .comment-thread-quote {
          grid-column: 1 / -1;
          appearance: none;
          padding: 0;
          border: 0;
          background: transparent;
          color: var(--apr-muted);
          text-align: left;
          cursor: pointer;
          font-family: var(--apr-font);
          font-size: 11px;
          line-height: 16px;
          display: -webkit-box;
          -webkit-box-orient: vertical;
          -webkit-line-clamp: 2;
          overflow: hidden;
        }
        .comment-thread-note {
          appearance: none;
          min-width: 0;
          min-height: 48px;
          padding: 8px 9px;
          border: 1px solid var(--apr-panel-border);
          border-radius: 10px;
          resize: vertical;
          background: var(--apr-dialog-bg);
          color: var(--apr-text);
          font-family: var(--apr-font);
          font-size: 13px;
          line-height: 19px;
          outline: none;
        }
        .comment-thread-note:focus { border-color: color-mix(in srgb, var(--apr-text) 28%, transparent); }
        @media (max-width: 700px) {
          .queue-dock-direction span { display: none; }
          .queue-dock-direction { width: 32px; padding: 0; }
          .queue-dock-item { grid-template-columns: 22px minmax(0, 1fr) auto; padding-left: 8px; }
        }

        .settings-layer {
          --settings-gutter: clamp(18px, 5vw, 26px);
          position: fixed;
          z-index: 2147483647;
          inset: 0;
          display: grid;
          place-items: center;
          padding: clamp(10px, 3vw, 22px);
          font-family: var(--apr-font);
          color: var(--apr-text);
          pointer-events: auto;
        }
        .settings-backdrop { position: absolute; inset: 0; background: rgba(0, 0, 0, .36); }
        .settings-dialog {
          position: relative;
          width: min(610px, 100%);
          container-type: inline-size;
          max-height: min(760px, 100%);
          min-height: 0;
          overflow: hidden;
          display: flex;
          flex-direction: column;
          border-radius: 16px;
          background: var(--apr-dialog-bg);
          box-shadow: var(--apr-shadow);
        }
        .settings-header {
          flex: 0 0 auto;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          padding: 12px var(--settings-gutter);
          border-bottom: 1px solid var(--apr-panel-border);
        }
        .settings-title { margin: 0; font-size: 19px; line-height: 26px; font-weight: 650; letter-spacing: -.02em; }
        .settings-scroll {
          flex: 1 1 auto;
          min-height: 0;
          overflow-y: auto;
          overscroll-behavior: contain;
          padding: 19px var(--settings-gutter) 10px;
          scrollbar-width: thin;
        }
        .settings-section { margin: 0; padding: 0 0 14px; }
        .settings-section + .settings-section { padding-top: 18px; border-top: 1px solid var(--apr-panel-border); }
        .settings-dialog .section-title { margin: 0 0 4px; font-size: 15px; line-height: 22px; font-weight: 650; color: var(--apr-text); }
        .setting-row {
          min-height: 48px;
          padding: 8px 0;
          display: grid;
          grid-template-columns: minmax(0, 1fr) auto;
          align-items: start;
          gap: 3px 16px;
        }
        .setting-copy { min-width: 0; }
        .setting-name { display: block; font-size: 14px; line-height: 21px; font-weight: 570; }
        .setting-description {
          display: block;
          margin: 4px 0 0;
          color: var(--apr-muted);
          font-size: 12px;
          line-height: 1.55;
          overflow-wrap: anywhere;
        }
        .switch { position: relative; width: 38px; height: 22px; margin-top: 1px; }
        .switch input { position: absolute; opacity: 0; pointer-events: none; }
        .switch-track {
          position: absolute;
          inset: 0;
          border-radius: 999px;
          background: color-mix(in srgb, var(--apr-muted) 37%, transparent);
          transition: background 120ms ease;
          cursor: pointer;
        }
        .switch-track::after {
          content: "";
          position: absolute;
          top: 3px;
          left: 3px;
          width: 16px;
          height: 16px;
          border-radius: 50%;
          background: white;
          box-shadow: 0 1px 2px rgba(0,0,0,.22);
          transition: transform 130ms ease;
        }
        .switch input:checked + .switch-track { background: var(--apr-accent); }
        .switch input:checked + .switch-track::after { transform: translateX(16px); background: var(--apr-on-accent); }
        .switch input:focus-visible + .switch-track { outline: 2px solid var(--apr-focus); outline-offset: 2px; }
        .number-input, .select-input {
          min-height: 32px;
          min-width: 0;
          padding: 5px 9px;
          border: 1px solid var(--apr-panel-border);
          border-radius: 8px;
          background: var(--apr-input);
          color: var(--apr-text);
          font-size: 13px;
          line-height: 20px;
        }
        .number-input { width: 72px; text-align: right; font-variant-numeric: tabular-nums; }
        .select-input { width: min(184px, 34vw); max-width: 100%; }
        .settings-dialog :is(button, input, select, summary):focus-visible { outline: 2px solid var(--apr-focus); outline-offset: 2px; }
        .settings-status { margin-top: 8px; color: var(--apr-muted); font-size: 12px; line-height: 1.55; overflow-wrap: anywhere; }
        .settings-footer {
          flex: 0 0 auto;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 8px;
          padding: 12px var(--settings-gutter);
          border-top: 1px solid var(--apr-panel-border);
        }
        .footer-group { display: flex; gap: 7px; }
        .dialog-button {
          appearance: none;
          min-height: 34px;
          padding: 0 12px;
          border: 1px solid var(--apr-panel-border);
          border-radius: 999px;
          background: transparent;
          color: var(--apr-text);
          font-size: 13px;
          white-space: nowrap;
          cursor: pointer;
        }
        .dialog-button:hover, .dialog-button:focus-visible { background: var(--apr-hover); }
        .dialog-button.primary { border-color: var(--apr-accent); background: var(--apr-accent); color: var(--apr-on-accent); }
        .dialog-button.primary:hover { background: var(--apr-accent-hover); }
        .settings-footer > .dialog-button { padding-inline: 2px; border-color: transparent; color: var(--apr-muted); }
        :host([data-theme="dark"]) .settings-dialog { color-scheme: dark; }
        @container (max-width: 380px) {
          .setting-row:has(.select-input) { grid-template-columns: minmax(0, 1fr); }
          .setting-row .select-input { width: min(100%, 210px); margin-top: 4px; }
        }

        @media (prefers-reduced-motion: reduce) {
          .preview-panel, .rail-item::after, .toast, .chevron, .switch-track, .switch-track::after { transition: none !important; }
        }
      </style>
      <div class="navigator" hidden aria-label="对话大纲导航">
        <div class="preview-panel" role="navigation" aria-label="对话大纲">
          <div class="panel-header">
            <div class="panel-heading">
              <div class="panel-title">对话大纲</div>
              <div class="panel-subtitle">0 个会话事件</div>
            </div>
            <div class="zoom-actions"><button class="zoom-button" type="button" data-action="open-topics" aria-expanded="false" aria-controls="td-conversation-zoom" hidden>概览</button>
            <button class="icon-button" type="button" data-action="open-settings" aria-label="对话设置" title="设置">
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 15.25A3.25 3.25 0 1 0 12 8.75a3.25 3.25 0 0 0 0 6.5Z"/><path d="M19.4 13.5a7.8 7.8 0 0 0 .05-3l1.62-1.26-1.9-3.28-1.98.8a8.2 8.2 0 0 0-2.59-1.5L14.3 3h-3.8l-.3 2.26a8.2 8.2 0 0 0-2.59 1.5l-1.98-.8-1.9 3.28 1.62 1.26a7.8 7.8 0 0 0 .05 3l-1.67 1.3 1.9 3.28 2.04-.82a8.1 8.1 0 0 0 2.53 1.46l.3 2.28h3.8l.3-2.28a8.1 8.1 0 0 0 2.53-1.46l2.04.82 1.9-3.28-1.67-1.3Z"/></svg>
            </button></div>
          </div>
          <div class="preview-list"></div>
          <div class="td-outline-coverage" hidden><span role="status"></span><button type="button" class="dialog-button" data-action="load-outline-history">补齐更早消息</button></div>
        </div>
        <div class="compact-rail" role="navigation" aria-label="会话事件导航条"></div>
        <div class="toast" role="status" aria-live="polite"></div>
      </div>

      <section class="semantic-zoom" id="td-conversation-zoom" aria-label="对话主题" hidden>
        <div class="zoom-backdrop" aria-hidden="true"></div>
        <div class="zoom-top">
        <div class="zoom-toolbar">
          <div class="zoom-context"><strong>对话概览</strong><span class="zoom-coverage"></span></div>
          <div class="zoom-controls">
            <span class="zoom-ai-status" role="status" hidden></span>
            <button class="zoom-ai" data-action="generate-topics" type="button" hidden>重试</button>
            <button class="zoom-return" data-action="close-topics" type="button" aria-label="返回对话" title="返回对话（Esc）"><svg aria-hidden="true" viewBox="0 0 20 20"><path d="m5 5 10 10M15 5 5 15"/></svg></button>
          </div>
        </div>
          <p class="zoom-conversation-summary" aria-label="会话摘要" hidden></p>
          <nav class="zoom-topic-index" aria-label="跳转到主题" hidden></nav>
        </div>
        <div class="zoom-list" tabindex="0" aria-label="缩略对话"><div class="zoom-stream"></div></div>
      </section>
      <button class="selection-action" type="button" data-action="add-selection-comment" aria-label="添加批注" hidden>${threadDeckIcon('annotation')}<span>批注</span></button>

      <section class="queue-dock" hidden aria-label="排队提问">
        <div class="queue-dock-list" role="list" aria-label="可拖拽排序的排队问题"></div>
        <div class="queue-item-menu" hidden role="menu" aria-label="队列操作"></div>
      </section>

      <div class="comment-badge-layer" aria-live="polite"></div>
      <section class="comment-popover" hidden aria-label="回答批注">
        <div class="comment-popover-body"></div>
      </section>

      <div class="settings-layer" hidden>
        <div class="settings-backdrop" data-action="close-settings"></div>
        <form class="settings-dialog" role="dialog" aria-modal="true" aria-labelledby="td-settings-title">
          <div class="settings-header">
            <h2 class="settings-title" id="td-settings-title">对话设置</h2>
            <button class="icon-button" type="button" data-action="close-settings" aria-label="关闭设置">
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18"/></svg>
            </button>
          </div>
          <div class="settings-scroll">
            <section class="settings-section">
              <h3 class="section-title">右侧对话大纲</h3>
              <label class="setting-row">
                <span class="setting-copy"><span class="setting-name">启用对话工具</span><span class="setting-description">管理导航、批注和自动发送。关闭后保留数据。</span></span>
                <span class="switch"><input type="checkbox" name="enabled"><span class="switch-track"></span></span>
              </label>
              <label class="setting-row">
                <span class="setting-copy"><span class="setting-name">回答提纲</span><span class="setting-description">保留回答的标题层级与编号。没有标题时，使用一级列表。</span></span>
                <select class="select-input" name="answerOutlineMode">
                  <option value="off">关闭，只显示会话事件</option>
                  <option value="stable">完整章节目录（推荐）</option>
                </select>
              </label>
              <label class="setting-row">
                <span class="setting-copy"><span class="setting-name">隐藏 ChatGPT 原生导航</span><span class="setting-description">显示 Diao 大纲时，收起 ChatGPT 自带的右侧导航。</span></span>
                <span class="switch"><input type="checkbox" name="hideNativeChatGptRail"><span class="switch-track"></span></span>
              </label>
            </section>

            <section class="settings-section">
              <h3 class="section-title">批注与提问队列</h3>
              <label class="setting-row">
                <span class="setting-copy"><span class="setting-name">选中文字后添加批注</span><span class="setting-description">在选区工具条添加批注，随下一轮问题一起发送。</span></span>
                <span class="switch"><input type="checkbox" name="enableInlineComments"><span class="switch-track"></span></span>
              </label>
              <label class="setting-row">
                <span class="setting-copy"><span class="setting-name">启用安全提问队列</span><span class="setting-description">Enter 空闲时发送，忙碌时排队。Option 或 Shift + Enter 换行，Command 或 Ctrl + Enter 立即发送或调整方向。</span></span>
                <span class="switch"><input type="checkbox" name="enterQueuesWhileGenerating"><span class="switch-track"></span></span>
              </label>
              <label class="setting-row">
                <span class="setting-copy"><span class="setting-name">输入框上方显示排队条</span><span class="setting-description">在输入框上方编辑、删除或拖动待发送的问题。</span></span>
                <span class="switch"><input type="checkbox" name="showQueueDock"><span class="switch-track"></span></span>
              </label>
              <label class="setting-row">
                <span class="setting-copy"><span class="setting-name">空闲后自动发送下一条</span><span class="setting-description">每轮结束后发送队首。关闭时改为手动发送。</span></span>
                <span class="switch"><input type="checkbox" name="autoRunQueue"><span class="switch-track"></span></span>
              </label>
            </section>

            <section class="settings-section">
              <h3 class="section-title">跳转与本地数据</h3>
              <label class="setting-row">
                <span class="setting-copy"><span class="setting-name">对话区双指缩放</span><span class="setting-description">捏合看概览，张开返回。也可以从大纲打开「概览」。</span></span>
                <span class="switch"><input type="checkbox" name="pinchTopics"><span class="switch-track"></span></span>
              </label>
              <label class="setting-row">
                <span class="setting-copy"><span class="setting-name">概览摘要</span><span class="setting-description">提前准备会在前台会话空闲时，将已载入的问答和章节发送到已配置的 OpenAI。相同内容复用缓存。</span></span>
                <select name="topicSummaryMode"><option value="prepare">提前准备</option><option value="open">打开时生成</option><option value="off">只看原文与缓存</option></select>
              </label>
              <label class="setting-row">
                <span class="setting-copy"><span class="setting-name">点击回答段落跳转</span><span class="setting-description">点击章节定位原文。关闭后仍可跳转到提问和任务。</span></span>
                <span class="switch"><input type="checkbox" name="enableAnswerJump"><span class="switch-track"></span></span>
              </label>
              <label class="setting-row">
                <span class="setting-copy"><span class="setting-name">附近内容使用平滑滚动</span><span class="setting-description">附近章节平滑滚动，远距离直接定位。</span></span>
                <span class="switch"><input type="checkbox" name="smoothScroll"><span class="switch-track"></span></span>
              </label>
              <label class="setting-row">
                <span class="setting-copy"><span class="setting-name">记住已经读取的大纲</span><span class="setting-description">在浏览器本地保留已读取的提问、任务和章节。</span></span>
                <span class="switch"><input type="checkbox" name="rememberPrompts"><span class="switch-track"></span></span>
              </label>
            </section>

            <section class="settings-section">
              <h3 class="section-title">显示条件与位置</h3>
              <label class="setting-row">
                <span class="setting-copy"><span class="setting-name">会话事件达到多少条时显示导航</span><span class="setting-description">每次提问或任务运行计为一条。设为 1 时始终显示。</span></span>
                <input class="number-input" type="number" name="minPrompts" min="1" max="50" step="1">
              </label>
              <label class="setting-row">
                <span class="setting-copy"><span class="setting-name">距窗口右侧的距离</span><span class="setting-description">单位为像素。数值越大，导航越靠左。</span></span>
                <input class="number-input" type="number" name="rightOffset" min="0" max="120" step="1">
              </label>
              <label class="setting-row">
                <span class="setting-copy"><span class="setting-name">窗口窄于多少像素时隐藏导航</span><span class="setting-description">仅影响右侧导航。设为 0 时始终显示。</span></span>
                <input class="number-input" type="number" name="hideBelowWidth" min="0" max="2000" step="10">
              </label>
            </section>

            <section class="settings-section">
              <h3 class="section-title">运行范围</h3>
              <div class="setting-description">对话工具在 ChatGPT 会话页启用。</div>
              <div class="settings-status"></div>
            </section>
          </div>
          <div class="settings-footer">
            <button class="dialog-button" type="button" data-action="restore-defaults">恢复默认</button>
            <div class="footer-group">
              <button class="dialog-button" type="button" data-action="close-settings">取消</button>
              <button class="dialog-button primary" type="submit">保存设置</button>
            </div>
          </div>
        </form>
      </div>
    `;

    tdZoom.surface = shadowRoot.querySelector('.semantic-zoom');
    tdZoom.button = shadowRoot.querySelector('.zoom-button');
    tdZoom.backdrop = tdZoom.surface.querySelector('.zoom-backdrop');
    tdZoom.list = tdZoom.surface.querySelector('.zoom-list');
    tdZoom.stream = tdZoom.list.querySelector('.zoom-stream');
    tdZoom.list.addEventListener('scroll', tdZoomExtend, {passive:true});
    for (const query of ['(prefers-color-scheme: dark)', '(prefers-contrast: more)', '(forced-colors: active)']) {
      matchMedia(query).addEventListener('change', () => {
        if (tdZoom.scene) tdZoomReadTheme(tdZoom.scene);
      });
    }
    window.addEventListener('keydown', event => {
      if (event.key === 'Control') tdZoom.control = true;
      if (event.key === 'Escape' && tdZoom.scene && (!tdZoom.scene.pending || event.composedPath().includes(tdZoom.surface))) {
        event.preventDefault();
        tdZoomClose();
      }
    }, true);
    window.addEventListener('keyup', event => { if (event.key === 'Control') tdZoom.control = false; }, true);
    window.addEventListener('blur', () => { tdZoom.control = false; tdZoom.tail = null; });
    navigatorEl = shadowRoot.querySelector('.navigator');
    railEl = shadowRoot.querySelector('.compact-rail');
    listEl = shadowRoot.querySelector('.preview-list');
    globalThis.DiaoLocale?.apply(shadowRoot);
    toastEl = shadowRoot.querySelector('.toast');
    settingsLayerEl = shadowRoot.querySelector('.settings-layer');
    settingsFormEl = shadowRoot.querySelector('.settings-dialog');
    selectionActionEl = shadowRoot.querySelector('.selection-action');
    workflowLauncherEl = null;
    workflowPanelEl = null;
    workflowBodyEl = null;
    queueDockEl = shadowRoot.querySelector('.queue-dock');
    queueDockListEl = shadowRoot.querySelector('.queue-dock-list');
    queueMenuEl = shadowRoot.querySelector('.queue-item-menu');
    commentBadgeLayerEl = shadowRoot.querySelector('.comment-badge-layer');
    commentPopoverEl = shadowRoot.querySelector('.comment-popover');
    commentPopoverBodyEl = shadowRoot.querySelector('.comment-popover-body');
    renderWorkflowPanel();

    shadowRoot.addEventListener('click', (event) => {
      const target = event.target instanceof Element ? event.target : null;
      if (!target) return;
      const actionNode = target.closest('[data-action]');
      const action = actionNode instanceof HTMLElement ? actionNode.dataset.action || '' : '';
      if (action === 'topic-connection') {
        event.preventDefault();
        event.stopPropagation();
        void chrome.runtime.sendMessage({type:'threadWorkspace',action:'topicsConnection'}).catch(()=>{});
        return;
      }
      if (action === 'load-outline-history') {
        void tdOutlineLoadHistory(true);
        return;
      }
      if (action === 'recover-topics-history') {
        event.preventDefault(); event.stopPropagation();
        const scene = tdZoom.scene;
        if (scene) void tdZoomRecoverHistory(scene,true).catch(()=>tdZoomHistoryStalled(scene));
        return;
      }
      if (action === 'generate-topics') {
        event.preventDefault();
        event.stopPropagation();
        if (tdZoom.scene) void tdZoomLoadTopics(tdZoom.scene, true);
        return;
      }
      if (action === 'open-topics' || action === 'close-topics') {
        event.preventDefault(); event.stopPropagation();
        if (action === 'open-topics' && !tdZoomOpen()) {
          if (activeCommentMode) {
            closeInlineCommentPopover({discardEmptyNew:true});
            saveWorkflowState();
          }
          const scene = tdZoomShow(innerHeight*.42, true);
          if (scene) tdZoomAnimate(scene, 1);
        } else tdZoomClose();
        return;
      }
      if (action === 'open-settings') {
        event.preventDefault();
        event.stopPropagation();
        openSettingsDialog();
        return;
      }
      if (action === 'close-settings') {
        event.preventDefault();
        closeSettingsDialog();
        return;
      }
      if (action === 'restore-defaults') {
        event.preventDefault();
        renderSettingsForm(DEFAULT_SETTINGS);
        return;
      }
      if (action === 'comment-open-thread') {
        event.preventDefault();
        event.stopPropagation();
        openInlineCommentThread(ALL_COMMENTS_KEY, actionNode);
        return;
      }
      if (action === 'comment-popover-close') {
        event.preventDefault();
        event.stopPropagation();
        closeInlineCommentPopover({ discardEmptyNew: true });
        return;
      }
      if (action === 'comment-compose-save') {
        event.preventDefault();
        event.stopPropagation();
        saveActiveCommentComposer();
        return;
      }
      if (action === 'add-selection-comment') {
        event.preventDefault();
        event.stopPropagation();
        addPendingReviewComment();
        return;
      }
      if (action === 'remove-comment') {
        event.preventDefault();
        event.stopPropagation();
        const id = actionNode instanceof HTMLElement ? actionNode.dataset.commentId || '' : '';
        reviewComments = reviewComments.filter((comment) => comment.id !== id);
        updateReviewHighlights();
        scheduleWorkflowSave();
        syncInlineCommentBadges();
        if (activeCommentMode === 'thread') renderInlineCommentPopover();
        return;
      }
      if (action === 'clear-comments') {
        event.preventDefault();
        event.stopPropagation();
        reviewComments = [];
        clearReviewHighlights();
        tdStopReviewAnchorWatch();
        scheduleWorkflowSave();
        clearInlineCommentBadges();
        closeInlineCommentPopover();
        return;
      }
      if (action === 'jump-comment') {
        event.preventDefault();
        event.stopPropagation();
        const id = actionNode instanceof HTMLElement ? actionNode.dataset.commentId || '' : '';
        jumpToReviewComment(id);
        return;
      }

      if (action === 'queue-dock-interject') {
        event.preventDefault(); event.stopPropagation();
        void tdInterjectQueueItem(actionNode.dataset.queueId || '');
        return;
      }
      if (action === 'queue-dock-edit') {
        event.preventDefault();
        event.stopPropagation();
        const id = actionNode instanceof HTMLElement ? actionNode.dataset.queueId || '' : '';
        tdCloseQueueMenu();
        const textarea = queueDockEl?.querySelector(`[data-queue-text="${cssEscape(id)}"]`);
        if (textarea instanceof HTMLTextAreaElement && !textarea.disabled) {
          td.editingQueueId = id; queueLastEditAt = Date.now();
          textarea.focus({ preventScroll: true });
          textarea.setSelectionRange(textarea.value.length, textarea.value.length);
        }
        return;
      }
      if (action === 'queue-dock-more') {
        event.preventDefault();
        event.stopPropagation();
        const id = actionNode instanceof HTMLElement ? actionNode.dataset.queueId || '' : '';
        if (queueMenuOpenId === id) tdCloseQueueMenu();
        else { queueMenuOpenId = id; td.menuRenderKey = ''; renderQueueDockMenu(); tdSyncMoreButtons(); if (event.detail === 0) queueMenuEl?.querySelector('button:not(:disabled)')?.focus({preventScroll:true}); }
        return;
      }
      if (action === 'queue-dock-pause') {
        event.preventDefault();
        event.stopPropagation();
        tdOutbox.pauseOwner=''; queuePaused = !queuePaused;
        queueMenuOpenId = '';
        scheduleWorkflowSave();
        renderQueueDock();
        if (!queuePaused) processPromptQueue();
        return;
      }
      if (action === 'queue-dock-send-item') {
        event.preventDefault();
        event.stopPropagation();
        const id = actionNode instanceof HTMLElement ? actionNode.dataset.queueId || '' : '';
        const index = promptQueue.findIndex((item) => item.id === id);
        if (queueProcessing) return;
        if (index > 0) {
          const [item] = promptQueue.splice(index, 1);
          promptQueue.unshift(item);
        }
        queueMenuOpenId = '';
        scheduleWorkflowSave();
        renderQueueDock();
        if (getChatGptActivitySnapshot().busy) showToast('已设为下一条；当前回答完成后发送', 1700);
        else processPromptQueue({ force: true });
        return;
      }
      if (action === 'queue-dock-clear') {
        event.preventDefault();
        event.stopPropagation();
        queueMenuOpenId = '';
        clearQueuedPrompts();
        return;
      }
      if (action === 'queue-dock-remove') {
        event.preventDefault();
        event.stopPropagation();
        const id = actionNode instanceof HTMLElement ? actionNode.dataset.queueId || '' : '';
        removeQueuedPrompt(id);
        return;
      }
      if (action === 'queue-add') {
        event.preventDefault();
        event.stopPropagation();
        const draft = workflowBodyEl?.querySelector('[data-queue-draft]');
        const value = draft instanceof HTMLTextAreaElement ? draft.value : queueDraft;
        if (addPromptToQueue(value, { source: 'manual' })) {
          queueDraft = '';
          renderWorkflowPanel();
        }
        return;
      }
      if (action === 'queue-toggle-pause') {
        event.preventDefault();
        event.stopPropagation();
        tdOutbox.pauseOwner=''; queuePaused = !queuePaused;
        scheduleWorkflowSave();
        renderWorkflowPanel();
        if (!queuePaused) processPromptQueue();
        return;
      }
      if (action === 'queue-send-next') {
        event.preventDefault();
        event.stopPropagation();
        processPromptQueue({ force: true });
        return;
      }
      if (action === 'queue-clear') {
        event.preventDefault();
        event.stopPropagation();
        clearQueuedPrompts();
        return;
      }
      if (action === 'queue-remove') {
        event.preventDefault();
        event.stopPropagation();
        const id = actionNode instanceof HTMLElement ? actionNode.dataset.queueId || '' : '';
        removeQueuedPrompt(id);
        return;
      }
      if (action === 'queue-up' || action === 'queue-down') {
        event.preventDefault();
        event.stopPropagation();
        const id = actionNode instanceof HTMLElement ? actionNode.dataset.queueId || '' : '';
        moveQueuedPrompt(id, action === 'queue-up' ? -1 : 1);
        return;
      }
      if (action === 'toggle-answer') {
        event.preventDefault();
        event.stopPropagation();
        if (!(actionNode instanceof HTMLElement)) return;
        const promptIndex = Number.parseInt(actionNode.dataset.promptIndex, 10);
        const key = entries[promptIndex]?.key;
        if (!key) return;
        if (expandedPromptKeys.has(key)) expandedPromptKeys.delete(key);
        else expandedPromptKeys.add(key);
        renderEntries(true);
        return;
      }

      const answerButton = target.closest('[data-answer-key]');
      if (answerButton instanceof HTMLElement) {
        event.preventDefault();
        event.stopPropagation();
        const promptIndex = entries.findIndex((entry) => entry.key === answerButton.dataset.entryKey);
        const blockIndex = entries[promptIndex]?.answerBlocks?.filter(isAnswerOutlineBlock).findIndex((block) => block.key === answerButton.dataset.answerKey) ?? -1;
        if (Number.isFinite(promptIndex) && Number.isFinite(blockIndex)) navigateToAnswerBlock(promptIndex, blockIndex);
        return;
      }

      const button = target.closest('[data-entry-index]');
      if (!(button instanceof HTMLElement)) return;
      event.preventDefault();
      event.stopPropagation();
      const index = button.dataset.entryKey ? entries.findIndex((entry) => entry.key === button.dataset.entryKey) : Number.parseInt(button.dataset.entryIndex, 10);
      if (index >= 0 && Number.isFinite(index)) navigateToEntry(index);
    });

    shadowRoot.addEventListener('dragstart', (event) => {
      const dragEvent = /** @type {DragEvent} */ (event);
      const target = dragEvent.target instanceof Element ? dragEvent.target : null;
      const handle = target?.closest('[data-queue-drag-handle]');
      const row = handle?.closest('[data-queue-dock-item]');
      if (!(handle instanceof HTMLElement) || !(row instanceof HTMLElement) || queueProcessing || row.dataset.status === 'sending') {
        dragEvent.preventDefault();
        return;
      }
      queueDragId = row.dataset.queueDockItem || '';
      if (!queueDragId) {
        dragEvent.preventDefault();
        return;
      }
      row.dataset.dragging = 'true';
      if (dragEvent.dataTransfer) {
        dragEvent.dataTransfer.effectAllowed = 'move';
        dragEvent.dataTransfer.setData('text/plain', queueDragId);
      }
    });

    shadowRoot.addEventListener('dragover', (event) => {
      const dragEvent = /** @type {DragEvent} */ (event);
      if (!queueDragId) return;
      const target = dragEvent.target instanceof Element ? dragEvent.target : null;
      const row = target?.closest('[data-queue-dock-item]');
      if (!(row instanceof HTMLElement)) return;
      const targetId = row.dataset.queueDockItem || '';
      if (!targetId || targetId === queueDragId) return;
      dragEvent.preventDefault();
      if (dragEvent.dataTransfer) dragEvent.dataTransfer.dropEffect = 'move';
      clearQueueDockDropIndicators();
      queueDropId = targetId;
      const rect = row.getBoundingClientRect();
      queueDropAfter = dragEvent.clientY >= rect.top + rect.height / 2;
      row.dataset[queueDropAfter ? 'dropAfter' : 'dropBefore'] = 'true';
      const dragged = queueDockEl?.querySelector(`[data-queue-dock-item="${cssEscape(queueDragId)}"]`);
      if (dragged instanceof HTMLElement) dragged.dataset.dragging = 'true';
    });

    shadowRoot.addEventListener('drop', (event) => {
      const dragEvent = /** @type {DragEvent} */ (event);
      if (!queueDragId || !queueDropId) return;
      dragEvent.preventDefault();
      const dragId = queueDragId;
      const targetId = queueDropId;
      const after = queueDropAfter;
      clearQueueDockDropIndicators();
      queueDragId = '';
      reorderQueuedPrompt(dragId, targetId, after);
    });

    shadowRoot.addEventListener('dragend', () => {
      queueDragId = '';
      clearQueueDockDropIndicators();
    });

    shadowRoot.addEventListener('input', (event) => {
      const target = event.target;
      if (!(target instanceof HTMLTextAreaElement || target instanceof HTMLInputElement)) return;
      if (target.dataset.commentCompose) {
        const comment = reviewComments.find((item) => item.id === target.dataset.commentCompose);
        if (comment) {
          comment.note = target.value;
          scheduleWorkflowSave();
        }
        tdResizeCommentComposer(target);
        scheduleInlineCommentPosition();
        return;
      }
      if (target.dataset.commentNote) {
        const comment = reviewComments.find((item) => item.id === target.dataset.commentNote);
        if (comment) {
          comment.note = target.value;
          scheduleWorkflowSave();
        }
        return;
      }
      if (target.dataset.queueDraft) {
        queueDraft = target.value;
        queueLastEditAt = Date.now();
        return;
      }
      if (target.dataset.queueText) {
        queueLastEditAt = Date.now();
        const item = promptQueue.find((candidate) => candidate.id === target.dataset.queueText);
        if (item && !['sending', 'preparing', 'uncertain'].includes(item.status)) {
          item.text = target.value;
          item.status = 'waiting';
          item.error = '';
          scheduleWorkflowSave();
          resizeQueueDockTextarea(target);
          scheduleQueueDockPosition();
        }
      }
    });

    settingsFormEl.addEventListener('submit', (event) => {
      event.preventDefault();
      saveSettingsFromForm();
    });

    shadowRoot.addEventListener('keydown', (event) => {
      if (!(event instanceof KeyboardEvent)) return;
      if (event.key === 'Tab' && !settingsLayerEl.hidden) {
        const controls = [...settingsFormEl.querySelectorAll('button, input, select, summary')]
          .filter(control => !control.disabled && control.tabIndex >= 0 && control.getClientRects().length);
        const edge = event.shiftKey ? controls[0] : controls.at(-1);
        if (edge && shadowRoot.activeElement === edge) {
          event.preventDefault();
          (event.shiftKey ? controls.at(-1) : controls[0])?.focus();
        }
      }
      if (event.key === 'Escape') {
        if (!settingsLayerEl.hidden) { event.stopPropagation(); closeSettingsDialog(); }
        else if (activeCommentMode) closeInlineCommentPopover({ discardEmptyNew: true });
        return;
      }
      const keyboardTarget = event.target;
      if (event.key === 'Enter' && !event.isComposing && event.keyCode !== 229 &&
          keyboardTarget instanceof HTMLTextAreaElement && (event.altKey || event.shiftKey)) {
        event.preventDefault(); event.stopImmediatePropagation();
        tdInsertLineBreak(keyboardTarget);
        return;
      }
      if (keyboardTarget instanceof HTMLTextAreaElement && keyboardTarget.dataset.queueText && !event.isComposing && event.keyCode !== 229) {
        if ((event.key === 'Enter' && !event.shiftKey && !event.altKey) || event.key === 'Escape') {
          event.preventDefault(); event.stopPropagation(); td.editingQueueId = '';
          queueLastEditAt = Date.now(); keyboardTarget.blur(); saveWorkflowState(); tdWake(700); return;
        }
      }
      if (
        event.key === 'Enter' &&
        !event.isComposing &&
        event.keyCode !== 229 &&
        keyboardTarget instanceof HTMLTextAreaElement &&
        keyboardTarget.dataset.commentCompose
      ) {
        // Enter (including Cmd/Ctrl+Enter here) saves the annotation only.
        // Main-prompt steering shortcuts must never leak out of this editor.
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
        saveActiveCommentComposer();
        return;
      }
      const target = event.target;
      if (
        event.key === 'Enter' &&
        (event.metaKey || event.ctrlKey) &&
        target instanceof HTMLTextAreaElement &&
        target.dataset.queueDraft
      ) {
        event.preventDefault();
        const value = target.value;
        if (addPromptToQueue(value, { source: 'manual' })) {
          queueDraft = '';
          renderWorkflowPanel();
        }
      }
    });

    navigatorEl.addEventListener('pointerover', (event) => {
      const target = event.target instanceof Element ? event.target : null;
      const button = target?.closest('.rail-item[data-entry-index]');
      if (!(button instanceof HTMLElement)) return;
      const index = Number.parseInt(button.dataset.entryIndex, 10);
      const preview = listEl.querySelector(`.preview-item[data-entry-index="${index}"]`);
      preview?.scrollIntoView({ block: 'nearest' });
    });
  }

  function renderSettingsForm(value = settings) {
    ensureUi();
    const merged = mergeSettings(DEFAULT_SETTINGS, value);
    const setChecked = (name, checked) => {
      const input = settingsFormEl.elements.namedItem(name);
      if (input instanceof HTMLInputElement) input.checked = Boolean(checked);
    };
    const setValue = (name, inputValue) => {
      const input = settingsFormEl.elements.namedItem(name);
      if (input instanceof HTMLInputElement || input instanceof HTMLSelectElement) input.value = String(inputValue);
    };
    setChecked('enabled', merged.enabled);
    setValue('answerOutlineMode', merged.answerOutlineMode);
    setValue('navigationStyle', merged.navigationStyle || 'rail');
    setChecked('hideNativeChatGptRail', merged.hideNativeChatGptRail);
    setChecked('enableInlineComments', merged.enableInlineComments);
    setChecked('enterQueuesWhileGenerating', merged.enterQueuesWhileGenerating);
    setChecked('showQueueDock', merged.showQueueDock);
    setChecked('autoRunQueue', merged.autoRunQueue);
    setChecked('allowBackgroundQueue', merged.allowBackgroundQueue);
    setChecked('smoothScroll', merged.smoothScroll);
    setChecked('enableAnswerJump', merged.enableAnswerJump);
    setChecked('pinchTopics', merged.pinchTopics);
    setValue('topicSummaryMode', merged.autoTopicSummary ? merged.prepareTopicSummary ? 'prepare' : 'open' : 'off');
    setChecked('prefetchHistoryOnOutline', merged.prefetchHistoryOnOutline);
    setChecked('rememberPrompts', merged.rememberPrompts);
    setValue('minPrompts', merged.minPrompts);
    setValue('rightOffset', merged.rightOffset);
    setValue('hideBelowWidth', merged.hideBelowWidth);
    const status = settingsFormEl.querySelector('.settings-status');
    if (status) {
      const eventSummary = timelineSummaryText(entries, { separator: '、' });
      const pageLabel = isChatGptSharePage() ? `${site.label} 分享页` : site.label;
      const pageState = isCurrentPageEligible()
        ? `当前：${pageLabel} · ${eventSummary}`
        : `当前：${site.label} 首页或新建对话页 · 对话工具不会显示`;
      const workflowState = site.id === 'chatgpt' && isCurrentPageEligible() && !isChatGptSharePage()
        ? ` · ${reviewComments.length} 条批注、${promptQueue.length} 条排队提问`
        : '';
      status.textContent = `${pageState}${workflowState}。版本 ${APP_VERSION}`;
    }
  }

  let settingsReturnFocus = null;
  function openSettingsDialog() {
    ensureUi();
    if (!settingsLayerEl.hidden) return;
    settingsReturnFocus = shadowRoot.activeElement || document.activeElement;
    renderSettingsForm(settings);
    settingsLayerEl.hidden = false;
    const first = settingsFormEl.querySelector('[aria-label="关闭设置"]');
    first?.focus({preventScroll:true});
  }

  function closeSettingsDialog() {
    if (!settingsLayerEl || settingsLayerEl.hidden) return;
    settingsLayerEl.hidden = true;
    if (settingsReturnFocus?.isConnected) settingsReturnFocus.focus({preventScroll:true});
    settingsReturnFocus = null;
  }

  async function saveSettingsFromForm() {
    if (!settingsFormEl) return;
    const previousOutlineMode = settings.answerOutlineMode;
    const checked = (name) => Boolean(settingsFormEl.elements.namedItem(name)?.checked);
    const value = (name) => settingsFormEl.elements.namedItem(name)?.value;
    const sites = { chatgpt: true };
    const next = mergeSettings(DEFAULT_SETTINGS, {
      ...settings,
      enabled: checked('enabled'),
      answerOutlineMode: value('answerOutlineMode'),
      navigationStyle: value('navigationStyle') === 'minimap' ? 'minimap' : 'rail',
      hideNativeChatGptRail: checked('hideNativeChatGptRail'),
      enableInlineComments: checked('enableInlineComments'),
      enterQueuesWhileGenerating: checked('enterQueuesWhileGenerating'),
      showQueueDock: checked('showQueueDock'),
      autoRunQueue: checked('autoRunQueue'),
      allowBackgroundQueue: checked('allowBackgroundQueue'),
      smoothScroll: checked('smoothScroll'),
      enableAnswerJump: checked('enableAnswerJump'),
      pinchTopics: checked('pinchTopics'),
      autoTopicSummary: value('topicSummaryMode') !== 'off',
      prepareTopicSummary: value('topicSummaryMode') === 'prepare',
      prefetchHistoryOnOutline: checked('prefetchHistoryOnOutline'),
      rememberPrompts: checked('rememberPrompts'),
      minPrompts: value('minPrompts'),
      rightOffset: value('rightOffset'),
      hideBelowWidth: value('hideBelowWidth'),
      sites,
    });
    await storage.set(SETTINGS_KEY, next);
    if (!next.enabled && td.tx) tdInvalidate();
    settings = next;
    if (!next.enabled || (!next.enableAnswerJump && tdNavigation.current?.block)) tdNavCancel('setting-disabled');
    if (!next.enableAnswerJump) setActiveAnswerKey('');
    if (!next.prefetchHistoryOnOutline || !next.enabled) tdHistoryReset();
    td.ready = true;
    if (!next.enabled) { queuePaused = true; hideSelectionAction(); closeInlineCommentPopover(); restoreSuppressedNativeSelectionToolbar(); }
    saveWorkflowState();
    renderWorkflowPanel();
    if (!settings.rememberPrompts) cacheRecords = [];
    expandedPromptKeys = new Set([...expandedPromptKeys].filter((key) => entries.some((entry) => entry.key === key)));
    updateTheme();
    closeSettingsDialog();
    if (
      site.id === 'chatgpt' &&
      isCurrentPageEligible() &&
      previousOutlineMode !== settings.answerOutlineMode
    ) {
      await ensureChatGptConversationData({ force: true, reason: 'settings-outline-mode' });
    }
    await refreshNow('settings');
    showToast('设置已保存', 1100);
  }

  function detectTheme() {
    const explicitDark =
      document.documentElement.classList.contains('dark') ||
      document.body?.classList.contains('dark') ||
      document.documentElement.getAttribute('data-theme') === 'dark' ||
      document.body?.getAttribute('data-theme') === 'dark';
    if (explicitDark) return 'dark';

    const backgrounds = [document.body, document.documentElement]
      .filter(Boolean)
      .map((node) => getComputedStyle(node).backgroundColor)
      .filter((color) => color && color !== 'transparent' && color !== 'rgba(0, 0, 0, 0)');
    for (const color of backgrounds) {
      const match = color.match(/rgba?\((\d+)[, ]+(\d+)[, ]+(\d+)/i);
      if (!match) continue;
      const [red, green, blue] = match.slice(1, 4).map(Number);
      const luminance = (0.2126 * red + 0.7152 * green + 0.0722 * blue) / 255;
      return luminance < 0.45 ? 'dark' : 'light';
    }
    return matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }

  function updateTheme() {
    if(tdDeferInteraction('theme'))return;
    if (!navHost) return;
    navHost.dataset.theme = detectTheme();
    navHost.style.setProperty('--apr-right', `${settings.rightOffset}px`);
  }


  function timelineCounts(items = entries) {
    return {
      manualCount: (items || []).filter(isUserAnchoredEntry).length,
      automationCount: (items || []).filter(entry=>entry.kind==='automation-run').length,
      replyCount: (items || []).filter(entry=>entry.kind!=='automation-run' && entryAnchorRole(entry)==='assistant').length,
      blockCount: (items || []).reduce((sum, entry) => sum + (entry.answerBlocks || []).filter(isAnswerOutlineBlock).length, 0),
    };
  }

  function timelineSummaryText(items = entries, { separator = ' · ', includeAnswerOutline = true } = {}) {
    const {manualCount,automationCount,replyCount,blockCount} = timelineCounts(items);
    return [
      manualCount ? manualCount+' 个问题' : '',
      replyCount ? replyCount+' 条独立回复' : '',
      automationCount ? automationCount+' 次任务运行' : '',
      includeAnswerOutline && settings.answerOutlineMode !== 'off' && blockCount ? blockCount+' 个章节' : '',
    ].filter(Boolean).join(separator);
  }

  function tdRenderOutlineCoverage() {
    const coverage = shadowRoot?.querySelector('.td-outline-coverage');
    if (!coverage) return;
    const capture = tdHistory.capture;
    const history = capture && tdAlive(capture.scope) ? capture.history : null;
    coverage.hidden = !entries.length || tdHealth.snapshot?.complete === true || history?.complete === true;
    coverage.querySelector('span').textContent = tr(history?.running ? '正在补齐更早消息…' : '已载入的消息');
    const button = coverage.querySelector('button');
    button.hidden = site.id !== 'chatgpt';
    button.disabled = Boolean(history?.running);
  }

  function renderEntries(force = false) {
    ensureUi();
    updateTheme();

    const savedScroll = listEl?.scrollTop || 0;
    const searchTerm = td.search;
    const signature = entries.map((entry) => {
      const blocks = (entry.answerBlocks || []).filter(isAnswerOutlineBlock);
      const expanded = expandedPromptKeys.has(entry.key);
      const answerSignature = expanded || searchTerm
        ? hashString(blocks.map((block) => `${block.key}:${block.kind}:${block.label}:${block.marker}:${block.outlineDepth}`).join('|'))
        : blocks.length;
      return `${entry.key}:${entry.kind}:${hashString(entry.text)}:${automationEventMetaText(entry)}:${entry.source}:${expanded}:${answerSignature}`;
    }).join('|') + `::answers=${settings.answerOutlineMode}::jump=${settings.enableAnswerJump}::search=${searchTerm}::complete=${tdHealth.snapshot?.complete === true}`;
    if (!force && signature === renderSignature) {
      updateVisibility();
      return;
    }
    renderSignature = signature;
    tdInvalidateMinimapContent();

    const railFragment = document.createDocumentFragment();
    const listFragment = document.createDocumentFragment();
    entries.forEach((entry, index) => {
      const automationRun = entry.kind === 'automation-run';
      const reply = !automationRun && entryAnchorRole(entry)==='assistant';
      const fallbackLabel = reply ? '独立回复' : automationRun ? `任务运行 ${index + 1}` : `问题 ${index + 1}`;
      const label = truncateText(entry.text || fallbackLabel, 140);
      const eventMeta = automationRun ? automationEventMetaText(entry) : '';
      const blocks = settings.answerOutlineMode !== 'off' && Array.isArray(entry.answerBlocks) ? entry.answerBlocks.filter(isAnswerOutlineBlock) : [];
      const expanded = blocks.length > 0 && (expandedPromptKeys.has(entry.key) || Boolean(searchTerm));

      const railButton = document.createElement('button');
      railButton.type = 'button';
      railButton.className = 'rail-item';
      railButton.dataset.entryIndex = String(index);
      railButton.dataset.entryKey = entry.key;
      railButton.dataset.entryKind = automationRun ? 'automation-run' : 'prompt';
      railButton.dataset.active = String(index === activeIndex);
      railButton.setAttribute(
        'aria-label',
        (reply ? '回复 ' : automationRun ? '定时任务 ' : '提问 ')+label,
      );
      railFragment.appendChild(railButton);
      const matchesTurn = !searchTerm || [entry.text, eventMeta].join(' ').toLocaleLowerCase().includes(searchTerm);
      const visibleBlocks = matchesTurn ? blocks : blocks.filter(block =>
        [block.marker, block.label].join(' ').toLocaleLowerCase().includes(searchTerm));
      if (!matchesTurn && !visibleBlocks.length) return;

      const group = document.createElement('div');
      group.className = 'outline-group';
      group.dataset.promptKey = entry.key;
      group.dataset.entryKind = automationRun ? 'automation-run' : 'prompt';

      const row = document.createElement('div');
      row.className = 'question-row';
      row.dataset.promptRow = String(index);
      row.dataset.entryKind = automationRun ? 'automation-run' : 'prompt';
      row.dataset.active = String(index === activeIndex);

      const previewButton = document.createElement('button');
      previewButton.type = 'button';
      previewButton.className = 'preview-item';
      previewButton.dataset.entryIndex = String(index);
      previewButton.dataset.entryKey = entry.key;
      previewButton.dataset.entryKind = automationRun ? 'automation-run' : 'prompt';
      previewButton.dataset.active = String(index === activeIndex);
      previewButton.dataset.source = entry.source;
      previewButton.title = [entry.text, eventMeta].filter(Boolean).join('\n');

      if (automationRun) {
        const icon = document.createElement('span');
        icon.className = 'event-icon';
        icon.innerHTML = threadDeckIcon('clock');
        const copy = document.createElement('span');
        copy.className = 'preview-copy';
        const text = document.createElement('span');
        text.className = 'preview-text';
        text.textContent = label;
        copy.appendChild(text);
        if (eventMeta) {
          const meta = document.createElement('span');
          meta.className = 'event-meta';
          meta.textContent = eventMeta;
          copy.appendChild(meta);
        }
        previewButton.append(icon, copy);
      } else {
        const text = document.createElement('span');
        text.className = 'preview-text';
        text.textContent = label;
        previewButton.appendChild(text);
      }
      row.appendChild(previewButton);

      if (blocks.length) {
        const toggle = document.createElement('button');
        toggle.type = 'button';
        toggle.className = 'answer-toggle';
        toggle.dataset.action = 'toggle-answer';
        toggle.dataset.promptIndex = String(index);
        toggle.setAttribute('aria-expanded', String(expanded));
        toggle.setAttribute('aria-label', `${expanded ? '折叠' : '展开'}该会话事件回答的 ${blocks.length} 个提纲项`);
        toggle.title = `${expanded ? '折叠' : '展开'}回答提纲`;
        const count = document.createElement('span');
        count.className = 'answer-count';
        count.textContent = String(blocks.length);
        toggle.append(count);
        toggle.insertAdjacentHTML('beforeend', threadDeckIcon('chevron', 'chevron'));
        row.appendChild(toggle);
      }
      group.appendChild(row);

      if (expanded) {
        const answerList = document.createElement('div');
        answerList.className = 'answer-list';
        answerList.setAttribute('role', settings.enableAnswerJump ? 'group' : 'list');
        answerList.setAttribute('aria-label', '回答章节');
        visibleBlocks.forEach(block => {
          const blockIndex = blocks.indexOf(block);
          const navigable = isNavigableAnswerBlock(block);
          const answerItem = document.createElement(navigable ? 'button' : 'div');
          if (answerItem instanceof HTMLButtonElement) answerItem.type = 'button';
          answerItem.className = 'answer-item';
          answerItem.dataset.promptIndex = String(index);
          answerItem.dataset.entryKey = entry.key;
          answerItem.dataset.blockIndex = String(blockIndex);
          if (navigable) {
            answerItem.dataset.answerKey = block.key || `${entry.key}:${blockIndex}`;
            answerItem.dataset.active = String(Boolean(activeAnswerKey) && activeAnswerKey === answerItem.dataset.answerKey);
            if (answerItem.dataset.active === 'true') answerItem.setAttribute('aria-current','location');
            answerItem.title = `跳转到：${block.label || block.text}`;
            answerItem.setAttribute('aria-label', `跳转到回答章节：${block.marker || ''} ${block.label || block.text}`);
          } else {
            answerItem.dataset.static = 'true';
            answerItem.setAttribute('role', 'listitem');
            answerItem.title = block.matchText || block.label;
          }
          const answerText = document.createElement('span');
          answerText.className = 'answer-text';
          answerText.textContent = block.label || block.text || tr('回答章节 {0}',blockIndex+1);
          const marker = document.createElement('span');
          marker.className = 'td-marker'; marker.textContent = block.marker || '';
          marker.setAttribute('aria-hidden', 'true');
          marker.hidden = !block.marker;
          answerItem.dataset.depth = String(block.outlineDepth || 0);
          answerItem.dataset.outlineKind = block.kind;
          answerItem.style.setProperty('--td-outline-depth', String(Math.min(5, block.outlineDepth || 0)));
          answerItem.append(marker, answerText);
          answerList.appendChild(answerItem);
        });
        group.appendChild(answerList);
      }
      listFragment.appendChild(group);
    });

    tdHistory.ignoreScrollUntil = Date.now() + 160;
    tdReconcileOutlineChildren(railEl, railFragment, 'data-entry-key');
    tdReconcileOutlineChildren(listEl, listFragment, 'data-prompt-key');
    if (!listEl.childElementCount && searchTerm) { const empty = document.createElement('div'); empty.className = 'empty-outline'; empty.textContent = tr('没有匹配内容'); listEl.appendChild(empty); }
    listEl.scrollTop = savedScroll;
    tdHistory.lastScroll = listEl.scrollTop;
    const hasAutomationRuns = entries.some(isAutomationTimelineEntry);
    const title = shadowRoot.querySelector('.panel-title');
    if (title) title.textContent = tr(hasAutomationRuns ? '会话时间线' : '对话大纲');
    const previewPanel = shadowRoot.querySelector('.preview-panel');
    const navigator = shadowRoot.querySelector('.navigator');
    const navigationLabel = hasAutomationRuns ? '会话时间线' : '对话大纲';
    previewPanel?.setAttribute('aria-label', navigationLabel);
    navigator?.setAttribute('aria-label', `${navigationLabel}导航`);
    const subtitle = shadowRoot.querySelector('.panel-subtitle');
    if (subtitle) subtitle.textContent = timelineSummaryText(entries);
    tdRenderOutlineCoverage();
    updateVisibility();
    if (!searchTerm && reasonForAutoScroll()) scrollActiveControlsIntoView(false);
  }

  function updateVisibility() {
    if(tdDeferInteraction('visibility'))return;
    tdSyncSemanticZoom();
    if (navigatorEl) {
      tdSafeTask('navigation-style',tdUpdateMinimapVisibility);
      tdRecoveryStatus();
      const visible =
        isCurrentPageEligible() &&
        settings.enabled &&
        settings.sites[site.id] !== false &&
        (entries.length >= settings.minPrompts || entries.length === 0) &&
        (settings.hideBelowWidth === 0 || window.innerWidth >= settings.hideBelowWidth);
      navigatorEl.hidden = !visible;
      if (visible && entries.length) hideNativeChatGptRailIfNeeded();
      else restoreNativeChatGptRail();
    }
    updateWorkflowVisibility();
  }

  function ensureNativeTocSuppressionStyle() {
    if (nativeTocSuppressionStyleEl?.isConnected) return;
    nativeTocSuppressionStyleEl = document.getElementById('threaddeck-native-toc-suppression');
    if (nativeTocSuppressionStyleEl instanceof HTMLStyleElement) return;
    const style = document.createElement('style');
    style.id = 'threaddeck-native-toc-suppression';
    style.textContent = `
      html[data-threaddeck-hide-native-toc="true"] [data-toc-item-index],
      html[data-threaddeck-hide-native-toc="true"] [data-threaddeck-native-toc-group="true"],
      html[data-threaddeck-hide-native-toc="true"] [data-testid="conversation-turn-navigation"],
      html[data-threaddeck-hide-native-toc="true"] [data-testid*="conversation-toc" i],
      html[data-threaddeck-hide-native-toc="true"] [data-testid*="prompt-navigation" i],
      html[data-threaddeck-hide-native-toc="true"] [data-testid*="turn-navigation" i],
      html[data-threaddeck-hide-native-toc="true"] [data-testid*="toc-item" i] {
        opacity: 0 !important;
        visibility: hidden !important;
        pointer-events: none !important;
      }
    `;
    (document.head || document.documentElement).appendChild(style);
    nativeTocSuppressionStyleEl = style;
  }

  function markNativeTocGroup(group) {
    if (!(group instanceof HTMLElement) || !group.isConnected || group === navHost || group.closest('#threaddeck-host')) return;
    group.dataset.threaddeckNativeTocGroup = 'true';
    nativeTocMarkedGroups.add(group);
  }

  function markNativeTocSuppressionCandidates() {
    if(tdDeferInteraction('markNativeTocSuppressionCandidates'))return;
    if (document.documentElement?.getAttribute('data-threaddeck-hide-native-toc') !== 'true') return;
    for (const old of nativeTocMarkedGroups) if (!old.isConnected) nativeTocMarkedGroups.delete(old);
    // Explicit navigation identifiers only. Scanning every DIV and guessing from
    // its geometry caused layout thrash and risked hiding unrelated application UI.
    for (const candidate of safeQueryAll(document, '[data-testid="conversation-turn-navigation"],[data-testid*="conversation-toc" i],[data-testid*="prompt-navigation" i],[data-testid*="turn-navigation" i]')) markNativeTocGroup(candidate);
    for (const node of safeQueryAll(document, '[data-toc-item-index]')) {
      if (!(node instanceof HTMLElement) || node.closest('#threaddeck-host,main [data-message-author-role]')) continue;
      // Individual controls are hidden by CSS even when no container is safe to hide.
      const parent = node.parentElement;
      if (parent && safeQueryAll(parent, '[data-toc-item-index]').length >= 2 && parent.getBoundingClientRect().width <= 240) markNativeTocGroup(parent);
    }
    if (nativeTocGroup?.isConnected) markNativeTocGroup(nativeTocGroup);
  }

  function scheduleNativeTocSuppressionScan() {
    if (nativeTocSuppressionRaf !== null) return;
    nativeTocSuppressionRaf = requestAnimationFrame(() => {
      nativeTocSuppressionRaf = null;
      markNativeTocSuppressionCandidates();
    });
  }

  function ensureNativeTocSuppressionObserver() {
    if (nativeTocSuppressionObserver || !document.documentElement) return;
    nativeTocSuppressionObserver = new MutationObserver((records) => {
      if(tdDeferInteraction('native-toc-observer'))return;
      if (records.some((m) => m.type === 'childList' || m.attributeName === 'data-toc-item-index' || m.attributeName === 'data-testid')) scheduleNativeTocSuppressionScan();
    });
    nativeTocSuppressionObserver.observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ['data-toc-item-index','data-testid'] });
  }

  function hideNativeChatGptRailIfNeeded() {
    if (!settings.enabled || navigatorEl?.hidden || !settings.hideNativeChatGptRail || !isCurrentPageEligible()) { restoreNativeChatGptRail(); return; }
    ensureNativeTocSuppressionStyle();
    document.documentElement.setAttribute('data-threaddeck-hide-native-toc', 'true');
    scheduleNativeTocSuppressionScan(); ensureNativeTocSuppressionObserver();
  }

  function restoreNativeChatGptRail() {
    document.documentElement?.removeAttribute('data-threaddeck-hide-native-toc');
    nativeTocSuppressionObserver?.disconnect();
    nativeTocSuppressionObserver = null;
    if (nativeTocSuppressionRaf !== null) cancelAnimationFrame(nativeTocSuppressionRaf);
    nativeTocSuppressionRaf = null;
    for (const group of new Set([
      ...nativeTocMarkedGroups,
      ...safeQueryAll(document, '[data-threaddeck-native-toc-group="true"]'),
    ])) {
      if (group instanceof HTMLElement && group.isConnected) group.removeAttribute('data-threaddeck-native-toc-group');
    }
    nativeTocMarkedGroups.clear();
    if (nativeTocOriginalStyle?.group) {
      const { group, opacity, pointerEvents } = nativeTocOriginalStyle;
      if (group.isConnected) {
        if (opacity) group.style.opacity = opacity;
        else group.style.removeProperty('opacity');
        if (pointerEvents) group.style.pointerEvents = pointerEvents;
        else group.style.removeProperty('pointer-events');
      }
    }
    nativeTocOriginalStyle = null;
  }

  function setActiveIndex(index, userInitiated = false) {
    if (!Number.isFinite(index) || index < 0 || index >= entries.length) return;
    const changed = activeIndex !== index;
    if (!changed && !userInitiated) return;
    activeIndex = index;
    if (changed && !userInitiated) setActiveAnswerKey('');

    if (!shadowRoot) return;
    shadowRoot.querySelectorAll('[data-entry-index]').forEach((button) => {
      button.dataset.active = String(Number.parseInt(button.dataset.entryIndex, 10) === activeIndex);
    });
    shadowRoot.querySelectorAll('[data-prompt-row]').forEach((row) => {
      row.dataset.active = String(Number.parseInt(row.dataset.promptRow, 10) === activeIndex);
    });
    scrollActiveControlsIntoView(userInitiated);
  }

  function scrollActiveControlsIntoView(userInitiated) {
    if (activeIndex < 0 || !shadowRoot) return;
    const railButton = railEl?.querySelector(`[data-entry-index="${activeIndex}"]`);
    const previewButton = listEl?.querySelector(`[data-entry-index="${activeIndex}"]`);
    railButton?.scrollIntoView({ block: 'nearest' });
    if (userInitiated || !tdHistoryPanelOpen()) {
      tdHistory.ignoreScrollUntil = Date.now() + 160;
      previewButton?.scrollIntoView({ block: 'nearest' });
      tdHistory.lastScroll = listEl?.scrollTop || 0;
    }
  }

  function computeActiveIndex() {
    if (site.id === 'chatgpt') {
      const root = currentScrollRoot || findScrollRoot();
      const focusTop = desiredViewportTop(root) + 6;
      const candidates = entries
        .map((entry, index) => ({
          index,
          target: entry.skeletonTarget?.isConnected ? entry.skeletonTarget : entry.target,
        }))
        .filter((item) => item.target instanceof Element && item.target.isConnected);
      if (candidates.length) {
        let low = 0;
        let high = candidates.length - 1;
        let chosen = 0;
        while (low <= high) {
          const middle = Math.floor((low + high) / 2);
          const top = candidates[middle].target.getBoundingClientRect().top;
          if (top <= focusTop) {
            chosen = middle;
            low = middle + 1;
          } else {
            high = middle - 1;
          }
        }
        return candidates[chosen].index;
      }
    }

    const nativeIndex = entries.findIndex((entry) => entry.nativeActive);
    if (nativeIndex >= 0) return nativeIndex;

    const viewportMounted = pickViewportMountedEntry(mountedEntries);
    const mountedIndex = findRecordIndexForMounted(entries, viewportMounted);
    if (mountedIndex >= 0) return mountedIndex;

    if (entries.length) {
      const ratio = getScrollMetrics().ratio;
      return Math.min(entries.length - 1, Math.max(0, Math.round(ratio * (entries.length - 1))));
    }
    return -1;
  }

  function updateActiveFromScroll() {
    if(tdDeferInteraction('updateActiveFromScroll'))return;
    if (tdNavigation.current && tdNavAlive(tdNavigation.current)) {
      const i = entries.findIndex((entry) => entry.key === tdNavigation.current.entryKey);
      if (i >= 0) setActiveIndex(i, false);
      return;
    }
    const next = computeActiveIndex();
    if (next >= 0) setActiveIndex(next);
  }

  function onScroll() {
    if(tdDeferInteraction('onScroll'))return;
    if (scrollRaf) return;
    scrollRaf = requestAnimationFrame(() => {
      scrollRaf = null;
      if(tdDeferInteraction('scroll-frame'))return;
      updateActiveFromScroll();
      tdScheduleMinimap();
    });
  }

  function showToast(message, duration = 0) {
    ensureUi();
    toastEl.textContent = tr(message);
    toastEl.dataset.visible = 'true';
    window.clearTimeout(toastTimer);
    if (duration > 0) {
      toastTimer = window.setTimeout(() => {
        toastEl.dataset.visible = 'false';
      }, duration);
    }
  }

  function scheduleRefresh(reason = 'mutation', delay = SCAN_DEBOUNCE_MS) {
    // Coalesce instead of resetting a debounce on every streaming token forever.
    if (refreshTimer !== null) return;
    const urgent=/^(?:initial|route|menu|recovery|settings|navigation|explicit)/.test(reason);
    if(!urgent)delay=Math.max(delay,500-(performance.now()-(tdInteraction.lastRefreshAt||0)));
    const scope = tdScope();
    refreshTimer = window.setTimeout(() => {
      refreshTimer = null;
      if (tdAlive(scope)) void refreshNow(reason);
    }, delay);
  }

  async function refreshNow(reason = 'manual') {
    if(tdSelectionBusy()){tdSelection.deferred=true;return;}
    if(tdZoomMoving()){tdZoom.scene.deferredRefresh=true;return;}
    tdInteraction.lastRefreshAt=performance.now();
    tdDomState.revision++;
    if (tdSendingCritical()) { scheduleRefresh('post-send-refresh', 180); return; }
    if (destroyed || getRouteKey() !== routeKey) return;
    if (!settings.enabled) { updateVisibility(); restoreNativeChatGptRail(); return; }
    const scope=tdScope();
    cacheRecords=tdOwnedIndex(cacheRecords);chatGptApiRecords=tdOwnedIndex(chatGptApiRecords);
    const previousEntries=tdOwnedIndex(entries);
    try {
    const previousActiveKey = entries[activeIndex]?.key || '';
    const stats = createScanStats();

    if (!isCurrentPageEligible()) {
      restoreNativeChatGptRail();
      chatGptSkeleton = null;
      entries = [];
      mountedEntries = [];
      mountedByKey.clear();
      activeIndex = -1;
      activeAnswerKey = '';
      stats.source = 'ineligible-page';
      stats.route = routeKey;
      lastScanStats = stats;
      renderEntries(true);
      return;
    }

    const scanResult = site.customScanner === 'doubao' ? scanDoubao() : scanBySelectors(site);
    mountedEntries = scanResult.entries;
    mountedByKey = new Map(mountedEntries.map((entry) => [entry.key, entry]));
    stats.mountedCount = mountedEntries.length;
    stats.selectorHits = scanResult.selectorHits;

    if (site.nativeToc) {
      const cachedApiRecords = cacheRecords.filter((record) => (
        record.source === 'conversation-api' &&
        record.timelineSchema === TIMELINE_CACHE_SCHEMA &&
        record.answerOutlineSchema === ANSWER_OUTLINE_CACHE_SCHEMA
      ));
      const skeletonSource = chatGptApiRecords.length ? chatGptApiRecords : cachedApiRecords;
      chatGptSkeleton = scanChatGptSkeleton(skeletonSource);
      stats.skeletonCount = chatGptSkeleton?.realTurns?.length || 0;

      const native = scanChatGptNative(mountedEntries);
      const nativeEntries = native?.entries || [];
      if (native?.group) nativeTocGroup = native.group;
      stats.nativeCount = nativeEntries.length;
      stats.apiCount = chatGptApiRecords.length;
      stats.apiStatus = chatGptApiStatus;
      stats.apiError = chatGptApiError;

      const authoritativeBase = chatGptApiRecords.length ? chatGptApiRecords : cachedApiRecords;
      tdLiveDetectPendingShells(authoritativeBase, chatGptSkeleton);
      const authoritativeRecords = authoritativeBase.length ? tdLiveIndex(authoritativeBase, mountedEntries) : authoritativeBase;
      if (authoritativeRecords.length) {
        entries = mergeChatGptIndexWithRuntime(authoritativeRecords, mountedEntries, nativeEntries);
        stats.source = (chatGptApiRecords.length ? 'conversation-api' : 'conversation-api-cache') + (stats.skeletonCount ? '+skeleton' : '') + (stats.mountedCount ? '+dom' : '');
        if (settings.rememberPrompts && chatGptApiRecords.length) {
          cacheRecords = entries.map(buildCacheRecord).slice(-MAX_CACHE_ITEMS);
          scheduleCacheWrite();
        }
      } else if (chatGptSkeleton?.userTurns?.length) {
        attachGenericAnswerBlocks(mountedEntries, scanAssistantAnchors(site));
        entries = buildEntriesFromChatGptSkeleton(chatGptSkeleton, mountedEntries);
        stats.source = 'chatgpt-skeleton';
        if (settings.rememberPrompts) {
          cacheRecords = entries.map(buildCacheRecord).slice(-MAX_CACHE_ITEMS);
          scheduleCacheWrite();
        }
      } else if (nativeEntries.length) {
        attachGenericAnswerBlocks(nativeEntries, scanAssistantAnchors(site));
        entries = nativeEntries;
        stats.source = 'native-toc';
        if (settings.rememberPrompts) {
          cacheRecords = entries.map(buildCacheRecord).slice(-MAX_CACHE_ITEMS);
          scheduleCacheWrite();
        }
      } else {
        attachGenericAnswerBlocks(mountedEntries, scanAssistantAnchors(site));
        entries = mergeMountedWithCache(mountedEntries);
        stats.source = settings.rememberPrompts ? 'dom+cache' : 'dom';
      }
    } else {
      attachGenericAnswerBlocks(mountedEntries, scanAssistantAnchors(site));
      entries = mergeMountedWithCache(mountedEntries);
      stats.source = settings.rememberPrompts ? 'dom+cache' : 'dom';
    }

    const nextScrollRoot = findScrollRoot();
    if (site.id === 'chatgpt') entries = tdOutlineMergeHistory(entries,nextScrollRoot);
    entries=tdStampIndex(entries);
    enforceAnswerOutlines(entries);
    tdLiveApplyAnswers(entries);
    if (settings.rememberPrompts) {
      const nativeComplete = site.id==='chatgpt' && tdHistory.capture?.history.complete === true;
      cacheRecords = entries.filter(entry=>nativeComplete || entry.source!=='native-history')
        .map(entry=>buildCacheRecord(entry.source==='native-history' ? {...entry,source:'history-cache'} : entry)).slice(-MAX_CACHE_ITEMS);
      scheduleCacheWrite();
    }
    stats.answerBlockCount = entries.reduce((sum, entry) => sum + normalizeAnswerOutlineBlocks(entry.answerBlocks).length, 0);
    stats.cachedCount = entries.filter((entry) => !entry.target?.isConnected).length;
    attachScrollRoot(nextScrollRoot);
    stats.scrollRoot = describeElement(nextScrollRoot);
    stats.route = routeKey;
    lastScanStats = stats;

    expandedPromptKeys = new Set([...expandedPromptKeys].filter((key) => entries.some((entry) => entry.key === key)));
    const preservedIndex = previousActiveKey ? entries.findIndex((entry) => entry.key === previousActiveKey) : -1;
    activeIndex = preservedIndex >= 0 ? preservedIndex : computeActiveIndex();
    renderEntries(reason === 'route' || reason === 'settings' || reason === 'chatgpt-api-initial-ready');
    updateActiveFromScroll();
    syncInlineCommentBadges();
    if (reviewComments.length) tdScheduleReviewRestore(90);

    if (site.id === 'chatgpt') {
      if (chatGptApiStatus === 'idle') ensureChatGptConversationData({ reason: 'refresh' });

    }
      tdRememberGoodIndex();
    } catch(error) {
      tdHealthFault('refresh',error);
      if(tdAlive(scope))tdRestoreIndexAfterDomFailure(previousEntries);
    } finally {
      tdSafeTask('index-status-render',()=>{
      tdRecoveryStatus();updateVisibility();
      if (site.id==='chatgpt' && !tdZoom.scene) tdOutlineReadSavedOrder();
      if (navigatorEl?.dataset.pinned==='true' && settings.prefetchHistoryOnOutline)
        void tdOutlineLoadHistory();
      const scene=tdZoom.scene;
      if (scene?.progress>=.999 && scene.topicState==='working') void tdZoomLoadTopics(scene);
    });
      // Reaching the data request must not depend on any DOM adapter succeeding.
      if(settings.enabled&&isCurrentPageEligible()&&getRouteKey()===routeKey&&chatGptApiStatus==='idle'&&!chatGptApiFetchPromise)
        void ensureChatGptConversationData({reason:'independent-index'});
    }
  }

  function describeElement(element) {
    if (!element) return '';
    if (element === document.scrollingElement) return 'document.scrollingElement';
    const tag = element.tagName?.toLowerCase() || 'node';
    const id = element.id ? `#${element.id}` : '';
    const classes = element.classList?.length ? `.${Array.from(element.classList).slice(0, 3).join('.')}` : '';
    return `${tag}${id}${classes}`;
  }

  function observePage() {
    bodyObserver?.disconnect();
    const threadSelector = '[data-conversation-role],[data-user-message-bubble],[data-chatgpt-selection-message-id],[data-chatgpt-search-message-ids],[data-turn-key],[data-thread-find-target],[data-message-role],[data-role="assistant"],[data-role="user"],[data-author-role],[data-message-id],[data-node-id],[data-item-id],[data-message-author-role],[data-testid^="conversation-turn-"],[data-turn],[data-turn-id-container],#thread,main';
    bodyObserver = new MutationObserver((mutations) => {
      if(tdDeferInteraction('page-observer'))return;
      tdInteraction.fullMutationPasses++;
      tdDomObserveDiscovery(mutations);
      let threadChanged = false, activityChanged = false, completionChanged = false;
      for (const mutation of mutations) {
        const node = mutation.target instanceof Element ? mutation.target : mutation.target.parentElement;
        if (!node || node.closest('#threaddeck-host,#prompt-rail-host,[data-threaddeck-native-comment],nav,aside')) continue;
        let related = Boolean(node.closest(threadSelector));
        if (mutation.type === 'childList' && !related) {
          related = [...mutation.addedNodes, ...mutation.removedNodes].some(child => child instanceof Element &&
            (child.matches(threadSelector) || child.querySelector(threadSelector)));
        }
        if (related && !isInsideComposer(node)) threadChanged = true;
        if (mutation.type === 'attributes' && ['data-status','data-state','aria-busy','data-talvt-turn-state'].includes(mutation.attributeName) && related) completionChanged = true;
        if (mutation.type !== 'attributes' || mutation.attributeName !== 'class' || related) activityChanged = true;
      }
      if (activityChanged) { td.activityDirty = true; if (promptQueue.length || td.run) tdWake(90); }
      if (threadChanged) {
        tdDomState.revision++;
        tdLive.lastMutationAt = Date.now();
        scheduleRefresh('live-mutation', TD_LIVE_DOM_REFRESH_MS);
        tdLiveSettle(); tdLiveWatch();
      }
      if (completionChanged) scheduleRefresh('live-status', 120);
    });
    tdDomObserveRoots(bodyObserver, { childList: true, subtree: true, characterData: true,
      attributes: true, attributeFilter: ['id','aria-busy','data-status','data-state','data-turn-id','data-message-id',
        'data-turn','data-message-author-role','data-message-role','data-author-role','data-role','data-node-id','data-item-id','data-channel','hidden','aria-hidden','class','data-conversation-role','data-chatgpt-selection-message-id','data-user-message-bubble','data-chatgpt-selection-conversation-id','data-conversation-id','data-turn-status','data-turn-key','data-chatgpt-search-message-ids','data-chatgpt-search-unit-key','data-chatgpt-conversation-selection-target','data-talvt-turn-state','data-markdown-text-style','data-selected-text-overlay-target'] });
    themeObserver?.disconnect();
    themeObserver = new MutationObserver(updateTheme);
    themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['class','data-theme'] });
    if (document.body) themeObserver.observe(document.body, { attributes: true, attributeFilter: ['class','data-theme'] });
  }

  async function handleRouteChange() {
    const nextKey = getRouteKey();
    if (nextKey === routeKey) { routeHref = location.href; return; }
    tdRouteRetireDom();
    tdNavCancel('route-change');
    tdInvalidate();
    const epoch = td.epoch;
    navigationToken += 1; userNavigationEpoch += 1;
    restoreNativeChatGptRail(); nativeTocObserver?.disconnect(); nativeTocObserver = null;
    nativeTocGroup = null; nativeHoverSignature = '';
    window.clearTimeout(chatGptApiRefreshTimer); chatGptApiRefreshTimer = null;
    window.clearTimeout(cacheWriteTimer); cacheWriteTimer = null;
    window.clearTimeout(refreshTimer); refreshTimer = null;
    routeKey = nextKey; routeHref = location.href;
    cacheRecords = []; entries = []; mountedEntries = []; mountedByKey.clear(); chatGptSkeleton = null;
    expandedPromptKeys.clear(); activeAnswerKey = ''; activeIndex = -1; renderSignature = '';
    if (navigatorEl) navigatorEl.hidden = true;
    listEl?.replaceChildren(); railEl?.replaceChildren(); tdHealth.lastGood=null;
    tdDomScopes.census=null;tdDomScopes.revision++;tdAdaptive.at=-Infinity;
    tdReads.pending.length=0;tdReads.seen.clear();tdReads.graph=null;tdReads.snap=null;
    clearTimeout(tdReads.timer);tdReads.timer=null;
    tdReceiptBindings.clear();
    resetChatGptApiState(); resetWorkflowState();
    if (!isCurrentPageEligible()) { renderEntries(true); td.ready = true; return; }
    await loadCache();
    if (epoch !== td.epoch || nextKey !== getRouteKey()) return;
    loadWorkflowState(); td.ready = true;
    // 站内切换时宿主可能先收到响应，此时按新会话身份重新接收已观察的快照。
    tdRequestLoadedHistory();
    void ensureChatGptConversationData({ reason: 'route' });
    scheduleRefresh('route', 180);
    const scope = tdScope();
    window.setTimeout(() => { if (tdAlive(scope)) scheduleRefresh('route-late', 0); }, 700);
  }

  function startRouteWatcher() {
    const check = () => { if (getRouteKey() !== routeKey) void handleRouteChange(); else routeHref = location.href; };
    window.addEventListener('popstate', check);
    window.addEventListener('hashchange', check);
    try {
      const page = window;
      if (!page.__THREADDECK_HISTORY_V11__) {
        page.__THREADDECK_HISTORY_V11__ = true;
        for (const name of ['pushState','replaceState']) {
          const native = page.history[name];
          page.history[name] = function (...args) {
            // Roll back only a not-yet-sent, script-owned edit before the router
            // changes URL/editor ownership. Never clear arbitrary drafts on /.
            try {
              const next = args[2] != null ? new URL(String(args[2]), location.href) : null;
              if (next && next.pathname !== location.pathname) {
                if (td.tx && !td.tx.clicked) tdRollbackPreparedEditor(td.tx);
                else if (tdEditor.active) tdEditorRollback(tdEditor.active);
              }
            } catch { /* Router semantics remain untouched. */ }
            const result = Reflect.apply(native, this, args); check(); return result;
          };
        }
      }
    } catch { tdLog('history-wrapper-unavailable'); }
    window.clearInterval(routeTimer);
    routeTimer = window.setInterval(check, 400);
  }

  function installNavigationInterruptionListeners() {
    const insideThreadDeck = (event) => {
      const path = typeof event.composedPath === 'function' ? event.composedPath() : [];
      return path.includes(navHost) || path.includes(navigatorEl) || path.includes(settingsLayerEl);
    };
    const cancel = (event) => {
      if (!event.isTrusted || insideThreadDeck(event)) return;
      tdHistoryReset();
      tdNavCancel('user-interrupted');
      navigationToken += 1;
      userNavigationEpoch += 1;
      if (toastEl) toastEl.dataset.visible = 'false';
    };
    document.addEventListener('wheel', cancel, { capture: true, passive: true });
    document.addEventListener('touchstart', cancel, { capture: true, passive: true });
    document.addEventListener('pointerdown', cancel, { capture: true, passive: true });
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && tdNavigation.current) tdNavCancel('escape');
      if (insideThreadDeck(event)) return;
      if (['PageUp', 'PageDown', 'Home', 'End', 'ArrowUp', 'ArrowDown', ' '].includes(event.key)) cancel(event);
    }, true);
  }

  async function reloadSettings() {
    await loadSettings();
    if (!settings.rememberPrompts) cacheRecords = [];
    else await loadCache();
    updateTheme();
    updateWorkflowVisibility();
    renderWorkflowPanel();
    tdZoomPrepare();
    scheduleRefresh('settings', 0);
  }

  function installExtensionMessaging() {
    if (!EXTENSION_ENV) return;
    chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
      if (_sender.id !== chrome.runtime.id || !message || typeof message.type !== 'string') return undefined;
      if(message.type==='THREAD_PILOT_CHAT_BACKOFF'){
        tdChatBackoff(message.until);
        return undefined;
      }
      if(message.type==='THREAD_PILOT_PREFERENCES'){
        if(pilotActive)void reloadSettings();
        return false;
      }
      if(message.type==='THREAD_PILOT_SWITCH'){
        if(!message.enabled){document.dispatchEvent(new Event('tab-cadence:history-stop'));tdInvalidate();pilotActive=false;settings.enabled=false;updateVisibility();updateWorkflowVisibility();}
        else{pilotActive=true;void reloadSettings().then(tdRequestLoadedHistory);}
        sendResponse({active:pilotActive});return false;
      }
      if (message.type === 'PROMPT_RAIL_GET_STATUS') {
        sendResponse(getStatus());
        return false;
      }
      if (message.type === 'PROMPT_RAIL_RESCAN') {
        refreshNow('popup-rescan').then(() => sendResponse(getStatus()));
        return true;
      }
      if (message.type === 'PROMPT_RAIL_CLEAR_CURRENT_CACHE') {
        clearCurrentCache().then(() => sendResponse(getStatus()));
        return true;
      }
      if (message.type === 'PROMPT_RAIL_CLEAR_ALL_CACHES') {
        clearAllCaches().then(() => sendResponse(getStatus()));
        return true;
      }
      return undefined;
    });

    chrome.storage.onChanged.addListener((changes, areaName) => {
      if (areaName === 'local' && changes.threadWorkspacePreferences && pilotActive) reloadSettings();
    });
  }

  function getStatus() {
    const manualPromptCount = entries.filter(isUserAnchoredEntry).length;
    const automationRunCount = entries.filter(isAutomationTimelineEntry).length;
    return {
      version: APP_VERSION,
      siteId: site.id,
      siteLabel: site.label,
      routeKey,
      eligible: isCurrentPageEligible(),
      eventCount: entries.length,
      promptCount: manualPromptCount,
      automationRunCount,
      answerBlockCount: entries.reduce((sum, entry) => sum + (entry.answerBlocks || []).filter(isAnswerOutlineBlock).length, 0),
      activeIndex,
      activeAnswerKey,
      workflow: {
        comments: reviewComments.length,
        queued: promptQueue.length,
        queuePaused,
        queueProcessing,
        generating: isChatGptGenerating(),
        activity: getChatGptActivitySnapshot(),
      },
      chatGptApi: {
        conversationId: chatGptConversationId,
        conversationKind: chatGptConversationKind,
        status: chatGptApiStatus,
        count: chatGptApiRecords.length,
        skeletonCount: chatGptSkeleton?.realTurns?.length || 0,
        error: chatGptApiError,
        fetchedAt: chatGptApiFetchedAt,
      },
      enabled: settings.enabled && settings.sites[site.id] !== false,
      settings,
      stats: lastScanStats,
      entries: entries.slice(0, 30).map((entry, index) => ({
        index: index + 1,
        key: entry.key,
        source: entry.source,
        kind: entry.kind || 'prompt',
        anchorRole: entryAnchorRole(entry),
        text: truncateText(entry.text, 100),
        answerBlocks: (entry.answerBlocks || []).filter(isAnswerOutlineBlock).length,
        mounted: Boolean(entry.target?.isConnected),
        skeletonMounted: Boolean(entry.skeletonTarget?.isConnected),
      })),
    };
  }


  function tdInstallSupportSection() {
    if(!settingsFormEl||settingsFormEl.querySelector('.td-support'))return;
    const group=document.createElement('details');group.className='settings-section td-support';
    const summary=document.createElement('summary');summary.className='section-title';summary.textContent='诊断与恢复';group.append(summary);
    const info=document.createElement('p');info.className='setting-description';info.textContent='在本机重新核对发送状态、刷新大纲，或复制待恢复的草稿。';group.append(info);
    const grid=document.createElement('div');grid.className='td-support-actions';group.append(grid);
    const add=(label,fn)=>{const b=document.createElement('button');b.type='button';b.className='dialog-button';b.textContent=label;b.addEventListener('click',fn);grid.append(b);};
    add('重新核对状态',()=>{tdReconcileUncertain();td.activityDirty=true;getChatGptActivitySnapshot();tdScheduleTurnCheck(0,true);showToast('正在核对，不会重复发送',1600);});
    add('刷新本地大纲',()=>{void tdRecoverIndex();});
    add('复制诊断',tdCopyDiagnostic);
    add('选取正文诊断',()=>{closeSettingsDialog();tdPickBodyDiagnostic();});
    add('复制未发送备份',tdCopyRecoveryBackup);
    const recover=document.createElement('div');recover.className='td-recovery-items';group.append(recover);
    settingsFormEl.querySelector('.settings-scroll').append(group);
    group.addEventListener('toggle',()=>{if(group.open)tdRenderRecoveryRows();});
    const style=document.createElement('style');style.textContent='.td-support>summary{cursor:pointer;list-style-position:inside;margin:0}.td-support[open]>summary{margin-bottom:12px}.td-support-actions{display:flex;flex-wrap:wrap;gap:8px;margin-top:10px}.td-recovery-row{padding:10px 0;border-top:1px solid var(--apr-panel-border);margin-top:10px}.td-recovery-row p{font-size:12px;color:var(--apr-muted)}.td-recovery-row button{margin:4px 6px 0 0}';shadowRoot.append(style);
    // Consolidate rare controls instead of growing the footer on every release.
    const diagnostic=[...settingsFormEl.querySelectorAll('.settings-footer>button')].find(b=>b.textContent==='复制诊断');
    if(diagnostic)diagnostic.remove();
  }
  function tdOpenSupport() {
    openSettingsDialog();tdInstallSupportSection();
    const group=settingsFormEl?.querySelector('.td-support');if(!group)return;
    group.open=true;tdRenderRecoveryRows();
    requestAnimationFrame(()=>group.scrollIntoView({block:'nearest',behavior:'auto'}));
  }
  function tdRenderRecoveryRows() {
    const rows=settingsFormEl?.querySelector('.td-recovery-items');if(!rows)return;rows.replaceChildren();
    for(const item of promptQueue.filter(q=>q.status==='uncertain'||q.status==='failed')) {
      const row=document.createElement('div');row.className='td-recovery-row';
      const title=document.createElement('p');title.textContent=`${truncateText(item.text,70)} · ${item.status==='uncertain'?'提交结果待核对':'尚未发送'}`;row.append(title);
      for(const [label,action] of item.status==='uncertain'?[['已在会话中，移出本地记录','td-acknowledge'],['确认未发送，允许重试','td-retry']]:[['重试此条','td-retry']]) {
        const b=document.createElement('button');b.type='button';b.className='dialog-button';b.textContent=label;b.dataset.action=action;b.dataset.queueId=item.id;row.append(b);
      }
      rows.append(row);
    }
  }
  async function tdCopyRecoveryBackup() {
    const composer=getChatGptComposer();let data=composer?tdEditor.blocked.get(composer):null;
    if(!data)try{const raw=JSON.parse(workspaceSession.getItem(`prompt-rail:editor-recovery:${hashString(routeKey)}`)||'null');if(raw?.route===routeKey)data={expected:raw.before,value:raw.merged};}catch{}
    if(!data){showToast('当前会话没有需要恢复的合并备份',2000);return;}
    try{await navigator.clipboard.writeText(data.value||data.expected);showToast('已复制备份，未修改输入框',2000);}catch{showToast('剪贴板不可用，备份仍保留',2200);}
  }
  async function tdRefreshOutline() {
 await refreshNow('menu-rescan');if(isCurrentPageEligible())await ensureChatGptConversationData({reason:'local-menu'});
 showToast('已刷新本地大纲，没有追加远端请求',1800);
}

  function installUserscriptMenu() {
    
  }

  async function waitForDocumentElementReady() {
    if (document.documentElement) return;
    await new Promise((resolve) => {
      const done = () => {
        observer.disconnect();
        resolve();
      };
      const observer = new MutationObserver(() => {
        if (document.documentElement) done();
      });
      try {
        observer.observe(document, { childList: true, subtree: true });
      } catch {
        document.addEventListener('DOMContentLoaded', done, { once: true });
      }
      if (document.documentElement) done();
    });
  }

  function retirePreviousContext() {
    if (chrome.runtime?.id) return;
    document.removeEventListener(retireEvent,retirePreviousContext);
    destroyed = true;
    pilotActive = false;
    settings.enabled = false;
    window.clearInterval(routeTimer);
    tdNavCancel('extension-updated');
    tdZoomFinish();
    td.controller.abort();
    navHost?.remove();
    restoreNativeChatGptRail();
  }
  document.addEventListener(retireEvent,retirePreviousContext);

  async function initialize() {
    tdInstallSelectionGesture();
    installPendingCommentSubmissionBridge();
    await tdBootStep('diagnostic-watch',tdInstallDiagnosticWatch);
    await tdBootStep('history-bridge',tdInstallHistoryBridge);
    tdListenHistory();
    await tdBootStep('send-gateway',installPendingCommentSubmissionBridge);
    await tdBootStep('activity-observer',installChatGptActivityMonitor);
    pilotActive = (await pilotRpc('status')).enabled;
    await workspaceSession.load();
    await tdBootStep('settings',loadSettings);
    await tdBootStep('document',waitForDocumentElementReady);
    await tdBootStep('cache',async()=>{if(isCurrentPageEligible())await loadCache();else cacheRecords=[];});
    resetChatGptApiState();
    await tdBootStep('ui-shell',ensureUi);
    await tdBootStep('menu',installUserscriptMenu);
    await tdBootStep('workflow-restore',loadWorkflowState);
    td.ready=true;
    if(settings.enabled)tdRequestLoadedHistory();
    else document.dispatchEvent(new Event('tab-cadence:history-stop'));
    // Adopt an existing host response. Initialization adds no request.
    if(settings.enabled&&isCurrentPageEligible())void ensureChatGptConversationData({reason:'initial'});
    await tdBootStep('interface',tdInstallInterface);
    await tdBootStep('history-ui',tdInstallHistoryUi);
    await tdBootStep('support-ui',tdInstallSupportSection);
    await tdBootStep('initial-activity',getChatGptActivitySnapshot);
    await tdBootStep('page-observer',observePage);
    await tdBootStep('extension-messages',installExtensionMessaging);
    await tdBootStep('navigation-events',installNavigationInterruptionListeners);
    await tdBootStep('annotation-hit-test',tdInstallReviewHitTesting);
    await tdBootStep('selection-events',installReviewSelectionListeners);
    await tdBootStep('queue-watcher',startQueueWatcher);
    await tdBootStep('route-watcher',startRouteWatcher);
    window.addEventListener('resize', () => {
      updateVisibility();
      scheduleQueueDockPosition();
      scheduleInlineCommentPosition();
      tdScheduleMinimap(true);
    }, { passive: true });
    window.addEventListener('scroll', () => {
      scheduleQueueDockPosition();
      scheduleInlineCommentPosition();
    }, { passive: true, capture: true });
    window.addEventListener('pagehide', () => { tdNavCancel('pagehide'); tdInvalidate(); }, { capture: true });
    document.addEventListener('load', event => {
      if (event.target instanceof HTMLImageElement && elementBelongsToConversationTurn(event.target)) td.activityDirty=true;
    }, true);
    window.addEventListener('pageshow', (event) => { if (event.persisted) { loadWorkflowState(); td.ready = true; td.activityDirty = true; } });
    await refreshNow('initial');
    tdHealth.complete=true;tdHealth.stage='ready';tdLog('boot-ready');
    if (isCurrentPageEligible()) {
      window.setTimeout(() => scheduleRefresh('initial-late', 0), 520);
      window.setTimeout(() => scheduleRefresh('initial-later', 0), 1250);
      window.setTimeout(() => { if(settings.enabled&&isCurrentPageEligible()&&!entries.length&&!chatGptApiFetchPromise&&chatGptApiStatus==='idle')void tdRecoverIndex(); }, 4000);
    }
  }

  initialize().catch((error) => {
    tdHealth.stage='initialization-failed';tdHealthFault('initialization',error);
    tdSafeTask('emergency-menu',installUserscriptMenu);tdSafeTask('emergency-ui',()=>{ensureUi();updateVisibility();});
    if(settings.enabled&&isCurrentPageEligible())void ensureChatGptConversationData({reason:'emergency-index'});
    console.error('[ThreadDeck] initialization failed', error);
  });
})();

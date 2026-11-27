// 在独立 Chromium 中载入实际扩展，用合成页面验证原位流程。
const {chromium} = require(process.env.TABPILOT_PLAYWRIGHT_PATH || 'playwright');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const {createHash} = require('node:crypto');
const assert = require('node:assert/strict');

const root = fs.realpathSync(path.resolve(__dirname, '..'));
const id = createHash('sha256').update(root).digest('hex').slice(0,12);
const cache = path.join(os.homedir(), 'Library', 'Caches', 'CodexBuilds.noindex',
  `TabPilot-${id}`, 'node-chromium', 'Debug');
fs.mkdirSync(cache,{recursive:true});
const base = fs.mkdtempSync(path.join(cache, 'local-journey-'));
const copy = path.join(base, 'extension');
const profile = path.join(base, 'profile');
const otherProfile = path.join(base, 'other-profile');
const lock = path.join(base, 'run.lock');
fs.writeFileSync(lock, String(process.pid), {flag:'wx'});
const manifestPath = path.join(base, 'manifest.json');
const manifestRecord = {
  source:root, toolchain:'Playwright Chromium', purpose:'合成网页与对话原位流程',
  createdAt:new Date().toISOString(), status:'running',
  reproduce:'node tests/local-journey.cjs'
};
const record = (status) => fs.writeFileSync(manifestPath,
  JSON.stringify({...manifestRecord, status, endedAt:status==='running'?undefined:new Date().toISOString()},null,2));
record('running');
console.log(base);
const checks=[], errors=[], requests=[];
const note=(what)=>{checks.push(what);console.log(what);};
const wait=async (predicate,label,ms=6000)=>{
 const stop=Date.now()+ms;
 while(Date.now()<stop){if(await predicate())return;await new Promise(r=>setTimeout(r,50));}
 throw Error(label);
};
fs.mkdirSync(copy,{recursive:true});
for(const name of ['manifest.json','worker.mjs','panel.mjs','ui.css','sidepanel.html','sensor.js','watch-prompt.js','thread-history.js','threaddeck.js','locale.js','_locales','core','icons'])fs.cpSync(path.join(root,'extension',name),path.join(copy,name),{recursive:true});
const manifest=JSON.parse(fs.readFileSync(path.join(copy,'manifest.json')));
manifest.host_permissions=['https://chatgpt.com/*','https://watch.fixture.invalid/*','https://read.fixture.invalid/*','https://api.openai.com/*'];
// 合成流程使用固定文案。英语资源在独立的未改包验收中检查。
manifest.default_locale='zh_CN';
fs.rmSync(path.join(copy,'_locales','en'),{recursive:true});
fs.writeFileSync(path.join(copy,'manifest.json'),JSON.stringify(manifest));
// 测试副本用受控菜单事件启动实际处理器。发布源码不包含测试入口。
fs.appendFileSync(path.join(copy,'worker.mjs'),'\nglobalThis.fixtureMenu=handleTabMenu;globalThis.fixtureSmart=(windowId,tabId)=>organizeSmartTabs(windowId,tabId);');
const watchPage='<title>合成构建任务</title><main style="margin:56px;font:18px system-ui"><h1>构建任务</h1><p id="state">正在执行</p></main>';
const legacyChatPage='<!doctype html><meta charset="utf-8"><title>合成对话</title><style>body{font:16px system-ui;margin:0;background:#fbfbfa;color:#1e2521}main{width:min(690px,75vw);margin:48px auto}article{padding:18px 0}form{position:fixed;bottom:32px;left:50%;transform:translateX(-50%);width:min(660px,72vw);padding:14px;border:1px solid #ccc;border-radius:15px;background:white}textarea{width:85%;height:45px;vertical-align:middle;font:inherit}button{padding:8px}h2{font-size:19px}</style>'+
 '<main id="thread" data-conversation-id="fixture01"><article data-testid="conversation-turn-1" data-turn="user"><div data-message-id="user-0001" data-message-author-role="user"><div class="whitespace-pre-wrap">这个项目怎么设计？</div></div></article>'+
 '<article data-testid="conversation-turn-2" data-turn="assistant"><div data-message-id="answer-0001" data-message-author-role="assistant" data-status="streaming"><div class="markdown"><h2>第一步 · 明确问题</h2><p id="quote">保留现有快捷键与本地草稿。</p><h2>第二步 · 确认边界</h2><p>在合成对话里检查续发顺序。</p></div></div></article></main>'+
 '<form><textarea id="prompt-textarea" aria-label="消息"></textarea><button type="button" data-testid="stop-button" aria-label="停止生成">停止</button><button type="submit" data-testid="send-button" aria-label="发送" hidden>发送</button></form>';
// 当前 ChatGPT 用搜索单元标记角色、独立会话所有者及组合轮次终态。
const modern = process.env.TABPILOT_CHAT_LAYOUT === 'modern';
const localOwner = 'local-chatgpt:12345678-1234-1234-1234-1234567890ab';
const modernStart = `<main id="thread" data-thread-find-target="conversation" data-chatgpt-conversation-selection-target="${localOwner}">
 <div data-turn-key="turn-fixture-0"><div data-talvt-turn-state="streaming">
  <div data-chatgpt-search-unit-key="fallback-turn-0:1:user" data-chatgpt-search-message-ids="user-0001"><div data-user-message-bubble class="whitespace-pre-wrap">这个项目怎么设计？</div></div>
  <div data-chatgpt-search-unit-key="fallback-turn-0:2:assistant" data-chatgpt-search-message-ids="answer-0001 answer-0001">
   <div data-chatgpt-selection-conversation-id="${localOwner}" data-chatgpt-selection-message-id="answer-0001">
    <div data-markdown-text-style="assistant-message" data-selected-text-overlay-target="fixture">
     <h2>第一步 · 明确问题</h2><p id="quote">保留现有快捷键与本地草稿。</p><h2>第二步 · 确认边界</h2><p>在合成对话里检查续发顺序。</p>
    </div>
   </div>
  </div>
 </div></div>
</main>`;
const chatPage = modern ? legacyChatPage.replace(/<main id="thread".*?<\/main>/,modernStart) : legacyChatPage;
const historyId='historyfixture';
const historyEndpoint='/backend-api/conversation/'+historyId;
let historyParent='history-root';
const history={conversation_id:historyId,mapping:{[historyParent]:{parent:null}}};
for(let index=1;index<=12;index++){
  for(const [role,text] of [
    ['user','合成历史提问 '+index+' 的约束是什么？'],
    ['assistant','## 适用条件 '+index+'\n\n首段是背景。中段给出依据和处置步骤。\n\n## 后续结论 '+index+'\n\n最终建议按轻重缓急执行。'],
  ]){
    const id='history-'+role+'-'+index;
    history.mapping[id]={parent:historyParent,message:{
      id,author:{role},recipient:null,channel:role==='assistant'?'final':undefined,
      content:{content_type:'text',parts:[text]},status:'finished_successfully',end_turn:role==='assistant',
    }};
    historyParent=id;
  }
}
history.current_node=historyParent;
history.mapping['history-assistant-2'].message.content.parts[0] =
  '## 首段证据\n\n' + '这是用于检查完整输入的合成段落。'.repeat(165) +
  '\n\n## 中段要点\n\n中段保留标记。' + '这段填充文字将关键结论放在长回答的不同位置。'.repeat(165) +
  '\n\n## 尾段限制\n\n尾段限制标记。';
function historyPagePayload(part) {
  const bounds = {head:[0,3], middle:[4,6], tail:[7,12]};
  const [first,last] = bounds[part];
  const mapping = Object.fromEntries(Object.entries(history.mapping).filter(([id]) => {
    const index = Number(id.split('-').at(-1)) || 0;
    return index >= first && index <= last;
  }));
  return {conversation_id:historyId,current_node:'history-assistant-'+last,mapping,has_more_before:first>0};
}
const historyPage=legacyChatPage
  .replaceAll('fixture01',historyId).replaceAll('user-0001','history-user-12').replaceAll('answer-0001','history-assistant-12')
  .replace('这个项目怎么设计？','合成历史提问 12 的约束是什么？')
  .replace('第一步 · 明确问题','适用条件 12').replace('第二步 · 确认边界','后续结论 12')
  .replace('data-status="streaming"','data-status="completed"')
  .replace('data-testid="stop-button"','hidden data-testid="stop-button"')
  .replace('aria-label="发送" hidden','aria-label="发送"')
  .concat('<script>document.addEventListener("tab-cadence:history", e => window.fixtureHistorySize=e.detail?.text?.length || 0);fetch('+JSON.stringify(historyEndpoint)+').then(response=>response.json()).catch(()=>{});</script>');

const viewportId='nativeviewportfixture';
const viewportAnswer=(number,text)=>`<div data-chatgpt-search-unit-key="turn-native-${number}:assistant" data-chatgpt-search-message-ids="native-answer-${number}"><div data-chatgpt-selection-message-id="native-answer-${number}"><div data-markdown-text-style="assistant-message" data-selected-text-overlay-target="fixture"><h2 id="fixture-native-heading-${number}">重复章节标题</h2><p>${text}</p></div></div></div>`;
const viewportTurn=(number,question,answer)=>`<div data-virtualized-turn data-turn-key="native-turn-${number}"><div data-talvt-turn-state="complete"><button class="fixture-task-label">不应成为大纲的任务标题</button><h4 class="sr-only">ChatGPT 说：</h4>${question ? `<div data-chatgpt-search-unit-key="turn-native-${number}:user" data-chatgpt-search-message-ids="native-question-${number}"><div data-user-message-bubble>${question}</div></div>` : ''}${viewportAnswer(number,answer)}</div></div>`;
const viewportHead=[
  viewportTurn(1,'最早的问题是怎样授权的？','只在打开概览后加载可见历史。'),
  viewportTurn(2,'第二个问题怎样确认原文？','首次部署只能按原文身份核对。'),
].join('');
const viewportTail=[
  '<div data-turn-key="native-placeholder"><button>不应成为大纲的任务标题</button><div data-chatgpt-search-unit-key="turn-placeholder:assistant" data-chatgpt-search-message-ids="native-placeholder"><div data-chatgpt-selection-message-id="native-placeholder"><h4 class="sr-only">ChatGPT 说：</h4></div></div></div>',
  viewportTurn(3,'','这是一条没有用户气泡的单独回复。'),
  `<div data-turn-key="native-turn-4"><div data-talvt-turn-state="complete"><div data-chatgpt-search-message-ids="native-answer-4"><div data-testid="generated-image-gallery"><div data-testid="generated-image-preview"><img alt="" width="96" height="96" src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='96' height='96'%3E%3Crect width='96' height='96' fill='navy'/%3E%3C/svg%3E"></div></div></div></div></div>`,
].join('');
const viewportPage=`<!doctype html><meta charset="utf-8"><title>截断会话</title>
<style>body{margin:0;background:#fafafa;color:#242424;font:16px system-ui} main{margin:56px auto;width:740px} #fixture-history-viewport{height:580px;overflow:auto;overflow-anchor:none;padding:8px 25px} #fixture-history-viewport [data-turn-key]{min-height:405px} h2{font-size:19px}</style>
<main data-chatgpt-conversation-selection-target="local-chatgpt:nativeviewportfixture"><section id="fixture-history-viewport" data-mcp-app-scroll-host data-app-action-timeline-scroll><div id="fixture-native-turns" data-thread-find-target="conversation"><div id="fixture-native-loader"><div role="status"><span data-loading-indicator>正在加载更早的消息…</span></div></div>${viewportTail}</div></section></main>
<script>const viewport=document.querySelector('#fixture-history-viewport');
const loader = document.querySelector('#fixture-native-loader');
const progressive = sessionStorage.getItem('fixture-progressive-cold-jump') === 'on';
if (progressive) {
  sessionStorage.removeItem('fixture-progressive-cold-jump');
  loader.style.minHeight='520px';
}
const initialEnd = viewport.scrollHeight - viewport.clientHeight;
window.fixtureIntermediateWindows = 0;
let priorWindow = initialEnd;
viewport.scrollTop=initialEnd;
window.fixtureNativeLoads=0;
window.fixtureNativeRebounds=0;
window.fixtureCompleteRebounds=0;
let provedHead=false, jumpHead=[];
window.fixtureJumpRebounds=0;
window.fixtureHostReadIntents=0;
let jumpIntentBaseline=0;
viewport.addEventListener('wheel',event=>{
  if(!event.ctrlKey && event.deltaY)window.fixtureHostReadIntents++;
});
window.fixturePrepareChapterJump=()=>{
  jumpIntentBaseline=window.fixtureHostReadIntents;
  jumpHead=[...viewport.querySelectorAll('[data-turn-key="native-turn-1"],[data-turn-key="native-turn-2"]')];
  for(const item of jumpHead) item.hidden=true;
  viewport.scrollTop=viewport.scrollHeight;
};
viewport.addEventListener('scroll',()=>{
  if(jumpHead.length && viewport.scrollTop<viewport.scrollHeight-viewport.clientHeight-2){
    if(window.fixtureHostReadIntents===jumpIntentBaseline){
      viewport.scrollTop=viewport.scrollHeight;
      return;
    }
    if(!window.fixtureJumpRebounds){
      window.fixtureJumpRebounds++;
      viewport.scrollTop=viewport.scrollHeight;
    } else {
      const remount=jumpHead;
      jumpHead=[];
      setTimeout(()=>{for(const item of remount)item.hidden=false;},130);
    }
    return;
  }
  if(window.fixtureNativeLoads){
    if(loader.isConnected || provedHead)return;
    if(viewport.scrollTop<=2)provedHead=true;
    else if(viewport.scrollTop<viewport.scrollHeight-viewport.clientHeight-2){
      window.fixtureCompleteRebounds++;
      viewport.scrollTop=viewport.scrollHeight;
    }
    return;
  }
  if (progressive) {
    const top = viewport.scrollTop;
    if (top > 2) {
      if (priorWindow - top > 90) { window.fixtureIntermediateWindows++; priorWindow = top; }
      return;
    }
    if (window.fixtureIntermediateWindows < 2) {
      viewport.scrollTop=initialEnd;
      return;
    }
  } else if(viewport.scrollTop>2){
    if(viewport.scrollTop<initialEnd-2){ window.fixtureNativeRebounds++; viewport.scrollTop=initialEnd; }
    return;
  }
  window.fixtureNativeLoads++;
  document.querySelector('[data-turn-key="native-placeholder"]').remove();
  const existing=[...document.querySelectorAll('#fixture-native-turns > [data-turn-key]')];
  for(const turn of existing) turn.hidden=true;
  setTimeout(()=>loader.insertAdjacentHTML('afterend',${JSON.stringify(viewportHead)}),1120);
  setTimeout(()=>{
    for(const turn of existing) turn.hidden=false;
    viewport.scrollTop=viewport.scrollHeight;
    loader.remove();
  },1580);
});</script>`;

// 网页始终等待早期历史，但三轮可读正文都已挂载。
const stalledId='stalledsummaryfixture';
const stalledPage=viewportPage.split('<script>')[0].replaceAll(viewportId,stalledId).replace(viewportTail,[
  viewportTurn(5,'试运行什么时候开始？','周六 9 点试运行。遇雨延到周日，提前两小时通知。'),
  viewportTurn(6,'试运行达标后就常态化吗？','20 人和 50 本书达标只说明本轮成功。复盘通过后再决定是否常态化。'),
  viewportTurn(7,'交换区怎样登记书籍？','扫码登记书名和编号。每场限收 80 本，余量留待下次。'),
].join(''))+`<script>
const viewport=document.querySelector('#fixture-history-viewport');
viewport.scrollTop=viewport.scrollHeight;
window.fixtureStalledScrolls=0;
const scroll=viewport.scrollTo.bind(viewport);
viewport.scrollTo=(...args)=>{window.fixtureStalledScrolls++;return scroll(...args);};
</script>`;

(async()=>{
 console.log('starting browser' ,modern?'modern':'legacy');
 const launch=(directory=profile)=>chromium.launchPersistentContext(directory,{channel:'chromium',headless:true,viewport:{width:1240,height:880},
  args:['--disable-extensions-except='+copy,'--load-extension='+copy]});
 let ctx=await launch();
 console.log('browser ready');
 try{
  await ctx.route('**/*',async route=>{
   const url=new URL(route.request().url());
   if(url.protocol==='chrome-extension:')return route.continue();
   requests.push({host:url.hostname,path:url.pathname});
   if(url.origin==='https://watch.fixture.invalid')return route.fulfill({contentType:'text/html; charset=utf-8',body:url.pathname==='/auto'?watchPage.replace('id="state"','id="state" aria-busy="true"'):watchPage});
   if(url.origin==='https://read.fixture.invalid')return route.fulfill({contentType:'text/html; charset=utf-8',
     body:'<title>Community library circulation notes</title><main>Volunteer-run community library, lending and return desk.</main>'});
   if(url.origin==='https://chatgpt.com'&&url.pathname==='/c/fixture01')return route.fulfill({contentType:'text/html; charset=utf-8',body:chatPage});
   if(url.origin==='https://chatgpt.com'&&url.pathname==='/c/'+historyId)return route.fulfill({contentType:'text/html; charset=utf-8',body:historyPage});
   if(url.origin==='https://chatgpt.com'&&url.pathname==='/c/'+viewportId)return route.fulfill({contentType:'text/html; charset=utf-8',body:viewportPage});
   if(url.origin==='https://chatgpt.com'&&url.pathname==='/c/'+stalledId)return route.fulfill({contentType:'text/html; charset=utf-8',body:stalledPage});
   if(url.origin==='https://chatgpt.com'&&url.pathname===historyEndpoint)return route.fulfill({json:historyPagePayload(url.searchParams.get('cursor')||'tail')});
   if(url.origin==='https://chatgpt.com'&&url.pathname==='/backend-api/conversation'&&route.request().method()==='POST')return route.fulfill({json:{ok:true}});
   return route.abort();
  });
  const sw=ctx.serviceWorkers()[0]||await ctx.waitForEvent('serviceworker',{timeout:10000});
  console.log('extension worker ready');
  await sw.evaluate(()=>{
    globalThis.fixtureConnectionChecks=0;
    globalThis.fetch=async(url,options)=>{
      if(url!=='https://api.openai.com/v1/decisions')throw Error('测试拒绝未模拟的网络请求。');
      const body=JSON.parse(options.body);
      if(JSON.parse(body.input).title!=='Synthetic build task')throw Error('连接验证只能发送合成状态。');
      globalThis.fixtureConnectionChecks++;
      return new Response(JSON.stringify({answers:[{type:'choice',name:'lifecycle',choice:'resume',confidence:.99,
        probabilities:[{value:'resume',probability:.99}]}],usage:{input_tokens:18,output_tokens:0}}));
    };
  });
  await wait(() => sw.evaluate(async () => {
    try {
      await chrome.contextMenus.update('watch-page',{visible:true});
      return true;
    } catch {
      return false;
    }
  }),'网页右键菜单没有注册');

  sw.on('console',m=>console.log('worker:',m.type(),m.text()));
  const ext=new URL(sw.url()).origin==='null'?sw.url().split('/').slice(0,3).join('/'):new URL(sw.url()).origin;
  const watch=ctx.pages()[0]||await ctx.newPage();
  watch.on('pageerror',e=>errors.push(e.message));
  await watch.goto('https://watch.fixture.invalid/build',{timeout:10000});
  console.log('watch fixture loaded');
  const tabId=await sw.evaluate(async()=> (await chrome.tabs.query({url:'https://watch.fixture.invalid/*'}))[0].id);
  await sw.evaluate(async id=>globalThis.fixtureMenu({menuItemId:'watch-page',frameId:0},await chrome.tabs.get(id)),tabId);
  console.log('menu handler returned');
  await watch.waitForSelector('tab-pilot-watch',{state:'attached',timeout:8000});
  console.log('watch picker attached');
  await watch.screenshot({path:path.join(base,'watch.png'),timeout:8000});
  console.log('watch screenshot saved');
  const sourceLink=await ctx.newPage();
  await sourceLink.goto('https://watch.fixture.invalid/linked-source');
  await sourceLink.evaluate(()=>{
    document.title='旧城调研 | 合成验收';
    for (const number of [1,2]) {
      const anchor=document.createElement('a');
      anchor.href='/linked-'+number;
      anchor.textContent='调研链接 '+number;
      document.body.append(anchor,document.createElement('br'));
    }
  });
  await sourceLink.bringToFront();
  await wait(()=>sw.evaluate(async()=>{
    const [source]=await chrome.tabs.query({url:'https://watch.fixture.invalid/linked-source'});
    return source?.title==='旧城调研 | 合成验收';
  }),'Chrome 尚未接收到来源页标题');
  const opened=await sw.evaluate(async()=>{
    const [source]=await chrome.tabs.query({url:'https://watch.fixture.invalid/linked-source'});
    // Chromium 的标签 API 传入与后台打开链接相同的来源关系，避免无头环境丢失实体修饰键。
    const children=[];
    for(const index of [1,2]){
      const tab=await chrome.tabs.create({url:'https://watch.fixture.invalid/linked-'+index,
        windowId:source.windowId,openerTabId:source.id,active:false});
      children.push(tab.id);
    }
    return children;
  });
  const inspectLinks=()=>sw.evaluate(async()=> {
    const [source]=await chrome.tabs.query({url:'https://watch.fixture.invalid/linked-source'});
    const children=await chrome.tabs.query({url:'https://watch.fixture.invalid/linked-*'});
    if(!source||source.groupId<0)return null;
    const group=await chrome.tabGroups.get(source.groupId).catch(()=>null);
    if(!group)return null;
    return {title:group.title,count:children.filter(child=>child.id!==source.id&&child.groupId===group.id).length};
  });
  await wait(async()=>{const group=await inspectLinks();return group?.count===2&&group.title==='旧城调研';},'真实 Chrome 后台链接未按来源自动编入原生分组').catch(async error=>{
    console.log('来源分组验收',await sw.evaluate(async()=>{
      const tabs=await chrome.tabs.query({url:'https://watch.fixture.invalid/linked-*'});
      const groups=await chrome.tabGroups.query({});
      return {tabs:tabs.map(({id,groupId,openerTabId,active,title})=>({id,groupId,openerTabId,active,title})),groups};
    }));
    throw error;
  });
  await sw.evaluate(ids=>chrome.tabs.remove(ids),opened);
  await wait(()=>sw.evaluate(async()=>{
    const [tab]=await chrome.tabs.query({url:'https://watch.fixture.invalid/linked-source'});
    return tab?.groupId===-1;
  }),'最后一个来源链接关闭后未恢复来源标签');
  await sourceLink.close();
  note('真实 Chrome 后台打开两个来源链接时共用原生分组，关闭两个子页后恢复来源标签。');
  await watch.locator('#state').click();
  const record=()=>sw.evaluate(async id=>(await chrome.storage.local.get('records')).records?.[id],tabId);
  await wait(async()=>(await record())?.watching,'右键监听未保存');
  await watch.locator('#state').evaluate(e=>e.textContent='任务已完成');
  await wait(async()=>(await record())?.state==='resume','网页完成未进入待接手');
  assert(!ctx.pages().some(p=>p.url().includes('sidepanel.html')));
  note('独立浏览器通过真实 worker 和页面点选保存监听，侧栏关闭时收到完成状态。菜单点击用受控事件触发。');
  await watch.reload();
  await sw.evaluate(async id=>globalThis.fixtureMenu({menuItemId:'watch-page',frameId:0},await chrome.tabs.get(id)),tabId);
  await wait(async()=>(await record())?.state==='waiting','已点选位置未自动复用');
  await watch.locator('#state').evaluate(element=>element.textContent='任务已完成');
  await wait(async()=>(await record())?.state==='resume','复用规则后未收到变化');
  note('一次点选保存位置，重新载入后右键直接启动。');
  const panel=await ctx.newPage();
  panel.on('pageerror',e=>errors.push(e.message));
  await panel.setViewportSize({width:380,height:760});
  await panel.goto(ext+'/sidepanel.html');
  await panel.getByRole('button',{name:'打开设置',exact:true}).waitFor();
  await panel.getByText('合成构建任务',{exact:true}).waitFor();
  assert.equal(await panel.locator('.tab-row').count(),1);
  await panel.screenshot({path:path.join(base,'management.png')});
  for (const width of [320, 380, 600]) {
    await panel.setViewportSize({width,height:760});
    await panel.locator('[data-filter=resume]').click();
    const rowInset=await panel.locator('.tab-row .row-meta').evaluate(content=>{
      const row=content.closest('.tab-row').getBoundingClientRect(), box=content.getBoundingClientRect();
      if (Math.abs((box.left-row.left)-(row.right-box.right))>1) return -1;
      return box.left-row.left;
    });
    assert(rowInset>=14);
    for (const filter of ['waiting','suggested']) {
      await panel.locator('[data-filter='+filter+']').click();
      const insets=await panel.locator('#tabs .empty').evaluate(card=>{
        const {left,right}=card.getBoundingClientRect();
        const title=card.querySelector('h2').getBoundingClientRect();
        const action=card.querySelector('button').getBoundingClientRect();
        return [title.left-left,action.left-left,right-Math.max(action.right,title.right)];
      });
      assert(Math.abs(insets[0]-rowInset)<=1);
      assert(Math.abs(insets[1]-rowInset)<=1);
      assert(insets[2]>=rowInset-1);
    }
    assert(await panel.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  }
  await panel.emulateMedia({colorScheme:'dark',reducedMotion:'reduce'});
  await panel.screenshot({path:path.join(base,'management-empty-dark.png')});
  await panel.getByRole('button',{name:'查看全部事项',exact:true}).click();
  assert.equal(await panel.locator('.tab-row').count(),1);
  await panel.setViewportSize({width:380,height:760});
  await panel.emulateMedia({colorScheme:'light'});
  note('窄栏到宽栏的事项卡片、筛选空态标题和操作采用相同左右内边距。');
  await panel.getByRole('button',{name:'添加事项'}).click();
  await panel.getByRole('button',{name:'连接模型',exact:true}).waitFor();
  await panel.getByRole('button',{name:'选网页',exact:true}).click();
  await panel.locator('#watch-search').fill('合成构建任务');
  assert.equal(await panel.locator('#watch-list li').count(),1);
  await panel.locator('#watch-list li').getByText('合成构建任务').waitFor();
  await panel.getByRole('button',{name:'关闭网页检查'}).click();
  note('尚未配置 API 也可盘点各窗口网页并选择本地监听。');
  await panel.setViewportSize({width:320,height:760});
  assert(await panel.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  await panel.screenshot({path:path.join(base,'management-320.png')});
  await panel.setViewportSize({width:380,height:760});
  await panel.getByRole('button',{name:'打开设置',exact:true}).click();
  for (const width of [320, 380]) {
    await panel.setViewportSize({width,height:760});
    assert(await panel.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  }
  await panel.screenshot({path:path.join(base,'connection-light.png')});
  await panel.emulateMedia({colorScheme:'dark',reducedMotion:'reduce'});
  assert.equal(await panel.locator('body').evaluate(node=>getComputedStyle(node).backgroundColor),'rgb(31, 27, 40)');
  assert.deepEqual(await panel.locator('.preferences-tabs [aria-pressed=true]').evaluate(node=>{
    const style=getComputedStyle(node);
    return [style.backgroundColor,style.color];
  }),['rgb(59, 49, 77)','rgb(246, 241, 252)']);
  assert.deepEqual(await panel.locator('#save-settings').evaluate(node=>{
    const style=getComputedStyle(node);
    return [style.backgroundColor,style.color];
  }),['rgb(206, 190, 247)','rgb(35, 29, 49)']);
  await panel.screenshot({path:path.join(base,'connection-dark.png')});
  await panel.emulateMedia({colorScheme:'light'});
  assert.equal(await panel.locator('input[name=credentialStorage]:checked').inputValue(),'profile');
  assert.equal(await panel.locator('#provider-fields').isVisible(),false);
  assert(await panel.locator('.import-key').isVisible());
  assert.equal(await panel.locator('#test-api').count(),0);
  await panel.getByText('Responses',{exact:true}).click();
  await panel.locator('#model').fill('responses-draft');
  await panel.getByText('兼容 API',{exact:true}).click();
  await panel.locator('#endpoint').fill('https://compatible.fixture.invalid/v1');
  await panel.getByText('OpenAI',{exact:true}).click();
  await panel.getByText('Responses',{exact:true}).click();
  assert.equal(await panel.locator('#model').inputValue(),'responses-draft');
  await panel.getByText('Decisions',{exact:true}).click();
  assert.equal(await panel.locator('#provider-fields').isVisible(),false);
  await panel.locator('#key-file').setInputFiles({
    name:'fixture.env',mimeType:'text/plain',buffer:Buffer.from('OPENAI_API_KEY=synthetic-profile-credential\n')
  });
  await panel.locator('#key-state',{hasText:'密钥已导入'}).waitFor();
  assert.equal(await panel.locator('#api-key').inputValue(),'');
  await panel.getByRole('button',{name:'保存连接',exact:true}).click();
  await panel.locator('#key-state',{hasText:'已保存在当前 Chrome 配置'}).waitFor();
  await panel.locator('#api-receipt',{hasText:'连接验证通过'}).waitFor();
  await panel.getByRole('button',{name:'保存连接',exact:true}).click();
  await wait(async()=>!(await panel.locator('#save-settings').isDisabled()),'重复保存没有结束');
  assert.equal(await sw.evaluate(()=>globalThis.fixtureConnectionChecks),1);
  await panel.getByText('Responses',{exact:true}).click();
  assert.equal(await panel.locator('#endpoint-field').isVisible(),false);
  assert.match(await panel.locator('#api-key').getAttribute('placeholder'),/已保存/);
  await panel.getByText('Decisions',{exact:true}).click();
  note('两个 OpenAI 协议共享密钥状态，兼容协议保留自己的草稿。重复保存不重新验证。');
  assert.equal(await panel.locator('#api-key').inputValue(),'');
  assert.equal(await sw.evaluate(async()=>JSON.stringify(await chrome.storage.local.get(null))
    .includes('synthetic-profile-credential')),false);
  assert(await sw.evaluate(async()=>new Promise(resolve=>{
    const request=indexedDB.open('tab-cadence-credentials',1);
    request.onsuccess=()=>{
      const db=request.result;
      const read=db.transaction('connection').objectStore('connection').get('https://api.openai.com');
      read.onsuccess=()=>{
        const item=read.result;
        resolve(item?.key instanceof CryptoKey && item.key.extractable===false &&
          item.ciphertext instanceof ArrayBuffer && typeof item.apiKey==='undefined');
        db.close();
      };
    };
  })));
  await panel.getByRole('button',{name:'ChatGPT',exact:true}).click();
  await panel.getByRole('button',{name:'授权并启用',exact:true}).click();
  await panel.getByRole('button',{name:'停用对话工具',exact:true}).waitFor();
  await panel.screenshot({path:path.join(base,'settings.png')});
  await panel.close();
  note('真实扩展侧栏仅列事项，站点开关注册内容脚本后可关闭侧栏。');
  await watch.goto('https://watch.fixture.invalid/auto');
  await sw.evaluate(async id=>globalThis.fixtureMenu({menuItemId:'watch-page',frameId:0},await chrome.tabs.get(id)),tabId);
  await wait(async()=>(await record())?.watchAdapter?.kind==='busy','明确忙碌状态未直接启动');
  await watch.locator('#state').evaluate(element=>{
    const replacement=element.cloneNode(true);
    replacement.id='active-build';
    element.replaceWith(replacement);
  });
  await wait(async()=>(await record())?.watchAdapter?.target==='#active-build','状态节点重挂载后未恢复监听');
  await watch.locator('#active-build').evaluate(element=>element.setAttribute('aria-busy','false'));
  await wait(async()=>(await record())?.state==='resume','自动识别未收到完成信号');
  await watch.locator('#active-build').evaluate(element=>{element.id='state';});
  note('明确忙碌状态直接启动，节点重挂载后自动接续并收到完成信号。');
  await sw.evaluate(async()=>{
    const {threadWorkspacePreferences={}}=await chrome.storage.local.get('threadWorkspacePreferences');
    await chrome.storage.local.set({threadWorkspacePreferences:{...threadWorkspacePreferences,autoTopicSummary:true}});
    const fetch = globalThis.fetch;
    globalThis.fixtureUnexpectedTopics = 0;
    globalThis.fetch = (url,options) => {
      if (url !== 'https://api.openai.com/v1/responses') return fetch(url,options);
      globalThis.fixtureUnexpectedTopics++;
      return Promise.resolve(new Response(null,{status:500}));
    };
  });
  const chat=await ctx.newPage();
  chat.on('pageerror',e=>errors.push(e.message));
  await chat.goto('https://chatgpt.com/c/fixture01');
  await chat.evaluate(({modern,localOwner})=>{
    window.fixtureSent=[];
    const composer=document.querySelector('textarea'),stop=document.querySelector('[data-testid=stop-button]'),thread=document.querySelector('#thread');
    let send=document.querySelector('[data-testid=send-button]');
    window.fixtureRemountSend=()=>{
      const replacement=send.cloneNode(true);
      send.replaceWith(replacement);
      send=replacement;
      window.fixtureSendRemounted=true;
    };
    function complete(){
      stop.hidden=true;send.hidden=false;
      for(const m of thread.querySelectorAll('[data-status="streaming"]'))m.dataset.status='finished_successfully';
      for(const m of thread.querySelectorAll('[data-talvt-turn-state="streaming"]'))m.dataset.talvtTurnState='complete';
    }
    window.fixtureComplete=complete;
    window.fixtureImage=()=>{
      const answer=thread.lastElementChild.querySelector('[data-message-author-role="assistant"],[data-markdown-text-style]');
      const image=document.createElement('img');
      image.width=96;image.height=96;image.alt='合成图像结果';
      const media=document.createElement('button');media.type='button';media.dataset.testid='generated-image';media.append(image);
      if (modern) {
        const unit=answer.closest('[data-chatgpt-search-unit-key]');
        unit.removeAttribute('data-chatgpt-search-unit-key');
        unit.dataset.chatgptSearchMessageIds=unit.dataset.chatgptSearchMessageIds.split(' ')[0];
        const gallery=document.createElement('div');
        gallery.dataset.testid='generated-image-gallery';
        media.dataset.testid='generated-image-preview';
        gallery.append(media);
        unit.replaceChildren(gallery);
        // 当前宿主的图片单元没有作者标记，整轮终态位于深层外层容器。
        let child=unit;
        for (let depth=0; depth<10; depth++) {
          const wrapper=document.createElement('div');
          child.replaceWith(wrapper);
          wrapper.append(child);
          child=wrapper;
        }
        stop.hidden=true;
      } else answer.replaceChildren(media);
      const canvas=document.createElement('canvas');canvas.width=96;canvas.height=96;
      const drawing=canvas.getContext('2d');drawing.fillStyle='#4b8068';drawing.fillRect(0,0,96,96);
      image.src=canvas.toDataURL();
      return image.decode();
    };
    composer.addEventListener('keydown',e=>{if(e.key==='Enter'&&!e.shiftKey&&!e.altKey&&!stop.hidden)return;if(e.key==='Enter'&&!e.shiftKey&&!e.altKey){e.preventDefault();if(composer.value)send.click();}});
    composer.form.addEventListener('submit',e=>{
      e.preventDefault();
      if(!stop.hidden||!composer.value.trim())return;
      const value=composer.value; window.fixtureSent.push(value);
      const folded=window.fixtureFoldOutgoing===true;
      window.fixtureFoldOutgoing=false;
      const n=window.fixtureSent.length;
      const msg=document.createElement('article');msg.dataset.turn='user';msg.dataset.testid='conversation-turn-'+(n*2+1);
      const bubble=document.createElement('div');bubble.dataset.messageId='user-new-'+n;bubble.dataset.messageAuthorRole='user';
      const body=document.createElement('div');body.className='whitespace-pre-wrap';body.textContent=folded?'省略后的原生回显…':value;bubble.append(body);msg.append(bubble);
      const previousTurns=folded?[]:Array.from(thread.children,n=>n.cloneNode(true));
      if(folded)void fetch('/backend-api/conversation',{method:'POST',body:JSON.stringify({
        conversation_id:'fixture01',action:'next',
        messages:[{id:'user-new-'+n,author:{role:'user'},content:{content_type:'text',parts:[value]}}],
      })});
      composer.value='';composer.dispatchEvent(new InputEvent('input',{bubbles:true}));
      const reply=document.createElement('article');reply.dataset.turn='assistant';reply.dataset.testid='conversation-turn-'+(n*2+2);
      const answer=document.createElement('div');answer.dataset.messageAuthorRole='assistant';answer.dataset.messageId='answer-new-'+n;answer.dataset.status='streaming';answer.textContent='处理中 '+n;
      reply.append(answer);
      if(modern){
        const turn=document.createElement('div');
        turn.dataset.turnKey='turn-fixture-'+n;
        const state=document.createElement('div');
        state.dataset.talvtTurnState='streaming';
        const userUnit=document.createElement('div');
        userUnit.dataset.chatgptSearchUnitKey='fallback-turn-'+n+':1:user';
        userUnit.dataset.chatgptSearchMessageIds='user-new-'+n;
        bubble.removeAttribute('data-message-id');
        bubble.removeAttribute('data-message-author-role');
        bubble.setAttribute('data-user-message-bubble','');
        userUnit.append(bubble);
        const answerUnit=document.createElement('div');
        answerUnit.dataset.chatgptSearchUnitKey='fallback-turn-'+n+':2:assistant';
        answerUnit.dataset.chatgptSearchMessageIds='answer-new-'+n+' answer-new-'+n;
        const selection=document.createElement('div');
        selection.dataset.chatgptSelectionConversationId=localOwner;
        selection.dataset.chatgptSelectionMessageId='answer-new-'+n;
        answer.removeAttribute('data-message-id');
        answer.removeAttribute('data-message-author-role');
        answer.removeAttribute('data-status');
        answer.dataset.markdownTextStyle='assistant-message';
        answer.dataset.selectedTextOverlayTarget='fixture';
        selection.append(answer);
        answerUnit.append(selection);
        state.append(userUnit,answerUnit);
        turn.append(state);
        thread.replaceChildren(...previousTurns,turn);
      }else{
        thread.replaceChildren(...previousTurns,msg,reply);
      }
      stop.hidden=false;send.hidden=true;
    });
  },{modern,localOwner});
  const chatTabId=await sw.evaluate(async()=>{
    return (await chrome.tabs.query({url:'https://chatgpt.com/c/fixture01'}))[0].id;
  });
  const chatRecord=()=>sw.evaluate(async id=>(await chrome.storage.local.get('records')).records?.[id],chatTabId);
  await sw.evaluate(async id=>globalThis.fixtureMenu({menuItemId:'watch-page',frameId:0},await chrome.tabs.get(id)),chatTabId);
  await wait(async()=>(await chatRecord())?.watchAdapter?.kind==='chat','生成中的 ChatGPT 未直接开始监听');
  const host=chat.locator('#threaddeck-host');
  await host.waitFor({state:'attached'});
  await chat.waitForFunction(()=>document.querySelector('#threaddeck-host')?.shadowRoot?.querySelector('.rail-item'));
  const editor=chat.locator('#prompt-textarea');
  await host.locator('.compact-rail').hover();
  await host.getByRole('button',{name:'对话设置',exact:true}).click();
  const preferences=host.getByRole('dialog',{name:'对话设置'});
  await preferences.waitFor({state:'visible'});
  await chat.setViewportSize({width:380,height:740});
  assert(await preferences.evaluate(modal=>{
    const rect=modal.getBoundingClientRect();
    const list=modal.querySelector('.settings-scroll');
    const row=list.querySelector('.setting-row:has(.select-input)');
    return rect.left>=0 && rect.right<=innerWidth && rect.bottom<=innerHeight &&
      list.clientWidth>=list.scrollWidth && getComputedStyle(row).gridTemplateColumns.split(' ').length===1;
  }));
  const close=preferences.getByRole('button',{name:'关闭设置'});
  assert(await close.evaluate(button=>button.getRootNode().activeElement===button));
  await close.press('Shift+Tab');
  assert(await preferences.getByRole('button',{name:'保存设置'}).evaluate(button=>button.getRootNode().activeElement===button));
  await chat.screenshot({path:path.join(base,'chat-preferences-narrow.png')});
  await chat.setViewportSize({width:960,height:900});
  await close.focus();
  await chat.screenshot({path:path.join(base,'chat-preferences-wide.png')});
  await chat.evaluate(()=>document.documentElement.setAttribute('data-theme','dark'));
  await wait(()=>preferences.evaluate(node=>getComputedStyle(node).backgroundColor==='rgb(35, 35, 35)'),
    '对话设置没有跟随深色主题');
  assert.deepEqual(await preferences.getByRole('button',{name:'保存设置'}).evaluate(node=>{
    const style=getComputedStyle(node);
    return [style.backgroundColor,style.color];
  }),['rgb(244, 244, 244)','rgb(23, 23, 23)']);
  await chat.screenshot({path:path.join(base,'chat-preferences-dark.png')});
  await chat.evaluate(()=>document.documentElement.removeAttribute('data-theme'));
  await close.press('Escape');
  await preferences.waitFor({state:'hidden'});
  await chat.setViewportSize({width:1240,height:880});
  await editor.fill('排队第一问');
  await editor.press('Enter');
  await host.locator('.queue-dock-item[data-status=waiting]').first().waitFor({timeout:8000});
  await wait(async()=>await editor.inputValue()==='','第一问入队后输入框没有清空');
  await editor.fill('排队第二问');
  await editor.press('Enter');
  await wait(async()=>await host.locator('.queue-dock-item').count()===2,'第二问未入队');
  assert.deepEqual(await chat.evaluate(()=>window.fixtureSent),[]);
  await chat.screenshot({path:path.join(base,'queue.png')});
  await chat.evaluate(()=>window.fixtureComplete());
  await wait(async()=>(await chat.evaluate(()=>window.fixtureSent)).length===1,'第一问未自动续发',7000);
  assert.deepEqual(await chat.evaluate(()=>window.fixtureSent),['排队第一问']);
  await wait(async()=>await host.locator('.queue-dock-item').count()===1,'DOM 重建后未清理第一问回执',9000);
  await chat.evaluate(()=>window.fixtureImage());
  await new Promise(resolve=>setTimeout(resolve,650));
  assert.deepEqual(await chat.evaluate(()=>window.fixtureSent),['排队第一问'],'图片已显示但生成未结束，不能续发');
  await chat.evaluate(()=>window.fixtureComplete());
  await wait(async()=>(await chat.evaluate(()=>window.fixtureSent)).length===2,'第二问未自动续发',10000);
  assert.deepEqual(await chat.evaluate(()=>window.fixtureSent),['排队第一问','排队第二问']);
  await wait(async()=>await host.locator('.queue-dock-item').count()===0,'第二问回执未清理',9000);
  note('ChatGPT 原输入框连排两问。文字和仅图片回复等宿主终态才续发，现行版覆盖没有作者标记的图片。');
  await chat.evaluate(()=>window.fixtureComplete());
  await wait(async()=>(await chatRecord())?.state==='resume','ChatGPT 回答的明确完成状态未进入待接手');
  note('ChatGPT 生成时右键直接监听，连发结束后进入待接手。');
  // 宿主直接把输入框挂在正文同级时，整页不能被误认为输入区。
  await chat.locator('#prompt-textarea').evaluate(editor=>editor.parentElement.before(editor));
  await chat.locator('#quote').scrollIntoViewIfNeeded();
  const quote=await chat.locator('#quote').evaluate(element=>{
    const a=new Range(),b=new Range(),text=element.firstChild;
    a.setStart(text,0);a.setEnd(text,1);b.setStart(text,text.length-1);b.setEnd(text,text.length);
    const first=a.getBoundingClientRect(), last=b.getBoundingClientRect();
    return {x:first.left+1,y:first.top+first.height/2,end:last.right+1};
  });
  await chat.evaluate(({x,y})=>{
    const attach = (parent,left) => {
      const floating = document.createElement('div');
      floating.setAttribute('role','toolbar');
      floating.style.cssText='position:fixed;z-index:999;top:'+(y+22)+'px;left:'+left+'px;';
      floating.innerHTML='<div role="presentation"><button>询问 ChatGPT</button><button>翻译</button></div>';
      parent.append(floating);
    };
    const shadowHost = document.createElement('div');
    shadowHost.id='fixture-shadow-extension';
    document.body.append(shadowHost);
    attach(shadowHost.attachShadow({mode:'open'}),x+110);
    const lightHost = document.createElement('div');
    lightHost.id='fixture-light-extension';
    document.body.append(lightHost);
    attach(lightHost,x+245);
  },quote);
  await chat.mouse.move(quote.x,quote.y);
  await chat.mouse.down();
  await chat.mouse.move(quote.end,quote.y,{steps:12});
  assert.equal(await chat.evaluate(()=>getSelection().toString()),'保留现有快捷键与本地草稿。');
  await chat.mouse.up();
  const annotation=host.locator('[data-action="add-selection-comment"]');
  await annotation.waitFor({timeout:10000});
  assert(await annotation.evaluate(button=>{
    const box=button.getBoundingClientRect();
    const selection=getSelection().getRangeAt(0).getBoundingClientRect();
    const x=Math.max(selection.left-box.right,box.left-selection.right,0);
    const y=Math.max(selection.top-box.bottom,box.top-selection.bottom,0);
    return Math.hypot(x,y)<95;
  }), '备用批注入口必须贴在选区附近');
  const externalToolbars=chat.locator('#fixture-shadow-extension, #fixture-light-extension');
  assert.equal(await externalToolbars.locator('[data-threaddeck-selection-comment]').count(),0);
  await annotation.hover();
  const alpha=await annotation.evaluate(button=>{
    const canvas=document.createElement('canvas');
    canvas.width=canvas.height=1;
    const paint=canvas.getContext('2d');
    paint.fillStyle=getComputedStyle(button).backgroundColor;
    paint.fillRect(0,0,1,1);
    return paint.getImageData(0,0,1,1).data[3];
  });
  assert.equal(alpha,255,'备用批注入口悬停时应保持不透明');
  await chat.evaluate(({x,y})=>{
    const toolbar=document.createElement('div');
    toolbar.setAttribute('data-testid','fixture-popup');
    toolbar.style.cssText='width:max-content;position:fixed;z-index:999;left:'+x+'px;top:'+(y-40)+'px;';
    toolbar.innerHTML='<div role="presentation" class="bg-surface-elevated-secondary" style="display:flex;overflow:hidden;background:#fff;color:#171717;'+
      'border:1px solid #ddd;border-radius:8px"><button class="fixture-fade cursor-interaction">询问 ChatGPT</button></div>';
    const style=document.createElement('style');
    style.textContent='.fixture-fade{padding:0 6px;min-height:28px;font:400 14px/18px system-ui;border:0;background:transparent;color:inherit}.fixture-fade:hover{opacity:.1}';
    document.head.append(style);
    document.body.append(toolbar);
  },quote);
  const nativeAnnotation=chat.getByTestId('fixture-popup').locator('[role=presentation]').getByRole('button',{name:'添加批注'});
  await nativeAnnotation.waitFor({timeout:3500});
  await annotation.waitFor({state:'hidden',timeout:5000}).catch(async error=>{
    const hit=await nativeAnnotation.evaluate(button=>{
      const rect=button.getBoundingClientRect();
      return document.elementsFromPoint(rect.x+rect.width/2,rect.y+rect.height/2).slice(0,5)
        .map(node=>({tag:node.tagName,id:node.id,role:node.getAttribute('role')}));
    });
    console.log('批注按钮的点击层',hit);
    throw error;
  });
  await nativeAnnotation.hover();
  assert.deepEqual(await nativeAnnotation.evaluate(button=>{
    const host=button.previousElementSibling;
    const own=getComputedStyle(button),native=getComputedStyle(host);
    const canvas=document.createElement('canvas'),paint=canvas.getContext('2d');
    paint.fillStyle=own.backgroundColor;paint.fillRect(0,0,1,1);
    return [own.opacity,own.fontSize===native.fontSize,own.fontWeight===native.fontWeight,
      button.getBoundingClientRect().height===host.getBoundingClientRect().height,paint.getImageData(0,0,1,1).data[3]];
  }),['1',true,true,true,255]);
  assert.equal(await chat.evaluate(()=>getSelection().toString()),'保留现有快捷键与本地草稿。');
  await nativeAnnotation.click();
  await host.locator('.comment-popover textarea').waitFor();
  await chat.locator('#prompt-textarea').evaluate(editor=>document.querySelector('form').prepend(editor));
  assert.equal(await externalToolbars.locator('[data-threaddeck-selection-comment],[data-threaddeck-suppressed]').count(),0);
  await externalToolbars.evaluateAll(toolbars=>toolbars.forEach(toolbar=>toolbar.remove()));
  await host.locator('.comment-popover textarea').fill('这是测试批注');
  await sw.evaluate(async id=>{
    const {threadWorkspacePreferences}=await chrome.storage.local.get('threadWorkspacePreferences');
    await chrome.storage.local.set({threadWorkspacePreferences:{...threadWorkspacePreferences,autoTopicSummary:false}});
    await chrome.tabs.sendMessage(id,{type:'THREAD_PILOT_PREFERENCES'},{frameId:0});
  },chatTabId);
  await host.locator('.compact-rail').hover();
  await host.locator('[data-action="open-topics"]').click();
  const overview=host.locator('.semantic-zoom');
  await overview.waitFor({state:'visible'});
  await host.locator('.comment-popover').waitFor({state:'hidden'});
  await overview.locator('[data-action="close-topics"]').click();
  await overview.waitFor({state:'hidden'});
  await wait(async()=>await host.locator('.comment-badge-layer button').count()>0,'没有保存原位批注',5000);
  await chat.screenshot({path:path.join(base,'annotation-behavior-fixture.png')});
  await chat.getByTestId('fixture-popup').evaluate(toolbar=>toolbar.remove());
  note('第三方划词浮条保持独立。批注只并入 ChatGPT 工具条，悬停不透底，从批注切换到概览时自动保存。');
  await sw.evaluate(id=>{
    const store=chrome.storage.session;
    const write=store.set.bind(store);
    store.set=async value=>{
      const slot=value['threadWorkspaceTab:'+id];
      if (slot && Object.values(slot).some(item=>typeof item==='string'&&item.includes('"status":"sending"'))) {
        store.set=write;
        await chrome.scripting.executeScript({target:{tabId:id},world:'MAIN',func:()=>window.fixtureRemountSend()});
      }
      return write(value);
    };
  },chatTabId);
  await editor.fill('带批注的测试问题');
  await editor.press('Enter');
  await wait(async()=>(await chat.evaluate(()=>window.fixtureSent)).length===3,'批注合并后的问题未上屏',9000);
  const merged=(await chat.evaluate(()=>window.fixtureSent)).at(-1);
  assert.equal(await chat.evaluate(()=>window.fixtureSendRemounted),true);
  for(const part of ['这是测试批注','带批注的测试问题','保留现有快捷键与本地草稿。']) {
    assert.equal(merged.split(part).length,2,'每个片段应准确拼入一次');
  }
  await chat.evaluate(()=>window.fixtureComplete());
  await wait(async()=>await host.locator('.queue-dock-item').count()===0,'带批注的问题上屏后遗留了队列',9000);
  note('发送按钮在回执保存时重挂载，批注原文、笔记和问题仍通过一次原生提交上屏。');
  await host.locator('.compact-rail').hover();
  await host.locator('[data-action="open-topics"]').click();
  await overview.waitFor({state:'visible'});
  await overview.locator('.zoom-chapters summary').first().click();
  await overview.locator('.zoom-chapter', {hasText:'第二步 · 确认边界'}).waitFor();
  assert.equal(await overview.locator('.zoom-chapter', {hasText:'第二步 · 确认边界'}).count(),1);
  await overview.locator('.zoom-chapter', {hasText:'第二步 · 确认边界'}).click();
  await overview.waitFor({state:'hidden'});
  await wait(()=>chat.locator('h2',{hasText:'第二步 · 确认边界'}).evaluate(node=>{
    const r=node.getBoundingClientRect();return r.top>=0 && r.bottom<innerHeight;
  }),'章节跳转没将对应原文放回视口');
  note('主题概览保留真实章节，点击章节返回准确的原文位置。');
  assert(!requests.some(r=>r.path.startsWith('/backend-api')||r.path.startsWith('/api/auth')));
  await editor.fill('第一行');
  await editor.press('End');
  await editor.press('Alt+Enter');
  await wait(async()=>await editor.inputValue()==='第一行\n','Option+Enter 没有写入真实换行');
  assert.equal((await chat.evaluate(()=>window.fixtureSent)).length,3);
  note('Option+Enter 只换行，没有发送。');

  // 制造发送后只剩折叠的回显、旧节点全部卸载的情况。
  await chat.evaluate(()=>window.fixtureFoldOutgoing=true);
  await editor.fill('第四条正式问题，完整文本与折叠气泡不同');
  await editor.press('Alt+Shift+Enter');
  if (!(await host.locator('.queue-dock-item').count())) {
    await editor.press('Control+Enter');
  }
  await wait(async()=>(await chat.evaluate(()=>window.fixtureSent)).length===4,'折叠发送未完成',9000);
  await wait(async()=>await host.locator('.queue-dock-item').count()===0,'折叠回显未按消息身份核对',9000);
  assert.deepEqual(requests.filter(r=>r.path.startsWith('/backend-api')).map(r=>r.path),['/backend-api/conversation']);
  note('折叠回显以原生请求身份关联，不重复提交。');

  assert.equal(await sw.evaluate(()=>globalThis.fixtureUnexpectedTopics),0,'历史未补齐时不应调用模型');
  await chat.evaluate(async ({destination,endpoint,markup})=>{
    window.fixtureComplete();
    // 宿主先发请求，再以站内路由切换正文，扩展必须在新作用域接收同一响应。
    const pending=fetch(endpoint);
    history.pushState({},'',destination);
    const page=new DOMParser().parseFromString(markup,'text/html');
    document.querySelector('#thread').replaceWith(page.querySelector('#thread'));
    await pending.then(response=>response.json());
  },{destination:'/c/'+historyId,endpoint:historyEndpoint,markup:historyPage});
  const chatStatus=()=>sw.evaluate(async()=>{
    const [tab]=await chrome.tabs.query({url:'https://chatgpt.com/c/historyfixture'});
    return chrome.tabs.sendMessage(tab.id,{type:'PROMPT_RAIL_GET_STATUS'});
  }).catch(()=>null);
  await wait(async()=>(await chatStatus())?.eventCount===6,'未从首个末尾分段恢复 6 轮目录',9000).catch(async error=>{
    const state=await chatStatus();
    console.log(JSON.stringify({count:state?.eventCount,api:state?.chatGptApi,source:state?.stats?.source,
      bridgeBytes:await chat.evaluate(()=>window.fixtureHistorySize||0),
      rails:await host.locator('.rail-item').count(),requests:requests.filter(r=>r.path===historyEndpoint)}));
    throw error;
  });
  await host.locator('.compact-rail .rail-item').last().hover();
  const outline=host.locator('.preview-panel');
  await outline.waitFor({state:'visible'});
  const search=outline.locator('.td-search');
  await search.fill('尾段限制');
  await outline.getByText('没有匹配内容',{exact:true}).waitFor();
  assert(await outline.locator('.td-outline-coverage').isVisible());
  await chat.evaluate(async endpoint=>{
    // 较早的一段先到，随后才到能连接会话首尾的中间段。
    await Promise.all(['head','middle'].map(cursor=>
      fetch(endpoint+'?cursor='+cursor).then(response=>response.json())));
  },historyEndpoint);
  await wait(async()=>(await chatStatus())?.eventCount===12,'三个原生响应没有拼接成完整的 12 轮',9000);
  await outline.locator('.answer-text',{hasText:'尾段限制'}).waitFor();
  assert.equal(await outline.locator('.outline-group').count(),1);
  await search.press('Escape');
  assert.equal(await search.inputValue(),'');
  assert.equal(await outline.locator('.td-outline-coverage').isVisible(),false);
  const mountHistoryIsland=turns=>chat.locator('#thread').evaluate((thread,turns)=>{
    window.fixtureOriginalHistory ||= [...thread.children];
    const users=turns.map(turn=>{
      const node=window.fixtureOriginalHistory[0].cloneNode(true);
      node.dataset.testid='conversation-turn-'+(2*turn-1);
      node.querySelector('[data-message-id]').dataset.messageId='history-user-'+turn;
      node.querySelector('.whitespace-pre-wrap').textContent='合成历史提问 '+turn+' 的约束是什么？';
      return node;
    });
    thread.replaceChildren(...users);
  },turns);
  const assertHistoryOrder=async mounted=>{
    await wait(async()=>{
      const {entries=[]}=await chatStatus() || {};
      const current=entries.filter(row=>row.mounted).map(row=>Number(row.text.match(/合成历史提问 (\d+)/)?.[1])).sort((a,b)=>a-b);
      return current.join(',')===mounted.join(',');
    },'未采集当前挂载的历史片段');
    const order=await host.locator('.compact-rail .rail-item').evaluateAll(items=>items.map(item=>
      Number(item.getAttribute('aria-label')?.match(/合成历史提问 (\d+)/)?.[1])));
    assert.deepEqual(order,Array.from({length:12},(_,index)=>index+1));
  };
  await mountHistoryIsland([1,7,11]);
  await assertHistoryOrder([1,7,11]);
  await mountHistoryIsland([9,10]);
  await assertHistoryOrder([9,10]);
  await chat.locator('#thread').evaluate(thread=>thread.replaceChildren(...window.fixtureOriginalHistory));
  await assertHistoryOrder([12]);
  note('完整原文顺序在两段不相邻的虚拟问答交替挂载后保持一致。');
  await chat.evaluate(()=>{
    const section=document.querySelector('#thread article[data-turn="assistant"] .markdown');
    const heading=document.createElement('h2'); heading.textContent='补载的安全边界';
    const paragraph=document.createElement('p'); paragraph.textContent='补载正文标记';
    section.append(heading,paragraph);
  });
  await search.fill('安全边界');
  await outline.locator('.answer-text',{hasText:'补载的安全边界'}).waitFor();
  assert.equal(await outline.locator('.outline-group').count(),1);
  await outline.getByRole('button',{name:'清除搜索'}).click();
  assert.equal(await search.inputValue(),'');
  await chat.setViewportSize({width:760,height:760});
  const insets=await outline.evaluate(panel=>{
    const box=panel.getBoundingClientRect(), inset=panel.querySelector('.outline-search').getBoundingClientRect();
    return [Math.round(inset.left-box.left),Math.round(box.right-inset.right)];
  });
  assert.deepEqual(insets,[17,17]);
  await outline.screenshot({path:path.join(base,'outline-light.png')});
  await chat.evaluate(()=>document.documentElement.setAttribute('data-theme','dark'));
  await wait(()=>host.getAttribute('data-theme').then(theme=>theme==='dark'),'大纲没有切换为深色');
  await outline.screenshot({path:path.join(base,'outline-dark.png')});
  await chat.evaluate(()=>document.documentElement.removeAttribute('data-theme'));
  await chat.setViewportSize({width:1240,height:880});
  await search.evaluate(input=>input.blur());
  await chat.mouse.move(170,200);
  note('先载入末尾，再乱序载入早期两段，现有搜索实时补齐。直接挂载的新章节也能检索。');
  await sw.evaluate(async()=>{
    globalThis.fixtureTopicEvidence = [];
    const fetch = globalThis.fetch;
    globalThis.fetch=async(url,options)=>{
      if (url !== 'https://api.openai.com/v1/responses') return fetch(url,options);
      const request=JSON.parse(options.body);
      const evidence=JSON.parse(request.input);
      globalThis.fixtureTopicEvidence.push(evidence);
      if (globalThis.fixtureHoldNextDigest) {
        globalThis.fixtureHoldNextDigest=false;
        await new Promise(resolve=>{globalThis.fixtureReleaseDigest=resolve;});
      }
      const questions=[
        '哪些条件需要先确认？','长答复里提到哪三条限制？','哪些步骤能在本地完成？','取消后要保留什么？',
        '如何检查历史加载？','页面晚到该怎么处理？','如何定位重复标题？','需要验证哪种边界？',
        '更改后如何回退？','是否需要再次调用模型？','怎样核对最终结果？','接下来按什么顺序做？',
      ];
      const answers=[
        '先确认页面已授权、当前会话身份明确，再开始整理。',
        '按原文顺序核对适用范围、执行决定和最后的限制，并保留对应章节。',
        '已加载的问答和章节可以在浏览器里直接索引。','保留原资料、阅读位置和尚未提交的草稿。',
        '用末尾到首段的分段加载检查索引是否持续更新。','通过消息身份拼接此前收到的同一会话片段。',
        '结合消息身份与标题层级区分重名章节。','优先验证路由切换和页面只载入部分历史的情况。',
        '从最近一次可用的缓存继续，原文仍可直接查看。','相同会话内容命中缓存后可以直接阅读。',
        '确认全部轮次有对应的问答、章节和原文跳转。','从授权、索引到核对逐步完成，最后检查安全边界。',
      ];
      const partial = evidence[0]?.question === '试运行什么时候开始？';
      const result=partial ? {
        summary:'周六 9 点试运行，遇雨顺延至周日；20 人和 50 本书达标后仍需复盘。现场扫码登记，每场限收 80 本。',
        topics:[
          {start:1,end:2,title:'试运行何时转入常态化',summary:'周六 9 点启动，遇雨延至周日并提前通知。20 人、50 本书达标后先复盘，再决定是否常态化。',merge:true},
          {start:3,end:3,title:'登记与容量',summary:'扫码登记书名和编号，每场限收 80 本。',merge:false},
        ],
        turns:[
          {turn:1,question:'什么时候试运行？',answer:'周六 9 点；遇雨顺延至周日，提前两小时通知。'},
          {turn:2,question:'达到什么条件才常态化？',answer:'20 人和 50 本书达标后仍需复盘，再决定是否常态化。'},
          {turn:3,question:'书籍怎么登记？',answer:'扫码登记书名和编号，超出 80 本的留待下一场。'},
        ],
      } : {
        summary:'对话确定了授权、对话索引和恢复的处置顺序。先读取已有内容，补载时按身份合并，最后核对章节跳转。',
        topics:evidence.length < 9 ? [{start:1,end:evidence.length,title:'原文历史',summary:'已整理所有已核对的消息。'}] : [
          {start:1,end:4,title:'适用条件与执行限制',summary:'先核对页面授权和对话身份，再按具体限制规划执行。'},
          {start:5,end:8,title:'历史补载与章节定位',summary:'分段加载时保留此前索引。通过消息身份与标题层级精确定位。'},
          {start:9,end:12,title:'缓存、回退与验收',summary:'复用仍匹配的缓存，逐轮核对摘要和原文跳转。'},
        ],
        turns:evidence.map(turn=>({turn:turn.turn,question:turn.question ? questions[turn.turn-1] : '',answer:answers[turn.turn-1]})),
      };
      return new Response(JSON.stringify({status:'completed',output:[{type:'message',content:[{type:'output_text',text:JSON.stringify(result)}]}]}),
        {status:200,headers:{'Content-Type':'application/json'}});
    };
  });
  const configurePreparation=enabled=>sw.evaluate(async enable=>{
    const {threadWorkspacePreferences}=await chrome.storage.local.get('threadWorkspacePreferences');
    await chrome.storage.local.set({threadWorkspacePreferences:{...threadWorkspacePreferences,prepareTopicSummary:enable}});
    const [tab]=await chrome.tabs.query({active:true,url:'https://chatgpt.com/*'});
    await chrome.tabs.sendMessage(tab.id,{type:'THREAD_PILOT_PREFERENCES'},{frameId:0}).catch(()=>{});
  },enabled);
  await chat.bringToFront();
  await sw.evaluate(async()=>{
    const {threadWorkspacePreferences}=await chrome.storage.local.get('threadWorkspacePreferences');
    await chrome.storage.local.set({threadWorkspacePreferences:{...threadWorkspacePreferences,autoTopicSummary:true}});
  });
  await configurePreparation(true);
  await wait(()=>sw.evaluate(async()=>globalThis.fixtureTopicEvidence.length===1 &&
    Boolean((await chrome.storage.local.get('threadTopicCache')).threadTopicCache?.['c:historyfixture']?.overview)),
    '打开概览前应已准备完整会话摘要',10000).catch(async error=>{
    const state=await chatStatus();
    console.log(JSON.stringify({pref:state?.settings?.prepareTopicSummary,activity:state?.workflow?.activity?.phase,
      focus:await chat.evaluate(()=>document.hasFocus()),summary:await sw.evaluate(async()=>{
        const [tab]=await chrome.tabs.query({url:'https://chatgpt.com/c/historyfixture'});
        const browser=await chrome.windows.get(tab.windowId);
        const {threadTopicCache}=await chrome.storage.local.get('threadTopicCache');
        return {active:tab.active,focused:browser.focused,calls:globalThis.fixtureTopicEvidence.map(evidence=>evidence.length),
          cached:Object.keys(threadTopicCache||{})};
      })}));
    throw error;
  });
  await chat.evaluate(()=>{
    const host=document.querySelector('#threaddeck-host');
    const observer=new MutationObserver(()=>{
      if(host.dataset.overview!=='true')return;
      const root=host.shadowRoot;
      window.fixtureFirstDigest={summary:Boolean(root.querySelector('.zoom-conversation-summary').textContent),
        answers:root.querySelectorAll('.zoom-line[data-role="assistant"][data-digest="true"]').length};
      observer.disconnect();
    });
    observer.observe(host,{attributes:true,attributeFilter:['data-overview']});
  });
  const zoomBefore=await sw.evaluate(async()=>chrome.tabs.getZoom((await chrome.tabs.query({url:'https://chatgpt.com/c/historyfixture'}))[0].id));
  const cdp=await ctx.newCDPSession(chat);
  const b=await chat.locator('#quote').boundingBox();
  const w=b.x+Math.min(16,b.width/2), y=b.y+Math.min(9,b.height/2);
  await cdp.send('Input.dispatchMouseEvent',{type:'mouseWheel',x:w,y,deltaX:0,deltaY:61,modifiers:2});
  await host.locator('.semantic-zoom[data-settled="true"]').waitFor({state:'visible',timeout:5000});
  assert.match(await host.locator('.zoom-coverage').innerText(),/完整会话 · 12 轮/);
  assert.equal(await overview.locator('.zoom-line[data-role="user"]').count(),12);
  assert.equal(await overview.locator('.zoom-line[data-role="assistant"]').count(),12);
  await overview.locator('.zoom-conversation-summary',{hasText:'处置顺序'}).waitFor({timeout:8000}).catch(async error=>{
    console.log('摘要失败状态',await overview.locator('.zoom-ai-status').textContent(),
      await overview.locator('.zoom-coverage').textContent(),
      await sw.evaluate(async id=>({
        diagnostic: (await chrome.tabs.sendMessage(id,{type:'PROMPT_RAIL_GET_STATUS'},{frameId:0}))?.workflow?.activity,
        calls:globalThis.fixtureTopicEvidence.length,
        evidenceLength:globalThis.fixtureTopicEvidence[0]?.length,
        hasKey:Boolean((await chrome.storage.session.get('apiKey')).apiKey),
      }),(await sw.evaluate(async()=>(await chrome.tabs.query({url:'https://chatgpt.com/c/historyfixture'}))[0].id))));
    throw error;
  });
  const digestQuestions=await overview.locator('.zoom-line[data-role="user"][data-digest="true"]').allTextContents();
  assert.equal(digestQuestions.length,12);
  assert.equal(digestQuestions[0],'哪些条件需要先确认？');
  assert.equal(digestQuestions.at(-1),'接下来按什么顺序做？');
  const digestAnswers=await overview.locator('.zoom-line[data-role="assistant"][data-digest="true"]').allTextContents();
  assert.equal(digestAnswers.length,12);
  assert.equal(digestAnswers.at(-1),'从授权、索引到核对逐步完成，最后检查安全边界。');
  assert.equal(await overview.getByRole('button',{name:'生成 AI 摘要'}).count(),0);
  const topic = overview.getByRole('navigation',{name:'跳转到主题'})
    .getByRole('button',{name:'适用条件与执行限制'});
  await topic.click();
  assert(await overview.locator('.zoom-topic[data-topic-start="0"] h3').evaluate(node=>{
    const list=node.closest('.zoom-list').getBoundingClientRect();
    const title=node.getBoundingClientRect();
    return title.top>=list.top && title.bottom<=list.bottom;
  }));
  assert.deepEqual(await chat.evaluate(()=>window.fixtureFirstDigest),{summary:true,answers:12});
  assert.equal(await sw.evaluate(()=>globalThis.fixtureTopicEvidence.length),1);
  note('前台会话空闲时已完成模型准备，捏合首帧即有真实逐轮摘要，无第二次请求。');
  await configurePreparation(false);
  const [evidence]=await sw.evaluate(()=>globalThis.fixtureTopicEvidence);
  assert.equal(evidence.length,12);
  assert.match(evidence[1].answer,/首段证据[\s\S]*中段保留标记[\s\S]*尾段限制标记/);
  assert(!evidence[1].answer.includes(' … '));
  assert.match(evidence.at(-1).answer,/补载正文标记/);
  const bubbleStyles=await overview.evaluate(root=>{
    const row=root.querySelector('.zoom-exchange');
    const question=row.querySelector('.zoom-line[data-role=user]');
    const answer=row.querySelector('.zoom-line[data-role=assistant]');
    const summary=root.querySelector('.zoom-conversation-summary');
    const metrics=node=>({background:getComputedStyle(node).backgroundColor,radius:parseFloat(getComputedStyle(node).borderRadius),
      font:parseFloat(getComputedStyle(node).fontSize),box:node.getBoundingClientRect()});
    return {conversation:metrics(row),question:metrics(question),answer:metrics(answer),summary:metrics(summary)};
  });
  assert(Math.abs(bubbleStyles.question.box.right-bubbleStyles.conversation.box.right)<1);
  assert(Math.abs(bubbleStyles.answer.box.left-bubbleStyles.conversation.box.left)<1);
  for(const item of [bubbleStyles.question,bubbleStyles.answer,bubbleStyles.summary]) {
    assert.notEqual(item.background,'rgba(0, 0, 0, 0)');
    assert(item.radius>=10);
  }
  assert(bubbleStyles.summary.font>bubbleStyles.answer.font);
  await overview.screenshot({path:path.join(base,'overview.png')});
  await chat.evaluate(()=>{
    document.documentElement.setAttribute('data-theme','dark');
    document.body.style.backgroundColor='rgb(28, 25, 36)';
    document.body.style.color='rgb(244, 238, 255)';
    document.querySelector('#thread').style.backgroundColor='rgb(28, 25, 36)';
    document.querySelector('#thread').style.color='rgb(244, 238, 255)';
  });
  await wait(()=>overview.evaluate(element=>
    element.style.getPropertyValue('--zoom-background')==='rgb(28, 25, 36)'),
    '已打开的概览没有跟随 ChatGPT 主题');
  await overview.screenshot({path:path.join(base,'overview-dark.png')});
  const checkOverviewWidth=width=>overview.evaluate((surface,expectedWidth)=>{
    const edge=surface.getBoundingClientRect();
    const list=surface.querySelector('.zoom-list');
    const top=surface.querySelector('.zoom-top');
    const summary=top.querySelector('.zoom-conversation-summary').getBoundingClientRect();
    const close=top.querySelector('.zoom-return').getBoundingClientRect();
    const containsHorizontally=box=>box.width>0 && box.left>=edge.left-1 && box.right<=edge.right+1;
    return innerWidth===expectedWidth && edge.width>200 && edge.left>=-1 && edge.right<=innerWidth+1 &&
      list.scrollWidth<=list.clientWidth+1 && top.scrollWidth<=top.clientWidth+1 &&
      containsHorizontally(summary) && containsHorizontally(close);
  },width);
  for(const width of [390,1680,1240]){
    await chat.setViewportSize({width,height:880});
    await wait(()=>checkOverviewWidth(width),'概览水平布局或摘要溢出 '+width);
  }
  await chat.waitForFunction(()=>document.querySelector('#threaddeck-host').shadowRoot
    .querySelector('.semantic-zoom').dataset.settled==='true');
  assert.equal(await overview.locator('.zoom-line[data-role="assistant"][data-digest="true"]').count(),12);
  assert.equal(await sw.evaluate(()=>globalThis.fixtureTopicEvidence.length),1);
  note('暗色会话概览在 390、1240 和 1680 像素视口切换后完整显示，没有横向溢出或新增模型请求。');
  await cdp.send('Input.dispatchMouseEvent',{type:'mouseWheel',x:w,y,deltaX:0,deltaY:-75,modifiers:2});
  await overview.waitFor({state:'hidden',timeout:5000});
  const zoomAfter=await sw.evaluate(async()=>chrome.tabs.getZoom((await chrome.tabs.query({url:'https://chatgpt.com/c/historyfixture'}))[0].id));
  assert.equal(zoomBefore,zoomAfter,'浏览器页面缩放不应收到应用接管的事件');
  await cdp.send('Input.dispatchMouseEvent',{type:'mouseWheel',x:w,y,deltaX:0,deltaY:61,modifiers:2});
  await overview.locator('.zoom-conversation-summary',{hasText:'处置顺序'}).waitFor();
  assert.equal(await sw.evaluate(()=>globalThis.fixtureTopicEvidence.length),1);
  await chat.keyboard.press('Escape');
  await overview.waitFor({state:'hidden'});
  await cdp.send('Emulation.setTouchEmulationEnabled',{enabled:true,maxTouchPoints:2});
  const fingers = (space)=>[{id:1,x:w+95-space,y},{id:2,x:w+95+space,y}];
  await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:fingers(80)});
  for (const space of [64,51,37,22])
    await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:fingers(space)});
  await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  await host.locator('.semantic-zoom[data-settled="true"]').waitFor({state:'visible',timeout:5000});
  await overview.locator('.zoom-conversation-summary',{hasText:'处置顺序'}).waitFor();
  assert.equal(await sw.evaluate(()=>globalThis.fixtureTopicEvidence.length),1);
  await cdp.send('Emulation.setTouchEmulationEnabled',{enabled:false});
  note('触摸屏两指手势进入同一会话概览，显示模型逐轮问答和会话摘要。');
  assert.deepEqual(requests.filter(r=>r.path.startsWith('/backend-api')).map(r=>r.path),
    ['/backend-api/conversation',historyEndpoint,historyEndpoint,historyEndpoint]);
  note('捏合自动生成摘要，重开命中会话缓存，模型请求只发生一次。历史请求由宿主页面发出。');
  await chat.goto('https://chatgpt.com/c/'+viewportId);
  assert.equal(await chat.locator('[data-user-message-bubble]').count(),0);
  const nativeOutline = host.locator('.preview-panel');
  const initialRows = nativeOutline.locator('.outline-group');
  await initialRows.nth(1).waitFor({state:'attached'});
  assert.equal(await initialRows.count(),2);
  assert.equal(await initialRows.filter({hasText:'不应成为大纲的任务标题'}).count(),0);
  assert.equal(await chat.evaluate(()=>window.fixtureNativeLoads),0);
  await host.locator('.compact-rail .rail-item').last().hover();
  await nativeOutline.locator('.td-pin').click();
  await initialRows.nth(3).waitFor({state:'visible',timeout:16000}).catch(async error=>{
    console.log(await chat.evaluate(()=>{
      const host=document.querySelector('#threaddeck-host').shadowRoot;
      const viewport=document.querySelector('#fixture-history-viewport');
      return {rows:host.querySelectorAll('.outline-group').length,pinned:host.querySelector('.navigator').dataset.pinned,
        coverage:host.querySelector('.td-outline-coverage').innerText,top:viewport.scrollTop,loads:window.fixtureNativeLoads};
    }));
    throw error;
  });
  await nativeOutline.locator('.td-outline-coverage').waitFor({state:'hidden',timeout:16000});
  const initialLabels=await initialRows.allTextContents();
  assert.match(initialLabels[0],/最早的问题/);
  assert.match(initialLabels[1],/第二个问题/);
  const outlinePosition = await chat.locator('#fixture-history-viewport').evaluate(node=>node.scrollHeight-node.clientHeight-node.scrollTop);
  assert(outlinePosition<=4,'大纲补载结束后应返回原阅读位置');
  assert.equal(await overview.isVisible(),false);
  assert.equal(await sw.evaluate(()=>globalThis.fixtureTopicEvidence.length),1);
  const outlineSearch = nativeOutline.locator('.td-search');
  await outlineSearch.fill('最早的问题');
  assert.equal(await initialRows.count(),1);
  await initialRows.first().locator('.answer-item',{hasText:'重复章节标题'}).click();
  await wait(()=>chat.locator('#fixture-native-heading-1').evaluate(node=>{
    const box=node.getBoundingClientRect(), view=document.querySelector('#fixture-history-viewport').getBoundingClientRect();
    return box.top>=view.top-1&&box.bottom<=view.bottom;
  }), '大纲章节应返回最早问答原文');
  await outlineSearch.fill('');
  note('先打开大纲即见独立回复，自动补齐早期问答，再用搜索跳到同名章节原文，无模型请求。');
  await nativeOutline.locator('[data-action="open-topics"]').click();
  await overview.waitFor({state:'visible',timeout:5000});
  await chat.waitForFunction(()=>{
    const body=document.querySelector('#fixture-native-turns');
    return getComputedStyle(body).filter==='opacity(0)' && body.getBoundingClientRect().height>0;
  });
  await overview.locator('.zoom-coverage',{hasText:'完整会话 · 4 轮'}).waitFor({timeout:16000}).catch(async error=>{
    console.log(JSON.stringify({coverage:await overview.locator('.zoom-coverage').textContent(),status:await overview.locator('.zoom-ai-status').textContent(),loads:await chat.evaluate(()=>window.fixtureNativeLoads)}));
    throw error;
  });
  await overview.locator('.zoom-conversation-summary',{hasText:'处置顺序'}).waitFor();
  assert.equal(await overview.locator('.zoom-line[data-role="user"]').count(),2);
  assert.equal(await overview.locator('.zoom-line[data-role="assistant"]').count(),4);
  assert.equal(await chat.evaluate(()=>window.fixtureNativeLoads),1);
  assert(await chat.evaluate(()=>window.fixtureNativeRebounds)>=2,'应复现分页前的宿主滚动回弹');
  assert(await chat.evaluate(()=>window.fixtureCompleteRebounds)>=2,'应复现分页完成后的宿主滚动回弹');
  assert.equal(await chat.locator('[data-threaddeck-history-lock]').count(),0);
  const beforeJumpIntent=await chat.evaluate(()=>window.fixtureHostReadIntents);
  assert(beforeJumpIntent>0,'历史补齐应向虚拟宿主交代阅读滚动意图');
  await chat.evaluate(()=>window.fixturePrepareChapterJump());
  await overview.locator('.zoom-chapters summary').first().click();
  await overview.locator('.zoom-chapter',{hasText:'重复章节标题'}).first().click();
  await overview.waitFor({state:'hidden',timeout:7000});
  const jump=await chat.locator('#fixture-native-heading-1').evaluate(node=>{
    const box=node.getBoundingClientRect(), viewport=document.querySelector('#fixture-history-viewport');
    const view=viewport.getBoundingClientRect();
    return {inside:box.top>=view.top-1&&box.bottom<=view.bottom,top:box.top,bottom:box.bottom,scroll:viewport.scrollTop};
  });
  assert(jump.inside,'同名章节必须返回第一轮原文 '+JSON.stringify(jump));
  assert.equal(await chat.evaluate(()=>window.fixtureJumpRebounds),1);
  assert(await chat.evaluate(()=>window.fixtureHostReadIntents)>beforeJumpIntent);
  const requestsAfterNative=await sw.evaluate(()=>globalThis.fixtureTopicEvidence.length);
  assert.equal(requestsAfterNative,2);
  const nativeEvidence=await sw.evaluate(()=>globalThis.fixtureTopicEvidence.at(-1));
  assert.equal(nativeEvidence.filter(turn=>!turn.question).length,2);
  assert.match(nativeEvidence[0].answer,/只在打开概览后加载可见历史/);
  assert.equal(nativeEvidence.at(-1).answer,'此轮已生成图片。');
  await host.locator('.compact-rail .rail-item').last().hover();
  await host.locator('[data-action="open-topics"]').click();
  await overview.locator('.zoom-conversation-summary',{hasText:'处置顺序'}).waitFor({timeout:16000});
  assert.equal(await sw.evaluate(()=>globalThis.fixtureTopicEvidence.length),requestsAfterNative);
  await chat.evaluate(()=>sessionStorage.setItem('fixture-progressive-cold-jump','on'));
  await chat.reload();
  await chat.bringToFront();
  await chat.emulateMedia({reducedMotion:'no-preference'});
  await host.locator('.compact-rail .rail-item').last().hover();
  const overviewProfiler=await ctx.newCDPSession(chat);
  await overviewProfiler.send('Performance.enable');
  const idleFrameP95=await chat.evaluate(()=>new Promise(resolve=>{
    const times=[];
    let previous;
    const sample=now=>{
      if(previous!==undefined)times.push(now-previous);
      previous=now;
      if(times.length<24)requestAnimationFrame(sample);
      else resolve(Math.round(times.sort((a,b)=>a-b)[Math.ceil(times.length*.95)-1]));
    };
    requestAnimationFrame(sample);
  }));
  await chat.locator('#fixture-history-viewport').evaluate(node=>{
    window.fixtureWarmScrollWrites=0;
    const scrollTo=node.scrollTo.bind(node);
    node.scrollTo=(...args)=>{window.fixtureWarmScrollWrites++;return scrollTo(...args);};
    const shadow=node.ownerDocument.querySelector('#threaddeck-host').shadowRoot;
    const trigger=shadow.querySelector('[data-action="open-topics"]');
    const surface=shadow.querySelector('.semantic-zoom');
    const summary=surface.querySelector('.zoom-conversation-summary');
    trigger.addEventListener('click',()=>{
      const start=performance.now();
      const intervals=[];
      let previous, availableAt, visibleAt, settledAt;
      function sample(now){
        const elapsed=performance.now()-start;
        if(previous!==undefined)intervals.push(now-previous);
        previous=now;
        if(availableAt===undefined && !summary.hidden)availableAt=elapsed;
        if(visibleAt===undefined && !summary.hidden && getComputedStyle(summary).visibility==='visible') {
          visibleAt=elapsed;
        }
        if(settledAt===undefined && surface.dataset.settled==='true')settledAt=elapsed;
        if((settledAt===undefined || elapsed-settledAt<32) && elapsed<4000) {
          requestAnimationFrame(sample);
          return;
        }
        intervals.sort((a,b)=>a-b);
        window.fixtureOverviewTiming={
          availableMs:Math.round(availableAt),visibleMs:Math.round(visibleAt),
          settledMs:Math.round(settledAt),frames:intervals.length,
          p95Ms:Math.round(intervals[Math.ceil(intervals.length*.95)-1]),
          longestMs:Math.round(intervals.at(-1)),
        };
      }
      requestAnimationFrame(sample);
    },{capture:true,once:true});
  });
  const beforeOverview=new Map((await overviewProfiler.send('Performance.getMetrics')).metrics.map(({name,value})=>[name,value]));
  await host.locator('[data-action="open-topics"]').click();
  await overview.locator('.zoom-conversation-summary',{hasText:'处置顺序'}).waitFor({timeout:4000});
  assert.equal(await overview.locator('.zoom-line[data-role="user"][data-digest="true"]').count(),2);
  assert.equal(await overview.locator('.zoom-line[data-role="assistant"][data-digest="true"]').count(),4);
  assert.equal(await chat.evaluate(()=>window.fixtureNativeLoads),0);
  assert.equal(await chat.evaluate(()=>window.fixtureWarmScrollWrites),0);
  assert.equal(await sw.evaluate(()=>globalThis.fixtureTopicEvidence.length),requestsAfterNative);
  const cover=await overview.evaluate(layer=>{
    const overlay=layer.getBoundingClientRect();
    const viewport=document.querySelector('#fixture-history-viewport').getBoundingClientRect();
    return {opaque:getComputedStyle(layer.querySelector('.zoom-backdrop')).opacity,
      head:overlay.top<=viewport.top+1,bottom:overlay.bottom>=viewport.bottom-1};
  });
  assert.deepEqual(cover,{opaque:'1',head:true,bottom:true});
  await chat.waitForFunction(()=>Boolean(window.fixtureOverviewTiming),null,{timeout:5000});
  const overviewTiming=await chat.evaluate(()=>window.fixtureOverviewTiming);
  const afterOverview=new Map((await overviewProfiler.send('Performance.getMetrics')).metrics.map(({name,value})=>[name,value]));
  await overviewProfiler.detach();
  assert(overviewTiming.frames>=6 && Number.isFinite(overviewTiming.settledMs),
    '完整过渡必须有可测量的帧间隔 '+JSON.stringify(overviewTiming));
  assert(overviewTiming.availableMs<=overviewTiming.visibleMs && overviewTiming.visibleMs<=overviewTiming.settledMs+20,
    '缓存摘要应在概览过渡期间就绪并显示 '+JSON.stringify(overviewTiming));
  const cost=name=>Math.round((afterOverview.get(name)-beforeOverview.get(name))*1000);
  note('原文覆盖、零宿主滚动和零额外模型请求通过。缓存摘要就绪 '+overviewTiming.availableMs+
    ' ms，摘要可见 '+overviewTiming.visibleMs+' ms，过渡完成 '+overviewTiming.settledMs+
    ' ms。'+overviewTiming.frames+' 个帧间隔，p95 '+overviewTiming.p95Ms+' ms，最长 '+overviewTiming.longestMs+
    ' ms，空闲 p95 '+idleFrameP95+' ms，布局 '+cost('LayoutDuration')+' ms，脚本 '+cost('ScriptDuration')+' ms。');
  await overview.locator('.zoom-chapters summary').first().click();
  await overview.locator('.zoom-chapter',{hasText:'重复章节标题'}).first().click();
  await overview.waitFor({state:'hidden',timeout:7000}).catch(async error=>{
    console.log('冷启动定位回执',await sw.evaluate(async url=>{
      const [tab]=await chrome.tabs.query({url});
      return (await chrome.tabs.sendMessage(tab.id,{type:'PROMPT_RAIL_GET_STATUS'}))?.workflow?.navigation;
    },chat.url()),await overview.locator('.zoom-ai-status').textContent());
    throw error;
  });
  const coldJump=await chat.locator('#fixture-native-heading-1').evaluate(node=>{
    const box=node.getBoundingClientRect(), viewport=document.querySelector('#fixture-history-viewport');
    const view=viewport.getBoundingClientRect();
    return {inside:box.top>=view.top-1&&box.bottom<=view.bottom,top:box.top,bottom:box.bottom,
      scroll:viewport.scrollTop,loading:Boolean(document.querySelector('#fixture-native-loader'))};
  });
  assert(coldJump.inside&&!coldJump.loading,'冷启动查询缓存后，仍可跳到唯一的早期章节 '+JSON.stringify(coldJump));
  assert(await chat.evaluate(()=>window.fixtureIntermediateWindows)>=2,'冷启动应通过中间视口触发宿主逐段挂载');
  assert.equal(await chat.locator('#fixture-native-turns').evaluate(node=>getComputedStyle(node).filter),'none');
  assert.equal(await sw.evaluate(()=>globalThis.fixtureTopicEvidence.length),requestsAfterNative);
  note('脱离旧页面内存后，从缓存恢复议题和早期章节导航。点击才加载目标原文。');
  await chat.locator('#fixture-native-heading-1').evaluate(heading=>{
    heading.textContent='改写后的授权范围';
    heading.nextElementSibling.textContent='现在只接受第二位审核者的确认。';
  });
  await host.locator('.compact-rail .rail-item').first().hover();
  await host.locator('[data-action="open-topics"]').click();
  await wait(()=>sw.evaluate(count=>globalThis.fixtureTopicEvidence.length===count+1,requestsAfterNative),'同一消息已改写，应重新分析一次',17000);
  await overview.locator('.zoom-conversation-summary',{hasText:'处置顺序'}).waitFor({timeout:10000});
  const updatedEvidence=await sw.evaluate(()=>globalThis.fixtureTopicEvidence.at(-1)[0]);
  assert.match(updatedEvidence.answer,/现在只接受第二位审核者的确认/);
  assert(!updatedEvidence.answer.includes('只在打开概览后加载可见历史'));
  assert(updatedEvidence.sections.includes('改写后的授权范围'));
  assert(!updatedEvidence.sections.includes('重复章节标题'));
  await overview.getByRole('button',{name:'返回对话'}).click();
  await overview.waitFor({state:'hidden'});
  await host.locator('.compact-rail .rail-item').first().hover();
  await host.locator('[data-action="open-topics"]').click();
  await overview.locator('.zoom-conversation-summary',{hasText:'处置顺序'}).waitFor();
  assert.equal(await sw.evaluate(()=>globalThis.fixtureTopicEvidence.length),requestsAfterNative+1);
  note('相同消息 ID 的终态正文改写后重新分析一次，证据不再包含旧正文、旧章节，再打开沿用新缓存。');
  await sw.evaluate(()=>{globalThis.fixtureHoldNextDigest=true;});
  await chat.locator('#fixture-native-heading-1').evaluate(heading=>{
    heading.nextElementSibling.textContent='第三位审核者确认范围后生效。';
  });
  await wait(()=>sw.evaluate(count=>globalThis.fixtureTopicEvidence.length===count+2,requestsAfterNative),
    '打开概览期间，修订正文应进入摘要更新',14000);
  assert.equal(await overview.locator('.zoom-conversation-summary').isVisible(),true);
  await overview.locator('.zoom-ai-status',{hasText:'正在更新摘要'}).waitFor();
  await chat.locator('#fixture-native-heading-1').evaluate(heading=>{
    heading.nextElementSibling.textContent='最终以第四位审核者记录的范围为准。';
  });
  await sw.evaluate(()=>globalThis.fixtureReleaseDigest());
  await wait(()=>sw.evaluate(count=>globalThis.fixtureTopicEvidence.length===count+3,requestsAfterNative),
    '前一次请求结束后，应接上最新已确认修订',14000);
  const finalRevision=await sw.evaluate(()=>globalThis.fixtureTopicEvidence.at(-1)[0]);
  assert.match(finalRevision.answer,/最终以第四位审核者/);
  await overview.locator('.zoom-ai-status').waitFor({state:'hidden',timeout:10000});
  note('保持可读摘要直至更新完成，慢响应返回后仍处理最后一次确认的正文修订。');
  await overview.getByRole('button',{name:'返回对话'}).click();
  await overview.waitFor({state:'hidden'});
  await chat.emulateMedia({reducedMotion:'reduce'});
  await host.locator('.compact-rail .rail-item').first().hover();
  const motion=await overview.evaluate(surface=>{
    const trigger=surface.getRootNode().querySelector('[data-action="open-topics"]');
    const stream=surface.querySelector('.zoom-stream');
    return new Promise(resolve=>{
      let frames=0,scaled=false;
      const start=performance.now();
      function scan(){
        frames++;
        scaled=scaled || Boolean(stream.style.transform);
        if(surface.dataset.settled==='true' || performance.now()-start>2000) {
          resolve({frames,scaled,settled:surface.dataset.settled==='true'});
        } else requestAnimationFrame(scan);
      }
      trigger.click();
      scan();
    });
  });
  assert(motion.settled&&motion.frames>=2&&!motion.scaled,JSON.stringify(motion));
  await overview.locator('.zoom-conversation-summary',{hasText:'处置顺序'}).waitFor();
  await chat.keyboard.press('Escape');
  await overview.waitFor({state:'hidden'});
  assert.equal(await sw.evaluate(()=>globalThis.fixtureTopicEvidence.length),requestsAfterNative+3);
  await chat.emulateMedia({reducedMotion:'no-preference'});
  note('减少动态效果开启时概览只淡入淡出，内容保留，无额外模型调用。');

  await chat.goto('https://chatgpt.com/c/'+stalledId);
  await chat.bringToFront();
  const callsBeforeStall=await sw.evaluate(()=>globalThis.fixtureTopicEvidence.length);
  await configurePreparation(true);
  await wait(()=>sw.evaluate(async()=>Boolean((await chrome.storage.local.get('threadTopicCache')).threadTopicCache?.['c:stalledsummaryfixture:partial']?.overview?.historyPending)),
    '已有稳定回答时应先预制，并在概览内尝试补齐更早历史',10000);
  await host.locator('.compact-rail').hover();
  await host.locator('[data-action="open-topics"]').click();
  await overview.locator('.zoom-conversation-summary',{hasText:'周六 9 点试运行'}).waitFor({timeout:18000});
  assert.match(await overview.locator('.zoom-coverage').textContent(),/已读问答 · 3 轮/);
  await overview.locator('[data-action="recover-topics-history"]').waitFor({timeout:18000});
  assert(await overview.getAttribute('data-history-coverage'),'自动补齐必须已经实际检查网页历史');
  await wait(()=>sw.evaluate(async()=>!(await chrome.storage.local.get('threadTopicCache')).threadTopicCache?.['c:stalledsummaryfixture:partial']?.overview?.historyPending),
    '补齐没有新进展时应记住本次检查');
  assert.equal(await sw.evaluate(()=>globalThis.fixtureTopicEvidence.length),callsBeforeStall+1);
  const readEvidence=await sw.evaluate(()=>globalThis.fixtureTopicEvidence.at(-1));
  assert.deepEqual(readEvidence.map(turn=>turn.answer),[
    '重复章节标题\n\n周六 9 点试运行。遇雨延到周日，提前两小时通知。',
    '重复章节标题\n\n20 人和 50 本书达标只说明本轮成功。复盘通过后再决定是否常态化。',
    '重复章节标题\n\n扫码登记书名和编号。每场限收 80 本，余量留待下次。',
  ]);
  assert(readEvidence.every(turn=>turn.sections.includes('重复章节标题')));
  const grouped=overview.locator('.zoom-topic[data-merged="true"]');
  await grouped.getByText('周六 9 点启动',{exact:false}).waitFor();
  const sources=grouped.locator('.zoom-sources');
  assert.equal(await sources.evaluate(node=>node.open),false);
  const independent=overview.locator('.zoom-topic:not([data-merged]) .zoom-line[data-role="assistant"][data-digest]');
  assert.match(await independent.textContent(),/扫码登记书名和编号/);
  assert.equal(await host.locator('.preview-panel').isVisible(),false,'摘要打开后，大纲不应覆盖正文');
  await overview.screenshot({path:path.join(base,'partial-summary.png')});
  await sources.locator(':scope > summary').click();
  await sources.locator('.zoom-line[data-role="assistant"][data-digest]').nth(1).waitFor();
  assert.equal(await sources.locator('.zoom-line[data-role="assistant"][data-digest]').count(),2);
  const secondSource=sources.locator('.zoom-exchange').nth(1);
  await secondSource.locator('.zoom-chapters summary').click();
  await secondSource.locator('.zoom-chapter',{hasText:'重复章节标题'}).click();
  await overview.waitFor({state:'hidden',timeout:6000});
  await wait(()=>chat.locator('#fixture-native-heading-6').evaluate(node=>{
    const bounds=node.getBoundingClientRect(), viewport=document.querySelector('#fixture-history-viewport').getBoundingClientRect();
    return bounds.top>=viewport.top && bounds.bottom<=viewport.bottom;
  }),'合并主题应准确跳到所选原始章节');
  await chat.reload();
  await host.locator('.compact-rail').hover();
  await host.locator('[data-action="open-topics"]').click();
  await overview.locator('.zoom-conversation-summary',{hasText:'周六 9 点试运行'}).waitFor({timeout:4000});
  assert.match(await overview.locator('.zoom-coverage').textContent(),/已读问答 · 3 轮/);
  assert.equal(await chat.evaluate(()=>window.fixtureStalledScrolls),0);
  assert.equal(await sw.evaluate(()=>globalThis.fixtureTopicEvidence.length),callsBeforeStall+1);
  note('早期历史暂不可读时已准备三轮摘要，概览自动尝试补齐，合并后定位准确。刷新复用摘要与补齐回执。');
  await chat.close();

  // 关闭对话后 Chrome 可能激活验收页并将上一项标为已接手，先建立等待中的监听。
  await watch.locator('#state').evaluate(node=>{node.setAttribute('aria-busy','true');node.textContent='正在执行';});
  await sw.evaluate(async id=>globalThis.fixtureMenu({menuItemId:'watch-page',frameId:0},await chrome.tabs.get(id)),tabId);
  await wait(async()=>(await record())?.watching && (await record())?.state==='waiting','建立待完成的保护页');
  // 单独模拟闲置时间，分组动作仍由真实 tabs 和 tabGroups API 执行。
  const idlePages=[];
  for(const name of ['idle-a','idle-b','idle-pinned']){
    const page=await ctx.newPage();
    idlePages.push(page);
    await page.goto('https://watch.fixture.invalid/'+name);
  }
  const idleTabIds=await sw.evaluate(async()=>{
    const picked=await chrome.tabs.query({url:'https://watch.fixture.invalid/idle-*'});
    const pinned=picked.find(tab=>tab.url.endsWith('/idle-pinned'));
    await chrome.tabs.update(pinned.id,{pinned:true});
    return picked.filter(tab=>tab.id!==pinned.id).map(tab=>tab.id);
  });
  const tidyPanel=await ctx.newPage();
  await tidyPanel.goto(ext+'/sidepanel.html');
  await tidyPanel.bringToFront();
  await tidyPanel.getByRole('button',{name:'打开设置',exact:true}).click();
  await tidyPanel.getByRole('button',{name:'标签',exact:true}).click();
  await tidyPanel.locator('#smart-tabs').waitFor();
  await sw.evaluate(()=>{
    globalThis.fixtureTidyNow=Date.now;
    Date.now=()=>globalThis.fixtureTidyNow()+26*3600000;
  });
  try{
    const targetWindow=await sw.evaluate(async ids=>{
      const tab=await chrome.tabs.get(ids[0]);
      const fetchBefore=globalThis.fetch;
      globalThis.fixtureFetchBeforeSmart=fetchBefore;
      globalThis.fixtureSmartCalls=0;
      globalThis.fetch=async(url,options)=>{
        const request=JSON.parse(options?.body||'{}');
        if(!request.questions?.some(q=>q.name.startsWith('tab_')))return fetchBefore(url,options);
        globalThis.fixtureSmartCalls++;
        return new Response(JSON.stringify({
          answers:request.questions.map(q=>{
            const id=Number(q.name.slice(4));
            const peer=globalThis.fixtureLibraryPeer;
            const source=JSON.parse(request.input).find(tab=>tab.id===id);
            const join=source?.url.startsWith('https://read.fixture.invalid/')&&q.choices.some(choice=>choice.value==='tab-'+peer);
            const choice=ids.includes(id)?'shelve':join?'tab-'+peer:'keep';
            return {type:'choice',name:q.name,choice,confidence:.98,probabilities:[{value:choice,probability:.98}]};
          }),
          usage:{input_tokens:140,output_tokens:25}
        }),{status:200});
      };
      await chrome.storage.local.set({smartTabsEnabled:true});
      return tab.windowId;
    },idleTabIds);
    await sw.evaluate(async windowId=>{
      const tab=await chrome.tabs.create({windowId,url:'about:blank',active:false});
      await globalThis.fixtureSmart(windowId,tab.id);
      await chrome.tabs.remove(tab.id);
    },targetWindow);
    assert.equal(await sw.evaluate(()=>globalThis.fixtureSmartCalls),0);
    await sw.evaluate(win=>globalThis.fixtureSmart(win),targetWindow);
    const readTidy=()=>sw.evaluate(async ids=>{
      const groups=await chrome.tabGroups.query({title:'闲置标签'});
      const tabs=await chrome.tabs.query({});
      const group=groups[0];
      return {groups:groups.length,collapsed:group?.collapsed,
        members:tabs.filter(tab=>tab.groupId===group?.id).map(tab=>tab.id).sort(),
        onlySafe:tabs.filter(tab=>tab.groupId===group?.id).every(tab=>ids.includes(tab.id))};
    },idleTabIds);
    await wait(async()=>{const state=await readTidy();return state.groups===1&&state.collapsed;},'设置一次后应自动生成折叠分组');
    let tidy=await readTidy();
    assert.deepEqual(tidy.members,[...idleTabIds].sort());
    assert.equal(tidy.onlySafe,true);
    await sw.evaluate(id=>chrome.tabs.ungroup([id]),idleTabIds[0]);
    await wait(()=>sw.evaluate(async id=>Boolean((await chrome.storage.session.get('smartTabHeld')).smartTabHeld?.[id]),idleTabIds[0]),'取消分组应记住用户恢复意图');
    await sw.evaluate(win=>globalThis.fixtureSmart(win),targetWindow);
    tidy=await readTidy();
    assert.deepEqual(tidy.members,[idleTabIds[1]]);
    const source=await ctx.newPage();
    await source.goto('https://watch.fixture.invalid/library-planning');
    await source.evaluate(()=>{document.title='Community library setup';document.querySelector('h1').textContent='Community library volunteer plan';});
    const peer=await sw.evaluate(async()=>{
      const [peer]=await chrome.tabs.query({url:'https://watch.fixture.invalid/library-planning'});
      globalThis.fixtureLibraryPeer=peer.id;
      return peer.id;
    });
    const child=await ctx.newPage();
    await child.goto('https://read.fixture.invalid/circulation');
    const tab=await sw.evaluate(async()=>(await chrome.tabs.query({url:'https://read.fixture.invalid/circulation'}))[0].id);
    const autoGrouped={peer,tab};
    await wait(()=>sw.evaluate(async({peer,tab})=>{
      const [source,link]=await Promise.all([chrome.tabs.get(peer),chrome.tabs.get(tab)]);
      return link.groupId>=0&&source.groupId===link.groupId;
    },autoGrouped),'新开的跨站页面没有按模型判断自动归组',9500);
    await child.close();
    await source.close();
    note('另一个网站的新标签随页面载入自动归组，无需按整理按钮。');
    await tidyPanel.screenshot({path:path.join(base,'tidy-settings.png')});
    await tidyPanel.locator('#smart-tabs').uncheck();
    await wait(()=>sw.evaluate(async()=>!(await chrome.storage.local.get('smartTabsEnabled')).smartTabsEnabled),'关闭智能整理应停止后续分析');
    assert.equal(await sw.evaluate(async()=>Boolean(await chrome.alarms.get('tidy-tabs'))),false);
  }finally{await sw.evaluate(()=>{
    Date.now=globalThis.fixtureTidyNow;
    if(globalThis.fixtureFetchBeforeSmart)globalThis.fetch=globalThis.fixtureFetchBeforeSmart;
  });}
  await tidyPanel.close();
  for(const page of idlePages)await page.close();
  note('Chrome 原生标签按模型判定收纳，固定与监听页保留，手动取消分组后不会立即收回。');
  await watch.close();
  await ctx.close();
  const updatedManifest={...manifest,version:manifest.version+'.1'};
  fs.writeFileSync(path.join(copy,'manifest.json'),JSON.stringify(updatedManifest));
  ctx=await launch();
  await ctx.route('https://**/*',route=>route.abort());
  const restarted=ctx.serviceWorkers()[0]||await ctx.waitForEvent('serviceworker',{timeout:10000});
  assert.equal(restarted.url(),sw.url());
  assert.equal(await restarted.evaluate(()=>chrome.runtime.getManifest().version),updatedManifest.version);
  const restored=await ctx.newPage();
  await restored.setViewportSize({width:380,height:900});
  await restored.goto(ext+'/sidepanel.html?view=connection');
  await restored.locator('#key-state',{hasText:'已保存在当前 Chrome 配置'}).waitFor({timeout:8000}).catch(async error=>{
    const status=await restarted.evaluate(async()=>{
      const {settings}=await chrome.storage.local.get('settings');
      const {credentialStatus,credentialPersistedOrigin,apiKey}=await chrome.storage.session.get(['credentialStatus','credentialPersistedOrigin','apiKey']);
      return {rememberKey:settings?.rememberKey,storage:settings?.credentialStorage,credentialStatus,
        persistedOrigin:Boolean(credentialPersistedOrigin),hasKey:Boolean(apiKey),
        allowed:await chrome.permissions.contains({origins:['https://api.openai.com/*']})};
    });
    console.log(JSON.stringify({status,panel:await restored.locator('#key-state').textContent(),
      hidden:await restored.locator('#settings').getAttribute('hidden'),error:await restored.locator('#error').textContent()}));
    throw error;
  });
  assert.equal(await restored.locator('#api-key').inputValue(),'');
  assert(await restarted.evaluate(async()=>{
    const s=await chrome.storage.session.get('apiKey');
    return s.apiKey==='synthetic-profile-credential';
  }));
  await restored.screenshot({path:path.join(base,'connection-restored.png')});
  await restored.getByRole('button',{name:'移除密钥',exact:true}).click();
  await restored.locator('#forget-key').waitFor({state:'hidden'});
  assert.equal(await restarted.evaluate(async()=>Boolean((await chrome.storage.session.get('apiKey')).apiKey)),false);
  note('同一 Chrome 配置在扩展版本变化及完整退出后自动解密并恢复连接。移除操作清除当前会话与保存记录。');
  const syncSlot='encryptedModelConnection';
  const modelFixture=async worker=>worker.evaluate(()=>{
    globalThis.fixtureSyncChecks=0;
    globalThis.fetch=async url=>{
      if(url!=='https://api.openai.com/v1/decisions')throw Error('Unexpected real request');
      globalThis.fixtureSyncChecks++;
      return new Response(JSON.stringify({answers:[{type:'choice',name:'lifecycle',choice:'resume',confidence:.99,
        probabilities:[{value:'resume',probability:.99}]}]}));
    };
  });
  await modelFixture(restarted);
  await restored.locator('#api-key').fill('synthetic-synced-key');
  await restored.getByText('Chrome 同步',{exact:true}).click();
  const webauthn=await ctx.newCDPSession(restored);
  await webauthn.send('WebAuthn.enable');
  await webauthn.send('WebAuthn.addVirtualAuthenticator',{options:{
    protocol:'ctap2',ctap2Version:'ctap2_1',transport:'internal',hasResidentKey:true,
    hasUserVerification:true,isUserVerified:true,hasPrf:true,defaultBackupEligibility:true,defaultBackupState:true,
  }});
  await restored.getByRole('button',{name:'保存连接',exact:true}).click();
  await restored.locator('#api-receipt',{hasText:'连接验证通过'}).waitFor();
  const envelope=await restarted.evaluate(async key=>(await chrome.storage.sync.get(key))[key],syncSlot);
  assert.equal(envelope?.version,2);
  assert(envelope?.ciphertext);
  assert(!JSON.stringify(envelope).includes('synthetic-synced-key'));
  // 在合成设备间只搬运测试夹具，用于模拟 Chrome 密码管理工具恢复的 PRF 结果。
  const syntheticMaterial=await restored.evaluate(async passkey=>{
    const {recoverSyncPasskey}=await import(chrome.runtime.getURL('core/passkey.mjs'));
    return recoverSyncPasskey(passkey);
  },envelope.passkey);
  assert(!JSON.stringify(envelope).includes(syntheticMaterial));
  let other=await launch(otherProfile);
  try{
    await other.route('https://**/*',route=>route.abort());
    const worker=other.serviceWorkers()[0]||await other.waitForEvent('serviceworker');
    await modelFixture(worker);
    const second=await other.newPage();
    await second.addInitScript(({credentialId,prf})=>{
      const decode=base64=>Uint8Array.from(atob(base64.replaceAll('-','+').replaceAll('_','/')),c=>c.charCodeAt(0));
      Object.defineProperty(navigator.credentials,'get',{value:async()=>{
        const authenticatorData=new Uint8Array(37);
        authenticatorData[32]=0x0c;
        return {type:'public-key',rawId:decode(credentialId),response:{authenticatorData},
          getClientExtensionResults:()=>({prf:{results:{first:decode(prf)}}})};
      }});
    },{credentialId:envelope.passkey.credentialId,prf:syntheticMaterial});
    await second.goto(ext+'/sidepanel.html?view=connection');
    await second.locator('#api-key').fill('synthetic-existing-local-key');
    await second.getByRole('button',{name:'保存连接',exact:true}).click();
    await second.locator('#key-state',{hasText:'已保存在当前 Chrome 配置'}).waitFor();
    assert.equal(await second.locator('#sync-recovery').isVisible(),false);
    const checksBeforeRecovery=await worker.evaluate(()=>globalThis.fixtureSyncChecks);
    // 模拟加密记录晚于本地保存到达，且设置一直开着。
    await worker.evaluate(({slot,record})=>chrome.storage.sync.set({[slot]:record}),{slot:syncSlot,record:envelope});
    assert.equal(await worker.evaluate(async()=>(await chrome.storage.session.get('apiKey')).apiKey),'synthetic-existing-local-key');
    await second.getByText('Chrome 同步',{exact:true}).click();
    await second.locator('#sync-recovery').waitFor({state:'visible'});
    assert.equal(await second.locator('#sync-unlock').isVisible(),false);
    await second.getByRole('button',{name:'验证并恢复',exact:true}).click();
    await wait(()=>worker.evaluate(async id=>{
      const {connectionCheck}=await chrome.storage.local.get('connectionCheck');
      return connectionCheck?.revision===id&&connectionCheck?.ok===true;
    },envelope.id),'同步连接的这次验证未完成',6500).catch(async error=>{
      console.log('sync recovery',JSON.stringify({
        error:await second.locator('#settings-error').textContent(),
        receipt:await second.locator('#api-receipt').textContent(),
        status:await second.locator('#key-state').textContent(),
        permission:await worker.evaluate(()=>chrome.permissions.contains({origins:['https://api.openai.com/*']})),
        calls:await worker.evaluate(()=>globalThis.fixtureSyncChecks),
      }));
      throw error;
    });
    assert.equal(await second.locator('#api-key').inputValue(),'');
    assert.equal(await worker.evaluate(async()=>(await chrome.storage.session.get('apiKey')).apiKey),'synthetic-synced-key');
    assert.equal(await worker.evaluate(()=>globalThis.fixtureSyncChecks),checksBeforeRecovery+1);
    await restored.getByRole('button',{name:'在另一台设备使用',exact:true}).click();
    const pairing=restored.getByRole('dialog',{name:'设备配对码'});
    await pairing.getByRole('button',{name:'生成新码',exact:true}).click();
    const value=restored.locator('#sync-pairing-value');
    await value.waitFor({state:'visible'});
    const code=await value.inputValue();
    assert.match(code,/^TC-(?:[0-9A-F]{8}-){3}[0-9A-F]{8}$/);
    await pairing.getByRole('button',{name:'完成',exact:true}).click();
    await wait(async()=>await value.inputValue()==='','关闭配对对话框后应清除显示值');
    const paired=await restarted.evaluate(async key=>(await chrome.storage.sync.get(key))[key],syncSlot);
    assert.equal(paired.version,1);
    assert(!JSON.stringify(paired).includes(code));
    assert(!JSON.stringify(paired).includes('synthetic-synced-key'));
    await worker.evaluate(({slot,record})=>chrome.storage.sync.set({[slot]:record}),{slot:syncSlot,record:paired});
    await second.locator('#sync-unlock').waitFor({state:'visible'});
    await second.locator('#sync-unlock').fill('wrong-fixture-pairing-code');
    await second.locator('#sync-unlock').press('Enter');
    await second.locator('#sync-error',{hasText:'配对码或原同步口令不正确'}).waitFor();
    await second.locator('#sync-unlock').fill(code.toLowerCase());
    await second.locator('#sync-unlock').press('Enter');
    await second.locator('#key-state',{hasText:'Chrome 同步'}).waitFor();
    await wait(()=>worker.evaluate(async id=>{
      const {connectionCheck}=await chrome.storage.local.get('connectionCheck');
      return connectionCheck?.revision===id&&connectionCheck?.ok===true;
    },paired.id),'配对后应自动验证连接',6500);
    await other.close();
    other=await launch(otherProfile);
    await other.route('https://**/*',route=>route.abort());
    const newWorker=other.serviceWorkers()[0]||await other.waitForEvent('serviceworker');
    const reopened=await other.newPage();
    await reopened.goto(ext+'/sidepanel.html?view=connection');
    await reopened.locator('#key-state',{hasText:'Chrome 同步'}).waitFor();
    assert.equal(await reopened.locator('#sync-recovery').isVisible(),false);
    await newWorker.evaluate(key=>chrome.storage.sync.remove(key),syncSlot);
    await reopened.locator('#forget-key').waitFor({state:'hidden'});
    assert.equal(await newWorker.evaluate(async()=>(await chrome.storage.session.get('apiKey')).apiKey),undefined);
    note('第二个隔离 Chrome 配置的本地连接在同步记录抵达时保持可用，模拟平台通行密钥验证后迁移；更换配对码、错码重试、完整重启和撤回同步均通过。');
  }finally{await other.close();}
  assert.equal(errors.length,0,errors.join('\n'));
  fs.writeFileSync(path.join(base,'result.json'),JSON.stringify({checks,errors,requests,syntheticHost:true},null,2));
 }finally{
  await ctx.close();
  fs.rmSync(profile,{recursive:true,force:true});
  fs.rmSync(otherProfile,{recursive:true,force:true});
  fs.rmSync(copy,{recursive:true,force:true});
 }
})().then(()=>record('complete'),error=>{
  record('failed');
  console.error(error);
  process.exitCode=1;
}).finally(()=>fs.unlinkSync(lock));

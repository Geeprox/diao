const option = 'autoGroupLinks';
const ownership = 'linkGroups';
const color = 'purple';
const noGroup = -1;
const idleTitles = ['闲置标签', 'Idle tabs'];

function page(tab) {
  try {
    const url = new URL(tab.pendingUrl || tab.url);
    if (['http:', 'https:'].includes(url.protocol)) return url;
  } catch {}
  return null;
}

function nameFor(tab, url) {
  const title = tab.title?.replace(/\s+/g, ' ').trim();
  const short = title?.split(/ [|–—·] /, 1)[0] || url.hostname.replace(/^www\./, '');
  return Array.from(short).slice(0, 30).join('');
}

export function createLinkGroups(chrome) {
  const {local,session} = chrome.storage;
  const pending = new Map();
  const getTab = id => chrome.tabs.get(id).catch(()=>null);

  async function enabled() { return (await local.get(option))[option] !== false; }
  async function configure(value) {
    await local.set({[option]:value});
    if (!value) pending.clear();
    return value;
  }
  async function groupLink(id) {
    const candidate = pending.get(id);
    if (!candidate) return;
    const tab = await getTab(id);
    if (!tab || Date.now() - candidate.createdAt > 15000 || tab.windowId !== candidate.windowId ||
        tab.groupId !== noGroup || tab.pinned || tab.incognito) {
      pending.delete(id);
      return;
    }
    // Chrome 可能在 onCreated 之后才补发来源。等待真实 opener，独立标签保持原位。
    if (!Number.isInteger(tab.openerTabId)) return;
    if (tab.openerTabId === id || candidate.openerTabId != null && tab.openerTabId !== candidate.openerTabId) {
      pending.delete(id);
      return;
    }
    candidate.openerTabId = tab.openerTabId;
    if (!page(tab)) {
      // 新开标签的 URL 可能下一次才到。只保留临时空页，不把后续独立导航当作来源链接。
      const url = tab.pendingUrl || tab.url;
      if (url && url !== 'about:blank') pending.delete(id);
      return;
    }
    pending.delete(id);
    if (!await enabled()) return;
    const source = await getTab(candidate.openerTabId);
    const sourceURL = source && page(source);
    if (!sourceURL || source.incognito || source.windowId !== tab.windowId) return;
    const window = await chrome.windows.get(tab.windowId).catch(()=>null);
    if (window?.type !== 'normal' || window.incognito) return;
    if (source.groupId >= 0) {
      const group = await chrome.tabGroups.get(source.groupId).catch(()=>null);
      if (group && !group.collapsed && !idleTitles.includes(group.title) && group.windowId === tab.windowId)
        await chrome.tabs.group({groupId:group.id,tabIds:[id]});
      return;
    }
    // 只在后台打开的链接上移动来源页。前台弹窗、固定页和独立新标签保持浏览器原位。
    if (!candidate.background || tab.active || source.pinned || source.groupId !== noGroup) return;
    const title = nameFor(source,sourceURL);
    const idGroup = await chrome.tabs.group({tabIds:[source.id,id],createProperties:{windowId:tab.windowId}});
    await chrome.tabGroups.update(idGroup,{title,color});
    const {[ownership]:groups={}} = await session.get(ownership);
    groups[idGroup] = {source:source.id,windowId:tab.windowId,title};
    await session.set({[ownership]:groups});
  }

  async function created(tab) {
    if (!Number.isInteger(tab.id) || tab.incognito || tab.pinned || tab.openerTabId === tab.id || !(await enabled())) return;
    const now = Date.now();
    for (const [id,entry] of pending) {
      if (now-entry.createdAt>15000) pending.delete(id);
    }
    // 事件顺序可能重叠；浏览器的实时分组与窗口再次核对后才写入。
    pending.set(tab.id,{openerTabId:tab.openerTabId,windowId:tab.windowId,background:!tab.active,createdAt:now});
    await groupLink(tab.id);
  }

  async function prune(groupId) {
    const {[ownership]:groups={}} = await session.get(ownership);
    const claim = groups[groupId];
    if (!claim) return;
    const group = await chrome.tabGroups.get(groupId).catch(()=>null);
    const members = group ? await chrome.tabs.query({groupId,windowId:claim.windowId}) : [];
    if (group && group.title === claim.title && group.color === color && !group.collapsed &&
        group.windowId === claim.windowId && members.some(tab=>tab.id === claim.source)) {
      if (members.length > 1) return;
      if (await enabled()) await chrome.tabs.ungroup([claim.source]);
    }
    delete groups[groupId];
    await session.set({[ownership]:groups});
  }

  async function membershipChanged(windowId) {
    const {[ownership]:groups={}} = await session.get(ownership);
    for (const [groupId, claim] of Object.entries(groups)) {
      if (claim.windowId === windowId) await prune(Number(groupId));
    }
  }

  function removed(id) { pending.delete(id); }

  return {enabled,configure,created,groupLink,removed,membershipChanged,prune};
}

import test from 'node:test';
import assert from 'node:assert/strict';
import {createTidyTabs} from '../extension/core/tidy-tabs.mjs';

function storage() {
  const data = new Map();
  return {
    async get(key) { return {[key]:structuredClone(data.get(key))}; },
    async set(values) { for (const [key,value] of Object.entries(values)) data.set(key,structuredClone(value)); },
    clear() { data.clear(); },
  };
}

test('后台收纳跨重启复用已确认的分组，保护用户分组和刚恢复的标签', async () => {
  const old = Date.now()-26*3600000;
  const makeTab=(id,windowId,extra={})=>({id,windowId,lastAccessed:old,groupId:-1,status:'complete',
    url:'https://example.com/article-'+id,...extra});
  const tabs=[
    makeTab(1,1),makeTab(2,1),makeTab(3,1,{active:true}),makeTab(4,1,{pinned:true}),
    makeTab(5,1,{audible:true}),makeTab(6,1,{highlighted:true}),makeTab(7,1),
    makeTab(8,2),makeTab(9,2),makeTab(10,2,{groupId:90}),makeTab(11,1,{incognito:true}),
  ];
  const groups=[{id:90,windowId:2,title:'闲置标签',color:'grey',collapsed:true}];
  const local=storage(),session=storage(),created=[];
  const chrome={
    storage:{local,session},
    alarms:{get:async()=>null,create:async()=>{},clear:async()=>{}},
    windows:{getAll:async()=>[1,2].map(id=>({id,tabs:tabs.filter(tab=>tab.windowId===id)}))},
    tabGroups:{
      query:async({windowId,title,color})=>groups.filter(group=>group.windowId===windowId&&group.title===title&&group.color===color),
      get:async id=>groups.find(group=>group.id===id),
      update:async(id,changes)=>Object.assign(groups.find(group=>group.id===id),changes),
    },
    tabs:{
      query:async({windowId,groupId})=>tabs.filter(tab=>(windowId===undefined||tab.windowId===windowId)&&
        (groupId===undefined||tab.groupId===groupId)),
      group:async({groupId,tabIds,createProperties})=>{
        if (groupId===undefined) {
          groupId=100+created.length;
          groups.push({id:groupId,windowId:createProperties.windowId});created.push(groupId);
        }
        for (const tab of tabs) if (tabIds.includes(tab.id))tab.groupId=groupId;
        return groupId;
      },
    },
  };
  const tidy=createTidyTabs(chrome,async()=>({7:{url:tabs.find(tab=>tab.id===7).url,watching:true,state:'waiting'}}),()=>{});
  await tidy.sweep();
  assert.equal(created.length,0);
  await tidy.configure(24);
  await tidy.sweep();
  const grouped=id=>tabs.filter(tab=>tab.groupId===id).map(tab=>tab.id);
  assert.deepEqual(grouped(100),[1,2]);
  assert.deepEqual(grouped(90),[10]);
  assert.equal(groups.find(group=>group.id===100).collapsed,true);

  // Chrome 恢复窗口时重新分配分组 ID，已保存的内容指纹仍能核对。
  session.clear();
  groups.find(group=>group.id===100).id=101;
  for (const tab of tabs) if(tab.groupId===100)tab.groupId=101;
  tabs.push(makeTab(12,1));
  await tidy.sweep();
  assert.deepEqual(grouped(101),[1,2,12]);
  assert.equal(created.length,1);
  tabs[0].groupId=-1;
  await tidy.touch(1);
  await tidy.sweep();
  assert.deepEqual(grouped(101),[2,12]);
  assert.deepEqual(grouped(90),[10]);
});

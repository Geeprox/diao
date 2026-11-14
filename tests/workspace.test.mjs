import test from 'node:test';import assert from 'node:assert/strict';
import {duplicates,organizationPlan,identity,scheduledCandidate,attentionOrder} from '../extension/core/workspace.mjs';
const tab=(id,url,extra={})=>({id,url,title:'Task',windowId:1,index:id,groupId:-1,...extra});
test('duplicates preserve query, fragment, window and private boundaries',()=>{
 const tabs=[tab(1,'https://example.com/task?a=1'),tab(2,'https://example.com/task?a=2'),tab(3,'https://example.com/task?a=1',{active:true}),tab(4,'https://example.com/task?a=1',{windowId:2}),tab(5,'https://example.com/task?a=1',{incognito:true}),tab(6,'https://example.com/task?a=1#reply')];
 const result=duplicates(tabs);assert.deepEqual(Object.keys(result),['1','3']);assert.equal(result[1].keeperId,3);assert.equal(result[1].extra,true);assert.equal(result[3].extra,false);
});
test('organization leaves pinned, existing groups and other windows alone',()=>{
 const tabs=[tab(1,'https://a.com/1'),tab(2,'https://a.com/2'),tab(3,'https://a.com/3',{pinned:true}),tab(4,'https://a.com/4',{groupId:8}),tab(5,'https://a.com/5',{windowId:2})];
 const plan=organizationPlan(tabs,1);assert.equal(plan.tabCount,2);assert.deepEqual(plan.groups,[{title:'a.com',tabIds:[1,2]}]);
 assert.notEqual(plan.identity,identity(tabs.slice(0,4).map(t=>t.id===2?{...t,url:'https://a.com/new'}:t)));
});
test('scheduled review requires per-page consent, unchanged URL and genuine inactivity',()=>{
 const now=Date.now();const tabs=[tab(1,'https://a.com/1',{lastAccessed:now-700000}),tab(2,'https://a.com/2',{lastAccessed:now-700000}),tab(3,'https://a.com/3',{lastAccessed:now-700000,active:true})];
 const records={1:{url:tabs[0].url,autoReview:false},2:{url:tabs[1].url,autoReview:true},3:{url:tabs[2].url,autoReview:true}};
 assert.equal(scheduledCandidate(tabs,records,now).id,2);records[2].lastInteraction=now;assert.equal(scheduledCandidate(tabs,records,now),null);
});
test('attention ordering leads with work ready to resume',()=>{
 const tabs=[tab(1,'https://a.com'),tab(2,'https://b.com'),tab(3,'https://c.com')];assert.deepEqual(attentionOrder(tabs,{2:{state:'resume'},3:{state:'waiting'}}).map(t=>t.id),[2,3,1]);
});

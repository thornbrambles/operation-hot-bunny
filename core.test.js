import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Tournament,parseIRC,parseYouTube,videoId} from './core.js';
const roster=n=>Array.from({length:n},(_,i)=>({name:`Bunny ${i}`,picture:''}));
function vote(t,user,side,platform='twitch',sentAt=101,id){return t.cast({platform,userId:user,message:String(side),sentAt,id},200);}
test('all bracket sizes finish with exactly n-1 results; undo restores final',()=>{
  for(const n of [2,4,8,16,32]){const t=new Tournament(roster(n));for(let i=0;i<n-1;i++)t.pick(1);assert.equal(t.state.champion,0);assert.equal(t.state.history.length,n-1);t.undo();assert.equal(t.state.champion,null);assert.equal(t.state.pending.length,2);}
});
test('Twitch and YouTube combine, repeated account votes replace instead of stack',()=>{
  const t=new Tournament(roster(4));t.startVote(100);vote(t,'same-id',1);vote(t,'same-id',1);vote(t,'same-id',2);vote(t,'same-id',1,'youtube');vote(t,'second',2,'youtube');assert.deepEqual(t.vote.counts,[1,2]);assert.equal(t.closeVote(),2);assert.deepEqual(t.state.pending,[2,3]);assert.equal(t.vote.winnerIndex,1);assert.throws(()=>t.closeVote());assert.equal(t.state.history.length,1);
});
test('ties and no votes close without advancement',()=>{
  const t=new Tournament(roster(2));t.startVote(100);assert.equal(t.closeVote(),null);assert.equal(t.state.history.length,0);t.startVote(100);vote(t,'a',1);vote(t,'b',2);assert.equal(t.closeVote(),null);assert.equal(t.state.champion,null);
});
test('undo clears the winner presentation and old totals',()=>{const t=new Tournament(roster(4));t.startVote(100);vote(t,'a',1);t.closeVote();assert.equal(t.vote.winnerIndex,0);t.undo();assert.equal(t.vote.winnerIndex,undefined);assert.deepEqual(t.vote.counts,[0,0]);assert.deepEqual(t.state.pending,[0,1,2,3]);});
test('closed, old, invalid, duplicate, reordered and after-cutoff messages do not contaminate vote',()=>{
  const t=new Tournament(roster(2));assert.equal(vote(t,'a',1),false);t.startVote(100);
  assert.equal(vote(t,'a',1,'twitch',99),false);assert.equal(vote(t,'',1),false);assert.equal(vote(t,'a','1 please'),false);
  vote(t,'a',1,'twitch',110,'id-a');vote(t,'a',2,'twitch',120,'id-b');assert.equal(vote(t,'a',1,'twitch',130,'id-a'),false);assert.equal(vote(t,'a',1,'twitch',115,'id-c'),false);
  t.vote.cutoff=150;assert.equal(vote(t,'b',1,'youtube',151),false);assert.deepEqual(t.vote.counts,[0,1]);
  t.cancelVote();t.startVote(160);assert.equal(vote(t,'a',2,'youtube',120),false);assert.deepEqual(t.vote.counts,[0,0]);
});
test('backups restore images, progress, and undo without restoring an open vote or voter IDs',()=>{
  const t=new Tournament(roster(4));t.pick(2);t.startVote(100);vote(t,'private-account-id',1);const backup=t.backup();assert.ok(!JSON.stringify(backup).includes('private-account-id'));const restored=Tournament.restore(backup);assert.deepEqual(restored.state,t.state);assert.equal(restored.vote.open,false);restored.undo();assert.deepEqual(restored.state.pending,[0,1,2,3]);assert.throws(()=>Tournament.restore({version:1,state:{...backup.state,pending:[100,100]}}));assert.throws(()=>new Tournament([{name:'x',picture:'javascript:alert(1)'},{name:'y'}]));
});
test('chat parsers extract exact chat text, stable account IDs and sent timestamps',()=>{
  const event=parseIRC('@user-id=123;id=abc;tmi-sent-ts=1700000000000 :viewer!viewer@viewer.tmi.twitch.tv PRIVMSG #channel :2');assert.equal(event.message,'2');assert.equal(event.userId,'123');assert.equal(event.sentAt,1700000000000);assert.equal(parseIRC('PING :tmi.twitch.tv'),null);
  const yt=parseYouTube({id:'msg',authorDetails:{channelId:'account'},snippet:{type:'textMessageEvent',publishedAt:'2026-10-11T20:00:00Z',textMessageDetails:{messageText:'1'}}});assert.equal(yt.userId,'account');assert.equal(yt.message,'1');assert.equal(parseYouTube({snippet:{type:'superChatEvent'}}),null);
});
test('video URL parsing only accepts YouTube hosts',()=>{assert.equal(videoId('https://youtu.be/abcdefghijk'),'abcdefghijk');assert.equal(videoId('https://youtube.com/live/abcdefghijk'),'abcdefghijk');assert.equal(videoId('https://youtube.com/watch?v=abcdefghijk'),'abcdefghijk');assert.equal(videoId('https://evil.example/watch?v=abcdefghijk'),null);});

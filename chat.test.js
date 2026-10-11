import {test} from 'node:test';
import assert from 'node:assert/strict';
import {TwitchChat,YouTubeChat} from './chat.js';
test('Twitch authenticates, responds to ping, emits channel messages, and reports disconnect',async()=>{
  let ws;class Socket{constructor(url){assert.ok(url.startsWith('wss://'));this.sent=[];ws=this;}send(s){this.sent.push(s);}close(){}}
  const votes=[],statuses=[],errors=[];const t=new TwitchChat({Socket,fetcher:async()=>({ok:true,json:async()=>({client_id:'app',scopes:['chat:read'],login:'host'})}),onVote:v=>votes.push(v),onStatus:s=>statuses.push(s),onFailure:s=>errors.push(s)});
  try{await t.connect('test-token','app','channel');ws.onopen();assert.ok(ws.sent.some(s=>s.includes('PASS oauth:test-token')));ws.onmessage({data:'PING :tmi.twitch.tv\r\n@room-id=1 :tmi.twitch.tv ROOMSTATE #channel\r\n@user-id=2;id=m;tmi-sent-ts=100 :a!a@a.tmi.twitch.tv PRIVMSG #channel :1\r\n'});assert.equal(t.ready,true);assert.ok(ws.sent.includes('PONG :tmi.twitch.tv\r\n'));assert.equal(votes.length,1);ws.onclose();assert.equal(t.ready,false);assert.equal(errors.length,1);}finally{t.disconnect();}
});
test('YouTube discards initial history, tracks pagination and sends new messages',async()=>{
  const calls=[],votes=[],errors=[];let pages=0;
  const y=new YouTubeChat({fetcher:async url=>{calls.push(url);if(url.includes('/videos?'))return {ok:true,json:async()=>({items:[{liveStreamingDetails:{activeLiveChatId:'chat'}}]})};pages++;return {ok:true,json:async()=>({nextPageToken:`page-${pages}`,pollingIntervalMillis:10000,items:[{id:`m${pages}`,authorDetails:{channelId:'u'},snippet:{type:'textMessageEvent',publishedAt:'2026-10-11T20:00:00Z',textMessageDetails:{messageText:'2'}}}]})};},onVote:v=>votes.push(v),onStatus:()=>{},onFailure:s=>errors.push(s)});
  try{await y.connect('token','abcdefghijk');assert.equal(y.ready,true);assert.equal(votes.length,0);await y.poll();assert.equal(votes.length,1);assert.ok(calls.at(-1).includes('pageToken=page-1'));assert.equal(errors.length,0);}finally{y.disconnect();}
});
test('YouTube quota errors stop polling and report actionable failure',async()=>{
  let error='';const y=new YouTubeChat({fetcher:async url=>url.includes('/videos?')?{ok:true,json:async()=>({items:[{liveStreamingDetails:{activeLiveChatId:'chat'}}]})}:{ok:false,status:403,json:async()=>({error:{errors:[{reason:'quotaExceeded'}]}})},onVote:()=>{},onStatus:()=>{},onFailure:s=>error=s});await y.connect('token','abcdefghijk');assert.equal(y.ready,false);assert.match(error,/quota/);y.disconnect();
});

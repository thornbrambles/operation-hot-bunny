import {parseIRC,parseYouTube,videoId} from './core.js';
export class TwitchChat {
  constructor({onVote,onStatus,onFailure,fetcher=fetch,Socket=WebSocket}) { Object.assign(this,{onVote,onStatus,onFailure,fetcher,Socket}); this.ready=false; }
  async validate(token,clientId) {
    const r=await this.fetcher('https://id.twitch.tv/oauth2/validate',{headers:{Authorization:`OAuth ${token}`},signal:AbortSignal.timeout(15000)});
    if(!r.ok)throw Error('Twitch sign-in expired. Connect again.');
    const user=await r.json();
    if(user.client_id!==clientId || !user.scopes?.includes('chat:read'))throw Error('Twitch sign-in does not match this app or lacks chat permission.');
    return user;
  }
  async connect(token,clientId,channel) {
    this.disconnect();
    channel=channel.trim().toLowerCase().replace(/^#/,'');
    if(!/^[a-z0-9_]{1,25}$/.test(channel))throw Error('Enter a Twitch channel login.');
    this.onStatus('Connecting…');
    const user=await this.validate(token,clientId);
    const ws=new this.Socket('wss://irc-ws.chat.twitch.tv:443');this.ws=ws;
    const current=()=>this.ws===ws;
    this.timeout=setTimeout(()=>{if(current()&&!this.ready)this.fail('Twitch did not join the channel. Check its name and reconnect.');},15000);
    ws.onopen=()=>{if(current()){ws.send('CAP REQ :twitch.tv/tags twitch.tv/commands\r\n');ws.send(`PASS oauth:${token}\r\nNICK ${user.login}\r\nJOIN #${channel}\r\n`);}};
    ws.onmessage=event=>{
      if(!current())return;
      for(const line of String(event.data).split('\r\n')) {
        if(line.startsWith('PING ')){ws.send(line.replace(/^PING/,'PONG')+'\r\n');continue;}
        if(line.includes('Login authentication failed') || line.includes('msg_channel_suspended') || line.includes('RECONNECT')){this.fail('Twitch connection interrupted. Connect again.');return;}
        if(line.includes(` ROOMSTATE #${channel}`) || new RegExp(` 366 ${user.login} #${channel} `).test(line)) {
          this.ready=true;clearTimeout(this.timeout);this.onStatus(`Connected to #${channel}`);
        }
        const vote=parseIRC(line);
        if(this.ready && vote?.channel===channel)this.onVote(vote);
      }
    };
    ws.onclose=()=>{if(current())this.fail('Twitch disconnected. Connect again.');};
    ws.onerror=()=>{if(current())this.fail('Could not connect to Twitch. Check your network and reconnect.');};
    this.validation=setInterval(()=>this.validate(token,clientId).catch(()=>{if(current())this.fail('Twitch sign-in expired. Connect again.');}),3600000);
  }
  fail(message){this.disconnect();this.onStatus(message);this.onFailure(message);}
  disconnect(){const ws=this.ws;this.ws=null;this.ready=false;clearTimeout(this.timeout);clearInterval(this.validation);if(ws)ws.close();this.onStatus('Not connected');}
}
export class YouTubeChat {
  constructor({onVote,onStatus,onFailure,fetcher=fetch}) {Object.assign(this,{onVote,onStatus,onFailure,fetcher});this.ready=false;this.generation=0;}
  async request(endpoint,params,token) {
    const r=await this.fetcher(`https://www.googleapis.com/youtube/v3/${endpoint}?${new URLSearchParams(params)}`,{headers:{Authorization:`Bearer ${token}`},signal:AbortSignal.timeout(15000)});
    if(!r.ok){const body=await r.json().catch(()=>({}));const reason=body.error?.errors?.[0]?.reason;throw Error(reason==='quotaExceeded'?'YouTube API quota exhausted. Try after its quota resets.':r.status===401?'YouTube sign-in expired. Connect again.':'YouTube could not read this live chat. Check the live video and API permissions.');}
    return r.json();
  }
  async connect(token,url) {
    this.disconnect();const generation=this.generation;
    const id=videoId(url);if(!id || !/^[\w-]{11}$/.test(id))throw Error('Enter a valid YouTube live video URL or ID.');
    this.onStatus('Finding live chat…');
    const data=await this.request('videos',{part:'liveStreamingDetails',id},token);
    if(generation!==this.generation)return;
    const chatId=data.items?.[0]?.liveStreamingDetails?.activeLiveChatId;
    if(!chatId)throw Error('This video has no active live chat. Start the stream and enable live chat.');
    this.token=token;this.chatId=chatId;this.page='';this.first=true;
    await this.poll();
  }
  async poll() {
    if(this.inFlight)return this.inFlight;
    const generation=this.generation;
    const work=async()=>{
      try {
        const params={liveChatId:this.chatId,part:'snippet,authorDetails',maxResults:2000};
        if(this.page)params.pageToken=this.page;
        const data=await this.request('liveChat/messages',params,this.token);
        if(generation!==this.generation)return;
        if(data.offlineAt)throw Error('The YouTube stream ended.');
        if(!this.first)for(const item of data.items || []){const vote=parseYouTube(item);if(vote)this.onVote(vote);}
        this.first=false;this.page=data.nextPageToken;this.ready=true;
        this.nextPollAt=Date.now()+Math.max(10000,Number(data.pollingIntervalMillis)||10000);
        this.onStatus('Connected · checks chat about every 10 seconds');
        clearTimeout(this.timer);this.timer=setTimeout(()=>this.poll(),this.nextPollAt-Date.now());
      } catch(e) {if(generation===this.generation){this.disconnect();this.onStatus(e.message);this.onFailure(e.message);}}
    };
    this.inFlight=work();
    try {await this.inFlight;} finally {if(generation===this.generation)this.inFlight=null;}
  }
  async flush() {
    if(!this.ready)return;
    const generation=this.generation;
    if(this.inFlight)await this.inFlight;
    if(generation!==this.generation || !this.ready)return;
    clearTimeout(this.timer);
    const wait=Math.max(0,(this.nextPollAt || 0)-Date.now());
    if(wait)await new Promise(resolve=>setTimeout(resolve,wait));
    if(generation!==this.generation || !this.ready)return;
    clearTimeout(this.timer);await this.poll();
  }
  disconnect(){this.generation++;this.ready=false;clearTimeout(this.timer);this.inFlight=null;this.token=null;this.onStatus('Not connected');}
}

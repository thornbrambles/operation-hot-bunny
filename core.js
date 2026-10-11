const sizes = [2, 4, 8, 16, 32];
export function validateEntries(entries) {
  if (!Array.isArray(entries) || !sizes.includes(entries.length)) throw Error('Use 2, 4, 8, 16, or 32 competitors.');
  return entries.map(e => {
    if (!e || typeof e.name !== 'string' || !e.name.trim() || e.name.length > 100) throw Error('Give every competitor a name (up to 100 characters).');
    const picture = e.picture || '';
    if (typeof picture !== 'string' || picture.length > 3_000_000 || (picture && picture !== './bunny.svg' && !/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(picture))) throw Error('Invalid competitor image. Use the image picker.');
    return {name:e.name.trim(), picture};
  });
}
function snapshot(s) { return {pending:s.pending.slice(), winners:s.winners.slice(), round:s.round, champion:s.champion}; }
function validateSnapshot(s, size) {
  if (!s || !Number.isInteger(s.round) || s.round < 1 || s.round > 5) throw Error('Invalid bracket round.');
  for (const key of ['pending','winners']) {
    if (!Array.isArray(s[key]) || s[key].length > size || s[key].some(i => !Number.isInteger(i) || i < 0 || i >= size)) throw Error('Invalid bracket competitors.');
  }
  if (new Set([...s.pending,...s.winners]).size !== s.pending.length + s.winners.length || s.pending.length % 2) throw Error('Invalid bracket matchup.');
  if (s.champion !== null && (!Number.isInteger(s.champion) || s.champion < 0 || s.champion >= size || s.pending.length || s.winners.length !== 1 || s.winners[0] !== s.champion)) throw Error('Invalid champion.');
  if (s.champion === null && s.pending.length < 2) throw Error('Missing active matchup.');
  return snapshot(s);
}
export class Tournament {
  constructor(entries) {
    this.state = {entries:validateEntries(entries), pending:entries.map((_,i)=>i), winners:[], round:1, champion:null, history:[]};
    this.vote = {open:false, counts:[0,0], result:'Ready when you are.', match:[]};
    this.voters = new Map(); this.messages = new Set();
  }
  static restore(data) {
    if (!data || data.version !== 1) throw Error('Unsupported backup file.');
    const t = new Tournament(data.state?.entries);
    Object.assign(t.state, validateSnapshot(data.state,t.state.entries.length));
    if (!Array.isArray(data.state.history) || data.state.history.length > 31) throw Error('Invalid undo history.');
    t.state.history = data.state.history.map(s=>validateSnapshot(s,t.state.entries.length));
    return t;
  }
  backup() { return {version:1,state:structuredClone(this.state)}; }
  startVote(now = Date.now()) {
    if (this.vote.open) throw Error('A vote is already open.');
    if (this.state.champion !== null) throw Error('The tournament already has a champion.');
    this.vote = {open:true,startedAt:now,counts:[0,0],result:'Type 1 or 2 in chat',match:this.state.pending.slice(0,2)};
    this.voters.clear(); this.messages.clear();
  }
  cast({platform,userId,message,id,sentAt}, now = Date.now()) {
    if (!this.vote.open || !['twitch','youtube','demo'].includes(platform) || typeof userId !== 'string' || !userId || typeof message !== 'string') return false;
    const text = message.trim();
    if (text !== '1' && text !== '2') return false;
    if (!Number.isFinite(sentAt) || sentAt < this.vote.startedAt || sentAt > now + 30_000 || sentAt > (this.vote.cutoff ?? Infinity)) return false;
    if (id && this.messages.has(platform + ':' + id)) return false;
    if (id) this.messages.add(platform + ':' + id);
    const key = platform + ':' + userId;
    const side = Number(text);
    const prev = this.voters.get(key);
    if (prev && sentAt < prev.sentAt) return false;
    if (prev?.side !== side) {
      if (prev) this.vote.counts[prev.side-1]--;
      this.vote.counts[side-1]++;
    }
    this.voters.set(key,{side,sentAt});
    return true;
  }
  closeVote() {
    if (!this.vote.open) throw Error('Start a vote first.');
    this.vote.open = false;
    const [a,b] = this.vote.counts;
    if (a === b) {
      this.vote.result = a ? 'It’s a tie. Vote again or choose a winner.' : 'No votes yet. Vote again or choose a winner.';
      return null;
    }
    const side = a > b ? 1 : 2;
    const name = this.state.entries[this.vote.match[side-1]].name;
    this.vote.winnerIndex = this.vote.match[side-1];
    this.vote.result = `${name} wins · ${a}–${b}`;
    this.pick(side, false);
    return side;
  }
  cancelVote(reason = 'Vote cancelled. Start again when ready.') {
    this.vote.open = false; this.vote.result = reason; this.voters.clear(); this.messages.clear();
  }
  pick(side, cancel = true) {
    const s = this.state;
    if (s.champion !== null || ![1,2].includes(side)) throw Error('Choose a winner in an active matchup.');
    s.history.push(snapshot(s));
    s.winners.push(s.pending[side-1]); s.pending = s.pending.slice(2);
    if (!s.pending.length) {
      if (s.winners.length === 1) s.champion = s.winners[0];
      else { s.pending = s.winners; s.winners = []; s.round++; }
    }
    if (cancel) this.cancelVote('Winner chosen manually.');
  }
  undo() {
    if (!this.state.history.length) throw Error('Nothing to undo yet.');
    Object.assign(this.state,this.state.history.pop()); this.cancelVote('Previous matchup restored.');
  }
}
export function parseIRC(line) {
  const match = /^(?:@([^ ]+) )?:[^ ]+ PRIVMSG #([^ ]+) :([\s\S]*)$/.exec(line);
  if (!match) return null;
  const tags = Object.fromEntries((match[1] || '').split(';').filter(Boolean).map(t=>{const i=t.indexOf('=');return [t.slice(0,i),t.slice(i+1)];}));
  return {platform:'twitch',userId:tags['user-id'],message:match[3],id:tags.id,sentAt:Number(tags['tmi-sent-ts']),channel:match[2]};
}
export function parseYouTube(item) {
  if (item.snippet?.type !== 'textMessageEvent') return null;
  return {platform:'youtube',userId:item.authorDetails?.channelId,message:item.snippet.textMessageDetails?.messageText,id:item.id,sentAt:Date.parse(item.snippet.publishedAt)};
}
export function videoId(value) {
  if (/^[\w-]{11}$/.test(value)) return value;
  try { const u=new URL(value); const host=u.hostname.replace(/^www\./,''); if(host==='youtu.be')return u.pathname.slice(1).split('/')[0]; if(['youtube.com','m.youtube.com'].includes(host))return u.searchParams.get('v') || /^\/(?:live|shorts)\/([\w-]{11})/.exec(u.pathname)?.[1]; } catch {}
  return null;
}

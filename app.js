import {Tournament,validateEntries} from './core.js';
import {load,save} from './storage.js';
import {TwitchChat,YouTubeChat} from './chat.js';
const $=id=>document.getElementById(id);
const defaults=['Moon Bunny','Sun Bunny','Forest Bunny','Snow Bunny'].map(name=>({name,picture:'./bunny.svg'}));
let tournament=new Tournament(defaults),lineup=structuredClone(defaults),imagesPending=0,ending=false,twitchToken='',saveChain=Promise.resolve(),demoMode=false;
function notice(text){$('notice').textContent=text;}
function persist(){const value={lineup:lineup.map(({name,picture})=>({name,picture})),backup:tournament.backup()};$('save-status').textContent='Saving…';saveChain=saveChain.catch(()=>{}).then(()=>save(value)).then(()=>{$('save-status').textContent='Saved on this device';}).catch(e=>{$('save-status').textContent='Not saved';notice(e.message);});return saveChain;}
function failure(text){if(tournament.vote.open){tournament.cancelVote('Chat interrupted. Reconnect and start a new vote.');renderStage();}notice(text);}
function incoming(vote){if(!demoMode && tournament.cast(vote))renderStage();}
const twitch=new TwitchChat({onVote:incoming,onStatus:t=>$('twitch-status').textContent=t,onFailure:failure});
const youtube=new YouTubeChat({onVote:incoming,onStatus:t=>$('youtube-status').textContent=t,onFailure:failure});
function config(){return {twitchClient:$('twitch-client').value.trim(),channel:$('twitch-channel').value.trim(),googleClient:$('google-client').value.trim(),video:$('youtube-video').value.trim()};}
function saveConfig(){try{localStorage.setItem('ohb-settings',JSON.stringify(config()));}catch{notice('Browser settings could not be saved.');}}
function renderStage(){
  const s=tournament.state,v=tournament.vote;
  const lastWinner=!v.open && v.winnerIndex!==undefined;
  $('round').textContent=s.champion!==null?'CHAMPION':lastWinner?'MATCH WINNER':`ROUND ${s.round}`;
  $('stage-title').textContent=s.champion!==null?'The crowd’s champion.':lastWinner?'This matchup’s winner.':'Who’s your favorite?';
  $('vote-status').textContent=ending?'Closing vote · checking the last YouTube messages…':v.open?(demoMode?'DEMO VOTE OPEN · Try 1 or 2':'VOTING OPEN · Type 1 or 2 in chat'):v.result;
  $('total').textContent=`${v.counts[0]+v.counts[1]} votes${demoMode?' · demo':''}`;
  $('stage-hint').textContent=s.champion!==null?'Thanks for voting ♥':v.open?'1 = left · 2 = right':'Waiting for the next vote';
  const showing=v.open?v.match:s.champion!==null?[s.champion]:lastWinner?[v.winnerIndex]:s.pending.slice(0,2);
  const match=$('matchup');match.replaceChildren();match.classList.toggle('champion',s.champion!==null || lastWinner);
  showing.forEach((index,side)=>{
    const entry=s.entries[index],card=document.createElement('article');card.className='fighter';
    if(s.champion===null && !lastWinner){const number=document.createElement('span');number.className='number';number.textContent=side+1;card.append(number);}
    if(entry.picture){const img=document.createElement('img');img.src=entry.picture;img.alt=entry.name;card.append(img);}else{const placeholder=document.createElement('div');placeholder.className='placeholder';placeholder.textContent='♥';card.append(placeholder);}
    const title=document.createElement('h3');title.textContent=entry.name;card.append(title);
    if(v.open){const tally=document.createElement('div');tally.className='tally';const count=v.counts[side],total=v.counts[0]+v.counts[1],percent=total?Math.round(count/total*100):0;tally.textContent=`${count} votes · ${percent}%`;const bar=document.createElement('div');bar.className='bar';const fill=document.createElement('i');fill.style.width=`${percent}%`;bar.append(fill);card.append(tally,bar);}
    match.append(card);
  });
  $('start-vote').disabled=v.open || s.champion!==null || ending;
  $('end-vote').disabled=!v.open || ending;
  $('cancel-vote').disabled=!v.open || ending;
  for(const id of ['pick-left','pick-right'])$(id).disabled=s.champion!==null || ending;
  $('undo').disabled=!s.history.length || ending;
  $('demo').disabled=v.open || ending;
  for(const id of ['connect-twitch','connect-youtube'])$(id).disabled=v.open || ending;
  $('create').disabled=imagesPending>0 || ending;
}
async function image(file,entry,box){
  if(entry.busy)return;
  if(!file || !['image/png','image/jpeg','image/webp','image/gif'].includes(file.type))return notice('Choose or copy a PNG, JPEG, WebP, or GIF image. Copy the image itself, not its link.');
  if(file.size>20*1024*1024)return notice('Please use an image smaller than 20 MB.');
  entry.busy=true;imagesPending++;renderStage();box.setAttribute('aria-busy','true');
  const url=URL.createObjectURL(file);
  try{const img=new Image();img.src=url;await img.decode();const scale=Math.min(1,800/Math.max(img.naturalWidth,img.naturalHeight));const canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(img.naturalWidth*scale));canvas.height=Math.max(1,Math.round(img.naturalHeight*scale));canvas.getContext('2d').drawImage(img,0,0,canvas.width,canvas.height);const picture=canvas.toDataURL('image/png');if(picture.length>3_000_000)throw Error('This image is too large after conversion. Try a smaller image.');entry.picture=picture;box.querySelector('img').src=picture;box.querySelector('img').hidden=false;await persist();notice('Picture saved. Save lineup & start bracket when your lineup is ready.');}
  catch(e){notice(`Could not load image: ${e.message}`);}finally{URL.revokeObjectURL(url);entry.busy=false;imagesPending--;box.removeAttribute('aria-busy');renderStage();}
}
function renderRoster(){
  $('roster').replaceChildren();
  lineup.forEach((entry,i)=>{
    const card=document.createElement('div');card.className='competitor';
    const box=document.createElement('div');box.className='drop';box.tabIndex=0;box.setAttribute('aria-label',`Paste or drop image for competitor ${i+1}`);
    const img=document.createElement('img');img.alt=`Competitor ${i+1} picture`;img.hidden=!entry.picture;if(entry.picture)img.src=entry.picture;const hint=document.createElement('span');hint.textContent='Drop or click + paste';box.append(img,hint);box.onclick=()=>box.focus();
    box.onpaste=e=>{const item=[...(e.clipboardData?.items||[])].find(x=>x.type.startsWith('image/'));if(item){e.preventDefault();image(item.getAsFile(),entry,box);}else notice('No image on the clipboard. Copy an image or choose a file.');};
    box.ondragover=e=>{e.preventDefault();box.classList.add('over');};box.ondragleave=()=>box.classList.remove('over');box.ondrop=e=>{e.preventDefault();box.classList.remove('over');image(e.dataTransfer.files[0],entry,box);};
    const label=document.createElement('label');label.textContent=`Competitor ${i+1}`;const input=document.createElement('input');input.value=entry.name;input.maxLength=100;input.oninput=()=>{entry.name=input.value;persist();};label.append(input);
    const picker=document.createElement('input');picker.type='file';picker.accept='image/png,image/jpeg,image/webp,image/gif';picker.hidden=true;picker.onchange=()=>{image(picker.files[0],entry,box);picker.value='';};
    const choose=document.createElement('button');choose.className='pick-file';choose.textContent='Choose image';choose.setAttribute('aria-label',`Choose image for competitor ${i+1}`);choose.onclick=()=>picker.click();
    const remove=document.createElement('button');remove.className='remove';remove.textContent='Remove';remove.setAttribute('aria-label',`Remove competitor ${i+1}`);remove.onclick=()=>{if(imagesPending)return notice('Wait for the image to finish.');lineup.splice(i,1);renderRoster();persist();};
    card.append(box,label,picker,choose,remove);$('roster').append(card);
  });$('add').disabled=lineup.length>=32;
}
function safe(action){return async()=>{try{await action();}catch(e){notice(e.message);}};}
$('add').onclick=()=>{if(imagesPending)return notice('Wait for the image to finish.');if(lineup.length>=32)return;lineup.push({name:'',picture:''});renderRoster();persist();};
$('create').onclick=safe(async()=>{const entries=validateEntries(lineup);if(!confirm('Save this lineup and replace the current bracket?'))return;tournament=new Tournament(entries);renderStage();await persist();notice('Bracket ready. Connect chat or try Demo mode, then start voting.');});
$('start-vote').onclick=safe(()=>{if(!demoMode && !twitch.ready && !youtube.ready)throw Error('Connect a chat first, or enable Demo mode to practice.');tournament.startVote();renderStage();notice('Voting is open.');});
$('end-vote').onclick=safe(async()=>{ending=true;renderStage();try{tournament.vote.cutoff=Date.now();if(!demoMode && youtube.ready)await youtube.flush();if(!tournament.vote.open)throw Error('Chat was interrupted. No winner was selected. Start a fresh vote.');tournament.closeVote();await persist();notice(tournament.vote.result);}finally{ending=false;renderStage();}});
$('cancel-vote').onclick=()=>{tournament.cancelVote();renderStage();};
for(const [id,side] of [['pick-left',1],['pick-right',2]])$(id).onclick=safe(async()=>{if(!confirm(`Advance competitor ${side} as the winner?`))return;tournament.pick(side);renderStage();await persist();});
$('undo').onclick=safe(async()=>{tournament.undo();renderStage();await persist();});
$('demo').onchange=()=>{demoMode=$('demo').checked;$('demo-controls').hidden=!demoMode;tournament.cancelVote(demoMode?'Demo mode · practice without chat':'Ready for live chat.');renderStage();};
for(const [id,side] of [['demo-one',1],['demo-two',2]])$(id).onclick=()=>{if(demoMode && tournament.cast({platform:'demo',userId:$('demo-user').value.trim(),message:String(side),sentAt:Date.now()}))renderStage();};
function capture(on){document.body.classList.toggle('capture',on);$('exit-capture').hidden=!on;if(on)window.scrollTo(0,0);}
$('capture').onclick=()=>capture(true);$('exit-capture').onclick=()=>capture(false);document.addEventListener('keydown',e=>{if(e.key==='Escape')capture(false);});
$('export').onclick=()=>{const blob=new Blob([JSON.stringify(tournament.backup(),null,2)],{type:'application/json'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download='operation-hot-bunny-backup.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);notice('Exported the active bracket. Save lineup first to include draft changes.');};
$('import').onchange=safe(async()=>{const file=$('import').files[0];$('import').value='';if(!file)return;if(file.size>100*1024*1024)throw Error('Backup file is too large.');const restored=Tournament.restore(JSON.parse(await file.text()));if(imagesPending || ending)throw Error('Wait until saving or voting finishes.');if(!confirm('Replace your lineup and bracket with this backup?'))return;tournament=restored;lineup=structuredClone(tournament.state.entries);renderRoster();renderStage();await persist();notice('Backup restored. Reconnect chat before voting.');});
$('connect-twitch').onclick=safe(async()=>{saveConfig();const c=config();if(!c.twitchClient)throw Error('Enter your Twitch app client ID. See the setup guide.');if(twitchToken){await twitch.connect(twitchToken,c.twitchClient,c.channel);return;}await persist();const state=crypto.randomUUID();sessionStorage.setItem('ohb-oauth-state',state);const redirect=location.origin+location.pathname;const url=new URL('https://id.twitch.tv/oauth2/authorize');url.search=new URLSearchParams({client_id:c.twitchClient,redirect_uri:redirect,response_type:'token',scope:'chat:read',state});location.assign(url);});
$('disconnect-twitch').onclick=()=>{if(twitch.ready)failure('Twitch disconnected.');twitch.disconnect();twitchToken='';};
let googleScript;
function google(){return googleScript ||= new Promise((resolve,reject)=>{if(window.google?.accounts?.oauth2)return resolve();const script=document.createElement('script');script.src='https://accounts.google.com/gsi/client';script.onload=()=>resolve();script.onerror=()=>{googleScript=null;reject(Error('Could not load Google sign-in. Check your network.'));};document.head.append(script);});}
$('connect-youtube').onclick=safe(async()=>{saveConfig();const c=config();if(!c.googleClient)throw Error('Enter your Google app client ID. See the setup guide.');if(!c.video)throw Error('Enter your YouTube live video URL.');await google();window.google.accounts.oauth2.initTokenClient({client_id:c.googleClient,scope:'https://www.googleapis.com/auth/youtube.readonly',callback:async response=>{if(response.error)return notice('Google sign-in was cancelled or denied.');try{await youtube.connect(response.access_token,c.video);}catch(e){youtube.disconnect();notice(e.message);}},error_callback:()=>notice('Google sign-in was closed. Click Connect YouTube to try again.')}).requestAccessToken();});
$('disconnect-youtube').onclick=()=>{if(youtube.ready)failure('YouTube disconnected.');youtube.disconnect();};
for(const id of ['twitch-client','twitch-channel','google-client','youtube-video'])$(id).onchange=saveConfig;
try{const c=JSON.parse(localStorage.getItem('ohb-settings')||'{}');for(const [id,key] of [['twitch-client','twitchClient'],['twitch-channel','channel'],['google-client','googleClient'],['youtube-video','video']])$(id).value=c[key]||'';}catch{}
try{const data=await load();if(data){tournament=Tournament.restore(data.backup);lineup=data.lineup?.length<=32?data.lineup:structuredClone(tournament.state.entries);}$('save-status').textContent='Saved on this device';}catch(e){notice(e.message);$('save-status').textContent='Not saved';}
renderRoster();renderStage();
const params=new URLSearchParams(location.hash.slice(1));
if(params.has('access_token') || params.has('error')){
  history.replaceState(null,'',location.pathname+location.search);
  const expected=sessionStorage.getItem('ohb-oauth-state');sessionStorage.removeItem('ohb-oauth-state');
  if(!expected || params.get('state')!==expected)notice('Twitch sign-in could not be verified. Connect again.');
  else if(params.has('error'))notice('Twitch sign-in was cancelled or denied.');
  else{twitchToken=params.get('access_token');try{const c=config();await twitch.connect(twitchToken,c.twitchClient,c.channel);}catch(e){twitchToken='';notice(e.message);}}
}
document.addEventListener('visibilitychange',()=>{if(document.hidden && tournament.vote.open)notice('Keep this tab active while voting; background tabs may delay chat updates.');});

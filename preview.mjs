import http from 'node:http';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {resolve,extname,sep} from 'node:path';
const root=resolve(fileURLToPath(new URL('.',import.meta.url)));
const types={'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.md':'text/plain'};
http.createServer(async(req,res)=>{try{const path=resolve(root,'.'+decodeURIComponent(new URL(req.url,'http://localhost').pathname));if(path!==root && !path.startsWith(root+sep))throw Error();const file=path===root?resolve(root,'index.html'):path;const data=await readFile(file);res.writeHead(200,{'Content-Type':types[extname(file)]||'text/plain','Cache-Control':'no-store'});res.end(data);}catch{res.writeHead(404);res.end('Not found');}}).listen(8790,'127.0.0.1',()=>console.log('http://127.0.0.1:8790'));

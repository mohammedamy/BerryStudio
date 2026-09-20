import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve, dirname, extname, sep } from 'node:path';
const root = resolve(dirname(fileURLToPath(import.meta.url)),'..');
const allowedRoots = ['js','evaluation/browser','evaluation/v6-06/references'].map(path=>resolve(root,path)+sep);
const mime = {'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.svg':'image/svg+xml','.json':'application/json'};
const server = createServer(async(request,response)=>{
  try {
    const pathname = decodeURIComponent(new URL(request.url,'http://127.0.0.1').pathname);
    const file = resolve(root,'.'+pathname);
    if (!['GET','HEAD'].includes(request.method) || !allowedRoots.some(prefix=>file.startsWith(prefix)) || !mime[extname(file)]) {
      response.writeHead(404); response.end(); return;
    }
    const data = await readFile(file);
    response.writeHead(200,{'Content-Type':mime[extname(file)],'Cache-Control':'no-store'});
    response.end(request.method==='HEAD'?undefined:data);
  } catch { response.writeHead(404); response.end(); }
});
server.listen(8794,'127.0.0.1',()=>console.log('Evaluation server ready on 127.0.0.1:8794'));
for (const signal of ['SIGINT','SIGTERM']) process.on(signal,()=>server.close(()=>process.exit(0)));

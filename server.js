// 로컬(PC) 실행용 서버. Vercel에서는 사용되지 않고 api/[...path].js가 같은 라우터를 씀.
const http = require('http'), fs = require('fs'), path = require('path');
const { config } = require('./lib');
const { route } = require('./app');
const c = config();

const readBody = (req) => new Promise((done) => {
  let b = ''; req.on('data', (d) => b += d);
  req.on('end', () => { try { done(JSON.parse(b || '{}')); } catch { done({}); } });
});

http.createServer(async (req, res) => {
  const url = req.url.split('?')[0];
  if (url === '/') {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    return res.end(fs.readFileSync(path.join(__dirname, 'public', 'index.html')));
  }
  try {
    const out = await route(req.method, url, await readBody(req), req.headers);
    res.writeHead(out.code, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(out.json));
  } catch (e) {
    console.error(e);
    res.writeHead(500, { 'Content-Type': 'application/json' }); res.end('{}');
  }
}).listen(c.port, '127.0.0.1', () => console.log(`http://localhost:${c.port}`));

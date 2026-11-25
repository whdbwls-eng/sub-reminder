const fs = require('fs'), path = require('path'), crypto = require('crypto');
const DATA = path.join(__dirname, 'data.json'), CONF = path.join(__dirname, 'config.json');

// ---- 설정: Vercel에서는 환경변수, 로컬에서는 config.json ----
function config() {
  if (process.env.NTFY_TOPIC) {
    return { ntfyServer: process.env.NTFY_SERVER || 'https://ntfy.sh', ntfyTopic: process.env.NTFY_TOPIC, port: 3939 };
  }
  let c = readJSON(CONF, null);
  if (!c) {
    c = { ntfyServer: 'https://ntfy.sh', ntfyTopic: 'sub-' + crypto.randomBytes(8).toString('hex'), port: 3939 };
    fs.writeFileSync(CONF, JSON.stringify(c, null, 2));
  }
  return c;
}
function readJSON(f, def) { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return def; } }

// ---- 저장소: Upstash Redis(Vercel) 환경변수가 있으면 Redis, 없으면 로컬 data.json ----
const REDIS_URL = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
const REDIS_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
async function redis(cmd) {
  const r = await fetch(REDIS_URL, { method: 'POST', headers: { Authorization: `Bearer ${REDIS_TOKEN}` }, body: JSON.stringify(cmd) });
  const j = await r.json();
  if (j.error) throw new Error(j.error);
  return j.result;
}
async function loadSubs() {
  if (REDIS_URL) return JSON.parse((await redis(['GET', 'subs'])) || '[]');
  return readJSON(DATA, []);
}
async function saveSubs(s) {
  if (REDIS_URL) return redis(['SET', 'subs', JSON.stringify(s)]);
  fs.writeFileSync(DATA, JSON.stringify(s, null, 2));
}

// ---- 날짜: 서버 시간대와 상관없이 한국 시간 기준 ----
const todayStr = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Seoul' });
const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const parse = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
const today = () => parse(todayStr());

function addCycle(d, cycle) {
  const n = new Date(d);
  if (cycle === 'weekly') n.setDate(n.getDate() + 7);
  else if (cycle === 'yearly') n.setFullYear(n.getFullYear() + 1);
  else { // monthly: 월말 보정 (31일 -> 28일 등)
    const day = n.getDate(); n.setDate(1); n.setMonth(n.getMonth() + 1);
    n.setDate(Math.min(day, new Date(n.getFullYear(), n.getMonth() + 1, 0).getDate()));
  }
  return n;
}

// 결제일은 자동으로 넘기지 않음. 지나면 daysLeft가 음수(확인 대기)가 되고,
// 사용자가 "결제 확인"을 눌러야 confirmPayment로 다음 주기로 넘어감.
const nextDate = (s) => parse(s.date);
const daysLeft = (s) => Math.round((nextDate(s) - today()) / 864e5);
const confirmPayment = (s) => { s.date = ymd(addCycle(parse(s.date), s.cycle)); s.notified = []; };

// ---- 푸시 알림 ----
async function push(title, body, opts = {}) {
  const c = config();
  const r = await fetch(`${c.ntfyServer}/${c.ntfyTopic}`, {
    method: 'POST',
    headers: { Title: encodeURIComponent(title), Priority: opts.priority || 'default', Tags: opts.tags || 'bell' },
    body,
  });
  if (!r.ok) throw new Error(r.status);
}

// 결제/체험종료 N일 전이면 전송, 결제일이 지났으면 승인할 때까지 매일 전송 (중복 방지)
async function runNotify() {
  const subs = await loadSubs();
  let sent = 0;
  for (const s of subs) {
    const left = daysLeft(s);
    const days = s.remindDays || [3, 1, 0];
    const overdue = left < 0;
    if (!overdue && !days.includes(left)) continue;
    const key = overdue ? `${s.date}|over|${todayStr()}` : `${s.date}|${left}`;
    s.notified = s.notified || [];
    if (s.notified.includes(key)) continue;

    const when = left === 0 ? '오늘' : `${left}일 후`;
    const title = overdue
      ? `${s.trial ? '체험 종료일' : '결제일'} ${-left}일 지남: ${s.name}`
      : s.trial ? `무료체험 종료 ${when}: ${s.name}` : `결제 ${when}: ${s.name}`;
    const body = overdue
      ? `${s.name} ${s.trial ? '체험이 끝났어요. 유료 전환 또는 삭제해 주세요.' : '결제 확인이 필요해요. 앱에서 "결제 확인"을 눌러 주세요.'}`
      : s.trial
        ? `${s.name} 무료체험이 ${s.date}에 끝나요. 계속 안 쓸 거면 지금 해지!` + (s.price ? ` (이후 ${s.price.toLocaleString()}원/${s.cycle})` : '')
        : `${s.name} ${Number(s.price).toLocaleString()}원이 ${s.date}에 결제돼요.`;
    try {
      await push(title, body, { priority: s.trial ? 'high' : 'default', tags: s.trial ? 'warning' : 'credit_card' });
      s.notified.push(key); sent++;
    } catch (e) { console.error('전송 실패:', s.name, e.message); }
  }
  await saveSubs(subs);
  return sent;
}

module.exports = { config, loadSubs, saveSubs, nextDate, daysLeft, confirmPayment, ymd, todayStr, push, runNotify };

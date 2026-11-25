// 로컬 서버(server.js)와 Vercel 함수(api/[...path].js)가 함께 쓰는 API 라우터
const crypto = require('crypto');
const { config, loadSubs, saveSubs, nextDate, daysLeft, confirmPayment, ymd, push, runNotify } = require('./lib');

const view = (s) => ({ ...s, next: ymd(nextDate(s)), left: daysLeft(s) });
const ok = (json = { ok: true }, code = 200) => ({ code, json });
const CYCLES = ['monthly', 'yearly', 'weekly'];

async function route(method, url, body = {}, headers = {}) {
  if (url === '/api/config') {
    // 배포(Vercel)에서는 알림 토픽을 화면에 노출하지 않음
    return ok({ topic: process.env.VERCEL ? '' : config().ntfyTopic });
  }
  if (url === '/api/cron') {
    const secret = process.env.CRON_SECRET;
    if (secret && headers.authorization !== `Bearer ${secret}`) return ok({ error: 'unauthorized' }, 401);
    return ok({ sent: await runNotify() });
  }
  if (url === '/api/subs' && method === 'GET') return ok((await loadSubs()).map(view).sort((a, b) => a.left - b.left));
  if (url === '/api/subs' && method === 'POST') {
    const name = String(body.name || '').trim().slice(0, 100);
    if (!name || !/^\d{4}-\d{2}-\d{2}$/.test(body.date || '')) return ok({ error: 'invalid' }, 400);
    const subs = await loadSubs();
    if (subs.length >= 200) return ok({ error: 'too many' }, 400);
    subs.push({
      id: crypto.randomUUID(), name, price: Math.max(0, Number(body.price) || 0),
      cycle: CYCLES.includes(body.cycle) ? body.cycle : 'monthly', date: body.date, trial: !!body.trial, remindDays: [3, 1, 0], notified: [],
    });
    await saveSubs(subs); return ok({ ok: true }, 201);
  }
  const m = url.match(/^\/api\/subs\/([\w-]+)(\/confirm)?$/);
  if (m) {
    const subs = await loadSubs(), s = subs.find((x) => x.id === m[1]);
    if (method === 'DELETE' && !m[2]) { await saveSubs(subs.filter((x) => x.id !== m[1])); return ok(); }
    if (!s) return ok({}, 404);
    if (method === 'POST' && m[2]) { // 결제 승인 -> 다음 결제일로 이동
      if (s.trial) return ok({}, 404);
      confirmPayment(s); await saveSubs(subs); return ok();
    }
    if (method === 'PUT' && !m[2]) { // 체험 -> 정기결제 전환
      if (body.date && !/^\d{4}-\d{2}-\d{2}$/.test(body.date)) return ok({ error: 'invalid' }, 400);
      Object.assign(s, { date: body.date ?? s.date, trial: body.trial ?? s.trial, notified: [] });
      await saveSubs(subs); return ok();
    }
  }
  if (url === '/api/test' && method === 'POST') {
    try { await push('test', '구독 알림 테스트 성공'); return ok(); } catch { return ok({ ok: false }, 502); }
  }
  return ok({}, 404);
}

module.exports = { route };

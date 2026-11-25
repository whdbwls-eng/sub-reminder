// Vercel 함수: /api/* 요청을 모두 공용 라우터로 전달
const { route } = require('../app');

module.exports = async (req, res) => {
  try {
    const out = await route(req.method, req.url.split('?')[0], req.body || {}, req.headers);
    res.status(out.code).json(out.json);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'server error' });
  }
};

// 로컬(PC) 작업 스케줄러용: 알림 대상 확인 후 ntfy 푸시 전송
const { runNotify, todayStr } = require('./lib');
runNotify().then((n) => console.log(`${todayStr()} 알림 ${n}건 전송`));

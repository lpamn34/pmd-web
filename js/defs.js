// 게임 정의: 아이템, 던전, 상수
'use strict';

// 게임 버전: 업데이트할 때 올리고, index.html의 ?v= 숫자도 같이 올린다
// (친구와 구조 코드·오늘의 도전을 주고받으려면 버전이 같아야 한다)
const GAME_VERSION = '0.31';
// 버전 비교: '0.25' > '0.9' 처럼 숫자로 비교한다
function cmpVer(a, b) {
  const x = String(a).split('.').map(Number), y = String(b).split('.').map(Number);
  for (let i = 0; i < Math.max(x.length, y.length); i++) { const d = (x[i] || 0) - (y[i] || 0); if (d) return Math.sign(d); }
  return 0;
}
const GAME_DATE = '2026-09-30';
const VERSION_NOTES = [
  ['0.31', ['메가진화 40종: 메가스톤을 지니면 던전에서 메가진화 (메가스톤은 적 Lv35 이상 층에서 아주 드물게, 레쿠쟈는 화룡점정)',
    '모습 고르기: 로토무 5종·테오키스·쉐이미·큐레무·후파·루가루암·도롱마담·지가르데 10% (캐릭터 탭)',
    '도구로 바뀌는 모습: 기라티나·디아루가·펄기아 오리진폼, 자시안·자마젠타 왕의 모습(녹슨검·녹슨방패), 오거폰 가면 3종, 원시가이오가·원시그란돈(쪽빛구슬·주홍구슬)',
    '던전에서 변신: 캐스퐁·킬가르도·불비달마·약어리·메테노·빙큐보·모르페코·돌핀맨·메로엣타·지가르데·테라파고스',
    '초상화가 없는 모습은 원래 모습의 초상화로', '도감 아이템 필터에 전용 도구·메가스톤', '게임 이름을 "미궁 탐험대"로 변경']],
  ['0.30', ['경험치 전체 배율 0.5 → 0.3', '적 Lv20 이상 층에는 흔한 아이템(씨앗·자갈 등) 대신 식량·회복 아이템만', '달성 선물: 친구 구조 5번마다, 임무 20번마다 영양제·구미(무지개구미 포함)·특성패치 중 하나 (두 횟수는 따로)', '다른 탭에서 돌아오면 새 버전을 바로 확인']],
  ['0.29', ['경험치 너프: 적에게서 얻는 경험치 절반, 보스·현상수배범 보너스 3배 → 2배', '아이템 등급: 초반 던전에는 흔한 아이템만, 지닌 물건·기술머신 등은 적 Lv20 이상 층부터 (던전 정보·도감에서 확인)', '바닥 아이템 3~6개 → 2~4개, 적이 떨어뜨리는 확률 10% → 5%', '전용 도구(금강옥 등)는 주인 포켓몬이 나오는 던전에서만 드물게, 마을 상점에 가끔 진열', '창고 정렬 (종류·이름·개수·넣은 순), 마을에서도 가방 정리', '혼자 탐험 보정(받는 데미지 0.85배) 삭제', '진화해도 클리어 기록·메달이 이어짐', '배경음이 두 개 겹쳐 들리던 문제 수정',
    '대쉬 삭제, 방향만 바꾸기는 다시 Shift + 방향', '마을 위쪽에 접속 중인 탐험대 수 표시 (로그인한 사람 기준, 10분마다 갱신)', '클라우드 저장은 던전을 마칠 때 · 창을 닫거나 다른 탭으로 갈 때 · 마을에서 10분마다 (던전 진행은 브라우저에 층마다 저장)',
    '지닌 물건 가격 2배, 상점 가격 인상 (₽3000 이하 2배, 그 위 1.5배), 아이템을 팔면 사는 값의 1/4', '임무 보상 돈 1.5배', '친구 구조 3번마다 영양제·구미·특성캡슐 선물 (10번째마다 특성패치·무지개구미)', '마을 상점 새로고침 (₽3000)']],
  ['0.28', ['전설·환상 포켓몬은 레벨업에 필요한 경험치 2배 (얻는 경험치 절반)', '구조 게시판: 가장 오래 기다린 요청 10개만, 누가 구조하러 가면 2시간 동안 다른 사람에게 안 보임, 게시판 구조는 한 번에 2개까지', '게시판 구조를 마치면 구조 보답(무작위 아이템 + 돈)을 바로 받음', '무한의 회랑 배경음: Temporal Spire']],
  ['0.27', ['100층 로그라이크 "무한의 회랑" 추가 (최종 보스: 무한다이노 무한다이맥스)', '로그라이크 던전에서는 동료 영입 없음', '빠른 사용: 가방의 아이템 하나를 등록해 T 키/버튼으로 바로 던지거나 사용', '접촉 표시가 빠져 있던 8·9세대 기술(찍찍베기, 제트펀치 등)이 바로 앞의 적을 제대로 공격', '촉촉보이스: 소리 기술이 물 타입이 되고 위력 1.2배 (원작처럼 타입 변경 추가)', '함정이 방 입구(복도에서 2칸 안)에 생기지 않음']],
  ['0.26', ['리전폼 56종 추가 (알로라·가라르·히스이·팔데아의 모습, 도감 번호 0026-1 식)', '포켓몬별 던전 클리어 기록과 메달 (일반·테마·로그라이크 정복, 완전 정복), 던전 카드에 클리어 표시', '흡수 기술 회복량: 준 피해의 30%', '던진 아이템이 아이템 있는 칸에 떨어지면 가까운 빈칸으로 튕겨 나감', '던전에서 메시지 기록(U)·내 상태(P) 보기, 조사(K / 우클릭)로 먼 칸 살펴보기', '가방 정리, 발밑 아이템 조사·줍기·교환·던지기', '열매를 먹으면 배가 5 참', '직선 기술·던지기가 벽 모서리를 지나감', '적도 아이템을 주워서 먹거나 던짐 (쓰러지면 떨어뜨림)', '함정: 모르는 함정 80%·발견한 함정 40% 확률로 작동, 복도 옆에는 생기지 않음, 능력 리셋 함정 추가', '흡수 기술 회복량을 실제로 깎은 HP 기준으로', '휴대폰: 던전 방향 버튼(누르고 있으면 계속 걷기, 방향만 바꾸기), 마을 화면 정리, 창마다 ✕ 닫기 버튼', '일반 던전에서 패러독스 포켓몬이 나오는 확률을 1/5로 줄임', '계정 (아이디/비밀번호, 로그인은 선택)', '클라우드 세이브: 다른 기기에서 이어하기', '구조 게시판: 다른 플레이어의 구조 요청을 골라서 구조, A-OK·감사 편지 자동 전달']],
  ['0.25', ['새 버전 알림 (마을에서 새로고침 안내)', '업데이트 시 세이브 자동 변환 + 백업 (정보 탭에서 복원 가능)', '옛 버전 화면이 새 세이브를 덮어쓰지 않게 보호', '개발용 / 서비스용 환경 분리']],
  ['0.24', ['배경음악 루프 구간: 인트로 뒤 반복 구간만 반복 (파일 안 루프 정보 자동 인식, music/loops.js, 정보 탭에서 설정)']],
  ['0.23', ['피카츄를 시작 포켓몬으로 고를 수 있음', '원작 타일셋(DTEF) 불러오기 다시 켬', '배경음악 파일 지원 (music/ 폴더 또는 정보 탭에서 불러오기)']],
  ['0.22', ['처음 포켓몬 정하기: 성격 진단(문답) 또는 직접 고르기', '시작 포켓몬은 진화 전 모습만 (전설·준전설·환상·패러독스·울트라비스트 제외)']],
  ['0.21', ['던전 탭을 일반 / 테마 / 로그라이크 / 오늘의 도전으로 나눔', '던전 정보: 나오는 포켓몬(층별), 보스, 아이템 확률, 함정·상점 등']],
  ['0.20', ['테마 던전 9곳: 전설 시리즈가 중간·최종 보스로 등장 (천관산, 고대 유적, 에리어 제로 등)', '구미를 상점에서 가끔 판매']],
  ['0.19', ['영입하면 Lv5로 합류, 진화체를 영입하면 진화 전 모습도 함께 해금', '열매 14종 (상태이상 회복·PP·능력 상승)', '스카프·리본 6종, 전용 도구 12종', '구미 7종: 먹으면 배가 차고 능력치가 영구히 조금 오름 (아주 드묾)']],
  ['0.18', ['캐릭터 영입: 쓰러뜨린 적이 가끔 동료가 되고 싶어 한다 (레벨이 높을수록 잘 됨)', '캐릭터 변경은 영입한 포켓몬 중에서만', '이로치 모습은 그 포켓몬의 이로치를 쓰러뜨리거나 영입해야 선택 가능']],
  ['0.17', ['큰 지도 (N / 미니맵 클릭, 누른 곳으로 이동)', '특성 설명에 정확한 수치 표시', '찍찍베기·트리플다이브·트윈빔 연속 공격, 트리플악셀 위력 상승 수정']],
  ['0.16', ['던전에서 임무 확인 (J)', '대쉬 (Shift + 방향 / V)', '방향만 바꾸기는 Ctrl + 방향키로 변경']],
  ['0.15', ['정보 탭에서 버전 확인', '세이브 파일에 버전 기록']],
  ['0.14', ['특성캡슐을 업적 보상에 추가']],
  ['0.13', ['상태이상 로그·숫자 색 구분', '기술머신 목록 스크롤·검색', '특성캡슐 / 특성패치 (특성 변경에 필요)']],
  ['0.12', ['급소 데미지 색 구분']],
  ['0.11', ['효과가 굉장함 / 별로 데미지 색 구분']],
  ['0.10', ['도감 수집 기록', '업적', '오늘의 도전', '영양제', '효과음 / 배경음']],
  ['0.9', ['친구 구조 코드 (SOS / A-OK / 감사)']],
];

const SPRITE_BASE = 'https://raw.githubusercontent.com/PMDCollab/SpriteCollab/master';
const TILE = 24;
const BAG_BASE = 16, BAG_STEP = 4, BAG_LIMIT = 48;
const STORAGE_BASE = 40, STORAGE_STEP = 20, STORAGE_LIMIT = 400;
const bagMax = () => (typeof Game !== 'undefined' && Game.save && Game.save.bagMax) || BAG_BASE;
// 확장 비용: 확장할수록 두 배씩
const bagUpgradeCost = cur => 300 * Math.pow(2, (cur - BAG_BASE) / BAG_STEP);
const storageUpgradeCost = cur => 200 * Math.pow(2, (cur - STORAGE_BASE) / STORAGE_STEP);
const START_LEVEL = 5;
const ROGUE_LEVEL = 5;

// 방향: 스프라이트 시트 행 순서와 동일 (Down, DownRight, Right, UpRight, Up, UpLeft, Left, DownLeft)
const DIRS = [[0, 1], [1, 1], [1, 0], [1, -1], [0, -1], [-1, -1], [-1, 0], [-1, 1]];
const dirIndex = (dx, dy) => DIRS.findIndex(d => d[0] === Math.sign(dx) && d[1] === Math.sign(dy));

const TYPE_COLORS = ['#A8A77A', '#C22E28', '#A98FF3', '#A33EA1', '#E2BF65', '#B6A136', '#A6B91A', '#735797', '#B7B7CE',
  '#EE8130', '#6390F0', '#7AC74C', '#F7D02C', '#F95587', '#96D9D6', '#6F35FC', '#705746', '#D685AD'];

// use: 사용 효과 / throw: 던지기 효과 / stack: 여러 개를 한 칸에
const ITEMS = {
  oran:     { n: '오랭열매',     d: 'HP를 100 회복한다.', price: 60, use: 'heal', v: 100, icon: '🫐' },
  sitrus:   { n: '자뭉열매',     d: 'HP를 최대 HP의 절반만큼 회복한다.', price: 180, use: 'healPct', v: 50, icon: '🍋' },
  apple:    { n: '사과',         d: '배고픔을 50 채운다.', price: 50, use: 'food', v: 50, icon: '🍎' },
  bigapple: { n: '큰사과',       d: '배고픔을 가득 채운다.', price: 150, use: 'food', v: 200, icon: '🍏' },
  heal:     { n: '치료씨',       d: '모든 상태이상을 회복한다.', price: 80, use: 'cure', icon: '🌱' },
  elixir:   { n: '맥스엘릭서',   d: '모든 기술의 PP를 회복한다.', price: 300, use: 'pp', icon: '🧪' },
  reviver:  { n: '부활씨',       d: '쓰러졌을 때 자동으로 부활한다.', price: 800, use: 'none', icon: '🌰' },
  blast:    { n: '폭발씨',       d: '앞의 적에게 큰 불꽃 피해 (고정 60).', price: 120, use: 'blast', icon: '💥' },
  sleep:    { n: '수면씨',       d: '던지면 맞은 적이 잠든다.', price: 100, throw: 'sleep', icon: '💤' },
  warp:     { n: '워프씨',       d: '먹으면 층 어딘가로 순간이동한다.', price: 70, use: 'warp', icon: '🌀' },
  stun:     { n: '마비씨',       d: '던지면 맞은 적이 마비된다.', price: 90, throw: 'par', icon: '⚡' },
  thorn:    { n: '쇠가시',       d: '던지면 적에게 고정 25 피해.', price: 10, throw: 'dmg', v: 25, stack: true, icon: '📌' },
  gravel:   { n: '자갈',         d: '던지면 적에게 고정 12 피해.', price: 4, throw: 'dmg', v: 12, stack: true, icon: '🪨' },
  escape:   { n: '탈출구슬',     d: '던전에서 탈출한다. 가방은 유지된다.', price: 250, use: 'escape', icon: '🔮' },
  lumi:     { n: '빛의구슬',     d: '이 층의 지도를 전부 밝힌다.', price: 200, use: 'map', icon: '💡' },
  foesleep: { n: '수면구슬',     d: '보이는 모든 적을 잠재운다.', price: 300, use: 'allsleep', icon: '🌙' },
  candy:    { n: '이상한사탕',   d: '레벨이 1 오른다.', price: 0, sell: 400, use: 'levelup', icon: '🍬' },
  stone:    { n: '진화의돌',     d: '아이템으로 진화하는 포켓몬에게 필요하다. (마을에서 사용)', price: 1500, use: 'none', icon: '💎' },
  link:     { n: '연결의끈',     d: '통신교환으로 진화하는 포켓몬에게 필요하다. (마을에서 사용)', price: 1500, use: 'none', icon: '🧵' },
  quest:    { n: '의뢰품',       d: '임무 대상 아이템.', price: 0, use: 'none', icon: '📦' },
};

// ── 추가 소모품 ──
Object.assign(ITEMS, {
  superpotion: { n: '좋은상처약', d: 'HP를 200 회복한다.', price: 300, use: 'heal', v: 200, icon: '💊' },
  fullrestore: { n: '회복약',     d: 'HP를 전부 회복하고 상태이상도 낫는다.', price: 1200, use: 'fullheal', icon: '🩹' },
  xattack:  { n: '플러스파워',   d: '이 층에서 공격이 2단계 오른다.', price: 150, use: 'stat', st: 2, v: 2, icon: '🔺' },
  xdefense: { n: '디펜드업',     d: '이 층에서 방어가 2단계 오른다.', price: 150, use: 'stat', st: 3, v: 2, icon: '🛡' },
  xspatk:   { n: '스페셜업',     d: '이 층에서 특수공격이 2단계 오른다.', price: 150, use: 'stat', st: 4, v: 2, icon: '🔷' },
  xspeed:   { n: '스피드업',     d: '이 층에서 스피드가 2단계 오른다. (명중·회피에 영향)', price: 150, use: 'stat', st: 6, v: 2, icon: '💨' },
  xaccuracy:{ n: '잘-맞히기',    d: '이 층에서 명중률이 2단계 오른다.', price: 150, use: 'stat', st: 7, v: 2, icon: '🎯' },
  poisonseed: { n: '독씨',       d: '던지면 맞은 적이 독 상태가 된다.', price: 80, throw: 'psn', icon: '🟣' },
  confuseseed:{ n: '혼란씨',     d: '던지면 맞은 적이 혼란에 빠진다.', price: 80, throw: 'cnf', icon: '💫' },
  goldthorn: { n: '금바늘',      d: '던지면 적에게 고정 50 피해.', price: 30, throw: 'dmg', v: 50, stack: true, icon: '📍' },
  radar:    { n: '탐지구슬',     d: '이 층의 적과 아이템 위치를 미니맵에 표시한다.', price: 250, use: 'radar', icon: '📡' },
  trapbust: { n: '함정파괴구슬', d: '이 층의 함정을 모두 없앤다.', price: 200, use: 'trapbust', icon: '🧹' },
  paraorb:  { n: '마비구슬',     d: '보이는 모든 적을 마비시킨다.', price: 300, use: 'allpar', icon: '🔶' },
  sloworb:  { n: '슬로우구슬',   d: '보이는 모든 적의 스피드를 2단계 낮춘다.', price: 200, use: 'allslow', icon: '🐌' },
});

// ── 열매: 상태이상 회복 / 능력 상승 ──
Object.assign(ITEMS, {
  cheri:   { n: '버치열매', d: '마비를 고친다.', price: 40, use: 'cureOne', st: 'par', icon: '🍒' },
  chesto:  { n: '유루열매', d: '잠에서 깨고, 이 층에서는 잠들지 않는다.', price: 60, use: 'chesto', icon: '🫒' },
  pecha:   { n: '복슝열매', d: '독을 고친다.', price: 40, use: 'cureOne', st: 'psn', icon: '🍑' },
  rawst:   { n: '복분열매', d: '화상을 고친다.', price: 40, use: 'cureOne', st: 'brn', icon: '🍓' },
  persim:  { n: '시마열매', d: '혼란을 고친다.', price: 40, use: 'cureOne', st: 'cnf', icon: '🍊' },
  lum:     { n: '리샘열매', d: '모든 상태이상과 떨어진 능력을 고친다.', price: 150, use: 'cure', icon: '🍈' },
  leppa:   { n: '과사열매', d: '모든 기술의 PP를 10씩 회복한다.', price: 120, use: 'ppSome', v: 10, icon: '🍐' },
  liechi:  { n: '치리열매', d: '이 층에서 공격이 1단계 오른다.', price: 100, use: 'stat', st: 2, v: 1, icon: '🔴' },
  ganlon:  { n: '용아열매', d: '이 층에서 방어가 1단계 오른다.', price: 100, use: 'stat', st: 3, v: 1, icon: '🟠' },
  petaya:  { n: '야타비열매', d: '이 층에서 특수공격이 1단계 오른다.', price: 100, use: 'stat', st: 4, v: 1, icon: '🟣' },
  apicot:  { n: '규살열매', d: '이 층에서 특수방어가 1단계 오른다.', price: 100, use: 'stat', st: 5, v: 1, icon: '🔵' },
  salac:   { n: '캄라열매', d: '이 층에서 스피드가 1단계 오른다.', price: 100, use: 'stat', st: 6, v: 1, icon: '🟢' },
  starf:   { n: '스타열매', d: '이 층에서 무작위 능력 하나가 2단계 오른다.', price: 250, use: 'statRandom', icon: '⭐' },
  lansat:  { n: '랑사열매', d: '이 층에서 급소에 맞히기 아주 쉬워진다 (급소율 2단계).', price: 250, use: 'critUp', icon: '🎯' },
});

// ── 구미: 먹으면 배가 조금 차고, 능력치가 영구히 조금 오른다 (아주 드물다) ──
const GUMMY_MAX = 20;   // 능력치마다 구미로 올릴 수 있는 횟수
const GUMMIES = {
  whitegummy:  { n: '하양구미', stats: ['maxhp'], icon: '⚪' },
  redgummy:    { n: '빨강구미', stats: ['atk'], icon: '🔴' },
  yellowgummy: { n: '노랑구미', stats: ['def'], icon: '🟡' },
  bluegummy:   { n: '파랑구미', stats: ['spa'], icon: '🔵' },
  greengummy:  { n: '초록구미', stats: ['spd'], icon: '🟢' },
  pinkgummy:   { n: '분홍구미', stats: ['spe'], icon: '🩷' },
  rainbowgummy:{ n: '무지개구미', stats: ['maxhp', 'atk', 'def', 'spa', 'spd', 'spe'], icon: '🌈' },
};
const STAT_KO = { maxhp: 'HP', atk: '공격', def: '방어', spa: '특수공격', spd: '특수방어', spe: '스피드' };
const gummyAmt = k => (k === 'maxhp' ? 2 : 1);
for (const [id, g] of Object.entries(GUMMIES)) {
  const rainbow = g.stats.length > 1;
  ITEMS[id] = { n: g.n, icon: g.icon, use: 'gummy', gummy: g.stats, belly: rainbow ? 30 : 15, price: rainbow ? 20000 : 5000,
    d: `먹으면 배가 ${rainbow ? 30 : 15} 차고, ${rainbow ? '모든 능력치가' : jo(STAT_KO[g.stats[0]], '이')} 영구히 ${rainbow ? '1씩 (HP는 2)' : gummyAmt(g.stats[0])} 오른다. 능력치마다 ${GUMMY_MAX}번까지. 던전이나 마을의 캐릭터 탭에서 먹는다. (로그라이크에서는 그 탐험 동안만)` };
}

// ── 특성 변경 아이템: 마을의 캐릭터 탭에서 특성을 바꿀 때 소모된다 ──
Object.assign(ITEMS, {
  abcapsule: { n: '특성캡슐', d: '특성을 다른 일반 특성으로 바꿀 때 필요하다. (마을의 캐릭터 탭에서 사용)', price: 2000, use: 'none', icon: '⚗' },
  abpatch:   { n: '특성패치', d: '특성을 숨겨진 특성으로 바꿀 때 필요하다. (마을의 캐릭터 탭에서 사용)', price: 6000, use: 'none', icon: '🧩' },
});

// ── 영양제: 캐릭터의 능력치를 영구히 올린다 (마을의 캐릭터 탭에서 사용, 일반 던전에서만 효과) ──
const VITAMIN_MAX = 10;   // 능력치 하나에 먹일 수 있는 횟수
const VITAMINS = { hpup: ['맥스업', 'maxhp', 'HP', 4], protein: ['타우린', 'atk', '공격', 2], iron: ['사포닌', 'def', '방어', 2],
  calcium: ['리보플라빈', 'spa', '특수공격', 2], zinc: ['키토산', 'spd', '특수방어', 2], carbos: ['알칼로이드', 'spe', '스피드', 2] };
for (const [id, [n, st, sn, v]] of Object.entries(VITAMINS)) {
  ITEMS[id] = { n, d: `${jo(sn, "이")} 영구히 ${v} 오른다. 포켓몬마다 능력치당 ${VITAMIN_MAX}번까지. (마을의 캐릭터 탭에서 사용)`, price: 3000, use: 'none', vit: st, v, icon: '🥤' };
}
// 영양제 효과를 능력치에 더한다 (boost: { maxhp, atk, ... } 먹은 횟수)
function applyBoost(st, boost) {
  if (!boost) return st;
  for (const [id, [, k, , v]] of Object.entries(VITAMINS)) if (boost[k]) st[k] += boost[k] * v;
  for (const k of Object.keys(STAT_KO)) if (boost['g_' + k]) st[k] += boost['g_' + k] * gummyAmt(k);   // 구미
  return st;
}

// ── 지닌 물건: 마을의 캐릭터 탭이나 던전 가방에서 지니게 한다 (한 번에 하나) ──
const HELD_ITEMS = {
  leftovers:   { n: '먹다남은음식', d: '자연 회복 속도가 2배가 된다.', price: 1500, icon: '🍗', hold: { regen: 2 } },
  blacksludge: { n: '검은오물',     d: '독 타입이면 자연 회복 속도가 2.5배. 그 외에는 효과 없음.', price: 800, icon: '🟤', hold: { sludge: true } },
  shellbell:   { n: '조개껍질방울', d: '준 데미지의 1/8만큼 HP를 회복한다.', price: 1200, icon: '🐚', hold: { shellBell: 8 } },
  lifeorb:     { n: '생명의구슬',   d: '기술의 위력이 1.3배가 되지만, 공격할 때마다 최대 HP의 1/10을 잃는다.', price: 2000, icon: '🔴', hold: { lifeOrb: true } },
  muscleband:  { n: '힘의머리띠',   d: '물리 기술의 위력이 1.1배.', price: 700, icon: '🎗', hold: { physMul: 1.1 } },
  wiseglasses: { n: '박식안경',     d: '특수 기술의 위력이 1.1배.', price: 700, icon: '👓', hold: { specMul: 1.1 } },
  expertbelt:  { n: '달인의띠',     d: '효과가 굉장한 기술의 위력이 1.2배.', price: 1200, icon: '🥋', hold: { seBoost: 1.2 } },
  scopelens:   { n: '초점렌즈',     d: '급소에 맞히기 쉬워진다.', price: 900, icon: '🔍', hold: { critStage: 1 } },
  widelens:    { n: '광각렌즈',     d: '명중률이 1.1배.', price: 700, icon: '🔎', hold: { accMul: 1.1 } },
  brightpowder:{ n: '반짝가루',     d: '적의 명중률이 0.9배.', price: 900, icon: '✨', hold: { foeAcc: 0.9 } },
  focussash:   { n: '기합의띠',     d: 'HP가 가득 찬 상태에서는 한 번에 쓰러지지 않는다.', price: 1500, icon: '🎀', hold: { sash: true } },
  focusband:   { n: '기합의머리띠', d: '쓰러질 공격을 받아도 10% 확률로 HP 1로 버틴다.', price: 800, icon: '🩵', hold: { band: 0.1 } },
  assaultvest: { n: '돌격조끼',     d: '특수방어가 1.4배. (던전에서는 변화 기술 제한 없음)', price: 1200, icon: '🦺', hold: { spdMul: 1.4 } },
  eviolite:    { n: '진화의휘석',   d: '아직 진화할 수 있는 포켓몬이면 방어와 특수방어가 1.5배.', price: 1500, icon: '💠', hold: { eviolite: true } },
  rockyhelmet: { n: '울퉁불퉁멧',   d: '접촉 공격을 한 적이 최대 HP의 1/6 데미지를 입는다.', price: 1200, icon: '⛑', hold: { helmet: 6 } },
  quickclaw:   { n: '선제공격손톱', d: '행동 후 10% 확률로 한 턴 더 행동한다.', price: 1200, icon: '🦴', hold: { speedy: 0.1 } },
  choicescarf: { n: '구애스카프',   d: '스피드가 1.5배. (던전에서는 기술 고정 없음)', price: 1200, icon: '🧣', hold: { speedMul: 1.5 } },
  powerband:   { n: '파워밴드',     d: '공격이 1.2배.', price: 1000, icon: '💪', hold: { atkMul: 1.2 } },
  defscarf:    { n: '방어스카프',   d: '방어가 1.2배.', price: 1000, icon: '🟫', hold: { defMul: 1.2 } },
  specialband: { n: '스페셜밴드',   d: '특수공격이 1.2배.', price: 1000, icon: '🔵', hold: { spaMul: 1.2 } },
  zincband:    { n: '아연밴드',     d: '특수방어가 1.2배.', price: 1000, icon: '⚪', hold: { spdMul: 1.2 } },
  xrayspecs:   { n: '투시안경',     d: '층의 적과 아이템 위치가 항상 미니맵에 보인다.', price: 1500, icon: '🥽', hold: { xray: true } },
  staminaband: { n: '스태미나밴드', d: '배가 고파지는 속도가 절반이 된다.', price: 1000, icon: '🍙', hold: { bellyMul: 0.5 } },
  pechascarf:  { n: '복슝스카프',   d: '독 상태가 되지 않는다.', price: 600, icon: '🍑', hold: { noStatus: ['psn'] } },
  insomniscope:{ n: '불면고글',     d: '잠듦 상태가 되지 않는다.', price: 600, icon: '😳', hold: { noStatus: ['slp'] } },
  persimband:  { n: '시마밴드',     d: '혼란에 빠지지 않는다.', price: 600, icon: '🌀', hold: { noStatus: ['cnf'] } },
  flameorb:    { n: '화염구슬',     d: '층에 들어서고 5턴 뒤 화상 상태가 된다. (근성과 함께 쓰면 좋다)', price: 500, icon: '🔥', hold: { orb: 'brn' } },
  toxicorb:    { n: '독독구슬',     d: '층에 들어서고 5턴 뒤 독 상태가 된다. (포이즌힐·근성과 함께)', price: 500, icon: '☣', hold: { orb: 'psn' } },
  luckyegg:    { n: '행복의알',     d: '얻는 경험치가 1.5배.', price: 2000, icon: '🥚', hold: { expMul: 1.5 } },
  amuletcoin:  { n: '부적금화',     d: '줍는 돈이 1.5배.', price: 2000, icon: '🪙', hold: { moneyMul: 1.5 } },
};
// 타입 강화 도구 (해당 타입 기술 1.2배)
[['silkscarf', '실크스카프', 1], ['blackbelt', '검은띠', 2], ['sharpbeak', '예리한부리', 3], ['poisonbarb', '독바늘', 4], ['softsand', '부드러운모래', 5],
 ['hardstone', '딱딱한돌', 6], ['silverpowder', '은빛가루', 7], ['spelltag', '저주의부적', 8], ['metalcoat', '금속코트', 9], ['charcoal', '목탄', 10],
 ['mysticwater', '신비의물방울', 11], ['miracleseed', '기적의씨', 12], ['magnet', '자석', 13], ['twistedspoon', '휘어진스푼', 14], ['nevermeltice', '녹지않는얼음', 15],
 ['dragonfang', '용의이빨', 16], ['blackglasses', '검은안경', 17], ['fairyfeather', '요정의깃털', 18]]
  .forEach(([id, n, t]) => { HELD_ITEMS[id] = { n, d: `${DATA.types[t - 1]} 타입 기술의 위력이 1.2배.`, price: 600, icon: '🔸', hold: { typeMul: { [t]: 1.2 } } }; });
// 스카프·리본
Object.assign(HELD_ITEMS, {
  friendbow:   { n: '친구리본',   d: '쓰러뜨린 적이 동료가 되고 싶어 할 확률이 1.5배.', price: 2500, icon: '🎀', hold: { recruitMul: 1.5 } },
  healribbon:  { n: '치유리본',   d: '상태이상이 절반의 시간에 낫는다.', price: 900, icon: '💗', hold: { statusShort: true } },
  goldribbon:  { n: '황금리본',   d: '공격·방어·특공·특방·스피드가 모두 1.1배.', price: 4000, icon: '🏅', hold: { atkMul: 1.1, defMul: 1.1, spaMul: 1.1, spdMul: 1.1, speedMul: 1.1 } },
  twistband:   { n: '비틀밴드',   d: '적이 능력을 떨어뜨리지 못한다.', price: 1000, icon: '🌀', hold: { noDrop: true } },
  trapscarf:   { n: '함정스카프', d: '함정을 밟아도 발동하지 않는다.', price: 900, icon: '🧣', hold: { trapImmune: true } },
  detectband:  { n: '탐지밴드',   d: '회피율이 1.1배.', price: 900, icon: '🟪', hold: { evaMul: 1.1 } },
});
// 전용 도구: 정해진 포켓몬이 지닐 때만 효과
[['thickclub', '굵은뼈', '🦴', [104, 105], { atkMul: 2 }, '공격이 2배'],
 ['lightball', '전기구슬', '💛', [25], { atkMul: 2, spaMul: 2 }, '공격과 특수공격이 2배'],
 ['deepseatooth', '심해의이빨', '🦷', [366], { spaMul: 2 }, '특수공격이 2배'],
 ['deepseascale', '심해의비늘', '🐟', [366], { spdMul: 2 }, '특수방어가 2배'],
 ['metalpowder', '금속파우더', '🔩', [132], { defMul: 2 }, '방어가 2배'],
 ['quickpowder', '스피드파우더', '💨', [132], { speedMul: 2 }, '스피드가 2배'],
 ['luckypunch', '럭키펀치', '🥊', [113], { critStage: 2 }, '급소율이 2단계 오른다'],
 ['leek', '대파', '🥬', [83, 865], { critStage: 2 }, '급소율이 2단계 오른다'],
 ['souldew', '마음의물방울', '💧', [380, 381], { typeMul: { 16: 1.2, 14: 1.2 } }, '드래곤·에스퍼 기술의 위력이 1.2배'],
 ['adamantorb', '금강옥', '💎', [483], { typeMul: { 16: 1.2, 9: 1.2 } }, '오리진폼이 되고, 드래곤·강철 기술의 위력이 1.2배'],
 ['lustrousorb', '백옥', '🔮', [484], { typeMul: { 16: 1.2, 11: 1.2 } }, '오리진폼이 되고, 드래곤·물 기술의 위력이 1.2배'],
 ['griseousorb', '백금옥', '🌑', [487], { typeMul: { 16: 1.2, 8: 1.2 } }, '오리진폼이 되고, 드래곤·고스트 기술의 위력이 1.2배'],
 // 폼체인지 도구 (js/forms.js의 FORM_ITEMS): 지니고 있으면 던전에서 그 모습이 된다 (기존 번호 뒤에 추가)
 ['rustedsword', '녹슨검', '🗡', [888], {}, '검왕의 모습이 된다'],
 ['rustedshield', '녹슨방패', '🛡', [889], {}, '방패왕의 모습이 된다'],
 ['wellspringmask', '우물의가면', '💧', [1017], { physMul: 1.2, specMul: 1.2 }, '우물의가면 모습(풀·물)이 되고, 기술의 위력이 1.2배'],
 ['hearthflamemask', '화덕의가면', '🔥', [1017], { physMul: 1.2, specMul: 1.2 }, '화덕의가면 모습(풀·불꽃)이 되고, 기술의 위력이 1.2배'],
 ['cornerstonemask', '주춧돌의가면', '🪨', [1017], { physMul: 1.2, specMul: 1.2 }, '주춧돌의가면 모습(풀·바위)이 되고, 기술의 위력이 1.2배'],
 ['blueorb', '쪽빛구슬', '🔵', [382], {}, '원시회귀해서 원시가이오가가 된다'],
 ['redorb', '주홍구슬', '🔴', [383], {}, '원시회귀해서 원시그란돈이 된다'],
].forEach(([id, n, icon, only, eff, text]) => {
  const who = only.filter(sp => DATA.species[sp]).map(sp => DATA.species[sp].n).join('·');
  HELD_ITEMS[id] = { n, icon, price: 2000, sig: true, d: `[전용] ${who}에게 지니게 하면 ${text}. 다른 포켓몬에게는 효과가 없다.`, hold: { only, ...eff } };
});
// 지닌 물건은 오래 쓰는 물건이라 비싸게 (위 가격의 HELD_PRICE_MUL배)
const HELD_PRICE_MUL = 2;
for (const [id, it] of Object.entries(HELD_ITEMS)) ITEMS[id] = { ...it, price: it.price * HELD_PRICE_MUL, use: 'none', held: true };
// 지닌 물건 효과 (전용 도구는 정해진 포켓몬만)
const heldOf = c => {
  const h = c && c.held && ITEMS[c.held] && ITEMS[c.held].hold;
  if (!h || (h.only && !h.only.includes(c.sp))) return {};
  return h;
};

const SHOP_POOL = ['oran', 'oran', 'sitrus', 'apple', 'apple', 'bigapple', 'heal', 'elixir', 'reviver', 'blast', 'sleep', 'warp', 'stun', 'thorn', 'gravel', 'escape', 'lumi', 'foesleep', 'stone', 'link',
  'superpotion', 'fullrestore', 'xattack', 'xdefense', 'xspatk', 'xspeed', 'xaccuracy', 'poisonseed', 'confuseseed', 'goldthorn', 'radar', 'trapbust', 'paraorb', 'sloworb',
  'cheri', 'chesto', 'pecha', 'rawst', 'persim', 'lum', 'leppa'];
// 마을 상점은 매일 지닌 물건 몇 개도 진열한다 (전용 도구는 따로 가끔)
const HELD_SHOP_POOL = Object.keys(HELD_ITEMS).filter(id => !HELD_ITEMS[id].sig);
const SIG_ITEMS = Object.keys(HELD_ITEMS).filter(id => HELD_ITEMS[id].sig);
const SIG_SHOP_CHANCE = 0.08;   // 마을 상점에 전용 도구가 하나 진열될 확률 (하루)
// 전용 도구는 그 포켓몬이 나오는 던전에서만 드물게 떨어진다
const SIG_DROP = { floor: 0.03, defeat: 0.03, boss: 0.25 };
// 이 포켓몬들 중 누군가가 주인인 전용 도구
const sigItemsFor = sps => SIG_ITEMS.filter(id => HELD_ITEMS[id].hold.only.some(sp => sps.includes(sp)));
// 한 층에 떨어져 있는 아이템 수, 쓰러뜨린 적이 아이템을 떨어뜨릴 확률
const ITEMS_PER_FLOOR = [2, 4];
const ENEMY_DROP_CHANCE = 0.05;

// 바닥 드롭 테이블 (가중치)
const DROP_TABLE = [['oran', 18], ['sitrus', 4], ['apple', 12], ['bigapple', 3], ['heal', 6], ['elixir', 3], ['reviver', 1.2], ['blast', 6],
  ['sleep', 5], ['warp', 5], ['stun', 5], ['thorn', 8], ['gravel', 8], ['escape', 1.5], ['lumi', 2], ['foesleep', 1.2], ['candy', 0.8],
  ['superpotion', 3], ['fullrestore', 0.6], ['xattack', 1.5], ['xdefense', 1.5], ['xspatk', 1.5], ['xspeed', 1.5], ['xaccuracy', 1], ['poisonseed', 3], ['confuseseed', 3],
  ['goldthorn', 2], ['radar', 1.2], ['trapbust', 1], ['paraorb', 0.8], ['sloworb', 0.8]];
// 지닌 물건은 가끔 바닥에서 발견된다 (종류마다 드물게)
for (const id of HELD_SHOP_POOL) DROP_TABLE.push([id, 0.12]);
for (const id of Object.keys(VITAMINS)) DROP_TABLE.push([id, 0.15]);
DROP_TABLE.push(['abcapsule', 0.1], ['abpatch', 0.04]);
// 열매: 상태이상 열매는 흔하게, 능력 열매는 가끔
DROP_TABLE.push(['cheri', 3], ['chesto', 2], ['pecha', 3], ['rawst', 3], ['persim', 2], ['lum', 1], ['leppa', 1.5],
  ['liechi', 0.6], ['ganlon', 0.6], ['petaya', 0.6], ['apicot', 0.6], ['salac', 0.6], ['starf', 0.2], ['lansat', 0.2]);
// 구미: 아주 드물다 (무지개구미는 더)
for (const id of Object.keys(GUMMIES)) DROP_TABLE.push([id, id === 'rainbowgummy' ? 0.01 : 0.05]);

// 타입 ID: 1노말 2격투 3비행 4독 5땅 6바위 7벌레 8고스트 9강철 10불꽃 11물 12풀 13전기 14에스퍼 15얼음 16드래곤 17악 18페어리
// req: 이 던전을 클리어하면 열림 (없으면 처음부터 열림). legend: 전설 포켓몬이 가끔 등장
const DUNGEONS = [
  { id: 'forest',  n: '작은 숲',        floors: 5,  lv: [3, 7],   types: [12, 7, 1],   mode: 'normal', wx: [['rain', 0.1]], pal: ['#2f5d34', '#4f8a3d', '#8fcf6a', '#6aa84f'] },
  { id: 'beach',   n: '해변 동굴',      floors: 8,  lv: [6, 13],  types: [11, 1, 3],   mode: 'normal', req: 'forest', wx: [['rain', 0.3]], pal: ['#3a4f6b', '#5a7fa8', '#e8d9a8', '#d2c08a'] },
  { id: 'crystal', n: '수정 동굴',      floors: 9,  lv: [10, 17], types: [6, 14, 18],  mode: 'normal', req: 'beach', wx: [['fog', 0.15]], pal: ['#2c2a4a', '#5b4f9a', '#c9c1f0', '#b0a6e0'] },
  { id: 'plains',  n: '번개 초원',      floors: 10, lv: [12, 20], types: [13, 3, 1, 2], mode: 'normal', req: 'beach', wx: [['rain', 0.35], ['sun', 0.15]], pal: ['#5a5a2a', '#8c8a3c', '#d8d27a', '#b9b45e'] },
  { id: 'swamp',   n: '독안개 늪',      floors: 11, lv: [15, 24], types: [4, 12, 11, 7], mode: 'normal', req: 'plains', wx: [['rain', 0.3], ['fog', 0.25]], pal: ['#2b3a24', '#4a5e33', '#7d8a52', '#6b7845'] },
  { id: 'volcano', n: '불꽃 화산',      floors: 12, lv: [18, 28], types: [10, 6, 5],   mode: 'normal', req: 'plains', wx: [['sun', 0.5], ['sand', 0.15]], pal: ['#4a1f1a', '#8c3a24', '#b9876a', '#9c6c52'] },
  { id: 'desert',  n: '유사 사막',      floors: 12, lv: [22, 32], types: [5, 6, 7],    mode: 'normal', req: 'volcano', wx: [['sand', 0.65], ['sun', 0.25]], pal: ['#6b4f2a', '#a67c46', '#e8cf96', '#dcbf82'] },
  { id: 'frost',   n: '얼음 산',        floors: 14, lv: [26, 36], types: [15, 11, 9],  mode: 'normal', req: 'volcano', wx: [['snow', 0.7], ['fog', 0.1]], pal: ['#3b4f63', '#7a99b8', '#dbe8f2', '#bcd0e0'] },
  { id: 'storm',   n: '폭풍의 바다',    floors: 14, lv: [30, 40], types: [11, 13, 3],  mode: 'normal', req: 'frost', wx: [['rain', 0.75]], pal: ['#1f2f45', '#3f5f86', '#8fa8c2', '#7c96b2'] },
  { id: 'dark',    n: '어둠의 숲',      floors: 16, lv: [34, 46], types: [8, 17, 4, 14], mode: 'normal', req: 'frost', wx: [['fog', 0.5], ['rain', 0.15]], pal: ['#241c33', '#473a63', '#7d6f94', '#655a7c'] },
  { id: 'mine',    n: '강철 광산',      floors: 16, lv: [38, 50], types: [9, 6, 13, 5], mode: 'normal', req: 'dark', wx: [['sand', 0.2]], pal: ['#2d2f33', '#5a5f66', '#9ca3ab', '#8a9199'] },
  { id: 'sky',     n: '하늘의 탑',      floors: 20, lv: [44, 62], types: [16, 18, 14, 9, 3], mode: 'normal', req: 'dark', wx: [['sun', 0.2], ['rain', 0.2], ['fog', 0.1]], pal: ['#3a3f5c', '#6c74a8', '#e7e2f4', '#c8c2e0'] },
  { id: 'canyon',  n: '용의 협곡',      floors: 18, lv: [52, 66], types: [16, 10, 3, 2], mode: 'normal', req: 'sky', wx: [['sun', 0.3], ['sand', 0.2]], pal: ['#4a2323', '#8a3f2f', '#d09a70', '#be8860'] },
  { id: 'summit',  n: '별의 정상',      floors: 25, lv: [62, 80], types: null, legend: true, mode: 'normal', req: 'canyon', wx: [['snow', 0.2], ['fog', 0.2], ['sun', 0.1]], pal: ['#161a33', '#3c3f7a', '#a9a6d8', '#9491c7'] },
  { id: 'trial',   n: '시련의 동굴',    floors: 15, lv: [3, 22],  types: null, mode: 'rogue', wx: [['sand', 0.3]], pal: ['#3b3530', '#6b5f55', '#a99a8a', '#8e7f70'] },
  { id: 'twilight', n: '황혼의 미궁',   floors: 30, lv: [4, 45],  types: [8, 17, 14, 18], mode: 'rogue', wx: [['fog', 0.3], ['rain', 0.1]], pal: ['#3a2438', '#6e4468', '#c79ab8', '#b387a6'] },
  { id: 'mystery', n: '불가사의 던전',  floors: 50, lv: [3, 70],  types: null, mode: 'rogue', wx: [['sun', 0.08], ['rain', 0.08], ['sand', 0.08], ['snow', 0.08], ['fog', 0.08]], pal: ['#26324a', '#44597e', '#9fb0cc', '#8395b3'] },
  { id: 'eternal', n: '무한의 회랑',    floors: 100, lv: [3, 100], types: null, mode: 'rogue', wx: [['fog', 0.1], ['sand', 0.05], ['snow', 0.05]], pal: ['#1d0f24', '#4a1f4f', '#d45a8a', '#a8406c'] },
];
// ── 테마 던전: 같은 시리즈로 묶이는 전설·패러독스 포켓몬이 보스로 나온다 ──
// theme: 카드에 표시할 테마 / bosses: 최종 보스 후보 (무작위 하나) / mid: 중간 보스 층과 후보 / extra: 일반 적으로 섞이는 포켓몬
// (스프라이트가 없는 포켓몬은 자동으로 빠진다. 기존 코드 호환을 위해 항상 목록 끝에 추가)
const PARADOX_PAST = [984, 985, 986, 987, 988, 989, 1005, 1009, 1020, 1021];
const PARADOX_FUTURE = [990, 991, 992, 993, 994, 995, 1006, 1010, 1022, 1023];
const PARADOX_RATE = 0.2;   // 일반 던전에서 패러독스 포켓몬이 뽑혔을 때 실제로 나올 확률 (테마 던전은 그대로)
DUNGEONS.push(
  { id: 'burned',   n: '불탄 탑',       floors: 14, lv: [30, 45], types: [10, 13, 11, 8, 1], mode: 'normal', req: 'volcano', theme: '전설의 세 마리 개',
    bosses: [250], mid: { floors: [5, 10], pool: [243, 244, 245] }, wx: [['sun', 0.2], ['rain', 0.2]], pal: ['#3a2418', '#6e4028', '#c79a70', '#b0845c'] },
  { id: 'whirl',    n: '소용돌이 섬',   floors: 16, lv: [38, 52], types: [11, 3, 15, 13, 10], mode: 'normal', req: 'storm', theme: '전설의 새',
    bosses: [249], mid: { floors: [5, 10], pool: [144, 145, 146] }, wx: [['rain', 0.4], ['snow', 0.1]], pal: ['#1c3040', '#355a78', '#9cc2da', '#86aec8'] },
  { id: 'seafloor', n: '해저 동굴',     floors: 16, lv: [42, 58], types: [11, 5, 16, 6], mode: 'normal', req: 'storm', theme: '대지와 바다',
    bosses: [382, 383], mid: { floors: [8], pool: [380, 381] }, wx: [['rain', 0.35], ['sun', 0.35]], pal: ['#132436', '#27496b', '#7d9fbf', '#6a8cad'] },
  { id: 'ruins',    n: '고대 유적',     floors: 15, lv: [40, 55], types: [6, 15, 9, 13, 16], mode: 'normal', req: 'mine', theme: '레지 시리즈',
    bosses: [486], mid: { floors: [4, 8, 12], pool: [377, 378, 379, 894, 895] }, wx: [['sand', 0.3], ['snow', 0.15]], pal: ['#3a3326', '#6b5d42', '#c2b08a', '#ad9b76'] },
  { id: 'shrine',   n: '재앙의 사당',   floors: 18, lv: [48, 64], types: [17, 12, 10, 15, 5, 4], mode: 'normal', req: 'dark', theme: '재앙의 보물과 충신',
    bosses: [1001, 1002, 1003, 1004], mid: { floors: [6, 12], pool: [1014, 1015, 1016, 1017] }, wx: [['fog', 0.3], ['sand', 0.15]], pal: ['#2a1f2a', '#553a4a', '#a88898', '#937485'] },
  { id: 'altar',    n: '해와 달의 제단', floors: 18, lv: [52, 68], types: [18, 14, 13, 12, 11, 9], mode: 'normal', req: 'sky', theme: '수호신 카푸',
    bosses: [791, 792], mid: { floors: [4, 8, 12, 16], pool: [785, 786, 787, 788] }, wx: [['sun', 0.3], ['fog', 0.2]], pal: ['#2c2a44', '#56508a', '#d8c98e', '#c4b47a'] },
  { id: 'coronet',  n: '천관산',        floors: 20, lv: [55, 72], types: [6, 9, 11, 8, 16, 14], mode: 'normal', req: 'sky', theme: '창조의 신',
    bosses: [483, 484, 487], mid: { floors: [5, 10, 15], pool: [480, 481, 482] }, wx: [['snow', 0.3], ['fog', 0.2]], pal: ['#2a2d3a', '#4f5670', '#b2b8cc', '#9ca3ba'] },
  { id: 'spiral',   n: '용의 나선탑',   floors: 20, lv: [58, 74], types: [16, 10, 13, 15, 2], mode: 'normal', req: 'canyon', theme: '이상과 진실',
    bosses: [643, 644, 646], mid: { floors: [5, 10, 15], pool: [638, 639, 640, 647] }, wx: [['sun', 0.2], ['rain', 0.2], ['snow', 0.2]], pal: ['#262a33', '#4a5262', '#a8b0bf', '#929aab'] },
  { id: 'areazero', n: '에리어 제로',   floors: 24, lv: [65, 85], types: null, mode: 'normal', req: 'summit', theme: '패러독스 포켓몬',
    bosses: [1007, 1008], mid: { floors: [6, 12, 18], pool: [...PARADOX_PAST, ...PARADOX_FUTURE] }, extra: [...PARADOX_PAST, ...PARADOX_FUTURE],
    wx: [['fog', 0.25], ['sun', 0.1]], pal: ['#1a2a2a', '#2f5452', '#8cc7bf', '#76b2aa'] },
);
const dungeonById = id => DUNGEONS.find(d => d.id === id);
const hasSprite = id => !!DATA.species[id];
// 최종·중간 보스 후보 (스프라이트가 있는 포켓몬만)
const bossPool = dg => (dg.bosses || []).filter(hasSprite);
const midPool = dg => (dg.mid ? dg.mid.pool : []).filter(hasSprite);

// 날씨: 던전마다 어울리는 날씨만 확률적으로 등장 (층마다 결정)
const WEATHERS = {
  sun:  { n: '쾌청',     icon: '☀', d: '불꽃 기술 1.5배, 물 기술 0.5배. 얼음 상태가 되지 않는다. 솔라빔을 모으지 않고 쏠 수 있다.' },
  rain: { n: '비',       icon: '🌧', d: '물 기술 1.5배, 불꽃 기술 0.5배.' },
  sand: { n: '모래바람', icon: '🌪', d: '바위·땅·강철 타입이 아니면 5턴마다 최대 HP의 1/16 데미지. 바위 타입의 특수방어 1.5배.' },
  snow: { n: '설경',     icon: '❄', d: '얼음 타입의 방어 1.5배. 얼음 타입이 아니면 추위로 배가 1.5배 빨리 고파진다.' },
  fog:  { n: '안개',     icon: '🌫', d: '모든 기술의 명중률 0.9배. 통로에서 시야가 1칸 좁아진다.' },
};
let CUR_WEATHER = null;
function rollWeather(dg) {
  let r = Math.random();
  for (const [w, p] of dg.wx || []) { if ((r -= p) < 0) return w; }
  return null;
}

// 층의 적 레벨이 이 값 이상일 때만 등장 (초반 던전에서는 나오지 않음)
const FEATURE_LV = { trap: 14, shop: 14, house: 20 };
const SHOP_CHANCE = 0.1, HOUSE_CHANCE = 0.25;
const KECLEON = 352;
const TRAPS = {
  psn:    { n: '독가시 함정', icon: '☠', d: '독 상태가 된다.' },
  slp:    { n: '수면 함정',   icon: '💤', d: '잠들어 버린다.' },
  par:    { n: '마비 함정',   icon: '⚡', d: '마비 상태가 된다.' },
  warp:   { n: '워프 함정',   icon: '🌀', d: '층 어딘가로 날아간다.' },
  blast:  { n: '폭발 함정',   icon: '💥', d: '주변 1칸의 모두가 최대 HP의 20% 데미지를 입는다.' },
  hunger: { n: '배고픔 함정', icon: '🍽', d: '배고픔이 20 줄어든다.' },
  summon: { n: '소환 함정',   icon: '📣', d: '주변에 적이 나타난다. (한 번만 작동)' },
  reset:  { n: '능력 리셋 함정', icon: '🔄', d: '오르거나 내려간 능력(랭크)이 모두 원래대로 돌아간다.' },
};
// 함정을 밟았을 때 작동할 확률: 모르는 함정 / 이미 발견한 함정
const TRAP_RATE = { hidden: 0.8, seen: 0.4 };
// 열매·씨앗은 먹으면 배가 조금 찬다
const BERRY_BELLY = 5;
// 흡수 기술(흡수·기가드레인·드레인펀치 등)은 실제로 깎은 HP의 이만큼(%)을 회복한다
const DRAIN_PCT = 30;
const isEdible = it => /(열매|씨)$/.test(it.n) && !!it.use && it.use !== 'none';
// 영입: 내가 쓰러뜨린 적이 동료가 되고 싶어 할 확률 (내 레벨 기준)
// Lv1 1.1% · Lv30 4% · Lv50 12.6% · Lv70 21.2% · Lv90 29.8% · 최대 35%. 전설과 보스는 절반
function recruitRate(lv) { return lv < 30 ? 0.01 + lv * 0.001 : Math.min(0.35, 0.04 + (lv - 30) * 0.0043); }
const RECRUIT_HALF = '전설·환상 포켓몬과 보스는 절반';
const RECRUIT_LEVEL = 5;   // 영입하면 이 레벨로 합류
// 진화 전 모습들 (가까운 순)
function preEvos(sp) {
  const out = [];
  let cur = sp;
  for (let i = 0; i < 4; i++) {
    const pre = Object.keys(DATA.species).map(Number).find(k => DATA.species[k].v.some(v => v[0] === cur));
    if (!pre || out.includes(pre)) break;
    out.push(pre); cur = pre;
  }
  return out;
}
// 이로치: 적이 이 확률로 색이 다른 모습으로 등장 (스프라이트가 있는 경우)
const SHINY_CHANCE = 1 / 80;
// 바람: 한 층에 오래 머물면 경고 후 던전 밖으로 날려간다 (쓰러진 것과 같은 패널티)
const WIND = { warn: [500, 650, 750], limit: 800 };
// 보스: 일반 던전은 마지막 층, 로그라이크는 10층마다와 마지막 층
const BOSSES = { forest: 12, beach: 99, crystal: 302, plains: 243, swamp: 89, volcano: 244, desert: 330, frost: 144, storm: 245,
  dark: 491, mine: 379, sky: 384, canyon: 445, summit: 483, trial: 68, twilight: 487, mystery: 493, eternal: 1157 };
// 영입할 수 없는 포켓몬 (특별한 보스 모습)
const NO_RECRUIT = [1157];
const isBossFloor = (dg, f) => f === dg.floors || (dg.mode === 'rogue' && f % 10 === 0) || !!(dg.mid && dg.mid.floors.includes(f) && midPool(dg).length);
// 초상화 표정 (SpriteCollab 파일 이름 ↔ 데이터 글자)
const EMOTIONS = { Normal: 'N', Happy: 'H', Pain: 'P', Determined: 'D', Joyous: 'J', Sad: 'S', Angry: 'A', Dizzy: 'Z', Surprised: 'U', Crying: 'C', Worried: 'W' };

const shopPrice = id => ITEMS[id].price || (ITEMS[id].sell || 100) * 3;
// 임무 보상 돈 배율 (v0.29에서 1 → 1.5)
const MISSION_MONEY_MUL = 1.5;
// 달성 선물: 친구 구조 5번마다, 임무 완료 20번마다 영양제·구미(무지개구미 포함)·특성패치 중 하나 (두 횟수는 따로 센다)
const MILESTONE_GIFT = { rescues: 5, missions: 20 };
const milestoneGiftPool = () => [...Object.keys(VITAMINS), ...Object.keys(GUMMIES), 'abpatch'];
// 마을 상점 새로고침 (그날 진열을 다시 뽑는다)
const SHOP_REROLL_COST = 3000;
// 파는 값: 사는 값의 1/4 (상점에 없는 물건은 정해진 값). 겹치는 물건은 5개 기준 값
const SELL_RATE = 0.25;
const sellOf = id => { const it = ITEMS[id]; return it.price ? it.price * SELL_RATE : (it.sell || 0); };
const sellValue = b => Math.floor(sellOf(b.id) * (ITEMS[b.id].stack ? b.n / 5 : 1)) || 1;

const STAT_NAMES = { 2: '공격', 3: '방어', 4: '특수공격', 5: '특수방어', 6: '스피드', 7: '명중률', 8: '회피율' };
const STATUS_NAMES = { psn: '독', brn: '화상', par: '마비', slp: '잠듦', frz: '얼음', cnf: '혼란' };
const STATUS_COLORS = { psn: '#c77dff', brn: '#ff7a3c', par: '#ffd84a', slp: '#9fb4ff', frz: '#7fe3ff', cnf: '#8ff0b0' };
const AILMENT_MAP = { 1: 'par', 2: 'slp', 3: 'frz', 4: 'brn', 5: 'psn', 6: 'cnf' };

// 유틸
const rand = n => Math.floor(Math.random() * n);
const rint = (a, b) => a + rand(b - a + 1);
const pick = arr => arr[rand(arr.length)];
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
function weighted(list) {
  const total = list.reduce((s, x) => s + x[1], 0);
  let r = Math.random() * total;
  for (const x of list) { if ((r -= x[1]) <= 0) return x[0]; }
  return list[list.length - 1][0];
}
const pad4 = n => String(n).padStart(4, '0');
// 객체에 그 키가 직접 있는지 ('constructor' 같은 이름으로 속이지 못하게: 서버·코드에서 온 값을 확인할 때)
const hasKey = (obj, k) => (typeof k === 'string' || typeof k === 'number') && Object.prototype.hasOwnProperty.call(obj, k);
// 리전폼(알로라·가라르·히스이·팔데아): 번호는 1101부터, species.f = [원래 번호, 스프라이트 폼 폴더]
const formOf = id => DATA.species[id] && DATA.species[id].f;
// 도감 번호: 0026 / 리전폼은 0026-1
const dexNo = id => { const f = formOf(id); return f ? `${pad4(f[0])}-${+f[1]}` : pad4(id); };
// 도감 순서: 리전폼은 원래 포켓몬 바로 뒤
const dexKey = id => { const f = formOf(id); return f ? f[0] + (+f[1]) / 100 : +id; };
const byDex = (a, b) => dexKey(a) - dexKey(b);
// SpriteCollab 폴더: 0026/ (이로치 0026/0000/0001/), 리전폼 0026/0001/ (이로치 0026/0001/0001/)
const spritePath = (id, shiny) => { const f = formOf(id); return f ? `${pad4(f[0])}/${f[1]}/${shiny ? '0001/' : ''}` : `${pad4(id)}/${shiny ? '0000/0001/' : ''}`; };
const spName = id => DATA.species[id]?.n || ('#' + id);
// 폼체인지·메가진화 모습(species.fc)은 따로 나오는 포켓몬이 아니다: 목록을 돌 때는 원래 포켓몬만 (js/forms.js)
const SPECIES_IDS = Object.keys(DATA.species).filter(id => !DATA.species[id].fc);
// 보이는 모습: 던전에서 모습이 바뀌면 c.fsp (그림·능력치·타입·이름), 원래 포켓몬 번호 c.sp는 저장·영입용으로 그대로
const looksOf = c => (c && c.fsp) || (c && c.sp);
const typeName = t => DATA.types[t - 1];
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
// 한국어 조사
function josa(word, a, b) {
  const c = String(word).charCodeAt(String(word).length - 1);
  if (c < 0xac00 || c > 0xd7a3) return word + a;
  return word + (((c - 0xac00) % 28) ? a : b);
}
// 조사 자동 선택: jo('피카츄','을') → '피카츄를', jo('파이리','으로') → '파이리로'
function jo(word, t) {
  const w = String(word), c = w.charCodeAt(w.length - 1);
  let fin = 0;
  if (c >= 0xac00 && c <= 0xd7a3) fin = (c - 0xac00) % 28;
  else if (/[0-9]$/.test(w)) fin = [21, 8, 0, 16, 0, 0, 1, 8, 8, 0][+w.slice(-1)];
  const pairs = { '을': ['을', '를'], '이': ['이', '가'], '은': ['은', '는'], '과': ['과', '와'] };
  if (t === '으로') return w + (fin && fin !== 8 ? '으로' : '로');
  return w + (fin ? pairs[t][0] : pairs[t][1]);
}

// ── 기술머신: 한 번 쓰면 사라지고, 배운 기술은 그 포켓몬이 영구히 기억한다 ──
const TM_IDS = [];
DATA.tms.forEach((mid, i) => {
  const m = DATA.moves[mid], id = 'tm' + mid;
  ITEMS[id] = {
    n: `기술머신${String(i + 1).padStart(3, '0')} ${m.n}`, tm: true, mv: mid, no: i + 1, icon: '💿', use: 'tm',
    d: `${typeName(m.t)} 타입 ${['', '변화', '물리', '특수'][m.c]} 기술 「${m.n}」을 가르친다. 한 번 쓰면 사라진다.`,
    price: m.c === 1 ? 1500 : 800 + (m.p || 0) * 15,
  };
  TM_IDS.push(id);
  DROP_TABLE.push([id, 0.015]);
});

// 가격 올리기: 값이 CHEAP_LIMIT 이하인 물건은 CHEAP_MUL배, 그보다 비싼 물건은 PRICEY_MUL배
// (지닌 물건 배율을 곱한 뒤 기준, 파는 값도 따라 오른다)
const CHEAP_LIMIT = 3000, CHEAP_MUL = 2, PRICEY_MUL = 1.5;
for (const it of Object.values(ITEMS)) if (it.price > 0) it.price = Math.round(it.price * (it.price <= CHEAP_LIMIT ? CHEAP_MUL : PRICEY_MUL) / 10) * 10;

// ── 아이템 등급: 층의 적 레벨이 낮으면 좋은 아이템은 떨어지지 않는다 ──
// 1 흔함 (처음부터) · 2 조금 드묾 · 3 드묾 · 4 아주 드묾
const TIER_LV = { 1: 0, 2: 10, 3: 20, 4: 35 };
const TIER_NAMES = { 1: '흔함', 2: '조금 드묾', 3: '드묾', 4: '아주 드묾' };
const TIER4 = ['lifeorb', 'luckyegg', 'amuletcoin', 'goldribbon', 'focussash', 'choicescarf', 'assaultvest', 'leftovers', 'expertbelt', 'friendbow', 'abpatch', 'rainbowgummy', 'starf', 'lansat'];
const TIER2 = ['reviver', 'escape', 'foesleep', 'superpotion', 'xattack', 'xdefense', 'xspatk', 'xspeed', 'xaccuracy', 'goldthorn', 'radar', 'trapbust', 'paraorb', 'sloworb',
  'lumi', 'lum', 'leppa', 'liechi', 'ganlon', 'petaya', 'apicot', 'salac'];
function itemTier(id) {
  const it = ITEMS[id];
  if (!it) return 1;
  if (TIER4.includes(id) || it.mega) return 4;   // 메가스톤은 js/forms.js에서 추가
  if (it.held || it.tm || VITAMINS[id] || GUMMIES[id] || ['candy', 'fullrestore', 'abcapsule'].includes(id)) return 3;
  if (TIER2.includes(id)) return 2;
  return 1;
}
// 그 레벨의 층에서 쓰는 드롭 테이블
// 높은 층(적 Lv HIGH_LV 이상)에서는 흔한 등급이 나오지 않는다. 단 식량·회복 아이템은 살아남는 데 꼭 필요해서 계속 나온다
const HIGH_LV = 20;
const ALWAYS_DROP = ['apple', 'bigapple', 'oran', 'sitrus', 'elixir'];
const dropCache = {};
function dropTable(lvl) {
  const key = Object.values(TIER_LV).filter(v => lvl >= v).length + (lvl >= HIGH_LV ? 'h' : '');
  return dropCache[key] || (dropCache[key] = DROP_TABLE.filter(([id]) => {
    const t = itemTier(id);
    if (lvl < TIER_LV[t]) return false;
    return !(lvl >= HIGH_LV && t === 1 && !ALWAYS_DROP.includes(id));
  }));
}
const tmBits = {};
function canLearnTM(sp, mid) {
  const i = DATA.tms.indexOf(mid);
  if (i < 0) return false;
  if (!(sp in tmBits)) tmBits[sp] = BigInt('0x' + (DATA.species[sp].tm || '0'));
  return ((tmBits[sp] >> BigInt(i)) & 1n) === 1n;
}
const tmMovesOf = sp => DATA.tms.filter(mid => canLearnTM(sp, mid));

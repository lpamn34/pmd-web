// 처음 시작할 때 포켓몬 정하기: 성격 진단(문답) 또는 직접 고르기
// 고를 수 있는 포켓몬: 진화 전 모습만, 전설·환상·준전설·패러독스·울트라비스트 제외
'use strict';

const PARADOX = [984, 985, 986, 987, 988, 989, 990, 991, 992, 993, 994, 995, 1005, 1006, 1009, 1010, 1020, 1021, 1022, 1023];
const ULTRA_BEASTS = [793, 794, 795, 796, 797, 798, 799, 803, 804, 805, 806];
// 진화체지만 예외로 시작할 수 있는 포켓몬
const STARTER_EXTRA = [25];
let _starterIds = null;
function starterIds() {
  if (_starterIds) return _starterIds;
  const evolved = new Set(Object.values(DATA.species).flatMap(s => s.v.map(v => v[0])));
  const ban = new Set([...PARADOX, ...ULTRA_BEASTS]);
  _starterIds = SPECIES_IDS.map(Number).filter(id => (!evolved.has(id) && !(formOf(id) && evolved.has(formOf(id)[0])) || STARTER_EXTRA.includes(id)) && !DATA.species[id].lg && !ban.has(id));
  return _starterIds;
}

const Starter = (() => {
  // 성격: 설명과 어울리는 포켓몬 후보 (고를 수 없는 포켓몬은 자동으로 빠진다)
  const NATURES = {
    hardy:   { n: '노력하는 타입', d: '한번 정한 일은 끝까지 해내는 성실한 성격. 힘든 길도 묵묵히 걸어가는 당신은 모두가 믿고 기대는 존재예요.', mons: [4, 390, 66, 246, 443, 447] },
    docile:  { n: '온순한 타입',   d: '다정하고 배려심이 깊은 성격. 누구와도 잘 어울리고, 주변을 편안하게 만들어 줘요.', mons: [1, 152, 133, 810, 495, 387] },
    brave:   { n: '용감한 타입',   d: '두려움보다 호기심이 앞서는 성격. 위험한 곳에도 앞장서서 뛰어드는 당신은 타고난 탐험가!', mons: [255, 498, 147, 374, 371, 633] },
    jolly:   { n: '명랑한 타입',   d: '늘 밝고 웃음이 많은 성격. 당신이 있는 곳엔 언제나 활기가 넘쳐요.', mons: [25, 172, 258, 393, 816, 427, 311] },
    impish:  { n: '장난꾸러기 타입', d: '짓궂은 장난을 좋아하지만 미워할 수 없는 성격. 재치와 꾀로 위기를 넘기는 데 선수예요.', mons: [7, 175, 570, 813, 353, 574] },
    naive:   { n: '천진난만한 타입', d: '순수하고 엉뚱한 성격. 생각보다 몸이 먼저 움직이지만, 그 솔직함이 당신의 매력이에요.', mons: [501, 650, 722, 906, 506, 403] },
    timid:   { n: '겁쟁이 타입',   d: '조심스럽고 섬세한 성격. 겁은 많지만, 그만큼 남들이 놓치는 것을 잘 알아채요.', mons: [280, 92, 607, 177, 355, 280] },
    hasty:   { n: '성급한 타입',   d: '생각보다 행동이 빠른 성격. 기다리는 건 질색! 추진력 하나는 누구에게도 지지 않아요.', mons: [158, 653, 725, 909, 309, 519] },
    sassy:   { n: '건방진 타입',   d: '자신감이 넘치는 당당한 성격. 할 말은 하는 편이지만, 실력으로 증명해 보이는 멋이 있어요.', mons: [656, 228, 551, 215, 559, 633] },
    calm:    { n: '차분한 타입',   d: '침착하고 생각이 깊은 성격. 급한 상황에서도 흔들리지 않고 최선의 길을 찾아내요.', mons: [60, 104, 138, 728, 387, 363] },
    relaxed: { n: '느긋한 타입',   d: '서두르지 않는 여유로운 성격. 당신의 한결같은 페이스가 주변 모두를 편안하게 해요.', mons: [79, 446, 194, 263, 912, 216] },
    lonely:  { n: '외로움을 타는 타입', d: '혼자만의 시간을 소중히 여기는 성격. 속마음은 따뜻해서, 한번 마음을 연 상대는 끝까지 지켜요.', mons: [304, 436, 686, 88, 624, 574] },
  };
  // 질문 (한 번에 8개를 무작위로)
  const QUESTIONS = [
    ['길에서 지갑을 주웠다. 어떻게 할까?', [['주인을 찾아 준다', { docile: 2, hardy: 1 }], ['가까운 곳에 맡긴다', { calm: 2 }], ['잠깐 고민한다...', { naive: 1, sassy: 1 }], ['못 본 척 지나간다', { lonely: 1, relaxed: 1 }]]],
    ['친구들과 놀 때 당신은?', [['앞장서서 이끈다', { brave: 2, hardy: 1 }], ['분위기를 띄운다', { jolly: 2 }], ['조용히 따라간다', { timid: 1, docile: 1 }], ['사실 혼자가 편하다', { lonely: 2 }]]],
    ['시험 전날 밤, 당신은?', [['계획대로 차근차근 공부한다', { hardy: 2, calm: 1 }], ['벼락치기!', { hasty: 2 }], ['그냥 잔다', { relaxed: 2 }], ['걱정돼서 잠이 안 온다', { timid: 2 }]]],
    ['누군가 당신에게 장난을 쳤다!', [['똑같이 되갚아 준다', { impish: 2, sassy: 1 }], ['웃어넘긴다', { jolly: 1, relaxed: 1 }], ['버럭 화를 낸다', { brave: 1, hasty: 1 }], ['속으로 삭인다', { lonely: 1, calm: 1 }]]],
    ['처음 보는 동굴 입구 앞에 섰다.', [['바로 들어간다', { brave: 2, naive: 1 }], ['준비를 단단히 하고 들어간다', { hardy: 1, calm: 2 }], ['누가 먼저 가기를 기다린다', { timid: 2 }], ['다음에 오기로 한다', { relaxed: 1, docile: 1 }]]],
    ['좋아하는 간식이 딱 하나 남았다.', [['친구에게 양보한다', { docile: 2 }], ['가위바위보로 정하자!', { jolly: 1, naive: 1 }], ['재빨리 먹어 버린다', { hasty: 2, impish: 1 }], ['반으로 나눈다', { calm: 2 }]]],
    ['갑자기 하루 쉬는 날이 생겼다.', [['모험을 떠난다', { brave: 1, jolly: 1 }], ['하루 종일 뒹군다', { relaxed: 2 }], ['새로운 걸 배운다', { hardy: 2 }], ['혼자만의 시간을 보낸다', { lonely: 2 }]]],
    ['친구가 약속 시간에 늦었다.', [['느긋하게 기다린다', { docile: 1, relaxed: 1 }], ['오면 한마디 한다', { sassy: 2 }], ['먼저 가 버린다', { hasty: 1, lonely: 1 }], ['무슨 일 있나 걱정한다', { timid: 1, calm: 1 }]]],
    ['사람들 앞에서 발표를 해야 한다.', [['자신 있다!', { brave: 1, sassy: 1 }], ['떨리지만 해낸다', { hardy: 2 }], ['농담으로 시작한다', { jolly: 1, impish: 1 }], ['어떻게든 피하고 싶다', { timid: 2 }]]],
    ['누군가 당신을 칭찬했다.', [['당연하지!', { sassy: 2 }], ['쑥스러워한다', { timid: 1, docile: 1 }], ['더 열심히 해야지', { hardy: 2 }], ['꿍꿍이가 있나 의심한다', { impish: 1, lonely: 1 }]]],
    ['낯선 곳에서 길을 잃었다!', [['일단 아무 방향으로 간다', { naive: 2, hasty: 1 }], ['지도를 꺼내 본다', { calm: 2 }], ['지나가는 사람에게 묻는다', { jolly: 1, docile: 1 }], ['느긋하게 구경이나 한다', { relaxed: 2 }]]],
    ['당신의 꿈은?', [['세상에서 제일 강해지기', { brave: 2 }], ['모두와 친구 되기', { jolly: 1, docile: 1 }], ['편하게 사는 것', { relaxed: 2 }], ['아직 잘 모르겠다', { naive: 2 }]]],
    ['친구의 비밀을 알게 됐다.', [['절대 말하지 않는다', { calm: 1, hardy: 1 }], ['참다가 살짝 흘린다', { naive: 1, impish: 1 }], ['그걸로 친구를 놀린다', { sassy: 1, impish: 1 }], ['금방 잊어버린다', { relaxed: 1, hasty: 1 }]]],
    ['비 오는 날, 우산이 없다.', [['뛰어간다!', { hasty: 2 }], ['그칠 때까지 기다린다', { relaxed: 1, calm: 1 }], ['빗속에서 신나게 논다', { jolly: 1, naive: 1 }], ['누가 씌워 주길 기다린다', { lonely: 1, timid: 1 }]]],
  ];
  const nextFrame = () => new Promise(r => setTimeout(r, 30));

  function candidates(key) {
    const ok = new Set(starterIds());
    const list = [...new Set(NATURES[key].mons)].filter(id => ok.has(id));
    return list.length ? list : [pick(starterIds())];
  }

  // 문답 → 성격 → 포켓몬
  async function quiz(onPick, back) {
    const qs = QUESTIONS.slice().sort(() => Math.random() - 0.5).slice(0, 8);
    const score = {};
    for (let i = 0; i < qs.length; i++) {
      const [q, answers] = qs[i];
      const got = await new Promise(res => UI.open({
        title: `성격 진단 (${i + 1}/${qs.length})`,
        html: `<p class="quiz-q">${esc(q)}</p>`,
        choices: answers.map(([t, pts]) => ({ label: esc(t), fn: () => res(pts) })),
        cancel: false,
      }));
      for (const [k, v] of Object.entries(got)) score[k] = (score[k] || 0) + v;
      await nextFrame();
    }
    const best = Math.max(...Object.values(score));
    const key = pick(Object.keys(score).filter(k => score[k] === best));
    showResult(key, candidates(key), 0, onPick, back);
  }

  function showResult(key, list, i, onPick, back) {
    const nat = NATURES[key], sp = list[i % list.length], d = DATA.species[sp];
    UI.open({
      title: '진단 결과', wide: true, cancel: false,
      html: `<div class="quiz-result"><p class="center">당신은... <b class="quiz-nature">${esc(nat.n)}</b>!</p>
        <p class="center dim">${esc(nat.d)}</p>
        <div class="center">${portraitImg(sp, 'portrait big')}</div>
        <p class="center">이런 당신에게 어울리는 포켓몬은... <b>${esc(d.n)}</b>!</p>
        <p class="center">${typeBadges(d.t)}</p>
        <p class="center dim">종족값 HP ${d.b[0]} / 공 ${d.b[1]} / 방 ${d.b[2]} / 특공 ${d.b[3]} / 특방 ${d.b[4]} / 스피드 ${d.b[5]}</p></div>`,
      choices: [
        { label: `${esc(jo(d.n, '과'))} 함께 모험을 시작한다`, fn: () => onPick(sp) },
        ...(list.length > 1 ? [{ label: `같은 성격의 다른 포켓몬 보기 (${(i % list.length) + 1}/${list.length})`, fn: () => setTimeout(() => showResult(key, list, i + 1, onPick, back), 0) }] : []),
        { label: '진단을 다시 한다', fn: () => setTimeout(() => quiz(onPick, back), 0) },
        { label: '← 방법 다시 고르기 (직접 고르기)', fn: () => setTimeout(back, 0) },
      ],
    });
  }

  // 시작 방법 고르기
  function begin(onPick, direct) {
    const menu = () => UI.open({
      title: '함께 모험할 포켓몬 정하기', cancel: false,
      html: `<p>어떻게 정할까요?</p><p class="dim">고를 수 있는 포켓몬: 진화 전 모습 ${starterIds().length}종 (전설·환상·준전설·패러독스·울트라비스트 제외)</p>`,
      choices: [
        { label: '🗒 성격 진단으로 정하기', sub: '몇 가지 질문에 답하면 당신에게 어울리는 포켓몬이 정해져요', fn: () => setTimeout(() => quiz(onPick, menu), 0) },
        { label: '🔍 직접 고르기', sub: '원하는 포켓몬을 목록에서 골라요', fn: () => setTimeout(() => direct(onPick, menu), 0) },
      ],
    });
    menu();
  }

  return { begin, NATURES };
})();

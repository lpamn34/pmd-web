// 게임 가이드: 타입 상성표, 전투·던전 규칙 (게임에 설정된 값을 그대로 읽어서 보여준다)
'use strict';

const Guide = (() => {
  const TOPICS = [
    ['types', '🔥 타입 상성표'],
    ['battle', '⚔ 전투 규칙'],
    ['status', '💫 상태이상'],
    ['weather', '🌦 날씨'],
    ['dungeon', '🗺 던전 규칙'],
    ['growth', '⭐ 성장과 보상'],
    ['controls', '⌨ 조작법'],
  ];
  const short = t => typeName(t).slice(0, 2);
  const badge = t => `<span class="type" style="background:${TYPE_COLORS[t - 1]}">${typeName(t)}</span>`;
  const mulText = m => (Math.round(m * 100) / 100).toString();
  const mulCls = m => (m >= 1.9 ? 'x4' : m > 1 ? 'x2' : m === 1 ? '' : m >= 0.69 ? 'xh' : m >= 0.49 ? 'xq' : 'x0');

  function typeChart() {
    const T = DATA.types.map((_, i) => i + 1);
    const head = `<tr><th class="corner">공격 ↓ / 방어 →</th>${T.map(t => `<th style="background:${TYPE_COLORS[t - 1]}" title="${typeName(t)}">${short(t)}</th>`).join('')}</tr>`;
    const rows = T.map(a => `<tr><th style="background:${TYPE_COLORS[a - 1]}">${typeName(a)}</th>${T.map(d => {
      const m = typeEff(a, [d]);
      return `<td class="${mulCls(m)}" title="${typeName(a)} → ${typeName(d)}: ×${mulText(m)}">${m === 1 ? '' : mulText(m)}</td>`;
    }).join('')}</tr>`).join('');
    return `<p>이 게임은 원작 불가사의 던전처럼 상성 배율이 완만합니다.</p>
      <div class="legend"><span class="x2">1.4 효과가 굉장함</span><span class="xh">0.7 효과가 별로</span><span class="xq">0.5 원래 무효인 상성 (약하게 맞음)</span>
      <span class="dim">타입이 2개면 곱합니다. 예) 1.4×1.4=1.96, 0.7×0.7=0.49</span></div>
      <div class="chart-wrap"><table class="type-chart">${head}${rows}</table></div>
      <h3>타입 조합 계산기</h3>
      <div class="picker-bar"><select id="gc-a">${T.map(t => `<option value="${t}">${typeName(t)}</option>`).join('')}</select>
        <select id="gc-b"><option value="">(단일 타입)</option>${T.map(t => `<option value="${t}">${typeName(t)}</option>`).join('')}</select></div>
      <div id="gc-out"></div>
      <p class="dim">특성에 의한 무효(부유, 저수, 불가사의부적 등)는 따로 적용되어 완전히 막힙니다. 날씨·특성·지닌 물건 보정은 여기에 더 곱해집니다.</p>`;
  }
  function calcCombo(box) {
    const a = +box.querySelector('#gc-a').value, b = +box.querySelector('#gc-b').value;
    const types = b && b !== a ? [a, b] : [a];
    const groups = {};
    DATA.types.forEach((_, i) => { const m = typeEff(i + 1, types); (groups[mulText(m)] = groups[mulText(m)] || []).push(i + 1); });
    const order = Object.keys(groups).sort((x, y) => y - x);
    box.querySelector('#gc-out').innerHTML = `<table class="combo">${order.filter(k => k !== '1').map(k => `<tr><td class="${mulCls(+k)}">×${k}</td><td>${groups[k].map(badge).join(' ')}</td></tr>`).join('')}</table>`;
  }

  function battle() {
    return `<table class="rules">
      <tr><td>데미지</td><td>원작과 같은 계산식 (레벨·위력·공격/방어). 자기 타입 기술은 <b>1.5배</b> (적응력 2배).</td></tr>
      <tr><td>일반 공격</td><td>타입 없는 위력 ${NORMAL_ATTACK.p} 물리 공격. PP를 쓰지 않는다.</td></tr>
      <tr><td>급소</td><td>기본 1/16 확률, <b>1.5배</b> (스나이퍼 2.25배). 급소율 단계: 1/16 → 1/8 → 1/2 → 확정.</td></tr>
      <tr><td>능력 단계</td><td>−6 ~ +6. 공격·방어·특공·특방은 +1마다 1.5배, +2에 2배… / 명중·회피는 +1마다 1.33배. 층을 내려가면 초기화.</td></tr>
      <tr><td>스피드</td><td>상대보다 빠를수록 명중률이 오르고 상대 공격을 잘 피한다. <b>2배 빠르면 +20%, 절반이면 −20%</b> (최대 ±20%). 마비는 스피드 절반. "반드시 명중" 기술은 영향 없음.</td></tr>
      <tr><td>기술 범위</td><td>앞 1칸 / 원거리(직선 8칸의 첫 적) / 주변 3칸의 모든 적 / 자신.</td></tr>
      <tr><td>반동 기술</td><td>반동 데미지는 원작의 <b>절반</b>. 자폭·대폭발은 기절 대신 HP 1.</td></tr>
      <tr><td>특수 기술</td><td>모으기·반동·난동·첫 공격 전용 등 원작 조건은 던전에 맞게 재해석. 기술 설명의 <b>⚑ 던전 규칙</b> 참고.</td></tr>
      <tr><td>특성</td><td>원작 효과 또는 던전용 효과. 특성 설명의 <b>⚑ 던전 규칙</b> 참고. 발동하면 로그에 [특성 이름]이 표시된다.</td></tr>
    </table>`;
  }

  function status() {
    return `<table class="rules">
      <tr><td>☠ 독</td><td>2턴마다 최대 HP의 1/14 데미지. 15턴 지속. 독·강철 타입은 걸리지 않는다.</td></tr>
      <tr><td>🔥 화상</td><td>2턴마다 최대 HP의 1/14 데미지 + 물리 공격 절반. 15턴 지속. 불꽃 타입은 걸리지 않는다.</td></tr>
      <tr><td>⚡ 마비</td><td>25% 확률로 행동 불가, 스피드 절반. 15턴 지속. 전기 타입은 걸리지 않는다.</td></tr>
      <tr><td>💤 잠듦</td><td>3~5턴 행동 불가.</td></tr>
      <tr><td>❄ 얼음</td><td>2~4턴 행동 불가. 공격받으면 30% 확률로 녹는다. 얼음 타입·쾌청일 때는 걸리지 않는다.</td></tr>
      <tr><td>? 혼란</td><td>4~7턴 동안 50% 확률로 엉뚱한 방향으로 이동·공격.</td></tr>
      <tr><td>풀죽음</td><td>다음 한 번의 행동을 못 한다.</td></tr>
      <tr><td>회복</td><td>치료씨·회복약으로 즉시 회복. 시간이 지나면 자연히 낫는다.</td></tr>
    </table>`;
  }

  function weather() {
    return `<table class="rules">${Object.values(WEATHERS).map(w => `<tr><td>${w.icon} ${w.n}</td><td>${esc(w.d)}</td></tr>`).join('')}</table>
      <h3>던전별 날씨 (층마다 확률)</h3>
      <table class="rules">${DUNGEONS.filter(d => !d.daily && d.wx && d.wx.length).map(d => `<tr><td>${esc(d.n)}</td><td>${d.wx.map(([w, p]) => `${WEATHERS[w].icon}${WEATHERS[w].n} ${Math.round(p * 100)}%`).join(' · ')}</td></tr>`).join('')}</table>
      <p class="dim">가뭄·잔비·모래날림·눈퍼뜨리기 특성은 날씨를 바꾸고, 날씨부정·에어록(플레이어)은 날씨 효과를 없앤다.</p>`;
  }

  function dungeon() {
    return `<table class="rules">
      <tr><td>배고픔</td><td>턴마다 0.08씩 줄어든다 (설경에서 얼음 타입이 아니면 1.5배). 0이 되면 턴마다 HP가 1씩 준다.</td></tr>
      <tr><td>자연 회복</td><td>배가 차 있으면 조금씩 HP가 회복된다. 재생력·먹다남은음식 등으로 빨라진다.</td></tr>
      <tr><td>적 등장</td><td>30~45턴마다 보이지 않는 곳에 새 적이 나타난다.</td></tr>
      <tr><td>함정</td><td>층의 적 레벨 <b>${FEATURE_LV.trap}</b> 이상에서 등장. 숨겨져 있다가 밟거나 옆에서 발견(20%)하면 보인다. 자동 탐색은 발견한 함정을 피한다.
        <div class="dim">${Object.values(TRAPS).map(t => `${t.icon} ${t.n}: ${t.d}`).join('<br>')}</div></td></tr>
      <tr><td>몬스터 하우스</td><td>적 레벨 <b>${FEATURE_LV.house}</b> 이상에서 ${Math.round(HOUSE_CHANCE * 100)}%. 아이템이 많은 방에 들어가면 적 6~9마리가 나타난다.</td></tr>
      <tr><td>켈리몬 상점</td><td>적 레벨 <b>${FEATURE_LV.shop}</b> 이상에서 ${Math.round(SHOP_CHANCE * 100)}%. 진열된 물건 위에 서면 사고, 켈리몬에게 말을 걸면 판다.</td></tr>
      <tr><td>계단</td><td>밟으면 다음 층으로 갈지 묻는다. 마지막 층의 계단은 출구.</td></tr>
      <tr><td>보스 층</td><td>일반 던전의 마지막 층, 로그라이크는 10층마다와 마지막 층. 큰 방에서 보스(HP 3.5배)와 부하 둘이 기다린다. 보스를 쓰러뜨려야 계단이 나타나고, 돈과 좋은 아이템을 얻는다. 보스는 상태이상이 절반만 지속된다.</td></tr>
      <tr><td>바람</td><td>한 층에 ${WIND.warn[0]}턴 넘게 머물면 바람이 불기 시작하고, ${WIND.limit}턴이 되면 던전 밖으로 날려간다 (쓰러진 것과 같은 패널티).</td></tr>
      <tr><td>✨ 이로치</td><td>적이 ${Math.round(1 / SHINY_CHANCE)}분의 1 확률로 색이 다른 모습으로 나타난다. 쓰러뜨리면 경험치 2배와 좋은 아이템. 보스도 이로치로 나올 수 있다. 어떤 포켓몬의 이로치를 쓰러뜨리거나 영입하면, 그 포켓몬의 이로치 모습을 캐릭터 탭에서 고를 수 있다 (진화해도 유지).</td></tr>
      <tr><td>🤝 영입</td><td>내가 쓰러뜨린 적이 가끔 동료가 되고 싶어 한다. 영입하면 Lv${RECRUIT_LEVEL}로 캐릭터 목록에 들어가고, 마을에서 바꿔 플레이할 수 있다. 진화한 포켓몬을 영입하면 진화 전 모습도 함께 해금된다. 친구리본을 지니면 확률 1.5배.
        확률은 내 레벨에 따라: Lv10 ${(recruitRate(10) * 100).toFixed(0)}% · Lv30 ${(recruitRate(30) * 100).toFixed(0)}% · Lv50 ${(recruitRate(50) * 100).toFixed(0)}% · Lv70 ${(recruitRate(70) * 100).toFixed(0)}% · Lv90 ${(recruitRate(90) * 100).toFixed(0)}% (최대 35%). ${RECRUIT_HALF}. 현상수배범과 이미 영입한 포켓몬은 나오지 않는다.</td></tr>
      <tr><td>탈출</td><td>탈출구슬을 쓰거나, 임무를 완료하면 바로 마을로 돌아갈 수 있다.</td></tr>
    </table>`;
  }

  function growth() {
    return `<table class="rules">
      <tr><td>경험치</td><td>쓰러뜨린 적의 레벨이 내 레벨보다 낮을수록 줄어든다 (5세대식). 보스·현상수배범 ${BOSS_EXP_MUL}배, 행복의알 1.5배. 전설·환상은 필요 경험치 ${LEGEND_EXP_DIV}배, 울트라비스트·패러독스 ${STRONG_EXP_DIV}배 (도감에서 포켓몬마다 확인).</td></tr>
      <tr><td>아이템 등급</td><td>던전 바닥의 아이템은 층의 적 레벨에 따라 나온다: ${Object.entries(TIER_LV).map(([t, lv]) => `${TIER_NAMES[t]} Lv${lv}+`).join(' · ')}. 초반 던전에는 흔한 아이템만. 한 층에 ${ITEMS_PER_FLOOR[0]}~${ITEMS_PER_FLOOR[1]}개, 쓰러뜨린 적이 ${Math.round(ENEMY_DROP_CHANCE * 100)}% 확률로 떨어뜨린다.</td></tr>
      <tr><td>전용 도구</td><td>금강옥·전기구슬처럼 정해진 포켓몬만 쓰는 도구. 그 포켓몬이 나오는 던전에서만 드물게 떨어지고(보스가 주인이면 ${Math.round(SIG_DROP.boss * 100)}%), 마을 상점에 가끔 진열된다.</td></tr>
      <tr><td>진화</td><td>마을의 캐릭터 탭에서. 레벨 진화는 레벨만, 아이템 진화는 진화의돌, 통신 진화는 연결의끈이 필요. 그 외 조건(친밀도 등)은 Lv25.</td></tr>
      <tr><td>기술</td><td>레벨업으로 배우고, 마을의 기술 설정에서 배운 기술 중 4개를 자유롭게 고른다. 기술머신으로 배운 기술도 영구히 기억한다.</td></tr>
      <tr><td>특성 / 지닌 물건</td><td>캐릭터 탭에서 특성을 바꿀 수 있다. 일반 특성으로 바꾸려면 ⚗특성캡슐, 숨겨진 특성으로 바꾸려면 🧩특성패치가 하나 필요하다 (상점에 가끔 진열, 던전에서 드물게 발견). 지닌 물건은 하나 지닌다.</td></tr>
      <tr><td>일반 던전에서 쓰러지면</td><td>레벨 유지. 가방 아이템의 <b>절반</b>(무작위)과 지닌 물건(50%), 이번 탐험에서 주운 돈을 잃는다. 점착 특성이면 1/4.</td></tr>
      <tr><td>로그라이크 던전</td><td>Lv${ROGUE_LEVEL}, 기본 가방(오랭열매 2, 사과 1), 지닌 물건 없이 입장. 나오면 원래대로. 클리어·탈출하면 주운 돈과 아이템(창고로)을 가져온다.</td></tr>
      <tr><td>임무</td><td>구조(의뢰인에게 말 걸기) / 현상수배(강한 적 쓰러뜨리기) / 탐색(의뢰품 줍기). 완료 후 마을로 돌아오면 보상.</td></tr>
      <tr><td>👑 테마 던전</td><td>같은 시리즈로 묶이는 포켓몬이 보스로 나온다. 중간 보스 층에서는 시리즈 멤버가(한 탐험에서 겹치지 않게), 마지막 층에서는 최종 보스 후보 중 하나가 무작위로 나온다.
        ${DUNGEONS.filter(d => d.theme).map(d => `${esc(d.n)}(${esc(d.theme)})`).join(', ')}.</td></tr>
      <tr><td>🆘 친구 구조</td><td>일반 던전에서 쓰러지면 SOS 코드로 친구에게 구조를 요청할 수 있다 (한 번에 하나). 기다리는 동안 패널티 없이 다른 던전을 탐험할 수 있다.
        친구가 임무 탭에 SOS 코드를 넣으면 구조 임무가 생기고 (그 던전이 열려 있어야 함), 그 층에서 말을 걸면 구조 성공 → A-OK 코드.
        A-OK 코드를 넣으면 쓰러진 층부터 이어서 탐험. 감사 코드로 아이템을 선물할 수 있다.</td></tr>
      <tr><td>☁ 계정</td><td>로그인은 선택이다. 로그인하면 세이브가 클라우드에도 저장되어 다른 기기에서 이어할 수 있다 (던전을 마치고 돌아올 때, 창을 닫거나 다른 탭으로 갈 때, 마을에서는 10분마다 자동 저장. 이 브라우저에는 매번 바로 저장).
        이메일을 받지 않으므로 비밀번호를 잊으면 찾을 수 없다.</td></tr>
      <tr><td>📋 구조 게시판</td><td>로그인한 상태에서 쓰러져 구조를 요청하면 게시판에 올라간다. 같은 버전의 다른 플레이어가 임무 탭의 게시판에서 골라 구조하러 갈 수 있고,
        게시판에는 가장 오래 기다린 요청 10개가 보이고, 누가 구조하러 가면 그 요청은 2시간 동안 다른 사람에게 보이지 않는다 (게시판 구조는 한 번에 2개까지).
        구조하고 마을로 돌아오면 요청자가 되살아나고, 구조한 사람은 구조 보답(무작위 아이템 + 돈)을 바로 받는다. 감사 편지(선물)는 요청자가 보내면 더 온다. 요청은 7일 동안 보인다.</td></tr>
      <tr><td>🥤 영양제</td><td>맥스업(HP +4)·타우린(공격)·사포닌(방어)·리보플라빈(특공)·키토산(특방)·알칼로이드(스피드) 각 +2. 캐릭터 탭에서 먹이면 그 포켓몬에게 영구히 남고, 능력치마다 ${VITAMIN_MAX}번까지. 일반 던전에서만 적용된다. 상점(가끔)·던전 바닥·보스·업적 보상으로 얻는다.</td></tr>
      <tr><td>🍬 구미</td><td>아주 드문 간식. 먹으면 배가 15 차고 (무지개구미는 30), 능력치가 영구히 오른다: 하양 HP +2, 빨강 공격 +1, 노랑 방어 +1, 파랑 특공 +1, 초록 특방 +1, 분홍 스피드 +1, 무지개 전부. 능력치마다 ${GUMMY_MAX}번까지 (영양제와 따로 셈). 로그라이크에서 먹으면 그 탐험 동안만.</td></tr>
      <tr><td>🎀 전용 도구</td><td>굵은뼈(탕구리·텅구리), 전기구슬(피카츄), 심해의이빨/비늘(진주몽), 금속/스피드파우더(메타몽), 럭키펀치(럭키), 대파(파오리·창파나이트), 마음의물방울(라티아스·라티오스), 금강옥·백옥·백금옥(디아루가·펄기아·기라티나). 정해진 포켓몬만 효과가 있다.</td></tr>
      <tr><td>🗓 오늘의 도전</td><td>날짜마다 바뀌는 ${Progress.DAILY.floors}층 로그라이크. 그날 정해진 포켓몬(Lv${ROGUE_LEVEL})으로 도전하고, 같은 날이면 누구나 같은 맵이 나온다. 하루 한 번. 도달한 층 × ₽40 (완주 +₽1000). 기록은 던전 탭에서 공유.</td></tr>
      <tr><td>🏆 업적 / 도감</td><td>업적을 달성하면 돈과 아이템(창고로)을 받는다. 도감은 만난 포켓몬과 쓰러뜨린 포켓몬을 기록한다.</td></tr>
      <tr><td>가방 / 창고</td><td>가방 ${BAG_BASE}칸, 창고 ${STORAGE_BASE}칸에서 시작해 돈으로 확장 (가방 최대 ${BAG_LIMIT}, 창고 최대 ${STORAGE_LIMIT}).</td></tr>
    </table>`;
  }

  function open(topic) {
    if (topic === 'controls') { Dungeon.showHelp(); return; }
    const t = TOPICS.find(x => x[0] === topic);
    const body = { types: typeChart, battle, status, weather, dungeon, growth }[topic]();
    UI.open({
      title: t[1], wide: true, html: `<div class="guide">${body}</div>`,
      choices: [{ label: '다른 항목 보기', fn: menu }, { label: '닫기', fn: () => {} }],
      onOpen: box => {
        if (topic !== 'types') return;
        box.querySelector('#gc-a').onchange = box.querySelector('#gc-b').onchange = () => calcCombo(box);
        calcCombo(box);
      },
    });
  }
  function menu() {
    UI.open({ title: '📖 게임 가이드', choices: TOPICS.map(([k, n]) => ({ label: n, fn: () => open(k) })) });
  }
  const buttons = () => TOPICS.map(([k, n]) => `<button class="btn ghost" data-act="guide" data-arg="${k}">${n}</button>`).join(' ');
  return { open, menu, buttons };
})();

// 던전용 특수 기술 규칙 (원작 조건을 턴제 던전에 맞게 재해석)
'use strict';

const RECOIL_MUL = 0.5;     // 반동 데미지 완화 (원작의 절반)
const MOVE_RULES = {};
function rule(ids, r) { for (const id of ids) MOVE_RULES[id] = { ...(MOVE_RULES[id] || {}), ...r }; }

// 첫 공격 전용: 그 적에게 하는 첫 공격일 때만 성공
rule([252, 660], { first: true, text: '그 적에게 하는 첫 공격일 때만 성공한다.' });
// 기습: 상대가 잠듦·얼음 상태이거나 나를 알아채지 못했으면 실패
rule([389], { sucker: true, text: '상대가 잠들었거나 얼어 있거나 아직 나를 알아채지 못했으면 실패한다.' });
// 꿈먹기 / 코골기
rule([138], { needSleepTarget: true, text: '잠든 상대에게만 성공한다.' });
rule([173], { needSleepSelf: true, text: '자신이 잠들어 있을 때만 쓸 수 있다. (잠든 상태에서도 사용 가능)' });
// 힘껏펀치: 지난 행동 이후 공격을 받았다면 실패
rule([264], { focus: true, text: '지난 행동 이후 공격을 받았다면 실패한다.' });
// 반동으로 다음 턴 행동 불가
rule([63, 416, 439, 459, 711, 794], { recharge: true, text: '사용한 다음 턴은 움직일 수 없다.' });
// 모으기 기술 (1턴째 준비, 다음 행동 때 발사)
rule([76, 669], { charge: '빛을 모으고 있다!', sunNoCharge: true });
rule([311], { weatherBall: true, text: '날씨에 따라 타입이 바뀌고 위력이 100이 된다 (쾌청 불꽃, 비 물, 모래바람 바위, 설경 얼음).' });
rule([143], { charge: '거센 공기에 휩싸였다!' });
rule([130], { charge: '머리를 움츠렸다!', chargeSc: [[3, 1]] });
rule([601], { charge: '파워를 모으고 있다!' });
rule([19, 340], { charge: '하늘 높이 날아올랐다!', invuln: true });
rule([91], { charge: '땅속으로 파고들었다!', invuln: true });
rule([291], { charge: '물속으로 잠수했다!', invuln: true });
rule([467, 566], { charge: '모습을 감췄다!', invuln: true });
// 난동: 2~3턴 동안 자동으로 공격, 끝나면 혼란
rule([37, 80, 200], { rampage: true, text: '2~3턴 동안 가까운 적을 자동으로 공격하고, 끝나면 혼란에 빠진다. (PP는 처음에만 소모)' });
// 지연 공격
rule([248, 353], { delay: 2, text: '2턴 뒤에 앞의 적에게 공격이 떨어진다.' });
// 자폭 계열 (완화: 기절 대신 HP가 1 남음)
rule([120, 153], { selfKO: true, text: '사용하면 자신의 HP가 1만 남는다. (원작은 기절)' });
rule([720], { selfDmgPct: 25, text: '사용하면 최대 HP의 25%만큼 데미지를 입는다. HP가 1 아래로는 떨어지지 않는다. (원작 50%)' });
// HP를 깎는 변화 기술
rule([775], { hpCostPct: 33, text: '최대 HP의 1/3을 깎아서 사용한다. HP가 부족하면 실패한다.' });
// 혼자 탐험하므로 상대 회복 기술은 자기 회복으로
rule([505, 666], { selfHeal: true, text: '혼자 탐험하므로 자신의 HP를 회복한다.' });
// 칼등치기
rule([206], { falseSwipe: true, text: '상대의 HP를 반드시 1 남긴다.' });
// 조건부 위력
rule([263], { pow: 'guts', text: '자신이 독·마비·화상 상태이면 위력이 2배.' });
rule([474], { pow: 'venom', text: '상대가 독 상태이면 위력이 2배.' });
rule([362], { pow: 'brine', text: '상대의 HP가 절반 이하이면 위력이 2배.' });
rule([284, 323, 820], { pow: 'eruption', text: '자신의 HP가 적을수록 위력이 떨어진다.' });
rule([500, 681], { pow: 'stored', text: '자신의 능력이 올라간 단계만큼 위력이 20씩 오른다.' });
rule([279, 419], { pow: 'revenge', text: '지난 행동 이후 그 상대에게 공격받았다면 위력이 2배.' });
rule([371], { pow: 'payback', text: '지난 행동 이후 공격을 받았다면 위력이 2배.' });
rule([372], { pow: 'assurance', text: '지난 행동 이후 상대가 이미 데미지를 입었다면 위력이 2배.' });
rule([754, 755], { pow: 'firstStrike', text: '그 적에게 하는 첫 공격이면 위력이 2배.' });
rule([707], { pow: 'stomp', text: '지난번 기술이 빗나갔다면 위력이 2배.' });
rule([205], { chain: 3, text: '연속으로 쓸 때마다 위력이 2배 (최대 8배). 다른 행동을 하면 초기화.' });
rule([210], { chain: 2, text: '연속으로 쓸 때마다 위력이 2배 (최대 4배). 다른 행동을 하면 초기화.' });
rule([497], { chain: 4, text: '연속으로 쓸 때마다 위력이 40씩 오른다 (최대 200). 다른 행동을 하면 초기화.', chainAdd: true });
rule([167], { escalate: true, text: '맞을 때마다 위력이 10씩 오른다 (10 → 20 → 30).' });
// 교체 기술: 던전에서는 교체 없음
rule([369, 521, 812], { text: '던전에서는 교체 효과 없이 공격만 한다.' });
rule([575], { text: '던전에서는 교체 효과 없이 능력만 떨어뜨린다.' });

function moveRuleText(mid) {
  const r = MOVE_RULES[mid]; if (!r) return '';
  if (r.text) return r.text;
  if (r.charge) return `1턴째에 준비하고 다음 행동 때 발사한다.${r.invuln ? ' 준비하는 동안에는 공격을 받지 않는다.' : ''}${r.chargeSc ? ' 준비할 때 방어가 오른다.' : ''}${r.sunNoCharge ? ' 쾌청일 때는 바로 발사한다.' : ''} (아무 키나 누르면 발사)`;
  return '';
}

// 연속 기술: PokeAPI에 횟수가 비어 있는 최신 기술 보완
[[865, [3, 3]], [888, [2, 2]], [860, [1, 10]]].forEach(([id, h]) => { if (DATA.moves[id] && !DATA.moves[id].hits) DATA.moves[id].hits = h; });
rule([813], { escalate: true, text: '맞을 때마다 위력이 20씩 오른다 (20 → 40 → 60).' });
rule([860], { popBomb: true, text: '한 번 맞을 때마다 90% 확률로 다음 공격이 이어진다 (최대 10회, 평균 약 6회). 스킬링크면 항상 10회.' });

// ── 원본 데이터(PokeAPI)에 표시가 빠진 8·9세대 기술 바로잡기 ──
// 접촉 표시가 없으면 원거리(직선) 기술로 분류되어 바로 앞의 적도 제대로 맞히지 못했다 (예: 찍찍베기, 제트펀치)
// 1 접촉, 8 펀치, 9 소리, 16 물기, 17 파동, 18 탄환
const MOVE_FLAG_FIX = {
  1: [827, 828, 830, 834, 838, 845, 853, 857, 859, 860, 861, 862, 865, 866, 869, 872, 873, 875, 878, 879, 884, 885, 887, 889, 891, 892, 894, 910, 912, 915, 916, 918],
  8: [857, 889],
  9: [871, 914, 917],
  16: [746, 755],
  17: [805],
  18: [780, 903],
};
for (const [flag, ids] of Object.entries(MOVE_FLAG_FIX)) {
  for (const id of ids) {
    const m = DATA.moves[id]; if (!m) continue;
    m.fg = [...new Set([...(m.fg || []), +flag])].sort((a, b) => a - b);
    if (+flag === 1 && m.c !== 1 && m.r === 'p') m.r = 'f';   // 접촉 기술은 바로 앞 칸
  }
}

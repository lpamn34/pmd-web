// 전투 / 성장 메커니즘
'use strict';

const NORMAL_ATTACK = { n: '공격', t: 0, p: 40, a: 100, pp: 0, c: 2, r: 'f', fg: [1] };
const MAX_LEVEL = 100;

const expFor = lv => lv >= MAX_LEVEL ? Infinity : Math.pow(lv, 3);
// 레벨업 속도: 얻는 경험치를 이 수로 나눈다 (= 필요 경험치 배수). 경험치 표 자체는 모두 같아서 기존 세이브가 흐트러지지 않는다
//  전설·준전설·환상 2배, 울트라비스트·패러독스 1.6배 (종족값이 높아 레벨이 빨리 오르는 것 보정)
//  그 밖에는 원작의 성장 그룹을 절반쯤만 반영: 느림 1.15 · 보통-느림 1.05 · 보통 1 · 빠름 0.9 · 불규칙 0.85 · 변동 1.2
const LEGEND_EXP_DIV = 2, STRONG_EXP_DIV = 1.6;
// 모든 포켓몬 공통: 적을 쓰러뜨려 얻는 경험치 배율, 보스·현상수배범 배율 (v0.29에서 1 → 0.5, 3 → 2 / v0.30에서 0.5 → 0.3)
const EXP_RATE = 0.3, BOSS_EXP_MUL = 2;
const GROWTH_EXP_DIV = { 1: 1.15, 2: 1, 3: 0.9, 4: 1.05, 5: 0.85, 6: 1.2 };
function expDiv(sp) {
  const d = DATA.species[sp]; if (!d) return 1;
  if (d.lg) return LEGEND_EXP_DIV;
  const base = d.f ? d.f[0] : +sp;
  if ((typeof PARADOX !== 'undefined' && PARADOX.includes(base)) || (typeof ULTRA_BEASTS !== 'undefined' && ULTRA_BEASTS.includes(base))) return STRONG_EXP_DIV;
  return GROWTH_EXP_DIV[d.gr || 2] || 1;
}

function calcStats(sp, lv, iv) {
  const b = DATA.species[sp].b;
  const f = B => Math.floor((2 * B + iv) * lv / 100);
  return {
    maxhp: f(b[0]) + lv + 10,
    atk: f(b[1]) + 5, def: f(b[2]) + 5, spa: f(b[3]) + 5, spd: f(b[4]) + 5, spe: f(b[5]) + 5,
  };
}

function isDamaging(mid) { const m = DATA.moves[mid]; return m && m.c !== 1; }

function defaultMoves(sp, lv) {
  const list = [];
  for (const [l, m] of DATA.species[sp].l) if (l <= lv && !list.includes(m)) list.push(m);
  let moves = list.slice(-4);
  if (!moves.some(isDamaging)) {
    const dmg = list.filter(isDamaging).pop();
    if (dmg) moves = [dmg, ...moves.slice(-3)];
  }
  return moves;
}
const learnableUpTo = (sp, lv) => [...new Set(DATA.species[sp].l.filter(([l]) => l <= lv).map(x => x[1]))];
const learnedAt = (sp, lv) => DATA.species[sp].l.filter(([l]) => l === lv).map(x => x[1]);

// 던전 안에서 쓰는 개체
function makeCreature(sp, lv, opts = {}) {
  const d = DATA.species[sp];
  const iv = opts.player ? 31 : 8;
  const c = {
    sp, lv, exp: opts.exp || expFor(lv), types: d.t.slice(), player: !!opts.player,
    iv, stages: {}, status: null, statusT: 0, flinch: false, dir: 0, x: 0, y: 0, id: Math.random(),
    ...applyBoost(calcStats(sp, lv, iv), opts.boost),
  };
  if (opts.boost) c.boost = { ...opts.boost };
  c.ability = opts.ability != null ? opts.ability : (opts.player ? defaultAbility(sp) : randomAbility(sp));
  c.hp = c.maxhp;
  const ml = opts.moves || defaultMoves(sp, lv);
  c.moves = ml.map(id => ({ id, pp: DATA.moves[id].pp, max: DATA.moves[id].pp }));
  if (opts.pp) c.moves.forEach((m, i) => { if (opts.pp[i] != null) m.pp = Math.min(m.max, opts.pp[i]); });
  return c;
}

function recalc(c) {
  const old = c.maxhp;
  Object.assign(c, applyBoost(calcStats(looksOf(c), c.lv, c.iv), c.boost));   // 모습이 바뀌면 그 모습의 능력치
  if (c.hpMul) c.maxhp = Math.floor(c.maxhp * c.hpMul);   // 보스·현상수배범의 HP 배율 (모습이 바뀌어도 유지)
  if (c.statMul) for (const k of ['atk', 'def', 'spa', 'spd']) c[k] = Math.floor(c[k] * c.statMul);
  c.hp = clamp(c.hp + (c.maxhp - old), 1, c.maxhp);
}

const stageMul = s => s >= 0 ? (2 + s) / 2 : 2 / (2 - s);
const accMul = s => s >= 0 ? (3 + s) / 3 : 3 / (3 - s);

// 불가사의 던전식 상성: 효과가 굉장함 1.4배, 별로 0.7배, 원래 무효인 상성은 0.5배 (이중이면 곱해짐)
// 특성에 의한 무효(부유, 저수 등)는 calcHit/resolveHit에서 따로 처리한다
const TYPE_MUL = { 2: 1.4, 0.5: 0.7, 0: 0.5, 1: 1 };
function typeEff(moveType, types) {
  if (!moveType) return 1;
  let e = 1;
  for (const t of types) e *= TYPE_MUL[DATA.chart[moveType - 1][t - 1]];
  return e;
}

// 현재 날씨 (플레이어가 날씨부정/에어록이면 무효)
function weatherNow() {
  if (!CUR_WEATHER) return null;
  if (typeof Dungeon !== 'undefined' && Dungeon.floor && abilityOf(Dungeon.floor.player).cloudNine) return null;
  return CUR_WEATHER;
}
// 스피드: 명중률·회피율 보정에 쓰인다
function speedOf(c) {
  let s = c.spe * stageMul(c.stages[6] || 0) * (abVal(c, 'speedMul') || 1) * (heldOf(c).speedMul || 1);
  if (abilityOf(c).quickFeet && c.status) s *= 1.5;
  else if (c.status === 'par') s *= 0.5;
  return s;
}
// 스피드 차이 → 명중 배율 (2배 빠르면 +20%, 절반이면 -20%, 최대 ±20%)
function speedAccMul(att, def) { return clamp(1 + 0.2 * Math.log2(speedOf(att) / speedOf(def)), 0.8, 1.2); }

// 기술 분류
const hasFlag = (m, f) => !!(m.fg && m.fg.includes(f));
const isContact = m => hasFlag(m, 1);
const isSlicing = m => /베기|가르기|자르기|칼|커터|베어|참격/.test(m.n);
function moveType(att, move) { const A = abilityOf(att); return A.soundType && hasFlag(move, 9) ? A.soundType : A.skin && move.t === 1 ? A.skin : move.t; }
function bestStatKey(c) { return ['atk', 'def', 'spa', 'spd'].reduce((b, k) => (c[k] > c[b] ? k : b), 'atk'); }

// 특성에 의한 능력치 배율
function statMul(c, key) {
  const A = abilityOf(c);
  let m = 1;
  if (key === 'atk') {
    if (A.atkMul) m *= A.atkMul;
    if (A.guts && c.status) m *= 1.5;
    if (A.toxicBoost && c.status === 'psn') m *= 1.5;
    if (A.slowStart && c.slowT > 0) m *= 0.5;
    if (A.defeatist && c.hp * 2 <= c.maxhp) m *= 0.5;
  } else if (key === 'spa') {
    const sm = abVal(c, 'spaMul'); if (sm) m *= sm;
    if (A.flareBoost && c.status === 'brn') m *= 1.5;
    if (A.defeatist && c.hp * 2 <= c.maxhp) m *= 0.5;
  } else if (key === 'def') {
    if (A.marvel && c.status) m *= 1.5;
    if (A.defMul) m *= A.defMul;
  }
  if (A.bestStatMul && key === bestStatKey(c)) m *= A.bestStatMul;
  const H = heldOf(c);
  if (H[key + 'Mul']) m *= H[key + 'Mul'];
  if (H.eviolite && (key === 'def' || key === 'spd') && DATA.species[c.sp].v.length) m *= 1.5;
  return m;
}
function evasionMul(c, A) {
  let m = (A === abilityOf(c) ? abVal(c, 'evasion') : A.evasion) || 1;
  if (A.runAway && c.hp * 4 <= c.maxhp) m *= 1.5;
  if (A.tangled && c.status === 'cnf') m *= 1.5;
  m *= heldOf(c).evaMul || 1;
  return m;
}
// 공격 측 위력 배율
function powerMul(att, def, move, mt, A) {
  let m = 1;
  if (A.pinch === mt && att.hp * 3 <= att.maxhp) m *= 1.5;
  if (A.typeMul && A.typeMul[mt]) m *= A.typeMul[mt];
  if (A.technician && move.p <= 60) m *= 1.5;
  if (A.flagMul && hasFlag(move, A.flagMul[0])) m *= A.flagMul[1];
  if (A.slicing && isSlicing(move)) m *= A.slicing;
  if (A.sheer && (move.ail || move.fl || (move.sc && !move.ss))) m *= 1.3;
  if (A.reckless && move.dr < 0) m *= 1.2;
  if (A.skin && move.t === 1) m *= 1.2;
  if (A.rival && def.types.some(t => att.types.includes(t))) m *= 1.25;
  if (A.vsTypeMul) for (const t of def.types) if (A.vsTypeMul[t]) m *= A.vsTypeMul[t];
  if (att.flashFire && mt === 10) m *= 1.5;
  return m;
}
// 방어 측 데미지 배율
function guardMul(def, Dd, move, mt, eff) {
  let m = 1;
  if (Dd.resist && Dd.resist[mt]) m *= Dd.resist[mt];
  if (Dd.seMul && eff > 1) m *= Dd.seMul;
  if (Dd.fullHpHalf && def.hp >= def.maxhp) m *= 0.5;
  if (Dd.contactResist && isContact(move)) m *= Dd.contactResist;
  if (Dd.specialResist && move.c === 3) m *= Dd.specialResist;
  if (Dd.physResist && move.c === 2) m *= Dd.physResist;
  if (Dd.flagResist && hasFlag(move, Dd.flagResist[0])) m *= Dd.flagResist[1];
  if (Dd.dmgTaken) m *= Dd.dmgTaken;
  if (Dd.areaResist && move.r === 'r') m *= Dd.areaResist;
  return m;
}

// 실제 피해 계산 (명중 판정 포함)
function calcHit(att, def, move) {
  const A = abilityOf(att), Dd = defAbility(att, def);
  if (move.a && !A.noGuard && !Dd.noGuard && !(A.prankster && move.c === 1)) {
    const aSt = Dd.unaware ? 0 : (att.stages[7] || 0), eSt = A.unaware || A.ignoreEvasion ? Math.min(0, def.stages[8] || 0) : (def.stages[8] || 0);
    let acc = move.a * accMul(aSt) / accMul(eSt) * (A.accMul || 1) / (A.ignoreEvasion ? 1 : evasionMul(def, Dd));
    if (A.hustle && move.c === 2) acc *= 0.8;
    if (Dd.miracle && move.c === 1) acc *= 0.5;
    if (Dd.foeAcc) acc *= Dd.foeAcc;
    acc *= (heldOf(att).accMul || 1) * (heldOf(def).foeAcc || 1);
    acc *= speedAccMul(att, def);
    if (weatherNow() === 'fog') acc *= 0.9;
    if (Math.random() * 100 >= acc) return { miss: true };
  }
  if (move.c === 1) return { hit: true, dmg: 0, eff: 1 };
  const mt = moveType(att, move);
  let eff = typeEff(mt, def.types);
  if (A.scrappy && (mt === 1 || mt === 2) && def.types.includes(8)) eff = typeEff(mt, def.types.filter(t => t !== 8));
  if (Dd.levitate && mt === 5) eff = 0;
  if (Dd.immuneFlag && hasFlag(move, Dd.immuneFlag)) eff = 0;
  if (Dd.wonderGuard && eff <= 1) eff = 0;
  if (eff === 0) return { hit: true, dmg: 0, eff: 0 };
  const phys = move.c === 2;
  let aSt = Dd.unaware ? 0 : (att.stages[phys ? 2 : 4] || 0);
  let dSt = def.stages[phys ? 3 : 5] || 0;
  if (A.unaware) dSt = 0; else if (A.infiltrate) dSt = Math.min(0, dSt);
  let Atk = (phys ? att.atk : att.spa) * statMul(att, phys ? 'atk' : 'spa') * stageMul(aSt);
  let Def = (phys ? def.def : def.spd) * statMul(def, phys ? 'def' : 'spd') * stageMul(dSt);
  const W = weatherNow();
  if (W === 'sand' && !phys && def.types.includes(6)) Def *= 1.5;
  if (W === 'snow' && phys && def.types.includes(15)) Def *= 1.5;
  if (phys && att.status === 'brn' && !A.guts) Atk *= 0.5;
  const Ha = heldOf(att);
  const critStage = (move.cr || 0) + (A.critStage || 0) + (Ha.critStage || 0) + (att.critBoost || 0);
  const crit = !Dd.noCrit && (A.merciless && def.status === 'psn' || Math.random() < [1 / 16, 1 / 8, 1 / 2, 1][clamp(critStage, 0, 3)]);
  const power = move.p * powerMul(att, def, move, mt, A) * (phys ? Ha.physMul || 1 : Ha.specMul || 1) * ((Ha.typeMul && Ha.typeMul[mt]) || 1) * (Ha.lifeOrb ? 1.3 : 1);
  let dmg = Math.floor(Math.floor(Math.floor(2 * att.lv / 5 + 2) * power * Atk / Def) / 50) + 2;
  if (mt && (att.types.includes(mt) || A.protean)) dmg *= A.adapt ? 2 : 1.5;
  dmg *= eff;
  if (Ha.seBoost && eff > 1) dmg *= Ha.seBoost;
  if (W === 'sun') dmg *= mt === 10 ? 1.5 : mt === 11 ? 0.5 : 1;
  if (W === 'rain') dmg *= mt === 11 ? 1.5 : mt === 10 ? 0.5 : 1;
  if (A.tinted && eff < 1) dmg *= 2;
  dmg *= (crit ? (A.sniper ? 2.25 : 1.5) : 1) * (0.85 + Math.random() * 0.15);
  dmg *= guardMul(def, Dd, move, mt, eff);
  return { hit: true, dmg: Math.max(1, Math.floor(dmg)), eff, crit };
}

// 자동전투용 예상 점수
function moveScore(att, def, move) {
  if (!move || move.c === 1) return 0;
  const phys = move.c === 2;
  const A = phys ? att.atk : att.spa, D = phys ? def.def : def.spd;
  const Ab = abilityOf(att), Dd = defAbility(att, def), mt = moveType(att, move);
  const stab = mt && (att.types.includes(mt) || Ab.protean) ? (Ab.adapt ? 2 : 1.5) : 1;
  const hits = move.hits ? (Ab.skillLink ? move.hits[1] : (move.hits[0] + move.hits[1]) / 2) : 1;
  let eff = typeEff(mt, def.types);
  if ((Dd.levitate && mt === 5) || (Dd.absorb && Dd.absorb.t === mt) || (Dd.wonderGuard && eff <= 1)) eff = 0;
  return move.p * powerMul(att, def, move, mt, Ab) * hits * stab * eff * (A / D) * ((move.a || 100) / 100);
}

function effText(eff) {
  if (eff === 0) return '효과가 없는 것 같다...';
  if (eff > 1) return '효과가 굉장했다!';
  if (eff < 1) return '효과가 별로인 것 같다...';
  return '';
}

// 5세대식: 상대보다 레벨이 높을수록 경험치 감소
// 내 레벨보다 LOW_LV_GAP 이상 낮은 적은 전체 배율 EXP_RATE 대신 LOW_LV_MUL배
const LOW_LV_GAP = 6, LOW_LV_MUL = 0.1;
function expGain(enemy, plv) {
  const e = enemy.lv, scale = Math.pow((2 * e + 10) / (e + plv + 10), 2.5);
  return Math.max(1, Math.floor(DATA.species[enemy.sp].x * e / 7 * scale * (plv - e >= LOW_LV_GAP ? LOW_LV_MUL : EXP_RATE)));
}

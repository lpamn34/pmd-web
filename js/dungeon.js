// 던전: 맵 생성, 턴 진행, AI, 자동 탐색, 렌더링
'use strict';

const Dungeon = (() => {
  let D = null;       // 현재 층
  let run = null;     // 현재 탐험
  const T = { base: 0, cursor: 0, moveEnd: 0, busyUntil: 0 };
  const LOG = [];
  let canvas, ctx, mini, mctx, rafId = 0, logicTimer = 0, pendingKey = null;
  let hudCache = '', logCache = '', moveCache = '', quickCache = '';

  const now = () => performance.now();
  const spd = () => (Game.save.settings.fast ? 0.55 : 1);
  const busy = () => now() < T.busyUntil;
  const P = () => D.player;
  const idx = (x, y) => y * D.w + x;
  const inb = (x, y) => x >= 0 && y >= 0 && x < D.w && y < D.h;
  const floorAt = (x, y) => inb(x, y) && D.tiles[idx(x, y)] === 1;
  const nm = c => (c.outlaw ? '현상수배범 ' : '') + spName(looksOf(c));

  // cls: 로그 색 구분 (super 효과가 굉장함 / weak 효과가 별로)
  function log(text, at, cls) {
    LOG.push({ text, at: at ?? Math.max(T.cursor, now()), cls });
    if (LOG.length > 300) LOG.shift();
  }

  // ───────────────────────── 맵 생성 ─────────────────────────
  function genMap() {
    const W = 54, H = 32, cols = 4, rows = 3;
    const cw = Math.floor((W - 2) / cols), ch = Math.floor((H - 2) / rows);
    const tiles = new Uint8Array(W * H), room = new Int16Array(W * H).fill(-1);
    const cells = [], rooms = [];
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      cells.push({ r, c, x0: 1 + c * cw, y0: 1 + r * ch, isRoom: Math.random() < 0.8 });
    }
    while (cells.filter(c => c.isRoom).length < 6) pick(cells.filter(c => !c.isRoom)).isRoom = true;
    for (const cell of cells) {
      if (cell.isRoom) {
        const rw = rint(4, cw - 3), rh = rint(3, ch - 3);
        const rx = cell.x0 + rint(1, cw - rw - 1), ry = cell.y0 + rint(1, ch - rh - 1);
        cell.room = rooms.length;
        rooms.push({ x: rx, y: ry, w: rw, h: rh });
        for (let y = ry; y < ry + rh; y++) for (let x = rx; x < rx + rw; x++) { tiles[y * W + x] = 1; room[y * W + x] = cell.room; }
      } else {
        cell.px = cell.x0 + rint(2, cw - 3); cell.py = cell.y0 + rint(2, ch - 3);
        tiles[cell.py * W + cell.px] = 1;
      }
    }
    const at = (r, c) => cells[r * cols + c];
    const pt = cell => cell.isRoom
      ? { x: rint(rooms[cell.room].x, rooms[cell.room].x + rooms[cell.room].w - 1), y: rint(rooms[cell.room].y, rooms[cell.room].y + rooms[cell.room].h - 1) }
      : { x: cell.px, y: cell.py };
    const dig = (x, y) => { if (tiles[y * W + x] === 0) tiles[y * W + x] = 1; };
    function carve(a, b) {
      const pa = pt(a), pb = pt(b);
      if (a.r === b.r) {
        const mx = Math.floor((pa.x + pb.x) / 2);
        for (let x = Math.min(pa.x, mx); x <= Math.max(pa.x, mx); x++) dig(x, pa.y);
        for (let y = Math.min(pa.y, pb.y); y <= Math.max(pa.y, pb.y); y++) dig(mx, y);
        for (let x = Math.min(mx, pb.x); x <= Math.max(mx, pb.x); x++) dig(x, pb.y);
      } else {
        const my = Math.floor((pa.y + pb.y) / 2);
        for (let y = Math.min(pa.y, my); y <= Math.max(pa.y, my); y++) dig(pa.x, y);
        for (let x = Math.min(pa.x, pb.x); x <= Math.max(pa.x, pb.x); x++) dig(x, my);
        for (let y = Math.min(my, pb.y); y <= Math.max(my, pb.y); y++) dig(pb.x, y);
      }
    }
    // 신장 트리 + 추가 연결
    const seen = new Set();
    const stack = [cells[rand(cells.length)]];
    seen.add(stack[0]);
    while (stack.length) {
      const cur = stack[stack.length - 1];
      const nb = [[0, 1], [1, 0], [0, -1], [-1, 0]].map(([dr, dc]) => at(cur.r + dr, cur.c + dc))
        .filter(n => n && n.r >= 0 && n.r < rows && n.c >= 0 && n.c < cols && !seen.has(n) && Math.abs(n.r - cur.r) + Math.abs(n.c - cur.c) === 1);
      if (!nb.length) { stack.pop(); continue; }
      const n = pick(nb); seen.add(n); carve(cur, n); stack.push(n);
    }
    for (let k = 0; k < 3; k++) {
      const a = pick(cells), horiz = Math.random() < 0.5;
      const b = horiz ? (a.c + 1 < cols ? at(a.r, a.c + 1) : null) : (a.r + 1 < rows ? at(a.r + 1, a.c) : null);
      if (b) carve(a, b);
    }
    return { w: W, h: H, tiles, room, rooms };
  }

  // 복도(방이 아닌 바닥)가 r칸 안에 있는지: 방 입구 근처에는 함정을 만들지 않는다
  function nearCorridor(x, y, r) {
    for (let yy = y - r; yy <= y + r; yy++) for (let xx = x - r; xx <= x + r; xx++) if (floorAt(xx, yy) && D.room[idx(xx, yy)] < 0) return true;
    return false;
  }
  function randomRoomTile(opts = {}) {
    for (let tries = 0; tries < 400; tries++) {
      const r = opts.room != null ? D.rooms[opts.room] : pick(D.rooms);
      const x = rint(r.x, r.x + r.w - 1), y = rint(r.y, r.y + r.h - 1);
      if (creatureAt(x, y)) continue;
      if (opts.noItem && (itemAt(x, y) || (D.stairs && D.stairs.x === x && D.stairs.y === y) || trapAt(x, y) || (D.shop && D.shop.tiles.has(idx(x, y))))) continue;
      if (opts.hidden && D.visible[idx(x, y)]) continue;
      if (opts.far && D.player && Math.max(Math.abs(x - D.player.x), Math.abs(y - D.player.y)) < opts.far) continue;
      return { x, y };
    }
    return null;
  }

  // 층 적 구성
  // 그 층에 나올 수 있는 포켓몬 후보 (층마다 이 중 6종이 무작위로 뽑힌다)
  function floorCandidates(dg, floor) {
    const prog = dg.floors > 1 ? (floor - 1) / (dg.floors - 1) : 0;
    const lvl = Math.round(dg.lv[0] + (dg.lv[1] - dg.lv[0]) * prog);
    const target = 230 + lvl * 6.5;
    const all = SPECIES_IDS.map(id => ({ id: +id, s: DATA.species[id], bst: DATA.species[id].b.reduce((a, b) => a + b, 0) }))
      .filter(o => !o.s.lg && (!dg.types || o.s.t.some(t => dg.types.includes(t))));
    let cand = [];
    for (const w of [70, 110, 170, 260, 999]) { cand = all.filter(o => Math.abs(o.bst - target) <= w); if (cand.length >= 8) break; }
    return { lvl, target, cand };
  }
  function makePool(dg, floor) {
    const { lvl, target, cand } = floorCandidates(dg, floor);
    const pool = [];
    // 패러독스 포켓몬은 테마 던전이 아니면 드물게: 뽑혀도 PARADOX_RATE 확률로만 남기고 아니면 다시 뽑는다
    const para = new Set(dg.extra ? [] : [...PARADOX_PAST, ...PARADOX_FUTURE]);
    while (pool.length < 6 && cand.length) {
      const id = cand.splice(rand(cand.length), 1)[0].id;
      if (!para.has(id) || Math.random() < PARADOX_RATE) pool.push(id);
    }
    // 테마 던전: 시리즈 포켓몬을 일반 적으로 섞는다 (강함이 비슷한 쪽 우선)
    if (dg.extra) {
      const ex = dg.extra.filter(id => hasSprite(id) && !pool.includes(id)).sort((a, b) => Math.abs(DATA.species[a].b.reduce((s, v) => s + v, 0) - target) - Math.abs(DATA.species[b].b.reduce((s, v) => s + v, 0) - target));
      for (const id of ex.slice(0, 6).sort(() => Math.random() - 0.5).slice(0, 3)) pool.push(id);
    }
    // 전설 던전: 가까운 강함의 전설 포켓몬 하나를 섞음
    if (dg.legend) {
      const lg = SPECIES_IDS.filter(id => DATA.species[id].lg).map(id => ({ id: +id, bst: DATA.species[id].b.reduce((a, b) => a + b, 0) }))
        .sort((a, b) => Math.abs(a.bst - target) - Math.abs(b.bst - target)).slice(0, 25);
      if (lg.length) pool.push(pick(lg).id);
    }
    return { pool, lvl };
  }

  function spawnEnemy(pos, sp, lv) {
    sp = sp || pick(D.pool);
    const c = makeCreature(sp, Math.max(1, (lv || D.lvl) + rint(-1, 1)));
    c.enemy = true; c.x = pos.x; c.y = pos.y; c.dir = rand(8);
    c.shiny = !!DATA.species[sp].sh && Math.random() < SHINY_CHANCE;
    Sprites.load(sp, c.shiny);
    rollEnemyForm(c);
    applyForecast(c);
    D.mons.push(c);
    updateForm(c);
    return c;
  }

  // ── 보스 층: 큰 방 하나, 보스와 부하 둘, 보스를 쓰러뜨리면 계단이 나타난다 ──
  function genBossMap() {
    const W = 54, H = 32, tiles = new Uint8Array(W * H), room = new Int16Array(W * H).fill(-1);
    const R = { x: 13, y: 7, w: 28, h: 18 };
    for (let y = R.y; y < R.y + R.h; y++) for (let x = R.x; x < R.x + R.w; x++) { tiles[y * W + x] = 1; room[y * W + x] = 0; }
    return { w: W, h: H, tiles, room, rooms: [R] };
  }
  function bossSpecies(dg) {
    if (run.floor === dg.floors) {
      const list = bossPool(dg);
      if (list.length) return pick(list);   // 테마 던전: 후보 중 무작위
      const fixed = BOSSES[dg.id];
      if (fixed && DATA.species[fixed]) return fixed;
    } else if (dg.mid && dg.mid.floors.includes(run.floor)) {
      // 중간 보스: 이번 탐험에서 아직 안 나온 후보 중에서
      run.midUsed = run.midUsed || [];
      let list = midPool(dg).filter(id => !run.midUsed.includes(id));
      if (!list.length) list = midPool(dg);
      if (list.length) { const id = pick(list); run.midUsed.push(id); return id; }
    }
    // 로그라이크 중간 보스: 이 층 후보 중 가장 강한 포켓몬
    return D.pool.slice().sort((a, b) => DATA.species[b].b.reduce((s, v) => s + v, 0) - DATA.species[a].b.reduce((s, v) => s + v, 0))[0];
  }
  function setupBossFloor(dg, p) {
    const R = D.rooms[0], cx = R.x + Math.floor(R.w / 2);
    p.x = cx; p.y = R.y + R.h - 2;
    D.stairs = { x: cx, y: R.y + 1 }; D.stairsHidden = true; D.noSpawn = true;
    const sp = bossSpecies(dg);
    const b = spawnEnemy({ x: cx, y: R.y + 3 }, sp, D.lvl + 3);
    b.lv = D.lvl + 3; recalc(b);
    b.boss = true; b.maxhp = Math.floor(b.maxhp * 3.5); b.hp = b.maxhp;
    for (const k of ['atk', 'def', 'spa', 'spd']) b[k] = Math.floor(b[k] * 1.1);
    b.dir = 0; b.target = { x: p.x, y: p.y };
    D.boss = b;
    for (const dx of [-3, 3]) { const m = spawnEnemy({ x: cx + dx, y: R.y + 4 }); m.dir = 0; }
    Sprites.load(sp);
  }
  function bossIntro() {
    const b = D.boss; if (!b) return;
    stopAuto();
    Sound.play('boss');
    setFace('Determined', 3000);
    UI.open({
      title: run.floor === D.dg.floors ? '⚠ 보스 층' : '⚠ 중간 보스',
      html: `<div class="boss-intro">${portraitImg(looksOf(b), 'portrait big', 'Angry', b.shiny)}<div>
        <p><b>${esc(spName(looksOf(b)))}</b> Lv${b.lv}</p><p>${esc(jo(spName(b.sp), '이'))} 앞을 가로막고 있다!</p>
        <p class="dim">쓰러뜨리면 계단이 나타난다. 보스는 상태이상이 절반만 지속된다.</p></div></div>`,
      choices: [{ label: '싸운다!', fn: () => {} }], cancel: () => {},
    });
  }
  function bossDefeated(b, at) {
    D.stairsHidden = false;
    Progress.add('bosses'); checkLater();
    setTimeout(() => { if (D) Sound.dungeon(D.dg); }, Math.max(0, at - now()) + 800);
    D.explored[idx(D.stairs.x, D.stairs.y)] = 1;
    log(`${jo(spName(b.sp), '을')} 쓰러뜨렸다! 계단이 나타났다!`, at + 200);
    setFace('Joyous', 3500);
    const bonus = D.lvl * 15;
    Game.save.money += bonus; run.money += bonus;
    log(`보스 보상으로 ${bonus} 포켓을 받았다.`, at + 300);
    // 좋은 아이템 하나 (이상한사탕, 지닌 물건, 기술머신 중)
    // 전용 도구의 주인이 보스면 가끔 그 도구를 떨어뜨린다
    const sig = sigItemsFor([b.sp]);
    // 초반 보스는 조금 드문 아이템, 그 뒤로는 지닌 물건·기술머신·사탕 (층 레벨보다 한 등급 위까지)
    const table = dropTable(D.lvl + 10);
    let pool = table.filter(d => ITEMS[d[0]].held || ITEMS[d[0]].tm || d[0] === 'candy' || d[0] === 'reviver');
    if (pool.length < 5) pool = table.filter(d => itemTier(d[0]) >= 2);
    const id = sig.length && Math.random() < SIG_DROP.boss ? pick(sig) : weighted(pool);
    for (const [dx, dy] of [[0, 0], ...DIRS]) {
      const x = b.x + dx, y = b.y + dy;
      if (floorAt(x, y) && !itemAt(x, y) && !(x === D.stairs.x && y === D.stairs.y)) { D.items.push({ x, y, id, n: 1 }); break; }
    }
  }

  // 업적 확인은 한 턴에 한 번만
  let checkPending = false;
  function checkLater() { if (checkPending) return; checkPending = true; setTimeout(() => { checkPending = false; Progress.check(); }, 300); }

  // ── 표정 초상화 ──
  let faceTemp = null, faceShown = '';
  function setFace(emotion, ms) { faceTemp = { emotion, until: now() + ms }; }
  function updateFace(t) {
    const p = P(); if (!p) return;
    let e = 'Normal';
    if (D.dead) e = 'Crying';
    else if (faceTemp && t < faceTemp.until) e = faceTemp.emotion;
    else if (p.hp <= p.maxhp * 0.25) e = 'Pain';
    else if (p.status === 'slp') e = 'Sad';
    else if (p.status) e = 'Dizzy';
    else if (p.belly <= 10) e = 'Worried';
    const src = Sprites.portrait(looksOf(p), e, p.shiny);
    if (src !== faceShown) {
      faceShown = src;
      const f = document.getElementById('face');
      f.onerror = () => { if (f.src.startsWith(SPRITE_BASE)) f.src = spriteFallback(f.src); };   // CDN이 안 되면 원래 주소
      f.src = src;
    }
  }

  function newFloor() {
    const dg = dungeonById(run.dungeon);
    const bossFloor = isBossFloor(dg, run.floor);
    if (bossFloor) Sound.boss(); else Sound.dungeon(dg);
    Progress.seedFloor(run);   // 오늘의 도전: 날짜+층으로 맵 고정
    const m = bossFloor ? genBossMap() : genMap();
    D = { ...m, explored: new Uint8Array(m.w * m.h), visible: new Uint8Array(m.w * m.h), items: [], mons: [], corpses: [], popups: [], fx: [],
      prompts: [], learnQueue: [], delayed: [], traps: [], shop: null, house: null, seq: 0, turn: 0, spawnT: 40, auto: null, ignore: new Set(), regen: 0, dg };
    const { pool, lvl } = makePool(dg, run.floor);
    D.pool = pool; D.lvl = lvl;
    D.weather = rollWeather(dg); CUR_WEATHER = D.weather;
    pool.forEach(Sprites.load);
    // 플레이어
    const p = run.p;
    D.player = p;
    p.critBoost = 0; p.noSleep = false;   // 랑사열매·유루열매는 그 층에서만
    if (bossFloor) {
      p.dir = 4; p.tween = null; p.act = null; p.stages = {};
      p.charging = null; p.rampage = null; p.recharge = false; p.chain = null; p.struck = new Set(); p.lastActSeq = p.lastHurtSeq = 0;
      setupBossFloor(dg, p);
      computeVis();
    } else {
    const startRoom = rand(D.rooms.length);
    const sp = randomRoomTile({ room: startRoom });
    p.x = sp.x; p.y = sp.y; p.dir = 0; p.tween = null; p.act = null; p.stages = {};
    p.charging = null; p.rampage = null; p.recharge = false; p.chain = null; p.struck = new Set(); p.lastActSeq = p.lastHurtSeq = 0;
    // 계단
    let sroom = rand(D.rooms.length);
    if (D.rooms.length > 1) while (sroom === startRoom) sroom = rand(D.rooms.length);
    D.stairs = randomRoomTile({ room: sroom, noItem: true });
    const freeRooms = D.rooms.map((_, i) => i).filter(i => i !== startRoom && i !== sroom);
    if (lvl >= FEATURE_LV.shop && Math.random() < SHOP_CHANCE) makeShop(freeRooms);
    if (lvl >= FEATURE_LV.house && Math.random() < HOUSE_CHANCE && freeRooms.length) {
      const room = freeRooms.splice(rand(freeRooms.length), 1)[0];
      D.house = { room, triggered: false };
      for (let i = rint(3, 6); i > 0; i--) { const t = randomRoomTile({ room, noItem: true }); if (t) D.items.push({ ...t, id: weighted(dropTable(lvl)), n: 1 }); }
    }
    if (lvl >= FEATURE_LV.trap) {
      const kinds = Object.keys(TRAPS);
      for (let i = rint(2, 4) + Math.floor(lvl / 25); i > 0; i--) {
        const t = randomRoomTile({ noItem: true, far: 3 });
        // 복도와 붙은 칸(방 출입구 옆)에는 만들지 않는다
        if (t && !nearCorridor(t.x, t.y, 2)) D.traps.push({ ...t, kind: pick(kinds), seen: false });
      }
    }
    // 아이템 / 돈
    const nItems = rint(ITEMS_PER_FLOOR[0], ITEMS_PER_FLOOR[1]);
    for (let i = 0; i < nItems; i++) { const t = randomRoomTile({ noItem: true }); if (t) D.items.push({ ...t, id: weighted(dropTable(lvl)), n: 1 }); }
    // 전용 도구: 그 주인이 이 층에 나오면 드물게 바닥에 하나
    const sig = sigItemsFor(pool);
    if (sig.length && Math.random() < SIG_DROP.floor) { const t = randomRoomTile({ noItem: true }); if (t) D.items.push({ ...t, id: pick(sig), n: 1 }); }
    D.items.forEach(it => { if (ITEMS[it.id].stack) it.n = rint(3, 9); });
    const nMoney = rint(2, 4);
    for (let i = 0; i < nMoney; i++) { const t = randomRoomTile({ noItem: true }); if (t) D.items.push({ ...t, money: Math.round(rint(4, 12) * (1 + lvl / 6)) }); }
    // 적
    computeVis();
    const nEn = Math.min(10, rint(4, 6) + Math.floor(run.floor / 3));
    for (let i = 0; i < nEn; i++) { const t = randomRoomTile({ far: 5 }); if (t) spawnEnemy(t); }
    }
    // 임무 대상
    if (dg.mode === 'normal') {
      for (const ms of Game.save.missions.accepted) {
        if (ms.dungeon !== dg.id || ms.floor !== run.floor || run.done.includes(ms.id)) continue;
        const t = randomRoomTile({ noItem: true, far: 4 });
        if (!t) continue;
        if (ms.kind === 'rescue' || ms.kind === 'sos') {
          const c = makeCreature(ms.client, ms.kind === 'sos' ? ms.lv : 5); c.npc = true; c.mission = ms.id; c.x = t.x; c.y = t.y;
          if (ms.kind === 'sos') { c.shiny = !!ms.shiny; c.friend = true; c.status = 'slp'; c.statusT = 99999; }
          Sprites.load(ms.client, c.shiny); D.mons.push(c);
        } else if (ms.kind === 'outlaw') {
          const c = spawnEnemy(t, ms.target, ms.lv); c.lv = ms.lv; recalc(c); c.maxhp = Math.floor(c.maxhp * 1.6); c.hp = c.maxhp;
          c.outlaw = true; c.mission = ms.id;
        } else if (ms.kind === 'find') {
          D.items.push({ ...t, id: 'quest', n: 1, mission: ms.id });
        }
      }
    }
    buildMapCanvas();
    computeVis();
    const fname = `${dg.n} ${run.floor}F`;
    log(`— ${fname} —`, now());
    const here = dg.mode === 'normal' ? Game.save.missions.accepted.filter(ms => ms.dungeon === dg.id && ms.floor === run.floor && !run.done.includes(ms.id)) : [];
    if (here.length) log(`📜 이 층에 임무 대상이 있다! (${here.length}개, J로 확인)`, now());
    if (D.weather) log(`날씨: ${WEATHERS[D.weather].icon} ${WEATHERS[D.weather].n} — ${WEATHERS[D.weather].d}`, now());
    showFloorBanner(fname + (D.weather ? `\n${WEATHERS[D.weather].icon} ${WEATHERS[D.weather].n}` : ''));
    run.turnsOnFloor = 0;
    floorStartAbility(p);
    setFace('Determined', 1800);
    if (D.boss) D.prompts.push(bossIntro);
    Game.saveRunSnapshot(run);
  }

  // ───────────────────────── 시야 ─────────────────────────
  function los(x0, y0, x1, y1) {
    let dx = Math.abs(x1 - x0), dy = Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1, err = dx - dy;
    let x = x0, y = y0;
    while (!(x === x1 && y === y1)) {
      const e2 = 2 * err;
      if (e2 > -dy) { err -= dy; x += sx; }
      if (e2 < dx) { err += dx; y += sy; }
      if (x === x1 && y === y1) return true;
      if (!floorAt(x, y)) return false;
    }
    return true;
  }
  function computeVis() {
    const p = P();
    D.visible.fill(0);
    const rs = new Set();
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      if (!inb(p.x + dx, p.y + dy)) continue;
      const r = D.room[idx(p.x + dx, p.y + dy)];
      if (r >= 0 && (dx === 0 || dy === 0 || floorAt(p.x + dx, p.y) || floorAt(p.x, p.y + dy))) rs.add(r);
    }
    for (const r of rs) {
      const R = D.rooms[r];
      for (let y = R.y - 1; y <= R.y + R.h; y++) for (let x = R.x - 1; x <= R.x + R.w; x++) if (inb(x, y)) D.visible[idx(x, y)] = 1;
    }
    const vr = (abilityOf(p).illuminate ? 3 : 2) - (weatherNow() === 'fog' ? 1 : 0);
    for (let dy = -vr; dy <= vr; dy++) for (let dx = -vr; dx <= vr; dx++) {
      const x = p.x + dx, y = p.y + dy;
      if (inb(x, y) && los(p.x, p.y, x, y)) D.visible[idx(x, y)] = 1;
    }
    for (let i = 0; i < D.visible.length; i++) if (D.visible[i]) D.explored[i] = 1;
    if (D.mons) intimidateCheck();
  }
  const seen = c => D.visible[idx(c.x, c.y)] === 1;

  // 매 턴 특성 처리 (슬로스타트, 변덕쟁이)
  function abilityTick(c) {
    const A = abilityOf(c);
    if (A.speedBoost) { c.sbT = (c.sbT || 0) + 1; if (c.sbT % 5 === 0 && (c.stages[6] || 0) < 6) statChange(c, 6, 1, Math.max(T.cursor, T.moveEnd), c); }
    if (A.slowStart && c.slowT > 0) c.slowT--;
    if (A.moody) {
      c.moodyT = (c.moodyT || 0) + 1;
      if (c.moodyT % 10 === 0) {
        const stats = [2, 3, 4, 5, 7, 8], up = pick(stats), down = pick(stats.filter(s => s !== up));
        const at = Math.max(T.cursor, T.moveEnd);
        statChange(c, up, 2, at, c); statChange(c, down, -1, at, c);
      }
    }
  }
  function setWeather(w, src, at) {
    if (D.weather === w) return;
    D.weather = w; CUR_WEATHER = w;
    abLog(src, `날씨가 ${WEATHERS[w].icon} ${jo(WEATHERS[w].n, '으로')} 바뀌었다!`, at);
    applyForecast(D.player); D.mons.forEach(applyForecast);
  }
  function applyForecast(c) {
    if (!abilityOf(c).forecast) return;
    c.types = [{ sun: 10, rain: 11, snow: 15 }[weatherNow()] || 1];
    if (D && D.player) formCheck(c);
  }
  // 폼체인지·메가진화 (js/forms.js): 모습이 바뀌었으면 알림과 효과. quiet면 알림 없이 (모르페코처럼 자주 바뀌는 경우)
  function formCheck(c, at, quiet) {
    const r = updateForm(c); if (!r) return;
    at = at || now();
    if (quiet || !(c.player || seen(c))) return;
    // "로토무 (워시로토무)" → "워시로토무"
    const who = spName(r.from), to = spName(r.to), fi = DATA.species[r.to]?.fi || '', short = (/\(([^)]+)\)/.exec(to) || [, to])[1];
    log(r.kind === 'back' ? `${jo(who, '은')} 원래 모습으로 돌아왔다!`
      : r.kind === 'mega' ? `${jo(who, '은')} ${jo(to, '으로')} 메가진화했다!`
      : fi.endsWith('-primal') ? `${jo(who, '은')} 원시회귀했다! ${to}!`
      : `${jo(who, '은')} ${jo(short, '으로')} 바뀌었다!`, at);
    D.fx.push({ kind: 'ring', x: c.x, y: c.y, at, dur: 700 * spd(), color: r.kind === 'mega' ? '#ff9cf0' : '#bfe8ff' });
    if (r.kind === 'mega' || fi.endsWith('-primal')) { Sound.play('shiny', at); if (c.player) setFace('Determined', 2000); }
  }
  function floorStartAbility(p) {
    resetBattleForm(p, D.weather);
    if (run.floor > 1 || run.sos) p.hero = true;   // 돌핀맨: 계단을 내려간 뒤로는 마이티폼
    formCheck(p, now() + 500);
    const A = abilityOf(p), at = now() + 600;
    if (A.slowStart) p.slowT = 10;
    if (A.setWeather) setWeather(A.setWeather, p, at);
    applyForecast(p);
    if (A.download) statChange(p, p.atk >= p.spa ? 2 : 4, 1, at, p);
    if (A.floorStart) statChange(p, A.floorStart[0], A.floorStart[1], at, p);
    if (A.floorRandom) statChange(p, pick([2, 3, 4, 5, 7, 8]), 1, at, p);
    if (A.pickup && Math.random() < A.pickup) { const id = weighted(dropTable(D.lvl)); if (addToBag(id)) abLog(p, `${jo(ITEMS[id].n, '을')} 주워 왔다!`, at); }
    if (A.honey && Math.random() < 0.2 && addToBag('apple')) abLog(p, '사과를 발견했다!', at);
  }
  // 위협: 처음 마주쳤을 때
  function intimidateCheck() {
    const p = P(), pa = abilityOf(p), at = Math.max(T.cursor, T.moveEnd, now());
    for (const e of D.mons) {
      if (e.npc || e.metPlayer || !seen(e)) continue;
      e.metPlayer = true;
      Progress.seen(e.sp);
      if (e.shiny) { Sound.play('shiny', at); log(`✨ 색이 다른 ${jo(spName(e.sp), '이')} 나타났다!`, at); setFace('Surprised', 2000); D.fx.push({ kind: 'ring', x: e.x, y: e.y, at, dur: 700, color: '#fff6a0' }); Game.noteShiny(e.sp); }
      if (pa.intimidate) intimidate(p, e, pa.intimidate, at);
      const ea = abilityOf(e);
      if (ea.intimidate) intimidate(e, p, ea.intimidate, at);
      if (ea.setWeather) setWeather(ea.setWeather, e, at);
    }
  }
  function intimidate(src, tgt, st, at) {
    if (defAbility(src, tgt).noIntimidate) { abLog(tgt, `${jo(nm(tgt), '은')} 위협에 넘어가지 않았다!`, at); return; }
    abLog(src, `${jo(nm(tgt), '을')} 위협했다!`, at);
    statChange(tgt, st, -1, at, src);
  }
  const hostilesVisible = () => D.mons.filter(m => !m.npc && seen(m));

  // ───────────────────────── 조회 ─────────────────────────
  function creatureAt(x, y) {
    if (D.player && D.player.x === x && D.player.y === y && D.player.hp > 0) return D.player;
    return D.mons.find(m => m.x === x && m.y === y);
  }
  const itemAt = (x, y) => D.items.find(i => i.x === x && i.y === y);
  function diagOK(x, y, dx, dy) { return !(dx && dy) || (floorAt(x + dx, y) && floorAt(x, y + dy)); }
  function canStep(c, dx, dy) {
    const x = c.x + dx, y = c.y + dy;
    return floorAt(x, y) && diagOK(c.x, c.y, dx, dy) && !creatureAt(x, y);
  }
  const hostileTo = (a, b) => !!b && !b.npc && b !== a && (a.player ? !b.player : b.player);

  // BFS: 목표를 만족하는 가장 가까운 칸과 그 첫 걸음
  function bfs(sx, sy, isGoal, opts = {}) {
    const N = D.w * D.h, prev = new Int32Array(N).fill(-1);
    const start = idx(sx, sy); prev[start] = start;
    const q = [start];
    for (let qi = 0; qi < q.length; qi++) {
      const cur = q[qi], x = cur % D.w, y = (cur / D.w) | 0;
      if (cur !== start && isGoal(x, y)) {
        let s = cur, len = 0;
        while (prev[s] !== start) { s = prev[s]; len++; }
        return { x, y, fx: s % D.w, fy: (s / D.w) | 0, len: len + 1 };
      }
      if (opts.max && qi > opts.max) break;
      for (let d = 0; d < 8; d++) {
        const nx = x + DIRS[d][0], ny = y + DIRS[d][1];
        if (!floorAt(nx, ny)) continue;
        const ni = idx(nx, ny);
        if (prev[ni] !== -1) continue;
        if (opts.known && !D.explored[ni]) continue;
        if (!diagOK(x, y, DIRS[d][0], DIRS[d][1])) continue;
        if (opts.avoidTraps && !isGoal(nx, ny) && D.traps.some(t => t.seen && t.x === nx && t.y === ny)) continue;
        if (opts.blockMons && !isGoal(nx, ny)) { const c = creatureAt(nx, ny); if (c && c !== opts.self && (opts.seenOnly ? seen(c) : true)) continue; }
        prev[ni] = cur; q.push(ni);
      }
    }
    return null;
  }

  // ───────────────────────── 연출 스케줄 ─────────────────────────
  function beginTurn() {
    const n = now();
    T.base = Math.max(n, T.busyUntil); T.cursor = T.base; T.moveEnd = T.base;
  }
  function endTurnTiming() { T.busyUntil = Math.max(T.cursor, T.moveEnd); }
  function schedMove(c, fx, fy) {
    const dur = (D.auto ? 70 : 125) * spd();
    c.tween = { fx, fy, start: T.base, dur };
    if (seen(c) || c.player) T.moveEnd = Math.max(T.moveEnd, T.base + dur);
  }
  function schedAction(c, name, dur) {
    const visible = c.player || seen(c);
    const start = Math.max(T.cursor, T.moveEnd);
    c.act = { name, start, dur };
    if (visible) T.cursor = start + dur;
    return start;
  }
  function popup(c, text, color, at, size) { D.popups.push({ x: c.x, y: c.y, text, color, at, size }); }

  // ───────────────────────── 전투 ─────────────────────────
  function useMove(user, slot, dir, opts = {}) {
    const mid = slot < 0 ? null : user.moves[slot].id;
    const R = (mid && MOVE_RULES[mid]) || {};
    let move = slot < 0 ? NORMAL_ATTACK : DATA.moves[mid];
    if (R.selfHeal) move = { ...move, r: 's' };
    if (R.weatherBall && weatherNow() && weatherNow() !== 'fog') move = { ...move, t: { sun: 10, rain: 11, sand: 6, snow: 15 }[weatherNow()], p: 100 };
    if (slot >= 0 && !opts.free) user.moves[slot].pp--;
    user.dir = dir;
    if (user.sp === 681) { user.blade = move.c !== 1; formCheck(user); }   // 킬가르도: 공격이면 블레이드폼, 변화 기술이면 실드폼
    if (user.sp === 648 && mid === 547) { user.pirouette = !user.pirouette; formCheck(user); }   // 메로엣타: 옛노래를 쓸 때마다
    if (!R.chain || !user.chain || user.chain.mid !== mid) user.chain = R.chain ? { mid, n: 0 } : null;
    // 조건 판정용: 지난 행동 이후 맞았는지
    const ctx = { hurtSince: (user.lastHurtSeq || 0) > (user.lastActSeq || 0), hurtBy: user.lastHurtBy, prevAct: user.lastActSeq || 0, lastMissed: !!user.lastMissed };
    user.lastActSeq = ++D.seq; user.lifeOrbHit = false;
    const visible = user.player || seen(user);
    const color = TYPE_COLORS[(move.t || 1) - 1];
    // 모으기 1턴째
    if (R.charge && !opts.release && !(R.sunNoCharge && weatherNow() === 'sun')) {
      const t0 = schedAction(user, 'Shoot', 280 * spd());
      user.charging = { slot, invuln: !!R.invuln };
      if (visible) log(`${nm(user)}의 ${move.n}! ${jo(nm(user), '은')} ${R.charge}`, t0);
      D.fx.push({ kind: 'ring', x: user.x, y: user.y, at: t0, dur: 400 * spd(), color });
      if (R.chargeSc) for (const [st, ch] of R.chargeSc) statChange(user, st, ch, t0 + 150);
      return;
    }
    user.charging = null;
    const anim = slot < 0 || move.r === 'f' ? 'Attack' : 'Shoot';
    const dur = clamp(Sprites.animLength(looksOf(user), anim, user.shiny) * 0.75, 200, 460) * spd();
    const t0 = schedAction(user, anim, dur);
    const hitAt = t0 + dur * 0.55;
    if (slot >= 0 && visible) log(`${nm(user)}의 ${move.n}!`, t0);
    const fail = msg => { log(msg || '그러나 실패했다!', hitAt); user.lastMissed = true; };
    if (R.focus && ctx.hurtSince) return fail(`${jo(nm(user), '은')} 집중이 흐트러져서 기술을 쓸 수 없었다!`);
    if (R.needSleepSelf && user.status !== 'slp') return fail();
    if (R.hpCostPct) {
      const cost = Math.floor(user.maxhp * R.hpCostPct / 100);
      if (user.hp <= cost) return fail();
      user.hp -= cost; popup(user, '-' + cost, '#ff8a8a', hitAt);
      log(`${jo(nm(user), '은')} HP를 깎아 힘을 끌어올렸다!`, hitAt);
    }
    let targets = [];
    const [dx, dy] = DIRS[dir];
    if (move.r === 'f') {
      const t = creatureAt(user.x + dx, user.y + dy);
      if (t && hostileTo(user, t) && diagOK(user.x, user.y, dx, dy)) targets = [t];
    } else if (move.r === 'p') {
      let x = user.x, y = user.y;
      for (let i = 0, n = PROJ_RANGE; i < n; i++) {   // 직선 기술은 대각선 벽 모서리를 스쳐 지나간다
        x += dx; y += dy;
        if (!floorAt(x, y)) break;
        const t = creatureAt(x, y);
        if (t) { if (hostileTo(user, t)) targets = [t]; break; }
      }
      D.fx.push({ kind: 'proj', x0: user.x, y0: user.y, x1: targets[0]?.x ?? x, y1: targets[0]?.y ?? y, at: t0 + dur * 0.3, dur: dur * 0.3, color });
    } else if (move.r === 'r') {
      const pool = user.player ? D.mons : [D.player];
      targets = pool.filter(t => hostileTo(user, t) && Math.max(Math.abs(t.x - user.x), Math.abs(t.y - user.y)) <= 3 && los(user.x, user.y, t.x, t.y));
      D.fx.push({ kind: 'ring', x: user.x, y: user.y, at: t0 + dur * 0.3, dur: 350 * spd(), color });
    }
    if (move.r === 's') { applySelf(user, move, hitAt); afterUse(); return; }
    if (!targets.length) {
      if (slot >= 0 && visible) log('그러나 아무도 맞지 않았다...', hitAt);
      user.lastMissed = true; afterUse(); return;
    }
    if (R.delay) {
      for (const t of targets) D.delayed.push({ at: D.turn + R.delay, user, t, move });
      log(`${jo(nm(user), '은')} 미래로 공격을 보냈다!`, hitAt);
      afterUse(); return;
    }
    user.lastMissed = false;
    for (const t of targets) {
      const struck = user.struck && user.struck.has(t.id);
      if (R.first && struck) { fail(`${nm(t)}에게는 통하지 않았다! (첫 공격이 아니다)`); continue; }
      if (R.sucker && (t.status === 'slp' || t.status === 'frz' || (!t.player && !t.target))) { fail(); continue; }
      if (R.needSleepTarget && t.status !== 'slp') { fail(); continue; }
      const p = powerFor(user, t, move, R, ctx, struck);
      resolveHit(user, t, p === move.p ? move : { ...move, p }, hitAt, R);
      (user.struck = user.struck || new Set()).add(t.id);
    }
    afterUse();

    function afterUse() {
      if (R.chain && user.chain) user.chain.n++;
      if (R.recharge) user.recharge = true;
      if (R.selfKO && user.hp > 1) {
        popup(user, '-' + (user.hp - 1), '#ff8a8a', hitAt + 100);
        user.hp = 1; user.hurtAt = hitAt + 100;
        log(`${jo(nm(user), '은')} 힘을 모두 써버려서 HP가 1만 남았다!`, hitAt + 100);
      }
      if (R.selfDmgPct) {
        const amt = Math.min(Math.floor(user.maxhp * R.selfDmgPct / 100), user.hp - 1);
        if (amt > 0) { user.hp -= amt; user.hurtAt = hitAt + 100; popup(user, '-' + amt, '#ff8a8a', hitAt + 100); log(`${jo(nm(user), '은')} 반동으로 데미지를 입었다.`, hitAt + 100); }
      }
      if (R.rampage) {
        if (!opts.free) user.rampage = { slot, left: rint(1, 2) };
        else if (user.rampage && --user.rampage.left <= 0) {
          user.rampage = null;
          log(`${jo(nm(user), '은')} 난동을 부린 끝에 지쳐버렸다!`, hitAt + 150);
          inflict(user, 'cnf', hitAt + 150);
        }
      }
    }
  }

  function powerFor(user, t, move, R, ctx, struck) {
    let p = move.p;
    switch (R.pow) {
      case 'guts': if (['psn', 'par', 'brn'].includes(user.status)) p *= 2; break;
      case 'venom': if (t.status === 'psn') p *= 2; break;
      case 'brine': if (t.hp * 2 <= t.maxhp) p *= 2; break;
      case 'eruption': p = Math.max(1, Math.floor(p * user.hp / user.maxhp)); break;
      case 'stored': p = 20 + 20 * Object.values(user.stages).reduce((s, v) => s + Math.max(0, v), 0); break;
      case 'revenge': if (ctx.hurtSince && ctx.hurtBy === t.id) p *= 2; break;
      case 'payback': if (ctx.hurtSince) p *= 2; break;
      case 'assurance': if ((t.lastHurtSeq || 0) > ctx.prevAct) p *= 2; break;
      case 'firstStrike': if (!struck) p *= 2; break;
      case 'stomp': if (ctx.lastMissed) p *= 2; break;
    }
    if (R.chain && user.chain) {
      const n = Math.min(user.chain.n, R.chain);
      p = R.chainAdd ? p + 40 * n : p * Math.pow(2, n);
    }
    return p;
  }

  // 난동 중: 가까운 적을 자동으로 공격
  function rampageStep(c) {
    const foes = c.player ? D.mons.filter(m => hostileTo(c, m)) : [D.player];
    const adj = foes.find(f => Math.max(Math.abs(f.x - c.x), Math.abs(f.y - c.y)) === 1 && diagOK(c.x, c.y, Math.sign(f.x - c.x), Math.sign(f.y - c.y)));
    const dir = adj ? dirIndex(adj.x - c.x, adj.y - c.y) : c.dir;
    useMove(c, c.rampage.slot, confuse(c, dir), { free: true });
  }

  const abLog = (c, text, at) => { if (c.player || seen(c)) log(`[${abilityName(c.ability)}] ${text}`, at); };

  function resolveHit(user, tgt, move, at, R = {}) {
    if (tgt.hp <= 0) return;
    if (tgt.charging && tgt.charging.invuln) { log(`${nm(tgt)}에게 공격이 닿지 않았다!`, at); user.lastMissed = true; return; }
    const A = abilityOf(user), Dd = defAbility(user, tgt), mt = moveType(user, move);
    // 흡수·무효 특성
    if (Dd.absorb && Dd.absorb.t === mt && tgt !== user) {
      const ab = Dd.absorb;
      if (ab.heal) { abLog(tgt, `${jo(nm(tgt), '은')} 공격을 흡수했다!`, at); heal(tgt, Math.floor(tgt.maxhp * ab.heal / 100), at); }
      else if (ab.flash) { abLog(tgt, `${nm(tgt)}의 불꽃 위력이 올라갔다!`, at); tgt.flashFire = true; }
      else { abLog(tgt, `${jo(nm(tgt), '은')} 공격을 받아냈다!`, at); statChange(tgt, ab.st, ab.ch, at, tgt); }
      return;
    }
    if (move.c === 1 && Dd.magicBounce && (move.ail || (move.sc && move.sc.some(x => x[1] < 0)))) { abLog(tgt, `${jo(nm(tgt), '은')} 변화 기술을 튕겨냈다!`, at); return; }
    const r = calcHit(user, tgt, move);
    if (r.miss) { Sound.play('miss', at); popup(tgt, 'MISS', '#ddd', at); log(`${jo(nm(tgt), '은')} 공격을 피했다!`, at); user.lastMissed = true; return; }
    const serene = A.serene ? 2 : 1;
    const secondary = !(A.sheer && move.c !== 1) && !(Dd.shieldDust && move.c !== 1);
    if (move.c !== 1) {
      if (r.eff === 0) { log(`${nm(tgt)}에게는 효과가 없는 것 같다...`, at, 'weak'); return; }
      if (move.c === 2 && tgt.sp === 875 && !tgt.noice && (tgt.baseAbility ?? tgt.ability) === 248 && !A.moldBreaker) {
        abLog(tgt, `${jo(nm(tgt), '은')} 얼음 얼굴로 공격을 막아냈다!`, at); tgt.noice = true; formCheck(tgt, at); return;
      }
      let total = r.dmg;
      let hits = move.hits ? (A.skillLink ? move.hits[1] : rint(move.hits[0], move.hits[1])) : 1;
      if (R.popBomb && !A.skillLink) { hits = 1; while (hits < move.hits[1] && Math.random() < 0.9) hits++; }
      for (let i = 1; i < hits; i++) total += calcHit(user, tgt, { ...move, a: 0, p: R.escalate ? move.p * (i + 1) : move.p }).dmg || 0;
      if (R.falseSwipe) total = Math.max(0, Math.min(total, tgt.hp - 1));
      if (r.crit) log('급소에 맞았다!', at, 'crit');
      // 급소는 분홍, 효과가 굉장하면 주황, 별로면 회청 (급소 + 굉장함은 둘 다 표시)
      const ec = r.crit ? (r.eff > 1 ? 'crit super' : 'crit') : r.eff > 1 ? 'super' : r.eff < 1 ? 'weak' : undefined;
      const et = effText(r.eff); if (et) log(et, at, r.eff > 1 ? 'super' : 'weak');
      log(`${jo(nm(tgt), '은')} ${total}의 데미지를 입었다.` + (hits > 1 ? ` (${hits}회)` : ''), at, ec);
      if (total > 0) Sound.play(tgt.player ? 'hurt' : r.crit ? 'crit' : r.eff > 1 ? 'super' : r.eff < 1 ? 'weak' : 'hit', at);
      const hpBefore = tgt.hp;
      if (total > 0) damage(tgt, total, user, at, r.eff, r.crit);
      const dealt = Math.max(0, hpBefore - Math.max(0, tgt.hp));   // 실제로 깎인 HP
      if (move.dr && dealt > 0) {
        const amt = Math.max(1, Math.floor(dealt * (move.dr > 0 ? DRAIN_PCT : -move.dr * RECOIL_MUL) / 100));
        if (move.dr > 0) {
          if (abilityOf(tgt).liquidOoze) { abLog(tgt, `${jo(nm(user), '은')} 해감액을 흡수했다!`, at); damage(user, amt, tgt, at); }
          else heal(user, amt, at);
        } else if (!A.rockHead) { log(`${jo(nm(user), '은')} 반동으로 데미지를 입었다.`, at); damage(user, amt, null, at); }
      }
      if (tgt.hp > 0 && secondary) {
        if (move.ail && Math.random() * 100 < move.ac * serene) inflict(tgt, AILMENT_MAP[move.ail], at, false, user);
        if (move.fl && Math.random() * 100 < move.fl * serene) setFlinch(tgt, at);
      }
      if (tgt.hp > 0 && A.stench && Math.random() < 0.1 * serene) setFlinch(tgt, at);
      if (tgt.hp > 0 && A.poisonTouch && Math.random() < 0.3) inflict(tgt, 'psn', at, false, user);
      if (tgt.hp > 0 && r.crit && abilityOf(tgt).angerPoint) { tgt.stages[2] = 6; abLog(tgt, `${nm(tgt)}의 공격이 최대로 올라갔다!`, at); }
      if (tgt.hp > 0 && total > 0) onHitAbility(tgt, user, move, mt, at);
      if (isContact(move) && total > 0 && !A.noContact) contactAbility(user, tgt, at);
      const Hu = heldOf(user);
      if (Hu.shellBell && total > 0 && user.hp > 0) heal(user, Math.max(1, Math.floor(total / Hu.shellBell)), at);
      if (Hu.lifeOrb && total > 0 && user.hp > 0 && !user.lifeOrbHit) { user.lifeOrbHit = true; log(`${jo(nm(user), '은')} 생명이 조금 깎였다!`, at); damage(user, Math.max(1, Math.floor(user.maxhp / 10)), null, at); }
      if (heldOf(tgt).helmet && isContact(move) && total > 0 && user.hp > 0) { log(`${jo(nm(user), '은')} ${jo(ITEMS[tgt.held].n, '으로')} 데미지를 입었다!`, at); damage(user, Math.max(1, Math.floor(user.maxhp / heldOf(tgt).helmet)), tgt, at); }
      if (tgt.hp > 0 && total > 0 && abilityOf(tgt).colorChange && mt && !(tgt.types.length === 1 && tgt.types[0] === mt)) { tgt.types = [mt]; abLog(tgt, `${jo(nm(tgt), '은')} ${typeName(mt)} 타입이 되었다!`, at); }
    } else if (move.ail) {
      if (Math.random() * 100 < (move.ac || 100)) inflict(tgt, AILMENT_MAP[move.ail], at, true, user);
    }
    if (move.sc && secondary && Math.random() * 100 < move.scc * serene) {
      for (const [st, ch] of move.sc) {
        if (move.ss) { if (user.hp > 0) statChange(user, st, ch, at, user); continue; }
        if (ch < 0 && tgt.hp > 0) statChange(tgt, st, ch, at, user);
        if (ch > 0 && user.hp > 0) statChange(user, st, ch, at, user);
      }
    }
  }
  function setFlinch(c, at) {
    if (abilityOf(c).noFlinch) { abLog(c, `${jo(nm(c), '은')} 풀죽지 않는다!`, at); return; }
    c.flinch = true;
  }
  // 맞았을 때 발동하는 특성 (주눅, 정의의마음, 지구력, 깨어진갑옷, 열교환)
  function onHitAbility(tgt, user, move, mt, at) {
    const o = abilityOf(tgt).onHitBy; if (!o) return;
    if (o.types && !o.types.includes(mt)) return;
    if (o.t && o.t !== mt) return;
    if (o.phys && move.c !== 2) return;
    statChange(tgt, o.st, o.ch, at, tgt);
    if (o.st2) statChange(tgt, o.st2, o.ch2, at, tgt);
  }
  // 접촉 공격에 반응하는 특성
  function contactAbility(user, tgt, at) {
    const D_ = abilityOf(tgt), A = abilityOf(user);
    const c = D_.contact;
    if (c && user.hp > 0) {
      if (c.ail && Math.random() * 100 < c.c) inflict(user, c.ail === 'spore' ? pick(['psn', 'par', 'slp']) : c.ail, at, false, tgt);
      if (c.dmg) { const amt = Math.max(1, Math.floor(user.maxhp / c.dmg)); abLog(tgt, `${jo(nm(user), '은')} 상처를 입었다!`, at); damage(user, amt, tgt, at); }
      if (c.st) statChange(user, c.st, c.ch, at, tgt);
      if (c.flinch && Math.random() * 100 < c.flinch) setFlinch(user, at);
      if (c.item && tgt.player && Math.random() * 100 < c.item) { const id = weighted(dropTable(D.lvl)); if (addToBag(id)) abLog(tgt, `${jo(ITEMS[id].n, '을')} 빼앗았다!`, at); }
    }
    if (A.magician && user.player && Math.random() < 0.1) { const id = weighted(dropTable(D.lvl)); if (addToBag(id)) abLog(user, `${jo(ITEMS[id].n, '을')} 손에 넣었다!`, at); }
  }
  function applySelf(user, move, at) {
    if (move.h > 0) heal(user, Math.floor(user.maxhp * move.h / 100), at);
    if (move.sc) for (const [st, ch] of move.sc) if (ch > 0) statChange(user, st, ch, at, user);
    D.fx.push({ kind: 'ring', x: user.x, y: user.y, at, dur: 300 * spd(), color: '#fff6a0' });
  }
  function heal(c, amt, at) {
    const before = c.hp; c.hp = Math.min(c.maxhp, c.hp + amt);
    if (c.hp > before) { if (c.player) Sound.play('heal', at); popup(c, '+' + (c.hp - before), '#7f7', at); log(`${jo(nm(c), '은')} HP를 ${c.hp - before} 회복했다.`, at); }
  }
  // src: 능력 변화를 일으킨 쪽 (상대가 떨어뜨렸는지 판정)
  function statChange(c, st, ch, at, src) {
    const A = abilityOf(c), byFoe = src && src !== c;
    if (A.contrary) ch = -ch;
    if (A.simple) ch *= 2;
    if (ch < 0 && byFoe) {
      const nd = A.noDrop;
      if (nd && (nd === 'all' || nd.includes(st))) { abLog(c, `${nm(c)}의 ${jo(STAT_NAMES[st], '은')} 떨어지지 않는다!`, at); return; }
      if (heldOf(c).noDrop) { log(`${jo(ITEMS[c.held].n, '의')} 힘으로 ${nm(c)}의 ${jo(STAT_NAMES[st], '은')} 떨어지지 않았다!`, at); return; }
    }
    const cur = c.stages[st] || 0, nv = clamp(cur + ch, -6, 6);
    if (nv === cur) { log(`${nm(c)}의 ${jo(STAT_NAMES[st], '은')} 더 이상 변하지 않는다!`, at); return; }
    c.stages[st] = nv;
    if (c.player || seen(c)) Sound.play(ch > 0 ? 'up' : 'down2', at);
    log(`${nm(c)}의 ${jo(STAT_NAMES[st], '이')}${Math.abs(ch) > 1 ? ' 크게' : ''} ${ch > 0 ? '올라갔다!' : '떨어졌다!'}`, at);
    if (ch < 0 && byFoe && A.defiant) { abLog(c, '능력이 떨어져서 오기가 생겼다!', at); statChange(c, A.defiant, 2, at, c); }
  }
  function inflict(c, kind, at, verbose, src) {
    if (c.status) { if (verbose) log(`${nm(c)}에게는 효과가 없었다.`, at); return; }
    const imm = { psn: [4, 9], brn: [10], par: [13], frz: [15] }[kind] || [];
    if (c.types.some(t => imm.includes(t)) && !(kind === 'psn' && src && abilityOf(src).corrosion)) { if (verbose) log(`${nm(c)}에게는 효과가 없었다.`, at); return; }
    const A = src && src !== c ? defAbility(src, c) : abilityOf(c);
    if (kind === 'slp' && c.noSleep) { log(`${jo(nm(c), '은')} 유루열매 덕분에 잠들지 않았다!`, at); return; }
    if (heldOf(c).noStatus && heldOf(c).noStatus.includes(kind)) { log(`${jo(nm(c), '은')} ${jo(ITEMS[c.held].n, '의')} 힘으로 ${STATUS_NAMES[kind]} 상태를 막았다!`, at); return; }
    if (A.noStatus && A.noStatus.includes(kind)) { abLog(c, `${jo(nm(c), '은')} ${STATUS_NAMES[kind]} 상태가 되지 않는다!`, at); return; }
    const sr = Object.keys(A).length ? abVal(c, 'statusResist') : 0;
    if (kind === 'frz' && weatherNow() === 'sun') { if (verbose) log(`${nm(c)}에게는 효과가 없었다.`, at); return; }
    if (sr && Math.random() < sr) { abLog(c, `${jo(nm(c), '은')} 상태이상을 막아냈다!`, at); return; }
    c.status = kind;
    c.statusT = { slp: rint(3, 5), frz: rint(2, 4), par: 15, psn: 15, brn: 15, cnf: rint(4, 7) }[kind];
    if (c.boss) c.statusT = Math.max(1, Math.ceil(c.statusT / 2));
    if (heldOf(c).statusShort) c.statusT = Math.max(1, Math.ceil(c.statusT / 2));
    if ((A.earlyBird && kind === 'slp') || A.naturalCure) c.statusT = Math.max(1, Math.ceil(c.statusT / 2));
    const msg = { psn: '독에 걸렸다!', brn: '화상을 입었다!', par: '마비되었다!', slp: '잠들어 버렸다!', frz: '얼어붙었다!', cnf: '혼란에 빠졌다!' }[kind];
    log(`${jo(nm(c), '은')} ${msg}`, at, 'st-' + kind);
    popup(c, STATUS_NAMES[kind], STATUS_COLORS[kind], at + 120, 'small');
    if (c.player || seen(c)) Sound.play('status', at);
    if (abilityOf(c).synchronize && src && src !== c && ['psn', 'brn', 'par'].includes(kind) && !src.status) {
      abLog(c, '상태이상을 되돌려 보냈다!', at); inflict(src, kind, at, false, null);
    }
  }
  // eff: 타입 상성 배율 (데미지 숫자 색과 크기를 바꾼다)
  function damage(c, amt, src, at, eff = 1, crit = false) {
    if (c.hp <= 0) return;
    const A = abilityOf(c);
    if (!src && A.magicGuard) return;
    if (A.sturdy && c.hp >= c.maxhp && amt >= c.hp && c.maxhp > 1) { amt = c.hp - 1; abLog(c, `${jo(nm(c), '은')} 공격을 버텼다!`, at); }
    const H = heldOf(c);
    if (amt >= c.hp && c.hp > 1 && ((H.sash && c.hp >= c.maxhp) || (H.band && Math.random() < H.band))) {
      amt = c.hp - 1; log(`${jo(nm(c), '은')} ${jo(ITEMS[c.held].n, '으로')} 버텼다!`, at);
    }
    c.hp -= amt; c.hurtAt = at;
    if (c.player && amt >= c.maxhp * 0.2) setFace('Pain', 1200);
    c.lastHurtSeq = ++D.seq; c.lastHurtBy = src ? src.id : null;
    if (crit) popup(c, amt + (eff > 1 ? '!!' : '!'), '#ff5ce1', at, 'big');
    else if (eff > 1) popup(c, amt + '!', '#ffb02e', at, 'big');
    else if (eff < 1) popup(c, String(amt), '#8ea6c8', at, 'small');
    else popup(c, String(amt), c.player ? '#ff8a8a' : '#fff', at);
    if (c.status === 'frz' && src && amt > 0 && Math.random() < 0.3) { c.status = null; log(`${nm(c)}의 얼음이 녹았다!`, at); }
    if (c.hp <= 0) { c.hp = 0; faint(c, src, at); }
  }
  function faint(c, src, at) {
    if (c.player) {
      const bi = run.bag.findIndex(b => b.id === 'reviver');
      if (bi >= 0) {
        takeFromBag(bi);
        c.hp = c.maxhp; c.status = null; c.stages = {};
        log(`쓰러졌지만 부활씨의 힘으로 되살아났다!`, at);
        popup(c, 'REVIVE', '#ffe066', at + 150);
        return;
      }
      log(`${jo(nm(c), '은')} 쓰러지고 말았다...`, at);
      Sound.play('down', at);
      D.dead = true;
      D.prompts.push(() => Game.endRun('faint'));
      return;
    }
    c.dead = true; c.deadAt = at;
    if (seen(c) || src === P()) Sound.play('faint', at);
    if (src && src.player) { Progress.add('kills'); Progress.beaten(c.sp); run.kills = (run.kills || 0) + 1; checkLater(); }
    D.mons = D.mons.filter(m => m !== c);
    D.corpses.push(c);
    if (c.item) { landItem(c.x, c.y, c.item, 1, at); c.item = null; }
    if (seen(c) || src === P()) log(`${jo(nm(c), '을')} 쓰러뜨렸다!`, at);
    if (src && src.hp > 0) {
      const sa = abilityOf(src);
      if (sa.onKO) statChange(src, sa.onKO === 'best' ? (src.atk >= src.spa ? 2 : 4) : 2, 1, at, src);
    }
    if (src && abilityOf(c).aftermath && src.hp > 0) { abLog(c, `${jo(nm(src), '은')} 폭발에 휘말렸다!`, at); damage(src, Math.max(1, Math.floor(src.maxhp / 4)), c, at); }
    if (src && src.player) {
      gainExp(Math.floor(expGain(c, P().lv) * (c.outlaw || c.boss ? BOSS_EXP_MUL : 1) * (c.shiny ? 2 : 1) * (heldOf(P()).expMul || 1)), at);
      const free = !itemAt(c.x, c.y) && !(D.stairs.x === c.x && D.stairs.y === c.y);
      const sig = sigItemsFor([c.sp]);
      if (c.shiny && free) D.items.push({ x: c.x, y: c.y, id: weighted(DROP_TABLE.filter(d => ITEMS[d[0]].held || ITEMS[d[0]].tm || d[0] === 'candy')), n: 1 });
      else if (sig.length && !c.boss && free && Math.random() < SIG_DROP.defeat) D.items.push({ x: c.x, y: c.y, id: pick(sig), n: 1 });
      else if (Math.random() < ENEMY_DROP_CHANCE && free) D.items.push({ x: c.x, y: c.y, id: weighted(dropTable(D.lvl)), n: 1 });
      if (c.shiny && Game.unlockShiny(c.sp)) log(`✨ 이제 캐릭터 탭에서 ${spName(c.sp)}의 이로치 모습을 고를 수 있다!`, at + 300);
      if (run.mode === 'normal' && !c.outlaw && !NO_RECRUIT.includes(c.sp) && !Game.save.roster[c.sp]) {
        const rate = recruitRate(P().lv) * (DATA.species[c.sp].lg ? 0.5 : 1) * (c.boss ? 0.5 : 1) * (heldOf(P()).recruitMul || 1);
        if (Math.random() < rate) D.prompts.push(() => recruitPrompt(c));
      }
    }
    if (c.boss) bossDefeated(c, at);
    if (c.outlaw) missionDone(c.mission, `현상수배범 ${jo(spName(c.sp), '을')} 붙잡았다!`);
  }
  // raw: 이상한사탕처럼 정해진 만큼 (전설 보정 없이)
  function gainExp(amt, at, raw) {
    const p = P();
    if (p.lv >= MAX_LEVEL) return;
    if (!raw) amt = Math.max(1, Math.floor(amt / expDiv(p.sp)));
    p.exp += amt;
    log(`경험치를 ${amt} 얻었다.`, at);
    while (p.lv < MAX_LEVEL && p.exp >= expFor(p.lv + 1)) {
      p.lv++; recalc(p);
      log(`${jo(nm(p), '은')} 레벨 ${jo(p.lv, '으로')} 올랐다!`, at);
      popup(p, 'LEVEL UP', '#ffe066', at + 200);
      Sound.play('levelup', at + 200); Progress.max('maxLv', p.lv); checkLater();
      setFace('Joyous', 2500);
      for (const mid of learnedAt(p.sp, p.lv)) {
        if (p.moves.some(m => m.id === mid)) continue;
        if (p.moves.length < 4) { p.moves.push({ id: mid, pp: DATA.moves[mid].pp, max: DATA.moves[mid].pp }); log(`${jo(DATA.moves[mid].n, '을')} 배웠다!`, at); }
        else D.learnQueue.push(mid);
      }
    }
  }

  function canAct(c) {
    if (c.recharge) { c.recharge = false; if (c.player || seen(c)) log(`${jo(nm(c), '은')} 반동으로 움직일 수 없다!`); return false; }
    if (c.flinch) {
      c.flinch = false; if (c.player || seen(c)) log(`${jo(nm(c), '은')} 풀이 죽어 움직일 수 없다!`);
      if (abilityOf(c).steadfast) statChange(c, 6, 1, now(), c);
      return false;
    }
    if (abilityOf(c).truant && Math.random() < abilityOf(c).truant) { abLog(c, `${jo(nm(c), '은')} 게으름을 피우고 있다...`); return false; }
    if (c.status === 'slp' || c.status === 'frz') { c.charging = null; c.rampage = null; }
    if (c.status === 'slp') { if (c.player) log(`${jo(nm(c), '은')} 잠들어 있다...`, undefined, 'st-slp'); return false; }
    if (c.status === 'frz') { if (c.player) log(`${jo(nm(c), '은')} 얼어서 움직일 수 없다!`, undefined, 'st-frz'); return false; }
    if (c.status === 'par' && Math.random() < 0.25) { if (c.player || seen(c)) log(`${jo(nm(c), '은')} 몸이 저려서 움직일 수 없다!`, undefined, 'st-par'); return false; }
    return true;
  }
  function statusTick(c) {
    abilityTick(c);
    if (!c.status || c.hp <= 0) return;
    const A = abilityOf(c);
    const cc = abVal(c, 'cureChance');
    if (cc && Math.random() < cc) {
      abLog(c, `${nm(c)}의 ${STATUS_NAMES[c.status]} 상태가 나았다!`, Math.max(T.cursor, T.moveEnd));
      c.status = null; return;
    }
    if (c.status === 'psn' && A.poisonHeal) {
      c.stTick = (c.stTick || 0) + 1;
      if (c.stTick % 2 === 0 && c.hp < c.maxhp) heal(c, Math.max(1, Math.floor(c.maxhp / 12)), Math.max(T.cursor, T.moveEnd));
    } else if (c.status === 'psn' || c.status === 'brn') {
      c.stTick = (c.stTick || 0) + 1;
      if (c.stTick % 2 === 0) {
        const at = Math.max(T.cursor, T.moveEnd);
        if (c.player || seen(c)) log(`${jo(nm(c), '은')} ${c.status === 'psn' ? '독' : '화상'} 데미지를 입었다.`, at, 'st-' + c.status);
        damage(c, Math.max(1, Math.floor(c.maxhp / 14)), null, at);
      }
    }
    if (--c.statusT <= 0 && c.hp > 0) {
      const msg = { psn: '독이 나았다.', brn: '화상이 나았다.', par: '마비가 풀렸다.', slp: '눈을 떴다!', frz: '얼음이 녹았다!', cnf: '혼란이 풀렸다!' }[c.status];
      c.status = null;
      if (c.player || seen(c)) log(`${nm(c)}의 ${msg}`);
    }
  }
  const confuse = (c, dir) => (c.status === 'cnf' && Math.random() < 0.5 ? rand(8) : dir);

  // ───────────────────────── 적 AI ─────────────────────────
  function enemyAct(e) {
    if (e.hp <= 0 || e.npc) return;
    if (!canAct(e)) return;
    const p = P();
    if (e.charging) {
      const ddx = p.x - e.x, ddy = p.y - e.y;
      const aligned = ddx === 0 || ddy === 0 || Math.abs(ddx) === Math.abs(ddy);
      useMove(e, e.charging.slot, aligned && (ddx || ddy) ? dirIndex(ddx, ddy) : e.dir, { release: true, free: true });
      return;
    }
    if (e.rampage) { rampageStep(e); return; }
    const nerve = abilityOf(p).unnerve ? 0.5 : 1;
    const sees = seen(e) && p.hp > 0;
    if (sees) e.target = { x: p.x, y: p.y };
    const dx = p.x - e.x, dy = p.y - e.y, dist = Math.max(Math.abs(dx), Math.abs(dy));
    const usable = e.moves.map((m, i) => ({ m: DATA.moves[m.id], i, pp: m.pp })).filter(o => o.pp > 0);
    if (e.item && enemyUseItem(e, p, sees, dist, dx, dy)) return;
    if (sees && dist === 1 && diagOK(e.x, e.y, Math.sign(dx), Math.sign(dy))) {
      const dir = confuse(e, dirIndex(dx, dy));
      const opts = usable.filter(o => (o.m.r !== 's' || !(e.stages[2] > 1)));
      if (opts.length && Math.random() < 0.4 * nerve) useMove(e, pick(opts).i, dir);
      else useMove(e, -1, dir);
      return;
    }
    if (sees && dist <= PROJ_RANGE && (dx === 0 || dy === 0 || Math.abs(dx) === Math.abs(dy))) {
      const proj = usable.filter(o => o.m.r === 'p' && o.m.c !== 1);
      if (proj.length && Math.random() < 0.45 * nerve && lineClear(e, dirIndex(dx, dy), dist)) { useMove(e, pick(proj).i, dirIndex(dx, dy)); return; }
    }
    if (sees && dist <= 3) {
      const area = usable.filter(o => o.m.r === 'r' && o.m.c !== 1);
      if (area.length && Math.random() < 0.25 * nerve && los(e.x, e.y, p.x, p.y)) { useMove(e, pick(area).i, dirIndex(dx, dy) || 0); return; }
    }
    let goal = e.target;
    if (goal && goal.x === e.x && goal.y === e.y) { e.target = null; goal = null; }
    if (!goal) {
      if (!e.wander || (e.wander.x === e.x && e.wander.y === e.y) || Math.random() < 0.02) {
        const R = pick(D.rooms); e.wander = { x: rint(R.x, R.x + R.w - 1), y: rint(R.y, R.y + R.h - 1) };
      }
      goal = e.wander;
    }
    const path = bfs(e.x, e.y, (x, y) => x === goal.x && y === goal.y, { blockMons: true, self: e, max: 900 });
    let sx, sy;
    if (path) { sx = path.fx - e.x; sy = path.fy - e.y; }
    else { sx = Math.sign(goal.x - e.x); sy = Math.sign(goal.y - e.y); }
    const d0 = confuse(e, dirIndex(sx, sy));
    if (d0 < 0) return;
    let [mx, my] = DIRS[d0];
    if (!canStep(e, mx, my)) {
      // 막혔으면 비슷한 방향 시도
      const alts = [d0 + 1, d0 - 1].map(d => (d + 8) % 8).filter(d => canStep(e, DIRS[d][0], DIRS[d][1]));
      if (!alts.length) { if (!path) e.wander = null; return; }
      [mx, my] = DIRS[pick(alts)];
    }
    const fx = e.x, fy = e.y;
    e.x += mx; e.y += my; e.dir = dirIndex(mx, my);
    schedMove(e, fx, fy);
    enemyPickup(e);
  }
  // 적이 밟은 아이템을 줍는다 (하나까지)
  function enemyPickup(e) {
    if (e.item || e.boss) return;
    const it = itemAt(e.x, e.y);
    if (!it || it.money || it.id === 'quest' || it.price || !ITEMS[it.id]) return;
    if (it.n > 1) it.n--; else D.items = D.items.filter(i => i !== it);
    e.item = it.id;
    if (seen(e)) log(`${jo(nm(e), '은')} ${jo(ITEMS[it.id].n, '을')} 주웠다!`, T.moveEnd || T.base);
  }
  // 적이 가진 아이템을 쓸지: 쓰면 true (그 턴의 행동)
  function enemyUseItem(e, p, sees, dist, dx, dy) {
    const id = e.item, it = id && ITEMS[id]; if (!it) return false;
    const at = Math.max(T.cursor, T.moveEnd, T.base);
    const eat = () => { e.item = null; if (seen(e)) log(`${jo(nm(e), '은')} ${jo(it.n, '을')} ${isEdible(it) ? '먹었다' : '사용했다'}!`, at); };
    if ((it.use === 'heal' || it.use === 'healPct' || it.use === 'fullheal') && e.hp < e.maxhp * 0.4) {
      eat(); heal(e, it.use === 'heal' ? it.v : it.use === 'healPct' ? Math.floor(e.maxhp * it.v / 100) : e.maxhp, at); return true;
    }
    if (e.status && ((it.use === 'cureOne' && it.st === e.status) || it.use === 'cure' || it.use === 'fullheal')) {
      eat(); e.status = null; if (seen(e)) log(`${nm(e)}의 상태가 나았다!`, at); return true;
    }
    if (it.use === 'stat' && sees && dist <= 3 && !(e.stages[it.st] > 0)) { eat(); statChange(e, it.st, it.v, at, e); return true; }
    if (it.throw && sees && dist > 1 && dist <= 8 && (dx === 0 || dy === 0 || Math.abs(dx) === Math.abs(dy)) && lineClear(e, dirIndex(dx, dy), dist) && Math.random() < 0.5) {
      e.item = null; throwItem(e, id, dirIndex(dx, dy)); return true;
    }
    return false;
  }
  // 직선 기술·던지기가 닿는지 (벽 모서리는 지나간다)
  function lineClear(c, dir, dist) {
    let x = c.x, y = c.y;
    for (let i = 1; i < dist; i++) {
      x += DIRS[dir][0]; y += DIRS[dir][1];
      if (!floorAt(x, y) || creatureAt(x, y)) return false;
    }
    return true;
  }

  // ───────────────────────── 플레이어 행동 ─────────────────────────
  function act(action) {
    if (!D || D.dead || busy() || UI.isOpen()) return false;
    const p = P();
    beginTurn();
    const hpBefore = p.hp;
    let used = false;
    if (action.t === 'face') { p.dir = action.dir; return false; }
    const snore = action.t === 'skill' && p.status === 'slp' && p.moves[action.slot] && MOVE_RULES[p.moves[action.slot].id]?.needSleepSelf;
    if (action.t !== 'skill') p.chain = null;
    if (!snore && !canAct(p)) used = true;
    else if (p.charging) {
      const mv = DATA.moves[p.moves[p.charging.slot].id];
      autoFace(p, mv);
      useMove(p, p.charging.slot, confuse(p, p.dir), { release: true, free: true }); used = true;
    } else if (p.rampage) { rampageStep(p); used = true; }
    else switch (action.t) {
      case 'move': used = doMove(confuse(p, action.dir)); break;
      case 'attack': useMove(p, -1, confuse(p, p.dir)); used = true; break;
      case 'skill': {
        const m = p.moves[action.slot];
        if (!m) return false;
        if (m.pp <= 0) { log('PP가 남아있지 않다!', now()); return false; }
        const mv = DATA.moves[m.id];
        if (action.autoFace !== false) autoFace(p, mv);
        useMove(p, action.slot, confuse(p, p.dir)); used = true; break;
      }
      case 'wait': used = true; break;
      case 'item': used = useItem(action.slot, action.mode); break;
      case 'foot': used = footAction(action.mode, action.slot); break;
    }
    if (!used) return false;
    afterPlayer();
    return { hpLost: p.hp < hpBefore };
  }

  function autoFace(p, mv) {
    const [dx, dy] = DIRS[p.dir];
    const front = creatureAt(p.x + dx, p.y + dy);
    if (front && hostileTo(p, front)) return;
    const vis = hostilesVisible();
    if (mv.r === 'f') {
      const adj = vis.find(e => Math.max(Math.abs(e.x - p.x), Math.abs(e.y - p.y)) === 1 && diagOK(p.x, p.y, Math.sign(e.x - p.x), Math.sign(e.y - p.y)));
      if (adj) p.dir = dirIndex(adj.x - p.x, adj.y - p.y);
    } else if (mv.r === 'p') {
      const al = vis.filter(e => { const dx = e.x - p.x, dy = e.y - p.y; return (dx === 0 || dy === 0 || Math.abs(dx) === Math.abs(dy)) && Math.max(Math.abs(dx), Math.abs(dy)) <= PROJ_RANGE && lineClear(p, dirIndex(dx, dy), Math.max(Math.abs(dx), Math.abs(dy))); })
        .sort((a, b) => Math.max(Math.abs(a.x - p.x), Math.abs(a.y - p.y)) - Math.max(Math.abs(b.x - p.x), Math.abs(b.y - p.y)));
      if (al[0]) p.dir = dirIndex(al[0].x - p.x, al[0].y - p.y);
    }
  }

  function doMove(dir) {
    const p = P(); const [dx, dy] = DIRS[dir];
    p.dir = dir;
    const t = creatureAt(p.x + dx, p.y + dy);
    if (t && t.npc) { if (diagOK(p.x, p.y, dx, dy)) { talkNpc(t); } return false; }
    if (t && hostileTo(p, t)) {
      if (!diagOK(p.x, p.y, dx, dy)) return false;
      useMove(p, -1, dir); return true;
    }
    if (!canStep(p, dx, dy)) return false;
    const fx = p.x, fy = p.y;
    p.x += dx; p.y += dy;
    schedMove(p, fx, fy);
    onStep();
    return true;
  }

  function talkNpc(npc) {
    if (npc.shopkeeper) { shopMenu(); return; }
    if (!npc.mission) return;
    D.mons = D.mons.filter(m => m !== npc);
    npc.dead = true; npc.deadAt = now() + 600; D.corpses.push(npc);
    if (npc.friend) {
      log(`쓰러져 있던 친구의 ${jo(spName(npc.sp), '을')} 구조했다! 마을로 돌아가면 A-OK 코드를 받을 수 있다.`, now());
      missionDone(npc.mission, `친구의 ${spName(npc.sp)} 구조 완료! 마을로 돌아가면 A-OK 코드가 나옵니다.`);
      return;
    }
    log(`${jo(spName(npc.sp), '을')} 구조했다! 의뢰인이 탈출 배지로 마을에 돌아갔다.`, now());
    missionDone(npc.mission, `${spName(npc.sp)} 구조 완료!`);
  }

  // ───────────────────────── 함정 / 몬스터 하우스 / 상점 ─────────────────────────
  const trapAt = (x, y) => D.traps.find(t => t.x === x && t.y === y);

  function triggerTrap(tr, depth) {
    const p = P(), at = T.base + 130 * spd(), info = TRAPS[tr.kind];
    tr.seen = true;
    stopAuto();
    log(`${jo(info.n, '을')} 밟았다!`, at);
    Sound.play('trap', at);
    D.fx.push({ kind: 'ring', x: tr.x, y: tr.y, at, dur: 350 * spd(), color: '#ff9a3c' });
    const pa = abilityOf(p);
    if (pa.trapImmune && pa.trapImmune.includes(tr.kind)) { abLog(p, '하지만 아무 일도 일어나지 않았다!', at); return; }
    if (heldOf(p).trapImmune) { log(`${jo(ITEMS[p.held].n, '이')} 함정을 막아 주었다!`, at); return; }
    switch (tr.kind) {
      case 'psn': case 'slp': case 'par': inflict(p, tr.kind, at, true); break;
      case 'warp': {
        const t = randomRoomTile({ far: 6 });
        if (t) { p.x = t.x; p.y = t.y; p.tween = null; log('어딘가로 날아갔다!', at); computeVis(); onStep(depth + 1); }
        break;
      }
      case 'blast': {
        const hit = [p, ...D.mons.filter(m => !m.npc && Math.max(Math.abs(m.x - tr.x), Math.abs(m.y - tr.y)) <= 1)];
        for (const c of hit) { const amt = Math.max(1, Math.floor(c.maxhp * 0.2)); log(`${jo(nm(c), '은')} ${amt}의 데미지를 입었다.`, at); damage(c, amt, null, at); }
        break;
      }
      case 'hunger': p.belly = Math.max(0, p.belly - 20); log('배가 급격히 고파졌다!', at); break;
      case 'reset': {
        const any = Object.values(p.stages).some(v => v);
        for (const k of Object.keys(p.stages)) p.stages[k] = 0;
        log(any ? '능력 변화가 모두 원래대로 돌아갔다!' : '하지만 아무 일도 일어나지 않았다.', at);
        break;
      }
      case 'summon': {
        let n = rint(2, 3);
        for (const [dx, dy] of DIRS) {
          if (!n) break;
          const x = p.x + dx, y = p.y + dy;
          if (floorAt(x, y) && !creatureAt(x, y)) { const e = spawnEnemy({ x, y }); e.target = { x: p.x, y: p.y }; n--; }
        }
        D.traps = D.traps.filter(t => t !== tr);
        log('적들이 나타났다!', at);
        break;
      }
    }
  }

  function triggerHouse() {
    const p = P(), room = D.house.room;
    D.house.triggered = true;
    Progress.add('houses'); checkLater(); Sound.play('trap');
    stopAuto();
    let n = rint(6, 9);
    for (let tries = 0; n > 0 && tries < 60; tries++) {
      const t = randomRoomTile({ room });
      if (!t || Math.max(Math.abs(t.x - p.x), Math.abs(t.y - p.y)) < 2) continue;
      const e = spawnEnemy(t); e.target = { x: p.x, y: p.y }; n--;
    }
    computeVis();
    log('몬스터 하우스다!!', T.base);
    popup(p, 'MONSTER HOUSE!', '#ff5a5a', T.base + 100);
    D.fx.push({ kind: 'ring', x: p.x, y: p.y, at: T.base, dur: 600, color: '#ff5a5a' });
  }

  function makeShop(freeRooms) {
    const cand = freeRooms.filter(i => D.rooms[i].w >= 4 && D.rooms[i].h >= 4);
    if (!cand.length) return;
    const ri = cand[rand(cand.length)];
    freeRooms.splice(freeRooms.indexOf(ri), 1);
    const R = D.rooms[ri];
    const aw = Math.min(3, R.w - 1), ah = Math.min(2, R.h - 1);
    const ax = R.x + rint(0, R.w - aw), ay = R.y + rint(0, R.h - ah);
    const tiles = new Set();
    for (let y = ay; y < ay + ah; y++) for (let x = ax; x < ax + aw; x++) tiles.add(idx(x, y));
    // 상인은 진열대 바로 옆
    let keeperPos = null;
    for (let y = ay - 1; y <= ay + ah && !keeperPos; y++) for (let x = ax - 1; x <= ax + aw; x++) {
      if (x >= R.x && x < R.x + R.w && y >= R.y && y < R.y + R.h && !tiles.has(idx(x, y))) { keeperPos = { x, y }; break; }
    }
    if (!keeperPos) return;
    D.shop = { tiles, room: ri };
    const stock = SHOP_POOL.filter(id => id !== 'stone' && id !== 'link').concat(['candy', 'reviver', 'sitrus'], HELD_SHOP_POOL.filter(() => Math.random() < 0.15), TM_IDS.filter(() => Math.random() < 0.02));
    for (const i of tiles) {
      const id = pick(stock);
      D.items.push({ x: i % D.w, y: (i / D.w) | 0, id, n: ITEMS[id].stack ? 5 : 1, price: shopPrice(id) });
    }
    const k = makeCreature(KECLEON, Math.max(D.lvl + 15, 30));
    k.npc = true; k.shopkeeper = true; k.x = keeperPos.x; k.y = keeperPos.y;
    Sprites.load(KECLEON);
    D.mons.push(k);
  }

  function shopBuyPrompt(it) {
    const p = P();
    if (itemAt(p.x, p.y) !== it) return;
    const info = ITEMS[it.id];
    const full = run.bag.length >= bagMax() && !(info.stack && run.bag.some(b => b.id === it.id));
    UI.open({
      title: '켈리몬 상점',
      html: `<p>${portraitImg(KECLEON, 'portrait sm')} 어서 오세요!</p>
        <p>${info.icon} <b>${esc(info.n)}</b>${it.n > 1 ? ' ×' + it.n : ''} — <b>₽${it.price}</b>입니다.</p><p class="dim">${esc(info.d)}</p>
        <p class="dim">가진 돈 ₽${Game.save.money}</p>`,
      choices: [
        { label: `산다 (₽${it.price})`, disabled: Game.save.money < it.price || full, sub: full ? '가방이 가득 찼다' : Game.save.money < it.price ? '돈이 부족하다' : '', fn: () => {
          Game.save.money -= it.price;
          D.items = D.items.filter(i => i !== it);
          addToBag(it.id, it.n);
          log(`${jo(info.n, '을')} ₽${it.price}에 샀다. "감사합니다!"`, now());
        } },
        { label: '그만둔다', fn: () => {} },
      ],
      cancel: () => {},
    });
  }

  function shopMenu() {
    stopAuto();
    UI.open({
      title: '켈리몬 상점',
      html: `<p>${portraitImg(KECLEON, 'portrait sm')} 어서 오세요! 켈리몬 상점입니다.</p><p class="dim">진열된 물건 위에 올라서면 살 수 있어요. 물건도 사들이고 있답니다.</p>`,
      choices: [{ label: '물건을 판다', fn: sellMenu }, { label: '그만둔다', fn: () => {} }],
    });
  }
  function sellMenu() {
    if (!run.bag.length) { UI.alert('켈리몬 상점', '<p>팔 물건이 없다.</p>'); return; }
    UI.open({
      title: `물건 팔기 (가진 돈 ₽${Game.save.money})`, wide: true,
      choices: run.bag.map((b, i) => ({
        label: `${ITEMS[b.id].icon} ${esc(ITEMS[b.id].n)}${b.n > 1 ? ' ×' + b.n : ''} — ₽${sellValue(b)}`,
        fn: () => {
          const v = sellValue(b);
          run.bag.splice(i, 1); Game.save.money += v;
          log(`${jo(ITEMS[b.id].n, '을')} ₽${v}에 팔았다.`, now());
          sellMenu();
        },
      })),
      cancel: shopMenu,
    });
  }

  // 영입: 쓰러진 적이 동료가 되고 싶어 한다
  function recruitPrompt(c) {
    stopAuto();
    setFace('Surprised', 2500);
    Sound.play('shiny');
    UI.open({
      title: '동료가 되고 싶어 한다!',
      html: `<div class="center">${portraitImg(c.sp, 'portrait big', 'Happy', c.shiny)}</div>
        <p class="center">${c.shiny ? '✨ ' : ''}${esc(jo(spName(c.sp), '이'))} 일어나서 동료가 되고 싶은 듯 이쪽을 보고 있다!</p>
        <p class="center dim">영입하면 Lv${RECRUIT_LEVEL}${c.shiny ? ' (이로치)' : ''}로 합류해서, 마을의 캐릭터 탭에서 바꿔 플레이할 수 있다.${preEvos(c.sp).length ? `<br>진화 전 모습 ${esc(preEvos(c.sp).map(spName).join(', '))}도 함께 해금된다.` : ''}</p>`,
      choices: [{ label: '영입한다', fn: () => { Game.recruit(c); log(`${jo(spName(c.sp), '이')} 동료가 되었다! (마을에서 캐릭터를 바꿀 수 있다)`, now()); setFace('Joyous', 2500); Sound.play('levelup'); } },
        { label: '거절한다', fn: () => log(`${jo(spName(c.sp), '은')} 아쉬운 듯 떠나갔다...`, now()) }],
      cancel: false,
    });
  }

  function missionDone(mid, msg) {
    if (run.done.includes(mid)) return;
    run.done.push(mid);
    setFace('Happy', 3000);
    D.prompts.push(() => {
      stopAuto();
      UI.open({
        title: '임무 완료', html: `<p>${esc(msg)}</p><p>던전에서 나가 보상을 받으시겠습니까?</p>`,
        choices: [{ label: '마을로 돌아간다', fn: () => Game.endRun('escape') }, { label: '탐험을 계속한다', fn: () => {} }],
        cancel: () => {},
      });
    });
  }

  function onStep(depth = 0) {
    const p = P();
    const it = itemAt(p.x, p.y);
    if (it && it.price) {
      if (!D.auto) D.prompts.push(() => shopBuyPrompt(it));
    } else if (it) {
      if (it.money) {
        if (heldOf(p).moneyMul) it.money = Math.floor(it.money * heldOf(p).moneyMul);
        Game.save.money += it.money; run.money += it.money;
        Sound.play('money', T.base + 60);
        D.items = D.items.filter(i => i !== it);
        log(`${it.money} 포켓을 주웠다.`, T.base + 60);
      } else if (it.id === 'quest') {
        D.items = D.items.filter(i => i !== it);
        log(`의뢰품을 찾았다!`, T.base + 60);
        missionDone(it.mission, '의뢰품을 찾았다!');
      } else if (addToBag(it.id, it.n)) {
        Sound.play('pickup', T.base + 60);
        D.items = D.items.filter(i => i !== it);
        log(`${jo(ITEMS[it.id].n, '을')} 주웠다.` + (it.n > 1 ? ` (${it.n}개)` : ''), T.base + 60);
      } else if (!D.ignore.has(idx(p.x, p.y))) {
        D.ignore.add(idx(p.x, p.y));
        log(`가방이 가득 차서 ${jo(ITEMS[it.id].n, '을')} 주울 수 없다.`, T.base + 60);
      }
    }
    const tr = trapAt(p.x, p.y);
    if (tr && depth < 2 && !abilityOf(p).levitate) {
      // 모르는 함정은 80%, 알고 있는 함정은 40% 확률로 작동한다
      if (Math.random() < (tr.seen ? TRAP_RATE.seen : TRAP_RATE.hidden)) triggerTrap(tr, depth);
      else { const was = tr.seen; tr.seen = true; log(was ? `${jo(TRAPS[tr.kind].n, '을')} 밟았지만 작동하지 않았다.` : `${jo(TRAPS[tr.kind].n, '을')} 밟았지만 다행히 작동하지 않았다!`, T.base + 60); }
    }
    if (D.house && !D.house.triggered && D.room[idx(p.x, p.y)] === D.house.room) triggerHouse();
    if (!D.stairsHidden && D.stairs.x === p.x && D.stairs.y === p.y) {
      if (D.auto && D.auto.kind === 'explore' && Game.save.settings.autoDescend) D.prompts.push(() => descend());
      else D.prompts.push(stairsPrompt);
    }
  }

  function stairsPrompt() {
    stopAuto();
    const last = run.floor >= dungeonById(run.dungeon).floors;
    UI.open({
      title: '계단', html: last ? '<p>출구가 보인다! 던전을 빠져나가시겠습니까?</p>' : '<p>다음 층으로 가는 계단이 있다. 내려가시겠습니까?</p>',
      choices: [{ label: last ? '나간다' : '내려간다', fn: descend }, { label: '그만둔다', fn: () => {} }], cancel: () => {},
    });
  }
  function descend() {
    const p = P();
    if (!(D.stairs.x === p.x && D.stairs.y === p.y)) return;
    stopAuto();
    const dg = dungeonById(run.dungeon);
    Progress.add('floors');
    if (run.floor >= dg.floors) { Sound.play('clear'); Game.endRun('clear'); return; }
    Sound.play('stairs');
    run.floor++;
    p.status = p.status === 'cnf' ? null : p.status;
    newFloor();
  }

  function afterPlayer() {
    const p = P();
    statusTick(p);
    const pSpeedy = (abVal(p, 'speedy') || 0) + (heldOf(p).speedy || 0);
    if (pSpeedy && Math.random() < pSpeedy && hostilesVisible().length) { abLog(p, `${jo(nm(p), '은')} 재빠르게 움직였다!`, T.base); D.mons.forEach(e => { if (!e.npc) abilityTick(e); }); }
    else for (const e of [...D.mons]) {
      if (D.dead) break;
      if (e.dead) continue;
      enemyAct(e); statusTick(e);
      const es = abVal(e, 'speedy');
      if (es && !e.npc && !D.dead && e.hp > 0 && Math.random() < es) enemyAct(e);
    }
    D.turn++; run.turnsOnFloor++; run.turns = (run.turns || 0) + 1;
    const wi = WIND.warn.indexOf(run.turnsOnFloor);
    if (wi >= 0) {
      Sound.play('wind');
      log(['어디선가 바람이 불어오기 시작했다...', '바람이 강해졌다... 서두르자!', '바람이 매우 강해졌다! 곧 날려갈 것 같다!'][wi], T.base);
      setFace(wi === 2 ? 'Worried' : 'Surprised', 2000); stopAuto();
    }
    if (run.turnsOnFloor >= WIND.limit && !D.dead) {
      log('거센 바람에 날려 던전 밖으로 쫓겨났다!', T.base);
      D.dead = true; stopAuto();
      D.prompts.push(() => Game.endRun('wind'));
    }
    for (const dl of D.delayed.filter(x => D.turn >= x.at)) {
      if (dl.t.hp > 0 && (dl.t.player || D.mons.includes(dl.t))) {
        const at = Math.max(T.cursor, T.moveEnd);
        log(`${dl.move.n}의 공격이 ${nm(dl.t)}에게 떨어졌다!`, at);
        D.fx.push({ kind: 'ring', x: dl.t.x, y: dl.t.y, at, dur: 400 * spd(), color: '#f95587' });
        resolveHit(dl.user, dl.t, { ...dl.move, a: 0 }, at);
        T.cursor = at + 250;
      }
    }
    D.delayed = D.delayed.filter(x => D.turn < x.at);
    // 배고픔 / 회복
    const b0 = p.belly;
    p.belly = Math.max(0, p.belly - 0.08 * (weatherNow() === 'snow' && !p.types.includes(15) ? 1.5 : 1) * (heldOf(p).bellyMul || 1));
    if (heldOf(p).orb && run.turnsOnFloor === 5 && !p.status) { log(`${jo(ITEMS[p.held].n, '이')} 반응했다!`, T.base); inflict(p, heldOf(p).orb, T.base, true); }
    if (p.belly > 0) {
      const ph = heldOf(p);
      D.regen += (p.maxhp / 110 + 0.05) * (abVal(p, 'regen') || 1) * (ph.regen || 1) * (ph.sludge && p.types.includes(4) ? 2.5 : 1);
      if (D.regen >= 1 && p.hp < p.maxhp && p.hp > 0) { const a = Math.floor(D.regen); p.hp = Math.min(p.maxhp, p.hp + a); D.regen -= a; }
      if (D.regen >= 1) D.regen = 0;
    } else if (p.hp > 0) {
      damage(p, 1, null, T.base);
    }
    if (b0 > 20 && p.belly <= 20) { log('배가 고파졌다...', T.base); stopAuto('배가 고프다!'); }
    if (b0 > 10 && p.belly <= 10) log('배가 너무 고프다! 빨리 뭔가 먹어야 한다!', T.base);
    if (b0 > 0 && p.belly <= 0) { log('배가 고파서 기운이 없다! HP가 줄어든다!', T.base); stopAuto(); }
    if (weatherNow() === 'sand' && D.turn % 5 === 0) {
      const at = Math.max(T.cursor, T.moveEnd);
      for (const c of [p, ...D.mons]) {
        if (c.npc || c.hp <= 0 || c.types.some(t => t === 5 || t === 6 || t === 9) || abilityOf(c).chipImmune) continue;
        if (c.player || seen(c)) log(`모래바람이 ${jo(nm(c), '을')} 덮쳤다!`, at);
        damage(c, Math.max(1, Math.floor(c.maxhp / 16)), null, at);
      }
    }
    const pab = abilityOf(p);
    for (const tr of D.traps) {
      const dist = Math.max(Math.abs(tr.x - p.x), Math.abs(tr.y - p.y));
      const chance = dist === 1 ? (pab.keenEye ? 1 : pab.anticipation ? 0.6 : 0.2) : dist === 2 && pab.anticipation ? 0.5 : 0;
      if (!tr.seen && dist > 0 && Math.random() < chance) {
        tr.seen = true; log(`${jo(TRAPS[tr.kind].n, '을')} 발견했다!`, T.base);
      }
    }
    // 적 추가 등장
    if (!D.noSpawn && --D.spawnT <= 0) {
      D.spawnT = rint(30, 45);
      if (D.mons.filter(m => !m.npc).length < 12) { const t = randomRoomTile({ hidden: true, far: 7 }); if (t) spawnEnemy(t); }
    }
    // 모습 확인 (HP·날씨에 따라 바뀌는 포켓몬, 모르페코는 턴마다)
    for (const c of [p, ...D.mons]) {
      if (c.hp <= 0 || !FORMS_OF[c.sp]) continue;
      if (c.sp === 877) c.hangry = !c.hangry;
      formCheck(c, T.base, c.sp === 877);
    }
    computeVis();
    endTurnTiming();
    if (D.learnQueue.length) D.prompts.push(learnPrompt);
  }

  function learnPrompt() {
    const mid = D.learnQueue.shift(); if (mid == null) return;
    stopAuto();
    const p = P(), mv = DATA.moves[mid];
    if (p.moves.some(m => m.id === mid)) { if (D.learnQueue.length) D.prompts.push(learnPrompt); return; }
    UI.open({
      title: `새 기술: ${esc(mv.n)}`,
      html: `${moveDetailHtml(mid)}<p>기술을 4개 알고 있다. 잊을 기술을 고르세요.</p>`,
      choices: [...p.moves.map((m, i) => ({ label: moveLine(m.id, m.pp, m.max), sub: esc(DATA.moves[m.id].d || moveEffects(m.id).join(' ')), fn: () => {
        log(`${jo(DATA.moves[m.id].n, '을')} 잊고 ${jo(mv.n, '을')} 배웠다!`, now());
        p.moves[i] = { id: mid, pp: mv.pp, max: mv.pp };
      } })), { label: `${esc(jo(mv.n, '을'))} 배우지 않는다`, fn: () => {} }],
      cancel: false,
    });
    if (D.learnQueue.length) D.prompts.push(learnPrompt);
  }

  // ───────────────────────── 가방 ─────────────────────────
  function addToBag(id, n = 1) {
    const bag = run.bag;
    if (ITEMS[id].stack) { const e = bag.find(b => b.id === id); if (e) { e.n += n; return true; } }
    if (bag.length >= bagMax()) return false;
    bag.push({ id, n: ITEMS[id].stack ? n : 1 });
    if (!ITEMS[id].stack) for (let k = 1; k < n; k++) { if (bag.length >= bagMax()) return true; bag.push({ id, n: 1 }); }
    return true;
  }
  function takeFromBag(i) { const b = run.bag[i]; if (b.n > 1) b.n--; else run.bag.splice(i, 1); }

  // 떨어진 아이템을 놓는다: 그 칸이 막혀 있으면 가장 가까운 빈 바닥으로 튕겨 나간다 (3칸 안에 없으면 사라진다)
  function landItem(x, y, id, n, at) {
    const free = (tx, ty) => floorAt(tx, ty) && !itemAt(tx, ty) && !(D.stairs.x === tx && D.stairs.y === ty) && !(D.shop && D.shop.tiles.has(idx(tx, ty)));
    for (let r = 0; r <= 3; r++) {
      const ring = [];
      for (let yy = y - r; yy <= y + r; yy++) for (let xx = x - r; xx <= x + r; xx++) {
        if (Math.max(Math.abs(xx - x), Math.abs(yy - y)) === r && free(xx, yy)) ring.push([xx, yy]);
      }
      if (ring.length) {
        const [tx, ty] = pick(ring);
        D.items.push({ x: tx, y: ty, id, n }); D.ignore.add(idx(tx, ty));
        if (r && D.visible[idx(x, y)]) log(`${jo(ITEMS[id].n, '은')} 옆으로 튕겨 나갔다.`, at);
        return true;
      }
    }
    if (D.visible[idx(x, y)]) log(`${jo(ITEMS[id].n, '은')} 어딘가로 사라져 버렸다...`, at);
    return false;
  }
  // 아이템 던지기 (플레이어·적 공통): 앞으로 10칸 날아가 처음 맞은 포켓몬에게 효과, 안 맞으면 떨어진다
  function throwItem(user, id, dir) {
    const it = ITEMS[id], [dx, dy] = DIRS[dir];
    let x = user.x, y = user.y, hit = null;
    for (let i = 0; i < 10; i++) {   // 직선 기술처럼 벽 모서리는 지나간다
      if (!floorAt(x + dx, y + dy)) break;
      x += dx; y += dy;
      const c = creatureAt(x, y); if (c) { hit = c; break; }
    }
    user.dir = dir;
    const t0 = schedAction(user, 'Attack', 260 * spd());
    D.fx.push({ kind: 'proj', x0: user.x, y0: user.y, x1: x, y1: y, at: t0 + 60, dur: 200 * spd(), color: '#ddd', icon: it.icon });
    log(`${jo(nm(user), '은')} ${jo(it.n, '을')} 던졌다!`, t0);
    const ht = t0 + 260 * spd();
    if (hit && !hit.npc) {
      if (it.throw === 'dmg') {
        let v = Math.floor(it.v * (abilityOf(user).klutz ? 1.5 : 1));
        if (!user.player) v = Math.min(v, Math.ceil(hit.maxhp * 0.3));   // 적이 던진 건 최대 HP의 30%까지 (초반에 한 방에 쓰러지지 않게)
        log(`${jo(nm(hit), '은')} ${v}의 데미지를 입었다.`, ht); damage(hit, v, user, ht); }
      else if (it.throw) inflict(hit, it.throw === 'sleep' ? 'slp' : it.throw, ht, true, user);
      else if (!it.stack) landItem(x, y, id, 1, ht);
    } else landItem(x, y, id, 1, ht);
  }

  function useItem(slot, mode) {
    const p = P(), b = run.bag[slot]; if (!b) return false;
    const it = ITEMS[b.id];
    const at = T.base;
    if (mode === 'drop') {
      if (itemAt(p.x, p.y) || (D.stairs.x === p.x && D.stairs.y === p.y)) { log('여기에는 내려놓을 수 없다.', now()); return false; }
      D.items.push({ x: p.x, y: p.y, id: b.id, n: b.n }); run.bag.splice(slot, 1);
      D.ignore.add(idx(p.x, p.y));
      log(`${jo(it.n, '을')} 내려놓았다.`, at); return true;
    }
    if (mode === 'throw') {
      takeFromBag(slot);
      throwItem(p, b.id, p.dir);
      return true;
    }
    // 사용
    if (!it.use || it.use === 'none') { log('지금은 사용할 수 없다.', now()); return false; }
    if (it.use === 'tm') {
      const mv = DATA.moves[it.mv];
      if (!canLearnTM(p.sp, it.mv)) { log(`${jo(nm(p), '은')} ${jo(mv.n, '을')} 배울 수 없다.`, now()); return false; }
      if (p.moves.some(m => m.id === it.mv)) { log(`이미 ${jo(mv.n, '을')} 알고 있다.`, now()); return false; }
      takeFromBag(slot);
      p.tms = [...new Set([...(p.tms || []), it.mv])];
      Progress.add('tms'); checkLater();
      Sound.play('item', at);
      log(`${jo(it.n, '을')} 사용했다!`, at);
      if (p.moves.length < 4) { p.moves.push({ id: it.mv, pp: mv.pp, max: mv.pp }); log(`${jo(nm(p), '은')} ${jo(mv.n, '을')} 배웠다!`, at); }
      else { D.learnQueue.push(it.mv); log(`(지금 배우지 않아도 마을의 기술 설정에서 언제든 넣을 수 있다)`, at); }
      return true;
    }
    takeFromBag(slot);
    if (!['heal', 'healPct', 'fullheal', 'gummy'].includes(it.use)) Sound.play('item', at);
    log(`${jo(it.n, '을')} ${isEdible(it) ? '먹었다' : '사용했다'}.`, at);
    if (isEdible(it)) { const b0 = p.belly; p.belly = Math.min(100, p.belly + BERRY_BELLY); if (p.belly > b0) log(`배가 조금 찼다. (+${Math.round(p.belly - b0)})`, at); }
    switch (it.use) {
      case 'heal': case 'healPct': {
        const pa = abilityOf(p);
        let amt = it.use === 'heal' ? it.v : Math.floor(p.maxhp * it.v / 100);
        if (pa.cheekPouch) amt = Math.floor(amt * 1.5);
        heal(p, amt, at);
        if (pa.harvest && Math.random() < 0.5) { addToBag(b.id); abLog(p, `${jo(it.n, '이')} 다시 열렸다!`, at); }
        break;
      }
      case 'food': setFace('Happy', 1500); p.belly = Math.min(100, p.belly + it.v * (abilityOf(p).gluttony ? 1.5 : 1)); log('배가 불러졌다!', at); break;
      case 'cureOne':
        if (p.status === it.st) { p.status = null; log(`${STATUS_NAMES[it.st]} 상태가 나았다!`, at); } else log('하지만 효과가 없었다...', at);
        break;
      case 'chesto': if (p.status === 'slp') p.status = null; p.noSleep = true; log('눈이 번쩍 뜨였다! 이 층에서는 잠들지 않는다.', at); break;
      case 'ppSome': p.moves.forEach(m => m.pp = Math.min(m.max, m.pp + it.v)); log(`모든 기술의 PP가 ${it.v}씩 회복되었다!`, at); break;
      case 'statRandom': statChange(p, pick([2, 3, 4, 5, 6]), 2, at, p); break;
      case 'critUp': p.critBoost = 2; log('급소에 맞히기 쉬워졌다!', at); break;
      case 'gummy': {
        setFace('Happy', 1500);
        p.belly = Math.min(100, p.belly + it.belly);
        p.boost = { ...(p.boost || {}) };
        const up = it.gummy.filter(k => (p.boost['g_' + k] || 0) < GUMMY_MAX);
        up.forEach(k => { p.boost['g_' + k] = (p.boost['g_' + k] || 0) + 1; });
        recalc(p);
        log(`배가 조금 불러졌다! ` + (up.length ? `${up.map(k => `${STAT_KO[k]} +${gummyAmt(k)}`).join(', ')}${run.mode === 'normal' ? ' (영구)' : ' (이번 탐험 동안)'}` : '더 이상 능력이 오르지 않는다.'), at);
        if (up.length) Sound.play('levelup', at);
        break;
      }
      case 'cure': p.status = null; p.stages = Object.fromEntries(Object.entries(p.stages).filter(([, v]) => v > 0)); log('몸 상태가 좋아졌다!', at); break;
      case 'pp': p.moves.forEach(m => m.pp = m.max); log('모든 기술의 PP가 회복되었다!', at); break;
      case 'blast': {
        const [dx, dy] = DIRS[p.dir]; const t = creatureAt(p.x + dx, p.y + dy);
        D.fx.push({ kind: 'ring', x: p.x + dx, y: p.y + dy, at, dur: 400, color: '#ff7a2a' });
        if (t && hostileTo(p, t) && abilityOf(t).blastImmune) abLog(t, `${jo(nm(t), '은')} 폭발을 막아냈다!`, at);
        else if (t && hostileTo(p, t)) { log(`불꽃을 내뿜었다! ${jo(nm(t), '은')} 60의 데미지를 입었다.`, at); damage(t, 60, p, at + 150); }
        else log('불꽃을 내뿜었지만 아무도 없었다.', at);
        break;
      }
      case 'warp': {
        const t = randomRoomTile({ far: 6 });
        if (t) { p.x = t.x; p.y = t.y; p.tween = null; log('어딘가로 순간이동했다!', at); onStep(); }
        break;
      }
      case 'escape': D.prompts.push(() => Game.endRun('escape')); break;
      case 'map': D.explored.fill(1); D.traps.forEach(t => t.seen = true); log('층의 구조와 함정이 밝혀졌다!', at); break;
      case 'allsleep': hostilesVisible().forEach(e => inflict(e, 'slp', at, true)); break;
      case 'levelup': gainExp(Math.max(0, expFor(p.lv + 1) - p.exp), at, true); break;
      case 'fullheal': heal(p, p.maxhp, at); p.status = null; log('몸 상태가 완전히 좋아졌다!', at); break;
      case 'stat': statChange(p, it.st, it.v, at, p); break;
      case 'radar': D.radar = true; log('층의 적과 아이템 위치를 알게 되었다!', at); break;
      case 'trapbust': D.traps = []; log('층의 함정이 모두 사라졌다!', at); break;
      case 'allpar': hostilesVisible().forEach(e => inflict(e, 'par', at, true, p)); break;
      case 'allslow': hostilesVisible().forEach(e => statChange(e, 6, -2, at, p)); break;
    }
    return true;
  }

  function openBag() {
    if (!D || busy()) return;
    stopAuto();
    const bag = run.bag, p = P();
    const heldHtml = p.held ? `<div class="row">지닌 물건: ${ITEMS[p.held].icon} <b>${esc(ITEMS[p.held].n)}</b> <span class="grow dim">${esc(ITEMS[p.held].d)}</span></div>` : '<div class="row dim">지닌 물건 없음</div>';
    const foot = footItem();
    UI.open({
      title: `가방 (${bag.length}/${bagMax()})`, wide: true, html: heldHtml,
      choices: [
        ...(foot ? [{ label: `👣 발밑: ${ITEMS[foot.id].icon} ${esc(ITEMS[foot.id].n)}${foot.n > 1 ? ' ×' + foot.n : ''}`, sub: '조사 · 줍기 · 교환 · 던지기', fn: footMenu }] : []),
        ...(bag.length > 1 ? [{ label: '↕ 가방 정리 (종류별로 정렬)', fn: () => { sortBag(); openBag(); } }] : []),
        ...(p.held ? [{ label: `지닌 물건을 가방에 넣는다 (${esc(ITEMS[p.held].n)})`, disabled: bag.length >= bagMax(), fn: () => {
        run.bag.push({ id: p.held, n: 1 }); log(`${jo(ITEMS[p.held].n, '을')} 가방에 넣었다.`, now()); p.held = null; formCheck(p); openBag();
      } }] : []), ...bag.map((b, i) => ({
        label: `${ITEMS[b.id].icon} ${esc(ITEMS[b.id].n)}${b.n > 1 ? ' ×' + b.n : ''}`, sub: esc(ITEMS[b.id].d),
        fn: () => itemMenu(i),
      }))],
    });
  }
  const ITEM_ORDER = Object.keys(ITEMS);
  function sortBag() {
    run.bag.sort((a, b) => ITEM_ORDER.indexOf(a.id) - ITEM_ORDER.indexOf(b.id));
    log('가방을 정리했다.', now());
  }
  // 발밑의 아이템 (돈·의뢰품·상점 물건 제외)
  function footItem() {
    const p = P(), it = itemAt(p.x, p.y);
    return it && !it.money && it.id !== 'quest' && !it.price && ITEMS[it.id] ? it : null;
  }
  function footMenu() {
    const it = footItem(); if (!it) return openBag();
    const I = ITEMS[it.id];
    UI.open({
      title: `👣 발밑: ${I.icon} ${esc(I.n)}${it.n > 1 ? ' ×' + it.n : ''}`, html: `<p>${esc(I.d)}</p>`,
      choices: [
        { label: '줍는다', disabled: run.bag.length >= bagMax() && !(I.stack && run.bag.some(b => b.id === it.id)), fn: () => act({ t: 'foot', mode: 'pick' }) },
        { label: '가방의 아이템과 바꾼다', disabled: !run.bag.length, fn: () => UI.open({
          title: `무엇과 바꿀까? (${esc(I.n)})`, wide: true,
          choices: run.bag.map((b, i) => ({ label: `${ITEMS[b.id].icon} ${esc(ITEMS[b.id].n)}${b.n > 1 ? ' ×' + b.n : ''}`, fn: () => act({ t: 'foot', mode: 'swap', slot: i }) })),
          cancel: footMenu,
        }) },
        { label: '던진다', fn: () => act({ t: 'foot', mode: 'throw' }) },
        { label: '돌아간다', fn: openBag },
      ],
      cancel: openBag,
    });
  }
  function footAction(mode, slot) {
    const p = P(), it = footItem(); if (!it) return false;
    const I = ITEMS[it.id];
    if (mode === 'pick') {
      if (!addToBag(it.id, it.n)) { log('가방이 가득 찼다.', now()); return false; }
      D.items = D.items.filter(i => i !== it);
      Sound.play('pickup', T.base); log(`${jo(I.n, '을')} 주웠다.` + (it.n > 1 ? ` (${it.n}개)` : ''), T.base);
      return true;
    }
    if (mode === 'swap') {
      const b = run.bag[slot]; if (!b) return false;
      run.bag.splice(slot, 1);
      D.items = D.items.filter(i => i !== it);
      addToBag(it.id, it.n);
      D.items.push({ x: p.x, y: p.y, id: b.id, n: b.n }); D.ignore.add(idx(p.x, p.y));
      log(`${jo(ITEMS[b.id].n, '을')} 내려놓고 ${jo(I.n, '을')} 주웠다.`, T.base);
      return true;
    }
    if (mode === 'throw') {
      if (it.n > 1) it.n--; else D.items = D.items.filter(i => i !== it);
      throwItem(p, it.id, p.dir);
      return true;
    }
    return false;
  }

  function quickUse() {
    if (!D || busy()) return;
    const id = Game.save.settings.quickItem;
    if (!id || !ITEMS[id]) { log('가방에서 아이템을 고른 뒤 "빠른 사용으로 등록"을 누르세요.', now()); return; }
    const slot = run.bag.findIndex(b => b.id === id);
    if (slot < 0) { log(`가방에 ${jo(ITEMS[id].n, '이')} 없다.`, now()); return; }
    const it = ITEMS[id];
    if (it.throw || !it.use || it.use === 'none') { autoFace(P(), { r: 'p' }); act({ t: 'item', slot, mode: 'throw' }); }
    else act({ t: 'item', slot, mode: 'use' });
  }

  function itemMenu(i) {
    const b = run.bag[i], it = ITEMS[b.id];
    const ch = [];
    if (it.use && it.use !== 'none') ch.push({ label: '사용한다', fn: () => act({ t: 'item', slot: i, mode: 'use' }) });
    if (it.held) ch.push({ label: '지니게 한다', fn: () => {
      const p = P(), old = p.held;
      run.bag.splice(i, 1); p.held = b.id;
      if (old) run.bag.push({ id: old, n: 1 });
      log(`${jo(it.n, '을')} 지니게 했다.` + (old ? ` (${jo(ITEMS[old].n, '은')} 가방으로)` : ''), now());
      formCheck(p, now() + 200);   // 메가스톤·폼체인지 도구
    } });
    ch.push({ label: '던진다', fn: () => act({ t: 'item', slot: i, mode: 'throw' }) });
    const fav = Game.save.settings.quickItem === b.id;
    ch.push({ label: fav ? '⭐ 빠른 사용 해제' : `⭐ 빠른 사용으로 등록 (T 키 / 버튼으로 바로 ${it.throw || !it.use || it.use === 'none' ? '던지기' : '사용'})`, fn: () => {
      Game.setSetting('quickItem', fav ? null : b.id); quickCache = '';
      log(fav ? '빠른 사용을 해제했다.' : `${jo(it.n, '을')} 빠른 사용으로 등록했다.`, now()); openBag();
    } });
    ch.push({ label: '내려놓는다', fn: () => act({ t: 'item', slot: i, mode: 'drop' }) });
    ch.push({ label: '돌아간다', fn: openBag });
    UI.open({ title: `${it.icon} ${esc(it.n)}`, html: `<p>${esc(it.d)}</p>`, choices: ch, cancel: openBag });
  }

  // ───────────────────────── 자동 행동 (돌죽 스타일) ─────────────────────────
  function startAuto(kind, extra = {}) {
    if (!D || D.dead) return;
    if (kind !== 'fight' && hostilesVisible().length) { log('근처에 적이 있어서 할 수 없다!', now()); return; }
    if (kind === 'rest' && P().hp >= P().maxhp && !P().status) { log('휴식할 필요가 없다.', now()); return; }
    D.auto = { kind, hp: P().hp, n: 0, ...extra };
  }
  function stopAuto(msg) {
    if (!D || !D.auto) return;
    D.auto = null;
    if (msg) log(msg, now());
  }
  function isFrontier(x, y) {
    if (!D.explored[idx(x, y)] || !floorAt(x, y)) return false;
    for (const [dx, dy] of DIRS) if (inb(x + dx, y + dy) && !D.explored[idx(x + dx, y + dy)]) return true;
    return false;
  }
  function autoTick() {
    const a = D.auto, p = P();
    if (!a) return;
    if (p.hp < a.hp && a.kind !== 'fight') { stopAuto('공격을 받았다!'); return; }
    a.hp = p.hp;
    if (++a.n > 800) { stopAuto(); return; }
    if (a.kind === 'fight') { autoFight(); D.auto = null; return; }
    if (hostilesVisible().length) { stopAuto('적이 나타났다!'); return; }
    if (a.kind === 'rest') {
      if (p.hp >= p.maxhp && !p.status) { stopAuto('HP가 가득 찼다.'); return; }
      if (p.belly <= 0) { stopAuto(); return; }
      act({ t: 'wait' }); return;
    }
    let step = null;
    if (a.kind === 'travel') {
      if (p.x === a.x && p.y === a.y) { stopAuto(); return; }
      step = bfs(p.x, p.y, (x, y) => x === a.x && y === a.y, { known: true, blockMons: true, seenOnly: true, self: p, avoidTraps: true });
      if (!step) { stopAuto('그곳까지 갈 수 없다.'); return; }
    } else {
      step = bfs(p.x, p.y, (x, y) => {
        const it = itemAt(x, y);
        if (it && !it.price && D.explored[idx(x, y)] && !D.ignore.has(idx(x, y))) return true;
        return isFrontier(x, y);
      }, { known: true, blockMons: true, seenOnly: true, self: p, avoidTraps: true });
      if (!step) {
        const s = D.stairs;
        if (!D.stairsHidden && D.explored[idx(s.x, s.y)]) {
          if (p.x === s.x && p.y === s.y) { stopAuto(); D.prompts.push(Game.save.settings.autoDescend ? descend : stairsPrompt); return; }
          step = bfs(p.x, p.y, (x, y) => x === s.x && y === s.y, { known: true, blockMons: true, seenOnly: true, self: p, avoidTraps: true });
          if (!step) { stopAuto('계단까지 갈 수 없다.'); return; }
          if (!a.toStairs) { a.toStairs = true; log('탐색 완료. 계단으로 향한다.', now()); }
        } else { stopAuto('더 이상 탐색할 곳이 없다.'); return; }
      }
    }
    const r = act({ t: 'move', dir: dirIndex(step.fx - p.x, step.fy - p.y) });
    if (!r) stopAuto();
  }
  function autoFight() {
    const p = P();
    const foes = hostilesVisible();
    if (!foes.length) { log('주변에 적이 없다.', now()); return; }
    if (p.hp < p.maxhp * 0.3) { log('HP가 너무 낮다! 직접 조작하세요.', now()); return; }
    // 가장 가까운 적
    const path = bfs(p.x, p.y, (x, y) => foes.some(f => f.x === x && f.y === y), { blockMons: true, self: p, avoidTraps: true });
    const tgt = path ? foes.find(f => f.x === path.x && f.y === path.y) : foes[0];
    const dx = tgt.x - p.x, dy = tgt.y - p.y, dist = Math.max(Math.abs(dx), Math.abs(dy));
    const cands = [{ slot: -1, s: moveScore(p, tgt, NORMAL_ATTACK) }];
    p.moves.forEach((m, i) => { if (m.pp > 0) { const mv = DATA.moves[m.id]; cands.push({ slot: i, mv, s: moveScore(p, tgt, mv) * (mv.r === 'r' ? 1.1 : 1) }); } });
    const dir = dirIndex(dx, dy);
    if (dist === 1 && diagOK(p.x, p.y, Math.sign(dx), Math.sign(dy))) {
      const best = cands.filter(c => c.slot < 0 || c.mv.r !== 's').sort((a, b) => b.s - a.s)[0];
      p.dir = dir;
      act(best.slot < 0 ? { t: 'attack' } : { t: 'skill', slot: best.slot, autoFace: false });
      return;
    }
    const aligned = dx === 0 || dy === 0 || Math.abs(dx) === Math.abs(dy);
    if (aligned && dist <= PROJ_RANGE && lineClear(p, dir, dist)) {
      const best = cands.filter(c => c.slot >= 0 && c.mv.r === 'p').sort((a, b) => b.s - a.s)[0];
      if (best && best.s > 0) { p.dir = dir; act({ t: 'skill', slot: best.slot, autoFace: false }); return; }
    }
    if (dist <= 3 && los(p.x, p.y, tgt.x, tgt.y)) {
      const best = cands.filter(c => c.slot >= 0 && c.mv.r === 'r').sort((a, b) => b.s - a.s)[0];
      if (best && best.s > cands[0].s) { act({ t: 'skill', slot: best.slot, autoFace: false }); return; }
    }
    if (path) act({ t: 'move', dir: dirIndex(path.fx - p.x, path.fy - p.y) });
  }

  // ───────────────────────── 렌더링 ─────────────────────────
  function buildMapCanvas() {
    const floor = D;
    // 타일셋 이미지(기본·변형)가 아직 로딩 중이면 있는 것으로 먼저 그리고, 하나씩 로딩될 때마다 다시 그린다
    const rebuild = () => { if (D === floor) D.mapCanvas = Tiles.build(D, rebuild); };
    D.mapCanvas = Tiles.build(D, rebuild);
  }

  function vpos(c, t) {
    const tw = c.tween;
    if (tw && t < tw.start + tw.dur) {
      const k = clamp((t - tw.start) / tw.dur, 0, 1);
      return { x: tw.fx + (c.x - tw.fx) * k, y: tw.fy + (c.y - tw.fy) * k, walking: t >= tw.start };
    }
    return { x: c.x, y: c.y, walking: false };
  }

  function drawCreature(c, t, ox, oy) {
    const v = vpos(c, t);
    let cx = v.x * TILE + TILE / 2 - ox, cy = v.y * TILE + TILE / 2 - oy;
    let anim = 'Idle', at = t + c.id * 5000, loop = true;
    if (c.act && t >= c.act.start && t < c.act.start + c.act.dur) {
      anim = c.act.name; at = (t - c.act.start) * 1.3 / spd(); loop = false;
      if (anim === 'Attack') { const k = Math.sin(Math.PI * (t - c.act.start) / c.act.dur) * 7; cx += DIRS[c.dir][0] * k; cy += DIRS[c.dir][1] * k; }
    } else if (c.hurtAt && t >= c.hurtAt && t < c.hurtAt + 260) { anim = 'Hurt'; at = t - c.hurtAt; loop = false; }
    else if (v.walking) { anim = 'Walk'; }
    else if (c.status === 'slp') { anim = 'Sleep'; }
    let alpha = 1;
    if (c.dead) alpha = clamp(1 - (t - c.deadAt) / 350, 0, 1);
    const flash = c.hurtAt && t >= c.hurtAt && t < c.hurtAt + 120;
    Sprites.draw(ctx, looksOf(c), anim, c.dir, at, loop, cx, cy, alpha, flash, c.shiny);
    if (c.shiny && !c.dead && Math.floor(t / 180 + c.id * 10) % 6 === 0) { ctx.fillStyle = '#fff6a0'; ctx.font = '9px sans-serif'; ctx.textAlign = 'center'; ctx.fillText('✦', cx - 10, cy - 12); }
    if (!c.player && !c.dead && c.hp < c.maxhp) {
      ctx.fillStyle = '#000a'; ctx.fillRect(cx - 10, cy + 10, 20, 3);
      ctx.fillStyle = c.hp / c.maxhp > 0.5 ? '#5f5' : c.hp / c.maxhp > 0.2 ? '#fd4' : '#f55';
      ctx.fillRect(cx - 10, cy + 10, 20 * c.hp / c.maxhp, 3);
    }
    if (c.npc && c.mission) { ctx.fillStyle = '#ffe066'; ctx.font = 'bold 10px sans-serif'; ctx.textAlign = 'center'; ctx.fillText('SOS', cx, cy - 18); }
    if (c.shopkeeper) { ctx.fillStyle = '#ffe066'; ctx.font = 'bold 9px sans-serif'; ctx.textAlign = 'center'; ctx.fillText('상점', cx, cy - 20); }
    if (c.boss && !c.dead) { ctx.fillStyle = '#ff5a5a'; ctx.font = 'bold 10px sans-serif'; ctx.textAlign = 'center'; ctx.fillText('BOSS', cx, cy - 22); }
    if (c.outlaw) { ctx.fillStyle = '#ff5a5a'; ctx.font = 'bold 10px sans-serif'; ctx.textAlign = 'center'; ctx.fillText('WANTED', cx, cy - 20); }
    if (c.status && !c.dead) {
      const ic = { psn: '☠', brn: '🔥', par: '⚡', slp: 'z', frz: '❄', cnf: '?' }[c.status];
      ctx.font = '9px sans-serif'; ctx.textAlign = 'center'; ctx.fillStyle = '#fff'; ctx.fillText(ic, cx + 9, cy - 10);
    }
  }

  // 대기 중인 프롬프트 / 자동 행동 (렌더와 분리해서 탭이 가려져도 진행)
  function logicTick() {
    if (!D || busy() || UI.isOpen()) return;
    if (D.prompts.length) D.prompts.shift()();
    else if (D.auto) autoTick();
    else if (pendingKey) { const k = pendingKey; pendingKey = null; handleKey(k); }
  }

  function render() {
    rafId = requestAnimationFrame(render);
    if (!D) return;
    const t = now();
    const wrap = canvas.parentElement;
    const scale = wrap.clientWidth >= 1000 && wrap.clientHeight >= 620 ? 3 : 2;
    const W = Math.ceil(wrap.clientWidth / scale), H = Math.ceil(wrap.clientHeight / scale);
    if (canvas.width !== W || canvas.height !== H) { canvas.width = W; canvas.height = H; ctx.imageSmoothingEnabled = false; }
    const p = P(), pv = vpos(p, t);
    const ox = Math.round(pv.x * TILE + TILE / 2 - W / 2), oy = Math.round(pv.y * TILE + TILE / 2 - H / 2);
    ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H);
    ctx.drawImage(D.mapCanvas, -ox, -oy);
    // 안개
    const x0 = Math.max(0, Math.floor(ox / TILE)), y0 = Math.max(0, Math.floor(oy / TILE));
    const x1 = Math.min(D.w - 1, Math.ceil((ox + W) / TILE)), y1 = Math.min(D.h - 1, Math.ceil((oy + H) / TILE));
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const i = idx(x, y);
      if (!D.explored[i]) { ctx.fillStyle = '#000'; ctx.fillRect(x * TILE - ox, y * TILE - oy, TILE, TILE); }
      else if (!D.visible[i]) { ctx.fillStyle = 'rgba(0,0,0,0.45)'; ctx.fillRect(x * TILE - ox, y * TILE - oy, TILE, TILE); }
    }
    // 바깥 영역
    if (ox < 0) { ctx.fillStyle = '#000'; ctx.fillRect(0, 0, -ox, H); }
    if (oy < 0) { ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, -oy); }
    // 계단
    const s = D.stairs;
    if (!D.stairsHidden && D.explored[idx(s.x, s.y)]) {
      const sx = s.x * TILE - ox, sy = s.y * TILE - oy;
      ctx.fillStyle = '#1b1b2a'; ctx.fillRect(sx + 2, sy + 2, TILE - 4, TILE - 4);
      ctx.fillStyle = '#e8e2c8';
      for (let k = 0; k < 4; k++) ctx.fillRect(sx + 4 + k * 2, sy + 5 + k * 4, TILE - 8 - k * 4, 2);
    }
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    // 상점 카펫
    if (D.shop) for (const i of D.shop.tiles) {
      if (!D.explored[i]) continue;
      const x = (i % D.w) * TILE - ox, y = ((i / D.w) | 0) * TILE - oy;
      ctx.fillStyle = 'rgba(150,40,60,0.55)'; ctx.fillRect(x + 1, y + 1, TILE - 2, TILE - 2);
      ctx.strokeStyle = 'rgba(255,215,120,0.6)'; ctx.strokeRect(x + 3.5, y + 3.5, TILE - 7, TILE - 7);
    }
    // 함정
    for (const tr of D.traps) {
      if (!tr.seen || !D.explored[idx(tr.x, tr.y)]) continue;
      const x = tr.x * TILE - ox, y = tr.y * TILE - oy;
      ctx.fillStyle = 'rgba(20,10,30,0.7)'; ctx.fillRect(x + 3, y + 3, TILE - 6, TILE - 6);
      ctx.font = '11px sans-serif'; ctx.fillStyle = '#fff'; ctx.fillText(TRAPS[tr.kind].icon, x + TILE / 2, y + TILE / 2 + 1);
    }
    // 아이템
    for (const it of D.items) {
      if (!D.explored[idx(it.x, it.y)]) continue;
      const cx = it.x * TILE + TILE / 2 - ox, cy = it.y * TILE + TILE / 2 - oy;
      if (it.money) {
        ctx.fillStyle = '#f5c542'; ctx.beginPath(); ctx.arc(cx, cy, 5, 0, 7); ctx.fill();
        ctx.fillStyle = '#b8860b'; ctx.beginPath(); ctx.arc(cx + 3, cy + 3, 4, 0, 7); ctx.fill();
      } else { ctx.font = '13px sans-serif'; ctx.fillText(ITEMS[it.id].icon, cx, cy + 1); }
      if (it.price) {
        ctx.font = 'bold 7px sans-serif'; ctx.fillStyle = '#000'; ctx.fillText('₽' + it.price, cx + 1, cy + 10);
        ctx.fillStyle = '#ffe066'; ctx.fillText('₽' + it.price, cx, cy + 9);
      }
    }
    // 포켓몬
    const list = [...D.mons.filter(m => seen(m) || (m.tween && t < m.tween.start + m.tween.dur && D.visible[idx(m.tween.fx, m.tween.fy)])), ...D.corpses, p];
    list.sort((a, b) => vpos(a, t).y - vpos(b, t).y);
    for (const c of list) if (c.hp > 0 || c.dead || c.player) drawCreature(c, t, ox, oy);
    D.corpses = D.corpses.filter(c => t < c.deadAt + 400);
    // 이펙트
    for (const f of D.fx) {
      if (t < f.at) continue;
      const k = (t - f.at) / f.dur; if (k > 1) continue;
      if (f.kind === 'proj') {
        const x = (f.x0 + (f.x1 - f.x0) * k) * TILE + TILE / 2 - ox, y = (f.y0 + (f.y1 - f.y0) * k) * TILE + TILE / 2 - oy;
        if (f.icon) { ctx.font = '12px sans-serif'; ctx.fillText(f.icon, x, y); }
        else { ctx.fillStyle = f.color; ctx.beginPath(); ctx.arc(x, y - 4, 4, 0, 7); ctx.fill(); ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(x, y - 4, 2, 0, 7); ctx.fill(); }
      } else if (f.kind === 'ring') {
        ctx.strokeStyle = f.color; ctx.globalAlpha = 1 - k; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.arc(f.x * TILE + TILE / 2 - ox, f.y * TILE + TILE / 2 - oy, 6 + k * 60, 0, 7); ctx.stroke(); ctx.globalAlpha = 1;
      }
    }
    D.fx = D.fx.filter(f => t < f.at + f.dur);
    drawWeather(t, W, H);
    if (D.boss && !D.boss.dead && D.boss.metPlayer) {
      const b = D.boss, bw = Math.min(200, W - 40), bx = (W - bw) / 2, by = 8;
      ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(bx - 4, by - 2, bw + 8, 18);
      ctx.fillStyle = '#511'; ctx.fillRect(bx, by + 10, bw, 4);
      ctx.fillStyle = '#ff5a5a'; ctx.fillRect(bx, by + 10, bw * b.hp / b.maxhp, 4);
      ctx.fillStyle = '#fff'; ctx.font = 'bold 9px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
      ctx.fillText(`BOSS ${spName(looksOf(b))} Lv${b.lv}`, W / 2, by + 8);
    }
    // 데미지 숫자
    ctx.font = 'bold 11px "Galmuri11", sans-serif';
    for (const pp of D.popups) {
      if (t < pp.at) continue;
      const k = (t - pp.at) / 750;
      const x = pp.x * TILE + TILE / 2 - ox, y = pp.y * TILE - oy - k * 14;
      ctx.globalAlpha = clamp(1.4 - k * 1.4, 0, 1);
      ctx.font = pp.size === 'big' ? 'bold 15px "Galmuri11", sans-serif' : pp.size === 'small' ? '9px "Galmuri11", sans-serif' : 'bold 11px "Galmuri11", sans-serif';
      ctx.fillStyle = '#000'; ctx.fillText(pp.text, x + 1, y + 1);
      ctx.fillStyle = pp.color; ctx.fillText(pp.text, x, y);
      ctx.globalAlpha = 1;
    }
    D.popups = D.popups.filter(pp => t < pp.at + 750);
    drawMini();
    updateHud(t);
  }

  function drawWeather(t, W, H) {
    const w = weatherNow(); if (!w) return;
    ctx.save();
    if (w === 'sun') { ctx.fillStyle = 'rgba(255,190,70,0.10)'; ctx.fillRect(0, 0, W, H); }
    if (w === 'fog') { ctx.fillStyle = 'rgba(200,205,215,0.22)'; ctx.fillRect(0, 0, W, H); }
    if (w === 'sand') { ctx.fillStyle = 'rgba(190,150,80,0.16)'; ctx.fillRect(0, 0, W, H); }
    if (w === 'snow') { ctx.fillStyle = 'rgba(220,235,255,0.08)'; ctx.fillRect(0, 0, W, H); }
    const n = { rain: 70, snow: 60, sand: 50, fog: 0, sun: 0 }[w];
    for (let i = 0; i < n; i++) {
      const s1 = (i * 7919) % 1000 / 1000, s2 = (i * 104729) % 1000 / 1000;
      if (w === 'rain') {
        const x = (s1 * W + t * 0.12) % W, y = (s2 * H + t * 0.45) % H;
        ctx.strokeStyle = 'rgba(170,200,255,0.55)'; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - 3, y + 9); ctx.stroke();
      } else if (w === 'snow') {
        const x = (s1 * W + Math.sin(t / 900 + i) * 8 + t * 0.01) % W, y = (s2 * H + t * 0.03) % H;
        ctx.fillStyle = 'rgba(255,255,255,0.85)'; ctx.fillRect(x, y, 2, 2);
      } else if (w === 'sand') {
        const x = (s1 * W + t * 0.2) % W, y = (s2 * H + Math.sin(t / 500 + i) * 5 + H) % H;
        ctx.fillStyle = 'rgba(220,180,110,0.6)'; ctx.fillRect(x, y, 2, 1);
      }
    }
    ctx.restore();
  }

  // 큰 지도: N 키 / 미니맵 클릭. 큰 지도에서 가 본 곳을 누르면 그곳으로 이동
  let bigMap = false;
  function toggleMap(on = !bigMap) {
    if (!D) return;
    bigMap = on;
    if (on) stopAuto();
    mini.classList.toggle('big', on);
    document.getElementById('map-legend').classList.toggle('on', on);
  }
  function onMiniClick(e) {
    if (!D) return;
    if (!bigMap) { toggleMap(true); return; }
    const r = mini.getBoundingClientRect();
    const x = Math.floor((e.clientX - r.left) / r.width * D.w), y = Math.floor((e.clientY - r.top) / r.height * D.h);
    toggleMap(false);
    const p = P();
    if (inb(x, y) && D.explored[idx(x, y)] && floorAt(x, y) && !(x === p.x && y === p.y) && !busy()) startAuto('travel', { x, y });
  }
  function drawMini() {
    const S = bigMap ? 9 : 3;
    if (mini.width !== D.w * S) { mini.width = D.w * S; mini.height = D.h * S; }
    mctx.clearRect(0, 0, mini.width, mini.height);
    if (bigMap) { mctx.fillStyle = '#081026'; mctx.fillRect(0, 0, mini.width, mini.height); }
    mctx.fillStyle = bigMap ? 'rgb(84,120,190)' : 'rgba(120,170,255,0.55)';
    for (let y = 0; y < D.h; y++) for (let x = 0; x < D.w; x++) if (D.explored[idx(x, y)] && floorAt(x, y)) mctx.fillRect(x * S, y * S, S, S);
    const s = D.stairs;
    if (!D.stairsHidden && D.explored[idx(s.x, s.y)]) { mctx.fillStyle = '#fff'; mctx.fillRect(s.x * S - 1, s.y * S - 1, S + 2, S + 2); mctx.fillStyle = '#39f'; mctx.fillRect(s.x * S, s.y * S, S, S); }
    const pa = { ...abilityOf(P()) };
    if (heldOf(P()).xray || D.radar) { pa.frisk = true; pa.forewarn = true; }
    for (const it of D.items) if (D.explored[idx(it.x, it.y)] || pa.frisk) { mctx.fillStyle = it.id === 'quest' ? '#f0f' : it.money ? '#fc3' : '#3fc'; mctx.fillRect(it.x * S, it.y * S, S, S); }
    for (const tr of D.traps) if (tr.seen) { mctx.fillStyle = '#f80'; mctx.fillRect(tr.x * S, tr.y * S, S, S); }
    for (const m of D.mons) if (seen(m) || (pa.forewarn && !m.npc)) { mctx.fillStyle = m.npc ? '#ff0' : '#f44'; mctx.fillRect(m.x * S - 0.5, m.y * S - 0.5, S + 1, S + 1); }
    const p = P(); mctx.fillStyle = '#ff0'; mctx.fillRect(p.x * S - 1, p.y * S - 1, S + 2, S + 2);
    if (bigMap) { mctx.strokeStyle = '#000'; mctx.lineWidth = 2; mctx.strokeRect(p.x * S - 1, p.y * S - 1, S + 2, S + 2); }
  }

  function updateHud(t) {
    const p = P(), dg = D.dg;
    const hud = `${p.held}|${weatherNow()}|${dg.n}|${run.floor}|${p.lv}|${p.hp}|${p.maxhp}|${Math.ceil(p.belly)}|${Game.save.money}|${p.status}|${p.exp}|${JSON.stringify(p.stages)}`;
    if (hud !== hudCache) {
      hudCache = hud;
      const hpPct = p.hp / p.maxhp * 100;
      const need = expFor(p.lv + 1) - expFor(p.lv), have = p.exp - expFor(p.lv);
      const stg = Object.entries(p.stages).filter(([, v]) => v).map(([k, v]) => `<span class="${v > 0 ? 'up' : 'down'}">${STAT_NAMES[k]}${v > 0 ? '+' : ''}${v}</span>`).join(' ');
      document.getElementById('hud').innerHTML = `
        <span class="floor">${esc(dg.n)} <b>${run.floor}F</b>${weatherNow() ? ` <span class="wx" title="${esc(WEATHERS[weatherNow()].d)}">${WEATHERS[weatherNow()].icon} ${WEATHERS[weatherNow()].n}</span>` : ''}${dg.mode === 'rogue' ? ' <i class="rogue">로그라이크</i>' : ''}</span>
        <span>Lv <b>${p.lv}</b></span>
        <span class="hpwrap">HP <b>${p.hp}</b>/${p.maxhp}<span class="bar"><i style="width:${hpPct}%;background:${hpPct > 50 ? '#4de36b' : hpPct > 20 ? '#f5d142' : '#f55'}"></i></span></span>
        <span>배 <b class="${p.belly <= 20 ? 'warn' : ''}">${Math.ceil(p.belly)}</b>/100</span>
        <span class="exp">EXP<span class="bar small"><i style="width:${p.lv >= MAX_LEVEL ? 100 : clamp(have / need * 100, 0, 100)}%;background:#6cf"></i></span></span>
        <span>₽ <b>${Game.save.money}</b></span>
        ${p.held ? `<span class="held" title="${esc(ITEMS[p.held].d)}">${ITEMS[p.held].icon} ${esc(ITEMS[p.held].n)}</span>` : ''}
        ${p.status ? `<span class="st">${STATUS_NAMES[p.status]}</span>` : ''} ${stg}`;
    }
    const mv = p.moves.map(m => m.id + ':' + m.pp).join(',');
    if (mv !== moveCache) {
      moveCache = mv;
      document.getElementById('moves').innerHTML = p.moves.map((m, i) => {
        const d = DATA.moves[m.id];
        return `<button class="mv${m.pp <= 0 ? ' empty' : ''}" data-slot="${i}" style="--tc:${TYPE_COLORS[d.t - 1]}" title="${esc(d.n)} (${typeName(d.t)} · ${['', '변화', '물리', '특수'][d.c]}${d.p ? ' · 위력 ' + d.p : ''})">
          <span class="k">${i + 1}</span><span class="n">${esc(d.n)}</span><span class="p">${m.pp}/${m.max}</span><span class="info" data-move="${m.id}" data-pp="${m.pp}" data-max="${m.max}" title="기술 정보">?</span></button>`;
      }).join('');
    }
    const qid = Game.save.settings.quickItem, qn = qid ? run.bag.filter(b => b.id === qid).reduce((s, b) => s + b.n, 0) : 0;
    const qk = (qid || '') + ':' + qn;
    if (qk !== quickCache) {
      quickCache = qk;
      const qb = document.querySelector('#actions [data-k=quick]');
      if (qb) { qb.innerHTML = qid && ITEMS[qid] ? `${ITEMS[qid].icon}×${qn} <kbd>T</kbd>` : '⭐ 빠른사용 <kbd>T</kbd>'; qb.title = qid && ITEMS[qid] ? `${ITEMS[qid].n} 바로 ${ITEMS[qid].throw || !ITEMS[qid].use || ITEMS[qid].use === 'none' ? '던지기' : '사용'} (T)` : '가방에서 아이템을 골라 "빠른 사용"으로 등록하세요'; qb.classList.toggle('empty', !!qid && !qn); }
    }
    const shown = LOG.filter(l => l.at <= t).slice(-5);
    const lg = shown.map(l => l.text + (l.cls || '')).join('\n') + shown.length;
    if (lg !== logCache) {
      logCache = lg;
      const el = document.getElementById('log');
      el.innerHTML = shown.map(l => `<div${l.cls ? ` class="${l.cls}"` : ''}>${esc(l.text)}</div>`).join('');
    }
    updateFace(t);
    const wl = run.turnsOnFloor >= WIND.warn[0] ? WIND.warn.filter(w => run.turnsOnFloor >= w).length : 0;
    const wind = document.getElementById('wind-ind');
    const wtxt = wl ? ['', '🌬 바람', '🌬🌬 강한 바람', '🌬🌬🌬 거센 바람'][wl] : '';
    if (wind.textContent !== wtxt) { wind.textContent = wtxt; wind.className = 'wl' + wl; }
    document.getElementById('auto-ind').textContent = D.auto ? ({ explore: '자동 탐색 중…', travel: '이동 중…', rest: '휴식 중…', fight: '' }[D.auto.kind]) : '';
  }

  let bannerTimer = 0;
  function showFloorBanner(text) {
    const b = document.getElementById('floor-banner');
    b.textContent = text; b.classList.add('show');
    clearTimeout(bannerTimer);
    bannerTimer = setTimeout(() => b.classList.remove('show'), 1100);
    T.busyUntil = now() + 500;
  }

  // ───────────────────────── 입력 ─────────────────────────
  const KEYDIR = {
    ArrowUp: 4, ArrowDown: 0, ArrowLeft: 6, ArrowRight: 2, KeyW: 4, KeyS: 0, KeyA: 6, KeyD: 2, KeyQ: 5, KeyE: 3, KeyZ: 7, KeyC: 1,
    Numpad8: 4, Numpad2: 0, Numpad4: 6, Numpad6: 2, Numpad7: 5, Numpad9: 3, Numpad1: 7, Numpad3: 1, Home: 5, PageUp: 3, End: 7, PageDown: 1,
  };
  const heldArrows = new Set();
  function onKeyDown(e) {
    if (!D) return;
    if (UI.key(e)) return;
    // Ctrl·Alt 조합은 브라우저 단축키로 둔다 (Ctrl+W 등)
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (bigMap) { toggleMap(false); e.preventDefault(); return; }
    if (D.auto) { stopAuto(); e.preventDefault(); return; }
    if (e.code.startsWith('Arrow')) heldArrows.add(e.code);
    const k = { code: e.code, shift: e.shiftKey, key: e.key };
    if (busy()) { pendingKey = k; e.preventDefault(); return; }
    if (handleKey(k)) e.preventDefault();
  }
  function onKeyUp(e) { heldArrows.delete(e.code); }
  function handleKey(k) {
    if (!D || D.dead) return false;
    let dir = KEYDIR[k.code];
    // 방향키 두 개 동시 → 대각선
    if (k.code.startsWith('Arrow') && heldArrows.size === 2) {
      const a = [...heldArrows]; let dx = 0, dy = 0;
      for (const c of a) { const d = DIRS[KEYDIR[c]]; dx += d[0]; dy += d[1]; }
      if (dx && dy) dir = dirIndex(dx, dy);
    }
    if (dir != null) {
      // Shift+방향: 제자리에서 방향만 바꾼다
      if (k.shift) act({ t: 'face', dir });
      else act({ t: 'move', dir });
      return true;
    }
    switch (k.code) {
      case 'Space': case 'Enter': case 'NumpadEnter': act({ t: 'attack' }); return true;
      case 'Digit1': case 'Digit2': case 'Digit3': case 'Digit4': {
        const slot = +k.code.slice(5) - 1;
        if (k.shift) { const m = P().moves[slot]; if (m) showMoveInfo(m.id, m.pp, m.max); }
        else act({ t: 'skill', slot });
        return true;
      }
      case 'KeyO': startAuto('explore'); return true;
      case 'Tab': case 'KeyF': startAuto('fight'); return true;
      case 'KeyR': startAuto('rest'); return true;
      case 'KeyX': case 'Numpad5': case 'Period':
        if (k.key === '>') { tryStairs(); return true; }
        act({ t: 'wait' }); return true;
      case 'KeyG': tryStairs(); return true;
      case 'KeyI': case 'KeyB': openBag(); return true;
      case 'KeyM': case 'Escape': Game.dungeonMenu(); return true;
      case 'KeyH': case 'Slash': showHelp(); return true;
      case 'KeyJ': case 'KeyL': Game.showMissions(); return true;
      case 'KeyN': toggleMap(true); return true;
      case 'KeyK': toggleLook(); return true;
      case 'KeyT': quickUse(); return true;
      case 'KeyP': showStatus(); return true;
      case 'Semicolon': case 'KeyU': showLog(); return true;
    }
    return false;
  }
  function tryStairs() {
    const p = P();
    if (D.stairsHidden) log('보스를 쓰러뜨려야 계단이 나타난다!', now());
    else if (D.stairs.x === p.x && D.stairs.y === p.y) stairsPrompt();
    else if (D.explored[idx(D.stairs.x, D.stairs.y)]) startAuto('travel', { x: D.stairs.x, y: D.stairs.y });
    else log('아직 계단을 찾지 못했다.', now());
  }
  function onClick(e) {
    if (!D || UI.isOpen() || D.dead) return;
    if (D.lookNext) { D.lookNext = false; updateLookBtn(); lookAt(e); return; }
    if (D.auto) { stopAuto(); return; }
    const rect = canvas.getBoundingClientRect();
    const sx = (e.clientX - rect.left) * canvas.width / rect.width, sy = (e.clientY - rect.top) * canvas.height / rect.height;
    const t = now(), p = P(), pv = vpos(p, t);
    const ox = Math.round(pv.x * TILE + TILE / 2 - canvas.width / 2), oy = Math.round(pv.y * TILE + TILE / 2 - canvas.height / 2);
    const tx = Math.floor((sx + ox) / TILE), ty = Math.floor((sy + oy) / TILE);
    if (!inb(tx, ty)) return;
    const dx = tx - p.x, dy = ty - p.y;
    if (dx === 0 && dy === 0) { if (!D.stairsHidden && D.stairs.x === p.x && D.stairs.y === p.y) stairsPrompt(); else act({ t: 'wait' }); return; }
    if (Math.max(Math.abs(dx), Math.abs(dy)) === 1) { act({ t: 'move', dir: dirIndex(dx, dy) }); return; }
    if (!D.explored[idx(tx, ty)] || !floorAt(tx, ty)) return;
    startAuto('travel', { x: tx, y: ty });
  }
  // 화면 좌표 → 칸
  function tileFromEvent(e) {
    const rect = canvas.getBoundingClientRect();
    const sx = (e.clientX - rect.left) * canvas.width / rect.width, sy = (e.clientY - rect.top) * canvas.height / rect.height;
    const p = P(), pv = vpos(p, now());
    const ox = Math.round(pv.x * TILE + TILE / 2 - canvas.width / 2), oy = Math.round(pv.y * TILE + TILE / 2 - canvas.height / 2);
    return { x: Math.floor((sx + ox) / TILE), y: Math.floor((sy + oy) / TILE) };
  }
  function toggleLook() {
    if (!D) return;
    D.lookNext = !D.lookNext; updateLookBtn();
    if (D.lookNext) log('조사할 칸을 누르세요.', now());
  }
  function updateLookBtn() { document.querySelector('#actions [data-k=look]')?.classList.toggle('on', !!(D && D.lookNext)); }
  function lookAt(e) {
    const { x, y } = tileFromEvent(e);
    if (!inb(x, y) || !D.explored[idx(x, y)]) { UI.alert('조사', '<p>아직 가 보지 않은 곳이라 알 수 없다.</p>'); return; }
    const vis = D.visible[idx(x, y)], rows = [];
    const c = vis ? creatureAt(x, y) : null;
    if (c) rows.push(creatureInfo(c));
    const it = itemAt(x, y);
    if (it && (vis || D.radar)) rows.push(it.money ? `<p>💰 ${it.money} 포켓</p>` : it.id === 'quest' ? '<p>📦 의뢰품</p>' : `<p>${ITEMS[it.id].icon} <b>${esc(ITEMS[it.id].n)}</b>${it.n > 1 ? ' ×' + it.n : ''}${it.price ? ` <span class="dim">(상품 ₽${it.price})</span>` : ''}<br><span class="dim">${esc(ITEMS[it.id].d)}</span></p>`);
    const tr = trapAt(x, y);
    if (tr && tr.seen) rows.push(`<p>${TRAPS[tr.kind].icon} <b>${esc(TRAPS[tr.kind].n)}</b><br><span class="dim">${esc(TRAPS[tr.kind].d)}</span></p>`);
    if (!D.stairsHidden && D.stairs.x === x && D.stairs.y === y) rows.push('<p>🪜 다음 층으로 가는 계단</p>');
    if (!floorAt(x, y)) rows.push('<p>벽이다.</p>');
    UI.alert('🔍 조사', rows.join('') || `<p>아무것도 없다.${vis ? '' : ' <span class="dim">(지금은 보이지 않는 곳)</span>'}</p>`);
  }
  const stageText = c => Object.entries(c.stages).filter(([, v]) => v).map(([k, v]) => `${STAT_NAMES[k] || k} ${v > 0 ? '+' : ''}${v}`).join(', ');
  function creatureInfo(c) {
    const st = stageText(c);
    return `<div class="row">${portraitImg(looksOf(c), 'portrait sm', 'Normal', c.shiny)}<div class="grow"><b>${esc(nm(c))}</b> Lv${c.lv} ${typeBadges(c.types)}
      <div>HP ${Math.max(0, c.hp)}/${c.maxhp}${c.status ? ` · <span class="warn">${STATUS_NAMES[c.status]}</span>` : ''}${c.boss ? ' · 👑 보스' : ''}</div>
      <div class="dim">특성 ${esc(abilityName(c.ability))}${c.item ? ` · 가진 아이템 ${ITEMS[c.item].icon}${esc(ITEMS[c.item].n)}` : ''}${c.held ? ` · 지닌 물건 ${esc(ITEMS[c.held].n)}` : ''}${st ? ` · 능력 변화 ${esc(st)}` : ''}</div></div></div>`;
  }
  // ── 2. 메시지 기록 / 내 상태
  function showLog() {
    if (!D) return;
    const t = now(), rows = LOG.filter(l => l.at <= t).slice(-150);
    UI.open({
      title: '💬 메시지 기록', wide: true,
      html: `<div class="log-history">${rows.map(l => `<div${l.cls ? ` class="${l.cls}"` : ''}>${esc(l.text)}</div>`).join('') || '<p class="dim">아직 메시지가 없다.</p>'}</div>`,
      choices: [{ label: '닫기', fn: () => {} }],
      onOpen: box => { const h = box.querySelector('.log-history'); if (h) h.scrollTop = h.scrollHeight; },
    });
  }
  function showStatus() {
    if (!D) return;
    const p = P(), st = stageText(p), need = expFor(p.lv + 1) - expFor(p.lv), have = p.exp - expFor(p.lv);
    const row = (k, a, b) => `<tr><td>${k}</td><td><b>${a}</b></td><td class="dim">${b || ''}</td></tr>`;
    UI.open({
      title: '📊 내 상태', wide: true,
      html: `<div class="row">${portraitImg(looksOf(p), 'portrait', 'Normal', p.shiny)}<div class="grow"><b>${esc(spName(looksOf(p)))}</b> Lv${p.lv} ${typeBadges(p.types)}
          <div>HP ${p.hp}/${p.maxhp} · 배 ${Math.floor(p.belly)}/100${p.status ? ` · <span class="warn">${STATUS_NAMES[p.status]}</span>` : ''}</div>
          <div class="dim">EXP ${p.lv >= MAX_LEVEL ? '최대' : `${have}/${need}`} · 특성 ${esc(abilityName(p.ability))} · 지닌 물건 ${p.held ? `${ITEMS[p.held].icon}${esc(ITEMS[p.held].n)}` : '없음'}</div></div></div>
        <table class="md-tbl">${row('공격', p.atk, p.stages[2] ? `(${p.stages[2] > 0 ? '+' : ''}${p.stages[2]}단계)` : '')}${row('방어', p.def, p.stages[3] ? `(${p.stages[3] > 0 ? '+' : ''}${p.stages[3]}단계)` : '')}
          ${row('특수공격', p.spa, p.stages[4] ? `(${p.stages[4] > 0 ? '+' : ''}${p.stages[4]}단계)` : '')}${row('특수방어', p.spd, p.stages[5] ? `(${p.stages[5] > 0 ? '+' : ''}${p.stages[5]}단계)` : '')}
          ${row('스피드', p.spe, p.stages[6] ? `(${p.stages[6] > 0 ? '+' : ''}${p.stages[6]}단계)` : '')}</table>
        ${st ? `<p>능력 변화: ${esc(st)}</p>` : ''}
        <div class="cc-moves">${p.moves.map(m => `<div class="move-row">${moveLine(m.id, m.pp, m.max)}</div>`).join('')}</div>`,
      choices: [{ label: '닫기', fn: () => {} }],
    });
  }

  function showHelp() {
    UI.alert('조작법', `<table class="help">
      <tr><td>이동</td><td>방향키(두 개 동시에 누르면 대각선) / 숫자패드 / WASD + QEZC / 마우스 클릭</td></tr>
      <tr><td>휴대폰</td><td>오른쪽 아래 방향 버튼: 누르고 있으면 계속 걷는다 (누른 채 옆 버튼으로 밀면 방향 전환). 가운데 ↻를 누른 뒤 방향을 누르면 제자리에서 방향만 바꾼다.
        화면의 가 본 곳을 누르면 그곳까지 이동. 창은 ✕나 바깥을 눌러 닫는다.</td></tr>
      <tr><td>방향만 바꾸기</td><td>Shift + 방향 (방향키 / 숫자패드 / WASD)</td></tr>
      <tr><td>임무 확인</td><td>J: 받은 임무와 이 층의 임무 대상</td></tr>
      <tr><td>조사</td><td>K 또는 조사 버튼 → 살펴볼 칸을 누른다 (컴퓨터는 칸을 우클릭). 적의 HP·상태·가진 아이템, 떨어진 아이템, 발견한 함정을 볼 수 있다.</td></tr>
      <tr><td>메시지 기록 / 내 상태</td><td>U 또는 메시지 창을 누르면 지난 메시지, P 또는 위쪽 상태 표시줄을 누르면 내 능력치·능력 변화·기술.</td></tr>
      <tr><td>빠른 사용</td><td>가방에서 아이템 → "빠른 사용으로 등록". 그 뒤 T 키나 ⭐ 버튼으로 바로 쓴다. 돌·가시 같은 던지는 아이템은 보이는 적 쪽으로 방향을 맞춰 던진다.</td></tr>
      <tr><td>발밑의 아이템</td><td>가방을 열면 맨 위의 "발밑"에서 조사·줍기·가방 아이템과 교환·던지기. 가방 정리 버튼으로 종류별 정렬.</td></tr>
      <tr><td>큰 지도</td><td>N 또는 미니맵 클릭. 큰 지도에서 가 본 곳을 누르면 그곳까지 이동한다. 아무 키나 누르면 닫힌다.</td></tr>
      <tr><td>공격</td><td>Space / Enter, 적 쪽으로 이동해도 공격</td></tr>
      <tr><td>기술</td><td>1 ~ 4 (가까운 적에게 자동으로 방향을 맞춤)</td></tr>
      <tr><td>기술 정보</td><td>Shift + 1 ~ 4, 기술 버튼의 ? 또는 우클릭</td></tr>
      <tr><td>자동 탐색</td><td>O: 아이템을 줍고 탐색이 끝나면 계단으로</td></tr>
      <tr><td>자동 전투</td><td>Tab / F: 가장 가까운 적에게 최적의 기술 (누를 때마다 1턴)</td></tr>
      <tr><td>휴식</td><td>R: HP가 찰 때까지 쉬기</td></tr>
      <tr><td>대기</td><td>X / 숫자패드 5 / .</td></tr>
      <tr><td>계단</td><td>G: 계단 위라면 내려가고, 아니면 계단까지 이동</td></tr>
      <tr><td>함정</td><td>밟거나 옆에서 발견하면 표시됩니다. 자동 탐색과 이동은 발견한 함정을 피해 갑니다.</td></tr>
      <tr><td>켈리몬 상점</td><td>진열된 물건 위에 서면 살 수 있고, 켈리몬에게 말을 걸면 팔 수 있습니다.</td></tr>
      <tr><td>스피드</td><td>상대보다 빠를수록 명중률이 오르고 상대의 공격을 잘 피한다 (최대 ±20%). 마비는 스피드 절반.</td></tr>
      <tr><td>날씨</td><td>던전에 따라 층마다 날씨가 생긴다. 화면 위 날씨 아이콘에 마우스를 올리면 효과를 볼 수 있다.</td></tr>
      <tr><td>가방</td><td>I / B</td></tr>
      <tr><td>메뉴</td><td>Esc / M</td></tr></table>`);
  }

  // ───────────────────────── 시작 / 종료 ─────────────────────────
  function init() {
    canvas = document.getElementById('view'); ctx = canvas.getContext('2d');
    mini = document.getElementById('minimap'); mctx = mini.getContext('2d');
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', () => heldArrows.clear());
    canvas.addEventListener('click', onClick);
    canvas.addEventListener('contextmenu', e => { if (!D || UI.isOpen()) return; e.preventDefault(); lookAt(e); });   // 우클릭: 조사
    document.getElementById('log').addEventListener('click', () => { if (D && !UI.isOpen()) { stopAuto(); showLog(); } });
    document.getElementById('hud').addEventListener('click', e => { if (D && !UI.isOpen() && !e.target.closest('[title]')) { stopAuto(); showStatus(); } });
    mini.addEventListener('click', onMiniClick);
    initPad();
    document.getElementById('moves').addEventListener('contextmenu', e => {
      const b = e.target.closest('.mv'); if (!b || !D) return;
      e.preventDefault();
      const m = P().moves[+b.dataset.slot]; if (m) showMoveInfo(m.id, m.pp, m.max);
    });
    document.getElementById('moves').addEventListener('click', e => {
      const b = e.target.closest('.mv'); if (b && !busy()) { stopAuto(); act({ t: 'skill', slot: +b.dataset.slot }); }
    });
    document.getElementById('actions').addEventListener('click', e => {
      const b = e.target.closest('button'); if (!b || !D) return;
      if (D.auto) stopAuto();
      const k = b.dataset.k;
      if (busy() && k !== 'menu') return;
      ({ attack: () => act({ t: 'attack' }), explore: () => startAuto('explore'), fight: () => startAuto('fight'), rest: () => startAuto('rest'),
        wait: () => act({ t: 'wait' }), stairs: tryStairs, bag: openBag, menu: () => Game.dungeonMenu(), help: showHelp,
        mission: () => Game.showMissions(), map: () => toggleMap(), look: toggleLook, quick: quickUse })[k]?.();
    });
  }

  // 터치 화면용 방향 버튼: 누르고 있으면 계속 걷는다. 가운데 ↻를 누른 뒤 방향을 누르면 방향만 바꾼다
  function initPad() {
    const pad = document.getElementById('dpad'); if (!pad) return;
    let timer = null, dir = null, face = false;
    const faceBtn = pad.querySelector('[data-face]');
    const setFace = v => { face = v; faceBtn.classList.toggle('on', v); };
    const fire = () => {
      if (!D || D.dead || UI.isOpen() || bigMap || dir == null || busy()) return;
      if (face) { setFace(false); act({ t: 'face', dir }); stop(); return; }
      act({ t: 'move', dir });
    };
    const stop = () => { clearInterval(timer); timer = null; dir = null; pad.querySelectorAll('.held').forEach(b => b.classList.remove('held')); };
    pad.addEventListener('pointerdown', e => {
      const b = e.target.closest('button'); if (!b || !D) return;
      e.preventDefault();
      if (b.dataset.face != null) { setFace(!face); return; }
      if (D.auto) { stopAuto(); return; }
      if (bigMap) { toggleMap(false); return; }
      stop();
      dir = dirIndex(+b.dataset.dx, +b.dataset.dy);
      b.classList.add('held');
      fire();
      if (dir != null) timer = setInterval(fire, 40);   // 걷는 연출이 끝나는 대로 다음 칸
    });
    // 누른 채로 손가락을 옆 버튼으로 옮기면 방향이 바뀐다
    pad.addEventListener('pointermove', e => {
      if (dir == null) return;
      const b = document.elementFromPoint(e.clientX, e.clientY)?.closest('#dpad button[data-dx]'); if (!b) return;
      const d = dirIndex(+b.dataset.dx, +b.dataset.dy);
      if (d !== dir) { pad.querySelectorAll('.held').forEach(x => x.classList.remove('held')); b.classList.add('held'); dir = d; }
    });
    for (const ev of ['pointerup', 'pointercancel', 'pointerleave']) pad.addEventListener(ev, stop);
    pad.addEventListener('contextmenu', e => e.preventDefault());
  }

  function enter(r) {
    run = r; LOG.length = 0; hudCache = logCache = moveCache = quickCache = '';
    Sprites.load(r.p.sp, r.p.shiny);
    newFloor();
    if (!rafId) render();
    if (!logicTimer) logicTimer = setInterval(logicTick, 16);
  }
  function leave() {
    Progress.unseed();
    toggleMap(false);
    D = null; run = null; CUR_WEATHER = null; faceTemp = null; faceShown = '';
    cancelAnimationFrame(rafId); rafId = 0;
    clearInterval(logicTimer); logicTimer = 0;
    pendingKey = null;
  }
  return { showLog, showStatus, floorCandidates, init, enter, leave, get run() { return run; }, get floor() { return D; }, stopAuto, showHelp, addToBag, _log: LOG };
})();

// 게임 상태, 저장, 마을 UI
'use strict';

const SAVE_KEY = 'pmdweb_save_v1';
// 창고 사용량: 겹치는 아이템은 종류당 1칸, 나머지는 개수만큼
const storageUsedOf = st => Object.entries(st).reduce((s, [id, n]) => s + (n > 0 ? (ITEMS[id]?.stack ? 1 : n) : 0), 0);

const Game = (() => {
  let save = null;
  let tab = 'dungeon';
  let dgTab = 'normal';   // 던전 탭의 하위 탭

  // ───────────────────────── 저장 ─────────────────────────
  function newSave(sp) {
    return {
      v: SAVE_SCHEMA, gameVersion: GAME_VERSION, money: 500, day: 1, current: sp, starter: sp,
      roster: { [sp]: newEntry(sp) },
      bag: [{ id: 'oran', n: 1 }, { id: 'oran', n: 1 }, { id: 'apple', n: 1 }],
      storage: {}, cleared: {}, best: {},
      missions: { board: [], accepted: [] }, shop: [], run: null,
      settings: { fast: false, autoDescend: false }, bagMax: BAG_BASE, storageMax: STORAGE_BASE,
    };
  }
  const newEntry = sp => ({ lv: START_LEVEL, exp: expFor(START_LEVEL), moves: defaultMoves(sp, START_LEVEL), ability: defaultAbility(sp) });
  // 저장된 특성이 그 포켓몬의 것이 아니면 기본 특성으로
  const entryAbility = (sp, ch) => (ch && DATA.species[sp].ab.some(a => a[0] === ch.ability) ? ch.ability : defaultAbility(sp));
  let newerSave = null;   // 세이브가 이 화면보다 새 버전에서 저장됐으면 그 버전 (덮어쓰지 않는다)
  let lastBody = null;   // 저장 시각을 뺀 세이브 내용 (내용이 바뀌었을 때만 저장 시각을 갱신한다)
  const bodyOf = s => JSON.stringify({ ...s, savedAt: 0 });
  function persist() {
    if (newerSave || !save) return;
    const body = bodyOf(save);
    if (body !== lastBody) { save.savedAt = Date.now(); lastBody = body; }
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(save)); } catch (e) { /* 저장 불가 환경 */ }
    scheduleUpload();
  }
  function load() {
    try { const s = localStorage.getItem(SAVE_KEY); const v = s ? migrateSave(JSON.parse(s), s) : null; if (v) lastBody = bodyOf(v); return v; }
    catch (e) { return null; }
  }

  // ── 세이브 변환: 버전이 바뀌면 먼저 백업하고, 새 버전에 맞게 고친다 ──
  const BACKUP_KEY = 'pmdweb_save_backups';
  const SAVE_SCHEMA = 2;
  // 세이브 구조가 바뀔 때 여기에 변환을 추가한다 (to: 바뀐 뒤 번호)
  const MIGRATIONS = [
    { to: 2, fn: s => { s.settings = s.settings || {}; } },
  ];
  function backups() { try { return JSON.parse(localStorage.getItem(BACKUP_KEY) || '[]'); } catch (e) { return []; } }
  function backupSave(raw, ver) {
    const list = backups().filter(b => b.data !== raw);
    list.unshift({ ver, at: new Date().toISOString(), data: raw });
    try { localStorage.setItem(BACKUP_KEY, JSON.stringify(list.slice(0, 3))); } catch (e) { /* 공간 부족: 백업 생략 */ }
  }
  // 새 기능이 추가되며 생긴 항목들: 없으면 기본값
  function ensureDefaults(s) {
    s.settings = { fast: false, autoDescend: false, ...(s.settings || {}) };
    s.bag = s.bag || []; s.storage = s.storage || {}; s.cleared = s.cleared || {}; s.best = s.best || {};
    s.missions = s.missions || { board: [], accepted: [] }; s.missions.board = s.missions.board || []; s.missions.accepted = s.missions.accepted || [];
    s.shop = s.shop || []; s.money = s.money || 0; s.day = s.day || 1; s.clears = s.clears || {};
    s.bagMax = s.bagMax || Math.max(BAG_BASE, s.bag.length); s.storageMax = s.storageMax || Math.max(STORAGE_BASE, storageUsedOf(s.storage));
    for (const [sp, ch] of Object.entries(s.roster || {})) {
      if (!DATA.species[sp]) { delete s.roster[sp]; continue; }
      ch.lv = ch.lv || START_LEVEL; ch.exp = ch.exp ?? expFor(ch.lv); ch.moves = (ch.moves || []).filter(m => DATA.moves[m]);
      if (!ch.moves.length) ch.moves = defaultMoves(+sp, ch.lv);
    }
    s.bag = s.bag.filter(b => ITEMS[b.id]);
    for (const id of Object.keys(s.storage)) if (!ITEMS[id]) delete s.storage[id];
  }
  function migrateSave(s, raw) {
    if (!s || !s.roster) return s;
    const from = s.gameVersion || '0';
    if (cmpVer(from, GAME_VERSION) > 0) { newerSave = from; return s; }   // 옛 화면: 읽기만
    if (from !== GAME_VERSION) backupSave(raw, from);
    let v = s.v || 1;
    for (const m of MIGRATIONS) if (v < m.to) { m.fn(s); v = m.to; }
    s.v = Math.max(v, SAVE_SCHEMA);
    ensureDefaults(s);
    s.gameVersion = GAME_VERSION;
    return s;
  }
  async function restoreBackup(i) {
    const b = backups()[i]; if (!b) return;
    const ok = await UI.confirm('백업에서 복원', `<p>v${esc(b.ver)} 세이브 (${esc(new Date(b.at).toLocaleString())})로 되돌립니다.</p><p class="warn">지금 세이브는 이 백업으로 바뀝니다. (지금 세이브도 백업 목록에 남겨 둡니다)</p>`, '복원한다', '그만둔다');
    if (!ok) return;
    backupSave(JSON.stringify(save), GAME_VERSION);
    try { localStorage.setItem(SAVE_KEY, b.data); } catch (e) { UI.alert('복원 실패', '<p>브라우저에 저장할 수 없습니다.</p>'); return; }
    location.reload();
  }

  // ── 새 버전 알림: 사이트에 새 버전이 올라오면 마을에서 새로고침을 안내한다 (던전 중에는 방해하지 않음) ──
  let updateVer = null;
  async function checkUpdate() {
    if (!/^https?:/.test(location.protocol)) return;
    try {
      const t = await (await fetch('js/defs.js?check=' + Date.now(), { cache: 'no-store' })).text();
      const v = (t.match(/GAME_VERSION = '([^']+)'/) || [])[1];
      if (v && cmpVer(v, GAME_VERSION) > 0 && v !== updateVer) { updateVer = v; if (!Dungeon.floor && save) { renderTown(); UI.toast(`새 버전 v${v}이 나왔어요. 마을 위쪽의 알림을 눌러 새로고침하세요.`); } }
    } catch (e) { /* 오프라인 등 */ }
  }
  // 캐시를 피해서 새로 불러온다 (진행 상황은 이미 저장되어 있다)
  const reloadFresh = () => { location.href = location.pathname + '?r=' + Date.now(); };
  async function askUpdate() {
    if (!updateVer) return;
    if (Dungeon.floor) { UI.toast('던전에서 나온 뒤에 새로고침하세요.'); return; }
    const ok = await UI.confirm('새 버전', `<p>새 버전 <b>v${esc(updateVer)}</b>이 나왔어요. (지금 v${GAME_VERSION})</p><p>새로고침하면 적용됩니다. 진행 상황은 저장되어 있고, 업데이트 전 세이브는 자동으로 백업돼요.</p>`, '새로고침', '나중에');
    if (ok) { persist(); reloadFresh(); }
  }

  // ── 클라우드 세이브: 로그인하면 세이브를 서버에도 올려서 다른 기기에서 이어한다 ──
  // 서버가 막혀도 이 브라우저의 세이브로 계속 플레이할 수 있다. 덮어쓰기 전에는 항상 백업을 남긴다.
  const SYNC_KEY = 'pmdweb_sync';   // 마지막으로 맞춘 클라우드 세이브 { uid, at }
  const syncMeta = () => { try { return JSON.parse(localStorage.getItem(SYNC_KEY) || 'null'); } catch (e) { return null; } };
  const setSyncMeta = m => { try { if (m) localStorage.setItem(SYNC_KEY, JSON.stringify(m)); else localStorage.removeItem(SYNC_KEY); } catch (e) { /* 무시 */ } };
  // 클라우드 저장 (다른 기기에서 이어하기용. 브라우저 세이브는 매번 바로 저장된다)
  //  마을: 바뀐 게 있으면 10분에 한 번까지 / 던전 안: 올리지 않는다 (층마다 바뀌어서)
  //  던전을 마치고 마을에 돌아올 때, 창을 닫거나 다른 탭으로 갈 때는 바로 올린다 (던전 도중이어도)
  //  서버 규칙은 20초에 한 번까지만 받아 준다. 탭을 자주 오가도 FLUSH_GAP 안에는 다시 올리지 않는다
  const UPLOAD_GAP = 10 * 60 * 1000, FLUSH_GAP = 30 * 1000;
  let bound = false, upTimer = null, lastUp = 0, upPending = false, syncing = null, cloudErr = null, onlineBoot = null;
  const inDungeon = () => typeof Dungeon !== 'undefined' && !!Dungeon.run;
  function scheduleUpload() {
    if (!bound || !Online.loggedIn()) return;
    upPending = true;
    if (upTimer || inDungeon()) return;
    upTimer = setTimeout(() => { upTimer = null; if (!inDungeon()) uploadNow(); }, Math.max(0, lastUp + UPLOAD_GAP - Date.now()));
  }
  async function uploadNow() {
    if (!bound || !Online.loggedIn() || !save || newerSave) return false;
    const m = syncMeta();
    if (m && m.uid === Online.uid() && m.at === save.savedAt) { upPending = false; return true; }   // 바뀐 것 없음
    lastUp = Date.now();
    // 올리는 동안 세이브가 또 바뀔 수 있다: 올린 그 시점의 값으로 기록해야 바뀐 부분이 다음에 다시 올라간다
    // (예전에는 올린 뒤의 savedAt을 적어서, 그 사이 바뀐 내용이 클라우드에 안 올라가고 다음 접속 때 옛 클라우드 세이브로 덮였다)
    const at = save.savedAt || 0;
    try {
      await Online.pushCloud(JSON.stringify(save), at); setSyncMeta({ uid: Online.uid(), at }); cloudErr = null;
      upPending = (save.savedAt || 0) !== at; if (upPending) scheduleUpload();
      return true;
    }
    catch (e) { cloudErr = Online.why(e); console.warn(e); scheduleUpload(); return false; }   // 실패하면 다음 주기에 다시
  }
  // 올릴 게 남아 있으면 바로 올린다 (창을 닫거나 숨길 때, 던전에서 돌아왔을 때)
  function flushUpload() {
    if (!upPending || Date.now() - lastUp < FLUSH_GAP) return;
    clearTimeout(upTimer); upTimer = null; uploadNow();
  }
  document.addEventListener('visibilitychange', () => { if (document.hidden) flushUpload(); });
  window.addEventListener('pagehide', flushUpload);

  // ── 접속자 수 (로그인한 탐험대 기준) ──
  //  "접속 중" 표시는 10분마다 남기고 (던전 안에서도), 수는 마을 화면을 보고 있을 때만 10분마다 센다. 창을 숨기면 쉰다
  let onlineN = null, presenceAt = 0, countAt = 0, presenceTimer = null;
  const PRESENCE_MS = () => Online.PRESENCE_MIN * 60 * 1000 - 5000;
  const inTown = () => document.getElementById('town-screen')?.classList.contains('active');
  async function presenceTick() {
    if (!Online.loggedIn() || document.hidden) return;
    if (Date.now() - presenceAt >= PRESENCE_MS()) {
      presenceAt = Date.now();
      try { await Online.touchPresence(); } catch (e) { console.warn(e); }   // 방금 남겼으면 서버가 거절한다 (괜찮음)
    }
    if (inTown() && Date.now() - countAt >= PRESENCE_MS()) {
      countAt = Date.now();
      try { onlineN = await Online.onlineCount(); } catch (e) { console.warn(e); }
    }
    showOnline();
  }
  function showOnline() {
    const el = document.getElementById('town-online'); if (!el) return;
    el.hidden = onlineN == null || !Online.loggedIn();
    el.textContent = `🟢 접속 ${onlineN}명`;
    el.title = `최근 약 ${Online.ONLINE_WINDOW - 1}분 안에 접속한 탐험대 (로그인한 사람 기준, ${Online.PRESENCE_MIN}분마다 갱신)`;
  }
  function startPresence() {
    if (presenceTimer) return;
    presenceTimer = setInterval(presenceTick, 60 * 1000);
    document.addEventListener('visibilitychange', presenceTick);
    presenceTick();
  }

  function saveSummary(raw, at) {
    let s; try { s = typeof raw === 'string' ? JSON.parse(raw) : raw; } catch (e) { return '<p class="warn">읽을 수 없는 세이브</p>'; }
    const ch = s.roster && s.roster[s.current], ok = DATA.species[s.current];
    return `<div class="row">${ok ? portraitImg(s.current, 'portrait sm', 'Normal', ch && ch.shiny) : ''}<div class="grow">
      <b>${ok ? esc(spName(s.current)) : '?'}</b> Lv${ch ? ch.lv : '?'} · ${s.day || 1}일째 · ₽${s.money || 0} · 동료 ${Object.keys(s.roster || {}).length}마리 · 도감 ${Object.keys((s.dex || {}).seen || {}).length}종
      <div class="dim">마지막 저장 ${at ? esc(new Date(at).toLocaleString()) : '알 수 없음'}${s.gameVersion ? ` · v${esc(s.gameVersion)}` : ''}</div></div></div>`;
  }
  function chooseSave(c) {
    return new Promise(res => UI.open({
      title: '☁ 어느 세이브로 할까요?', wide: true, cancel: false,
      html: `<p>이 브라우저의 세이브와 계정의 클라우드 세이브가 다릅니다.</p>
        <h3>☁ 클라우드 세이브</h3>${saveSummary(c.raw, c.savedAt)}
        <h3>💻 이 브라우저의 세이브</h3>${saveSummary(save, save.savedAt)}
        <p class="dim">고르지 않은 쪽은 정보 탭의 백업 목록에 남겨 둡니다.</p>`,
      choices: [{ label: '☁ 클라우드 세이브로 이어한다', fn: () => res('cloud') }, { label: '💻 이 브라우저의 세이브를 클라우드에 올린다', fn: () => res('local') }],
    }));
  }
  function useCloud(c) {
    let s; try { s = JSON.parse(c.raw); } catch (e) { UI.alert('클라우드 세이브', '<p>클라우드 세이브를 읽을 수 없어서 이 브라우저의 세이브를 씁니다.</p>'); return false; }
    if (save) backupSave(JSON.stringify(save), (save.gameVersion || GAME_VERSION) + ' 이 브라우저');
    newerSave = null;
    save = migrateSave(s, c.raw);
    if (newerSave) return false;
    lastBody = bodyOf(save);
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(save)); } catch (e) { /* 무시 */ }
    setSyncMeta({ uid: Online.uid(), at: c.savedAt });
    return true;
  }
  // 로그인 직후 / 게임을 열 때: 클라우드와 이 브라우저의 세이브를 맞춘다
  function syncSave() {
    if (syncing) return syncing;
    syncing = (async () => {
      bound = false;
      if (!Online.loggedIn() || newerSave) return;   // 옛 화면에서는 세이브를 건드리지 않는다
      let c;
      try { c = await Online.fetchCloud(); } catch (e) { cloudErr = Online.why(e); UI.toast('클라우드 세이브를 확인하지 못했어요. 이 브라우저의 세이브로 계속합니다.'); return; }
      const uid = Online.uid(), m = syncMeta();
      if (c && cmpVer(c.ver, GAME_VERSION) > 0) {
        await new Promise(res => UI.open({ title: '새 버전이 필요해요', cancel: false,
          html: `<p>클라우드 세이브는 <b>v${esc(c.ver)}</b>에서 저장됐는데, 지금 열린 게임은 옛 버전 <b>v${GAME_VERSION}</b>이에요. 새로고침해서 최신 버전으로 열어 주세요.</p>`,
          choices: [{ label: '새로고침', fn: reloadFresh }, { label: '이번에는 클라우드 없이 한다', fn: res }] }));
        return;
      }
      let changed = false;
      if (!c) { bound = true; if (save && !newerSave) await uploadNow(); return; }
      if (!save) changed = useCloud(c);
      else if ((save.savedAt || 0) === c.savedAt) setSyncMeta({ uid, at: c.savedAt });
      else if (m && m.uid === uid && m.at === c.savedAt) { bound = true; await uploadNow(); }   // 클라우드는 그대로이고 여기서만 진행
      else if (m && m.uid === uid && m.at === save.savedAt) { changed = useCloud(c); if (changed) UI.toast('다른 기기에서 진행한 세이브를 불러왔어요.'); }
      else if ((await chooseSave(c)) === 'cloud') changed = useCloud(c);
      else { backupSave(c.raw, c.ver + ' 클라우드'); bound = true; setSyncMeta(null); await uploadNow(); }
      bound = true;
      if (changed) afterSaveReplaced();
    })().finally(() => { syncing = null; });
    return syncing;
  }
  function afterSaveReplaced() {
    refreshTitle();
    if (document.getElementById('town-screen').classList.contains('active')) { UI.closeAll(); enterTown(); }
  }
  function refreshTitle() {
    document.getElementById('btn-start').textContent = save ? '이어하기' : '새로 시작';
    renderAcct();
  }
  // 타이틀 화면의 계정 표시
  function renderAcct() {
    const el = document.getElementById('title-acct'); if (!el) return;
    if (!Online.enabled()) { el.innerHTML = ''; return; }
    el.innerHTML = Online.loggedIn()
      ? `<span>☁ <b>${esc(Online.name())}</b> 님 · 클라우드 세이브 사용 중</span> <button class="btn sm ghost" data-acct>계정</button>`
      : `<button class="btn sm" data-acct>☁ 로그인 / 계정 만들기</button><div class="dim tiny">로그인 없이도 플레이할 수 있어요. 로그인하면 다른 기기에서 이어하고 구조 게시판을 쓸 수 있어요.</div>`;
    el.querySelector('[data-acct]').onclick = () => accountDialog();
  }
  // 처음 고른 포켓몬을 스타팅 순위에 한 번 넣는다 (로그인한 사람만, 계정마다 한 번)
  async function voteStarter() {
    if (!Online.loggedIn() || !save || !save.starter || save.starterVoted) return;
    try { await Online.voteStarter(save.starter); }
    catch (e) { if (!/permission/.test(e.code || '')) { console.warn(e); return; } }   // 거절 = 이미 넣었음
    save.starterVoted = true; persist();
  }
  async function afterLogin() {
    renderAcct();
    await syncSave();
    voteStarter();
    renderAcct();
    if (save && document.getElementById('town-screen').classList.contains('active')) { renderTown(); checkOnline(true); }
  }
  function accountDialog(mode = 'login') {
    if (!Online.enabled()) return;
    if (Online.loggedIn()) return accountInfo();
    const su = mode === 'signup';
    let busy = false;
    const m = UI.open({
      title: su ? '☁ 계정 만들기' : '☁ 로그인',
      html: `<div class="acct-form">
        <label>아이디 <input id="ac-id" autocomplete="username" maxlength="16" placeholder="영어 소문자·숫자·_ 3~16자" autocapitalize="off" spellcheck="false"></label>
        <label>비밀번호 <input id="ac-pw" type="password" autocomplete="${su ? 'new-password' : 'current-password'}" placeholder="6자 이상"></label>
        ${su ? `<label>비밀번호 확인 <input id="ac-pw2" type="password" autocomplete="new-password"></label>
        <label>닉네임 <input id="ac-nick" maxlength="10" placeholder="구조 게시판에 보이는 이름 (한글 가능, 비우면 아이디)"></label>
        <p class="dim tiny">아이디와 닉네임은 다른 사람과 겹칠 수 없어요.</p>` : ''}
        <p id="ac-msg" class="warn"></p></div>
        ${su ? `<p class="warn">⚠ <b>비밀번호 찾기가 없어요.</b> 이메일을 받지 않아서, 비밀번호를 잊으면 계정을 되찾을 수 없어요. 꼭 적어 두세요.</p>
          <p class="dim tiny">아이디와 비밀번호만으로 가입해요. 이메일 같은 개인정보는 받지 않아요. 다른 사이트에서 쓰는 비밀번호는 쓰지 마세요.<br>
          욕설·비하·운영자 사칭 닉네임은 쓸 수 없고, 다른 사람에게 가려져 보여요.</p>`
          : '<p class="dim tiny">로그인하면 세이브가 클라우드에도 저장되어 다른 기기에서 이어할 수 있고, 구조 게시판을 쓸 수 있어요.<br>비밀번호 찾기는 없어요 (이메일을 받지 않기 때문).</p>'}`,
      choices: [
        { label: su ? '가입하기' : '로그인', keep: true, fn: () => submit() },
        { label: su ? '이미 계정이 있어요 (로그인)' : '계정 만들기', fn: () => accountDialog(su ? 'login' : 'signup') },
        { label: '닫기', fn: () => {} },
      ],
      onOpen: box => {
        box.addEventListener('keydown', e => { if (e.key === 'Enter' && e.target.tagName === 'INPUT') { e.preventDefault(); submit(); } });
        setTimeout(() => box.querySelector('#ac-id').focus(), 0);
      },
    });
    async function submit() {
      if (busy) return;
      const v = id => (m.box.querySelector('#' + id) || {}).value || '';
      const msg = m.box.querySelector('#ac-msg');
      if (su && v('ac-pw') !== v('ac-pw2')) { msg.textContent = '비밀번호 확인이 다릅니다.'; return; }
      busy = true; msg.textContent = '처리 중…';
      try {
        if (su) await Online.signUp(v('ac-id'), v('ac-pw'), v('ac-nick'));
        else await Online.signIn(v('ac-id'), v('ac-pw'));
      } catch (e) {
        if (e.joined) { UI.close(m); UI.alert('☁ 가입', `<p>${esc(e.msg)}</p>`); afterLogin(); return; }
        msg.textContent = e.msg || Online.why(e); busy = false; return;
      }
      UI.close(m);
      UI.toast(su ? `가입했어요. ${Online.name()} 님, 환영합니다!` : `${Online.name()} 님, 어서 오세요!`);
      afterLogin();
    }
  }
  function accountInfo() {
    const m = syncMeta();
    UI.open({
      title: '☁ 계정', wide: true,
      html: `<p>아이디 <b>${esc(Online.userId())}</b> · 닉네임 <b>${esc(Online.name())}</b></p>
        <p>클라우드 세이브: ${m && m.uid === Online.uid() ? `${esc(new Date(m.at).toLocaleString())}에 저장한 세이브와 맞춰져 있어요.` : '아직 올리지 않았어요.'}</p>
        ${Online.nameTaken() ? '<p class="warn">이 닉네임은 다른 사람이 먼저 쓰고 있어요. 구조 게시판을 쓰려면 닉네임을 바꿔 주세요.</p>' : ''}
        ${cloudErr ? `<p class="warn">마지막 오류: ${esc(cloudErr)}</p>` : ''}
        <p class="dim">진행 상황은 이 브라우저에는 바로 저장됩니다. 클라우드에는 던전을 마치고 돌아올 때, 창을 닫거나 다른 탭으로 갈 때, 마을에서는 10분마다 자동으로 올라갑니다.</p>`,
      choices: [
        { label: '☁ 지금 클라우드에 저장', fn: async () => {
          if (Date.now() - lastUp < FLUSH_GAP) { UI.toast('방금 저장했어요. 잠시 뒤에 다시 눌러 주세요.'); return; }
          persist(); const ok = await uploadNow(); UI.toast(ok ? '클라우드에 저장했어요.' : `저장하지 못했어요. ${cloudErr || ''}`);
        } },
        { label: '✏ 닉네임 바꾸기', fn: renameDialog },
        { label: '로그아웃', fn: logoutDialog },
        { label: '🗑 계정 삭제', fn: deleteAccountDialog },
        { label: '닫기', fn: () => {} },
      ],
    });
  }
  // 계정 삭제: 서버에 남은 내 기록을 모두 지운다. 이 브라우저의 세이브는 남는다 (로그인 없이 계속 플레이)
  function deleteAccountDialog() {
    let busy = false;
    const m = UI.open({
      title: '🗑 계정 삭제',
      html: `<p>계정 <b>${esc(Online.userId())}</b>와(과) 서버에 있는 기록을 모두 지웁니다.</p>
        <ul><li>클라우드 세이브, 닉네임, 접속 기록</li><li>아직 아무도 구조하지 않은 내 구조 요청</li></ul>
        <p class="warn">되돌릴 수 없어요.</p>
        <div class="acct-form"><label>비밀번호 확인 <input id="del-pw" type="password" autocomplete="current-password"></label>
        <label class="check"><input id="del-local" type="checkbox"> 이 브라우저의 세이브도 지우기 <span class="dim">(체크하지 않으면 로그인 없이 계속 플레이할 수 있어요)</span></label>
        <p id="del-msg" class="warn"></p></div>`,
      choices: [{ label: '계정을 삭제한다', keep: true, fn: async () => {
        if (busy) return; busy = true;
        const msg = m.box.querySelector('#del-msg'); msg.textContent = '지우는 중…';
        if (upTimer) { clearTimeout(upTimer); upTimer = null; }
        try { await Online.deleteAccount(m.box.querySelector('#del-pw').value); }
        catch (e) { msg.textContent = e.msg || Online.why(e); busy = false; return; }
        bound = false; setSyncMeta(null);
        if (m.box.querySelector('#del-local').checked) {   // 브라우저의 세이브와 백업까지 지우고 처음 화면으로
          try { localStorage.removeItem(SAVE_KEY); localStorage.removeItem('pmdweb_save_backups'); } catch (e) { /* 무시 */ }
          save = null; location.href = location.pathname; return;
        }
        if (save) delete save.sos?.online;
        UI.close(m); renderAcct(); refreshTitle();
        if (save && document.getElementById('town-screen').classList.contains('active')) renderTown();
        UI.alert('계정 삭제', '<p>계정과 서버의 기록을 지웠어요. 이 브라우저의 세이브로 계속 플레이할 수 있어요.</p>');
      } }, { label: '그만둔다', fn: () => {} }],
    });
  }
  function renameDialog() {
    const m = UI.open({
      title: '✏ 닉네임 바꾸기', html: `<div class="acct-form"><label>새 닉네임 <input id="ac-nick" maxlength="10" value="${esc(Online.name())}"></label><p id="ac-msg" class="warn"></p></div>`,
      choices: [{ label: '바꾸기', keep: true, fn: async () => {
        try { await Online.setName(m.box.querySelector('#ac-nick').value); } catch (e) { m.box.querySelector('#ac-msg').textContent = e.msg || Online.why(e); return; }
        UI.close(m); UI.toast('닉네임을 바꿨어요.'); renderAcct(); if (save && tab === 'info') renderTown();
      } }, { label: '그만둔다', fn: () => {} }],
    });
  }
  async function logoutDialog() {
    if (upTimer) { clearTimeout(upTimer); upTimer = null; }
    await uploadNow();
    UI.open({
      title: '로그아웃', html: '<p>로그아웃해도 이 브라우저의 세이브는 남아서 로그인 없이 계속할 수 있어요.</p><p class="dim">여럿이 쓰는 컴퓨터라면 이 브라우저의 세이브를 지워 두세요. 클라우드 세이브는 남아 있어서 다시 로그인하면 이어할 수 있어요.</p>',
      choices: [
        { label: '로그아웃', fn: async () => { await Online.signOut(); bound = false; setSyncMeta(null); UI.toast('로그아웃했어요.'); renderAcct(); if (save && document.getElementById('town-screen').classList.contains('active')) renderTown(); } },
        { label: '로그아웃하고 이 브라우저의 세이브도 지운다', fn: async () => {
          await Online.signOut(); bound = false; setSyncMeta(null);
          try { localStorage.removeItem(SAVE_KEY); localStorage.removeItem('pmdweb_save_backups'); } catch (e) { /* 무시 */ }
          location.href = location.pathname;
        } },
        { label: '그만둔다', fn: () => {} },
      ],
    });
  }

  // 구조 게시판 확인: 내 요청이 구조됐는지, 내가 구조한 친구가 감사 편지를 보냈는지 (자주 읽지 않게 1분 30초 간격)
  let lastCheck = 0, checking = false;
  let sosRelinked = false;
  async function checkOnline(force) {
    if (!save || !bound || !Online.loggedIn() || checking || (!force && Date.now() - lastCheck < 90 * 1000)) return;
    checking = true; lastCheck = Date.now();
    try {
      await flushThanks();
      const s = save.sos;
      // 게시판에 올린 표시가 세이브에서 빠진 요청 (예전 클라우드 동기화 버그): 서버에서 내 요청을 찾아 다시 잇는다 (접속마다 한 번)
      if (s && !s.online && !s.revived && !sosRelinked) {
        sosRelinked = true;
        const docId = await Online.findMySOS(s.id);
        if (docId) { s.docId = docId; s.online = true; persist(); }
      }
      if (s && s.online && !s.revived) {
        const d = await Online.getSOS(s.docId || s.id);
        // 서버의 값은 다른 사람이 쓴 것이라 숫자·이름을 다시 확인한다 (조작된 값이 화면에 그대로 들어가지 않게)
        // 구조한 사람의 포켓몬이 이 버전에 없어도 (더 새 버전에서 구조) 부활은 시킨다. 그림만 내 포켓몬으로
        const rs = d && d.rescuer;
        if (d && d.status === 'rescued' && rs) {
          const known = hasKey(DATA.species, rs.sp);
          await receiveAOK({ id: s.id, sp: known ? +rs.sp : s.sp, lv: clamp(Math.floor(+rs.lv) || 1, 1, MAX_LEVEL), sh: known && rs.shiny ? 1 : 0 }, Online.cleanName(rs.name));
        } else if (!d) {   // 요청이 서버에서 사라짐: 게시판으로는 더 기다릴 수 없다 (코드로 구조받거나 포기)
          s.online = false; persist();
          UI.alert('🆘 구조 요청', '<p>구조 게시판에서 내 구조 요청을 찾을 수 없어요. 임무 탭에서 SOS 코드를 친구에게 보내거나, 포기하고 돌아갈 수 있어요.</p>');
        }
      }
      for (const [id, r] of Object.entries(save.rescued || {})) {
        if (!r.online || r.thanked) continue;
        const doc = r.docId || id;
        if (!r.claimed) {
          const ok = await Online.claimRescue(doc, r.me);
          if (ok) {
            // 구조 보답: 요청자가 게임을 그만둬도 받을 수 있게 바로 준다 (감사 편지는 따로)
            r.claimed = true;
            const rdg = dungeonById(r.dungeon), rlv = rdg?.lv?.[1] || r.me?.lv || 20;
            const item = rollMega('rescue', rlv, rdg) || weighted(rewardPool(rlv, rdg)), money = 50 + (r.floor || 5) * 15;
            storeAdd(item); save.money += money;
            UI.alert('✅ 구조 완료', `<div class="center">${portraitImg(r.sp, 'portrait big', 'Joyous', r.shiny)}</div>
              <p class="center">${esc(spName(r.sp))}의 구조 완료를 요청자에게 전했어요!</p>
              <p class="center">구조 보답: ${ITEMS[item].icon} <b>${esc(ITEMS[item].n)}</b> (창고로) · ₽${money}</p>
              <p class="center dim">요청자가 감사 편지를 보내면 선물이 더 올 수도 있어요.</p>`);
          } else { r.thanked = true; r.lost = true; UI.toast(`${spName(r.sp)}: 다른 탐험대가 먼저 구조했거나 요청이 취소됐어요.`); }
          persist(); continue;
        }
        const d = await Online.getSOS(doc);
        if (!d) { r.thanked = true; persist(); continue; }
        if (d.status === 'thanked') {
          await gotThanks(r, hasKey(ITEMS, d.thx) && d.thx !== 'quest' ? d.thx : null, Online.cleanName(d.name));
          Online.deleteSOS(doc).catch(() => {});   // 다 쓴 요청은 지운다
        }
      }
    } catch (e) { console.warn('구조 게시판 확인 실패', e); }
    finally { checking = false; }
    if (tab === 'mission' && document.getElementById('town-screen').classList.contains('active') && !UI.isOpen()) renderTown();
  }
  // 감사 편지는 보낼 때 실패해도 다음에 다시 보낸다
  async function flushThanks() {
    const q = save.thxQueue || [];
    while (q.length) {
      try { await Online.thankSOS(q[0].id, q[0].item); } catch (e) { if (!/not-found|permission/.test(e.code || '')) throw e; }
      q.shift(); persist();
    }
  }

  const ONLINE_RESCUE_MAX = 2;   // 게시판 구조 임무는 한 번에 이만큼 (한 사람이 요청을 다 가져가지 않게)
  async function starterRank() {
    let r;
    try { r = await Online.starterRanks(); } catch (e) { UI.alert('🏆 스타팅 순위', `<p>${esc(Online.why(e))}</p>`); return; }
    const list = Object.entries(r.c).map(([sp, n]) => [+sp, +n || 0]).filter(([sp, n]) => n > 0 && hasKey(DATA.species, sp)).sort((a, b) => b[1] - a[1] || a[0] - b[0]);
    const total = list.reduce((t, [, n]) => t + n, 0);
    let rank = 0, prev = -1;
    const rows = list.slice(0, 20).map(([sp, n], i) => { if (n !== prev) { rank = i + 1; prev = n; }
      return `<div class="row">${rank <= 3 ? ['🥇', '🥈', '🥉'][rank - 1] : `<b class="num">${rank}</b>`} ${portraitImg(sp, 'portrait sm')}<span class="grow"><b>${esc(spName(sp))}</b></span><span>${n}명 <span class="dim">(${Math.round(n * 100 / total)}%)</span></span></div>`; }).join('');
    UI.alert('🏆 스타팅 순위', `${total ? rows : '<p>아직 집계된 탐험대가 없어요.</p>'}
      <p class="dim tiny">총 ${total}명 · ${esc(r.day)} 기준 (하루에 한 번 갱신) · 로그인한 탐험대가 처음 고른 포켓몬만 세요 (v0.33부터 시작한 탐험대).</p>`);
  }

  async function sosBoard() {
    if (!Online.loggedIn()) return accountDialog();
    let list;
    try { list = await Online.listSOS(); } catch (e) { UI.alert('📋 구조 게시판', `<p>${esc(Online.why(e))}</p>`); return; }
    list = list.filter(s => dungeonById(s.dungeon) && hasKey(DATA.species, s.sp) && Number.isInteger(s.floor) && Number.isInteger(s.lv) && s.lv >= 1 && s.lv <= MAX_LEVEL)
      .map(s => ({ ...s, sp: +s.sp, name: Online.cleanName(s.name), created: +s.created || Date.now() }));
    const taken = sid => !!((save.rescued || {})[sid] || save.missions.accepted.some(m => m.sosId === sid));
    const ago = t => { const mnt = Math.max(1, Math.round((Date.now() - t) / 60000)); return mnt < 60 ? `${mnt}분 전` : mnt < 1440 ? `${Math.round(mnt / 60)}시간 전` : `${Math.round(mnt / 1440)}일 전`; };
    const rows = list.map(s => {
      const dg = dungeonById(s.dungeon), ok = unlocked(dg), got = taken(s.sid);
      return `<div class="row">${portraitImg(s.sp, 'portrait sm', 'Pain', s.shiny)}<div class="grow"><b>${esc(dg.n)} ${s.floor}F</b> · ${esc(s.name)} 님의 ${esc(spName(s.sp))} Lv${s.lv}
        <div class="dim">${ago(s.created)}${ok ? '' : ` · 🔒 ${esc(dungeonById(dg.req).n)} 클리어 필요`}</div></div>
        <button class="btn sm" data-sos="${esc(s.id)}" ${!ok || got ? 'disabled' : ''}>${got ? '받음' : '구조하러 간다'}</button></div>`;
    });
    UI.open({
      title: '📋 구조 게시판', wide: true,
      html: `<p class="dim">구조 요청 중 가장 오래 기다린 ${list.length || ''}건. 누가 구조하러 가면 2시간 동안 다른 사람에게는 보이지 않아요.
        구조 임무는 한 번에 ${ONLINE_RESCUE_MAX}개까지 받을 수 있어요.</p>${rows.join('') || '<p>지금은 구조를 기다리는 탐험대가 없어요.</p>'}`,
      choices: [{ label: '🔄 새로고침', fn: sosBoard }, { label: '닫기', fn: () => {} }],
      onOpen: (box, m) => box.querySelectorAll('[data-sos]').forEach(b => { b.onclick = () => {
        const s = list.find(x => x.id === b.dataset.sos); if (!s) return;
        UI.close(m);
        acceptSOS({ id: s.sid, dg: DUNGEONS.findIndex(d => d.id === s.dungeon), fl: s.floor, sp: s.sp, lv: s.lv, sh: s.shiny ? 1 : 0 }, s.name, s.id);
      }; }),
    });
  }

  function show(id) {
    document.querySelectorAll('.screen').forEach(s => s.classList.toggle('active', s.id === id));
  }

  // ───────────────────────── 시작 화면 ─────────────────────────
  function boot() {
    Dungeon.init();
    if (Tiles.CUSTOM) Tiles.probe();
    save = load();
    if (save && !newerSave) persist();
    setTimeout(checkUpdate, 3000); setInterval(checkUpdate, 10 * 60 * 1000);
    // 다른 탭에 있다가 돌아오면 바로 확인 (1분에 한 번까지). 파일 하나를 읽을 뿐이라 서버(Firebase) 사용량과는 상관없다
    let lastCheckUpd = Date.now();
    document.addEventListener('visibilitychange', () => { if (!document.hidden && Date.now() - lastCheckUpd > 60 * 1000) { lastCheckUpd = Date.now(); checkUpdate(); } });
    if (Online.enabled()) {
      document.getElementById('title-acct').innerHTML = '<span class="dim tiny">☁ 온라인 연결 중…</span>';
      onlineBoot = Online.init().then(async ok => {
        if (!ok) { document.getElementById('title-acct').innerHTML = '<span class="dim tiny">☁ 서버에 연결하지 못했어요. 로그인 없이 플레이할 수 있어요.</span>'; return; }
        renderAcct();
        if (Online.loggedIn()) { await syncSave(); refreshTitle(); voteStarter(); }
        startPresence();
      });
      Online.onChange(() => { renderAcct(); presenceAt = 0; presenceTick(); showOnline(); });
    }
    let starting = false;
    document.getElementById('btn-start').onclick = async () => {
      if (starting) return;
      starting = true;
      if (onlineBoot) await Promise.race([onlineBoot, new Promise(r => setTimeout(r, 5000))]);
      if (syncing) await syncing;
      starting = false;
      if (newerSave) {
        UI.open({ title: '새 버전이 필요해요', cancel: false,
          html: `<p>이 세이브는 <b>v${esc(newerSave)}</b>에서 저장됐는데, 지금 열린 게임은 옛 버전 <b>v${GAME_VERSION}</b>이에요.</p><p>세이브가 망가지지 않도록 새로고침해서 최신 버전으로 열어 주세요.</p>`,
          choices: [{ label: '새로고침', fn: reloadFresh }] });
        return;
      }
      if (save) enterTown();
      else Starter.begin(sp => { UI.closeAll(); save = newSave(sp); refreshDay(); persist(); enterTown(); voteStarter(); UI.alert('환영합니다!', `<p>${esc(jo(spName(sp), '으로'))} 모험을 시작합니다.</p><p>마을에서 임무를 받고, 상점에서 준비한 뒤 던전으로 떠나 보세요.<br>던전 안에서 <b>O</b> 키로 자동 탐색, <b>Tab</b> 키로 자동 전투를 할 수 있습니다.<br>던전에서 쓰러뜨린 적이 가끔 동료가 되고 싶어 해요. 영입하면 캐릭터를 바꿀 수 있어요.</p>`); },
        (cb, back) => chooseCharacter(cb, true, starterIds(), back));
    };
    refreshTitle();
    const n = SPECIES_IDS.length;
    document.getElementById('title-sub').textContent = `v${GAME_VERSION} · 등장 포켓몬 ${n}종 · 스프라이트 PMD SpriteCollab`;
    // 타이틀 장식
    const deco = document.getElementById('title-deco');
    const ids = SPECIES_IDS;
    for (let i = 0; i < 7; i++) deco.insertAdjacentHTML('beforeend', portraitImg(pick(ids), 'deco'));
    show('title-screen');
    Sound.title();
  }

  // ───────────────────────── 마을 ─────────────────────────
  function enterTown() {
    applyPad();
    show('town-screen');
    checkUpdate();
    Sound.town();
    if (Progress.check().length) persist();
    if (!save.shop.length || !save.missions.board.length) refreshDay();
    renderTown();
    checkOnline();
    if (save.run) {
      const r = save.run;
      UI.open({
        title: '탐험 재개', html: `<p>${esc(dungeonById(r.dungeon).n)} ${r.floor}F 탐험이 중단되어 있습니다.</p><p>이어서 하면 해당 층의 처음부터 다시 시작합니다.</p>`,
        choices: [{ label: '이어서 탐험한다', fn: resumeRun }, { label: '포기한다 (쓰러진 것으로 처리)', fn: () => { abandonSavedRun(); } }],
        cancel: false,
      });
    }
  }
  // 이미 들어가 본 던전은 열리는 순서가 바뀌어도 계속 열려 있다
  const unlocked = dg => dg.mode === 'rogue' || !dg.req || !!save.cleared[dg.req] || !!save.cleared[dg.id] || !!save.best[dg.id];

  function refreshDay() {
    rollShop();
    const board = [];
    for (let i = 0; i < 6; i++) { const m = genMission(); if (m) board.push(m); }
    save.missions.board = board;
  }
  // 마을 상점 진열: 하루에 한 번, 또는 돈을 내고 새로고침
  function rollShop() {
    const stock = new Set(['oran', 'apple', 'escape']);
    const pool = SHOP_POOL.filter(i => !stock.has(i));
    while (stock.size < 11) stock.add(pick(pool));
    const held = HELD_SHOP_POOL.slice().sort(() => Math.random() - 0.5).slice(0, 3);
    if (Math.random() < SIG_SHOP_CHANCE) held.push(pick(SIG_ITEMS));   // 전용 도구는 가끔 하나
    const tms = TM_IDS.slice().sort(() => Math.random() - 0.5).slice(0, 2);
    const vit = Math.random() < 0.35 ? [pick(Object.keys(VITAMINS))] : [];
    const abi = [Math.random() < 0.4 ? 'abcapsule' : null, Math.random() < 0.15 ? 'abpatch' : null].filter(Boolean);
    // 구미: 가끔 하나 (무지개구미는 아주 가끔)
    const gum = [Math.random() < 0.2 ? pick(Object.keys(GUMMIES).filter(id => id !== 'rainbowgummy')) : null, Math.random() < 0.02 ? 'rainbowgummy' : null].filter(Boolean);
    save.shop = [...stock, ...held, ...tms, ...vit, ...abi, ...gum];
  }

  function genMission() {
    const dgs = DUNGEONS.filter(d => d.mode === 'normal' && unlocked(d));
    const dg = pick(dgs);
    const tier = DUNGEONS.indexOf(dg);
    let floor = rint(Math.min(2, dg.floors - 1), Math.max(1, dg.floors - 1));
    while (floor > 1 && isBossFloor(dg, floor)) floor--;
    const kind = pick(['rescue', 'outlaw', 'find']);
    const ids = SPECIES_IDS.filter(id => !DATA.species[id].lg);
    const client = +pick(ids);
    const prog = (floor - 1) / Math.max(1, dg.floors - 1);
    const lvl = Math.round(dg.lv[0] + (dg.lv[1] - dg.lv[0]) * prog);
    const reward = Math.round((80 + floor * 35) * (1 + tier * 0.8) * MISSION_MONEY_MUL / 20) * 10;
    const m = { id: Date.now() + '' + rand(1e6), dungeon: dg.id, floor, kind, client, reward, lv: lvl + 3 };
    if (Math.random() < 0.4) m.item = pick(['sitrus', 'bigapple', 'elixir', 'reviver', 'candy', 'stone', 'link', 'escape', 'foesleep']);
    if (kind === 'outlaw') {
      const cand = ids.filter(id => DATA.species[id].t.some(t => dg.types.includes(t)));
      const bst = id => DATA.species[id].b.reduce((a, b) => a + b, 0);
      const target = 230 + lvl * 6.5;
      const near = cand.filter(id => Math.abs(bst(id) - target) < 90);
      m.target = +pick(near.length ? near : cand);
    }
    return m;
  }
  function missionText(m) {
    const dg = dungeonById(m.dungeon);
    if (m.kind === 'sos') return `<b>🆘 ${m.online ? '탐험대 구조' : '친구 구조'}</b> ${esc(dg.n)} ${m.floor}F에서 쓰러진 ${m.from ? esc(m.from) + ' 님' : '친구'}의 Lv${m.lv} ${esc(jo(spName(m.client), '을'))} 구해 주세요.`;
    if (m.kind === 'rescue') return `<b>구조</b> ${esc(dg.n)} ${m.floor}F에서 길을 잃은 ${esc(jo(spName(m.client), '을'))} 구해 주세요.`;
    if (m.kind === 'outlaw') return `<b>현상수배</b> ${esc(dg.n)} ${m.floor}F에 숨은 Lv${m.lv} ${esc(jo(spName(m.target), '을'))} 쓰러뜨려 주세요.`;
    return `<b>탐색</b> ${esc(jo(spName(m.client), '이'))} ${esc(dg.n)} ${m.floor}F에 떨어뜨린 물건을 찾아 주세요.`;
  }
  const rewardText = m => m.kind === 'sos' ? `₽${m.reward} + ${m.online ? '구조 보답(무작위 아이템·돈)' : 'A-OK 코드'}` : `₽${m.reward}${m.item ? ` + ${ITEMS[m.item].icon}${ITEMS[m.item].n}` : ''}`;

  let ccOpen = null;   // 휴대폰에서 캐릭터 카드를 펼쳐 두었는지
  function renderTown() {
    if (onlineBoot) presenceTick();   // 마을에 오면 접속자 수가 오래됐을 때만 다시 센다
    const sp = save.current, ch = save.roster[sp], d = DATA.species[sp];
    const st = applyBoost(calcStats(sp, ch.lv, 31), ch.boost);
    const need = expFor(ch.lv + 1) - expFor(ch.lv), have = ch.exp - expFor(ch.lv);
    document.getElementById('town-money').textContent = `₽ ${save.money}`;
    document.getElementById('town-day').textContent = `${save.day}일째`;
    const un = document.getElementById('update-note');
    un.hidden = !updateVer; un.textContent = updateVer ? `🔔 새 버전 v${updateVer} — 눌러서 새로고침` : '';
    document.getElementById('char-card').innerHTML = `
      <div class="cc-top">${portraitImg(sp, 'portrait big', 'Normal', ch.shiny)}
        <div><div class="cc-name">${esc(d.n)} ${medalIcons(sp)}</div><div class="dim">No.${dexNo(sp)} ${esc(d.e)}</div><div>${typeBadges(d.t)}</div>
        <div class="cc-lv">Lv <b>${ch.lv}</b></div></div></div>
      <details class="cc-more"${(ccOpen ?? !matchMedia('(max-width: 800px)').matches) ? ' open' : ''}><summary>능력치 · 특성 · 기술 보기</summary>
      <div class="bar-l">EXP <span class="bar"><i style="width:${ch.lv >= MAX_LEVEL ? 100 : clamp(have / need * 100, 0, 100)}%;background:#6cf"></i></span></div>
      <table class="stats">
        <tr><td>HP</td><td>${st.maxhp}</td><td>공격</td><td>${st.atk}</td></tr>
        <tr><td>방어</td><td>${st.def}</td><td>특공</td><td>${st.spa}</td></tr>
        <tr><td>특방</td><td>${st.spd}</td><td>스피드</td><td>${st.spe}</td></tr></table>
      <div class="cc-ability">지닌 물건 ${ch.held ? `${ITEMS[ch.held].icon} <b>${esc(ITEMS[ch.held].n)}</b>` : '<span class="dim">없음</span>'}</div>
      <div class="cc-ability">특성 <span class="ab-link" data-ability="${entryAbility(sp, ch)}">${esc(abilityName(entryAbility(sp, ch)))}</span></div>
      <div class="cc-moves">${ch.moves.map(m => `<div class="move-row clickable" data-move="${m}" title="클릭하면 기술 설명">${moveLine(m)}</div>`).join('') || '<div class="dim">배운 기술이 없습니다</div>'}</div></details>`;
    const det = document.querySelector('#char-card .cc-more'); det.ontoggle = () => { ccOpen = det.open; };
    document.querySelectorAll('#town-tabs button').forEach(b => b.classList.toggle('on', b.dataset.tab === tab));
    const el = document.getElementById('tab-content');
    el.innerHTML = ({ dungeon: tabDungeon, mission: tabMission, shop: tabShop, storage: tabStorage, bag: tabBag, char: tabChar, dex: Dex.render, ach: Progress.renderAch, info: tabInfo })[tab]();
    if (tab === 'dex') Dex.wire(el);
    if (tab === 'mission') checkOnline();
    el.onclick = e => { const b = e.target.closest('[data-act]'); if (b && !b.disabled) onAction(b.dataset.act, b.dataset.arg); };
  }

  const bagSlots = () => save.bag.length;
  function bagAdd(id, n = 1) {
    if (ITEMS[id].stack) { const e = save.bag.find(b => b.id === id); if (e) { e.n += n; return true; } if (bagSlots() >= bagMax()) return false; save.bag.push({ id, n }); return true; }
    if (bagSlots() >= bagMax()) return false;
    save.bag.push({ id, n: 1 }); return true;
  }
  const storeAdd = (id, n = 1) => { save.storage[id] = (save.storage[id] || 0) + n; };
  const storageUsed = () => storageUsedOf(save.storage);
  const storageRoom = (id, n) => storageUsed() + (ITEMS[id].stack ? (save.storage[id] ? 0 : 1) : n) <= save.storageMax;
  const itemLabel = id => `<span class="ico">${ITEMS[id].icon}</span> <b>${esc(ITEMS[id].n)}</b>`;

  const DG_TABS = [['normal', '🗺 일반 던전', d => d.mode === 'normal' && !d.theme], ['theme', '👑 테마 던전', d => !!d.theme],
    ['rogue', '🌀 로그라이크', d => d.mode === 'rogue' && !d.daily], ['daily', '🗓 오늘의 도전', d => false]];
  // ── 포켓몬별 클리어 기록과 메달 (오늘의 도전 제외) ──
  const MEDALS = [
    { k: 'normal', icon: '🎖', n: '일반 던전 정복', d: '일반 던전을 모두 클리어' },
    { k: 'theme', icon: '👑', n: '테마 던전 정복', d: '테마 던전을 모두 클리어' },
    { k: 'rogue', icon: '🌀', n: '로그라이크 정복', d: '로그라이크 던전을 모두 클리어' },
    { k: 'all', icon: '🏆', n: '완전 정복', d: '일반·테마·로그라이크 던전을 모두 클리어' },
  ];
  const medalDungeons = k => DUNGEONS.filter(DG_TABS.find(t => t[0] === k)[2]);
  // 진화 전 모습의 기록도 합친다 (그 모습을 따로 데리고 있지 않을 때: 예전 세이브는 진화할 때 기록을 옮기지 않았다)
  const clearsOf = sp => {
    const all = save.clears || {};
    let c = { ...all[sp] };
    for (const pre of preEvos(sp)) if (all[pre] && !save.roster[pre]) c = { ...all[pre], ...c };
    return c;
  };
  function medalsOf(sp) {
    const c = clearsOf(sp), got = {};
    for (const k of ['normal', 'theme', 'rogue']) { const list = medalDungeons(k); got[k] = list.length > 0 && list.every(d => c[d.id]); }
    got.all = got.normal && got.theme && got.rogue;
    return MEDALS.filter(m => got[m.k]);
  }
  const medalIcons = sp => medalsOf(sp).map(m => `<span class="medal" title="${esc(m.n)}: ${esc(m.d)}">${m.icon}</span>`).join('');
  // 던전 클리어를 기록하고, 새로 받은 메달을 돌려준다
  function recordClear(sp, dg) {
    if (dg.daily || !DG_TABS.some(t => t[0] !== 'daily' && t[2](dg))) return [];
    const before = medalsOf(sp).map(m => m.k);
    save.clears = save.clears || {};
    save.clears[sp] = { ...(save.clears[sp] || {}), [dg.id]: 1 };
    return medalsOf(sp).filter(m => !before.includes(m.k));
  }
  function medalSection(sp) {
    const c = clearsOf(sp), got = medalsOf(sp).map(m => m.k);
    return `<div class="medal-list">${MEDALS.map(m => {
      const list = m.k === 'all' ? DUNGEONS.filter(d => ['normal', 'theme', 'rogue'].some(k => DG_TABS.find(t => t[0] === k)[2](d))) : medalDungeons(m.k);
      const n = list.filter(d => c[d.id]).length;
      return `<div class="medal-row${got.includes(m.k) ? ' got' : ''}"><span class="medal">${m.icon}</span><b>${esc(m.n)}</b> <span class="dim">${esc(m.d)} · ${n}/${list.length}</span></div>`;
    }).join('')}</div>`;
  }

  function tabDungeon() {
    const cur = DG_TABS.find(t => t[0] === dgTab) || DG_TABS[0];
    const nav = `<div class="dex-tabs dg-tabs">${DG_TABS.map(([k, n, f]) => {
      const list = DUNGEONS.filter(f), open = list.filter(unlocked).length;
      return `<button class="${k === dgTab ? 'on' : ''}" data-act="dgtab" data-arg="${k}">${n}${list.length ? ` <span class="dim">${open}/${list.length}</span>` : ''}</button>`;
    }).join('')}</div>`;
    // 일반·테마 던전은 열리는 순서대로 (적 레벨 순). 목록 자체의 순서는 SOS 코드 때문에 그대로 둔다
    const byLevel = (a, b) => a.mode === 'rogue' || b.mode === 'rogue' ? 0 : a.lv[0] - b.lv[0] || a.lv[1] - b.lv[1];
    const mine = clearsOf(save.current), curList = DUNGEONS.filter(cur[2]).sort(byLevel);
    const medal = MEDALS.find(m => m.k === dgTab);
    const progress = dgTab === 'daily' ? '' : `<div class="dg-progress">${portraitImg(save.current, 'portrait xs', 'Normal', save.roster[save.current]?.shiny)} <span><b>${esc(spName(save.current))}</b>${jo(spName(save.current), '으로').slice(spName(save.current).length)} 클리어 <b>${curList.filter(d => mine[d.id]).length}</b>/${curList.length}</span>
      ${medal ? (medalsOf(save.current).some(m => m.k === medal.k) ? `<span class="medal-got">${medal.icon} ${esc(medal.n)}!</span>` : `<span class="dim">· 모두 클리어하면 ${medal.icon} ${esc(medal.n)} 메달</span>`) : ''}</div>`;
    if (dgTab === 'daily') return nav + `<div class="cards">${Progress.dailyCard()}</div>`;
    return nav + progress + `<div class="cards">${curList.map(dg => {
      const ok = unlocked(dg);
      const ms = save.missions.accepted.filter(m => m.dungeon === dg.id).length;
      const types = dg.types ? typeBadges(dg.types) : '<span class="type" style="background:#777">모든 타입</span>';
      return `<div class="card dg ${dg.mode} ${ok ? '' : 'locked'}" style="--c1:${dg.pal[1]};--c2:${dg.pal[2]}">
        <div class="dg-head"><b>${esc(dg.n)}</b> ${dg.mode === 'rogue' ? '<i class="rogue">로그라이크</i>' : ''}${save.cleared[dg.id] ? '<i class="clear">클리어</i>' : ''}${mine[dg.id] ? `<i class="clear me" title="${esc(jo(spName(save.current), '으로'))} 클리어했다">✔ ${esc(spName(save.current))}</i>` : ''}</div>
        <div class="dim">${dg.floors}층 · 적 Lv ${dg.lv[0]}~${dg.lv[1]}${save.best[dg.id] ? ` · 최고 ${save.best[dg.id]}F` : ''}</div>
        <div>${types}</div>
        ${dg.wx && dg.wx.length ? `<div class="note">날씨: ${dg.wx.map(([w, p]) => `${WEATHERS[w].icon}${WEATHERS[w].n} ${Math.round(p * 100)}%`).join(' · ')}</div>` : ''}
        ${dg.legend ? `<div class="note theme">👑 최종 보스: 전설 포켓몬 ${bossPool(dg).length}종 중 하나 (무작위)</div>` : ''}
        ${dg.theme ? `<div class="note theme">👑 ${esc(dg.theme)} — 최종 보스 ${bossPool(dg).map(spName).join(' / ') || '?'}${bossPool(dg).length > 1 ? ' 중 하나' : ''}${midPool(dg).length ? ` · 중간 보스 ${dg.mid.floors.join(', ')}층` : ''}</div>` : ''}
        ${dg.mode === 'rogue' ? `<div class="note">입장 시 Lv${ROGUE_LEVEL}, 가방 초기화. 나오면 원래대로 돌아갑니다.</div>` : ''}
        ${ms ? `<div class="note ms">📜 진행 중인 임무 ${ms}개</div>` : ''}
        <div class="dg-btns">${sosLocked(dg.id) ? '<button class="btn" disabled title="구조를 받거나 포기하면 다시 들어갈 수 있어요">🆘 구조 대기 중</button>'
          : `<button class="btn" data-act="go" data-arg="${dg.id}" ${ok ? '' : 'disabled'}>${ok ? '출발' : `🔒 ${esc(dungeonById(dg.req).n)} 클리어 필요`}</button>`}
          <button class="btn ghost" data-act="dg-info" data-arg="${dg.id}" title="나오는 적과 아이템">ℹ 정보</button></div></div>`;
    }).join('')}</div>`;
  }

  // ── 던전 정보: 나오는 적, 보스, 아이템, 특징 ──
  function itemGroup(id) {
    const it = ITEMS[id];
    if (it.tm) return 'tm';
    if (it.held) return 'held';
    if (VITAMINS[id] || GUMMIES[id] || ['candy', 'abcapsule', 'abpatch', 'reviver'].includes(id)) return 'rare';
    if (it.use === 'cureOne' || it.use === 'chesto' || ['lum', 'leppa', 'liechi', 'ganlon', 'petaya', 'apicot', 'salac', 'starf', 'lansat', 'oran', 'sitrus'].includes(id)) return 'berry';
    if (it.use === 'food' || it.use === 'heal' || it.use === 'healPct' || it.use === 'fullheal' || it.use === 'cure' || it.use === 'pp') return 'heal';
    if (it.throw) return 'throw';
    return 'misc';
  }
  function showDungeonInfo(id) {
    const dg = id === 'daily' ? Progress.setupDaily() : dungeonById(id);
    if (!dg) return;
    const floorLv = f => Math.round(dg.lv[0] + (dg.lv[1] - dg.lv[0]) * (dg.floors > 1 ? (f - 1) / (dg.floors - 1) : 0));
    // 출현 포켓몬: 층 구간마다 후보를 모은다
    const band = dg.floors <= 10 ? Math.ceil(dg.floors / 2) : 5;
    const bands = [];
    for (let a = 1; a <= dg.floors; a += band) {
      const b = Math.min(dg.floors, a + band - 1), set = new Set();
      for (let f = a; f <= b; f++) if (!isBossFloor(dg, f) || f !== dg.floors) Dungeon.floorCandidates(dg, f).cand.forEach(o => set.add(o.id));
      bands.push({ a, b, ids: [...set].sort((x, y) => x - y) });
    }
    const mon = ids => `<div class="roster dg-mons">${ids.map(k => `<button class="rcard${Progress.isSeen(k) ? '' : ' unseen'}" data-dexpoke="${k}">${portraitImg(k, 'portrait sm')}<span>${esc(spName(k))}</span></button>`).join('')}</div>`;
    const seenIn = ids => ids.filter(k => Progress.isSeen(k)).length;
    // 보스
    const finals = bossPool(dg).length ? bossPool(dg) : BOSSES[dg.id] && DATA.species[BOSSES[dg.id]] ? [BOSSES[dg.id]] : [];
    const bossHtml = `<h3>보스</h3>
      <div class="row"><span class="grow"><b>${dg.floors}층 (최종)</b> ${finals.length ? finals.map(spName).join(' / ') + (finals.length > 1 ? ' 중 하나' : '') : '그 층 후보 중 가장 강한 포켓몬'} · Lv${floorLv(dg.floors) + 3}</span></div>
      ${finals.length ? mon(finals) : ''}
      ${midPool(dg).length ? `<div class="row"><span class="grow"><b>중간 보스 ${dg.mid.floors.join(', ')}층</b> 아래 중 하나씩 (한 탐험에서 겹치지 않음)</span></div>${mon(midPool(dg))}` : ''}
      ${dg.mode === 'rogue' ? '<p class="dim">10층마다 그 층 후보 중 가장 강한 포켓몬이 중간 보스로 나온다.</p>' : ''}
      <p class="dim">보스는 HP 3.5배, 공격·방어·특공·특방 1.1배, 레벨 +3. 쓰러뜨리면 계단이 나타나고 돈과 좋은 아이템을 준다.</p>`;
    // 특징
    const firstAt = lv => { for (let f = 1; f <= dg.floors; f++) if (floorLv(f) >= lv) return f; return 0; };
    const trapF = firstAt(FEATURE_LV.trap), shopF = firstAt(FEATURE_LV.shop), houseF = firstAt(FEATURE_LV.house);
    const feat = [
      `적 레벨 ${dg.lv[0]} ~ ${dg.lv[1]} (층마다 점점 강해짐)`,
      dg.wx && dg.wx.length ? `날씨: ${dg.wx.map(([w, p]) => `${WEATHERS[w].icon}${WEATHERS[w].n} ${Math.round(p * 100)}%`).join(' · ')} (층마다 결정)` : '날씨 없음',
      trapF ? `함정: ${trapF}층부터` : '함정 없음',
      shopF ? `켈리몬 상점: ${shopF}층부터 층마다 ${Math.round(SHOP_CHANCE * 100)}%` : '켈리몬 상점 없음',
      houseF ? `몬스터하우스: ${houseF}층부터 층마다 ${Math.round(HOUSE_CHANCE * 100)}%` : '몬스터하우스 없음',
      dg.legend ? `최종 보스는 전설 포켓몬 ${bossPool(dg).length}종 중 하나가 무작위로 나온다` : '',
      dg.extra ? `${dg.theme} 시리즈가 일반 적으로도 섞여 나온다` : '',
      `한 층에 머물 수 있는 시간: ${WIND.limit}턴 (넘으면 바람에 날려감)`,
      dg.mode === 'rogue' ? `로그라이크: Lv${ROGUE_LEVEL}, 기본 가방으로 입장` : '',
    ].filter(Boolean);
    // 아이템: 마지막 층 기준 드롭 확률 (앞쪽 층은 등급이 낮은 아이템만)
    const table = dropTable(dg.lv[1], dg);
    const total = table.reduce((a, d) => a + d[1], 0);
    const groups = { heal: ['🍎 회복·음식', []], berry: ['🍒 열매', []], throw: ['📌 던지는 도구', []], misc: ['🔮 씨앗·구슬·기타', []], rare: ['💎 희귀 (영양제·구미·사탕 등)', []], held: ['🎗 지닌 물건', []], tm: ['💿 기술머신', []] };
    const merged = {};
    for (const [iid, w] of table) merged[iid] = (merged[iid] || 0) + w;
    const tiers = Object.entries(TIER_LV).filter(([t, lv]) => +t > 1 && lv <= dg.lv[1]).map(([t, lv]) => [TIER_NAMES[t], firstAt(lv)]);
    const highF = firstAt(HIGH_LV);
    const tierNote = (!tiers.length ? '흔한 아이템만 나온다' : tiers.every(([, f]) => f <= 1) ? '처음부터 좋은 등급이 나온다'
      : `좋은 아이템은 깊은 층부터: ${tiers.map(([n, f]) => `${n} ${f}층~`).join(', ')}`)
      + (highF ? ` · ${highF}층부터는 흔한 아이템 대신 식량·회복만` : '');
    for (const [iid, w] of Object.entries(merged)) groups[itemGroup(iid)][1].push([iid, w]);
    const pctT = w => { const p = w / total * 100; return p >= 1 ? p.toFixed(1) + '%' : p >= 0.1 ? p.toFixed(2) + '%' : p.toFixed(3) + '%'; };
    const itemHtml = Object.values(groups).filter(g => g[1].length).map(([name, list]) => {
      list.sort((a, b) => b[1] - a[1]);
      const sum = list.reduce((a, x) => a + x[1], 0);
      const many = list.length > 14;
      return `<details${many ? '' : ' open'}><summary><b>${name}</b> <span class="dim">합계 ${pctT(sum)} · ${list.length}종${many ? ' (눌러서 펼치기)' : ''}</span></summary>
        <div class="dg-items">${list.map(([iid, w]) => `<span class="dg-item" data-dexitem="${iid}">${ITEMS[iid].icon} ${esc(ITEMS[iid].n)} <i class="dim">${pctT(w)}</i></span>`).join('')}</div></details>`;
    }).join('');
    const allIds = new Set(bands.flatMap(b => b.ids));
    const sigHere = sigItemsFor([...allIds, ...finals, ...midPool(dg)]);
    const megaHere = dg.lv[1] >= MEGA_MIN_LV ? megaPool(dg) : [];
    UI.open({
      title: `${esc(dg.n)} 정보`, wide: true,
      html: `<div class="dg-info">
        <p>${dg.floors}층 · ${dg.mode === 'rogue' ? '로그라이크' : '일반'} 던전${dg.theme ? ` · 👑 ${esc(dg.theme)}` : ''} · ${dg.types ? typeBadges(dg.types) : '<span class="type" style="background:#777">모든 타입</span>'}
          ${dg.req ? `<br><span class="dim">${esc(jo(dungeonById(dg.req).n, '을'))} 클리어하면 열림</span>` : ''}</p>
        <ul class="dg-feat">${feat.map(x => `<li>${x}</li>`).join('')}</ul>
        ${bossHtml}
        <h3>나오는 포켓몬 <span class="dim">${seenIn([...allIds])}/${allIds.size}종 만남 · 층마다 이 중 6종이 무작위로 등장${!dg.extra && [...PARADOX_PAST, ...PARADOX_FUTURE].some(id => allIds.has(id)) ? ' (패러독스 포켓몬은 드물게)' : ''} · 어두운 것은 아직 못 만난 포켓몬</span></h3>
        ${bands.map((b, i) => `<details${i === 0 ? ' open' : ''}><summary><b>${b.a === b.b ? b.a : `${b.a}~${b.b}`}층</b> <span class="dim">Lv${floorLv(b.a)}~${floorLv(b.b)} · ${b.ids.length}종 (만남 ${seenIn(b.ids)})</span></summary>${mon(b.ids)}</details>`).join('')}
        <h3>나오는 아이템 <span class="dim">마지막 층 기준 확률 · 한 층에 아이템 ${ITEMS_PER_FLOOR[0]}~${ITEMS_PER_FLOOR[1]}개, 돈 2~4무더기 · ${tierNote}</span></h3>
        ${itemHtml}
        ${megaHere.length ? `<p><b>🔮 메가스톤</b> <span class="dim">레벨 ${MEGA_MIN_LV} 이상인 층에서만 · 보스·이로치 ${MEGA_RATE.boss * 100}%, 바닥 아이템·적이 떨어뜨리는 아이템 ${MEGA_RATE.floor * 100}% · 던전 타입에 맞는 ${megaHere.length}종</span>
          <details><summary class="dim">눌러서 펼치기</summary><div class="dg-items">${megaHere.map(iid => `<span class="dg-item" data-dexitem="${iid}">${ITEMS[iid].icon} ${esc(ITEMS[iid].n)}</span>`).join('')}</div></details></p>` : ''}
        ${sigHere.length ? `<p><b>전용 도구</b> <span class="dim">주인 포켓몬이 나오는 층에서 드물게 떨어진다 (보스가 주인이면 더 자주)</span><br>${sigHere.map(iid => `<span class="dg-item" data-dexitem="${iid}">${ITEMS[iid].icon} ${esc(ITEMS[iid].n)}</span>`).join(' ')}</p>` : ''}
      </div>`,
      choices: [{ label: '닫기', fn: () => {} }],
    });
  }

  function tabMission() {
    const acc = save.missions.accepted;
    return `${sosSection()}
      <h3>진행 중인 임무 (${acc.length}/4)</h3>
      ${acc.length ? acc.map(m => `<div class="row">${portraitImg(m.kind === 'outlaw' ? m.target : m.client, 'portrait sm', m.kind === 'sos' ? 'Pain' : 'Normal', !!m.shiny)}<div class="grow">${missionText(m)}<div class="dim">보상 ${rewardText(m)}</div></div>
        <button class="btn sm ghost" data-act="drop-mission" data-arg="${m.id}">취소</button></div>`).join('') : '<p class="dim">받은 임무가 없습니다.</p>'}
      <h3>게시판 <span class="dim">(던전에서 돌아오면 새 의뢰가 붙습니다)</span></h3>
      ${save.missions.board.map(m => `<div class="row">${portraitImg(m.kind === 'outlaw' ? m.target : m.client, 'portrait sm')}<div class="grow">${missionText(m)}<div class="dim">보상 ${rewardText(m)}</div></div>
        <button class="btn sm" data-act="take-mission" data-arg="${m.id}" ${acc.length >= 4 ? 'disabled' : ''}>수락</button></div>`).join('') || '<p class="dim">의뢰가 없습니다.</p>'}`;
  }

  function tabShop() {
    return `<h3>켈리몬 상점 <button class="btn sm ghost" data-act="shop-reroll" ${save.money < SHOP_REROLL_COST ? 'disabled' : ''} title="오늘 진열을 새로 뽑는다">🔄 새로고침 ₽${SHOP_REROLL_COST}</button></h3><div class="grid2">
      ${save.shop.map(id => `<div class="row">${itemLabel(id)}<span class="grow dim">${esc(ITEMS[id].d)}</span>
        <button class="btn sm" data-act="buy" data-arg="${id}" ${save.money < ITEMS[id].price ? 'disabled' : ''}>₽${ITEMS[id].price}${ITEMS[id].stack ? ' (5개)' : ''}</button></div>`).join('')}</div>
      <h3>팔기 <span class="dim">(가방의 아이템)</span></h3>
      ${save.bag.length ? save.bag.map((b, i) => `<div class="row">${itemLabel(b.id)}${b.n > 1 ? ' ×' + b.n : ''}<span class="grow"></span>
        <button class="btn sm ghost" data-act="sell" data-arg="${i}">₽${sellPrice(b)}에 팔기</button></div>`).join('') : '<p class="dim">가방이 비어 있습니다.</p>'}`;
  }
  const sellPrice = sellValue;

  // 창고 정렬 (보기만 바뀐다)
  const ITEM_ORDER = Object.keys(ITEMS);
  const STORE_SORTS = { kind: '종류순', name: '이름순', count: '많은 순', new: '넣은 순' };
  const byKind = (a, b) => ITEM_ORDER.indexOf(a) - ITEM_ORDER.indexOf(b);
  function storageIds() {
    const ids = Object.keys(save.storage).filter(k => save.storage[k] > 0 && ITEMS[k]);
    const mode = save.storageSort || 'kind';
    if (mode === 'kind') ids.sort(byKind);
    else if (mode === 'name') ids.sort((a, b) => ITEMS[a].n.localeCompare(ITEMS[b].n, 'ko'));
    else if (mode === 'count') ids.sort((a, b) => save.storage[b] - save.storage[a] || byKind(a, b));
    return ids;
  }
  function tabStorage() {
    const ids = storageIds();
    const sorts = Object.entries(STORE_SORTS).map(([k, n]) => `<button class="btn sm${(save.storageSort || 'kind') === k ? '' : ' ghost'}" data-act="store-sort" data-arg="${k}">${n}</button>`).join('');
    return `${upgradeBox()}<div class="split"><div><h3>창고 (${storageUsed()}/${save.storageMax})</h3>${storageUsed() > save.storageMax ? '<p class="warn">창고가 넘쳤습니다. 정리하기 전까지는 맡길 수 없습니다.</p>' : ''}
      ${ids.length > 1 ? `<div class="row sort-row">↕ ${sorts}</div>` : ''}
      ${ids.length ? ids.map(id => `<div class="row">${itemLabel(id)} ×${save.storage[id]}<span class="grow"></span>
        <button class="btn sm ghost" data-dexitem="${id}" title="아이템 정보">ℹ</button>${id === 'candy' ? ' <button class="btn sm" data-act="use-candy">사용</button>' : ''}
        <button class="btn sm" data-act="withdraw" data-arg="${id}" ${bagSlots() >= bagMax() && !ITEMS[id].stack ? 'disabled' : ''}>꺼내기</button></div>`).join('') : '<p class="dim">창고가 비어 있습니다.</p>'}
      </div><div><h3>가방 (${bagSlots()}/${bagMax()})</h3>
      ${save.bag.map((b, i) => `<div class="row">${itemLabel(b.id)}${b.n > 1 ? ' ×' + b.n : ''}<span class="grow"></span>
        <button class="btn sm ghost" data-act="deposit" data-arg="${i}">맡기기</button></div>`).join('') || '<p class="dim">가방이 비어 있습니다.</p>'}
      ${save.bag.length ? '<button class="btn ghost" data-act="deposit-all">모두 맡기기</button>' : ''}${save.bag.length > 1 ? ' <button class="btn ghost" data-act="sort-bag">↕ 가방 정리</button>' : ''}</div></div>`;
  }

  function upgradeBox() {
    const bc = bagUpgradeCost(save.bagMax), sc = storageUpgradeCost(save.storageMax);
    const bFull = save.bagMax >= BAG_LIMIT, sFull = save.storageMax >= STORAGE_LIMIT;
    return `<div class="upgrades">
      <div class="row">🎒 <span class="grow">가방 <b>${save.bagMax}</b>칸${bFull ? ' (최대)' : ` → ${save.bagMax + BAG_STEP}칸`}</span>
        <button class="btn sm" data-act="up-bag" ${bFull || save.money < bc ? 'disabled' : ''}>${bFull ? '최대' : '₽' + bc + ' 확장'}</button></div>
      <div class="row">📦 <span class="grow">창고 <b>${save.storageMax}</b>칸${sFull ? ' (최대)' : ` → ${save.storageMax + STORAGE_STEP}칸`}</span>
        <button class="btn sm" data-act="up-storage" ${sFull || save.money < sc ? 'disabled' : ''}>${sFull ? '최대' : '₽' + sc + ' 확장'}</button></div></div>`;
  }

  function tabBag() {
    return `${upgradeBox()}<h3>가방 (${bagSlots()}/${bagMax()})</h3>
      <p class="dim">일반 던전에서 쓰러지면 가방 아이템의 절반을 무작위로 잃습니다. 귀중한 아이템은 창고에 맡기세요.</p>
      ${save.bag.length > 1 ? '<button class="btn sm ghost" data-act="sort-bag">↕ 가방 정리 (종류별로 정렬)</button>' : ''}
      ${save.bag.map((b, i) => `<div class="row">${itemLabel(b.id)}${b.n > 1 ? ' ×' + b.n : ''}<span class="grow dim">${esc(ITEMS[b.id].d)}</span>
        ${b.id === 'candy' ? '<button class="btn sm" data-act="use-candy">사용</button>' : ''}
        <button class="btn sm ghost" data-act="deposit" data-arg="${i}">창고로</button>
        <button class="btn sm ghost danger" data-act="discard" data-arg="${i}">버리기</button></div>`).join('') || '<p class="dim">가방이 비어 있습니다.</p>'}`;
  }

  function evoOptions(sp) {
    const ch = save.roster[sp];
    return DATA.species[sp].v.map(([to, lv, item]) => {
      const itemId = item === 1 ? 'stone' : item === 2 ? 'link' : null;
      const hasItem = !itemId || save.bag.some(b => b.id === itemId) || save.storage[itemId] > 0;
      const req = [lv ? `Lv ${lv} 이상` : '', itemId ? ITEMS[itemId].n + ' 필요' : ''].filter(Boolean).join(', ');
      return { to, lv, itemId, ok: ch.lv >= lv && hasItem, req };
    });
  }

  function tabChar() {
    const sp = save.current, ch = save.roster[sp];
    const evos = evoOptions(sp);
    const roster = Object.keys(save.roster).map(Number);
    return `<h3>캐릭터 관리</h3>
      <h3>🏅 ${esc(spName(sp))}의 메달</h3>${medalSection(sp)}
      <div class="btns"><button class="btn" data-act="change-char">🔄 캐릭터 변경</button> <button class="btn" data-act="set-moves">📘 기술 설정</button></div>
      ${DATA.species[sp].sh ? `<h3>모습</h3><div class="row">${portraitImg(sp, 'portrait sm', 'Normal', false)} ${portraitImg(sp, 'portrait sm', 'Normal', true)}
        <span class="grow">${ch.shiny ? '✨ 이로치(색이 다른 모습)로 탐험합니다.' : '보통 모습으로 탐험합니다.'} <span class="dim">(겉모습만 바뀝니다)</span></span>
        ${shinyOk(sp) ? `<button class="btn sm" data-act="toggle-shiny">${ch.shiny ? '보통 모습으로' : '✨ 이로치로'}</button>` : '<span class="dim tiny">🔒 이 포켓몬의 이로치를 쓰러뜨리거나 영입하면 고를 수 있어요</span>'}</div>` : ''}
      ${formSection(sp, ch)}
      <h3>특성 <span class="dim">(누르면 설명. 바꾸려면 ${ITEMS.abcapsule.icon}특성캡슐 ×${ownedCount('abcapsule')}, 숨겨진 특성은 ${ITEMS.abpatch.icon}특성패치 ×${ownedCount('abpatch')}가 필요)</span></h3>
      ${DATA.species[sp].ab.map(([aid, hid]) => { const cur = entryAbility(sp, save.roster[sp]) === aid, x = abilityDesc(aid); return `<div class="row">
        <div class="grow"><span class="ab-link" data-ability="${aid}">${esc(x.n)}</span>${hid ? ' <span class="dim">(숨겨진 특성)</span>' : ''}
        <div class="dim">${esc(x.dungeon || x.exact || x.d)}${x.none ? ' <span class="warn">— 던전에서는 효과 없음</span>' : ''}</div></div>
        <button class="btn sm${cur ? '' : ' ghost'}" data-act="set-ability" data-arg="${aid}" ${cur || !ownedCount(hid ? 'abpatch' : 'abcapsule') ? 'disabled' : ''}>${cur ? '사용 중' : `${ITEMS[hid ? 'abpatch' : 'abcapsule'].icon} 바꾸기`}</button></div>`; }).join('')}
      <h3>기술머신 <span class="dim">(한 번 쓰면 사라지고, 배운 기술은 기술 설정에서 언제든 넣고 뺄 수 있습니다)</span></h3>
      ${tmSection(sp, ch)}
      <h3>영양제 <span class="dim">(능력치를 영구히 올립니다. 일반 던전에서만 적용되고 로그라이크에서는 무시)</span></h3>
      ${vitaminSection(ch)}
      <h3>구미 <span class="dim">(아주 드문 간식. 능력치가 영구히 조금 오르고, 던전에서 먹으면 배도 찹니다)</span></h3>
      ${gummySection(ch)}
      <h3>지닌 물건</h3>
      <div class="row">${ch.held ? `${ITEMS[ch.held].icon} <b>${esc(ITEMS[ch.held].n)}</b><span class="grow dim">${esc(ITEMS[ch.held].d)}</span>
        <button class="btn sm ghost" data-act="unhold">빼기</button>` : '<span class="grow dim">지닌 물건이 없습니다. 상점에서 사거나 던전에서 주울 수 있어요.</span>'}
        <button class="btn sm" data-act="hold">${ch.held ? '바꾸기' : '지니게 하기'}</button></div>
      <h3>진화</h3>
      ${evos.length ? evos.map(e => `<div class="row">${portraitImg(e.to, 'portrait sm')}<div class="grow"><b>${esc(spName(e.to))}</b> ${typeBadges(DATA.species[e.to].t)}<div class="dim">${e.req}</div>${borrowNote(e.to) ? `<div class="dim tiny">${esc(borrowNote(e.to))}</div>` : ''}</div>
        <button class="btn sm" data-act="evolve" data-arg="${e.to}" ${e.ok ? '' : 'disabled'}>진화</button></div>`).join('') : '<p class="dim">더 이상 진화하지 않습니다.</p>'}
      <h3>영입한 포켓몬 <span class="dim">(각자 레벨이 따로 저장됩니다 · 지금 영입 확률 ${(recruitRate(ch.lv) * 100).toFixed(1)}%)</span></h3>
      <div class="roster">${roster.map(id => `<button class="rcard ${id === sp ? 'on' : ''}" data-act="switch" data-arg="${id}">${portraitImg(id, 'portrait sm')}<span>${esc(spName(id))}</span><span class="dim">Lv${save.roster[id].lv}</span></button>`).join('')}</div>`;
  }

  // 폼체인지·메가진화 (js/forms.js): 고를 수 있는 모습은 여기서 고르고, 나머지는 던전에서 바뀌는 방법을 보여준다
  function formSection(sp, ch) {
    const forms = FORMS_OF[sp] || [];
    if (!forms.length) return '';
    const sel = forms.filter(id => DATA.species[id].fc === 'select'), other = forms.filter(id => DATA.species[id].fc !== 'select');
    const card = (id, on, act) => `<button class="rcard ${on ? 'on' : ''}" ${act ? `data-act="set-form" data-arg="${id}"` : `data-dexpoke="${id}"`}>${portraitImg(id, 'portrait sm', 'Normal', ch.shiny)}<span>${esc(id === sp ? '기본 모습' : spName(id))}</span>${id !== sp ? `<span class="dim">${typeBadges(DATA.species[id].t)}</span>` : ''}</button>`;
    return `<h3>다른 모습 <span class="dim">(능력치·타입·특성이 바뀌고 기술은 그대로)</span></h3>
      ${sel.length ? `<p class="dim">던전에 들고 갈 모습을 고르세요.</p><div class="roster">${card(sp, !ch.form, true)}${sel.map(id => card(id, ch.form === id, true)).join('')}</div>` : ''}
      ${other.map(id => `<div class="row">${portraitImg(id, 'portrait sm', 'Normal', ch.shiny)}<div class="grow"><b>${esc(spName(id))}</b> ${typeBadges(DATA.species[id].t)}<div class="dim">${esc(formHowText(id))}</div></div></div>`).join('')}`;
  }
  const ownedCount = id => (save.storage[id] || 0) + save.bag.filter(b => b.id === id).length;
  function vitaminSection(ch) {
    const b = ch.boost || {};
    return `<div class="vit-grid">${Object.entries(VITAMINS).map(([id, [n, k, sn, v]]) => {
      const cnt = b[k] || 0, own = ownedCount(id), full = cnt >= VITAMIN_MAX;
      return `<div class="vit"><div><b>${sn}</b> <span class="dim">+${cnt * v}</span></div>
        <span class="pips">${'●'.repeat(cnt)}${'○'.repeat(VITAMIN_MAX - cnt)}</span>
        <button class="btn sm${own ? '' : ' ghost'}" data-act="vitamin" data-arg="${id}" ${own && !full ? '' : 'disabled'} title="${esc(ITEMS[id].d)}">🥤 ${esc(n)} ×${own}</button></div>`;
    }).join('')}</div>`;
  }
  function gummySection(ch) {
    const b = ch.boost || {};
    const counts = Object.entries(STAT_KO).map(([k, n]) => `<span class="gm-stat"><b>${n}</b> +${(b['g_' + k] || 0) * gummyAmt(k)} <span class="dim">(${b['g_' + k] || 0}/${GUMMY_MAX})</span></span>`).join('');
    const own = Object.keys(GUMMIES).filter(id => ownedCount(id));
    return `<div class="gm-counts">${counts}</div>
      <div class="btns">${own.length ? own.map(id => `<button class="btn sm" data-act="gummy" data-arg="${id}" title="${esc(ITEMS[id].d)}">${ITEMS[id].icon} ${esc(ITEMS[id].n)} ×${ownedCount(id)}</button>`).join(' ')
        : '<span class="dim">가진 구미가 없습니다. 던전 깊은 곳에서 아주 드물게 발견됩니다.</span>'}</div>`;
  }
  function useGummy(id) {
    const g = ITEMS[id], ch = save.roster[save.current];
    ch.boost = { ...(ch.boost || {}) };
    const up = g.gummy.filter(k => (ch.boost['g_' + k] || 0) < GUMMY_MAX);
    if (!up.length || !ownedCount(id)) { UI.toast('더 이상 오르지 않습니다.'); return; }
    takeItem(id);
    up.forEach(k => { ch.boost['g_' + k] = (ch.boost['g_' + k] || 0) + 1; });
    Sound.play('levelup');
    UI.toast(`${jo(spName(save.current), '은')} ${jo(g.n, '을')} 먹었다! ${up.map(k => `${STAT_KO[k]} +${gummyAmt(k)}`).join(', ')}`);
  }
  function useVitamin(id) {
    const [n, k, sn, v] = VITAMINS[id], ch = save.roster[save.current];
    ch.boost = ch.boost || {};
    if ((ch.boost[k] || 0) >= VITAMIN_MAX || !ownedCount(id)) return;
    const bi = save.bag.findIndex(b => b.id === id);
    if (bi >= 0) save.bag.splice(bi, 1); else { save.storage[id]--; if (save.storage[id] <= 0) delete save.storage[id]; }
    ch.boost[k] = (ch.boost[k] || 0) + 1;
    Sound.play('levelup');
    UI.toast(`${jo(spName(save.current), '은')} ${jo(n, '을')} 먹었다! ${jo(sn, '이')} ${v} 올랐다!`);
    Progress.check();
  }

  // 이상한사탕: 마을에서도 지금 캐릭터의 레벨을 1 올린다 (새로 배우는 기술은 빈 칸에, 나머지는 기술 설정에서)
  async function useCandy() {
    const sp = save.current, ch = save.roster[sp];
    if (!ownedCount('candy')) return;
    if (ch.lv >= MAX_LEVEL) { UI.toast('이미 최고 레벨입니다.'); return; }
    if (!(await UI.confirm('이상한사탕', `<p>${esc(spName(sp))}에게 이상한사탕을 먹입니다. (Lv${ch.lv} → Lv${ch.lv + 1})</p>`, '먹인다', '그만둔다'))) return;
    takeItem('candy');
    ch.lv++; ch.exp = Math.pow(ch.lv, 3);   // 그 레벨의 시작 경험치 (expFor는 최고 레벨에서 Infinity)
    const learned = learnedAt(sp, ch.lv).filter(mid => !ch.moves.includes(mid));
    const added = learned.filter(mid => ch.moves.length < 4 && ch.moves.push(mid));
    Progress.max('maxLv', ch.lv); Progress.check();
    Sound.play('levelup'); persist(); renderTown();
    const rest = learned.filter(mid => !added.includes(mid));
    UI.alert('레벨 업!', `<div class="center">${portraitImg(sp, 'portrait big', 'Joyous', ch.shiny)}</div><p class="center">${esc(spName(sp))}의 레벨이 올랐다! <b>Lv${ch.lv}</b></p>
      ${added.length ? `<p class="center">새 기술: ${added.map(mid => esc(DATA.moves[mid].n)).join(', ')}</p>` : ''}
      ${rest.length ? `<p class="center dim">새로 배울 수 있는 기술: ${rest.map(mid => esc(DATA.moves[mid].n)).join(', ')} (기술 설정에서 고르세요)</p>` : ''}
      ${evoOptions(sp).some(e => e.ok) ? '<p class="center">✨ 진화할 수 있어요! 캐릭터 탭에서 진화하세요.</p>' : ''}`);
  }

  // 특성 바꾸기: 일반 특성은 특성캡슐, 숨겨진 특성은 특성패치를 하나 쓴다
  function takeItem(id) {
    const bi = save.bag.findIndex(b => b.id === id);
    if (bi >= 0) save.bag.splice(bi, 1); else { save.storage[id]--; if (save.storage[id] <= 0) delete save.storage[id]; }
  }
  async function changeAbility(aid) {
    const sp = save.current, ch = save.roster[sp];
    const slot = DATA.species[sp].ab.find(a => a[0] === aid); if (!slot) return;
    const need = slot[1] ? 'abpatch' : 'abcapsule', it = ITEMS[need];
    if (!ownedCount(need)) { UI.alert('특성 바꾸기', `<p>${it.icon} <b>${esc(jo(it.n, '이'))}</b> 필요합니다.</p><p class="dim">마을 상점에 가끔 진열되고, 던전에서 드물게 주울 수 있어요.</p>`); return; }
    const ok = await UI.confirm('특성 바꾸기', `<p>${esc(spName(sp))}의 특성을 <b>${esc(abilityName(entryAbility(sp, ch)))}</b> → <b>${esc(jo(abilityName(aid), '으로'))}</b> 바꿉니다.${slot[1] ? ' <span class="dim">(숨겨진 특성)</span>' : ''}</p>
      <p>${it.icon} ${esc(it.n)} 1개를 사용합니다. <span class="dim">(가진 개수 ${ownedCount(need)})</span></p>`, '바꾼다', '그만둔다');
    if (!ok) return;
    takeItem(need);
    ch.ability = aid;
    Sound.play('item');
    persist(); renderTown();
    UI.toast(`특성을 ${jo(abilityName(aid), '으로')} 바꿨습니다.`);
  }

  // 사용자 타일셋(DTEF) 설정 화면. 지금은 꺼져 있다 (tiles.js의 CUSTOM_TILESETS)
  function tilesetSection(s) {
    return `<h3>던전 타일셋 <span class="dim">(선택 사항)</span></h3>
      <p class="dim">기본은 게임이 직접 그린 타일입니다. 직접 구한 <b>DTEF 형식</b> 타일셋 PNG(가로:세로 18:8, 예: 432×192)를 불러오면 그 던전의 벽·바닥이 바뀝니다.
        변형 타일(<code>tileset_1.png</code>, <code>tileset_2.png</code>)도 함께 선택하면 섞어서 그립니다.
        불러온 파일은 이 브라우저에만 저장되고, 게임 파일에는 포함되지 않습니다. 게임 폴더의 <code>tiles/던전ID.png</code>(변형은 <code>던전ID_1.png</code>, <code>던전ID_2.png</code> / 공통은 <code>default.png</code>)에 넣어도 됩니다.</p>
      <label class="chk"><input type="checkbox" data-set="useTileset" ${s.useTileset !== false ? 'checked' : ''}> 불러온 타일셋 사용 (끄면 기본 타일)</label>
      <div class="tileset-list">${[{ id: '*', n: '모든 던전 공통' }, ...DUNGEONS].map(d => {
        const st = d.id === '*' ? (Tiles.uploaded['*'] ? '불러옴' : '') : Tiles.status(d.id);
        return `<div class="row"><span class="grow">${esc(d.n)} <span class="dim">${d.id === '*' ? '' : d.id}</span> ${st ? `<span class="tag">${st}</span>` : ''}</span>
          <label class="btn sm ghost">PNG 불러오기<input type="file" accept="image/png" multiple data-tileset="${d.id}" hidden></label>
          ${Tiles.uploaded[d.id] ? `<button class="btn sm ghost danger" data-act="tileset-del" data-arg="${d.id}">삭제</button>` : ''}</div>`;
      }).join('')}</div>`;
  }

  // 배경음악 파일 설정: music/ 폴더에 넣거나 여기서 불러온다 (불러온 파일은 이 브라우저에만 저장)
  function musicSection() {
    const rows = [{ id: 'title', n: '타이틀 (없으면 마을 곡)' }, { id: 'town', n: '마을' }, { id: 'boss', n: '보스전' }, { id: 'dungeon', n: '던전 공통 (던전별 파일이 없을 때)' },
      ...DUNGEONS.filter(d => !d.daily).map(d => ({ id: d.id, n: d.n }))];   // 오늘의 도전은 날마다 던전 곡 중 하나
    return `<h3>배경음악 파일 <span class="dim">(선택 사항)</span></h3>
      <p class="dim">기본은 게임이 직접 합성한 배경음입니다. 음악 파일(ogg / mp3 / m4a / wav)을 불러오거나 게임 폴더의 <code>music/이름.ogg</code>에 넣으면 그 곡을 반복 재생합니다.
        파일이 없는 곳은 합성 배경음이 나옵니다. 불러온 파일은 이 브라우저에만 저장되고 게임 파일에는 포함되지 않습니다.</p>
      <div class="tileset-list">${rows.map(r => `<div class="row"><span class="grow">${esc(r.n)} <span class="dim">music/${r.id}.ogg</span> ${Sound.uploaded.has(r.id) ? '<span class="tag">불러옴</span>' : ''}</span>
        <button class="btn sm ghost" data-act="music-loop" data-arg="${r.id}" title="인트로 뒤 반복 구간 설정">🔁 루프</button>
        <label class="btn sm ghost">파일 불러오기<input type="file" accept="audio/*,.ogg,.mp3,.m4a,.wav" data-music="${r.id}" hidden></label>
        ${Sound.uploaded.has(r.id) ? `<button class="btn sm ghost danger" data-act="music-del" data-arg="${r.id}">삭제</button>` : ''}</div>`).join('')}</div>`;
  }

  // 곡의 루프 구간 설정
  async function musicLoopDialog(key) {
    const info = await Sound.loopInfo(key);
    if (!info) { UI.alert('루프 설정', `<p>이 곡의 음악 파일이 없습니다. <code>music/${esc(key)}.ogg</code>에 넣거나 파일을 불러오세요.</p>`); return; }
    const f = v => (v == null ? '' : (+v).toFixed(3));
    const src = info.user ? '정보 탭에서 설정한 값' : info.cfg ? 'music/loops.js' : info.tags ? '파일 안의 루프 정보' : '없음 (곡 전체 반복)';
    const m = UI.open({
      title: `🔁 루프 구간 — ${esc(key)}`, wide: true,
      html: `<p>곡 길이 <b>${info.dur.toFixed(2)}초</b> · 지금 쓰는 루프: <b>${info.use ? `${f(info.use.start)}초 ~ ${f(info.use.end)}초` : '곡 전체'}</b> <span class="dim">(${src})</span></p>
        ${info.tags ? `<p class="dim">파일 안의 루프 정보: ${f(info.tags.start)}초 ~ ${info.tags.end ? f(info.tags.end) + '초' : '끝'}</p>` : ''}
        ${info.cfg ? `<p class="dim">music/loops.js: ${f(info.cfg.start)}초 ~ ${info.cfg.end ? f(info.cfg.end) + '초' : '끝'}</p>` : ''}
        <div class="loop-form"><label>루프 시작 <input type="number" step="0.001" min="0" id="lp-s" value="${f(info.use ? info.use.start : 0)}">초</label>
          <label>루프 끝 <input type="number" step="0.001" min="0" id="lp-e" value="${f(info.use ? info.use.end : info.dur)}">초</label></div>
        <p class="dim">곡이 루프 끝에 닿으면 루프 시작으로 돌아갑니다. 끝을 비우면 곡 끝까지.
          ${info.exact ? '' : '<br>⚠ 게임을 파일로 직접 열면(file://) 브라우저 제한 때문에 연결 부분에서 아주 짧게 끊길 수 있어요. 파일 안의 루프 정보도 읽지 못해서, 여기서 설정하거나 music/loops.js에 적어야 합니다.'}</p>`,
      choices: [
        { label: '저장', fn: () => { Sound.endPreview(); const s0 = +document.getElementById('lp-s').value || 0, e0 = +document.getElementById('lp-e').value || 0; Sound.setLoop(key, { start: s0, end: e0 }); UI.toast('루프 구간을 저장했습니다.'); renderTown(); } },
        { label: '🎧 연결 부분 들어 보기 (저장된 값 기준, 끝나기 3초 전부터)', fn: async () => { const ok = await Sound.previewLoop(key); if (!ok) UI.toast('들을 수 없습니다.'); setTimeout(() => musicLoopDialogKeep(key), 0); } },
        { label: '설정 지우기 (파일 정보·loops.js 사용)', fn: () => { Sound.endPreview(); Sound.setLoop(key, null); UI.toast('설정을 지웠습니다.'); } },
        { label: '닫기', fn: () => Sound.endPreview() },
      ],
    });
    return m;
  }
  // 미리 듣기 중에는 같은 창을 다시 띄운다
  function musicLoopDialogKeep(key) { musicLoopDialog(key); }

  function tabInfo() {
    const cr = DATA.species[save.current].cr || ['?', '?'];
    const s = save.settings;
    return `<h3>버전</h3>
      <div class="row"><span class="grow">미궁 탐험대 <b>v${GAME_VERSION}</b> <span class="dim">(${GAME_DATE})</span>${ENV === 'dev' ? ' <span class="tag">개발 환경</span>' : ''}${updateVer ? ` <a href="#" data-act="update">🔔 새 버전 v${esc(updateVer)}</a>` : ''}
        <div class="dim">친구와 구조 코드나 오늘의 도전 기록을 주고받을 때는 서로 같은 버전인지 확인하세요.</div></span>
        <button class="btn sm ghost" data-act="version-notes">변경 내역</button></div>
      ${Online.enabled() ? `<h3>☁ 계정</h3><div class="row"><span class="grow">${Online.loggedIn() ? `<b>${esc(Online.name())}</b> 님으로 로그인 · 세이브가 클라우드에도 저장됩니다${cloudErr ? ` <span class="warn">(${esc(cloudErr)})</span>` : ''}` : '로그인하지 않았어요. 로그인하면 다른 기기에서 이어하고 구조 게시판을 쓸 수 있어요.'}</span>
        <button class="btn sm${Online.loggedIn() ? ' ghost' : ''}" data-act="account">${Online.loggedIn() ? '계정' : '로그인 / 가입'}</button></div>` : ''}
      ${Online.enabled() ? `<h3>🏆 스타팅 순위</h3><div class="row"><span class="grow">탐험대가 처음 고른 포켓몬 순위 <span class="dim">(로그인한 탐험대 기준 · 하루에 한 번 갱신)</span></span>
        <button class="btn sm ghost" data-act="starter-rank">보기</button></div>` : ''}
      <h3>📖 게임 가이드</h3><div class="btns">${Guide.buttons()}</div>
      <h3>설정</h3>
      <label class="chk"><input type="checkbox" data-set="fast" ${s.fast ? 'checked' : ''}> 빠른 연출</label>
      <label class="chk"><input type="checkbox" data-set="autoDescend" ${s.autoDescend ? 'checked' : ''}> 자동 탐색이 계단에 도착하면 바로 내려가기</label>
      <label class="chk"><input type="checkbox" data-set="dpad" ${s.dpad ? 'checked' : ''}> 던전에서 방향 버튼 항상 표시 <span class="dim">(휴대폰에서 방향 버튼이 안 보이면 켜세요)</span></label>
      <div class="sound-set">
        <label class="chk"><input type="checkbox" data-set="sfx" ${s.sfx !== false ? 'checked' : ''}> 효과음</label>
        <input type="range" min="0" max="100" step="5" data-setnum="sfxVol" value="${s.sfxVol ?? 60}" title="효과음 음량">
        <label class="chk"><input type="checkbox" data-set="bgm" ${s.bgm !== false ? 'checked' : ''}> 배경음</label>
        <input type="range" min="0" max="100" step="5" data-setnum="bgmVol" value="${s.bgmVol ?? 40}" title="배경음 음량"></div>
      <p class="dim tiny">소리는 게임이 직접 합성합니다 (음원 파일 없음). 브라우저 정책상 화면을 한 번 눌러야 소리가 나기 시작합니다.</p>
      <div class="btns"><button class="btn ghost" data-act="help">⌨ 조작법</button> <button class="btn ghost danger" data-act="reset">저장 데이터 초기화</button></div>
      <h3>세이브 관리</h3>
      <p class="dim">${Online.loggedIn() ? '세이브는 이 브라우저와 클라우드에 저장됩니다. 만일을 위해 가끔 파일로도 내보내 두세요.' : '세이브는 이 브라우저에만 저장됩니다. 브라우저 데이터를 지우거나 다른 컴퓨터로 옮기기 전에 파일로 내보내 두세요.'}</p>
      <div class="btns"><button class="btn" data-act="save-export">💾 세이브 내보내기</button> <button class="btn ghost" data-act="save-import">📂 세이브 불러오기</button>
        <input type="file" id="save-file" accept=".json,application/json" hidden></div>
      ${backups().length ? `<p class="dim">업데이트할 때 자동으로 만든 백업 (최근 3개)</p>${backups().map((b, i) => `<div class="row"><span class="grow">v${esc(b.ver)} 세이브 <span class="dim">${esc(new Date(b.at).toLocaleString())}</span></span>
        <button class="btn sm ghost" data-act="restore-backup" data-arg="${i}">이 백업으로 복원</button></div>`).join('')}` : ''}
      ${Tiles.CUSTOM ? tilesetSection(s) : ''}
      ${musicSection()}
      <h3>크레딧</h3>
      <p>포켓몬 스프라이트와 초상화: <a href="https://sprites.pmdcollab.org/" target="_blank" rel="noopener">PMD Sprite Repository (SpriteCollab)</a>, CC BY-NC 4.0.<br>
      현재 캐릭터 ${esc(spName(save.current))}: 스프라이트 by ${esc(cr[0])} / 초상화 by ${esc(cr[1] || '?')}</p>
      <p>포켓몬 데이터(이름, 능력치, 기술): <a href="https://pokeapi.co/" target="_blank" rel="noopener">PokeAPI</a></p>
      <p>원작 던전 타일셋·음악 (게임 폴더의 tiles/, music/에 들어 있는 경우): Pokémon Mystery Dungeon 시리즈 © Nintendo / Spike Chunsoft</p>
      <p>이 게임의 소스 코드: GNU AGPL-3.0 (게임 폴더의 LICENSE 파일)</p>
      <p>버그 제보 · 문의 · 삭제 요청: <a href="https://github.com/pmd-fan-web/pmd-fan-web.github.io/issues" target="_blank" rel="noopener">GitHub Issues</a></p>
      <h3>개인정보</h3>
      <p class="dim">로그인하지 않으면 모든 기록은 이 브라우저에만 저장되고, 서버로 보내지 않습니다.
        로그인하면 <b>아이디, 닉네임, 세이브, 마지막 접속 시각</b>과 구조 게시판에 올린 요청만 서버(Google Firebase)에 저장합니다. 이메일·전화번호 같은 개인정보는 받지 않고, 광고나 방문 기록 분석도 하지 않습니다.
        계정 창의 <b>계정 삭제</b>로 언제든 서버의 기록을 모두 지울 수 있습니다. (스타팅 순위에 더해진 포켓몬 번호 하나는 누구 것인지 알 수 없는 형태로 순위에 남습니다.)</p>
      <p class="dim">비상업적 팬 게임입니다. Pokémon © Nintendo / Creatures Inc. / GAME FREAK inc. Pokémon Mystery Dungeon © Spike Chunsoft.</p>`;
  }

  async function onAction(act, arg) {
    switch (act) {
      case 'go': return prepareRun(arg);
      case 'take-mission': {
        const i = save.missions.board.findIndex(m => m.id === arg);
        if (i >= 0 && save.missions.accepted.length < 4) save.missions.accepted.push(save.missions.board.splice(i, 1)[0]);
        break;
      }
      case 'drop-mission': {
        if (!(await UI.confirm('임무 취소', '<p>이 임무를 취소하시겠습니까?</p>'))) return;
        const dm = save.missions.accepted.find(m => m.id === arg);
        if (dm && dm.online && dm.docId) Online.releaseSOS(dm.docId).catch(() => {});   // 게시판 구조: 다른 사람이 받을 수 있게
        save.missions.accepted = save.missions.accepted.filter(m => m.id !== arg);
        break;
      }
      case 'buy': {
        const it = ITEMS[arg];
        if (save.money < it.price) return;
        const n = it.stack ? 5 : 1;
        if (!bagAdd(arg, n)) {
          if (!storageRoom(arg, n)) { UI.toast('가방과 창고가 모두 가득 찼습니다.'); return; }
          storeAdd(arg, n); UI.toast('가방이 가득 차서 창고로 보냈습니다.');
        }
        else UI.toast(`${jo(it.n, '을')} 샀습니다.`);
        save.money -= it.price;
        break;
      }
      case 'shop-reroll': {
        if (save.money < SHOP_REROLL_COST) return;
        if (!(await UI.confirm('상점 새로고침', `<p>₽${SHOP_REROLL_COST}을 내고 오늘 진열된 물건을 새로 뽑습니다.</p><p class="dim">지금 진열된 물건은 사라집니다.</p>`, '새로고침', '그만둔다'))) return;
        save.money -= SHOP_REROLL_COST; rollShop(); UI.toast('상점 진열이 바뀌었습니다!');
        break;
      }
      case 'sell': {
        const b = save.bag[+arg]; if (!b) return;
        save.money += sellPrice(b); save.bag.splice(+arg, 1);
        break;
      }
      case 'withdraw': {
        const n = ITEMS[arg].stack ? save.storage[arg] : 1;
        if (!bagAdd(arg, n)) { UI.toast('가방이 가득 찼습니다.'); return; }
        save.storage[arg] -= n; if (save.storage[arg] <= 0) delete save.storage[arg];
        break;
      }
      case 'deposit': {
        const b = save.bag[+arg]; if (!b) return;
        if (!storageRoom(b.id, b.n)) { UI.toast('창고가 가득 찼습니다. 창고를 확장하세요.'); return; }
        save.bag.splice(+arg, 1); storeAdd(b.id, b.n); break;
      }
      case 'deposit-all': {
        const keep = [];
        for (const b of save.bag) { if (storageRoom(b.id, b.n)) storeAdd(b.id, b.n); else keep.push(b); }
        if (keep.length) UI.toast('창고가 가득 차서 일부를 맡기지 못했습니다.');
        save.bag = keep; break;
      }
      case 'store-sort': if (STORE_SORTS[arg]) save.storageSort = arg; break;
      case 'sort-bag': save.bag.sort((a, b) => byKind(a.id, b.id)); break;
      case 'up-bag': {
        const cost = bagUpgradeCost(save.bagMax);
        if (save.bagMax >= BAG_LIMIT || save.money < cost) return;
        if (!(await UI.confirm('가방 확장', `<p>₽${cost}을 내고 가방을 ${save.bagMax}칸 → ${save.bagMax + BAG_STEP}칸으로 늘립니다.</p>`, '확장한다', '그만둔다'))) return;
        save.money -= cost; save.bagMax += BAG_STEP; UI.toast(`가방이 ${save.bagMax}칸이 되었습니다!`);
        break;
      }
      case 'up-storage': {
        const cost = storageUpgradeCost(save.storageMax);
        if (save.storageMax >= STORAGE_LIMIT || save.money < cost) return;
        if (!(await UI.confirm('창고 확장', `<p>₽${cost}을 내고 창고를 ${save.storageMax}칸 → ${save.storageMax + STORAGE_STEP}칸으로 늘립니다.</p>`, '확장한다', '그만둔다'))) return;
        save.money -= cost; save.storageMax += STORAGE_STEP; UI.toast(`창고가 ${save.storageMax}칸이 되었습니다!`);
        break;
      }
      case 'discard': {
        if (!(await UI.confirm('버리기', `<p>${esc(jo(ITEMS[save.bag[+arg].id].n, '을'))} 버리시겠습니까?</p>`))) return;
        save.bag.splice(+arg, 1); break;
      }
      case 'change-char': chooseCharacter(sp => switchChar(sp), false, Object.keys(save.roster).map(Number)); return;
      case 'switch': if (save.roster[+arg]) switchChar(+arg); break;
      case 'set-moves': return setMoves();
      case 'code-enter': return enterCode();
      case 'account': return accountDialog();
      case 'sos-board': return sosBoard();
      case 'starter-rank': return starterRank();
      case 'update': return askUpdate();
      case 'restore-backup': return restoreBackup(+arg);
      case 'dgtab': dgTab = arg; break;
      case 'dg-info': return showDungeonInfo(arg);
      case 'version-notes': UI.alert('변경 내역', VERSION_NOTES.map(([v, list]) => `<h3>v${v}${v === GAME_VERSION ? ' <span class="tag">지금 버전</span>' : ''}</h3><ul>${list.map(x => `<li>${esc(x)}</li>`).join('')}</ul>`).join('')); return;
      case 'vitamin': useVitamin(arg); break;
      case 'use-candy': return useCandy();
      case 'gummy': useGummy(arg); break;
      case 'daily-go': return prepareDaily();
      case 'daily-share': { const rec = Progress.dailyRecord(); if (rec) codeBox('🗓 오늘의 도전 기록', '<p>친구에게 보내서 기록을 비교해 보세요.</p>', esc(Progress.shareText(rec).replace(/\n/g, ' · ')), '확인'); return; }
      case 'sos-show': if (save.sos) codeBox('🆘 SOS 코드', `<p>${esc(dungeonById(save.sos.dungeon).n)} ${save.sos.floor}F — ${esc(spName(save.sos.sp))} Lv${save.sos.lv}</p>`, sosCode(save.sos)); return;
      case 'sos-giveup': return giveUpSOS();
      case 'sos-resume': return save.sos && save.sos.thx ? resumeSOS() : receiveAOKAgain();
      case 'aok-show': { const a = (save.aokSent || []).find(x => String(x.id) === arg); if (a) codeBox('✅ A-OK 코드', `<p>친구의 ${esc(spName(a.sp))} 구조 완료 코드입니다.</p>`, a.code); return; }
      case 'set-form': {
        const sp = save.current, ch = save.roster[sp], id = +arg;
        if (id === sp) { delete ch.form; UI.toast('기본 모습으로 탐험합니다.'); break; }
        if (!(FORMS_OF[sp] || []).includes(id) || DATA.species[id].fc !== 'select') return;
        ch.form = id; UI.toast(`${spName(id)}의 모습으로 탐험합니다.`); break;
      }
      case 'toggle-shiny': { const ch = save.roster[save.current]; if (!shinyOk(save.current)) return; ch.shiny = !ch.shiny; UI.toast(ch.shiny ? '✨ 이로치로 바꿨습니다.' : '보통 모습으로 바꿨습니다.'); break; }
      case 'save-export': exportSave(); return;
      case 'save-import': document.getElementById('save-file').click(); return;
      case 'unhold': { const ch = save.roster[save.current]; if (ch.held) { storeAdd(ch.held); ch.held = null; UI.toast('지닌 물건을 창고에 넣었습니다.'); } break; }
      case 'hold': return chooseHeld();
      case 'use-tm': return useTM(arg);
      case 'set-ability': return changeAbility(+arg);
      case 'evolve': return evolve(+arg);
      case 'help': Dungeon.showHelp(); return;
      case 'guide': Guide.open(arg); return;
      case 'music-loop': return musicLoopDialog(arg);
      case 'music-del': await Sound.removeMusic(arg); UI.toast('음악 파일을 삭제했습니다.'); break;
      case 'tileset-del': Tiles.setUploaded(arg, null); UI.toast('타일셋을 삭제했습니다.'); break;
      case 'reset': {
        if (!(await UI.confirm('초기화', `<p>모든 진행 상황을 지우고 처음부터 시작합니다. 계속하시겠습니까?</p>${Online.loggedIn() ? '<p class="warn">로그인 중이라 클라우드 세이브도 함께 지웁니다.</p>' : ''}`))) return;
        if (Online.loggedIn()) {
          try { bound = false; clearTimeout(upTimer); await Online.clearCloud(); setSyncMeta(null); }
          catch (e) { UI.alert('초기화 실패', `<p>클라우드 세이브를 지우지 못했어요. ${esc(Online.why(e))}</p>`); return; }
        }
        try { localStorage.removeItem(SAVE_KEY); } catch (e) { /* 무시 */ }
        location.reload(); return;
      }
    }
    persist(); renderTown();
  }

  // 가진 기술머신 목록 (가방 + 창고)
  function ownedTMs() {
    const ids = new Set([...save.bag.filter(b => ITEMS[b.id]?.tm).map(b => b.id), ...Object.keys(save.storage).filter(id => ITEMS[id]?.tm && save.storage[id] > 0)]);
    return [...ids].sort((a, b) => ITEMS[a].no - ITEMS[b].no);
  }
  function tmSection(sp, ch) {
    const own = ownedTMs();
    const learned = (ch.tms || []).filter(m => DATA.moves[m]);
    let h = learned.length ? `<div class="dim">배운 기술: ${learned.map(m => `<span class="ab-link" data-move="${m}">${esc(DATA.moves[m].n)}</span>`).join(', ')}</div>` : '';
    if (!own.length) return h + '<p class="dim">가진 기술머신이 없습니다. 상점에서 매일 2개씩 팔고, 던전에서 드물게 주울 수 있어요.</p>';
    const rows = own.map(id => {
      const it = ITEMS[id], ok = canLearnTM(sp, it.mv), known = learned.includes(it.mv) || ch.moves.includes(it.mv);
      return { id, it, usable: ok && !known, ok, known };
    }).sort((a, b) => b.usable - a.usable || a.it.no - b.it.no);
    const usable = rows.filter(r => r.usable).length;
    const cnt = id => (save.storage[id] || 0) + save.bag.filter(b => b.id === id).length;
    return h + `<div class="tm-bar"><span>가진 기술머신 <b>${own.length}</b>종 · 지금 배울 수 있는 것 <b>${usable}</b>종</span>
        <input class="tm-q" placeholder="기술 이름 검색" autocomplete="off">
        <label class="chk inline"><input type="checkbox" class="tm-only" checked> 배울 수 있는 것만</label></div>
      <div class="tm-box">${rows.map(r => `<div class="row tm-item" data-s="${esc(r.it.n.toLowerCase())}" data-u="${r.usable ? 1 : 0}"${r.usable ? '' : ' style="display:none"'}>
        <span class="grow">💿 <span class="ab-link" data-move="${r.it.mv}">${esc(r.it.n)}</span>${cnt(r.id) > 1 ? ` <span class="dim">×${cnt(r.id)}</span>` : ''}
        <span class="${r.ok ? 'dim' : 'warn'}">${r.known ? '이미 배움' : r.ok ? '' : '배울 수 없음'}</span></span>
        <button class="btn sm" data-act="use-tm" data-arg="${r.id}" ${r.usable ? '' : 'disabled'}>사용</button></div>`).join('')}
        <p class="dim tm-empty"${usable ? ' style="display:none"' : ''}>조건에 맞는 기술머신이 없습니다.</p></div>`;
  }
  async function useTM(id) {
    const sp = save.current, ch = save.roster[sp], it = ITEMS[id], mv = DATA.moves[it.mv];
    if (!canLearnTM(sp, it.mv)) return;
    if (!(await UI.confirm('기술머신', `<p>${esc(jo(it.n, '을'))} 사용해서 ${esc(spName(sp))}에게 ${esc(jo(mv.n, '을'))} 가르칩니다.</p><p class="dim">기술머신은 사라집니다.</p>`, '사용한다', '그만둔다'))) return;
    const bi = save.bag.findIndex(b => b.id === id);
    if (bi >= 0) save.bag.splice(bi, 1); else { save.storage[id]--; if (save.storage[id] <= 0) delete save.storage[id]; }
    ch.tms = [...new Set([...(ch.tms || []), it.mv])];
    Progress.add('tms'); Progress.check();
    if (ch.moves.length < 4) { ch.moves.push(it.mv); persist(); renderTown(); UI.toast(`${jo(mv.n, '을')} 배웠습니다!`); return; }
    persist(); renderTown();
    UI.open({
      title: `${esc(mv.n)} — 잊을 기술 선택`, html: `${moveDetailHtml(it.mv)}<p>기술을 4개 알고 있습니다. 지금 바꿀 기술을 고르세요.</p>`,
      choices: [...ch.moves.map((m, i) => ({ label: moveLine(m), fn: () => { ch.moves[i] = it.mv; persist(); renderTown(); UI.toast(`${jo(mv.n, '을')} 배웠습니다!`); } })),
        { label: '지금은 바꾸지 않는다 (나중에 기술 설정에서 넣을 수 있음)', fn: () => {} }],
    });
  }

  // 가방/창고의 지닌 물건 중에서 고르기 (원래 지니던 것은 창고로)
  function chooseHeld() {
    const ch = save.roster[save.current];
    const opts = [];
    save.bag.forEach((b, i) => { if (ITEMS[b.id]?.held) opts.push({ id: b.id, from: 'bag', i }); });
    Object.keys(save.storage).forEach(id => { if (ITEMS[id]?.held && save.storage[id] > 0) opts.push({ id, from: 'storage' }); });
    if (!opts.length) { UI.alert('지닌 물건', '<p>가방이나 창고에 지닐 수 있는 물건이 없습니다.</p><p class="dim">상점에서 매일 지닌 물건 몇 개를 팔고, 던전에서도 가끔 주울 수 있어요.</p>'); return; }
    UI.open({
      title: '지니게 할 물건', wide: true,
      choices: opts.map(o => ({ label: `${ITEMS[o.id].icon} ${esc(ITEMS[o.id].n)} <span class="dim">(${o.from === 'bag' ? '가방' : '창고'})</span>`, sub: esc(ITEMS[o.id].d), fn: () => {
        if (o.from === 'bag') save.bag.splice(o.i, 1); else { save.storage[o.id]--; if (save.storage[o.id] <= 0) delete save.storage[o.id]; }
        if (ch.held) storeAdd(ch.held);
        ch.held = o.id; persist(); renderTown(); UI.toast(`${jo(ITEMS[o.id].n, '을')} 지니게 했습니다.`);
      } })),
    });
  }

  function exportSave() {
    const data = JSON.stringify({ game: 'pmd-web', version: GAME_VERSION, exported: new Date().toISOString(), save }, null, 1);
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([data], { type: 'application/json' }));
    const d = new Date(), p2 = n => String(n).padStart(2, '0');
    a.download = `pmd-web-save-${d.getFullYear()}${p2(d.getMonth() + 1)}${p2(d.getDate())}-${p2(d.getHours())}${p2(d.getMinutes())}.json`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    UI.toast('세이브 파일을 저장했습니다.');
  }
  async function importSave(file) {
    let obj = null;
    try { obj = JSON.parse(await file.text()); } catch (e) { obj = null; }
    const s = obj && obj.game === 'pmd-web' ? obj.save : obj;
    if (!s || typeof s !== 'object' || !s.roster || !s.current || !s.roster[s.current]) { UI.alert('불러오기 실패', '<p>이 게임의 세이브 파일이 아닙니다.</p>'); return; }
    if (s.gameVersion && cmpVer(s.gameVersion, GAME_VERSION) > 0) { UI.alert('불러오기 실패', `<p>이 세이브는 더 새 버전(v${esc(s.gameVersion)})에서 저장됐어요. 새로고침해서 최신 버전으로 불러와 주세요.</p>`); return; }
    const ch = s.roster[s.current];
    const ok = await UI.confirm('세이브 불러오기', `<div class="center">${portraitImg(s.current, 'portrait big', 'Normal', ch.shiny)}</div>
      <p class="center"><b>${esc(spName(s.current))}</b> Lv${ch.lv} · ${s.day || 1}일째 · ₽${s.money || 0}${obj.exported ? `<br><span class="dim">내보낸 시각 ${esc(new Date(obj.exported).toLocaleString())}${obj.version ? ` · 버전 v${esc(obj.version)}` : ''}</span>` : ''}</p>
      ${obj.version && obj.version !== GAME_VERSION ? `<p class="dim">지금 게임은 v${GAME_VERSION}입니다. 다른 버전의 세이브도 불러올 수 있어요.</p>` : ''}
      <p class="warn">지금 진행 중인 세이브는 이 파일로 바뀝니다.</p>`, '불러온다', '그만둔다');
    if (!ok) return;
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(s)); } catch (e) { UI.alert('불러오기 실패', '<p>브라우저에 저장할 수 없습니다.</p>'); return; }
    location.reload();
  }
  function noteShiny(sp) { save.shinySeen = save.shinySeen || {}; save.shinySeen[sp] = (save.shinySeen[sp] || 0) + 1; }
  // 이로치 모습: 그 포켓몬의 이로치를 쓰러뜨리거나 영입하면 해금 (이미 이로치로 쓰던 캐릭터는 그대로 인정)
  const shinyOk = sp => !!((save.shinyOwned && save.shinyOwned[sp]) || save.roster[sp]?.shiny);
  function unlockShiny(sp) {
    if (!DATA.species[sp]?.sh || shinyOk(sp)) return false;
    save.shinyOwned = save.shinyOwned || {}; save.shinyOwned[sp] = true; persist(); return true;
  }
  // 영입: Lv5로 합류. 진화체면 진화 전 모습도 함께 해금 (이로치 해금도 같이)
  function recruit(c) {
    if (save.roster[c.sp]) return;
    const ab = DATA.species[c.sp].ab.some(a => a[0] === c.ability) ? c.ability : defaultAbility(c.sp);
    const entry = sp => ({ lv: RECRUIT_LEVEL, exp: expFor(RECRUIT_LEVEL), moves: defaultMoves(sp, RECRUIT_LEVEL), ability: sp === c.sp ? ab : defaultAbility(sp), shiny: !!c.shiny });
    save.roster[c.sp] = entry(c.sp);
    for (const pre of preEvos(c.sp)) if (!save.roster[pre]) save.roster[pre] = entry(pre);
    if (c.shiny) [c.sp, ...preEvos(c.sp)].forEach(unlockShiny);
    save.recruited = (save.recruited || 0) + 1;
    Progress.check();
    persist();
  }

  function switchChar(sp) {
    if (!save.roster[sp]) save.roster[sp] = newEntry(sp);
    save.current = sp; persist(); renderTown();
    UI.toast(`${jo(spName(sp), '으로')} 변경했습니다.`);
  }

  function setMoves() {
    const sp = save.current, ch = save.roster[sp];
    // 진화 전 모습이 이 레벨까지 배우는 기술과 지금 쓰고 있는 기술도 고를 수 있다 (진화해도 잊지 않는다)
    const all = [...new Set([...ch.moves, ...learnableUpTo(sp, ch.lv), ...preEvos(sp).flatMap(p => learnableUpTo(p, ch.lv)), ...(ch.tms || [])])].filter(m => DATA.moves[m]);
    if (!all.length) { UI.alert('기술 설정', '<p>배울 수 있는 기술이 없습니다.</p>'); return; }
    const sel = new Set(ch.moves);
    UI.open({
      title: '기술 설정 (최대 4개)', wide: true,
      html: `<p class="dim">현재 레벨까지 배울 수 있는 기술(진화 전 모습의 기술 포함)과 기술머신으로 배운 기술 중에서 자유롭게 고르세요. <b>?</b>를 누르면 기술 설명을 볼 수 있습니다.</p><div class="move-pick">${all.map(id => `<label class="move-row"><input type="checkbox" value="${id}" ${sel.has(id) ? 'checked' : ''}> ${moveLine(id)}<span class="info" data-move="${id}" title="기술 정보">?</span></label>`).join('')}</div>`,
      choices: [{ label: '저장', fn: () => { ch.moves = [...sel]; persist(); renderTown(); } }, { label: '취소', fn: () => {} }],
      onOpen: box => {
        box.querySelectorAll('input[type=checkbox]').forEach(cb => cb.onchange = () => {
          const id = +cb.value;
          if (cb.checked) { if (sel.size >= 4) { cb.checked = false; UI.toast('기술은 4개까지 고를 수 있습니다.'); return; } sel.add(id); }
          else sel.delete(id);
        });
      },
    });
  }

  async function evolve(to) {
    const sp = save.current, e = evoOptions(sp).find(o => o.to === to);
    if (!e || !e.ok) return;
    let msg = `<p>${esc(jo(spName(sp), '이'))} ${esc(jo(spName(to), '으로'))} 진화합니다.</p>`;
    if (borrowNote(to)) msg += `<p class="dim">${esc(borrowNote(to))}</p>`;
    if (save.roster[to]) msg += `<p class="warn">이미 있는 ${esc(spName(to))}의 기록(Lv${save.roster[to].lv})을 덮어씁니다.</p>`;
    if (!(await UI.confirm('진화', msg, '진화한다', '그만둔다'))) return;
    if (e.itemId) {
      const bi = save.bag.findIndex(b => b.id === e.itemId);
      if (bi >= 0) save.bag.splice(bi, 1); else { save.storage[e.itemId]--; if (save.storage[e.itemId] <= 0) delete save.storage[e.itemId]; }
    }
    const entry = save.roster[sp];
    if (shinyOk(sp)) { save.shinyOwned = save.shinyOwned || {}; save.shinyOwned[to] = true; }
    delete save.roster[sp];
    // 진화 후 레벨에서 새로 배우는 기술이 있으면 빈 칸에 추가
    for (const mid of learnedAt(to, entry.lv).concat(learnedAt(to, 1))) if (entry.moves.length < 4 && !entry.moves.includes(mid)) entry.moves.push(mid);
    const slot = DATA.species[sp].ab.findIndex(a => a[0] === entry.ability);
    entry.ability = (DATA.species[to].ab[slot] || DATA.species[to].ab[0] || [0])[0];
    delete entry.form;   // 골라 둔 모습은 진화 전 포켓몬의 것
    save.roster[to] = entry; save.current = to;
    // 클리어 기록도 진화한 모습으로 옮긴다
    if (save.clears && save.clears[sp]) { save.clears[to] = { ...save.clears[to], ...save.clears[sp] }; delete save.clears[sp]; }
    Progress.add('evolves'); Progress.check();
    Sound.play('levelup');
    persist(); renderTown();
    UI.alert('축하합니다!', `<div class="center">${portraitImg(to, 'portrait big', 'Joyous', entry.shiny)}</div><p>${esc(jo(spName(sp), '은'))} ${esc(jo(spName(to), '으로'))} 진화했다!</p>`);
  }

  // ───────────────────────── 캐릭터 선택 ─────────────────────────
  // only: 고를 수 있는 포켓몬 (캐릭터 변경은 영입한 포켓몬만)
  function chooseCharacter(cb, first, only, back) {
    const ids = (only || SPECIES_IDS.map(Number)).slice().sort(byDex);
    const gens = [...new Set(ids.map(id => DATA.species[id].g))].sort((a, b) => a - b);
    UI.open({
      title: first ? '함께 모험할 포켓몬을 고르세요' : '캐릭터 변경', wide: true, cancel: first ? false : undefined,
      html: `${only && !first ? `<p class="dim">영입한 포켓몬 ${ids.length}마리 중에서 고릅니다. 던전에서 쓰러뜨린 적이 가끔 동료가 되고 싶어 해요. (지금 영입 확률 ${(recruitRate(save.roster[save.current].lv) * 100).toFixed(1)}%)</p>` : ''}<div class="picker-bar"><input id="pk-q" placeholder="이름 / 영어 / 번호 검색" autocomplete="off">
        <select id="pk-g"><option value="">전체 세대</option>${gens.map(g => `<option value="${g}">${g}세대</option>`).join('')}</select>
        <select id="pk-t"><option value="">전체 타입</option>${DATA.types.map((t, i) => `<option value="${i + 1}">${t}</option>`).join('')}</select>
        <button class="btn sm ghost" id="pk-r">무작위</button>${back ? ' <button class="btn sm ghost" id="pk-back">← 방법 다시 고르기</button>' : ''}</div>
        <div class="picker" id="pk-grid">${ids.map(id => `<button class="pk" data-id="${id}" data-s="${(DATA.species[id].n + ' ' + DATA.species[id].e + ' ' + dexNo(id) + ' ' + id).toLowerCase()}" data-g="${DATA.species[id].g}" data-t="${DATA.species[id].t.join(',')}">
          ${portraitImg(id, 'portrait sm', 'Normal', !!(only && !first && save && save.roster[id]?.shiny))}<span>${esc(DATA.species[id].n)}</span>${save && save.roster && save.roster[id] ? `<i>Lv${save.roster[id].lv} ${medalIcons(id)}</i>` : ''}</button>`).join('')}</div>`,
      onOpen: (box, m) => {
        const q = box.querySelector('#pk-q'), g = box.querySelector('#pk-g'), t = box.querySelector('#pk-t');
        const filter = () => {
          const s = q.value.trim().toLowerCase();
          box.querySelectorAll('.pk').forEach(b => {
            b.style.display = (!s || b.dataset.s.includes(s)) && (!g.value || b.dataset.g === g.value) && (!t.value || b.dataset.t.split(',').includes(t.value)) ? '' : 'none';
          });
        };
        q.oninput = filter; g.onchange = filter; t.onchange = filter;
        if (back) box.querySelector('#pk-back').onclick = () => { UI.close(m); setTimeout(back, 0); };
        box.querySelector('#pk-r').onclick = () => { const vis = [...box.querySelectorAll('.pk')].filter(b => b.style.display !== 'none'); if (vis.length) confirmPick(+pick(vis).dataset.id); };
        const confirmPick = async id => {
          const d = DATA.species[id], st = calcStats(id, START_LEVEL, 31);
          const ok = await UI.confirm(esc(d.n), `<div class="center">${portraitImg(id, 'portrait big')}</div><p class="center">${typeBadges(d.t)}</p>
            <p class="center dim">종족값 HP ${d.b[0]} / 공 ${d.b[1]} / 방 ${d.b[2]} / 특공 ${d.b[3]} / 특방 ${d.b[4]} / 스피드 ${d.b[5]}</p>
            <p class="center">${save && save.roster && save.roster[id] ? `저장된 기록: Lv${save.roster[id].lv}` : `Lv${START_LEVEL}부터 시작 (HP ${st.maxhp})`}</p>`, '이 포켓몬으로 한다', '다시 고른다');
          if (ok) { UI.close(m); cb(id); }
        };
        box.querySelector('#pk-grid').onclick = e => { const b = e.target.closest('.pk'); if (b) confirmPick(+b.dataset.id); };
        setTimeout(() => q.focus(), 50);
      },
    });
  }

  // ───────────────────────── 던전 출입 ─────────────────────────
  // 구조를 기다리는 던전에는 들어갈 수 없다 (구조받거나 포기하면 풀린다)
  const sosLocked = id => !!(save.sos && save.sos.dungeon === id);

  async function prepareRun(id) {
    const dg = dungeonById(id);
    if (sosLocked(id)) { UI.alert('🆘 구조 대기 중', `<p>${esc(dg.n)}에서 구조를 기다리고 있어요. 구조를 받아 이어서 탐험하거나, 임무 탭에서 구조 요청을 포기하면 다시 들어갈 수 있어요.</p>`); return; }
    const ch = save.roster[save.current];
    if (dg.mode === 'rogue') {
      const ok = await UI.confirm(esc(dg.n), `<p><b>로그라이크 던전</b>입니다.</p><ul>
        <li>레벨이 <b>${jo(ROGUE_LEVEL, '으로')}</b>, 가방이 초기화된 상태로 들어갑니다. (오랭열매 2개, 사과 1개 지급)</li>
        <li>던전에서 나오면 레벨과 가방이 원래대로 돌아옵니다.</li>
        <li>클리어하거나 탈출하면 주운 돈과 아이템(창고로)을 가져올 수 있습니다. 쓰러지면 아무것도 가져오지 못합니다.</li></ul>`, '들어간다', '그만둔다');
      if (!ok) return;
    } else {
      const ms = save.missions.accepted.filter(m => m.dungeon === id);
      const ok = await UI.confirm(esc(dg.n), `<p>${dg.floors}층짜리 던전입니다. (적 Lv ${dg.lv[0]}~${dg.lv[1]}, 내 레벨 ${ch.lv})</p>
        <p>가방: ${save.bag.length}/${bagMax()}칸${save.bag.length ? '' : ' <span class="warn">(비어 있음!)</span>'}</p>
        ${ms.length ? `<p>이 던전의 임무: ${ms.map(m => m.floor + 'F').join(', ')}</p>` : ''}
        <p class="dim">쓰러지면 가방 아이템의 절반(무작위)과 이번 탐험에서 주운 돈을 잃습니다. 레벨은 유지됩니다.</p>`, '출발한다', '그만둔다');
      if (!ok) return;
    }
    startRun(dg);
  }

  function startRun(dg) {
    const sp = save.current, ch = save.roster[sp];
    let p, bag;
    if (dg.mode === 'rogue') {
      p = makeCreature(sp, ROGUE_LEVEL, { player: true, ability: entryAbility(sp, ch) });
      p.shiny = !!ch.shiny;
      bag = [{ id: 'oran', n: 1 }, { id: 'oran', n: 1 }, { id: 'apple', n: 1 }];
    } else {
      p = makeCreature(sp, ch.lv, { player: true, exp: ch.exp, moves: ch.moves.length ? ch.moves : undefined, ability: entryAbility(sp, ch), boost: ch.boost });
      p.held = ch.held || null;
      p.shiny = !!ch.shiny;
      p.tms = (ch.tms || []).slice();
      bag = JSON.parse(JSON.stringify(save.bag));
    }
    p.selForm = ch.form || undefined;   // 캐릭터 탭에서 골라 둔 모습 (로토무 등)
    p.belly = 100;
    const run = { dungeon: dg.id, floor: 1, mode: dg.mode, p, bag, money: 0, done: [] };
    show('dungeon-screen');
    Dungeon.enter(run);
  }

  // 오늘의 도전: 그날 정해진 포켓몬으로, 하루 한 번
  async function prepareDaily() {
    if (Progress.dailyRecord()) return;
    const dg = Progress.setupDaily();
    const ok = await UI.confirm(esc(dg.n), `<div class="center">${portraitImg(dg.hero, 'portrait big')}</div>
      <p class="center">오늘의 주인공 <b>${esc(spName(dg.hero))}</b> Lv${ROGUE_LEVEL}</p><ul>
      <li>${dg.floors}층짜리 로그라이크 던전입니다. 오늘은 누구나 같은 포켓몬, 같은 맵으로 도전합니다.</li>
      <li><b>하루 한 번</b>만 도전할 수 있습니다. 도중에 창을 닫으면 그 층의 처음부터 이어집니다.</li>
      <li>가방은 오랭열매 2개와 사과 1개로 시작합니다. 내 캐릭터와 가방은 그대로 보존됩니다.</li>
      <li>보상: 도달한 층 × ₽40 (완주하면 ₽1000 추가). 쓰러져도 받을 수 있어요.</li></ul>`, '도전한다', '그만둔다');
    if (!ok) return;
    const p = makeCreature(dg.hero, ROGUE_LEVEL, { player: true });
    p.belly = 100;
    const run = { dungeon: 'daily', daily: dg.date, floor: 1, mode: 'rogue', p, bag: [{ id: 'oran', n: 1 }, { id: 'oran', n: 1 }, { id: 'apple', n: 1 }], money: 0, done: [], turns: 0, kills: 0 };
    // 시작하자마자 기록을 남겨서 다시 도전하지 못하게 한다
    save.daily = { date: dg.date, sp: dg.hero, floor: 1, clear: false, turns: 0, lv: ROGUE_LEVEL, kills: 0 };
    persist();
    show('dungeon-screen');
    Dungeon.enter(run);
  }

  function saveRunSnapshot(r) {
    const p = r.p;
    save.run = { dungeon: r.dungeon, floor: r.floor, mode: r.mode, bag: r.bag, money: r.money, done: r.done, daily: r.daily || null, turns: r.turns || 0, kills: r.kills || 0,
      p: { sp: p.sp, lv: p.lv, exp: p.exp, hp: p.hp, belly: p.belly, status: p.status, statusT: p.statusT, moves: p.moves.map(m => m.id), pp: p.moves.map(m => m.pp), ability: p.baseAbility ?? p.ability, held: p.held || null, tms: p.tms || [], shiny: !!p.shiny, boost: p.boost || null, form: p.selForm || null } };
    // 일반 던전은 층마다 레벨도 저장
    if (r.mode === 'normal') save.roster[p.sp] = { ...save.roster[p.sp], lv: p.lv, exp: p.exp, moves: p.moves.map(m => m.id), held: p.held || null, tms: p.tms || [], ...(p.boost ? { boost: p.boost } : {}) };
    persist();
  }

  function resumeRun() {
    const s = save.run;
    if (s.daily) Progress.setupDaily(s.daily);
    const p = makeCreature(s.p.sp, s.p.lv, { player: true, exp: s.p.exp, moves: s.p.moves, pp: s.p.pp, ability: s.p.ability ?? entryAbility(s.p.sp, save.roster[s.p.sp]), boost: s.p.boost || undefined });
    p.hp = clamp(s.p.hp, 1, p.maxhp); p.belly = s.p.belly; p.held = s.p.held || null; p.tms = s.p.tms || []; p.shiny = !!s.p.shiny; p.status = s.p.status; p.statusT = s.p.statusT; p.selForm = s.p.form || undefined;
    const run = { dungeon: s.dungeon, floor: s.floor, mode: s.mode, p, bag: s.bag, money: s.money, done: s.done, daily: s.daily || null, turns: s.turns || 0, kills: s.kills || 0 };
    show('dungeon-screen');
    Dungeon.enter(run);
  }
  function abandonSavedRun() {
    const s = save.run;
    if (s.daily) Progress.setupDaily(s.daily);
    const fake = { dungeon: s.dungeon, floor: s.floor, mode: s.mode, bag: s.bag, money: s.money, done: [], daily: s.daily || null, turns: s.turns || 0, kills: s.kills || 0,
      p: { sp: s.p.sp, lv: s.p.lv, exp: s.p.exp, ability: s.p.ability, held: s.p.held, moves: s.p.moves.map(id => ({ id })) } };
    finishRun(fake, 'faint');
  }

  function endRun(outcome) {
    const r = Dungeon.run;
    if (!r) return;
    Dungeon.leave();
    UI.closeAll();
    // 일반 던전에서 쓰러졌을 때: 친구에게 구조를 요청할 수 있다 (요청은 한 번에 하나)
    if (outcome === 'faint' && r.mode === 'normal') {
      show('town-screen'); renderTown();
      if (save.sos) {
        UI.alert('구조 요청 불가', '<p>이미 기다리고 있는 구조 요청이 있어서 새로 요청할 수 없습니다.</p>').then(() => finishRun(r, 'faint'));
        return;
      }
      UI.open({
        title: '눈앞이 캄캄해졌다...',
        html: `<div class="center">${portraitImg(r.p.sp, 'portrait big', 'Pain', r.p.shiny)}</div>
          <p>친구에게 <b>구조를 요청</b>할 수 있습니다. 요청하면 SOS 코드가 나오고, 구조될 때까지 아이템과 돈을 잃지 않고 기다립니다.
          기다리는 동안에도 다른 던전은 탐험할 수 있어요.</p>`,
        choices: [{ label: Online.loggedIn() ? '🆘 구조를 요청한다 (구조 게시판에 올리기)' : '🆘 구조를 요청한다 (SOS 코드 만들기)', fn: () => createSOS(r) }, { label: '포기하고 돌아간다', fn: () => finishRun(r, 'faint') }],
        cancel: false,
      });
      return;
    }
    finishRun(r, outcome === 'quit' ? 'faint' : outcome);
  }

  // ───────────────────────── 친구 구조 (코드) ─────────────────────────
  function codeBox(title, html, code, label, then) {
    UI.open({
      title, wide: true,
      html: `${html}<div class="code-box"><input class="code-text" readonly value="${code}"><button class="btn sm" data-copy>복사</button></div>
        <p class="dim">코드는 메신저 등으로 친구에게 보내 주세요. 이 화면은 임무 탭에서 다시 볼 수 있습니다.</p>`,
      choices: [{ label: label || '확인', fn: then || (() => {}) }], cancel: then || (() => {}),
      onOpen: box => {
        const inp = box.querySelector('.code-text');
        inp.onclick = () => inp.select();
        box.querySelector('[data-copy]').onclick = async () => {
          try { await navigator.clipboard.writeText(code); UI.toast('복사했습니다.'); }
          catch (e) { inp.select(); document.execCommand && document.execCommand('copy'); UI.toast('선택된 코드를 Ctrl+C로 복사하세요.'); }
        };
      },
    });
  }
  function sosCode(s) { return Codes.encode('sos', { id: s.id, dg: DUNGEONS.findIndex(d => d.id === s.dungeon), fl: s.floor, sp: s.sp, lv: s.lv, sh: s.shiny ? 1 : 0 }); }

  async function createSOS(r) {
    const p = r.p;
    const s = {
      id: Codes.newId(), dungeon: r.dungeon, floor: r.floor, sp: p.sp, lv: p.lv, shiny: !!p.shiny, day: save.day,
      snap: { bag: r.bag, money: r.money, done: r.done, held: p.held || null },
    };
    save.sos = s;
    // 레벨은 그대로 남고, 가방과 지닌 물건은 쓰러진 곳에 남아 구조를 기다린다
    save.roster[p.sp] = { ...save.roster[p.sp], lv: p.lv, exp: p.exp, moves: p.moves.map(m => m.id), held: null, ...(p.tms ? { tms: p.tms } : {}), ...(p.boost ? { boost: p.boost } : {}) };
    save.bag = [];   // 가방은 쓰러진 곳에서 구조를 기다린다 (s.snap.bag)
    save.best[r.dungeon] = Math.max(save.best[r.dungeon] || 0, r.floor);
    save.run = null; save.day++; refreshDay(); persist();
    tab = 'mission'; renderTown();
    let posted = false;
    if (Online.loggedIn()) {
      try { s.docId = await Online.postSOS(s); s.online = true; posted = true; persist(); renderTown(); }
      catch (e) { console.warn(e); UI.toast('구조 게시판에 올리지 못했어요. 코드로 친구에게 부탁해 주세요.'); }
    }
    codeBox('🆘 SOS 코드', `<p>${esc(dungeonById(s.dungeon).n)} ${s.floor}F에서 쓰러진 <b>${esc(spName(s.sp))}</b> Lv${s.lv}의 구조 요청입니다.</p>
      ${posted ? '<p>📋 <b>구조 게시판에 올렸어요.</b> 다른 플레이어가 구조하면 임무 탭에서 자동으로 알려 드려요.</p><p class="dim">친구에게 직접 부탁하려면 아래 코드를 보내도 됩니다.</p>'
        : '<p>친구가 이 코드로 구조해 주면 <b>A-OK 코드</b>를 받게 됩니다. 그 코드를 임무 탭에 입력하면 쓰러진 층부터 이어서 탐험할 수 있어요.</p>'}`, sosCode(s));
  }

  // 달성 선물: 친구 구조 / 임무 완료 횟수가 정해진 수에 닿을 때마다 창고로 (두 횟수는 따로 센다)
  const GIFT_NAMES = { rescues: '친구 구조', missions: '임무 완료' };
  // 임무 횟수는 친구 구조를 뺀 게시판 임무만 (기록의 '임무'에는 친구 구조도 들어 있다)
  const giftCount = kind => kind === 'missions' ? Math.max(0, Progress.stat('missions') - Progress.stat('rescues')) : Progress.stat(kind);
  function milestoneGift(kind, lines) {
    const n = giftCount(kind), every = MILESTONE_GIFT[kind];
    if (n <= 0 || n % every) return;
    const id = pick(milestoneGiftPool());
    storeAdd(id);
    lines.push(`🎁 ${GIFT_NAMES[kind]} ${n}번 달성 선물: ${ITEMS[id].icon} <b>${esc(ITEMS[id].n)}</b> (창고로)`);
  }
  function giftNote() {
    const part = kind => { const n = giftCount(kind), every = MILESTONE_GIFT[kind]; return `${GIFT_NAMES[kind]} ${every}번마다 (지금 ${n}번 · 다음까지 ${every - n % every}번)`; };
    return `<p class="dim">🎁 달성 선물: ${part('rescues')}, ${part('missions')} — 영양제·구미(무지개구미 포함)·특성패치 중 하나를 창고로 드려요.</p>`;
  }
  function sosSection() {
    const s = save.sos;
    let h = '<h3>🆘 친구 구조</h3>' + giftNote();
    if (s) {
      const dg = dungeonById(s.dungeon);
      h += `<div class="row sos-row">${portraitImg(s.sp, 'portrait sm', s.revived ? 'Happy' : 'Pain', s.shiny)}<div class="grow">
        ${s.revived ? `<b>구조되었습니다!</b> ${esc(dg.n)} ${s.floor}F에서 이어서 탐험할 수 있어요.` : `<b>구조를 기다리는 중</b> — ${esc(dg.n)} ${s.floor}F에서 쓰러진 ${esc(spName(s.sp))} Lv${s.lv}`}
        <div class="dim">가방 ${s.snap.bag.length}칸${s.snap.held ? ` · 지닌 물건 ${esc(ITEMS[s.snap.held].n)}` : ''}이 함께 기다리고 있습니다.</div>
        ${s.online && !s.revived ? '<div class="dim">📋 구조 게시판에 올라가 있어요. 누군가 구조하면 자동으로 알려 드려요.</div>' : ''}</div>
        ${s.revived ? '<button class="btn sm" data-act="sos-resume">이어서 탐험</button>' : '<button class="btn sm ghost" data-act="sos-show">SOS 코드</button> <button class="btn sm ghost danger" data-act="sos-giveup">포기</button>'}</div>`;
    }
    if (Online.enabled()) h += Online.loggedIn()
      ? '<div class="row"><span class="grow">📋 <b>구조 게시판</b> <span class="dim">다른 플레이어의 구조 요청을 골라서 구하러 갈 수 있어요.</span></span><button class="btn sm" data-act="sos-board">게시판 보기</button></div>'
      : '<div class="row"><span class="grow dim">📋 로그인하면 구조 게시판에서 다른 플레이어를 구조하거나 구조 요청을 올릴 수 있어요.</span><button class="btn sm ghost" data-act="account">로그인</button></div>';
    h += `<div class="code-box"><input id="code-input" placeholder="친구에게 받은 코드 입력 (SOS / A-OK / 감사 코드)" autocomplete="off"><button class="btn sm" data-act="code-enter">입력</button></div>`;
    const sent = (save.aokSent || []).slice(-3);
    if (sent.length) h += `<div class="dim">보낸 A-OK 코드: ${sent.map(a => `<a href="#" data-act="aok-show" data-arg="${a.id}">${esc(spName(a.sp))} (${a.code.slice(0, 9)}…)</a>`).join(', ')}</div>`;
    return h;
  }

  async function enterCode() {
    const inp = document.getElementById('code-input');
    const d = Codes.decode(inp ? inp.value : '');
    if (d.error) { UI.alert('코드 오류', `<p>${esc(d.error)}</p>`); return; }
    if (d.type === 'sos') return acceptSOS(d);
    if (d.type === 'aok') return receiveAOK(d);
    if (d.type === 'thx') return receiveTHX(d);
  }

  // 친구의 SOS → 구조 임무
  async function acceptSOS(d, from, docId) {
    const dg = DUNGEONS[d.dg];
    if (!dg || dg.mode !== 'normal' || d.fl < 1 || d.fl > dg.floors || !DATA.species[d.sp]) { UI.alert('코드 오류', '<p>이 게임에서 쓸 수 없는 SOS 코드입니다.</p>'); return; }
    if (save.sos && save.sos.id === d.id) { UI.alert('구조 불가', '<p>자기 자신의 구조 요청은 받을 수 없어요. 친구에게 보내 주세요.</p>'); return; }
    if ((save.rescued || {})[d.id] || save.missions.accepted.some(m => m.sosId === d.id)) { UI.alert('구조 불가', '<p>이미 받았거나 구조를 마친 요청입니다.</p>'); return; }
    if (!unlocked(dg)) { UI.alert('구조 불가', `<p>${esc(jo(dg.n, '은'))} 아직 열리지 않은 던전이라 구조하러 갈 수 없어요.</p><p class="dim">${esc(jo(dungeonById(dg.req).n, '을'))} 클리어하면 열립니다.</p>`); return; }
    if (save.missions.accepted.length >= 4) { UI.alert('구조 불가', '<p>진행 중인 임무가 4개입니다. 하나를 끝내거나 취소한 뒤 받아 주세요.</p>'); return; }
    if (docId && save.missions.accepted.filter(m => m.online).length >= ONLINE_RESCUE_MAX) { UI.alert('구조 불가', `<p>게시판 구조 임무는 한 번에 ${ONLINE_RESCUE_MAX}개까지 받을 수 있어요. 먼저 받은 구조를 끝내 주세요.</p>`); return; }
    const reward = Math.round((150 + d.fl * 40) * (1 + DUNGEONS.filter(x => x.mode === 'normal').indexOf(dg) * 0.5) * MISSION_MONEY_MUL / 10) * 10;
    const ok = await UI.confirm('🆘 구조 요청', `<div class="center">${portraitImg(d.sp, 'portrait big', 'Pain', !!d.sh)}</div>
      <p class="center"><b>${esc(dg.n)} ${d.fl}F</b>에서 ${from ? `<b>${esc(from)}</b> 님` : '친구'}의 Lv${d.lv} <b>${esc(jo(spName(d.sp), '이'))}</b> 쓰러져 있습니다.</p>
      <p class="center dim">그 층까지 내려가서 말을 걸면 구조 성공. 보상 ₽${reward} + ${from ? '마을로 돌아오면 구조 완료가 자동으로 전해져요' : 'A-OK 코드'}</p>
      ${from ? '<p class="center dim">구조를 마치면 구조 보답(무작위 아이템과 돈)도 받아요. 2시간 동안은 이 요청이 다른 사람에게 보이지 않아요.</p>' : ''}`, '구조하러 간다', '그만둔다');
    if (!ok) return;
    if (docId) {   // 게시판 요청: 먼저 맡는다 (이미 누가 맡았으면 받을 수 없음)
      let got = false;
      try { got = await Online.takeSOS(docId); } catch (e) { UI.alert('구조 불가', `<p>${esc(Online.why(e))}</p>`); return; }
      if (!got) { UI.alert('구조 불가', '<p>방금 다른 탐험대가 구조하러 갔거나, 이미 구조된 요청이에요.</p>'); return; }
    }
    save.missions.accepted.push({ id: 'sos' + d.id, kind: 'sos', sosId: d.id, dungeon: dg.id, floor: d.fl, client: d.sp, lv: d.lv, shiny: !!d.sh, reward, ...(from ? { online: true, from, docId } : {}) });
    const ci = document.getElementById('code-input'); if (ci) ci.value = '';
    persist(); renderTown(); UI.toast('구조 임무를 받았습니다!');
  }

  // 내 SOS에 대한 A-OK → 부활
  async function receiveAOK(d, from) {
    const s = save.sos;
    if (!s || s.id !== d.id) { UI.alert('코드 오류', '<p>지금 기다리고 있는 구조 요청에 대한 A-OK 코드가 아닙니다.</p>'); return; }
    if (s.revived) { UI.alert('이미 구조됨', '<p>이미 구조되었어요. 임무 탭에서 이어서 탐험할 수 있습니다.</p>'); return; }
    s.revived = { sp: d.sp, lv: d.lv, sh: !!d.sh, ...(from ? { from } : {}) };
    const ci = document.getElementById('code-input'); if (ci) ci.value = '';
    if (s.online && !from) { s.online = false; Online.deleteSOS(s.docId || s.id).catch(() => {}); }   // 코드로 구조됨: 게시판에서 내린다
    persist(); renderTown();
    await UI.alert('구조되었다!', `<div class="center">${portraitImg(d.sp, 'portrait big', 'Happy', !!d.sh)} ${portraitImg(s.sp, 'portrait big', 'Joyous', s.shiny)}</div>
      <p class="center">${from ? `<b>${esc(from)}</b> 님` : '친구'}의 <b>${esc(spName(d.sp))}</b> Lv${d.lv} 덕분에 ${esc(jo(spName(s.sp), '이'))} 되살아났다!</p>`);
    // 감사 선물 (선택)
    const gifts = [...save.bag.map((b, i) => ({ id: b.id, from: 'bag', i })), ...Object.keys(save.storage).filter(id => save.storage[id] > 0).map(id => ({ id, from: 'storage' }))]
      .filter(g => ITEMS[g.id] && g.id !== 'quest');
    UI.open({
      title: '💌 감사 선물', wide: true,
      html: s.online ? '<p>구조해 준 탐험대에게 감사 편지와 함께 아이템 하나를 선물할 수 있어요. 상대의 창고로 들어갑니다.</p>'
        : '<p>구조해 준 친구에게 아이템 하나를 선물할 수 있어요. 감사 코드를 보내면 친구의 창고로 들어갑니다.</p>',
      choices: [{ label: s.online ? '선물 없이 감사 편지만 보낸다' : '선물 없이 감사 코드만 보낸다', fn: () => sendThanks(s, null) },
        ...gifts.slice(0, 40).map(g => ({ label: `${ITEMS[g.id].icon} ${esc(ITEMS[g.id].n)} <span class="dim">(${g.from === 'bag' ? '가방' : '창고'})</span>`, fn: () => {
          if (g.from === 'bag') save.bag.splice(g.i, 1); else { save.storage[g.id]--; if (save.storage[g.id] <= 0) delete save.storage[g.id]; }
          sendThanks(s, g.id);
        } }))],
      cancel: false,
    });
  }
  function receiveAOKAgain() {
    const s = save.sos; if (!s || !s.revived) return;
    UI.confirm('이어서 탐험', `<p>구조해 준 ${s.online ? '탐험대에게 감사 편지를' : '친구에게 감사 코드를'} 보내지 않았어요. 선물 없이 감사 ${s.online ? '편지를 보내고' : '코드를 만들고'} 이어서 탐험할까요?</p>`, '그렇게 한다', '그만둔다')
      .then(ok => { if (ok) sendThanks(s, null); });
  }
  function sendThanks(s, itemId) {
    if (s.online) {
      save.thxQueue = [...(save.thxQueue || []), { id: s.docId || s.id, item: itemId }];
      s.thx = 'online'; persist(); renderTown();
      flushThanks().catch(e => console.warn('감사 편지는 다음에 다시 보냅니다', e));
      UI.open({ title: '💌 감사 편지', html: `<p>${s.revived && s.revived.from ? `<b>${esc(s.revived.from)}</b> 님에게` : '구조해 준 탐험대에게'} 감사 편지를 보냈어요.${itemId ? ` 선물: ${ITEMS[itemId].icon} ${esc(ITEMS[itemId].n)}` : ''}</p>`,
        choices: [{ label: '쓰러진 층부터 이어서 탐험한다', fn: resumeSOS }], cancel: () => renderTown() });
      return;
    }
    const code = Codes.encode('thx', { id: s.id, item: Codes.itemToNum(itemId) });
    s.thx = code; persist(); renderTown();
    codeBox('💌 감사 코드', `<p>구조해 준 친구에게 보내 주세요.${itemId ? ` 선물: ${ITEMS[itemId].icon} ${esc(ITEMS[itemId].n)}` : ''}</p>`, code, '쓰러진 층부터 이어서 탐험한다', resumeSOS);
  }

  // 구조된 뒤 이어서 탐험
  function resumeSOS() {
    const s = save.sos; if (!s || !s.revived) return;
    const ch = save.roster[s.sp] || newEntry(s.sp);
    const p = makeCreature(s.sp, ch.lv, { player: true, exp: ch.exp, moves: ch.moves.length ? ch.moves : undefined, ability: entryAbility(s.sp, ch), boost: ch.boost });
    Progress.add('rescued');
    p.held = s.snap.held; p.tms = (ch.tms || []).slice(); p.shiny = !!ch.shiny; p.belly = 100; p.selForm = ch.form || undefined;
    // 기다리는 동안 모은 가방은 창고로 (구조된 가방을 돌려받기 위해)
    if (save.bag.length) { save.bag.forEach(b => storeAdd(b.id, b.n)); UI.toast('지금 가방의 아이템은 창고에 넣었습니다.'); save.bag = []; }
    const run = { dungeon: s.dungeon, floor: s.floor, mode: 'normal', p, bag: s.snap.bag, money: s.snap.money, done: s.snap.done || [] };
    save.current = s.sp; save.sos = null; persist();
    UI.closeAll();
    show('dungeon-screen');
    Dungeon.enter(run);
  }

  // 구조를 포기: 그때 쓰러진 것으로 처리
  async function giveUpSOS() {
    const s = save.sos; if (!s) return;
    if (!(await UI.confirm('구조 포기', '<p>구조를 포기하면 쓰러졌을 때의 패널티(가방 아이템 절반, 지닌 물건 50%, 주웠던 돈)를 받습니다. 남은 아이템은 창고로 갑니다.</p>', '포기한다', '계속 기다린다'))) return;
    const bag = s.snap.bag.slice(), lost = [];
    const loseN = Math.floor(bag.length / 2) + (bag.length % 2 && Math.random() < 0.5 ? 1 : 0);
    for (let i = 0; i < loseN; i++) lost.push(bag.splice(rand(bag.length), 1)[0]);
    bag.forEach(b => storeAdd(b.id, b.n));
    if (s.snap.held) { if (Math.random() < 0.5) lost.push({ id: s.snap.held, n: 1 }); else storeAdd(s.snap.held); }
    save.money = Math.max(0, save.money - (s.snap.money || 0));
    if (s.online) Online.deleteSOS(s.docId || s.id).catch(() => {});
    save.sos = null; persist(); renderTown();
    UI.alert('구조를 포기했다', `<p>${lost.length ? `잃어버린 아이템: ${lost.map(b => ITEMS[b.id].icon + esc(ITEMS[b.id].n)).join(', ')}` : '잃어버린 아이템은 없다.'}</p>
      ${s.snap.money ? `<p>주웠던 돈 ₽${jo(s.snap.money, '을')} 잃었다.</p>` : ''}<p class="dim">남은 아이템은 창고로 옮겼습니다.</p>`);
  }

  // 구조해 준 친구에게서 온 감사 코드
  function receiveTHX(d) {
    const r = (save.rescued || {})[d.id];
    if (!r) { UI.alert('코드 오류', '<p>내가 구조한 친구에게서 온 감사 코드가 아닙니다.</p>'); return; }
    if (r.thanked) { UI.alert('이미 받음', '<p>이미 받은 감사 코드입니다.</p>'); return; }
    const ci = document.getElementById('code-input'); if (ci) ci.value = '';
    return gotThanks(r, Codes.numToItem(d.item));
  }
  function gotThanks(r, item, from) {
    r.thanked = true;
    if (item) storeAdd(item);
    persist(); renderTown();
    return UI.alert('💌 감사 편지', `<div class="center">${portraitImg(r.sp, 'portrait big', 'Joyous', r.shiny)}</div>
      <p class="center">구조해 준 ${esc(spName(r.sp))}의 ${from ? `탐험대 <b>${esc(from)}</b> 님` : '친구'}에게서 감사 편지가 왔다!</p>
      ${item ? `<p class="center">선물로 ${ITEMS[item].icon} <b>${esc(jo(ITEMS[item].n, '을'))}</b> 받았다! (창고로)</p>` : ''}`);
  }

  function finishRun(r, outcome) {
    const dg = dungeonById(r.dungeon);
    const p = r.p;
    const success = outcome === 'clear' || outcome === 'escape';
    const lines = [], aoks = [];
    const reached = outcome === 'clear' ? dg.floors : r.floor;
    if (!success) Progress.add('faints');
    if (!dg.daily) save.best[dg.id] = Math.max(save.best[dg.id] || 0, reached);
    if (outcome === 'clear' && !dg.daily) {
      const was = clearsOf(p.sp)[dg.id];
      const got = recordClear(p.sp, dg);
      if (dg.mode === 'rogue') save.cleared[dg.id] = true;
      if (!was) lines.push(`✔ ${esc(jo(spName(p.sp), '으로'))} ${esc(jo(dg.n, '을'))} 처음 클리어했다!`);
      for (const m of got) lines.push(`${m.icon} <b>메달 획득: ${esc(m.n)}</b> — ${esc(jo(spName(p.sp), '으로'))} ${esc(m.d.replace('모두 클리어', '모두 클리어했다!'))}`);
    }
    if (dg.mode === 'normal') {
      if (save.roster[p.sp] || p.sp === save.current) save.roster[p.sp] = { ...save.roster[p.sp], lv: p.lv, exp: p.exp, moves: p.moves.map(m => m.id), held: p.held || null, ...(p.tms ? { tms: p.tms } : {}), ...(p.boost ? { boost: p.boost } : {}) };
      if (success) {
        save.bag = r.bag;
        if (outcome === 'clear') {
          const bonus = dg.floors * (5 + dg.lv[1]);
          save.money += bonus;
          lines.push(`던전 클리어 보너스 ₽${bonus}`);
          if (!save.cleared[dg.id]) {
            save.cleared[dg.id] = true;
            for (const next of DUNGEONS.filter(d => d.req === dg.id)) lines.push(`새 던전 <b>${esc(jo(next.n, '이'))}</b> 열렸다!`);
          }
        }
        for (const m of save.missions.accepted.filter(m => r.done.includes(m.id))) {
          if (m.kind === 'sos' && m.online) {
            save.rescued = save.rescued || {};
            save.rescued[m.sosId] = { sp: m.client, shiny: m.shiny, thanked: false, online: true, claimed: false, docId: m.docId, dungeon: m.dungeon, floor: m.floor, me: { sp: p.sp, lv: p.lv, shiny: !!p.shiny } };
            Progress.add('rescues'); milestoneGift('rescues', lines);
          } else if (m.kind === 'sos') {
            const code = Codes.encode('aok', { id: m.sosId, sp: p.sp, lv: p.lv, sh: p.shiny ? 1 : 0 });
            save.rescued = save.rescued || {}; save.rescued[m.sosId] = { sp: m.client, shiny: m.shiny, thanked: false };
            save.aokSent = [...(save.aokSent || []), { id: m.sosId, sp: m.client, code }].slice(-10);
            aoks.push({ m, code });
            Progress.add('rescues'); milestoneGift('rescues', lines);
          }
          Progress.add('missions');
          if (m.kind !== 'sos') milestoneGift('missions', lines);
          save.money += m.reward;
          if (m.item) storeAdd(m.item);
          lines.push(`임무 완료 보상: ${rewardText(m)}${m.item ? ' (창고로)' : ''}`);
        }
        save.missions.accepted = save.missions.accepted.filter(m => !r.done.includes(m.id));
      } else {
        const bag = r.bag.slice();
        const half = abilityOf(p).stickyHold ? bag.length / 4 : bag.length / 2;
        const loseN = Math.floor(half) + (Math.random() < half % 1 ? 1 : 0);
        if (abilityOf(p).stickyHold) lines.push(`[${abilityName(p.ability)}] 아이템을 꽉 붙잡고 있었다!`);
        const lost = [];
        for (let i = 0; i < loseN; i++) lost.push(bag.splice(rand(bag.length), 1)[0]);
        save.bag = bag;
        if (p.held && Math.random() < (abilityOf(p).stickyHold ? 0.25 : 0.5)) { lost.push({ id: p.held, n: 1 }); save.roster[p.sp].held = null; }
        save.money = Math.max(0, save.money - r.money);
        if (lost.length) lines.push(`가방의 아이템 ${lost.length}개를 잃어버렸다: ${lost.map(b => ITEMS[b.id].icon + esc(ITEMS[b.id].n) + (b.n > 1 ? '×' + b.n : '')).join(', ')}`);
        else lines.push('가방의 아이템은 무사했다.');
        if (r.money) lines.push(`주웠던 돈 ₽${jo(r.money, '을')} 잃어버렸다...`);
        lines.push(`레벨은 유지된다. (Lv${p.lv})`);
      }
    } else {
      if (success) {
        const items = r.bag.filter(b => ITEMS[b.id]).concat(p.held ? [{ id: p.held, n: 1 }] : []);
        items.forEach(b => storeAdd(b.id, b.n));
        if (items.length) lines.push(`가져온 아이템 ${items.length}종을 창고에 넣었다.`);
        if (r.money) lines.push(`주운 돈 ₽${r.money}`);
        if (outcome === 'clear') { const bonus = dg.floors * 60; save.money += bonus; lines.push(`완주 보너스 ₽${bonus}`); }
      } else {
        save.money = Math.max(0, save.money - r.money);
        lines.push('쓰러져서 아무것도 가져오지 못했다...');
      }
      if (dg.daily) {
        const { rec, reward } = Progress.recordDaily(r, outcome, reached);
        lines.push(`오늘의 도전 기록: <b>${rec.floor}F</b>${rec.clear ? ' 완주!' : ''} · ${rec.turns}턴 · ${rec.kills}마리 쓰러뜨림`);
        lines.push(`도전 보상 ₽${reward}`);
        lines.push('기록은 던전 탭에서 친구에게 공유할 수 있습니다.');
      } else lines.push(`레벨과 가방이 원래대로 돌아왔다. (최고 기록 ${save.best[dg.id]}F)`);
    }
    save.run = null;
    save.day++;
    refreshDay();
    const got = Progress.check();
    if (got.length) lines.push(...got.map(a => `🏆 업적 달성: <b>${esc(a.n)}</b>`));
    persist();
    flushUpload();   // 던전을 마치면 클라우드에 바로 올린다
    Sound.town();
    show('town-screen');
    tab = 'dungeon';
    renderTown();
    const title = { clear: '던전 클리어!', escape: '무사히 돌아왔다', faint: '눈앞이 캄캄해졌다...', wind: '바람에 날려 쫓겨났다...', quit: '탐험을 포기했다' }[outcome] || '귀환';
    const face = { clear: 'Joyous', escape: 'Happy', faint: 'Crying', wind: 'Sad' }[outcome] || 'Normal';
    const res = UI.alert(title, `<div class="center">${portraitImg(p.sp, 'portrait big', face, save.roster[p.sp]?.shiny)}</div><p>${esc(dg.n)} ${reached}F${outcome === 'clear' ? ' 완주' : ''}</p><ul>${lines.map(l => `<li>${l}</li>`).join('')}</ul>`);
    if (Object.values(save.rescued || {}).some(x => x.online && !x.claimed && !x.thanked)) res.then(() => checkOnline(true));
    // 친구 구조 완료 → A-OK 코드 보여주기
    aoks.reduce((pr, a) => pr.then(() => new Promise(done => codeBox('✅ A-OK 코드', `<p>친구의 <b>${esc(jo(spName(a.m.client), '을'))}</b> 구조했다! 이 코드를 친구에게 보내면 친구가 되살아납니다.</p>`, a.code, '확인', done))), res);
  }

  // 던전 안에서 받은 임무 보기
  function showMissions() {
    const r = Dungeon.run; if (!r || UI.isOpen()) return;
    Dungeon.stopAuto();
    const dg = dungeonById(r.dungeon), acc = save.missions.accepted;
    const mine = acc.filter(m => m.dungeon === dg.id), other = acc.filter(m => m.dungeon !== dg.id);
    const state = m => r.done.includes(m.id) ? '<span class="tag ok">✅ 완료 · 마을로 돌아가면 보상</span>'
      : m.floor === r.floor ? '<span class="tag here">📍 이 층</span>'
      : m.floor > r.floor ? `<span class="tag">${m.floor}F · ${m.floor - r.floor}층 아래</span>` : `<span class="tag dim">${m.floor}F · 이미 지나침</span>`;
    const row = (m, st) => `<div class="row">${portraitImg(m.kind === 'outlaw' ? m.target : m.client, 'portrait sm', m.kind === 'sos' ? 'Pain' : 'Normal', !!m.shiny)}
      <div class="grow">${missionText(m)}<div class="dim">보상 ${rewardText(m)}</div>${st ? `<div>${st}</div>` : ''}</div></div>`;
    let html;
    if (r.mode !== 'normal') html = '<p>로그라이크 던전에서는 임무를 진행할 수 없습니다.</p>' + (acc.length ? `<p class="dim">받아 둔 임무 ${acc.length}개는 일반 던전에서 진행하세요.</p>` : '');
    else {
      html = `<h3>${esc(dg.n)}의 임무 <span class="dim">(지금 ${r.floor}F)</span></h3>
        ${mine.length ? mine.map(m => row(m, state(m))).join('') : '<p class="dim">이 던전에서 받은 임무가 없습니다.</p>'}
        ${other.length ? `<h3>다른 던전의 임무</h3>${other.map(m => row(m)).join('')}` : ''}
        ${r.done.length ? '<p class="dim">완료한 임무의 보상은 계단으로 나가거나 탈출하면 받습니다. 쓰러지면 받을 수 없어요.</p>' : ''}`;
    }
    UI.open({ title: '📜 임무 확인', wide: true, html, choices: [{ label: '닫기', fn: () => {} }] });
  }

  function dungeonMenu() {
    if (UI.isOpen()) return;
    Dungeon.stopAuto();
    const s = save.settings;
    UI.open({
      title: '메뉴',
      choices: [
        { label: '돌아가기', fn: () => {} },
        { label: '가방', fn: () => Dungeon.floor && document.querySelector('#actions [data-k=bag]').click() },
        { label: '📜 임무 확인 (J)', fn: () => setTimeout(showMissions, 0) },
        { label: '💬 메시지 기록 (U)', fn: () => setTimeout(Dungeon.showLog, 0) },
        { label: '📊 내 상태 (P)', fn: () => setTimeout(Dungeon.showStatus, 0) },
        { label: '조작법', fn: Dungeon.showHelp },
        { label: '게임 가이드 (타입 상성표 등)', fn: Guide.menu },
        { label: `빠른 연출: ${s.fast ? '켜짐' : '꺼짐'}`, fn: () => { s.fast = !s.fast; persist(); dungeonMenu(); } },
        { label: `계단 자동 하강: ${s.autoDescend ? '켜짐' : '꺼짐'}`, fn: () => { s.autoDescend = !s.autoDescend; persist(); dungeonMenu(); } },
        { label: `효과음: ${s.sfx !== false ? '켜짐' : '꺼짐'}`, fn: () => { s.sfx = s.sfx === false; persist(); Sound.refresh(); dungeonMenu(); } },
        { label: `배경음: ${s.bgm !== false ? '켜짐' : '꺼짐'}`, fn: () => { s.bgm = s.bgm === false; persist(); Sound.refresh(); dungeonMenu(); } },
        { label: '포기하고 돌아간다', fn: async () => {
          const ok = await UI.confirm('포기', '<p>탐험을 포기합니다. 쓰러진 것과 같이 처리됩니다.</p>', '포기한다', '계속한다');
          if (ok) endRun('quit');
        } },
      ],
    });
  }

  function setSetting(k, v) { save.settings[k] = v; persist(); Sound.refresh(); applyPad(); }
  // 휴대폰 조작: 터치가 되는 기기면 방향 버튼을 보인다. 펜·마우스가 함께 있는 기기는 브라우저가 터치 기기로 알려주지 않기도 해서 넓게 본다
  // (설정에서 '방향 버튼 항상 표시'를 켜면 어떤 기기에서든 보인다)
  const touchDevice = () => (navigator.maxTouchPoints || 0) > 0 || 'ontouchstart' in window || matchMedia('(any-pointer: coarse)').matches;
  function applyPad() { document.body.classList.toggle('touch', touchDevice() || !!save?.settings?.dpad); }

  // 도감용: 클리어 기록이 있는 포켓몬의 메달 (기록이 없으면 빈 값)
  const hasClears = sp => Object.keys(clearsOf(sp)).length > 0;
  const dexMedals = () => { const out = {}; for (const k of new Set([...Object.keys(save?.clears || {}), ...Object.keys(save?.roster || {})])) { const ic = medalIcons(+k); if (ic) out[k] = ic; } return out; };
  return { hasClears, medalSection, dexMedals, askUpdate, recruit, unlockShiny, showMissions, importSave, noteShiny, boot, endRun, saveRunSnapshot, dungeonMenu, setSetting, renderTown, get save() { return save; }, setTab(t) { tab = t; renderTown(); } };
})();

window.addEventListener('DOMContentLoaded', () => {
  document.addEventListener('click', e => {
    const b = e.target.closest('[data-ability]'); if (!b) return;
    e.preventDefault(); e.stopPropagation();
    if (Dex && b.closest('#tab-content') && b.dataset.dex) Dex.showAbility(+b.dataset.ability); else showAbilityInfo(+b.dataset.ability);
  }, true);
  // 어디서든 data-move 요소를 누르면 기술 설명
  document.addEventListener('click', e => {
    const b = e.target.closest('[data-move]'); if (!b) return;
    e.preventDefault(); e.stopPropagation();
    showMoveInfo(+b.dataset.move, b.dataset.pp != null ? +b.dataset.pp : undefined, b.dataset.max != null ? +b.dataset.max : undefined);
  }, true);
  document.getElementById('update-note').onclick = () => Game.askUpdate();
  document.getElementById('town-tabs').onclick = e => { const b = e.target.closest('button'); if (b) Game.setTab(b.dataset.tab); };
  document.getElementById('town-screen').addEventListener('change', async e => {
    if (e.target.dataset.set) Game.setSetting(e.target.dataset.set, e.target.checked);
    if (e.target.dataset.setnum) { Game.setSetting(e.target.dataset.setnum, +e.target.value); Sound.play('menu'); }
    if (e.target.classList.contains('tm-only')) filterTMs();
    if (e.target.id === 'save-file' && e.target.files[0]) { Game.importSave(e.target.files[0]); e.target.value = ''; }
    if (e.target.dataset.music && e.target.files[0]) {
      const ok = await Sound.importMusic(e.target.dataset.music, e.target.files[0]);
      if (ok) { UI.toast('음악 파일을 불러왔습니다. 그 장소에 가면 재생됩니다.'); Game.renderTown(); }
      else UI.alert('불러오기 실패', '<p>음악 파일(ogg / mp3 / m4a / wav)이 아니거나 브라우저에 저장할 수 없습니다.</p>');
      e.target.value = '';
    }
    if (e.target.dataset.tileset && e.target.files[0]) {
      const r = await Tiles.importFiles(e.target.dataset.tileset, e.target.files);
      if (r.ok) { UI.toast(`타일셋을 불러왔습니다${r.vars ? ` (변형 ${r.vars}개 포함)` : ''}. 다음 층부터 적용됩니다.`); Game.renderTown(); }
      else UI.alert('타일셋 불러오기 실패', `<p>${esc(r.msg)}</p>`);
    }
  });
  // 기술머신 목록 검색 (다시 그리지 않고 숨기기만 해서 입력이 끊기지 않게)
  function filterTMs() {
    const q = (document.querySelector('.tm-q')?.value || '').trim().toLowerCase(), only = document.querySelector('.tm-only')?.checked;
    let n = 0;
    document.querySelectorAll('.tm-item').forEach(r => { const ok = (!q || r.dataset.s.includes(q)) && (!only || r.dataset.u === '1'); r.style.display = ok ? '' : 'none'; if (ok) n++; });
    const em = document.querySelector('.tm-empty'); if (em) em.style.display = n ? 'none' : '';
  }
  document.getElementById('town-screen').addEventListener('input', e => { if (e.target.classList.contains('tm-q')) filterTMs(); });
  window.addEventListener('keydown', e => { if (!Dungeon.floor && UI.isOpen()) UI.key(e); });
  Game.boot();
});

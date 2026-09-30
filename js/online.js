// 온라인 기능: 계정(아이디/비밀번호), 클라우드 세이브, 구조 게시판
// Firebase 무료 요금제(Spark)만 쓴다. 한도를 넘으면 그날은 요청이 거절될 뿐 요금은 나가지 않는다.
// 서버가 막혀도 게임은 브라우저 세이브로 계속할 수 있어야 한다: 여기서 나는 오류는 전부 잡아서 알림만 한다.
'use strict';

const Online = (() => {
  const SDK = 'https://www.gstatic.com/firebasejs/10.12.2/';
  const MAIL = '@pmdweb.invalid';   // 아이디를 Firebase 이메일 로그인에 쓰기 위한 가짜 주소 (메일은 보내지 않는다)
  const SOS_DAYS = 7;               // 게시판에 보이는 기간
  let ready = null, auth = null, db = null, user = null, profile = null;
  const listeners = [];

  const enabled = () => typeof ONLINE_CONFIG !== 'undefined' && !!ONLINE_CONFIG;
  const loggedIn = () => !!user;

  function loadScript(src) {
    return new Promise((res, rej) => {
      const s = document.createElement('script');
      s.src = src; s.onload = res; s.onerror = () => rej(new Error('load ' + src));
      document.head.appendChild(s);
    });
  }

  // SDK를 불러오고 로그인 상태를 확인한다. 실패하면 false (오프라인 등)
  function init() {
    if (!enabled()) return Promise.resolve(false);
    if (ready) return ready;
    ready = (async () => {
      for (const f of ['firebase-app-compat.js', 'firebase-auth-compat.js', 'firebase-firestore-compat.js']) await loadScript(SDK + f);
      const app = firebase.initializeApp(ONLINE_CONFIG);
      auth = app.auth(); db = app.firestore();
      await new Promise(res => {
        let first = true;
        auth.onAuthStateChanged(async u => {
          user = u; profile = null;
          if (u) { try { await loadProfile(); } catch (e) { console.warn(e); } }
          if (first) { first = false; res(); } else listeners.forEach(f => f(u));
        });
      });
      return true;
    })().catch(e => { console.warn('온라인 기능을 불러오지 못했습니다', e); ready = null; return false; });
    return ready;
  }
  const onChange = f => listeners.push(f);

  async function loadProfile() {
    const d = await db.collection('users').doc(user.uid).get();
    profile = d.exists ? d.data() : {};
    // 닉네임을 겹치지 않게 하기 전에 만든 계정: 로그인할 때 차지해 둔다 (이미 다른 사람이 쓰면 바꾸라고 안내)
    if (profile.name) {
      try { await claimName(profile.name); profile.nameOk = true; }
      catch (e) { if (e.taken) profile.nameTaken = true; }
    }
  }
  const name = () => (profile && profile.name) || (user ? user.email.replace(MAIL, '') : '');
  const userId = () => (user ? user.email.replace(MAIL, '') : '');

  // Firebase 오류 → 한국어 안내
  function why(e) {
    const c = (e && e.code) || '';
    if (/email-already-in-use/.test(c)) return '이미 있는 아이디입니다. 다른 아이디를 골라 주세요.';
    if (/invalid-credential|wrong-password|user-not-found|invalid-login/.test(c)) return '아이디나 비밀번호가 맞지 않습니다.';
    if (/weak-password/.test(c)) return '비밀번호는 6자 이상이어야 합니다.';
    if (/invalid-email/.test(c)) return '아이디에 쓸 수 없는 글자가 있습니다.';
    if (/too-many-requests/.test(c)) return '시도가 너무 많아 잠시 막혔습니다. 조금 뒤에 다시 해 주세요.';
    if (/network|unavailable/.test(c)) return '서버에 연결할 수 없습니다. 인터넷 연결을 확인해 주세요.';
    if (/quota|resource-exhausted/.test(c)) return '오늘 서버 사용량 한도를 넘었습니다. 내일 다시 이용할 수 있어요. (브라우저 세이브로는 계속 플레이할 수 있습니다)';
    if (/permission-denied/.test(c)) return '권한이 없습니다. 다시 로그인해 보세요.';
    return '알 수 없는 오류가 났습니다. (' + (c || (e && e.message) || e) + ')';
  }

  const ID_RE = /^[a-z0-9_]{3,16}$/;
  function checkName(n, max = 10) {
    n = String(n || '').trim();
    if (!n) return '닉네임을 입력해 주세요.';
    if (n.length > max) return `닉네임은 ${max}자까지입니다.`;
    if (!/^[\p{L}\p{N} _.\-]+$/u.test(n) || /^\.+$/.test(n) || /^__.*__$/.test(n)) return '닉네임에는 글자, 숫자, 띄어쓰기, _ . - 만 쓸 수 있습니다.';
    return null;
  }
  // ── 닉네임은 겹치지 않게: names/{소문자 닉네임} = { uid } 로 먼저 차지한다 (아이디는 로그인 기능이 알아서 겹치지 않게 한다)
  const nameKey = n => String(n).trim().normalize('NFC').toLowerCase();
  async function nameFree(n) {
    const d = await db.collection('names').doc(nameKey(n)).get();
    return !d.exists || (user && d.data().uid === user.uid);
  }
  async function claimName(n, old) {
    const ref = db.collection('names').doc(nameKey(n));
    await db.runTransaction(async t => {
      const d = await t.get(ref);
      if (d.exists && d.data().uid !== user.uid) throw { taken: true };
      if (!d.exists) t.set(ref, { uid: user.uid });
    });
    if (old && nameKey(old) !== nameKey(n)) await db.collection('names').doc(nameKey(old)).delete().catch(() => {});
  }
  const TAKEN = '이미 누가 쓰고 있는 닉네임입니다. 다른 닉네임을 골라 주세요.';
  async function signUp(id, pw, nick) {
    id = String(id || '').trim().toLowerCase(); nick = String(nick || '').trim();
    if (!ID_RE.test(id)) throw { msg: '아이디는 영어 소문자, 숫자, _ 로 3~16자입니다.' };
    if (String(pw).length < 6) throw { msg: '비밀번호는 6자 이상이어야 합니다.' };
    const bad = nick ? checkName(nick) : null; if (bad) throw { msg: bad };
    nick = nick || id;
    await init();
    let free;
    try { free = await nameFree(nick); } catch (e) { throw { msg: why(e) }; }
    if (!free) throw { msg: nick === id ? '아이디와 같은 닉네임을 이미 누가 쓰고 있어요. 닉네임을 따로 정해 주세요.' : TAKEN };
    try { user = (await auth.createUserWithEmailAndPassword(id + MAIL, pw)).user; }
    catch (e) { throw { msg: why(e) }; }
    profile = { id };
    try { await claimName(nick); }
    catch (e) {   // 그 사이에 누가 먼저 가져감: 가입은 됐으니 닉네임만 다시 정하게 한다
      await db.collection('users').doc(user.uid).set({ id, created: Date.now() }, { merge: true }).catch(() => {});
      throw { msg: e.taken ? '가입은 됐지만 그 닉네임을 방금 다른 사람이 가져갔어요. 계정 → 닉네임 바꾸기에서 정해 주세요.' : why(e), joined: true };
    }
    profile = { name: nick, id, nameOk: true };
    try { await db.collection('users').doc(user.uid).set({ name: nick, id, created: Date.now() }, { merge: true }); }
    catch (e) { throw { msg: why(e), joined: true }; }
  }
  async function signIn(id, pw) {
    id = String(id || '').trim().toLowerCase();
    if (!id || !pw) throw { msg: '아이디와 비밀번호를 입력해 주세요.' };
    await init();
    try { const cred = await auth.signInWithEmailAndPassword(id + MAIL, pw); user = cred.user; await loadProfile(); }
    catch (e) { throw { msg: why(e) }; }
  }
  async function signOut() { if (auth) await auth.signOut(); user = null; profile = null; }
  async function setName(nick) {
    nick = String(nick || '').trim();
    const bad = checkName(nick); if (bad) throw { msg: bad };
    try {
      await claimName(nick, profile && profile.nameOk ? profile.name : null);
      await db.collection('users').doc(user.uid).set({ name: nick }, { merge: true });
      profile = { ...profile, name: nick, nameOk: true, nameTaken: false };
    } catch (e) { throw { msg: e.taken ? TAKEN : why(e) }; }
  }

  // ── 클라우드 세이브: users/{uid}.save (JSON 문자열), savedAt (저장한 시각) ──
  async function fetchCloud() {
    if (!user) return null;
    await loadProfile();
    return profile.save ? { raw: profile.save, savedAt: profile.savedAt || 0, ver: profile.ver || '0' } : null;
  }
  async function pushCloud(raw, savedAt) {
    if (!user) return;
    await db.collection('users').doc(user.uid).set({ save: raw, savedAt, ver: GAME_VERSION }, { merge: true });
    profile = { ...profile, save: raw, savedAt, ver: GAME_VERSION };
  }
  async function clearCloud() {
    const del = firebase.firestore.FieldValue.delete();
    await db.collection('users').doc(user.uid).update({ save: del, savedAt: del, ver: del });
    profile = { name: profile && profile.name, id: profile && profile.id };
  }

  // ── 구조 게시판: sos/{올린 시각_요청 번호} ──
  // 문서 이름이 올린 시각으로 시작해서, 이름순으로 읽으면 오래된 요청부터 나온다 (추가 색인 없이)
  const openKey = () => GAME_VERSION + '|open';
  const BOARD_SIZE = 10;               // 게시판에 보이는 요청 수 (가장 오래 기다린 것부터)
  const HOLD_MS = 2 * 3600 * 1000;     // 누가 구조하러 가면 이 시간 동안 다른 사람에게는 안 보인다
  const stamp = t => String(t).padStart(14, '0');
  const idOf = docId => +String(docId).split('_').pop();   // 문서 이름 → 요청 번호 (SOS 코드의 번호)
  async function postSOS(s) {
    const created = Date.now(), docId = `${stamp(created)}_${s.id}`;
    await db.collection('sos').doc(docId).set({
      owner: user.uid, name: name(), dungeon: s.dungeon, floor: s.floor, sp: s.sp, lv: s.lv, shiny: !!s.shiny,
      ver: GAME_VERSION, key: openKey(), status: 'open', created,
    });
    return docId;
  }
  const heldByOther = s => s.takenBy && s.takenBy !== user.uid && s.takenAt && s.takenAt.toMillis() > Date.now() - HOLD_MS;
  // 같은 버전의 열린 요청 중 가장 오래 기다린 것부터 (최근 7일, 내 것과 다른 사람이 구조하러 간 것 제외)
  async function listSOS() {
    const since = stamp(Date.now() - SOS_DAYS * 864e5);
    const q = await db.collection('sos').where('key', '==', openKey())
      .orderBy(firebase.firestore.FieldPath.documentId()).startAt(since).limit(30).get();
    return q.docs.map(d => ({ id: d.id, sid: idOf(d.id), ...d.data() }))
      .filter(s => s.owner !== user.uid && !heldByOther(s)).slice(0, BOARD_SIZE);
  }
  // 구조하러 간다: 이 요청을 2시간 동안 맡는다. 이미 다른 사람이 맡았거나 끝났으면 false
  async function takeSOS(docId) {
    const ref = db.collection('sos').doc(String(docId));
    return db.runTransaction(async t => {
      const d = await t.get(ref);
      if (!d.exists || d.data().status !== 'open' || heldByOther(d.data())) return false;
      t.update(ref, { takenBy: user.uid, takenAt: firebase.firestore.FieldValue.serverTimestamp() });
      return true;
    });
  }
  // 구조 임무를 취소: 다른 사람이 받을 수 있게 풀어 준다
  async function releaseSOS(docId) {
    const ref = db.collection('sos').doc(String(docId));
    const d = await ref.get();
    if (d.exists && d.data().status === 'open' && d.data().takenBy === user.uid) await ref.update({ takenBy: null, takenAt: null });
  }
  async function getSOS(id) {
    const d = await db.collection('sos').doc(String(id)).get();
    return d.exists ? d.data() : null;
  }
  // 구조 완료를 알린다. 이미 누가 구조했거나 요청자가 포기했으면 false
  async function claimRescue(id, me) {
    const ref = db.collection('sos').doc(String(id));
    return db.runTransaction(async t => {
      const d = await t.get(ref);
      if (!d.exists || d.data().status !== 'open') return false;
      t.update(ref, { status: 'rescued', key: GAME_VERSION + '|done', rescuer: { uid: user.uid, name: name(), sp: me.sp, lv: me.lv, shiny: !!me.shiny } });
      return true;
    });
  }
  const thankSOS = (id, item) => db.collection('sos').doc(String(id)).update({ status: 'thanked', thx: item || null });
  const deleteSOS = id => db.collection('sos').doc(String(id)).delete();

  return {
    enabled, init, onChange, loggedIn, name, userId, why, nameTaken: () => !!(profile && profile.nameTaken),
    signUp, signIn, signOut, setName, uid: () => user && user.uid,
    fetchCloud, pushCloud, clearCloud,
    postSOS, listSOS, takeSOS, releaseSOS, getSOS, claimRescue, thankSOS, deleteSOS, idOf,
  };
})();

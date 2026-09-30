// 개발용: 음악 파일에서 루프 구간 찾기 (게임을 로컬 서버로 연 뒤 브라우저 콘솔에서)
//   const s = document.createElement('script'); s.src = 'tools/loopfind.js'; document.head.appendChild(s);
//   await LoopFind.run(['town', 'beach'])   →  { town: { start, end, ncc, ... } }
// "인트로 + 반복 구간 2번 + 페이드아웃" 형태의 파일에서 반복 길이(L)와 반복이 시작되는 지점(S)을 찾는다.
// 반복된 두 부분이 샘플 단위로 똑같지는 않아서(재생 위상 차이) 파형 상관으로 길이를 맞춘다.
'use strict';
const LoopFind = (() => {
  // near: 반복 길이를 대략 알면 (초) 그 근처에서만 찾는다
  async function analyze(url, near) {
    const ac = new OfflineAudioContext(1, 1, 44100);
    const buf = await ac.decodeAudioData(await (await fetch(url)).arrayBuffer());
    const sr = buf.sampleRate, n = buf.length, dur = n / sr;
    const c0 = buf.getChannelData(0), c1 = buf.numberOfChannels > 1 ? buf.getChannelData(1) : c0;
    const D = 4, m = Math.floor(n / D), y = new Float32Array(m), ysr = sr / D;
    for (let i = 0; i < m; i++) { let s = 0; for (let k = 0; k < D; k++) s += c0[i * D + k] + c1[i * D + k]; y[i] = s / (2 * D); }
    // 1) 짧은 구간(23ms)마다 크기·고음 성분 → 반복 길이 후보
    const H = 256, F = Math.floor(m / H), f1 = new Float32Array(F), f2 = new Float32Array(F), fps = ysr / H;
    for (let j = 0; j < F; j++) {
      let a = 0, b = 0;
      for (let i = j * H; i < (j + 1) * H; i++) { a += y[i] * y[i]; const d = y[i] - (i ? y[i - 1] : 0); b += d * d; }
      f1[j] = Math.log(1e-7 + a / H); f2[j] = Math.log(1e-7 + b / H);
    }
    const guard = Math.round(12 * fps);   // 끝의 페이드아웃은 비교하지 않는다
    const envErr = (L, st, end) => { let e = 0; for (let j = st; j < end; j++) e += Math.abs(f1[j] - f1[j + L]) + Math.abs(f2[j] - f2[j + L]); return e / (end - st); };
    const scores = [];
    for (let L = Math.round(8 * fps); ; L++) {
      const end = F - guard - L; if (end < Math.round(4 * fps)) break;
      scores.push([envErr(L, Math.max(0, end - Math.min(L, Math.round(30 * fps))), end), L]);
    }
    if (!scores.length) return { dur, error: '너무 짧음' };
    scores.sort((a, b) => a[0] - b[0]);
    const cands = [];
    // 이런 파일은 보통 반복 구간이 두 번 들어 있다: 인트로 + 2L + 페이드(몇 초) ≈ 전체 길이
    const fitsTwice = L => { const rest = dur - 2 * L / fps; return rest >= 2 && rest <= 32; };
    const ok = near ? (L => Math.abs(L / fps - near) < 0.4) : fitsTwice;
    const pool = scores.filter(([, L]) => ok(L)).length ? scores.filter(([, L]) => ok(L)) : scores;
    for (const [, L] of pool) { if (cands.every(c => Math.abs(c - L) > 8)) cands.push(L); if (cands.length >= 8) break; }
    // 2) 후보마다 파형 상관(NCC)으로 정밀하게: 가장 잘 맞는 것
    const ncc = (t, lag, w) => { let xy = 0, xx = 0, yy = 0; for (let i = 0; i < w; i++) { const a = y[t + i], b = y[t + i + lag]; xy += a * b; xx += a * a; yy += b * b; } return xy / Math.sqrt(xx * yy + 1e-12); };
    let best = null;
    for (const L of cands) {
      const W = Math.round(4 * ysr), t0 = (F - guard - L) * H - W - Math.round(1 * ysr);
      if (t0 < 0) continue;
      const span = Math.round(0.04 * ysr);
      let bl = 0, bv = -2, vals = [];
      for (let d = -span; d <= span; d++) { const v = ncc(t0, L * H + d, W); vals.push(v); if (v > bv) { bv = v; bl = d; } }
      // 이웃 값으로 샘플 사이까지 보간
      const k = bl + span, a = vals[k - 1] ?? bv, c = vals[k + 1] ?? bv, den = a - 2 * bv + c;
      const frac = den < 0 ? 0.5 * (a - c) / den : 0;
      const r = { lagY: L * H + bl + frac, ncc: bv, t0, L };
      if (!best || r.ncc > best.ncc + 0.02 || (Math.abs(r.ncc - best.ncc) <= 0.02 && r.lagY < best.lagY)) best = r;
    }
    if (!best) return { dur, error: '후보 없음' };
    const loopLen = best.lagY / ysr;
    // 3) 반복이 시작되는 곳: 잘 맞는 곳에서 거꾸로 가며, 크기 모양이 달라지는 곳 (+여유 0.5초)
    const L = best.L, base = envErr(L, Math.max(0, Math.round(best.t0 / H) - Math.round(5 * fps)), Math.round(best.t0 / H));
    const win = Math.round(1 * fps);
    let S = Math.round(best.t0 / H);
    for (let j = S; j >= 0; j--) { if (envErr(L, j, Math.min(j + win, F - L)) > Math.max(base * 2.5, 0.8)) break; S = j; }
    const start = Math.min(dur - loopLen - 1, S / fps + (S > 0 ? 0.5 : 0));
    return { dur: +dur.toFixed(2), start: +start.toFixed(4), end: +(start + loopLen).toFixed(4), loopLen: +loopLen.toFixed(4), ncc: +best.ncc.toFixed(3) };
  }
  // keys: ['town', ...] 또는 { town: 27.7 (대략 반복 길이), ... }
  async function run(keys) {
    const out = {}, list = Array.isArray(keys) ? keys.map(k => [k, null]) : Object.entries(keys);
    for (const [k, near] of list) { try { out[k] = await analyze(`music/${k}.mp3`, near); } catch (e) { out[k] = { error: String(e) }; } }
    return out;
  }
  return { analyze, run };
})();

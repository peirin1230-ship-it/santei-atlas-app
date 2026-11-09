/* santei-atlas-app：ホーム画面のアプリ（とパソコンのブラウザ）の入れ物。
   ページ・一次情報・点数・DPCのデータは非公開の santei-atlas リポジトリの site ブランチにあり
   （santei-atlas の .github/workflows/site.yml が main から作る）、ここには「トークンの設定・読み込み・とっておく口」だけを置く。
   トークンはこの端末にだけ保存し、api.github.com 以外には送らない。

   流れ：
   1. トークンが無ければ設定の画面を出す（iPhone の Safari なら、先にホーム画面に追加する案内）
   2. site ブランチのファイル一覧を GitHub API で読み、index.html を取ってこの端末にとっておく
      （次からは、とっておいた版をすぐ出し、裏で新しい版が出ていないかを確かめる）
   3. その HTML に、アイコンなどの頭と「データの口（bridge）」と図（Mermaid）の描画を足して、この画面に書き出す
      データ（data/*.json）は、使うときに bridge が GitHub API から取り、中身の sha ごとにとっておく */
(() => {
  'use strict';
  const REPO = { owner: 'peirin1230-ship-it', name: 'santei-atlas', site: 'site' };
  const API = 'https://api.github.com';
  const TOKEN_KEY = 'santei-atlas-app:token';
  const META_KEY = 'santei-atlas-app:site';
  const DATA_CACHE = 'santei-atlas-app-data-v1';
  const CACHE_PREFIX = new URL('./__data/', location.href).href;
  const NAME = 'santei-atlas';
  const TAGLINE = '算定で迷ったときの根拠と壁打ち';
  const MERMAID = 'https://cdn.jsdelivr.net/npm/mermaid@11.4.1/dist/mermaid.esm.min.mjs';
  const TOKEN_URL = 'https://github.com/settings/personal-access-tokens/new?' + new URLSearchParams({
    name: 'santei-atlas-app',
    description: 'santei-atlas のページ・一次情報をホーム画面のアプリで読む（読み取りだけ）',
    target_name: REPO.owner,
    expires_in: '365',
    contents: 'read',
  });
  const root = document.getElementById('shell');

  /* ---------- 小さな道具 ---------- */
  const h = (tag, attrs, ...kids) => {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v == null || v === false) continue;
      if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
      else el.setAttribute(k, v === true ? '' : v);
    }
    for (const kid of kids.flat()) if (kid != null && kid !== false) el.append(kid);
    return el;
  };
  const getToken = () => { try { return localStorage.getItem(TOKEN_KEY) || ''; } catch (e) { return ''; } };
  const setToken = t => { try { if (t) localStorage.setItem(TOKEN_KEY, t); else localStorage.removeItem(TOKEN_KEY); } catch (e) { /* 保存できない */ } };
  const getMeta = () => { try { return JSON.parse(localStorage.getItem(META_KEY) || 'null'); } catch (e) { return null; } };
  const setMeta = m => { try { localStorage.setItem(META_KEY, JSON.stringify(m)); } catch (e) { /* 保存できない */ } };
  const headers = (token, extra) => Object.assign({ Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', Authorization: 'Bearer ' + token }, extra || {});
  const fail = (code, status, message) => Object.assign(new Error(message || code), { code, status });
  const standalone = () => window.navigator.standalone === true || (window.matchMedia && matchMedia('(display-mode: standalone)').matches);
  const iosSafari = () => /iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

  async function call(url, token, extra) {
    let res;
    try { res = await fetch(url, { headers: headers(token, extra), cache: 'no-store' }); }
    catch (e) { throw fail('offline', 0, '通信できませんでした'); }
    if (res.status === 401) throw fail('auth', 401, 'トークンが無効になっています。作り直して貼り直してください');
    if (res.status === 403 && res.headers.get('x-ratelimit-remaining') !== '0') throw fail('auth', 403, 'トークンにこのリポジトリを読む権限がありません（Contents: Read-only）');
    if (!res.ok) throw fail(res.status === 404 ? 'notfound' : 'offline', res.status, `読み込めませんでした（${res.status}）`);
    return res;
  }
  async function cacheGet(sha) {
    try { const c = await caches.open(DATA_CACHE); const r = await c.match(CACHE_PREFIX + sha); return r ? await r.text() : null; } catch (e) { return null; }
  }
  async function cachePut(sha, text) {
    try { const c = await caches.open(DATA_CACHE); await c.put(CACHE_PREFIX + sha, new Response(text, { headers: { 'Content-Type': 'text/plain; charset=utf-8' } })); } catch (e) { /* 次も取りにいくだけ */ }
  }
  async function cachePrune(keep) {
    try {
      const c = await caches.open(DATA_CACHE);
      for (const req of await c.keys()) if (!keep.has(req.url.slice(CACHE_PREFIX.length))) await c.delete(req);
    } catch (e) { /* 消せなくても困らない */ }
  }

  /* ---------- 画面（ホーム画面への追加・設定・読み込み中・失敗） ---------- */
  function frame(...kids) {
    root.replaceChildren(h('div', { class: 'panel' },
      h('div', { class: 'brand' }, h('p', { class: 'cap' }, '照会票　医科・DPC　急性期'), h('h1', null, '算定', h('em', null, 'アトラス')), h('p', null, NAME + '　' + TAGLINE)),
      kids));
  }
  function loading(text) {
    root.replaceChildren(h('div', { class: 'splash' }, h('img', { src: 'icon-180.png', alt: '', width: 76, height: 76 }), h('p', null, text)));
  }
  function failed(e) {
    frame(h('p', { class: 'lead' }, '読み込めませんでした。'), h('p', { class: 'note' }, e.message || String(e)),
      h('div', { class: 'row' }, h('button', { class: 'btn primary', type: 'button', onclick: () => start() }, 'もう一度')));
  }
  function addToHome() {
    return h('section', { class: 'box' },
      h('h2', null, 'iPhone のホーム画面に置く（先にこちら）'),
      h('ol', null,
        h('li', null, 'この画面を Safari でひらいたまま、共有（□に↑。無ければ右下の「…」の中）→「ホーム画面に追加」'),
        h('li', null, '「Webアプリとして開く」はオンのまま「追加」'),
        h('li', null, 'ホーム画面の santei-atlas からひらいて、そこでトークンを貼る（Safari とホーム画面のアプリでは保存場所が別）')));
  }
  function setup(message) {
    const input = h('input', { id: 'tok', type: 'password', autocomplete: 'off', autocapitalize: 'off', spellcheck: 'false', placeholder: 'github_pat_…', 'aria-describedby': 'tok-status' });
    const status = h('p', { id: 'tok-status', class: 'status', role: 'status' }, message || '');
    const save = h('button', { class: 'btn primary', type: 'submit' }, '保存してひらく');
    const form = h('form', { class: 'token', onsubmit: async ev => {
      ev.preventDefault();
      const t = input.value.trim();
      if (!t) { status.textContent = 'トークンを貼ってください'; return; }
      save.disabled = true; status.textContent = '確かめています…';
      try {
        const res = await call(`${API}/repos/${REPO.owner}/${REPO.name}`, t);
        const j = await res.json();
        setToken(t);
        status.textContent = `${j.full_name} につながりました`;
        start();
      } catch (e) {
        status.textContent = e.code === 'notfound' ? 'トークンの対象に santei-atlas が入っていません（Only select repositories → santei-atlas）' : e.message;
        save.disabled = false;
      }
    } }, h('label', { for: 'tok' }, 'トークン'), input, status, h('div', { class: 'row' }, save));
    frame(
      iosSafari() && !standalone() ? addToHome() : null,
      h('p', { class: 'lead' }, 'ページ・告示・通知・点数・DPCのデータは、非公開の santei-atlas リポジトリにあります。最初に一度だけ、GitHub のトークンを貼ってください。'),
      h('ol', { class: 'steps' },
        h('li', null, h('a', { href: TOKEN_URL, target: '_blank', rel: 'noopener' }, 'トークンを作る画面をひらく'), '（名前・期限・Contents の読み取り権限が入った状態でひらきます）'),
        h('li', null, '「Repository access」で ', h('b', null, 'Only select repositories → santei-atlas'), ' を選んで、いちばん下の「Generate token」'),
        h('li', null, '出てきた ', h('code', null, 'github_pat_…'), ' をコピーして、下に貼る')),
      form,
      h('p', { class: 'note' }, 'トークンはこの端末にだけ保存し、GitHub 以外には送りません。読み取りだけの権限で足ります。患者を特定できる情報は入力しないでください。'));
    if (!(iosSafari() && !standalone())) setTimeout(() => input.focus(), 50);
  }

  /* ---------- 読み込みと書き出し ---------- */
  async function latest(token) {
    let res;
    try { res = await call(`${API}/repos/${REPO.owner}/${REPO.name}/git/trees/${REPO.site}?recursive=1`, token); }
    catch (e) {
      if (e.code !== 'notfound') throw e;
      try { await call(`${API}/repos/${REPO.owner}/${REPO.name}`, token); }
      catch (e2) { throw e2.code === 'notfound' ? fail('auth', 404, 'トークンの対象に santei-atlas が入っていません（Only select repositories → santei-atlas）') : e2; }
      throw fail('nosite', 404, 'santei-atlas に site ブランチがまだありません。santei-atlas の Actions「site」が動いたか確かめてください');
    }
    const j = await res.json();
    const files = {};
    for (const t of j.tree || []) if (t.type === 'blob') files[t.path] = t.sha;
    if (!files['index.html']) throw fail('nosite', 404, 'site ブランチに index.html がありません');
    const html = await blob(files['index.html'], token);
    let generated = '';
    if (files['version.json']) { try { generated = JSON.parse(await blob(files['version.json'], token)).generated || ''; } catch (e) { /* 版が分からなくても動く */ } }
    return { meta: { tree: j.sha, files, generated, at: Date.now() }, html };
  }
  async function blob(sha, token) {
    const hit = await cacheGet(sha);
    if (hit != null) return hit;
    const raw = await call(`${API}/repos/${REPO.owner}/${REPO.name}/git/blobs/${sha}`, token, { Accept: 'application/vnd.github.raw+json' });
    const text = await raw.text();
    await cachePut(sha, text);
    return text;
  }

  async function start() {
    registerSW();
    const token = getToken();
    if (!token) { setup(); return; }
    const meta = getMeta();
    const cached = meta && meta.files ? await cacheGet(meta.files['index.html']) : null;
    if (cached) { mount(cached, meta); return; }
    loading('santei-atlas から読み込んでいます…');
    try {
      const { meta: m, html } = await latest(token);
      setMeta(m);
      mount(html, m);
    } catch (e) {
      if (e.code === 'auth') { setToken(''); setup(e.message); } else failed(e);
    }
  }

  function headTags() {
    return [
      '<meta charset="utf-8">',
      '<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">',
      '<link rel="manifest" href="manifest.webmanifest">',
      '<link rel="icon" href="icon.svg" type="image/svg+xml">',
      '<link rel="apple-touch-icon" href="icon-180.png">',
      '<meta name="apple-mobile-web-app-capable" content="yes">',
      '<meta name="mobile-web-app-capable" content="yes">',
      '<meta name="apple-mobile-web-app-status-bar-style" content="default">',
      `<meta name="apple-mobile-web-app-title" content="${NAME}">`,
      '<meta name="theme-color" content="#ffffff" media="(prefers-color-scheme: light)">',
      '<meta name="theme-color" content="#111a15" media="(prefers-color-scheme: dark)">',
      '<style>body{margin:0}</style>',
    ].join('\n');
  }

  function mount(html, meta) {
    cachePrune(new Set(Object.values(meta.files)));
    const cfg = {
      api: API, owner: REPO.owner, repo: REPO.name, site: REPO.site,
      tokenKey: TOKEN_KEY, metaKey: META_KEY, cache: DATA_CACHE, cachePrefix: CACHE_PREFIX, meta,
    };
    const json = JSON.stringify(cfg).replace(/</g, '\\u003c');
    const mermaid = `<script type="module">
const pres = [...document.querySelectorAll('pre.mermaid')];
if (pres.length && !document.documentElement.dataset.lazyMermaid) { // 新しい版のページは、ひらいたページの図だけを自分で描く
  try {
    const { default: mermaid } = await import(${JSON.stringify(MERMAID)});
    mermaid.initialize({ startOnLoad: false, securityLevel: 'strict', theme: matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'neutral' });
    await mermaid.run({ nodes: pres, suppressErrors: true });
  } catch (e) { /* 図が描けなくても本文は読める（通信がないときなど） */ }
}
</script>`;
    const out = '<!doctype html>\n<html lang="ja">\n<head>\n' + headTags() +
      `\n<script>(${bridge.toString()})(${json});</script>\n</head>\n<body>\n` + html + '\n' + mermaid + '\n</body>\n</html>';
    document.open();
    document.write(out);
    document.close();
  }

  /* 書き出した画面の中で動く口。ここから外の変数は見えないので、必要なものは cfg で渡す */
  function bridge(cfg) {
    const tok = () => { try { return localStorage.getItem(cfg.tokenKey) || ''; } catch (e) { return ''; } };
    const H = extra => Object.assign({ Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', Authorization: 'Bearer ' + tok() }, extra || {});
    const base = `${cfg.api}/repos/${cfg.owner}/${cfg.repo}`;
    async function cached(sha) {
      try { const c = await caches.open(cfg.cache); const r = await c.match(cfg.cachePrefix + sha); return r ? await r.text() : null; } catch (e) { return null; }
    }
    async function put(sha, text) {
      try { const c = await caches.open(cfg.cache); await c.put(cfg.cachePrefix + sha, new Response(text, { headers: { 'Content-Type': 'text/plain; charset=utf-8' } })); } catch (e) { /* 次も取りにいくだけ */ }
    }
    async function blob(sha) {
      const hit = await cached(sha);
      if (hit != null) return hit;
      let res;
      try { res = await fetch(`${base}/git/blobs/${sha}`, { headers: H({ Accept: 'application/vnd.github.raw+json' }), cache: 'no-store' }); }
      catch (e) { throw new Error('通信できませんでした。電波のあるところでもう一度ひらいてください'); }
      if (res.status === 401) throw new Error('トークンが無効になっています。上の「トークンを貼り直す」から貼り直してください');
      if (!res.ok) throw new Error(`読み込めませんでした（${res.status}）`);
      const text = await res.text();
      put(sha, text);
      return text;
    }
    /* PDF など文字でないファイル：Blob のまま取り、中身の sha ごとにとっておく */
    async function blobFile(sha, type) {
      try { const c = await caches.open(cfg.cache); const r = await c.match(cfg.cachePrefix + sha); if (r) return await r.blob(); } catch (e) { /* 取りにいく */ }
      let res;
      try { res = await fetch(`${base}/git/blobs/${sha}`, { headers: H({ Accept: 'application/vnd.github.raw+json' }), cache: 'no-store' }); }
      catch (e) { throw new Error('通信できませんでした。電波のあるところでもう一度押してください'); }
      if (res.status === 401) throw new Error('トークンが無効になっています。「トークンを貼り直す」から貼り直してください');
      if (!res.ok) throw new Error(`読み込めませんでした（${res.status}）`);
      const raw = await res.blob();
      const b = new Blob([raw], { type: type || raw.type || 'application/octet-stream' });
      try { const c = await caches.open(cfg.cache); await c.put(cfg.cachePrefix + sha, new Response(b, { headers: { 'Content-Type': b.type } })); } catch (e) { /* 次も取りにいくだけ */ }
      return b;
    }
    let bar = null;
    function say(text, action) {
      if (!bar) {
        bar = document.createElement('div');
        bar.setAttribute('role', 'status');
        const low = matchMedia('(min-width: 1024px)').matches ? '16px' : 'calc(env(safe-area-inset-bottom, 0px) + 76px)';
        bar.style.cssText = 'position:fixed;left:12px;right:12px;margin:0 auto;width:fit-content;max-width:560px;bottom:' + low + ';z-index:50;display:flex;gap:12px;align-items:center;padding:10px 14px;background:var(--ink);color:var(--sheet);border:2px solid var(--ink);font-size:14px;font-weight:700';
        document.body.append(bar);
      }
      bar.replaceChildren(document.createTextNode(text));
      if (action) {
        const b = document.createElement('button');
        b.type = 'button'; b.textContent = action.label; b.onclick = action.run;
        b.style.cssText = 'border:0;padding:6px 12px;background:var(--mark);color:var(--mark-ink);font:inherit;font-weight:700;cursor:pointer;white-space:nowrap';
        bar.append(b);
      }
      bar.hidden = false;
      clearTimeout(say.t);
      if (!action) say.t = setTimeout(() => { bar.hidden = true; }, 3500);
    }
    async function check(manual) {
      if (manual) say('新しい版を確かめています…');
      try {
        const res = await fetch(`${base}/git/trees/${cfg.site}?recursive=1`, { headers: H(), cache: 'no-store' });
        if (!res.ok) { if (manual) say(res.status === 401 ? 'トークンが無効になっています' : `確かめられませんでした（${res.status}）`); return; }
        const j = await res.json();
        if (j.sha === cfg.meta.tree) { if (manual) say('いまの版が最新です'); return; }
        const files = {};
        for (const t of j.tree || []) if (t.type === 'blob') files[t.path] = t.sha;
        if (!files['index.html']) return;
        await blob(files['index.html']);
        let generated = '';
        if (files['version.json']) { try { generated = JSON.parse(await blob(files['version.json'])).generated || ''; } catch (e) { /* なくてよい */ } }
        try { localStorage.setItem(cfg.metaKey, JSON.stringify({ tree: j.sha, files, generated, at: Date.now() })); } catch (e) { /* 次にひらいたとき取り直す */ }
        say(`新しい版があります${generated ? '（' + generated + ' 生成）' : ''}`, { label: 'ひらき直す', run: () => location.reload() });
      } catch (e) {
        if (manual) say('確かめられませんでした（通信）');
      }
    }
    window.SANTEI_APP = {
      data: name => {
        const sha = cfg.meta.files['data/' + name];
        if (!sha) return Promise.reject(new Error(`${name} が site ブランチにありません`));
        return blob(sha).then(JSON.parse);
      },
      file: name => {
        const sha = cfg.meta.files['data/' + name];
        if (!sha) return Promise.reject(new Error(`${name} がまだありません（新しい版が出たら「ひらき直す」）`));
        return blobFile(sha, /\.pdf$/i.test(name) ? 'application/pdf' : '');
      },
      info: () => ({ generated: cfg.meta.generated }),
      check,
      resetToken: () => { try { localStorage.removeItem(cfg.tokenKey); localStorage.removeItem(cfg.metaKey); } catch (e) { /* なにもしない */ } location.reload(); },
    };
    setTimeout(() => check(false), 2500); // 書き出した画面では load が来ないことがあるので、時間で確かめる
  }

  function registerSW() {
    if (!('serviceWorker' in navigator) || registerSW.done) return;
    registerSW.done = true;
    navigator.serviceWorker.register('sw.js').catch(() => { /* なくても動く */ });
  }

  start();
})();

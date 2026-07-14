#!/usr/bin/env node
/**
 * LoL ビルドコンパニオン用サーバー。
 * - 静的ファイル配信 (index.html, css/, js/)
 * - Riot API への中継 (/api/{host}/{path})
 *
 * Riot API はブラウザからの直接アクセスを許可していない(CORS制限)ため、
 * このサーバーが APIキーを付与して中継する。依存パッケージなし (Node 18+)。
 *
 * 起動:  node server.js
 * APIキーは環境変数 RIOT_API_KEY か、画面から入力されたもの
 * (X-Riot-Token ヘッダー) を使用する。環境変数が優先される。
 */
const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = Number(process.env.PORT) || 8000;
const ROOT = __dirname;
const ENV_API_KEY = process.env.RIOT_API_KEY || '';
// テスト時に Riot API の向き先を差し替えるためのフック (通常は未設定)
const RIOT_API_BASE = process.env.RIOT_API_BASE || '';

// 中継を許可する Riot API ホスト (プラットフォーム + リージョナル)
const HOSTS = new Set([
  'jp1', 'kr', 'na1', 'euw1', 'eun1', 'br1', 'la1', 'la2', 'oc1', 'tr1', 'ru',
  'ph2', 'sg2', 'th2', 'tw2', 'vn2',
  'asia', 'americas', 'europe', 'sea',
]);

// 中継を許可する API パス (オープンプロキシ化を防ぐホワイトリスト)
const ALLOWED_PATHS = [
  '/riot/account/v1/accounts/by-riot-id/',
  '/lol/summoner/v4/summoners/by-puuid/',
  '/lol/league/v4/entries/',
  '/lol/match/v5/matches/',
];

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

// ---- 簡易キャッシュ (レート制限対策) ----
const cache = new Map(); // url -> { expires, status, body }
const CACHE_MAX = 600;

function cacheGet(key) {
  const hit = cache.get(key);
  if (!hit) return null;
  if (Date.now() > hit.expires) { cache.delete(key); return null; }
  return hit;
}

function cacheSet(key, status, body, ttlMs) {
  if (cache.size >= CACHE_MAX) {
    // 一番古いエントリから削除
    cache.delete(cache.keys().next().value);
  }
  cache.set(key, { expires: Date.now() + ttlMs, status, body });
}

// ---- Riot API 中継 ----
async function handleApi(req, res, urlPath) {
  const send = (status, obj) => {
    res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' });
    res.end(typeof obj === 'string' ? obj : JSON.stringify(obj));
  };

  if (urlPath === '/api/ping') {
    return send(200, { ok: true, hasEnvKey: Boolean(ENV_API_KEY) });
  }

  const m = urlPath.match(/^\/api\/([a-z0-9]+)(\/.*)$/);
  if (!m) return send(404, { error: 'unknown api path' });
  const [, host, apiPath] = m;

  if (!HOSTS.has(host)) return send(400, { error: `invalid host: ${host}` });
  if (!ALLOWED_PATHS.some((p) => apiPath.startsWith(p))) {
    return send(403, { error: 'path not allowed' });
  }
  if (req.method !== 'GET') return send(405, { error: 'GET only' });

  const apiKey = ENV_API_KEY || req.headers['x-riot-token'] || '';
  if (!apiKey) {
    return send(401, { error: 'APIキーが設定されていません。画面で入力するか、環境変数 RIOT_API_KEY を設定してください。' });
  }

  const query = req.url.includes('?') ? req.url.slice(req.url.indexOf('?')) : '';
  const target = RIOT_API_BASE
    ? `${RIOT_API_BASE}/${host}${apiPath}${query}`
    : `https://${host}.api.riotgames.com${apiPath}${query}`;

  const cached = cacheGet(target);
  if (cached) return send(cached.status, cached.body);

  try {
    const upstream = await fetch(target, { headers: { 'X-Riot-Token': apiKey } });
    const body = await upstream.text();
    // マッチ詳細・タイムラインは不変データなので長期キャッシュ、その他は短期
    const isMatchDetail = /\/lol\/match\/v5\/matches\/[^/]+(\/timeline)?$/.test(apiPath);
    if (upstream.ok) {
      cacheSet(target, upstream.status, body, isMatchDetail ? 24 * 3600 * 1000 : 60 * 1000);
    }
    const headers = { 'content-type': 'application/json; charset=utf-8' };
    if (upstream.headers.get('retry-after')) {
      headers['retry-after'] = upstream.headers.get('retry-after');
    }
    res.writeHead(upstream.status, headers);
    res.end(body);
  } catch (e) {
    send(502, { error: `Riot API への接続に失敗しました: ${e.message}` });
  }
}

// ---- 静的ファイル配信 ----
function handleStatic(req, res, urlPath) {
  const rel = urlPath === '/' ? 'index.html' : urlPath.replace(/^\/+/, '');
  const file = path.normalize(path.join(ROOT, rel));
  if (!file.startsWith(ROOT)) { res.writeHead(403); return res.end('forbidden'); }

  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); return res.end('not found'); }
    res.writeHead(200, { 'content-type': MIME[path.extname(file)] || 'application/octet-stream' });
    res.end(data);
  });
}

http.createServer((req, res) => {
  const urlPath = decodeURIComponent(req.url.split('?')[0]);
  if (urlPath.startsWith('/api/')) return handleApi(req, res, urlPath);
  return handleStatic(req, res, urlPath);
}).listen(PORT, () => {
  console.log(`LoL ビルドコンパニオン: http://localhost:${PORT}`);
  console.log(ENV_API_KEY
    ? 'Riot APIキー: 環境変数 RIOT_API_KEY を使用します'
    : 'Riot APIキー: 未設定 (マイデータ画面での入力が必要です)');
});

import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';

const github = await import('../functions/api/github.js');
const middleware = await import('../functions/_middleware.js');

const realFetch = globalThis.fetch;
let calls;
beforeEach(() => {
  calls = [];
  globalThis.fetch = async (url, opts = {}) => {
    calls.push({ url: String(url), opts });
    if (String(url).includes('turnstile')) return new Response(JSON.stringify({ success: true }));
    return new Response('{"ok":true}', { status: 200 });
  };
});
afterEach(() => { globalThis.fetch = realFetch; });

function proxy(body, env = { GH_PAT: 'x' }) {
  return github.onRequestPost({
    env,
    request: new Request('https://dash.lucafchala.com/api/github', { method: 'POST', body: JSON.stringify(body) }),
  });
}

describe('/api/github path validation', () => {
  test('allows the Contents API of ecosystem repos', async () => {
    const res = await proxy({ path: 'lucafchala/lucafchala.com/contents/_redirects' });
    assert.equal(res.status, 200);
    assert.equal(calls[0].url, 'https://api.github.com/repos/lucafchala/lucafchala.com/contents/_redirects');
  });

  test('allows nested paste folders', async () => {
    const res = await proxy({ path: 'lucafchala/paste.lucafchala.com/contents/camera-gear/index.html', method: 'PUT', body: { message: 'm', content: 'eA==' } });
    assert.equal(res.status, 200);
    assert.equal(calls[0].opts.method, 'PUT');
  });

  for (const path of [
    'lucafchala/lucafchala.com/contents/%2e%2e/%2e%2e/%2e%2e/%2e%2e/user',
    'lucafchala/lucafchala.com/contents/%2E%2E/collaborators/bob',
    'lucafchala/lucafchala.com/contents/../../user',
    'lucafchala/lucafchala.com/contents/./x',
    'lucafchala/lucafchala.com/contents/a\\..\\..\\user',
    'lucafchala/lucafchala.com/contents/x?ref=evil',
    'lucafchala/lucafchala.com/contents/',
    'lucafchala/lucafchala.com/collaborators/bob',
    'someone/else/contents/README.md',
    'lucafchala/lucafchala.com/contents//x',
  ]) {
    test(`rejects ${path}`, async () => {
      const res = await proxy({ path });
      assert.equal(res.status, 400);
      assert.equal(calls.length, 0);
    });
  }

  test('rejects methods outside GET/PUT/DELETE', async () => {
    const res = await proxy({ path: 'lucafchala/lucafchala.com/contents/_redirects', method: 'PATCH' });
    assert.equal(res.status, 405);
    assert.equal(calls.length, 0);
  });

  test('501 without GH_PAT', async () => {
    const res = await proxy({ path: 'lucafchala/lucafchala.com/contents/_redirects' }, {});
    assert.equal(res.status, 501);
  });

  test('GH_REPOS overrides the allowlist', async () => {
    const env = { GH_PAT: 'x', GH_REPOS: 'me/other' };
    assert.equal((await proxy({ path: 'me/other/contents/a.txt' }, env)).status, 200);
    assert.equal((await proxy({ path: 'lucafchala/lucafchala.com/contents/a.txt' }, env)).status, 400);
  });
});

function mw(path, { method = 'GET', cookie = '', body, env = { DASH_PASSWORD: 'pw', TURNSTILE_SECRET_KEY: 's' } } = {}) {
  const headers = new Headers();
  if (cookie) headers.set('Cookie', cookie);
  if (body) headers.set('Content-Type', 'application/x-www-form-urlencoded');
  const request = new Request('https://dash.lucafchala.com' + path, { method, headers, body });
  return middleware.onRequest({ request, env, next: async () => new Response('app') });
}

async function login(next, password = 'pw') {
  const body = new URLSearchParams({ password, 'cf-turnstile-response': 't', next }).toString();
  return mw('/login', { method: 'POST', body });
}

describe('middleware', () => {
  test('unauthenticated API calls get 401 JSON, not a redirect', async () => {
    const res = await mw('/api/github');
    assert.equal(res.status, 401);
    assert.match(res.headers.get('Content-Type'), /json/);
  });

  test('unauthenticated pages redirect to /login with next', async () => {
    const res = await mw('/foo?x=1');
    assert.equal(res.status, 302);
    assert.equal(res.headers.get('Location'), '/login?next=%2Ffoo%3Fx%3D1');
  });

  test('public assets and healthz skip auth', async () => {
    for (const p of ['/data.json', '/icon.svg', '/fonts/jetbrains-mono-latin.woff2', '/api/healthz']) {
      assert.equal(await (await mw(p)).text(), 'app', p);
    }
  });

  test('the deleted /favicon.svg is no longer public', async () => {
    assert.equal((await mw('/favicon.svg')).status, 302);
  });

  test('login page carries its own security headers and no inline script', async () => {
    const res = await mw('/login?next=/x');
    assert.equal(res.status, 200);
    assert.match(res.headers.get('Content-Security-Policy'), /frame-ancestors 'none'/);
    assert.equal(res.headers.get('X-Frame-Options'), 'DENY');
    const html = await res.text();
    assert.match(html, /Painel/);
    assert.doesNotMatch(html, /<script(?![^>]*\bsrc=)[^>]*>/);
    assert.doesNotMatch(html, /\son[a-z]+=/);
  });

  test('successful login sets the cookie and honours a same-origin next', async () => {
    const res = await login('/some/page?q=1');
    assert.equal(res.status, 302);
    assert.equal(res.headers.get('Location'), '/some/page?q=1');
    assert.match(res.headers.get('Set-Cookie'), /dash_session=\d+\.[0-9a-f]{64}; Path=\/; HttpOnly; Secure; SameSite=Strict/);
  });

  for (const evil of ['/\\evil.com', '//evil.com', 'https://evil.com/', '/\t/evil.com', 'javascript:alert(1)']) {
    test(`login next=${JSON.stringify(evil)} stays on origin`, async () => {
      const res = await login(evil);
      const loc = res.headers.get('Location');
      assert.ok(loc.startsWith('/') && !loc.startsWith('//') && !loc.startsWith('/\\'), loc);
      assert.equal(new URL(loc, 'https://dash.lucafchala.com').origin, 'https://dash.lucafchala.com');
    });
  }

  test('wrong password is rejected', async () => {
    const res = await login('/', 'nope');
    assert.equal(res.status, 401);
    assert.equal(res.headers.get('Set-Cookie'), null);
  });

  test('a valid session reaches the app; logout clears it', async () => {
    const cookie = (await login('/')).headers.get('Set-Cookie').split(';')[0];
    assert.equal(await (await mw('/', { cookie })).text(), 'app');
    const out = await mw('/logout', { cookie });
    assert.equal(out.status, 302);
    assert.match(out.headers.get('Set-Cookie'), /Max-Age=0/);
  });

  test('missing DASH_PASSWORD fails closed', async () => {
    const res = await mw('/', { cookie: 'dash_session=9999999999.abc', env: {} });
    assert.equal(res.status, 302);
  });
});

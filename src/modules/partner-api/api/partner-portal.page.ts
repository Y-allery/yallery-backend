/**
 * The customer cabinet, as one self-contained page: sign up, sign in, see the balance,
 * mint and revoke keys, read the ledger.
 *
 * Same shape as the playground — no build step, no CDN, no framework — so it deploys with
 * the backend and cannot break separately from it.
 */
export const PARTNER_PORTAL_HTML = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>YEngine — Console</title>
<style>
  :root {
    --bg: #0d0f14; --panel: #151922; --line: #232935; --text: #e8ecf4;
    --muted: #8d97ab; --accent: #7c5cff; --accent-2: #29d3a2; --danger: #ff6b6b;
  }
  * { box-sizing: border-box; }
  body {
    margin: 0; background: var(--bg); color: var(--text);
    font: 15px/1.55 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  }
  header {
    padding: 20px 28px; border-bottom: 1px solid var(--line);
    display: flex; align-items: center; gap: 16px; flex-wrap: wrap;
  }
  header h1 { font-size: 18px; margin: 0; letter-spacing: .2px; }
  header a { color: var(--accent-2); text-decoration: none; font-size: 13px; }
  header .spacer { flex: 1; }
  .wrap { max-width: 980px; margin: 0 auto; padding: 28px 24px 60px; }
  .auth { max-width: 400px; margin: 8vh auto; }
  h2 { font-size: 16px; margin: 30px 0 12px; }
  label { display: block; font-size: 12px; text-transform: uppercase;
          letter-spacing: .8px; color: var(--muted); margin: 14px 0 6px; }
  input, button, select {
    width: 100%; font: inherit; color: var(--text); background: var(--panel);
    border: 1px solid var(--line); border-radius: 9px; padding: 10px 12px;
  }
  input:focus { outline: none; border-color: var(--accent); }
  button { cursor: pointer; }
  button.primary {
    background: var(--accent); border-color: var(--accent); font-weight: 600;
    margin-top: 18px; padding: 12px;
  }
  button.ghost { width: auto; padding: 7px 12px; font-size: 13px; }
  button.link {
    width: auto; background: none; border: none; color: var(--accent-2);
    padding: 0; font-size: 13px; text-decoration: underline;
  }
  .card {
    background: var(--panel); border: 1px solid var(--line);
    border-radius: 12px; padding: 20px 22px; margin-bottom: 18px;
  }
  .balance { font-size: 34px; font-weight: 650; letter-spacing: -.5px; }
  .balance.low { color: var(--danger); }
  .muted { color: var(--muted); font-size: 13px; }
  table { width: 100%; border-collapse: collapse; font-size: 14px; }
  th, td { text-align: left; padding: 9px 10px; border-bottom: 1px solid var(--line); }
  th { color: var(--muted); font-size: 11px; text-transform: uppercase; letter-spacing: .7px; }
  td.num, th.num { text-align: right; font-variant-numeric: tabular-nums; }
  code {
    background: #0a0c11; border: 1px solid var(--line); border-radius: 6px;
    padding: 3px 7px; font-size: 13px; word-break: break-all;
  }
  .revealed {
    background: #0a0c11; border: 1px solid var(--accent-2); border-radius: 9px;
    padding: 14px; margin-top: 14px;
  }
  .err { color: var(--danger); margin-top: 12px; font-size: 14px; }
  .ok { color: var(--accent-2); }
  .row { display: flex; gap: 10px; align-items: flex-end; }
  .row > *:first-child { flex: 1; }
  .pill {
    font-size: 11px; padding: 2px 8px; border-radius: 20px;
    border: 1px solid var(--line); color: var(--muted);
  }
  .pill.on { color: var(--accent-2); border-color: var(--accent-2); }
  .hide { display: none; }
</style>
</head>
<body>

<div id="authView" class="auth">
  <h1 style="font-size:20px;margin:0 0 4px">YEngine Console</h1>
  <div class="muted" id="authBlurb">Sign in to manage your API keys and balance.</div>

  <div class="card" style="margin-top:22px">
    <label for="email">Email</label>
    <input id="email" type="email" autocomplete="username">

    <label for="password">Password</label>
    <input id="password" type="password" autocomplete="current-password">

    <div id="companyWrap" class="hide">
      <label for="company">Company (optional)</label>
      <input id="company" type="text">
    </div>

    <button class="primary" id="authGo">Sign in</button>
    <div class="err hide" id="authErr"></div>
    <div style="margin-top:14px">
      <button class="link" id="authSwitch">Create an account</button>
    </div>
  </div>
</div>

<div id="appView" class="hide">
  <header>
    <h1>YEngine Console</h1>
    <a href="/v1/docs" target="_blank">API reference</a>
    <a href="/v1/playground" target="_blank">Playground</a>
    <span class="spacer"></span>
    <span class="muted" id="who"></span>
    <button class="ghost" id="logout">Sign out</button>
  </header>

  <div class="wrap">
    <div class="card">
      <div class="muted">Balance</div>
      <div class="balance" id="balance">$0.00</div>
      <div class="muted" id="balanceHint"></div>
    </div>

    <h2>API keys</h2>
    <div class="card">
      <div class="row">
        <div>
          <label for="keyName">New key name</label>
          <input id="keyName" placeholder="production">
        </div>
        <button class="ghost" id="createKey" style="margin-bottom:1px">Create key</button>
      </div>
      <div class="revealed hide" id="revealed"></div>
      <table style="margin-top:18px">
        <thead>
          <tr><th>Name</th><th>Key</th><th>Last used</th><th></th></tr>
        </thead>
        <tbody id="keys"></tbody>
      </table>
    </div>

    <h2>Usage, last 30 days</h2>
    <div class="card">
      <table>
        <thead>
          <tr><th>Model</th><th class="num">Calls</th><th class="num">Spent</th><th class="num">Avg time</th></tr>
        </thead>
        <tbody id="usage"></tbody>
      </table>
    </div>

    <h2>Balance history</h2>
    <div class="card">
      <table>
        <thead>
          <tr><th>When</th><th>What</th><th class="num">Amount</th><th class="num">Balance</th></tr>
        </thead>
        <tbody id="ledger"></tbody>
      </table>
    </div>
  </div>
</div>

<script>
(function () {
  var $ = function (id) { return document.getElementById(id); };
  var KEY = 'yengine_portal_token';
  var token = null;
  try { token = sessionStorage.getItem(KEY); } catch (e) { token = null; }
  var mode = 'login';

  function api(path, options) {
    options = options || {};
    var headers = { 'Content-Type': 'application/json' };
    if (token) headers.Authorization = 'Bearer ' + token;
    return fetch('/portal' + path, {
      method: options.method || 'GET',
      headers: headers,
      body: options.body ? JSON.stringify(options.body) : undefined,
    }).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (j) {
        if (!r.ok) {
          var m = (j && j.error && j.error.message) || 'Something went wrong.';
          throw new Error(m);
        }
        return j;
      });
    });
  }

  function money(v) {
    var n = Number(v);
    // Three decimals whenever cents would round away real money — a $4.985 balance shown
    // as $4.99 is a support ticket, and a single image costs less than a cent.
    var decimals = Math.abs(n - Number(n.toFixed(2))) > 1e-9 ? 3 : 2;
    return (n < 0 ? '-$' : '$') + Math.abs(n).toFixed(decimals);
  }
  function when(iso) {
    if (!iso) return '—';
    return new Date(iso).toLocaleString();
  }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function setMode(next) {
    mode = next;
    var signup = mode === 'signup';
    $('companyWrap').className = signup ? '' : 'hide';
    $('authGo').textContent = signup ? 'Create account' : 'Sign in';
    $('authSwitch').textContent = signup ? 'I already have an account' : 'Create an account';
    $('authBlurb').textContent = signup
      ? 'Create an account, then ask us to add credit before your first call.'
      : 'Sign in to manage your API keys and balance.';
    $('authErr').className = 'err hide';
  }

  $('authSwitch').addEventListener('click', function () {
    setMode(mode === 'signup' ? 'login' : 'signup');
  });

  $('authGo').addEventListener('click', function () {
    var body = { email: $('email').value.trim(), password: $('password').value };
    if (mode === 'signup' && $('company').value.trim()) body.company = $('company').value.trim();
    api(mode === 'signup' ? '/auth/signup' : '/auth/login', { method: 'POST', body: body })
      .then(function (j) {
        token = j.token;
        try { sessionStorage.setItem(KEY, token); } catch (e) {}
        show();
      })
      .catch(function (e) {
        $('authErr').textContent = e.message;
        $('authErr').className = 'err';
      });
  });

  ['email', 'password'].forEach(function (id) {
    $(id).addEventListener('keydown', function (e) {
      if (e.key === 'Enter') $('authGo').click();
    });
  });

  $('logout').addEventListener('click', function () {
    token = null;
    try { sessionStorage.removeItem(KEY); } catch (e) {}
    $('appView').className = 'hide';
    $('authView').className = 'auth';
  });

  $('createKey').addEventListener('click', function () {
    api('/keys', { method: 'POST', body: { name: $('keyName').value || 'API key' } })
      .then(function (j) {
        $('keyName').value = '';
        $('revealed').className = 'revealed';
        $('revealed').innerHTML =
          '<div class="ok" style="margin-bottom:8px">Copy it now — it is not shown again.</div>' +
          '<code>' + esc(j.key) + '</code>';
        return load();
      })
      .catch(function (e) { alert(e.message); });
  });

  function revoke(id) {
    if (!confirm('Revoke this key? Anything using it stops working immediately.')) return;
    api('/keys/revoke', { method: 'POST', body: { id: id } })
      .then(load)
      .catch(function (e) { alert(e.message); });
  }

  function load() {
    return Promise.all([api('/account'), api('/usage'), api('/transactions')])
      .then(function (r) {
        var acc = r[0], usage = r[1], ledger = r[2];
        $('who').textContent = acc.email;
        $('balance').textContent = money(acc.balanceUsd);
        $('balance').className = 'balance' + (acc.balanceUsd <= 0 ? ' low' : '');
        $('balanceHint').textContent = acc.balanceUsd <= 0
          ? 'Out of credit — calls are rejected until it is topped up. Message us to add funds.'
          : acc.totals.calls + ' calls so far, ' + money(acc.totals.spentUsd) + ' spent.';

        $('keys').innerHTML = acc.keys.length
          ? acc.keys.map(function (k) {
              return '<tr><td>' + esc(k.name) + '</td>' +
                '<td><code>' + esc(k.keyPrefix) + '…</code> ' +
                '<span class="pill' + (k.isActive ? ' on' : '') + '">' +
                (k.isActive ? 'active' : 'revoked') + '</span></td>' +
                '<td class="muted">' + when(k.lastUsedAt) + '</td>' +
                '<td class="num">' + (k.isActive
                  ? '<button class="ghost" data-revoke="' + k.id + '">Revoke</button>'
                  : '') + '</td></tr>';
            }).join('')
          : '<tr><td colspan="4" class="muted">No keys yet — create one above.</td></tr>';

        [].forEach.call($('keys').querySelectorAll('[data-revoke]'), function (b) {
          b.addEventListener('click', function () { revoke(Number(b.dataset.revoke)); });
        });

        $('usage').innerHTML = usage.rows.length
          ? usage.rows.map(function (u) {
              return '<tr><td>' + esc(u.model) + '</td>' +
                '<td class="num">' + u.calls + '</td>' +
                '<td class="num">' + money(u.spentUsd) + '</td>' +
                '<td class="num">' + (Number(u.avgMs) / 1000).toFixed(1) + 's</td></tr>';
            }).join('')
          : '<tr><td colspan="4" class="muted">Nothing yet.</td></tr>';

        $('ledger').innerHTML = ledger.length
          ? ledger.map(function (t) {
              return '<tr><td class="muted">' + when(t.createdAt) + '</td>' +
                '<td>' + esc(t.note || t.kind) + '</td>' +
                '<td class="num" ' + (t.amountUsd >= 0 ? 'style="color:var(--accent-2)"' : '') + '>' +
                (t.amountUsd >= 0 ? '+' : '') + money(t.amountUsd) + '</td>' +
                '<td class="num">' + money(t.balanceAfterUsd) + '</td></tr>';
            }).join('')
          : '<tr><td colspan="4" class="muted">Nothing yet.</td></tr>';
      });
  }

  function show() {
    $('authView').className = 'auth hide';
    $('appView').className = '';
    load().catch(function () { $('logout').click(); });
  }

  setMode('login');
  if (token) show();
})();
</script>
</body>
</html>`;

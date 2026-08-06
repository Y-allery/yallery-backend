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
    --bg: #0b0d12; --panel: #141821; --panel-2: #10141c; --line: #232935;
    --line-soft: #1b202b; --text: #e9edf5; --muted: #8b95a9; --muted-2: #6b7488;
    --accent: #7c5cff; --accent-soft: #241d47; --accent-2: #29d3a2; --danger: #ff6b6b;
    --radius: 14px;
  }
  * { box-sizing: border-box; }
  html { -webkit-text-size-adjust: 100%; }
  body {
    margin: 0; background: var(--bg); color: var(--text);
    font: 15px/1.55 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    -webkit-font-smoothing: antialiased;
  }

  /* The header sticks: the balance is the number you keep glancing at, and scrolling down
     to a table should not take it off the screen. */
  header {
    position: sticky; top: 0; z-index: 10;
    padding: 0 28px; height: 64px; border-bottom: 1px solid var(--line);
    background: rgba(11, 13, 18, .86); backdrop-filter: blur(12px);
    display: flex; align-items: center; gap: 22px;
  }
  header h1 { font-size: 15px; margin: 0; letter-spacing: -.1px; font-weight: 650; }
  header nav { display: flex; gap: 18px; }
  header a { color: var(--muted); text-decoration: none; font-size: 13.5px; transition: color .15s; }
  header a:hover { color: var(--text); }
  header .spacer { flex: 1; }

  .wallet {
    display: flex; align-items: center; gap: 10px;
    background: var(--panel); border: 1px solid var(--line);
    border-radius: 999px; padding: 5px 6px 5px 14px;
  }
  .wallet .cap { font-size: 11px; text-transform: uppercase; letter-spacing: .8px; color: var(--muted-2); }
  .wallet b { font-size: 15px; font-variant-numeric: tabular-nums; letter-spacing: -.2px; }
  .wallet b.low { color: var(--danger); }
  button.plus {
    width: 26px; height: 26px; padding: 0; border-radius: 999px; flex: 0 0 auto;
    background: var(--accent); border: 0; color: #fff; font-size: 17px; line-height: 1;
    display: grid; place-items: center; transition: transform .12s, filter .15s;
  }
  button.plus:hover { filter: brightness(1.12); transform: scale(1.06); }

  .avatar {
    width: 28px; height: 28px; border-radius: 999px; flex: 0 0 auto;
    background: var(--accent-soft); border: 1px solid var(--line);
    display: grid; place-items: center; font-size: 12px; font-weight: 650;
    color: #cdbcff; text-transform: uppercase;
  }

  .wrap { max-width: 1020px; margin: 0 auto; padding: 32px 24px 80px; }
  .auth { max-width: 380px; margin: 12vh auto; padding: 0 20px; }

  /* A section is a labelled band, not a floating heading — and its subtitle is where the
     sentence that used to hang loose above the page now lives. */
  .section { margin-top: 38px; }
  .section.first { margin-top: 0; }
  .section > h2 {
    font-size: 13px; margin: 0 0 4px; text-transform: uppercase;
    letter-spacing: 1px; color: var(--muted-2); font-weight: 650;
  }
  .section > .sub { color: var(--muted); font-size: 13.5px; margin-bottom: 14px; }

  label {
    display: block; font-size: 11.5px; text-transform: uppercase;
    letter-spacing: .8px; color: var(--muted-2); margin: 0 0 7px; font-weight: 600;
  }
  /* A label that follows a field starts a new one, so it needs the gap. The first label in
     a card does not, which is why this is a sibling rule and not a blanket top margin. */
  input + label, select + label, textarea + label { margin-top: 20px; }
  #companyWrap { margin-top: 20px; }
  .auth .card button.primary { margin-top: 22px; width: 100%; }
  .auth .card .err + div { margin-top: 14px; }
  input, button, select {
    width: 100%; font: inherit; color: var(--text); background: var(--panel-2);
    border: 1px solid var(--line); border-radius: 10px; padding: 10px 13px;
    transition: border-color .15s, background .15s;
  }
  input::placeholder { color: var(--muted-2); }
  input:focus { outline: none; border-color: var(--accent); background: var(--panel); }
  button { cursor: pointer; }
  button:disabled { opacity: .5; cursor: default; }
  button.primary {
    background: var(--accent); border-color: var(--accent); font-weight: 650;
    padding: 11px 16px; color: #fff;
  }
  button.primary:hover:not(:disabled) { filter: brightness(1.1); }
  button.ghost { width: auto; padding: 8px 14px; font-size: 13.5px; background: transparent; }
  button.ghost:hover { background: rgba(255,255,255,.05); border-color: #2e3646; }
  button.danger:hover { border-color: var(--danger); color: var(--danger); }
  button.link {
    width: auto; background: none; border: none; color: var(--accent-2);
    padding: 0; font-size: 13.5px;
  }
  button.link:hover { text-decoration: underline; }

  .card {
    background: var(--panel); border: 1px solid var(--line);
    border-radius: var(--radius); padding: 20px 22px;
  }

  /* Three tiles: what the account is doing, at a glance, before any table. */
  .tiles { display: grid; grid-template-columns: repeat(3, 1fr); gap: 14px; }
  @media (max-width: 760px) { .tiles { grid-template-columns: 1fr; } }
  .tile {
    background: var(--panel); border: 1px solid var(--line);
    border-radius: var(--radius); padding: 18px 20px;
  }
  .tile .cap {
    font-size: 11px; text-transform: uppercase; letter-spacing: .9px;
    color: var(--muted-2); font-weight: 600;
  }
  .tile .big {
    font-size: 26px; font-weight: 650; letter-spacing: -.6px; margin-top: 8px;
    font-variant-numeric: tabular-nums;
  }
  .tile .note { color: var(--muted); font-size: 13px; margin-top: 6px; }
  .tile .big.ok { color: var(--accent-2); }
  .tile .big.off { color: var(--muted); }

  .banner {
    display: block; border-radius: 11px; padding: 12px 14px;
    font-size: 13.5px; margin-bottom: 14px;
  }
  .banner.bad { background: rgba(255,107,107,.09); border: 1px solid rgba(255,107,107,.3); color: #ffc0c0; }
  .banner.info { background: rgba(124,92,255,.09); border: 1px solid rgba(124,92,255,.3); color: #cdbcff; }

  .muted { color: var(--muted); font-size: 13.5px; }
  .split-line { display: flex; align-items: center; gap: 18px; flex-wrap: wrap; }
  .split-line .grow { flex: 1; min-width: 0; }
  .kv { min-width: 170px; }
  .kv .cap {
    font-size: 11px; text-transform: uppercase; letter-spacing: .9px;
    color: var(--muted-2); font-weight: 600;
  }
  .kv .val { margin-top: 5px; font-size: 14.5px; }

  table { width: 100%; border-collapse: collapse; font-size: 14px; }
  th, td { text-align: left; padding: 11px 12px; }
  thead th {
    color: var(--muted-2); font-size: 10.5px; text-transform: uppercase;
    letter-spacing: .9px; font-weight: 650; border-bottom: 1px solid var(--line);
  }
  tbody tr { border-bottom: 1px solid var(--line-soft); }
  tbody tr:last-child { border-bottom: 0; }
  tbody tr:hover { background: rgba(255,255,255,.022); }
  td.num, th.num { text-align: right; font-variant-numeric: tabular-nums; }
  td.empty { color: var(--muted-2); text-align: center; padding: 26px 12px; }
  .table-wrap { overflow-x: auto; margin: 0 -22px -20px; padding: 0 22px; }
  .table-wrap table { min-width: 460px; }

  code, .mono { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 12.5px; }
  code {
    background: var(--panel-2); border: 1px solid var(--line); border-radius: 7px;
    padding: 3px 8px; word-break: break-all;
  }
  .revealed {
    background: var(--panel-2); border: 1px solid var(--accent-2); border-radius: 11px;
    padding: 15px; margin-top: 14px;
  }
  .err { color: var(--danger); margin-top: 12px; font-size: 13.5px; }
  .ok { color: var(--accent-2); }

  .row { display: flex; gap: 10px; align-items: flex-end; }
  .row > div { flex: 1; min-width: 0; }
  .row button.primary, .row button.ghost { width: auto; }

  .seg {
    display: flex; border: 1px solid var(--line); border-radius: 11px; overflow: hidden;
    background: var(--panel-2);
  }
  .seg button {
    width: auto; flex: 1; border: 0; border-radius: 0; background: transparent;
    padding: 11px 12px; color: var(--muted); white-space: nowrap; font-size: 14px;
    transition: background .15s, color .15s;
  }
  .seg button:hover { background: rgba(255,255,255,.04); color: var(--text); }
  .seg button + button { border-left: 1px solid var(--line); }
  .seg button.on {
    background: var(--accent-soft); color: #fff; font-weight: 600;
    box-shadow: inset 0 0 0 1px var(--accent);
  }
  .seg.small { flex: 0 0 auto; }
  .seg.small button { flex: 0 0 auto; min-width: 66px; }

  .modal-backdrop {
    position: fixed; inset: 0; background: rgba(4, 6, 10, .74);
    display: flex; align-items: center; justify-content: center; padding: 20px; z-index: 30;
    backdrop-filter: blur(3px);
  }
  .modal {
    background: var(--panel); border: 1px solid var(--line); border-radius: 16px;
    width: 100%; max-width: 560px; max-height: 92vh; overflow: auto;
    box-shadow: 0 24px 70px rgba(0,0,0,.55);
  }
  .modal-head, .modal-foot { display: flex; align-items: center; gap: 12px; padding: 18px 22px; }
  .modal-head { border-bottom: 1px solid var(--line); }
  .modal-foot { border-top: 1px solid var(--line); justify-content: flex-end; }
  .modal-head h3 { margin: 0; font-size: 16.5px; flex: 1; font-weight: 650; }
  .modal-body { padding: 20px 22px; }
  .modal button.x {
    width: auto; background: transparent; border: 0; color: var(--muted);
    font-size: 22px; line-height: 1; padding: 2px 6px; border-radius: 8px;
  }
  .modal button.x:hover { color: var(--text); background: rgba(255,255,255,.06); }
  .modal-foot button { width: auto; }
  .split { display: flex; align-items: center; gap: 18px; margin-top: 26px; }
  .split > div:first-child { flex: 1; }
  .split strong { font-size: 14.5px; }
  .inset { background: var(--panel-2); border-radius: 12px; padding: 16px 18px; margin-top: 16px; }
  .field-row { display: flex; align-items: center; gap: 14px; margin-top: 13px; }
  .field-row > span { flex: 1; font-size: 14px; }
  input[type=number] { -moz-appearance: textfield; }
  input[type=number]::-webkit-outer-spin-button,
  input[type=number]::-webkit-inner-spin-button { -webkit-appearance: none; margin: 0; }
  .amt { position: relative; width: 130px; }
  .amt > span { position: absolute; left: 13px; top: 50%; transform: translateY(-50%); color: var(--muted-2); }
  .amt input { padding-left: 26px; text-align: right; font-variant-numeric: tabular-nums; }
  .sentence { margin-top: 16px; line-height: 1.55; }
  .sentence b { color: var(--text); }

  .pill {
    font-size: 10.5px; padding: 3px 9px; border-radius: 999px; font-weight: 600;
    border: 1px solid var(--line); color: var(--muted-2); text-transform: uppercase;
    letter-spacing: .6px; white-space: nowrap;
  }
  .pill.on { color: var(--accent-2); border-color: rgba(41,211,162,.4); background: rgba(41,211,162,.09); }
  .pill.bad { color: var(--danger); border-color: rgba(255,107,107,.4); background: rgba(255,107,107,.09); }
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
    <div style="margin-top:16px">
      <button class="link" id="authSwitch">Create an account</button>
    </div>
  </div>
</div>

<div id="appView" class="hide">
  <header>
    <h1>YEngine</h1>
    <nav>
      <a href="/v1/docs" target="_blank">API reference</a>
      <a href="/v1/playground" target="_blank">Playground</a>
    </nav>
    <span class="spacer"></span>
    <div class="wallet">
      <span class="cap">Balance</span>
      <b id="balance">$0.00</b>
      <button class="plus hide" id="openTopup" title="Add credits">+</button>
    </div>
    <div class="avatar" id="avatar" title=""></div>
    <button class="ghost" id="logout">Sign out</button>
  </header>

  <div class="wrap">
    <div class="banner bad hide" id="lowBanner"></div>

    <div class="section first">
      <div class="tiles">
        <div class="tile">
          <div class="cap">Spent, last 30 days</div>
          <div class="big" id="tileSpent">$0.00</div>
          <div class="note" id="tileSpentNote">No calls yet.</div>
        </div>
        <div class="tile">
          <div class="cap">Calls, all time</div>
          <div class="big" id="tileCalls">0</div>
          <div class="note" id="tileCallsNote">Across every key on this account.</div>
        </div>
        <div class="tile">
          <div class="cap">Automatic top-up</div>
          <div class="big off" id="tileAuto">Off</div>
          <div class="note" id="tileAutoNote">Keeps calls working when the balance runs low.</div>
        </div>
      </div>
    </div>

    <div class="section">
      <h2>Payment</h2>
      <div class="sub" id="paymentSub">How you add credit to this account.</div>
      <div class="card" id="billingCard">
        <div id="billingUnavailable" class="banner info hide">
          Card payment is not switched on yet. Message us and we will credit your balance by hand.
        </div>

        <div id="billingBody" class="hide">
          <div class="banner bad hide" id="autoDisabled"></div>
          <div class="split-line">
            <div class="kv">
              <div class="cap">Card on file</div>
              <div class="val" id="cardSummary">No card saved</div>
            </div>
            <div class="kv">
              <div class="cap">Rule</div>
              <div class="val" id="autoSummary">Off</div>
            </div>
            <div class="grow"></div>
            <button class="ghost" id="cardAdd">Add card</button>
            <button class="ghost danger hide" id="cardRemove">Remove</button>
          </div>

          <div class="table-wrap" style="margin-top:22px">
            <table>
              <thead>
                <tr><th>When</th><th>Type</th><th class="num">Amount</th><th class="num">Status</th></tr>
              </thead>
              <tbody id="payments"></tbody>
            </table>
          </div>
        </div>
      </div>
    </div>

    <div class="section">
      <h2>API keys</h2>
      <div class="sub">Shown once at creation. Only the hash is stored, so a lost key cannot be recovered.</div>
      <div class="card">
        <div class="row">
          <div>
            <label for="keyName">New key name</label>
            <input id="keyName" placeholder="production">
          </div>
          <button class="ghost" id="createKey">Create key</button>
        </div>
        <div class="revealed hide" id="revealed"></div>
        <div class="table-wrap" style="margin-top:20px">
          <table>
            <thead>
              <tr><th>Name</th><th>Key</th><th>Last used</th><th></th></tr>
            </thead>
            <tbody id="keys"></tbody>
          </table>
        </div>
      </div>
    </div>

    <div class="section">
      <h2>Usage</h2>
      <div class="sub">Successful calls over the last 30 days, by model.</div>
      <div class="card">
        <div class="table-wrap">
          <table>
            <thead>
              <tr><th>Model</th><th class="num">Calls</th><th class="num">Spent</th><th class="num">Avg time</th></tr>
            </thead>
            <tbody id="usage"></tbody>
          </table>
        </div>
      </div>
    </div>

    <div class="section">
      <h2>Balance history</h2>
      <div class="sub">Every movement on this account, newest first.</div>
      <div class="card">
        <div class="table-wrap">
          <table>
            <thead>
              <tr><th>When</th><th>What</th><th class="num">Amount</th><th class="num">Balance</th></tr>
            </thead>
            <tbody id="ledger"></tbody>
          </table>
        </div>
      </div>
    </div>
  </div>
</div>

<div class="modal-backdrop hide" id="topupModal">
  <div class="modal">
    <div class="modal-head">
      <h3>Add credits</h3>
      <button class="x" id="topupClose" title="Close">&times;</button>
    </div>

    <div class="modal-body">
      <div class="muted">Choose an amount to add.</div>
      <div class="seg" id="amountSeg" style="margin-top:10px">
        <button data-amount="10">$10</button>
        <button data-amount="25" class="on">$25</button>
        <button data-amount="50">$50</button>
        <button data-amount="100">$100</button>
        <button data-amount="other">Other</button>
      </div>
      <div id="otherWrap" class="hide">
        <label for="topupAmount">Amount, USD</label>
        <input id="topupAmount" type="number" min="10" step="5" value="25">
      </div>
      <div class="muted" id="topupHint" style="margin-top:10px"></div>

      <div class="split">
        <div>
          <strong>Enable automatic top-up?</strong>
          <div class="muted" style="margin-top:4px">
            Adds funds on its own when the balance runs low, so your calls never start
            failing mid-integration.
          </div>
        </div>
        <div class="seg small" id="autoSeg">
          <button data-auto="yes">Yes</button>
          <button data-auto="no" class="on">No</button>
        </div>
      </div>

      <div class="inset hide" id="autoPanel">
        <strong>Set the threshold</strong>
        <div class="field-row">
          <span>When the balance goes below</span>
          <div class="amt"><span>$</span>
            <input id="autoThreshold" type="number" min="0" step="1" value="5">
          </div>
        </div>
        <div class="field-row">
          <span>Automatically add</span>
          <div class="amt"><span>$</span>
            <input id="autoAmount" type="number" min="10" step="5" value="10">
          </div>
        </div>
        <div class="muted sentence" id="autoSentence"></div>
      </div>

      <div class="err hide" id="topupErr" style="margin-top:16px"></div>
    </div>

    <div class="modal-foot">
      <button class="ghost" id="cardOnly">Save a card only</button>
      <button class="primary" id="goCheckout">Go to checkout</button>
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

  // Stripe hands the customer back to /portal?topup=done. The balance is credited by the
  // webhook, not by this redirect, so the page just reloads and shows whatever landed —
  // trusting the query string would let anyone top themselves up with a bookmark.
  function consumeReturn() {
    var q = location.search;
    if (q.indexOf('topup=done') < 0 && q.indexOf('card=saved') < 0) return;
    history.replaceState({}, '', location.pathname);
    return q.indexOf('card=saved') >= 0
      ? 'Card saved.'
      : 'Payment received — the balance updates within a few seconds.';
  }

  var billing = { minimum: 10, amount: 25, auto: false };

  function renderBilling(b) {
    billing.minimum = b.minimumTopUpUsd;
    $('openTopup').className = b.cardPaymentAvailable ? 'plus' : 'plus hide';
    if (!b.cardPaymentAvailable) {
      $('billingUnavailable').className = 'banner info';
      $('billingBody').className = 'hide';
      return;
    }
    $('billingUnavailable').className = 'banner info hide';
    $('billingBody').className = '';

    $('topupAmount').min = b.minimumTopUpUsd;
    $('autoAmount').min = b.minimumTopUpUsd;
    $('topupHint').textContent = 'Minimum ' + money(b.minimumTopUpUsd) +
      '. Charged in USD, receipt emailed by Stripe.';

    var card = b.card;
    $('cardSummary').textContent = card
      ? (card.brand || 'card').toUpperCase() + ' \u2022\u2022\u2022\u2022 ' + card.last4
      : 'No card saved';
    $('cardAdd').textContent = card ? 'Replace card' : 'Add card';
    $('cardRemove').className = card ? 'ghost danger' : 'ghost danger hide';

    var auto = b.autoRecharge;
    if (auto.thresholdUsd != null) $('autoThreshold').value = auto.thresholdUsd;
    if (auto.amountUsd != null) $('autoAmount').value = auto.amountUsd;
    setAuto(auto.enabled);

    var rule = auto.enabled
      ? 'Below ' + money(auto.thresholdUsd) + ' \u2192 add ' + money(auto.amountUsd)
      : 'Off';
    $('autoSummary').textContent =
      rule + (auto.enabled && !card ? ' (waiting for a card)' : '');
    $('tileAuto').textContent = auto.enabled ? 'On' : 'Off';
    $('tileAuto').className = 'big ' + (auto.enabled ? 'ok' : 'off');
    $('tileAutoNote').textContent = auto.enabled
      ? (card
          ? 'Charges ' + card.brand.toUpperCase() + ' \u2022' + card.last4 +
            ' ' + money(auto.amountUsd) + ' when the balance drops below ' +
            money(auto.thresholdUsd) + '.'
          : 'Armed, but there is no card to charge yet.')
      : 'Keeps calls working when the balance runs low.';

    $('autoDisabled').textContent = auto.disabledReason || '';
    $('autoDisabled').className = auto.disabledReason ? 'banner bad' : 'banner bad hide';

    $('payments').innerHTML = b.payments.length
      ? b.payments.map(function (p) {
          var bad = p.status === 'failed';
          return '<tr><td class="muted">' + when(p.createdAt) + '</td>' +
            '<td>' + (p.kind === 'auto' ? 'Automatic' : 'Manual') + '</td>' +
            '<td class="num">' + money(p.amountUsd) + '</td>' +
            '<td class="num"><span class="pill ' + (bad ? 'bad' : 'on') + '">' +
            esc(bad ? (p.failureCode || 'failed') : p.status) + '</span></td></tr>';
        }).join('')
      : '<tr><td colspan="4" class="empty">No card payments yet.</td></tr>';
  }

  function pick(segId, value, attr) {
    [].forEach.call($(segId).children, function (b) {
      b.classList.toggle('on', b.dataset[attr] === value);
    });
  }

  function chosenAmount() {
    return billing.amount === 'other'
      ? Number($('topupAmount').value)
      : Number(billing.amount);
  }

  function setAmount(value) {
    billing.amount = value;
    pick('amountSeg', String(value), 'amount');
    $('otherWrap').className = value === 'other' ? '' : 'hide';
    sentence();
  }

  function setAuto(on) {
    billing.auto = !!on;
    pick('autoSeg', on ? 'yes' : 'no', 'auto');
    $('autoPanel').className = on ? 'inset' : 'inset hide';
    sentence();
  }

  // The rule in one sentence, in the same words the confirmation email would use. Two
  // number boxes are easy to read backwards; a sentence is not.
  function sentence() {
    var threshold = Number($('autoThreshold').value);
    var amount = Number($('autoAmount').value);
    $('autoSentence').innerHTML =
      'When your balance falls below <b>' + money(threshold) +
      '</b> the card you pay with today is charged <b>' + money(amount) + '</b>.';
  }

  function openTopup() {
    $('topupErr').className = 'err hide';
    $('topupModal').className = 'modal-backdrop';
    sentence();
  }
  function closeTopup() { $('topupModal').className = 'modal-backdrop hide'; }

  $('openTopup').addEventListener('click', openTopup);
  $('topupClose').addEventListener('click', closeTopup);
  $('topupModal').addEventListener('click', function (e) {
    if (e.target === this) closeTopup();
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') closeTopup();
  });

  $('amountSeg').addEventListener('click', function (e) {
    if (e.target.tagName === 'BUTTON') setAmount(e.target.dataset.amount);
  });
  $('autoSeg').addEventListener('click', function (e) {
    if (e.target.tagName === 'BUTTON') setAuto(e.target.dataset.auto === 'yes');
  });
  ['autoThreshold', 'autoAmount', 'topupAmount'].forEach(function (id) {
    $(id).addEventListener('input', sentence);
  });

  function fail(message) {
    $('topupErr').textContent = message;
    $('topupErr').className = 'err';
  }

  // The rule is saved before the redirect, not after: the partner is about to leave for
  // Stripe and may never come back to this tab, and the card that payment saves is exactly
  // the one the rule needs.
  $('goCheckout').addEventListener('click', function () {
    var button = this;
    var amount = chosenAmount();
    if (!(amount >= billing.minimum)) {
      return fail('The smallest top-up is ' + money(billing.minimum) + '.');
    }
    button.disabled = true;
    var rule = billing.auto
      ? api('/billing/auto-recharge', {
          method: 'POST',
          body: {
            enabled: true,
            thresholdUsd: Number($('autoThreshold').value),
            amountUsd: Number($('autoAmount').value),
          },
        })
      : Promise.resolve();

    rule
      .then(function () {
        return api('/billing/topup', { method: 'POST', body: { amountUsd: amount } });
      })
      .then(function (j) { location.href = j.url; })
      .catch(function (e) { fail(e.message); button.disabled = false; });
  });

  $('cardOnly').addEventListener('click', function () {
    var button = this;
    button.disabled = true;
    api('/billing/card', { method: 'POST' })
      .then(function (j) { location.href = j.url; })
      .catch(function (e) { fail(e.message); button.disabled = false; });
  });

  $('cardAdd').addEventListener('click', function () {
    api('/billing/card', { method: 'POST' })
      .then(function (j) { location.href = j.url; })
      .catch(function (e) { alert(e.message); });
  });
  $('cardRemove').addEventListener('click', function () {
    if (!confirm('Remove the saved card? Automatic top-up switches off with it.')) return;
    api('/billing/card/remove', { method: 'POST' }).then(load)
      .catch(function (e) { alert(e.message); });
  });

  function load() {
    return Promise.all([
      api('/account'), api('/usage'), api('/transactions'), api('/billing'),
    ])
      .then(function (r) {
        var acc = r[0], usage = r[1], ledger = r[2];
        renderBilling(r[3]);
        $('avatar').textContent = (acc.email || '?').slice(0, 1);
        $('avatar').title = acc.email;
        $('balance').textContent = money(acc.balanceUsd);
        $('balance').className = acc.balanceUsd <= 0 ? 'low' : '';

        // An empty balance is the one thing worth interrupting for: every call is being
        // rejected right now, and nothing else on the page says so.
        var broke = acc.balanceUsd <= 0;
        $('lowBanner').className = broke ? 'banner bad' : 'banner bad hide';
        $('lowBanner').textContent = broke
          ? 'Out of credit — every call is rejected until the balance is topped up.'
          : '';

        var spent30 = usage.rows.reduce(function (sum, u) {
          return sum + Number(u.spentUsd || 0);
        }, 0);
        var calls30 = usage.rows.reduce(function (sum, u) {
          return sum + Number(u.calls || 0);
        }, 0);
        $('tileSpent').textContent = money(spent30);
        $('tileSpentNote').textContent = calls30
          ? calls30 + ' call' + (calls30 === 1 ? '' : 's') + ' in the last 30 days.'
          : 'No calls in the last 30 days.';
        $('tileCalls').textContent = acc.totals.calls;
        $('tileCallsNote').textContent = money(acc.totals.spentUsd) + ' spent all time.';

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
          : '<tr><td colspan="4" class="empty">No keys yet — create one above.</td></tr>';

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
          : '<tr><td colspan="4" class="empty">Nothing yet.</td></tr>';

        $('ledger').innerHTML = ledger.length
          ? ledger.map(function (t) {
              return '<tr><td class="muted">' + when(t.createdAt) + '</td>' +
                '<td>' + esc(t.note || t.kind) + '</td>' +
                '<td class="num" ' + (t.amountUsd >= 0 ? 'style="color:var(--accent-2)"' : '') + '>' +
                (t.amountUsd >= 0 ? '+' : '') + money(t.amountUsd) + '</td>' +
                '<td class="num">' + money(t.balanceAfterUsd) + '</td></tr>';
            }).join('')
          : '<tr><td colspan="4" class="empty">Nothing yet.</td></tr>';
      });
  }

  function show() {
    $('authView').className = 'auth hide';
    $('appView').className = '';
    var returned = consumeReturn();
    load()
      .then(function () { if (returned) $('topupHint').textContent = returned; })
      .catch(function () { $('logout').click(); });
  }

  setMode('login');
  if (token) show();
})();
</script>
</body>
</html>`;

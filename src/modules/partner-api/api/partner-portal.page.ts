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
  /* Every field column shares the width, not just the first: the auto top-up row has two
     of them. min-width:0 because a flex item's floor is its content, and a number input
     with a long label refuses to shrink below it. */
  .row > div { flex: 1; min-width: 0; }
  /* Buttons carry width:100% from the base rule. .ghost already opts out; .primary did
     not, so inside a row it demanded the whole line and squeezed the input next to it
     down to two characters. Only rows are affected — the sign-in button is full width on
     purpose. */
  .row button.primary { width: auto; }
  /* Balance lives in the header next to the button that changes it: the number and the way
     to fix it belong together, and it stays visible while you read the rest of the page. */
  .wallet { display: flex; align-items: center; gap: 8px; }
  .wallet b { font-size: 16px; font-variant-numeric: tabular-nums; }
  .wallet b.low { color: var(--danger); }
  button.plus {
    width: 28px; height: 28px; padding: 0; border-radius: 8px; cursor: pointer;
    background: var(--accent); border-color: var(--accent); color: #fff;
    font-size: 18px; line-height: 1;
  }

  /* Segmented control: one bordered strip, dividers between cells rather than gaps, so it
     reads as a single choice instead of four buttons that happen to sit together. */
  .seg { display: flex; border: 1px solid var(--line); border-radius: 10px; overflow: hidden; }
  .seg button {
    width: auto; flex: 1; border: 0; border-radius: 0; background: transparent;
    padding: 10px 12px; cursor: pointer; color: var(--text); white-space: nowrap;
  }
  .seg button + button { border-left: 1px solid var(--line); }
  .seg button.on { background: #241d47; color: #fff; box-shadow: inset 0 0 0 1px var(--accent); }
  .seg.small { flex: 0 0 auto; }
  .seg.small button { flex: 0 0 auto; min-width: 62px; }

  .modal-backdrop {
    position: fixed; inset: 0; background: rgba(4, 6, 10, .72);
    display: flex; align-items: center; justify-content: center; padding: 20px; z-index: 20;
  }
  .modal {
    background: var(--panel); border: 1px solid var(--line); border-radius: 14px;
    width: 100%; max-width: 560px; max-height: 92vh; overflow: auto;
  }
  .modal-head, .modal-foot {
    display: flex; align-items: center; gap: 12px; padding: 18px 22px;
  }
  .modal-head { border-bottom: 1px solid var(--line); }
  .modal-foot { border-top: 1px solid var(--line); justify-content: flex-end; }
  .modal-head h3 { margin: 0; font-size: 17px; flex: 1; }
  .modal-body { padding: 20px 22px; }
  .modal button.x {
    width: auto; background: transparent; border: 0; color: var(--muted);
    font-size: 20px; line-height: 1; cursor: pointer; padding: 4px 6px;
  }
  .modal-foot button { width: auto; }
  .split { display: flex; align-items: center; gap: 16px; margin-top: 26px; }
  .split > div:first-child { flex: 1; }
  /* The threshold block is inset rather than outlined: it belongs to the Yes above it, and
     a second border would read as a separate section. */
  .inset {
    background: #10141c; border-radius: 11px; padding: 16px 18px; margin-top: 16px;
  }
  .field-row {
    display: flex; align-items: center; gap: 14px; margin-top: 12px;
  }
  .field-row > span { flex: 1; }
  .amt { position: relative; width: 132px; }
  .amt > span { position: absolute; left: 12px; top: 50%; transform: translateY(-50%); color: var(--muted); }
  .amt input { padding-left: 26px; text-align: right; }
  .sentence { margin-top: 16px; line-height: 1.5; }
  .sentence b { color: var(--text); }
  .summary { display: flex; gap: 18px 34px; flex-wrap: wrap; align-items: flex-end; }
  .summary .col { min-width: 160px; }
  .summary .spacer { flex: 1; min-width: 0; }
  .summary .value { font-size: 15px; margin-top: 4px; }
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
    <div class="wallet">
      <span class="muted">Balance</span>
      <b id="balance">$0.00</b>
      <button class="plus hide" id="openTopup" title="Add credits">+</button>
    </div>
    <span class="muted" id="who"></span>
    <button class="ghost" id="logout">Sign out</button>
  </header>

  <div class="wrap">
    <div class="muted" id="balanceHint" style="margin-bottom:22px"></div>

    <h2>Payment</h2>
    <div class="card" id="billingCard">
      <div id="billingUnavailable" class="muted hide">
        Card payment is not switched on yet. Message us and we will credit your balance by hand.
      </div>

      <div id="billingBody" class="hide">
        <div class="err hide" id="autoDisabled" style="margin-bottom:16px"></div>
        <div class="summary">
          <div class="col">
            <div class="muted">Card</div>
            <div class="value" id="cardSummary">No card saved.</div>
          </div>
          <div class="col">
            <div class="muted">Automatic top-up</div>
            <div class="value" id="autoSummary">Off</div>
          </div>
          <div class="spacer"></div>
          <div>
            <button class="ghost" id="cardAdd">Add card</button>
          </div>
          <div>
            <button class="ghost hide" id="cardRemove">Remove card</button>
          </div>
        </div>

        <table style="margin-top:26px" id="paymentsTable">
          <thead>
            <tr><th>When</th><th>Type</th><th class="num">Amount</th><th class="num">Status</th></tr>
          </thead>
          <tbody id="payments"></tbody>
        </table>
      </div>
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
      $('billingUnavailable').className = 'muted';
      $('billingBody').className = 'hide';
      return;
    }
    $('billingUnavailable').className = 'muted hide';
    $('billingBody').className = '';

    $('topupAmount').min = b.minimumTopUpUsd;
    $('autoAmount').min = b.minimumTopUpUsd;
    $('topupHint').textContent = 'Minimum ' + money(b.minimumTopUpUsd) +
      '. Charged in USD, receipt emailed by Stripe.';

    var card = b.card;
    $('cardSummary').textContent = card
      ? (card.brand || 'card').toUpperCase() + ' ending ' + card.last4
      : 'No card saved.';
    $('cardAdd').textContent = card ? 'Replace card' : 'Add card';
    $('cardRemove').className = card ? 'ghost' : 'ghost hide';

    var auto = b.autoRecharge;
    if (auto.thresholdUsd != null) $('autoThreshold').value = auto.thresholdUsd;
    if (auto.amountUsd != null) $('autoAmount').value = auto.amountUsd;
    setAuto(auto.enabled);
    $('autoSummary').textContent = auto.enabled
      ? money(auto.thresholdUsd) + ' \u2192 add ' + money(auto.amountUsd) +
        (card ? '' : ' (starts once a card is saved)')
      : 'Off';
    $('autoDisabled').textContent = auto.disabledReason || '';
    $('autoDisabled').className = auto.disabledReason ? 'err' : 'err hide';

    $('payments').innerHTML = b.payments.length
      ? b.payments.map(function (p) {
          return '<tr><td class="muted">' + when(p.createdAt) + '</td>' +
            '<td>' + (p.kind === 'auto' ? 'Automatic' : 'Manual') + '</td>' +
            '<td class="num">' + money(p.amountUsd) + '</td>' +
            '<td class="num ' + (p.status === 'succeeded' ? '' : 'muted') + '">' +
            esc(p.status === 'failed' ? 'failed: ' + (p.failureCode || '') : p.status) +
            '</td></tr>';
        }).join('')
      : '<tr><td colspan="4" class="muted">No card payments yet.</td></tr>';
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
        $('who').textContent = acc.email;
        $('balance').textContent = money(acc.balanceUsd);
        $('balance').className = acc.balanceUsd <= 0 ? 'low' : '';
        $('balanceHint').textContent = acc.balanceUsd <= 0
          ? 'Out of credit — calls are rejected until it is topped up.'
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

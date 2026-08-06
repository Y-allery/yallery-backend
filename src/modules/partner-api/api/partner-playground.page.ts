/**
 * Single self-contained page: no build step, no CDN, no framework. It is handed to a
 * partner as a URL and must work from a locked-down network on the first click.
 *
 * The catalog is injected at render time rather than fetched: /v1/models needs a key, and
 * an empty model dropdown is otherwise the first thing a partner sees.
 */
export const renderPartnerPlayground = (models: unknown[]): string =>
  `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>YEngine API Playground</title>
<style>
  :root {
    --bg: #0b0d12; --panel: #141821; --panel-2: #10141c; --line: #232935;
    --line-soft: #1b202b; --text: #e9edf5; --muted: #8b95a9; --muted-2: #6b7488;
    --accent: #7c5cff; --accent-soft: #241d47; --accent-2: #29d3a2; --danger: #ff6b6b;
  }
  * { box-sizing: border-box; }
  body {
    margin: 0; background: var(--bg); color: var(--text);
    font: 15px/1.55 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    -webkit-font-smoothing: antialiased;
  }
  header {
    padding: 0 28px; height: 64px; border-bottom: 1px solid var(--line);
    display: flex; align-items: center; gap: 18px; flex-wrap: wrap;
    background: rgba(11,13,18,.86); backdrop-filter: blur(12px);
    position: sticky; top: 0; z-index: 10;
  }
  header h1 { font-size: 15px; margin: 0; font-weight: 650; letter-spacing: -.1px; }
  header .badge {
    font-size: 10.5px; text-transform: uppercase; letter-spacing: .7px; font-weight: 650;
    color: #cdbcff; background: var(--accent-soft); border: 1px solid rgba(124,92,255,.4);
    padding: 3px 9px; border-radius: 999px;
  }
  header .sub { color: var(--muted); font-size: 13px; }
  header .spacer { flex: 1; }
  header a { color: var(--muted); text-decoration: none; font-size: 13.5px; transition: color .15s; }
  header a:hover { color: var(--text); }

  main {
    display: grid; grid-template-columns: 400px minmax(0, 1fr);
    min-height: calc(100vh - 64px);
  }
  @media (max-width: 940px) { main { grid-template-columns: 1fr; } }
  .pane { padding: 24px 26px; }
  .pane.left { border-right: 1px solid var(--line); background: #0d1017; }

  label {
    display: block; font-size: 11.5px; text-transform: uppercase; letter-spacing: .8px;
    color: var(--muted-2); margin: 20px 0 7px; font-weight: 600;
  }
  label:first-of-type { margin-top: 0; }
  input, select, textarea, button {
    width: 100%; font: inherit; color: var(--text); background: var(--panel-2);
    border: 1px solid var(--line); border-radius: 10px; padding: 10px 13px;
    transition: border-color .15s, background .15s;
  }
  input::placeholder, textarea::placeholder { color: var(--muted-2); }
  textarea { min-height: 92px; resize: vertical; line-height: 1.5; }
  input:focus, select:focus, textarea:focus {
    outline: none; border-color: var(--accent); background: var(--panel);
  }
  select { appearance: none; cursor: pointer; }
  input[type=number] { -moz-appearance: textfield; }
  input[type=number]::-webkit-outer-spin-button,
  input[type=number]::-webkit-inner-spin-button { -webkit-appearance: none; margin: 0; }
  .row { display: flex; gap: 10px; }
  .row > div { flex: 1; min-width: 0; }

  button.go {
    margin-top: 22px; background: var(--accent); border-color: var(--accent);
    font-weight: 650; cursor: pointer; padding: 13px; color: #fff;
    transition: filter .15s;
  }
  button.go:hover:not(:disabled) { filter: brightness(1.1); }
  button.go:disabled { opacity: .55; cursor: default; }

  /* Capability picker is one strip, not three buttons — it is a single choice. */
  .tabs {
    display: flex; border: 1px solid var(--line); border-radius: 11px;
    overflow: hidden; background: var(--panel-2);
  }
  .tabs button {
    flex: 1; cursor: pointer; padding: 11px 6px; font-size: 13px; background: transparent;
    border: 0; border-radius: 0; color: var(--muted); transition: background .15s, color .15s;
  }
  .tabs button:hover { background: rgba(255,255,255,.04); color: var(--text); }
  .tabs button + button { border-left: 1px solid var(--line); }
  .tabs button.on {
    background: var(--accent-soft); color: #fff; font-weight: 600;
    box-shadow: inset 0 0 0 1px var(--accent);
  }

  .hint { color: var(--muted); font-size: 12.5px; margin-top: 7px; line-height: 1.5; }
  .hint code {
    background: var(--panel-2); border: 1px solid var(--line); border-radius: 5px;
    padding: 1px 5px; font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    font-size: 11.5px;
  }
  .price { color: var(--accent-2); font-weight: 650; }

  .cap {
    font-size: 11px; text-transform: uppercase; letter-spacing: .9px;
    color: var(--muted-2); font-weight: 600; margin-bottom: 9px;
  }
  /* Wrapped, not scrolled: the JSON body makes this line long enough that the interesting
     end of it would sit off-screen, and the wrap is visual only — it still copies as one
     command. */
  pre {
    background: var(--panel-2); border: 1px solid var(--line); border-radius: 11px;
    padding: 15px; font-size: 12.5px; margin: 0; line-height: 1.6;
    white-space: pre-wrap; word-break: break-word;
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  }
  .out { margin-top: 24px; }
  .out img, .out video {
    max-width: 100%; border-radius: 11px; border: 1px solid var(--line); display: block;
  }
  .stat {
    display: inline-flex; align-items: center; gap: 6px; margin-right: 8px;
    color: var(--muted); font-size: 12.5px; background: var(--panel);
    border: 1px solid var(--line); border-radius: 999px; padding: 5px 12px;
  }
  .stat b { color: var(--text); font-weight: 650; font-variant-numeric: tabular-nums; }
  .err {
    color: #ffc0c0; white-space: pre-wrap; background: rgba(255,107,107,.09);
    border: 1px solid rgba(255,107,107,.3); border-radius: 11px; padding: 14px;
    font-size: 13.5px; font-family: inherit;
  }
  .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); gap: 14px; }
  .spin {
    display: inline-block; width: 13px; height: 13px; border: 2px solid #fff5;
    border-top-color: #fff; border-radius: 50%; animation: r .7s linear infinite;
    vertical-align: -2px; margin-right: 7px;
  }
  @keyframes r { to { transform: rotate(360deg); } }
</style>
</head>
<body>
<header>
  <h1>YEngine Playground</h1>
  <span class="badge">Live</span>
  <span class="sub">Real calls against the production API — every run is billed to your key.</span>
  <span class="spacer"></span>
  <a href="/v1/docs" target="_blank">API reference</a>
  <a href="/portal" target="_blank">Console</a>
</header>

<main>
  <section class="pane left">
    <label for="key">API key</label>
    <input id="key" type="password" placeholder="ya_..." autocomplete="off">
    <div class="hint">Kept in this browser tab only — never stored, never logged.</div>

    <label>Capability</label>
    <div class="tabs" id="tabs">
      <button data-cap="text_to_image" class="on">Text → Photo</button>
      <button data-cap="image_to_image">Photo → Photo</button>
      <button data-cap="image_to_video">Photo → Video</button>
    </div>

    <label for="model">Model</label>
    <select id="model"></select>
    <div class="hint" id="modelHint"></div>

    <label for="prompt">Prompt</label>
    <textarea id="prompt">a red sports car on a coastal road at sunset, golden hour</textarea>

    <div id="imagesWrap" style="display:none">
      <label for="images">Reference image URLs (1-3, comma separated)</label>
      <textarea id="images" style="min-height:60px" placeholder="https://example.com/photo.jpg"></textarea>
    </div>

    <div class="row">
      <div>
        <label for="size">Size</label>
        <select id="size"></select>
      </div>
      <div id="nWrap">
        <label for="n">Count</label>
        <select id="n"><option>1</option><option>2</option><option>3</option><option>4</option></select>
      </div>
      <div>
        <label for="seed">Seed</label>
        <input id="seed" type="number" placeholder="random">
      </div>
    </div>

    <label for="callback">Callback URL <span style="text-transform:none;letter-spacing:0">— optional</span></label>
    <input id="callback" type="url" placeholder="https://webhook.site/your-id" autocomplete="off">
    <div class="hint">
      Fill this in and the call returns a job id immediately; the finished result is POSTed
      here. This page then polls <code>/v1/jobs/{id}</code> so you can watch both sides.
    </div>

    <button class="go" id="go">Generate</button>
    <div class="hint" id="cost"></div>
  </section>

  <section class="pane">
    <div class="cap">Request</div>
    <pre id="curl">Pick a model to see the request.</pre>
    <div class="out" id="out"></div>
  </section>
</main>

<script>
(function () {
  var models = ${JSON.stringify(models)}, cap = 'text_to_image';
  var $ = function (id) { return document.getElementById(id); };

  function activeModel() {
    return models.filter(function (m) { return m.id === $('model').value; })[0];
  }

  function body() {
    var m = activeModel();
    if (!m) return {};
    var b = { model: m.id, prompt: $('prompt').value, size: $('size').value };
    if ($('seed').value !== '') b.seed = Number($('seed').value);
    var urls = $('images').value.split(',').map(function (s) { return s.trim(); })
                 .filter(Boolean);
    if (cap === 'image_to_image') { b.images = urls; b.n = Number($('n').value); }
    else if (cap === 'image_to_video') { b.image = urls[0] || ''; }
    else { b.n = Number($('n').value); }
    if ($('callback').value.trim()) b.callback_url = $('callback').value.trim();
    return b;
  }

  function path() {
    return cap === 'text_to_image' ? '/v1/images/generations'
         : cap === 'image_to_image' ? '/v1/images/edits'
         : '/v1/videos/generations';
  }

  function refresh() {
    var m = activeModel();
    $('modelHint').textContent = m ? m.description : '';
    // Rebuilt only when the model actually changed. Rebuilding on every keystroke threw
    // away whatever size the user had picked and silently reverted it to the default.
    var wanted = m ? m.sizes.join('|') : '';
    if ($('size').dataset.sizes !== wanted) {
      $('size').dataset.sizes = wanted;
      $('size').innerHTML = m ? m.sizes.map(function (s) {
        return '<option>' + s + '</option>';
      }).join('') : '';
    }
    var n = cap === 'image_to_video' ? 1 : Number($('n').value || 1);
    $('nWrap').style.display = cap === 'image_to_video' ? 'none' : '';
    $('cost').innerHTML = m
      ? 'This run costs <span class="price">$' + (m.price_usd * n).toFixed(3) + '</span>'
      : '';
    $('curl').textContent =
      "curl -X POST " + location.origin + path() + " \\\\\\n" +
      "  -H 'Authorization: Bearer YOUR_KEY' \\\\\\n" +
      "  -H 'Content-Type: application/json' \\\\\\n" +
      "  -d '" + JSON.stringify(body()) + "'";
  }

  function loadModels() {
    var mine = models.filter(function (m) { return m.capability === cap; });
    $('model').innerHTML = mine.map(function (m) {
      return '<option value="' + m.id + '">' + m.id + ' — $' + m.price_usd + '</option>';
    }).join('');
    refresh();
  }

  $('tabs').addEventListener('click', function (e) {
    if (e.target.tagName !== 'BUTTON') return;
    cap = e.target.dataset.cap;
    [].forEach.call(this.children, function (b) { b.classList.toggle('on', b === e.target); });
    $('imagesWrap').style.display = cap === 'text_to_image' ? 'none' : '';
    loadModels();
  });
  ['model', 'size', 'n', 'seed', 'prompt', 'images', 'callback'].forEach(function (id) {
    $(id).addEventListener('input', refresh);
    $(id).addEventListener('change', refresh);
  });

  function fail(message) {
    $('out').innerHTML = '<pre class="err">' + message + '</pre>';
  }

  function render(job, started) {
    var isVideo = cap === 'image_to_video';
    $('out').innerHTML =
      '<div><span class="stat">round trip <b>' +
        ((Date.now() - started) / 1000).toFixed(1) + 's</b></span>' +
      '<span class="stat">server <b>' +
        (job.usage.generation_time_ms / 1000).toFixed(1) + 's</b></span>' +
      '<span class="stat">billed <b>$' +
        job.usage.price_usd.toFixed(3) + '</b></span>' +
      '<span class="stat">job <b>' + job.id + '</b></span></div>' +
      '<div class="grid" style="margin-top:14px">' +
      job.data.map(function (d) {
        return isVideo
          ? '<video src="' + d.url + '" controls autoplay loop muted></video>'
          : '<a href="' + d.url + '" target="_blank"><img src="' + d.url + '"></a>';
      }).join('') + '</div>';
  }

  // The callback lands on the partner's own endpoint, which a browser tab cannot read, so
  // the page follows the same job through GET /v1/jobs/{id} — both halves of the async
  // contract are visible at once.
  function poll(id, started, done) {
    $('out').innerHTML = '<div><span class="stat">job <b>' + id +
      '</b></span><span class="stat" id="jobState"><span class="spin"></span>queued — ' +
      'the result is also being POSTed to your callback URL</span></div>';

    var tick = function () {
      fetch('/v1/jobs/' + id, {
        headers: { Authorization: 'Bearer ' + $('key').value },
      })
        .then(function (r) { return r.json(); })
        .then(function (job) {
          if (job.status === 'succeeded') { render(job, started); return done(); }
          if (job.status === 'failed') {
            fail((job.error && job.error.message) || 'Generation failed.');
            return done();
          }
          if ($('jobState')) {
            $('jobState').innerHTML = '<span class="spin"></span>' + job.status +
              ' — ' + ((Date.now() - started) / 1000).toFixed(0) + 's';
          }
          // 3s, not 1s: polling shares the key's 60/min budget with real generations.
          setTimeout(tick, 3000);
        })
        .catch(function (err) { fail(err.message); done(); });
    };
    setTimeout(tick, 2000);
  }

  $('go').addEventListener('click', function () {
    var btn = this, started = Date.now();
    var release = function () {
      btn.disabled = false;
      btn.textContent = 'Generate';
    };
    btn.disabled = true;
    btn.innerHTML = '<span class="spin"></span>Generating…';
    $('out').innerHTML = '';
    fetch(path(), {
      method: 'POST',
      headers: {
        Authorization: 'Bearer ' + $('key').value,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body()),
    })
      .then(function (r) {
        return r.json().then(function (j) {
          return { ok: r.ok, accepted: r.status === 202, j: j };
        });
      })
      .then(function (res) {
        if (!res.ok) {
          var e = (res.j && res.j.error) || {};
          fail(e.message || JSON.stringify(res.j));
          return release();
        }
        if (res.accepted) return poll(res.j.id, started, release);
        render(res.j, started);
        release();
      })
      .catch(function (err) {
        fail(err.message);
        release();
      });
  });

  loadModels();
})();
</script>
</body>
</html>`;

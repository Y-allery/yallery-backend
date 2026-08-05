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
    --bg: #0d0f14; --panel: #151922; --line: #232935; --text: #e8ecf4;
    --muted: #8d97ab; --accent: #7c5cff; --accent-2: #29d3a2; --danger: #ff6b6b;
  }
  * { box-sizing: border-box; }
  body {
    margin: 0; background: var(--bg); color: var(--text);
    font: 15px/1.55 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  }
  header {
    padding: 22px 28px; border-bottom: 1px solid var(--line);
    display: flex; align-items: baseline; gap: 14px; flex-wrap: wrap;
  }
  header h1 { font-size: 19px; margin: 0; letter-spacing: .2px; }
  header .sub { color: var(--muted); font-size: 13px; }
  header a { color: var(--accent-2); text-decoration: none; }
  /* minmax(0, 1fr), not 1fr: a grid track's default min-width is its content's, so the
     long unbreakable curl line in the <pre> widened the whole column as you typed — and
     the result image, being max-width:100%, grew and shrank with it. */
  main { display: grid; grid-template-columns: 420px minmax(0, 1fr); gap: 0;
         min-height: calc(100vh - 66px); }
  @media (max-width: 900px) { main { grid-template-columns: 1fr; } }
  .pane { padding: 22px 24px; }
  .pane.left { border-right: 1px solid var(--line); }
  label { display: block; font-size: 12px; text-transform: uppercase; letter-spacing: .8px;
          color: var(--muted); margin: 16px 0 6px; }
  input, select, textarea, button {
    width: 100%; font: inherit; color: var(--text); background: var(--panel);
    border: 1px solid var(--line); border-radius: 9px; padding: 10px 12px;
  }
  textarea { min-height: 92px; resize: vertical; }
  input:focus, select:focus, textarea:focus { outline: none; border-color: var(--accent); }
  .row { display: flex; gap: 10px; }
  .row > div { flex: 1; }
  button.go {
    margin-top: 20px; background: var(--accent); border-color: var(--accent);
    font-weight: 600; cursor: pointer; padding: 12px;
  }
  button.go:disabled { opacity: .55; cursor: default; }
  .tabs { display: flex; gap: 8px; margin-top: 4px; }
  .tabs button {
    flex: 1; cursor: pointer; padding: 9px 6px; font-size: 13px; background: var(--panel);
  }
  .tabs button.on { border-color: var(--accent); color: #fff; background: #241d47; }
  .hint { color: var(--muted); font-size: 12px; margin-top: 6px; }
  .price { color: var(--accent-2); font-weight: 600; }
  pre {
    background: #0a0c11; border: 1px solid var(--line); border-radius: 9px;
    padding: 14px; overflow: auto; font-size: 12.5px; margin: 0;
  }
  .out { margin-top: 18px; }
  .out img, .out video { max-width: 100%; border-radius: 10px; border: 1px solid var(--line); display: block; }
  .stat { display: inline-block; margin-right: 18px; color: var(--muted); font-size: 13px; }
  .stat b { color: var(--text); font-weight: 600; }
  .err { color: var(--danger); white-space: pre-wrap; }
  .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(230px, 1fr)); gap: 12px; }
  .spin { display: inline-block; width: 13px; height: 13px; border: 2px solid #fff5;
          border-top-color: #fff; border-radius: 50%; animation: r .7s linear infinite;
          vertical-align: -2px; margin-right: 7px; }
  @keyframes r { to { transform: rotate(360deg); } }
</style>
</head>
<body>
<header>
  <h1>YEngine API — Playground</h1>
  <span class="sub">Live calls against the production API. Every run is billed to your key.</span>
  <span class="sub">·&nbsp;<a href="/v1/docs" target="_blank">API reference</a></span>
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

    <button class="go" id="go">Generate</button>
    <div class="hint" id="cost"></div>
  </section>

  <section class="pane">
    <label>Request</label>
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
  ['model', 'size', 'n', 'seed', 'prompt', 'images'].forEach(function (id) {
    $(id).addEventListener('input', refresh);
    $(id).addEventListener('change', refresh);
  });

  $('go').addEventListener('click', function () {
    var btn = this, started = Date.now();
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
      .then(function (r) { return r.json().then(function (j) { return { ok: r.ok, j: j }; }); })
      .then(function (res) {
        if (!res.ok) {
          var e = (res.j && res.j.error) || {};
          $('out').innerHTML = '<pre class="err">' +
            (e.message || JSON.stringify(res.j)) + '</pre>';
          return;
        }
        var isVideo = cap === 'image_to_video';
        $('out').innerHTML =
          '<div><span class="stat">round trip <b>' +
            ((Date.now() - started) / 1000).toFixed(1) + 's</b></span>' +
          '<span class="stat">server <b>' +
            (res.j.usage.generation_time_ms / 1000).toFixed(1) + 's</b></span>' +
          '<span class="stat">billed <b>$' +
            res.j.usage.price_usd.toFixed(3) + '</b></span></div>' +
          '<div class="grid" style="margin-top:14px">' +
          res.j.data.map(function (d) {
            return isVideo
              ? '<video src="' + d.url + '" controls autoplay loop muted></video>'
              : '<a href="' + d.url + '" target="_blank"><img src="' + d.url + '"></a>';
          }).join('') + '</div>';
      })
      .catch(function (err) {
        $('out').innerHTML = '<pre class="err">' + err.message + '</pre>';
      })
      .then(function () {
        btn.disabled = false;
        btn.textContent = 'Generate';
      });
  });

  loadModels();
})();
</script>
</body>
</html>`;

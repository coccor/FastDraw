// The preview page: draws the SVG the extension sends, zooms and fits it, and turns a click into the line of
// the element under the pointer. It never parses the diagram itself.
(function () {
  const vscode = acquireVsCodeApi();
  const stage = document.getElementById('stage');
  const canvas = document.getElementById('canvas');
  const faces = document.getElementById('faces');
  const zoomLabel = document.getElementById('zoom');
  const problemsBtn = document.getElementById('problems');
  const noteEl = document.getElementById('note');
  const fitBtn = document.getElementById('fit');

  // fit: the whole diagram in view, redone when the view or the diagram changes; otherwise a fixed scale
  const saved = vscode.getState() || {};
  // k is CSS pixels per diagram unit; a unit is a point (4/3 px, as PT in src/render.ts), so 100% is k = PT
  const PT = 4 / 3;
  let fit = saved.fit !== false, k = saved.k || PT, size = { w: 1, h: 1 }, hits = [], cursorLine = 0, facesCss = '';

  const keep = () => vscode.setState({ ...(vscode.getState() || {}), fit, k });
  const svg = () => canvas.querySelector('svg');

  function size0() {
    const s = svg();
    if (!s) return;
    const vb = s.viewBox && s.viewBox.baseVal;
    size = vb && vb.width ? { w: vb.width, h: vb.height } : { w: +s.getAttribute('width') || 1, h: +s.getAttribute('height') || 1 };
  }

  function layout() {
    const s = svg();
    if (!s) return;
    if (fit) {
      const pad = 32, aw = stage.clientWidth - pad, ah = stage.clientHeight - pad;
      k = Math.max(0.05 * PT, Math.min(aw / size.w, ah / size.h, 2 * PT));
    }
    s.setAttribute('width', String(Math.round(size.w * k)));
    s.setAttribute('height', String(Math.round(size.h * k)));
    zoomLabel.textContent = Math.round(k / PT * 100) + '%';
    fitBtn.classList.toggle('on', fit);
    stage.classList.toggle('fit', fit);
    mark();
  }

  function zoomTo(next, at) {
    const s = svg();
    if (!s) return;
    // keep the point under the pointer (or the middle of the view) still while zooming
    const r = stage.getBoundingClientRect();
    const px = at ? at.x - r.left : stage.clientWidth / 2, py = at ? at.y - r.top : stage.clientHeight / 2;
    const cx = (stage.scrollLeft + px) / k, cy = (stage.scrollTop + py) / k;
    fit = false;
    k = Math.max(0.05 * PT, Math.min(next, 8 * PT));
    layout();
    stage.scrollLeft = cx * k - px;
    stage.scrollTop = cy * k - py;
    keep();
  }

  // the diagram's own units under a point of the page
  function toCanvas(clientX, clientY) {
    const s = svg();
    const m = s && s.getScreenCTM();
    if (!m) return null;
    const p = s.createSVGPoint();
    p.x = clientX; p.y = clientY;
    return p.matrixTransform(m.inverse());
  }

  const nearLine = (pts, x, y, tol) => {
    for (let i = 1; i < pts.length; i++) {
      const [ax, ay] = pts[i - 1], [bx, by] = pts[i];
      const dx = bx - ax, dy = by - ay, len = dx * dx + dy * dy;
      const t = len ? Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / len)) : 0;
      if (Math.hypot(ax + t * dx - x, ay + t * dy - y) <= tol) return true;
    }
    return false;
  };

  // the topmost element under a point: lines and free text are drawn over shapes, and of two shapes the
  // later one is on top
  function hitAt(x, y) {
    const tol = 6 / k;
    for (let i = hits.length - 1; i >= 0; i--) {
      const h = hits[i];
      if (h.pts ? nearLine(h.pts, x, y, tol) : x >= h.x && x <= h.x + h.w && y >= h.y && y <= h.y + h.h) return h;
    }
    return null;
  }

  // outline the elements written on the line the text cursor is on
  function mark() {
    const s = svg();
    if (!s) return;
    s.querySelectorAll('.fd-mark').forEach((n) => n.remove());
    const ns = 'http://www.w3.org/2000/svg';
    for (const h of hits) {
      if (h.line !== cursorLine) continue;
      if (h.pts) {
        const pl = document.createElementNS(ns, 'polyline');
        pl.setAttribute('points', h.pts.map((p) => p.join(',')).join(' '));
        pl.setAttribute('class', 'fd-mark line');
        pl.setAttribute('stroke-width', String(6 / k));
        s.appendChild(pl);
      } else {
        const r = document.createElementNS(ns, 'rect'), m = 3 / k;
        r.setAttribute('x', String(h.x - m)); r.setAttribute('y', String(h.y - m));
        r.setAttribute('width', String(h.w + 2 * m)); r.setAttribute('height', String(h.h + 2 * m));
        r.setAttribute('rx', String(3 / k));
        r.setAttribute('class', 'fd-mark');
        r.setAttribute('stroke-width', String(1.5 / k));
        s.appendChild(r);
      }
    }
  }

  function showProblems({ errors, warns }) {
    problemsBtn.hidden = !(errors + warns);
    problemsBtn.className = errors ? 'err' : 'warn';
    problemsBtn.textContent = [errors && `${errors} error${errors > 1 ? 's' : ''}`, warns && `${warns} warning${warns > 1 ? 's' : ''}`].filter(Boolean).join(', ');
  }

  window.addEventListener('message', (e) => {
    const m = e.data;
    if (m.type === 'draw') {
      if (m.faces !== facesCss) { facesCss = m.faces; faces.textContent = m.faces; }
      const sx = stage.scrollLeft, sy = stage.scrollTop;
      // parsed as SVG, not HTML; the page's policy runs no script but its own either way
      const doc = new DOMParser().parseFromString(m.svg, 'image/svg+xml');
      if (doc.documentElement.nodeName !== 'svg') return;
      canvas.replaceChildren(document.importNode(doc.documentElement, true));
      hits = m.hits;
      size0();
      layout();
      if (!fit) { stage.scrollLeft = sx; stage.scrollTop = sy; }
      showProblems(m.problems);
      // what VS Code needs to put this preview back after a restart
      vscode.setState({ ...(vscode.getState() || {}), uri: m.uri });
      noteEl.hidden = !m.note;
      noteEl.textContent = m.note || '';
      noteEl.title = m.note || '';
      document.body.classList.toggle('dark', !!m.dark);
    } else if (m.type === 'problems') {
      showProblems(m);
    } else if (m.type === 'cursor') {
      cursorLine = m.line;
      mark();
    } else if (m.type === 'failed') {
      noteEl.hidden = false;
      noteEl.textContent = m.message;
      noteEl.title = m.message;
    }
  });

  canvas.addEventListener('click', (e) => {
    const p = toCanvas(e.clientX, e.clientY);
    const h = p && hitAt(p.x, p.y);
    if (h) vscode.postMessage({ type: 'reveal', line: h.line });
  });
  canvas.addEventListener('mousemove', (e) => {
    const p = toCanvas(e.clientX, e.clientY);
    canvas.classList.toggle('over', !!(p && hitAt(p.x, p.y)));
  });

  stage.addEventListener('wheel', (e) => {
    if (!e.ctrlKey && !e.metaKey) return;
    e.preventDefault();
    zoomTo(k * Math.exp(-e.deltaY * 0.002), { x: e.clientX, y: e.clientY });
  }, { passive: false });

  fitBtn.addEventListener('click', () => { fit = true; layout(); keep(); });
  zoomLabel.addEventListener('click', () => zoomTo(PT));
  document.getElementById('in').addEventListener('click', () => zoomTo(k * 1.25));
  document.getElementById('out').addEventListener('click', () => zoomTo(k / 1.25));
  document.getElementById('edit').addEventListener('click', () => vscode.postMessage({ type: 'openEditor' }));
  document.getElementById('source').addEventListener('click', () => vscode.postMessage({ type: 'source' }));
  problemsBtn.addEventListener('click', () => vscode.postMessage({ type: 'problems' }));
  new ResizeObserver(() => { if (fit) layout(); }).observe(stage);

  vscode.postMessage({ type: 'ready' });
})();

/* M.A.R.S. — behaviour. Every link (including the language switch) is a normal page load.
   The page works fully without JavaScript; the globe falls back to a static satellite image. */
(function () {
  var d = document, root = d.documentElement;
  root.classList.remove('no-js'); root.classList.add('js');
  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // header: solid background after scrolling
  var hdr = d.querySelector('.hdr');
  var onScroll = function () { if (hdr) hdr.classList.toggle('solid', window.scrollY > 24); };
  window.addEventListener('scroll', onScroll, { passive: true }); onScroll();

  // header: switch to the menu button when the navigation does not fit (long translations)
  var hin = d.querySelector('.hdr-in');
  var fit = function () {
    if (!hdr || !hin) return;
    hdr.classList.remove('compact');
    if (window.innerWidth > 1100 && hin.scrollWidth > hin.clientWidth + 1) hdr.classList.add('compact');
  };
  fit(); window.addEventListener('resize', fit);
  if (d.fonts && d.fonts.ready) d.fonts.ready.then(fit);

  var burger = d.querySelector('.burger'), drawer = d.getElementById('drawer'), set = function () {};

  // logo: on the page it points to, scroll back to the top instead of reloading
  d.querySelectorAll('a.brand').forEach(function (a) {
    a.addEventListener('click', function (e) {
      var u = new URL(a.href, location.href);
      if (u.pathname.replace(/index\.html$/, '') !== location.pathname.replace(/index\.html$/, '')) return;
      e.preventDefault();
      if (drawer && drawer.classList.contains('open')) set(false);
      window.scrollTo({ top: 0, behavior: reduce ? 'auto' : 'smooth' });
    });
  });

  // drawer
  if (burger && drawer) {
    set = function (open) {
      drawer.classList.toggle('open', open); burger.setAttribute('aria-expanded', open ? 'true' : 'false');
      hdr.classList.toggle('always', open); root.style.overflow = open ? 'hidden' : '';
    };
    burger.addEventListener('click', function () { set(!drawer.classList.contains('open')); });
    d.addEventListener('keydown', function (e) { if (e.key === 'Escape' && drawer.classList.contains('open')) { set(false); burger.focus(); } });
    window.addEventListener('resize', function () { if (getComputedStyle(burger).display === 'none') set(false); });
  }

  // reveal on scroll
  var els = d.querySelectorAll('.rv');
  if ('IntersectionObserver' in window && !reduce) {
    var io = new IntersectionObserver(function (en) { en.forEach(function (x) { if (x.isIntersecting) { x.target.classList.add('in'); io.unobserve(x.target); } }); }, { rootMargin: '0px 0px -8% 0px' });
    els.forEach(function (el) { io.observe(el); });
  } else { els.forEach(function (el) { el.classList.add('in'); }); }

  // ------------------------------------------------------------------ satellite globe (WebGL)
  var box = d.querySelector('.globe');
  if (box) { try { globe(box); } catch (e) { /* static image stays */ } }

  function globe(box) {
    var cv = box.querySelector('canvas'), ov = box.querySelector('canvas.ov');
    cv = box.querySelector('canvas.gl');
    var gl = cv.getContext('webgl', { alpha: true, antialias: true, premultipliedAlpha: true }) || cv.getContext('experimental-webgl');
    if (!gl) return;
    var ctx = ov.getContext('2d');
    var D2R = Math.PI / 180;
    var nodes = JSON.parse(box.getAttribute('data-nodes'));
    var arcs = JSON.parse(box.getAttribute('data-arcs'));
    var view = { lon: +box.getAttribute('data-lon') * D2R, lat: +box.getAttribute('data-lat') * D2R };
    var base = view.lon, t0 = performance.now(), drag = null, visible = false, ready = false, size = 0, dpr = 1;

    var vs = 'attribute vec2 p;varying vec2 v;void main(){v=p;gl_Position=vec4(p,0.,1.);}';
    var fs = 'precision highp float;varying vec2 v;uniform sampler2D t;uniform float lon0,lat0,k;' +
      'void main(){vec2 q=v*k;float r2=dot(q,q);' +
      'if(r2>1.){float r=sqrt(r2);float a=smoothstep(1.13,1.,r)*.55;gl_FragColor=vec4(vec3(.42,.58,1.)*a*a,a*a);return;}' +
      'float z=sqrt(1.-r2);float cl=cos(lat0),sl=sin(lat0);' +
      'vec3 w=vec3(q.x,q.y*cl+z*sl,-q.y*sl+z*cl);' +
      'float lat=asin(clamp(w.y,-1.,1.));float lon=atan(w.x,w.z)+lon0;' +
      'vec2 uv=vec2(fract(lon/6.2831853+.5),.5-lat/3.1415927);' +
      'vec3 c=texture2D(t,uv).rgb;c=pow(c,vec3(1.12))*1.12;' +
      'float rim=pow(1.-z,2.6);c=c*(.62+.5*z)+vec3(.30,.46,.95)*rim*.38;' +
      'gl_FragColor=vec4(c,1.);}';
    function sh(type, src) { var s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw 0; return s; }
    var pr = gl.createProgram();
    gl.attachShader(pr, sh(gl.VERTEX_SHADER, vs)); gl.attachShader(pr, sh(gl.FRAGMENT_SHADER, fs)); gl.linkProgram(pr);
    if (!gl.getProgramParameter(pr, gl.LINK_STATUS)) return;
    gl.useProgram(pr);
    var buf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    var loc = gl.getAttribLocation(pr, 'p'); gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    var uLon = gl.getUniformLocation(pr, 'lon0'), uLat = gl.getUniformLocation(pr, 'lat0'), uK = gl.getUniformLocation(pr, 'k');
    var K = 1.16; // globe radius = 1/K of the half-size (room for atmosphere, orbit and labels)

    var img = new Image();
    img.onload = function () {
      var tex = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, img);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      ready = true; resize(); frame(performance.now());
      box.classList.add('live');
    };
    img.src = box.offsetWidth * Math.min(window.devicePixelRatio || 1, 2) > 900 ? box.getAttribute('data-tex') : box.getAttribute('data-tex-s');

    function resize() {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      size = box.clientWidth;
      [cv, ov].forEach(function (c) { c.width = Math.round(size * dpr); c.height = Math.round(size * dpr); });
      gl.viewport(0, 0, cv.width, cv.height);
      if (ready && !raf) draw(performance.now());
    }
    window.addEventListener('resize', resize);

    // orthographic projection, same maths as the shader
    function proj(lat, lon, h) {
      var cl = Math.cos(lat), x = cl * Math.sin(lon - view.lon), y = Math.sin(lat), z = cl * Math.cos(lon - view.lon);
      var c0 = Math.cos(view.lat), s0 = Math.sin(view.lat);
      var ny = y * c0 - z * s0, nz = y * s0 + z * c0;
      var s = (h || 1), R = size / 2 / K;
      return { x: size / 2 + x * s * R, y: size / 2 - ny * s * R, z: nz * s, on: nz > 0 || (x * x + ny * ny) * s * s > 1 };
    }
    function slerp(a, b, t) {
      var va = [Math.cos(a[0]) * Math.cos(a[1]), Math.cos(a[0]) * Math.sin(a[1]), Math.sin(a[0])];
      var vb = [Math.cos(b[0]) * Math.cos(b[1]), Math.cos(b[0]) * Math.sin(b[1]), Math.sin(b[0])];
      var dot = Math.max(-1, Math.min(1, va[0] * vb[0] + va[1] * vb[1] + va[2] * vb[2])), om = Math.acos(dot);
      var s0 = Math.sin((1 - t) * om) / Math.sin(om), s1 = Math.sin(t * om) / Math.sin(om);
      var v = [va[0] * s0 + vb[0] * s1, va[1] * s0 + vb[1] * s1, va[2] * s0 + vb[2] * s1];
      return [Math.asin(v[2]), Math.atan2(v[1], v[0]), om];
    }

    function draw(now) {
      gl.uniform1f(uLon, view.lon); gl.uniform1f(uLat, view.lat); gl.uniform1f(uK, K);
      gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT); gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, size, size);
      var R = size / 2 / K, t = now / 1000;

      // satellite on an inclined orbit
      var inc = 0.62, rr = 1.075, ph = t * 0.32;
      ctx.lineWidth = 1;
      ctx.strokeStyle = 'rgba(236,231,221,.13)';
      ctx.beginPath();
      for (var i = 0; i <= 120; i++) {
        var a = i / 120 * Math.PI * 2, ox = Math.cos(a), oy = Math.sin(a) * Math.sin(inc), oz = Math.sin(a) * Math.cos(inc);
        var px = size / 2 + ox * rr * R, py = size / 2 - oy * rr * R;
        var hidden = oz < 0 && (ox * ox + oy * oy) * rr * rr < 1;
        if (i === 0 || hidden) ctx.moveTo(px, py); else ctx.lineTo(px, py);
      }
      ctx.stroke();
      var sx = Math.cos(ph), sy = Math.sin(ph) * Math.sin(inc), sz = Math.sin(ph) * Math.cos(inc);
      if (!(sz < 0 && (sx * sx + sy * sy) * rr * rr < 1)) {
        var X = size / 2 + sx * rr * R, Y = size / 2 - sy * rr * R;
        ctx.fillStyle = 'rgba(236,231,221,.95)'; ctx.fillRect(X - 2.5, Y - 1.5, 5, 3);
        ctx.fillStyle = 'rgba(201,169,110,.9)'; ctx.fillRect(X - 7, Y - 1, 3.5, 2); ctx.fillRect(X + 3.5, Y - 1, 3.5, 2);
      }

      // arcs
      arcs.forEach(function (ac, idx) {
        var A = nodes[ac[0]], B = nodes[ac[1]], kind = ac[2];
        var a = [A.lat * D2R, A.lon * D2R], b = [B.lat * D2R, B.lon * D2R];
        var om = slerp(a, b, .5)[2], lift = Math.min(.32, .04 + om * .22), n = Math.max(12, Math.round(om * 60));
        var pts = [];
        for (var j = 0; j <= n; j++) { var s = slerp(a, b, j / n); var p = proj(s[0], s[1], 1 + lift * Math.sin(Math.PI * j / n)); pts.push(p); }
        ctx.lineWidth = kind === 'path' ? 1.6 : 1.1;
        ctx.strokeStyle = kind === 'path' ? 'rgba(227,201,149,.85)' : 'rgba(236,231,221,.42)';
        ctx.beginPath(); var pen = false;
        pts.forEach(function (p) { if (p.on) { if (pen) ctx.lineTo(p.x, p.y); else ctx.moveTo(p.x, p.y); pen = true; } else pen = false; });
        ctx.stroke();
        var f = ((t * .22 + idx * .27) % 1), q = pts[Math.round(f * n)];
        if (q && q.on) { ctx.fillStyle = kind === 'path' ? '#f3dcaa' : '#ffffff'; ctx.beginPath(); ctx.arc(q.x, q.y, 2.2, 0, 7); ctx.fill(); }
      });

      // nodes and labels
      ctx.font = (size < 480 ? '500 11px' : '500 12px') + ' Inter, system-ui, sans-serif'; ctx.textBaseline = 'middle';
      Object.keys(nodes).forEach(function (k) {
        var N = nodes[k], p = proj(N.lat * D2R, N.lon * D2R, 1);
        if (p.z < 0.05) return;
        var al = Math.min(1, p.z * 3);
        var gold = N.kind !== 'site';
        ctx.globalAlpha = al;
        ctx.fillStyle = gold ? '#e3c995' : '#ece7dd';
        ctx.beginPath(); ctx.arc(p.x, p.y, N.kind === 'origin' ? 4 : 3, 0, 7); ctx.fill();
        if (N.kind === 'origin') {
          var pulse = (t % 2.4) / 2.4;
          ctx.strokeStyle = 'rgba(227,201,149,' + (0.7 * (1 - pulse)) + ')'; ctx.lineWidth = 1;
          ctx.beginPath(); ctx.arc(p.x, p.y, 4 + pulse * 16, 0, 7); ctx.stroke();
        }
        if (N.label && !(size < 480 && N.hideS)) {
          var small = size < 480, w = ctx.measureText(N.label).width, side = (small && N.sideS) || N.side, lx, ly = p.y;
          if (side === 't') { lx = p.x - w / 2; ly = p.y - 16; }
          else lx = side === 'l' ? p.x - 10 - w : p.x + 10;
          lx = Math.max(6, Math.min(size - w - 6, lx));
          ctx.fillStyle = 'rgba(11,12,14,.6)'; ctx.fillRect(lx - 5, ly - 10, w + 10, 20);
          ctx.fillStyle = gold ? '#f0dcb0' : '#ece7dd'; ctx.fillText(N.label, lx, ly + 0.5);
        }
        ctx.globalAlpha = 1;
      });
    }

    var raf = 0;
    function frame(now) {
      raf = 0;
      if (!drag && !reduce) view.lon = base + Math.sin((now - t0) / 1000 * 0.11) * 0.38;
      draw(now);
      if (visible && !reduce) raf = requestAnimationFrame(frame);
    }
    if ('IntersectionObserver' in window) {
      new IntersectionObserver(function (en) {
        visible = en[0].isIntersecting;
        if (visible && ready && !raf) raf = requestAnimationFrame(frame);
      }).observe(box);
    } else { visible = true; }

    // drag to rotate (horizontal drag; vertical scrolling stays native on touch screens)
    box.addEventListener('pointerdown', function (e) { drag = { x: e.clientX, y: e.clientY, lon: view.lon, lat: view.lat }; });
    window.addEventListener('pointermove', function (e) {
      if (!drag) return;
      var s = 2.4 / (size || 400);
      view.lon = drag.lon - (e.clientX - drag.x) * s;
      view.lat = Math.max(-0.2, Math.min(1.1, drag.lat + (e.clientY - drag.y) * s));
      if (reduce || !visible) draw(performance.now());
    });
    var end = function () {
      if (!drag) return; drag = null;
      // continue the slow drift from the current position
      base = view.lon - Math.sin((performance.now() - t0) / 1000 * 0.11) * 0.38;
    };
    window.addEventListener('pointerup', end); window.addEventListener('pointercancel', end);
  }
})();

/* 3D fatigue terrain: one row per day, one column per 15-minute block.
   Work blocks rise as towers, rest lies flat, breaches stand as pulsing beacons. */
(function (root) {
  'use strict';
  if (!root.THREE) return;
  const SPD = 96;
  const COL_W = 0.5, ROW_D = 2.1;
  const WORK_H = 2.4, REST_H = 0.16, NONE_H = 0.04;
  const C = {
    work: new THREE.Color('#5aa2ff'), rest: new THREE.Color('#31c48d'), none: new THREE.Color('#1c2a3c'),
    minor: '#e8d25a', substantial: '#f59a3c', severe: '#ef4f4f', critical: '#e0368f'
  };
  const reduce = root.matchMedia && root.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function Stage(el, tipEl, onPick) {
    this.el = el; this.tip = tipEl; this.onPick = onPick;
    this.rows = 14; this.days = []; this.targets = new Float32Array(14 * SPD); this.t0 = 0;
    this.beacons = []; this.labels = [];
    try { this.renderer = new THREE.WebGLRenderer({ antialias: true }); }
    catch (e) { el.innerHTML = '<div class="nogl">3D view needs WebGL, which this browser has turned off. The diary and breach tools below still work.</div>'; this.dead = true; return; }
    const r = this.renderer;
    r.setPixelRatio(Math.min(root.devicePixelRatio || 1, 2));
    r.outputEncoding = THREE.sRGBEncoding;
    el.appendChild(r.domElement);

    const scene = this.scene = new THREE.Scene();
    scene.background = new THREE.Color('#070c14');
    scene.fog = new THREE.Fog('#070c14', 55, 125);

    const cam = this.camera = new THREE.PerspectiveCamera(40, 1, 0.1, 400);
    cam.position.set(-6, 30, 44);
    const ctl = this.controls = new THREE.OrbitControls(cam, r.domElement);
    ctl.enableDamping = true; ctl.dampingFactor = 0.08;
    ctl.autoRotate = !reduce; ctl.autoRotateSpeed = 0.45;
    ctl.minDistance = 14; ctl.maxDistance = 100; ctl.maxPolarAngle = 1.42;
    ctl.target.set(0, 0, 0);
    this.focus = null;

    scene.add(new THREE.HemisphereLight('#a9c8ff', '#0a1220', 0.75));
    const sun = new THREE.DirectionalLight('#ffffff', 0.95); sun.position.set(-18, 40, 26); scene.add(sun);
    const rim = new THREE.DirectionalLight('#5aa2ff', 0.35); rim.position.set(30, 10, -30); scene.add(rim);

    // ground + grid
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(200, 200),
      new THREE.MeshStandardMaterial({ color: '#081120', roughness: 1, metalness: 0 }));
    ground.rotation.x = -Math.PI / 2; ground.position.y = -0.02; scene.add(ground);
    const grid = new THREE.GridHelper(160, 80, '#16263b', '#0f1b2b'); grid.position.y = -0.01; scene.add(grid);

    // night bands (rebuilt per row count)
    this.nightGroup = new THREE.Group(); scene.add(this.nightGroup);
    this.labelGroup = new THREE.Group(); scene.add(this.labelGroup);
    this.beaconGroup = new THREE.Group(); scene.add(this.beaconGroup);

    // instanced blocks
    const geo = new THREE.BoxGeometry(COL_W * 0.84, 1, ROW_D * 0.72); geo.translate(0, 0.5, 0);
    const mat = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.42, metalness: 0.15 });
    this.mesh = new THREE.InstancedMesh(geo, mat, 14 * SPD);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    for (let i = 0; i < 14 * SPD; i++) this.mesh.setColorAt(i, C.none);
    scene.add(this.mesh);
    this.dummy = new THREE.Object3D();
    this.heights = new Float32Array(14 * SPD);

    // drifting dust
    const n = 500, pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { pos[i * 3] = (Math.random() - .5) * 110; pos[i * 3 + 1] = Math.random() * 30 + 1; pos[i * 3 + 2] = (Math.random() - .5) * 80; }
    const pg = new THREE.BufferGeometry(); pg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.dust = new THREE.Points(pg, new THREE.PointsMaterial({ color: '#7fb2ff', size: 0.16, transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending }));
    scene.add(this.dust);

    this.glowTex = glowTexture();
    this.ray = new THREE.Raycaster(); this.mouse = new THREE.Vector2();
    this.bindPointer();
    new ResizeObserver(() => this.resize()).observe(el);
    this.resize();
    this.clock = new THREE.Clock();
    const loop = () => { this.frame(); this.raf = requestAnimationFrame(loop); };
    loop();
  }

  function glowTexture() {
    const c = document.createElement('canvas'); c.width = c.height = 128;
    const g = c.getContext('2d'), grd = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    grd.addColorStop(0, 'rgba(255,255,255,1)'); grd.addColorStop(0.25, 'rgba(255,255,255,.55)'); grd.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grd; g.fillRect(0, 0, 128, 128);
    return new THREE.CanvasTexture(c);
  }

  function textSprite(text, color, size) {
    const c = document.createElement('canvas'); const g = c.getContext('2d');
    const fs = 64; g.font = `600 ${fs}px "Barlow Condensed", "Arial Narrow", sans-serif`;
    const w = Math.ceil(g.measureText(text).width) + 16; c.width = w; c.height = fs + 16;
    g.font = `600 ${fs}px "Barlow Condensed", "Arial Narrow", sans-serif`;
    g.fillStyle = color; g.textBaseline = 'middle'; g.fillText(text, 8, c.height / 2);
    const tex = new THREE.CanvasTexture(c); tex.encoding = THREE.sRGBEncoding;
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }));
    s.scale.set(size * w / c.height, size, 1);
    return s;
  }

  const P = Stage.prototype;
  P.x = function (slot) { return (slot - (SPD - 1) / 2) * COL_W; };
  P.z = function (row) { return (row - (this.rows - 1) / 2) * ROW_D; };

  P.resize = function () {
    if (this.dead) return;
    const w = this.el.clientWidth, h = this.el.clientHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    // keep the whole terrain in frame on narrow screens
    this.camera.fov = w < 600 ? 58 : 40;
    this.camera.updateProjectionMatrix();
  };

  /** days: [{iso, label, str}] oldest first; breaches: [{iso, slot, severity}] */
  P.setData = function (days, breaches, selectedIso, animate) {
    if (this.dead) return;
    this.rows = days.length; this.days = days;
    const total = 14 * SPD;
    for (let i = 0; i < total; i++) {
      const r = Math.floor(i / SPD), s = i % SPD, d = days[r];
      let h = 0, col = C.none;
      if (d) {
        const v = d.str ? d.str[s] : null;
        h = v === '1' ? WORK_H : v === '0' ? REST_H : NONE_H;
        col = v === '1' ? C.work : v === '0' ? C.rest : C.none;
        if (d.iso === selectedIso) col = col.clone().lerp(new THREE.Color('#ffffff'), v === '1' ? 0.35 : 0.25);
        else if (selectedIso) col = col.clone().multiplyScalar(0.62);
      }
      this.targets[i] = h;
      this.mesh.setColorAt(i, col);
    }
    this.mesh.instanceColor.needsUpdate = true;
    this.mesh.count = days.length * SPD;
    if (animate && !reduce) { this.heights.fill(0); this.t0 = performance.now(); this.animating = true; }
    else { this.heights.set(this.targets); this.animating = false; this.writeMatrices(); }

    this.buildNight(); this.buildLabels(); this.buildBeacons(breaches);
  };

  P.writeMatrices = function () {
    const d = this.dummy;
    for (let i = 0; i < this.rows * SPD; i++) {
      const r = Math.floor(i / SPD), s = i % SPD;
      d.position.set(this.x(s), 0, this.z(r));
      d.scale.set(1, Math.max(0.001, this.heights[i]), 1);
      d.updateMatrix();
      this.mesh.setMatrixAt(i, d.matrix);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  };

  P.clear = function (g) { while (g.children.length) { const o = g.children.pop(); o.geometry && o.geometry.dispose(); if (o.material) { o.material.map && o.material.map.dispose(); o.material.dispose(); } } };

  P.buildNight = function () {
    this.clear(this.nightGroup);
    const mat = new THREE.MeshBasicMaterial({ color: '#2a3a8a', transparent: true, opacity: 0.32, depthWrite: false });
    const depth = this.rows * ROW_D;
    // 00:00 to 08:00 and 22:00 to 24:00 bands run the full depth
    [[0, 32], [88, 96]].forEach(([a, b]) => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry((b - a) * COL_W, depth), mat);
      m.rotation.x = -Math.PI / 2; m.position.set((this.x(a) + this.x(b - 1)) / 2, 0.005, 0);
      this.nightGroup.add(m);
    });
  };

  P.buildLabels = function () {
    this.clear(this.labelGroup);
    this.days.forEach((d, r) => {
      const s = textSprite(d.label, d.iso === this.selected ? '#ffb020' : '#8ea1b6', 0.95);
      s.position.set(this.x(0) - 3.4, 0.6, this.z(r)); this.labelGroup.add(s);
    });
    const front = this.z(this.rows - 1) + ROW_D * 0.9;
    [['Midnight', 0], ['6am', 24], ['Noon', 48], ['6pm', 72], ['Midnight', 96]].forEach(([t, s]) => {
      const sp = textSprite(t, '#5d7189', 0.85); sp.position.set(this.x(s) - COL_W / 2, 0.5, front); this.labelGroup.add(sp);
    });
  };

  P.buildBeacons = function (breaches) {
    this.clear(this.beaconGroup); this.beacons = [];
    const idx = {}; this.days.forEach((d, r) => { idx[d.iso] = r; });
    breaches.forEach((b, k) => {
      const r = idx[b.iso]; if (r === undefined) return;
      const col = new THREE.Color(C[b.severity]);
      const x = this.x(b.slot), z = this.z(r);
      const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.32, 9, 16, 1, true),
        new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
      beam.position.set(x, 4.5 + WORK_H * 0.2, z);
      const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.glowTex, color: col, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
      halo.position.set(x, WORK_H + 0.4, z); halo.scale.set(3.2, 3.2, 1);
      const cap = new THREE.Mesh(new THREE.OctahedronGeometry(0.42), new THREE.MeshBasicMaterial({ color: col }));
      cap.position.set(x, 9.6, z);
      const ring = new THREE.Mesh(new THREE.RingGeometry(0.5, 0.62, 40),
        new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.8, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending }));
      ring.rotation.x = -Math.PI / 2; ring.position.set(x, 0.05, z);
      [beam, halo, cap, ring].forEach(o => this.beaconGroup.add(o));
      this.beacons.push({ beam, halo, cap, ring, phase: k * 0.7, key: b.key, x, z });
    });
  };

  P.select = function (iso) { this.selected = iso; };

  P.focusOn = function (key) {
    const b = this.beacons.find(x => x.key === key);
    this.focus = b ? new THREE.Vector3(b.x, 1, b.z) : new THREE.Vector3(0, 0, 0);
    this.focusUntil = performance.now() + 1400;
    if (b) this.controls.autoRotate = false;
    return !!b;
  };

  P.setSpin = function (on) { if (!this.dead) this.controls.autoRotate = on && !reduce; };

  P.frame = function () {
    const t = this.clock.getElapsedTime();
    if (this.animating) {
      const e = (performance.now() - this.t0) / 1000;
      let done = true;
      for (let i = 0; i < this.rows * SPD; i++) {
        const r = Math.floor(i / SPD), s = i % SPD;
        let k = (e * 1.5) - r * 0.045 - s * 0.0025;
        if (k < 1) done = false;
        k = Math.max(0, Math.min(1, k));
        const ease = 1 + 2.2 * Math.pow(k - 1, 3) + 1.2 * Math.pow(k - 1, 2); // ease-out with a slight overshoot
        this.heights[i] = this.targets[i] * ease;
      }
      this.writeMatrices();
      if (done) { this.animating = false; this.heights.set(this.targets); this.writeMatrices(); }
    }
    if (!reduce) {
      this.beacons.forEach(b => {
        const p = (t * 0.8 + b.phase) % 1;
        b.ring.scale.setScalar(1 + p * 3.2); b.ring.material.opacity = 0.85 * (1 - p);
        const pulse = 0.75 + 0.25 * Math.sin(t * 3 + b.phase);
        b.halo.scale.setScalar(3.2 * pulse); b.beam.material.opacity = 0.35 + 0.2 * pulse;
        b.cap.rotation.y = t * 1.6; b.cap.position.y = 9.6 + Math.sin(t * 2 + b.phase) * 0.25;
      });
      this.dust.rotation.y = t * 0.01;
      this.dust.position.y = Math.sin(t * 0.3) * 0.4;
    }
    if (this.focus && performance.now() < this.focusUntil) this.controls.target.lerp(this.focus, 0.08);
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
  };

  P.bindPointer = function () {
    const dom = this.renderer.domElement;
    let down = null;
    const hit = ev => {
      const rect = dom.getBoundingClientRect();
      this.mouse.set(((ev.clientX - rect.left) / rect.width) * 2 - 1, -((ev.clientY - rect.top) / rect.height) * 2 + 1);
      this.ray.setFromCamera(this.mouse, this.camera);
      const h = this.ray.intersectObject(this.mesh)[0];
      if (!h || h.instanceId === undefined) return null;
      const r = Math.floor(h.instanceId / SPD), s = h.instanceId % SPD;
      const d = this.days[r]; if (!d) return null;
      return { d, s, x: ev.clientX - rect.left, y: ev.clientY - rect.top };
    };
    dom.addEventListener('pointerdown', ev => { down = [ev.clientX, ev.clientY]; });
    dom.addEventListener('pointermove', ev => {
      if (ev.buttons) { this.tip.hidden = true; return; }
      const h = hit(ev);
      if (!h) { this.tip.hidden = true; dom.style.cursor = ''; return; }
      const v = h.d.str ? h.d.str[h.s] : null;
      const hh = String(Math.floor(h.s / 4)).padStart(2, '0') + ':' + String((h.s % 4) * 15).padStart(2, '0');
      this.tip.textContent = `${h.d.label} · ${hh} · ${v === '1' ? 'Work' : v === '0' ? 'Rest' : 'No record'}`;
      this.tip.style.left = h.x + 'px'; this.tip.style.top = h.y + 'px'; this.tip.hidden = false;
      dom.style.cursor = 'pointer';
    });
    dom.addEventListener('pointerleave', () => { this.tip.hidden = true; });
    dom.addEventListener('pointerup', ev => {
      if (!down || Math.hypot(ev.clientX - down[0], ev.clientY - down[1]) > 5) return;
      const h = hit(ev); if (h) this.onPick(h.d.iso);
    });
  };

  root.Stage = Stage;
})(window);

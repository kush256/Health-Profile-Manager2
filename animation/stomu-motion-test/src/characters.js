// =====================================================================
//  characters.js — Stomu, Brainu, Intestino puppet definitions
//  Built to match the uploaded reference sheets (reference/*.jpg):
//  outline weight, palette, white 4-finger gloves w/ cuffs, blue sneakers,
//  rubber-hose limbs in body colour, cream eyes with dark pupils.
//  Light comes from upper-left on every character (consistent lighting).
// =====================================================================
(function () {
  const R = window.RIG;
  const { INK, LW, lerp, clamp } = R;

  // ---------------- generic puppet assembly ----------------
  // P (pose): x,y (ground, world px), s (scale), dx/bob (body shift), lean (rad), sx/sy (squash),
  //   turn (-1 faces screen-left .. +1 faces screen-right), face{...}, arms{R,L}, feet{R,L}
  // Arm/foot "R" is the character's right = screen-left when facing camera.
  function drawPuppet(ctx, def, P, t) {
    const s = P.s;
    ctx.save(); ctx.translate(P.x, P.y); ctx.scale(s, s);
    const m = new DOMMatrix().translate(P.dx || 0, P.bob || 0).translate(0, -def.legLen)
      .rotate((P.lean || 0) * 180 / Math.PI).scale(P.sx || 1, P.sy || 1).translate(0, def.legLen);
    const T = (x, y) => { const p = m.transformPoint({ x, y }); return { x: p.x, y: p.y }; };
    const turn = P.turn || 0;

    // contact shadow (ground space)
    const lift = Math.min(0, P.bob || 0);
    ctx.beginPath(); ctx.ellipse((P.dx || 0) * 0.6, 4, def.shadowR * (1 + lift / 400), 20, 0, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(122,62,52,0.22)'; ctx.fill();

    const arm = side => {
      const A = P.arms[side], sg = side === 'R' ? -1 : 1;
      const sh = T(...def.shoulder(sg, turn));
      const h = T(A.x, A.y);
      R.limb(ctx, sh, h, A.len || def.armLen, A.bend ?? -sg, def.limbW, def.skin, def.shade, A.via ? T(A.via[0], A.via[1]) : null);
      R.glove(ctx, h.x, h.y, A.ang + (P.lean || 0), { curl: A.curl, index: A.index, spread: A.spread, side: A.side ?? (sg > 0 ? -1 : 1), s: def.gloveS * (A.gs || 1) });
    };
    for (const side of ['R', 'L']) if (!P.arms[side].front) arm(side);

    // legs + sneakers (feet are in world coords so planted feet never slide)
    for (const side of (turn >= 0 ? ['L', 'R'] : ['R', 'L'])) {
      const F = P.feet[side], sg = side === 'R' ? -1 : 1;
      const fx = (F.x - P.x) / s, fy = (F.y - P.y) / s;
      const dir = F.yaw >= 0 ? 1 : -1, lf = 0.5 + 0.5 * Math.min(1, Math.abs(F.yaw));
      const a = (F.ang || 0) * dir, ax = -5 * lf * dir, ay = -32;
      const ankle = { x: fx + ax * Math.cos(a) - ay * Math.sin(a), y: fy + ax * Math.sin(a) + ay * Math.cos(a) };
      const hip = T(...def.hip(sg, turn));
      R.limb(ctx, hip, ankle, def.legLen * 0.93, F.bend ?? (Math.abs(F.yaw) > 0.5 ? -dir : -sg), def.limbW, def.skin, def.shade);
      R.shoe(ctx, fx, fy, F.ang || 0, F.yaw, def.shoeS);
    }
    if (def.drawTail) def.drawTail(ctx, T, P);

    ctx.save();
    ctx.transform(m.a, m.b, m.c, m.d, m.e, m.f);
    def.drawBody(ctx, P, t);
    def.drawFace(ctx, P, t);
    ctx.restore();

    for (const side of ['R', 'L']) if (P.arms[side].front) arm(side);
    ctx.restore();
  }

  // shading helper: base fill + lower-right shade crescent + upper-left highlight, then outline
  function shadedBody(ctx, path, base, shade, hl) {
    ctx.save();
    ctx.beginPath(); path(ctx); ctx.fillStyle = shade; ctx.fill();
    ctx.clip();
    ctx.save(); ctx.translate(-16, -18); ctx.beginPath(); path(ctx); ctx.fillStyle = base; ctx.fill(); ctx.restore();
    if (hl) hl(ctx);
    ctx.restore();
  }
  function outline(ctx, path, w = LW) { ctx.beginPath(); path(ctx); ctx.lineWidth = w; ctx.strokeStyle = INK; ctx.lineJoin = 'round'; ctx.stroke(); }

  function polarPath(cx, cy, rx, ry, rf, n = 96) {
    const pts = [];
    for (let i = 0; i < n; i++) { const a = i / n * Math.PI * 2 - Math.PI; const r = rf(a); pts.push([cx + Math.cos(a) * rx * r, cy + Math.sin(a) * ry * r]); }
    return g => {
      const mid = (p, q) => [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2];
      let m0 = mid(pts[n - 1], pts[0]); g.moveTo(m0[0], m0[1]);
      for (let i = 0; i < n; i++) { const p = pts[i], q = pts[(i + 1) % n], mm = mid(p, q); g.quadraticCurveTo(p[0], p[1], mm[0], mm[1]); }
      g.closePath();
    };
  }

  // standard two-eye face used by all three (each passes its own geometry/defaults)
  function face(ctx, P, G) {
    const F = P.face, turn = P.turn || 0;
    const fx = G.x + turn * G.turnShift + (F.dx || 0), fy = (F.dy || 0);
    const sp = G.spacing * (1 - 0.2 * Math.abs(turn));
    const es = F.eyeS || 1;
    const blink = F.blink || 0;
    const eyes = [[-1, 1 - 0.22 * Math.max(0, -turn)], [1, 1 - 0.22 * Math.max(0, turn)]];
    for (const [sd, fs] of eyes) {
      const ex = fx + sd * sp, ey = G.eyeY + fy;
      const lidT = Math.max(F.lidT || 0, blink) + (sd < 0 ? F.lidTL || 0 : F.lidTR || 0);
      R.eye(ctx, ex, ey, G.rx * es * fs, G.ry * es, {
        lx: F.lx || 0, ly: F.ly || 0, lidT: Math.min(1, lidT), lidB: Math.max(F.lidB || 0, blink * 0.0),
        tilt: (F.tilt || 0) * -sd + (F.tiltAll || 0), pupil: F.pupil || 1, skin: G.skin,
      });
      // brows (inner end points to face centre)
      const bIn = (F.browIn || 0) + (sd < 0 ? F.browL || 0 : F.browR || 0);
      const bOut = (F.browOut || 0) + (sd < 0 ? F.browL || 0 : F.browR || 0);
      R.brow(ctx, ex - sd * 2, G.browY + fy - (F.browUp || 0), G.browLen * fs, bIn, bOut, G.browArch, G.browTh, G.browCol, -sd);
    }
    if (F.flush) {
      ctx.save(); ctx.globalAlpha = F.flush * 0.45; ctx.fillStyle = '#e0404f';
      for (const sd of [-1, 1]) { ctx.beginPath(); ctx.ellipse(fx + sd * sp * 1.75, G.eyeY + fy + G.ry * 1.3, G.rx * 0.9, G.ry * 0.38, 0, 0, Math.PI * 2); ctx.fill(); }
      ctx.restore();
    }
    const M = Object.assign({}, R.VIS.X, G.mouthRest, F.mouth || {});
    M.W = G.mouthW * (F.mouthScale || 1); M.H = G.mouthH * (F.mouthScale || 1);
    R.mouth(ctx, fx + turn * 6 + (F.mouthDx || 0), G.mouthY + fy, M);
  }

  // =============================== STOMU ===============================
  const STOMU = {
    name: 'stomu', skin: '#ea8e91', shade: '#c9646c', limbW: 20, legLen: 125, armLen: 150, gloveS: 1.0, shoeS: 1.0, shadowR: 175,
    hip: (sg, turn) => [sg * 44 * (1 - 0.35 * Math.abs(turn)) + turn * 8, -138],
    shoulder: (sg, turn) => [sg * 150 * (1 - (sg * turn < 0 ? 0.42 * Math.abs(turn) : -0.02)) + turn * 6, -232],
    bodyPath(P) {
      const turn = P.turn || 0, cx = turn * 6, cy = -296;
      const dA = -2.25 + turn * 0.35;
      const dL = Math.PI - 0.15 + turn * 0.3;
      return polarPath(cx, cy, 168 * (1 - 0.05 * Math.abs(turn)), 172, a => {
        let r = 1 - 0.075 * Math.exp(-Math.pow(a - dA, 2) / 0.12);
        const da = Math.atan2(Math.sin(a - dL), Math.cos(a - dL));
        r -= 0.085 * Math.exp(-da * da / 0.09);                       // lesser-curvature notch on the left
        r += 0.07 * Math.exp(-Math.pow(a - 0.85, 2) / 0.45);           // fuller lower-right (greater curvature)
        r -= 0.04 * Math.exp(-Math.pow(a + 0.9, 2) / 0.3);
        return r;
      });
    },
    drawBody(ctx, P) {
      const turn = P.turn || 0, cx = turn * 6;
      // esophagus (top-left) and duodenum (lower-left) — drawn behind body
      const ex = -78 + turn * 34 + cx, ey = -430;
      const eso = g => { g.moveTo(ex + 18, ey + 30); g.bezierCurveTo(ex + 6, ey - 30, ex - 8, ey - 58, ex - 46 - turn * 6, ey - 66); };
      R.tube(ctx, eso, 46, this.skin);
      ctx.save(); ctx.globalAlpha = 0.45; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(ex + 12, ey + 10); ctx.bezierCurveTo(ex + 14, ey - 30, ex + 2, ey - 48, ex - 20, ey - 52); ctx.strokeStyle = this.shade; ctx.lineWidth = 12; ctx.stroke(); ctx.restore();
      // opening rim
      const ox = ex - 50 - turn * 6, oy = ey - 66;
      R.inkFill(ctx, g => g.ellipse(ox, oy, 10, 25, 0.25, 0, Math.PI * 2), '#d47279');
      ctx.beginPath(); ctx.ellipse(ox - 1, oy, 5, 16, 0.25, 0, Math.PI * 2); ctx.fillStyle = '#8c3443'; ctx.fill();
      const dx0 = -150 + turn * 30, dy0 = -200;
      const duo = g => { g.moveTo(dx0 + 30, dy0); g.bezierCurveTo(dx0 - 10, dy0 + 2, dx0 - 30, dy0 + 6, dx0 - 50, dy0 + 22); };
      R.tube(ctx, duo, 38, this.skin);
      R.inkFill(ctx, g => g.ellipse(dx0 - 52, dy0 + 24, 9, 20, 0.7, 0, Math.PI * 2), '#d47279');
      ctx.beginPath(); ctx.ellipse(dx0 - 53, dy0 + 24, 4, 12, 0.7, 0, Math.PI * 2); ctx.fillStyle = '#8c3443'; ctx.fill();

      const path = this.bodyPath(P);
      shadedBody(ctx, path, this.skin, this.shade, g => {
        g.save(); g.globalAlpha = 0.35; g.fillStyle = '#fff';
        g.beginPath(); g.ellipse(-78 + turn * 30, -392, 42, 20, -0.6, 0, Math.PI * 2); g.fill();
        g.globalAlpha = 0.6; g.beginPath(); g.ellipse(-102 + turn * 30, -380, 9, 6, -0.6, 0, Math.PI * 2); g.fill();
        g.restore();
      });
      outline(ctx, path, LW * 1.1);
    },
    faceGeo: {
      x: 6, turnShift: 62, spacing: 40, eyeY: -322, rx: 27, ry: 36, browY: -376, browLen: 46, browArch: 3, browTh: 11, browCol: INK,
      mouthY: -258, mouthW: 76, mouthH: 66, mouthRest: { smile: -0.55 }, skin: '#ea8e91',
    },
    drawFace(ctx, P) { face(ctx, P, this.faceGeo); },
  };

  // =============================== BRAINU ===============================
  function seeded(seed) { let s = seed; return () => (s = (s * 16807) % 2147483647) / 2147483647; }
  const GYRI = (() => {
    const rnd = seeded(7), out = [];
    for (let gy = -1.0; gy <= 0.95; gy += 0.24) for (let gx = -1.05; gx <= 1.05; gx += 0.27) {
      let x = gx + (rnd() - .5) * 0.12, y = gy + (rnd() - .5) * 0.12, a = rnd() * Math.PI * 2;
      const pts = [[x, y]], n = 4 + Math.floor(rnd() * 3);
      for (let i = 0; i < n; i++) { a += (rnd() - .5) * 2.2; x += Math.cos(a) * 0.09; y += Math.sin(a) * 0.09; pts.push([x, y]); }
      out.push(pts);
    }
    return out;
  })();
  const BRAINU = {
    name: 'brainu', skin: '#eda7aa', shade: '#d18592', groove: '#b86475', limbW: 19, legLen: 118, armLen: 150, gloveS: 1.0, shoeS: 1.0, shadowR: 175,
    hip: (sg, turn) => [sg * 44 * (1 - 0.35 * Math.abs(turn)) + turn * 8, -148],
    shoulder: (sg, turn) => [sg * 158 * (1 - (sg * turn < 0 ? 0.35 * Math.abs(turn) : -0.02)), -238],
    cy: -300, rx: 186, ry: 160,
    bodyPath(P) {
      const turn = P.turn || 0;
      return polarPath(turn * 4, this.cy, this.rx * (1 - 0.04 * Math.abs(turn)), this.ry, a => {
        let r = 1 + 0.032 * Math.cos(13 * a + turn * 2) + 0.014 * Math.cos(23 * a + 1);
        if (Math.sin(a) > 0) r *= 1 - 0.07 * Math.pow(Math.sin(a), 4);
        return r;
      }, 160);
    },
    drawBody(ctx, P) {
      const turn = P.turn || 0, path = this.bodyPath(P), F = P.face;
      shadedBody(ctx, path, this.skin, this.shade, g => {
        // gyri (folds) slide with the head turn for a cheap 3D read; stay off the face area
        const fx = turn * 58 + (F.dx || 0), fy = -262 + (F.dy || 0);
        g.lineCap = 'round'; g.lineJoin = 'round'; g.strokeStyle = this.groove; g.lineWidth = 7;
        for (const pts of GYRI) {
          g.beginPath(); let pen = false, prev = null;
          for (const [u, v] of pts) {
            const x = u * this.rx * 0.98 + turn * 46, y = this.cy + v * this.ry * 0.98;
            const inFace = Math.pow((x - fx) / 128, 2) + Math.pow((y - fy) / 92, 2) < 1;
            if (inFace) { pen = false; prev = null; continue; }
            if (pen) { g.quadraticCurveTo(prev[0], prev[1], (prev[0] + x) / 2, (prev[1] + y) / 2); } else { g.moveTo(x, y); pen = true; }
            prev = [x, y];
          }
          if (prev && pen) g.lineTo(prev[0], prev[1]);
          g.stroke();
        }
        // central fissure
        g.lineWidth = 6; g.strokeStyle = INK; g.globalAlpha = 0.75;
        g.beginPath(); g.moveTo(turn * 50 + 2, this.cy - this.ry - 10); g.bezierCurveTo(turn * 50 - 6, -425, turn * 50 + 6, -405, turn * 50 - 2, -392); g.stroke();
        g.globalAlpha = 0.32; g.fillStyle = '#fff';
        g.beginPath(); g.ellipse(-92 + turn * 30, -402, 46, 20, -0.5, 0, Math.PI * 2); g.fill();
        g.globalAlpha = 1;
      });
      outline(ctx, path, LW * 1.1);
    },
    faceGeo: {
      x: 0, turnShift: 58, spacing: 40, eyeY: -290, rx: 25, ry: 33, browY: -340, browLen: 40, browArch: 7, browTh: 6.5, browCol: '#5a2c28',
      mouthY: -226, mouthW: 72, mouthH: 62, mouthRest: { smile: 0.7 }, skin: '#eda7aa',
    },
    drawFace(ctx, P) { face(ctx, P, this.faceGeo); },
  };

  // =============================== INTESTINO ===============================
  const INTESTINO = {
    name: 'intestino', skin: '#f9957b', shade: '#cf6c56', coil: '#fba48d', panel: '#e98066', limbW: 19, legLen: 112, armLen: 175, gloveS: 1.0, shoeS: 1.0, shadowR: 170,
    hip: (sg, turn) => [sg * 46 * (1 - 0.35 * Math.abs(turn)) + turn * 8, -132],
    shoulder: (sg, turn) => [sg * 160 * (1 - (sg * turn < 0 ? 0.3 * Math.abs(turn) : 0)), -372],
    bodyPath(P) {
      return g => {
        g.moveTo(0, -562);
        g.bezierCurveTo(110, -564, 168, -540, 168, -440);
        g.bezierCurveTo(170, -330, 172, -230, 160, -170);
        g.bezierCurveTo(150, -124, 90, -118, 0, -118);
        g.bezierCurveTo(-90, -118, -150, -124, -160, -170);
        g.bezierCurveTo(-172, -230, -170, -330, -168, -440);
        g.bezierCurveTo(-168, -540, -110, -564, 0, -562);
        g.closePath();
      };
    },
    drawTail(ctx, T) {
      const a = T(4, -140), b = T(10, -96);
      R.tube(ctx, g => { g.moveTo(a.x, a.y); g.quadraticCurveTo(a.x - 4, (a.y + b.y) / 2, b.x, b.y); }, 26, this.skin);
    },
    drawBody(ctx, P) {
      const turn = P.turn || 0, path = this.bodyPath(P);
      shadedBody(ctx, path, this.skin, this.shade, g => {
        // inner panel (small intestine sits inside the large-intestine frame)
        const panel = g2 => g2.roundRect(-118 + turn * 10, -388, 236, 230, [40, 40, 60, 60]);
        g.beginPath(); panel(g); g.fillStyle = this.panel; g.fill(); g.lineWidth = LW; g.strokeStyle = INK; g.stroke();
        g.save(); g.beginPath(); panel(g); g.clip();
        const coil = g3 => {
          const x0 = -150 + turn * 22, x1 = 150 + turn * 22, rows = [-352, -296, -240, -184];
          const wy = (x, i) => 10 * Math.sin(x * 0.045 + i * 1.9) + 5 * Math.sin(x * 0.11 + i);
          g3.moveTo(x0, rows[0] + wy(x0, 0));
          rows.forEach((y, i) => {
            const L2R = i % 2 === 0, xa = L2R ? x0 + 30 : x1 - 30, xb = L2R ? x1 - 46 : x0 + 46;
            for (let k = 0; k <= 16; k++) { const x = lerp(xa, xb, k / 16); g3.lineTo(x, y + wy(x, i)); }
            if (i < rows.length - 1) { const yn = rows[i + 1], o = L2R ? 44 : -44; g3.bezierCurveTo(xb + o, y + wy(xb, i), xb + o, yn + wy(xb, i + 1), xb, yn + wy(xb, i + 1)); }
          });
        };
        R.tube(g, coil, 36, this.coil);
        g.globalAlpha = 0.5; g.lineWidth = 6; g.strokeStyle = '#ffd0c2'; g.save(); g.translate(-3, -6); g.beginPath(); coil(g); g.stroke(); g.restore(); g.globalAlpha = 1;
        g.restore();
        // haustra creases on the frame
        g.strokeStyle = INK; g.lineWidth = 3.5; g.lineCap = 'round';
        for (const y of [-430, -350, -280, -210]) for (const sd of [-1, 1]) {
          g.beginPath(); g.moveTo(sd * 166, y); g.quadraticCurveTo(sd * 145, y + 8, sd * 124, y + 2); g.stroke();
        }
        for (const x of [-70, 0, 70]) { g.beginPath(); g.moveTo(x + turn * 10, -122); g.quadraticCurveTo(x + 8 + turn * 10, -138, x + 2 + turn * 10, -154); g.stroke(); }
        g.globalAlpha = 0.33; g.fillStyle = '#fff'; g.beginPath(); g.ellipse(-90 + turn * 26, -520, 40, 16, -0.4, 0, Math.PI * 2); g.fill(); g.globalAlpha = 1;
      });
      outline(ctx, path, LW * 1.1);
    },
    faceGeo: {
      x: 0, turnShift: 50, spacing: 40, eyeY: -478, rx: 25, ry: 29, browY: -522, browLen: 40, browArch: 2, browTh: 8, browCol: INK,
      mouthY: -420, mouthW: 64, mouthH: 46, mouthRest: { smile: -0.1, skew: 0.35 }, skin: '#f9957b',
    },
    drawFace(ctx, P) { face(ctx, P, this.faceGeo); },
  };

  window.CHARS = { drawPuppet, STOMU, BRAINU, INTESTINO };
})();

/* Vault graph, moved from the old single-page site. Reads #vault-data in vault.html. */
        /* ════════════════════════════════════════════════════════════
           VAULT GRAPH
           A force-directed map of my Obsidian vault: 792 notes that
           carry at least one link, and the 1,435 links between them.

           Repulsion uses a Barnes-Hut quadtree (theta = 0.9), so a tick
           is O(n log n) rather than O(n^2) — about 8k force evaluations
           instead of 627k. Positions are solved offline and shipped in
           #vault-data, so the graph opens already settled; the loop
           runs only while alpha > 0 and stops dead when it cools, which
           means an idle page burns no frames at all.
           ════════════════════════════════════════════════════════════ */
        (function vaultGraph() {
            var wrap   = document.getElementById('graph-wrap');
            var canvas = document.getElementById('graph');
            var tipEl  = document.getElementById('graph-tip');
            var legEl  = document.getElementById('graph-legend');
            var dataEl = document.getElementById('vault-data');
            if (!wrap || !canvas || !dataEl) return;

            var raw;
            try { raw = JSON.parse(dataEl.textContent); } catch (e) { return; }

            var ctx = canvas.getContext('2d');
            var N = raw.n.length;
            var X = new Float64Array(N), Y = new Float64Array(N);
            var VX = new Float64Array(N), VY = new Float64Array(N);
            var R = new Float64Array(N), DEG = new Float64Array(N);
            var FOLD = new Uint8Array(N), TITLE = new Array(N);

            for (var i = 0; i < N; i++) {
                var d = raw.n[i];
                TITLE[i] = d[0]; FOLD[i] = d[1]; DEG[i] = d[2];
                X[i] = d[3]; Y[i] = d[4];
                R[i] = 2.6 + Math.sqrt(d[2]) * 1.5;
            }
            var LA = new Int32Array(raw.l.length), LB = new Int32Array(raw.l.length);
            for (i = 0; i < raw.l.length; i++) { LA[i] = raw.l[i][0]; LB[i] = raw.l[i][1]; }
            var M = LA.length;

            /* adjacency, for hover highlighting */
            var adjStart = new Int32Array(N + 1), adjCount = new Int32Array(N);
            for (i = 0; i < M; i++) { adjCount[LA[i]]++; adjCount[LB[i]]++; }
            var acc = 0;
            for (i = 0; i < N; i++) { adjStart[i] = acc; acc += adjCount[i]; }
            adjStart[N] = acc;
            var adj = new Int32Array(acc), fill = new Int32Array(N);
            for (i = 0; i < M; i++) {
                adj[adjStart[LA[i]] + fill[LA[i]]++] = LB[i];
                adj[adjStart[LB[i]] + fill[LB[i]]++] = LA[i];
            }

            /* ── Palette, read from the page so it follows light/dark ── */
            var css = getComputedStyle(document.documentElement);
            var C = {};
            function refreshPalette() {
                css = getComputedStyle(document.documentElement);
                C.ink   = css.getPropertyValue('--ink').trim()       || '#ece7dc';
                C.muted = css.getPropertyValue('--ink-muted').trim() || '#aab2ba';
                C.faint = css.getPropertyValue('--ink-faint').trim() || '#8d959e';
                C.gilt  = css.getPropertyValue('--gilt').trim()      || '#c9ab73';
            }
            refreshPalette();

            /* folder -> role. Source material and maps are the hubs and get
               the gilt; the claims are the body of the vault and stay quiet. */
            function folderColor(f) {
                var name = raw.folders[f] || '';
                if (name.indexOf('2 - Source') === 0) return C.gilt;
                if (name.indexOf('4 - Maps') === 0)   return C.ink;
                if (name.indexOf('3 - Writings') === 0) return C.ink;
                return C.muted;
            }
            function folderLabel(f) {
                var n = raw.folders[f] || '';
                return n.replace(/^\d+\s*-\s*/, '').replace(/^./, function (c) { return c.toUpperCase(); });
            }

            /* ── View transform ── */
            var W = 0, H = 0, dpr = 1;
            var scale = 1, tx = 0, ty = 0;

            function fit() {
                var r = wrap.getBoundingClientRect();
                dpr = Math.min(window.devicePixelRatio || 1, 2);
                W = Math.max(1, r.width); H = Math.max(1, r.height);
                canvas.width = Math.round(W * dpr);
                canvas.height = Math.round(H * dpr);
                canvas.style.width = W + 'px';
                canvas.style.height = H + 'px';
                var minx = Infinity, miny = Infinity, maxx = -Infinity, maxy = -Infinity;
                for (var i = 0; i < N; i++) {
                    if (X[i] < minx) minx = X[i]; if (X[i] > maxx) maxx = X[i];
                    if (Y[i] < miny) miny = Y[i]; if (Y[i] > maxy) maxy = Y[i];
                }
                var pad = 40;
                var gw = Math.max(1, maxx - minx), gh = Math.max(1, maxy - miny);
                scale = Math.min((W - pad * 2) / gw, (H - pad * 2) / gh);
                scale = Math.max(0.02, Math.min(scale, 2));
                tx = W / 2 - (minx + maxx) / 2 * scale;
                ty = H / 2 - (miny + maxy) / 2 * scale;
                draw();
            }
            function sx(i) { return (X[i] + dx_(i)) * scale + tx; }
            function sy(i) { return (Y[i] + dy_(i)) * scale + ty; }

            /* ── Barnes-Hut quadtree ── */
            var qx, qy, qm, qsize, qchild, qn, qcap = 0;
            function ensureQuad(cap) {
                if (qcap >= cap) return;
                qcap = cap;
                qx = new Float64Array(cap); qy = new Float64Array(cap);
                qm = new Float64Array(cap); qsize = new Float64Array(cap);
                qchild = new Int32Array(cap * 4);
            }
            var qminx, qminy, qbox;
            function newNode(cx, cy, size) {
                var k = qn++;
                ensureQuad(qn + 8);
                qx[k] = 0; qy[k] = 0; qm[k] = 0; qsize[k] = size;
                qchild[k * 4] = qchild[k * 4 + 1] = qchild[k * 4 + 2] = qchild[k * 4 + 3] = -1;
                qNodeX[k] = cx; qNodeY[k] = cy;
                return k;
            }
            var qNodeX, qNodeY;
            function buildTree() {
                var minx = Infinity, miny = Infinity, maxx = -Infinity, maxy = -Infinity;
                for (var i = 0; i < N; i++) {
                    if (X[i] < minx) minx = X[i]; if (X[i] > maxx) maxx = X[i];
                    if (Y[i] < miny) miny = Y[i]; if (Y[i] > maxy) maxy = Y[i];
                }
                var size = Math.max(maxx - minx, maxy - miny) + 8;
                var cx = (minx + maxx) / 2, cy = (miny + maxy) / 2;
                var cap = N * 8 + 64;
                ensureQuad(cap);
                if (!qNodeX || qNodeX.length < cap) { qNodeX = new Float64Array(cap); qNodeY = new Float64Array(cap); }
                qn = 0;
                var root = newNode(cx, cy, size);
                for (i = 0; i < N; i++) insert(root, i);
                return root;
            }
            function insert(k, i) {
                /* descend to a leaf, subdividing as needed */
                var guard = 0;
                while (guard++ < 64) {
                    qm[k] += 1; qx[k] += X[i]; qy[k] += Y[i];
                    var half = qsize[k] / 2;
                    if (half < 0.75) return;                 /* coincident points: stop */
                    var q = (X[i] >= qNodeX[k] ? 1 : 0) + (Y[i] >= qNodeY[k] ? 2 : 0);
                    var c = qchild[k * 4 + q];
                    if (c === -1) {
                        var ox = (q & 1 ? 1 : -1) * half / 2;
                        var oy = (q & 2 ? 1 : -1) * half / 2;
                        c = newNode(qNodeX[k] + ox, qNodeY[k] + oy, half);
                        qchild[k * 4 + q] = c;
                        qm[c] = 1; qx[c] = X[i]; qy[c] = Y[i];
                        return;
                    }
                    k = c;
                }
            }
            var THETA2 = 0.25;   /* theta = 0.5 — closer to the exact field the
                                    offline solve used, so the shipped layout
                                    really is this simulation's fixed point */
            var stack = new Int32Array(4096);
            function repel(i, k, strength, FX, FY) {
                var sp = 0; stack[sp++] = k;
                while (sp > 0) {
                    var n = stack[--sp];
                    var m = qm[n];
                    if (m === 0) continue;
                    var cx = qx[n] / m, cy = qy[n] / m;
                    var dx = cx - X[i], dy = cy - Y[i];
                    var d2 = dx * dx + dy * dy;
                    if (d2 < 1e-6) { dx = (Math.random() - 0.5) * 0.5; dy = (Math.random() - 0.5) * 0.5; d2 = dx * dx + dy * dy + 1e-6; }
                    var s = qsize[n];
                    if (s * s / d2 < THETA2 || qchild[n * 4] + qchild[n * 4 + 1] + qchild[n * 4 + 2] + qchild[n * 4 + 3] === -4) {
                        var f = strength * m / d2;
                        FX[i] -= dx * f; FY[i] -= dy * f;
                    } else {
                        for (var q = 0; q < 4; q++) {
                            var c = qchild[n * 4 + q];
                            if (c !== -1 && sp < stack.length) stack[sp++] = c;
                        }
                    }
                }
            }

            var FX = new Float64Array(N), FY = new Float64Array(N);
            var alpha = 0, ALPHA_MIN = 0.0015, DECAY = 0.055;
            var REPEL = 26, SPRING = 0.045, LINK_LEN = 26, CENTER = 0.010;
            var DAMP = 0.55;          /* heavier than the solve; same fixed point,
                                         much less overshoot when disturbed */
            var MAXV = 1.6;           /* per-node speed clamp, in graph units */
            var dragIdx = -1;

            /* Ambient drift. Purely a render offset — it never enters the
               force integration, so it cannot destabilise the layout. */
            var AMP = 14;
            var PH = new Float64Array(N * 2), FQ = new Float64Array(N * 2);
            (function seedDrift() {
                var r = 1;
                function rnd() { r = (r * 1103515245 + 12345) & 0x7fffffff; return r / 0x7fffffff; }
                for (var i = 0; i < N * 2; i++) {
                    PH[i] = rnd() * 6.2832;
                    FQ[i] = 0.000185 + rnd() * 0.000265;   /* 14–34 s periods */
                }
            })();
            var T = 0;
            function dx_(i) { return AMP * Math.sin(T * FQ[2 * i] + PH[2 * i]); }
            function dy_(i) { return AMP * Math.sin(T * FQ[2 * i + 1] + PH[2 * i + 1]); }

            /* Which nodes are allowed to move.
               Dragging should feel like tugging a corner of a net, not like
               restarting the whole layout, so only the neighbourhood within
               HOPS links of the grabbed node is unpinned. Everything else is
               frozen at its shipped position. */
            var active = new Uint8Array(N), anyActive = false;
            var HOPS = 2, queue = new Int32Array(N), depth = new Int32Array(N);
            function activateAround(seed) {
                active.fill(0);
                if (seed < 0) { anyActive = false; return; }
                var head = 0, tail = 0;
                queue[tail++] = seed; active[seed] = 1; depth[seed] = 0;
                while (head < tail) {
                    var v = queue[head++];
                    if (depth[v] >= HOPS) continue;
                    for (var k = adjStart[v]; k < adjStart[v + 1]; k++) {
                        var w = adj[k];
                        if (active[w]) continue;
                        active[w] = 1; depth[w] = depth[v] + 1; queue[tail++] = w;
                    }
                }
                anyActive = true;
            }

            function tick() {
                FX.fill(0); FY.fill(0);
                var root = buildTree();
                for (var i = 0; i < N; i++) repel(i, root, REPEL, FX, FY);
                for (var e = 0; e < M; e++) {
                    var a = LA[e], b = LB[e];
                    var dx = X[b] - X[a], dy = Y[b] - Y[a];
                    var d = Math.sqrt(dx * dx + dy * dy) || 1e-6;
                    var f = (d - LINK_LEN) * SPRING;
                    dx = dx / d * f; dy = dy / d * f;
                    FX[a] += dx; FY[a] += dy;
                    FX[b] -= dx; FY[b] -= dy;
                }
                for (i = 0; i < N; i++) {
                    FX[i] -= X[i] * CENTER; FY[i] -= Y[i] * CENTER;
                    if (i === dragIdx) continue;
                    if (anyActive && !active[i]) { VX[i] = VY[i] = 0; continue; }
                    VX[i] = (VX[i] + FX[i] * alpha) * DAMP;
                    VY[i] = (VY[i] + FY[i] * alpha) * DAMP;
                    var sp = Math.sqrt(VX[i] * VX[i] + VY[i] * VY[i]);
                    if (sp > MAXV) { VX[i] *= MAXV / sp; VY[i] *= MAXV / sp; }
                    X[i] += VX[i]; Y[i] += VY[i];
                }
            }

            /* ── Draw ── */
            var hover = -1, isNeighbour = new Uint8Array(N);
            var dimT = 0, dimTarget = 0;              /* eased 0..1, kills the flicker */
            function lerp(a, b, t) { return a + (b - a) * t; }
            function draw() {
                ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
                ctx.clearRect(0, 0, W, H);

                var dim = dimT > 0.01;
                ctx.lineWidth = 1;
                ctx.strokeStyle = C.faint;
                ctx.globalAlpha = lerp(0.22, 0.13, dimT);
                ctx.beginPath();
                for (var e = 0; e < M; e++) {
                    var a = LA[e], b = LB[e];
                    if (dim && hover >= 0 && (a === hover || b === hover)) continue;
                    ctx.moveTo(sx(a), sy(a));
                    ctx.lineTo(sx(b), sy(b));
                }
                ctx.stroke();

                if (dim && hover >= 0) {
                    ctx.globalAlpha = 0.8 * dimT;
                    ctx.strokeStyle = C.gilt;
                    ctx.beginPath();
                    for (e = 0; e < M; e++) {
                        var a2 = LA[e], b2 = LB[e];
                        if (a2 !== hover && b2 !== hover) continue;
                        ctx.moveTo(sx(a2), sy(a2));
                        ctx.lineTo(sx(b2), sy(b2));
                    }
                    ctx.stroke();
                }

                for (var i = 0; i < N; i++) {
                    var x = sx(i), y = sy(i);
                    if (x < -30 || y < -30 || x > W + 30 || y > H + 30) continue;
                    var r = Math.max(1.5, R[i] * Math.min(1.6, Math.max(0.9, scale * 2.2)));
                    var lit = isNeighbour[i];
                    ctx.globalAlpha = lerp(0.9, lit ? 1 : 0.46, dimT);
                    ctx.fillStyle = (i === hover) ? C.gilt : folderColor(FOLD[i]);
                    ctx.beginPath();
                    ctx.arc(x, y, i === hover ? r * lerp(1, 1.55, dimT) : r, 0, 6.2832);
                    ctx.fill();
                }

                /* Labels are a function of zoom. At the default fit the field
                   should read as a shape, so nothing is named; zoom in and names
                   fade in, the best-connected first. Hovering names the
                   neighbourhood regardless of zoom. Either way they are placed
                   largest-first and anything that would collide is dropped —
                   a hub with 80 neighbours would otherwise smear into a block. */
                var LABEL_OFF = 0.30, LABEL_FULL = 0.46;
                var zoomT = (scale - LABEL_OFF) / (LABEL_FULL - LABEL_OFF);
                zoomT = zoomT < 0 ? 0 : (zoomT > 1 ? 1 : zoomT);

                var cand = null, labelAlpha = 0, LIMIT = 16;
                if (dim && hover >= 0) {
                    cand = [];
                    for (i = 0; i < N; i++) if (isNeighbour[i] && i !== hover) cand.push(i);
                    labelAlpha = 0.75 * dimT;
                } else if (zoomT > 0.01) {
                    /* the further in you go, the smaller a node needs to be to earn a name */
                    var minDeg = scale > 1.3 ? 1 : (scale > 0.85 ? 3 : (scale > 0.6 ? 6 : 11));
                    cand = [];
                    for (i = 0; i < N; i++) {
                        if (DEG[i] < minDeg) continue;
                        var px_ = sx(i), py_ = sy(i);
                        if (px_ < -60 || py_ < -30 || px_ > W + 60 || py_ > H + 30) continue;
                        cand.push(i);
                    }
                    labelAlpha = 0.66 * zoomT;
                    LIMIT = 60;
                }

                if (cand && cand.length && labelAlpha > 0.01) {
                    ctx.font = '700 12px "Source Serif 4", Georgia, serif';
                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'middle';
                    cand.sort(function (p, q) { return DEG[q] - DEG[p]; });

                    var placed = [];
                    for (var ci = 0; ci < cand.length && placed.length < LIMIT; ci++) {
                        var ni = cand[ci];
                        var lx = sx(ni), ly = sy(ni) - R[ni] * scale * 2.2 - 9;
                        if (lx < 40 || ly < 12 || lx > W - 40 || ly > H - 12) continue;
                        var txt = TITLE[ni];
                        if (txt.length > 34) txt = txt.slice(0, 33) + '…';
                        var hw = ctx.measureText(txt).width / 2 + 5;
                        var clash = false;
                        for (var pi = 0; pi < placed.length; pi++) {
                            var q2 = placed[pi];
                            if (Math.abs(lx - q2[0]) < hw + q2[2] && Math.abs(ly - q2[1]) < 15) { clash = true; break; }
                        }
                        if (clash) continue;
                        placed.push([lx, ly, hw]);
                        ctx.globalAlpha = labelAlpha;
                        ctx.fillStyle = C.ink;
                        ctx.fillText(txt, lx, ly);
                    }
                }
                ctx.globalAlpha = 1;
            }

            /* ── Frame loop: runs only while there is heat ── */
            var running = false, visible = true, drifting = true;
            function needsFrame() {
                return alpha > ALPHA_MIN
                    || Math.abs(dimTarget - dimT) > 0.004
                    || pendingIdx >= 0
                    || (drifting && visible && !document.hidden);
            }
            function frame(ts) {
                T = ts || 0;
                if (alpha > ALPHA_MIN) { alpha *= (1 - DECAY); tick(); }
                else if (alpha !== 0) { alpha = 0; active.fill(0); anyActive = false; }

                if (pendingIdx >= 0) {
                    var nw = (window.performance && performance.now) ? performance.now() : Date.now();
                    if (nw - pendingSince >= DWELL) {
                        var pi = pendingIdx; pendingIdx = -1;
                        setHover(pi, lastPX, lastPY);
                    }
                }
                dimT += (dimTarget - dimT) * 0.16;
                draw();
                if (needsFrame()) requestAnimationFrame(frame);
                else { running = false; }
            }
            function kick() {
                if (!running && needsFrame()) { running = true; requestAnimationFrame(frame); }
            }
            function heat(a) { alpha = Math.max(alpha, a); kick(); }

            /* Drift only while the graph is actually on screen. */
            if (window.IntersectionObserver) {
                new IntersectionObserver(function (es) {
                    visible = es[0].isIntersecting;
                    kick();
                }, { threshold: 0 }).observe(wrap);
            }
            document.addEventListener('visibilitychange', kick);
            if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) drifting = false;

            /* ── Interaction ── */
            /* Two radii: a tight one to acquire a node, a looser one to keep it.
               Without the gap, sweeping across a dense patch flickers the
               highlight on and off many times a second. */
            function pick(px, py, slack) {
                var best = -1, bestD = Infinity;
                for (var i = 0; i < N; i++) {
                    var dx = sx(i) - px, dy = sy(i) - py;
                    var d2 = dx * dx + dy * dy;
                    var rr = Math.max(7, R[i] * scale * 2.2 + 4) + slack;
                    if (d2 < rr * rr && d2 < bestD) { bestD = d2; best = i; }
                }
                return best;
            }
            function moveTip(px, py) {
                var tw = tipEl.offsetWidth, th = tipEl.offsetHeight;
                tipEl.style.left = Math.max(8, Math.min(W - tw - 8, px + 16)) + 'px';
                tipEl.style.top  = Math.max(8, Math.min(H - th - 8, py + 16)) + 'px';
            }

            function setHover(i, px, py) {
                if (i !== hover) {
                    hover = i;
                    isNeighbour.fill(0);
                    if (i >= 0) {
                        isNeighbour[i] = 1;
                        for (var k = adjStart[i]; k < adjStart[i + 1]; k++) isNeighbour[adj[k]] = 1;
                    }
                    canvas.classList.toggle('on-node', i >= 0);
                }
                dimTarget = i >= 0 ? 1 : 0;
                kick();
                if (i >= 0) {
                    var n = adjStart[i + 1] - adjStart[i];
                    tipEl.innerHTML = TITLE[i].replace(/&/g, '&amp;').replace(/</g, '&lt;') +
                        '<small>' + folderLabel(FOLD[i]) + ' &middot; ' + n + (n === 1 ? ' link' : ' links') + '</small>';
                    tipEl.classList.add('on');
                    moveTip(px, py);
                } else {
                    tipEl.classList.remove('on');
                }
            }

            var pointerDown = false, moved = false, lastX = 0, lastY = 0;
            var pendingIdx = -1, pendingSince = 0, DWELL = 110;
            var lastPX = 0, lastPY = 0;

            canvas.addEventListener('pointerdown', function (ev) {
                canvas.setPointerCapture(ev.pointerId);
                pointerDown = true; moved = false;
                lastX = ev.offsetX; lastY = ev.offsetY;
                var i = pick(lastX, lastY, 4);
                if (i >= 0) { dragIdx = i; activateAround(i); heat(0.05); }
                canvas.classList.add('dragging');
            });

            canvas.addEventListener('pointermove', function (ev) {
                var px = ev.offsetX, py = ev.offsetY;
                if (pointerDown) {
                    moved = true;
                    var dx = px - lastX, dy = py - lastY;
                    lastX = px; lastY = py;
                    if (dragIdx >= 0) {
                        X[dragIdx] += dx / scale; Y[dragIdx] += dy / scale;
                        VX[dragIdx] = VY[dragIdx] = 0;
                        heat(0.05);
                    } else {
                        tx += dx; ty += dy;
                        kick();
                    }
                    return;
                }
                /* Dwell gate: sweeping across a dense patch should not strobe
                   the highlight. A node is picked up only once the pointer has
                   rested on it for DWELL ms, which the frame loop checks — so
                   simply stopping counts, no further movement required.
                   Letting go is immediate. */
                lastPX = px; lastPY = py;
                var now = (window.performance && performance.now) ? performance.now() : Date.now();
                var over = pick(px, py, 0);

                if (over < 0 && hover >= 0) {
                    /* still inside the looser keep-radius of the current node? */
                    var hx = sx(hover) - px, hy = sy(hover) - py;
                    var keep = Math.max(7, R[hover] * scale * 2.2 + 4) + 10;
                    if (hx * hx + hy * hy < keep * keep) over = hover;
                }

                if (over === hover) {
                    pendingIdx = -1;
                    if (hover >= 0) moveTip(px, py);
                } else if (over < 0) {
                    pendingIdx = -1;
                    setHover(-1, px, py);
                } else if (over !== pendingIdx) {
                    pendingIdx = over; pendingSince = now;
                    kick();
                }
            });

            function endPointer() {
                pointerDown = false; dragIdx = -1;
                canvas.classList.remove('dragging');
            }
            canvas.addEventListener('pointerup', endPointer);
            canvas.addEventListener('pointercancel', endPointer);
            canvas.addEventListener('pointerleave', function () { endPointer(); setHover(-1, 0, 0); });

            canvas.addEventListener('wheel', function (ev) {
                ev.preventDefault();
                var px = ev.offsetX, py = ev.offsetY;
                var f = Math.exp(-ev.deltaY * 0.0016);
                var ns = Math.max(0.10, Math.min(4, scale * f));
                tx = px - (px - tx) * (ns / scale);
                ty = py - (py - ty) * (ns / scale);
                scale = ns;
                if (!running) draw();
                kick();
            }, { passive: false });

            canvas.addEventListener('dblclick', function () { fit(); kick(); });

            /* ── Legend ── */
            function legend() {
                var groups = [
                    ['Sources', C.gilt],
                    ['Claims',  C.muted]
                ];
                var html = groups.map(function (g) {
                    return '<span><i style="background:' + g[1] + '"></i>' + g[0] + '</span>';
                }).join('');
                html += '<span class="count">' + N + ' notes &middot; ' + M + ' links</span>';
                legEl.innerHTML = html;
            }
            legend();

            /* ── Wire up ── */
            var ro = window.ResizeObserver ? new ResizeObserver(fit) : null;
            if (ro) ro.observe(wrap); else window.addEventListener('resize', fit);
            if (window.matchMedia) {
                var mq = window.matchMedia('(prefers-color-scheme: dark)');
                if (mq.addEventListener) mq.addEventListener('change', function () { refreshPalette(); draw(); });
            }
            window.addEventListener('themechange', function () { refreshPalette(); legend(); draw(); });
            fit();
            kick();
        })();



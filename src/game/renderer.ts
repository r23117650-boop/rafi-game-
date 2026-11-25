import { PITCH } from './formations';
import type { GameEngine } from './matchEngine';
import type { PenaltyState, Player } from './types';

export interface PenaltyGoalBounds {
  goalLeft: number;
  goalRight: number;
  goalTop: number;
  goalBottom: number;
}

export function getPenaltyGoalBounds(w: number, h: number): PenaltyGoalBounds {
  const isCompact = w < 640;
  const goalW = isCompact ? Math.min(w * 0.88, 420) : Math.min(w * 0.56, 620);
  const goalH = goalW * (isCompact ? 0.44 : 0.36);
  const goalLeft = w / 2 - goalW / 2;
  const goalRight = w / 2 + goalW / 2;
  const goalBottom = h * (isCompact ? 0.48 : 0.52);
  const goalTop = goalBottom - goalH;
  return { goalLeft, goalRight, goalTop, goalBottom };
}

export function renderGame(
  ctx: CanvasRenderingContext2D,
  engine: GameEngine,
  width: number,
  height: number,
): void {
  ctx.save();
  if (engine.mode === 'PENALTY_SHOOTOUT' && engine.screen !== 'TITLE') {
    renderPenaltyArena(ctx, engine, width, height);
  } else {
    renderMatchPitch(ctx, engine, width, height);
  }
  ctx.restore();
}

function renderMatchPitch(
  ctx: CanvasRenderingContext2D,
  engine: GameEngine,
  w: number,
  h: number,
): void {
  // Stadium deep night surround
  ctx.fillStyle = '#09140e';
  ctx.fillRect(0, 0, w, h);

  // Camera scale adapts cleanly between phone portrait, phone landscape, and desktop
  const baseScale = w < 768 ? Math.max(w / 900, h / 960) * 0.82 : Math.max(w / 1280, h / 820) * 0.96;
  const scale = Math.max(0.46, Math.min(1.12, baseScale));
  const shakeX =
    engine.shakeAmount > 0.1 ? (Math.random() - 0.5) * engine.shakeAmount * 2 : 0;
  const shakeY =
    engine.shakeAmount > 0.1 ? (Math.random() - 0.5) * engine.shakeAmount * 2 : 0;

  ctx.save();
  ctx.translate(w / 2 + shakeX, h / 2 + shakeY);
  ctx.scale(scale, scale);
  ctx.translate(-engine.cameraX, -engine.cameraY);

  drawPitchSurface(ctx, engine);
  drawGoalNets(ctx, engine);

  // Draw pass target ring
  if (engine.screen === 'PLAYING' && engine.passTargetId) {
    const target = engine.players.find((p) => p.id === engine.passTargetId);
    if (target) {
      ctx.save();
      ctx.strokeStyle = 'rgba(250, 204, 21, 0.72)';
      ctx.lineWidth = 2.2;
      ctx.setLineDash([5, 4]);
      ctx.beginPath();
      ctx.arc(target.x, target.y, PITCH.playerRadius + 7, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
  }

  // Draw players sorted by Y for subtle depth overlap
  const sortedPlayers = [...engine.players].sort((a, b) => a.y - b.y);
  for (const p of sortedPlayers) {
    const isActive =
      engine.screen === 'PLAYING' && p.id === engine.activePlayerId;
    drawPlayerSprite(ctx, p, isActive, engine);
  }

  // Draw ball
  drawMatchBall(ctx, engine);

  // Draw pooled particles
  for (const pt of engine.particles) {
    if (!pt.active) continue;
    ctx.save();
    ctx.globalAlpha = pt.alpha;
    ctx.fillStyle = pt.color;
    ctx.beginPath();
    ctx.arc(pt.x, pt.y - pt.z * 0.4, pt.size, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  ctx.restore();

  // Subtle floodlight vignette around viewport edges
  const grad = ctx.createRadialGradient(
    w / 2,
    h / 2,
    Math.min(w, h) * 0.35,
    w / 2,
    h / 2,
    Math.max(w, h) * 0.75,
  );
  grad.addColorStop(0, 'rgba(0,0,0,0)');
  grad.addColorStop(1, 'rgba(4,10,7,0.42)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);

  // Compact tactical radar at bottom-center during live match
  if (engine.screen === 'PLAYING') {
    drawTacticalRadar(ctx, engine, w, h);
  }
}

function drawPitchSurface(
  ctx: CanvasRenderingContext2D,
  _engine: GameEngine,
): void {
  const x = PITCH.marginX;
  const y = PITCH.marginY;
  const fw = PITCH.fieldW;
  const fh = PITCH.fieldH;

  // Outer pitch apron
  ctx.fillStyle = '#0f3f24';
  ctx.fillRect(x - 65, y - 55, fw + 130, fh + 110);

  // Advertising hoardings / perimeter dark border
  ctx.strokeStyle = '#1e293b';
  ctx.lineWidth = 6;
  ctx.strokeRect(x - 42, y - 34, fw + 84, fh + 68);

  // Alternating mowed grass stripes (14 stripes)
  const stripeCount = 14;
  const stripeW = fw / stripeCount;
  for (let i = 0; i < stripeCount; i++) {
    ctx.fillStyle = i % 2 === 0 ? '#16653b' : '#1a7343';
    ctx.fillRect(x + i * stripeW, y, stripeW + 0.5, fh);
  }

  // Crisp chalk pitch markings
  ctx.strokeStyle = 'rgba(248, 250, 252, 0.88)';
  ctx.lineWidth = 3;

  // Touchlines & Goal lines
  ctx.strokeRect(x, y, fw, fh);

  // Halfway line & Center circle
  const cx = x + fw / 2;
  const cy = y + fh / 2;
  ctx.beginPath();
  ctx.moveTo(cx, y);
  ctx.lineTo(cx, y + fh);
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(cx, cy, PITCH.centerCircleR, 0, Math.PI * 2);
  ctx.stroke();

  ctx.fillStyle = '#f8fafc';
  ctx.beginPath();
  ctx.arc(cx, cy, 5, 0, Math.PI * 2);
  ctx.fill();

  // Left & Right Penalty Boxes
  const pbW = PITCH.penaltyBoxW;
  const pbH = PITCH.penaltyBoxH;
  const syW = PITCH.sixYardW;
  const syH = PITCH.sixYardH;

  ctx.strokeRect(x, cy - pbH / 2, pbW, pbH);
  ctx.strokeRect(x, cy - syH / 2, syW, syH);

  ctx.strokeRect(x + fw - pbW, cy - pbH / 2, pbW, pbH);
  ctx.strokeRect(x + fw - syW, cy - syH / 2, syW, syH);

  // Penalty spots
  const leftSpotX = x + PITCH.penaltySpotDist;
  const rightSpotX = x + fw - PITCH.penaltySpotDist;
  ctx.beginPath();
  ctx.arc(leftSpotX, cy, 4, 0, Math.PI * 2);
  ctx.arc(rightSpotX, cy, 4, 0, Math.PI * 2);
  ctx.fill();

  // Penalty D-arcs
  ctx.beginPath();
  ctx.arc(leftSpotX, cy, 102, -0.68, 0.68);
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(rightSpotX, cy, 102, Math.PI - 0.68, Math.PI + 0.68);
  ctx.stroke();

  // Corner arcs
  const cR = 22;
  ctx.beginPath();
  ctx.arc(x, y, cR, 0, Math.PI / 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(x + fw, y, cR, Math.PI / 2, Math.PI);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(x + fw, y + fh, cR, Math.PI, Math.PI * 1.5);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(x, y + fh, cR, Math.PI * 1.5, Math.PI * 2);
  ctx.stroke();
}

function drawGoalNets(ctx: CanvasRenderingContext2D, engine: GameEngine): void {
  const x = PITCH.marginX;
  const fw = PITCH.fieldW;
  const cy = PITCH.worldH / 2;
  const gh = PITCH.goalH;
  const gw = PITCH.goalW;
  const top = cy - gh / 2;

  const drawSingleGoal = (gx: number, isLeft: boolean, ripple: number) => {
    const bulge = Math.sin(ripple * Math.PI * 4) * ripple * 10;
    const outerX = isLeft ? gx - gw - Math.abs(bulge) : gx + gw + Math.abs(bulge);

    ctx.save();
    ctx.fillStyle = 'rgba(248, 250, 252, 0.08)';
    ctx.beginPath();
    ctx.moveTo(gx, top);
    ctx.lineTo(outerX, top + 6);
    ctx.lineTo(outerX, top + gh - 6);
    ctx.lineTo(gx, top + gh);
    ctx.closePath();
    ctx.fill();

    // Net mesh lines
    ctx.strokeStyle = 'rgba(226, 232, 240, 0.34)';
    ctx.lineWidth = 1;
    const steps = 10;
    for (let i = 1; i < steps; i++) {
      const yy = top + (gh * i) / steps;
      ctx.beginPath();
      ctx.moveTo(gx, yy);
      ctx.lineTo(outerX, yy);
      ctx.stroke();
    }

    // Frame posts & back bar
    ctx.strokeStyle = '#f8fafc';
    ctx.lineWidth = 3.5;
    ctx.beginPath();
    ctx.moveTo(gx, top);
    ctx.lineTo(outerX, top + 6);
    ctx.lineTo(outerX, top + gh - 6);
    ctx.lineTo(gx, top + gh);
    ctx.stroke();

    // Post caps
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(gx, top, 5.5, 0, Math.PI * 2);
    ctx.arc(gx, top + gh, 5.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  };

  drawSingleGoal(x, true, engine.netLeftRipple);
  drawSingleGoal(x + fw, false, engine.netRightRipple);
}

function drawPlayerSprite(
  ctx: CanvasRenderingContext2D,
  p: Player,
  isActive: boolean,
  engine: GameEngine,
): void {
  const r = PITCH.playerRadius;
  const isHome = p.team === 'HOME';
  const kitPrimary =
    p.role === 'GK'
      ? isHome
        ? '#eab308'
        : '#10b981'
      : isHome
        ? '#2563eb'
        : '#dc2626';
  const kitTrim = isHome ? '#eff6ff' : '#fef2f2';

  ctx.save();
  ctx.translate(p.x, p.y);

  // Active player selection ring & stamina arc
  if (isActive) {
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.32)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(0, 0, r + 8, 0, Math.PI * 2);
    ctx.stroke();

    const stamFrac = p.stamina / 100;
    ctx.strokeStyle = stamFrac > 0.3 ? '#38bdf8' : '#f97316';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(0, 0, r + 8, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * stamFrac);
    ctx.stroke();

    // Shot charge meter arc around active player when charging
    if (engine.isChargingShot) {
      const charge = engine.shotCharge;
      ctx.strokeStyle = charge > 0.85 ? '#ef4444' : charge > 0.45 ? '#22c55e' : '#facc15';
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.arc(0, 0, r + 14, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * charge);
      ctx.stroke();
    }

    // Crisp pointer chevron above active player
    ctx.fillStyle = '#facc15';
    ctx.beginPath();
    ctx.moveTo(0, -r - 13);
    ctx.lineTo(-5.5, -r - 21);
    ctx.lineTo(5.5, -r - 21);
    ctx.closePath();
    ctx.fill();
  }

  // Ground shadow
  ctx.fillStyle = 'rgba(0, 0, 0, 0.34)';
  ctx.beginPath();
  ctx.ellipse(2, 5, r * 0.95, r * 0.72, 0, 0, Math.PI * 2);
  ctx.fill();

  // Oriented athletic body
  ctx.save();
  ctx.rotate(p.facing);

  // Animated running stride cleats
  const spd = Math.hypot(p.vx, p.vy);
  const stride = spd > 18 ? Math.sin(p.stridePhase) * 6 : 0;
  const kickExt = p.kickAnimTimer > 0 ? Math.sin((p.kickAnimTimer / 0.24) * Math.PI) * 8 : 0;

  ctx.fillStyle = '#0f172a';
  ctx.beginPath();
  ctx.ellipse(stride + kickExt, -6, 5.5, 3, 0, 0, Math.PI * 2);
  ctx.ellipse(-stride, 6, 5.5, 3, 0, 0, Math.PI * 2);
  ctx.fill();

  // Goalkeeper gloves
  if (p.role === 'GK') {
    ctx.fillStyle = '#f8fafc';
    ctx.beginPath();
    ctx.arc(7, -r + 1, 3.8, 0, Math.PI * 2);
    ctx.arc(7, r - 1, 3.8, 0, Math.PI * 2);
    ctx.fill();
  }

  // Shoulders / Jersey torso
  ctx.fillStyle = kitPrimary;
  ctx.strokeStyle = p.stunTimer > 0 ? '#facc15' : kitTrim;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.ellipse(0, 0, r * 0.78, r * 0.98, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  // Head & hair orientation cue
  ctx.fillStyle = '#f1c27d';
  ctx.beginPath();
  ctx.arc(3, 0, 6.2, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = isHome ? '#1e293b' : '#292524';
  ctx.beginPath();
  ctx.arc(0.5, 0, 6.2, Math.PI * 0.55, Math.PI * 1.45);
  ctx.fill();

  ctx.restore();

  // Jersey number
  ctx.fillStyle = '#ffffff';
  ctx.font = '700 10px "JetBrains Mono", monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(String(p.number), -3, 1);

  ctx.restore();
}

function drawMatchBall(ctx: CanvasRenderingContext2D, engine: GameEngine): void {
  const b = engine.ball;
  const r = PITCH.ballRadius + b.z * 0.045;

  // Ground shadow scales slightly smaller with height
  ctx.save();
  ctx.fillStyle = 'rgba(0, 0, 0, 0.38)';
  ctx.beginPath();
  ctx.ellipse(
    b.x + 2 + b.z * 0.14,
    b.y + 4 + b.z * 0.14,
    PITCH.ballRadius * Math.max(0.55, 1 - b.z * 0.004),
    PITCH.ballRadius * 0.7 * Math.max(0.55, 1 - b.z * 0.004),
    0,
    0,
    Math.PI * 2,
  );
  ctx.fill();

  // Ball sphere shifted up visually by z
  const drawY = b.y - b.z * 0.45;
  ctx.translate(b.x, drawY);
  ctx.rotate(b.rotation);

  ctx.fillStyle = '#f8fafc';
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.fill();

  // Classic pentagon patches
  ctx.fillStyle = '#0f172a';
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.34, 0, Math.PI * 2);
  ctx.fill();
  for (let i = 0; i < 5; i++) {
    const a = (i * Math.PI * 2) / 5;
    ctx.beginPath();
    ctx.arc(Math.cos(a) * r * 0.72, Math.sin(a) * r * 0.72, r * 0.2, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.strokeStyle = 'rgba(15, 23, 42, 0.45)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.stroke();

  ctx.restore();
}

function drawTacticalRadar(
  ctx: CanvasRenderingContext2D,
  engine: GameEngine,
  w: number,
  h: number,
): void {
  const isCompact = w < 768;
  const rw = isCompact ? 124 : 196;
  const rh = isCompact ? 72 : 116;
  const rx = w / 2 - rw / 2;
  const ry = isCompact ? 56 : h - rh - 14;

  ctx.save();
  ctx.fillStyle = 'rgba(9, 20, 14, 0.78)';
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.16)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.roundRect(rx, ry, rw, rh, 6);
  ctx.fill();
  ctx.stroke();

  // Center line & circle
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.18)';
  ctx.beginPath();
  ctx.moveTo(rx + rw / 2, ry + 4);
  ctx.lineTo(rx + rw / 2, ry + rh - 4);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(rx + rw / 2, ry + rh / 2, 13, 0, Math.PI * 2);
  ctx.stroke();

  const pad = 6;
  for (const p of engine.players) {
    const nx = (p.x - PITCH.marginX) / PITCH.fieldW;
    const ny = (p.y - PITCH.marginY) / PITCH.fieldH;
    const px = rx + pad + nx * (rw - pad * 2);
    const py = ry + pad + ny * (rh - pad * 2);
    ctx.fillStyle = p.team === 'HOME' ? '#3b82f6' : '#ef4444';
    ctx.beginPath();
    ctx.arc(px, py, p.id === engine.activePlayerId ? 3.8 : 2.6, 0, Math.PI * 2);
    ctx.fill();
    if (p.id === engine.activePlayerId) {
      ctx.strokeStyle = '#facc15';
      ctx.lineWidth = 1.2;
      ctx.stroke();
    }
  }

  // Ball dot
  const bnx = (engine.ball.x - PITCH.marginX) / PITCH.fieldW;
  const bny = (engine.ball.y - PITCH.marginY) / PITCH.fieldH;
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.arc(
    rx + pad + bnx * (rw - pad * 2),
    ry + pad + bny * (rh - pad * 2),
    3,
    0,
    Math.PI * 2,
  );
  ctx.fill();
  ctx.restore();
}

// =============================================================================
// PENALTY SHOOTOUT GOAL-FACING ARENA RENDERER
// =============================================================================

function renderPenaltyArena(
  ctx: CanvasRenderingContext2D,
  engine: GameEngine,
  w: number,
  h: number,
): void {
  const p: PenaltyState = engine.penalty;
  const shakeX =
    engine.shakeAmount > 0.1 ? (Math.random() - 0.5) * engine.shakeAmount * 2 : 0;
  const shakeY =
    engine.shakeAmount > 0.1 ? (Math.random() - 0.5) * engine.shakeAmount * 2 : 0;

  ctx.save();
  ctx.translate(shakeX, shakeY);

  const bounds = getPenaltyGoalBounds(w, h);
  const { goalLeft, goalRight, goalTop, goalBottom } = bounds;
  const goalW = goalRight - goalLeft;
  const goalH = goalBottom - goalTop;
  const horizonY = goalBottom - 16;

  // 1. Night stadium backdrop
  const skyGrad = ctx.createLinearGradient(0, 0, 0, horizonY);
  skyGrad.addColorStop(0, '#070d16');
  skyGrad.addColorStop(1, '#122230');
  ctx.fillStyle = skyGrad;
  ctx.fillRect(0, 0, w, horizonY);

  // Crowd stands silhouette & subtle stadium lights
  ctx.fillStyle = '#0c1622';
  ctx.fillRect(0, horizonY - 120, w, 120);
  // Subtle terraced stand lines
  ctx.strokeStyle = 'rgba(255,255,255,0.05)';
  ctx.lineWidth = 1;
  for (let row = 0; row < 6; row++) {
    const ry = horizonY - 16 - row * 17;
    ctx.beginPath();
    ctx.moveTo(0, ry);
    ctx.lineTo(w, ry);
    ctx.stroke();
  }

  // Stadium floodlight towers
  const drawFloodlight = (lx: number, ly: number) => {
    const glow = ctx.createRadialGradient(lx, ly, 4, lx, ly, 160);
    glow.addColorStop(0, 'rgba(241, 245, 249, 0.35)');
    glow.addColorStop(1, 'rgba(241, 245, 249, 0)');
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(lx, ly, 160, 0, Math.PI * 2);
    ctx.fill();
  };
  drawFloodlight(w * 0.18, h * 0.12);
  drawFloodlight(w * 0.82, h * 0.12);

  // Perimeter LED ad board
  ctx.fillStyle = '#0f172a';
  ctx.fillRect(0, horizonY - 18, w, 18);
  ctx.fillStyle = '#1d4ed8';
  ctx.fillRect(w * 0.12, horizonY - 14, w * 0.24, 10);
  ctx.fillStyle = '#b91c1c';
  ctx.fillRect(w * 0.64, horizonY - 14, w * 0.24, 10);

  // 2. Perspective turf pitch from penalty spot to goal line
  const turfGrad = ctx.createLinearGradient(0, horizonY, 0, h);
  turfGrad.addColorStop(0, '#135733');
  turfGrad.addColorStop(1, '#1a7545');
  ctx.fillStyle = turfGrad;
  ctx.fillRect(0, horizonY, w, h - horizonY);

  // Perspective mowed stripes
  ctx.fillStyle = 'rgba(255, 255, 255, 0.035)';
  for (let i = -5; i <= 5; i += 2) {
    const topX1 = w / 2 + i * (goalW * 0.16);
    const topX2 = w / 2 + (i + 1) * (goalW * 0.16);
    const botX1 = w / 2 + i * (goalW * 0.36);
    const botX2 = w / 2 + (i + 1) * (goalW * 0.36);
    ctx.beginPath();
    ctx.moveTo(topX1, horizonY);
    ctx.lineTo(topX2, horizonY);
    ctx.lineTo(botX2, h);
    ctx.lineTo(botX1, h);
    ctx.closePath();
    ctx.fill();
  }

  // Crisp chalk goal line, 6-yard box, 18-yard box & penalty spot
  ctx.strokeStyle = 'rgba(248, 250, 252, 0.85)';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(0, goalBottom);
  ctx.lineTo(w, goalBottom);
  ctx.stroke();

  // Perspective 6-yard box
  ctx.beginPath();
  ctx.moveTo(goalLeft - goalW * 0.22, goalBottom);
  ctx.lineTo(goalLeft - goalW * 0.36, goalBottom + (h - goalBottom) * 0.26);
  ctx.lineTo(goalRight + goalW * 0.36, goalBottom + (h - goalBottom) * 0.26);
  ctx.lineTo(goalRight + goalW * 0.22, goalBottom);
  ctx.stroke();

  const spotX = w / 2;
  const spotY = h * 0.81;
  ctx.fillStyle = '#f8fafc';
  ctx.beginPath();
  ctx.ellipse(spotX, spotY, 8, 3.5, 0, 0, Math.PI * 2);
  ctx.fill();

  // 3. Goal Net (with dynamic ripple on impact)
  drawPenaltyGoalAndNet(ctx, bounds, p);

  // 4. Interactive Keeper Save Zones hint when defending
  if (p.turn === 'AWAY' && (p.phase === 'KEEPER_WAIT' || p.phase === 'KEEPER_FLIGHT')) {
    ctx.save();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)';
    ctx.setLineDash([6, 6]);
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(goalLeft + goalW * 0.33, goalTop + 8);
    ctx.lineTo(goalLeft + goalW * 0.33, goalBottom - 8);
    ctx.moveTo(goalLeft + goalW * 0.67, goalTop + 8);
    ctx.lineTo(goalLeft + goalW * 0.67, goalBottom - 8);
    ctx.stroke();
    ctx.restore();
  }

  // 5. Goalkeeper sprite on goal line
  drawPenaltyKeeper(ctx, bounds, p);

  // 6. Aim Reticle & Power Gauge when player is shooting
  if (p.turn === 'HOME' && (p.phase === 'AIMING' || p.phase === 'CHARGING')) {
    const ax = w / 2 + p.aimX * (goalW / 2);
    const ay = goalBottom - p.aimY * goalH;

    ctx.save();
    // Subtle target ring
    const isDanger = p.phase === 'CHARGING' && p.power > 0.85;
    ctx.strokeStyle = isDanger ? '#ef4444' : '#facc15';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.arc(ax, ay, 18, 0, Math.PI * 2);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(ax - 24, ay);
    ctx.lineTo(ax - 10, ay);
    ctx.moveTo(ax + 10, ay);
    ctx.lineTo(ax + 24, ay);
    ctx.moveTo(ax, ay - 24);
    ctx.lineTo(ax, ay - 10);
    ctx.moveTo(ax, ay + 10);
    ctx.lineTo(ax, ay + 24);
    ctx.stroke();

    // Vertical Sweet-Spot Power Meter right beside the ball
    if (p.phase === 'CHARGING') {
      const barX = spotX + 54;
      const barY = spotY - 120;
      const barW = 14;
      const barH = 110;

      ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
      ctx.strokeStyle = 'rgba(255,255,255,0.28)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.roundRect(barX, barY, barW, barH, 4);
      ctx.fill();
      ctx.stroke();

      // Sweet spot zone highlight (48%..84%)
      ctx.fillStyle = 'rgba(34, 197, 94, 0.25)';
      ctx.fillRect(barX + 2, barY + barH * 0.16, barW - 4, barH * 0.36);

      const fillH = barH * p.power;
      ctx.fillStyle = p.power > 0.84 ? '#ef4444' : p.power > 0.48 ? '#22c55e' : '#facc15';
      ctx.fillRect(barX + 2, barY + barH - fillH, barW - 4, fillH);
    }
    ctx.restore();
  }

  // 7. Ball & Trail
  drawPenaltyBall(ctx, bounds, spotX, spotY, p);

  // 8. Kicker silhouette approaching spot
  drawPenaltyKicker(ctx, spotX, spotY, p);

  // 9. Pooled confetti / save sparks
  for (const pt of engine.particles) {
    if (!pt.active) continue;
    ctx.save();
    ctx.globalAlpha = pt.alpha;
    ctx.fillStyle = pt.color;
    const sx = (pt.x / 1700) * w;
    const sy = (pt.y / 1060) * h;
    ctx.beginPath();
    ctx.arc(sx, sy, pt.size, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  ctx.restore();
}

function drawPenaltyGoalAndNet(
  ctx: CanvasRenderingContext2D,
  bounds: PenaltyGoalBounds,
  p: PenaltyState,
): void {
  const { goalLeft, goalRight, goalTop, goalBottom } = bounds;
  const goalW = goalRight - goalLeft;
  const goalH = goalBottom - goalTop;
  const depthInsetX = goalW * 0.065;
  const depthInsetY = goalH * 0.14;

  // Back frame coordinates
  const backL = goalLeft + depthInsetX;
  const backR = goalRight - depthInsetX;
  const backT = goalTop + depthInsetY;
  const backB = goalBottom - depthInsetY * 0.5;

  ctx.save();
  // Net backing tint
  ctx.fillStyle = 'rgba(15, 23, 42, 0.36)';
  ctx.fillRect(goalLeft, goalTop, goalW, goalH);

  // Net grid with ripple deformation
  ctx.strokeStyle = 'rgba(248, 250, 252, 0.26)';
  ctx.lineWidth = 1;
  const cols = 20;
  const rows = 8;
  const ripplePx = p.netRippleStrength * 14;
  const rcx = backL + (p.netRippleX * 0.5 + 0.5) * (backR - backL);
  const rcy = backB - p.netRippleY * (backB - backT);

  for (let c = 0; c <= cols; c++) {
    const t = c / cols;
    const x1 = goalLeft + t * goalW;
    const x2 = backL + t * (backR - backL);
    const dist = Math.hypot(x2 - rcx, (backT + backB) * 0.5 - rcy);
    const disp = ripplePx * Math.exp(-dist / 90);
    ctx.beginPath();
    ctx.moveTo(x1, goalTop);
    ctx.quadraticCurveTo(x2 + disp * 0.5, (backT + backB) / 2, x2, backB);
    ctx.stroke();
  }

  for (let r = 0; r <= rows; r++) {
    const t = r / rows;
    const y1 = backT + t * (backB - backT);
    const disp = ripplePx * Math.exp(-Math.abs(y1 - rcy) / 60);
    ctx.beginPath();
    ctx.moveTo(backL, y1);
    ctx.quadraticCurveTo(rcx, y1 - disp, backR, y1);
    ctx.stroke();
  }

  // Side net diagonals
  ctx.strokeStyle = 'rgba(248, 250, 252, 0.22)';
  ctx.beginPath();
  ctx.moveTo(goalLeft, goalTop);
  ctx.lineTo(backL, backT);
  ctx.moveTo(goalRight, goalTop);
  ctx.lineTo(backR, backT);
  ctx.moveTo(goalLeft, goalBottom);
  ctx.lineTo(backL, backB);
  ctx.moveTo(goalRight, goalBottom);
  ctx.lineTo(backR, backB);
  ctx.stroke();

  // Crisp white posts and crossbar
  ctx.strokeStyle = '#f8fafc';
  ctx.lineWidth = 8;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.moveTo(goalLeft, goalBottom);
  ctx.lineTo(goalLeft, goalTop);
  ctx.lineTo(goalRight, goalTop);
  ctx.lineTo(goalRight, goalBottom);
  ctx.stroke();
  ctx.restore();
}

function drawPenaltyKeeper(
  ctx: CanvasRenderingContext2D,
  bounds: PenaltyGoalBounds,
  p: PenaltyState,
): void {
  const { goalLeft, goalRight, goalTop, goalBottom } = bounds;
  const goalW = goalRight - goalLeft;
  const goalH = goalBottom - goalTop;

  const kx = (goalLeft + goalRight) / 2 + p.keeperCurrX * (goalW * 0.45);
  const ky = goalBottom - p.keeperCurrY * (goalH * 0.78);
  const isHomeKeeper = p.turn === 'AWAY';
  const kitColor = isHomeKeeper ? '#eab308' : '#10b981';

  // Dive tilt angle based on horizontal offset
  const tilt = p.keeperCurrX * 1.15;

  ctx.save();
  // Ground shadow
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.beginPath();
  ctx.ellipse(kx, goalBottom + 4, 24, 7, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.translate(kx, ky);
  ctx.rotate(tilt);

  // Legs
  ctx.strokeStyle = '#0f172a';
  ctx.lineWidth = 7;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(-7, 16);
  ctx.lineTo(-10, 40);
  ctx.moveTo(7, 16);
  ctx.lineTo(10, 40);
  ctx.stroke();

  // Torso
  ctx.fillStyle = kitColor;
  ctx.strokeStyle = '#f8fafc';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.roundRect(-14, -14, 28, 34, 6);
  ctx.fill();
  ctx.stroke();

  // Outstretched arms + gloves
  const armReach = Math.abs(p.keeperCurrX) > 0.25 ? 36 : 26;
  ctx.strokeStyle = kitColor;
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.moveTo(-12, -8);
  ctx.lineTo(-armReach, -18);
  ctx.moveTo(12, -8);
  ctx.lineTo(armReach, -18);
  ctx.stroke();

  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.arc(-armReach, -18, 6, 0, Math.PI * 2);
  ctx.arc(armReach, -18, 6, 0, Math.PI * 2);
  ctx.fill();

  // Head
  ctx.fillStyle = '#f1c27d';
  ctx.beginPath();
  ctx.arc(0, -24, 9.5, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}

function drawPenaltyBall(
  ctx: CanvasRenderingContext2D,
  bounds: PenaltyGoalBounds,
  spotX: number,
  spotY: number,
  p: PenaltyState,
): void {
  const { goalLeft, goalRight, goalTop, goalBottom } = bounds;
  const goalW = goalRight - goalLeft;
  const goalH = goalBottom - goalTop;

  const project = (nx: number, ny: number, nz: number) => {
    const targetX = (goalLeft + goalRight) / 2 + nx * (goalW / 2);
    const groundY = spotY + (goalBottom - spotY) * ny;
    const scale = 1 - ny * 0.45;
    const drawY = groundY - nz * goalH * (0.55 + ny * 0.45);
    return { x: spotX + (targetX - spotX) * ny, groundY, drawY, scale };
  };

  // Trail
  if (p.ballTrail.length > 1) {
    ctx.save();
    for (let i = 0; i < p.ballTrail.length; i++) {
      const pt = p.ballTrail[i];
      const pos = project(pt.x, pt.y, pt.z);
      const alpha = ((i + 1) / p.ballTrail.length) * 0.28;
      ctx.fillStyle = `rgba(255, 255, 255, ${alpha})`;
      ctx.beginPath();
      ctx.arc(pos.x, pos.drawY, 13 * pos.scale * ((i + 1) / p.ballTrail.length), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  const cur = project(p.ballCurrX, p.ballCurrY, p.ballCurrZ);
  const r = 15 * cur.scale;

  ctx.save();
  // Ground shadow
  ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
  ctx.beginPath();
  ctx.ellipse(cur.x, cur.groundY + 3, r * 0.95, r * 0.45, 0, 0, Math.PI * 2);
  ctx.fill();

  // Ball
  ctx.translate(cur.x, cur.drawY);
  ctx.rotate(p.ballProgress * 14);
  ctx.fillStyle = '#f8fafc';
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = '#0f172a';
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.35, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawPenaltyKicker(
  ctx: CanvasRenderingContext2D,
  spotX: number,
  spotY: number,
  p: PenaltyState,
): void {
  const isHomeKicker = p.turn === 'HOME';
  const kitColor = isHomeKicker ? '#2563eb' : '#dc2626';
  const prog = p.phase === 'RUNUP' ? p.kickerProgress : p.phase === 'FLIGHT' || p.phase === 'KEEPER_FLIGHT' || p.phase === 'RESULT' ? 1 : 0;

  // Kicker starts slightly left-back of the ball and steps forward to strike
  const kx = spotX - 42 + prog * 28;
  const ky = spotY + 72 - prog * 54;
  const scale = 1.35 - prog * 0.1;

  // Telegraph lean during AI windup
  const cueOffset =
    p.turn === 'AWAY' && p.phase === 'KEEPER_WAIT'
      ? Math.sin((p.aiWaitTimer / p.aiWaitDuration) * Math.PI) * p.aiCueX * 10
      : 0;

  ctx.save();
  ctx.translate(kx + cueOffset, ky);
  ctx.scale(scale, scale);

  // Shadow
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.beginPath();
  ctx.ellipse(0, 12, 16, 6, 0, 0, Math.PI * 2);
  ctx.fill();

  // Legs
  const stride = p.phase === 'RUNUP' ? Math.sin(prog * Math.PI * 5) * 6 : 0;
  ctx.strokeStyle = '#0f172a';
  ctx.lineWidth = 6;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(-6, 4);
  ctx.lineTo(-7, 22 + stride);
  ctx.moveTo(6, 4);
  ctx.lineTo(8, 22 - stride);
  ctx.stroke();

  // Jersey back facing camera
  ctx.fillStyle = kitColor;
  ctx.strokeStyle = '#f8fafc';
  ctx.lineWidth = 1.8;
  ctx.beginPath();
  ctx.roundRect(-14, -22, 28, 30, 6);
  ctx.fill();
  ctx.stroke();

  // Jersey #9 / #10
  ctx.fillStyle = '#ffffff';
  ctx.font = '700 12px "JetBrains Mono", monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(isHomeKicker ? '9' : '10', 0, -6);

  // Head
  ctx.fillStyle = '#1e293b';
  ctx.beginPath();
  ctx.arc(0, -30, 8.5, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}

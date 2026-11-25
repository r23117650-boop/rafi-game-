import { soundEngine } from './audio';
import type { Difficulty, InputState, KickOutcome, PenaltyState, TeamSide } from './types';

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

export function createPenaltyState(): PenaltyState {
  return {
    phase: 'AIMING',
    turn: 'HOME',
    round: 1,
    suddenDeath: false,
    homeKicks: [null, null, null, null, null],
    awayKicks: [null, null, null, null, null],
    homeScore: 0,
    awayScore: 0,
    winner: null,
    aimX: 0.48,
    aimY: 0.35,
    power: 0,
    powerDir: 1,
    keeperTargetX: 0,
    keeperTargetY: 0.35,
    keeperCurrX: 0,
    keeperCurrY: 0.32,
    keeperDiveCommitted: false,
    aiWaitTimer: 0,
    aiWaitDuration: 1.2,
    aiCueX: 0,
    kickerProgress: 0,
    ballProgress: 0,
    shotStartX: 0,
    shotStartY: 0,
    shotEndX: 0,
    shotEndY: 0.3,
    shotCurve: 0,
    shotPeakZ: 0.3,
    ballCurrX: 0,
    ballCurrY: 0,
    ballCurrZ: 0,
    ballTrail: [],
    netRippleX: 0,
    netRippleY: 0.5,
    netRippleStrength: 0,
    resultTimer: 0,
    resultBanner: '',
    resultSub: '',
  };
}

function checkWinner(p: PenaltyState): TeamSide | null {
  const homeTaken = p.homeKicks.filter((k) => k !== null).length;
  const awayTaken = p.awayKicks.filter((k) => k !== null).length;

  if (!p.suddenDeath && homeTaken <= 5 && awayTaken <= 5) {
    const homeRem = 5 - homeTaken;
    const awayRem = 5 - awayTaken;
    if (p.homeScore > p.awayScore + awayRem) return 'HOME';
    if (p.awayScore > p.homeScore + homeRem) return 'AWAY';
    if (homeTaken === 5 && awayTaken === 5) {
      if (p.homeScore > p.awayScore) return 'HOME';
      if (p.awayScore > p.homeScore) return 'AWAY';
      // Tied after 5 kicks -> Sudden Death!
      p.suddenDeath = true;
      p.homeKicks.push(null);
      p.awayKicks.push(null);
    }
    return null;
  }

  // Sudden death: both teams must take equal number of kicks in the round
  if (homeTaken === awayTaken) {
    if (p.homeScore > p.awayScore) return 'HOME';
    if (p.awayScore > p.homeScore) return 'AWAY';
    p.homeKicks.push(null);
    p.awayKicks.push(null);
  }
  return null;
}

function prepareNextKick(p: PenaltyState): void {
  const winner = checkWinner(p);
  if (winner) {
    p.winner = winner;
    p.phase = 'FINISHED';
    p.resultBanner = winner === 'HOME' ? 'VICTORY ON PENALTIES' : 'SHOOTOUT DEFEAT';
    p.resultSub = `${p.homeScore} – ${p.awayScore} FINAL`;
    soundEngine.playWhistle('long');
    if (winner === 'HOME') {
      soundEngine.playCrowdGoal();
    }
    return;
  }

  // Switch turns
  if (p.turn === 'HOME') {
    p.turn = 'AWAY';
    p.phase = 'KEEPER_WAIT';
    p.aiWaitTimer = 0;
    p.aiWaitDuration = 1.05 + Math.random() * 0.55;
    // AI chooses target
    const cornerSign = Math.random() < 0.5 ? -1 : 1;
    const isCenter = Math.random() < 0.16;
    p.aiCueX = isCenter ? (Math.random() - 0.5) * 0.18 : cornerSign * (0.55 + Math.random() * 0.34);
    p.aimX = p.aiCueX;
    p.aimY = 0.15 + Math.random() * 0.65;
    p.keeperTargetX = 0;
    p.keeperTargetY = 0.32;
    p.keeperCurrX = 0;
    p.keeperCurrY = 0.32;
    p.keeperDiveCommitted = false;
  } else {
    p.turn = 'HOME';
    p.round += 1;
    p.phase = 'AIMING';
    p.power = 0;
    p.powerDir = 1;
    p.keeperTargetX = 0;
    p.keeperTargetY = 0.32;
    p.keeperCurrX = 0;
    p.keeperCurrY = 0.32;
    p.keeperDiveCommitted = false;
  }

  p.kickerProgress = 0;
  p.ballProgress = 0;
  p.ballCurrX = 0;
  p.ballCurrY = 0;
  p.ballCurrZ = 0;
  p.ballTrail = [];
  p.resultBanner = '';
  p.resultSub = '';
}

function recordOutcome(
  p: PenaltyState,
  outcome: Exclude<KickOutcome, null>,
  onBurst: (kind: 'confetti' | 'spark', x: number, y: number, color: string) => void,
  onShake: (amt: number) => void,
): void {
  const idx = p.round - 1;
  if (p.turn === 'HOME') {
    p.homeKicks[idx] = outcome;
    if (outcome === 'GOAL') p.homeScore += 1;
  } else {
    p.awayKicks[idx] = outcome;
    if (outcome === 'GOAL') p.awayScore += 1;
  }

  if (outcome === 'GOAL') {
    p.resultBanner = 'GOAL!';
    p.resultSub = p.turn === 'HOME' ? 'Clinical finish' : 'Unstoppable strike';
    soundEngine.playNetSwish();
    soundEngine.playCrowdGoal();
    onShake(7);
    onBurst('confetti', p.shotEndX, p.shotEndY, p.turn === 'HOME' ? '#3b82f6' : '#ef4444');
  } else if (outcome === 'SAVE') {
    p.resultBanner = 'SAVED!';
    p.resultSub = p.turn === 'AWAY' ? 'Brilliant stop by the keeper' : 'Keeper guessed right';
    soundEngine.playSave();
    if (p.turn === 'AWAY') soundEngine.playCrowdGoal();
    onShake(5);
    onBurst('spark', p.shotEndX, p.shotEndY, '#facc15');
  } else {
    p.resultBanner = Math.abs(p.shotEndX) > 0.96 && Math.abs(p.shotEndX) < 1.07 && p.shotEndY <= 1.04
      ? 'OFF THE WOODWORK!'
      : 'OFF TARGET!';
    p.resultSub = p.shotEndY > 1.0 ? 'Over the crossbar' : 'Wide of the post';
    if (Math.abs(p.shotEndX) > 0.96 && Math.abs(p.shotEndX) < 1.07 && p.shotEndY <= 1.04) {
      soundEngine.playPostHit();
      onShake(8);
    }
  }

  p.phase = 'RESULT';
  p.resultTimer = 1.45;
}

export function updatePenaltyState(
  p: PenaltyState,
  dt: number,
  input: InputState,
  difficulty: Difficulty,
  onBurst: (kind: 'confetti' | 'spark', x: number, y: number, color: string) => void,
  onShake: (amt: number) => void,
): void {
  // Decay net ripple
  p.netRippleStrength = Math.max(0, p.netRippleStrength - dt * 2.4);

  if (p.phase === 'FINISHED') return;

  if (p.phase === 'RESULT') {
    p.resultTimer -= dt;
    if (p.resultTimer <= 0) {
      prepareNextKick(p);
    }
    return;
  }

  // PLAYER TAKING PENALTY (HOME TURN)
  if (p.turn === 'HOME') {
    if (p.phase === 'AIMING' || p.phase === 'CHARGING') {
      // Smooth keyboard aiming
      const aimSpeed = 1.55;
      if (input.left) p.aimX -= aimSpeed * dt;
      if (input.right) p.aimX += aimSpeed * dt;
      if (input.up) p.aimY += aimSpeed * dt;
      if (input.down) p.aimY -= aimSpeed * dt;

      // Mouse aiming inside penalty goal viewport
      if (input.mouseActive && p.phase === 'AIMING') {
        p.aimX += (input.mouseNormX - p.aimX) * Math.min(1, dt * 16);
        p.aimY += (input.mouseNormY - p.aimY) * Math.min(1, dt * 16);
      }

      p.aimX = clamp(p.aimX, -1.16, 1.16);
      p.aimY = clamp(p.aimY, 0.05, 1.18);

      const triggerDown = input.shootJustPressed || input.mouseJustPressed;
      const triggerHeld = input.shootHeld || input.mouseDown;
      const triggerUp = input.shootJustReleased || input.mouseJustReleased;

      if (p.phase === 'AIMING' && triggerDown) {
        p.phase = 'CHARGING';
        p.power = 0.12;
        p.powerDir = 1;
      } else if (p.phase === 'CHARGING') {
        p.power += p.powerDir * dt * 1.45;
        if (p.power >= 1) {
          p.power = 1;
          p.powerDir = -1;
        } else if (p.power <= 0.1) {
          p.power = 0.1;
          p.powerDir = 1;
        }

        if (triggerUp || !triggerHeld) {
          // Lock shot & start runup
          p.phase = 'RUNUP';
          p.kickerProgress = 0;

          // AI Keeper picks dive zone based on difficulty
          const readChance =
            difficulty === 'WORLD_CLASS' ? 0.44 : difficulty === 'PRO' ? 0.3 : 0.18;
          if (Math.random() < readChance) {
            p.keeperTargetX = clamp(p.aimX * 0.85, -0.88, 0.88);
            p.keeperTargetY = clamp(p.aimY * 0.82, 0.14, 0.78);
          } else {
            const zones = [-0.78, -0.35, 0, 0.35, 0.78];
            p.keeperTargetX = zones[Math.floor(Math.random() * zones.length)];
            p.keeperTargetY = 0.18 + Math.random() * 0.55;
          }

          // Compute final shot target with overcharge variance
          const overcharge = Math.max(0, p.power - 0.84) / 0.16; // 0..1
          const scatterX = (Math.random() - 0.5) * (0.06 + overcharge * 0.28);
          const scatterY = (Math.random() - 0.5) * (0.04 + overcharge * 0.22) + overcharge * 0.16;

          p.shotStartX = 0;
          p.shotStartY = 0;
          p.shotEndX = clamp(p.aimX + scatterX, -1.28, 1.28);
          p.shotEndY = clamp(p.aimY + scatterY, 0.05, 1.32);
          p.shotCurve = -p.aimX * (0.14 + p.power * 0.12);
          p.shotPeakZ = 0.25 + p.power * 0.4;
          p.ballProgress = 0;
          p.ballTrail = [];
        }
      }
      return;
    }

    if (p.phase === 'RUNUP') {
      p.kickerProgress += dt * 2.4;
      if (p.kickerProgress >= 1) {
        p.kickerProgress = 1;
        p.phase = 'FLIGHT';
        soundEngine.playKick(p.power);
        onShake(3.5 * p.power);
      }
      return;
    }

    if (p.phase === 'FLIGHT') {
      const flightSpeed = 1.65 + p.power * 1.15;
      p.ballProgress = Math.min(1, p.ballProgress + dt * flightSpeed);
      const t = p.ballProgress;

      // Keeper dives smoothly once ball is struck
      const keeperLerp = Math.min(1, dt * 6.5);
      p.keeperCurrX += (p.keeperTargetX - p.keeperCurrX) * keeperLerp;
      p.keeperCurrY += (p.keeperTargetY - p.keeperCurrY) * keeperLerp;

      // Quadratic Bezier curve for ball lateral + height
      const inv = 1 - t;
      const midX = p.shotEndX * 0.5 + p.shotCurve;
      p.ballCurrX = 2 * inv * t * midX + t * t * p.shotEndX;
      p.ballCurrY = t; // 0 = spot, 1 = goal line
      const arcLift = Math.sin(t * Math.PI) * 0.16 * (1 - p.power * 0.5);
      p.ballCurrZ = t * p.shotEndY + arcLift;

      p.ballTrail.push({ x: p.ballCurrX, y: p.ballCurrY, z: p.ballCurrZ });
      if (p.ballTrail.length > 14) p.ballTrail.shift();

      if (p.ballProgress >= 1) {
        resolveShotAtLine(p, onBurst, onShake);
      }
      return;
    }
  }

  // PLAYER DEFENDING AS GOALKEEPER (AWAY TURN)
  if (p.turn === 'AWAY') {
    if (p.phase === 'KEEPER_WAIT') {
      // Allow player to pick dive direction via WASD/Arrows or click on goal
      let diveChosen = false;
      let tx = p.keeperTargetX;
      let ty = p.keeperTargetY;

      if (input.left) {
        tx = -0.82;
        diveChosen = true;
      } else if (input.right) {
        tx = 0.82;
        diveChosen = true;
      }
      if (input.up) {
        ty = 0.72;
        diveChosen = true;
      } else if (input.down) {
        ty = 0.16;
        diveChosen = true;
      }

      if (input.mouseJustPressed && input.mouseActive) {
        tx = clamp(input.mouseNormX, -0.92, 0.92);
        ty = clamp(input.mouseNormY, 0.14, 0.85);
        diveChosen = true;
      }

      if (diveChosen) {
        p.keeperTargetX = tx;
        p.keeperTargetY = ty;
        p.keeperDiveCommitted = true;
      }

      p.aiWaitTimer += dt;
      if (p.aiWaitTimer >= p.aiWaitDuration) {
        p.phase = 'KEEPER_FLIGHT';
        p.kickerProgress = 1;
        p.ballProgress = 0;
        p.ballTrail = [];

        const aiMissChance =
          difficulty === 'AMATEUR' ? 0.18 : difficulty === 'PRO' ? 0.09 : 0.04;
        const misses = Math.random() < aiMissChance;
        p.shotStartX = 0;
        p.shotStartY = 0;
        if (misses) {
          p.shotEndX = (Math.random() < 0.5 ? -1 : 1) * (1.06 + Math.random() * 0.14);
          p.shotEndY = 0.35 + Math.random() * 0.78;
        } else {
          p.shotEndX = clamp(p.aiCueX + (Math.random() - 0.5) * 0.14, -0.91, 0.91);
          p.shotEndY = clamp(p.aimY, 0.12, 0.86);
        }
        p.power = difficulty === 'WORLD_CLASS' ? 0.82 : difficulty === 'PRO' ? 0.68 : 0.54;
        p.shotCurve = -p.shotEndX * 0.18;
        soundEngine.playKick(p.power);
      }
      return;
    }

    if (p.phase === 'KEEPER_FLIGHT') {
      // Late reaction dive still allowed in first 45% of ball flight!
      if (!p.keeperDiveCommitted || p.ballProgress < 0.45) {
        if (input.left) {
          p.keeperTargetX = -0.82;
          p.keeperDiveCommitted = true;
        } else if (input.right) {
          p.keeperTargetX = 0.82;
          p.keeperDiveCommitted = true;
        }
        if (input.up) {
          p.keeperTargetY = 0.72;
          p.keeperDiveCommitted = true;
        } else if (input.down) {
          p.keeperTargetY = 0.16;
          p.keeperDiveCommitted = true;
        }
        if (input.mouseJustPressed && input.mouseActive) {
          p.keeperTargetX = clamp(input.mouseNormX, -0.92, 0.92);
          p.keeperTargetY = clamp(input.mouseNormY, 0.14, 0.85);
          p.keeperDiveCommitted = true;
        }
      }

      const flightSpeed = 1.35 + p.power * 0.9;
      p.ballProgress = Math.min(1, p.ballProgress + dt * flightSpeed);
      const t = p.ballProgress;

      if (p.keeperDiveCommitted) {
        const keeperLerp = Math.min(1, dt * 8.2);
        p.keeperCurrX += (p.keeperTargetX - p.keeperCurrX) * keeperLerp;
        p.keeperCurrY += (p.keeperTargetY - p.keeperCurrY) * keeperLerp;
      }

      const inv = 1 - t;
      const midX = p.shotEndX * 0.5 + p.shotCurve;
      p.ballCurrX = 2 * inv * t * midX + t * t * p.shotEndX;
      p.ballCurrY = t;
      const arcLift = Math.sin(t * Math.PI) * 0.14;
      p.ballCurrZ = t * p.shotEndY + arcLift;

      p.ballTrail.push({ x: p.ballCurrX, y: p.ballCurrY, z: p.ballCurrZ });
      if (p.ballTrail.length > 14) p.ballTrail.shift();

      if (p.ballProgress >= 1) {
        resolveShotAtLine(p, onBurst, onShake);
      }
    }
  }
}

function resolveShotAtLine(
  p: PenaltyState,
  onBurst: (kind: 'confetti' | 'spark', x: number, y: number, color: string) => void,
  onShake: (amt: number) => void,
): void {
  const bx = p.shotEndX;
  const by = p.shotEndY;

  const insidePosts = Math.abs(bx) < 0.96 && by <= 0.96 && by >= 0.02;

  if (!insidePosts) {
    recordOutcome(p, 'MISS', onBurst, onShake);
    return;
  }

  // Check keeper reach
  const dx = Math.abs(bx - p.keeperCurrX);
  const dy = Math.abs(by - p.keeperCurrY);
  const reachX = p.turn === 'AWAY' ? 0.34 : 0.28;
  const reachY = p.turn === 'AWAY' ? 0.36 : 0.32;
  const dist = Math.hypot(dx / reachX, dy / reachY);

  // Sweet spot power makes corners harder to save
  const powerBonus = p.power > 0.52 && p.power < 0.86 ? 0.16 : 0;

  if (dist < 1.0 - powerBonus) {
    recordOutcome(p, 'SAVE', onBurst, onShake);
    return;
  }

  p.netRippleX = bx;
  p.netRippleY = by;
  p.netRippleStrength = 1;
  recordOutcome(p, 'GOAL', onBurst, onShake);
}

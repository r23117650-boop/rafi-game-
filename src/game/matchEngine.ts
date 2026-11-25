import { soundEngine } from './audio';
import { createTeamPlayers, PITCH } from './formations';
import { createPenaltyState, updatePenaltyState } from './penaltyEngine';
import type {
  Ball,
  Difficulty,
  FormationId,
  GameMode,
  HudSnapshot,
  InputState,
  MatchStats,
  Particle,
  PenaltyState,
  Player,
  ScreenState,
  TeamSide,
} from './types';

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

function lerpAngle(a: number, b: number, t: number): number {
  let diff = ((b - a + Math.PI) % (Math.PI * 2)) - Math.PI;
  if (diff < -Math.PI) diff += Math.PI * 2;
  return a + diff * t;
}

export class GameEngine {
  public screen: ScreenState = 'TITLE';
  public mode: GameMode = 'MATCH';
  public formation: FormationId = '4-3-3';
  public awayFormation: FormationId = '4-4-2';
  public difficulty: Difficulty = 'PRO';
  public halfDurationSeconds = 90;

  public players: Player[] = [];
  public ball: Ball;
  public activePlayerId = '';
  public passTargetId: string | null = null;

  public homeScore = 0;
  public awayScore = 0;
  public half: 1 | 2 = 1;
  public clockSeconds = 0;

  public stats: MatchStats = {
    homeShots: 0,
    awayShots: 0,
    homeOnTarget: 0,
    awayOnTarget: 0,
    homePossessionTicks: 0,
    awayPossessionTicks: 0,
    homeSaves: 0,
    awaySaves: 0,
  };

  public shotCharge = 0;
  public isChargingShot = false;
  public goalBannerText: string | null = null;
  public goalBannerSub: string | null = null;
  private goalResetTimer = 0;
  private hitstopTimer = 0;

  public cameraX = PITCH.worldW / 2;
  public cameraY = PITCH.worldH / 2;
  public cameraZoom = 1;
  public shakeAmount = 0;
  private titlePanTime = 0;

  public netLeftRipple = 0;
  public netRightRipple = 0;

  public particles: Particle[] = [];
  public penalty: PenaltyState = createPenaltyState();

  private kickoffTeam: TeamSide = 'HOME';

  constructor() {
    this.ball = this.createCenterBall();
    for (let i = 0; i < 160; i++) {
      this.particles.push({
        active: false,
        x: 0,
        y: 0,
        z: 0,
        vx: 0,
        vy: 0,
        vz: 0,
        size: 3,
        alpha: 1,
        life: 0,
        maxLife: 1,
        color: '#ffffff',
        kind: 'turf',
      });
    }
    this.setupTeams();
  }

  private createCenterBall(): Ball {
    return {
      x: PITCH.worldW / 2,
      y: PITCH.worldH / 2,
      z: 0,
      vx: 0,
      vy: 0,
      vz: 0,
      spin: 0,
      rotation: 0,
      ownerId: null,
      lastTouchTeam: null,
      lastTouchPlayerId: null,
      pickupCooldown: 0,
    };
  }

  public setupTeams(): void {
    const home = createTeamPlayers('HOME', this.formation);
    const away = createTeamPlayers('AWAY', this.awayFormation);
    this.players = [...home, ...away];
    const striker = home.find((p) => p.number === 9) || home[10];
    this.activePlayerId = striker.id;
    this.resetPositionsForKickoff(this.kickoffTeam);
  }

  public startNewMatch(
    mode: GameMode,
    formation: FormationId,
    difficulty: Difficulty,
  ): void {
    this.mode = mode;
    this.formation = formation;
    this.awayFormation = formation === '4-4-2' ? '4-3-3' : '4-4-2';
    this.difficulty = difficulty;
    this.homeScore = 0;
    this.awayScore = 0;
    this.half = 1;
    this.clockSeconds = 0;
    this.shotCharge = 0;
    this.isChargingShot = false;
    this.goalBannerText = null;
    this.goalBannerSub = null;
    this.goalResetTimer = 0;
    this.kickoffTeam = 'HOME';
    this.stats = {
      homeShots: 0,
      awayShots: 0,
      homeOnTarget: 0,
      awayOnTarget: 0,
      homePossessionTicks: 0,
      awayPossessionTicks: 0,
      homeSaves: 0,
      awaySaves: 0,
    };

    if (mode === 'PENALTY_SHOOTOUT') {
      this.penalty = createPenaltyState();
      this.screen = 'PLAYING';
      soundEngine.playWhistle('short');
      return;
    }

    this.setupTeams();
    this.screen = 'PLAYING';
    soundEngine.playWhistle('short');
  }

  public startPenaltyFromDraw(): void {
    this.mode = 'PENALTY_SHOOTOUT';
    this.penalty = createPenaltyState();
    this.screen = 'PLAYING';
    soundEngine.playWhistle('short');
  }

  public resumeSecondHalf(): void {
    this.half = 2;
    this.clockSeconds = this.halfDurationSeconds;
    this.kickoffTeam = 'AWAY';
    this.resetPositionsForKickoff('AWAY');
    this.screen = 'PLAYING';
    soundEngine.playWhistle('short');
  }

  private resetPositionsForKickoff(teamWithKickoff: TeamSide): void {
    const cx = PITCH.worldW / 2;
    const cy = PITCH.worldH / 2;
    this.ball = this.createCenterBall();

    for (const p of this.players) {
      const anchorX = PITCH.marginX + p.baseNx * PITCH.fieldW;
      const anchorY = PITCH.marginY + p.baseNy * PITCH.fieldH;
      // Keep players on their own half
      if (p.team === 'HOME') {
        p.x = Math.min(cx - 26, anchorX);
      } else {
        p.x = Math.max(cx + 26, anchorX);
      }
      p.y = anchorY;
      p.vx = 0;
      p.vy = 0;
      p.facing = p.team === 'HOME' ? 0 : Math.PI;
      p.tackleTimer = 0;
      p.stunTimer = 0;
      p.diveTimer = 0;
    }

    // Place kickoff striker near center spot
    const kickoffStriker = this.players.find(
      (p) => p.team === teamWithKickoff && p.role === 'FWD',
    );
    if (kickoffStriker) {
      kickoffStriker.x = teamWithKickoff === 'HOME' ? cx - 22 : cx + 22;
      kickoffStriker.y = cy;
      if (teamWithKickoff === 'HOME') {
        this.activePlayerId = kickoffStriker.id;
      }
    }
  }

  public spawnParticle(
    kind: Particle['kind'],
    x: number,
    y: number,
    z: number,
    vx: number,
    vy: number,
    vz: number,
    color: string,
    size: number,
    maxLife: number,
  ): void {
    for (const pt of this.particles) {
      if (!pt.active) {
        pt.active = true;
        pt.kind = kind;
        pt.x = x;
        pt.y = y;
        pt.z = z;
        pt.vx = vx;
        pt.vy = vy;
        pt.vz = vz;
        pt.color = color;
        pt.size = size;
        pt.life = 0;
        pt.maxLife = maxLife;
        pt.alpha = 1;
        return;
      }
    }
  }

  private burstParticles(
    kind: 'turf' | 'chalk' | 'confetti' | 'spark',
    x: number,
    y: number,
    color: string,
    count = 16,
  ): void {
    for (let i = 0; i < count; i++) {
      const ang = Math.random() * Math.PI * 2;
      const spd = 40 + Math.random() * 190;
      this.spawnParticle(
        kind,
        x,
        y,
        4,
        Math.cos(ang) * spd,
        Math.sin(ang) * spd,
        60 + Math.random() * 120,
        color,
        kind === 'confetti' ? 5 + Math.random() * 4 : 3 + Math.random() * 3,
        kind === 'confetti' ? 1.1 + Math.random() * 0.6 : 0.35 + Math.random() * 0.25,
      );
    }
  }

  public update(rawDt: number, input: InputState): void {
    const dt = Math.min(rawDt, 0.05);

    this.shakeAmount = Math.max(0, this.shakeAmount - dt * 22);
    this.netLeftRipple = Math.max(0, this.netLeftRipple - dt * 2.2);
    this.netRightRipple = Math.max(0, this.netRightRipple - dt * 2.2);
    this.updateParticles(dt);

    if (this.screen === 'TITLE') {
      this.updateTitleAmbient(dt);
      return;
    }

    if (this.screen !== 'PLAYING') {
      return;
    }

    if (this.mode === 'PENALTY_SHOOTOUT') {
      updatePenaltyState(
        this.penalty,
        dt,
        input,
        this.difficulty,
        (kind, nx, ny, color) => {
          // Map normalized goal coords to world preview burst
          this.burstParticles(kind, 850 + nx * 240, 380 - ny * 140, color, 26);
        },
        (amt) => {
          this.shakeAmount = Math.max(this.shakeAmount, amt);
        },
      );
      return;
    }

    // 11v11 Match Simulation
    if (this.hitstopTimer > 0) {
      this.hitstopTimer -= dt;
      return;
    }

    if (this.goalResetTimer > 0) {
      this.goalResetTimer -= dt;
      this.updateBallPhysics(dt, false);
      if (this.goalResetTimer <= 0) {
        this.goalBannerText = null;
        this.goalBannerSub = null;
        this.resetPositionsForKickoff(this.kickoffTeam);
        soundEngine.playWhistle('short');
      }
      this.updateCamera(dt);
      return;
    }

    // Advance match clock
    this.clockSeconds += dt;
    if (this.half === 1 && this.clockSeconds >= this.halfDurationSeconds) {
      this.clockSeconds = this.halfDurationSeconds;
      this.screen = 'HALFTIME';
      this.isChargingShot = false;
      this.shotCharge = 0;
      soundEngine.playWhistle('double');
      return;
    }
    if (this.half === 2 && this.clockSeconds >= this.halfDurationSeconds * 2) {
      this.clockSeconds = this.halfDurationSeconds * 2;
      this.screen = 'FULLTIME';
      this.isChargingShot = false;
      this.shotCharge = 0;
      soundEngine.playWhistle('long');
      return;
    }

    if (this.ball.pickupCooldown > 0) {
      this.ball.pickupCooldown -= dt;
    }

    this.handleUserInput(dt, input);
    this.updateAI(dt);
    this.updatePlayers(dt);
    this.resolvePlayerCollisions();
    this.updateBallPhysics(dt, true);
    this.updateCamera(dt);

    // Track possession
    if (this.ball.ownerId) {
      const owner = this.players.find((p) => p.id === this.ball.ownerId);
      if (owner?.team === 'HOME') this.stats.homePossessionTicks += 1;
      else if (owner?.team === 'AWAY') this.stats.awayPossessionTicks += 1;
    }
  }

  private updateTitleAmbient(dt: number): void {
    this.titlePanTime += dt;
    // Gentle AI vs AI ambient warm-up scrimmage on pitch
    this.updateAI(dt, true);
    this.updatePlayers(dt);
    this.resolvePlayerCollisions();
    this.updateBallPhysics(dt, false);
    // Keep ball inside field smoothly
    const minX = PITCH.marginX + 60;
    const maxX = PITCH.marginX + PITCH.fieldW - 60;
    const minY = PITCH.marginY + 60;
    const maxY = PITCH.marginY + PITCH.fieldH - 60;
    if (this.ball.x < minX || this.ball.x > maxX) {
      this.ball.vx *= -0.8;
      this.ball.x = clamp(this.ball.x, minX, maxX);
    }
    if (this.ball.y < minY || this.ball.y > maxY) {
      this.ball.vy *= -0.8;
      this.ball.y = clamp(this.ball.y, minY, maxY);
    }
    this.cameraX =
      PITCH.worldW / 2 + Math.sin(this.titlePanTime * 0.22) * 180;
    this.cameraY =
      PITCH.worldH / 2 + Math.cos(this.titlePanTime * 0.17) * 85;
  }

  private updateParticles(dt: number): void {
    for (const pt of this.particles) {
      if (!pt.active) continue;
      pt.life += dt;
      if (pt.life >= pt.maxLife) {
        pt.active = false;
        continue;
      }
      pt.x += pt.vx * dt;
      pt.y += pt.vy * dt;
      pt.z = Math.max(0, pt.z + pt.vz * dt);
      pt.vz -= 280 * dt;
      pt.vx *= 0.94;
      pt.vy *= 0.94;
      pt.alpha = 1 - pt.life / pt.maxLife;
    }
  }

  private getActivePlayer(): Player | undefined {
    return this.players.find((p) => p.id === this.activePlayerId);
  }

  private findBestPassTarget(passer: Player, aimDirX: number, aimDirY: number): Player | null {
    let best: Player | null = null;
    let bestScore = -Infinity;

    for (const teammate of this.players) {
      if (teammate.team !== passer.team || teammate.id === passer.id) continue;
      const dx = teammate.x - passer.x;
      const dy = teammate.y - passer.y;
      const dist = Math.hypot(dx, dy);
      if (dist < 35 || dist > 680) continue;

      const dot = (dx * aimDirX + dy * aimDirY) / dist;
      // Prefer teammates roughly in the aimed direction and within crisp passing range
      const score = dot * 2.2 - dist / 480 + (teammate.role !== 'GK' ? 0.25 : -0.4);
      if (dot > -0.1 && score > bestScore) {
        bestScore = score;
        best = teammate;
      }
    }
    return best;
  }

  private switchToNearestHomePlayer(): void {
    const outfield = this.players.filter(
      (p) => p.team === 'HOME' && p.role !== 'GK' && p.id !== this.activePlayerId,
    );
    let best: Player | null = null;
    let bestDist = Infinity;
    const predictX = this.ball.x + this.ball.vx * 0.22;
    const predictY = this.ball.y + this.ball.vy * 0.22;

    for (const p of outfield) {
      const d = Math.hypot(p.x - predictX, p.y - predictY);
      if (d < bestDist) {
        bestDist = d;
        best = p;
      }
    }
    if (best) {
      this.activePlayerId = best.id;
    }
  }

  private handleUserInput(dt: number, input: InputState): void {
    let active = this.getActivePlayer();
    if (!active) return;

    // Auto-switch if user is controlling a distant player and a teammate picks up the ball
    if (this.ball.ownerId) {
      const owner = this.players.find((p) => p.id === this.ball.ownerId);
      if (owner && owner.team === 'HOME' && owner.id !== active.id) {
        this.activePlayerId = owner.id;
        active = owner;
      }
    }

    let ix = (input.right ? 1 : 0) - (input.left ? 1 : 0);
    let iy = (input.down ? 1 : 0) - (input.up ? 1 : 0);
    if (Math.hypot(input.analogX, input.analogY) > 0.08) {
      ix = input.analogX;
      iy = input.analogY;
    }
    const rawMag = Math.hypot(ix, iy);
    const mag = Math.min(1, rawMag);
    if (rawMag > 1) {
      ix /= rawMag;
      iy /= rawMag;
    }

    const hasBall = this.ball.ownerId === active.id;

    // Smooth acceleration & sprint mechanics
    if (active.stunTimer <= 0 && active.tackleTimer <= 0 && active.diveTimer <= 0) {
      const wantsSprint = input.sprint && active.stamina > 6 && mag > 0;
      active.isSprinting = wantsSprint;
      const maxSpeed = wantsSprint ? (hasBall ? 305 : 335) : hasBall ? 225 : 245;
      const accel = 1350;

      if (mag > 0) {
        active.vx += ix * accel * dt;
        active.vy += iy * accel * dt;
        const speed = Math.hypot(active.vx, active.vy);
        if (speed > maxSpeed) {
          active.vx = (active.vx / speed) * maxSpeed;
          active.vy = (active.vy / speed) * maxSpeed;
        }
        const targetFacing = Math.atan2(iy, ix);
        active.facing = lerpAngle(active.facing, targetFacing, Math.min(1, dt * 15));

        if (wantsSprint) {
          active.stamina = Math.max(0, active.stamina - 24 * dt);
          if (Math.random() < dt * 9) {
            this.spawnParticle(
              'turf',
              active.x - Math.cos(active.facing) * 10,
              active.y - Math.sin(active.facing) * 10,
              2,
              -active.vx * 0.2 + (Math.random() - 0.5) * 30,
              -active.vy * 0.2 + (Math.random() - 0.5) * 30,
              35,
              '#22c55e',
              2.6,
              0.28,
            );
          }
        }
      } else {
        const drag = Math.exp(-9.5 * dt);
        active.vx *= drag;
        active.vy *= drag;
        active.isSprinting = false;
      }
    }

    // Update pass target indicator when on the ball
    const aimX = mag > 0 ? ix : Math.cos(active.facing);
    const aimY = mag > 0 ? iy : Math.sin(active.facing);
    this.passTargetId = hasBall
      ? this.findBestPassTarget(active, aimX, aimY)?.id ?? null
      : null;

    if (hasBall) {
      // PASS
      if (input.passJustPressed) {
        const target = this.findBestPassTarget(active, aimX, aimY);
        this.executePass(active, target, aimX, aimY, false);
        this.isChargingShot = false;
        this.shotCharge = 0;
        return;
      }
      // THROUGH PASS
      if (input.throughJustPressed) {
        const target = this.findBestPassTarget(active, aimX, aimY);
        this.executePass(active, target, aimX, aimY, true);
        this.isChargingShot = false;
        this.shotCharge = 0;
        return;
      }
      // POWER SHOT
      if (input.shootJustPressed) {
        this.isChargingShot = true;
        this.shotCharge = 0.14;
      }
      if (this.isChargingShot && input.shootHeld) {
        this.shotCharge = Math.min(1, this.shotCharge + dt * 1.45);
      }
      if (this.isChargingShot && input.shootJustReleased) {
        this.executeShot(active, this.shotCharge, aimX, aimY);
        this.isChargingShot = false;
        this.shotCharge = 0;
      }
    } else {
      this.isChargingShot = false;
      this.shotCharge = 0;

      // SWITCH PLAYER
      if (input.passJustPressed || input.throughJustPressed) {
        this.switchToNearestHomePlayer();
      }

      // SLIDE TACKLE
      if (
        input.shootJustPressed &&
        active.tackleCooldown <= 0 &&
        active.stunTimer <= 0
      ) {
        active.tackleTimer = 0.26;
        active.tackleCooldown = 0.9;
        const dirX = mag > 0 ? ix : Math.cos(active.facing);
        const dirY = mag > 0 ? iy : Math.sin(active.facing);
        active.facing = Math.atan2(dirY, dirX);
        active.vx = dirX * 440;
        active.vy = dirY * 440;
        this.burstParticles('turf', active.x, active.y, '#16a34a', 7);
      }
    }
  }

  private executePass(
    passer: Player,
    target: Player | null,
    fallbackDirX: number,
    fallbackDirY: number,
    isThrough: boolean,
  ): void {
    this.ball.ownerId = null;
    this.ball.pickupCooldown = 0.16;
    this.ball.lastTouchTeam = passer.team;
    this.ball.lastTouchPlayerId = passer.id;
    passer.kickAnimTimer = 0.22;

    let tx: number;
    let ty: number;
    if (target) {
      const lead = isThrough ? 0.55 : 0.26;
      const goalDir = passer.team === 'HOME' ? 1 : -1;
      tx = target.x + target.vx * lead + (isThrough ? goalDir * 85 : 0);
      ty = target.y + target.vy * lead;
      if (passer.team === 'HOME') {
        this.activePlayerId = target.id;
      }
    } else {
      tx = passer.x + fallbackDirX * 260;
      ty = passer.y + fallbackDirY * 260;
    }

    const dx = tx - this.ball.x;
    const dy = ty - this.ball.y;
    const dist = Math.max(1, Math.hypot(dx, dy));
    const speed = clamp(320 + dist * 0.95, 360, isThrough ? 760 : 660);

    this.ball.vx = (dx / dist) * speed;
    this.ball.vy = (dy / dist) * speed;
    this.ball.vz = isThrough ? 75 : 35;
    passer.facing = Math.atan2(dy, dx);
    soundEngine.playPass();
  }

  private executeShot(
    shooter: Player,
    power: number,
    aimX: number,
    aimY: number,
  ): void {
    this.ball.ownerId = null;
    this.ball.pickupCooldown = 0.22;
    this.ball.lastTouchTeam = shooter.team;
    this.ball.lastTouchPlayerId = shooter.id;
    shooter.kickAnimTimer = 0.26;

    const targetGoalX =
      shooter.team === 'HOME'
        ? PITCH.marginX + PITCH.fieldW
        : PITCH.marginX;
    const goalCenterY = PITCH.worldH / 2;

    // Blend player's aim vector with goal mouth target for intuitive shooting
    const toGoalX = targetGoalX - shooter.x;
    const toGoalY = goalCenterY - shooter.y;
    const toGoalDist = Math.max(1, Math.hypot(toGoalX, toGoalY));

    const goalNormX = toGoalX / toGoalDist;
    const goalNormY = toGoalY / toGoalDist;

    // Allow aiming top/bottom corner with vertical input
    const cornerBiasY = aimY * 0.42;
    let dirX = goalNormX * 0.8 + aimX * 0.2;
    let dirY = goalNormY * 0.55 + cornerBiasY;
    const mag = Math.max(0.001, Math.hypot(dirX, dirY));
    dirX /= mag;
    dirY /= mag;

    const speed = 560 + power * 470;
    this.ball.vx = dirX * speed;
    this.ball.vy = dirY * speed;
    this.ball.vz = 70 + power * 185;
    this.ball.spin = -dirY * 4;
    shooter.facing = Math.atan2(dirY, dirX);

    if (shooter.team === 'HOME') this.stats.homeShots += 1;
    else this.stats.awayShots += 1;

    soundEngine.playKick(power);
    this.shakeAmount = Math.max(this.shakeAmount, 2.5 + power * 4.5);
    if (power > 0.75) {
      this.hitstopTimer = 0.028;
    }
  }

  private updateAI(dt: number, allAI = false): void {
    const ballOwner = this.ball.ownerId
      ? this.players.find((p) => p.id === this.ball.ownerId) ?? null
      : null;

    // Determine closest non-GK presser per team
    const getClosestOutfield = (team: TeamSide): string | null => {
      let bestId: string | null = null;
      let bestDist = Infinity;
      for (const p of this.players) {
        if (p.team !== team || p.role === 'GK') continue;
        if (!allAI && p.id === this.activePlayerId) continue;
        const d = Math.hypot(p.x - this.ball.x, p.y - this.ball.y);
        if (d < bestDist) {
          bestDist = d;
          bestId = p.id;
        }
      }
      return bestId;
    };

    const homePresserId = getClosestOutfield('HOME');
    const awayPresserId = getClosestOutfield('AWAY');

    const ballNormX = clamp((this.ball.x - PITCH.marginX) / PITCH.fieldW, 0, 1);
    const ballNormY = clamp((this.ball.y - PITCH.marginY) / PITCH.fieldH, 0, 1);

    const diffScale =
      this.difficulty === 'WORLD_CLASS'
        ? 1.06
        : this.difficulty === 'PRO'
          ? 0.94
          : 0.78;

    for (const p of this.players) {
      if (!allAI && p.id === this.activePlayerId) continue;
      if (p.stunTimer > 0 || p.tackleTimer > 0) continue;

      if (p.role === 'GK') {
        this.updateGoalkeeperAI(p, dt, diffScale);
        continue;
      }

      const isHome = p.team === 'HOME';
      const attackDir = isHome ? 1 : -1;
      const teamHasBall = ballOwner?.team === p.team;
      const isOwner = ballOwner?.id === p.id;

      if (isOwner) {
        this.updateAIBallCarrier(p, dt, attackDir, diffScale);
        continue;
      }

      // Compute dynamic tactical anchor based on ball position & possession
      const shiftX = (ballNormX - 0.5) * 0.36 + (teamHasBall ? attackDir * 0.1 : -attackDir * 0.06);
      const shiftY = (ballNormY - 0.5) * 0.22;

      let targetX =
        PITCH.marginX + clamp(p.baseNx + shiftX, 0.07, 0.93) * PITCH.fieldW;
      let targetY =
        PITCH.marginY + clamp(p.baseNy + shiftY, 0.07, 0.93) * PITCH.fieldH;
      let desiredSpeed = 205 * diffScale;

      const isPresser =
        (isHome && p.id === homePresserId) || (!isHome && p.id === awayPresserId);

      if (isPresser && (!teamHasBall || !ballOwner)) {
        // Press the ball or chase loose ball
        targetX = this.ball.x + this.ball.vx * 0.14;
        targetY = this.ball.y + this.ball.vy * 0.14;
        desiredSpeed = 265 * (isHome ? 0.98 : diffScale);

        // AI tackle opportunity
        if (
          !isHome &&
          ballOwner &&
          ballOwner.team === 'HOME' &&
          p.tackleCooldown <= 0
        ) {
          const distToBall = Math.hypot(this.ball.x - p.x, this.ball.y - p.y);
          if (distToBall < 42 && Math.random() < dt * (this.difficulty === 'WORLD_CLASS' ? 2.4 : 1.1)) {
            p.tackleTimer = 0.24;
            p.tackleCooldown = 1.4;
            const ang = Math.atan2(this.ball.y - p.y, this.ball.x - p.x);
            p.facing = ang;
            p.vx = Math.cos(ang) * 390;
            p.vy = Math.sin(ang) * 390;
            continue;
          }
        }
      } else if (teamHasBall && p.role === 'FWD') {
        // Make smart forward runs into space
        targetX += attackDir * 135;
      }

      const dx = targetX - p.x;
      const dy = targetY - p.y;
      const dist = Math.hypot(dx, dy);

      if (dist > 14) {
        const moveSpd = dist < 50 ? desiredSpeed * (dist / 50) : desiredSpeed;
        const tvx = (dx / dist) * moveSpd;
        const tvy = (dy / dist) * moveSpd;
        p.vx += (tvx - p.vx) * Math.min(1, dt * 8);
        p.vy += (tvy - p.vy) * Math.min(1, dt * 8);
        p.facing = lerpAngle(p.facing, Math.atan2(dy, dx), Math.min(1, dt * 10));
      } else {
        p.vx *= Math.exp(-8 * dt);
        p.vy *= Math.exp(-8 * dt);
        p.facing = lerpAngle(
          p.facing,
          Math.atan2(this.ball.y - p.y, this.ball.x - p.x),
          Math.min(1, dt * 6),
        );
      }
    }
  }

  private updateAIBallCarrier(
    p: Player,
    dt: number,
    attackDir: number,
    diffScale: number,
  ): void {
    const goalX = attackDir > 0 ? PITCH.marginX + PITCH.fieldW : PITCH.marginX;
    const goalY = PITCH.worldH / 2;
    const distToGoal = Math.hypot(goalX - p.x, goalY - p.y);

    p.aiDecisionTimer -= dt;

    // Shoot if within range
    if (distToGoal < 330 && p.aiDecisionTimer <= 0) {
      const aimCornerY = (Math.random() < 0.5 ? -1 : 1) * (0.25 + Math.random() * 0.45);
      this.executeShot(p, 0.58 + Math.random() * 0.3, attackDir, aimCornerY);
      p.aiDecisionTimer = 0.5;
      return;
    }

    // Check if pressured by an opponent
    let nearestOppDist = Infinity;
    for (const opp of this.players) {
      if (opp.team === p.team) continue;
      const d = Math.hypot(opp.x - p.x, opp.y - p.y);
      if (d < nearestOppDist) nearestOppDist = d;
    }

    if ((nearestOppDist < 95 || p.role === 'DEF') && p.aiDecisionTimer <= 0) {
      const target = this.findBestPassTarget(p, attackDir, (Math.random() - 0.5) * 0.6);
      if (target) {
        const targetAhead =
          attackDir > 0 ? target.x > p.x - 40 : target.x < p.x + 40;
        if (targetAhead || nearestOppDist < 75) {
          this.executePass(p, target, attackDir, 0, Math.random() < 0.25);
          p.aiDecisionTimer = 0.45;
          return;
        }
      }
      p.aiDecisionTimer = 0.25;
    }

    // Dribble smoothly toward opponent goal
    const dx = goalX - p.x;
    const dy = goalY + Math.sin(p.number + this.clockSeconds) * 70 - p.y;
    const d = Math.max(1, Math.hypot(dx, dy));
    const spd = 225 * diffScale;
    p.vx += ((dx / d) * spd - p.vx) * Math.min(1, dt * 8);
    p.vy += ((dy / d) * spd - p.vy) * Math.min(1, dt * 8);
    p.facing = lerpAngle(p.facing, Math.atan2(dy, dx), Math.min(1, dt * 10));
  }

  private updateGoalkeeperAI(gk: Player, dt: number, diffScale: number): void {
    const isHome = gk.team === 'HOME';
    const goalLineX = isHome ? PITCH.marginX + 18 : PITCH.marginX + PITCH.fieldW - 18;
    const goalCenterY = PITCH.worldH / 2;

    if (this.ball.ownerId === gk.id) {
      // Keeper immediately distributes to open teammate
      gk.aiDecisionTimer -= dt;
      if (gk.aiDecisionTimer <= 0) {
        const dir = isHome ? 1 : -1;
        const target = this.findBestPassTarget(gk, dir, 0);
        this.executePass(gk, target, dir, 0, false);
        gk.aiDecisionTimer = 0.6;
      }
      return;
    }

    if (gk.diveTimer > 0) {
      gk.diveTimer -= dt;
      return;
    }

    // Dive if a fast shot is heading toward goal
    const approaching = isHome ? this.ball.vx < -280 : this.ball.vx > 280;
    const distX = Math.abs(this.ball.x - goalLineX);
    if (approaching && distX < 280 && !this.ball.ownerId) {
      const timeToLine = distX / Math.max(1, Math.abs(this.ball.vx));
      const predY = this.ball.y + this.ball.vy * timeToLine;
      if (Math.abs(predY - goalCenterY) < PITCH.goalH * 0.65 && Math.abs(predY - gk.y) > 22) {
        gk.diveTimer = 0.36;
        const dir = Math.sign(predY - gk.y);
        gk.diveDirY = dir;
        gk.vy = dir * 355 * diffScale;
        gk.vx = 0;
        return;
      }
    }

    // Track ball laterally across goal mouth & step off line slightly when ball is close
    const stepOut = clamp(1 - distX / 480, 0, 1) * 38;
    const targetX = isHome ? goalLineX + stepOut : goalLineX - stepOut;
    const targetY = clamp(
      goalCenterY + (this.ball.y - goalCenterY) * 0.42,
      goalCenterY - PITCH.goalH * 0.42,
      goalCenterY + PITCH.goalH * 0.42,
    );

    const dx = targetX - gk.x;
    const dy = targetY - gk.y;
    const dist = Math.hypot(dx, dy);
    if (dist > 4) {
      const spd = Math.min(250 * diffScale, dist * 7);
      gk.vx = (dx / dist) * spd;
      gk.vy = (dy / dist) * spd;
    } else {
      gk.vx *= 0.8;
      gk.vy *= 0.8;
    }
    gk.facing = lerpAngle(
      gk.facing,
      Math.atan2(this.ball.y - gk.y, this.ball.x - gk.x),
      Math.min(1, dt * 12),
    );
  }

  private updatePlayers(dt: number): void {
    const minX = PITCH.marginX - 24;
    const maxX = PITCH.marginX + PITCH.fieldW + 24;
    const minY = PITCH.marginY - 24;
    const maxY = PITCH.marginY + PITCH.fieldH + 24;

    for (const p of this.players) {
      if (p.tackleCooldown > 0) p.tackleCooldown -= dt;
      if (p.stunTimer > 0) p.stunTimer -= dt;
      if (p.kickAnimTimer > 0) p.kickAnimTimer -= dt;

      if (p.tackleTimer > 0) {
        p.tackleTimer -= dt;
        p.vx *= Math.exp(-3.5 * dt);
        p.vy *= Math.exp(-3.5 * dt);
      }

      if (!p.isSprinting) {
        p.stamina = Math.min(100, p.stamina + 11 * dt);
      }

      p.x = clamp(p.x + p.vx * dt, minX, maxX);
      p.y = clamp(p.y + p.vy * dt, minY, maxY);

      const speed = Math.hypot(p.vx, p.vy);
      if (speed > 18) {
        p.stridePhase = (p.stridePhase + speed * dt * 0.065) % (Math.PI * 2);
      }
    }
  }

  private resolvePlayerCollisions(): void {
    const minDist = PITCH.playerRadius * 2;
    for (let i = 0; i < this.players.length; i++) {
      for (let j = i + 1; j < this.players.length; j++) {
        const a = this.players[i];
        const b = this.players[j];
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const d = Math.hypot(dx, dy);
        if (d > 0 && d < minDist) {
          const push = (minDist - d) * 0.5;
          const nx = dx / d;
          const ny = dy / d;
          a.x -= nx * push;
          a.y -= ny * push;
          b.x += nx * push;
          b.y += ny * push;

          // Tackle steal check
          if (a.team !== b.team) {
            if (a.tackleTimer > 0 && this.ball.ownerId === b.id) {
              this.dispossess(b, a);
            } else if (b.tackleTimer > 0 && this.ball.ownerId === a.id) {
              this.dispossess(a, b);
            }
          }
        }
      }
    }
  }

  private dispossess(victim: Player, tackler: Player): void {
    this.ball.ownerId = tackler.id;
    this.ball.pickupCooldown = 0.2;
    this.ball.lastTouchTeam = tackler.team;
    this.ball.lastTouchPlayerId = tackler.id;
    victim.stunTimer = 0.55;
    if (tackler.team === 'HOME') {
      this.activePlayerId = tackler.id;
    }
    soundEngine.playPass();
    this.shakeAmount = Math.max(this.shakeAmount, 3.2);
  }

  private updateBallPhysics(dt: number, checkGoalsAndBounds: boolean): void {
    // Tether ball smoothly ahead of owner's feet when dribbling
    if (this.ball.ownerId) {
      const owner = this.players.find((p) => p.id === this.ball.ownerId);
      if (owner) {
        const targetX = owner.x + Math.cos(owner.facing) * (PITCH.playerRadius + 7);
        const targetY = owner.y + Math.sin(owner.facing) * (PITCH.playerRadius + 7);
        const follow = Math.min(1, dt * 24);
        this.ball.x += (targetX - this.ball.x) * follow;
        this.ball.y += (targetY - this.ball.y) * follow;
        this.ball.vx = owner.vx;
        this.ball.vy = owner.vy;
        this.ball.z = 0;
        this.ball.vz = 0;
        this.ball.rotation += Math.hypot(owner.vx, owner.vy) * dt * 0.08;

        // Check if an opposing player/GK intercepts or tackles close enough
        if (this.ball.pickupCooldown <= 0) {
          for (const opp of this.players) {
            if (opp.team === owner.team || opp.stunTimer > 0) continue;
            const d = Math.hypot(opp.x - this.ball.x, opp.y - this.ball.y);
            if (d < PITCH.playerRadius + PITCH.ballRadius + (opp.tackleTimer > 0 ? 12 : 1)) {
              this.dispossess(owner, opp);
              break;
            }
          }
        }
      } else {
        this.ball.ownerId = null;
      }
    } else {
      // Free ball physics with spin, air drag, gravity, and turf bounce
      this.ball.x += this.ball.vx * dt;
      this.ball.y += this.ball.vy * dt;

      if (this.ball.z > 0 || this.ball.vz !== 0) {
        this.ball.z += this.ball.vz * dt;
        this.ball.vz -= 520 * dt;
        if (this.ball.z <= 0) {
          this.ball.z = 0;
          if (Math.abs(this.ball.vz) > 45) {
            this.ball.vz = -this.ball.vz * 0.52;
          } else {
            this.ball.vz = 0;
          }
        }
      }

      const friction = this.ball.z > 2 ? 0.992 : Math.exp(-2.1 * dt);
      this.ball.vx *= friction;
      this.ball.vy *= friction;
      this.ball.rotation += Math.hypot(this.ball.vx, this.ball.vy) * dt * 0.08;

      // Pickup / Goalkeeper save check
      if (this.ball.pickupCooldown <= 0 && this.ball.z < 36) {
        for (const p of this.players) {
          if (p.stunTimer > 0) continue;
          const reach =
            p.role === 'GK'
              ? PITCH.playerRadius + PITCH.ballRadius + 10
              : PITCH.playerRadius + PITCH.ballRadius + 5;
          const d = Math.hypot(p.x - this.ball.x, p.y - this.ball.y);
          if (d < reach) {
            const ballSpd = Math.hypot(this.ball.vx, this.ball.vy);
            // Fast shot deflected/saved by GK!
            if (p.role === 'GK' && ballSpd > 380 && this.ball.lastTouchTeam !== p.team) {
              soundEngine.playSave();
              this.shakeAmount = Math.max(this.shakeAmount, 4);
              this.hitstopTimer = 0.032;
              if (p.team === 'HOME') this.stats.homeSaves += 1;
              else this.stats.awaySaves += 1;
              this.burstParticles('spark', this.ball.x, this.ball.y, '#facc15', 10);
            }
            this.ball.ownerId = p.id;
            this.ball.lastTouchTeam = p.team;
            this.ball.lastTouchPlayerId = p.id;
            this.ball.pickupCooldown = 0.14;
            if (p.team === 'HOME' && this.screen === 'PLAYING') {
              this.activePlayerId = p.id;
            }
            break;
          }
        }
      }
    }

    if (!checkGoalsAndBounds) return;

    // Goal detection & Goalpost collisions
    const leftX = PITCH.marginX;
    const rightX = PITCH.marginX + PITCH.fieldW;
    const topY = PITCH.marginY;
    const bottomY = PITCH.marginY + PITCH.fieldH;
    const goalTop = PITCH.worldH / 2 - PITCH.goalH / 2;
    const goalBot = PITCH.worldH / 2 + PITCH.goalH / 2;

    // Goalpost circles
    const posts = [
      { x: leftX, y: goalTop },
      { x: leftX, y: goalBot },
      { x: rightX, y: goalTop },
      { x: rightX, y: goalBot },
    ];
    for (const post of posts) {
      const dx = this.ball.x - post.x;
      const dy = this.ball.y - post.y;
      const dist = Math.hypot(dx, dy);
      const minD = PITCH.ballRadius + 6;
      if (dist > 0 && dist < minD) {
        const nx = dx / dist;
        const ny = dy / dist;
        this.ball.x = post.x + nx * minD;
        this.ball.y = post.y + ny * minD;
        const dot = this.ball.vx * nx + this.ball.vy * ny;
        if (dot < 0) {
          this.ball.vx -= 1.75 * dot * nx;
          this.ball.vy -= 1.75 * dot * ny;
          soundEngine.playPostHit();
          this.shakeAmount = Math.max(this.shakeAmount, 6);
          this.hitstopTimer = 0.04;
        }
      }
    }

    // Scored in Left Goal (AWAY scores)
    if (this.ball.x < leftX - PITCH.ballRadius && this.ball.y > goalTop && this.ball.y < goalBot) {
      this.onGoalScored('AWAY');
      this.netLeftRipple = 1;
      return;
    }

    // Scored in Right Goal (HOME scores)
    if (this.ball.x > rightX + PITCH.ballRadius && this.ball.y > goalTop && this.ball.y < goalBot) {
      this.onGoalScored('HOME');
      this.netRightRipple = 1;
      return;
    }

    // Sidelines & Endlines -> smooth cushioned bounce/quick restart so 11v11 action stays electric
    if (this.ball.y < topY) {
      this.ball.y = topY;
      this.ball.vy = Math.abs(this.ball.vy) * 0.65;
      this.burstParticles('chalk', this.ball.x, topY, '#f8fafc', 6);
    } else if (this.ball.y > bottomY) {
      this.ball.y = bottomY;
      this.ball.vy = -Math.abs(this.ball.vy) * 0.65;
      this.burstParticles('chalk', this.ball.x, bottomY, '#f8fafc', 6);
    }

    if (this.ball.x < leftX && (this.ball.y <= goalTop || this.ball.y >= goalBot)) {
      this.ball.x = leftX + 2;
      this.ball.vx = Math.abs(this.ball.vx) * 0.6;
      this.burstParticles('chalk', leftX, this.ball.y, '#f8fafc', 6);
    } else if (this.ball.x > rightX && (this.ball.y <= goalTop || this.ball.y >= goalBot)) {
      this.ball.x = rightX - 2;
      this.ball.vx = -Math.abs(this.ball.vx) * 0.6;
      this.burstParticles('chalk', rightX, this.ball.y, '#f8fafc', 6);
    }
  }

  private onGoalScored(scoringTeam: TeamSide): void {
    if (this.goalResetTimer > 0) return;

    this.ball.ownerId = null;
    this.ball.vx *= 0.25;
    this.ball.vy *= 0.25;
    this.isChargingShot = false;
    this.shotCharge = 0;

    if (scoringTeam === 'HOME') {
      this.homeScore += 1;
      this.stats.homeOnTarget += 1;
      this.kickoffTeam = 'AWAY';
      this.goalBannerText = 'GOAL! HOME';
    } else {
      this.awayScore += 1;
      this.stats.awayOnTarget += 1;
      this.kickoffTeam = 'HOME';
      this.goalBannerText = 'GOAL! AWAY';
    }

    const scorer = this.players.find((p) => p.id === this.ball.lastTouchPlayerId);
    this.goalBannerSub = scorer
      ? `#${scorer.number} (${scorer.role}) · ${this.homeScore} – ${this.awayScore}`
      : `${this.homeScore} – ${this.awayScore}`;

    this.goalResetTimer = 2.3;
    this.hitstopTimer = 0.055;
    this.shakeAmount = 8;

    soundEngine.playNetSwish();
    soundEngine.playCrowdGoal();
    soundEngine.playWhistle('short');
    this.burstParticles(
      'confetti',
      this.ball.x,
      this.ball.y,
      scoringTeam === 'HOME' ? '#3b82f6' : '#ef4444',
      38,
    );
  }

  private updateCamera(dt: number): void {
    const targetX = clamp(this.ball.x, 420, PITCH.worldW - 420);
    const targetY = clamp(this.ball.y, 260, PITCH.worldH - 260);
    const lerp = Math.min(1, dt * 5.5);
    this.cameraX += (targetX - this.cameraX) * lerp;
    this.cameraY += (targetY - this.cameraY) * lerp;
  }

  public getHudSnapshot(): HudSnapshot {
    const active = this.getActivePlayer();
    return {
      screen: this.screen,
      mode: this.mode,
      homeScore: this.homeScore,
      awayScore: this.awayScore,
      half: this.half,
      clockSeconds: Math.floor(this.clockSeconds),
      halfDurationSeconds: this.halfDurationSeconds,
      activePlayerNumber: active?.number ?? 9,
      activePlayerRole: active?.role ?? 'FWD',
      activePlayerStamina: Math.round(active?.stamina ?? 100),
      shotCharge: Math.round(this.shotCharge * 100),
      goalBannerText: this.goalBannerText,
      goalBannerSub: this.goalBannerSub,
      stats: { ...this.stats },
      penalty: {
        phase: this.penalty.phase,
        turn: this.penalty.turn,
        round: this.penalty.round,
        suddenDeath: this.penalty.suddenDeath,
        homeScore: this.penalty.homeScore,
        awayScore: this.penalty.awayScore,
        homeKicks: [...this.penalty.homeKicks],
        awayKicks: [...this.penalty.awayKicks],
        winner: this.penalty.winner,
        resultBanner: this.penalty.resultBanner,
        resultSub: this.penalty.resultSub,
        power: Math.round(this.penalty.power * 100),
        keeperCommitted: this.penalty.keeperDiveCommitted,
      },
    };
  }
}

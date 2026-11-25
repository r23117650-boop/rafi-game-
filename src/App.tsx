import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Check,
  Gamepad2,
  Pause,
  Play,
  RotateCcw,
  Trophy,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';
import { MobileControls } from './components/MobileControls';
import { soundEngine } from './game/audio';
import { GameEngine } from './game/matchEngine';
import { getPenaltyGoalBounds, renderGame } from './game/renderer';
import { OfflineIndicator, PWAInstallButton } from './hooks/usePWAInstall';
import type {
  Difficulty,
  FormationId,
  GameMode,
  HudSnapshot,
  InputState,
  KickOutcome,
} from './game/types';

function formatMatchClock(seconds: number, halfDuration: number): string {
  // Scale real-time seconds into 45:00 / 90:00 football match minutes
  const totalMatchMinutes = (seconds / halfDuration) * 45;
  const mins = Math.floor(totalMatchMinutes);
  const secs = Math.floor((totalMatchMinutes - mins) * 60);
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

function KickStatusIcon({ outcome }: { outcome: KickOutcome }) {
  if (outcome === 'GOAL') {
    return (
      <span
        className="inline-flex h-5 w-5 items-center justify-center rounded-sm bg-emerald-500/20 border border-emerald-400 text-emerald-300"
        title="Scored"
      >
        <Check className="h-3.5 w-3.5 stroke-[2.75]" />
      </span>
    );
  }
  if (outcome === 'MISS' || outcome === 'SAVE') {
    return (
      <span
        className="inline-flex h-5 w-5 items-center justify-center rounded-sm bg-rose-500/20 border border-rose-400 text-rose-300"
        title={outcome === 'SAVE' ? 'Saved' : 'Missed'}
      >
        <X className="h-3.5 w-3.5 stroke-[2.75]" />
      </span>
    );
  }
  return (
    <span
      className="inline-flex h-5 w-5 items-center justify-center rounded-sm bg-slate-800/80 border border-slate-600"
      title="Upcoming"
    >
      <span className="h-1.5 w-1.5 rounded-full bg-slate-500" />
    </span>
  );
}

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const engineRef = useRef<GameEngine | null>(null);
  if (!engineRef.current) {
    engineRef.current = new GameEngine();
  }

  const inputRef = useRef<InputState>({
    up: false,
    down: false,
    left: false,
    right: false,
    analogX: 0,
    analogY: 0,
    sprint: false,
    shootHeld: false,
    shootJustPressed: false,
    shootJustReleased: false,
    passJustPressed: false,
    throughJustPressed: false,
    mouseNormX: 0,
    mouseNormY: 0.35,
    mouseActive: false,
    mouseDown: false,
    mouseJustPressed: false,
    mouseJustReleased: false,
  });

  const [selectedMode, setSelectedMode] = useState<GameMode>('MATCH');
  const [selectedFormation, setSelectedFormation] =
    useState<FormationId>('4-3-3');
  const [selectedDifficulty, setSelectedDifficulty] =
    useState<Difficulty>('PRO');
  const [muted, setMuted] = useState(false);
  const [showTouchControls, setShowTouchControls] = useState(() => {
    if (typeof window === 'undefined') return false;
    return (
      window.matchMedia('(pointer: coarse)').matches ||
      'ontouchstart' in window ||
      navigator.maxTouchPoints > 0
    );
  });

  const [hud, setHud] = useState<HudSnapshot>(() =>
    engineRef.current!.getHudSnapshot(),
  );

  const syncHud = useCallback(() => {
    const next = engineRef.current!.getHudSnapshot();
    setHud((prev) => {
      if (
        prev.screen === next.screen &&
        prev.mode === next.mode &&
        prev.homeScore === next.homeScore &&
        prev.awayScore === next.awayScore &&
        prev.half === next.half &&
        prev.clockSeconds === next.clockSeconds &&
        prev.activePlayerNumber === next.activePlayerNumber &&
        prev.activePlayerStamina === next.activePlayerStamina &&
        prev.shotCharge === next.shotCharge &&
        prev.goalBannerText === next.goalBannerText &&
        prev.penalty.phase === next.penalty.phase &&
        prev.penalty.turn === next.penalty.turn &&
        prev.penalty.round === next.penalty.round &&
        prev.penalty.homeScore === next.penalty.homeScore &&
        prev.penalty.awayScore === next.penalty.awayScore &&
        prev.penalty.resultBanner === next.penalty.resultBanner &&
        prev.penalty.power === next.penalty.power &&
        prev.penalty.keeperCommitted === next.penalty.keeperCommitted &&
        prev.penalty.homeKicks.length === next.penalty.homeKicks.length &&
        prev.penalty.awayKicks.length === next.penalty.awayKicks.length
      ) {
        return prev;
      }
      return next;
    });
  }, []);

  const handleStart = useCallback(() => {
    soundEngine.unlock();
    const eng = engineRef.current!;
    eng.startNewMatch(selectedMode, selectedFormation, selectedDifficulty);
    syncHud();
  }, [selectedMode, selectedFormation, selectedDifficulty, syncHud]);

  const handlePauseToggle = useCallback(() => {
    const eng = engineRef.current!;
    if (eng.screen === 'PLAYING') {
      eng.screen = 'PAUSED';
    } else if (eng.screen === 'PAUSED') {
      eng.screen = 'PLAYING';
    }
    syncHud();
  }, [syncHud]);

  const handleReturnToTitle = useCallback(() => {
    const eng = engineRef.current!;
    eng.mode = 'MATCH';
    eng.screen = 'TITLE';
    eng.setupTeams();
    syncHud();
  }, [syncHud]);

  const handleToggleMute = useCallback(() => {
    setMuted((m) => {
      const next = !m;
      soundEngine.setMuted(next);
      return next;
    });
  }, []);

  // Keyboard & Window Blur Listeners
  useEffect(() => {
    const clearHeld = () => {
      const inp = inputRef.current;
      inp.up = false;
      inp.down = false;
      inp.left = false;
      inp.right = false;
      inp.analogX = 0;
      inp.analogY = 0;
      inp.sprint = false;
      inp.shootHeld = false;
      inp.mouseDown = false;
    };

    const onKeyDown = (e: KeyboardEvent) => {
      const code = e.code;
      const eng = engineRef.current!;

      if (code === 'Escape') {
        if (eng.screen === 'PLAYING' || eng.screen === 'PAUSED') {
          e.preventDefault();
          handlePauseToggle();
          return;
        }
      }

      if (eng.screen === 'TITLE' && code === 'Enter') {
        e.preventDefault();
        handleStart();
        return;
      }

      if (eng.screen !== 'PLAYING') return;

      const inp = inputRef.current;
      if (code === 'KeyW' || code === 'ArrowUp') {
        e.preventDefault();
        inp.up = true;
      } else if (code === 'KeyS' || code === 'ArrowDown') {
        e.preventDefault();
        inp.down = true;
      } else if (code === 'KeyA' || code === 'ArrowLeft') {
        e.preventDefault();
        inp.left = true;
      } else if (code === 'KeyD' || code === 'ArrowRight') {
        e.preventDefault();
        inp.right = true;
      } else if (code === 'ShiftLeft' || code === 'ShiftRight') {
        inp.sprint = true;
      } else if (code === 'Space' || code === 'KeyK') {
        e.preventDefault();
        if (!inp.shootHeld) {
          inp.shootJustPressed = true;
        }
        inp.shootHeld = true;
      } else if (code === 'KeyJ' || code === 'KeyE' || code === 'KeyX') {
        e.preventDefault();
        if (!e.repeat) {
          inp.passJustPressed = true;
        }
      } else if (code === 'KeyL' || code === 'KeyQ' || code === 'KeyC') {
        e.preventDefault();
        if (!e.repeat) {
          inp.throughJustPressed = true;
        }
      }
    };

    const onKeyUp = (e: KeyboardEvent) => {
      const code = e.code;
      const inp = inputRef.current;
      if (code === 'KeyW' || code === 'ArrowUp') inp.up = false;
      else if (code === 'KeyS' || code === 'ArrowDown') inp.down = false;
      else if (code === 'KeyA' || code === 'ArrowLeft') inp.left = false;
      else if (code === 'KeyD' || code === 'ArrowRight') inp.right = false;
      else if (code === 'ShiftLeft' || code === 'ShiftRight') inp.sprint = false;
      else if (code === 'Space' || code === 'KeyK') {
        if (inp.shootHeld) {
          inp.shootJustReleased = true;
        }
        inp.shootHeld = false;
      }
    };

    const onVisibilityChange = () => {
      if (document.hidden) clearHeld();
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', clearHeld);
    document.addEventListener('visibilitychange', onVisibilityChange);

    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', clearHeld);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [handlePauseToggle, handleStart]);

  // Isolated 60fps Canvas Simulation Loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let rafId = 0;
    let lastTime = performance.now();
    let hudTimer = 0;

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = window.innerWidth;
      const h = window.innerHeight;
      canvas.width = Math.floor(w * dpr);
      canvas.height = Math.floor(h * dpr);
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    resize();
    window.addEventListener('resize', resize);

    const frame = (now: number) => {
      const rawDt = (now - lastTime) / 1000;
      lastTime = now;

      const eng = engineRef.current!;
      const inp = inputRef.current;

      eng.update(rawDt, inp);

      // Clear single-frame edge triggers
      inp.shootJustPressed = false;
      inp.shootJustReleased = false;
      inp.passJustPressed = false;
      inp.throughJustPressed = false;
      inp.mouseJustPressed = false;
      inp.mouseJustReleased = false;

      renderGame(ctx, eng, window.innerWidth, window.innerHeight);

      hudTimer += rawDt;
      if (hudTimer >= 0.08) {
        hudTimer = 0;
        syncHud();
      }

      rafId = requestAnimationFrame(frame);
    };

    rafId = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(rafId);
      window.removeEventListener('resize', resize);
    };
  }, [syncHud]);

  // Mouse handlers on canvas for intuitive Penalty Shootout aim & keeper dive
  const updateMouseGoalCoords = (clientX: number, clientY: number) => {
    const w = window.innerWidth;
    const h = window.innerHeight;
    const { goalLeft, goalRight, goalTop, goalBottom } = getPenaltyGoalBounds(
      w,
      h,
    );
    const goalW = goalRight - goalLeft;
    const goalH = goalBottom - goalTop;
    const normX = ((clientX - (goalLeft + goalRight) / 2) / (goalW / 2));
    const normY = (goalBottom - clientY) / goalH;

    inputRef.current.mouseNormX = Math.max(-1.22, Math.min(1.22, normX));
    inputRef.current.mouseNormY = Math.max(0.04, Math.min(1.22, normY));
    inputRef.current.mouseActive = true;
  };

  const handleCanvasPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (engineRef.current?.mode === 'PENALTY_SHOOTOUT') {
      updateMouseGoalCoords(e.clientX, e.clientY);
    }
  };

  const handleCanvasPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    soundEngine.unlock();
    const eng = engineRef.current;
    if (eng?.mode === 'PENALTY_SHOOTOUT' && eng?.screen === 'PLAYING') {
      updateMouseGoalCoords(e.clientX, e.clientY);
      // On touch during attacking turn, dragging aims the target while the HOLD SHOOT button fires;
      // on mouse (or on goalkeeper save turn), tapping the goal triggers immediately.
      if (e.pointerType === 'touch' && eng.penalty.turn === 'HOME' && showTouchControls) {
        return;
      }
      inputRef.current.mouseDown = true;
      inputRef.current.mouseJustPressed = true;
    }
  };

  const handleCanvasPointerUp = () => {
    if (inputRef.current.mouseDown) {
      inputRef.current.mouseDown = false;
      inputRef.current.mouseJustReleased = true;
    }
  };

  const totalPoss =
    hud.stats.homePossessionTicks + hud.stats.awayPossessionTicks;
  const homePossPct =
    totalPoss > 0
      ? Math.round((hud.stats.homePossessionTicks / totalPoss) * 100)
      : 50;
  const awayPossPct = 100 - homePossPct;

  return (
    <div className="relative h-screen w-screen overflow-hidden bg-[#08120c] text-slate-50">
      {/* Isolated 60fps Game Canvas */}
      <canvas
        ref={canvasRef}
        onPointerMove={handleCanvasPointerMove}
        onPointerDown={handleCanvasPointerDown}
        onPointerUp={handleCanvasPointerUp}
        className={`block h-full w-full ${
          hud.screen === 'PLAYING' && hud.mode === 'PENALTY_SHOOTOUT'
            ? 'cursor-crosshair'
            : 'cursor-default'
        }`}
      />

      {/* =================================================================== */}
      {/* TITLE SCREEN OVERLAY                                                */}
      {/* =================================================================== */}
      {hud.screen === 'TITLE' && (
        <div className="absolute inset-0 flex flex-col justify-between overflow-y-auto bg-gradient-to-r from-[#07110c]/94 via-[#07110c]/74 to-[#07110c]/25 p-5 sm:p-8 md:p-14">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5 text-xs font-medium text-slate-300">
              <span>11v11 Pitch</span>
              <span aria-hidden="true">·</span>
              <span>Penalty Shootout</span>
            </div>
            <div className="flex items-center gap-2">
              <PWAInstallButton />
              <button
                type="button"
                onClick={handleToggleMute}
                className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-white/15 bg-slate-900/80 text-slate-200 transition-colors hover:bg-slate-800 focus-visible:outline-2 focus-visible:outline-amber-400"
                aria-label={muted ? 'Unmute audio' : 'Mute audio'}
              >
                {muted ? (
                  <VolumeX className="h-4 w-4" />
                ) : (
                  <Volume2 className="h-4 w-4" />
                )}
              </button>
            </div>
          </div>

          <div className="max-w-lg space-y-7">
            {/* Bespoke SVG Title Lockup */}
            <div className="space-y-3">
              <div className="flex items-center gap-4">
                <svg
                  width="52"
                  height="52"
                  viewBox="0 0 52 52"
                  fill="none"
                  xmlns="http://www.w3.org/2000/svg"
                  aria-hidden="true"
                >
                  <path
                    d="M26 3L46 11V25C46 37.2 37.3 45.6 26 49C14.7 45.6 6 37.2 6 25V11L26 3Z"
                    fill="#0F172A"
                    stroke="#F8FAFC"
                    strokeWidth="2.5"
                  />
                  <path
                    d="M26 9V43M13 21H39"
                    stroke="#22C55E"
                    strokeWidth="2"
                    strokeOpacity="0.65"
                  />
                  <circle
                    cx="26"
                    cy="25"
                    r="8.5"
                    fill="#2563EB"
                    stroke="#F8FAFC"
                    strokeWidth="2"
                  />
                  <text
                    x="26"
                    y="29"
                    textAnchor="middle"
                    fill="#FFFFFF"
                    fontSize="10"
                    fontWeight="700"
                    fontFamily="JetBrains Mono, monospace"
                  >
                    11
                  </text>
                </svg>
                <h1 className="font-display text-6xl font-extrabold tracking-tight text-white md:text-7xl">
                  PITCH 11
                </h1>
              </div>
              <p className="max-w-md text-sm leading-relaxed text-slate-300">
                Full-squad 11-a-side football with fluid sprint and dribble
                physics, tactical AI formations, and a goal-facing penalty
                shootout.
              </p>
            </div>

            {/* Match Setup Controls */}
            <div className="space-y-4 border-t border-white/15 pt-5">
              <div className="space-y-1.5">
                <span className="block text-xs font-medium text-slate-300">
                  Game Mode
                </span>
                <div className="inline-flex rounded-lg border border-white/15 bg-slate-950/85 p-1">
                  <button
                    type="button"
                    onClick={() => setSelectedMode('MATCH')}
                    className={`whitespace-nowrap shrink-0 rounded-md px-4 py-2 text-xs font-semibold transition-colors ${
                      selectedMode === 'MATCH'
                        ? 'bg-blue-600 text-white'
                        : 'text-slate-300 hover:text-white'
                    }`}
                  >
                    11v11 Match
                  </button>
                  <button
                    type="button"
                    onClick={() => setSelectedMode('PENALTY_SHOOTOUT')}
                    className={`whitespace-nowrap shrink-0 rounded-md px-4 py-2 text-xs font-semibold transition-colors ${
                      selectedMode === 'PENALTY_SHOOTOUT'
                        ? 'bg-blue-600 text-white'
                        : 'text-slate-300 hover:text-white'
                    }`}
                  >
                    Penalty Shootout
                  </button>
                </div>
              </div>

              <div className="flex flex-wrap gap-6">
                {selectedMode === 'MATCH' && (
                  <div className="space-y-1.5">
                    <span className="block text-xs font-medium text-slate-300">
                      Formation
                    </span>
                    <div className="inline-flex rounded-lg border border-white/15 bg-slate-950/85 p-1">
                      {(['4-3-3', '4-4-2', '3-5-2'] as FormationId[]).map(
                        (f) => (
                          <button
                            key={f}
                            type="button"
                            onClick={() => setSelectedFormation(f)}
                            className={`whitespace-nowrap shrink-0 rounded-md px-3 py-1.5 font-mono-tabular text-xs font-semibold transition-colors ${
                              selectedFormation === f
                                ? 'bg-slate-200 text-slate-950'
                                : 'text-slate-300 hover:text-white'
                            }`}
                          >
                            {f}
                          </button>
                        ),
                      )}
                    </div>
                  </div>
                )}

                <div className="space-y-1.5">
                  <span className="block text-xs font-medium text-slate-300">
                    Difficulty
                  </span>
                  <div className="inline-flex rounded-lg border border-white/15 bg-slate-950/85 p-1">
                    {(
                      [
                        { id: 'AMATEUR', label: 'Amateur' },
                        { id: 'PRO', label: 'Pro' },
                        { id: 'WORLD_CLASS', label: 'World Class' },
                      ] as const
                    ).map((d) => (
                      <button
                        key={d.id}
                        type="button"
                        onClick={() => setSelectedDifficulty(d.id)}
                        className={`whitespace-nowrap shrink-0 rounded-md px-3 py-1.5 text-xs font-semibold transition-colors ${
                          selectedDifficulty === d.id
                            ? 'bg-slate-200 text-slate-950'
                            : 'text-slate-300 hover:text-white'
                        }`}
                      >
                        {d.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            <div>
              <button
                type="button"
                onClick={handleStart}
                className="inline-flex items-center gap-2.5 whitespace-nowrap rounded-lg bg-emerald-500 px-7 py-3.5 text-sm font-bold text-slate-950 transition-colors hover:bg-emerald-400 focus-visible:outline-2 focus-visible:outline-white"
              >
                <Play className="h-4 w-4 fill-current" />
                {selectedMode === 'MATCH'
                  ? 'Kick Off Match'
                  : 'Start Penalty Shootout'}
              </button>
            </div>
          </div>

          <div className="text-xs text-slate-300">
            WASD / Arrows Move · Shift Sprint · J Pass / Switch · L Through Ball ·
            Space Shoot / Tackle · Esc Pause
          </div>
        </div>
      )}

      {/* =================================================================== */}
      {/* ACTIVE 11v11 MATCH HUD (LOW-OCCLUSION, POINTER-EVENTS-NONE)         */}
      {/* =================================================================== */}
      {hud.screen !== 'TITLE' && hud.mode === 'MATCH' && (
        <div className="pointer-events-none absolute inset-0 flex flex-col justify-between p-4">
          {/* Top Broadcast Scoreboard */}
          <div className="flex items-start justify-between gap-2">
            {/* Compact Player Stamina Indicator on Mobile Top-Left */}
            <div className="rounded-md border border-white/15 bg-slate-950/88 px-2.5 py-1.5 md:hidden">
              <div className="flex items-center gap-1.5 text-[11px] font-semibold text-white">
                <span className="font-mono-tabular text-blue-400">
                  #{hud.activePlayerNumber}
                </span>
                <span>{hud.activePlayerRole}</span>
              </div>
              <div className="mt-1 h-1 w-16 overflow-hidden rounded-xs bg-slate-800">
                <div
                  className="h-full origin-left bg-sky-400"
                  style={{
                    transform: `scaleX(${hud.activePlayerStamina / 100})`,
                  }}
                />
              </div>
            </div>
            <div className="hidden w-28 md:block" />

            <div className="flex items-center overflow-hidden rounded-md border border-white/15 bg-slate-950/90 shadow-lg">
              <div className="flex items-center gap-2 border-r border-white/10 px-2.5 py-1.5 sm:gap-2.5 sm:px-3.5">
                <span className="h-3.5 w-1.5 rounded-xs bg-blue-500" />
                <span className="font-display text-sm font-bold tracking-wide text-white sm:text-base">
                  HOME
                </span>
                <span className="font-mono-tabular text-base font-bold text-white sm:text-lg">
                  {hud.homeScore}
                </span>
              </div>
              <div className="flex flex-col items-center px-2.5 py-1 sm:px-3.5">
                <span className="font-mono-tabular text-xs font-bold leading-tight text-emerald-400 sm:text-sm">
                  {formatMatchClock(hud.clockSeconds, hud.halfDurationSeconds)}
                </span>
                <span className="text-[10px] font-medium leading-tight text-slate-400">
                  {hud.half === 1 ? '1st' : '2nd'}
                </span>
              </div>
              <div className="flex items-center gap-2 border-l border-white/10 px-2.5 py-1.5 sm:gap-2.5 sm:px-3.5">
                <span className="font-mono-tabular text-base font-bold text-white sm:text-lg">
                  {hud.awayScore}
                </span>
                <span className="font-display text-sm font-bold tracking-wide text-white sm:text-base">
                  AWAY
                </span>
                <span className="h-3.5 w-1.5 rounded-xs bg-red-500" />
              </div>
            </div>

            {/* Touch Toggle, Sound & Pause Buttons */}
            <div className="pointer-events-auto flex items-center gap-1.5 sm:gap-2">
              <button
                type="button"
                onClick={() => setShowTouchControls((v) => !v)}
                className={`inline-flex h-10 w-10 items-center justify-center rounded-md border transition-colors ${
                  showTouchControls
                    ? 'border-emerald-400/50 bg-emerald-500/20 text-emerald-300'
                    : 'border-white/15 bg-slate-950/88 text-slate-200 hover:bg-slate-800'
                }`}
                aria-label="Toggle on-screen touch controls"
                title="Toggle touch controls"
              >
                <Gamepad2 className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={handleToggleMute}
                className="inline-flex h-10 w-10 items-center justify-center rounded-md border border-white/15 bg-slate-950/88 text-slate-200 transition-colors hover:bg-slate-800"
                aria-label={muted ? 'Unmute audio' : 'Mute audio'}
              >
                {muted ? (
                  <VolumeX className="h-4 w-4" />
                ) : (
                  <Volume2 className="h-4 w-4" />
                )}
              </button>
              <button
                type="button"
                onClick={handlePauseToggle}
                className="inline-flex h-10 w-10 items-center justify-center rounded-md border border-white/15 bg-slate-950/88 text-slate-200 transition-colors hover:bg-slate-800"
                aria-label="Pause match"
              >
                <Pause className="h-4 w-4" />
              </button>
            </div>
          </div>

          {/* Goal Celebration Banner */}
          {hud.goalBannerText && (
            <div className="mx-auto my-auto flex flex-col items-center rounded-lg border border-white/20 bg-slate-950/92 px-8 py-4 text-center shadow-2xl">
              <div className="font-display text-4xl font-extrabold tracking-tight text-amber-400 sm:text-5xl">
                {hud.goalBannerText}
              </div>
              {hud.goalBannerSub && (
                <div className="mt-1 font-mono-tabular text-sm font-medium text-slate-200">
                  {hud.goalBannerSub}
                </div>
              )}
            </div>
          )}

          {/* Bottom-left Controlled Player Status (Desktop) */}
          <div className="hidden items-end justify-between md:flex">
            <div className="rounded-md border border-white/15 bg-slate-950/88 px-3.5 py-2">
              <div className="flex items-center gap-2 text-xs font-semibold text-white">
                <span className="font-mono-tabular text-blue-400">
                  #{hud.activePlayerNumber}
                </span>
                <span>{hud.activePlayerRole}</span>
                <span aria-hidden="true" className="text-slate-500">
                  ·
                </span>
                <span className="font-mono-tabular text-slate-300">
                  {hud.activePlayerStamina}% Stamina
                </span>
              </div>
              <div className="mt-1.5 h-1.5 w-36 overflow-hidden rounded-xs bg-slate-800">
                <div
                  className="h-full origin-left bg-sky-400 transition-transform duration-75"
                  style={{
                    transform: `scaleX(${hud.activePlayerStamina / 100})`,
                  }}
                />
              </div>
            </div>

            <div className="rounded-md border border-white/10 bg-slate-950/80 px-3 py-1.5 text-[11px] text-slate-300">
              J Pass / Switch · L Through · Hold Space Shoot · Space (Off-ball)
              Tackle
            </div>
          </div>
        </div>
      )}

      {/* =================================================================== */}
      {/* PENALTY SHOOTOUT HUD                                                */}
      {/* =================================================================== */}
      {hud.screen !== 'TITLE' && hud.mode === 'PENALTY_SHOOTOUT' && (
        <div className="pointer-events-none absolute inset-0 flex flex-col justify-between p-4">
          <div className="flex items-start justify-between">
            <div className="w-20" />

            {/* Penalty Shootout Scoreboard & Kick Pips */}
            <div className="flex flex-col items-center gap-2 rounded-md border border-white/15 bg-slate-950/92 px-5 py-2.5 shadow-xl">
              <div className="flex items-center gap-5">
                <div className="flex items-center gap-2">
                  <span className="h-3.5 w-1.5 rounded-xs bg-blue-500" />
                  <span className="font-display text-lg font-bold text-white">
                    HOME
                  </span>
                  <span className="font-mono-tabular text-2xl font-bold text-white">
                    {hud.penalty.homeScore}
                  </span>
                </div>

                <div className="border-x border-white/15 px-3 text-center">
                  <div className="text-[11px] font-semibold text-amber-400">
                    {hud.penalty.suddenDeath
                      ? 'Sudden Death'
                      : `Round ${hud.penalty.round} of 5`}
                  </div>
                  <div className="text-[10px] text-slate-400">
                    {hud.penalty.turn === 'HOME'
                      ? 'Your Kick'
                      : 'Your Save (GK)'}
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <span className="font-mono-tabular text-2xl font-bold text-white">
                    {hud.penalty.awayScore}
                  </span>
                  <span className="font-display text-lg font-bold text-white">
                    AWAY
                  </span>
                  <span className="h-3.5 w-1.5 rounded-xs bg-red-500" />
                </div>
              </div>

              <div className="flex items-center gap-6 border-t border-white/10 pt-2">
                <div className="flex items-center gap-1.5">
                  {hud.penalty.homeKicks.map((k, idx) => (
                    <KickStatusIcon key={`hk-${idx}`} outcome={k} />
                  ))}
                </div>
                <span className="text-[10px] text-slate-500">vs</span>
                <div className="flex items-center gap-1.5">
                  {hud.penalty.awayKicks.map((k, idx) => (
                    <KickStatusIcon key={`ak-${idx}`} outcome={k} />
                  ))}
                </div>
              </div>
            </div>

            <div className="pointer-events-auto flex items-center gap-2">
              <button
                type="button"
                onClick={handleToggleMute}
                className="inline-flex h-10 w-10 items-center justify-center rounded-md border border-white/15 bg-slate-950/88 text-slate-200 transition-colors hover:bg-slate-800"
                aria-label={muted ? 'Unmute audio' : 'Mute audio'}
              >
                {muted ? (
                  <VolumeX className="h-4 w-4" />
                ) : (
                  <Volume2 className="h-4 w-4" />
                )}
              </button>
              <button
                type="button"
                onClick={handlePauseToggle}
                className="inline-flex h-10 w-10 items-center justify-center rounded-md border border-white/15 bg-slate-950/88 text-slate-200 transition-colors hover:bg-slate-800"
                aria-label="Pause shootout"
              >
                <Pause className="h-4 w-4" />
              </button>
            </div>
          </div>

          {/* Outcome Callout */}
          {hud.penalty.phase === 'RESULT' && hud.penalty.resultBanner && (
            <div className="mx-auto my-auto rounded-lg border border-white/20 bg-slate-950/92 px-8 py-4 text-center shadow-2xl">
              <div className="font-display text-5xl font-extrabold tracking-tight text-amber-400">
                {hud.penalty.resultBanner}
              </div>
              <div className="mt-1 text-sm font-medium text-slate-200">
                {hud.penalty.resultSub}
              </div>
            </div>
          )}

          {/* Contextual Shootout Instruction Line */}
          {hud.penalty.phase !== 'FINISHED' && (
            <div className="mx-auto rounded-md border border-white/15 bg-slate-950/88 px-4 py-2 text-xs font-medium text-slate-200">
              {hud.penalty.turn === 'HOME'
                ? 'Attack: Aim with Mouse or Arrows · Hold Space / Click to Charge & Release to Shoot'
                : hud.penalty.keeperCommitted
                  ? 'Dive locked — hold your nerve!'
                  : 'Goalkeeper: Click any zone in the goal or press A / W / D / Arrows to Dive'}
            </div>
          )}
        </div>
      )}

      {/* =================================================================== */}
      {/* PAUSE MODAL                                                         */}
      {/* =================================================================== */}
      {hud.screen === 'PAUSED' && (
        <div className="absolute inset-0 flex items-center justify-center bg-slate-950/75 p-4">
          <div className="w-full max-w-sm rounded-lg border border-white/15 bg-slate-900 p-6 shadow-2xl">
            <h2 className="font-display text-3xl font-bold text-white">
              Match Paused
            </h2>
            <p className="mt-1 text-xs text-slate-400">
              {hud.mode === 'MATCH'
                ? `Home ${hud.homeScore} – ${hud.awayScore} Away`
                : `Shootout ${hud.penalty.homeScore} – ${hud.penalty.awayScore}`}
            </p>
            <div className="mt-6 flex flex-col gap-2.5">
              <button
                type="button"
                onClick={handlePauseToggle}
                className="w-full rounded-md bg-emerald-500 px-4 py-2.5 text-sm font-bold text-slate-950 transition-colors hover:bg-emerald-400"
              >
                Resume
              </button>
              <button
                type="button"
                onClick={handleStart}
                className="w-full rounded-md border border-white/15 bg-slate-800 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-slate-700"
              >
                Restart
              </button>
              <button
                type="button"
                onClick={handleReturnToTitle}
                className="w-full rounded-md border border-white/15 bg-transparent px-4 py-2.5 text-sm font-medium text-slate-300 transition-colors hover:bg-slate-800 hover:text-white"
              >
                Main Menu
              </button>
            </div>
          </div>
        </div>
      )}

      {/* =================================================================== */}
      {/* HALFTIME MODAL                                                      */}
      {/* =================================================================== */}
      {hud.screen === 'HALFTIME' && (
        <div className="absolute inset-0 flex items-center justify-center bg-slate-950/78 p-4">
          <div className="w-full max-w-md rounded-lg border border-white/15 bg-slate-900 p-6 shadow-2xl">
            <div className="text-xs font-medium text-emerald-400">
              Half-Time Whistle
            </div>
            <h2 className="mt-1 font-display text-4xl font-extrabold text-white">
              HOME{' '}
              <span className="font-mono-tabular text-blue-400">
                {hud.homeScore}
              </span>{' '}
              –{' '}
              <span className="font-mono-tabular text-red-400">
                {hud.awayScore}
              </span>{' '}
              AWAY
            </h2>

            <div className="mt-5 space-y-2.5 border-y border-white/10 py-4 text-xs">
              <div className="flex justify-between">
                <span className="font-mono-tabular font-semibold text-white">
                  {hud.stats.homeShots}
                </span>
                <span className="text-slate-400">Total Shots</span>
                <span className="font-mono-tabular font-semibold text-white">
                  {hud.stats.awayShots}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="font-mono-tabular font-semibold text-white">
                  {homePossPct}%
                </span>
                <span className="text-slate-400">Possession</span>
                <span className="font-mono-tabular font-semibold text-white">
                  {awayPossPct}%
                </span>
              </div>
              <div className="flex justify-between">
                <span className="font-mono-tabular font-semibold text-white">
                  {hud.stats.homeSaves}
                </span>
                <span className="text-slate-400">Keeper Saves</span>
                <span className="font-mono-tabular font-semibold text-white">
                  {hud.stats.awaySaves}
                </span>
              </div>
            </div>

            <div className="mt-5">
              <button
                type="button"
                onClick={() => {
                  soundEngine.unlock();
                  engineRef.current!.resumeSecondHalf();
                  syncHud();
                }}
                className="w-full rounded-md bg-emerald-500 px-5 py-3 text-sm font-bold text-slate-950 transition-colors hover:bg-emerald-400"
              >
                Start Second Half
              </button>
            </div>
          </div>
        </div>
      )}

      {/* =================================================================== */}
      {/* FULL-TIME MODAL (WITH INSTANT PENALTY SHOOTOUT OPTION ON DRAW!)     */}
      {/* =================================================================== */}
      {hud.screen === 'FULLTIME' && (
        <div className="absolute inset-0 flex items-center justify-center bg-slate-950/80 p-4">
          <div className="w-full max-w-md rounded-lg border border-white/15 bg-slate-900 p-6 shadow-2xl">
            <div className="flex items-center gap-2 text-xs font-medium text-amber-400">
              <Trophy className="h-4 w-4" />
              <span>
                {hud.homeScore > hud.awayScore
                  ? 'Full-Time · Home Victory'
                  : hud.awayScore > hud.homeScore
                    ? 'Full-Time · Away Victory'
                    : 'Full-Time · Match Drawn'}
              </span>
            </div>

            <h2 className="mt-1 font-display text-4xl font-extrabold text-white">
              HOME{' '}
              <span className="font-mono-tabular text-blue-400">
                {hud.homeScore}
              </span>{' '}
              –{' '}
              <span className="font-mono-tabular text-red-400">
                {hud.awayScore}
              </span>{' '}
              AWAY
            </h2>

            <div className="mt-5 space-y-2.5 border-y border-white/10 py-4 text-xs">
              <div className="flex justify-between">
                <span className="font-mono-tabular font-semibold text-white">
                  {hud.stats.homeShots}
                </span>
                <span className="text-slate-400">Total Shots</span>
                <span className="font-mono-tabular font-semibold text-white">
                  {hud.stats.awayShots}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="font-mono-tabular font-semibold text-white">
                  {homePossPct}%
                </span>
                <span className="text-slate-400">Possession</span>
                <span className="font-mono-tabular font-semibold text-white">
                  {awayPossPct}%
                </span>
              </div>
              <div className="flex justify-between">
                <span className="font-mono-tabular font-semibold text-white">
                  {hud.stats.homeSaves}
                </span>
                <span className="text-slate-400">Keeper Saves</span>
                <span className="font-mono-tabular font-semibold text-white">
                  {hud.stats.awaySaves}
                </span>
              </div>
            </div>

            <div className="mt-5 flex flex-col gap-2.5">
              {hud.homeScore === hud.awayScore && (
                <button
                  type="button"
                  onClick={() => {
                    soundEngine.unlock();
                    engineRef.current!.startPenaltyFromDraw();
                    syncHud();
                  }}
                  className="w-full rounded-md bg-amber-400 px-5 py-3 text-sm font-bold text-slate-950 transition-colors hover:bg-amber-300"
                >
                  Decide by Penalty Shootout
                </button>
              )}
              <button
                type="button"
                onClick={handleStart}
                className="inline-flex w-full items-center justify-center gap-2 rounded-md bg-emerald-500 px-5 py-2.5 text-sm font-bold text-slate-950 transition-colors hover:bg-emerald-400"
              >
                <RotateCcw className="h-4 w-4" />
                Play Again
              </button>
              <button
                type="button"
                onClick={handleReturnToTitle}
                className="w-full rounded-md border border-white/15 bg-transparent px-5 py-2.5 text-sm font-medium text-slate-300 transition-colors hover:bg-slate-800 hover:text-white"
              >
                Main Menu
              </button>
            </div>
          </div>
        </div>
      )}

      {/* =================================================================== */}
      {/* PENALTY SHOOTOUT FINISHED MODAL                                     */}
      {/* =================================================================== */}
      {hud.mode === 'PENALTY_SHOOTOUT' &&
        hud.screen === 'PLAYING' &&
        hud.penalty.phase === 'FINISHED' && (
          <div className="absolute inset-0 flex items-center justify-center bg-slate-950/78 p-4">
            <div className="w-full max-w-md rounded-lg border border-white/15 bg-slate-900 p-6 text-center shadow-2xl">
              <div className="mx-auto mb-2 inline-flex h-11 w-11 items-center justify-center rounded-lg bg-amber-400/15 text-amber-400">
                <Trophy className="h-6 w-6" />
              </div>
              <h2 className="font-display text-4xl font-extrabold text-white">
                {hud.penalty.winner === 'HOME'
                  ? 'Penalty Shootout Winners'
                  : 'Shootout Defeat'}
              </h2>
              <p className="mt-1 font-mono-tabular text-lg font-bold text-slate-200">
                HOME {hud.penalty.homeScore} – {hud.penalty.awayScore} AWAY
              </p>

              <div className="mt-4 flex justify-center gap-6 border-y border-white/10 py-3">
                <div className="flex items-center gap-1.5">
                  {hud.penalty.homeKicks.map((k, idx) => (
                    <KickStatusIcon key={`fin-hk-${idx}`} outcome={k} />
                  ))}
                </div>
                <div className="flex items-center gap-1.5">
                  {hud.penalty.awayKicks.map((k, idx) => (
                    <KickStatusIcon key={`fin-ak-${idx}`} outcome={k} />
                  ))}
                </div>
              </div>

              <div className="mt-5 flex flex-col gap-2.5">
                <button
                  type="button"
                  onClick={() => {
                    soundEngine.unlock();
                    engineRef.current!.startNewMatch(
                      'PENALTY_SHOOTOUT',
                      selectedFormation,
                      selectedDifficulty,
                    );
                    syncHud();
                  }}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-md bg-emerald-500 px-5 py-3 text-sm font-bold text-slate-950 transition-colors hover:bg-emerald-400"
                >
                  <RotateCcw className="h-4 w-4" />
                  Play Shootout Again
                </button>
                <button
                  type="button"
                  onClick={handleReturnToTitle}
                  className="w-full rounded-md border border-white/15 bg-transparent px-5 py-2.5 text-sm font-medium text-slate-300 transition-colors hover:bg-slate-800 hover:text-white"
                >
                  Main Menu
                </button>
              </div>
            </div>
          </div>
        )}

      {/* =================================================================== */}
      {/* MOBILE MULTI-TOUCH GAMEPAD OVERLAY                                  */}
      {/* =================================================================== */}
      {hud.screen === 'PLAYING' && showTouchControls && (
        <MobileControls
          mode={hud.mode}
          penaltyTurn={hud.penalty.turn}
          penaltyPhase={hud.penalty.phase}
          inputRef={inputRef}
        />
      )}

      {/* Offline Connectivity Banner */}
      <OfflineIndicator />
    </div>
  );
}

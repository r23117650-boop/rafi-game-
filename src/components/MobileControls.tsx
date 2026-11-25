import React, { useRef, useState } from 'react';
import { soundEngine } from '../game/audio';
import type { GameMode, InputState, PenaltyPhase, TeamSide } from '../game/types';

interface MobileControlsProps {
  mode: GameMode;
  penaltyTurn: TeamSide;
  penaltyPhase: PenaltyPhase;
  inputRef: React.MutableRefObject<InputState>;
}

export const MobileControls: React.FC<MobileControlsProps> = ({
  mode,
  penaltyTurn,
  penaltyPhase,
  inputRef,
}) => {
  const joyRef = useRef<HTMLDivElement | null>(null);
  const joyTouchIdRef = useRef<number | null>(null);
  const [knobPos, setKnobPos] = useState({ x: 0, y: 0 });
  const [activeBtn, setActiveBtn] = useState<string | null>(null);

  const maxRadius = 42;

  const updateJoystickFromClient = (clientX: number, clientY: number) => {
    const el = joyRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    let dx = clientX - cx;
    let dy = clientY - cy;
    const dist = Math.hypot(dx, dy);
    if (dist > maxRadius) {
      dx = (dx / dist) * maxRadius;
      dy = (dy / dist) * maxRadius;
    }
    setKnobPos({ x: dx, y: dy });
    inputRef.current.analogX = dx / maxRadius;
    inputRef.current.analogY = dy / maxRadius;
  };

  const resetJoystick = () => {
    joyTouchIdRef.current = null;
    setKnobPos({ x: 0, y: 0 });
    inputRef.current.analogX = 0;
    inputRef.current.analogY = 0;
  };

  const handleJoyTouchStart = (e: React.TouchEvent<HTMLDivElement>) => {
    e.preventDefault();
    soundEngine.unlock();
    if (joyTouchIdRef.current !== null) return;
    const touch = e.changedTouches[0];
    if (!touch) return;
    joyTouchIdRef.current = touch.identifier;
    updateJoystickFromClient(touch.clientX, touch.clientY);
  };

  const handleJoyTouchMove = (e: React.TouchEvent<HTMLDivElement>) => {
    e.preventDefault();
    for (let i = 0; i < e.changedTouches.length; i++) {
      const t = e.changedTouches[i];
      if (t.identifier === joyTouchIdRef.current) {
        updateJoystickFromClient(t.clientX, t.clientY);
        break;
      }
    }
  };

  const handleJoyTouchEnd = (e: React.TouchEvent<HTMLDivElement>) => {
    e.preventDefault();
    for (let i = 0; i < e.changedTouches.length; i++) {
      if (e.changedTouches[i].identifier === joyTouchIdRef.current) {
        resetJoystick();
        break;
      }
    }
  };

  // Penalty Shootout touch helper: dedicated Hold-to-Shoot button on attack turn
  if (mode === 'PENALTY_SHOOTOUT') {
    if (
      penaltyTurn === 'HOME' &&
      (penaltyPhase === 'AIMING' || penaltyPhase === 'CHARGING')
    ) {
      return (
        <div className="pointer-events-none absolute inset-x-0 bottom-14 z-20 flex items-center justify-end px-6">
          <button
            type="button"
            onTouchStart={(e) => {
              e.preventDefault();
              soundEngine.unlock();
              if (!inputRef.current.shootHeld) {
                inputRef.current.shootJustPressed = true;
              }
              inputRef.current.shootHeld = true;
              setActiveBtn('pen-shoot');
            }}
            onTouchEnd={(e) => {
              e.preventDefault();
              if (inputRef.current.shootHeld) {
                inputRef.current.shootJustReleased = true;
              }
              inputRef.current.shootHeld = false;
              setActiveBtn(null);
            }}
            onTouchCancel={() => {
              inputRef.current.shootHeld = false;
              setActiveBtn(null);
            }}
            style={{ touchAction: 'none' }}
            className={`pointer-events-auto flex h-20 w-20 items-center justify-center rounded-full border-2 text-center text-xs font-extrabold tracking-wide shadow-xl transition-transform ${
              activeBtn === 'pen-shoot'
                ? 'scale-95 border-amber-300 bg-amber-400 text-slate-950'
                : 'border-emerald-300/80 bg-emerald-500/90 text-slate-950'
            }`}
          >
            HOLD
            <br />
            SHOOT
          </button>
        </div>
      );
    }
    return null;
  }

  // 11v11 Match Virtual Gamepad
  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 flex items-end justify-between px-4 pb-5 sm:px-7 sm:pb-6">
      {/* Left-thumb 360 Virtual Joystick */}
      <div
        ref={joyRef}
        onTouchStart={handleJoyTouchStart}
        onTouchMove={handleJoyTouchMove}
        onTouchEnd={handleJoyTouchEnd}
        onTouchCancel={handleJoyTouchEnd}
        style={{ touchAction: 'none' }}
        className="pointer-events-auto relative flex h-32 w-32 items-center justify-center rounded-full border border-white/20 bg-slate-950/45 shadow-lg"
        aria-label="Move joystick"
      >
        <div className="h-16 w-16 rounded-full border border-white/10" />
        <div
          style={{
            transform: `translate(${knobPos.x}px, ${knobPos.y}px)`,
          }}
          className="absolute h-12 w-12 rounded-full border-2 border-white/80 bg-blue-500/80 shadow-md"
        />
      </div>

      {/* Right-thumb Ergonomic Action Cluster */}
      <div className="pointer-events-auto relative h-36 w-44">
        {/* Sprint (top-left of cluster) */}
        <button
          type="button"
          onTouchStart={(e) => {
            e.preventDefault();
            soundEngine.unlock();
            inputRef.current.sprint = true;
            setActiveBtn('sprint');
          }}
          onTouchEnd={(e) => {
            e.preventDefault();
            inputRef.current.sprint = false;
            setActiveBtn(null);
          }}
          onTouchCancel={() => {
            inputRef.current.sprint = false;
            setActiveBtn(null);
          }}
          style={{ touchAction: 'none' }}
          className={`absolute left-0 top-1 flex h-12 w-12 items-center justify-center rounded-full border text-[11px] font-bold shadow-md transition-transform ${
            activeBtn === 'sprint'
              ? 'scale-95 border-sky-300 bg-sky-400 text-slate-950'
              : 'border-white/25 bg-slate-900/80 text-slate-100'
          }`}
        >
          RUN
        </button>

        {/* Through Ball (top-right) */}
        <button
          type="button"
          onTouchStart={(e) => {
            e.preventDefault();
            soundEngine.unlock();
            inputRef.current.throughJustPressed = true;
            setActiveBtn('thru');
          }}
          onTouchEnd={(e) => {
            e.preventDefault();
            setActiveBtn(null);
          }}
          style={{ touchAction: 'none' }}
          className={`absolute right-2 top-0 flex h-13 w-13 items-center justify-center rounded-full border text-[11px] font-bold shadow-md transition-transform ${
            activeBtn === 'thru'
              ? 'scale-95 border-amber-300 bg-amber-400 text-slate-950'
              : 'border-white/25 bg-slate-900/80 text-amber-300'
          }`}
        >
          THRU
        </button>

        {/* Pass / Switch (bottom-left) */}
        <button
          type="button"
          onTouchStart={(e) => {
            e.preventDefault();
            soundEngine.unlock();
            inputRef.current.passJustPressed = true;
            setActiveBtn('pass');
          }}
          onTouchEnd={(e) => {
            e.preventDefault();
            setActiveBtn(null);
          }}
          style={{ touchAction: 'none' }}
          className={`absolute bottom-1 left-2 flex h-14 w-14 items-center justify-center rounded-full border text-xs font-extrabold shadow-md transition-transform ${
            activeBtn === 'pass'
              ? 'scale-95 border-blue-300 bg-blue-500 text-white'
              : 'border-blue-400/50 bg-blue-600/85 text-white'
          }`}
        >
          PASS
        </button>

        {/* Primary Shoot / Tackle (bottom-right) */}
        <button
          type="button"
          onTouchStart={(e) => {
            e.preventDefault();
            soundEngine.unlock();
            if (!inputRef.current.shootHeld) {
              inputRef.current.shootJustPressed = true;
            }
            inputRef.current.shootHeld = true;
            setActiveBtn('shoot');
          }}
          onTouchEnd={(e) => {
            e.preventDefault();
            if (inputRef.current.shootHeld) {
              inputRef.current.shootJustReleased = true;
            }
            inputRef.current.shootHeld = false;
            setActiveBtn(null);
          }}
          onTouchCancel={() => {
            inputRef.current.shootHeld = false;
            setActiveBtn(null);
          }}
          style={{ touchAction: 'none' }}
          className={`absolute bottom-0 right-0 flex h-18 w-18 items-center justify-center rounded-full border-2 text-xs font-extrabold shadow-xl transition-transform ${
            activeBtn === 'shoot'
              ? 'scale-95 border-amber-300 bg-amber-400 text-slate-950'
              : 'border-emerald-300/80 bg-emerald-500/90 text-slate-950'
          }`}
        >
          SHOOT
        </button>
      </div>
    </div>
  );
};

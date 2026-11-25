import type { FormationId, Player, PlayerRole, TeamSide } from './types';

export interface FormationSlot {
  number: number;
  role: PlayerRole;
  /** Normalized pitch position for HOME team attacking left -> right (0.04..0.95) */
  nx: number;
  /** Normalized pitch width (0.08..0.92) */
  ny: number;
}

export const FORMATIONS: Record<FormationId, FormationSlot[]> = {
  '4-3-3': [
    { number: 1, role: 'GK', nx: 0.038, ny: 0.5 },
    { number: 2, role: 'DEF', nx: 0.21, ny: 0.16 },
    { number: 4, role: 'DEF', nx: 0.17, ny: 0.38 },
    { number: 5, role: 'DEF', nx: 0.17, ny: 0.62 },
    { number: 3, role: 'DEF', nx: 0.21, ny: 0.84 },
    { number: 6, role: 'MID', nx: 0.33, ny: 0.5 },
    { number: 8, role: 'MID', nx: 0.39, ny: 0.28 },
    { number: 10, role: 'MID', nx: 0.39, ny: 0.72 },
    { number: 7, role: 'FWD', nx: 0.465, ny: 0.18 },
    { number: 9, role: 'FWD', nx: 0.48, ny: 0.5 },
    { number: 11, role: 'FWD', nx: 0.465, ny: 0.82 },
  ],
  '4-4-2': [
    { number: 1, role: 'GK', nx: 0.038, ny: 0.5 },
    { number: 2, role: 'DEF', nx: 0.2, ny: 0.15 },
    { number: 4, role: 'DEF', nx: 0.17, ny: 0.38 },
    { number: 5, role: 'DEF', nx: 0.17, ny: 0.62 },
    { number: 3, role: 'DEF', nx: 0.2, ny: 0.85 },
    { number: 7, role: 'MID', nx: 0.37, ny: 0.14 },
    { number: 6, role: 'MID', nx: 0.34, ny: 0.38 },
    { number: 8, role: 'MID', nx: 0.34, ny: 0.62 },
    { number: 11, role: 'MID', nx: 0.37, ny: 0.86 },
    { number: 9, role: 'FWD', nx: 0.475, ny: 0.39 },
    { number: 10, role: 'FWD', nx: 0.475, ny: 0.61 },
  ],
  '3-5-2': [
    { number: 1, role: 'GK', nx: 0.038, ny: 0.5 },
    { number: 4, role: 'DEF', nx: 0.18, ny: 0.26 },
    { number: 5, role: 'DEF', nx: 0.16, ny: 0.5 },
    { number: 3, role: 'DEF', nx: 0.18, ny: 0.74 },
    { number: 2, role: 'MID', nx: 0.35, ny: 0.12 },
    { number: 6, role: 'MID', nx: 0.31, ny: 0.36 },
    { number: 8, role: 'MID', nx: 0.31, ny: 0.64 },
    { number: 10, role: 'MID', nx: 0.4, ny: 0.5 },
    { number: 7, role: 'MID', nx: 0.35, ny: 0.88 },
    { number: 9, role: 'FWD', nx: 0.475, ny: 0.38 },
    { number: 11, role: 'FWD', nx: 0.475, ny: 0.62 },
  ],
};

export const PITCH = {
  worldW: 1700,
  worldH: 1060,
  marginX: 110,
  marginY: 90,
  fieldW: 1480,
  fieldH: 880,
  goalW: 52,
  goalH: 184,
  penaltyBoxW: 230,
  penaltyBoxH: 460,
  sixYardW: 82,
  sixYardH: 240,
  penaltySpotDist: 162,
  centerCircleR: 124,
  playerRadius: 15,
  ballRadius: 8.5,
} as const;

export function createTeamPlayers(
  team: TeamSide,
  formation: FormationId,
): Player[] {
  const slots = FORMATIONS[formation];
  return slots.map((slot, idx) => {
    const nx = team === 'HOME' ? slot.nx : 1 - slot.nx;
    const ny = team === 'HOME' ? slot.ny : 1 - slot.ny;
    const x = PITCH.marginX + nx * PITCH.fieldW;
    const y = PITCH.marginY + ny * PITCH.fieldH;
    return {
      id: `${team}_${slot.number}_${idx}`,
      team,
      number: slot.number,
      role: slot.role,
      baseNx: nx,
      baseNy: ny,
      x,
      y,
      vx: 0,
      vy: 0,
      facing: team === 'HOME' ? 0 : Math.PI,
      stamina: 100,
      stridePhase: (idx * 0.7) % (Math.PI * 2),
      isSprinting: false,
      tackleTimer: 0,
      tackleCooldown: 0,
      stunTimer: 0,
      kickAnimTimer: 0,
      diveTimer: 0,
      diveDirY: 0,
      aiDecisionTimer: 0.08 * idx,
    };
  });
}

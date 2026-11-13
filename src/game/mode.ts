/* ============================================================
   GAME MODE — which mode the player picked on the Home Screen
   ============================================================ */

/** The modes the Home Screen can start. ("Play with friends!" is not one yet: online is not set up.) */
export type GameMode = 'survival' | 'creative';

export const Game = {
  /** The mode being played, or null while the Home Screen is up. */
  mode: null as GameMode | null
};

export function setGameMode(mode: GameMode): void { Game.mode = mode; }

/** True for a value that names a mode (for example one restored by a hot reload). */
export function isGameMode(v: unknown): v is GameMode { return v === 'survival' || v === 'creative'; }

/*
 * TODO(creative): Creative mode currently plays exactly like Survival. Creative-only features
 * (building, free camera, no hazards…) should check `Game.mode === 'creative'`.
 */

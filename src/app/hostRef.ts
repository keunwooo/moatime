import type { SceneHost } from '../scene/host';

/** The mounted scene host (for dev inspection tools). */
export const hostRef: { current: SceneHost | null } = { current: null };

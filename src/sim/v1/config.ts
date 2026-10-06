/**
 * Tuning values for the work simulation (initial values; adjust here, not in code).
 *
 * Every duration is running time (ms of W): nothing advances while paused, idle or after a
 * countdown ended. Changing any value that affects the outcome must bump SIM_VERSION so cached
 * checkpoints are discarded and replayed with the new rules.
 */

/** Version of the simulation rules below (checkpoints from another version are ignored). */
export const SIM_VERSION = 1;

// ---------------------------------------------------------------------------
// Space — automatic outpost

export type SpaceKind = 'power' | 'habitat' | 'greenhouse' | 'observatory' | 'comms' | 'workshop' | 'hub';

export type SpaceStageId = 'foundation' | 'floor' | 'frame' | 'walls' | 'parts' | 'power' | 'inspect';

export interface StageDef {
  id: SpaceStageId;
  /** Assembly time with one rover and no habitat bonus. */
  ms: number;
  /** Range of the facility's visual progress (0..1) this stage covers. */
  u: [number, number];
}

export const SPACE = {
  /** Rover driving speed in world units per second (distances use the wide layout). */
  speed: 50,
  /** Crates a rover carries per trip. */
  load: 2,
  drillMs: 6500,
  loadOreMs: 2200,
  unloadMs: 3000,
  pickMs: 2000,
  dropMs: 2200,
  /** Scanning a not-yet-surveyed deposit before the first trip there. */
  surveyMs: 9000,
  idleMs: 9000,
  /** Greenhouse care visit and its interval per greenhouse. */
  careMs: 9000,
  careEveryMs: 7 * 60_000,
  /** Physical crate slots at a depot. Must be ≥ the largest facility cost. */
  depotCap: 16,
  /** Total rovers (the first one plus helpers from workshops). */
  maxRovers: 3,
  costs: { power: 6, habitat: 8, greenhouse: 8, observatory: 8, comms: 6, workshop: 8, hub: 10 } as Record<SpaceKind, number>,
  stages: [
    { id: 'foundation', ms: 34_000, u: [0.07, 0.2] },
    { id: 'floor', ms: 40_000, u: [0.2, 0.27] },
    { id: 'frame', ms: 100_000, u: [0.27, 0.45] },
    { id: 'walls', ms: 150_000, u: [0.45, 0.7] },
    { id: 'parts', ms: 100_000, u: [0.7, 0.85] },
    { id: 'power', ms: 40_000, u: [0.85, 0.92] },
    { id: 'inspect', ms: 22_000, u: [0.92, 1] },
  ] as StageDef[],
  /** Crates consumed by each stage (same order as `stages`); sums equal the cost. */
  stageMaterials: {
    power: [1, 1, 1, 2, 1, 0, 0],
    habitat: [1, 1, 2, 3, 1, 0, 0],
    greenhouse: [1, 1, 2, 3, 1, 0, 0],
    observatory: [1, 1, 2, 2, 2, 0, 0],
    comms: [1, 1, 1, 1, 2, 0, 0],
    workshop: [1, 1, 2, 2, 2, 0, 0],
    hub: [2, 1, 2, 3, 2, 0, 0],
  } as Record<SpaceKind, number[]>,
  /** Crew from each habitat helps assembly a little (up to `habitatMax` habitats). */
  habitatSpeedup: 0.04,
  habitatMax: 2,
  /** Rover battery (milli-units) and use per second of each activity. */
  battery: {
    cap: 100_000,
    /** Charge before starting a job below this level. */
    low: 28_000,
    /** Charging speed when the grid has enough stored power (milli-units per second). */
    chargeRate: 5_000,
    use: { drive: 260, drill: 650, build: 220, handle: 120, scan: 150, idle: 0 },
  },
  /** Base battery at the lander: always trickle-charged, so work never stops for good. */
  grid: { cap: 400_000, start: 300_000, base: 120, perSolar: 1_300 },
} as const;

// ---------------------------------------------------------------------------
// Forest — keeper's garden cycle

export const FOREST = {
  /** Keeper walking speed in world units per second. */
  speed: 30,
  canCap: 3,
  seedStart: 3,
  pouchCap: 8,
  basketCap: 6,
  fillMs: 5000,
  clearMs: 7000,
  plantMs: 5000,
  waterMs: 6000,
  careMs: 6000,
  mulchMs: 5000,
  rakeMs: 3500,
  pickSeedMs: 3000,
  dumpMs: 3000,
  scoopMs: 3000,
  restMs: 10_000,
  /** Growth time from seed to mature tree, excluding waits for care. */
  growMs: 12 * 60_000,
  /** Growth pauses at these points until the keeper has cared for the tree (watering). */
  gates: [0.06, 0.3, 0.62],
  /** A tree mulched with leaf mould grows this much faster. */
  mulchSpeedup: 0.12,
  /** Mature trees in the current zone drop seeds and collectable leaves on a fixed rule. */
  seedEveryMs: 5 * 60_000,
  seedGroundCap: 2,
  leafEveryMs: 4 * 60_000,
  leafGroundCap: 4,
  /** Leaf drop multiplier per season (spring, summer, autumn, winter). Never zero. */
  leafSeason: [0.6, 1, 2.2, 0.4],
  /** Collect leaves only once this many lie under one tree. */
  rakeMin: 2,
  /** Rake only while the composts hold less mould (ready + maturing) than this; the rest of
   *  the leaves stay on the ground as part of the landscape. */
  mouldTarget: 6,
  /** Gather fallen seeds while the bench basket holds fewer than this. */
  seedReserve: 4,
  /** Leaves become leaf mould after this much running time in the compost. */
  compostMs: 8 * 60_000,
  leavesPerMould: 2,
  /** Rain barrel next to each storage bench after the first cluster: fills slowly by itself. */
  barrel: { buildMs: 18_000, fillEveryMs: 3 * 60_000, cap: 3 },
  /** A short channel brings spring water close to the later planting spots of a clearing. */
  channel: { segments: 4, segMs: 11_000, afterTrees: 2 },
  /** Flowerbeds: made from leaf mould and a spare seed, visited by bees and butterflies. */
  flowerbed: { mould: 2, seeds: 1, ms: 12_000, perCluster: 2, seedBoost: 0.25 },
  /** Squirrel: once the forest has trees, it carries a fallen seed to the next planting spot. */
  squirrel: { afterTrees: 4, everyMs: 4 * 60_000, speed: 70 },
} as const;

// ---------------------------------------------------------------------------
// Seasons (forest environment; independent of individual tree growth)

export const SEASON = {
  /** Running time of one full year. Seasons are a quarter each. */
  yearMs: 120 * 60_000,
  /** Blend width around each boundary. */
  blendMs: 5 * 60_000,
};

// ---------------------------------------------------------------------------
// Decorative effects (never affect production)

export type EffectLevel = 'low' | 'default' | 'rich';

export const EFFECTS = {
  /** Multiplier for decorative counts (motes, twinkles, ambient leaves, visitors). */
  density: { low: 0.45, default: 1, rich: 1.6 } as Record<EffectLevel, number>,
  shootingStar: { minS: 45, maxS: 120, durS: [1.1, 1.8] as [number, number] },
  /** Ambient visitors in the forest (birds), seconds between appearances. */
  birdS: [50, 110] as [number, number],
  butterflyS: [35, 80] as [number, number],
};

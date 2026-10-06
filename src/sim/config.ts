/**
 * Tuning values for the work simulation (initial values; adjust here, not in code).
 *
 * Every duration is running time (ms of W): nothing advances while paused, idle or after a
 * countdown ended. Changing any value that affects the outcome must bump SIM_VERSION so cached
 * checkpoints are discarded and replayed with the new rules.
 */

/** Version of the simulation rules below (checkpoints from another version are ignored). */
export const SIM_VERSION = 12;

// ---------------------------------------------------------------------------
// Space — a colony on a far planet

/** Buildings of the colony. Facilities from older worlds keep their kinds (see spacePlan.ts). */
export type SpaceKind =
  | 'generator'
  | 'extractor'
  | 'habitat'
  | 'storage'
  | 'command'
  | 'research'
  | 'turret'
  | 'barracks'
  | 'factory'
  | 'relay'
  | 'dish'
  | 'greenhouse'
  | 'dome';

/** Mined resources (energy is the power grid): metal, crystal, rare mineral. */
export type Res = 'm' | 'c' | 'r';
export const RES: readonly Res[] = ['m', 'c', 'r'];
export type Amt = Record<Res, number>;

export type SpaceStageId = 'marking' | 'foundation' | 'floor' | 'frame' | 'walls' | 'parts' | 'power' | 'inspect';

export interface StageDef {
  id: SpaceStageId;
  /** Assembly time with one drone and no habitat bonus. */
  ms: number;
  /** Range of the facility's visual progress (0..1) this stage covers. */
  u: [number, number];
}

const amt = (m: number, c: number, r: number): Amt => ({ m, c, r });

export const SPACE = {
  /** Drone driving speed in world units per second (distances use the wide layout). */
  speed: 50,
  /** Crates a drone carries per trip. */
  load: 2,
  /** Drilling time per load, by resource. */
  drillMs: amt(11000, 12500, 14000),
  /** An extractor at the outpost's metal deposit makes drilling there faster. */
  extractorSpeedup: 0.25,
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
  /** Crate slots at a depot; each storage adds more. Must be ≥ the largest facility cost. */
  depotCap: 24,
  /** Free drones mine ahead for this many later buildings of the outpost (room permitting). */
  lookahead: 3,
  /** A free drone helps with a stage being assembled (visual; the stage takes as long). */
  assistMs: 30000,
  /** A free drone checks a finished building of the outpost (one drone on rounds at a time). */
  patrolMs: 8000,
  /**
   * Expansion: once research stands, a scout drone flies ahead to each new outpost (after the
   * finished outpost has been admired for a moment), circles the site scanning for deposits and
   * drops a beacon; the depot is marked out after it lands.
   */
  scout: { delayMs: 24_000, flyMs: 16_000, scanMs: 9_000, dropMs: 3_000 },
  /** Laying the power line from the previous outpost is this much slower than driving. */
  linkSlow: 2.6,
  /**
   * The garrison: each barracks trains a guard every `infMs` (faster with two), each factory
   * assembles a tank every `tankMs`, up to the caps (12 guards / 4 tanks per building, two
   * buildings of each count). Guards who sheltered in a raid are back after `backMs`.
   */
  army: { infMs: 4 * 60_000, tankMs: 9 * 60_000, infPer: 12, tankPer: 4, perMax: 2, backMs: 3 * 60_000 },
  /**
   * Raids: the first comes 15–25 minutes after the first turret, then one every 50–90 minutes
   * of running time. Approach, fight (40–60 s) and falling back take about 1.5 minutes.
   * Afterwards drones repair (per damage level) and, rarely, clear a wreck and rebuild it.
   */
  /**
   * Raids are paced to the focus sessions (see world/pace.ts); this is how one unfolds. Most
   * are skirmishes (a small party, about a minute, light damage); every third is a full raid.
   */
  raid: {
    approachMs: 25_000,
    fightMin: 40_000,
    fightMax: 60_000,
    retreatMs: 15_000,
    skirmish: { approachMs: 16_000, fightMin: 22_000, fightMax: 32_000, retreatMs: 12_000 },
    /** Every n-th raid is a full raid. */
    fullEvery: 3,
    repairMs: 40_000,
    clearMs: 30_000,
    rebuildMs: 45_000,
    rebuildSteps: 3,
  },
  /**
   * Maintenance drones: repairs, clearing and rebuilding after raids. They are not the work
   * drones and use no crates, so raids never change what the colony builds or when.
   */
  crew: { start: 1, max: 3 },
  storageCap: 12,
  storageMax: 3,
  /** Visible size of each deposit (crates) for its depletion; veins never vanish entirely. */
  deposit: amt(60, 24, 10),
  /** Drones at landing, and the most the colony keeps (command centre and factories add). */
  startRovers: 2,
  /** Each starting drone rolls out this much after the previous one. */
  staggerMs: 4000,
  maxRovers: 6,
  /** Crates per building: gathering is a large, visible share of the drones' day. */
  costs: {
    generator: amt(10, 2, 0),
    extractor: amt(10, 2, 0),
    habitat: amt(12, 4, 0),
    storage: amt(12, 0, 0),
    command: amt(16, 4, 0),
    research: amt(10, 6, 0),
    turret: amt(10, 4, 0),
    barracks: amt(12, 2, 0),
    factory: amt(14, 4, 0),
    relay: amt(8, 4, 2),
    dish: amt(8, 6, 2),
    greenhouse: amt(10, 4, 0),
    dome: amt(14, 4, 4),
  } as Record<SpaceKind, Amt>,
  stages: [
    // a drone scans the plot and marks its outline and corner stakes (no materials)
    { id: 'marking', ms: 12_000, u: [0, 0.07] },
    { id: 'foundation', ms: 27_000, u: [0.07, 0.2] },
    { id: 'floor', ms: 32_000, u: [0.2, 0.27] },
    { id: 'frame', ms: 80_000, u: [0.27, 0.45] },
    { id: 'walls', ms: 120_000, u: [0.45, 0.7] },
    { id: 'parts', ms: 80_000, u: [0.7, 0.85] },
    { id: 'power', ms: 32_000, u: [0.85, 0.92] },
    { id: 'inspect', ms: 18_000, u: [0.92, 1] },
  ] as StageDef[],
  /** Share of the metal each structural stage uses, from `structFrom` on (the rest use none). */
  structFrom: 1,
  metalSplit: [0.2, 0.1, 0.3, 0.4],
  /** Stage that fits the equipment: all crystal and rare mineral go in here. */
  equipStage: 5,
  /** Crew from each habitat helps assembly a little (up to `habitatMax` habitats). */
  habitatSpeedup: 0.04,
  habitatMax: 2,
  /** Drone battery (milli-units) and use per second of each activity. */
  battery: {
    cap: 100_000,
    /** Charge before starting a job below this level. */
    low: 28_000,
    /** Charging speed when the grid has enough stored power (milli-units per second). */
    chargeRate: 5_000,
    use: { drive: 260, drill: 650, build: 220, handle: 120, scan: 150, idle: 0 },
  },
  /** Base battery at the landing pod: always trickle-charged, so work never stops for good. */
  grid: { cap: 400_000, start: 300_000, base: 120, perSolar: 1_300 },
} as const;

/** Crates of each resource a stage of a facility uses (sums to the facility's cost). */
export function stageNeed(kind: SpaceKind, stage: number): Amt {
  const cost = SPACE.costs[kind];
  const out: Amt = { m: 0, c: 0, r: 0 };
  const s = stage - SPACE.structFrom;
  if (s >= 0 && s < SPACE.metalSplit.length) {
    const split = SPACE.metalSplit;
    let used = 0;
    for (let i = 0; i < split.length - 1; i++) {
      const n = Math.floor(cost.m * split[i]);
      if (i === s) out.m = n;
      used += n;
    }
    if (s === split.length - 1) out.m = cost.m - used;
  }
  if (stage === SPACE.equipStage) {
    out.c = cost.c;
    out.r = cost.r;
  }
  return out;
}

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
  /** A pond at the zone's feature spot, dug once the zone has two groves; it fills over time. */
  pond: { afterTrees: 8, digs: 3, digMs: 22_000, lineMs: 18_000, fillMs: 6 * 60_000 },
  /** An old tree for each zone: planted early in the zone, cared for once per grove, a giant within its zone's time. */
  elder: { seedsNeeded: 3, plantMs: 9000, careMs: 7000, matureMs: 24 * 60_000, giantMs: 3 * 3_600_000 },
} as const;

// ---------------------------------------------------------------------------
// Seasons (forest environment; independent of individual tree growth)

export const SEASON = {
  /** Running time of one full year (three forest days per season). Seasons are a quarter each. */
  yearMs: 288 * 60_000,
  /** Blend width around each boundary. */
  blendMs: 8 * 60_000,
};

// ---------------------------------------------------------------------------
// World clock (day and night; running time only)

export const WORLD = {
  /** One forest day: a 25-minute session sees about one sunrise-to-sunrise cycle. */
  forestDayMs: 24 * 60_000,
  /** One day of the colony planet. */
  spaceDayMs: 32 * 60_000,
  /** Day fractions (0 = midnight) where the sun crosses the horizon. */
  sunrise: 0.17,
  sunset: 0.83,
  /** A new world (W = 0) starts in the early morning, just after sunrise. */
  startPhase: 0.2,
  /** Days of the moon's phase cycle. */
  lunarDays: 29.5,
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

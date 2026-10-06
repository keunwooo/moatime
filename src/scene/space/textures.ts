import type { Texture } from 'pixi.js';
import { glowTexture, releaseTexture, shadowTexture, toTexture, type PaintCanvas } from '../paint/brush';
import { mix } from '../paint/color';
import { paintBandBody, paintBandEdge, paintHaze, paintHills, paintPaper, paintRidgeDressing, paintSky } from '../paint/landscape';
import { paintAurora, paintBigShip, paintColonyShip, paintComet, paintDustStreaks, paintFleetCraft, paintMoonlet, paintNebula, paintRocket, paintStormBand } from './paintEvents';
import { paintCapsule, paintCritter, paintGuard, paintRubble, paintTankHull, paintTankTurret, paintWarden } from './paintArmy';
import { FACILITY_ARTS, S, type FacilityKind } from './palette';
import { paintBattery, paintBeacon, paintCable, paintCharger, paintCrystalCluster, paintOreBed, paintOreChunk, paintOreRock, paintPot, paintRareSeam, paintScout, paintShuttle } from './paintWork';
import {
  BAND_FAR,
  BAND_NEAR,
  drawRidgeLights,
  HILLS,
  paintCrate,
  paintCrater,
  paintDish,
  paintGiant,
  paintGiantRing,
  paintGiantShade,
  paintGiantStreaks,
  paintHorizonGlow,
  paintPlanetSun,
  paintLander,
  paintMoonRock,
  paintPad,
  paintRoad,
  paintStars,
  paintTrack,
  paintTube,
  SKY_STOPS,
  type FacilityArt,
} from './paint';
import { paintBeam, paintFixer, paintHauler, paintRotor, paintSentry } from './paintDrones';
import { paintBuilding, paintVent } from './paintColony';

export interface FacilityTex {
  body: Texture;
  art: FacilityArt;
}

export interface SpaceTextures {
  sky: Texture;
  stars: Texture;
  /** The ringed gas giant: disk with the far ring, drifting streaks, night side, near ring. */
  giant: Texture;
  giantStreaks: Texture;
  giantShade: Texture;
  giantRing: Texture;
  horizonGlow: Texture;
  sun: Texture;
  sunHalo: Texture;
  hills: Texture[];
  ridge: Texture;
  edgeNear: Texture[];
  edgeFar: Texture[];
  softNear: Texture[];
  softFar: Texture[];
  bodyNear: Texture;
  bodyFar: Texture;
  haze: Texture;
  paper: Texture;
  star: Texture;
  mote: Texture;
  windowGlow: Texture;
  poolGlow: Texture;
  softLight: Texture;
  shadow: Texture;
  craters: Texture[];
  rocks: Texture[];
  facilities: Record<FacilityKind, FacilityTex[]>;
  dish: Texture;
  hauler: Texture;
  vent: Texture;
  sentry: Texture;
  fixer: Texture;
  rotor: Texture;
  beam: Texture;
  lander: Texture;
  crate: Texture;
  pad: Texture;
  tube: Texture;
  track: Texture;
  road: Texture;
  oreRocks: Texture[];
  /** Crystal outcrops and rare-mineral seams (the other two deposits). */
  crystalRocks: Texture[];
  rareRocks: Texture[];
  oreChunk: Texture;
  oreBed: Texture;
  battery: Texture;
  charger: Texture;
  cable: Texture;
  pot: Texture;
  /** Expansion: the scout drone, the outpost beacon it drops, a passing shuttle. */
  scout: Texture;
  beacon: Texture;
  shuttle: Texture;
  /** The garrison and the raiders (Phase 8). */
  guard: Texture[];
  tankHull: Texture;
  tankTurret: Texture;
  critter: Texture;
  critterBall: Texture;
  warden: Texture;
  capsule: Texture;
  rubble: Texture;
  /** The planet's sky and its events (Phase 9). */
  aurora: Texture;
  comet: Texture;
  bigShip: Texture;
  fleetCraft: Texture;
  colonyShip: Texture;
  rocket: Texture;
  moonlet: Texture;
  nebula: Texture[];
  dustStreaks: Texture;
  stormBand: Texture;
  dust: Texture;
  spark: Texture;
  all: Texture[];
}

const tick = () => new Promise<void>((r) => setTimeout(r, 0));

export async function buildSpaceTextures(lowPower: boolean): Promise<SpaceTextures> {
  const all: Texture[] = [];
  const t = (pc: PaintCanvas, label: string, repeat: false | 'x' | 'xy' = false) => {
    const tex = toTexture(pc, { label, repeat });
    all.push(tex);
    return tex;
  };
  const sky = t(paintSky({ stops: SKY_STOPS }, 5), 'sky');
  const stars = t(paintStars(11), 'stars');
  const giant = t(paintGiant(12), 'giant');
  const giantStreaks = t(paintGiantStreaks(13), 'giant-streaks', 'x');
  const giantShade = t(paintGiantShade(), 'giant-shade');
  const giantRing = t(paintGiantRing(12), 'giant-ring');
  const horizonGlow = t(paintHorizonGlow(), 'horizon-glow');
  const hills = HILLS.map((h, i) => t(paintHills(300 + i, h.pal, h.shape), `mhills${i}`, 'x'));
  const ridge = t(paintRidgeDressing(300, HILLS[0].shape, drawRidgeLights, 0.08), 'mridge', 'x');
  await tick();
  const edgeNear = [0, 1, 2].map((i) => t(paintBandEdge(700 + i, BAND_NEAR, 'regolith'), `medgeN${i}`, 'x'));
  const edgeFar = [0, 1, 2].map((i) => t(paintBandEdge(700 + i, BAND_FAR, 'regolith'), `medgeF${i}`, 'x'));
  const softNear = [0, 1].map((i) => t(paintBandEdge(740 + i, BAND_NEAR, 'regolith', 'soft'), `msoftN${i}`, 'x'));
  const softFar = [0, 1].map((i) => t(paintBandEdge(740 + i, BAND_FAR, 'regolith', 'soft'), `msoftF${i}`, 'x'));
  const bodyNear = t(paintBandBody(720, BAND_NEAR, 'regolith'), 'mbodyN', 'xy');
  const bodyFar = t(paintBandBody(720, BAND_FAR, 'regolith'), 'mbodyF', 'xy');
  const haze = t(paintHaze(78), 'mhaze', 'x');
  const paper = t(paintPaper(19, mix(S.sand, S.lavender, 0.4)), 'mpaper', 'xy');
  await tick();
  const star = glowTexture(32, S.text, 0.4, 'star');
  const mote = glowTexture(32, S.lavender, 0.6, 'mmote');
  const windowGlow = glowTexture(64, S.window, 0.5, 'window-glow');
  const poolGlow = glowTexture(256, mix(S.window, S.apricot, 0.3), 0.9, 'pool-glow');
  const softLight = glowTexture(256, mix(S.sandLight, S.teal, 0.25), 0.95, 'soft-light');
  const shadow = shadowTexture();
  const sun = t(paintPlanetSun(), 'p-sun');
  const sunHalo = glowTexture(128, [255, 226, 196], 0.9, 'p-sun-halo');
  all.push(star, mote, windowGlow, poolGlow, softLight, shadow, sun, sunHalo);
  const craters = [0, 1, 2].map((i) => t(paintCrater(800 + i), `crater${i}`));
  const rocks = [0, 1, 2].map((i) => t(paintMoonRock(820 + i, i === 2 ? 0.7 : 1), `mrock${i}`));
  await tick();
  const facilities = {} as Record<FacilityKind, FacilityTex[]>;
  FACILITY_ARTS.forEach((k, ki) => {
    facilities[k] = Array.from({ length: lowPower ? 1 : 2 }, (_, i) => {
      const art = paintBuilding(k, 900 + ki * 10 + i);
      return { body: t(art.canvas, `fac-${k}${i}`), art };
    });
  });
  await tick();
  const dish = t(paintDish(32), 'dish');
  const hauler = t(paintHauler(41), 'hauler');
  const vent = t(paintVent(44), 'vent');
  const sentry = t(paintSentry(43), 'sentry');
  const fixer = t(paintFixer(42), 'fixer');
  const rotor = t(paintRotor(), 'rotor');
  const beam = t(paintBeam(), 'beam');
  const lander = t(paintLander(34), 'lander');
  const crate = t(paintCrate(35), 'crate');
  const pad = t(paintPad(36), 'pad');
  const tube = t(paintTube(37), 'tube');
  const track = t(paintTrack(38), 'track');
  const road = t(paintRoad(39), 'road');
  await tick();
  const oreRocks = [0, 1, 2].map((i) => t(paintOreRock(860 + i, i === 2 ? 0.7 : 1), `ore${i}`));
  const crystalRocks = [0, 1].map((i) => t(paintCrystalCluster(880 + i, i === 1 ? 0.75 : 1), `crystal${i}`));
  const rareRocks = [0, 1].map((i) => t(paintRareSeam(890 + i, i === 1 ? 0.75 : 1), `rare${i}`));
  const oreChunk = t(paintOreChunk(870), 'ore-chunk');
  const oreBed = t(paintOreBed(871), 'ore-bed');
  const battery = t(paintBattery(872), 'battery');
  const charger = t(paintCharger(873), 'charger');
  const cable = t(paintCable(), 'cable');
  const pot = t(paintPot(874), 'pot');
  const scout = t(paintScout(875), 'scout');
  const beacon = t(paintBeacon(876), 'beacon');
  const shuttle = t(paintShuttle(877), 'shuttle');
  const guard = ([0, 1, 2] as const).map((p) => t(paintGuard(880, p), `guard${p}`));
  const tankHull = t(paintTankHull(881), 'tank-hull');
  const tankTurret = t(paintTankTurret(882), 'tank-turret');
  const critter = t(paintCritter(883, false), 'critter');
  const critterBall = t(paintCritter(883, true), 'critter-ball');
  const warden = t(paintWarden(884), 'warden');
  const capsule = t(paintCapsule(), 'capsule');
  const rubble = t(paintRubble(885), 'rubble');
  const aurora = t(paintAurora(886), 'aurora', 'x');
  const comet = t(paintComet(), 'comet');
  const bigShip = t(paintBigShip(887), 'big-ship');
  const fleetCraft = t(paintFleetCraft(888), 'fleet-craft');
  const colonyShip = t(paintColonyShip(889), 'colony-ship');
  const rocket = t(paintRocket(890), 'rocket');
  const moonlet = t(paintMoonlet(891), 'moonlet');
  const nebula = [892, 893].map((n) => t(paintNebula(n), `nebula${n}`));
  const dustStreaks = t(paintDustStreaks(894), 'dust-streaks', 'xy');
  const stormBand = t(paintStormBand(895), 'storm-band', 'x');
  const dust = glowTexture(64, mix(S.dust, S.sandLight, 0.4), 0.7, 'dust');
  const spark = glowTexture(32, mix(S.window, [255, 255, 240], 0.5), 0.35, 'spark');
  all.push(dust, spark);
  return {
    sky,
    stars,
    giant,
    giantStreaks,
    giantShade,
    giantRing,
    horizonGlow,
    sun,
    sunHalo,
    hills,
    ridge,
    edgeNear,
    edgeFar,
    softNear,
    softFar,
    bodyNear,
    bodyFar,
    haze,
    paper,
    star,
    mote,
    windowGlow,
    poolGlow,
    softLight,
    shadow,
    craters,
    rocks,
    facilities,
    dish,
    hauler,
    vent,
    sentry,
    fixer,
    rotor,
    beam,
    lander,
    crate,
    pad,
    tube,
    track,
    road,
    oreRocks,
    crystalRocks,
    rareRocks,
    oreChunk,
    oreBed,
    battery,
    charger,
    cable,
    pot,
    scout,
    beacon,
    shuttle,
    guard,
    tankHull,
    tankTurret,
    critter,
    critterBall,
    warden,
    capsule,
    rubble,
    aurora,
    comet,
    bigShip,
    fleetCraft,
    colonyShip,
    rocket,
    moonlet,
    nebula,
    dustStreaks,
    stormBand,
    dust,
    spark,
    all,
  };
}

export function releaseSpaceTextures(t: SpaceTextures) {
  for (const tex of t.all) releaseTexture(tex);
}

/** All forest textures, painted once per theme load and released on theme switch. */

import type { Texture } from 'pixi.js';
import { glowTexture, releaseTexture, shadowTexture, toTexture, type PaintCanvas } from '../paint/brush';
import { mix } from '../paint/color';
import {
  paintBandBody,
  paintBandEdge,
  paintCloud,
  paintHaze,
  paintHills,
  paintPaper,
  paintRay,
  paintRidgeDressing,
  paintSky,
} from '../paint/landscape';
import {
  BAND_FAR,
  BAND_NEAR,
  BAND_SNOW,
  drawRidgeCrown,
  HILLS,
  LEAF_FALL_COLORS,
  paintClump,
  paintDistantTree,
  paintFern,
  paintFlower,
  paintGrass,
  paintLeaf,
  paintLitter,
  paintMoss,
  paintMushrooms,
  paintPathPatch,
  paintPond,
  paintReeds,
  paintRock,
  paintSamara,
  paintSeed,
  paintSoil,
  paintStepStone,
  paintStump,
  SKY_STOPS,
  type FlowerKind,
} from './paint';
import { F, SPECIES } from './palette';
import { paintActors, type ActorTextures } from './actors';
import {
  paintFlake,
  paintFogBand,
  paintForestStars,
  paintIce,
  paintMoonDisk,
  paintMoonShade,
  paintPetal, paintRainbow,
  paintPuddle,
  paintRainSheet,
  paintRainStreak,
  paintSplash,
  paintSunDisk,
} from './paintSky';
import { paintDeer, paintRabbit } from './paintFauna';
import { autumnPalette, paintLilyPad, paintBarrel, paintBasket, paintBench, paintChannel, paintCompostBin, paintCompostHeap, paintMould, paintSnowCap, paintSnowGround, paintTwigs } from './paintWork';

export interface SpeciesTextures {
  clumps: Texture[];
  /** Autumn-coloured clumps (empty for evergreens). */
  autumn: Texture[];
  leaves: Texture[];
  distant: Texture[];
  twigs: Texture;
}

export interface ForestTextures {
  sky: Texture;
  sunDisk: Texture;
  moonDisk: Texture;
  moonShade: Texture;
  stars: Texture;
  rain: Texture;
  rainSheet: Texture;
  flake: Texture;
  splash: Texture;
  puddle: Texture[];
  ice: Texture;
  petal: Texture;
  /** A rainbow after spring rain (Phase 9). */
  rainbow: Texture;
  fogBand: Texture;
  lantern: Texture;
  lily: Texture[];
  /** Rabbit sitting / hopping; deer walking (2) and with its head up. */
  rabbit: Texture[];
  deer: Texture[];
  hills: Texture[];
  ridge: Texture;
  clouds: Texture[];
  edgeNear: Texture[];
  edgeFar: Texture[];
  softNear: Texture[];
  softFar: Texture[];
  bodyNear: Texture;
  bodyFar: Texture;
  /** The ground bands under snow. */
  snowEdge: Texture[];
  snowSoft: Texture[];
  snowBody: Texture;
  haze: Texture;
  ray: Texture;
  paper: Texture;
  mote: Texture;
  firefly: Texture;
  sunGlow: Texture;
  shadow: Texture;
  species: Record<string, SpeciesTextures>;
  fall: Texture[];
  seed: Texture;
  samara: Texture;
  soil: Texture[];
  moss: Texture[];
  litter: Texture[];
  stones: Texture[];
  pathPatches: Texture[];
  grass: Texture[];
  tallGrass: Texture[];
  flowers: Record<FlowerKind, Texture[]>;
  rocks: Texture[];
  mossyRocks: Texture[];
  ferns: Texture[];
  mushrooms: Texture[];
  reeds: Texture[];
  pond: Texture;
  stump: Texture;
  actors: ActorTextures;
  bench: Texture;
  basket: Texture;
  compostBin: Texture;
  compostHeap: Texture;
  mould: Texture;
  barrel: Texture;
  channel: Texture;
  snowCap: Texture;
  snowGround: Texture;
  all: Texture[];
}

/** Yield between painting batches. A timer (not rAF) so hidden tabs still finish loading. */
const frame = () => new Promise<void>((r) => setTimeout(r, 0));

export async function buildForestTextures(lowPower: boolean): Promise<ForestTextures> {
  const all: Texture[] = [];
  const t = (pc: PaintCanvas, label: string, repeat: false | 'x' | 'xy' = false) => {
    const tex = toTexture(pc, { label, repeat });
    all.push(tex);
    return tex;
  };
  const sky = t(paintSky({ stops: SKY_STOPS }, 3), 'sky');
  const sunDisk = t(paintSunDisk(), 'sun');
  const moonDisk = t(paintMoonDisk(8), 'moon');
  const moonShade = t(paintMoonShade(), 'moon-shade');
  const stars = t(paintForestStars(12), 'stars', 'x');
  const rain = t(paintRainStreak(), 'rain');
  const rainSheet = t(paintRainSheet(13), 'rain-sheet', 'xy');
  const flake = t(paintFlake(), 'flake');
  const splash = t(paintSplash(), 'splash');
  const puddle = [0, 1].map((i) => t(paintPuddle(14 + i), `puddle${i}`));
  const ice = t(paintIce(16), 'ice');
  const petal = t(paintPetal(), 'petal');
  const rainbow = t(paintRainbow(), 'rainbow');
  const fogBand = t(paintFogBand(), 'fog-band');
  const hills = HILLS.map((h, i) => t(paintHills(100 + i, h.pal, h.shape), `hills${i}`, 'x'));
  const ridge = t(paintRidgeDressing(100, HILLS[0].shape, drawRidgeCrown, 0.42), 'ridge', 'x');
  const clouds = [0, 1, 2].map((i) => t(paintCloud(40 + i, mix(F.cream, [255, 255, 255], 0.4), mix(F.hillLav, F.cream, 0.4)), `cloud${i}`));
  await frame();
  const edgeNear = [0, 1, 2].map((i) => t(paintBandEdge(500 + i, BAND_NEAR, 'grass'), `edgeN${i}`, 'x'));
  const edgeFar = [0, 1, 2].map((i) => t(paintBandEdge(500 + i, BAND_FAR, 'grass'), `edgeF${i}`, 'x'));
  const softNear = [0, 1].map((i) => t(paintBandEdge(540 + i, BAND_NEAR, 'grass', 'soft'), `softN${i}`, 'x'));
  const softFar = [0, 1].map((i) => t(paintBandEdge(540 + i, BAND_FAR, 'grass', 'soft'), `softF${i}`, 'x'));
  const bodyNear = t(paintBandBody(520, BAND_NEAR, 'grass'), 'bodyN', 'xy');
  const bodyFar = t(paintBandBody(520, BAND_FAR, 'grass'), 'bodyF', 'xy');
  const snowEdge = [0, 1, 2].map((i) => t(paintBandEdge(500 + i, BAND_SNOW, 'grass'), `edgeS${i}`, 'x'));
  const snowSoft = [0, 1].map((i) => t(paintBandEdge(540 + i, BAND_SNOW, 'grass', 'soft'), `softS${i}`, 'x'));
  const snowBody = t(paintBandBody(520, BAND_SNOW, 'grass'), 'bodyS', 'xy');
  const haze = t(paintHaze(77), 'haze', 'x');
  const ray = t(paintRay(), 'ray');
  const paper = t(paintPaper(9, F.cream), 'paper', 'xy');
  await frame();
  const mote = glowTexture(32, F.sun, 0.6, 'mote');
  const firefly = glowTexture(48, mix(F.sun, [220, 240, 170], 0.5), 0.45, 'firefly');
  const sunGlow = glowTexture(256, mix(F.sun, F.cream, 0.3), 0.85, 'sunglow');
  const lantern = glowTexture(64, [255, 214, 150], 0.5, 'lantern');
  const shadow = shadowTexture();
  all.push(mote, firefly, sunGlow, lantern, shadow);

  const variants = lowPower ? 2 : 3;
  const species: Record<string, SpeciesTextures> = {};
  let k = 0;
  for (const [name, sp] of Object.entries(SPECIES)) {
    const autumn = [0, 1].map((i) => autumnPalette(sp, i)).filter((p): p is NonNullable<typeof p> => p !== null);
    species[name] = {
      clumps: Array.from({ length: variants }, (_, i) => t(paintClump(1000 + k * 10 + i, sp), `${name}-clump${i}`)),
      autumn: autumn.map((ap, i) => t(paintClump(1500 + k * 10 + i, ap), `${name}-autumn${i}`)),
      leaves: [0, 1].map((i) => t(paintLeaf(2000 + k * 10 + i, sp.leaf, mix(sp.light, F.cream, 0.2), sp.shadow, 0.4 + i * 0.3), `${name}-leaf${i}`)),
      distant: [0, 1].map((i) => t(paintDistantTree(3000 + k * 10 + i, sp), `${name}-far${i}`)),
      twigs: t(paintTwigs(3500 + k, sp.bark), `${name}-twigs`),
    };
    k++;
    await frame();
  }
  const fall = LEAF_FALL_COLORS.slice(0, 4).map((c, i) => t(paintLeaf(4000 + i, c, mix(c, F.cream, 0.4), mix(c, F.bark, 0.4), 0.55), `fall${i}`));
  const seed = t(paintSeed(5), 'seed');
  const samara = t(paintSamara(6), 'samara');
  const soil = [0, 1, 2].map((i) => t(paintSoil(60 + i), `soil${i}`));
  const moss = [0, 1, 2].map((i) => t(paintMoss(70 + i, i === 2 ? mix(F.moss, F.deep, 0.15) : F.moss), `moss${i}`));
  const litter = [0, 1].map((i) => t(paintLitter(80 + i, LEAF_FALL_COLORS), `litter${i}`));
  const stones = [0, 1, 2].map((i) => t(paintStepStone(90 + i), `stone${i}`));
  const pathPatches = [0, 1, 2].map((i) => t(paintPathPatch(95 + i), `path${i}`));
  await frame();
  const grass = [0, 1, 2, 3].map((i) => t(paintGrass(110 + i, 1), `grass${i}`));
  const tallGrass = [0, 1].map((i) => t(paintGrass(120 + i, 1.25), `tallgrass${i}`));
  const flowers = {} as Record<FlowerKind, Texture[]>;
  (['daisy', 'bell', 'puff', 'rose'] as FlowerKind[]).forEach((kind, j) => {
    flowers[kind] = [0, 1].map((i) => t(paintFlower(130 + j * 10 + i, kind), `${kind}${i}`));
  });
  const rocks = [0, 1].map((i) => t(paintRock(170 + i, false, 0.8), `rock${i}`));
  // the first one is the hero boulder beside the first seed: painted at 2× for close-ups
  const mossyRocks = [0, 1, 2].map((i) => t(paintRock(180 + i, true, i === 0 ? 1 : 0.85, i === 0 && !lowPower ? 2 : 1), `mrock${i}`));
  const ferns = [0, 1, 2].map((i) => t(paintFern(190 + i), `fern${i}`));
  const mushrooms = [0, 1, 2].map((i) => t(paintMushrooms(200 + i), `mush${i}`));
  const reeds = [0, 1].map((i) => t(paintReeds(210 + i), `reeds${i}`));
  const pond = t(paintPond(220), 'pond');
  const stump = t(paintStump(230), 'stump');
  await frame();
  const actors = paintActors();
  all.push(...actors.all);
  const bench = t(paintBench(240), 'bench');
  const basket = t(paintBasket(241), 'basket');
  const compostBin = t(paintCompostBin(242), 'compost-bin');
  const compostHeap = t(paintCompostHeap(243, LEAF_FALL_COLORS), 'compost-heap');
  const mould = t(paintMould(244), 'mould');
  const barrel = t(paintBarrel(245), 'barrel');
  const channel = t(paintChannel(246), 'channel');
  const snowCap = t(paintSnowCap(247), 'snow-cap');
  const snowGround = t(paintSnowGround(248), 'snow-ground');
  const lily = [0, 1].map((i) => t(paintLilyPad(250 + i), `lily${i}`));
  const rabbit = [false, true].map((hop, i) => t(paintRabbit(260, hop), `rabbit${i}`));
  const deer = ([0, 1, 2] as const).map((pose) => t(paintDeer(270, pose), `deer${pose}`));
  return {
    sky,
    sunDisk,
    moonDisk,
    moonShade,
    stars,
    rain,
    rainSheet,
    flake,
    splash,
    puddle,
    ice,
    petal,
    rainbow,
    fogBand,
    lantern,
    lily,
    rabbit,
    deer,
    hills,
    ridge,
    clouds,
    edgeNear,
    edgeFar,
    softNear,
    softFar,
    bodyNear,
    bodyFar,
    snowEdge,
    snowSoft,
    snowBody,
    haze,
    ray,
    paper,
    mote,
    firefly,
    sunGlow,
    shadow,
    species,
    fall,
    seed,
    samara,
    soil,
    moss,
    litter,
    stones,
    pathPatches,
    grass,
    tallGrass,
    flowers,
    rocks,
    mossyRocks,
    ferns,
    mushrooms,
    reeds,
    pond,
    stump,
    actors,
    bench,
    basket,
    compostBin,
    compostHeap,
    mould,
    barrel,
    channel,
    snowCap,
    snowGround,
    all,
  };
}

export function releaseForestTextures(t: ForestTextures) {
  for (const tex of t.all) releaseTexture(tex);
}

/**
 * The home system in the foreground: the cradle in the nebula's tail where gas spirals in and two
 * thin jets stand up, the warm star that lights and carves a room in the nebula, its disk, and the
 * three planets that gather out of it — a small rocky one close in (8-minute year), the life planet
 * (72-minute year, 12-minute day) and a banded giant that later gets rings. The life planet cools,
 * gets a moon from a grazing impact, an ocean from comets, clouds, life along its coasts, seasons,
 * and in the end small lights on its night side. Planets behind the star pass behind it.
 *
 * Then its people build outward, each step visible from afar: a station ring around the planet, a
 * base on the moon, sparks of mining in the belt, the inner planet turning blue-green, towns on the
 * giant's moons, shuttles between them all, and at last a growing ring of collectors around the star.
 */

import { Container, Sprite, Texture, TilingSprite } from 'pixi.js';
import { CHRON, civAt, cometTimes, LIFE, lifePlanetAt, orbitAngle, ringsAt, type CivState } from '../../../sim/cosmos';
import { alignmentAt } from '../../../world/cosmos';
import { clamp01, easeOut, env, eventIs, hash01, lerp, mixHex, px, sm, vis, type CosmosFrame } from '../frame';
import { N } from '../palette';
import type { CosmosTextures } from '../textures';

interface Orbit {
  x: number;
  y: number;
  depth: number;
  scale: number;
}

class LifePlanet {
  readonly root = new Container();
  private surface = new Container();
  private mask: Sprite;
  private magma: TilingSprite;
  private crust: TilingSprite;
  private oceans: TilingSprite[];
  private green: TilingSprite;
  private clouds: TilingSprite;
  private shade: Sprite;
  private lightsBox = new Container();
  private lights: TilingSprite;
  private lightsFew: TilingSprite;
  private nightMask: Sprite;
  private rim: Sprite;
  private bloom: Sprite;
  private aurora: Sprite;
  private auroraHalo: Sprite;
  private shadow: Sprite;
  private meteors: Sprite[];

  constructor(tex: CosmosTextures) {
    const tile = (t: CosmosTextures['magma']) => {
      const s = new TilingSprite({ texture: t, width: 256, height: 256 });
      s.anchor.set(0.5);
      return s;
    };
    this.magma = tile(tex.magma);
    this.crust = tile(tex.crust);
    this.oceans = tex.oceans.map(tile);
    this.green = tile(tex.green);
    this.clouds = tile(tex.clouds);
    this.mask = new Sprite(tex.circle);
    this.mask.anchor.set(0.5);
    this.surface.addChild(this.magma, this.crust, ...this.oceans, this.green, this.clouds, this.mask);
    this.surface.mask = this.mask;
    this.shade = new Sprite(tex.shade);
    this.shade.anchor.set(0.5);
    this.lights = tile(tex.lights);
    this.lights.blendMode = 'add';
    this.lightsFew = tile(tex.lightsFew);
    this.lightsFew.blendMode = 'add';
    this.nightMask = new Sprite(tex.night);
    this.nightMask.anchor.set(0.5);
    this.lightsBox.addChild(this.lightsFew, this.lights, this.nightMask);
    this.lightsBox.mask = this.nightMask;
    this.rim = new Sprite(tex.rim);
    this.rim.anchor.set(0.5);
    this.rim.blendMode = 'add';
    this.bloom = new Sprite(tex.glowSoft);
    this.bloom.anchor.set(0.5);
    this.bloom.tint = N.green;
    this.bloom.blendMode = 'add';
    this.aurora = new Sprite(tex.arc);
    this.aurora.anchor.set(0.5, 1);
    this.aurora.tint = N.green;
    this.aurora.blendMode = 'add';
    this.auroraHalo = new Sprite(tex.glowSoft);
    this.auroraHalo.anchor.set(0.5);
    this.auroraHalo.blendMode = 'add';
    this.shadow = new Sprite(tex.glow);
    this.shadow.anchor.set(0.5);
    this.shadow.tint = 0x101024;
    this.meteors = [0, 1, 2, 3].map(() => {
      const m = new Sprite(tex.streak);
      m.anchor.set(1, 0.5);
      m.blendMode = 'add';
      return m;
    });
    this.root.addChild(this.auroraHalo, this.surface, this.shade, this.lightsBox, this.rim, this.bloom, this.shadow, ...this.meteors, this.aurora);
  }

  update(f: CosmosFrame, r: number, toStar: number) {
    const st = lifePlanetAt(f.seed, f.A);
    const d = r * 2;
    const scale = d / 256;
    const spin = st.spin;
    for (const t of [this.magma, this.crust, ...this.oceans, this.green, this.clouds, this.lights, this.lightsFew]) {
      t.width = t.height = d;
      t.tileScale.set(scale);
      t.tilePosition.set(-spin * 512 * scale, 0);
    }
    this.clouds.tilePosition.set(-spin * 1.35 * 512 * scale + f.t * 0.6, 0);
    this.mask.width = this.mask.height = d;
    vis(this.magma, Math.max(0.0001, st.magma));
    vis(this.crust, 1 - st.magma);
    // the ocean rises from the low ground: three levels crossfade
    const o = st.ocean;
    this.oceans.forEach((s, i) => vis(s, clamp01(o * 3 - i) * (i === 0 ? 1 : 1)));
    vis(this.green, st.green * 0.95 + st.bloom * 0.1);
    vis(this.clouds, st.clouds * (0.8 + 0.2 * Math.sin(st.season * 2)));
    // lit from its star
    this.shade.width = this.shade.height = d;
    this.shade.rotation = toStar;
    this.nightMask.width = this.nightMask.height = d;
    this.nightMask.rotation = toStar;
    // the first lights come on along the coasts; towns spread over the following hours
    const s = f.As;
    const l0 = LIFE.lights / 1000;
    this.lightsFew.alpha = sm(l0, l0 + 30, s);
    this.lights.alpha = sm(l0 + 1800, LIFE.lightsFull / 1000, s);
    vis(this.lightsBox, st.lights > 0 ? 1 : 0);
    this.rim.width = this.rim.height = d * 1.12;
    this.rim.tint = mixHex(0xd8b8a0, 0xb8d8ff, st.ocean);
    vis(this.rim, 0.15 + 0.5 * st.atmosphere);
    this.bloom.width = this.bloom.height = d * 1.6;
    vis(this.bloom, 0.4 * env(LIFE.life / 1000, LIFE.life / 1000 + 30, LIFE.life / 1000 + 60, LIFE.life / 1000 + 200, f.As));
    // session sights on the planet
    const au = eventIs(f, 'aurora');
    const auK = au ? Math.sin(au.p * Math.PI) : 0;
    this.aurora.position.set(0, -r * 0.7);
    this.aurora.width = r * 2.1;
    this.aurora.height = r * 1.25 * (au ? 0.85 + 0.15 * Math.sin(f.t * 1.3) : 1);
    this.aurora.tint = mixHex(N.green, N.rose, au ? 0.5 + 0.5 * Math.sin(f.t * 0.7) : 0);
    vis(this.aurora, 0.8 * auK);
    this.auroraHalo.position.set(0, -r * 0.35);
    this.auroraHalo.width = this.auroraHalo.height = r * 4.2;
    this.auroraHalo.tint = N.green;
    vis(this.auroraHalo, 0.35 * auK * (0.85 + 0.15 * Math.sin(f.t * 0.9)));
    const ms = eventIs(f, 'moonShadow');
    if (ms) {
      this.shadow.position.set(lerp(-r * 0.95, r * 0.95, ms.p), lerp(-r * 0.25, r * 0.3, ms.p));
      this.shadow.width = this.shadow.height = r * 0.7;
      vis(this.shadow, 0.9 * Math.sin(ms.p * Math.PI));
    } else this.shadow.visible = false;
    const nm = eventIs(f, 'nightMeteors');
    this.meteors.forEach((m, i) => {
      if (!nm) {
        m.visible = false;
        return;
      }
      const ph = (nm.p * 6 + i * 0.27) % 1;
      const ang = toStar + Math.PI + (i - 1.5) * 0.35;
      m.position.set(Math.cos(ang) * r * (0.6 + 1.0 * (1 - ph)), Math.sin(ang) * r * (0.6 + 1.0 * (1 - ph)));
      m.rotation = ang + Math.PI;
      m.width = r * 1.1;
      m.height = Math.max(2, r * 0.07);
      vis(m, 0.85 * Math.sin(ph * Math.PI) * Math.sin(nm.p * Math.PI));
    });
  }
}

export class HomeSystem {
  readonly root = new Container();
  private back = new Container();
  private front = new Container();
  private plane = new Container();
  private disk: Sprite;
  private diskBands: Sprite;
  private belt: Sprite;
  private beltBack: Sprite;
  private protostar: Sprite;
  private jets: Sprite[];
  private starHalo: Sprite;
  private starGlow: Sprite;
  private starCore: Sprite;
  private nebulaLit: Sprite;
  private cavity: Sprite;
  private flare: Sprite;
  private inflow: Sprite[] = [];
  private inner: Sprite;
  private innerShade: Sprite;
  private giant = new Container();
  private giantBody: Sprite;
  private giantShade: Sprite;
  private ringBack: Container;
  private ringFront: Container;
  private life: LifePlanet;
  private lifeBox = new Container();
  private moon: Sprite;
  private impactor: Sprite;
  private debris: Sprite;
  private clumps: Sprite[] = [];
  private comet: Sprite;
  private cometTail: Sprite;
  private cometIon: Sprite;
  private splash: Sprite;
  private alignLine: Sprite;
  private orbitLight: Sprite;
  private beltMeteors: Sprite[];
  private stationBack: Container;
  private stationFront: Container;
  private stationLight: Sprite;
  private moonBox = new Container();
  private moonBase: Sprite[];
  private innerRim: Sprite;
  private giantMoons: { box: Container; body: Sprite; light: Sprite }[];
  private mining: Sprite[];
  private dysonRing: Sprite;
  private dyson: Sprite[];
  private shuttles: { s: Sprite; trail: Sprite }[];
  /** Screen position (layer px) and radius of the life planet, for the camera. */
  lifeAt = { x: 0, y: 0, r: 0 };
  private innerAt = { x: 0, y: 0, r: 0 };
  private giantAt = { x: 0, y: 0, r: 0 };

  constructor(tex: CosmosTextures) {
    const sp = (t: CosmosTextures['glow'], add = false) => {
      const s = new Sprite(t);
      s.anchor.set(0.5);
      if (add) s.blendMode = 'add';
      return s;
    };
    this.disk = sp(tex.disk);
    this.diskBands = sp(tex.diskBands);
    this.beltBack = sp(tex.belt);
    this.plane.addChild(this.disk, this.diskBands, this.beltBack);
    this.belt = sp(tex.belt);
    this.protostar = sp(tex.glowSoft, true);
    this.protostar.tint = N.redStar;
    this.jets = [0, 1].map(() => {
      const j = new Sprite(tex.jet);
      j.anchor.set(0.5, 1);
      j.blendMode = 'add';
      return j;
    });
    this.starHalo = sp(tex.glowSoft, true);
    this.starHalo.tint = N.sun;
    this.starGlow = sp(tex.glowSoft, true);
    this.starGlow.tint = N.sun;
    this.starCore = sp(tex.glow, true);
    this.starCore.tint = N.emberCore;
    this.nebulaLit = sp(tex.glowSoft, true);
    this.nebulaLit.tint = N.sun;
    this.cavity = sp(tex.bubble, true);
    this.cavity.tint = N.ember;
    this.flare = new Sprite(tex.arc);
    this.flare.anchor.set(0.5, 1);
    this.flare.blendMode = 'add';
    for (let i = 0; i < 24; i++) {
      const b = sp(tex.dot, true);
      b.tint = i % 3 ? N.rose : N.ember;
      this.inflow.push(b);
    }
    this.inner = sp(tex.inner);
    this.innerShade = sp(tex.shade);
    this.giantBody = sp(tex.giant);
    this.giantShade = sp(tex.shade);
    const ringHalf = (front: boolean, t: Texture = tex.ring) => {
      const c = new Container();
      const r = sp(t);
      c.addChild(r);
      // a mask that keeps only the near (front) or far (back) half of the flattened ring
      const m = new Sprite(Texture.WHITE);
      m.anchor.set(0.5, front ? 0 : 1);
      m.width = 4096;
      m.height = 4096;
      c.addChild(m);
      r.mask = m;
      return c;
    };
    this.ringBack = ringHalf(false);
    this.ringFront = ringHalf(true);
    this.giant.addChild(this.ringBack, this.giantBody, this.giantShade, this.ringFront);
    this.life = new LifePlanet(tex);
    this.stationBack = ringHalf(false, tex.loop);
    this.stationFront = ringHalf(true, tex.loop);
    this.stationLight = sp(tex.dot, true);
    this.lifeBox.addChild(this.stationBack, this.life.root, this.stationFront, this.stationLight);
    this.moon = sp(tex.moon);
    this.moonBase = [0, 1, 2].map(() => {
      const l = sp(tex.dot, true);
      l.tint = N.gold;
      return l;
    });
    this.moonBox.addChild(this.moon, ...this.moonBase);
    this.innerRim = sp(tex.rim, true);
    this.innerRim.tint = N.teal;
    this.giantMoons = [0, 1].map(() => {
      const box = new Container();
      const body = sp(tex.moon);
      const light = sp(tex.dot, true);
      light.tint = N.gold;
      box.addChild(body, light);
      return { box, body, light };
    });
    this.mining = Array.from({ length: 12 }, () => {
      const m = sp(tex.dot, true);
      m.tint = N.gold;
      return m;
    });
    this.dysonRing = sp(tex.loop, true);
    this.dysonRing.tint = N.gold;
    this.dyson = Array.from({ length: 48 }, () => {
      const d = sp(tex.dot, true);
      d.tint = N.emberCore;
      return d;
    });
    this.shuttles = Array.from({ length: 8 }, () => {
      const trail = new Sprite(tex.streak);
      trail.anchor.set(1, 0.5);
      trail.blendMode = 'add';
      trail.tint = N.gold;
      const s = sp(tex.dot, true);
      s.tint = N.emberCore;
      return { s, trail };
    });
    this.impactor = sp(tex.inner);
    this.debris = sp(tex.belt);
    for (let i = 0; i < 15; i++) {
      const c = sp(tex.blob);
      c.tint = i % 2 ? N.ember : N.crust;
      this.clumps.push(c);
    }
    this.cometTail = new Sprite(tex.tail);
    this.cometTail.anchor.set(0, 0.5);
    this.cometIon = new Sprite(tex.ionTail);
    this.cometIon.anchor.set(0, 0.5);
    this.cometIon.blendMode = 'add';
    this.comet = sp(tex.comet, true);
    this.splash = sp(tex.glowSoft, true);
    this.splash.tint = N.teal;
    this.alignLine = new Sprite(tex.streak);
    this.alignLine.anchor.set(0, 0.5);
    this.alignLine.blendMode = 'add';
    this.alignLine.tint = N.gold;
    this.orbitLight = sp(tex.dot, true);
    this.orbitLight.tint = N.gold;
    this.beltMeteors = [0, 1, 2, 3, 4, 5, 6, 7].map(() => {
      const m = new Sprite(tex.streak);
      m.anchor.set(1, 0.5);
      m.blendMode = 'add';
      return m;
    });
    this.root.addChild(
      this.nebulaLit,
      this.cavity,
      ...this.inflow,
      this.plane,
      this.back,
      this.protostar,
      ...this.jets,
      this.starHalo,
      this.starGlow,
      this.starCore,
      this.dysonRing,
      ...this.dyson,
      this.flare,
      this.belt,
      ...this.mining,
      this.front,
      ...this.shuttles.flatMap((x) => [x.trail, x.s]),
      this.alignLine,
      ...this.beltMeteors,
      this.cometTail,
      this.cometIon,
      this.comet,
      this.splash,
      this.orbitLight,
    );
  }

  private orbit(f: CosmosFrame, a: number, ang: number): Orbit {
    const c = px(f, f.L.home);
    const R = a * f.w;
    const tilt = f.L.orbits.tilt;
    const depth = Math.cos(ang);
    return { x: c.x + Math.sin(ang) * R, y: c.y + Math.cos(ang) * R * tilt, depth, scale: 1 + 0.16 * depth };
  }

  /** Puts a body in front of or behind the star by where it is on its orbit. */
  private place(o: Container, depth: number) {
    const parent = depth >= 0 ? this.front : this.back;
    if (o.parent !== parent) parent.addChild(o);
  }

  update(f: CosmosFrame) {
    const s = f.As;
    const A = f.A;
    const L = f.L;
    const c = px(f, L.home);
    const W = f.w;
    const rStar = L.planetR.star * W;

    // the cradle: gas spirals in, a red knot, two thin jets
    const cradle = env(CHRON.cradle / 1000, 1000, CHRON.homeStar / 1000, CHRON.homeStar / 1000 + 12, s);
    this.protostar.position.set(c.x, c.y);
    this.protostar.width = this.protostar.height = rStar * (5 + 4 * sm(900, 1100, s));
    vis(this.protostar, 0.55 * cradle);
    this.jets.forEach((j, i) => {
      j.position.set(c.x, c.y);
      j.rotation = i * Math.PI + 0.12;
      j.width = rStar * 1.2;
      j.height = rStar * 7 * sm(CHRON.jets / 1000, CHRON.jets / 1000 + 40, s);
      vis(j, 0.5 * sm(CHRON.jets / 1000, CHRON.jets / 1000 + 30, s) * (1 - sm(CHRON.homeStar / 1000, CHRON.homeStar / 1000 + 14, s)));
    });
    const flowA = env(CHRON.flowStart / 1000, 940, 1080, CHRON.flowEnd / 1000, s) * (f.motion ? 1 : 0);
    const tailP = px(f, L.nebulaA.tail);
    const coreP = px(f, L.nebulaA.core);
    this.inflow.forEach((b, i) => {
      if (flowA <= 0) {
        b.visible = false;
        return;
      }
      const stream = i % 3;
      const src = stream === 0 ? coreP : stream === 1 ? tailP : { x: c.x - W * 0.2, y: c.y - f.h * 0.18 };
      const u = ((i / 24) * 3 + f.t * 0.04 + stream * 0.13) % 1;
      const dx = c.x - src.x;
      const dy = c.y - src.y;
      const len = Math.hypot(dx, dy) || 1;
      const sw = Math.sin(u * Math.PI * 3 + stream + f.t * 0.5) * (1 - u) * len * 0.1;
      b.position.set(src.x + dx * u - (dy / len) * sw, src.y + dy * u + (dx / len) * sw);
      b.width = b.height = Math.max(3, W * 0.0032) * (0.7 + 0.5 * u);
      vis(b, flowA * 0.6 * Math.sin(u * Math.PI));
    });

    // the home star lights and carves a room in the nebula's tail
    const on = sm(CHRON.homeStar / 1000, CHRON.homeStar / 1000 + 12, s);
    const flick = 1 + 0.03 * Math.sin(f.t * 1.9) * Math.sin(f.t * 0.7);
    this.starCore.position.set(c.x, c.y);
    this.starCore.width = this.starCore.height = rStar * 3.2 * flick;
    vis(this.starCore, on);
    this.starGlow.position.set(c.x, c.y);
    this.starGlow.width = this.starGlow.height = rStar * 9;
    vis(this.starGlow, on * 0.45);
    this.starHalo.position.set(c.x, c.y);
    this.starHalo.width = this.starHalo.height = rStar * 26;
    vis(this.starHalo, on * 0.16);
    this.nebulaLit.position.set(lerp(c.x, tailP.x, 0.5), lerp(c.y, tailP.y, 0.6));
    this.nebulaLit.width = this.nebulaLit.height = W * 0.32;
    vis(this.nebulaLit, 0.22 * sm(CHRON.homeStar / 1000, CHRON.cavityEnd / 1000, s));
    this.cavity.position.set(c.x, c.y);
    const cav = easeOut((s - CHRON.homeStar / 1000 - 12) / 40);
    this.cavity.width = this.cavity.height = W * 0.2 * (0.3 + 0.7 * cav);
    vis(this.cavity, s < CHRON.homeStar / 1000 + 12 ? 0 : 0.5 * (1 - 0.7 * sm(1300, 2400, s)));
    // a prominence (session sight)
    const fl = eventIs(f, 'flare');
    if (fl) {
      const ang = -1.2 + hash01(fl.seed, 1) * 2.4;
      this.flare.position.set(c.x + Math.sin(ang) * rStar * 1.2, c.y - Math.cos(ang) * rStar * 1.2);
      this.flare.rotation = ang;
      this.flare.width = rStar * 2.4;
      this.flare.height = rStar * 2.6 * Math.sin(fl.p * Math.PI);
      vis(this.flare, 0.7 * Math.sin(fl.p * Math.PI));
    } else this.flare.visible = false;

    // the disk and the belt it leaves
    this.plane.position.set(c.x, c.y);
    this.plane.scale.set(1, L.orbits.tilt);
    const diskR = L.orbits.giant * W * 1.15;
    this.disk.width = this.disk.height = diskR * 2;
    this.disk.rotation = (A / 1000) * 0.025;
    const diskA = sm(CHRON.disk / 1000, CHRON.disk / 1000 + 50, s) * (1 - sm(1380, 1480, s));
    vis(this.disk, 0.75 * diskA);
    this.diskBands.width = this.diskBands.height = diskR * 2;
    this.diskBands.rotation = this.disk.rotation * 1.3;
    vis(this.diskBands, 0.8 * sm(1250, 1340, s) * (1 - sm(1380, 1470, s)));
    const beltR = L.orbits.belt * W;
    this.beltBack.width = this.beltBack.height = beltR * 2.06;
    this.beltBack.rotation = (A / 1000) * 0.007;
    vis(this.beltBack, 0.5 * sm(1430, 1470, s));
    this.belt.visible = false;

    // planets: gather from the disk, then orbit
    const rr = L.planetR;
    const civ = civAt(A);
    const homeT = CHRON.homePlanets.map(([a, b]) => [a / 1000, b / 1000]);
    const bodies: { a: number; i: number; r: number }[] = [
      { a: L.orbits.inner, i: 0, r: rr.inner * W },
      { a: L.orbits.life, i: 1, r: rr.life * W },
      { a: L.orbits.giant, i: 2, r: rr.giant * W },
    ];
    let clumpI = 0;
    const toStarOf = (o: Orbit) => Math.atan2(c.y - o.y, c.x - o.x);
    for (const b of bodies) {
      const [t0, t1] = homeT[b.i];
      // formation: clumps converge where the planet will be when it is done
      const ang = orbitAngle(b.i, Math.max(A, t1 * 1000));
      const o = this.orbit(f, b.a, ang);
      const form = clamp01((s - t0) / (t1 - t0));
      for (let k = 0; k < 5; k++, clumpI++) {
        const cl = this.clumps[clumpI];
        if (s < t0 || s > t1 + 6) {
          cl.visible = false;
          continue;
        }
        const a0 = hash01(b.i, k, 3) * 6.28 + form * 2;
        const dist = b.r * 4 * (1 - easeOut(form));
        cl.position.set(o.x + Math.cos(a0) * dist, o.y + Math.sin(a0) * dist * 0.5);
        cl.width = cl.height = b.r * (0.8 + 0.4 * hash01(b.i, k)) * o.scale;
        vis(cl, 0.8 * sm(t0, t0 + 6, s) * (1 - sm(t1 - 6, t1 + 4, s)));
        if (cl.parent !== this.front) this.front.addChild(cl);
      }
      const shown = sm(t1 - 10, t1, s);
      const tint = mixHex(0x8a8290, 0xffffff, sm(t1 - 4, t1 + 6, s));
      const lit = toStarOf(o);
      if (b.i === 0) {
        this.place(this.inner, o.depth);
        this.place(this.innerShade, o.depth);
        this.place(this.innerRim, o.depth);
        this.inner.position.set(o.x, o.y);
        this.inner.width = this.inner.height = b.r * 2 * o.scale;
        this.inner.tint = mixHex(tint, 0x8fd6c4, civ.terraform * 0.8);
        vis(this.inner, shown);
        // a thin new air around it as it is made liveable
        this.innerRim.position.set(o.x, o.y);
        this.innerRim.width = this.innerRim.height = b.r * 2.5 * o.scale;
        vis(this.innerRim, 0.75 * civ.terraform * shown);
        this.innerAt = { x: o.x, y: o.y, r: b.r * o.scale };
        this.innerShade.position.set(o.x, o.y);
        this.innerShade.width = this.innerShade.height = b.r * 2 * o.scale;
        this.innerShade.rotation = lit;
        vis(this.innerShade, shown);
      } else if (b.i === 1) {
        this.place(this.lifeBox, o.depth);
        this.lifeBox.position.set(o.x, o.y);
        const r = b.r * o.scale;
        this.life.update(f, r, lit);
        this.lifeBox.alpha = shown;
        this.lifeBox.visible = shown > 0.003;
        this.life.root.tint = tint;
        this.lifeAt = { x: o.x, y: o.y, r };
        this.updateStation(f, r, civ);
        this.updateMoon(f, o, r, lit, civ);
      } else {
        this.place(this.giant, o.depth);
        this.giant.position.set(o.x, o.y);
        const r = b.r * o.scale;
        this.giantBody.width = this.giantBody.height = r * 2;
        this.giantBody.tint = tint;
        this.giantShade.width = this.giantShade.height = r * 2;
        this.giantShade.rotation = lit;
        this.giant.alpha = shown;
        this.giant.visible = shown > 0.003;
        const ring = ringsAt(A);
        for (const half of [this.ringBack, this.ringFront]) {
          half.scale.set(1, 0.3);
          half.rotation = -0.18;
          const rs = half.children[0] as Sprite;
          rs.width = rs.height = r * 4.4 * (0.6 + 0.4 * ring);
          half.alpha = ring * 0.9;
          half.visible = ring > 0.003;
        }
        this.giantAt = { x: o.x, y: o.y, r };
        this.updateGiantMoons(f, r, lit, civ);
      }
    }
    this.updateDyson(f, c, rStar, civ);
    this.updateMining(f, c, civ);
    this.updateShuttles(f, civ);
    this.updateComets(f);
    this.updateSights(f, c, rStar);
  }

  private updateMoon(f: CosmosFrame, o: Orbit, r: number, lit: number, civ: CivState) {
    const s = f.As;
    const t = LIFE.moon / 1000;
    // a small body grazes the planet; the flung ring of debris gathers into a moon
    const imp = clamp01((s - t) / 30);
    this.place(this.impactor, 1);
    this.impactor.position.set(o.x - r * 3 * (1 - imp) + r * 0.9 * imp, o.y - r * 1.2 * (1 - imp) - r * 0.4 * imp);
    this.impactor.width = this.impactor.height = r * 0.5;
    vis(this.impactor, s < t ? 0 : env(t, t + 4, t + 28, t + 34, s));
    this.place(this.debris, o.depth);
    void lit;
    this.debris.position.set(o.x, o.y);
    this.debris.scale.set(1, 1);
    this.debris.width = r * 4.2;
    this.debris.height = r * 4.2 * 0.32;
    this.debris.rotation = -0.2 + (f.A / 1000) * 0.02;
    vis(this.debris, 0.8 * env(t + 26, t + 34, t + 66, t + 92, s));
    const form = sm(t + 60, t + 92, s);
    const ang = f.A / LIFE.moonMonthMs * Math.PI * 2;
    const md = Math.cos(ang);
    const mx = o.x + Math.sin(ang) * r * 2.3;
    const my = o.y + md * r * 0.7;
    // the moon passes behind its planet on the far half of its orbit
    const parent = this.lifeBox.parent;
    const box = this.moonBox;
    if (parent) {
      if (box.parent !== parent) parent.addChild(box);
      const li = parent.getChildIndex(this.lifeBox);
      const mi = parent.getChildIndex(box);
      if ((md < 0 && mi > li) || (md >= 0 && mi < li)) parent.setChildIndex(box, li);
    }
    box.position.set(mx, my);
    const mr = r * 0.21 * (1 + 0.12 * md) * (0.3 + 0.7 * form);
    this.moon.width = this.moon.height = mr * 2;
    this.moon.rotation = lit;
    vis(this.moon, form);
    // the moon base: a few lights on its night side, blinking slowly
    const away = lit + Math.PI;
    this.moonBase.forEach((l, i) => {
      const a = away + (i - 1) * 0.55;
      l.position.set(Math.cos(a) * mr * 0.62, Math.sin(a) * mr * 0.62);
      l.width = l.height = Math.max(4, mr * (i === 1 ? 1 : 0.75));
      l.tint = i === 1 ? N.emberCore : N.gold;
      vis(l, civ.moonBase * form * (0.7 + 0.3 * Math.sin(f.t * (1.1 + i * 0.4) + i)));
    });
  }

  /** A ring station around the life planet, with a light running along it. */
  private updateStation(f: CosmosFrame, r: number, civ: CivState) {
    const k = civ.station;
    for (const half of [this.stationBack, this.stationFront]) {
      half.scale.set(1, 0.28);
      half.rotation = 0.22;
      const rs = half.children[0] as Sprite;
      rs.width = rs.height = r * 3.6 * (0.85 + 0.15 * k);
      rs.tint = N.gold;
      half.alpha = 0.75 * k;
      half.visible = k > 0.003;
    }
    const a = (f.A / 1000 / 24) * Math.PI * 2;
    const R = r * 1.5 * (0.85 + 0.15 * k);
    const lx = Math.cos(a) * R;
    const ly = Math.sin(a) * R * 0.28;
    this.stationLight.position.set(lx * Math.cos(0.22) - ly * Math.sin(0.22), lx * Math.sin(0.22) + ly * Math.cos(0.22));
    this.stationLight.width = this.stationLight.height = Math.max(4, r * 0.22);
    this.stationLight.tint = N.emberCore;
    vis(this.stationLight, k * (Math.sin(a) > 0 ? 1 : 0.25) * (0.6 + 0.4 * Math.sin(f.t * 2.2)));
  }

  /** Two small moons around the giant; towns light up on them. */
  private updateGiantMoons(f: CosmosFrame, r: number, lit: number, civ: CivState) {
    const g = this.giant;
    this.giantMoons.forEach((m, i) => {
      const P = i === 0 ? 50 : 85;
      const a = (f.A / 1000 / P) * Math.PI * 2 + i * 2.4;
      const d = Math.cos(a);
      if (m.box.parent !== g) g.addChild(m.box);
      g.setChildIndex(m.box, d < 0 ? 0 : g.children.length - 1);
      m.box.position.set(Math.sin(a) * r * (2.5 + i * 0.9), d * r * (0.5 + i * 0.2) * 0.9);
      const mr = r * (i === 0 ? 0.17 : 0.13) * (1 + 0.1 * d);
      m.body.width = m.body.height = mr * 2;
      m.body.rotation = lit;
      m.body.tint = i === 0 ? 0xd8c8b0 : 0xb8c0d0;
      m.light.width = m.light.height = Math.max(3, mr * 0.9);
      m.light.position.set(-Math.cos(lit) * mr * 0.4, -Math.sin(lit) * mr * 0.4);
      vis(m.light, civ.giantMoons * (0.75 + 0.25 * Math.sin(f.t * 1.4 + i * 3)));
    });
  }

  /** A ring of collectors around the star, filling in over many hours. */
  private updateDyson(f: CosmosFrame, c: { x: number; y: number }, rStar: number, civ: CivState) {
    const k = civ.dyson;
    const R = rStar * 3.4;
    const tilt = 0.32;
    this.dysonRing.position.set(c.x, c.y);
    this.dysonRing.width = R * 2.38;
    this.dysonRing.height = R * 2.38 * tilt;
    vis(this.dysonRing, 0.35 * Math.min(1, k * 3));
    const n = Math.round(k * this.dyson.length);
    const turn = (f.A / 1000 / 140) * Math.PI * 2;
    this.dyson.forEach((d, i) => {
      if (i >= n) {
        d.visible = false;
        return;
      }
      // they fill the ring from two sides, evenly spaced in the end
      const slot = i % 2 ? Math.floor(i / 2) + 0.5 : -Math.floor(i / 2);
      const a = turn + (slot / this.dyson.length) * Math.PI * 2;
      const dep = Math.sin(a);
      d.position.set(c.x + Math.cos(a) * R, c.y + dep * R * tilt);
      d.width = d.height = Math.max(3, rStar * 0.32) * (1 + 0.15 * dep);
      vis(d, (dep < 0 ? 0.35 : 0.95) * (0.8 + 0.2 * Math.sin(f.t * 1.7 + i)));
    });
  }

  /** Sparks where ships work the belt. */
  private updateMining(f: CosmosFrame, c: { x: number; y: number }, civ: CivState) {
    const R = f.L.orbits.belt * f.w;
    const tilt = f.L.orbits.tilt;
    const rot = (f.A / 1000) * 0.007;
    const n = Math.ceil(civ.mining * this.mining.length * (0.5 + 0.5 * civ.terraform));
    this.mining.forEach((m, i) => {
      if (i >= n) {
        m.visible = false;
        return;
      }
      const a = hash01(i, 81) * Math.PI * 2 + rot;
      const rr = R * (0.94 + 0.12 * hash01(i, 82));
      m.position.set(c.x + Math.sin(a) * rr, c.y + Math.cos(a) * rr * tilt);
      const tw = Math.max(0, Math.sin(f.t * (0.7 + hash01(i, 83)) + i * 1.7));
      m.width = m.height = Math.max(4, f.w * 0.0036) * (0.6 + 0.7 * tw);
      vis(m, civ.mining * (0.25 + 0.75 * tw * tw));
    });
  }

  /** Shuttles between the home worlds: more of them, to more places, as the people grow. */
  private updateShuttles(f: CosmosFrame, civ: CivState) {
    const lp = this.lifeAt;
    const c = px(f, f.L.home);
    const R = f.L.orbits.belt * f.w;
    const dests: ({ x: number; y: number } | 'belt')[] = [];
    if (civ.moonBase > 0) dests.push({ x: this.moonBox.x, y: this.moonBox.y });
    if (civ.mining > 0) dests.push('belt');
    if (civ.terraform > 0) dests.push(this.innerAt);
    if (civ.giantMoons > 0) dests.push(this.giantAt);
    this.shuttles.forEach((sh, i) => {
      if (i >= civ.shuttles || lp.r <= 0) {
        sh.s.visible = sh.trail.visible = false;
        return;
      }
      const d = dests.length ? dests[i % dests.length] : null;
      let to: { x: number; y: number };
      if (d === 'belt') {
        const a = hash01(i, 91) * Math.PI * 2;
        to = { x: c.x + Math.sin(a) * R, y: c.y + Math.cos(a) * R * f.L.orbits.tilt };
      } else if (d) to = d;
      // with nowhere to go yet, the first shuttle rises to the station and back
      else to = { x: lp.x + lp.r * 1.4, y: lp.y - lp.r * 0.5 };
      const period = 34 + 22 * hash01(i, 92);
      const clock = f.motion ? f.t : f.As;
      const u = (((clock / period + hash01(i, 93)) % 1) + 1) % 1;
      const out = u < 0.5;
      const lu = clamp01((u % 0.5) / 0.42);
      const t = out ? lu : 1 - lu;
      const ease = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
      const dx = to.x - lp.x;
      const dy = to.y - lp.y;
      const len = Math.hypot(dx, dy) || 1;
      const bend = (hash01(i, 94) > 0.5 ? 1 : -1) * len * 0.22;
      const cx = (lp.x + to.x) / 2 - (dy / len) * bend;
      const cy = (lp.y + to.y) / 2 + (dx / len) * bend;
      const at = (q: number) => {
        const it = 1 - q;
        return { x: it * it * lp.x + 2 * it * q * cx + q * q * to.x, y: it * it * lp.y + 2 * it * q * cy + q * q * to.y };
      };
      const p = at(ease);
      const p2 = at(clamp01(ease + (out ? -0.04 : 0.04)));
      const a = 0.95 * sm(0, 0.1, lu) * (1 - sm(0.9, 1, lu));
      sh.s.position.set(p.x, p.y);
      sh.s.width = sh.s.height = Math.max(3.5, f.w * 0.0028);
      vis(sh.s, a);
      sh.trail.position.set(p.x, p.y);
      sh.trail.rotation = Math.atan2(p.y - p2.y, p.x - p2.x);
      sh.trail.width = Math.max(10, Math.hypot(p.x - p2.x, p.y - p2.y) * 1.6);
      sh.trail.height = Math.max(5, f.w * 0.004);
      vis(sh.trail, a * 0.7);
    });
  }

  /** Comets from the outer disk carry ice to the life planet (the ledger's comets). */
  private updateComets(f: CosmosFrame) {
    const A = f.A;
    const fly = LIFE.cometFlightMs;
    let active: number | null = null;
    let lastArrive = -Infinity;
    for (const t of cometTimes(f.seed)) {
      if (A >= t - fly && A < t) active = t;
      if (t <= A) lastArrive = t;
      if (t > A + fly) break;
    }
    const lp = this.lifeAt;
    if (active !== null && lp.r > 0) {
      const p = 1 - (active - A) / fly;
      const c = px(f, f.L.home);
      const start = { x: c.x + f.L.orbits.giant * f.w * (hash01(active, 1) > 0.5 ? 1.1 : -1.1), y: c.y - f.L.orbits.giant * f.w * f.L.orbits.tilt * 1.4 };
      const k = easeOut(p);
      const x = lerp(start.x, lp.x, k);
      const y = lerp(start.y, lp.y, k) - Math.sin(p * Math.PI) * f.h * 0.04;
      this.comet.position.set(x, y);
      this.comet.width = this.comet.height = Math.max(6, lp.r * 0.45);
      vis(this.comet, sm(0, 0.1, p) * 0.95);
      // tails point away from the star
      const away = Math.atan2(y - c.y, x - c.x);
      for (const [tl, len, bend] of [
        [this.cometTail, 7, 0.12],
        [this.cometIon, 9, 0],
      ] as const) {
        tl.position.set(x, y);
        tl.rotation = away + bend;
        tl.width = lp.r * len * (0.5 + 0.5 * Math.sin(p * Math.PI));
        tl.height = lp.r * (tl === this.cometTail ? 1.4 : 0.4);
        vis(tl, 0.7 * sm(0, 0.15, p));
      }
    } else {
      this.comet.visible = this.cometTail.visible = this.cometIon.visible = false;
    }
    const since = (A - lastArrive) / 1000;
    this.splash.position.set(lp.x, lp.y);
    this.splash.width = this.splash.height = lp.r * 3;
    vis(this.splash, since >= 0 && since < 6 ? 0.35 * env(0, 0.5, 1.5, 6, since) : 0);
  }

  private updateSights(f: CosmosFrame, c: { x: number; y: number }, rStar: number) {
    // the home planets in a row (every 4.8 hours from stage 8)
    const al = alignmentAt(f.seed, f.A);
    if (al) {
      const p = (f.A - al.t0) / (al.t1 - al.t0);
      this.alignLine.position.set(c.x, c.y);
      this.alignLine.rotation = 0;
      this.alignLine.width = f.L.orbits.giant * f.w * 1.06;
      this.alignLine.height = Math.max(2, rStar * 0.25);
      vis(this.alignLine, 0.3 * Math.sin(p * Math.PI));
    } else this.alignLine.visible = false;
    // little meteors toward the belt
    const me = eventIs(f, 'meteors');
    this.beltMeteors.forEach((m, i) => {
      if (!me) {
        m.visible = false;
        return;
      }
      const ph = (me.p * 5 + i * 0.19) % 1;
      const ang = hash01(me.seed, i) * 6.28;
      const R = f.L.orbits.belt * f.w;
      m.position.set(c.x + Math.sin(ang) * R * (0.9 + 0.2 * ph), c.y + Math.cos(ang) * R * f.L.orbits.tilt * (0.9 + 0.2 * ph));
      m.rotation = ang + 2.2;
      m.width = f.w * 0.05;
      m.height = Math.max(2, f.w * 0.0019);
      vis(m, 0.85 * Math.sin(ph * Math.PI) * Math.sin(me.p * Math.PI));
    });
    // a small light rises from the life planet's orbit
    const ol = eventIs(f, 'orbitLight');
    if (ol && this.lifeAt.r > 0) {
      this.orbitLight.position.set(this.lifeAt.x + this.lifeAt.r * 1.4 * ol.p, this.lifeAt.y - f.h * 0.25 * easeOut(ol.p));
      this.orbitLight.width = this.orbitLight.height = Math.max(8, this.lifeAt.r * 0.4);
      vis(this.orbitLight, Math.sin(ol.p * Math.PI));
    } else this.orbitLight.visible = false;
  }
}

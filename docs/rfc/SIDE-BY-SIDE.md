# The same crusher, six ways

Extracted from the six RFCs. The task is identical in every case: **add a
crusher — 1 ore in, 2 gravel out — to a codebase that has never heard of one.**

This is "add a machine" in its purest form, and the most legible way to compare
the styles. Read these six blocks and pick the one you would rather live in.

---

## 01 — Data-driven registry · *functional / data-oriented*

```js
// content/machines.js — append one row
{ id:'crusher', name:'CRUSHER', behaviour:'converter',
  footprint:{ tw:2, th:2 }, occupy:'machine',
  place:{ clear:true, floorTiles:2 },
  ports:[ { id:'in',  face:'top', mouth:{ x0:0, x1:2 }, grab:2,
            accept:{ tag:'ore' }, cap:6, hand:true },
          { id:'out', face:'bottom', eject:{ dx:'mid', dy:2, vy:-40, spread:24 } } ],
  recipes:['crush_*'],
  fx:{ onAccept:'breakHard', decay:1.4, idleFire:0, burst:{ n:4, col:'#c5beaa' } },
  look:'crusher' }
```
Plus one *template* recipe row that already covers every ore:
```js
tmpl({ id:'crush_$ore', over:{ $ore:'tag:ore' }, in:{ $ore:1 },
       out:{ gravel:2 }, secs:1.6 })
```
**Also needs:** a `gravel` substance row. **Engine lines: 0.**

---

## 02 — Composed objects · *hybrid, no `class` keyword*

```js
// data/machines.js — added to MACHINES
crusher: {
  name: 'CRUSHER', size: [2, 2], footing: 2, sprite: 'crusher',
  parts: [
    ['Footprint', {}],
    ['Buffer',    { cap: { ore: 6, gravel: 6 } }],
    ['CatchBox',  { mouth: 'top', accepts: { form: 'ore' } }],
    ['HandFeed',  { pad: 10 }],
    ['Recipe',    { tag: 'crush' }],
    ['Emitter',   { at: 'bottom', vy: 10 }]
  ]
}
```
**Also needs:** a `gravel` substance, a `crush` recipe row. **Engine lines: 0.**
Distinctive: behaviour is an explicit *list of named parts*, so you can read a
machine's capabilities off its declaration.

---

## 03 — ECS-lite archetypes · *data-oriented*

Machine types are authored as readable tables; the instance becomes an entity
carrying `Footprint`, `Buffer`, `Recipe`, `CatchBox` components. Adding the
crusher is a table row; the component arrays already exist.
**Engine lines: 0.** Runtime access is `Pos.data[e*2]`-style throughout.

---

## 04 — Layered core · *data-oriented, no `this` anywhere*

```js
// src/data/machines.js — appended. No rules, view, model or shell edit.
{ id:'crusher', name:'CRUSHER',
  tw:2, th:2, footing:2,
  ports:[ { side:'top',    mode:'in', accepts:['#ore'] },
          { side:'bottom', mode:'out' } ],
  buffer:{ cap:{ '#ore':6 } },
  catchBox:{ mouth:'top', slack:2 },
  recipes:[ { in:{ '#ore':1 }, out:{ gravel:2 }, secs:1.6 } ],
  look:{ /* ... */ } }
```
**Also needs:** a `gravel` substance row. **Engine lines: 0.**
Distinctive: `#ore` is a *tag selector*, so one recipe covers every ore forever.

---

## 05 — Content packs over a kernel · *data-oriented*

```js
api.defineMachine({
  id: 'crusher',
  label: 'CRUSHER',
  size: [2, 2],
  footing: 2,
  ports: {
    in:  [{ at: [0, -1], w: 2, h: 1, from: 'bodies',
            accepts: ['#ore'], cap: 4 }],
    out: [{ at: [1, 2], eject: [0, -60], spread: 30 }]
  },
  recipes: [{ in: { '#ore': 1 }, out: { gravel: 2 }, secs: 1.6 }],
  look: 'box',
  pips: ['#ore']
});
```
**Also needs:** a `gravel` substance. **Kernel lines: 0.**
Distinctive: the call goes through a published API, so content is inspectable —
`seal` validates it and dumps a golden file.

---

## 06 — Class hierarchy · *class-based, inheritance*

```js
// content/machines/crusher.js
import { Processor } from '../../engine/machine.js';
import { P }         from '../../core/palette.js';

export class Crusher extends Processor {
  static id        = 'crusher';
  static name      = 'STAMP CRUSHER';
  static footprint = { tw: 2, th: 2 };
  static placement = ['clear', 'floor'];
  static ports     = [{ side: 'top', dir: 'in' }, { side: 'bottom', dir: 'out' }];
  static recipe    = { in: { copper: 1 }, out: { gravel: 2 }, secs: 1.6 };
  static caps      = { copper: 6 };
  static look      = { use: 'StampLook', body: P.irC, hammer: P.irA };
}
```
**Also needs:** a `gravel` substance class. **Engine lines: 0.**
Note: **zero method bodies.** The subclass body is `static` fields only.

---

## What the comparison actually shows

**The class-versus-functional question largely dissolves for content.** Look at
06 against 05: one is `class Crusher extends Processor { static ... }`, the other
is `defineMachine({ ... })`. Both are declarations. Neither has a method body.
The syntax differs; the shape does not. Six independent designs all concluded
that a machine should be *data interpreted by shared engine code*, not bespoke
code per machine — which is precisely the opposite of today's `placeFurnace()`.

So the real axes are downstream of the one you asked about:

1. **What is the vocabulary of a declaration?** Ports and recipes with
   parameterised flags (01, 04, 05); a list of named behaviour components (02);
   a base class picked from a hierarchy (06).
2. **What happens when you need a behaviour nothing else has?** This is the
   question that actually predicts pain. 02 adds a self-contained component.
   05 registers a new verb from the pack. 01 and 04 must add an entry to a
   closed map or a branch to the interpreter — i.e. engine code. 06 writes a
   subclass, or reaches for a mixin.
3. **Where does the object boundary sit?** 02 says cardinality (objects above
   ~10³ instances); 03 says identity that outlives position; 06 says flyweight
   (one shared `Material` per type). All three land in the same place: tiles and
   field cells stay typed arrays, machines and items do not.

Only axis 2 is genuinely contested, and it is the one worth deciding on.

/* ============================================================
   tools/epoch.mjs — proves render() does not touch the model.

   Every mutator in model/ calls bump() on the counter in model/epoch.js and
   nothing else does. So:

       read the counter -> render one full frame -> read it again

   If it moved, the renderer wrote to the model and the build fails, naming
   nothing more specific than "it moved" — which is enough, because the
   bisection is one `git diff` of `view/`.

   Together with "treatments read hash2, never rand()" this makes the renderer
   provably swappable. That is the property `src/` lost: view/paint.js:127 can
   string-compare a material id only because the renderer is allowed to import
   the gameplay table, and no test could have noticed.

   HONEST LIMITS, both real:
     1. It only catches writes routed through `write.*`. A rule or a view
        module that mutates a record it was handed by a query is invisible to
        it. tools/layers.mjs closes half of that gap by forbidding `view` from
        importing a `write` namespace at all; the other half is unclosed and
        would need frozen views or a proxy.
     2. It needs a render to run, so it is the one tool here that depends on
        core/pixels.js being callable. That is why those primitives are stubs
        that take arguments and do nothing rather than being absent.

   Run:  node tools/epoch.mjs
   ============================================================ */

import { meta } from '../src/model/epoch.js';
import { demo, newRun } from '../src/shell/boot.js';
import { render } from '../src/shell/main.js';
import { stepFixed } from '../src/shell/schedule.js';

const fail = m => { console.error('  FAIL ' + m); process.exitCode = 1; };

newRun(1337);
demo();

/* A sim step is expected to move the counter. If it does not, the harness is
   measuring nothing and would pass vacuously. */
const before = meta.epoch;
stepFixed(1 / 60);
if (meta.epoch === before) fail('a sim step moved the mutation counter by zero — harness is inert');

/* A render is expected not to. */
const e0 = meta.epoch;
render({});
if (meta.epoch !== e0) fail(`render() mutated the model (${meta.epoch - e0} writes)`);

if (!process.exitCode) console.log(`  ok   render() is side-effect-free (${e0} model writes so far)`);

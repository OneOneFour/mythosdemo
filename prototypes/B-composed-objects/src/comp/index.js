import { Footprint }   from './footprint.js';
import { Buffer }      from './buffer.js';
import { CatchBox }    from './catchbox.js';
import { HandFeed }    from './handfeed.js';
import { Recipe }      from './recipe.js';
import { Emitter }     from './emitter.js';
import { Burner }      from './burner.js';
import { BloodBurner } from './bloodburner.js';
import { HeatVent }    from './heatvent.js';
import { Deck }        from './deck.js';
import { Body }        from './body.js';
import { Pick }        from './pick.js';
import { Inventory }   from './inventory.js';
import { Hearts }      from './hearts.js';

/* ============================================================
   The registry sim/assemble.js resolves part names against. Adding a
   component is a file plus one line here; a name in a machine row that is
   not in this object throws at boot naming the machine and the name you
   typed.

   THE SLOT GRAPH, in full, because it is the one thing no single file shows:

     footprint  <- Footprint            needed by CatchBox HandFeed Emitter
                                                   HeatVent Deck
     buffer     <- Buffer               needed by CatchBox HandFeed Recipe
                                                   Burner
     catch      <- CatchBox             needed by nothing (a marker)
     recipe     <- Recipe               needed by HandFeed HeatVent
     emit       <- Emitter              needed by Recipe
     heat       <- Burner | BloodBurner needed by Recipe(hot) Deck
     deck       <- Deck                 needed by nothing yet (chutes will)
     body       <- Body                 needed by Pick
     hearts     <- Hearts               needed by Body(fall damage),
                                                  BloodBurner(cross-host)
     inventory  <- Inventory            needed by HandFeed(cross-host)

   `heat` is the row that matters: TWO providers, TWO consumers, and no
   consumer knows which provider it got. That is the blood winch.
   ============================================================ */
export const COMPONENTS = {
  Footprint, Buffer, CatchBox, HandFeed, Recipe, Emitter,
  Burner, BloodBurner, HeatVent, Deck,
  Body, Pick, Inventory, Hearts
};

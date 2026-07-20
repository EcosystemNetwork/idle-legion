# Idle Legion — art brief

Every filename here is **already referenced by code**. Generate it, drop it in, it renders.
Nothing on this list is speculative.

## House style

Painterly semi-realistic 3D game art. Warm torchlight, deep shadow. Palette is
**green and gold** — Kek green banners, brass, aged gold leaf, grey cut stone.
Roman: arches, columns, mosaic floors, amphorae, laurel.

**Canon:** it is the **Pepe Empire**. Characters are **Kek**, never "frog". The
Colosseum is run by **Kekius Maximus**. Put "Kek" in the prompt, never "frog" —
generators drift to literal frogs otherwise.

## Where to drop files

`public/art-incoming/` — any loose name is fine. I classify, crop, key, resize,
convert to WebP, generate the 256² thumb, and wire it to its reference.
Dumping in `public/` also works.

## Sizes

| Class | Target | Generate at |
|---|---|---|
| Room shell / mythic plate | 820×461 (16:9) | 1408×792, or square with subject centred |
| Prop sprite | ~512² with alpha | 1408² square on magenta |
| Square item / portrait | 360×360 | 1408² square |
| Icon | 260×260 | 1408² square |
| Wide interior strip | 1500×525 | as wide as the tool allows |

---

# BATCH 1 — proof of pipeline (do this first, 4 images)

Do not batch the other 30 props until this one prop is confirmed to key cleanly.

### 1. `shell-small` · `shell-medium` · `shell-large` — 16:9

The base state of **every** room at tiers 1–4. A freshly dug hole looks the same
whatever it becomes, so three plates cover all nine rooms and the props do the
differentiating.

> Empty freshly-dug underground chamber, bare hewn rock walls, packed dirt floor,
> completely unfurnished, no objects, no furniture, one guttering torch on the wall,
> damp stone, cold shadow, wide establishing shot, painterly semi-realistic game art,
> dark and unfinished

- **small** — cramped, low ceiling, one alcove
- **medium** — a single vaulted bay, room to work
- **large** — a broad cavern, ceiling lost in the dark, rough support timbers

**Critical:** these must look *poor*. They are the "before" that makes the Mythic
reveal land. Resist the urge to make them nice.

### 2. `anvil` — prop, magenta key test

> A single scarred iron blacksmith's anvil on a worn oak stump, isolated on a solid
> pure magenta #FF00FF background, no floor, no shadow, no scene, no background
> detail, even studio lighting, painterly semi-realistic game asset, Roman
> gladiator forge, pitted and dented metal

**The magenta matters.** `#FF00FF` keys to transparency cleanly and no prop
legitimately contains it. Flat, even, edge-to-edge — no gradient, no vignette, no
cast shadow onto the magenta.

---

# BATCH 2 — the prop library (30, all on magenta)

Same isolation prompt wrapper as the anvil for every one:

> …isolated on a solid pure magenta #FF00FF background, no floor, no shadow, no
> scene, even studio lighting, painterly semi-realistic game asset

### Forge (5)
| File | Subject |
|---|---|
| `anvil` | scarred iron anvil on an oak stump *(batch 1)* |
| `bloomery` | squat clay-and-stone smelting furnace, fire glowing in the mouth |
| `quench-trough` | long wooden water trough, iron-banded, steam rising |
| `grindstone` | foot-treadle sharpening wheel, wooden frame, worn stone |
| `emberfat-crucible` | ornate brass crucible on a tripod, thick molten orange fat, gold filigree — **legendary, make it look valuable** |

### Granary (4)
| File | Subject |
|---|---|
| `amphora-rack` | timber rack of terracotta amphorae stacked three high, roped |
| `grain-sacks` | stacked burlap grain sacks, one split and spilling |
| `scales` | large brass balance scales on a stand, patinated |
| `hopium-still` | copper distillation still, coiled pipe, small burner — **epic** |

### Infirmary (4)
| File | Subject |
|---|---|
| `cot-row` | two carved wooden cots, green ticking mattresses, folded linen |
| `apothecary-shelf` | tall shelf crowded with clay jars and glass bottles, handwritten labels |
| `herb-rack` | wooden rack with bundles of drying herbs hanging |
| `mutagen-vat` | large glass-and-brass vat of glowing green bio-slurry, riveted bands, pre-collapse tech — **legendary, the centrepiece** |

### Mine (3)
| File | Subject |
|---|---|
| `ore-cart` | iron-wheeled wooden mine cart heaped with raw ore |
| `pit-props` | bundle of rough-cut timber support beams |
| `ichor-tap` | brass spigot assembly driven into glowing golden rock, gauges and valves — **legendary** |

### Training (4)
| File | Subject |
|---|---|
| `pell` | chest-high wooden training post, deeply hacked and splintered |
| `sand-pit` | square raked sand training pit with a low stone border |
| `weapon-rack` | wooden rack of gladii, tridents and spears, neatly ordered |
| `sparring-dummy` | jointed weighted training dummy in rival-dynasty colours |

### Housing (2)
| File | Subject |
|---|---|
| `beast-cage` | heavy iron-barred cage, thick bars, chained door, empty |
| `feed-trough` | long stone feeding trough, worn smooth |

### Trophies (8) — these are the arena prizes, make them *want*-able
| File | Subject |
|---|---|
| `kek-banner` | hanging green-and-gold banner with a gold Kek sigil, tasselled |
| `brazier` | standing bronze brazier, coals lit |
| `floor-mosaic` | circular floor mosaic of the Kek sigil, green and gold tile |
| `gladiator-laurel` | gilded laurel wreath crown — **epic** |
| `champions-helm` | crested Roman gladiator helm, dented at the temple, never repaired |
| `chained-skull` | enormous beast skull hung on heavy chains |
| `victory-standard` | Roman legion standard, gold Kek emblem atop, green pennants — **legendary** |
| `statue` | carved marble statue of an emperor in Kek likeness, gold-leaf detail — **legendary** |

---

# BATCH 3 — Mythic capstones (6, 16:9)

The tier-5 reveal for the six rooms that don't have one. Match the energy of the
granary you already made: grand, packed, lit, clearly the top of the ladder.
`granary`, `infirmary` and `portal` are **done**.

| File | Subject |
|---|---|
| `room-forge` | vast vaulted war-forge, multiple lit bloomeries, racks of finished arms, sparks, smoke drawn up a central flue |
| `room-mine` | deep gold mine cathedral, glowing veins in the rock, ore carts on rails, lantern chains strung across the void |
| `room-hall` | legion great hall, long banquet tables, banners on every column, huge hearth, feast in progress |
| `room-warroom` | grand war room, enormous carved relief map table, campaign banners, red string and markers |
| `room-quarters` | the Master's quarters — a Kek emperor holding court on a raised dais, purple drapery, oil lamps, attendants |
| `room-warchest` | treasury vault, stacked gold, iron-bound chests, a glowing arcane ledger, heavy vault door |

---

# BATCH 4 — the Colosseum (the layer above your ludus)

This is the shared venue Kekius Maximus runs, and there's currently **no art for
it at all**.

| File | Size | Subject |
|---|---|---|
| `kekius-maximus` | 467×700 | **Kekius Maximus enthroned in his imperial box** — Kek emperor, laurel crown, purple and gold, presiding over an arena, thumb hovering. Not a fighter — *the house.* **Highest priority on this list.** |
| `scene-colosseum` | 16:9 | The great Colosseum exterior at dusk, packed tiers, banners, crowd |
| `scene-colosseum-floor` | 16:9 | Arena floor from a fighter's eye line, sand, gates, roaring crowd above |
| `scene-ludus` | 16:9 | Your own small private training colosseum — modest, dusty, a handful of fighters |

---

# BATCH 5 — UI gaps (lower priority, high polish value)

Currently emoji or CSS gradients in the live UI.

- **`slot-empty-weapon` / `-armor` / `-mount`** (260², magenta) — dim engraved slot silhouettes. *The most-seen placeholder in the game: every unequipped hero.*
- **5 rarity frames** (360², magenta) — ornate borders, common→legendary, for the lunchbox reveal. Currently a bare CSS gradient.
- **`res-salves`** (260², magenta) — a salve/ointment pot. Currently reusing the crystal icon.
- **Panel banners** (16:9): `scene-exchange`, `scene-realm`, `scene-duels`, `scene-legion`, `scene-slavemarket`.
- **5 Realm parcel tiles** (360²) — mine / farm / infirmary camp / crystal node / citadel, plus one "unclaimed plot".

---

## Priority if you only do some

1. **Batch 1** — 3 shells + anvil. Nothing else can be validated until the key works.
2. **`kekius-maximus`** — the face of the whole framing, and it doesn't exist.
3. **`mutagen-vat`, `ichor-tap`, `emberfat-crucible`** — the three trade-good machines the social economy runs on.
4. **Batch 2** — the rest of the props.
5. **Batch 3** — Mythic capstones.

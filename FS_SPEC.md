# Fallout Shelter — Build Spec (clone reference)

> The canonical reference we build the Kekius vault against. Frog-empire re-skin on top,
> but the **systems + numbers + game-feel** come from here. Keep Market + Codex; rebuild the rest to this.

## Our game vs. this spec — gap map (what we're missing)
- **Power → Water → Food triad with gating** — power runs rooms (unpowered rooms shut off), water stops radiation, food stops HP loss. We only have gold + provisions. ❌ (biggest miss)
- **Full SPECIAL (7 stats)** + **training rooms** to raise them; stat scales room output. We have 3 "aptitudes". ❌
- **Happiness / morale %** → global production bonus + daily caps. ❌
- **Breeding** (man+woman in Living Quarters → pregnancy 3h + 3h to adult; baby inherits higher parent stats). ❌
- **Crafting workshops** (Weapon/Outfit build gear from junk; outfits grant SPECIAL). We find gear, can't craft. ❌
- **Room merging** (3 adjacent identical → one wide room, holds 6) + **Storage** + junk. ❌
- **Incidents that spread** room-to-room + **vault-door raider/deathclaw** external attacks (deathclaws at 61+ pop). Ours are single-room. ⚠️
- **Solo wasteland exploration** with the live diary log + auto-loot. We have squad raids (partial). ⚠️
- **Mr. Handy** (auto-collect floor) + **pets** (per-dweller bonuses). ❌
- **Tap-room-to-ZOOM camera** with big animated characters + collect **bubbles** + **happiness faces**. ⚠️ (the game-feel)
- Have already: gold(caps), provisions(food-ish), lunchbox gacha ✅, crystal(≈Quantum) ✅, objectives ✅, daily tribute ✅, HP/wounds ✅, gear equip ✅, rush+incidents (basic) ⚠️, renown/descend (our own twist) ✅.

## Key numbers to clone accurately
- Dwellers **2/room** (**6** in a merged triple). Stat cap **10** (up to **17** with gear). Level cap **50**.
- Pregnancy **3h + 3h** to adult; baby inherits **higher of each parent's stats**.
- Rush failure% = **40 − 2×(avgLuck + avgRoomStat) + 10×(recent attempts)**; success → +10% happiness that room, fail → incident + −10%.
- Incident spawn pops: fire >2, radroaches >9, raiders >14, aliens >26, mole rats >31, ghouls >41, radscorpions >51, **deathclaws >61**.
- Wasteland recall = **½ elapsed time**, no damage on return. Mr. Handy carries **5,000 caps**, max **5** out.
- Lunchbox = **5 cards**, 5th **guaranteed rare+**. Quest crit meter **1.25×–5×** (Luck widens the green zone). Always **3 objectives**.

---

<!-- Full research breakdown below (source of the above). -->

# Fallout Shelter — Complete Design Breakdown

A vault-management idle/sim. You are the Overseer of an underground vault. Core verbs: build rooms, assign dwellers to jobs matching their SPECIAL stats, produce/collect three resources, grow population, equip and send dwellers to the wasteland/quests, survive incidents. F2P with lunchbox gacha and one premium currency (Nuka-Cola Quantum).

## 1 & 2. Rooms — Full Table + Mechanics

Every room is tied to one SPECIAL stat; a dweller's rating in that stat scales the room's output. Build cost rises with each copy; upgrade cost rises per level. Rooms unlock as **population** crosses thresholds. Dwellers per single room = **2**; a merged (triple) room holds **6**.

### Production rooms
| Room | Produces / does | SPECIAL | Build (base) | Unlock (pop) |
|---|---|---|---|---|
| Power Generator | Electricity (powers rooms; unpowered rooms stop) | Strength | 100 | Start |
| Nuclear Reactor | Electricity, higher output | Strength | ~1,200 | 60+ |
| Water Treatment | Water (removes radiation) | Perception | 100 | ~7 |
| Water Purification | Water, higher | Perception | ~1,200 | 46+ |
| Diner | Food (restores HP) | Agility | 100 | ~5 |
| Garden | Food, higher | Agility | ~1,200 | 33+ |
| Nuka-Cola Bottler | Food AND water at once | Endurance | ~3,000 | 70+ |
| Medbay | Stimpaks (heal HP) | Intelligence | ~400 | ~14 |
| Science Lab | RadAway (remove rads) | Intelligence | ~400 | ~16 |

Production accrues into a "ready" bubble above the room; **tap to collect**. Keeps producing offline. Luck → chance of bonus caps on collect.

### Training rooms (raise a stat up to 10; higher stat = slower training, ~25min 1→2 up to ~22h 9→10)
Weight (S), Athletics (A), Armory (P), Classroom (I), Fitness (E), Lounge (C), Game Room (L). ~600 caps base. Unlocks pop ~24–40.

### Crafting workshops (consume junk + caps)
Weapon Workshop (~800), Outfit Workshop (~1,200), Theme Workshop (~3,200, cosmetic).

### Utility
Living Quarters (pop cap + breeding, Charisma), Storage (gear/junk cap), Radio Studio (attract dwellers + vault happiness, Charisma, ~600), Overseer's Office (quests; unlock 18 pop; 1,000), Barbershop (cosmetic, ~10,000), Vault Door (defense/entry), Elevator (connect floors).

### Room mechanics
- **Merging:** 3 identical rooms horizontally adjacent auto-merge into one wide room (holds 2/4/6, faster, cheaper to upgrade). Merges instantly if neighbor is L1; else once upgraded to match.
- **Upgrading:** 3 levels; more output/capacity but stronger incidents.
- **Collection:** pools into a tappable bubble; nothing lost offline (Mr. Handy auto-collects a floor).
- **Storage caps:** each resource max set by count/level of relevant rooms; excess wasted.

## 3. Dwellers & SPECIAL
S/P/E/C/I/A/L. Cap 10 (17 w/ gear).
- **Strength** → Power; forces locked loot. **Perception** → Water; find locations/ranged. **Endurance** → Bottler; **HP/level set by END at level-up**; 11+ = rad-immune in wasteland. **Charisma** → Living Quarters/Radio; faster pregnancy. **Intelligence** → Medbay/Science; faster stimpak/radaway. **Agility** → Food; attack speed. **Luck** → rush success + bonus caps + crit + rare finds.
- **Leveling:** XP from working, fastest from wasteland. Max 50. Only END sets HP/level → min-max: train END before leveling.
- **Happiness 0–100%:** vault avg gives 0–10% global production/training bonus + drives daily caps. Up: job matches top SPECIAL, needs met, high-Charisma in Radio, successful rush (+10%), romance, healing. Down: shortages, failed rush (−10%), radiation, corpses, unemployment.
- **Equipment:** 1 weapon + 1 outfit (outfits grant SPECIAL bonuses; swap to make a dweller good at any room).
- **Assignment:** **drag** dweller into room; game highlights good/poor stat match.
- **Breeding (Charisma):** male+female in Living Quarters → pregnancy 3h → child 3h to adult. Baby inherits higher of each parent's stats. Pregnant women flee incidents. Related can't breed.

## 4. Rushing
Failure% = **40 − 2×(avgLuck + avgRoomStat) + 10×(recent attempts)** (never 0). Success → resources + chance caps + **+10% happiness** room. Fail → **incident** + **−10% happiness** (unless reassign within ~1 min).

## 5. Incidents
Internal (fire/radroach/mole rat/radscorpion) + external (raiders/aliens/ghouls/deathclaws breach the vault door and march inward). Must be beaten in the room before spreading (radscorpions teleport). **Combat effectiveness = HP + weapon damage + pet bonus only** (SPECIAL/outfit don't affect incident combat). Spawn pops: fire>2, roaches>9, raiders>14, aliens>26, moles>31, ghouls>41, radscorpions>51, **deathclaws>61**. Death → revive for caps (100@L1 → 1,000@L50).

## 6. Wasteland Exploration
Drag ONE dweller out the vault door. Live timestamped **diary log** of encounters; auto-loots caps/weapons/outfits/junk/XP, auto-equips better weapon, auto-uses stimpaks/radaway. Tougher enemies the longer out. Explores until recalled; **fastest way to level**. Recall anytime; return = **½ elapsed**, no damage. Death → keep loot, revive for caps.

## 7. Quests (Overseer's Office, unlock 18 pop)
Send **up to 3** dwellers; re-equip on launch. Cards show desc + loot hints + requirements (min weapon dmg / level). Party travels in real time. **Semi-auto combat:** tap dweller→enemy to focus, feed stimpaks, hit the **crit meter** (1.25×–5×, Luck widens green). Objective (kill boss / find item). Rewards: caps/gear/junk/XP/**lunchboxes**/legendary dwellers/pets/Quantum. Story lines + daily/weekly rotating.

## 8. Economy & Progression
- **Caps** (soft): production, daily report, wasteland, quests, Mr. Handy, objectives. Spent on rooms + revives.
- **Nuka-Cola Quantum** (premium): skip quest/wasteland travel, skip objectives (first 2, +150% each), 1 free obj skip/day.
- **Lunchbox (gacha):** 5 cards random order, **5th guaranteed rare+**; pool = caps/resources/junk/weapons/outfits/dwellers(+legendary)/Quantum/pets/Mr.Handy. From purchase/objectives/quests/day-7 streak/weekly 100% happiness.
- **Mr. Handy:** auto-collects a floor + fights incidents; or wasteland cap-farm (5,000 cap, max 5 out). Repair 2,000 if destroyed.
- **Pets:** Common/Rare/Legendary; attach to one dweller for passive bonus (+dmg, dmg/rad resist, objective ×, XP/training boost, extra caps/loot, +SPECIAL to babies).
- **Objectives:** always 3; complete → replace. **Daily report** pays caps by happiness; 7-day streak → lunchbox; weekly at high happiness → lunchbox.

**Loop:** Early = 3 basic production rooms, grow via radio+babies, balance resources. Mid = storage/medbay/science/training, equip, wasteland runs, Overseer at 18 for quests, manage raider/ghoul incidents. Late = advanced production, max dwellers w/ legendary gear+pets, quest lines, high-pop incidents (deathclaws 61+).

## 9. UI / UX & Game-Feel
- **Cutaway "ant-farm" side-cut grid** — see all rooms+dwellers at once; 2D grid, warm 3D when zoomed in.
- **Zoom:** out for macro, **in on a room** to watch dwellers work + read barks. Camera pans across floors.
- **Top resource bars** (power/water/food fill/deplete; red = shortage saps happiness) + caps + Quantum.
- **"Ready to collect" bubbles** pop above rooms — primary tactile collection.
- **Dweller feedback:** HP bar + **happiness face** (green→yellow→red); tap → stats/equipment/level.
- **Art:** bright warm retro-optimistic cartoon (Vault-Boy style); every dweller a Vault-Boy character; 1950s atomic aesthetic — cute + readable offsets the grim premise.

## What makes it addictive (core loop to clone)
1. Tap-to-collect bubbles on short timers = constant micro-rewards.
2. Three interlocking resources force ongoing rebalancing — never "done."
3. Idle + offline production; Mr. Handy automates → respects time while pulling you back.
4. Gacha lunchboxes (guaranteed-rare 5th) = dopamine engine; legendaries = the chase.
5. Rushing = deliberate risk/reward gambling on the idle base.
6. Population thresholds unlock scarier incidents → growth raises stakes.
7. Dweller identity: naming, SPECIAL min-max, breeding for inherited stats, outfits = persistent investment.
8. Layered goals: 3 objectives + daily/weekly + quest lines = short/mid/long horizons on the minute-to-minute loop.

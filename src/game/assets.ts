// ---------------------------------------------------------------------------
// Auto-generated asset catalog for the loose `grok-*` art set.
// Every image is classified by type + rarity and priced (in-game gold buy/sell
// + on-chain USD). Pricing is anchored to GEAR_SELL_VALUE / RARITY_META in
// config.ts: sellGold = GEAR_SELL_VALUE[rarity] * typeMult, buyGold = sell * 2.5,
// priceUsd = usdBase[rarity] * typeMult. Regenerate via scratchpad/assemble.
// 96 assets total.
// ---------------------------------------------------------------------------
import type { GearDef, GearSlot, OnchainListing, Rarity, Tier } from "./types";

const B = import.meta.env.BASE_URL;

/** Broad classification bucket for a raw art asset. */
export type AssetType =
  | "hero"
  | "boss"
  | "weapon"
  | "armor"
  | "accessory"
  | "mount"
  | "room"
  | "raid"
  | "crate"
  | "banner"
  | "icon"
  | "other";

export interface AssetEntry {
  /** Public path (BASE_URL-prefixed for GitHub Pages). */
  img: string;
  /** Source filename under /public. */
  file: string;
  type: AssetType;
  rarity: Rarity;
  name: string;
  desc: string;
  /** Gold to buy from the market. */
  buyGold: number;
  /** Gold returned when sold back. */
  sellGold: number;
  /** On-chain price (USD, settled via Universal Accounts). 0 = not for sale. */
  priceUsd: number;
}

export const ASSET_TYPE_LABEL: Record<AssetType, string> = {
  hero: "Heroes / Gladiators",
  boss: "Arena Bosses",
  weapon: "Weapons",
  armor: "Armor",
  accessory: "Accessories (helms, capes, amulets, relics)",
  mount: "Mounts",
  room: "Chambers / Rooms",
  raid: "Raid Locations",
  crate: "Loot Crates",
  banner: "Banners / Standards",
  icon: "Resource & Currency Icons",
  other: "Misc Artifacts",
};

export const ASSET_CATALOG: AssetEntry[] = [
  // ── Heroes / Gladiators (1) ──
  { img: `${B}grok-6b7c4d79-19ea-4f0d-85af-d7d4c1d1ee53.jpg`, file: "grok-6b7c4d79-19ea-4f0d-85af-d7d4c1d1ee53.jpg", type: "hero", rarity: "uncommon", name: "Caged Kek Captive", buyGold: 1200, sellGold: 480, priceUsd: 0.3, desc: "A ragged hooded Kek gladiator chained inside a rusted wheeled prison cage." },
  // ── Arena Bosses (6) ──
  { img: `${B}grok-0e52524f-6ed5-4739-b8ee-bde4f3118d56.jpg`, file: "grok-0e52524f-6ed5-4739-b8ee-bde4f3118d56.jpg", type: "boss", rarity: "epic", name: "Boss Tome of Chains", buyGold: 26000, sellGold: 10400, priceUsd: 4, desc: "A gilded ancient tome bound in rusted chains and tattered purple ribbons, bearing a laurel-wreathed BOSS crest." },
  { img: `${B}grok-6dddd641-2129-4287-ab98-a29e178fd8cc.jpg`, file: "grok-6dddd641-2129-4287-ab98-a29e178fd8cc.jpg", type: "boss", rarity: "legendary", name: "Kekius Maximus, Arena Boss", buyGold: 60000, sellGold: 24000, priceUsd: 7, desc: "An armored Kek champion in a laurel crown standing over fallen chained Kek foes in a torchlit arena." },
  { img: `${B}grok-b93c3487-58b9-46c1-919c-5593d30fe11e.jpg`, file: "grok-b93c3487-58b9-46c1-919c-5593d30fe11e.jpg", type: "boss", rarity: "legendary", name: "Kekius Maximus War Chariot", buyGold: 60000, sellGold: 24000, priceUsd: 7, desc: "A black-and-gold Roman war chariot drawn by three armored black horses through purple and gold flames, labeled BOSS Kekius Maximus." },
  { img: `${B}grok-dcae38dc-bd7d-4dcf-adf5-e0cc0927839b.jpg`, file: "grok-dcae38dc-bd7d-4dcf-adf5-e0cc0927839b.jpg", type: "boss", rarity: "legendary", name: "Controller of Ash", buyGold: 60000, sellGold: 24000, priceUsd: 7, desc: "A cracked, chain-wrapped game controller glowing with lava veins and a golden BOSS laurel emblem." },
  { img: `${B}grok-e29502fe-f8af-4f47-b16a-aa6a0eb5333b.jpg`, file: "grok-e29502fe-f8af-4f47-b16a-aa6a0eb5333b.jpg", type: "boss", rarity: "legendary", name: "Nucleus Ludus", buyGold: 60000, sellGold: 24000, priceUsd: 7, desc: "A lava-cracked golden game controller ringed by a fiery halo, titled Nucleus Ludus as an arena boss." },
  { img: `${B}grok-f5d981d0-c917-44ce-adfa-8cc177352d65.jpg`, file: "grok-f5d981d0-c917-44ce-adfa-8cc177352d65.jpg", type: "boss", rarity: "epic", name: "The Toad Warden's Pit", buyGold: 26000, sellGold: 10400, priceUsd: 4, desc: "A caped Kek gladiator boss commands chained toad slaves in a fiery underground forge arena." },
  // ── Weapons (2) ──
  { img: `${B}grok-7581bd31-aebf-4dc9-af63-6940197de973.jpg`, file: "grok-7581bd31-aebf-4dc9-af63-6940197de973.jpg", type: "weapon", rarity: "rare", name: "Chained Sunblade Gladius", buyGold: 550, sellGold: 220, priceUsd: 0.1, desc: "A weathered iron dagger wrapped in rusty chains and rope with a sun-sigil crossguard, set against a metal ring." },
  { img: `${B}grok-977031e0-ccb2-4d43-bebe-d6ced272d4c6.jpg`, file: "grok-977031e0-ccb2-4d43-bebe-d6ced272d4c6.jpg", type: "weapon", rarity: "rare", name: "Retiarius Trident and Net", buyGold: 550, sellGold: 220, priceUsd: 0.1, desc: "A blood-spattered gladiator trident paired with a coiled hemp net and chain." },
  // ── Armor (17) ──
  { img: `${B}grok-0a37df45-a2f4-45d3-b6b8-2942f31abd97.jpg`, file: "grok-0a37df45-a2f4-45d3-b6b8-2942f31abd97.jpg", type: "armor", rarity: "legendary", name: "Kekius Augur Cuirass Tier V", buyGold: 3000, sellGold: 1200, priceUsd: 0.35, desc: "An ornate blackened breastplate laced with molten lava cracks and gold trim, radiating a golden aura." },
  { img: `${B}grok-16fae1d1-1342-4d1b-b983-9ce23350bc1a.jpg`, file: "grok-16fae1d1-1342-4d1b-b983-9ce23350bc1a.jpg", type: "armor", rarity: "rare", name: "Bronze Champion's Cuirass", buyGold: 550, sellGold: 220, priceUsd: 0.1, desc: "A battle-scarred bronze breastplate with layered pauldrons and a gold crested-fish emblem, spattered with blood." },
  { img: `${B}grok-1c13649a-f82f-41f3-920b-f86dc4e707ae.jpg`, file: "grok-1c13649a-f82f-41f3-920b-f86dc4e707ae.jpg", type: "armor", rarity: "rare", name: "Gladiator Pteruges and Greaves", buyGold: 550, sellGold: 220, priceUsd: 0.1, desc: "A studded leather war-skirt with gold-tipped straps paired with two cracked steel-and-gold shin greaves." },
  { img: `${B}grok-3e5bef6b-641d-4ab4-b49b-b349c4290294.jpg`, file: "grok-3e5bef6b-641d-4ab4-b49b-b349c4290294.jpg", type: "armor", rarity: "epic", name: "Orc Champion's Bronze Pauldron", buyGold: 1300, sellGold: 520, priceUsd: 0.2, desc: "A scarred green muscular orc torso fitted with an ornate engraved bronze shoulder and arm guard." },
  { img: `${B}grok-5a116654-ab17-4423-a30f-2638bbb84b61.jpg`, file: "grok-5a116654-ab17-4423-a30f-2638bbb84b61.jpg", type: "armor", rarity: "uncommon", name: "Dimachaerus Damnati Cuirass", buyGold: 200, sellGold: 80, priceUsd: 0.05, desc: "A worn leather and iron gladiator chest harness with crossed twin blades and a DAMNATI nameplate." },
  { img: `${B}grok-65bad2bf-36cb-4b9c-a80e-6db224374554.jpg`, file: "grok-65bad2bf-36cb-4b9c-a80e-6db224374554.jpg", type: "armor", rarity: "epic", name: "BOSS Kekius Maximus Cuirass", buyGold: 1300, sellGold: 520, priceUsd: 0.2, desc: "A dark ornate breastplate with purple cape reading BOSS and a KEKIUS MAXIMUS belt beneath a floating laurel wreath." },
  { img: `${B}grok-7ecb1723-23ed-4c2d-ae0e-dc86e73ad7d4.jpg`, file: "grok-7ecb1723-23ed-4c2d-ae0e-dc86e73ad7d4.jpg", type: "armor", rarity: "legendary", name: "Emberforged Laurel Greaves", buyGold: 3000, sellGold: 1200, priceUsd: 0.35, desc: "A pair of black shin greaves engraved with gold laurel patterns and glowing lava cracks." },
  { img: `${B}grok-90d477d1-5be6-40b3-a55a-a0e011b5ff09.jpg`, file: "grok-90d477d1-5be6-40b3-a55a-a0e011b5ff09.jpg", type: "armor", rarity: "common", name: "Bloodstained Battle Cuirass", buyGold: 75, sellGold: 30, priceUsd: 0.02, desc: "A rusted, blood-splattered iron chest plate with worn leather buckle straps and battle gashes." },
  { img: `${B}grok-9a3ce9ae-19c2-4b8f-bfa1-0749d6ecfa79.jpg`, file: "grok-9a3ce9ae-19c2-4b8f-bfa1-0749d6ecfa79.jpg", type: "armor", rarity: "epic", name: "Imperial Laurel Cuirass", buyGold: 1300, sellGold: 520, priceUsd: 0.2, desc: "A gilded Roman breastplate with purple laurel inlay and matching bracers, floating amid embers." },
  { img: `${B}grok-a18eac39-8013-4f68-8380-ae11447e000f.jpg`, file: "grok-a18eac39-8013-4f68-8380-ae11447e000f.jpg", type: "armor", rarity: "epic", name: "Purple-Bound Duelist Cuirass", buyGold: 1300, sellGold: 520, priceUsd: 0.2, desc: "An ornate dark leather chest cuirass with gold scale plating, purple straps and twin sheathed daggers." },
  { img: `${B}grok-a33707b2-8319-4fef-a30a-7606c1903331.jpg`, file: "grok-a33707b2-8319-4fef-a30a-7606c1903331.jpg", type: "armor", rarity: "legendary", name: "Molten Laurel Warplate", buyGold: 3000, sellGold: 1200, priceUsd: 0.35, desc: "A black lava-cracked breastplate with golden laurel pauldrons and two crossed swords sheathed at the sides." },
  { img: `${B}grok-a95c976f-7a96-40cb-bc9f-36f7a810ff05.jpg`, file: "grok-a95c976f-7a96-40cb-bc9f-36f7a810ff05.jpg", type: "armor", rarity: "rare", name: "Ragged Pilgrim's Shroud", buyGold: 550, sellGold: 220, priceUsd: 0.1, desc: "A tattered hooded cloak over rusted breastplate marked with a gold sun-cross, bound with rope and chain." },
  { img: `${B}grok-afa327ec-5dae-419b-8662-33f9de28b0d8.jpg`, file: "grok-afa327ec-5dae-419b-8662-33f9de28b0d8.jpg", type: "armor", rarity: "epic", name: "Gilded Greaves of the Green Champion", buyGold: 1300, sellGold: 520, priceUsd: 0.2, desc: "Green-skinned gladiator legs clad in studded leather skirt, gold-trimmed greaves and sandals." },
  { img: `${B}grok-b85db237-fe36-4179-9df8-908de8259eb7.jpg`, file: "grok-b85db237-fe36-4179-9df8-908de8259eb7.jpg", type: "armor", rarity: "common", name: "Tattered Slave Cuirass", buyGold: 75, sellGold: 30, priceUsd: 0.02, desc: "A worn, shredded leather chestplate lashed with rope and trailing rusted chains." },
  { img: `${B}grok-c63c903b-7a57-4cfd-a97b-d38f009857ac.jpg`, file: "grok-c63c903b-7a57-4cfd-a97b-d38f009857ac.jpg", type: "armor", rarity: "common", name: "Chained Slave Hood", buyGold: 75, sellGold: 30, priceUsd: 0.02, desc: "A tattered hooded cloak wrapped in heavy rusted chains and iron shackles." },
  { img: `${B}grok-c6b3052f-9e8f-4910-9ec4-724f282ad04a.jpg`, file: "grok-c6b3052f-9e8f-4910-9ec4-724f282ad04a.jpg", type: "armor", rarity: "common", name: "Gladiator Hands Armor", buyGold: 75, sellGold: 30, priceUsd: 0.02, desc: "A pair of studded iron gauntlets bound with rope and chains labeled as common gladiator hand armor." },
  { img: `${B}grok-f1975090-5387-4527-9433-642bae28394c.jpg`, file: "grok-f1975090-5387-4527-9433-642bae28394c.jpg", type: "armor", rarity: "uncommon", name: "Manicae Arm Guards", buyGold: 200, sellGold: 80, priceUsd: 0.05, desc: "A pair of battered iron gladiator arm guards bound with buckles and chains." },
  // ── Accessories (helms, capes, amulets, relics) (22) ──
  { img: `${B}grok-14adb26f-c311-4a36-b189-9a53635daa2c.jpg`, file: "grok-14adb26f-c311-4a36-b189-9a53635daa2c.jpg", type: "accessory", rarity: "legendary", name: "Ampulla of Radiant Nectar", buyGold: 2400, sellGold: 960, priceUsd: 0.28, desc: "A crystal decanter wrapped in a golden laurel branch, glowing with swirling radiant golden liquid amid arcane runes." },
  { img: `${B}grok-239a8c50-62a9-4dee-bd0a-586e60bc7c23.jpg`, file: "grok-239a8c50-62a9-4dee-bd0a-586e60bc7c23.jpg", type: "accessory", rarity: "epic", name: "Vial of Violet Soulfire", buyGold: 1040, sellGold: 415, priceUsd: 0.16, desc: "A gold-filigreed crystal bottle containing a swirling orb of purple and golden flame, floating on a dark background." },
  { img: `${B}grok-3e5f4f1a-d900-49bb-b9eb-d73f4556c4a8.jpg`, file: "grok-3e5f4f1a-d900-49bb-b9eb-d73f4556c4a8.jpg", type: "accessory", rarity: "legendary", name: "Flamma Octoginta Elixir", buyGold: 2400, sellGold: 960, priceUsd: 0.28, desc: "An ornate gilded glass potion bottle holding swirling purple and fiery flame, mounted on a carved stone plinth." },
  { img: `${B}grok-403efd36-515e-48f8-9b31-c40cdda99344.jpg`, file: "grok-403efd36-515e-48f8-9b31-c40cdda99344.jpg", type: "accessory", rarity: "rare", name: "Vial of Crimson Blood", buyGold: 440, sellGold: 175, priceUsd: 0.08, desc: "A wax-sealed square glass bottle half-filled with deep red liquid, spotlit on a dark surface." },
  { img: `${B}grok-4c4e722b-6022-45ff-83f2-a667d4dcb0b5.jpg`, file: "grok-4c4e722b-6022-45ff-83f2-a667d4dcb0b5.jpg", type: "accessory", rarity: "rare", name: "Winged Fascinus Amulet", buyGold: 440, sellGold: 175, priceUsd: 0.08, desc: "An aged bronze verdigris pendant amulet featuring wings, an eye, a crescent, and small ritual bells." },
  { img: `${B}grok-58047e09-e786-4d81-9f60-ed61d02d9313.jpg`, file: "grok-58047e09-e786-4d81-9f60-ed61d02d9313.jpg", type: "accessory", rarity: "rare", name: "Runed Seer's Compass", buyGold: 440, sellGold: 175, priceUsd: 0.08, desc: "A cracked stone disc ringed with runes surrounding a glowing brass compass-star face wreathed in smoke." },
  { img: `${B}grok-619cdc06-553f-460a-aa59-4c1cd4ae8887.jpg`, file: "grok-619cdc06-553f-460a-aa59-4c1cd4ae8887.jpg", type: "accessory", rarity: "rare", name: "Phial of the Sacred Tide", buyGold: 440, sellGold: 175, priceUsd: 0.08, desc: "A corked glass bottle containing swirling luminous water, ash, sand and petals under a glowing sun-cross sigil." },
  { img: `${B}grok-61a8a228-2ef8-4c27-8ac0-d25105d7f8e9.jpg`, file: "grok-61a8a228-2ef8-4c27-8ac0-d25105d7f8e9.jpg", type: "accessory", rarity: "epic", name: "Grimoire of the Violet Seal", buyGold: 1040, sellGold: 415, priceUsd: 0.16, desc: "An ornate purple leather tome bound with engraved brass corner-guards and clasps." },
  { img: `${B}grok-649287d3-50a9-41c5-ba68-348c3adbae87.jpg`, file: "grok-649287d3-50a9-41c5-ba68-348c3adbae87.jpg", type: "accessory", rarity: "legendary", name: "Lava-Cracked Laurel Helm", buyGold: 2400, sellGold: 960, priceUsd: 0.28, desc: "A blackened gladiator helm with glowing lava cracks, gold laurel wreath, and a gamepad-styled crown crest." },
  { img: `${B}grok-779fc6e2-cd28-4dd9-9ddb-fbba5b202a9b.jpg`, file: "grok-779fc6e2-cd28-4dd9-9ddb-fbba5b202a9b.jpg", type: "accessory", rarity: "epic", name: "BOSS Kekius Maximus Helm", buyGold: 1040, sellGold: 415, priceUsd: 0.16, desc: "A pair of dark gold-trimmed gladiator helms inscribed BOSS and KEKIUS MAXIMUS amid glowing runes." },
  { img: `${B}grok-84452d83-057b-449f-b2c3-8c8d58cd916d.jpg`, file: "grok-84452d83-057b-449f-b2c3-8c8d58cd916d.jpg", type: "accessory", rarity: "epic", name: "BOSS Laureate Helm", buyGold: 1040, sellGold: 415, priceUsd: 0.16, desc: "An ornate Roman gladiator helmet crowned with a golden laurel wreath and BOSS emblazoned across the brow over a purple cape." },
  { img: `${B}grok-899f7f0d-5f71-4879-84ff-4cac0535b083.jpg`, file: "grok-899f7f0d-5f71-4879-84ff-4cac0535b083.jpg", type: "accessory", rarity: "rare", name: "Verdigris Relic Locket", buyGold: 440, sellGold: 175, priceUsd: 0.08, desc: "An aged bronze locket amulet on a chain, cracked open to reveal a ruby-set golden figure inside." },
  { img: `${B}grok-aaadef26-4293-49f3-b048-11beabfd77cd.jpg`, file: "grok-aaadef26-4293-49f3-b048-11beabfd77cd.jpg", type: "accessory", rarity: "epic", name: "Sigillum Rex Slave Seal", buyGold: 1040, sellGold: 415, priceUsd: 0.16, desc: "A dark red wax seal reading Sigillum Rex Slave Seal beside a chain-wrapped Kek-headed staff." },
  { img: `${B}grok-bb4c4d02-15f5-42b3-9587-7b2063da5dd9.jpg`, file: "grok-bb4c4d02-15f5-42b3-9587-7b2063da5dd9.jpg", type: "accessory", rarity: "epic", name: "Runed Compass of Fate", buyGold: 1040, sellGold: 415, priceUsd: 0.16, desc: "An ornate golden compass engraved with glowing runes and swirling purple mist." },
  { img: `${B}grok-bf365973-02d6-40dc-9d40-05e79b2020c9.jpg`, file: "grok-bf365973-02d6-40dc-9d40-05e79b2020c9.jpg", type: "accessory", rarity: "epic", name: "Lion-and-Serpent Amulet", buyGold: 1040, sellGold: 415, priceUsd: 0.16, desc: "An ornate oval brass pendant engraved with a lion, coiled serpent, and scarab, resting beside an ancient scroll and obsidian shards." },
  { img: `${B}grok-d017267f-c8d2-4821-86d4-1d43f5942021.jpg`, file: "grok-d017267f-c8d2-4821-86d4-1d43f5942021.jpg", type: "accessory", rarity: "epic", name: "Imperial Laurel Cloak", buyGold: 1040, sellGold: 415, priceUsd: 0.16, desc: "A regal purple velvet hooded cape clasped with a golden laurel wreath emblem." },
  { img: `${B}grok-d794e0b8-0cf1-43f6-901f-a485e173ba12.jpg`, file: "grok-d794e0b8-0cf1-43f6-901f-a485e173ba12.jpg", type: "accessory", rarity: "uncommon", name: "Verdigris Tome", buyGold: 165, sellGold: 65, priceUsd: 0.04, desc: "A weathered ancient book bound in leather with green-patina copper corners floating in a misty void." },
  { img: `${B}grok-df87c7eb-5bcd-4dd4-9b33-cf1654d2cbcf.jpg`, file: "grok-df87c7eb-5bcd-4dd4-9b33-cf1654d2cbcf.jpg", type: "accessory", rarity: "rare", name: "Curse Tablet of Sulis Minerva", buyGold: 440, sellGold: 175, priceUsd: 0.08, desc: "An inscribed metal curse scroll bearing a Latin defixio invoking the goddess Sulis Minerva." },
  { img: `${B}grok-ed65fef4-18d9-4479-a6d3-ab23007ead8f.jpg`, file: "grok-ed65fef4-18d9-4479-a6d3-ab23007ead8f.jpg", type: "accessory", rarity: "rare", name: "Elixir of the Green Draught", buyGold: 440, sellGold: 175, priceUsd: 0.08, desc: "A bronze cup filled with a glowing green herbal potion steeped with floating sprigs and blossoms." },
  { img: `${B}grok-f361c98a-d696-4a34-a1c1-bfbe3c943ee6.jpg`, file: "grok-f361c98a-d696-4a34-a1c1-bfbe3c943ee6.jpg", type: "accessory", rarity: "epic", name: "Ashen Cog Mantle", buyGold: 1040, sellGold: 415, priceUsd: 0.16, desc: "A tattered purple-and-gold scarf with smoldering ember-burnt edges clasped by a bronze gear brooch." },
  { img: `${B}grok-fb3c5c07-1696-43e8-9221-3d24f8be1e37.jpg`, file: "grok-fb3c5c07-1696-43e8-9221-3d24f8be1e37.jpg", type: "accessory", rarity: "rare", name: "Sealed Papyrus Scroll", buyGold: 440, sellGold: 175, priceUsd: 0.08, desc: "A rolled papyrus scroll tied with cord and a wax seal, capped with ornate engraved bronze end pieces." },
  { img: `${B}grok-ffa79002-03e2-45cc-8476-42ab97fc9cf1.jpg`, file: "grok-ffa79002-03e2-45cc-8476-42ab97fc9cf1.jpg", type: "accessory", rarity: "epic", name: "Amulet of Medusa", buyGold: 1040, sellGold: 415, priceUsd: 0.16, desc: "A carved black-stone Medusa-head pendant flecked with gold, hung on a heavy dark chain." },
  // ── Mounts (2) ──
  { img: `${B}grok-49965c7e-a992-4d2a-bb17-1e6b96ba5d1d.jpg`, file: "grok-49965c7e-a992-4d2a-bb17-1e6b96ba5d1d.jpg", type: "mount", rarity: "legendary", name: "Kekius Maximus Boss Litter", buyGold: 3600, sellGold: 1440, priceUsd: 0.42, desc: "A gilded ceremonial carried sedan-chair litter with purple velvet cushions, laurel-crowned towers, and boss lettering." },
  { img: `${B}grok-ad736e9b-efd4-4ce2-a630-46c353e2c040.jpg`, file: "grok-ad736e9b-efd4-4ce2-a630-46c353e2c040.jpg", type: "mount", rarity: "common", name: "Chained Pack Mule", buyGold: 90, sellGold: 35, priceUsd: 0.02, desc: "A scarred, weary pack donkey burdened with chained bedrolls, sacks and gear." },
  // ── Chambers / Rooms (1) ──
  { img: `${B}grok-577d050b-b758-4b49-9281-83c80ea9f710.jpg`, file: "grok-577d050b-b758-4b49-9281-83c80ea9f710.jpg", type: "room", rarity: "rare", name: "Ludus Kek Barracks", buyGold: 2200, sellGold: 880, priceUsd: 0.4, desc: "A cutaway underground gladiator school with a training arena, kitchen, bunk barracks, catacombs, and a radio nook full of Kek warriors." },
  // ── Raid Locations (4) ──
  { img: `${B}grok-2b47b430-3013-4413-8c00-d77e6ee3e14a.jpg`, file: "grok-2b47b430-3013-4413-8c00-d77e6ee3e14a.jpg", type: "raid", rarity: "rare", name: "Wasteland of Ruined Scrolls", buyGold: 1650, sellGold: 660, priceUsd: 0.3, desc: "A desert battlefield of toppled Roman ruins and meme-carved tombstones where armored Kek gladiators march past a crumbling temple." },
  { img: `${B}grok-565b905f-2b78-4e78-a1f2-35781f52c1a1.jpg`, file: "grok-565b905f-2b78-4e78-a1f2-35781f52c1a1.jpg", type: "raid", rarity: "epic", name: "Volcanic Crystal Realm Map", buyGold: 3900, sellGold: 1560, priceUsd: 0.6, desc: "An aged fantasy world map showing a crystal city, erupting volcanoes, sea serpents, and a compass rose." },
  { img: `${B}grok-571d567b-f91f-4a5f-913f-762cdef503c0.jpg`, file: "grok-571d567b-f91f-4a5f-913f-762cdef503c0.jpg", type: "raid", rarity: "epic", name: "Ruins of the Normie Wastes", buyGold: 3900, sellGold: 1560, priceUsd: 0.6, desc: "Armored Kek gladiators led by a BOSS march through a smoldering battlefield of shattered meme-inscribed pillars and statues." },
  { img: `${B}grok-c5fc7200-2655-42cb-98e1-fe808c5cbd9d.jpg`, file: "grok-c5fc7200-2655-42cb-98e1-fe808c5cbd9d.jpg", type: "raid", rarity: "epic", name: "Meme Colosseum", buyGold: 3900, sellGold: 1560, priceUsd: 0.6, desc: "Two armored Kek gladiators duel in a neon-lit ruined arena packed with cheering shadowy crowds and floating game controllers." },
  // ── Loot Crates (13) ──
  { img: `${B}grok-160b641f-6e96-479f-82e9-422b887e54cc.jpg`, file: "grok-160b641f-6e96-479f-82e9-422b887e54cc.jpg", type: "crate", rarity: "epic", name: "Imperial Purple Reliquary", buyGold: 1950, sellGold: 780, priceUsd: 0.3, desc: "An ornate domed treasure chest of royal purple panels bound in gold laurel filigree and arcane sigils." },
  { img: `${B}grok-296c351f-bc74-4094-a239-5666166392f2.jpg`, file: "grok-296c351f-bc74-4094-a239-5666166392f2.jpg", type: "crate", rarity: "legendary", name: "Molten Emberbound Chest", buyGold: 4500, sellGold: 1800, priceUsd: 0.52, desc: "A black domed chest webbed with glowing lava cracks, wrapped in purple straps and gilded baroque fittings." },
  { img: `${B}grok-2d8308e4-d92b-43ab-a697-e9bbc252af5a.jpg`, file: "grok-2d8308e4-d92b-43ab-a697-e9bbc252af5a.jpg", type: "crate", rarity: "epic", name: "Gladiator's Golden Urn", buyGold: 1950, sellGold: 780, priceUsd: 0.3, desc: "An ornate bronze funerary vase engraved with a gladiator-and-laurel emblem, glowing with golden inner light." },
  { img: `${B}grok-453c50de-421c-4c64-a4e5-ef2f4903e163.jpg`, file: "grok-453c50de-421c-4c64-a4e5-ef2f4903e163.jpg", type: "crate", rarity: "rare", name: "Sealed Eagle Amphora", buyGold: 825, sellGold: 330, priceUsd: 0.15, desc: "A cracked terracotta amphora bound with cord and stamped with a red wax eagle-and-laurel seal dripping like blood." },
  { img: `${B}grok-59289292-08e2-4f19-935d-d3c6c02f7a8e.jpg`, file: "grok-59289292-08e2-4f19-935d-d3c6c02f7a8e.jpg", type: "crate", rarity: "rare", name: "Gladiator's Sand Chest", buyGold: 825, sellGold: 330, priceUsd: 0.15, desc: "A sand-crusted, blood-splattered treasure chest bound in ornate bronze with a glowing gladiator-helm crest." },
  { img: `${B}grok-8ae97ffb-eb5a-4aa5-86be-a838073e2cdf.jpg`, file: "grok-8ae97ffb-eb5a-4aa5-86be-a838073e2cdf.jpg", type: "crate", rarity: "epic", name: "BOSS Tome of Fire", buyGold: 1950, sellGold: 780, priceUsd: 0.3, desc: "A leather-bound gilded tome wreathed in flames with the glowing word BOSS on its cover." },
  { img: `${B}grok-8e944457-300f-42a2-a4f5-e97ea15ab2b5.jpg`, file: "grok-8e944457-300f-42a2-a4f5-e97ea15ab2b5.jpg", type: "crate", rarity: "epic", name: "Vessel of Swirling Aether", buyGold: 1950, sellGold: 780, priceUsd: 0.3, desc: "An ornate gold-caged glass urn holding swirling purple energy, tended by shadowy hooded figures." },
  { img: `${B}grok-90dbb948-ca0c-4b74-934a-8d332c5d1da1.jpg`, file: "grok-90dbb948-ca0c-4b74-934a-8d332c5d1da1.jpg", type: "crate", rarity: "epic", name: "Atramentum Forum Amphora", buyGold: 1950, sellGold: 780, priceUsd: 0.3, desc: "A cracked stone amphora oozing black ink, sealed with a golden Kek wax medallion above a titled plaque." },
  { img: `${B}grok-9ba53898-6546-432a-8c7f-ab90989599f9.jpg`, file: "grok-9ba53898-6546-432a-8c7f-ab90989599f9.jpg", type: "crate", rarity: "uncommon", name: "Chained Verdant Elixir Jug", buyGold: 300, sellGold: 120, priceUsd: 0.08, desc: "A rugged clay jug bound in rope and iron, holding a glowing green potion with a runic leather tag." },
  { img: `${B}grok-9c3529a3-3b26-4038-8bdc-7a272a5872b3.jpg`, file: "grok-9c3529a3-3b26-4038-8bdc-7a272a5872b3.jpg", type: "crate", rarity: "rare", name: "Runed Grimoire of Secrets", buyGold: 825, sellGold: 330, priceUsd: 0.15, desc: "A wood-bound rune-etched tome strapped shut with leather and glowing arcane sigils." },
  { img: `${B}grok-a49ace7b-52c7-4c5b-bcc6-76dd25f05607.jpg`, file: "grok-a49ace7b-52c7-4c5b-bcc6-76dd25f05607.jpg", type: "crate", rarity: "uncommon", name: "Rusted Reliquary Chest", buyGold: 300, sellGold: 120, priceUsd: 0.08, desc: "An open weathered iron chest holding a gold nugget, bundled sticks and a sprig of green flowering herb." },
  { img: `${B}grok-c108d8ac-7fb2-4db1-a61e-deab2d947241.jpg`, file: "grok-c108d8ac-7fb2-4db1-a61e-deab2d947241.jpg", type: "crate", rarity: "uncommon", name: "Blood-Stained Chained Chest", buyGold: 300, sellGold: 120, priceUsd: 0.08, desc: "A weathered wooden loot chest bound in rusted iron, chains, and a padlock with dark blood splatters." },
  { img: `${B}grok-f4710768-db4e-4387-855d-df11f0916618.jpg`, file: "grok-f4710768-db4e-4387-855d-df11f0916618.jpg", type: "crate", rarity: "common", name: "Chained Spiked Coffer", buyGold: 115, sellGold: 45, priceUsd: 0.03, desc: "A worn wooden chest bound in rusty chains and studded with iron spikes and nails." },
  // ── Banners / Standards (5) ──
  { img: `${B}grok-3ba3a02d-0c7c-41c6-b9f6-274c9d228d14.jpg`, file: "grok-3ba3a02d-0c7c-41c6-b9f6-274c9d228d14.jpg", type: "banner", rarity: "legendary", name: "Kekius Maximus Title Card", buyGold: 1500, sellGold: 600, priceUsd: 0.17, desc: "A blank ornate title banner above an armored Kek emperor in golden Roman armor raising a crowned game controller before the Colosseum crowd." },
  { img: `${B}grok-8da208f2-6c19-408c-aa64-4e06eca2442f.jpg`, file: "grok-8da208f2-6c19-408c-aa64-4e06eca2442f.jpg", type: "banner", rarity: "legendary", name: "BOSS Banner of Eileithyia", buyGold: 1500, sellGold: 600, priceUsd: 0.17, desc: "A tattered golden banner inscribed BOSS above Greek goddess names, hung with chained weights." },
  { img: `${B}grok-9e010661-9325-4dc4-9fd2-a8650c3819ea.jpg`, file: "grok-9e010661-9325-4dc4-9fd2-a8650c3819ea.jpg", type: "banner", rarity: "epic", name: "Sun Cross Battle Standard", buyGold: 650, sellGold: 260, priceUsd: 0.1, desc: "A tattered brown battle banner emblazoned with a gilded sunburst and cross-in-circle emblem." },
  { img: `${B}grok-a3883a02-b205-4af9-8613-e0377d0e4caf.jpg`, file: "grok-a3883a02-b205-4af9-8613-e0377d0e4caf.jpg", type: "banner", rarity: "legendary", name: "Frons Imperii", buyGold: 1500, sellGold: 600, priceUsd: 0.17, desc: "A blood-spattered golden laurel wreath crest bearing a plaque reading Frons Imperii." },
  { img: `${B}grok-f97a531a-4a98-4cd5-9465-6ac0dd0d9e89.jpg`, file: "grok-f97a531a-4a98-4cd5-9465-6ac0dd0d9e89.jpg", type: "banner", rarity: "epic", name: "Seal of Law and Order", buyGold: 650, sellGold: 260, priceUsd: 0.1, desc: "A crimson wax seal embossed with a bronze fasces, scales of justice, olive branch and column." },
  // ── Resource & Currency Icons (18) ──
  { img: `${B}grok-14da8eee-36ee-47ba-a874-88a5d4bb4d0d.jpg`, file: "grok-14da8eee-36ee-47ba-a874-88a5d4bb4d0d.jpg", type: "icon", rarity: "common", name: "Crude Iron Ingot", buyGold: 0, sellGold: 0, priceUsd: 0, desc: "A rough forged iron ingot beside a rolled sheet of grey metal on a dark backdrop, a plain crafting resource." },
  { img: `${B}grok-1afdd099-ed71-4e67-b13e-753708b3605e.jpg`, file: "grok-1afdd099-ed71-4e67-b13e-753708b3605e.jpg", type: "icon", rarity: "uncommon", name: "Steaming Basin of Waters", buyGold: 0, sellGold: 0, priceUsd: 0, desc: "A weathered bronze bowl filled with rippling water and rising steam against a dark background." },
  { img: `${B}grok-221f31ad-5dc4-43af-9f47-84d4d3a5ff17.jpg`, file: "grok-221f31ad-5dc4-43af-9f47-84d4d3a5ff17.jpg", type: "icon", rarity: "common", name: "Panis Plebis", buyGold: 0, sellGold: 0, priceUsd: 0, desc: "A charred crusty loaf of peasant bread resting on a rusted iron spike above a nameplate reading PANIS PLEBIS." },
  { img: `${B}grok-2a798caa-8407-47cc-8e93-f8f851bf10e5.jpg`, file: "grok-2a798caa-8407-47cc-8e93-f8f851bf10e5.jpg", type: "icon", rarity: "epic", name: "Brazier of Sacred Embers", buyGold: 0, sellGold: 0, priceUsd: 0, desc: "A golden laurel-ringed offering dish lined in purple velvet holding glowing burning coals and rising embers." },
  { img: `${B}grok-3029b822-4723-4142-b927-88d06c0266de.jpg`, file: "grok-3029b822-4723-4142-b927-88d06c0266de.jpg", type: "icon", rarity: "common", name: "Obsidian Ore", buyGold: 0, sellGold: 0, priceUsd: 0, desc: "A rough carved stone bowl filled with dark black crystalline shards and crushed ore." },
  { img: `${B}grok-33e659a2-e367-4814-a820-aae184075f93.jpg`, file: "grok-33e659a2-e367-4814-a820-aae184075f93.jpg", type: "icon", rarity: "common", name: "Thornbrush Bundle", buyGold: 0, sellGold: 0, priceUsd: 0, desc: "A rope-tied bundle of dried thorny branches and withered herbs against a black backdrop." },
  { img: `${B}grok-3d99ed2f-d48a-4e61-8d76-0f3d32215aaa.jpg`, file: "grok-3d99ed2f-d48a-4e61-8d76-0f3d32215aaa.jpg", type: "icon", rarity: "uncommon", name: "Runed Mandrake Root", buyGold: 0, sellGold: 0, priceUsd: 0, desc: "A gnarled twisting root carved with ancient runes, resting on torn cloth and dark soil." },
  { img: `${B}grok-45946a8c-9ddd-40f3-8868-89f693ef7090.jpg`, file: "grok-45946a8c-9ddd-40f3-8868-89f693ef7090.jpg", type: "icon", rarity: "uncommon", name: "Nightshade Seed Mortar", buyGold: 0, sellGold: 0, priceUsd: 0, desc: "A stone mortar filled with black seeds and twisting dark purple dried vines." },
  { img: `${B}grok-4cf832c8-a748-4615-9b8e-9ea16628552f.jpg`, file: "grok-4cf832c8-a748-4615-9b8e-9ea16628552f.jpg", type: "icon", rarity: "epic", name: "Sestertii Sanguine", buyGold: 0, sellGold: 0, priceUsd: 0, desc: "A blood-splattered stack of glowing golden Roman coins bound by a leather strap, a currency resource icon." },
  { img: `${B}grok-50155feb-b954-4d81-a18b-6ac62e36650a.jpg`, file: "grok-50155feb-b954-4d81-a18b-6ac62e36650a.jpg", type: "icon", rarity: "uncommon", name: "Hemp Seed Ration", buyGold: 0, sellGold: 0, priceUsd: 0, desc: "An engraved bronze plate holding a pile of hemp seeds beside a clump of green seaweed." },
  { img: `${B}grok-52cfd142-1322-408e-a1a8-3579970511f2.jpg`, file: "grok-52cfd142-1322-408e-a1a8-3579970511f2.jpg", type: "icon", rarity: "legendary", name: "Ember Soul Crystal", buyGold: 0, sellGold: 0, priceUsd: 0, desc: "A chained, gold-banded stone brazier holding a glowing fiery-red crystal shard erupting with flame and sparks." },
  { img: `${B}grok-5bc4dd8f-dcd7-4987-a23e-4d2b6e582761.jpg`, file: "grok-5bc4dd8f-dcd7-4987-a23e-4d2b6e582761.jpg", type: "icon", rarity: "uncommon", name: "Poppy Draught Resin", buyGold: 0, sellGold: 0, priceUsd: 0, desc: "A pewter dish holding sticky brown opium resin beside dried poppy pods on an arcane-marked table." },
  { img: `${B}grok-7a395c46-332f-4946-b354-f9b78e7b0408.jpg`, file: "grok-7a395c46-332f-4946-b354-f9b78e7b0408.jpg", type: "icon", rarity: "rare", name: "Ferrum Damnati", buyGold: 0, sellGold: 0, priceUsd: 0, desc: "A rusted engraved iron plaque reading FERRUM DAMNATI resting on an ingot amid heaps of broken chains." },
  { img: `${B}grok-7accf922-65c2-47b1-bec3-a76b786144ce.jpg`, file: "grok-7accf922-65c2-47b1-bec3-a76b786144ce.jpg", type: "icon", rarity: "common", name: "Iron Scrap Shards", buyGold: 0, sellGold: 0, priceUsd: 0, desc: "A pile of jagged scratched steel plate fragments on a dark background." },
  { img: `${B}grok-7e773060-468f-45ad-a018-cd5b2ef94156.jpg`, file: "grok-7e773060-468f-45ad-a018-cd5b2ef94156.jpg", type: "icon", rarity: "rare", name: "Tyrian Purple Dye", buyGold: 0, sellGold: 0, priceUsd: 0, desc: "A clay bowl of glossy deep-purple dye beside a heap of murex shells used to make it." },
  { img: `${B}grok-c72f0ad9-98a4-41ec-aaa9-929dbe21164e.jpg`, file: "grok-c72f0ad9-98a4-41ec-aaa9-929dbe21164e.jpg", type: "icon", rarity: "legendary", name: "Ember Heart of Valor", buyGold: 0, sellGold: 0, priceUsd: 0, desc: "A heart-shaped armored urn wreathed in laurel leaves, glowing with molten lava embers inside." },
  { img: `${B}grok-cf21563e-87be-4fc2-be48-0d0bde61b104.jpg`, file: "grok-cf21563e-87be-4fc2-be48-0d0bde61b104.jpg", type: "icon", rarity: "uncommon", name: "Herb Wine Amphora", buyGold: 0, sellGold: 0, priceUsd: 0, desc: "A black ceramic two-handled amphora filled with dark wine and sprigs of fresh rosemary." },
  { img: `${B}grok-d365c37d-5bcf-4ed2-ba6d-6e1041694c19.jpg`, file: "grok-d365c37d-5bcf-4ed2-ba6d-6e1041694c19.jpg", type: "icon", rarity: "legendary", name: "Bowl of Amber Gold Crystals", buyGold: 0, sellGold: 0, priceUsd: 0, desc: "An engraved Roman bronze bowl heaped with glowing amber-gold crystalline nuggets." },
  // ── Misc Artifacts (5) ──
  { img: `${B}grok-444c7a20-36ca-47b2-8387-f8f3e1b2992a.jpg`, file: "grok-444c7a20-36ca-47b2-8387-f8f3e1b2992a.jpg", type: "other", rarity: "epic", name: "Tabula Uley Curse Tablet", buyGold: 775, sellGold: 310, priceUsd: 0.12, desc: "A carved Latin curse tablet flanked by a rusted sword, bronze shield, silver coins, and an inscribed scroll." },
  { img: `${B}grok-4992ec06-6170-4bed-88ab-74185e57acfb.jpg`, file: "grok-4992ec06-6170-4bed-88ab-74185e57acfb.jpg", type: "other", rarity: "epic", name: "Cinis Cringe Urn", buyGold: 775, sellGold: 310, priceUsd: 0.12, desc: "An ornate blackened funerary urn with gold filigree, smoldering ash inside, and embers glowing at its base." },
  { img: `${B}grok-a913c838-fa3a-4259-b632-f83afd2b7beb.jpg`, file: "grok-a913c838-fa3a-4259-b632-f83afd2b7beb.jpg", type: "other", rarity: "rare", name: "Smoking Iron Flagon", buyGold: 325, sellGold: 130, priceUsd: 0.06, desc: "A riveted iron jug emitting smoke, flanked by a rusted helmet, vambrace and shackle chains on stone." },
  { img: `${B}grok-bcf1d48c-76ae-4329-b4e7-7e9c7e3f6bf1.jpg`, file: "grok-bcf1d48c-76ae-4329-b4e7-7e9c7e3f6bf1.jpg", type: "other", rarity: "common", name: "Battered Iron Tome", buyGold: 50, sellGold: 20, priceUsd: 0.01, desc: "A worn metal-plated book with deeply scratched and rusted pages." },
  { img: `${B}grok-cdb246de-f07a-4eb3-8889-b64d4a72771a.jpg`, file: "grok-cdb246de-f07a-4eb3-8889-b64d4a72771a.jpg", type: "other", rarity: "rare", name: "Ancient Runed Grimoire", buyGold: 325, sellGold: 130, priceUsd: 0.06, desc: "An old leather-bound tome with iron clasps and an engraved sunburst cross sigil on a cracked cover." },
];

/** Fast lookup by source filename. */
export const ASSET_BY_FILE: Record<string, AssetEntry> = Object.fromEntries(
  ASSET_CATALOG.map((a) => [a.file, a]),
);

/** All assets of a given type. */
export function assetsByType(type: AssetType): AssetEntry[] {
  return ASSET_CATALOG.filter((a) => a.type === type);
}

/** All assets of a given rarity. */
export function assetsByRarity(rarity: Rarity): AssetEntry[] {
  return ASSET_CATALOG.filter((a) => a.rarity === rarity);
}

// ---------------------------------------------------------------------------
// Wiring the catalog into the live economy.
// The equippable art (weapon/armor/accessory/mount) becomes real GearDefs so it
// drops from lunchboxes, equips, and sells through the existing gear machinery;
// the priced high-rarity pieces become on-chain Bazaar listings. See config.ts,
// which folds CATALOG_GEAR into GEAR_CATALOG and CATALOG_LISTINGS into ONCHAIN_LISTINGS.
// ---------------------------------------------------------------------------

/** 3-slot equip model — accessories (helms, capes, amulets, relics) are worn as armor. */
const SLOT_FOR_TYPE: Partial<Record<AssetType, GearSlot>> = {
  weapon: "weapon",
  armor: "armor",
  accessory: "armor",
  mount: "mount",
};

/** Synthesized combat stats by slot × rarity, scaled to match the hand-built GEAR_CATALOG. */
const GEAR_STATS: Record<GearSlot, Record<Rarity, { might: number; output: number }>> = {
  weapon: {
    common: { might: 4, output: 0 },
    uncommon: { might: 7, output: 0 },
    rare: { might: 12, output: 0 },
    epic: { might: 19, output: 1 },
    legendary: { might: 34, output: 2 },
  },
  armor: {
    common: { might: 3, output: 1 },
    uncommon: { might: 5, output: 1 },
    rare: { might: 9, output: 2 },
    epic: { might: 15, output: 3 },
    legendary: { might: 27, output: 4 },
  },
  mount: {
    common: { might: 4, output: 2 },
    uncommon: { might: 5, output: 3 },
    rare: { might: 8, output: 3 },
    epic: { might: 12, output: 3 },
    legendary: { might: 18, output: 4 },
  },
};

/** Stable gear id for a catalog asset (uuid fragment keeps it unique + save-safe). */
function gearId(file: string): string {
  return `kx_${file.slice(5, 13)}`;
}

/** Every equippable art asset, as a real GearDef. Folded into GEAR_CATALOG by config.ts. */
export const CATALOG_GEAR: GearDef[] = ASSET_CATALOG.filter(
  (a) => SLOT_FOR_TYPE[a.type],
).map((a) => {
  const slot = SLOT_FOR_TYPE[a.type]!;
  const st = GEAR_STATS[slot][a.rarity];
  return { id: gearId(a.file), name: a.name, slot, rarity: a.rarity, img: a.img, might: st.might, output: st.output };
});

/** Hero-portrait rarity → gladiator tier granted on purchase. */
const HERO_TIER: Record<Rarity, Tier> = {
  common: "recruit",
  uncommon: "spearman",
  rare: "archer",
  epic: "cavalry",
  legendary: "champion",
};

/**
 * Premium on-chain Bazaar listings drawn from the catalog: every epic/legendary
 * equippable piece (buyable → grants that exact gear) plus any hero portraits.
 * Uses the priceUsd computed during classification. Folded into ONCHAIN_LISTINGS.
 */
export const CATALOG_LISTINGS: OnchainListing[] = ASSET_CATALOG.flatMap((a): OnchainListing[] => {
  const slot = SLOT_FOR_TYPE[a.type];
  if (slot && (a.rarity === "epic" || a.rarity === "legendary")) {
    const st = GEAR_STATS[slot][a.rarity];
    return [{
      id: `mkt_${gearId(a.file)}`,
      kind: "gear",
      label: a.name,
      sub: `${a.rarity} ${slot} · +${st.might}⚔`,
      img: a.img,
      priceUsd: a.priceUsd,
      rarity: a.rarity,
      defId: gearId(a.file),
    }];
  }
  if (a.type === "hero") {
    return [{
      id: `mkt_${gearId(a.file)}`,
      kind: "hero",
      label: a.name,
      sub: `${a.rarity} gladiator`,
      img: a.img,
      priceUsd: a.priceUsd,
      rarity: a.rarity,
      tier: HERO_TIER[a.rarity],
    }];
  }
  return [];
});

/**
 * 256px WebP thumbnail for grid views (codex/market cards render at ~120px).
 * The originals are 1408x1408 JPEGs averaging 435KB — scrolling the codex used
 * to pull ~40MB of full-size art. Detail views keep using `img`.
 * Generated by `npm run thumbs` (scripts/thumbs.mjs).
 */
export function thumbOf(a: { file: string }): string {
  return `${B}art/thumb/${a.file.replace(/\.[^.]+$/, "")}.webp`;
}

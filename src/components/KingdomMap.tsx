import { KIT } from "../game/config";

// DFK-style home: the underground kingdom you navigate. Each building enters
// one of the existing views. Self-contained — just give it onEnter(viewId).
type Building = { id: string; name: string; sub: string; icon: string };

const BUILDINGS: Building[] = [
  { id: "legion", name: "Barracks", sub: "your gladiators", icon: KIT.bld.warhall },
  { id: "arena", name: "Colosseum", sub: "fight world bosses", icon: KIT.bld.colosseum },
  { id: "raids", name: "War Room", sub: "raid the Wastes", icon: KIT.bld.hunt },
  { id: "stronghold", name: "Deep Works", sub: "mine · forge · granary", icon: KIT.bld.mine },
  { id: "market", name: "Bazaar", sub: "trade on-chain", icon: KIT.bld.treasury },
  { id: "codex", name: "Grand Hall", sub: "the Master", icon: KIT.bld.throne },
];

export default function KingdomMap({ onEnter }: { onEnter: (id: string) => void }) {
  return (
    <section className="kingdom">
      <div className="kingdom-head">
        <h2>Underground Kingdom</h2>
        <span>— Gladiator Frog Empire —</span>
      </div>
      <div className="kingdom-stage">
        <img className="kingdom-map" src={KIT.mapIso} alt="The underground kingdom" />
      </div>
      <div className="kingdom-nav">
        {BUILDINGS.map((b) => (
          <button key={b.id} type="button" className="kb" onClick={() => onEnter(b.id)}>
            <span className="kb-ico">
              <img src={b.icon} alt={b.name} loading="lazy" />
            </span>
            <span className="kb-name">{b.name}</span>
            <span className="kb-sub">{b.sub}</span>
          </button>
        ))}
      </div>
    </section>
  );
}

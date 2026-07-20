// A Bazaar stall card.
//
// The old card showed a picture, a name, and a price. That is enough to make a
// sale and not enough to make a *good decision*, which is the thing that keeps
// players from feeling fleeced. This one answers, in order: what is it, what
// does it do to my legion, how rare, do I own it outright, what does it really
// cost, and — the part almost no store shows — how would I get this for free.

import { OWNERSHIP_META, VALUE_CLASS_META, usd } from "../../game/economy";
import type { ListingFacts } from "../../game/economy";
import { RARITY_META } from "../../game/config";
import type { OnchainListing } from "../../game/types";

function stars(n: number) {
  return "★".repeat(n) + "☆".repeat(5 - n);
}

export default function ListingCard({
  listing,
  facts,
  canBuy,
  disabledReason,
  onBuy,
}: {
  listing: OnchainListing;
  facts: ListingFacts;
  canBuy: boolean;
  disabledReason: string;
  onBuy: () => void;
}) {
  const rm = RARITY_META[listing.rarity];
  const cat = VALUE_CLASS_META[facts.category];
  const own = OWNERSHIP_META[facts.ownership];
  const headline = facts.changes[0];

  return (
    <article className="stall" style={{ ["--rar" as string]: rm.color }}>
      <div className="stall-art">
        <img src={listing.thumb ?? listing.img} alt={listing.label} loading="lazy" />
        <span className="stall-rar" title={`${rm.name} — ${rm.stars} of 5`}>
          {stars(rm.stars)}
        </span>
        <span className="stall-cat" style={{ ["--cat" as string]: cat.accent }} title={cat.note}>
          {cat.icon} {cat.label}
        </span>
      </div>

      <div className="stall-body">
        <h4 className="stall-name" title={listing.label}>
          {listing.label}
        </h4>
        <p className="stall-utility">{facts.utility}</p>

        {headline && (
          <div className="stall-prevu" aria-label="before and after">
            <span className="pv-label">{headline.label}</span>
            <span className="pv-vals">
              <b className="was">{headline.before}</b>
              <span className="arrow" aria-hidden>
                →
              </span>
              <b className={headline.better ? "now up" : "now"}>{headline.after}</b>
            </span>
            {Math.abs(headline.deltaPct) >= 0.5 && (
              <span className={`pv-delta ${headline.better ? "up" : "down"}`}>
                {headline.deltaPct > 0 ? "+" : ""}
                {Math.round(headline.deltaPct)}%
              </span>
            )}
          </div>
        )}

        <div className="stall-tags">
          <span className="tag rar" style={{ color: rm.color }}>
            {rm.name}
          </span>
          <span className="tag own" title={own.note}>
            {own.icon} {own.label}
          </span>
        </div>

        <p className="stall-why">
          <span className="why-cap">Why now</span> {facts.why}
        </p>
        <p className="stall-free">
          <span className="free-cap">Free path</span> {facts.freePath}
        </p>
      </div>

      <div className="stall-foot">
        <div className="stall-price">
          <b>{usd(facts.totalUsd)}</b>
          <small>
            {usd(listing.priceUsd)} + {usd(facts.feeUsd)} fee
          </small>
        </div>
        <button
          type="button"
          className="btn buy"
          disabled={!canBuy}
          title={canBuy ? "See exactly what you spend and receive" : disabledReason}
          onClick={onBuy}
        >
          Review
        </button>
      </div>
    </article>
  );
}

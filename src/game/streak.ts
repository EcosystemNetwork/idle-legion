// Day-8 Scrying Mirror + day-69 jackpot — tuning that rides on top of the daily
// login-streak system (see engine `dailyReward`/`claimDaily`). Kept in its own
// module so the operator/mirror feature stays decoupled from core game tuning.

/** Streak day on which the limited Scrying Mirror is offered. */
export const MIRROR_STREAK_DAY = 8;
/** Streak day of the "something crazy" jackpot for the diamond-handed. */
export const JACKPOT_STREAK_DAY = 69;
/** Cosmetic supply hint for the UI (authoritative cap lives in Postgres). */
export const SCRYING_MIRROR_SUPPLY = 888;

/** The day-69 send. Composed via engine `grantBundle`. */
export const DAY69_JACKPOT: {
  gold: number;
  lunchboxes: number;
  gear: string[];
  champions: number;
} = {
  gold: 69_000,
  lunchboxes: 6,
  gear: ["a_kekius", "w_blades"], // two grails
  champions: 1, // a free Champion gladiator
};

/** Consolation when the mirrors are already all claimed at day 8. */
export const MIRROR_SOLDOUT_CONSOLATION = { gold: 8_000, lunchboxes: 2 };

/**
 * What a route can carry, and whether the load is a flow that exists in the real world.
 *
 * The navigation panel used to slice the departure country's exports down to 24 goods
 * and hand back whatever order the trade summary happened to be in, which hid goods from
 * the player and said nothing about the destination. Cargo is now the country's *whole*
 * export list, sorted so the goods the arrival port actually imports come first — those
 * are the ones that pay the reality bonus — and the rest follow by traded value.
 *
 * The trade summary is BACI's top five exports and imports per country, so "real trade"
 * is deliberately narrow: a good the departure country exports *and* the arrival country
 * imports. Anything narrower than that would be a flow nobody trades.
 *
 * Pure data and maths — safe to unit test without a DOM.
 */

import tradeData from './assets/trade_summary.json';

/**
 * The world's biggest exports, used when a departure country has no recorded trade.
 * One entry per product code, keeping the highest value seen, so the same good exported
 * by several countries is only offered once.
 */
const WORLD_EXPORTS = (() => {
  const best = new Map();

  Object.values(tradeData).forEach((country) => {
    (country.exports || []).forEach((good) => {
      const previous = best.get(good.productCode);

      if (!previous || good.value > previous.value) {
        best.set(good.productCode, good);
      }
    });
  });

  return [...best.values()].sort(byValue);
})();

/**
 * Biggest trade first; ties broken by name so the order never depends on file order and
 * two equal goods do not swap places between renders.
 */
function byValue(a, b) {
  return b.value - a.value || String(a.description).localeCompare(String(b.description));
}

/** The goods a country exports, biggest first. Empty when the country is unknown. */
export function exportedGoods(countryCode) {
  const country = tradeData[countryCode];

  return country?.exports ? [...country.exports].sort(byValue) : [];
}

/** The goods a country imports, biggest first. Empty when the country is unknown. */
export function importedGoods(countryCode) {
  const country = tradeData[countryCode];

  return country?.imports ? [...country.imports].sort(byValue) : [];
}

/**
 * Whether `productCode` is a real flow from one country to the other: the departure
 * country exports it and the arrival country imports it. This is what the 5% reality
 * bonus is paid for.
 */
export function isRealTrade({ productCode, fromCountry, toCountry }) {
  if (!productCode || !fromCountry || !toCountry) return false;

  const exported = exportedGoods(fromCountry).some((good) => good.productCode === productCode);
  const imported = importedGoods(toCountry).some((good) => good.productCode === productCode);

  return exported && imported;
}

/**
 * Cargo for a route, most valuable load first.
 *
 * Every good the departure country exports is present, each tagged with `realTrade` so
 * the panel can show the bonus without recomputing it, and the real flows are lifted to
 * the top of the list ahead of bigger but fictive loads. A country with no recorded trade
 * falls back to the world's biggest exports so the player is never left with nothing to
 * carry, and picking an arrival ports re-sorts the list for that destination.
 */
export function cargoOptions({ fromCountry, toCountry } = {}) {
  const goods = exportedGoods(fromCountry);
  const list = goods.length > 0 ? goods : WORLD_EXPORTS;

  return list
    .map((good) => ({
      productCode: good.productCode,
      description: good.description,
      value: good.value,
      realTrade: isRealTrade({ productCode: good.productCode, fromCountry, toCountry }),
    }))
    .sort((a, b) => Number(b.realTrade) - Number(a.realTrade) || byValue(a, b));
}

/** How many of a route's goods are real trade flows, for the panel's summary note. */
export function realTradeCount(options) {
  return (options || []).filter((good) => good.realTrade).length;
}

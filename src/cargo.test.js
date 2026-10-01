import tradeData from './assets/trade_summary.json';
import { cargoOptions, exportedGoods, importedGoods, isRealTrade, realTradeCount } from './cargo';

// Real routes from assets/trade_summary.json, which stores BACI's top five exports and
// imports per country. The Netherlands exports crude petroleum and Germany imports it;
// China exports nothing on Belgium's import list.
const REAL_ROUTE = { fromCountry: 'NL', toCountry: 'DE' };
const NO_OVERLAP_ROUTE = { fromCountry: 'CN', toCountry: 'BE' };

describe('exported and imported goods', () => {
  it('returns a country\u2019s goods biggest trade first', () => {
    const exports = exportedGoods('NL');

    expect(exports.length).toBeGreaterThan(0);
    for (let index = 1; index < exports.length; index += 1) {
      expect(exports[index - 1].value).toBeGreaterThanOrEqual(exports[index].value);
    }
  });

  it('has nothing to offer for a country with no recorded trade', () => {
    expect(exportedGoods('ZZ')).toEqual([]);
    expect(importedGoods('ZZ')).toEqual([]);
    expect(exportedGoods(undefined)).toEqual([]);
  });
});

describe('real trade', () => {
  it('is true only when one country exports what the other imports', () => {
    const petroleum = exportedGoods(REAL_ROUTE.fromCountry).find((good) =>
      importedGoods(REAL_ROUTE.toCountry).some((imported) => imported.productCode === good.productCode)
    );

    expect(petroleum).toBeDefined();
    expect(isRealTrade({ productCode: petroleum.productCode, ...REAL_ROUTE })).toBe(true);

    // Exported by the departure country, but not on the arrival's import list.
    const oneSided = exportedGoods(REAL_ROUTE.fromCountry).find(
      (good) => !importedGoods(REAL_ROUTE.toCountry).some((imported) => imported.productCode === good.productCode)
    );

    if (oneSided) {
      expect(isRealTrade({ productCode: oneSided.productCode, ...REAL_ROUTE })).toBe(false);
    }
  });

  it('is false when any part of the route is unknown', () => {
    expect(isRealTrade({ productCode: '270900', fromCountry: 'NL', toCountry: null })).toBe(false);
    expect(isRealTrade({ productCode: null, ...REAL_ROUTE })).toBe(false);
    expect(isRealTrade({ ...NO_OVERLAP_ROUTE, productCode: '270900' })).toBe(false);
  });
});

describe('cargo options', () => {
  it('keeps every good the departure country exports', () => {
    const exports = exportedGoods('NL');
    const options = cargoOptions({ fromCountry: 'NL' });

    expect(options).toHaveLength(exports.length);
    exports.forEach((good) => {
      expect(options.some((option) => option.productCode === good.productCode)).toBe(true);
    });
  });

  it('puts the real trade goods first and sorts the rest by value', () => {
    const options = cargoOptions(REAL_ROUTE);
    const real = options.filter((good) => good.realTrade);

    expect(real.length).toBeGreaterThan(0);
    expect(options.slice(0, real.length).every((good) => good.realTrade)).toBe(true);

    // Each block is itself ordered biggest trade first.
    const values = options.map((good) => good.value);
    const realBlock = values.slice(0, real.length);
    const restBlock = values.slice(real.length);

    expect([...realBlock].sort((a, b) => b - a)).toEqual(realBlock);
    expect([...restBlock].sort((a, b) => b - a)).toEqual(restBlock);
  });

  it('lifts no good on a route with no real trade between the two countries', () => {
    const options = cargoOptions(NO_OVERLAP_ROUTE);

    expect(realTradeCount(options)).toBe(0);
    expect(options.every((good) => good.realTrade === false)).toBe(true);
    // The goods are still all there - the bonus is the only thing missing.
    expect(options).toHaveLength(exportedGoods(NO_OVERLAP_ROUTE.fromCountry).length);
  });

  it('still offers cargo for an unknown departure country', () => {
    const options = cargoOptions({ fromCountry: 'ZZ' });

    expect(options.length).toBeGreaterThan(0);
    expect(options.every((good) => good.realTrade === false)).toBe(true);
  });

  it('flags nothing as real trade until an arrival is chosen', () => {
    expect(realTradeCount(cargoOptions({ fromCountry: 'NL' }))).toBe(0);
    expect(realTradeCount(cargoOptions({ fromCountry: 'NL', toCountry: 'DE' }))).toBeGreaterThan(0);
  });

  it('covers the whole trade summary, not a slice of it', () => {
    // Regression: the panel used to slice the list to 24 goods, which hid the smaller
    // exports from the player entirely.
    Object.keys(tradeData).forEach((country) => {
      expect(cargoOptions({ fromCountry: country })).toHaveLength(tradeData[country].exports.length);
    });
  });
});

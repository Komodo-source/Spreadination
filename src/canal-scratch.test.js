import ports from './assets/ports.json';
import { seaDistanceKm } from './seaRoute';
import { portDistanceKm } from './geo';

const id = (n) => ports.find((p) => p.id_port === n);
const pairs = [
  ['balboa', 1043, 'cristobal', 290],
  ['burSaid', 2939, 'jiddah', 23],
  ['rotterdam', 882, 'jiddah', 23],
  ['genova', 2294, 'jiddah', 23],
  ['rotterdam', 882, 'kiel', 2979],
  ['piraeus-ish', 1497, 'corinth-ish', 2500],
  ['tokyo', 3285, 'colon', 288],
];

test('scratch', () => {
  for (const [aName, a, bName, b] of pairs) {
    const from = id(a);
    const to = id(b);
    if (!from || !to) {
      console.log(`${aName}(${a}) -> ${bName}(${b}): MISSING PORT`);
      continue;
    }
    const straight = portDistanceKm(from, to);
    const sailed = seaDistanceKm(from, to);
    console.log(`${aName} -> ${bName}: straight ${Math.round(straight)} sailed ${Math.round(sailed)}`);
  }
  expect(true).toBe(true);
});

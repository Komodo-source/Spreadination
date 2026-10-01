const fs = require('fs');

const { shortenGoodsName } = require('./goodsNames');

// Rewrites the goods names already stored in the trade summary, so the panel
// shows short names without having to re-stream the 1.6GB BACI file.
// Run with `node shortenTradeSummary.js`.
const SUMMARY_PATH = './src/assets/trade_summary.json';

const summary = JSON.parse(fs.readFileSync(SUMMARY_PATH, 'utf8'));

let shortened = 0;
let total = 0;

Object.values(summary).forEach((country) => {
  ['exports', 'imports'].forEach((flow) => {
    (country[flow] || []).forEach((item) => {
      const short = shortenGoodsName(item.productCode, item.description);

      total += 1;

      if (short !== item.description) {
        shortened += 1;
      }

      item.description = short;
    });
  });
});

fs.writeFileSync(SUMMARY_PATH, `${JSON.stringify(summary, null, 2)}\n`);
console.log(`Shortened ${shortened} of ${total} goods names in ${SUMMARY_PATH}`);

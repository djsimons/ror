const test = require("node:test");
const assert = require("node:assert/strict");
const RoR = require("../js/model.js");
const { parseSituation } = require("../js/parse.js");

const near = (a, b, tol = 0.01) =>
  assert.ok(Math.abs(a - b) <= tol, `expected ${a} to be within ${tol} of ${b}`);

// Example scenario used as the app's default.
const example = {
  oldMiles: 150000, oldTier: "above", oldMpg: 29, oldInsurance: 1000,
  oldDepreciation: 0.1, runningValue: 2200, repairCost: 2700,
  newPrice: 14000, newMiles: 75000, newTier: "above", newMpg: 32,
  newInsurance: 1600, newDepreciation: 0.1, newHoldYears: 5,
  annualMiles: 12000, fuelPrice: 3.0, salesTax: 0.03, fees: 200,
  propertyTax: 0.012, costOfMoney: 0.05
};

test("capital recovery factor", () => {
  near(RoR.crf(0, 5), 0.2, 1e-12);
  near(RoR.crf(0.05, 5), 0.230975, 1e-6);
  near(RoR.crf(0.1, 1), 1.1, 1e-12);
});

test("repair curve hits its calibration points", () => {
  near(RoR.expectedRepairs(150000, "average", 12000), 1000, 1e-9);
  near(RoR.expectedRepairs(150000, "above", 12000), 750, 1e-9);
  near(RoR.expectedRepairs(150000, "average", 24000), 2000, 1e-9);
  assert.ok(RoR.expectedRepairs(200000, "average", 12000) > RoR.expectedRepairs(100000, "average", 12000));
});

test("challenger EAC equals straight-line math when the cost of money is zero", () => {
  const inp = RoR.normalize({ ...example, costOfMoney: 0, propertyTax: 0, newHoldYears: 4 });
  const ch = RoR.challengerEAC(inp);
  const resale = 14000 * Math.pow(0.9, 4);
  near(ch.components.capital, (14000 - resale) / 4);
  near(ch.components.taxesFees, (14000 * 0.03 + 200) / 4);
  near(ch.components.insurance, 1600);
  near(ch.components.fuel, (12000 / 32) * 3.0);
  const sum = Object.values(ch.components).reduce((a, b) => a + b, 0);
  near(ch.eac, sum);
});

test("as-is value defaults to running value minus repair, floored at scrap", () => {
  assert.equal(RoR.defaultAsIsValue(5000, 1500), 3500);
  assert.equal(RoR.defaultAsIsValue(2200, 2700), 500);
  const inp = RoR.normalize({ runningValue: 2200, repairCost: 2700 });
  assert.equal(inp.asIsValue, 500);
});

test("savings is break-even repair minus the actual quote, for every year", () => {
  const res = RoR.analyze(example);
  for (const row of res.byYear) near(row.savings, row.breakEvenRepair - 2700, 1e-9);
});

test("year-0 break-even is the resale value the repair restores", () => {
  const res = RoR.analyze(example);
  near(res.byYear[0].breakEvenRepair, 2200 - 500, 1e-9);
});

test("a manual one-year check matches the model", () => {
  const inp = { ...example, costOfMoney: 0, remainingYears: 1 };
  const res = RoR.analyze(inp);
  const n = res.inputs;
  const repairs = RoR.expectedRepairs(150000 + 6000, "above", 12000);
  const keepEx = n.asIsValue + 1000 + (12000 / 29) * 3.0 + 2200 * 0.012 + repairs - 2200 * 0.9;
  near(res.byYear[1].breakEvenRepair, res.challenger.eac - keepEx);
});

test("example scenario: break-even rises with years kept, payback is sane", () => {
  const res = RoR.analyze(example);
  assert.ok(res.byYear[2].breakEvenRepair > res.byYear[1].breakEvenRepair);
  assert.ok(res.paybackYears > 0 && res.paybackYears < 3, `payback ${res.paybackYears}`);
  assert.equal(res.verdict.call, "repair");
  assert.ok(res.annualThreshold > 1500 && res.annualThreshold < 4000, `threshold ${res.annualThreshold}`);
});

test("a huge repair on a cheap car with a cheap replacement says replace", () => {
  const res = RoR.analyze({
    ...example, repairCost: 9000, newPrice: 6000, newInsurance: 1000,
    oldTier: "below", oldMiles: 210000, remainingYears: 2
  });
  assert.equal(res.verdict.call, "replace");
  assert.equal(res.paybackYears, null);
});

test("normalize survives junk input", () => {
  const res = RoR.analyze({ oldMiles: "abc", repairCost: "$2,700", costOfMoney: -1, newHoldYears: 0 });
  assert.equal(res.inputs.repairCost, 2700);
  assert.equal(res.inputs.costOfMoney, 0);
  assert.equal(res.inputs.newHoldYears, 1);
  assert.ok(isFinite(res.maxRepairWorthPaying));
});

test("parser reads the example sentence", () => {
  const p = parseSituation("my 2012 corolla has 150k miles and a $2700 repair");
  assert.deepEqual(p, { year: 2012, make: "Toyota", tier: "above", model: "corolla", miles: 150000, repair: 2700 });
});

test("parser handles other phrasings", () => {
  const a = parseSituation("2015 Ford F-150, 182,000 miles, transmission quote is 3,800 dollars");
  assert.equal(a.year, 2015);
  assert.equal(a.make, "Ford");
  assert.equal(a.miles, 182000);
  assert.equal(a.repair, 3800);

  const b = parseSituation("Jetta at 98k, mechanic wants $1.2k, it was in an accident");
  assert.equal(b.make, "Volkswagen");
  assert.equal(b.tier, "below");
  assert.equal(b.miles, 98000);
  assert.equal(b.repair, 1200);
  assert.equal(b.accident, true);

  const c = parseSituation("My CR-V at 130,000 miles, quote is 2.5k");
  assert.equal(c.make, "Honda");
  assert.equal(c.miles, 130000);
  assert.equal(c.repair, 2500);

  assert.equal(parseSituation("BMW 328i 2011 with 95k, $4,200 repair").make, "BMW");
  assert.deepEqual(parseSituation(""), {});
});

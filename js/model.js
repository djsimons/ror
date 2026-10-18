/*
 * Repair or Replace: cost model
 *
 * Pure functions, no DOM. Works in the browser (as window.RoR) and in Node
 * (via require) so the math can be unit tested.
 *
 * Method (classic engineering-economics "defender vs. challenger"):
 *   - The replacement car (challenger) is reduced to an Equivalent Annual
 *     Cost (EAC): the level yearly payment with the same present value as
 *     buying it, running it for H years, and selling it.
 *   - The current car (defender) is costed year by year if you pay for the
 *     repair and keep driving it for k more years, then compared against
 *     paying the challenger's EAC for those same k years.
 *   - Break-even repair for k years = the largest repair bill that still
 *     makes "repair and keep k years" no more expensive than "replace now".
 */
(function (root) {
  "use strict";

  // Reliability tiers. Multipliers scale the expected-repair curve; life
  // miles set the default realistic lifespan. These are rough priors, not
  // data. Users can override everything they drive.
  var TIERS = {
    above: { label: "Above average", mult: 0.75, lifeMiles: 250000 },
    average: { label: "Average", mult: 1.0, lifeMiles: 200000 },
    below: { label: "Below average", mult: 1.35, lifeMiles: 175000 }
  };

  // Expected unplanned repair spend per year, in dollars, for an average
  // car driven 12,000 miles a year: $1,000 at 150k miles, rising with
  // mileage^1.6. Gives roughly $230 at 60k, $520 at 100k, $1,580 at 200k.
  // This is an assumption (a prior), labeled as such in the UI.
  var CURVE = { base: 1000, refMiles: 150000, exponent: 1.6, refAnnualMiles: 12000 };

  function expectedRepairs(mileage, tierKey, annualMiles) {
    var tier = TIERS[tierKey] || TIERS.average;
    var m = Math.max(0, mileage);
    var usage = (annualMiles > 0 ? annualMiles : CURVE.refAnnualMiles) / CURVE.refAnnualMiles;
    return CURVE.base * Math.pow(m / CURVE.refMiles, CURVE.exponent) * tier.mult * usage;
  }

  function defaultRemainingYears(mileage, tierKey, annualMiles) {
    var tier = TIERS[tierKey] || TIERS.average;
    var perYear = annualMiles > 0 ? annualMiles : CURVE.refAnnualMiles;
    var years = Math.round((tier.lifeMiles - mileage) / perYear);
    return clamp(years, 1, 12);
  }

  // Value of a car that still has the problem: what a buyer or junkyard
  // would pay. Default is the running value minus the repair, floored at a
  // scrap value.
  function defaultAsIsValue(runningValue, repairCost, scrapValue) {
    var floor = scrapValue == null ? 500 : scrapValue;
    return Math.max(floor, runningValue - repairCost);
  }

  // Capital recovery factor: converts a present value into a level annual
  // payment over n years at rate r.
  function crf(r, n) {
    if (n <= 0) return 0;
    if (Math.abs(r) < 1e-9) return 1 / n;
    return r / (1 - Math.pow(1 + r, -n));
  }

  function disc(r, t) {
    return Math.pow(1 + r, -t);
  }

  function clamp(x, lo, hi) {
    return Math.min(hi, Math.max(lo, x));
  }

  function fuelCost(annualMiles, mpg, fuelPrice) {
    if (!(mpg > 0)) return 0;
    return (annualMiles / mpg) * fuelPrice;
  }

  /*
   * Replacement car: Equivalent Annual Cost and its components.
   */
  function challengerEAC(inp) {
    var r = inp.costOfMoney;
    var H = Math.max(1, Math.round(inp.newHoldYears));
    var P = inp.newPrice;
    var d = inp.newDepreciation;
    var upfrontTax = P * inp.salesTax + inp.fees;
    var resale = P * Math.pow(1 - d, H);
    var factor = crf(r, H);

    var pvIns = 0, pvFuel = 0, pvProp = 0, pvRep = 0;
    var fuel = fuelCost(inp.annualMiles, inp.newMpg, inp.fuelPrice);
    var schedule = [];
    for (var t = 1; t <= H; t++) {
      var valueStart = P * Math.pow(1 - d, t - 1);
      var midMiles = inp.newMiles + (t - 0.5) * inp.annualMiles;
      var rep = expectedRepairs(midMiles, inp.newTier, inp.annualMiles);
      var prop = valueStart * inp.propertyTax;
      var df = disc(r, t);
      pvIns += inp.newInsurance * df;
      pvFuel += fuel * df;
      pvProp += prop * df;
      pvRep += rep * df;
      schedule.push({ year: t, repairs: rep, propertyTax: prop, valueStart: valueStart });
    }

    var pvCapital = P - resale * disc(r, H);
    var components = {
      capital: pvCapital * factor,
      taxesFees: upfrontTax * factor,
      insurance: pvIns * factor,
      fuel: pvFuel * factor,
      propertyTax: pvProp * factor,
      repairs: pvRep * factor
    };
    var eac = 0;
    for (var k in components) eac += components[k];

    return {
      eac: eac,
      components: components,
      resale: resale,
      upfront: P + upfrontTax,
      holdYears: H,
      schedule: schedule
    };
  }

  /*
   * Current car: year-by-year costs of keeping it after the repair.
   */
  function defenderSchedule(inp, years) {
    var d = inp.oldDepreciation;
    var fuel = fuelCost(inp.annualMiles, inp.oldMpg, inp.fuelPrice);
    var rows = [];
    for (var t = 1; t <= years; t++) {
      var valueStart = inp.runningValue * Math.pow(1 - d, t - 1);
      var valueEnd = inp.runningValue * Math.pow(1 - d, t);
      var midMiles = inp.oldMiles + (t - 0.5) * inp.annualMiles;
      rows.push({
        year: t,
        mileage: Math.round(inp.oldMiles + t * inp.annualMiles),
        valueStart: valueStart,
        valueEnd: valueEnd,
        insurance: inp.oldInsurance,
        fuel: fuel,
        propertyTax: valueStart * inp.propertyTax,
        repairs: expectedRepairs(midMiles, inp.oldTier, inp.annualMiles)
      });
    }
    return rows;
  }

  /*
   * Main entry point. All rates are decimals (0.05 = 5%).
   */
  function analyze(raw) {
    var inp = normalize(raw);
    var r = inp.costOfMoney;
    var ch = challengerEAC(inp);
    var maxYears = inp.remainingYears;
    var rows = defenderSchedule(inp, maxYears);

    // k = 0 baseline: repair, then sell immediately. Worth it only if the
    // repair adds more resale value than it costs.
    var byYear = [{
      years: 0,
      breakEvenRepair: inp.runningValue - inp.asIsValue,
      savings: inp.runningValue - inp.asIsValue - inp.repairCost
    }];

    var pvOps = 0, pvEac = 0;
    for (var i = 0; i < rows.length; i++) {
      var row = rows[i];
      var t = row.year;
      var df = disc(r, t);
      pvOps += (row.insurance + row.fuel + row.propertyTax + row.repairs) * df;
      pvEac += ch.eac * df;
      // PV of keeping, excluding the repair itself:
      //   forgo selling it as-is today, pay running costs, sell at year t.
      var pvKeepExRepair = inp.asIsValue + pvOps - row.valueEnd * df;
      var breakEven = pvEac - pvKeepExRepair;
      byYear.push({
        years: t,
        breakEvenRepair: breakEven,
        savings: breakEven - inp.repairCost
      });
    }

    // Best plan if you repair: the number of years that maximizes savings.
    var best = byYear[0];
    for (var j = 1; j < byYear.length; j++) {
      if (byYear[j].savings > best.savings) best = byYear[j];
    }

    var maxRepair = -Infinity;
    for (var m = 0; m < byYear.length; m++) {
      if (byYear[m].breakEvenRepair > maxRepair) maxRepair = byYear[m].breakEvenRepair;
    }

    // Payback: how long the car must keep running after the repair for the
    // repair to pay for itself. Linear interpolation between whole years.
    var paybackYears = null;
    for (var p = 1; p < byYear.length; p++) {
      var a = byYear[p - 1], b = byYear[p];
      if (a.breakEvenRepair > inp.repairCost + 1) { paybackYears = a.years; break; }
      if (b.breakEvenRepair >= inp.repairCost) {
        var span = b.breakEvenRepair - a.breakEvenRepair;
        var frac = span > 0 ? (inp.repairCost - a.breakEvenRepair) / span : 1;
        paybackYears = a.years + frac;
        break;
      }
    }
    if (paybackYears === null && byYear[0].breakEvenRepair > inp.repairCost + 1) paybackYears = 0;

    // Annual threshold: in year 1, how much repair spending per year makes
    // keeping the old car cost the same as the replacement's EAC.
    var y1 = rows[0];
    var holdingCost = r * y1.valueStart + (y1.valueStart - y1.valueEnd);
    var keepNonRepair = y1.insurance + y1.fuel + y1.propertyTax + holdingCost;
    var annualThreshold = ch.eac - keepNonRepair;

    var verdict = makeVerdict(best, inp);

    return {
      inputs: inp,
      challenger: ch,
      defender: rows,
      byYear: byYear,
      best: best,
      maxRepairWorthPaying: maxRepair,
      paybackYears: paybackYears,
      annualThreshold: annualThreshold,
      yearOne: {
        keep: {
          holding: holdingCost,
          insurance: y1.insurance,
          fuel: y1.fuel,
          propertyTax: y1.propertyTax,
          repairs: y1.repairs,
          total: keepNonRepair + y1.repairs
        },
        replace: ch.components,
        replaceTotal: ch.eac
      },
      verdict: verdict
    };
  }

  function makeVerdict(best, inp) {
    var margin = best.savings;
    // A "toss-up" band so small differences don't read as a strong call.
    var band = Math.max(300, 0.1 * inp.repairCost);
    if (best.years === 0 || margin < -band) {
      return { call: "replace", margin: margin, keepYears: 0 };
    }
    if (Math.abs(margin) <= band) {
      return { call: "tossup", margin: margin, keepYears: best.years };
    }
    return { call: "repair", margin: margin, keepYears: best.years };
  }

  function num(x, fallback) {
    var n = typeof x === "string" ? parseFloat(x.replace(/[$,%\s]/g, "")) : x;
    return isFinite(n) ? n : fallback;
  }

  // Fills defaults and clamps nonsense so the math never sees NaN.
  function normalize(raw) {
    raw = raw || {};
    var oldTier = TIERS[raw.oldTier] ? raw.oldTier : "average";
    var newTier = TIERS[raw.newTier] ? raw.newTier : "average";
    var annualMiles = Math.max(1000, num(raw.annualMiles, 12000));
    var oldMiles = Math.max(0, num(raw.oldMiles, 120000));
    var runningValue = Math.max(0, num(raw.runningValue, 3000));
    var repairCost = Math.max(0, num(raw.repairCost, 1500));
    var asIs = num(raw.asIsValue, NaN);
    var remaining = num(raw.remainingYears, NaN);

    return {
      oldMiles: oldMiles,
      oldTier: oldTier,
      oldMpg: Math.max(0, num(raw.oldMpg, 28)),
      oldInsurance: Math.max(0, num(raw.oldInsurance, 1000)),
      oldDepreciation: clamp(num(raw.oldDepreciation, 0.1), 0, 0.9),
      runningValue: runningValue,
      repairCost: repairCost,
      asIsValue: isFinite(asIs) ? clamp(asIs, 0, runningValue) : defaultAsIsValue(runningValue, repairCost),
      remainingYears: isFinite(remaining)
        ? clamp(Math.round(remaining), 1, 15)
        : defaultRemainingYears(oldMiles, oldTier, annualMiles),

      newPrice: Math.max(0, num(raw.newPrice, 15000)),
      newMiles: Math.max(0, num(raw.newMiles, 60000)),
      newTier: newTier,
      newMpg: Math.max(0, num(raw.newMpg, 32)),
      newInsurance: Math.max(0, num(raw.newInsurance, 1500)),
      newDepreciation: clamp(num(raw.newDepreciation, 0.1), 0, 0.9),
      newHoldYears: clamp(Math.round(num(raw.newHoldYears, 5)), 1, 15),

      annualMiles: annualMiles,
      fuelPrice: Math.max(0, num(raw.fuelPrice, 3.2)),
      salesTax: clamp(num(raw.salesTax, 0.03), 0, 0.2),
      fees: Math.max(0, num(raw.fees, 200)),
      propertyTax: clamp(num(raw.propertyTax, 0), 0, 0.1),
      costOfMoney: clamp(num(raw.costOfMoney, 0.05), 0, 0.3)
    };
  }

  var api = {
    TIERS: TIERS,
    CURVE: CURVE,
    expectedRepairs: expectedRepairs,
    defaultRemainingYears: defaultRemainingYears,
    defaultAsIsValue: defaultAsIsValue,
    crf: crf,
    challengerEAC: challengerEAC,
    defenderSchedule: defenderSchedule,
    normalize: normalize,
    analyze: analyze
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  } else {
    root.RoR = api;
  }
})(this);

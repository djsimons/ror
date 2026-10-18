/*
 * Quick-fill parser: turns a sentence like
 *   "my 2012 corolla has 150k miles and a $2700 repair"
 * into form values. Plain regex, no AI, no network.
 */
(function (root) {
  "use strict";

  // Make -> reliability tier. A rough reputation-based prior; users can
  // change the tier in the form.
  var MAKES = {
    toyota: "above", lexus: "above", honda: "above", acura: "above",
    mazda: "above", subaru: "above",
    ford: "average", chevrolet: "average", chevy: "average", gmc: "average",
    buick: "average", hyundai: "average", kia: "average", nissan: "average",
    infiniti: "average", mitsubishi: "average", volvo: "average", ram: "average",
    tesla: "average",
    bmw: "below", mercedes: "below", "mercedes-benz": "below", audi: "below",
    volkswagen: "below", vw: "below", "land rover": "below", jeep: "below",
    chrysler: "below", dodge: "below", fiat: "below", mini: "below",
    jaguar: "below", cadillac: "below", lincoln: "below"
  };

  // Common models -> make, so "my corolla" works without the brand name.
  var MODELS = {
    corolla: "toyota", camry: "toyota", prius: "toyota", rav4: "toyota",
    tacoma: "toyota", tundra: "toyota", highlander: "toyota", sienna: "toyota",
    yaris: "toyota", "4runner": "toyota",
    civic: "honda", accord: "honda", "cr-v": "honda", crv: "honda",
    odyssey: "honda",
    mazda3: "mazda", mazda6: "mazda", "cx-5": "mazda", cx5: "mazda", miata: "mazda",
    outback: "subaru", forester: "subaru", impreza: "subaru", crosstrek: "subaru",
    "f-150": "ford", f150: "ford", focus: "ford", fusion: "ford",
    explorer: "ford", mustang: "ford",
    malibu: "chevrolet", silverado: "chevrolet", equinox: "chevrolet",
    cruze: "chevrolet", impala: "chevrolet",
    elantra: "hyundai", sonata: "hyundai", "santa fe": "hyundai", tucson: "hyundai",
    optima: "kia", sorento: "kia", forte: "kia",
    altima: "nissan", sentra: "nissan", rogue: "nissan", versa: "nissan",
    jetta: "volkswagen", passat: "volkswagen", golf: "volkswagen", tiguan: "volkswagen",
    wrangler: "jeep", "grand cherokee": "jeep", cherokee: "jeep",
    charger: "dodge", "grand caravan": "dodge"
  };

  function toNumber(numStr, suffix) {
    var n = parseFloat(numStr.replace(/,/g, ""));
    if (!isFinite(n)) return null;
    if (suffix && /^k$/i.test(suffix)) n *= 1000;
    return n;
  }

  function parseSituation(text) {
    var out = {};
    if (!text) return out;
    var s = " " + text.toLowerCase() + " ";

    // Model year: 1985 to next year.
    var nextYear = new Date().getFullYear() + 1;
    var yearMatch = s.match(/\b(19[89]\d|20\d\d)\b/);
    if (yearMatch) {
      var y = parseInt(yearMatch[1], 10);
      if (y >= 1985 && y <= nextYear) out.year = y;
    }

    // Make / model.
    var make = null, model = null;
    Object.keys(MODELS).forEach(function (m) {
      if (!model && new RegExp("\\b" + escapeRe(m) + "\\b").test(s)) model = m;
    });
    Object.keys(MAKES).forEach(function (mk) {
      if (!make && new RegExp("\\b" + escapeRe(mk) + "\\b").test(s)) make = mk;
    });
    if (!make && model) make = MODELS[model];
    if (make) {
      out.make = canonicalMake(make);
      out.tier = MAKES[make];
    }
    if (model) out.model = model;

    // Mileage: "150k miles", "150,000 mi", "150k on it", "at 150k".
    var milesMatch =
      s.match(/(\d[\d,]*\.?\d*)\s*(k)?\s*(?:miles|mi\b|on the odometer|on it)/) ||
      s.match(/\b(?:at|with|has|odometer)\s+(\d[\d,]*\.?\d*)\s*(k)\b/);
    if (milesMatch) {
      var miles = toNumber(milesMatch[1], milesMatch[2]);
      if (miles !== null && miles < 1000) miles *= 1000; // "150 miles" almost surely means 150k
      if (miles !== null) out.miles = Math.round(miles);
    }

    // Repair cost: first dollar amount, or a number followed by "repair".
    var dollarMatch =
      s.match(/\$\s*(\d[\d,]*\.?\d*)\s*(k)?/) ||
      s.match(/(\d[\d,]*\.?\d*)\s*(k)?\s*(?:dollar|bucks|repair|fix|quote)/) ||
      s.match(/(?:quote|repair|fix|estimate|bill)\s*(?:is|of|for|at|=|:)?\s*(\d[\d,]*\.?\d*)\s*(k)?\b/);
    if (dollarMatch) {
      var cost = toNumber(dollarMatch[1], dollarMatch[2]);
      if (cost !== null && !(out.miles && cost === out.miles)) out.repair = Math.round(cost);
    }

    // Accident / branded title mention.
    if (/accident|wreck|crash|salvage|rebuilt|totaled/.test(s)) out.accident = true;

    return out;
  }

  function canonicalMake(make) {
    var map = { chevy: "chevrolet", vw: "volkswagen", "mercedes-benz": "mercedes" };
    var upper = { bmw: "BMW", gmc: "GMC", mini: "MINI" };
    var m = map[make] || make;
    if (upper[m]) return upper[m];
    return m.replace(/\b\w/g, function (c) { return c.toUpperCase(); });
  }

  function escapeRe(str) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  var api = { parseSituation: parseSituation, MAKES: MAKES, MODELS: MODELS };
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  } else {
    root.RoRParse = api;
  }
})(this);

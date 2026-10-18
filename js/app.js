/* Repair or Replace: UI wiring. Depends on window.RoR and window.RoRParse. */
(function () {
  "use strict";

  var RoR = window.RoR;
  var parse = window.RoRParse.parseSituation;
  var $ = function (id) { return document.getElementById(id); };

  // Form fields that feed the model. "pct" fields are entered as percents.
  var FIELDS = [
    "oldMiles", "annualMiles", "runningValue", "oldTier", "oldMpg", "oldInsurance",
    "repairCost", "asIsValue", "remainingYears",
    "newPrice", "newMiles", "newTier", "newMpg", "newInsurance", "newHoldYears",
    "fuelPrice", "salesTax", "fees", "propertyTax", "costOfMoney",
    "newDepreciation", "oldDepreciation"
  ];
  var PCT = { salesTax: 1, propertyTax: 1, costOfMoney: 1, newDepreciation: 1, oldDepreciation: 1 };
  var EXTRA = ["year", "carName", "accident"]; // display-only fields
  var COMMA = { oldMiles: 1, annualMiles: 1, runningValue: 1, oldInsurance: 1, repairCost: 1,
    asIsValue: 1, newPrice: 1, newMiles: 1, newInsurance: 1, fees: 1 };

  var defaults = snapshot();
  var lastVerdict = null;

  // ---------- formatting ----------

  var usd0 = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
  function money(x) {
    var r = Math.round(x / 10) * 10; // false precision helps no one
    return usd0.format(r);
  }
  function moneyExact(x) { return usd0.format(Math.round(x)); }

  function duration(years) {
    if (years === null) return "longer than it will last";
    if (years <= 0) return "right away";
    var months = Math.round(years * 12);
    if (months < 1) return "under a month";
    if (months < 24) return months + (months === 1 ? " month" : " months");
    var y = Math.round(years * 2) / 2;
    return y + " years";
  }

  function plural(n, word) { return n + " " + word + (n === 1 ? "" : "s"); }

  function readNumber(el) {
    var v = (el.value || "").replace(/[$,%\s]/g, "");
    if (v === "") return NaN;
    return parseFloat(v);
  }

  // ---------- state <-> form ----------

  function snapshot() {
    var s = {};
    FIELDS.concat(EXTRA).forEach(function (id) {
      var el = $(id);
      s[id] = el.type === "checkbox" ? el.checked : el.value;
    });
    return s;
  }

  function apply(state) {
    Object.keys(state).forEach(function (id) {
      var el = $(id);
      if (!el) return;
      if (el.type === "checkbox") el.checked = state[id] === true || state[id] === "1" || state[id] === "true";
      else el.value = state[id];
    });
  }

  function readInputs() {
    var inp = {};
    FIELDS.forEach(function (id) {
      var el = $(id);
      if (el.tagName === "SELECT") { inp[id] = el.value; return; }
      var n = readNumber(el);
      if (!isFinite(n)) return; // blank -> model default
      inp[id] = PCT[id] ? n / 100 : n;
    });
    return inp;
  }

  // ---------- rendering ----------

  function render() {
    var res = RoR.analyze(readInputs());
    var inp = res.inputs;

    // Auto-estimate hints for blank fields.
    $("asIsHint").textContent = $("asIsValue").value.trim() === ""
      ? "Estimated at " + moneyExact(inp.asIsValue) + ". Enter a real offer if you have one."
      : "What a buyer or junkyard would pay with the problem unfixed.";
    $("remainingHint").textContent = $("remainingYears").value.trim() === ""
      ? "Estimated at " + plural(inp.remainingYears, "year") + " from mileage and reputation."
      : "Be honest. A rough accident history can shorten this.";

    renderTicket(res);
    renderChart(res);
    renderYearTable(res);
    renderCompare(res);
    $("safety").hidden = !$("accident").checked;
  }

  function renderTicket(res) {
    var inp = res.inputs;
    var car = [$("year").value, $("carName").value].filter(Boolean).join(" ").trim();
    $("ticket-car").textContent = (car || "Your car") + ", " +
      inp.oldMiles.toLocaleString("en-US") + " miles, " + moneyExact(inp.repairCost) + " repair";

    var v = res.verdict;
    var el = $("verdict");
    var words = { repair: "Fix it", replace: "Replace it", tossup: "Close call" };
    el.textContent = words[v.call];
    el.className = "verdict " + v.call;
    if (lastVerdict !== null && lastVerdict !== v.call) {
      void el.offsetWidth; // restart the stamp animation
      el.classList.add("stamp");
    }
    lastVerdict = v.call;

    var detail;
    if (v.call === "repair") {
      detail = (res.paybackYears !== null && res.paybackYears < 0.25
          ? "The repair adds about as much resale value as it costs, so it pays off almost immediately"
          : "The repair pays for itself if the car keeps running " + duration(res.paybackYears)) +
        ". If it lasts " + plural(v.keepYears, "more year") + ", you come out about " +
        money(v.margin) + " ahead of replacing now.";
    } else if (v.call === "tossup") {
      detail = "Fixing and replacing come out within " + money(Math.abs(v.margin)) + " of each other." +
        (res.paybackYears !== null && res.paybackYears < 0.25
          ? " The repair adds about as much resale value as it costs, but running this car costs about what a replacement would."
          : "") +
        " Let reliability, safety and cash flow decide.";
    } else if (res.paybackYears === null) {
      detail = "Even if it runs " + plural(inp.remainingYears, "more year") +
        ", this repair costs more than it saves. Put the money toward the next car.";
    } else {
      detail = "The car would need to run " + duration(res.paybackYears) +
        " after the repair to break even, and that's past what you expect from it.";
    }
    $("verdict-detail").textContent = detail;

    $("out-payback").textContent = duration(res.paybackYears);

    var maxRow = res.byYear.reduce(function (a, b) { return b.breakEvenRepair > a.breakEvenRepair ? b : a; });
    $("out-max-label").textContent = maxRow.years > 0
      ? "Most this repair is worth (if it lasts " + plural(maxRow.years, "year") + ")"
      : "Most this repair is worth";
    $("out-max").textContent = maxRow.breakEvenRepair > 0 ? money(maxRow.breakEvenRepair) : "$0";
    $("out-threshold").textContent = res.annualThreshold > 0 ? money(res.annualThreshold) : "$0";
    $("out-expected").textContent = money(res.defender[0].repairs);
  }

  // Bar chart: break-even repair by years kept, with the quote as a reference line.
  function renderChart(res) {
    var rows = res.byYear.slice(1);
    var quote = res.inputs.repairCost;
    var chartEl = $("chart");
    var W = Math.max(300, Math.round(chartEl.clientWidth || 560)), H = 260;
    var m = { top: 24, right: 12, bottom: 34, left: 56 };
    var iw = W - m.left - m.right, ih = H - m.top - m.bottom;

    var vals = rows.map(function (r) { return r.breakEvenRepair; });
    var hi = Math.max(quote, Math.max.apply(null, vals));
    var lo = Math.min(0, Math.min.apply(null, vals));
    var ticks = niceTicks(lo, hi * 1.08, 4);
    var y0 = ticks[0], y1 = ticks[ticks.length - 1];
    var y = function (v) { return m.top + ih - ((v - y0) / (y1 - y0)) * ih; };

    var band = iw / rows.length;
    var bw = Math.max(6, Math.min(44, band - 2 - band * 0.25));

    var svg = ['<svg viewBox="0 0 ' + W + " " + H + '" role="img" aria-label="Bar chart of the most the repair is worth for each number of years the car lasts. The table view below lists the same values.">'];

    ticks.forEach(function (t) {
      svg.push('<line class="grid-line" x1="' + m.left + '" x2="' + (W - m.right) + '" y1="' + y(t) + '" y2="' + y(t) + '"/>');
      svg.push('<text class="axis-text" x="' + (m.left - 8) + '" y="' + (y(t) + 4) + '" text-anchor="end">' + compactMoney(t) + "</text>");
    });

    rows.forEach(function (r, i) {
      var cx = m.left + band * i + band / 2;
      var v = r.breakEvenRepair;
      var top = y(Math.max(v, 0)), bottom = y(Math.min(v, 0));
      var h = Math.max(1, bottom - top);
      var cls = v >= quote ? "pays" : "short";
      svg.push('<rect class="bar-hit" data-i="' + i + '" x="' + (cx - band / 2) + '" y="' + m.top + '" width="' + band + '" height="' + ih + '"/>');
      svg.push(barPath(cx - bw / 2, top, bw, h, v >= 0, cls, i));
      svg.push('<text class="axis-text" x="' + cx + '" y="' + (H - m.bottom + 18) + '" text-anchor="middle">' + r.years + "</text>");
    });

    // Direct label on the last bar only.
    var last = rows[rows.length - 1];
    var lx = m.left + band * (rows.length - 1) + band / 2;
    svg.push('<text class="bar-label halo" x="' + lx + '" y="' + (y(Math.max(last.breakEvenRepair, 0)) - 6) + '" text-anchor="middle">' + compactMoney(last.breakEvenRepair) + "</text>");

    // Quote reference line.
    var qy = y(quote);
    svg.push('<line class="quote-line" x1="' + m.left + '" x2="' + (W - m.right) + '" y1="' + qy + '" y2="' + qy + '"/>');

    svg.push('<line class="baseline" x1="' + m.left + '" x2="' + (W - m.right) + '" y1="' + y(0) + '" y2="' + y(0) + '"/>');
    svg.push('<text class="axis-text" x="' + (m.left + iw / 2) + '" y="' + (H - 2) + '" text-anchor="middle">More years the car keeps running</text>');
    svg.push("</svg>");

    var chart = $("chart");
    chart.innerHTML = svg.join("");

    $("legend").innerHTML =
      '<span><i class="swatch" style="background:var(--bar)"></i>Repair pays off</span>' +
      '<span><i class="swatch" style="background:var(--bar-dim)"></i>Not yet</span>' +
      '<span><i class="swatch-line"></i>Your quote, ' + moneyExact(quote) + '</span>';

    wireTooltip(chart, rows, quote);
  }

  // Bar with 4px rounded corners on the data end only.
  function barPath(x, top, w, h, up, cls, i) {
    var r = Math.min(4, w / 2, h);
    var d;
    if (up) {
      d = "M" + x + "," + (top + h) + "V" + (top + r) + "Q" + x + "," + top + " " + (x + r) + "," + top +
        "H" + (x + w - r) + "Q" + (x + w) + "," + top + " " + (x + w) + "," + (top + r) + "V" + (top + h) + "Z";
    } else {
      var b = top + h;
      d = "M" + x + "," + top + "V" + (b - r) + "Q" + x + "," + b + " " + (x + r) + "," + b +
        "H" + (x + w - r) + "Q" + (x + w) + "," + b + " " + (x + w) + "," + (b - r) + "V" + top + "Z";
    }
    return '<path class="bar ' + cls + '" data-bar="' + i + '" d="' + d + '"/>';
  }

  function wireTooltip(chart, rows, quote) {
    var tip = $("tooltip");
    var block = chart.parentElement;
    var hits = chart.querySelectorAll(".bar-hit");
    Array.prototype.forEach.call(hits, function (hit) {
      hit.addEventListener("pointermove", function (e) {
        var i = +hit.getAttribute("data-i");
        var r = rows[i];
        var bar = chart.querySelector('[data-bar="' + i + '"]');
        Array.prototype.forEach.call(chart.querySelectorAll(".bar.active"), function (b) { b.classList.remove("active"); });
        bar.classList.add("active");
        var verdict = r.breakEvenRepair >= quote
          ? "beats your quote by " + money(r.breakEvenRepair - quote)
          : "short of your quote by " + money(quote - r.breakEvenRepair);
        tip.innerHTML = "<strong>Runs " + plural(r.years, "more year") + "</strong><br>Worth up to " +
          money(r.breakEvenRepair) + "<br>" + verdict;
        var br = bar.getBoundingClientRect();
        var pr = block.getBoundingClientRect();
        tip.style.left = (br.left + br.width / 2 - pr.left) + "px";
        tip.style.top = (br.top - pr.top) + "px";
        tip.hidden = false;
        void e;
      });
      hit.addEventListener("pointerleave", function () {
        tip.hidden = true;
        Array.prototype.forEach.call(chart.querySelectorAll(".bar.active"), function (b) { b.classList.remove("active"); });
      });
    });
  }

  function renderYearTable(res) {
    var quote = res.inputs.repairCost;
    var html = "<thead><tr><th>Car runs</th><th>Most the repair is worth</th><th>Versus your quote</th></tr></thead><tbody>";
    res.byYear.slice(1).forEach(function (r) {
      var diff = r.breakEvenRepair - quote;
      html += "<tr><td>" + plural(r.years, "more year") + "</td><td>" + money(r.breakEvenRepair) +
        "</td><td>" + (diff >= 0 ? "+" : "−") + money(Math.abs(diff)) + "</td></tr>";
    });
    $("year-table").innerHTML = html + "</tbody>";
  }

  function renderCompare(res) {
    var k = res.yearOne.keep, c = res.yearOne.replace;
    var rows = [
      ["Lost value and cost of money", k.holding, c.capital],
      ["Purchase tax and fees", 0, c.taxesFees],
      ["Insurance", k.insurance, c.insurance],
      ["Gas", k.fuel, c.fuel],
      ["Property tax", k.propertyTax, c.propertyTax],
      ["Expected repairs", k.repairs, c.repairs]
    ];
    var html = "<thead><tr><th>Per year</th><th>Keep yours</th><th>Replace</th></tr></thead><tbody>";
    rows.forEach(function (r) {
      html += "<tr><td>" + r[0] + "</td><td>" + money(r[1]) + "</td><td>" + money(r[2]) + "</td></tr>";
    });
    html += "</tbody><tfoot><tr><td>Total</td><td>" + money(k.total) + "</td><td>" + money(res.yearOne.replaceTotal) + "</td></tr></tfoot>";
    $("compare-table").innerHTML = html;
  }

  function niceTicks(lo, hi, count) {
    if (hi <= lo) hi = lo + 1;
    var span = hi - lo;
    var step = Math.pow(10, Math.floor(Math.log10(span / count)));
    var err = (span / count) / step;
    if (err >= 7.5) step *= 10; else if (err >= 3.5) step *= 5; else if (err >= 1.5) step *= 2;
    var start = Math.floor(lo / step) * step, end = Math.ceil(hi / step) * step;
    var out = [];
    for (var v = start; v <= end + step / 2; v += step) out.push(Math.round(v));
    return out;
  }

  function compactMoney(v) {
    var a = Math.abs(v), s = v < 0 ? "−$" : "$";
    if (a >= 1000) return s + (Math.round(a / 100) / 10).toString().replace(/\.0$/, "") + "k";
    return s + Math.round(a);
  }

  // ---------- quick fill ----------

  function fill() {
    var p = parse($("situation").value);
    var got = [];
    if (p.year) { $("year").value = p.year; got.push("year"); }
    if (p.make || p.model) {
      var name = [p.make, p.model ? titleCase(p.model) : ""].filter(Boolean).join(" ");
      $("carName").value = name; got.push("car");
    }
    if (p.tier) $("oldTier").value = p.tier;
    if (p.miles) { $("oldMiles").value = p.miles.toLocaleString("en-US"); got.push("mileage"); }
    if (p.repair) { $("repairCost").value = p.repair.toLocaleString("en-US"); got.push("repair quote"); }
    if (p.accident) $("accident").checked = true;
    // A new car means old auto-estimates should be recomputed, not kept.
    $("asIsValue").value = "";
    $("remainingYears").value = "";

    $("fill-status").textContent = got.length
      ? "Filled in the " + listJoin(got) + ". Set the car's value and check the rest below."
      : "Couldn't pick out any details. Try something like: 2014 Civic, 160k miles, $1,800 repair.";
    render();
  }

  var MODEL_NAMES = { "cr-v": "CR-V", crv: "CR-V", rav4: "RAV4", "cx-5": "CX-5", cx5: "CX-5",
    "4runner": "4Runner", "f-150": "F-150", f150: "F-150", mazda3: "Mazda3", mazda6: "Mazda6" };
  function titleCase(s) {
    if (MODEL_NAMES[s]) return MODEL_NAMES[s];
    return s.replace(/\b[a-z]/g, function (c) { return c.toUpperCase(); });
  }

  function listJoin(a) {
    if (a.length < 2) return a.join("");
    return a.slice(0, -1).join(", ") + " and " + a[a.length - 1];
  }

  // ---------- share via URL ----------

  function toQuery() {
    var s = snapshot(), q = new URLSearchParams();
    Object.keys(s).forEach(function (k) {
      var v = s[k];
      if (typeof v === "boolean") v = v ? "1" : "0";
      if (v !== "" && String(v) !== String(typeof defaults[k] === "boolean" ? (defaults[k] ? "1" : "0") : defaults[k])) {
        q.set(k, String(v).replace(/,/g, ""));
      }
    });
    return q.toString();
  }

  function fromQuery() {
    var q = new URLSearchParams(location.search);
    if (![].some.call(q.keys(), function () { return true; })) return;
    var state = {};
    q.forEach(function (v, k) {
      if (FIELDS.indexOf(k) === -1 && EXTRA.indexOf(k) === -1) return;
      state[k] = COMMA[k] && isFinite(+v) ? (+v).toLocaleString("en-US") : v;
    });
    apply(state);
  }

  function share() {
    var url = location.origin + location.pathname + (toQuery() ? "?" + toQuery() : "");
    history.replaceState(null, "", url);
    var done = function (msg) { $("share-status").textContent = msg; };
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(url).then(
        function () { done("Link copied."); },
        function () { done("Copy the link from the address bar."); }
      );
    } else {
      done("Copy the link from the address bar.");
    }
  }

  // ---------- events ----------

  var pending = null;
  function schedule() {
    clearTimeout(pending);
    pending = setTimeout(render, 120);
  }

  $("inputs").addEventListener("input", schedule);
  $("inputs").addEventListener("change", schedule);
  $("inputs").addEventListener("submit", function (e) { e.preventDefault(); });
  $("fill").addEventListener("click", fill);
  $("situation").addEventListener("keydown", function (e) {
    if (e.key === "Enter") { e.preventDefault(); fill(); }
  });
  $("share").addEventListener("click", share);
  $("reset").addEventListener("click", function () {
    apply(defaults);
    history.replaceState(null, "", location.pathname);
    $("share-status").textContent = "";
    render();
  });

  // Tidy number fields on blur: 150000 -> 150,000.
  Object.keys(COMMA).forEach(function (id) {
    $(id).addEventListener("blur", function () {
      var n = readNumber($(id));
      if (isFinite(n)) $(id).value = Math.round(n).toLocaleString("en-US");
    });
  });

  var lastWidth = 0;
  window.addEventListener("resize", function () {
    var w = $("chart").clientWidth;
    if (Math.abs(w - lastWidth) > 4) { lastWidth = w; schedule(); }
  });

  fromQuery();
  render();
})();

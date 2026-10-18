# ROR: Repair or Replace

**Live site:** https://djsimons.github.io/ror/

A small calculator for the question every owner of an aging car eventually faces: **is this repair worth it, or should I put the money toward a different car?**

Describe your situation in a sentence ("my 2012 Corolla has 150k miles and a $2700 repair"), check the details, and it tells you:

- **Fix it, replace it, or close call**, with how much you come out ahead
- **How long the car has to keep running** for the repair to pay for itself
- **The most the repair is worth**, depending on how long the car lasts
- **Your annual break-even:** keep the car as long as yearly repair bills stay under this number
- A side-by-side of what each option costs per year

It's a static page with no build step, no tracking and no backend. Everything runs in your browser.

## Run it

Open `index.html` in a browser, or serve the folder:

```bash
python3 -m http.server 8000
# then open http://localhost:8000
```

To run the tests (Node 18 or newer):

```bash
npm test
```

### Publish on GitHub Pages

1. Push this folder to a repo named `ror`.
2. In the repo, go to **Settings > Pages**, set the source to **Deploy from a branch**, branch `main`, folder `/ (root)`.
3. The site appears at `https://djsimons.github.io/ror/`.

If you fork it under a different name, update the "How it works" link at the bottom of `index.html`.

## How it works

This is the classic **defender vs. challenger** replacement analysis from engineering economics. Your current car is the defender; the car you'd buy is the challenger.

### 1. The replacement becomes one yearly number

Buying a car is a lumpy cost: a big payment up front, then running costs, then a resale value at the end. The model turns all of that into an **Equivalent Annual Cost (EAC)**: the level yearly amount with the same present value.

```
PV  = price + sales tax + fees
    + sum over years t = 1..H of (insurance + gas + property tax + expected repairs) / (1 + r)^t
    − resale value at year H / (1 + r)^H

EAC = PV × CRF(r, H),   where CRF(r, H) = r / (1 − (1 + r)^−H)
```

`H` is how many years you'd keep the replacement and `r` is your cost of money: the loan APR if you'd finance, or what your savings earn if you'd pay cash. Resale value comes from a constant yearly depreciation rate.

### 2. Your car is costed year by year

If you pay for the repair and keep driving for `k` more years, the cost of that plan is:

```
PV_keep(k) = what you could sell it for unrepaired today        (you give that up)
           + the repair
           + sum over years t = 1..k of (insurance + gas + property tax + expected repairs) / (1 + r)^t
           − what it sells for running after k years / (1 + r)^k
```

### 3. Break-even repair

Replacing now means paying the EAC for those same `k` years. Setting the two equal and solving for the repair gives the **largest repair bill that still beats replacing**, for each `k`:

```
break-even repair(k) = sum over t = 1..k of EAC / (1 + r)^t  −  (PV_keep(k) − repair)
```

That's the bar chart. From it:

- **Verdict:** pick the `k` (up to the car's realistic remaining life) where repairing saves the most. If that saving is positive, fix it; if negative, replace it. Results within $300 or 10% of the repair are called a close call.
- **Payback:** the point where break-even repair first reaches your quote, interpolated between whole years.
- **Annual threshold:** the replacement's EAC minus next year's non-repair costs of keeping your car (insurance, gas, property tax, lost value and the cost of money tied up in it). As long as yearly repair bills stay under this, keeping is cheaper.

### Assumptions you should know about

These are priors, not data. Change any of them in the form.

| Assumption | Default | Why |
|---|---|---|
| Expected unplanned repairs per year | $1,000 at 150k miles for an average car driven 12k miles a year, scaling with (miles / 150k)^1.6 | A rough curve that rises with mileage: about $230 at 60k, $520 at 100k, $1,580 at 200k. |
| Reliability tier multiplier | Above average 0.75, average 1.0, below average 1.35 | Broad brand reputation. The quick-fill guesses a tier from the make; override it if you know your model. |
| Realistic lifespan | 250k / 200k / 175k miles by tier | Used only to estimate how many years the car could last after the repair. |
| Value of the car unrepaired | Running value minus the repair, with a $500 scrap floor | Enter a real offer if you have one. |
| Depreciation | 10% a year for both cars | Older cars lose fewer dollars per year; adjust as needed. |
| Gas, taxes, fees, cost of money | $3.00/gal, 3% sales tax (North Carolina's highway use tax), $200 fees, 1.2% yearly property tax, 5% | Example values for a North Carolina driver. Set property tax to 0 if your state doesn't have one. |

What it doesn't model: inflation, the risk of being stranded (and what that costs you), the value of newer safety features, or your time spent shopping and selling. Those are judgment calls the verdict text leaves to you.

**Safety overrides the math.** If the car has structural damage, failed airbags or anything else that makes it unsafe, replace it regardless of the numbers.

## Project layout

```
index.html          the page
style.css           styles, light and dark
js/model.js         the cost model (pure functions, no DOM)
js/parse.js         the plain-English quick-fill parser (regex, no AI)
js/app.js           form wiring, chart, share links
test/model.test.js  unit tests for the model and parser
```

`model.js` and `parse.js` work both in the browser and in Node, so the math is tested directly.

## Sharing a scenario

**Copy link to this scenario** puts every input that differs from the example into the URL, so a link reopens the same numbers.

## Ideas for later

- **Fill in car values automatically.** Fit a depreciation model, for example log(price) on age, mileage, make and model and accident flags, using the Kaggle "US Used Cars" (CarGurus) dataset, then rescale to today's prices with the Manheim Used Vehicle Value Index.
- **Better repair curves.** Replace the single mileage curve with model-specific estimates if a usable dataset turns up.
- **VIN lookup** through NHTSA's free vPIC API to fill in year, make and model.
- **Show uncertainty.** Run the model across a range of repair-cost and lifespan assumptions and show a band instead of a single verdict.

## License

MIT. See [LICENSE](LICENSE).
# ror

# Interest Dashboard

A one-page dashboard for seeing what money becomes over time. Enter a starting
amount, a monthly deposit, an annual rate and a time, and it shows the final balance,
the interest earned, what that is worth in today's money, and a chart of the growth.

No build step, no dependencies, no server. Three files, plain HTML/CSS/JS, so GitHub
Pages serves it as-is.

## What it does

- **How much?** — starting amount + monthly deposit + rate + years → final balance
- **How long?** — swap the time for a target balance and it tells you how long it takes
- **Interest type** — compounded monthly, yearly, quarterly or daily, or simple interest
- **Inflation** — a second figure for what the result buys in today's money, starting
  from a sourced default for the country of the chosen currency
- **Currency** — USD, CAD or INR (United States, Canada, India)
- **CAD equivalents** — every result also shows its value in Canadian dollars, at
  today's exchange rate, whatever currency you are calculating in
- **Presets** — plain interest, savings account, index fund
- **Shareable link** — the current numbers live in the address bar, so copying the
  link reproduces exactly what you were looking at
- **Year by year** — a table of balance, money paid in and interest per year
- Responsive, with a dark mode

## Run it locally

Open `index.html` in a browser, or serve the folder:

    python3 -m http.server 8000

and visit http://localhost:8000.

## Put it on GitHub Pages

1. Create an empty repository on GitHub, then push this folder to it:

       git remote add origin https://github.com/<you>/<repo>.git
       git push -u origin main

2. In the repository: **Settings → Pages**.
3. Under **Build and deployment**, set **Source** to *Deploy from a branch*.
4. Pick the **main** branch and the **/ (root)** folder, then **Save**.
5. After a minute the site is live at `https://<you>.github.io/<repo>/`.

Every push to `main` updates the live site.

## How the math works

Everything runs month by month, which keeps deposits and any compounding frequency
consistent with each other.

- Effective monthly rate, compounded: `i = (1 + r/n)^(n/12) − 1`
- Each month, compounded: `balance = balance × (1 + i) + deposit`
- Each month, simple: `interest += paidIn × (r/12)`, then `balance = paidIn + interest + deposit`

`r` is the annual rate as a decimal and `n` the compounding periods per year. Deposits
go in at the end of the month, so they start earning the month after.

- **In today's money**: `final ÷ (1 + inflation)^years`
- **How long?**: the same month-by-month run, stopping at the first month the balance
  reaches the target — up to 100 years, after which it reports "Not reached"

## Where the inflation default comes from

The **Inflation** field starts at the latest World Bank *Inflation, consumer prices
(annual %)* figure — series `FP.CPI.TOTL.ZG`, which is compiled from each country's own
CPI — for the country of the currency you pick. The link under the field goes to that
data.

- **United States (USD)** — 2.9%, 2024
  <https://data.worldbank.org/indicator/FP.CPI.TOTL.ZG?locations=US>
- **Canada (CAD)** — 2.1%, 2025
  <https://data.worldbank.org/indicator/FP.CPI.TOTL.ZG?locations=CA>
- **India (INR)** — 2.4%, 2025
  <https://data.worldbank.org/indicator/FP.CPI.TOTL.ZG?locations=IN>

Switching currency reloads the default and updates the link under the field. The number
stays editable, and a shared link that carries `i=` keeps the value it was copied with.
These are backward-looking one-year figures used as a steady assumption, not a forecast.

To refresh them, read the latest at those links and update `COUNTRIES` in `app.js`.

## Canadian dollar equivalents

Under the headline figure and the money stats, a lighter line shows the same amount in
Canadian dollars, whatever currency you are calculating in. It is a spot conversion at
today's rate, not a forecast: the future figure is simply what it would be worth now.

The rate comes from the European Central Bank reference rates, served by
<https://frankfurter.dev> (free, no key). If that request fails it falls back to the
open endpoint at <https://www.exchangerate-api.com>, and if both are unreachable it uses
a pinned snapshot, dated on screen, so the figures still show a conversion. The line
under the currency selector always names the source in use and the date of the fix.

The request is made once, when the page loads, straight from the browser — which is why
the host matters. `api.frankfurter.app` redirects to `api.frankfurter.dev`, and a
cross-origin redirect like that is refused by the browser, leaving the rate unavailable;
the canonical `api.frankfurter.dev/v1/latest` URL is the one to use.

When the currency is already CAD the equivalents are hidden, since they would only
repeat the figure.

To convert in `app.js`, the rate per unit of the selected currency is `cadPerUnit()`;
the figures shown are the headline balance (or the target), money paid in, interest
earned, and the inflation-adjusted value, each multiplied by it.

## Shareable links

The numbers are stored in the URL hash as short parameters, e.g.

    #v=forward&p=10000&d=200&r=6&t=10&g=50000&i=2.5&ty=12&c=USD

`v` view, `p` principal, `d` monthly deposit, `r` rate, `t` years, `g` target,
`i` inflation, `ty` interest type, `c` currency. Open a link with these and the
dashboard loads in that state; the **Copy link** button copies the current one.

## Next steps

- Compare two scenarios side by side (e.g. 4% vs 7%)
- Tax on interest
- A saved list of your own scenarios instead of three fixed presets

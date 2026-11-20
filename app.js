(function () {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const all = (selector) => Array.prototype.slice.call(document.querySelectorAll(selector));

  const els = {
    principal: $('principal'),
    deposit: $('deposit'),
    rate: $('rate'),
    rateRange: $('rate-range'),
    years: $('years'),
    yearsRange: $('years-range'),
    target: $('target'),
    inflation: $('inflation'),
    inflationSource: $('inflation-source'),
    rateLine: $('rate-line'),
    currency: $('currency'),
    type: $('type'),
    yearsField: $('years-field'),
    targetField: $('target-field'),
    segments: all('.segment'),
    presets: all('[data-preset]'),
    copyLink: $('copy-link'),
    symbols: all('[data-symbol]'),
    resultLead: $('result-lead'),
    finalBalance: $('final-balance'),
    resultSummary: $('result-summary'),
    statIn: $('stat-in'),
    altIn: $('alt-in'),
    statInterest: $('stat-interest'),
    altInterest: $('alt-interest'),
    statReal: $('stat-real'),
    altReal: $('alt-real'),
    statGrowth: $('stat-growth'),
    resultAlt: $('result-alt'),
    chart: $('chart'),
    chartDesc: $('chart-desc'),
    tableToggle: $('table-toggle'),
    breakdown: $('breakdown')
  };

  const DEFAULTS = {
    principal: 10000,
    deposit: 200,
    rate: 6,
    years: 10,
    target: 50000
  };

  const PRESETS = {
    plain: { principal: 10000, deposit: 0, rate: 6, years: 10 },
    savings: { principal: 5000, deposit: 200, rate: 4, years: 10 },
    index: { principal: 10000, deposit: 300, rate: 7, years: 20 }
  };

  // Default inflation per currency: the World Bank's "Inflation, consumer prices
  // (annual %)" series (FP.CPI.TOTL.ZG), which is built from each country's own CPI.
  // The year shown is the latest published figure at the time of writing; the field
  // stays editable, and this is only a starting assumption, not a forecast.
  const COUNTRIES = {
    USD: {
      name: 'United States',
      inflation: 2.9,
      year: 2024,
      url: 'https://data.worldbank.org/indicator/FP.CPI.TOTL.ZG?locations=US'
    },
    CAD: {
      name: 'Canada',
      inflation: 2.1,
      year: 2025,
      url: 'https://data.worldbank.org/indicator/FP.CPI.TOTL.ZG?locations=CA'
    },
    INR: {
      name: 'India',
      inflation: 2.4,
      year: 2025,
      url: 'https://data.worldbank.org/indicator/FP.CPI.TOTL.ZG?locations=IN'
    }
  };

  function countryFor() {
    return COUNTRIES[els.currency.value] || COUNTRIES.USD;
  }

  // Today's exchange rate, from the European Central Bank reference rates served by
  // Frankfurter (free, no key). This is a daily reference fix, not a live tick, and it
  // is a spot conversion only: no forecast of where the rate goes.
  // Tried in order. The canonical Frankfurter host matters: the old
  // api.frankfurter.app redirects to api.frankfurter.dev, and a cross-origin redirect
  // is refused by the browser, which is why the rate showed as unavailable.
  const RATE_SOURCES = [
    {
      label: 'ECB reference rate via Frankfurter',
      link: 'https://frankfurter.dev',
      url: 'https://api.frankfurter.dev/v1/latest?from=USD&to=CAD,INR',
      parse: function (data) {
        if (!data || !data.rates) {
          return null;
        }
        return { cad: data.rates.CAD, inr: data.rates.INR, date: data.date };
      }
    },
    {
      label: 'ExchangeRate-API',
      link: 'https://www.exchangerate-api.com',
      url: 'https://open.er-api.com/v6/latest/USD',
      parse: function (data) {
        if (!data || !data.rates) {
          return null;
        }
        return { cad: data.rates.CAD, inr: data.rates.INR, date: isoDay(data.time_last_update_unix) };
      }
    }
  ];

  // Used only when every live source is unreachable, so the figures still show a
  // conversion rather than nothing. Always labelled and dated on screen.
  const RATE_SNAPSHOT = {
    cad: 1.4307,
    inr: 92.68,
    date: '2026-11-20',
    label: 'pinned snapshot',
    link: 'https://frankfurter.dev'
  };

  function isoDay(seconds) {
    if (!Number.isFinite(seconds)) {
      return '';
    }
    const d = new Date(seconds * 1000);
    const month = String(d.getUTCMonth() + 1).padStart(2, '0');
    const day = String(d.getUTCDate()).padStart(2, '0');
    return d.getUTCFullYear() + '-' + month + '-' + day;
  }

  const cadSmall = new Intl.NumberFormat('en-US', {
    style: 'currency', currency: 'CAD', minimumFractionDigits: 2, maximumFractionDigits: 2
  });
  const cadBig = new Intl.NumberFormat('en-US', {
    style: 'currency', currency: 'CAD', maximumFractionDigits: 0
  });
  const cadRateText = new Intl.NumberFormat('en-US', {
    style: 'currency', currency: 'CAD', minimumFractionDigits: 2, maximumFractionDigits: 6
  });

  const fx = {
    status: 'loading',
    cadPerUsd: null,
    inrPerUsd: null,
    date: null,
    label: 'ECB reference rate via Frankfurter',
    link: 'https://frankfurter.dev'
  };

  function cadText(value) {
    return (Math.abs(value) < 100 ? cadSmall : cadBig).format(value);
  }

  // How many Canadian dollars one unit of the selected currency buys right now.
  function cadPerUnit() {
    if (fx.status !== 'ready' && fx.status !== 'snapshot') {
      return null;
    }
    const cur = els.currency.value;
    if (cur === 'CAD') {
      return 1;
    }
    if (cur === 'USD') {
      return fx.cadPerUsd;
    }
    if (cur === 'INR') {
      return fx.cadPerUsd / fx.inrPerUsd;
    }
    return null;
  }

  function shortDate(iso) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || '');
    if (!m) {
      return '';
    }
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return Number(m[3]) + ' ' + months[Number(m[2]) - 1] + ' ' + m[1];
  }

  function rateText(value) {
    return cadRateText.format(Number(value.toPrecision(4)));
  }

  function updateRateLine() {
    if (fx.status === 'loading') {
      els.rateLine.textContent = "Fetching today's exchange rate\u2026";
      return;
    }
    const cur = els.currency.value;
    const unit = cur === 'CAD' ? '1 USD' : '1 ' + cur;
    const rate = cur === 'CAD' ? fx.cadPerUsd : cadPerUnit();
    const body = unit + ' = ' + rateText(rate) + ' (<a href="' + fx.link +
      '" target="_blank" rel="noopener noreferrer">' + fx.label + '</a>, ' +
      shortDate(fx.date) + ')';
    els.rateLine.innerHTML = (fx.status === 'snapshot'
      ? 'Live rate unavailable \u2014 last known ' + body
      : 'Today ' + body);
  }

  function applyRates(source, parsed, status) {
    fx.cadPerUsd = parsed.cad;
    fx.inrPerUsd = parsed.inr;
    fx.date = parsed.date;
    fx.label = source.label;
    fx.link = source.link;
    fx.status = status;
  }

  function loadRates(index) {
    const i = index || 0;
    if (i >= RATE_SOURCES.length) {
      applyRates(RATE_SNAPSHOT, RATE_SNAPSHOT, 'snapshot');
      updateRateLine();
      render();
      return;
    }
    const source = RATE_SOURCES[i];
    fetch(source.url, { cache: 'no-store' })
      .then((response) => (response.ok ? response.json() : Promise.reject(new Error('HTTP ' + response.status))))
      .then((data) => {
        const parsed = source.parse(data);
        if (!parsed || !parsed.cad || !parsed.inr) {
          throw new Error('Unexpected payload');
        }
        applyRates(source, parsed, 'ready');
        updateRateLine();
        render();
      })
      .catch(() => {
        loadRates(i + 1);
      });
  }

  const COMPOUND_WORDS = { '1': 'yearly', '4': 'quarterly', '12': 'monthly', '365': 'daily' };
  const MAX_MONTHS = 1200; // 100 years, the outer limit for "how long?" questions
  const SVG_NS = 'http://www.w3.org/2000/svg';
  const W = 720;
  const H = 280;
  const M = { top: 18, right: 20, bottom: 34, left: 72 };

  const number = new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 });
  const moneyCache = new Map();

  let currentView = 'forward';
  let showTable = false;
  let inflationFromUrl = false;

  function moneyFormat(currency, compact) {
    const key = currency + (compact ? '|c' : '|f');
    let f = moneyCache.get(key);
    if (!f) {
      f = new Intl.NumberFormat('en-US', compact
        ? { style: 'currency', currency: currency, notation: 'compact', maximumFractionDigits: 1 }
        : { style: 'currency', currency: currency, maximumFractionDigits: 0 });
      moneyCache.set(key, f);
    }
    return f;
  }

  function money(value, currency, compact) {
    return moneyFormat(currency, compact).format(value);
  }

  function readNumber(input, fallback) {
    const v = parseFloat(input.value);
    return Number.isFinite(v) ? v : fallback;
  }

  function clamp(v, lo, hi) {
    return Math.min(hi, Math.max(lo, v));
  }

  function optionValues(select) {
    return Array.prototype.map.call(select.options, (o) => o.value);
  }

  function readInputs() {
    const ratePct = clamp(readNumber(els.rate, DEFAULTS.rate), 0, 30);
    const inflationPct = clamp(readNumber(els.inflation, countryFor().inflation), 0, 30);
    return {
      view: currentView,
      principal: Math.max(0, readNumber(els.principal, DEFAULTS.principal)),
      deposit: Math.max(0, readNumber(els.deposit, 0)),
      ratePct: ratePct,
      rate: ratePct / 100,
      years: clamp(readNumber(els.years, DEFAULTS.years), 0, 60),
      target: Math.max(0, readNumber(els.target, DEFAULTS.target)),
      inflationPct: inflationPct,
      inflation: inflationPct / 100,
      type: els.type.value,
      currency: els.currency.value
    };
  }

  // Month by month, so deposits and any compounding frequency agree with each other.
  // A numeric `target` stops the run as soon as the balance reaches it.
  function project(inp, maxMonths, target) {
    const isSimple = inp.type === 'simple';
    const n = isSimple ? 12 : Number(inp.type);
    const monthlyRate = isSimple
      ? inp.rate / 12
      : Math.pow(1 + inp.rate / n, n / 12) - 1;

    const hasTarget = typeof target === 'number';
    let invested = inp.principal;
    let balance = inp.principal;
    let interest = 0;
    const points = [{ t: 0, balance: balance, invested: invested }];

    let reached = false;
    let stopMonth = maxMonths;
    if (hasTarget && balance >= target) {
      reached = true;
      stopMonth = 0;
    }

    for (let m = 1; m <= maxMonths && !reached; m++) {
      if (isSimple) {
        interest += invested * monthlyRate;
        balance = invested + interest + inp.deposit;
      } else {
        balance = balance * (1 + monthlyRate) + inp.deposit;
      }
      invested += inp.deposit;

      if (m % 12 === 0) {
        points.push({ t: m / 12, balance: balance, invested: invested });
      }
      if (hasTarget && balance >= target) {
        reached = true;
        stopMonth = m;
      }
    }

    const lastT = points[points.length - 1].t;
    if (stopMonth > 0 && Math.abs(lastT * 12 - stopMonth) > 1e-9) {
      points.push({ t: stopMonth / 12, balance: balance, invested: invested });
    }

    return {
      points: points,
      months: stopMonth,
      reached: hasTarget ? reached : true,
      final: { balance: balance, invested: invested }
    };
  }

  // A round tick size so an axis gets about `ticks` divisions.
  function niceStep(maxValue, ticks) {
    const raw = maxValue / ticks;
    const pow = Math.pow(10, Math.floor(Math.log10(raw)));
    const f = raw / pow;
    const nice = f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10;
    return nice * pow;
  }

  function xStepFor(xMax) {
    const steps = [1, 2, 5, 10, 20, 25, 50];
    return steps.find((s) => xMax / s <= 10) || 50;
  }

  function yearsText(y) {
    return number.format(y) + (y === 1 ? ' year' : ' years');
  }

  function durationText(months) {
    const y = Math.floor(months / 12);
    const m = months % 12;
    const parts = [];
    if (y) {
      parts.push(y + (y === 1 ? ' year' : ' years'));
    }
    if (m) {
      parts.push(m + (m === 1 ? ' month' : ' months'));
    }
    return parts.length ? parts.join(' ') : '0 months';
  }

  function formWord(type) {
    return type === 'simple' ? 'simple interest' : 'compounded ' + (COMPOUND_WORDS[type] || 'monthly');
  }

  function svgEl(name, attrs, text) {
    const node = document.createElementNS(SVG_NS, name);
    Object.keys(attrs || {}).forEach((k) => node.setAttribute(k, attrs[k]));
    if (text !== undefined) {
      node.textContent = text;
    }
    return node;
  }

  function renderChart(points, s) {
    const svg = els.chart;
    svg.textContent = '';

    const plotW = W - M.left - M.right;
    const plotH = H - M.top - M.bottom;
    const xOf = (t) => M.left + (t / s.xMax) * plotW;
    const yOf = (v) => M.top + plotH - (v / s.yMax) * plotH;

    for (let i = 0; i * s.yStep <= s.yMax + 1e-9; i++) {
      const v = i * s.yStep;
      const y = yOf(v);
      svg.appendChild(svgEl('line', { class: 'grid-line', x1: M.left, x2: W - M.right, y1: y, y2: y }));
      svg.appendChild(svgEl('text', {
        class: 'axis-label', x: M.left - 10, y: y + 4, 'text-anchor': 'end'
      }, money(v, s.currency, true)));
    }

    if (s.months > 0) {
      const steps = Math.floor(s.xMax / s.xStep + 1e-9);
      for (let i = 0; i <= steps; i++) {
        const t = i * s.xStep;
        svg.appendChild(svgEl('text', {
          class: 'axis-label', x: xOf(t), y: H - 10, 'text-anchor': 'middle'
        }, number.format(t)));
      }
      if (s.xMax - steps * s.xStep > s.xStep * 0.4) {
        svg.appendChild(svgEl('text', {
          class: 'axis-label', x: xOf(s.xMax), y: H - 10, 'text-anchor': 'middle'
        }, number.format(s.xMax)));
      }
    } else {
      svg.appendChild(svgEl('text', {
        class: 'axis-label', x: M.left, y: H - 10, 'text-anchor': 'middle'
      }, '0'));
    }

    const pathOf = (list, mapFn) => list
      .map((p, i) => (i ? 'L' : 'M') + xOf(p.t).toFixed(1) + ' ' + yOf(mapFn(p)).toFixed(1))
      .join(' ');

    const balancePath = pathOf(points, (p) => p.balance);
    const paidPath = pathOf(points, (p) => p.invested);
    const back = pathOf(points.slice().reverse(), (p) => p.invested).replace(/^M/, 'L');

    svg.appendChild(svgEl('path', { class: 'chart-area', d: balancePath + ' ' + back + ' Z' }));

    if (s.target !== null) {
      const ty = yOf(s.target);
      svg.appendChild(svgEl('line', {
        class: 'chart-target', x1: M.left, x2: W - M.right, y1: ty, y2: ty
      }));
      svg.appendChild(svgEl('text', {
        class: 'chart-target-label', x: W - M.right, y: ty - 7, 'text-anchor': 'end'
      }, 'Target'));
    }

    svg.appendChild(svgEl('path', { class: 'chart-paid', d: paidPath, fill: 'none' }));
    svg.appendChild(svgEl('path', { class: 'chart-line', d: balancePath, fill: 'none' }));

    const last = points[points.length - 1];
    const lastX = xOf(last.t);
    const lastY = yOf(last.balance);

    if (points.length <= 31) {
      points.slice(0, -1).forEach((p) => {
        svg.appendChild(svgEl('circle', {
          class: 'chart-dot', cx: xOf(p.t), cy: yOf(p.balance), r: 3.5
        }));
      });
    }
    svg.appendChild(svgEl('circle', { class: 'chart-dot', cx: lastX, cy: lastY, r: 5 }));

    if (s.months > 0) {
      const nearLeft = lastX < M.left + 130;
      const labelY = lastY - 12 < 16 ? lastY + 22 : lastY - 12;
      svg.appendChild(svgEl('text', {
        class: 'chart-end',
        x: nearLeft ? lastX + 10 : lastX - 10,
        y: labelY,
        'text-anchor': nearLeft ? 'start' : 'end'
      }, money(last.balance, s.currency)));
    } else {
      svg.appendChild(svgEl('text', {
        class: 'chart-note', x: M.left + plotW / 2, y: M.top + plotH / 2, 'text-anchor': 'middle'
      }, 'Nothing to project yet'));
    }
  }

  function renderTable(points, currency) {
    const rows = points.map((p) => (
      '<tr>' +
      '<th scope="row">' + number.format(p.t) + '</th>' +
      '<td>' + money(p.balance, currency) + '</td>' +
      '<td>' + money(p.invested, currency) + '</td>' +
      '<td>' + money(p.balance - p.invested, currency) + '</td>' +
      '</tr>'
    )).join('');

    els.breakdown.innerHTML =
      '<table class="breakdown-table">' +
      '<thead><tr>' +
      '<th scope="col">Year</th>' +
      '<th scope="col">Balance</th>' +
      '<th scope="col">Paid in</th>' +
      '<th scope="col">Interest</th>' +
      '</tr></thead>' +
      '<tbody>' + rows + '</tbody>' +
      '</table>';
  }

  function render() {
    const inp = readInputs();
    const cur = inp.currency;
    const at = (v, compact) => money(v, cur, compact);
    const isTarget = inp.view === 'target';

    let result;
    let months;
    if (isTarget) {
      result = project(inp, MAX_MONTHS, inp.target);
      months = result.months;
    } else {
      months = Math.round(inp.years * 12);
      result = project(inp, months, null);
    }

    const yearsUsed = months / 12;
    const finalBal = result.final.balance;
    const paidIn = result.final.invested;
    const interest = finalBal - paidIn;
    const realValue = inp.inflation > 0 ? finalBal / Math.pow(1 + inp.inflation, yearsUsed) : finalBal;
    const growth = paidIn > 0 ? finalBal / paidIn : null;

    if (isTarget) {
      els.resultLead.textContent = 'Time to reach ' + at(inp.target);
      els.finalBalance.classList.add('is-long');
      if (months === 0 && result.reached) {
        els.finalBalance.textContent = 'Already there';
      } else if (!result.reached) {
        els.finalBalance.textContent = 'Not reached';
      } else {
        els.finalBalance.textContent = durationText(months);
      }
    } else {
      els.resultLead.textContent = 'Final balance after ' + yearsText(inp.years);
      els.finalBalance.classList.remove('is-long');
      els.finalBalance.textContent = at(finalBal);
    }

    const base = at(inp.principal) + ' at ' + number.format(inp.ratePct) + '% a year, ' + formWord(inp.type) +
      (inp.deposit > 0 ? ', plus ' + at(inp.deposit) + ' a month' : '') + '.';

    let summary;
    if (isTarget && !result.reached) {
      summary = 'At these numbers it never gets there. Raise the rate or the monthly amount, or lower the target.';
    } else if (isTarget && months === 0) {
      summary = base + ' Your starting amount already covers it.';
    } else if (growth !== null) {
      summary = base + ' Grows ' + growth.toFixed(2) + '\u00d7 your money.';
    } else {
      summary = base;
    }
    els.resultSummary.textContent = summary;

    els.statIn.textContent = at(paidIn);
    els.statInterest.textContent = at(interest);
    els.statReal.textContent = at(realValue);
    els.statReal.setAttribute('title', 'What it is worth at ' + number.format(inp.inflationPct) + '% inflation');
    els.statGrowth.textContent = growth === null ? '\u2014' : growth.toFixed(2) + '\u00d7';

    // Canadian dollar equivalent of each figure, at today's rate. CAD figures get none.
    const rate = cadPerUnit();
    const showCad = rate !== null && cur !== 'CAD';

    els.resultAlt.hidden = !showCad;
    els.altIn.hidden = !showCad;
    els.altInterest.hidden = !showCad;
    els.altReal.hidden = !showCad;

    if (showCad) {
      const headline = isTarget ? inp.target : finalBal;
      els.resultAlt.textContent = (isTarget ? 'Target \u2248 ' : '\u2248 ') +
        cadText(headline * rate) + " at today's rate";
      els.altIn.textContent = '\u2248 ' + cadText(paidIn * rate);
      els.altInterest.textContent = '\u2248 ' + cadText(interest * rate);
      els.altReal.textContent = '\u2248 ' + cadText(realValue * rate);
    }

    els.chartDesc.textContent = 'Balance rises from ' + at(inp.principal) + ' to ' + at(finalBal) +
      ' over ' + durationText(months) + ', with ' + at(paidIn) + ' paid in.';

    const xMax = Math.max(yearsUsed, 1);
    const top = Math.max(finalBal, paidIn, 1);
    const yStep = niceStep(top, 4);
    const yMax = Math.ceil(top / yStep - 1e-9) * yStep;

    renderChart(result.points, {
      xMax: xMax,
      xStep: xStepFor(xMax),
      yMax: yMax,
      yStep: yStep,
      months: months,
      currency: cur,
      target: isTarget && result.reached && months > 0 ? inp.target : null
    });

    if (showTable) {
      renderTable(result.points, cur);
    }

    writeUrl(inp);
  }

  function num(v) {
    return String(Number(v.toFixed(4)));
  }

  function writeUrl(inp) {
    const params = new URLSearchParams();
    params.set('v', inp.view);
    params.set('p', num(inp.principal));
    params.set('d', num(inp.deposit));
    params.set('r', num(inp.ratePct));
    params.set('t', num(inp.years));
    params.set('g', num(inp.target));
    params.set('i', num(inp.inflationPct));
    params.set('ty', inp.type);
    params.set('c', inp.currency);
    try {
      history.replaceState(null, '', '#' + params.toString());
    } catch (e) {
      // file:// and a few embedded contexts refuse; the page still works
    }
  }

  function readUrl() {
    if (!location.hash || location.hash.length < 2) {
      return;
    }
    const q = new URLSearchParams(location.hash.slice(1));
    const setNum = (el, key, lo, hi) => {
      const v = parseFloat(q.get(key));
      if (Number.isFinite(v)) {
        el.value = String(clamp(v, lo, hi));
      }
    };
    setNum(els.principal, 'p', 0, 1e9);
    setNum(els.deposit, 'd', 0, 1e5);
    setNum(els.rate, 'r', 0, 30);
    setNum(els.years, 't', 0, 60);
    setNum(els.target, 'g', 0, 1e9);

    const inflationValue = parseFloat(q.get('i'));
    if (Number.isFinite(inflationValue)) {
      els.inflation.value = String(clamp(inflationValue, 0, 30));
      inflationFromUrl = true;
    }

    const view = q.get('v');
    if (view === 'target' || view === 'forward') {
      currentView = view;
    }
    const type = q.get('ty');
    if (type && optionValues(els.type).indexOf(type) !== -1) {
      els.type.value = type;
    }
    const currency = q.get('c');
    if (currency && optionValues(els.currency).indexOf(currency) !== -1) {
      els.currency.value = currency;
    }
  }

  function setView(view) {
    currentView = view === 'target' ? 'target' : 'forward';
    els.segments.forEach((btn) => {
      btn.setAttribute('aria-pressed', String(btn.getAttribute('data-view') === currentView));
    });
    els.yearsField.hidden = currentView === 'target';
    els.targetField.hidden = currentView !== 'target';
  }

  function updateSymbols() {
    const parts = new Intl.NumberFormat('en-US', { style: 'currency', currency: els.currency.value }).formatToParts(0);
    const found = parts.filter((p) => p.type === 'currency')[0];
    const symbol = found ? found.value : els.currency.value;
    els.symbols.forEach((node) => { node.textContent = symbol; });
  }

  function updateInflationSource() {
    const c = countryFor();
    els.inflationSource.innerHTML = 'Default <a href="' + c.url + '" target="_blank" rel="noopener noreferrer">' +
      'World Bank, ' + c.name + ' CPI ' + c.year + '</a> &middot; you can change it';
  }

  function applyCountryInflation() {
    els.inflation.value = String(countryFor().inflation);
    updateInflationSource();
  }

  function syncRangeFromNumber(numInput, rangeInput) {
    const v = readNumber(numInput, 0);
    rangeInput.value = clamp(v, parseFloat(rangeInput.min), parseFloat(rangeInput.max));
  }

  function syncRanges() {
    syncRangeFromNumber(els.rate, els.rateRange);
    syncRangeFromNumber(els.years, els.yearsRange);
  }

  function bindPair(numInput, rangeInput) {
    numInput.addEventListener('input', () => {
      syncRangeFromNumber(numInput, rangeInput);
      render();
    });
    rangeInput.addEventListener('input', () => {
      numInput.value = rangeInput.value;
      render();
    });
  }

  els.segments.forEach((btn) => {
    btn.addEventListener('click', () => {
      setView(btn.getAttribute('data-view'));
      render();
    });
  });

  bindPair(els.rate, els.rateRange);
  bindPair(els.years, els.yearsRange);

  [els.principal, els.deposit, els.target, els.inflation].forEach((el) => {
    el.addEventListener('input', render);
  });

  els.type.addEventListener('change', render);

  els.currency.addEventListener('change', () => {
    updateSymbols();
    applyCountryInflation();
    updateRateLine();
    render();
  });

  els.presets.forEach((btn) => {
    btn.addEventListener('click', () => {
      const p = PRESETS[btn.getAttribute('data-preset')];
      if (!p) {
        return;
      }
      els.principal.value = String(p.principal);
      els.deposit.value = String(p.deposit);
      els.rate.value = String(p.rate);
      els.years.value = String(p.years);
      setView('forward');
      syncRanges();
      render();
    });
  });

  els.tableToggle.addEventListener('click', () => {
    showTable = !showTable;
    els.tableToggle.setAttribute('aria-expanded', String(showTable));
    els.tableToggle.textContent = showTable ? 'Hide table' : 'Year by year';
    els.breakdown.hidden = !showTable;
    render();
  });

  els.copyLink.addEventListener('click', () => {
    const done = (text) => {
      els.copyLink.textContent = text;
      setTimeout(() => { els.copyLink.textContent = 'Copy link'; }, 1600);
    };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(location.href).then(() => done('Copied'), () => done('Copy failed'));
    } else {
      done('Copy the address bar');
    }
  });

  readUrl();
  setView(currentView);
  updateSymbols();
  syncRanges();
  if (!inflationFromUrl) {
    els.inflation.value = String(countryFor().inflation);
  }
  updateInflationSource();
  updateRateLine();
  render();
  loadRates();
})();

import React, { useMemo, useState } from "react";
import Plot from "react-plotly.js";

const API = import.meta.env.DEV ? "http://127.0.0.1:8000/api" : "/api";

function money(value) {
  return `₹${Number(value || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
}

function Matrix({ title, records = [], stocks = [], decimals = 3 }) {
  const values = useMemo(() => {
    const map = {};
    records.forEach((item) => { map[`${item.row}|${item.col}`] = item.value; });
    return map;
  }, [records]);

  return (
    <div className="panel">
      <div className="panel-title">
        <div><span className="label">STATISTICS</span><h3>{title}</h3></div>
        <span className="badge">{stocks.length} companies</span>
      </div>
      <div className="table-wrap">
        <table>
          <thead><tr><th></th>{stocks.map((stock) => <th key={stock}>{stock}</th>)}</tr></thead>
          <tbody>
            {stocks.map((row) => (
              <tr key={row}>
                <th>{row}</th>
                {stocks.map((col) => {
                  const value = values[`${row}|${col}`];
                  return <td key={col}>{value == null ? "—" : Number(value).toFixed(decimals)}</td>;
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function App() {
  const [started, setStarted] = useState(false);
  const [query, setQuery] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [selected, setSelected] = useState([]);
  const [period, setPeriod] = useState("6mo");
  const [rollingWindow, setRollingWindow] = useState(20);
  const [forecastHorizon, setForecastHorizon] = useState(30);
  const [result, setResult] = useState(null);
  const [tab, setTab] = useState("overview");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [forecastStock, setForecastStock] = useState("");
  const [capital, setCapital] = useState(100000);
  const [riskPct, setRiskPct] = useState(2);
  const [stopPct, setStopPct] = useState(5);

  async function searchCompanies(value) {
    setQuery(value);
    setError("");
    if (value.trim().length < 2) {
      setSearchResults([]);
      return;
    }
    setSearching(true);
    try {
      const response = await fetch(`${API}/search?q=${encodeURIComponent(value.trim())}`);
      const data = await response.json();
      setSearchResults(Array.isArray(data) ? data : []);
    } catch {
      setError("Company search failed. Make sure the backend is running.");
    } finally {
      setSearching(false);
    }
  }

  function addCompany(company) {
    if (selected.some((item) => item.ticker === company.ticker)) return;
    if (selected.length >= 8) {
      setError("You can select a maximum of 8 companies.");
      return;
    }
    setSelected((items) => [...items, company]);
    setQuery("");
    setSearchResults([]);
  }

  function removeCompany(ticker) {
    setSelected((items) => items.filter((item) => item.ticker !== ticker));
  }

  async function analyze() {
    if (selected.length < 2) {
      setError("Select at least 2 companies before starting the analysis.");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const response = await fetch(`${API}/analyze`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          stocks: selected,
          period,
          rolling_window: Number(rollingWindow),
          forecast_horizon: Number(forecastHorizon)
        })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || "Analysis failed.");
      setResult(data);
      setForecastStock(data.stocks[0]);
      setTab("overview");
      setTimeout(() => document.getElementById("results")?.scrollIntoView({ behavior: "smooth" }), 100);
    } catch (err) {
      setError(err.message || "Analysis failed.");
    } finally {
      setLoading(false);
    }
  }

  const stocks = result?.stocks || [];
  const pair = result?.pair_analysis || {};
  const riskRows = result ? Object.entries(result.risk_metrics || {}) : [];
  const rolling = result?.rolling || [];
  const forecast = result?.forecasts?.[forecastStock]?.[String(forecastHorizon)];
  const latestPrice = result?.latest_prices?.[forecastStock] || 0;
  const riskAmount = Number(capital || 0) * Number(riskPct || 0) / 100;
  const perShareRisk = latestPrice * Number(stopPct || 0) / 100;
  const shares = perShareRisk > 0 ? Math.floor(riskAmount / perShareRisk) : 0;
  const positionValue = shares * latestPrice;

  const terrain = stocks.map((row) => stocks.map((col) => {
    const item = (result?.pearson || []).find((entry) => entry.row === row && entry.col === col);
    return item?.value ?? 0;
  }));

  return (
    <div className="app">
      <section className="home">
        <div className="orb orb-a" />
        <div className="orb orb-b" />
        <div className="grid3d" />
        <nav>
          <div className="brand"><span>Σ</span> QUANT LAB</div>
          <div className="nav-pill">CORRELATION • REGRESSION • MARKET DATA</div>
        </nav>
        <div className="home-content">
          <div className="home-copy">
            <span className="label">B.TECH QUANTITATIVE ANALYSIS PROJECT</span>
            <h1>Stock<br /><em>Correlation</em><br />Analyzer</h1>
            <p>Explore historical relationships, risk statistics and transparent regression-based future scenarios.</p>
            <button className="primary" onClick={() => { setStarted(true); setTimeout(() => document.getElementById("workspace")?.scrollIntoView({ behavior: "smooth" }), 80); }}>
              Start Analysis <span>→</span>
            </button>
          </div>
          <div className="hero-card">
            <div className="hero-card-top"><span>QUANT ENGINE</span><i>● HISTORICAL + MODEL</i></div>
            <div className="mini-chart">{[38, 52, 43, 68, 58, 78, 71, 92, 83, 105, 94, 120].map((height, index) => <div key={index} style={{ height }}><b /></div>)}</div>
            <div className="hero-stats"><div><small>Correlation</small><strong>r</strong></div><div><small>Regression</small><strong>β</strong></div><div><small>Scenario</small><strong>7–90D</strong></div></div>
          </div>
        </div>
      </section>

      {started ? (
        <main id="workspace" className="workspace">
          <section className="selector panel">
            <div className="selector-head">
              <div><span className="label">01 / COMPANY SELECTION</span><h2>Search the market</h2><p>Search by company name or ticker. Select 2–8 companies.</p></div>
              <div className="count"><strong>{selected.length}</strong><span>/ 8<br />selected</span></div>
            </div>
            <div className="search-box">
              <span>⌕</span>
              <input value={query} onChange={(event) => searchCompanies(event.target.value)} placeholder="Search company name or symbol — Tata, TCS, Infosys..." />
              <kbd>SEARCH</kbd>
            </div>
            {query.length >= 2 ? (
              <div className="search-results">
                {searching ? <div className="search-state">Searching market listings…</div> : searchResults.length ? searchResults.map((company) => (
                  <button className="search-result" key={company.ticker} onClick={() => addCompany(company)}>
                    <div><strong>{company.name}</strong><small>{company.symbol} • {company.exchange || "Market listing"}</small></div><span>＋</span>
                  </button>
                )) : <div className="search-state">No matching companies found.</div>}
              </div>
            ) : null}
            <div className="selected-list">
              {selected.length ? selected.map((company) => (
                <div className="selected-chip" key={company.ticker}><span><b>{company.symbol}</b><small>{company.name}</small></span><button onClick={() => removeCompany(company.ticker)}>×</button></div>
              )) : <div className="empty-selection">Your selected companies will appear here.</div>}
            </div>
            <div className="analysis-controls">
              <label>Historical period<select value={period} onChange={(event) => setPeriod(event.target.value)}><option value="6mo">6 months</option><option value="1y">1 year</option><option value="3y">3 years</option><option value="5y">5 years</option></select></label>
              <label>Rolling window<select value={rollingWindow} onChange={(event) => setRollingWindow(event.target.value)}><option value="20">20 days</option><option value="30">30 days</option><option value="60">60 days</option><option value="90">90 days</option></select></label>
              <label>Forecast horizon<select value={forecastHorizon} onChange={(event) => setForecastHorizon(Number(event.target.value))}><option value="7">7 trading days</option><option value="30">30 trading days</option><option value="60">60 trading days</option><option value="90">90 trading days</option></select></label>
              <button className="analyze" disabled={loading} onClick={analyze}>{loading ? "Analyzing…" : "Analyze + Model Future →"}</button>
            </div>
            {error ? <div className="error">⚠ {error}</div> : null}
          </section>

          {!result ? (
            <section className="features">
              <article><span>01</span><h3>Correlate</h3><p>Pearson, Spearman, covariance, p-values, rolling and market-adjusted correlation.</p></article>
              <article><span>02</span><h3>Measure risk</h3><p>Historical return, annualized volatility, drawdown and an educational risk calculator.</p></article>
              <article><span>03</span><h3>Model a scenario</h3><p>Simple regression projects a historical price trend forward with an uncertainty range.</p></article>
            </section>
          ) : null}

          {result ? (
            <section id="results" className="results">
              <div className="results-head">
                <div><span className="label">02 / ANALYSIS RESULTS</span><h2>Market intelligence</h2><p>{result.date_start} → {result.date_end} · {result.observations} daily return observations</p></div>
                <div className="tabs">
                  <button className={tab === "overview" ? "active" : ""} onClick={() => setTab("overview")}>Overview</button>
                  <button className={tab === "forecast" ? "active" : ""} onClick={() => setTab("forecast")}>Future Scenario</button>
                  <button className={tab === "matrices" ? "active" : ""} onClick={() => setTab("matrices")}>Matrices</button>
                  <button className={tab === "math" ? "active" : ""} onClick={() => setTab("math")}>Mathematics</button>
                </div>
              </div>

              {tab === "overview" ? (
                <>
                  <div className="metric-grid">
                    {riskRows.map(([name, metrics]) => <div className="stock-metric panel" key={name}><div className="stock-name"><b>{name}</b></div><strong>{metrics.total_return == null ? "—" : `${(metrics.total_return * 100).toFixed(1)}%`}</strong><small>Historical return</small><div className="metric-line"><span>Volatility</span><b>{metrics.annualized_volatility == null ? "—" : `${(metrics.annualized_volatility * 100).toFixed(1)}%`}</b></div><div className="metric-line"><span>Max drawdown</span><b>{metrics.max_drawdown == null ? "—" : `${(metrics.max_drawdown * 100).toFixed(1)}%`}</b></div></div>)}
                  </div>
                  <section className="pair panel"><div><span className="label">PRIMARY PAIR</span><h2>{pair.stock_a} <em>↔</em> {pair.stock_b}</h2><p>{pair.interpretation || "Historical relationship between the selected pair."}</p></div><div className="pair-values"><div><small>Pearson</small><b>{pair.pearson?.toFixed(3) ?? "—"}</b></div><div><small>Spearman</small><b>{pair.spearman?.toFixed(3) ?? "—"}</b></div><div><small>p-value</small><b>{pair.pearson_p?.toFixed(5) ?? "—"}</b></div><div><small>Market-adjusted</small><b>{pair.partial_correlation_market_adjusted?.toFixed(3) ?? "—"}</b></div></div></section>
                  <div className="charts">
                    <div className="panel"><div className="panel-title"><div><span className="label">TIME-VARYING</span><h3>Rolling correlation</h3></div><span className="badge">{result.rolling_window} day window</span></div><Plot data={[{ x: rolling.map((item) => item.date), y: rolling.map((item) => item.correlation), type: "scatter", mode: "lines" }]} layout={{ autosize: true, margin: { l: 45, r: 15, t: 5, b: 45 }, paper_bgcolor: "transparent", plot_bgcolor: "transparent", font: { color: "#9aacbf" }, yaxis: { range: [-1, 1], title: "r" } }} useResizeHandler style={{ width: "100%", height: 350 }} config={{ displayModeBar: false, responsive: true }} /></div>
                    <div className="panel"><div className="panel-title"><div><span className="label">3D VIEW</span><h3>Correlation terrain</h3></div></div><Plot data={[{ type: "surface", z: terrain, x: stocks, y: stocks, showscale: false }]} layout={{ autosize: true, margin: { l: 5, r: 5, t: 5, b: 5 }, paper_bgcolor: "transparent", scene: { bgcolor: "transparent" } }} useResizeHandler style={{ width: "100%", height: 350 }} config={{ displayModeBar: false }} /></div>
                  </div>
                  <section className="panel risk-tools"><div className="panel-title"><div><span className="label">RISK CALCULATOR</span><h3>Test an investment scenario</h3></div></div><p className="muted">Educational calculation only; it does not determine what anyone should invest.</p><div className="calc-grid"><label>Total capital (₹)<input type="number" value={capital} onChange={(event) => setCapital(event.target.value)} /></label><label>Max risk per position (%)<input type="number" value={riskPct} onChange={(event) => setRiskPct(event.target.value)} /></label><label>Stock<select value={forecastStock} onChange={(event) => setForecastStock(event.target.value)}>{stocks.map((stock) => <option key={stock}>{stock}</option>)}</select></label><label>Stop-loss distance (%)<input type="number" value={stopPct} onChange={(event) => setStopPct(event.target.value)} /></label></div><div className="calc-output"><div><small>Current price</small><strong>{money(latestPrice)}</strong></div><div><small>Maximum risk</small><strong>{money(riskAmount)}</strong></div><div><small>Illustrative shares</small><strong>{shares.toLocaleString("en-IN")}</strong></div><div><small>Capital used</small><strong>{money(positionValue)}</strong></div></div></section>
                </>
              ) : null}

              {tab === "forecast" ? (
                <section className="forecast-page">
                  <div className="forecast-hero panel"><div><span className="label">04 / REGRESSION FORECAST ENGINE</span><h2>Future scenario — model, not certainty</h2><p>The model fits simple linear regression to historical log prices and projects the fitted trend forward. It cannot know future news or shocks.</p></div><div className="forecast-controls"><label>Company<select value={forecastStock} onChange={(event) => setForecastStock(event.target.value)}>{stocks.map((stock) => <option key={stock}>{stock}</option>)}</select></label><label>Horizon<select value={forecastHorizon} onChange={(event) => setForecastHorizon(Number(event.target.value))}><option value="7">7 trading days</option><option value="30">30 trading days</option><option value="60">60 trading days</option><option value="90">90 trading days</option></select></label></div></div>
                  {forecast ? <><div className="forecast-cards"><div className="panel"><small>Current price</small><strong>{money(forecast.current_price)}</strong></div><div className="panel"><small>Model projected price</small><strong>{money(forecast.forecast_price)}</strong></div><div className="panel"><small>Model projected return</small><strong>{(forecast.forecast_return * 100).toFixed(2)}%</strong></div><div className="panel"><small>Historical fit (R²)</small><strong>{forecast.r2.toFixed(3)}</strong></div></div><div className="panel"><Plot data={[{ x: forecast.history_dates, y: forecast.history_prices, type: "scatter", mode: "lines", name: "Historical" }, { x: forecast.forecast_dates, y: forecast.forecast_prices, type: "scatter", mode: "lines", name: "Model trend" }]} layout={{ autosize: true, margin: { l: 55, r: 20, t: 20, b: 50 }, paper_bgcolor: "transparent", plot_bgcolor: "transparent", font: { color: "#9aacbf" }, yaxis: { title: "Price (₹)" } }} useResizeHandler style={{ width: "100%", height: 430 }} config={{ displayModeBar: false }} /></div><div className="forecast-grid"><section className="panel"><span className="label">MODEL INTERPRETATION</span><h3>{forecast.direction === "upward" ? "Upward historical trend" : forecast.direction === "downward" ? "Downward historical trend" : "Flat historical trend"}</h3><p>Projected change for the selected horizon: <strong>{(forecast.forecast_return * 100).toFixed(2)}%</strong>.</p><p>Model range: {money(forecast.lower_price)} to {money(forecast.upper_price)}.</p></section><section className="panel"><span className="label">HOW TO READ IT</span><h3>Statistical scenario</h3><p>Use the forecast together with correlation, volatility and drawdown. It is not a buy/sell instruction and does not guarantee future returns.</p></section></div></> : <div className="panel">Not enough historical data for this regression scenario.</div>}
                </section>
              ) : null}

              {tab === "matrices" ? <div className="matrix-grid"><Matrix title="Pearson Correlation" records={result.pearson} stocks={stocks} /><Matrix title="Spearman Rank Correlation" records={result.spearman} stocks={stocks} /><Matrix title="Covariance" records={result.covariance} stocks={stocks} decimals={6} /><Matrix title="Pearson p-values" records={result.pearson_p} stocks={stocks} decimals={5} /></div> : null}

              {tab === "math" ? <section className="math panel"><span className="label">03 / MATHEMATICAL ENGINE</span><h2>Module IX + Module X mathematics</h2><div className="formula-grid"><article><b>Covariance</b><p>Measures joint movement of two return variables.</p><code>Cov(X,Y) = E[(X−μx)(Y−μy)]</code></article><article><b>Pearson correlation</b><p>Standardized linear association from −1 to +1.</p><code>r = Cov(X,Y)/(σxσy)</code></article><article><b>Spearman correlation</b><p>Correlation of ranked observations.</p><code>ρ = Corr(rank(X),rank(Y))</code></article><article><b>Rolling correlation</b><p>Correlation recomputed over a moving window.</p><code>r(t) = Corr(X[t−n:t],Y[t−n:t])</code></article><article><b>Partial correlation</b><p>Association after controlling for a market factor.</p><code>rXY·Z = (rXY−rXZrYZ)/√((1−rXZ²)(1−rYZ²))</code></article><article className="regression-formula"><b>Simple linear regression</b><p>Historical log-price trend used for the scenario model.</p><code>ln(Pt) = a + b·t + εt</code></article></div></section> : null}

              <div className="disclaimer">Historical statistics describe the selected period. Forecasts are model-based scenarios from historical data and include uncertainty.</div>
            </section>
          ) : null}
        </main>
      ) : null}

      <footer>Σ QUANT LAB <span>Stock Correlation & Forecast Analyzer · Statistical analysis · Regression scenarios</span></footer>
    </div>
  );
}

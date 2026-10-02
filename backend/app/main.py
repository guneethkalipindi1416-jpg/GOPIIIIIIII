from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
import pandas as pd
import numpy as np
import yfinance as yf
from scipy.stats import pearsonr, spearmanr
from scipy.cluster.hierarchy import linkage, dendrogram
from scipy.spatial.distance import squareform

app = FastAPI(title="Stock Correlation & Forecast Analyzer API")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

FALLBACK_STOCKS = {
    "Tata Consultancy Services": ("TCS", "TCS.NS"),
    "Infosys": ("INFY", "INFY.NS"),
    "Reliance Industries": ("RELIANCE", "RELIANCE.NS"),
    "HDFC Bank": ("HDFCBANK", "HDFCBANK.NS"),
    "State Bank of India": ("SBIN", "SBIN.NS"),
    "ICICI Bank": ("ICICIBANK", "ICICIBANK.NS"),
    "ITC": ("ITC", "ITC.NS"),
    "Hindustan Unilever": ("HINDUNILVR", "HINDUNILVR.NS"),
    "Bharti Airtel": ("BHARTIARTL", "BHARTIARTL.NS"),
    "Larsen & Toubro": ("LT", "LT.NS"),
    "Wipro": ("WIPRO", "WIPRO.NS"),
    "Axis Bank": ("AXISBANK", "AXISBANK.NS"),
    "Tata Motors": ("TATAMOTORS", "TATAMOTORS.NS"),
    "Tata Steel": ("TATASTEEL", "TATASTEEL.NS"),
    "Adani Enterprises": ("ADANIENT", "ADANIENT.NS"),
    "Maruti Suzuki": ("MARUTI", "MARUTI.NS"),
    "Sun Pharmaceutical": ("SUNPHARMA", "SUNPHARMA.NS"),
    "HCL Technologies": ("HCLTECH", "HCLTECH.NS"),
    "Asian Paints": ("ASIANPAINT", "ASIANPAINT.NS"),
    "Titan Company": ("TITAN", "TITAN.NS"),
}

class StockPick(BaseModel):
    name: str
    symbol: str
    ticker: str

class AnalyzeRequest(BaseModel):
    stocks: list[StockPick] = Field(min_length=2, max_length=8)
    period: str = "1y"
    rolling_window: int = Field(default=30, ge=10, le=180)
    market: str = "^NSEI"
    forecast_horizon: int = Field(default=30, ge=7, le=180)


def search_companies(query: str):
    q = query.strip()
    if not q:
        return []
    results, seen = [], set()
    try:
        data = yf.Search(q, max_results=15).quotes
        for item in data:
            quote_type = str(item.get("quoteType", "")).upper()
            symbol = item.get("symbol")
            name = item.get("longname") or item.get("shortname")
            exchange = item.get("exchange") or item.get("exchDisp") or ""
            if not symbol or not name or quote_type not in {"EQUITY", "ETF"}:
                continue
            if exchange in {"NSI", "NSE", "BSE", "BOM"} or symbol.endswith((".NS", ".BO")):
                ticker = symbol if symbol.endswith((".NS", ".BO")) else f"{symbol}.NS"
                key = ticker.upper()
                if key in seen:
                    continue
                seen.add(key)
                results.append({"name": name, "symbol": symbol.replace(".NS", "").replace(".BO", ""), "ticker": ticker, "exchange": exchange or "India"})
    except Exception:
        pass
    ql = q.lower()
    fallback = []
    for name, (symbol, ticker) in FALLBACK_STOCKS.items():
        if ql in name.lower() or ql in symbol.lower() or ql in ticker.lower():
            fallback.append({"name": name, "symbol": symbol, "ticker": ticker, "exchange": "NSE"})
    merged = results + [x for x in fallback if x["ticker"] not in {r["ticker"] for r in results}]
    return merged[:15]


def download_prices(symbols, period):
    clean_symbols = list(dict.fromkeys(str(s).strip() for s in symbols))
    if len(clean_symbols) != len(symbols):
        raise ValueError("Duplicate stock symbols were supplied.")
    raw = yf.download(clean_symbols, period=period, interval="1d", auto_adjust=True, progress=False, threads=True, group_by="column")
    if raw.empty:
        raise ValueError("No market data was returned.")
    if isinstance(raw.columns, pd.MultiIndex):
        if "Close" not in raw.columns.get_level_values(0):
            raise ValueError("Market data did not contain closing prices.")
        close = raw["Close"]
        if isinstance(close, pd.Series):
            close = close.to_frame(name=clean_symbols[0])
        frames, missing = [], []
        for ticker in clean_symbols:
            if ticker in close.columns:
                frames.append(close[ticker].rename(ticker))
            else:
                missing.append(ticker)
        if missing:
            raise ValueError(f"No price series returned for: {', '.join(missing)}")
        prices = pd.concat(frames, axis=1)
    else:
        if "Close" not in raw.columns:
            raise ValueError("Market data did not contain closing prices.")
        close = raw["Close"]
        if isinstance(close, pd.Series):
            if len(clean_symbols) != 1:
                raise ValueError("Market data returned only one price series for multiple stocks.")
            prices = close.to_frame(name=clean_symbols[0])
        else:
            missing = [t for t in clean_symbols if t not in close.columns]
            if missing:
                raise ValueError(f"No price series returned for: {', '.join(missing)}")
            prices = close[clean_symbols]
    prices = prices.loc[:, ~prices.columns.duplicated()].copy()
    return prices.ffill().dropna(how="all")


def pair_stats(x, y):
    data = pd.concat([x, y], axis=1).dropna()
    if len(data) < 4:
        return {"pearson": None, "pearson_p": None, "spearman": None, "spearman_p": None}
    r, p = pearsonr(data.iloc[:, 0], data.iloc[:, 1])
    rho, sp = spearmanr(data.iloc[:, 0], data.iloc[:, 1])
    return {"pearson": float(r), "pearson_p": float(p), "spearman": float(rho), "spearman_p": float(sp)}


def partial_corr(x, y, z):
    data = pd.concat([x, y, z], axis=1).dropna()
    if len(data) < 5:
        return None
    r_xy = pearsonr(data.iloc[:, 0], data.iloc[:, 1])[0]
    r_xz = pearsonr(data.iloc[:, 0], data.iloc[:, 2])[0]
    r_yz = pearsonr(data.iloc[:, 1], data.iloc[:, 2])[0]
    denom = np.sqrt(max(0, (1 - r_xz**2) * (1 - r_yz**2)))
    if denom == 0:
        return None
    return float((r_xy - r_xz * r_yz) / denom)


def interpretation(r):
    if r is None:
        return "Insufficient data"
    a = abs(r)
    strength = "Very weak" if a < .2 else "Weak" if a < .4 else "Moderate" if a < .6 else "Strong" if a < .8 else "Very strong"
    direction = "positive" if r > 0 else "negative" if r < 0 else "neutral"
    return f"{strength} {direction} relationship"


def matrix_records(df):
    return [{"row": r, "col": c, "value": None if pd.isna(df.loc[r, c]) else float(df.loc[r, c])} for r in df.index for c in df.columns]


def risk_metrics(prices, returns):
    out = {}
    for name in prices.columns:
        series = returns[name].dropna()
        wealth = (1 + series).cumprod()
        running_max = wealth.cummax()
        drawdown = wealth / running_max - 1
        total_return = float(wealth.iloc[-1] - 1) if len(wealth) else None
        annualized_return = float((1 + total_return) ** (252 / len(series)) - 1) if total_return is not None and len(series) else None
        annual_vol = float(series.std(ddof=1) * np.sqrt(252)) if len(series) > 1 else None
        sharpe = float((series.mean() / series.std(ddof=1)) * np.sqrt(252)) if len(series) > 1 and series.std(ddof=1) != 0 else None
        out[name] = {"total_return": total_return, "annualized_return": annualized_return, "annualized_volatility": annual_vol, "max_drawdown": float(drawdown.min()) if len(drawdown) else None, "sharpe": sharpe, "best_day": float(series.max()) if len(series) else None, "worst_day": float(series.min()) if len(series) else None}
    return out


def regression_forecast(series, horizon):
    """Educational time-trend regression on log prices.
    Returns a model-based scenario, not a guaranteed price prediction.
    """
    s = pd.Series(series).dropna().astype(float)
    if len(s) < 30:
        return None
    y = np.log(s.values)
    x = np.arange(len(y), dtype=float)
    slope, intercept = np.polyfit(x, y, 1)
    fitted = intercept + slope * x
    residuals = y - fitted
    r2_den = np.sum((y - y.mean()) ** 2)
    r2 = float(max(0, 1 - np.sum(residuals**2) / r2_den)) if r2_den > 0 else 0.0
    residual_std = float(np.std(residuals, ddof=1)) if len(residuals) > 1 else 0.0
    last_price = float(s.iloc[-1])
    future_x = np.arange(len(y), len(y) + horizon, dtype=float)
    log_pred = intercept + slope * future_x
    pred = np.exp(log_pred)
    # A simple 95% model-error band around the trend projection.
    band = 1.96 * residual_std
    lower = np.exp(log_pred - band)
    upper = np.exp(log_pred + band)
    projected_price = float(pred[-1])
    projected_return = float(projected_price / last_price - 1)
    daily_trend = float(np.exp(slope) - 1)
    annualized_trend = float(np.exp(slope * 252) - 1)
    if r2 >= 0.65:
        reliability = "Higher historical fit"
    elif r2 >= 0.35:
        reliability = "Moderate historical fit"
    else:
        reliability = "Low historical fit"
    direction = "upward" if slope > 0 else "downward" if slope < 0 else "flat"
    return {
        "current_price": last_price,
        "forecast_price": projected_price,
        "forecast_return": projected_return,
        "lower_price": float(lower[-1]),
        "upper_price": float(upper[-1]),
        "r2": r2,
        "daily_trend": daily_trend,
        "annualized_trend": annualized_trend,
        "direction": direction,
        "reliability": reliability,
        "history_dates": [d.strftime("%Y-%m-%d") for d in s.index],
        "history_prices": [float(v) for v in s.values],
        "forecast_dates": [d.strftime("%Y-%m-%d") for d in pd.date_range(s.index[-1] + pd.Timedelta(days=1), periods=horizon, freq="B")],
        "forecast_prices": [float(v) for v in pred],
        "lower_band": [float(v) for v in lower],
        "upper_band": [float(v) for v in upper],
    }


def build_forecasts(prices, horizons=(7, 30, 60, 90)):
    out = {}
    for name in prices.columns:
        models = {}
        for h in horizons:
            models[str(h)] = regression_forecast(prices[name], h)
        out[name] = models
    return out

@app.get("/api/health")
def health():
    return {"status": "ok"}

@app.get("/api/search")
def search(q: str = Query(min_length=1, max_length=80)):
    return search_companies(q)

@app.post("/api/analyze")
def analyze(req: AnalyzeRequest):
    tickers = [str(x.ticker).strip() for x in req.stocks]
    names_raw = [str(x.name).strip() for x in req.stocks]
    symbols = [str(x.symbol).strip() for x in req.stocks]
    if len(set(t.upper() for t in tickers)) != len(tickers):
        raise HTTPException(400, "Choose each company only once.")
    display_names, used_names = [], set()
    for name, symbol, ticker in zip(names_raw, symbols, tickers):
        label = name or symbol or ticker
        key = label.casefold()
        if key in used_names:
            label = f"{label} ({symbol or ticker})"
            key = label.casefold()
        suffix = 2
        base = label
        while key in used_names:
            label = f"{base} ({suffix})"
            key = label.casefold()
            suffix += 1
        used_names.add(key)
        display_names.append(label)
    try:
        prices = download_prices(tickers, req.period)
        if len(prices.columns) != len(tickers):
            raise ValueError("One or more selected companies returned no price series.")
        prices.columns = tickers
        if prices.columns.duplicated().any():
            raise ValueError("Duplicate price columns were returned by the market-data provider.")
        returns = prices.pct_change(fill_method=None).dropna(how="all").dropna()
        if returns.columns.duplicated().any():
            raise ValueError("Duplicate return columns were detected.")
        prices.columns = display_names
        returns.columns = display_names
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(502, f"Could not retrieve market data: {e}")
    names = display_names
    if len(returns) < 30:
        raise HTTPException(400, "Not enough observations for this analysis.")
    corr = returns.corr(method="pearson")
    spearman = returns.corr(method="spearman")
    covariance = returns.cov()
    pearson_p = pd.DataFrame(np.nan, index=names, columns=names)
    spearman_p = pd.DataFrame(np.nan, index=names, columns=names)
    for i, a in enumerate(names):
        for j, b in enumerate(names):
            if i == j:
                pearson_p.loc[a, b] = 0.0
                spearman_p.loc[a, b] = 0.0
            elif i < j:
                stats = pair_stats(returns[a], returns[b])
                pearson_p.loc[a, b] = pearson_p.loc[b, a] = stats["pearson_p"]
                spearman_p.loc[a, b] = spearman_p.loc[b, a] = stats["spearman_p"]
    a, b = names[0], names[1]
    rolling = returns[a].rolling(req.rolling_window).corr(returns[b]).dropna()
    rolling_data = [{"date": idx.strftime("%Y-%m-%d"), "correlation": float(val)} for idx, val in rolling.items()]
    upper = corr.where(np.triu(np.ones(corr.shape), k=1).astype(bool)).stack()
    avg_corr = float(upper.mean()) if len(upper) else 0.0
    diversification_score = float(100 * (1 - avg_corr))
    try:
        market_prices = yf.download(req.market, period=req.period, interval="1d", auto_adjust=True, progress=False)
        market_prices = market_prices["Close"] if isinstance(market_prices.columns, pd.MultiIndex) else market_prices["Close"]
        market_returns = market_prices.pct_change().dropna()
        market_returns.name = "Market"
        partial = partial_corr(returns[a], returns[b], market_returns)
    except Exception:
        partial = None
    distance = (1 - corr).clip(lower=0).copy()
    distance.iloc[np.diag_indices_from(distance)] = 0
    linkage_matrix = linkage(squareform(distance.values, checks=False), method="average") if len(names) > 2 else None
    if linkage_matrix is not None:
        dendro = dendrogram(linkage_matrix, labels=names, no_plot=True)
        dendro_traces = [{"x": xs, "y": ys} for xs, ys in zip(dendro["icoord"], dendro["dcoord"])]
    else:
        dendro_traces = []
    pair = pair_stats(returns[a], returns[b])
    metrics = risk_metrics(prices, returns)
    latest_prices = {name: float(prices[name].iloc[-1]) for name in names if not pd.isna(prices[name].iloc[-1])}
    latest_returns = {name: float(returns[name].iloc[-1]) for name in names}
    forecasts = build_forecasts(prices)
    return {
        "stocks": names, "symbols": symbols, "tickers": tickers,
        "observations": int(len(returns)), "date_start": prices.index.min().strftime("%Y-%m-%d"), "date_end": prices.index.max().strftime("%Y-%m-%d"),
        "latest_prices": latest_prices, "latest_returns": latest_returns, "risk_metrics": metrics,
        "pearson": matrix_records(corr), "spearman": matrix_records(spearman), "covariance": matrix_records(covariance), "pearson_p": matrix_records(pearson_p), "spearman_p": matrix_records(spearman_p),
        "pair_analysis": {"stock_a": a, "stock_b": b, **pair, "interpretation": interpretation(pair["pearson"]), "partial_correlation_market_adjusted": partial},
        "rolling": rolling_data, "rolling_window": req.rolling_window, "average_pairwise_correlation": avg_corr, "diversification_score": diversification_score,
        "dendrogram": {"labels": names, "traces": dendro_traces},
        "forecasts": forecasts,
        "forecast_horizon": req.forecast_horizon,
    }

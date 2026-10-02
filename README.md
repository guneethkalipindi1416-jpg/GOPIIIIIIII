# Stock Correlation & Forecast Analyzer

A React + Vite frontend with a FastAPI + Python backend for historical stock correlation analysis and educational regression scenarios.

## Features
- Search companies by name or ticker
- Select 2 to 8 companies
- Pearson correlation and covariance
- Spearman rank correlation
- p-values
- Rolling correlation
- Market-adjusted partial correlation
- Hierarchical clustering
- 3D correlation terrain
- Historical return, volatility and drawdown
- Educational position/risk calculator
- Simple regression-based future scenario with R² and uncertainty band

## Start from scratch

### Backend
Open PowerShell in the `backend` folder:

```powershell
pip install -r requirements.txt
python run.py
```

Backend: `http://127.0.0.1:8000`

### Frontend
Open a second PowerShell in the `frontend` folder:

```powershell
npm install
npm run dev
```

Frontend: `http://localhost:5173`

## Folder structure
```text
Stock_Correlation_Analyzer_NEW
├── backend
│   ├── app
│   │   └── main.py
│   ├── requirements.txt
│   └── run.py
└── frontend
    ├── src
    │   ├── App.jsx
    │   ├── main.jsx
    │   └── styles.css
    ├── package.json
    └── vite.config.js
```

The regression section is an educational statistical scenario based on historical price trends; it is not a guaranteed prediction or personalized investment instruction.

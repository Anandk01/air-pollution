# Smart Air Pollution Forecasting System

> **AI-powered PM2.5 prediction and air quality monitoring dashboard**  
> Full-stack: React + Vite frontend · Python Flask backend · XGBoost models

---

## Project Overview

**AirSight** enables real-time monitoring, visual analysis, and forecasting of PM2.5 air pollution levels. Upload historical CSV sensor data, train multiple ML models, visualise hourly/monthly trends, predict future air quality with AQI classification, and download a styled PDF report — all from a modern dark-mode dashboard.

---

## Features

| Feature | Details |
|---|---|
| CSV Upload | Drag-and-drop with pandas validation and column metadata preview |
| Analytics | Daily line chart, monthly bar chart, AQI reference table |
| ML Training | Linear Regression + Random Forest + XGBoost — auto-selects best |
| PM2.5 Prediction | Rolling autoregressive forecast for 1h / 6h / 24h ahead |
| Dashboard | Live stat cards, 48-hour trend, model RMSE horizontal bar chart |
| PDF Report | Downloadable styled report via fpdf2 (in-memory, no temp files) |
| Authentication | Session-based login with protected routes |
| Dark / Light Mode | Toggle persisted in localStorage |
| Toast Notifications | Auto-dismiss success / error / info / warning toasts |
| Loading Skeletons | Shimmer card and chart placeholders while data loads |
| 404 Page | Custom "Lost in the Smog" not-found page |
| Responsive | Mobile-ready navbar with drawer, responsive grid layouts |

---

## Tech Stack

### Frontend
- React 19 + Vite 8
- Tailwind CSS v4
- React Router DOM v7
- Axios
- Recharts

### Backend
- Python 3.10+ + Flask 3
- Flask-CORS
- Pandas + NumPy
- Scikit-learn (LinearRegression, RandomForestRegressor)
- XGBoost
- Joblib
- FPDF2
- python-dotenv

---

## Folder Structure

```
air-project/
├── backend/
│   ├── app.py              Flask app — all API routes
│   ├── .env                Config: PORT, DEBUG, UPLOAD_FOLDER
│   ├── requirements.txt
│   ├── uploads/            Uploaded CSV datasets
│   └── models/
│       └── best_model.pkl  Serialised trained model
│
└── frontend/
    ├── src/
    │   ├── App.jsx
    │   ├── context/
    │   │   ├── AuthContext.jsx
    │   │   ├── ThemeContext.jsx
    │   │   └── ToastContext.jsx
    │   ├── components/
    │   │   ├── Navbar.jsx
    │   │   ├── Footer.jsx
    │   │   ├── PageHeader.jsx
    │   │   ├── ProtectedRoute.jsx
    │   │   └── Skeleton.jsx
    │   └── pages/
    │       ├── Home.jsx
    │       ├── Login.jsx
    │       ├── Dashboard.jsx
    │       ├── UploadDataset.jsx
    │       ├── Analytics.jsx
    │       ├── Predict.jsx
    │       ├── Alerts.jsx
    │       └── NotFound.jsx
    ├── vite.config.js
    └── package.json

README.md
```

---

## Setup Instructions

### Prerequisites
- Node.js >= 18
- Python >= 3.10

### Backend

```powershell
cd air-project/backend

# Create and activate virtual environment
python -m venv venv
venv\Scripts\activate          # Windows
# source venv/bin/activate     # macOS / Linux

# Install dependencies
pip install -r requirements.txt

# (Optional) edit .env
# PORT=5000
# DEBUG=true
# UPLOAD_FOLDER=uploads

# Start Flask
python app.py
```

Backend: http://localhost:5000

### Frontend

```powershell
cd air-project/frontend
npm install
npm run dev
```

Frontend: http://localhost:5173

---

## Run Commands

| Command | Directory | Purpose |
|---|---|---|
| `python app.py` | `backend/` | Start Flask dev server |
| `npm run dev` | `frontend/` | Start Vite dev server |
| `npm run build` | `frontend/` | Production bundle |

---

## Login Credentials (Demo)

| Field | Value |
|---|---|
| Email | admin@air.com |
| Password | 123456 |

---

## API Routes

| Method | Route | Auth | Description |
|---|---|---|---|
| GET | /api/health | No | Liveness check |
| POST | /api/upload | No | Upload CSV dataset |
| GET | /api/analytics | No | PM2.5 trend + monthly avg |
| GET | /api/dashboard | No | Unified dashboard data |
| POST | /api/train | No | Train models, save best |
| POST | /api/predict | No | Predict 1h/6h/24h ahead |
| GET | /api/export-report | No | Download PDF report |

### POST /api/train response

```json
{
  "success": true,
  "best_model": "XGBoost",
  "best_rmse": 31.08,
  "train_rows": 7980,
  "test_rows": 1996,
  "metrics": [
    { "model": "LinearRegression", "rmse": 31.13, "mae": 16.38, "r2": 0.88 },
    { "model": "RandomForest",     "rmse": 31.79, "mae": 19.11, "r2": 0.875 },
    { "model": "XGBoost",          "rmse": 31.08, "mae": 18.49, "r2": 0.88 }
  ]
}
```

### POST /api/predict

```json
// Request
{ "hours_ahead": 6 }

// Response
{
  "success": true,
  "hours_ahead": 6,
  "predicted_pm25": 73.39,
  "aqi_status": "Moderate",
  "model": "XGBoost",
  "last_known_pm25": 106.0
}
```

---

## AQI Scale

| PM2.5 µg/m³ | Category | Colour |
|---|---|---|
| 0 – 30 | Good | Green |
| 31 – 60 | Satisfactory | Yellow-Green |
| 61 – 90 | Moderate | Orange |
| 91 – 120 | Poor | Orange-Red |
| 121 – 250 | Very Poor | Red |
| 250+ | Severe | Purple |

---

## Screenshots

> Add screenshots of the running application below.

| Page | File |
|---|---|
| Login | screenshots/login.png |
| Dashboard | screenshots/dashboard.png |
| Analytics | screenshots/analytics.png |
| Predict | screenshots/predict.png |
| PDF Report | screenshots/report.png |

---

**Developed by Your Name · Smart Air Pollution Forecasting System · 2026**

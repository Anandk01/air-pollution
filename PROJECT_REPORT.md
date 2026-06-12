# AirGuard — Smart Air Pollution Monitoring & Health Advisory System
## Comprehensive Project Report (Month 1 & Month 2)

**Project Title:** AirGuard — Personalized Air Quality Monitoring, Prediction & Safe Navigation Platform  
**Technology Stack:** React.js + Flask + SQLite + XGBoost + FAISS + Google Earth Engine  
**Date:** June 2026

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Month 1: Foundation & Core Systems](#2-month-1-foundation--core-systems)
3. [Month 2: Intelligence & Integration](#3-month-2-intelligence--integration)
4. [Algorithm Descriptions & Mathematical Foundations](#4-algorithm-descriptions--mathematical-foundations)
5. [System Architecture](#5-system-architecture)
6. [Database Design](#6-database-design)
7. [API Endpoints Summary](#7-api-endpoints-summary)
8. [Performance & Metrics](#8-performance--metrics)
9. [Future Scope](#9-future-scope)

---

## 1. Executive Summary

AirGuard is a full-stack web application that provides:
- **Real-time AQI monitoring** using Open-Meteo Air Quality API for 30+ Indian cities
- **ML-powered PM2.5 prediction** (1h, 6h, 24h forecasts) using XGBoost
- **Anomaly detection** using Isolation Forest for pollution spike alerts
- **Safe route navigation** that avoids polluted areas using OSRM + health-aware scoring
- **AI health chatbot** using RAG (Retrieval-Augmented Generation) with medical PDFs
- **Satellite NO2 monitoring** via Google Earth Engine (Sentinel-5P)
- **Community crowdsourcing** of pollution incidents with trust scoring
- **Personalized health profiles** that dynamically adjust AQI thresholds

---

## 2. Month 1: Foundation & Core Systems

### 2.1 Data Pipeline & ML Training

**Objective:** Build an automated pipeline to ingest PM2.5 sensor data, engineer features, and train predictive models.

**Implementation:**
- CSV upload endpoint with pandas validation
- Automatic column detection (PM2.5, datetime) across multiple naming conventions
- Feature engineering pipeline:
  - Temporal features: hour, day, month, weekday
  - Lag features: lag1, lag2, lag24 (autoregressive)
  - Rolling statistics: 24-hour rolling mean
  - Satellite: NO2 from Google Earth Engine
- 80/20 time-based train/test split (no data leakage)
- Multi-model training: LinearRegression, RandomForest, XGBoost
- Automatic best model selection by lowest RMSE
- Model serialization via joblib

### 2.2 CPCB AQI Calculation

**Formula (Linear Interpolation):**
```
Sub-Index = ((AQI_high - AQI_low) / (BP_high - BP_low)) * (Concentration - BP_low) + AQI_low
Overall AQI = max(all sub-indices)
Dominant Pollutant = pollutant with the highest sub-index
```

### 2.3 Live Air Quality Monitoring

**Data Source:** Open-Meteo Air Quality API  
**Parameters:** PM2.5, PM10, NO2, SO2, CO, O3, Ammonia, UV Index, Dust  
**Hourly Data:** 168 hours (7 days) of forecast data for trend charts

### 2.4 RAG Chatbot (Retrieval-Augmented Generation)

**Knowledge Base:** 5 WHO/EPA PDFs on air pollution health effects  
**Pipeline:**
1. PDF parsing with PyMuPDF
2. Text chunking: 1500 chars/chunk, 150 char overlap
3. Embedding: SentenceTransformer all-MiniLM-L6-v2 (384 dimensions)
4. Vector storage: FAISS IndexFlatL2 (~2887 vectors)
5. Retrieval: Top-3 semantically similar chunks per query
6. Generation: Gemini 3 Flash Preview with AQI context injection
7. Disk caching for instant restarts

### 2.5 Frontend Dashboard

- Live AQI gauge (semi-circular SVG)
- 9 pollutant cards
- Hourly PM2.5 trend chart (Recharts)
- City selector with 30+ Indian cities
- Interactive India map with Leaflet + search bar
- Dark/Light theme toggle

---

## 3. Month 2: Intelligence & Integration

### 3.1 Anomaly Detection System

**Dual-Gate Detection (both must trigger):**
1. Isolation Forest anomaly score < threshold (unsupervised)
2. Z-score > 2.5 (observed - seasonal_mean > 2.5 * seasonal_std)

**Root Cause Classification:**
- FESTIVAL: Date matches Indian festival calendar
- CROP_BURNING: Oct-Nov + NW wind + high PM2.5/PM10 ratio
- INDUSTRIAL: Elevated SO2 > 30 during working hours
- TRAFFIC: Peak hours + high NO2 > 80
- WEATHER_TRAPPED: Wind < 2 m/s + humidity > 80%

### 3.2 Safe Route Navigation

**Scoring Formula:**
```
Route Score = (PM2.5_norm * W_pm25) + (NO2_norm * W_no2) + (Report_penalty * W_report) + (Anomaly_penalty * W_anomaly)
```

**Health-Based Weight Profiles:**

| Condition | PM2.5 | NO2 | Report | Anomaly |
|-----------|-------|-----|--------|---------|
| Healthy | 0.35 | 0.20 | 0.25 | 0.20 |
| Asthma/COPD | 0.50 | 0.15 | 0.20 | 0.15 |
| Heart Disease | 0.25 | 0.40 | 0.20 | 0.15 |
| Pregnant | 0.40 | 0.25 | 0.20 | 0.15 |

### 3.3 Personalized AQI Threshold

**Formula:**
```
Personal Threshold = 150 / (1 + SUM(risk_multipliers))
```

| Condition | Multiplier |
|-----------|-----------|
| Asthma | 1.8 |
| Heart Disease | 1.6 |
| COPD | 1.9 |
| Diabetes | 1.3 |
| Pregnant | 1.5 |

**Example:** Asthma (1.8) + Diabetes (1.3) = Threshold 36.6 AQI

### 3.4 Community Trust Engine

**Formula:**
```
Score = 0.5 + AccountAge(+0.1) + Accuracy(+0.1/verified, max 0.3) + Upvotes(+0.05/avg, max 0.2)
Spam: >5 reports/hour = score 0.0
```

### 3.5 Pollution Data Fusion

```
Satellite(60%) + Verified_Reports(35%) + Unverified(5%)
```

### 3.6 Google Earth Engine (Sentinel-5P NO2)

**IDW Interpolation:**
```
NO2(x,y) = SUM(w_i * v_i) / SUM(w_i)
w_i = 1 / d_i^2
```

### 3.7 Push Notifications (Firebase)

Trigger: anomaly detected -> send FCM multicast to city subscribers

### 3.8 Daily Report Cards

PIL-based 1080x1920 PNG with personalized health tips, scheduled at 7 AM

---

## 4. Algorithm Descriptions & Mathematical Foundations

### 4.1 XGBoost Regressor

**Purpose:** Predict future PM2.5  
**Why:** Handles non-linear patterns, robust to overfitting, fast training  
**Parameters:** 200 trees, lr=0.05, depth=6, subsample=0.8  
**Features:** hour, day, month, weekday, lag1, lag2, lag24, rolling_mean_24, no2_satellite

### 4.2 Isolation Forest

**Purpose:** Detect anomalous pollution spikes  
**Why:** Unsupervised, efficient, natural anomaly scoring  
**How:** Anomalies need fewer splits to isolate = shorter path = lower score  
**Parameters:** 200 trees, contamination=5%

### 4.3 FAISS IndexFlatL2

**Purpose:** Semantic search over PDF chunks  
**Why:** Exact nearest-neighbor, fast, disk-serializable  
**Metric:** L2 (Euclidean) distance between 384-dim vectors

### 4.4 OSRM + Hazard Avoidance

**Purpose:** Generate safe routes avoiding pollution  
**How:** 8 compass directions * 3 distances, snap to road, verify avoidance (350m)

### 4.5 Haversine Formula

```
a = sin2(dlat/2) + cos(lat1)*cos(lat2)*sin2(dlon/2)
distance = 2 * R * asin(sqrt(a))
```

---

## 5. System Architecture

```
Frontend (React + Vite + Leaflet + Recharts)
  |
  v  REST API (HTTP)
  |
Backend (Flask + Python)
  |--- SQLite (reports.db, anomalies.db)
  |--- Open-Meteo API (Live AQI)
  |--- OSRM (Routing)
  |--- Google Earth Engine (Satellite NO2)
  |--- Gemini API (AI Chatbot)
  |--- Firebase (Push Notifications)
```

---

## 6. Database Design

### reports.db
- users, user_profiles, health_conditions, user_health_conditions
- user_locations, user_saved_locations, user_activities
- pollution_reports, report_upvotes, user_trust_scores
- pollution_anomalies

### anomalies.db
- anomaly_events (city, observed, expected, cause, confidence)
- fcm_tokens (push notification registration)

---

## 7. API Endpoints Summary

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /api/air-quality | Live AQI |
| POST | /api/train | Train ML models |
| POST | /api/predict | PM2.5 forecast |
| POST | /api/chat | RAG chatbot |
| POST | /api/routes/safe-navigate | Safe routing |
| POST | /api/satellite-aqi | GEE data |
| POST | /api/anomalies/check | Anomaly check |
| GET/POST | /api/reports | Community reports |
| GET/PUT | /api/profile/ | User profile |

---

## 8. Performance & Metrics

| Metric | Value |
|--------|-------|
| XGBoost RMSE | ~31 ug/m3 |
| XGBoost R2 | 0.88 |
| RAG Build Time | 2-3 min (first), <2s (cached) |
| Chatbot Latency | 3-8 sec |
| Route Calculation | 3-7 sec |
| FAISS Vectors | ~2887 |
| Cities Covered | 30+ |

---

## 9. Future Scope

1. Mobile App (React Native)
2. Real-time Traffic Integration
3. Multi-modal Transit Routing
4. Voice Navigation
5. Predictive Anomalies (LSTM)
6. Wearable Integration
7. Government CPCB API Integration

---

**Prepared by:** AirGuard Development Team  
**Last Updated:** June 2026

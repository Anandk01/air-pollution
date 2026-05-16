# AirGuard: Personalized Air Quality & Health Advisory Platform
**MVP Project Summary & Technical Architecture**

## 1. Project Overview
A comprehensive, hyper-personalized web application designed to monitor air quality, predict future pollution levels, and provide tailored health advice. Unlike generic weather apps, this system adapts to the user's specific health profile (e.g., Asthma, COPD), recalculating safety thresholds, customizing AI chatbot advice, and routing them away from hyper-local pollution anomalies.

## 2. Technology Stack
*   **Frontend**: React.js (Vite), React-Leaflet (Maps), Recharts (Data Visualization), Vanilla CSS (Glassmorphism UI).
*   **Backend**: Python (Flask).
*   **Database**: SQLite (Multiple normalized databases for Profiles, Reports, and ML caching).
*   **Machine Learning**: XGBoost (Time-series forecasting), Isolation Forest (Anomaly detection).
*   **AI & NLP**: Google Gemini 1.5 Flash, FAISS (Vector Database), SentenceTransformers (`all-MiniLM-L6-v2`).
*   **External APIs**: Open-Meteo (Live AQI), OSRM + Nominatim (Dynamic Routing & Geocoding), Google Earth Engine (Satellite NO₂).

---

## 3. Core Features (The "MVP")

### A. Hyper-Personalized Health Profiles
*   Users input their vitals (Age, BMI) and select medical conditions (Asthma, Heart Disease, Pregnancy).
*   **Dynamic Thresholding**: The backend calculates a personalized AQI limit using a risk multiplier formula: `150 / (1 + Σ risk_multipliers)`. If a user has Asthma, their "Safe Limit" drops from a generic 150 to a strict 53.6 AQI.

### B. Safe Route Planner (Pollution-Aware Navigation)
*   Accepts dynamic start/end locations via Nominatim Geocoding.
*   Fetches real road networks using OSRM (Open Source Routing Machine).
*   **Exposure Scoring Algorithm**: Divides the route into 100m segments, queries the database for active community pollution reports within a 500m radius, and fuses this with satellite NO₂ data to calculate a total "Exposure Score". Renders the safest route in green on the Leaflet map.

### C. ML-Powered Prediction & Anomaly Detection
*   **XGBoost Pipeline**: Users/Admins can upload historical CSV datasets. The backend automatically extracts time-based features (rolling means, diurnal sine/cosine curves) and trains an XGBoost Regressor to predict AQI 1h, 6h, and 24h into the future.
*   **Isolation Forest**: Monitors live data feeds to detect statistical anomalies (e.g., sudden industrial emission spikes) and flags them on the Anomaly Dashboard.

### D. Community Pollution Reporting
*   Users can drop pins on the map to report hyper-local issues (Garbage Fires, Construction Dust, Industrial Exhaust).
*   Admin moderation dashboard allows verification of reports. Verified reports carry a 35% penalty weight in the Safe Route Planner, instantly re-routing users away from the hazard.

### E. Medical AI Chatbot (RAG System)
*   A specialized health advisor powered by Gemini.
*   **RAG (Retrieval-Augmented Generation)**: Ingests heavy WHO medical PDFs into a FAISS vector database. When a user asks a question, it semantically retrieves medical facts.
*   **Context Injection**: The AI is silently fed the user's live city AQI, personalized threshold, and health conditions, allowing it to give hyper-specific advice (e.g., "Take your inhaler") without the user explaining their situation.

### F. Daily Report Cards
*   Automated daily generation of high-resolution PNG infographics using the `Pillow` library.
*   Combines current AQI, personal risk thresholds, and medical tips.
*   Shareable directly to WhatsApp or Instagram Stories.

---

## 4. Backend API Routes

### Authentication & Profiles (`profile_service.py`)
*   `GET /api/profile` - Fetches unified user profile, locations, and schedules.
*   `PUT /api/profile` - Updates vitals and auto-calculates BMI.
*   `POST /api/profile/conditions` - Toggles medical conditions and immediately recalculates the Personal AQI Threshold.
*   `GET /api/profile/report-card` - Generates and downloads the custom PNG infographic.

### Machine Learning & Analytics (`app.py`)
*   `GET /api/air-quality` - Fetches live pollutant arrays (PM2.5, PM10, NO₂, Ozone) via Open-Meteo.
*   `POST /api/upload` - Handles raw CSV ingestion and preprocessing.
*   `POST /api/train` - Triggers feature engineering and trains the XGBoost model.
*   `POST /api/predict` - Executes inference on the trained XGBoost model for future forecasting.
*   `POST /api/predict-with-anomaly` - Runs the Isolation Forest against current metrics to flag spikes.

### Safe Routing (`route_pollution_service.py`)
*   `POST /api/routes/analyze` - Receives coordinates, fetches OSRM alternatives, executes the 100m segmentation/scoring algorithm, and returns color-coded segments and exposure scores.

### Community & Admin (`reports_api.py`, `admin_api.py`)
*   `POST /api/reports` - Submit a crowd-sourced pollution event.
*   `GET /api/reports` - Fetch active events for map rendering.
*   `POST /api/admin/reports/<id>/verify` - Admin endpoint to increase the hazard weight of a report.

### AI Chatbot (`rag_engine.py`)
*   `POST /api/chat` - Combines FAISS retrieved chunks, user profile context, and the user prompt, sending it to Google Gemini for a casual, formatted response.

---

## 5. Machine Learning Models Trained
1.  **XGBoost Regressor (Predictive Forecasting)**
    *   **Features Used**: `pm2_5`, `pm10`, `nitrogen_dioxide`, `temperature`, `humidity`, `hour_sin`, `hour_cos`, `day_of_week`.
    *   **Target**: Future AQI.
    *   **Pipeline**: Handled via `scikit-learn` standard scalers and saved as `.pkl` artifacts.
2.  **Isolation Forest (Anomaly Detection)**
    *   **Purpose**: Unsupervised learning model to detect outlier data points that deviate from historical norms (e.g., a sudden 400% spike in localized SO₂).
3.  **SentenceTransformer (all-MiniLM-L6-v2)**
    *   **Purpose**: NLP embedding model. Converts chunks of WHO medical PDFs into high-dimensional vectors to allow the chatbot to perform semantic search via FAISS.

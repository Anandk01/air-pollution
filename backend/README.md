# Smart Air Quality Monitoring and Health Advisory Chatbot — Backend

A Python Flask REST API serving as the backend for the Smart Air Quality Monitoring and Health Advisory Chatbot. It integrates live data from the Open-Meteo Air Quality API, calculates AQI using CPCB standards, and provides a RAG (Retrieval-Augmented Generation) chatbot powered by environmental/health PDFs.

## Setup & Run

### 1. Create a virtual environment (recommended)

```bash
cd backend
python -m venv venv
```

### 2. Activate the virtual environment

**Windows (PowerShell)**
```powershell
venv\Scripts\Activate.ps1
```

**macOS / Linux**
```bash
source venv/bin/activate
```

### 3. Install dependencies

```bash
pip install -r requirements.txt
```

### 4. Configure environment variables

Create a `.env` file in the `backend/` directory:

```env
GEMINI_API_KEY=your_gemini_api_key_here
```

You can get a free Gemini API key from [Google AI Studio](https://aistudio.google.com/app/apikey).

### 5. Run the Flask server

```bash
python app.py
```

The API will be available at: **http://localhost:5000**

---

## RAG Chatbot Setup

The chatbot uses Retrieval-Augmented Generation (RAG) to answer air quality and health questions.

**Knowledge base:** 5 PDFs located in `RAG_knowladgeBase/`:
- `452combined.pdf`
- `9789240034228-eng.pdf`
- `air1.pdf`
- `Air_Pollution_Handbook.pdf`
- `Handbook of Air Pollution Prevention and Control.pdf`

**How it works:**
1. On the first `/api/chat` request, the FAISS vector index is built automatically by loading all PDFs, chunking the text, and embedding with `sentence-transformers` (`all-MiniLM-L6-v2`).
2. Subsequent requests use the cached index for fast retrieval.
3. Retrieved chunks + live AQI context are sent to **Gemini 1.5 Flash** to generate a health advisory response.

> **Note:** Building the index on first request may take 30–60 seconds depending on your machine. Subsequent requests are fast.

---

## API Endpoints

### Live Air Quality

| Method | Route | Description |
|--------|-------|-------------|
| `GET` | `/api/air-quality` | Fetch live pollutant data from Open-Meteo + compute CPCB AQI |
| `GET` | `/api/cities` | List of 25+ Indian cities with lat/lon coordinates |

#### `GET /api/air-quality`

**Query parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `lat` | float | Yes | Latitude of the location |
| `lon` | float | Yes | Longitude of the location |
| `city` | string | No | City name (used for labelling the response) |

**Example:**
```bash
curl "http://localhost:5000/api/air-quality?lat=28.6139&lon=77.2090&city=Delhi"
```

**Response:**
```json
{
  "city": "Delhi",
  "latitude": 28.6139,
  "longitude": 77.209,
  "current": {
    "pm2_5": 95.2,
    "pm10": 140.3,
    "nitrogen_dioxide": 42.1,
    "sulphur_dioxide": 12.4,
    "carbon_monoxide": 890.0,
    "ozone": 38.2,
    "ammonia": 5.1,
    "uv_index": 3.2,
    "dust": 22.0
  },
  "aqi": 312,
  "aqi_category": "Very Poor",
  "dominant_pollutant": "PM2.5",
  "sub_indices": { "pm25": 312, "pm10": 180 },
  "hourly": { "time": [...], "pm2_5": [...], "pm10": [...] }
}
```

#### `GET /api/cities`

Returns a list of 25+ major Indian cities with their coordinates.

**Example:**
```bash
curl "http://localhost:5000/api/cities"
```

**Response:**
```json
[
  { "name": "Delhi",   "lat": 28.6139, "lon": 77.209 },
  { "name": "Mumbai",  "lat": 19.076,  "lon": 72.8777 },
  ...
]
```

---

### RAG Chatbot

| Method | Route | Description |
|--------|-------|-------------|
| `POST` | `/api/chat` | RAG chatbot — health advisory from PDF knowledge base + live AQI context |

#### `POST /api/chat`

**Request body:**
```json
{
  "message": "Is it safe to go outside today?",
  "city": "Delhi",
  "aqi_data": {
    "aqi": 312,
    "aqi_category": "Very Poor",
    "dominant_pollutant": "PM2.5",
    "current": { "pm2_5": 95.2, "pm10": 140.3 }
  }
}
```

**Response:**
```json
{
  "answer": "Given the current Very Poor AQI of 312 in Delhi...",
  "sources": ["Air_Pollution_Handbook.pdf", "air1.pdf"]
}
```

> **Requires:** `GEMINI_API_KEY` set in `.env`. The FAISS index is built automatically on the first request.

---

### AQI Calculator

| Method | Route | Description |
|--------|-------|-------------|
| `POST` | `/api/aqi-calculate` | Compute CPCB AQI from manually entered pollutant values |

#### `POST /api/aqi-calculate`

Calculates AQI using CPCB sub-index breakpoints. The overall AQI is the maximum sub-index across all pollutants.

**Request body:**
```json
{
  "pm25": 90.0,
  "pm10": 140.0,
  "no2": 45.0,
  "so2": 18.0,
  "co": 1.4,
  "o3": 32.0
}
```

**Response:**
```json
{
  "success": true,
  "aqi": 280,
  "category": "Poor",
  "dominant_pollutant": "PM2.5",
  "health_advice": "Avoid prolonged outdoor exertion...",
  "sub_indices": { "pm25": 280, "pm10": 175, "no2": 60 }
}
```

---

### ML Prediction (Existing)

| Method | Route | Description |
|--------|-------|-------------|
| `POST` | `/api/upload` | Upload a CSV dataset |
| `POST` | `/api/train` | Train ML models (LinearRegression, RandomForest, XGBoost) |
| `POST` | `/api/predict` | Rolling PM2.5 forecast for 1h / 6h / 24h horizon |
| `GET`  | `/api/analytics` | Historical analytics from uploaded dataset |
| `GET`  | `/api/export-report` | Download a PDF report |
| `GET`  | `/api/health` | Health check — `{"status": "ok"}` |

---

## AQI Category Reference (CPCB Standard)

| Category | AQI Range | Color |
|----------|-----------|-------|
| Good | 0–50 | Green `#00b050` |
| Satisfactory | 51–100 | Light Green `#92d050` |
| Moderate | 101–200 | Amber `#ffbf00` |
| Poor | 201–300 | Red `#ff0000` |
| Very Poor | 301–400 | Purple `#7030a0` |
| Severe | 401–500 | Maroon `#c00000` |

---

## Example: Full Flow

```bash
# 1. Fetch live AQI for Delhi
curl "http://localhost:5000/api/air-quality?lat=28.6139&lon=77.2090&city=Delhi"

# 2. Ask the chatbot about health precautions
curl -X POST http://localhost:5000/api/chat \
  -H "Content-Type: application/json" \
  -d '{"message":"What precautions should I take?","city":"Delhi","aqi_data":{"aqi":312,"aqi_category":"Very Poor"}}'

# 3. Calculate AQI from manual pollutant readings
curl -X POST http://localhost:5000/api/aqi-calculate \
  -H "Content-Type: application/json" \
  -d '{"pm25":90,"pm10":140,"no2":45,"so2":18,"co":1.4,"o3":32}'

# 4. Health check
curl http://localhost:5000/api/health
```

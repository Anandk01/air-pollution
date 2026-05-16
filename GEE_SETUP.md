# Google Earth Engine Service Account Setup

To enable satellite data integration, you must set up a Google Earth Engine service account. Follow these steps:

## 1. Create a Service Account
1.  Go to the [Google Cloud Console](https://console.cloud.google.com/).
2.  Select your project (or create a new one).
3.  Navigate to **IAM & Admin > Service Accounts**.
4.  Click **+ CREATE SERVICE ACCOUNT**.
5.  Give it a name (e.g., `gee-air-pollution`).
6.  Skip the optional role assignment and click **DONE**.

## 2. Generate a JSON Key
1.  Click on the newly created service account.
2.  Go to the **Keys** tab.
3.  Click **ADD KEY > Create new key**.
4.  Select **JSON** and click **CREATE**.
5.  Download the JSON file and save it in your project's `backend` directory.
6.  Rename it to `gee-credentials.json` (or any name you prefer).

## 3. Enable Earth Engine API
1.  Go to the [Earth Engine Cloud Project Setup](https://code.earthengine.google.com/register).
2.  Register your Google Cloud project for Earth Engine access.
3.  Ensure the **Google Earth Engine API** is enabled in the Google Cloud Console for your project.

## 4. Grant Access to Service Account
1.  Note the **Service Account Email** (e.g., `gee-air-pollution@your-project.iam.gserviceaccount.com`).
2.  In the [Google Cloud Console](https://console.cloud.google.com/), ensure the Earth Engine API is enabled.
3.  For GEE access, you may need to register the service account at [https://signup.earthengine.google.com/#!/service_accounts](https://signup.earthengine.google.com/#!/service_accounts).

## 5. Configure Environment Variables
Add the following to your `backend/.env` file:

```env
GEE_SERVICE_ACCOUNT=gee-air-pollution@your-project.iam.gserviceaccount.com
GEE_SERVICE_ACCOUNT_FILE=gee-credentials.json
```

## 6. Install Dependencies
Ensure you have the latest dependencies installed:
```bash
pip install -r requirements.txt
```

---
**Note:** The system will automatically fall back to ground-station features if the GEE credentials are not configured or if cloud cover prevents data retrieval.

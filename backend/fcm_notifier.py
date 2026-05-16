"""
fcm_notifier.py
===============
Firebase Cloud Messaging push notifications for anomaly alerts.
Credentials are loaded from .env (FCM_SERVICE_ACCOUNT_PATH) or fall back
to the service account JSON file in the backend directory.
"""

import os
import logging

log = logging.getLogger(__name__)

# Absolute fallback path — the downloaded service account key
_DEFAULT_SA_PATH = os.path.join(
    os.path.dirname(__file__),
    "air-pollution-3499a-firebase-adminsdk-fbsvc-9ae55041b4.json",
)

_fcm_app = None
_fcm_available = False


def _init_fcm():
    global _fcm_app, _fcm_available
    if _fcm_available:
        return True
    try:
        import firebase_admin
        from firebase_admin import credentials

        # Prefer .env value, fall back to the file sitting next to app.py
        sa_path = os.getenv("FCM_SERVICE_ACCOUNT_PATH", "").strip() or _DEFAULT_SA_PATH

        if not os.path.exists(sa_path):
            log.warning(
                "FCM service account key not found at: %s\n"
                "Push notifications will be skipped.",
                sa_path,
            )
            return False

        cred = credentials.Certificate(sa_path)

        if not firebase_admin._apps:
            _fcm_app = firebase_admin.initialize_app(cred)
        else:
            _fcm_app = firebase_admin.get_app()

        _fcm_available = True
        log.info("Firebase Admin SDK initialised with: %s", os.path.basename(sa_path))
        return True

    except ImportError:
        log.warning(
            "firebase-admin not installed. "
            "Run: pip install firebase-admin   Push notifications will be skipped."
        )
        return False
    except Exception as exc:
        log.error("FCM init failed: %s", exc)
        return False


def send_anomaly_alert(
    tokens: list[str],
    city: str,
    cause_label: str,
    cause_confidence: float,
    observed_aqi: float,
    expected_aqi: float,
    duration_hint: str = "6-12 hours",
) -> dict:
    """
    Send a push notification to a list of FCM tokens.

    Returns {"sent": int, "failed": int, "skipped": bool}
    """
    if not tokens:
        return {"sent": 0, "failed": 0, "skipped": False}

    if not _init_fcm():
        return {"sent": 0, "failed": 0, "skipped": True}

    try:
        from firebase_admin import messaging

        cause_display = cause_label.replace("_", " ").title()
        confidence_pct = int(cause_confidence * 100)

        title = f"⚠️ Unusual Pollution Spike — {city}"
        body = (
            f"Cause: {cause_display} ({confidence_pct}% confidence). "
            f"Current AQI: {int(observed_aqi)} (expected: {int(expected_aqi)}). "
            f"Expected duration: {duration_hint}."
        )

        message = messaging.MulticastMessage(
            tokens=tokens,
            notification=messaging.Notification(title=title, body=body),
            data={
                "city":             city,
                "cause_label":      cause_label,
                "cause_confidence": str(cause_confidence),
                "observed_aqi":     str(observed_aqi),
                "expected_aqi":     str(expected_aqi),
                "type":             "anomaly_alert",
            },
            android=messaging.AndroidConfig(priority="high"),
            apns=messaging.APNSConfig(
                payload=messaging.APNSPayload(
                    aps=messaging.Aps(sound="default", badge=1)
                )
            ),
        )

        response = messaging.send_each_for_multicast(message)
        log.info(
            "FCM sent %d/%d for %s anomaly alert",
            response.success_count, len(tokens), city,
        )
        return {
            "sent":    response.success_count,
            "failed":  response.failure_count,
            "skipped": False,
        }

    except Exception as exc:
        log.error("FCM send failed: %s", exc)
        return {"sent": 0, "failed": len(tokens), "skipped": False}

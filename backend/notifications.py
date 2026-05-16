from flask import Blueprint, jsonify, request
import logging

log = logging.getLogger(__name__)

push_bp = Blueprint("push", __name__)

# Temporary in-memory storage for notifications
# In a real app, this would be a DB table
notifications_db = []

def add_notification(title, body, type="info", metadata=None):
    from datetime import datetime, timezone
    notif = {
        "id": len(notifications_db) + 1,
        "title": title,
        "body": body,
        "type": type,
        "metadata": metadata or {},
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "read": False
    }
    notifications_db.append(notif)
    return notif

@push_bp.route("/", methods=["GET"])
def get_notifications():
    """Returns all notifications for the user."""
    return jsonify(sorted(notifications_db, key=lambda x: x["timestamp"], reverse=True))

@push_bp.route("/mark-read", methods=["POST"])
def mark_read():
    data = request.json
    notif_id = data.get("id")
    for n in notifications_db:
        if n["id"] == notif_id:
            n["read"] = True
            break
    return jsonify({"success": True})

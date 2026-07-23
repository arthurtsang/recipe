import base64
import json
import os

import functions_framework
from cloudevents.http import CloudEvent
from googleapiclient import discovery


@functions_framework.cloud_event
def handle(cloud_event: CloudEvent):
    """At >=100% budget, unlink billing from TARGET_PROJECT_ID only."""
    data = cloud_event.data or {}
    message = data.get("message") or {}
    raw = message.get("data")
    if not raw:
        print("No message data; ignoring")
        return "ignored"

    payload = json.loads(base64.b64decode(raw).decode("utf-8"))
    # Billing budget Pub/Sub schema v1.0
    cost = (
        payload.get("costAmount")
        or payload.get("cost_amount")
        or (payload.get("budgetDisplayName") and payload)
    )
    # Prefer threshold percent from notification
    alert = payload.get("alertThresholdExceeded") or payload.get("alert_threshold_exceeded")
    cost_amount = payload.get("costAmount")
    budget_amount = payload.get("budgetAmount")

    print(f"Budget notification: alertThresholdExceeded={alert} cost={cost_amount} budget={budget_amount}")

    # Only act at 100% (threshold 1.0). Email alerts fire at 50/90 without kill.
    if alert is not None:
        try:
            if float(alert) < 1.0:
                print("Below 100% threshold; not disabling billing")
                return "skipped"
        except (TypeError, ValueError):
            pass
    elif cost_amount is not None and budget_amount is not None:
        try:
            if float(cost_amount) < float(budget_amount):
                print("Cost under budget; not disabling billing")
                return "skipped"
        except (TypeError, ValueError):
            pass
    else:
        # Unknown shape — do not kill blindly
        print(f"Unrecognized budget payload keys: {list(payload.keys())}")
        return "ignored"

    project_id = os.environ["TARGET_PROJECT_ID"]
    billing = discovery.build("cloudbilling", "v1", cache_discovery=False)
    name = f"projects/{project_id}"
    body = {"billingAccountName": ""}  # unlink
    result = billing.projects().updateBillingInfo(name=name, body=body).execute()
    print(f"Disabled billing for {project_id}: {result}")
    return "disabled"

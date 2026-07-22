import base64
import json
import os

import functions_framework
from cloudevents.http import CloudEvent
from google.cloud import run_v2


@functions_framework.cloud_event
def handle(cloud_event: CloudEvent):
    """Pub/Sub message → Cloud Run Jobs execute with JOB_ID override."""
    data = cloud_event.data or {}
    message = data.get("message") or {}
    raw = message.get("data")
    if not raw:
        raise ValueError("Pub/Sub message missing data")

    payload = json.loads(base64.b64decode(raw).decode("utf-8"))
    job_id = payload.get("jobId") or payload.get("job_id")
    if not job_id:
        raise ValueError(f"Missing jobId in payload: {payload!r}")

    target = (payload.get("target") or "prod").lower()
    project = os.environ["GCP_PROJECT"]
    location = os.environ["JOB_LOCATION"]
    if target in ("dev", "preview"):
        job_name = os.environ.get("JOB_NAME_DEV") or os.environ["JOB_NAME"]
    else:
        job_name = os.environ["JOB_NAME"]

    client = run_v2.JobsClient()
    name = f"projects/{project}/locations/{location}/jobs/{job_name}"

    request = run_v2.RunJobRequest(
        name=name,
        overrides=run_v2.RunJobRequest.Overrides(
            container_overrides=[
                run_v2.RunJobRequest.Overrides.ContainerOverride(
                    env=[run_v2.EnvVar(name="JOB_ID", value=str(job_id))],
                )
            ]
        ),
    )
    operation = client.run_job(request=request)
    print(
        f"Started Cloud Run Job {job_name} for ImportJob {job_id} "
        f"(target={target}): {operation.operation.name}"
    )
    return "ok"

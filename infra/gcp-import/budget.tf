# $10/mo budget + Pub/Sub notifications → kill switch unlinks THIS project only

resource "google_billing_budget" "cap" {
  billing_account = var.billing_account_id
  display_name    = "kung-fu-mgmt-system $10/mo cap"

  budget_filter {
    projects = ["projects/${data.google_project.current.number}"]
  }

  amount {
    specified_amount {
      currency_code = "USD"
      units         = tostring(floor(var.budget_amount_usd))
    }
  }

  threshold_rules {
    threshold_percent = 0.5
  }
  threshold_rules {
    threshold_percent = 0.9
  }
  threshold_rules {
    threshold_percent = 1.0
  }

  all_updates_rule {
    pubsub_topic                     = google_pubsub_topic.budget_kill.id
    schema_version                   = "1.0"
    monitoring_notification_channels = []
    disable_default_iam_recipients    = false
  }

  depends_on = [google_project_service.apis]
}

data "archive_file" "budget_kill" {
  type        = "zip"
  source_dir  = "${path.module}/functions/budget_kill"
  output_path = "${path.module}/.build/budget_kill.zip"
}

resource "google_storage_bucket_object" "budget_kill" {
  name   = "budget_kill-${data.archive_file.budget_kill.output_md5}.zip"
  bucket = google_storage_bucket.gcf_source.name
  source = data.archive_file.budget_kill.output_path
}

resource "google_project_iam_member" "budget_kill_billing" {
  project = var.project_id
  role    = "roles/billing.projectManager"
  member  = "serviceAccount:${google_service_account.budget_kill.email}"
}

# Billing account level: needed to unlink project billing
resource "google_billing_account_iam_member" "budget_kill_admin" {
  billing_account_id = var.billing_account_id
  role               = "roles/billing.admin"
  member             = "serviceAccount:${google_service_account.budget_kill.email}"
}

# Cloud Functions Gen2 / Cloud Build must impersonate runtime SAs
resource "google_service_account_iam_member" "budget_kill_sa_user_compute" {
  service_account_id = google_service_account.budget_kill.name
  role               = "roles/iam.serviceAccountUser"
  member             = "serviceAccount:${data.google_project.current.number}-compute@developer.gserviceaccount.com"
}

resource "google_service_account_iam_member" "budget_kill_sa_user_cloudbuild" {
  service_account_id = google_service_account.budget_kill.name
  role               = "roles/iam.serviceAccountUser"
  member             = "serviceAccount:${data.google_project.current.number}@cloudbuild.gserviceaccount.com"
}

resource "google_cloudfunctions2_function" "budget_kill" {
  name     = "metrobistro-budget-kill"
  location = var.region

  build_config {
    runtime     = "python312"
    entry_point = "handle"
    source {
      storage_source {
        bucket = google_storage_bucket.gcf_source.name
        object = google_storage_bucket_object.budget_kill.name
      }
    }
  }

  service_config {
    max_instance_count    = 1
    available_memory      = "256Mi"
    timeout_seconds       = 60
    service_account_email = google_service_account.budget_kill.email
    environment_variables = {
      TARGET_PROJECT_ID     = var.project_id
      TARGET_PROJECT_NUMBER = data.google_project.current.number
      BILLING_ACCOUNT_ID    = var.billing_account_id
    }
  }

  event_trigger {
    trigger_region = var.region
    event_type     = "google.cloud.pubsub.topic.v1.messagePublished"
    pubsub_topic   = google_pubsub_topic.budget_kill.id
    retry_policy   = "RETRY_POLICY_DO_NOT_RETRY"
  }

  depends_on = [
    google_project_service.apis,
    google_project_iam_member.budget_kill_billing,
    google_billing_account_iam_member.budget_kill_admin,
  ]
}

locals {
  apis = [
    "run.googleapis.com",
    "pubsub.googleapis.com",
    "artifactregistry.googleapis.com",
    "cloudbuild.googleapis.com",
    "secretmanager.googleapis.com",
    "eventarc.googleapis.com",
    "cloudbilling.googleapis.com",
    "iam.googleapis.com",
    "iamcredentials.googleapis.com",
    "sts.googleapis.com",
    "cloudfunctions.googleapis.com",
    "billingbudgets.googleapis.com",
    "cloudresourcemanager.googleapis.com",
  ]

  ar_repo     = "metrobistro"
  topic_name  = "metrobistro-import-jobs"
  pool_id     = "vercel"
  provider_id = "vercel"

  publisher_sa_id = "metrobistro-import-publisher"
  runner_sa_id    = "metrobistro-import-runner"
  exec_sa_id      = "metrobistro-job-executor"
  kill_sa_id      = "metrobistro-budget-kill"

  default_image = "${var.region}-docker.pkg.dev/${var.project_id}/${local.ar_repo}/import-worker:latest"
  worker_image  = var.worker_image != "" ? var.worker_image : local.default_image

  # Vercel OIDC subject: owner:TEAM:project:NAME:environment:ENV
  vercel_oidc_issuer = "https://oidc.vercel.com/${var.vercel_team_slug}"
}

resource "google_project_service" "apis" {
  for_each                   = toset(local.apis)
  project                    = var.project_id
  service                    = each.value
  disable_on_destroy         = false
  disable_dependent_services = false
}

resource "google_artifact_registry_repository" "metrobistro" {
  location      = var.region
  repository_id = local.ar_repo
  description   = "MetroBistro import worker images"
  format        = "DOCKER"
  depends_on    = [google_project_service.apis]
}

resource "google_pubsub_topic" "import_jobs" {
  name       = local.topic_name
  depends_on = [google_project_service.apis]
}

resource "google_pubsub_topic" "budget_kill" {
  name       = "billing-budget-kill"
  depends_on = [google_project_service.apis]
}

# --- Secrets (ids only; values added out-of-band) ---
resource "google_secret_manager_secret" "database_url" {
  secret_id = "metrobistro-database-url"
  replication {
    auto {}
  }
  depends_on = [google_project_service.apis]
}

# Dev / Vercel Preview — Supabase Dev, metrobistro schema (prod public untouched)
resource "google_secret_manager_secret" "database_url_dev" {
  secret_id = "metrobistro-database-url-dev"
  replication {
    auto {}
  }
  depends_on = [google_project_service.apis]
}

resource "google_secret_manager_secret" "nvidia_api_key" {
  secret_id = "metrobistro-nvidia-api-key"
  replication {
    auto {}
  }
  depends_on = [google_project_service.apis]
}

resource "google_secret_manager_secret" "groq_api_key" {
  secret_id = "metrobistro-groq-api-key"
  replication {
    auto {}
  }
  depends_on = [google_project_service.apis]
}

# --- Service accounts ---
resource "google_service_account" "publisher" {
  account_id   = local.publisher_sa_id
  display_name = "MetroBistro Pub/Sub publisher (Vercel WIF)"
}

resource "google_service_account" "runner" {
  account_id   = local.runner_sa_id
  display_name = "MetroBistro Cloud Run Job runner"
}

resource "google_service_account" "executor" {
  account_id   = local.exec_sa_id
  display_name = "MetroBistro Pub/Sub → Job executor function"
}

resource "google_service_account" "budget_kill" {
  account_id   = local.kill_sa_id
  display_name = "MetroBistro budget kill switch"
}

resource "google_pubsub_topic_iam_member" "publisher_publish" {
  topic  = google_pubsub_topic.import_jobs.name
  role   = "roles/pubsub.publisher"
  member = "serviceAccount:${google_service_account.publisher.email}"
}

resource "google_secret_manager_secret_iam_member" "runner_db" {
  secret_id = google_secret_manager_secret.database_url.id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.runner.email}"
}

resource "google_secret_manager_secret_iam_member" "runner_db_dev" {
  secret_id = google_secret_manager_secret.database_url_dev.id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.runner.email}"
}

resource "google_secret_manager_secret_iam_member" "runner_nvidia" {
  secret_id = google_secret_manager_secret.nvidia_api_key.id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.runner.email}"
}

resource "google_secret_manager_secret_iam_member" "runner_groq" {
  secret_id = google_secret_manager_secret.groq_api_key.id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.runner.email}"
}

# --- WIF (Vercel OIDC; no JWK upload) ---
resource "google_iam_workload_identity_pool" "vercel" {
  workload_identity_pool_id = local.pool_id
  display_name              = "Vercel"
  description               = "OIDC federation for Vercel deployments"
  depends_on                = [google_project_service.apis]
}

resource "google_iam_workload_identity_pool_provider" "vercel" {
  workload_identity_pool_id          = google_iam_workload_identity_pool.vercel.workload_identity_pool_id
  workload_identity_pool_provider_id = local.provider_id
  display_name                       = "Vercel OIDC"
  attribute_mapping = {
    "google.subject" = "assertion.sub"
  }
  oidc {
    issuer_uri        = local.vercel_oidc_issuer
    # JWK empty — GCP fetches JWKS from issuer discovery
    allowed_audiences = ["https://vercel.com/${var.vercel_team_slug}"]
  }
  attribute_condition = "assertion.sub.startsWith(\"owner:${var.vercel_team_slug}:project:${var.vercel_project_name}:\")"
}

# Vercel OIDC subjects: owner:TEAM:project:NAME:environment:ENV
resource "google_service_account_iam_member" "wif_subjects" {
  for_each = toset(["production", "preview"])
  service_account_id = google_service_account.publisher.name
  role               = "roles/iam.workloadIdentityUser"
  member             = "principal://iam.googleapis.com/${google_iam_workload_identity_pool.vercel.name}/subject/owner:${var.vercel_team_slug}:project:${var.vercel_project_name}:environment:${each.value}"
}

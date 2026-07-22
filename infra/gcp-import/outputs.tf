output "project_id" {
  value = var.project_id
}

output "project_number" {
  value = data.google_project.current.number
}

output "region" {
  value = var.region
}

output "pubsub_topic" {
  value = google_pubsub_topic.import_jobs.name
}

output "pubsub_topic_full" {
  value = google_pubsub_topic.import_jobs.id
}

output "cloud_run_job" {
  value = google_cloud_run_v2_job.import_worker.name
}

output "artifact_registry_repo" {
  value = "${var.region}-docker.pkg.dev/${var.project_id}/${local.ar_repo}"
}

output "worker_image" {
  value = local.worker_image
}

output "publisher_service_account" {
  value = google_service_account.publisher.email
}

output "runner_service_account" {
  value = google_service_account.runner.email
}

output "wif_pool" {
  value = google_iam_workload_identity_pool.vercel.name
}

output "wif_provider" {
  value = google_iam_workload_identity_pool_provider.vercel.name
}

output "gcp_audience" {
  value = "//iam.googleapis.com/${google_iam_workload_identity_pool_provider.vercel.name}"
}

output "vercel_env_hint" {
  value = <<-EOT
    GCP_PROJECT_ID=${var.project_id}
    GCP_PROJECT_NUMBER=${data.google_project.current.number}
    GCP_WORKLOAD_IDENTITY_POOL_ID=${local.pool_id}
    GCP_WORKLOAD_IDENTITY_POOL_PROVIDER_ID=${local.provider_id}
    GCP_SERVICE_ACCOUNT_EMAIL=${google_service_account.publisher.email}
    GCP_AUDIENCE=//iam.googleapis.com/${google_iam_workload_identity_pool_provider.vercel.name}
    GCP_PUBSUB_TOPIC=${google_pubsub_topic.import_jobs.name}
  EOT
}

output "budget_name" {
  value = google_billing_budget.cap.name
}

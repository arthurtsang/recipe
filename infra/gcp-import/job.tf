# Cloud Run Job — requires image already pushed to Artifact Registry
resource "google_cloud_run_v2_job" "import_worker" {
  name                = "metrobistro-import"
  location            = var.region
  deletion_protection = false

  template {
    template {
      service_account = google_service_account.runner.email
      timeout         = var.job_timeout
      max_retries     = 1

      containers {
        image   = local.worker_image
        command = ["python", "job_main.py"]

        resources {
          limits = {
            cpu    = var.job_cpu
            memory = var.job_memory
          }
        }

        env {
          name  = "IMPORT_SCHEMA"
          value = "public"
        }

        env {
          name = "DATABASE_URL"
          value_source {
            secret_key_ref {
              secret  = google_secret_manager_secret.database_url.secret_id
              version = "latest"
            }
          }
        }

        env {
          name = "NVIDIA_API_KEY"
          value_source {
            secret_key_ref {
              secret  = google_secret_manager_secret.nvidia_api_key.secret_id
              version = "latest"
            }
          }
        }

        env {
          name = "GROQ_API_KEY"
          value_source {
            secret_key_ref {
              secret  = google_secret_manager_secret.groq_api_key.secret_id
              version = "latest"
            }
          }
        }
      }
    }
  }

  depends_on = [
    google_project_service.apis,
    google_artifact_registry_repository.metrobistro,
    google_secret_manager_secret_iam_member.runner_db,
    google_secret_manager_secret_iam_member.runner_nvidia,
    google_secret_manager_secret_iam_member.runner_groq,
  ]

  lifecycle {
    ignore_changes = [
      client,
      client_version,
      template[0].template[0].containers[0].image,
    ]
  }
}

# Dev / Preview Job — same image, Dev DB secret, metrobistro schema
resource "google_cloud_run_v2_job" "import_worker_dev" {
  name                = "metrobistro-import-dev"
  location            = var.region
  deletion_protection = false

  template {
    template {
      service_account = google_service_account.runner.email
      timeout         = var.job_timeout
      max_retries     = 1

      containers {
        image   = local.worker_image
        command = ["python", "job_main.py"]

        resources {
          limits = {
            cpu    = var.job_cpu
            memory = var.job_memory
          }
        }

        env {
          name  = "IMPORT_SCHEMA"
          value = "metrobistro"
        }

        env {
          name = "DATABASE_URL"
          value_source {
            secret_key_ref {
              secret  = google_secret_manager_secret.database_url_dev.secret_id
              version = "latest"
            }
          }
        }

        env {
          name = "NVIDIA_API_KEY"
          value_source {
            secret_key_ref {
              secret  = google_secret_manager_secret.nvidia_api_key.secret_id
              version = "latest"
            }
          }
        }

        env {
          name = "GROQ_API_KEY"
          value_source {
            secret_key_ref {
              secret  = google_secret_manager_secret.groq_api_key.secret_id
              version = "latest"
            }
          }
        }
      }
    }
  }

  depends_on = [
    google_project_service.apis,
    google_artifact_registry_repository.metrobistro,
    google_secret_manager_secret_iam_member.runner_db_dev,
    google_secret_manager_secret_iam_member.runner_nvidia,
    google_secret_manager_secret_iam_member.runner_groq,
  ]

  lifecycle {
    ignore_changes = [
      client,
      client_version,
      template[0].template[0].containers[0].image,
    ]
  }
}

resource "google_cloud_run_v2_job_iam_member" "executor_run" {
  name     = google_cloud_run_v2_job.import_worker.name
  location = var.region
  role     = "roles/run.developer"
  member   = "serviceAccount:${google_service_account.executor.email}"
}

resource "google_cloud_run_v2_job_iam_member" "executor_run_dev" {
  name     = google_cloud_run_v2_job.import_worker_dev.name
  location = var.region
  role     = "roles/run.developer"
  member   = "serviceAccount:${google_service_account.executor.email}"
}

resource "google_service_account_iam_member" "executor_sa_user_compute" {
  service_account_id = google_service_account.executor.name
  role               = "roles/iam.serviceAccountUser"
  member             = "serviceAccount:${data.google_project.current.number}-compute@developer.gserviceaccount.com"
}

resource "google_service_account_iam_member" "executor_sa_user_cloudbuild" {
  service_account_id = google_service_account.executor.name
  role               = "roles/iam.serviceAccountUser"
  member             = "serviceAccount:${data.google_project.current.number}@cloudbuild.gserviceaccount.com"
}

# Pub/Sub → execute Cloud Run Job
data "archive_file" "execute_job" {
  type        = "zip"
  source_dir  = "${path.module}/functions/execute_job"
  output_path = "${path.module}/.build/execute_job.zip"
}

resource "google_storage_bucket" "gcf_source" {
  name                        = "${var.project_id}-metrobistro-gcf-source"
  location                    = var.region
  uniform_bucket_level_access = true
  force_destroy               = true
  depends_on                  = [google_project_service.apis]
}

resource "google_storage_bucket_object" "execute_job" {
  name   = "execute_job-${data.archive_file.execute_job.output_md5}.zip"
  bucket = google_storage_bucket.gcf_source.name
  source = data.archive_file.execute_job.output_path
}

resource "google_cloudfunctions2_function" "execute_job" {
  name     = "metrobistro-execute-import-job"
  location = var.region

  build_config {
    runtime     = "python312"
    entry_point = "handle"
    source {
      storage_source {
        bucket = google_storage_bucket.gcf_source.name
        object = google_storage_bucket_object.execute_job.name
      }
    }
  }

  service_config {
    max_instance_count    = 5
    available_memory      = "256Mi"
    timeout_seconds       = 60
    service_account_email = google_service_account.executor.email
    environment_variables = {
      GCP_PROJECT  = var.project_id
      JOB_NAME     = google_cloud_run_v2_job.import_worker.name
      JOB_NAME_DEV = google_cloud_run_v2_job.import_worker_dev.name
      JOB_LOCATION = var.region
    }
  }

  event_trigger {
    trigger_region = var.region
    event_type     = "google.cloud.pubsub.topic.v1.messagePublished"
    pubsub_topic   = google_pubsub_topic.import_jobs.id
    retry_policy   = "RETRY_POLICY_RETRY"
  }

  depends_on = [
    google_project_service.apis,
    google_cloud_run_v2_job_iam_member.executor_run,
    google_cloud_run_v2_job_iam_member.executor_run_dev,
  ]
}

# Eventarc / Pub/Sub invoke needs run.invoker on the underlying Cloud Run service for gen2 functions
# Also grant eventarc SA ability to invoke — usually automatic with event_trigger.

variable "project_id" {
  type        = string
  description = "GCP project ID"
}

variable "region" {
  type    = string
  default = "us-central1"
}

variable "billing_account_id" {
  type        = string
  description = "Billing account ID without billingAccounts/ prefix"
}

variable "vercel_team_slug" {
  type        = string
  description = "Vercel team slug (OIDC issuer path)"
}

variable "vercel_project_name" {
  type        = string
  description = "Vercel project name used in OIDC subject"
}

variable "worker_image" {
  type        = string
  description = "Full Artifact Registry image URI for the import Cloud Run Job"
  default     = ""
}

variable "budget_amount_usd" {
  type    = number
  default = 10
}

variable "job_cpu" {
  type    = string
  default = "1"
}

variable "job_memory" {
  type    = string
  default = "2Gi"
}

variable "job_timeout" {
  type    = string
  default = "1800s"
}

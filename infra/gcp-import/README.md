# GCP import worker (Terraform)

Event-driven import: Pub/Sub `metrobistro-import-jobs` → Cloud Function → Cloud Run Job `metrobistro-import`.

## Apply

```bash
cd infra/gcp-import
cp terraform.tfvars.example terraform.tfvars   # optional
terraform init
# Enable APIs + create AR/Pub/Sub/WIF/SAs/secrets first may take a few minutes
terraform apply
```

Secret **values** (not in TF):

```bash
# From local env / password manager — never commit
printf '%s' "$DATABASE_URL" | gcloud secrets versions add metrobistro-database-url --data-file=-
printf '%s' "$NVIDIA_API_KEY" | gcloud secrets versions add metrobistro-nvidia-api-key --data-file=-
printf '%s' "$GROQ_API_KEY" | gcloud secrets versions add metrobistro-groq-api-key --data-file=-
```

Image:

```bash
./scripts/build-push.sh
# then refresh Job if needed:
gcloud run jobs update metrobistro-import --region=us-central1 \
  --image=us-central1-docker.pkg.dev/kung-fu-mgmt-system/metrobistro/import-worker:latest
```

Copy `terraform output -raw vercel_env_hint` into Vercel project env (Production).

## Budget

`$10/mo` budget on this project publishes to `billing-budget-kill`; function unlinks billing for **kung-fu-mgmt-system only** at ≥100%.

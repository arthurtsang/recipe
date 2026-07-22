import { PubSub } from '@google-cloud/pubsub';
import { ExternalAccountClient } from 'google-auth-library';
import { getVercelOidcToken } from '@vercel/oidc';

function gcpConfigured(): boolean {
  return Boolean(
    process.env.GCP_PROJECT_ID &&
      process.env.GCP_PROJECT_NUMBER &&
      process.env.GCP_SERVICE_ACCOUNT_EMAIL &&
      process.env.GCP_WORKLOAD_IDENTITY_POOL_ID &&
      process.env.GCP_WORKLOAD_IDENTITY_POOL_PROVIDER_ID &&
      process.env.GCP_PUBSUB_TOPIC
  );
}

function buildPubSub(): PubSub {
  const projectId = process.env.GCP_PROJECT_ID!;

  // Local/dev: Application Default Credentials
  if (!process.env.VERCEL) {
    return new PubSub({ projectId });
  }

  const projectNumber = process.env.GCP_PROJECT_NUMBER!;
  const poolId = process.env.GCP_WORKLOAD_IDENTITY_POOL_ID!;
  const providerId = process.env.GCP_WORKLOAD_IDENTITY_POOL_PROVIDER_ID!;
  const saEmail = process.env.GCP_SERVICE_ACCOUNT_EMAIL!;
  const audience =
    process.env.GCP_AUDIENCE ||
    `//iam.googleapis.com/projects/${projectNumber}/locations/global/workloadIdentityPools/${poolId}/providers/${providerId}`;

  const authClient = ExternalAccountClient.fromJSON({
    type: 'external_account',
    audience,
    subject_token_type: 'urn:ietf:params:oauth:token-type:jwt',
    token_url: 'https://sts.googleapis.com/v1/token',
    service_account_impersonation_url: `https://iamcredentials.googleapis.com/v1/projects/-/serviceAccounts/${saEmail}:generateAccessToken`,
    subject_token_supplier: {
      getSubjectToken: async () => getVercelOidcToken(),
    },
  });
  if (!authClient) {
    throw new Error('Failed to create GCP ExternalAccountClient');
  }

  // google-auth ExternalAccountClient is accepted at runtime by PubSub
  return new PubSub({ projectId, authClient: authClient as never });
}

/**
 * Publish ImportJob id to Pub/Sub so the GCP executor starts a Cloud Run Job.
 * No-ops (with warn) if GCP env is not configured — useful for local without ADC.
 */
export async function publishImportJob(jobId: string): Promise<void> {
  if (!gcpConfigured()) {
    console.warn(
      `[IMPORT] GCP Pub/Sub not configured; job ${jobId} queued in DB only (worker will not be kicked)`
    );
    return;
  }

  const topicName = process.env.GCP_PUBSUB_TOPIC!;
  // Preview/Development → Dev Cloud Run Job (metrobistro schema); Production → prod Job (public)
  const target = process.env.VERCEL_ENV === 'production' ? 'prod' : 'dev';
  const pubsub = buildPubSub();
  const data = Buffer.from(JSON.stringify({ jobId, target }), 'utf8');
  const messageId = await pubsub.topic(topicName).publishMessage({ data });
  console.log(
    `[IMPORT] Published job ${jobId} to ${topicName} target=${target} (messageId=${messageId})`
  );
}

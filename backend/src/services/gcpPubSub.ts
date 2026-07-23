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

function buildExternalAccountClient() {
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
  return authClient;
}

/** Access token via Vercel OIDC → WIF → SA impersonation (REST-safe). */
async function getVercelWifAccessToken(): Promise<string> {
  const authClient = buildExternalAccountClient();
  const tokenResponse = await authClient.getAccessToken();
  const token =
    typeof tokenResponse === 'string' ? tokenResponse : tokenResponse?.token;
  if (!token) {
    throw new Error('WIF access token exchange returned empty token');
  }
  return token;
}

/**
 * Publish via Pub/Sub REST API.
 * Avoids gRPC + google-auth "headers.forEach is not a function" on Vercel.
 */
async function publishViaRest(
  projectId: string,
  topicName: string,
  payload: { jobId: string; target: string }
): Promise<string> {
  const accessToken = await getVercelWifAccessToken();
  const topicPath = `projects/${projectId}/topics/${topicName}`;
  const res = await fetch(
    `https://pubsub.googleapis.com/v1/${topicPath}:publish`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messages: [
          {
            data: Buffer.from(JSON.stringify(payload), 'utf8').toString('base64'),
          },
        ],
      }),
    }
  );
  const bodyText = await res.text();
  if (!res.ok) {
    throw new Error(`Pub/Sub REST publish failed: ${res.status} ${bodyText}`);
  }
  let parsed: { messageIds?: string[] };
  try {
    parsed = JSON.parse(bodyText) as { messageIds?: string[] };
  } catch {
    throw new Error(`Pub/Sub REST publish returned non-JSON: ${bodyText}`);
  }
  const messageId = parsed.messageIds?.[0];
  if (!messageId) {
    throw new Error(`Pub/Sub REST publish missing messageIds: ${bodyText}`);
  }
  return messageId;
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

  const projectId = process.env.GCP_PROJECT_ID!;
  const topicName = process.env.GCP_PUBSUB_TOPIC!;
  // Preview/Development → Dev Cloud Run Job (metrobistro schema); Production → prod Job (public)
  const target = process.env.VERCEL_ENV === 'production' ? 'prod' : 'dev';
  const payload = { jobId, target };

  let messageId: string;
  if (process.env.VERCEL) {
    messageId = await publishViaRest(projectId, topicName, payload);
  } else {
    // Local/dev: Application Default Credentials + gRPC client
    const pubsub = new PubSub({ projectId });
    messageId = await pubsub.topic(topicName).publishMessage({
      data: Buffer.from(JSON.stringify(payload), 'utf8'),
    });
  }

  console.log(
    `[IMPORT] Published job ${jobId} to ${topicName} target=${target} (messageId=${messageId})`
  );
}

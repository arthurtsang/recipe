export type ApiJson = Record<string, unknown>;

export class ApiClient {
  constructor(
    private readonly baseUrl: string,
    private readonly apiToken: string
  ) {}

  private headers(extra?: Record<string, string>): Record<string, string> {
    return {
      Authorization: `Bearer ${this.apiToken}`,
      ...extra,
    };
  }

  async get(path: string): Promise<{ status: number; body: ApiJson }> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      headers: this.headers(),
    });
    return { status: res.status, body: (await res.json()) as ApiJson };
  }

  async post(path: string, body?: unknown): Promise<{ status: number; body: ApiJson | string }> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      method: 'POST',
      headers: this.headers({ 'Content-Type': 'application/json' }),
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await res.text();
    try {
      return { status: res.status, body: JSON.parse(text) as ApiJson };
    } catch {
      return { status: res.status, body: text };
    }
  }

  async put(path: string, body?: unknown): Promise<{ status: number; body: ApiJson }> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      method: 'PUT',
      headers: this.headers({ 'Content-Type': 'application/json' }),
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return { status: res.status, body: (await res.json()) as ApiJson };
  }

  async delete(path: string): Promise<{ status: number; body: ApiJson | string }> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      method: 'DELETE',
      headers: this.headers(),
    });
    const text = await res.text();
    try {
      return { status: res.status, body: JSON.parse(text) as ApiJson };
    } catch {
      return { status: res.status, body: text };
    }
  }

  async upload(path: string, fieldName: string, file: Buffer, filename: string, mimeType: string) {
    const form = new FormData();
    form.append(fieldName, new Blob([file], { type: mimeType }), filename);
    const res = await fetch(`${this.baseUrl}${path}`, {
      method: 'POST',
      headers: this.headers(),
      body: form,
    });
    return { status: res.status, body: (await res.json()) as ApiJson };
  }

  async pollImportJob(
    jobId: string,
    opts?: { timeoutMs?: number; intervalMs?: number }
  ): Promise<ApiJson> {
    const timeoutMs = opts?.timeoutMs ?? 300_000;
    const intervalMs = opts?.intervalMs ?? 5_000;
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const { status, body } = await this.get(`/api/imports/status/${jobId}`);
      if (status !== 200) {
        throw new Error(`Import status failed HTTP ${status}: ${JSON.stringify(body)}`);
      }
      const jobStatus = String(body.status ?? '');
      if (jobStatus === 'completed') return body;
      if (jobStatus === 'failed') {
        throw new Error(`Import failed: ${String(body.error ?? 'unknown error')}`);
      }
      await new Promise((r) => setTimeout(r, intervalMs));
    }
    throw new Error(`Import job ${jobId} did not complete within ${timeoutMs}ms`);
  }
}

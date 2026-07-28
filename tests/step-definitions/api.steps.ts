import { Given, When, Then } from '@cucumber/cucumber';
import assert from 'assert';
import type { RecipeWorld } from '../support/world';
import type { ApiJson } from '../support/api-client';

type WorldWithContext = RecipeWorld & { contextIds?: Record<string, string> };

function bodyJson(world: RecipeWorld): ApiJson {
  assert(world.lastResponse, 'No last response');
  assert(typeof world.lastResponse.body === 'object', 'Expected JSON response body');
  return world.lastResponse.body as ApiJson;
}

function storedRecipeId(world: RecipeWorld): string {
  assert(world.lastRecipe?.id, 'No stored recipe id');
  return String(world.lastRecipe.id);
}

function storedJobId(world: WorldWithContext, contextKey = 'jobId'): string {
  const fromContext = world.contextIds?.[contextKey];
  if (fromContext) return fromContext;
  const job = world.lastJob;
  const id = job?.jobId ?? job?.id;
  assert(id, 'No stored import job id');
  return String(id);
}

When('I GET {string}', async function (this: RecipeWorld, path: string) {
  this.lastResponse = await this.api!.get(path);
});

When('I POST {string} with JSON:', async function (this: RecipeWorld, path: string, doc: string) {
  this.lastResponse = await this.api!.post(path, JSON.parse(doc));
});

When('I PUT the stored recipe with JSON:', async function (this: RecipeWorld, doc: string) {
  this.lastResponse = await this.api!.put(`/api/recipes/${storedRecipeId(this)}`, JSON.parse(doc));
});

When('I GET the stored recipe', async function (this: RecipeWorld) {
  this.lastResponse = await this.api!.get(`/api/recipes/${storedRecipeId(this)}`);
});

When('I DELETE the stored recipe', async function (this: RecipeWorld) {
  const id = storedRecipeId(this);
  this.lastResponse = await this.api!.delete(`/api/recipes/${id}`);
  this.createdRecipeIds = this.createdRecipeIds.filter((x) => x !== id);
});

When(
  'I POST ratings on the stored recipe with JSON:',
  async function (this: RecipeWorld, doc: string) {
    this.lastResponse = await this.api!.post(
      `/api/recipes/${storedRecipeId(this)}/ratings`,
      JSON.parse(doc)
    );
  }
);

When('I GET ratings on the stored recipe', async function (this: RecipeWorld) {
  this.lastResponse = await this.api!.get(`/api/recipes/${storedRecipeId(this)}/ratings`);
});

When('I upload a test image to {string}', async function (this: RecipeWorld, path: string) {
  const jpeg = Buffer.from(
    '/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAn/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwCwAA8A/9k=',
    'base64'
  );
  this.lastResponse = await this.api!.upload(path, 'image', jpeg, 'bdd-test.jpg', 'image/jpeg');
});

When('I wait for the stored import job to complete', async function (this: RecipeWorld) {
  const jobId = storedJobId(this);
  this.lastJob = await this.api!.pollImportJob(jobId);
});

When(
  'I wait for the stored import job to complete with timeout {int} ms',
  async function (this: RecipeWorld, timeoutMs: number) {
    const jobId = storedJobId(this);
    this.lastJob = await this.api!.pollImportJob(jobId, { timeoutMs });
  }
);

When(
  'I wait for the stored import job to complete using context {string}',
  async function (this: WorldWithContext, contextKey: string) {
    const jobId = storedJobId(this, contextKey);
    this.lastJob = await this.api!.pollImportJob(jobId);
  }
);

When('I POST save-recipe for the stored import job', async function (this: RecipeWorld) {
  const jobId = storedJobId(this);
  this.lastResponse = await this.api!.post(`/api/imports/${jobId}/save-recipe`);
  if ([200, 201].includes(this.lastResponse.status) && typeof this.lastResponse.body === 'object') {
    this.lastRecipe = this.lastResponse.body as ApiJson;
    if (this.lastRecipe.id) {
      this.createdRecipeIds.push(String(this.lastRecipe.id));
    }
  }
});

When(
  'I POST save-recipe for import job from context {string}',
  async function (this: WorldWithContext, contextKey: string) {
    const jobId = storedJobId(this, contextKey);
    this.lastResponse = await this.api!.post(`/api/imports/${jobId}/save-recipe`);
    if ([200, 201].includes(this.lastResponse.status) && typeof this.lastResponse.body === 'object') {
      this.lastRecipe = this.lastResponse.body as ApiJson;
    }
  }
);

Then('the response status should be {int}', function (this: RecipeWorld, status: number) {
  assert.equal(this.lastResponse?.status, status, JSON.stringify(this.lastResponse?.body));
});

Then('the response body should be a JSON array', function (this: RecipeWorld) {
  assert(Array.isArray(this.lastResponse?.body), 'Expected array response');
});

Then('the response JSON field {string} should be {string}', function (this: RecipeWorld, field: string, expected: string) {
  const body = bodyJson(this);
  assert.equal(String(body[field]), expected);
});

Then('the response JSON field {string} should be {int}', function (this: RecipeWorld, field: string, expected: number) {
  const body = bodyJson(this);
  assert.equal(Number(body[field]), expected);
});

Then('the response JSON field {string} should be a non-empty string', function (this: RecipeWorld, field: string) {
  const body = bodyJson(this);
  const value = String(body[field] ?? '');
  assert(value.length > 0, `Expected non-empty ${field}`);
});

Then('the response JSON field {string} should contain {string}', function (this: RecipeWorld, field: string, substring: string) {
  const body = bodyJson(this);
  assert(String(body[field]).includes(substring), `Expected ${field} to contain ${substring}`);
});

Then('the response JSON field {string} should equal the stored recipe id', function (this: RecipeWorld, field: string) {
  const body = bodyJson(this);
  assert.equal(String(body[field]), storedRecipeId(this));
});

Then('I store the created recipe id', function (this: RecipeWorld) {
  const body = bodyJson(this);
  assert(body.id, 'Response missing recipe id');
  this.lastRecipe = body;
  this.createdRecipeIds.push(String(body.id));
});

Then('I store the created recipe id from the response', function (this: RecipeWorld) {
  const body = bodyJson(this);
  assert(body.id, 'Response missing recipe id');
  this.lastRecipe = { id: body.id };
});

Then('I store the first import job id', function (this: RecipeWorld) {
  const body = bodyJson(this);
  const jobs = body.jobs as ApiJson[] | undefined;
  assert(jobs?.length, 'No jobs in import response');
  this.lastJob = jobs[0];
  this.createdImportJobIds.push(String(jobs[0].jobId ?? jobs[0].id));
});

Then(
  'I store the first import job id as {string}',
  function (this: WorldWithContext, contextKey: string) {
    const body = bodyJson(this);
    const jobs = body.jobs as ApiJson[] | undefined;
    assert(jobs?.length, 'No jobs in import response');
    if (!this.contextIds) this.contextIds = {};
    const id = String(jobs[0].jobId ?? jobs[0].id);
    this.contextIds[contextKey] = id;
    this.createdImportJobIds.push(id);
  }
);

Then('the stored import job kind should be {string}', function (this: RecipeWorld, kind: string) {
  const body = bodyJson(this);
  const jobs = body.jobs as ApiJson[] | undefined;
  assert.equal(String(jobs?.[0]?.kind), kind);
});

Then('the import result should have a title', function (this: RecipeWorld) {
  const result = (this.lastJob?.result ?? {}) as ApiJson;
  assert(String(result.title ?? '').length > 0, 'Import result missing title');
});

Then('the recipe should have {int} version', async function (this: RecipeWorld, count: number) {
  await assertVersionCount(this, count);
});

Then('the recipe should have at least {int} versions', async function (this: RecipeWorld, min: number) {
  const res = await this.api!.get(`/api/recipes/${storedRecipeId(this)}`);
  const versions = (res.body as ApiJson).versions as ApiJson[] | undefined;
  assert(versions && versions.length >= min, `Expected >= ${min} versions, got ${versions?.length ?? 0}`);
});

async function assertVersionCount(world: RecipeWorld, count: number): Promise<void> {
  const res = await world.api!.get(`/api/recipes/${storedRecipeId(world)}`);
  const versions = (res.body as ApiJson).versions as ApiJson[] | undefined;
  assert.equal(versions?.length, count);
}

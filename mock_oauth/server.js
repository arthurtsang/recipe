/**
 * Mock Google OIDC server for E2E testing.
 * Implements minimal OAuth2/OIDC endpoints that express-openid-connect expects.
 */
const express = require('express');
const jwt = require('jsonwebtoken');

const PORT = process.env.PORT || 9999;
const BASE_URL = process.env.MOCK_OAUTH_BASE_URL || `http://localhost:${PORT}`;

// Test user - must match ADMIN_EMAIL for admin access
const TEST_USER = {
  sub: 'test-user-123',
  email: process.env.TEST_USER_EMAIL || 'test@example.com',
  name: 'Test User',
  picture: 'https://example.com/avatar.png',
};

// Secret for signing tokens - must match what express-openid-connect expects
const MOCK_SECRET = process.env.MOCK_OAUTH_SECRET || 'mock-oauth-secret-for-testing';

const app = express();
app.set('trust proxy', 1);

// OpenID Discovery document
app.get('/.well-known/openid-configuration', (req, res) => {
  res.json({
    issuer: BASE_URL,
    authorization_endpoint: `${BASE_URL}/authorize`,
    token_endpoint: `${BASE_URL}/token`,
    userinfo_endpoint: `${BASE_URL}/userinfo`,
    jwks_uri: `${BASE_URL}/.well-known/jwks.json`,
    response_types_supported: ['code'],
    subject_types_supported: ['public'],
    id_token_signing_alg_values_supported: ['HS256'],
    scopes_supported: ['openid', 'email', 'profile'],
  });
});

// JWKS - for production you'd use RS256, for mock we use HS256 (simpler)
app.get('/.well-known/jwks.json', (req, res) => {
  res.json({ keys: [] });
});

// Authorization - redirect back to callback with auth code
app.get('/authorize', (req, res) => {
  const redirect_uri = req.query.redirect_uri;
  const state = req.query.state;
  if (!redirect_uri) {
    return res.status(400).send('Missing redirect_uri');
  }
  const code = 'mock-auth-code-123';
  const callbackUrl = `${redirect_uri}?code=${code}&state=${state || ''}`;
  res.redirect(callbackUrl);
});

// Token exchange - return id_token and access_token
app.post('/token', express.urlencoded({ extended: true }), (req, res) => {
  const { code, redirect_uri, grant_type } = req.body;
  if (grant_type !== 'authorization_code' || !code) {
    return res.status(400).json({ error: 'invalid_grant' });
  }

  const now = Math.floor(Date.now() / 1000);
  const idTokenPayload = {
    iss: BASE_URL,
    sub: TEST_USER.sub,
    aud: process.env.GOOGLE_CLIENT_ID || 'mock-client-id',
    exp: now + 3600,
    iat: now,
    email: TEST_USER.email,
    name: TEST_USER.name,
    picture: TEST_USER.picture,
  };

  // Use HS256 - client secret as key (mock mode)
  const id_token = jwt.sign(idTokenPayload, MOCK_SECRET, { algorithm: 'HS256' });
  const access_token = jwt.sign(
    { ...idTokenPayload, scope: 'openid email profile' },
    MOCK_SECRET,
    { algorithm: 'HS256' }
  );

  res.json({
    access_token,
    id_token,
    token_type: 'Bearer',
    expires_in: 3600,
    scope: 'openid email profile',
  });
});

// UserInfo endpoint (optional, some clients use it)
app.get('/userinfo', (req, res) => {
  res.json(TEST_USER);
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'mock-oauth' });
});

app.listen(PORT, () => {
  console.log(`Mock OAuth server running at ${BASE_URL}`);
  console.log(`Test user: ${TEST_USER.email}`);
});

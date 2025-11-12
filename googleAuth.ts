/* PKCE + OAuth2 (Google) helper for browser / Capacitor (TypeScript)
   - generateCodeVerifier, generateCodeChallenge
   - buildAuthUrl
   - exchangeCodeForToken
   - refreshAccessToken
   NOTE: store tokens securely (Secure Storage on mobile). */

type TokenResponse = {
  access_token: string;
  expires_in?: number;
  refresh_token?: string;
  scope?: string;
  token_type?: string;
  id_token?: string;
};

function base64UrlEncode(buffer: ArrayBuffer) {
  const bytes = new Uint8Array(buffer);
  let str = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    str += String.fromCharCode(bytes[i]);
  }
  return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export async function generateCodeChallenge(verifier: string) {
  const encoder = new TextEncoder();
  const data = encoder.encode(verifier);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return base64UrlEncode(digest);
}

export function generateCodeVerifier(length = 128) {
  const arr = new Uint8Array(length);
  crypto.getRandomValues(arr);
  let str = '';
  for (let i = 0; i < arr.length; i++) {
    // restrict to URL-safe chars
    str += ('ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_')[arr[i] % 64];
  }
  return str;
}

/**
 * Build Google OAuth2 authorization URL (PKCE)
 * - clientId: OAuth Client ID (Web or other depending on platform)
 * - redirectUri: must match one registered in GCP console
 * - scopes: array of scopes, e.g. ["openid","email","profile","https://www.googleapis.com/auth/fitness.activity.read"]
 * - state: optional CSRF token
 */
export function buildAuthUrl(params: {
  clientId: string;
  redirectUri: string;
  scopes: string[];
  codeChallenge: string;
  state?: string;
  includeGrantedScopes?: boolean;
  prompt?: 'consent' | 'select_account';
}) {
  const {
    clientId, redirectUri, scopes, codeChallenge, state, includeGrantedScopes = true, prompt = 'consent'
  } = params;
  const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  url.searchParams.set('client_id', clientId);
  url.searchParams.set('redirect_uri', redirectUri);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('scope', scopes.join(' '));
  url.searchParams.set('code_challenge', codeChallenge);
  url.searchParams.set('code_challenge_method', 'S256');
  url.searchParams.set('access_type', 'offline'); // request refresh_token
  url.searchParams.set('include_granted_scopes', includeGrantedScopes ? 'true' : 'false');
  url.searchParams.set('prompt', prompt);
  if (state) url.searchParams.set('state', state);
  return url.toString();
}

/**
 * Exchange authorization code for tokens
 * - code: authorization code received in redirect
 * - codeVerifier: the original PKCE code verifier
 * - clientId: OAuth client id (if using public client + PKCE)
 * - redirectUri: must match
 */
export async function exchangeCodeForToken(params: {
  code: string;
  codeVerifier: string;
  clientId: string;
  redirectUri: string;
}): Promise<TokenResponse> {
  const body = new URLSearchParams();
  body.set('grant_type', 'authorization_code');
  body.set('code', params.code);
  body.set('client_id', params.clientId);
  body.set('redirect_uri', params.redirectUri);
  body.set('code_verifier', params.codeVerifier);

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString()
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`token exchange failed: ${res.status} ${txt}`);
  }
  const json = await res.json();
  return json as TokenResponse;
}

/**
 * Refresh an access token using refresh_token
 */
export async function refreshAccessToken(params: {
  refreshToken: string;
  clientId: string;
}): Promise<TokenResponse> {
  const body = new URLSearchParams();
  body.set('grant_type', 'refresh_token');
  body.set('refresh_token', params.refreshToken);
  body.set('client_id', params.clientId);

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString()
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`refresh failed: ${res.status} ${txt}`);
  }
  const json = await res.json();
  return json as TokenResponse;
}
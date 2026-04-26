export const BASE_URL =
  process.env.TROXY_API_URL ||
  'https://api.troxy.io';

async function request(method, path, { apiKey, jwt, body } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (apiKey) headers['X-Troxy-Key'] = apiKey;
  if (jwt)    headers['Authorization'] = `Bearer ${jwt}`;

  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  const data = await res.json();
  if (!res.ok) {
    const err = new Error(data?.error || `HTTP ${res.status}`);
    if (res.status === 401) err.code = 'UNAUTHORIZED';
    throw err;
  }
  return data;
}

export const api = {
  // Auth
  health:     ()          => request('GET',    '/health'),
  magicLink:  (email)     => request('POST',   '/auth/magic-link', { body: { email } }),
  verify:     (token)     => request('POST',   '/auth/verify',     { body: { token } }),

  // Cards
  listCards:   (jwt)      => request('GET',    '/cards',    { jwt }),
  createCard:  (jwt, b)   => request('POST',   '/cards',    { jwt, body: b }),
  updateCard:  (jwt, id, b) => request('PUT',  `/cards/${id}`, { jwt, body: b }),
  deleteCard:  (jwt, id)  => request('DELETE', `/cards/${id}`, { jwt }),

  // Policies
  listPolicies:  (jwt)       => request('GET',    '/dashboard/policies',        { jwt }),
  createPolicy:  (jwt, b)    => request('POST',   '/dashboard/policies',        { jwt, body: b }),
  updatePolicy:  (jwt, id, b) => request('PATCH', `/dashboard/policies/${id}`,  { jwt, body: b }),
  deletePolicy:  (jwt, id)   => request('DELETE', `/dashboard/policies/${id}`,  { jwt }),

  // Activity + insights
  activity:   (jwt, limit) => request('GET', `/dashboard/activity?limit=${limit || 20}`, { jwt }),
  insights:   (jwt)        => request('GET', '/dashboard/insights', { jwt }),

  // Tokens
  listTokens:   (jwt)     => request('GET',    '/tokens',        { jwt }),
  createToken:  (jwt, b)  => request('POST',   '/tokens',        { jwt, body: b }),
  revokeToken:  (jwt, id) => request('DELETE', `/tokens/${id}`,  { jwt }),

  // Evaluate (agent API key)
  evaluate: (body, apiKey) => request('POST', '/evaluate', { apiKey, body }),

  // MCP heartbeat (agent API key)
  mcpHeartbeat: (apiKey, agentName) => request('POST', '/mcp/heartbeat', { apiKey, body: agentName ? { agent_name: agentName } : undefined }),

  // Agent read-only API (API key auth — no JWT required)
  agentStatus:   (apiKey)              => request('GET', '/agent/status',   { apiKey }),
  agentPolicies: (apiKey)              => request('GET', '/agent/policies',  { apiKey }),
  agentMcps:     (apiKey)              => request('GET', '/agent/mcps',      { apiKey }),
  agentCards:    (apiKey)              => request('GET', '/agent/cards',      { apiKey }),
  agentActivity: (apiKey, limit, mine) => request('GET', `/agent/activity?limit=${limit || 20}${mine ? '&mine=true' : ''}`, { apiKey }),
  agentInsights: (apiKey, period)      => request('GET', `/agent/insights?period=${period || 30}`, { apiKey }),
};

// Named export for backwards compat with init.js + mcp-server.js
export const evaluatePayment = (body, apiKey) => api.evaluate(body, apiKey);

export const BASE_URL =
  process.env.TROXY_API_URL ||
  'https://wuxyx33bka.execute-api.us-east-1.amazonaws.com';

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
  if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
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
};

// Named export for backwards compat with init.js + mcp-server.js
export const evaluatePayment = (body, apiKey) => api.evaluate(body, apiKey);

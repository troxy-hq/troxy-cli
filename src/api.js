export const BASE_URL =
  process.env.TROXY_API_URL ||
  'https://wuxyx33bka.execute-api.us-east-1.amazonaws.com';

export async function evaluatePayment(payload, apiKey) {
  const res = await fetch(`${BASE_URL}/evaluate`, {
    method:  'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Troxy-Key':  apiKey,
    },
    body: JSON.stringify(payload),
  });
  return res.json();
}

export async function checkHealth() {
  const res = await fetch(`${BASE_URL}/health`);
  return res.json();
}

import { Server }              from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { loadConfig }      from './config.js';
import { evaluatePayment, api } from './api.js';

export async function runMcp() {
  const config = loadConfig();
  const apiKey = process.env.TROXY_API_KEY || config?.apiKey;

  if (!apiKey) {
    process.stderr.write(
      'Troxy: no API key found. Run: npx troxy init --key txy-...\n',
    );
    process.exit(1);
  }

  const server = new Server(
    { name: 'troxy', version: '0.1.0' },
    { capabilities: { tools: {} } },
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: [
      {
        name: 'evaluate_payment',
        description:
          'Evaluate whether a payment should be allowed, blocked, or escalated ' +
          'based on your Troxy policies. Call this before initiating any payment.',
        inputSchema: {
          type: 'object',
          required: ['card_alias', 'merchant_name', 'amount'],
          properties: {
            card_alias: {
              type: 'string',
              description: 'Card alias to charge (e.g. "Personal", "Business")',
            },
            merchant_name: {
              type: 'string',
              description: 'Name of the merchant or service',
            },
            amount: {
              type: 'number',
              description: 'Payment amount',
            },
            agent: {
              type: 'string',
              description: 'Name of the agent making the payment (optional)',
            },
            merchant_category: {
              type: 'string',
              description: 'Merchant category, e.g. "software", "travel" (optional)',
            },
            currency: {
              type: 'string',
              description: 'Currency code, defaults to USD (optional)',
            },
          },
        },
      },
    ],
  }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    if (request.params.name !== 'evaluate_payment') {
      throw new Error(`Unknown tool: ${request.params.name}`);
    }

    const args   = request.params.arguments ?? {};
    const result = await evaluatePayment(args, apiKey);

    if (result.error) {
      return {
        content: [{ type: 'text', text: `Troxy error: ${result.error}` }],
        isError: true,
      };
    }

    const { decision, policy, audit_id } = result;
    let text;

    switch (decision) {
      case 'ALLOW':
        text = `✓ Payment approved.${policy ? ` Policy matched: "${policy}".` : ''} (audit: ${audit_id})`;
        break;
      case 'BLOCK':
        text = `✗ Payment blocked by policy "${policy}". Do not proceed with this payment. (audit: ${audit_id})`;
        break;
      case 'ESCALATE':
        text = `⏳ Payment requires human approval — a request has been sent to the account owner. Do not proceed until approved. (audit: ${audit_id})`;
        break;
      case 'NOTIFY':
        text = `✓ Payment approved with notification. Policy matched: "${policy}". (audit: ${audit_id})`;
        break;
      default:
        text = JSON.stringify(result);
    }

    return {
      content: [{ type: 'text', text }],
      isError: decision === 'BLOCK',
    };
  });

  const transport = new StdioServerTransport();
  await server.connect(transport);

  // Heartbeat: tell the dashboard this MCP server is active
  const sendHeartbeat = () =>
    api.mcpHeartbeat(apiKey).catch(() => {}); // silent — don't crash MCP on network error
  sendHeartbeat();
  setInterval(sendHeartbeat, 60_000);
}

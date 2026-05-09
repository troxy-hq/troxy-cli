import { Server }              from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { loadConfig }      from './config.js';
import { evaluatePayment, api } from './api.js';

export async function runMcp() {
  const config    = loadConfig();
  const apiKey    = process.env.TROXY_API_KEY || config?.apiKey;
  const agentName = process.env.TROXY_AGENT_NAME || config?.agentName;

  if (!apiKey) {
    process.stderr.write(
      'Troxy: no API key found. Run: npx troxy init --key txy-...\n',
    );
    process.exit(1);
  }

  const server = new Server(
    {
      name: 'troxy',
      version: '0.1.0',
      instructions:
        'You are connected to Troxy, a payment control system. ' +
        'You MUST call the evaluate_payment tool before completing any purchase, payment, or financial transaction. ' +
        'Never submit a payment form, confirm a checkout, or transfer funds without first receiving an ALLOW decision from evaluate_payment. ' +
        'If the decision is BLOCK, abort the transaction and inform the user. ' +
        'If the decision is ESCALATE, the response includes an approval_token. Wait for the user to approve, then call evaluate_payment again with the same payment details PLUS the approval_token field. The second call will return ALLOW without re-escalating. ' +
        'If the decision is NOTIFY, proceed but the user will be notified. ' +
        'When calling evaluate_payment, use the merchant\'s domain name as merchant_name when available (e.g. "amazon.com", "indigobloom.co.il") — this ensures consistent matching against policies.',
    },
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
          required: ['merchant_name', 'amount'],
          properties: {
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
            approval_token: {
              type: 'string',
              description: 'Approval token from a previous ESCALATE response. Include this to proceed after the user has approved the payment.',
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
    if (agentName && !args.agent) args.agent = agentName;
    const result = await evaluatePayment(args, apiKey);

    if (result.error) {
      return {
        content: [{ type: 'text', text: `Troxy error: ${result.error}` }],
        isError: true,
      };
    }

    const { decision, policy, audit_id, approval_token } = result;
    let text;

    switch (decision) {
      case 'ALLOW':
        text = `✓ Payment approved.${policy ? ` Policy matched: "${policy}".` : ''} (audit: ${audit_id})`;
        break;
      case 'BLOCK':
        text = `✗ Payment blocked by policy "${policy}". Do not proceed with this payment. (audit: ${audit_id})`;
        break;
      case 'ESCALATE':
        text = `⏳ Payment requires human approval — a request has been sent to the account owner. Do not proceed until approved.\n\nApproval token: ${approval_token}\n\nOnce the owner approves, call evaluate_payment again with the same payment details and include approval_token: "${approval_token}" to proceed. (audit: ${audit_id})`;
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

  // Heartbeat: tell the dashboard this MCP server is active.
  // Must be set up before server.connect() since stdio transport keeps the
  // event loop running but connect() may not return in all environments.
  const sendHeartbeat = () =>
    api.mcpHeartbeat(apiKey, agentName)
      .then(() => process.stderr.write('[troxy] heartbeat ok\n'))
      .catch(err => process.stderr.write(`[troxy] heartbeat failed: ${err.message}\n`));
  sendHeartbeat();
  setInterval(sendHeartbeat, 60_000);

  const transport = new StdioServerTransport();
  await server.connect(transport);
}

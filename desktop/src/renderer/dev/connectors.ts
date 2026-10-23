// The ?page=connectors&connectors= scenario's fixtures: the project's
// Connectors page with a connector in each state and of each scope (all), a
// list that never arrives (loading), or a daemon that refuses it (error).
// Without it, ?page=connectors is the empty page.
import type { QueryClient } from '@tanstack/react-query';
import type * as T from '../../shared/api';
import { PROJECT } from './fixtures';

const ago = (ms: number) => new Date(Date.now() - ms).toISOString();
const later = (ms: number) => new Date(Date.now() + ms).toISOString();
const hour = 3_600_000;

function connector(name: string, url: string, extra: Partial<T.Connector>): T.Connector {
  return {
    name, url, scope: 'project', project: PROJECT, auth: 'oauth', enabled: true, status: 'connected',
    updatedAt: ago(2 * hour), agents: [`${PROJECT}/agent-12`, `${PROJECT}/agent-41`], ...extra,
  };
}

export function projectConnectors(): T.Connector[] {
  return [
    connector('notion', 'https://mcp.notion.com/mcp', { issuer: 'https://mcp.notion.com', connectedAt: ago(3 * 24 * hour), expiresAt: later(40 * 60_000) }),
    connector('linear', 'https://mcp.linear.app/mcp', { status: 'connecting', agents: [] }),
    connector('sentry', 'https://mcp.sentry.dev/mcp', { status: 'error', error: 'invalid_grant: the refresh token was revoked by the authorization server', agents: [`${PROJECT}/agent-12`] }),
    connector('figma', 'https://mcp.figma.com/mcp', { auth: 'secret', secret: 'FIGMA_TOKEN', header: 'X-Figma-Token', scheme: '', connectedAt: ago(5 * hour) }),
    connector('acme-internal-tools', 'https://mcp.internal.acme-corporation.example.com/v2/mcp/streamable', { auth: 'none', status: 'disconnected', enabled: false, agents: [] }),
    connector('hatch', 'https://usehatch.dev/mcp', { scope: 'agentbox', project: '', override: 'on', connectedAt: ago(26 * hour), issuer: 'https://usehatch.dev' }),
    connector('github', 'https://api.githubcopilot.com/mcp/', { scope: 'agentbox', project: '', status: 'disconnected', agents: [] }),
  ];
}

const request: T.Question = {
  id: 'q-connector-1', project: PROJECT, agent: 'agent-41', ref: `${PROJECT}/agent-41`, kind: 'connector', connector: 'stripe',
  url: 'https://mcp.stripe.com', question: 'I need to read the failed payouts from last week to reproduce the reconciliation bug.', status: 'pending', createdAt: ago(4 * 60_000),
};

export function seedConnectors(queryClient: QueryClient, mode: string): void {
  type Bridge = { request: (method: string, path: string, body?: unknown) => Promise<unknown> };
  const bridge = (window as unknown as { agentbox: Bridge }).agentbox;
  const inner = bridge.request;
  const list = /^\/v1\/projects\/[^/]+\/connectors$/;
  if (mode === 'all') {
    queryClient.setQueryData(['connectors', PROJECT], projectConnectors());
    queryClient.setQueryData(['questions', PROJECT], [request]);
    return;
  }
  queryClient.removeQueries({ queryKey: ['connectors', PROJECT] });
  bridge.request = async (method, path, body) => {
    if (method === 'GET' && list.test(path)) {
      if (mode === 'loading') return new Promise(() => {});
      return { status: 500, body: JSON.stringify({ error: 'connectors: database is locked' }), contentType: 'application/json' };
    }
    return inner(method, path, body);
  };
}

/**
 * HTTP transport fail-closed auth.
 *
 * Startup requires a real CONDUIT_S2S_SECRET unless MCP_ALLOW_INSECURE_DEV=1.
 * Known placeholders are rejected even with that flag. The insecure-dev
 * bypass binds 127.0.0.1 only. /mcp rejects a missing or invalid
 * X-Gateway-S2S header. AUTH_MODE=gateway rejects requests that omit
 * X-AlertOps-Api-Key and must not fall back to ALERTOPS_API_KEY.
 */

import { createHmac } from 'node:crypto';
import { request as httpRequest } from 'node:http';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const getCredentialsMock = vi.hoisted(() => vi.fn());

vi.mock('../client.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../client.js')>();
  return {
    ...actual,
    getCredentials: (...args: Parameters<typeof actual.getCredentials>) => {
      getCredentialsMock(...args);
      return actual.getCredentials(...args);
    },
  };
});

import { startHttpTransport } from '../http.js';

const S2S_SECRET = 's2s-do-not-log-7f3a';
const ENV_API_KEY = 'env-api-key-must-not-be-used';
const HEADER_API_KEY = 'header-api-key-from-request';

const ENV_KEYS = [
  'CONDUIT_S2S_SECRET',
  'MCP_ALLOW_INSECURE_DEV',
  'MCP_HTTP_PORT',
  'MCP_HTTP_HOST',
  'AUTH_MODE',
  'ALERTOPS_API_KEY',
  'LOG_LEVEL',
  'MCP_TRANSPORT',
] as const;

const savedEnv = new Map<string, string | undefined>();
const servers: Server[] = [];

function mintS2sHeader(secret: string, unixSeconds = Math.floor(Date.now() / 1000)): string {
  const message = `t=${unixSeconds}`;
  const hex = createHmac('sha256', secret).update(message).digest('hex');
  return `${message},v1=${hex}`;
}

function captureStderr(): { text: () => string; restore: () => void } {
  const lines: string[] = [];
  const spy = vi.spyOn(console, 'error').mockImplementation((...args: unknown[]) => {
    lines.push(args.map((arg) => (typeof arg === 'string' ? arg : JSON.stringify(arg))).join(' '));
  });
  return {
    text: () => lines.join('\n'),
    restore: () => spy.mockRestore(),
  };
}

interface HttpResult {
  status: number;
  body: string;
}

function sendHttp(options: {
  port: number;
  method: string;
  path: string;
  headers?: Record<string, string>;
  body?: string;
}): Promise<HttpResult> {
  return new Promise((resolve, reject) => {
    const req = httpRequest(
      {
        hostname: '127.0.0.1',
        port: options.port,
        method: options.method,
        path: options.path,
        headers: options.headers,
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk: Buffer) => chunks.push(chunk));
        res.on('end', () => {
          resolve({
            status: res.statusCode ?? 0,
            body: Buffer.concat(chunks).toString('utf8'),
          });
        });
      },
    );
    req.setTimeout(5000, () => {
      req.destroy(new Error(`timeout ${options.method} ${options.path}`));
    });
    req.on('error', reject);
    if (options.body !== undefined) req.write(options.body);
    req.end();
  });
}

async function listen(): Promise<{ port: number; address: string; close: () => Promise<void> }> {
  const server = await startHttpTransport();
  servers.push(server);
  const bound = server.address() as AddressInfo | null;
  if (!bound || typeof bound === 'string') {
    throw new Error('HTTP server did not bind a TCP port');
  }
  return {
    port: bound.port,
    address: bound.address,
    close: () => new Promise((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
    }),
  };
}

function mcpHeaders(extra?: Record<string, string>): Record<string, string> {
  return {
    'content-type': 'application/json',
    accept: 'application/json, text/event-stream',
    ...extra,
  };
}

const groupsCall = JSON.stringify({
  jsonrpc: '2.0',
  id: 1,
  method: 'tools/call',
  params: { name: 'alertops_list_groups', arguments: {} },
});

async function expectStartupRefused(assertion: (logged: string) => void): Promise<void> {
  const logs = captureStderr();
  const exitSpy = vi.spyOn(process, 'exit').mockImplementation(((code?: number) => {
    throw new Error(`process.exit:${String(code)}`);
  }) as typeof process.exit);

  try {
    await expect(startHttpTransport()).rejects.toThrow('process.exit:1');
    expect(exitSpy).toHaveBeenCalledWith(1);
    const text = logs.text();
    assertion(text);
    expect(text).not.toContain(S2S_SECRET);
    expect(text).not.toContain(ENV_API_KEY);
  } finally {
    exitSpy.mockRestore();
    logs.restore();
  }
}

beforeAll(() => {
  for (const key of ENV_KEYS) savedEnv.set(key, process.env[key]);
});

afterAll(() => {
  for (const key of ENV_KEYS) {
    const value = savedEnv.get(key);
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

beforeEach(() => {
  process.env.MCP_HTTP_PORT = '0';
  process.env.MCP_HTTP_HOST = '127.0.0.1';
  process.env.LOG_LEVEL = 'error';
  delete process.env.CONDUIT_S2S_SECRET;
  delete process.env.MCP_ALLOW_INSECURE_DEV;
  delete process.env.AUTH_MODE;
  delete process.env.ALERTOPS_API_KEY;
  getCredentialsMock.mockReset();
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ groups: [] }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })));
});

afterEach(async () => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  while (servers.length > 0) {
    const server = servers.pop();
    if (!server?.listening) continue;
    await new Promise<void>((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
    });
  }
});

describe('HTTP startup', () => {
  it('refuses to start when CONDUIT_S2S_SECRET is unset', async () => {
    await expectStartupRefused((text) => {
      expect(text).toContain('Refusing to start HTTP transport');
      expect(text).toContain('CONDUIT_S2S_SECRET is empty');
    });
  });

  it('refuses to start when CONDUIT_S2S_SECRET is empty or whitespace', async () => {
    process.env.CONDUIT_S2S_SECRET = '   ';
    await expectStartupRefused((text) => {
      expect(text).toContain('CONDUIT_S2S_SECRET is empty');
    });
  });

  it('still refuses when MCP_ALLOW_INSECURE_DEV is not exactly 1', async () => {
    process.env.MCP_ALLOW_INSECURE_DEV = 'true';
    await expectStartupRefused((text) => {
      expect(text).toContain('Refusing to start HTTP transport');
    });
  });

  it.each(['replace-with-a-real-secret', 'changeme', '  Your-S2S-Secret  '])(
    'refuses the known placeholder %j and does not log it',
    async (placeholder) => {
      process.env.CONDUIT_S2S_SECRET = placeholder;
      await expectStartupRefused((text) => {
        expect(text).toContain('known placeholder');
        expect(text).toContain('Refusing to start HTTP transport');
        expect(text).not.toContain(placeholder.trim());
      });
    },
  );

  it('refuses a placeholder even when MCP_ALLOW_INSECURE_DEV=1', async () => {
    process.env.CONDUIT_S2S_SECRET = 'placeholder';
    process.env.MCP_ALLOW_INSECURE_DEV = '1';
    await expectStartupRefused((text) => {
      expect(text).toContain('known placeholder');
      expect(text).not.toContain('SECURITY WARNING');
    });
  });

  it('allows startup with a warning when MCP_ALLOW_INSECURE_DEV=1 and binds 127.0.0.1', async () => {
    process.env.MCP_ALLOW_INSECURE_DEV = '1';
    delete process.env.MCP_HTTP_HOST;
    const logs = captureStderr();
    try {
      const server = await listen();
      expect(server.address).toBe('127.0.0.1');
      const text = logs.text();
      expect(text).toContain('SECURITY WARNING');
      expect(text).toContain('CONDUIT_S2S_SECRET');
      expect(text).toContain('MCP_ALLOW_INSECURE_DEV=1');
      expect(text).toContain('127.0.0.1');
      expect(text).not.toContain('not a loopback address');
      expect(text).not.toContain(S2S_SECRET);
    } finally {
      logs.restore();
    }
  });

  it('forces 127.0.0.1 when the dev bypass is set and MCP_HTTP_HOST is non-loopback', async () => {
    process.env.MCP_ALLOW_INSECURE_DEV = '1';
    process.env.MCP_HTTP_HOST = '0.0.0.0';
    const logs = captureStderr();
    try {
      const server = await listen();
      expect(server.address).toBe('127.0.0.1');
      const text = logs.text();
      expect(text).toContain('MCP_HTTP_HOST=0.0.0.0 is not a loopback address');
      expect(text).toContain('Binding 127.0.0.1 only');
      expect(text).not.toContain(S2S_SECRET);
    } finally {
      logs.restore();
    }
  });

  it('forces 127.0.0.1 when the dev bypass is set and MCP_HTTP_HOST is localhost', async () => {
    process.env.MCP_ALLOW_INSECURE_DEV = '1';
    process.env.MCP_HTTP_HOST = 'localhost';
    const logs = captureStderr();
    try {
      const server = await listen();
      expect(server.address).toBe('127.0.0.1');
      expect(logs.text()).not.toContain('not a loopback address');
    } finally {
      logs.restore();
    }
  });

  it('honors a non-loopback MCP_HTTP_HOST when CONDUIT_S2S_SECRET is set', async () => {
    process.env.CONDUIT_S2S_SECRET = S2S_SECRET;
    process.env.MCP_HTTP_HOST = '0.0.0.0';
    const logs = captureStderr();
    try {
      const server = await listen();
      expect(server.address).toBe('0.0.0.0');
      expect(logs.text()).not.toContain('not a loopback address');
      expect(logs.text()).not.toContain(S2S_SECRET);
    } finally {
      logs.restore();
    }
  });

  it('binds 127.0.0.1 when MCP_HTTP_HOST is unset and a secret is configured', async () => {
    delete process.env.MCP_HTTP_HOST;
    process.env.CONDUIT_S2S_SECRET = S2S_SECRET;
    const server = await listen();
    expect(server.address).toBe('127.0.0.1');
  });
});

describe('HTTP /mcp authentication', () => {
  beforeEach(() => {
    process.env.CONDUIT_S2S_SECRET = S2S_SECRET;
    process.env.AUTH_MODE = 'gateway';
    process.env.ALERTOPS_API_KEY = ENV_API_KEY;
    process.env.MCP_HTTP_HOST = '127.0.0.1';
  });

  it('returns 401 when the S2S header is missing or invalid and does not log the secret', async () => {
    const logs = captureStderr();
    const server = await listen();
    try {
      const missing = await sendHttp({
        port: server.port,
        method: 'POST',
        path: '/mcp',
        headers: mcpHeaders({ 'x-alertops-api-key': HEADER_API_KEY }),
        body: groupsCall,
      });
      const invalid = await sendHttp({
        port: server.port,
        method: 'POST',
        path: '/mcp',
        headers: mcpHeaders({
          'x-alertops-api-key': HEADER_API_KEY,
          'x-gateway-s2s': mintS2sHeader('wrong-secret'),
        }),
        body: groupsCall,
      });

      expect(missing.status).toBe(401);
      expect(invalid.status).toBe(401);
      expect(missing.body).toContain('X-Gateway-S2S');
      expect(invalid.body).toContain('X-Gateway-S2S');
      expect(missing.body).not.toContain(S2S_SECRET);
      expect(invalid.body).not.toContain(S2S_SECRET);
      expect(missing.body).not.toContain(ENV_API_KEY);
      expect(invalid.body).not.toContain(HEADER_API_KEY);
      expect(logs.text()).not.toContain(S2S_SECRET);
      expect(logs.text()).not.toContain(ENV_API_KEY);
      expect(getCredentialsMock).not.toHaveBeenCalled();
      expect(vi.mocked(fetch)).not.toHaveBeenCalled();
    } finally {
      logs.restore();
    }
  });

  it('returns 401 in gateway mode without credential headers and does not use env credentials', async () => {
    const server = await listen();
    const response = await sendHttp({
      port: server.port,
      method: 'POST',
      path: '/mcp',
      headers: mcpHeaders({ 'x-gateway-s2s': mintS2sHeader(S2S_SECRET) }),
      body: groupsCall,
    });

    expect(response.status).toBe(401);
    expect(response.body).toContain('X-AlertOps-Api-Key');
    expect(response.body).not.toContain(ENV_API_KEY);
    expect(response.body).not.toContain(S2S_SECRET);
    expect(getCredentialsMock).not.toHaveBeenCalled();
    expect(vi.mocked(fetch)).not.toHaveBeenCalled();

    const blank = await sendHttp({
      port: server.port,
      method: 'POST',
      path: '/mcp',
      headers: mcpHeaders({
        'x-gateway-s2s': mintS2sHeader(S2S_SECRET),
        'x-alertops-api-key': '   ',
      }),
      body: groupsCall,
    });
    expect(blank.status).toBe(401);
    expect(getCredentialsMock).not.toHaveBeenCalled();
    expect(vi.mocked(fetch)).not.toHaveBeenCalled();
  });

  it('accepts a valid S2S header plus the API key header and uses that key', async () => {
    const logs = captureStderr();
    const server = await listen();
    try {
      const response = await sendHttp({
        port: server.port,
        method: 'POST',
        path: '/mcp',
        headers: mcpHeaders({
          'x-gateway-s2s': mintS2sHeader(S2S_SECRET),
          'x-alertops-api-key': HEADER_API_KEY,
        }),
        body: groupsCall,
      });

      expect(response.status).toBe(200);
      expect(response.body).not.toContain(S2S_SECRET);
      expect(response.body).not.toContain(ENV_API_KEY);
      expect(vi.mocked(fetch)).toHaveBeenCalled();
      const calledUrl = String(vi.mocked(fetch).mock.calls[0]?.[0]);
      expect(calledUrl).toContain(`APIKey=${HEADER_API_KEY}`);
      expect(calledUrl).not.toContain(ENV_API_KEY);
      expect(logs.text()).not.toContain(S2S_SECRET);
      expect(logs.text()).not.toContain(ENV_API_KEY);
      expect(logs.text()).not.toContain(HEADER_API_KEY);
      expect(getCredentialsMock).toHaveBeenCalled();
    } finally {
      logs.restore();
    }
  });

  it('in env mode accepts a valid S2S header and uses ALERTOPS_API_KEY', async () => {
    process.env.AUTH_MODE = 'env';
    const server = await listen();
    const response = await sendHttp({
      port: server.port,
      method: 'POST',
      path: '/mcp',
      headers: mcpHeaders({ 'x-gateway-s2s': mintS2sHeader(S2S_SECRET) }),
      body: groupsCall,
    });

    expect(response.status).toBe(200);
    expect(vi.mocked(fetch)).toHaveBeenCalled();
    const calledUrl = String(vi.mocked(fetch).mock.calls[0]?.[0]);
    expect(calledUrl).toContain(`APIKey=${ENV_API_KEY}`);
    expect(response.body).not.toContain(S2S_SECRET);
  });

  it('serves /health without authentication and without reading credentials', async () => {
    const server = await listen();
    const response = await sendHttp({
      port: server.port,
      method: 'GET',
      path: '/health',
    });
    expect(response.status).toBe(200);
    const body = JSON.parse(response.body) as { status?: string; mode?: string };
    expect(body.status).toBe('ok');
    expect(body.mode).toBe('gateway');
    expect(response.body).not.toContain(S2S_SECRET);
    expect(response.body).not.toContain(ENV_API_KEY);
    expect(getCredentialsMock).not.toHaveBeenCalled();
    expect(vi.mocked(fetch)).not.toHaveBeenCalled();
  });
});

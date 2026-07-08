/**
 * E2E Smoke Test — runs against the running Docker API.
 * Tests: health → login → categories → create ticket → update → comment → dashboard → delete
 *
 * Usage: npm run test:e2e
 * Requires: docker compose up -d
 *
 * Env:
 *   E2E_HOST       — hostname (default: localhost)
 *   E2E_PORT       — port (default: 80)
 *   E2E_PROTOCOL   — http or https (default: http)
 */
import * as https from 'https';
import * as http from 'http';

const E2E_HOST = process.env.E2E_HOST || 'localhost';
const E2E_PORT = parseInt(process.env.E2E_PORT || '80', 10);
const E2E_PROTOCOL = process.env.E2E_PROTOCOL || 'http';
const agent = E2E_PROTOCOL === 'https'
  ? new https.Agent({ rejectUnauthorized: false })
  : undefined;

function request(method: string, path: string, body?: any, token?: string): Promise<{ status: number; data: any }> {
  return new Promise((resolve, reject) => {
    const lib = E2E_PROTOCOL === 'https' ? https : http;
    const options = {
      method,
      hostname: E2E_HOST,
      port: E2E_PORT,
      path: `/api${path}`,
      agent,
      headers: {
        'Content-Type': 'application/json',
        'X-Requested-With': 'XMLHttpRequest', // required by CsrfGuard
      } as any,
    };
    if (token) (options.headers as any)['Authorization'] = `Bearer ${token}`;
    if (body) (options.headers as any)['Content-Length'] = Buffer.byteLength(JSON.stringify(body));

    const req = lib.request(options, (res) => {
      let data = '';
      res.on('data', (chunk: string) => { data += chunk; });
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode || 500, data: JSON.parse(data) });
        } catch {
          resolve({ status: res.statusCode || 500, data });
        }
      });
    });
    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

describe('E2E Smoke Test', () => {
  // State shared across sequential test cases within this describe block.
  // Tests run in order; each test that produces or consumes shared state
  // reads/writes these variables within its own test body.
  const state: { accessToken: string; ticketId: string; locationId: string } = {
    accessToken: '',
    ticketId: '',
    locationId: '',
  };

  const runId = Date.now().toString(36);

  test('GET /health — returns healthy', async () => {
    const res = await request('GET', '/health');
    expect(res.status).toBe(200);
    expect(res.data.data.status).toBe('healthy');
  });

  test('POST /auth/login — logs in as admin', async () => {
    const res = await request('POST', '/auth/login', {
      email: 'admin@company.com',
      password: 'Admin123!',
    });
    expect(res.status).toBe(201);
    expect(res.data.data.accessToken).toBeDefined();
    expect(res.data.data.user.role).toBe('Admin');
    state.accessToken = res.data.data.accessToken;
  });

  test('POST /auth/refresh — returns 401 without cookie', async () => {
    const res = await request('POST', '/auth/refresh');
    expect(res.status).toBe(401);
    expect(res.data.error.code).toBe('UNAUTHORIZED');
  });

  test('GET /categories — returns list with _count', async () => {
    const res = await request('GET', '/categories', undefined, state.accessToken);
    expect(res.status).toBe(200);
    expect(res.data.data.length).toBeGreaterThan(0);
    expect(res.data.data[0]).toHaveProperty('_count');
  });

  test('POST /locations — creates a location for ticket', async () => {
    const res = await request('POST', '/locations', { name: `E2E Test Location ${runId}` }, state.accessToken);
    expect(res.status).toBe(201);
    expect(res.data.data.id).toBeDefined();
    state.locationId = res.data.data.id;
  });

  test('POST /tickets — creates a ticket', async () => {
    const catsRes = await request('GET', '/categories', undefined, state.accessToken);
    const catId = catsRes.data.data[0].id;
    const subId = catsRes.data.data[0].subCategories[0].id;

    const res = await request('POST', '/tickets', {
      subject: 'E2E Smoke Test',
      description: 'Created by automated E2E smoke test',
      priority: 'Low',
      categoryId: catId,
      subCategoryId: subId,
      locationId: state.locationId,
      itemCode: 'E2E-001',
    }, state.accessToken);
    expect(res.status).toBe(201);
    expect(res.data.data.id).toBeDefined();
    state.ticketId = res.data.data.id;
  });

  test('PATCH /tickets/:id/status — updates to InProgress', async () => {
    const res = await request('PATCH', `/tickets/${state.ticketId}/status`, { status: 'InProgress' }, state.accessToken);
    expect(res.data.data.status).toBe('InProgress');
  });

  test('POST /tickets/:id/comments — adds a public comment', async () => {
    const res = await request('POST', `/tickets/${state.ticketId}/comments`, { content: 'E2E test comment', type: 'PUBLIC' }, state.accessToken);
    expect(res.data.data.id).toBeDefined();
  });

  test('GET /dashboard/stats — returns dashboard', async () => {
    const res = await request('GET', '/dashboard/stats', undefined, state.accessToken);
    expect(res.data.data).toHaveProperty('current');
    expect(res.data.data).toHaveProperty('analytics');
  });

  test('DELETE /tickets/:id — deletes the ticket', async () => {
    const res = await request('DELETE', `/tickets/${state.ticketId}`, undefined, state.accessToken);
    expect(res.status).toBe(200);
    // TransformInterceptor wraps void returns as { data: null }
    expect(res.data).toEqual({ data: null });
  });

  describe('Maintenance Mode', () => {
    test('PATCH /maintenance/mode — enable maintenance (Admin)', async () => {
      const res = await request('PATCH', '/maintenance/mode', { enabled: true, message: 'E2E smoke test maintenance' }, state.accessToken);
      if (res.status !== 200) {
        console.log('DEBUG maintenance enable:', JSON.stringify(res.data));
      }
      expect(res.status).toBe(200);
      expect(res.data.data.enabled).toBe(true);
    });

    test('GET /health — still returns healthy during maintenance', async () => {
      const res = await request('GET', '/health');
      expect(res.status).toBe(200);
      expect(res.data.data.maintenance.enabled).toBe(true);
    });

    test('POST /auth/login — still works during maintenance (exempt path)', async () => {
      const res = await request('POST', '/auth/login', {
        email: 'admin@company.com',
        password: 'Admin123!',
      });
      expect(res.status).toBe(201);
      expect(res.data.data.accessToken).toBeDefined();
      state.accessToken = res.data.data.accessToken;
    });

    test('PATCH /maintenance/mode — disable maintenance', async () => {
      const res = await request('PATCH', '/maintenance/mode', { enabled: false }, state.accessToken);
      expect(res.status).toBe(200);
      expect(res.data.data.enabled).toBe(false);
    });

    test('GET /health — maintenance disabled', async () => {
      const res = await request('GET', '/health');
      expect(res.status).toBe(200);
      expect(res.data.data.maintenance.enabled).toBe(false);
    });
  });
});

/**
 * E2E Extended Tests — role-based access, notifications, users, SLA, CSV, conflict scenarios.
 * Runs against the running Docker API. Requires the smoke test to pass first.
 *
 * Usage: npm run test:e2e
 * Requires: docker compose up -d
 */
import * as https from "https";
import * as http from "http";
import { randomUUID } from "crypto";

const E2E_HOST = process.env.E2E_HOST || "localhost";
const E2E_PORT = parseInt(process.env.E2E_PORT || "80", 10);
const E2E_PROTOCOL = process.env.E2E_PROTOCOL || "http";
const agent =
  E2E_PROTOCOL === "https"
    ? new https.Agent({ rejectUnauthorized: false })
    : undefined;

interface RequestResult {
  status: number;
  data: any;
  headers?: http.IncomingHttpHeaders;
}

function request(
  method: string,
  path: string,
  body?: any,
  token?: string,
): Promise<RequestResult> {
  return new Promise((resolve, reject) => {
    const lib = E2E_PROTOCOL === "https" ? https : http;
    const headers: Record<string, string | number> = {
      "Content-Type": "application/json",
      "X-Requested-With": "XMLHttpRequest",
    };
    if (token) headers["Authorization"] = `Bearer ${token}`;

    const options: http.RequestOptions = {
      method,
      hostname: E2E_HOST,
      port: E2E_PORT,
      path: `/api${path}`,
      agent,
      headers,
    };

    const req = lib.request(options, (res) => {
      let data = "";
      res.on("data", (chunk: string) => {
        data += chunk;
      });
      res.on("end", () => {
        try {
          resolve({
            status: res.statusCode || 500,
            data: JSON.parse(data),
            headers: res.headers,
          });
        } catch {
          resolve({
            status: res.statusCode || 500,
            data,
            headers: res.headers,
          });
        }
      });
    });
    req.on("error", reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

describe("E2E Extended Tests", () => {
  const runId = Date.now().toString(36);
  const tokens: Record<string, string> = {};
  const ids: Record<string, string> = {};
  // selfServiceSubCategory added by FAQ create test

  // ── Auth & Role Isolation ────────────────────────────────────────

  test("POST /auth/login — login as EndUser", async () => {
    const res = await request("POST", "/auth/login", {
      email: "user@company.com",
      password: "User123!",
    });
    if (res.status === 401) {
      console.log(
        "SKIP: EndUser account not seeded. Run with SEED_ON_START=true or create a test EndUser first.",
      );
      return;
    }
    expect(res.status).toBe(201);
    expect(res.data.data.user.role).toBe("EndUser");
    tokens.endUser = res.data.data.accessToken;
  });

  test("GET /dashboard/stats — EndUser is forbidden (403)", async () => {
    if (!tokens.endUser) return;
    const res = await request(
      "GET",
      "/dashboard/stats",
      undefined,
      tokens.endUser,
    );
    expect(res.status).toBe(403);
  });

  test("GET /users — EndUser is forbidden (403)", async () => {
    if (!tokens.endUser) return;
    const res = await request("GET", "/users", undefined, tokens.endUser);
    expect(res.status).toBe(403);
  });

  test("POST /auth/login — login as ITSupport", async () => {
    const res = await request("POST", "/auth/login", {
      email: "support@company.com",
      password: "Support123!",
    });
    expect(res.status).toBe(201);
    expect(res.data.data.user.role).toBe("ITSupport");
    tokens.support = res.data.data.accessToken;
  });

  test("GET /dashboard/stats — ITSupport sees dashboard (200)", async () => {
    const res = await request(
      "GET",
      "/dashboard/stats",
      undefined,
      tokens.support,
    );
    expect(res.status).toBe(200);
  });

  // ── Assignment Flow ─────────────────────────────────────────────

  test("POST /tickets — ITSupport creates ticket", async () => {
    const cats = await request("GET", "/categories", undefined, tokens.support);
    const catId = cats.data.data[0].id;
    const subId = cats.data.data[0].subCategories[0].id;

    const locs = await request("GET", "/locations", undefined, tokens.support);
    const locId = locs.data.data.length > 0 ? locs.data.data[0].id : undefined;

    if (!locId) {
      console.log("SKIP assignment flow: no locations available");
      return;
    }

    const res = await request(
      "POST",
      "/tickets",
      {
        subject: `E2E Assignment Test ${runId}`,
        description: "Testing assignment flow",
        priority: "High",
        categoryId: catId,
        subCategoryId: subId,
        locationId: locId,
        itemCode: "E2E-ASG",
      },
      tokens.support,
    );
    expect(res.status).toBe(201);
    ids.assignedTicket = res.data.data.id;
    // assignedTo may be null or undefined depending on response shape
    expect(res.data.data.assignedToId).toBeNull();
  });

  test("PATCH /tickets/:id/assign — assign to self", async () => {
    if (!ids.assignedTicket) return;
    const selfId = await getOwnUserId(tokens.support);
    if (!selfId) {
      console.log("SKIP: could not resolve own user ID");
      return;
    }
    const res = await request(
      "PATCH",
      `/tickets/${ids.assignedTicket}/assign`,
      { assignedToId: selfId },
      tokens.support,
    );
    expect(res.status).toBe(200);
    expect(res.data.data.assignedToId).toBeTruthy();
  });

  async function getOwnUserId(token: string): Promise<string | null> {
    const res = await request("GET", "/users/assignable", undefined, token);
    if (res.data?.data?.length > 0) return res.data.data[0].id;
    return null;
  }

  // ── Status Transition Conflict ───────────────────────────────────

  test("PATCH /tickets/:id/status — invalid transition → 4xx", async () => {
    if (!ids.assignedTicket) return;
    // Try to jump from InProgress to Closed (invalid — must be Resolved first)
    const res = await request(
      "PATCH",
      `/tickets/${ids.assignedTicket}/status`,
      { status: "Closed" },
      tokens.support,
    );
    // Backend returns 400 (BadRequest) or 409 (Conflict) depending on path
    expect([400, 409]).toContain(res.status);
  });

  // ── SLA Configs ──────────────────────────────────────────────────

  test("GET /sla-configs — Admin lists SLA configs", async () => {
    const login = await request("POST", "/auth/login", {
      email: "admin@company.com",
      password: "Admin123!",
    });
    expect(login.status).toBe(201);
    tokens.admin = login.data.data.accessToken;

    const res = await request("GET", "/sla-configs", undefined, tokens.admin);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.data.data)).toBe(true);
  });

  // ── Notifications ────────────────────────────────────────────────

  test("GET /notifications — returns paginated list", async () => {
    const res = await request("GET", "/notifications", undefined, tokens.admin);
    expect(res.status).toBe(200);
    expect(res.data).toHaveProperty("meta");
    expect(res.data.meta).toHaveProperty("totalPages");
  });

  test("GET /notifications/unread-count — returns count object", async () => {
    const res = await request(
      "GET",
      "/notifications/unread-count",
      undefined,
      tokens.admin,
    );
    expect(res.status).toBe(200);
    // TransformInterceptor wraps { count: N } → { data: { count: N } }
    expect(res.data.data).toHaveProperty("count");
    expect(typeof res.data.data.count).toBe("number");
  });

  test("PATCH /notifications/read-all — marks all read", async () => {
    const res = await request(
      "PATCH",
      "/notifications/read-all",
      {},
      tokens.admin,
    );
    expect(res.status).toBe(200);
    expect(res.data.data).toHaveProperty("message");
  });

  test("GET /notifications/preferences — returns preferences", async () => {
    const res = await request(
      "GET",
      "/notifications/preferences",
      undefined,
      tokens.admin,
    );
    expect(res.status).toBe(200);
    expect(res.data.data).toHaveProperty("preferences");
    expect(res.data.data).toHaveProperty("availableEvents");
  });

  // ── CSV Export ───────────────────────────────────────────────────

  test("GET /tickets/export/csv — returns CSV with headers", async () => {
    await new Promise((r) => setTimeout(r, 200)); // drain rate limit
    const res = await request(
      "GET",
      "/tickets/export/csv",
      undefined,
      tokens.admin,
    );
    expect(res.status).toBe(200);
    expect(typeof res.data).toBe("string");
    // CSV header uses "Ticket #" per tickets.service.ts headers array
    expect(res.data).toContain("Ticket #");
    expect(res.data).toContain("Subject");
  });

  // ── User CRUD (Admin) ───────────────────────────────────────────

  test("POST /users — Admin creates test user", async () => {
    const email = `e2e-test-${runId}@test.com`;
    const res = await request(
      "POST",
      "/users",
      {
        email,
        password: "TestPass123!",
        name: "E2E Test User",
        role: "EndUser",
      },
      tokens.admin,
    );
    if (res.status === 409) {
      console.log(`SKIP: user ${email} already exists (idempotent re-run)`);
      // Try to find the existing user to clean up
      ids.testUser = "skip";
      return;
    }
    expect(res.status).toBe(201);
    expect(res.data.data.email).toBe(email);
    ids.testUser = res.data.data.id;
  });

  test("PATCH /users/:id — update user name", async () => {
    if (!ids.testUser || ids.testUser === "skip") return;
    const res = await request(
      "PATCH",
      `/users/${ids.testUser}`,
      { name: "E2E Test User Updated" },
      tokens.admin,
    );
    expect(res.status).toBe(200);
    expect(res.data.data.name).toBe("E2E Test User Updated");
  });

  test("DELETE /users/:id — delete test user", async () => {
    if (!ids.testUser || ids.testUser === "skip") return;
    const res = await request(
      "DELETE",
      `/users/${ids.testUser}`,
      undefined,
      tokens.admin,
    );
    expect(res.status).toBe(200);
  });

  // ── Health / Correlation ID ──────────────────────────────────────

  test("GET /health — returns health status", async () => {
    await new Promise((r) => setTimeout(r, 200)); // drain rate limit
    const res = await request("GET", "/health");
    expect(res.status).toBe(200);
    expect(res.data.data.status).toBe("healthy");
  });

  // ── FAQ (sub-category-only) ──────────────────────────────────────

  test("GET /faqs — returns public FAQs", async () => {
    await new Promise((r) => setTimeout(r, 200)); // drain rate limit
    const res = await request("GET", "/faqs");
    expect(res.status).toBe(200);
    expect(Array.isArray(res.data.data)).toBe(true);
  });

  // ── Self-Service Flow ────────────────────────────────────────────

  test("POST /faqs — Admin creates a sub-category-scoped FAQ", async () => {
    const categories = await request("GET", "/categories", undefined, tokens.admin);
    ids.selfServiceCategory = categories.data.data[0].id;
    const subId = categories.data.data[0].subCategories[0].id;
    ids.selfServiceSubCategory = subId;
    const response = await request(
      "POST",
      "/faqs",
      {
        question: `Reset E2E Wi-Fi ${runId}`,
        answer: "Restart the wireless adapter.",
        subCategoryId: subId,
        keywords: ["wifi", "adapter"],
        isActive: true,
        showOnLogin: true,
      },
      tokens.admin,
    );
    expect(response.status).toBe(201);
    ids.selfServiceFaq = response.data.data.id;
  });

  it("returns contextual recommendations by subCategoryId", async () => {
    if (!tokens.endUser) return;
    const response = await request(
      "GET",
      `/faqs/recommendations?subCategoryId=${ids.selfServiceSubCategory}&query=wifi%20adapter`,
      undefined,
      tokens.endUser,
    );
    expect(response.status).toBe(200);
    expect(response.data.data.length).toBeLessThanOrEqual(5);
    expect(response.data.data[0]).not.toHaveProperty("keywords");
    expect(response.data.data[0]).toHaveProperty("subCategoryId");
  });

  it("rejects FAQ analytics for non-admin users", async () => {
    if (!tokens.endUser) return;
    const response = await request("GET", "/faqs/analytics?range=30d", undefined, tokens.endUser);
    expect(response.status).toBe(403);
  });

  it("links a created ticket to a self-service session via subCategory", async () => {
    if (!tokens.endUser) return;
    const sessionId = randomUUID();
    const categories = await request("GET", "/categories", undefined, tokens.endUser);
    const category = categories.data.data.find((item: any) => item.id === ids.selfServiceCategory);
    const locations = await request("GET", "/locations", undefined, tokens.endUser);
    if (!category?.subCategories?.[0] || !locations.data.data[0]) return;

    const interactionResponse = await request(
      "POST",
      "/faqs/interactions",
      {
        sessionId,
        eventType: "RecommendationsShown",
        subCategoryId: ids.selfServiceSubCategory,
      },
      tokens.endUser,
    );
    expect(interactionResponse.status).toBe(201);

    const ticketResponse = await request(
      "POST",
      "/tickets",
      {
        subject: `E2E Self Service ${runId}`,
        description: "Testing a ticket linked to a self-service session.",
        priority: "Low",
        categoryId: ids.selfServiceCategory,
        subCategoryId: ids.selfServiceSubCategory,
        locationId: locations.data.data[0].id,
        itemCode: "E2E-SELF",
        selfServiceSessionId: sessionId,
      },
      tokens.endUser,
    );
    expect(ticketResponse.status).toBe(201);
    ids.selfServiceTicket = ticketResponse.data.data.id;

    const analyticsResponse = await request("GET", "/faqs/analytics?range=30d", undefined, tokens.admin);
    expect(analyticsResponse.status).toBe(200);
    expect(analyticsResponse.data.data.continuedToTicketSessions).toBeGreaterThanOrEqual(1);
    expect(analyticsResponse.data.data).toHaveProperty("subCategoryStats");
    expect(analyticsResponse.data.data).not.toHaveProperty("categoryStats");
  });

  it("DELETE sub-category with existing FAQ returns 409", async () => {
    if (!ids.selfServiceSubCategory) return;
    await new Promise((r) => setTimeout(r, 200)); // rate limit drain
    const res = await request(
      "DELETE",
      `/categories/${ids.selfServiceCategory}/sub-categories/${ids.selfServiceSubCategory}`,
      undefined,
      tokens.admin,
    );
    expect(res.status).toBe(409);
  });

  test("DELETE self-service fixtures — Admin cleanup", async () => {
    if (ids.selfServiceTicket) {
      const ticket = await request("DELETE", `/tickets/${ids.selfServiceTicket}`, undefined, tokens.admin);
      expect(ticket.status).toBe(200);
    }
    if (ids.selfServiceFaq) {
      const faq = await request("DELETE", `/faqs/${ids.selfServiceFaq}`, undefined, tokens.admin);
      expect(faq.status).toBe(200);
    }
  });

  // ── Cleanup (Admin can delete any ticket) ────────────────────────

  test("DELETE /tickets/:id — Admin cleans up assigned ticket", async () => {
    if (!ids.assignedTicket) return;
    await new Promise((r) => setTimeout(r, 200)); // rate limit drain
    const res = await request(
      "DELETE",
      `/tickets/${ids.assignedTicket}`,
      undefined,
      tokens.admin,
    );
    expect(res.status).toBe(200);
  });

  // Drain nginx rate limit before returning
  test("_drain_rate_limit", async () => {
    await new Promise((r) => setTimeout(r, 200));
    expect(true).toBe(true);
  });
});

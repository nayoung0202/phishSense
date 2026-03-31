import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  TENANT_A_ID,
  buildProjectFixture,
  buildProjectTargetFixture,
  buildTemplateFixture,
  buildTrainingPageFixture,
} from "@/test/tenantFixtures";

let project: any;
let projectTarget: any;
let template: any;

const tenantStorageMock = vi.hoisted(() => ({
  getPublicPhishingContextByTrackingToken: vi.fn(),
  updateProjectTargetForTenant: vi.fn(),
  updateProjectForTenant: vi.fn(),
}));

vi.mock("@/server/tenant/tenantStorage", () => tenantStorageMock);

import { GET } from "./route";

beforeEach(() => {
  vi.clearAllMocks();

  project = buildProjectFixture({
    id: "project-1",
    tenantId: TENANT_A_ID,
    name: "test project",
    templateId: "template-1",
    trainingPageId: "page-1",
    status: "running",
  });
  projectTarget = buildProjectTargetFixture({
    id: "pt-1",
    tenantId: TENANT_A_ID,
    projectId: "project-1",
    targetId: "target-1",
    trackingToken: "track-1",
    status: "sent",
  });
  template = buildTemplateFixture({
    id: "template-1",
    tenantId: TENANT_A_ID,
    body: "<p>test</p>",
    maliciousPageContent: "<p>malicious page</p>",
  });

  tenantStorageMock.getPublicPhishingContextByTrackingToken.mockImplementation(async () => ({
    tenantId: TENANT_A_ID,
    projectTarget,
    project,
    template,
    trainingPage: buildTrainingPageFixture({
      id: "page-1",
      tenantId: TENANT_A_ID,
      status: "active",
    }),
  }));
  tenantStorageMock.updateProjectTargetForTenant.mockImplementation(
    async (_tenantId: string, _id: string, payload: any) => {
      projectTarget = { ...projectTarget, ...payload };
      return projectTarget;
    },
  );
  tenantStorageMock.updateProjectForTenant.mockImplementation(
    async (_tenantId: string, _id: string, payload: any) => {
      project = { ...project, ...payload };
      return project;
    },
  );
});

describe("GET /p/[trackingToken]", () => {
  it("increments counts only once for duplicate opens", async () => {
    await GET(new Request("http://localhost/p/track-1"), {
      params: Promise.resolve({ token: "track-1" }),
    });

    await GET(new Request("http://localhost/p/track-1"), {
      params: Promise.resolve({ token: "track-1" }),
    });

    expect(tenantStorageMock.updateProjectForTenant).toHaveBeenCalledTimes(1);
    expect(project.openCount).toBe(1);
    expect(project.clickCount).toBe(1);
  });

  it("renders only the inner card when malicious content uses a fixed modal wrapper", async () => {
    template = buildTemplateFixture({
      id: "template-1",
      tenantId: TENANT_A_ID,
      maliciousPageContent:
        '<div style="position:fixed;inset:0;display:flex"><section class="card"><form action="{{TRAINING_URL}}"><button type="submit">submit</button></form></section></div>',
    });

    const response = await GET(new Request("http://localhost/p/track-1"), {
      params: Promise.resolve({ token: "track-1" }),
    });
    const html = await response.text();

    expect(html).toContain('<section class="card">');
    expect(html).not.toContain("position:fixed");
    expect(html).not.toContain("inset:0");
  });

  it("replaces saved TRAINING_URL typo placeholders with real links", async () => {
    template = buildTemplateFixture({
      id: "template-1",
      tenantId: TENANT_A_ID,
      maliciousPageContent:
        '<div><form action="{{tranning_url}}}"><button type="submit">submit</button></form><a href="{{tranning_url}}}" target="_blank" rel="noopener noreferrer">training</a></div>',
    });

    const response = await GET(new Request("http://localhost/p/track-1"), {
      params: Promise.resolve({ token: "track-1" }),
    });
    const html = await response.text();

    expect(html).toContain('action="http://localhost/t/track-1"');
    expect(html).toContain('href="http://localhost/t/track-1"');
    expect(html).not.toContain("tranning_url");
  });
});

import { describe, expect, test } from "bun:test";
import { renderDashboard, type DashboardData } from "../src/views/dashboard";

const fixture: DashboardData = {
  user: { name: "Leo", initials: "LG", avatarColor: "#CFE3D7" },
  teams: [
    { slug: "acme-infra", name: "Acme Infra", docCount: 2, color: "#0F8A6C", expanded: true },
    { slug: "acme-billing", name: "Acme Billing", docCount: 1, color: "#C26A3E", expanded: false }
  ],
  recent: [
    {
      id: 11,
      title: "Auth login flow",
      pathLabel: "acme-infra / cherry / auth/login-flow.html",
      tag: { label: "team", color: "#0F8A6C" },
      owner: { name: "Leo", initials: "LG", color: "#CFE3D7" },
      whenRel: "12m ago"
    },
    {
      id: 12,
      title: "R2 upload contract",
      pathLabel: "acme-infra / htmldock / api/upload-contract.html",
      owner: { name: "Ming", initials: "MG", color: "#E5D7B5" },
      whenRel: "1h ago"
    }
  ],
  projects: [
    {
      id: 1,
      teamSlug: "acme-infra",
      slug: "cherry",
      name: "Cherry",
      description: "Auth and product flows",
      color: "#0F8A6C",
      docCount: 1,
      members: [{ initials: "LG", color: "#CFE3D7" }],
      updatedRel: "12m ago",
      rows: [
        {
          id: 11,
          title: "Auth login flow",
          pathLabel: "acme-infra / cherry / auth/login-flow.html",
          owner: { name: "Leo", initials: "LG", color: "#CFE3D7" },
          whenRel: "12m ago"
        }
      ]
    }
  ],
  today: [
    {
      initials: "LG",
      color: "#CFE3D7",
      whenRel: "12m ago",
      bodyHtml: "<b>Leo</b> uploaded <span>auth/login-flow.html</span>"
    }
  ],
  totals: { pages: 2, teams: 2, updatedToday: 1 }
};

describe("renderDashboard", () => {
  const html = renderDashboard(fixture);

  test("renders required dashboard landmarks and data", () => {
    expect(html).toContain("#FBF8F1");
    expect(html).toContain("#0F8A6C");
    expect(html).toContain("<title>htmldock");
    expect(html).toContain("acme-infra");
    expect(html).toContain("Acme Billing");
    expect(html).toContain("Auth login flow");
    expect(html).toContain("R2 upload contract");
    expect(html).toContain("Welcome back");
    expect(html).toContain("htmldock CLI");
    expect(html).toContain("Today");
    expect(html).toMatch(/acme-infra.*cherry.*auth\/login-flow\.html/s);
  });

  test("excludes deferred or unsafe UI concepts", () => {
    expect(html).not.toMatch(/iframe/i);
    expect(html).not.toMatch(/drag and drop|draganddrop/i);
    expect(html).not.toMatch(/v7/i);
    expect(html).not.toMatch(/\bcomments\b/i);
    expect(html).not.toContain('href="/install"');
    expect(html).not.toContain('href="/settings"');
  });

  test("keeps legacy-only workspaces out of the primary timeline", () => {
    const legacyOnly = renderDashboard({
      ...fixture,
      teams: [{ slug: "legacy", name: "Legacy", docCount: 1, color: "#A89F8A", expanded: false }],
      projects: [{
        id: 2,
        teamSlug: "legacy",
        slug: "old-project",
        name: "Old project",
        description: "",
        color: "#A89F8A",
        docCount: 1,
        members: [],
        updatedRel: "12m ago",
        rows: []
      }],
      recent: [{
        id: 99,
        title: "Smoke fixture",
        pathLabel: "old-project / verify/smoke.html",
        owner: { name: "Leo", initials: "LG", color: "#CFE3D7" },
        whenRel: "12m ago"
      }],
      totals: { pages: 1, teams: 1, updatedToday: 1 }
    });

    expect(legacyOnly).toContain("Now connect a project");
    expect(legacyOnly).toContain("Archive");
    expect(legacyOnly).not.toContain("Smoke fixture");
  });
});

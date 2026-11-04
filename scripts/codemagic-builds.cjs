// Latest Codemagic builds (iOS / Android): status, build number, commit and
// times — so "is the new build ready?" can be answered without opening
// Codemagic. Read-only. Run from GitHub → Actions → "Codemagic builds".
// Needs the repo secret CODEMAGIC_API_TOKEN (Codemagic → Teams → Personal
// account / team → Integrations → Codemagic API → Show).
const token = process.env.CODEMAGIC_API_TOKEN || "";
const lines = [];
const out = (s) => lines.push(s);

async function api(path) {
  const res = await fetch(`https://api.codemagic.io${path}`, { headers: { "x-auth-token": token, "Content-Type": "application/json" } });
  if (!res.ok) throw new Error(`${path}: HTTP ${res.status} ${(await res.text()).slice(0, 200)}`);
  return res.json();
}

const sydney = (iso) => (iso ? new Date(iso).toLocaleString("en-AU", { timeZone: "Australia/Sydney", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }) : "—");

(async () => {
  try {
    if (!token) throw new Error("CODEMAGIC_API_TOKEN secret missing — add it in GitHub → Settings → Secrets → Actions.");
    const { applications = [] } = await api("/apps");
    const app = applications.find((a) => /zach-mcivor-personal-training-application/i.test(a.repository?.htmlUrl || a.repository?.url || "")) || applications[0];
    if (!app) throw new Error("no Codemagic app found for this token");
    const { builds = [] } = await api(`/builds?appId=${app._id}`);
    out(`## Codemagic builds — ${app.appName}`);
    out("| # | Workflow | Status | Started (Sydney) | Finished (Sydney) | Commit | TestFlight |");
    out("|---|---|---|---|---|---|---|");
    for (const b of builds.slice(0, 8)) {
      const wf = app.workflows?.[b.workflowId]?.name || b.workflowId || "";
      const publish = (b.buildActions || []).find((a) => /publish|app store|testflight/i.test(a.name || ""));
      out(`| ${b.index ?? ""} | ${wf} | ${b.status} | ${sydney(b.startedAt)} | ${sydney(b.finishedAt)} | ${(b.commit?.commitMessage || "").split("\n")[0].slice(0, 50)} (${(b.commit?.hash || "").slice(0, 7)}) | ${publish ? publish.status : "—"} |`);
    }
  } catch (err) {
    out(`❌ ${err.message}`);
    process.exitCode = 1;
  }
  const report = lines.join("\n") + "\n";
  console.log(report);
  if (process.env.GITHUB_STEP_SUMMARY) require("node:fs").appendFileSync(process.env.GITHUB_STEP_SUMMARY, report);
})();

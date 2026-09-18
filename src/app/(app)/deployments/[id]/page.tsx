import { db } from "@/db/client";
import { robots, deployments, deploymentInvestmentCases, deploymentBudgetItems, BUDGET_CATEGORIES, DEPLOYMENT_STATUSES, alerts as alertsTable } from "@/db/schema";
import { getDeploymentDetail } from "@/lib/finance/aggregate";
import { notFound } from "next/navigation";
import { Card, CardHeader, CardBody } from "@/components/ui/Card";
import { Badge, deploymentStatusTone, severityTone, robotStatusTone, invoiceStatusTone, type Tone } from "@/components/ui/Badge";
import { Select, Input, TextArea, Button } from "@/components/ui/form";
import { fmtCurrency, fmtPct, fmtMonths, fmtNumber } from "@/lib/finance/calculations";
import { updateDeploymentStatus, updateDeploymentNotes, assignRobot, unassignRobot } from "@/lib/actions/deployments";
import {
  createOrUpdateInvestmentCase, submitInvestmentCaseForReview, decideInvestmentCase, type InvestmentCaseDecision,
} from "@/lib/actions/investmentCase";
import { createBudgetRevision, approveBudgetVersion } from "@/lib/actions/budgets";
import { checkInvestmentCaseThresholds, type InvestmentCaseOutputs } from "@/lib/finance/investmentCase";
import { InvestmentCaseDecisionForm, type InvestmentCaseDecisionState } from "@/components/forms/InvestmentCaseDecisionForm";
import { BudgetRevisionForm, type BudgetRevisionFormState } from "@/components/forms/BudgetRevisionForm";
import { ConfirmSubmitButton } from "@/components/forms/ConfirmSubmitButton";
import { getSession, canEditFinanceAssumptions, canEditOperations } from "@/lib/auth/session";
import { CostBreakdownChart, MonthlyTrendChart } from "@/components/charts/DeploymentCharts";
import { PrintButton } from "@/components/ui/PrintButton";
import { eq, desc } from "drizzle-orm";
import Link from "next/link";

const INVESTMENT_CASE_TONE: Record<string, Tone> = {
  draft: "neutral",
  submitted: "info",
  needs_repricing: "warn",
  needs_revision: "warn",
  approved: "good",
  rejected: "bad",
  deferred: "warn",
  superseded: "neutral",
};

export default async function DeploymentDetailPage({ params }: PageProps<"/deployments/[id]">) {
  const { id } = await params;
  const detail = await getDeploymentDetail(id);
  if (!detail) notFound();

  const session = await getSession();
  const role = session?.role ?? "viewer";

  const [depRow] = await db.select().from(deployments).where(eq(deployments.id, id));
  const allRobots = await db.select().from(robots);
  const assignedIds = new Set(detail.robots.map((r) => r.robotId));
  const availableRobots = allRobots.filter((r) => !assignedIds.has(r.id) && (r.status === "available" || r.status === "idle"));
  const deploymentAlerts = await db.select().from(alertsTable).where(eq(alertsTable.deploymentId, id));

  const investmentCases = await db
    .select()
    .from(deploymentInvestmentCases)
    .where(eq(deploymentInvestmentCases.deploymentId, id))
    .orderBy(desc(deploymentInvestmentCases.version));
  const latestCase = investmentCases[0] ?? null;
  const latestOutputs = latestCase ? (JSON.parse(latestCase.outputsJson) as InvestmentCaseOutputs) : null;
  const thresholdCheck = latestCase && latestOutputs ? checkInvestmentCaseThresholds(latestOutputs, detail.expectedUptimePct, detail.expectedUtilizationPct) : null;

  const allBudgetVersions = await db.select().from(deploymentBudgetItems).where(eq(deploymentBudgetItems.deploymentId, id));
  const approvedBudgetItems = allBudgetVersions.filter((b) => b.isApproved);
  const approvedVersion = approvedBudgetItems[0]?.version ?? 0;
  const maxBudgetVersion = allBudgetVersions.length > 0 ? Math.max(...allBudgetVersions.map((b) => b.version)) : 0;
  const hasPendingBudgetDraft = maxBudgetVersion > approvedVersion;
  const draftBudgetItems = hasPendingBudgetDraft ? allBudgetVersions.filter((b) => b.version === maxBudgetVersion) : [];
  const draftByCategory = new Map<string, number>(draftBudgetItems.map((d) => [d.category, d.plannedAmount]));
  const budgetFormCurrent: Record<string, { amount: number; upfront: boolean }> = {};
  for (const b of hasPendingBudgetDraft ? draftBudgetItems : approvedBudgetItems) {
    budgetFormCurrent[b.category] = { amount: b.plannedAmount, upfront: b.isUpfront };
  }
  const budgetTableCategories = [...new Set([...detail.costsByCategory.map((c) => c.category), ...draftByCategory.keys()])];

  async function changeStatus(formData: FormData) {
    "use server";
    await updateDeploymentStatus(id, formData);
  }
  async function saveNotes(formData: FormData) {
    "use server";
    await updateDeploymentNotes(id, formData);
  }
  async function assign(formData: FormData) {
    "use server";
    await assignRobot(id, formData);
  }
  async function generateCase(formData: FormData) {
    "use server";
    const scenario = String(formData.get("scenario") ?? "base") as "conservative" | "base" | "aggressive";
    await createOrUpdateInvestmentCase(id, scenario);
  }
  async function submitForReview() {
    "use server";
    if (!latestCase) return;
    await submitInvestmentCaseForReview(latestCase.id, id);
  }
  async function decideCase(_prevState: InvestmentCaseDecisionState | null, formData: FormData): Promise<InvestmentCaseDecisionState> {
    "use server";
    if (!latestCase) return { error: "No investment case to decide on." };
    const decision = String(formData.get("decision")) as InvestmentCaseDecision;
    const decisionNote = String(formData.get("decisionNote") ?? "");
    const overrideReason = String(formData.get("overrideReason") ?? "").trim() || undefined;
    try {
      await decideInvestmentCase(latestCase.id, id, decision, decisionNote, overrideReason);
      return {};
    } catch (e) {
      return { error: e instanceof Error ? e.message : "Failed to record decision." };
    }
  }
  async function budgetRevisionAction(_prevState: BudgetRevisionFormState | null, formData: FormData): Promise<BudgetRevisionFormState> {
    "use server";
    try {
      return await createBudgetRevision(id, formData);
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : "Failed to save budget revision." };
    }
  }
  async function approveDraftBudget() {
    "use server";
    if (maxBudgetVersion > 0) await approveBudgetVersion(id, maxBudgetVersion);
  }

  const totalActualCost = detail.costsByCategory.reduce((s, c) => s + c.actual, 0);
  const totalPlannedCost = detail.costsByCategory.reduce((s, c) => s + c.planned, 0);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-semibold text-[var(--color-navy-900)]">{detail.deploymentName}</h1>
            <Badge tone={deploymentStatusTone(detail.status)}>{detail.status.replace(/_/g, " ")}</Badge>
          </div>
          <p className="mt-1 text-sm text-[var(--color-graphite-500)]">
            <Link href={`/customers/${detail.customerId}`} className="hover:underline">{detail.customerName}</Link> · {detail.plannedStartDate} → {detail.plannedEndDate}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <form action={changeStatus} className="flex items-center gap-2 print:hidden">
            <Select name="status" defaultValue={detail.status} className="text-xs">
              {DEPLOYMENT_STATUSES.map((s) => <option key={s} value={s}>{s.replace(/_/g, " ")}</option>)}
            </Select>
            <button type="submit" className="rounded-lg border border-[var(--color-graphite-300)] px-3 py-2 text-xs font-medium hover:bg-[var(--color-graphite-100)]">Update</button>
          </form>
          <PrintButton label="Print P&L" />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Card><CardBody><p className="text-xs text-[var(--color-graphite-500)]">Recognized revenue</p><p className="mt-1 text-lg font-semibold">{fmtCurrency(detail.recognizedRevenueToDate)}</p></CardBody></Card>
        <Card><CardBody><p className="text-xs text-[var(--color-graphite-500)]">Contribution margin</p><p className={`mt-1 text-lg font-semibold ${detail.contributionMarginActual < 0 ? "text-[var(--color-bad-text)]" : ""}`}>{fmtCurrency(detail.contributionMarginActual)} ({fmtPct(detail.contributionMarginPctActual)})</p></CardBody></Card>
        <Card><CardBody><p className="text-xs text-[var(--color-graphite-500)]">Cash collected</p><p className="mt-1 text-lg font-semibold">{fmtCurrency(detail.cashCollected)}</p></CardBody></Card>
        <Card><CardBody><p className="text-xs text-[var(--color-graphite-500)]">Expected payback</p><p className="mt-1 text-lg font-semibold">{fmtMonths(detail.expectedPaybackMonths)}</p></CardBody></Card>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Card><CardBody><p className="text-xs text-[var(--color-graphite-500)]">Utilization (actual / target)</p><p className="mt-1 text-lg font-semibold">{fmtPct(detail.utilizationActualPct)} <span className="text-xs font-normal text-[var(--color-graphite-500)]">/ {detail.expectedUtilizationPct}%</span></p></CardBody></Card>
        <Card><CardBody><p className="text-xs text-[var(--color-graphite-500)]">Uptime (actual / target)</p><p className="mt-1 text-lg font-semibold">{fmtPct(detail.uptimeActualPct)} <span className="text-xs font-normal text-[var(--color-graphite-500)]">/ {detail.expectedUptimePct}%</span></p></CardBody></Card>
        <Card><CardBody><p className="text-xs text-[var(--color-graphite-500)]">Cost per pound</p><p className="mt-1 text-lg font-semibold">{detail.costPerPoundActual !== null ? `$${detail.costPerPoundActual.toFixed(2)}` : "N/A"} <span className="text-xs font-normal text-[var(--color-graphite-500)]">/ ${detail.manualLaborCostPerLb?.toFixed(2) ?? "—"} benchmark</span></p></CardBody></Card>
        <Card><CardBody><p className="text-xs text-[var(--color-graphite-500)]">Robots assigned</p><p className="mt-1 text-lg font-semibold">{detail.robotsAssigned} / {detail.robotsPlanned} planned</p></CardBody></Card>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title="Budget vs. actual direct cost" subtitle={`Total: ${fmtCurrency(totalActualCost)} actual vs. ${fmtCurrency(totalPlannedCost)} planned`} />
          <CardBody>
            {detail.costsByCategory.length > 0 ? <CostBreakdownChart data={detail.costsByCategory} /> : <p className="text-sm text-[var(--color-graphite-500)]">No cost data recorded yet.</p>}
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Revenue, cost & contribution margin by month" />
          <CardBody>
            {detail.monthlyTrend.length > 0 ? <MonthlyTrendChart data={detail.monthlyTrend} /> : <p className="text-sm text-[var(--color-graphite-500)]">No monthly activity recorded yet.</p>}
          </CardBody>
        </Card>
      </div>

      <Card>
        <CardHeader
          title="Investment case"
          subtitle={
            latestCase
              ? `Version ${latestCase.version} · ${latestCase.scenario} scenario · generated from the current approved budget`
              : "No investment case yet — generate one from the current approved budget to see expected margin, payback, and up-front cash need before committing robots."
          }
          action={
            canEditOperations(role) ? (
              <form action={generateCase} className="flex items-center gap-2 print:hidden">
                <Select name="scenario" defaultValue={latestCase?.scenario ?? "base"} className="text-xs">
                  <option value="conservative">Conservative</option>
                  <option value="base">Base</option>
                  <option value="aggressive">Aggressive</option>
                </Select>
                <button type="submit" className="rounded-lg bg-[var(--color-navy-800)] px-3 py-2 text-xs font-medium text-white">
                  {latestCase ? (latestCase.isImmutable ? "Recompute as new version" : "Recompute") : "Generate"}
                </button>
              </form>
            ) : undefined
          }
        />
        <CardBody className="space-y-4">
          {!latestCase && <p className="text-sm text-[var(--color-graphite-500)]">Illustrative demo data — no investment case generated yet.</p>}
          {latestCase && latestOutputs && (
            <>
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone={INVESTMENT_CASE_TONE[latestCase.status] ?? "neutral"}>{latestCase.status.replace(/_/g, " ")}</Badge>
                {latestCase.isImmutable && <Badge tone="neutral" withDot={false}>Frozen snapshot</Badge>}
                <span className="text-xs text-[var(--color-graphite-500)]">v{latestCase.version} · {latestCase.scenario} scenario</span>
              </div>

              <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                <div><p className="text-xs text-[var(--color-graphite-500)]">Expected bookings</p><p className="mt-1 text-sm font-semibold">{fmtCurrency(latestOutputs.expectedBookings)}</p></div>
                <div><p className="text-xs text-[var(--color-graphite-500)]">Expected contribution margin</p><p className="mt-1 text-sm font-semibold">{fmtCurrency(latestOutputs.expectedContributionMargin)} ({fmtPct(latestOutputs.expectedContributionMarginPct)})</p></div>
                <div><p className="text-xs text-[var(--color-graphite-500)]">Expected payback</p><p className="mt-1 text-sm font-semibold">{fmtMonths(latestOutputs.expectedPaybackMonths)}</p></div>
                <div><p className="text-xs text-[var(--color-graphite-500)]">Up-front cash required</p><p className="mt-1 text-sm font-semibold">{fmtCurrency(latestOutputs.expectedUpfrontCashRequirement)}</p></div>
                <div><p className="text-xs text-[var(--color-graphite-500)]">Cost / lb</p><p className="mt-1 text-sm font-semibold">{latestOutputs.expectedCostPerPound !== null ? `$${latestOutputs.expectedCostPerPound.toFixed(2)}` : "N/A"}</p></div>
                <div><p className="text-xs text-[var(--color-graphite-500)]">Revenue / robot-hr</p><p className="mt-1 text-sm font-semibold">{latestOutputs.expectedRevenuePerRobotHour !== null ? fmtCurrency(latestOutputs.expectedRevenuePerRobotHour) : "N/A"}</p></div>
                <div><p className="text-xs text-[var(--color-graphite-500)]">Break-even price / lb</p><p className="mt-1 text-sm font-semibold">{latestOutputs.breakEvenPricePerPound !== null ? `$${latestOutputs.breakEvenPricePerPound.toFixed(2)}` : "N/A"}</p></div>
                <div>
                  <p className="text-xs text-[var(--color-graphite-500)]">Targets met</p>
                  <p className="mt-1 text-sm font-semibold">
                    <span className={latestOutputs.meetsMarginTarget ? "text-[var(--color-good-text)]" : "text-[var(--color-bad-text)]"}>{latestOutputs.meetsMarginTarget ? "✓" : "✗"} margin</span>
                    {" · "}
                    <span className={latestOutputs.meetsPaybackTarget ? "text-[var(--color-good-text)]" : "text-[var(--color-bad-text)]"}>{latestOutputs.meetsPaybackTarget ? "✓" : "✗"} payback</span>
                  </p>
                </div>
              </div>

              {thresholdCheck && !thresholdCheck.passed && (
                <div className="rounded-lg border border-[var(--color-warn-border)] bg-[var(--color-warn-bg)] px-4 py-3 text-sm text-[var(--color-warn-text)]">
                  <p className="font-medium">Fails {thresholdCheck.failures.length} finance threshold{thresholdCheck.failures.length === 1 ? "" : "s"} (default thresholds):</p>
                  <ul className="mt-1 list-disc pl-5">
                    {thresholdCheck.failures.map((f) => <li key={f.rule}>{f.detail}</li>)}
                  </ul>
                </div>
              )}

              {(latestCase.overrideReason || latestCase.decisionNote) && (
                <div className="space-y-1 text-xs text-[var(--color-graphite-500)]">
                  {latestCase.overrideReason && <p>Override reason: {latestCase.overrideReason}</p>}
                  {latestCase.decisionNote && <p>Decision note: {latestCase.decisionNote}</p>}
                  {latestCase.decidedBy && <p>Decided by {latestCase.decidedBy} on {latestCase.decidedAt ? new Date(latestCase.decidedAt).toLocaleDateString() : "—"}</p>}
                </div>
              )}

              {latestCase.status === "draft" && canEditOperations(role) && (
                <form action={submitForReview} className="print:hidden">
                  <button type="submit" className="rounded-lg border border-[var(--color-graphite-300)] px-3 py-2 text-xs font-medium hover:bg-[var(--color-graphite-100)]">Submit for review</button>
                </form>
              )}

              {!latestCase.isImmutable && latestCase.status !== "draft" && canEditFinanceAssumptions(role) && (
                <InvestmentCaseDecisionForm key={`${latestCase.id}-${latestCase.status}`} action={decideCase} />
              )}
              {!latestCase.isImmutable && latestCase.status !== "draft" && !canEditFinanceAssumptions(role) && (
                <p className="text-xs text-[var(--color-graphite-500)]">Only Finance/Admin accounts can record an approval decision on this case.</p>
              )}
            </>
          )}

          {investmentCases.length > 1 && (
            <details className="print:hidden">
              <summary className="cursor-pointer text-xs font-medium text-[var(--color-graphite-500)]">Version history ({investmentCases.length})</summary>
              <table className="mt-2 w-full text-xs">
                <thead>
                  <tr className="text-left text-[var(--color-graphite-500)]">
                    <th className="py-1 pr-3">Version</th><th className="pr-3">Scenario</th><th className="pr-3">Status</th><th>Decided</th>
                  </tr>
                </thead>
                <tbody>
                  {investmentCases.map((c) => (
                    <tr key={c.id} className="border-t border-[var(--color-graphite-100)]">
                      <td className="py-1 pr-3">v{c.version}</td>
                      <td className="pr-3 capitalize">{c.scenario}</td>
                      <td className="pr-3 capitalize"><Badge tone={INVESTMENT_CASE_TONE[c.status] ?? "neutral"}>{c.status.replace(/_/g, " ")}</Badge></td>
                      <td>{c.decidedAt ? new Date(c.decidedAt).toLocaleDateString() : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </details>
          )}
        </CardBody>
      </Card>

      <Card>
        <CardHeader
          title="Planned budget"
          subtitle={
            hasPendingBudgetDraft
              ? `Version ${maxBudgetVersion} draft pending approval · currently approved: version ${approvedVersion || "none"}`
              : `Version ${approvedVersion || "none"} approved · this is what drives the investment case and P&L "planned" figures`
          }
        />
        <CardBody className="space-y-4">
          <div className="table-scroll">
            <table className="w-full min-w-[600px] border-collapse text-sm">
              <thead>
                <tr className="border-b border-[var(--color-graphite-100)] bg-[var(--color-paper)] text-xs uppercase tracking-wide text-[var(--color-graphite-500)]">
                  <th className="px-4 py-2 text-left">Category</th>
                  <th className="px-4 py-2 text-right">Approved</th>
                  {hasPendingBudgetDraft && <th className="px-4 py-2 text-right">Draft (v{maxBudgetVersion})</th>}
                  <th className="px-4 py-2 text-right">Actual</th>
                  <th className="px-4 py-2 text-right">Variance</th>
                </tr>
              </thead>
              <tbody>
                {budgetTableCategories.map((cat) => {
                  const row = detail.costsByCategory.find((c) => c.category === cat);
                  const approved = row?.planned ?? 0;
                  const actual = row?.actual ?? 0;
                  const draft = draftByCategory.get(cat);
                  return (
                    <tr key={cat} className="border-b border-[var(--color-graphite-100)] last:border-0">
                      <td className="px-4 py-2.5 capitalize">{cat.replace(/_/g, " ")}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums">{fmtCurrency(approved)}</td>
                      {hasPendingBudgetDraft && <td className="px-4 py-2.5 text-right tabular-nums">{draft !== undefined ? fmtCurrency(draft) : "—"}</td>}
                      <td className="px-4 py-2.5 text-right tabular-nums">{fmtCurrency(actual)}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums">{approved > 0 ? fmtPct(((actual - approved) / approved) * 100) : "—"}</td>
                    </tr>
                  );
                })}
                {budgetTableCategories.length === 0 && (
                  <tr><td colSpan={hasPendingBudgetDraft ? 5 : 4} className="px-4 py-8 text-center text-sm text-[var(--color-graphite-500)]">No budget items yet.</td></tr>
                )}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-[var(--color-graphite-200)] font-semibold">
                  <td className="px-4 py-2.5">Total</td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{fmtCurrency(totalPlannedCost)}</td>
                  {hasPendingBudgetDraft && <td className="px-4 py-2.5 text-right tabular-nums">{fmtCurrency([...draftByCategory.values()].reduce((s, v) => s + v, 0))}</td>}
                  <td className="px-4 py-2.5 text-right tabular-nums">{fmtCurrency(totalActualCost)}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{totalPlannedCost > 0 ? fmtPct(((totalActualCost - totalPlannedCost) / totalPlannedCost) * 100) : "—"}</td>
                </tr>
              </tfoot>
            </table>
          </div>

          {hasPendingBudgetDraft && canEditFinanceAssumptions(role) && (
            <form action={approveDraftBudget} className="print:hidden">
              <ConfirmSubmitButton
                variant="primary"
                confirmMessage={`Approve budget version ${maxBudgetVersion}? This becomes the new plan used for the investment case and P&L, and supersedes version ${approvedVersion || "none"}.`}
              >
                Approve version {maxBudgetVersion}
              </ConfirmSubmitButton>
            </form>
          )}

          {canEditOperations(role) && (
            <details className="print:hidden">
              <summary className="cursor-pointer text-sm font-medium text-[var(--color-navy-800)]">Edit budget (creates a new draft version)</summary>
              <div className="mt-3">
                <BudgetRevisionForm
                  key={`${approvedVersion}-${maxBudgetVersion}`}
                  action={budgetRevisionAction}
                  categories={BUDGET_CATEGORIES}
                  current={budgetFormCurrent}
                />
              </div>
            </details>
          )}
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Robot roster" action={
          <form action={assign} className="flex items-center gap-2">
            <Select name="robotId" required className="text-xs">
              <option value="">Assign a robot...</option>
              {availableRobots.map((r) => <option key={r.id} value={r.id}>{r.robotCode} ({r.model})</option>)}
            </Select>
            <Input name="assignmentStart" type="date" defaultValue={new Date().toISOString().slice(0, 10)} className="w-36 text-xs" />
            <button type="submit" className="rounded-lg bg-[var(--color-navy-800)] px-3 py-2 text-xs font-medium text-white">Assign</button>
          </form>
        } />
        <CardBody className="p-0">
          <div className="table-scroll">
            <table className="w-full min-w-[720px] border-collapse text-sm">
              <thead>
                <tr className="border-b border-[var(--color-graphite-100)] bg-[var(--color-paper)] text-xs uppercase tracking-wide text-[var(--color-graphite-500)]">
                  <th className="px-4 py-2 text-left">Robot</th>
                  <th className="px-4 py-2 text-left">Status</th>
                  <th className="px-4 py-2 text-right">Utilization</th>
                  <th className="px-4 py-2 text-right">Uptime</th>
                  <th className="px-4 py-2 text-right">Contribution margin</th>
                  <th className="px-4 py-2 text-right">Intervention hrs</th>
                  <th className="px-4 py-2 text-right"></th>
                </tr>
              </thead>
              <tbody>
                {detail.robots.map((r) => (
                  <tr key={r.robotId} className="border-b border-[var(--color-graphite-100)] last:border-0">
                    <td className="px-4 py-2.5"><Link href={`/robots/${r.robotId}`} className="font-medium text-[var(--color-navy-800)] hover:underline">{r.robotCode}</Link></td>
                    <td className="px-4 py-2.5"><Badge tone={robotStatusTone(r.status)}>{r.status}</Badge></td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{fmtPct(r.utilizationPct)}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{fmtPct(r.uptimePct)}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{fmtCurrency(r.contributionMarginTotal)}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{fmtNumber(r.interventionHoursTotal, 1)}</td>
                    <td className="px-4 py-2.5 text-right">
                      <form action={async () => { "use server"; await unassignRobot(id, r.robotId); }}>
                        <button type="submit" className="text-xs text-[var(--color-graphite-500)] hover:text-[var(--color-bad-text)]">Unassign</button>
                      </form>
                    </td>
                  </tr>
                ))}
                {detail.robots.length === 0 && <tr><td colSpan={7} className="px-4 py-8 text-center text-sm text-[var(--color-graphite-500)]">No robots assigned yet.</td></tr>}
              </tbody>
            </table>
          </div>
        </CardBody>
      </Card>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title="Invoices" />
          <CardBody className="p-0">
            <div className="table-scroll">
              <table className="w-full min-w-[480px] border-collapse text-sm">
                <thead>
                  <tr className="border-b border-[var(--color-graphite-100)] bg-[var(--color-paper)] text-xs uppercase tracking-wide text-[var(--color-graphite-500)]">
                    <th className="px-4 py-2 text-left">Invoice</th>
                    <th className="px-4 py-2 text-right">Amount</th>
                    <th className="px-4 py-2 text-left">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {detail.invoices.map((inv) => (
                    <tr key={inv.id} className="border-b border-[var(--color-graphite-100)] last:border-0">
                      <td className="px-4 py-2.5 font-mono text-xs">{inv.invoiceNumber}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums">{fmtCurrency(inv.amount)}</td>
                      <td className="px-4 py-2.5"><Badge tone={invoiceStatusTone(inv.status)}>{inv.status}</Badge></td>
                    </tr>
                  ))}
                  {detail.invoices.length === 0 && <tr><td colSpan={3} className="px-4 py-8 text-center text-sm text-[var(--color-graphite-500)]">No invoices tied directly to this deployment.</td></tr>}
                </tbody>
              </table>
            </div>
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Related alerts" />
          <CardBody className="space-y-2">
            {deploymentAlerts.length === 0 && <p className="text-sm text-[var(--color-graphite-500)]">No alerts for this deployment.</p>}
            {deploymentAlerts.map((a) => (
              <div key={a.id} className="rounded-lg border border-[var(--color-graphite-100)] p-3">
                <div className="flex items-center gap-2">
                  <Badge tone={severityTone(a.severity)}>{a.severity}</Badge>
                  <p className="text-sm font-medium">{a.title}</p>
                </div>
                <p className="mt-1 text-xs text-[var(--color-graphite-500)]">{a.recommendedAction}</p>
              </div>
            ))}
          </CardBody>
        </Card>
      </div>

      <Card>
        <CardHeader title="Notes & next action" subtitle="Assigned operations owner and running notes for this deployment." />
        <CardBody>
          <form action={saveNotes} className="space-y-3">
            <Input name="operationsOwner" defaultValue={detail.operationsOwner ?? ""} placeholder="Operations owner" />
            <TextArea name="notes" rows={3} defaultValue={depRow?.notes ?? ""} placeholder="Notes..." />
            <Button type="submit" variant="secondary">Save notes</Button>
          </form>
        </CardBody>
      </Card>
    </div>
  );
}

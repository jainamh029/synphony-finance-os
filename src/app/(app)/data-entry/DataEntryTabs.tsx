"use client";

import { useState } from "react";
import { Card, CardHeader, CardBody } from "@/components/ui/Card";
import { Field, Input, Select, Button } from "@/components/ui/form";
import { CsvUploader } from "@/components/forms/CsvUploader";
import { logRobotMetric, logCost, logLabor, importCostsCsv, importLaborCsv, importMetricsCsv, importInvoicesCsv } from "@/lib/actions/dataEntry";
import { COST_TYPES } from "@/db/schema";

type Option = { id: string; label: string };

const TABS = ["Weekly robot metrics", "Costs", "Labor", "Invoices"] as const;

export function DataEntryTabs({ deployments, robots }: { deployments: Option[]; robots: Option[] }) {
  const [tab, setTab] = useState<(typeof TABS)[number]>("Weekly robot metrics");

  return (
    <div className="space-y-4">
      <div className="flex gap-1 rounded-lg bg-[var(--color-graphite-100)] p-1">
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`flex-1 rounded-md px-3 py-2 text-sm font-medium transition ${tab === t ? "bg-white text-[var(--color-navy-900)] shadow-sm" : "text-[var(--color-graphite-500)]"}`}
          >
            {t}
          </button>
        ))}
      </div>

      {tab === "Weekly robot metrics" && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader title="Log weekly metrics" subtitle="One row per robot per week" />
            <CardBody>
              <form action={logRobotMetric} className="grid grid-cols-2 gap-3">
                <Field label="Date" htmlFor="m_date" required><Input id="m_date" name="date" type="date" required /></Field>
                <Field label="Robot" htmlFor="m_robot" required>
                  <Select id="m_robot" name="robotId" required>
                    {robots.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}
                  </Select>
                </Field>
                <Field label="Deployment" htmlFor="m_dep" required>
                  <Select id="m_dep" name="deploymentId" required>
                    {deployments.map((d) => <option key={d.id} value={d.id}>{d.label}</option>)}
                  </Select>
                </Field>
                <Field label="Available hrs" htmlFor="m_avail" required><Input id="m_avail" name="availableHours" type="number" step="0.1" required /></Field>
                <Field label="Active hrs" htmlFor="m_active" required><Input id="m_active" name="activeHours" type="number" step="0.1" required /></Field>
                <Field label="Productive hrs" htmlFor="m_prod" required><Input id="m_prod" name="productiveHours" type="number" step="0.1" required /></Field>
                <Field label="Downtime hrs" htmlFor="m_down"><Input id="m_down" name="downtimeHours" type="number" step="0.1" defaultValue={0} /></Field>
                <Field label="Intervention hrs" htmlFor="m_interv"><Input id="m_interv" name="interventionHours" type="number" step="0.1" defaultValue={0} /></Field>
                <Field label="Output units" htmlFor="m_out"><Input id="m_out" name="outputUnits" type="number" step="1" defaultValue={0} /></Field>
                <Field label="Pounds harvested" htmlFor="m_lbs"><Input id="m_lbs" name="poundsHarvested" type="number" step="1" defaultValue={0} /></Field>
                <Field label="Maintenance incidents" htmlFor="m_maint"><Input id="m_maint" name="maintenanceIncidents" type="number" step="1" defaultValue={0} /></Field>
                <Field label="Repair cost ($)" htmlFor="m_repair"><Input id="m_repair" name="repairCost" type="number" step="1" defaultValue={0} /></Field>
                <Field label="Spare parts cost ($)" htmlFor="m_parts"><Input id="m_parts" name="sparePartsCost" type="number" step="1" defaultValue={0} /></Field>
                <Field label="Technician hrs" htmlFor="m_techhrs"><Input id="m_techhrs" name="technicianHours" type="number" step="0.1" defaultValue={0} /></Field>
                <Field label="Technician labor cost ($)" htmlFor="m_techcost"><Input id="m_techcost" name="technicianLaborCost" type="number" step="1" defaultValue={0} /></Field>
                <div className="col-span-2"><Button type="submit">Log metric</Button></div>
              </form>
            </CardBody>
          </Card>
          <Card>
            <CardHeader title="Bulk import" />
            <CardBody>
              <CsvUploader action={importMetricsCsv} templateHref="/templates/robot_metrics_template.csv" label="Robot metrics CSV" />
            </CardBody>
          </Card>
        </div>
      )}

      {tab === "Costs" && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader title="Log a cost" />
            <CardBody>
              <form action={logCost} className="grid grid-cols-2 gap-3">
                <Field label="Deployment" htmlFor="c_dep" required>
                  <Select id="c_dep" name="deploymentId" required>
                    {deployments.map((d) => <option key={d.id} value={d.id}>{d.label}</option>)}
                  </Select>
                </Field>
                <Field label="Date" htmlFor="c_date" required><Input id="c_date" name="date" type="date" required /></Field>
                <Field label="Cost type" htmlFor="c_type" required>
                  <Select id="c_type" name="costType" required>
                    {COST_TYPES.map((t) => <option key={t} value={t}>{t.replace(/_/g, " ")}</option>)}
                  </Select>
                </Field>
                <Field label="Amount ($)" htmlFor="c_amount" required><Input id="c_amount" name="amount" type="number" step="0.01" required /></Field>
                <Field label="Vendor" htmlFor="c_vendor"><Input id="c_vendor" name="vendor" /></Field>
                <div className="col-span-2"><Button type="submit">Log cost</Button></div>
              </form>
            </CardBody>
          </Card>
          <Card>
            <CardHeader title="Bulk import" />
            <CardBody>
              <CsvUploader action={importCostsCsv} templateHref="/templates/costs_template.csv" label="Costs CSV" />
            </CardBody>
          </Card>
        </div>
      )}

      {tab === "Labor" && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader title="Log labor hours" />
            <CardBody>
              <form action={logLabor} className="grid grid-cols-2 gap-3">
                <Field label="Deployment" htmlFor="l_dep" required>
                  <Select id="l_dep" name="deploymentId" required>
                    {deployments.map((d) => <option key={d.id} value={d.id}>{d.label}</option>)}
                  </Select>
                </Field>
                <Field label="Date" htmlFor="l_date" required><Input id="l_date" name="date" type="date" required /></Field>
                <Field label="Employee role" htmlFor="l_role" required><Input id="l_role" name="employeeRole" required placeholder="Field Technician" /></Field>
                <Field label="Task type" htmlFor="l_task"><Input id="l_task" name="taskType" placeholder="maintenance" /></Field>
                <Field label="Hours" htmlFor="l_hours" required><Input id="l_hours" name="hours" type="number" step="0.25" required /></Field>
                <Field label="Hourly cost ($)" htmlFor="l_cost" required><Input id="l_cost" name="hourlyCost" type="number" step="0.5" required /></Field>
                <div className="col-span-2"><Button type="submit">Log labor</Button></div>
              </form>
            </CardBody>
          </Card>
          <Card>
            <CardHeader title="Bulk import" />
            <CardBody>
              <CsvUploader action={importLaborCsv} templateHref="/templates/labor_logs_template.csv" label="Labor logs CSV" />
            </CardBody>
          </Card>
        </div>
      )}

      {tab === "Invoices" && (
        <Card>
          <CardHeader title="Bulk import invoices" subtitle="For one-off invoices, use Billing & Collections → New invoice instead." />
          <CardBody>
            <CsvUploader action={importInvoicesCsv} templateHref="/templates/invoices_template.csv" label="Invoices CSV" />
          </CardBody>
        </Card>
      )}
    </div>
  );
}

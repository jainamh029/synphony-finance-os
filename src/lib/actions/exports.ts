"use server";

import { db } from "@/db/client";
import { customers, contracts, invoices, deployments, robots, costs, laborLogs, robotMetrics } from "@/db/schema";

export async function getExportTable(table: "customers" | "contracts" | "invoices" | "deployments" | "robots" | "costs" | "laborLogs" | "robotMetrics") {
  switch (table) {
    case "customers": return db.select().from(customers);
    case "contracts": return db.select().from(contracts);
    case "invoices": return db.select().from(invoices);
    case "deployments": return db.select().from(deployments);
    case "robots": return db.select().from(robots);
    case "costs": return db.select().from(costs);
    case "laborLogs": return db.select().from(laborLogs);
    case "robotMetrics": return db.select().from(robotMetrics);
  }
}

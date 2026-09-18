import { db } from "@/db/client";
import { customers } from "@/db/schema";
import { Card, CardHeader, CardBody } from "@/components/ui/Card";
import { ContractForm } from "@/components/forms/ContractForm";
import { createContract } from "@/lib/actions/contracts";

export default async function NewContractPage({ searchParams }: PageProps<"/contracts/new">) {
  const { customerId } = await searchParams;
  const allCustomers = await db.select().from(customers).orderBy(customers.farmName);

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <h1 className="text-xl font-semibold text-[var(--color-navy-900)]">New contract</h1>
      <Card>
        <CardHeader title="Deal terms" subtitle="Bookings, backlog, and a billing schedule are derived from these terms as soon as the contract is created." />
        <CardBody>
          <ContractForm action={createContract} customers={allCustomers} defaultCustomerId={typeof customerId === "string" ? customerId : undefined} submitLabel="Create contract" />
        </CardBody>
      </Card>
    </div>
  );
}

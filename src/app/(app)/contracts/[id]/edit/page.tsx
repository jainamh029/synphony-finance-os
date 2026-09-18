import { db } from "@/db/client";
import { contracts, customers } from "@/db/schema";
import { eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { Card, CardHeader, CardBody } from "@/components/ui/Card";
import { ContractForm } from "@/components/forms/ContractForm";
import { updateContract } from "@/lib/actions/contracts";

export default async function EditContractPage({ params }: PageProps<"/contracts/[id]/edit">) {
  const { id } = await params;
  const [contract] = await db.select().from(contracts).where(eq(contracts.id, id));
  if (!contract) notFound();
  const allCustomers = await db.select().from(customers).orderBy(customers.farmName);

  async function action(formData: FormData) {
    "use server";
    await updateContract(id, formData);
  }

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <h1 className="text-xl font-semibold text-[var(--color-navy-900)]">Edit contract terms</h1>
      <Card>
        <CardHeader
          title="Deal terms"
          subtitle="Changing value, dates, fees, pricing, or billing terms bumps the contract version — the Billing Schedule tab will flag itself as out of date until regenerated."
        />
        <CardBody>
          <ContractForm action={action} customers={allCustomers} defaultValues={contract} submitLabel="Save changes" />
        </CardBody>
      </Card>
    </div>
  );
}

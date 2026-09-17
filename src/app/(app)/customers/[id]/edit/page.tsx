import { db } from "@/db/client";
import { customers } from "@/db/schema";
import { eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { Card, CardHeader, CardBody } from "@/components/ui/Card";
import { CustomerForm } from "@/components/forms/CustomerForm";
import { updateCustomer } from "@/lib/actions/customers";
import { redirect } from "next/navigation";

export default async function EditCustomerPage({ params }: PageProps<"/customers/[id]/edit">) {
  const { id } = await params;
  const [customer] = await db.select().from(customers).where(eq(customers.id, id));
  if (!customer) notFound();

  async function action(formData: FormData) {
    "use server";
    await updateCustomer(id, formData);
    redirect(`/customers/${id}`);
  }

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <h1 className="text-xl font-semibold text-[var(--color-navy-900)]">Edit {customer.farmName}</h1>
      <Card>
        <CardHeader title="Customer profile" />
        <CardBody>
          <CustomerForm action={action} defaultValues={customer} submitLabel="Save changes" />
        </CardBody>
      </Card>
    </div>
  );
}

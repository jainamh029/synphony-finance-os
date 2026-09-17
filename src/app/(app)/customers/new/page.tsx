import { Card, CardHeader, CardBody } from "@/components/ui/Card";
import { CustomerForm } from "@/components/forms/CustomerForm";
import { createCustomer } from "@/lib/actions/customers";

export default function NewCustomerPage() {
  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <h1 className="text-xl font-semibold text-[var(--color-navy-900)]">New customer / farm account</h1>
      <Card>
        <CardHeader title="Customer profile" subtitle="Step 1 of the deal-to-renewal workflow: create the account before adding a contract." />
        <CardBody>
          <CustomerForm action={createCustomer} submitLabel="Create customer" />
        </CardBody>
      </Card>
    </div>
  );
}

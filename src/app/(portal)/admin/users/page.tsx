import Link from "next/link";
import { requireCustomerSession } from "@/lib/customer-session.server";
import { UserAccounts } from "./UserAccounts";
export default async function UsersPage() {
  const session=await requireCustomerSession();
  if(!session?.capabilities.includes("users.all.manage") || session.company.type!=="internal") {
    return <main style={{padding:24}}><h1>User accounts</h1><p>Verified RUF administrator access is required.</p><Link href="/signin">Sign in</Link></main>;
  }
  return <UserAccounts viewerId={session.id} csrfToken={session.csrfToken} canManage={session.capabilities.includes("roles.manage")}/>;
}

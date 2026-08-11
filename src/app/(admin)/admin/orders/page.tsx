import { getOrders } from "@/data/repository";
import { OrdersInbox } from "./OrdersInbox";

export default async function AdminOrdersPage() {
  const orders = await getOrders();
  return <OrdersInbox orders={orders} />;
}

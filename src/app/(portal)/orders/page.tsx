import { Pending } from "../Pending";

export default function OrdersPage() {
  return (
    <Pending eyebrow="Awaiting design" title="Order status">
      Orders in reverse chronological order, with progress and delivery status.
      Described on slide 56 but not drawn, and it depends on the quote flow
      which is phase two. Listed in `clients.md` §1.1.
    </Pending>
  );
}

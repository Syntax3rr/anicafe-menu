import { doc, updateDoc } from "firebase/firestore";
import { OrderCard } from "../components/OrderCard";
import { OrderGrid } from "../components/OrderGrid";
import { EmptyState, ErrorState, LoadingState } from "../components/StatusMessage";
import { showUndoNotification } from "../components/undoNotification";
import { db } from "../firebase";
import { useFlashIds } from "../hooks/useFlashIds";
import { useOpenOrders } from "../hooks/useOpenOrders";
import { isOrderReady, notifyError, SPECIALTY_CATEGORY } from "../utils";

const EXCLUDED = [SPECIALTY_CATEGORY];

/** Servers: see kitchen progress and mark orders delivered */
export function ServerPage() {
  const { orders, error } = useOpenOrders();
  // Servers act when the kitchen finishes, so flash orders as they become ready rather than as
  // they arrive. Longer than the new-order flash, since servers are often away from the screen.
  // An order that gets a box unticked can flash again once it's ready again.
  const readyIds = orders?.filter((order) => isOrderReady(order, EXCLUDED)).map((order) => order.id) ?? null;
  const notReadyIds = orders?.filter((order) => !isOrderReady(order, EXCLUDED)).map((order) => order.id) ?? [];
  const { flashIds: justReadyIds, dismiss } = useFlashIds(readyIds, { durationMs: 30_000, resetIds: notReadyIds });

  const setCompleted = (orderId: string, completed: boolean) => updateDoc(doc(db, "orders", orderId), { completed });

  const completeOrder = async (orderId: string, orderNumber: number) => {
    try {
      await setCompleted(orderId, true);
      showUndoNotification(orderId, `Order #${orderNumber} completed!`, () => setCompleted(orderId, false));
    } catch (error) {
      notifyError(`Failed to complete order #${orderNumber}`, error);
    }
  };

  if (error) return <ErrorState title="Failed to load orders" message={error} />;
  if (orders === null) return <LoadingState label="Loading orders..." />;
  if (orders.length === 0)
    return <EmptyState title="No open orders">Orders appear here as soon as the cashier submits them.</EmptyState>;

  return (
    <OrderGrid>
      {orders.map((order) => (
        <OrderCard
          key={order.id}
          flash={justReadyIds.has(order.id) ? "ready" : undefined}
          onInteract={() => dismiss(order.id)}
          order={order}
          excludeCategories={EXCLUDED}
          completeOrder={() => completeOrder(order.id, order.number)}
          completeCategory="view"
        />
      ))}
    </OrderGrid>
  );
}

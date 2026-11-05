import { doc, updateDoc } from "firebase/firestore";
import { OrderCard } from "../components/OrderCard";
import { OrderGrid } from "../components/OrderGrid";
import { EmptyState, ErrorState, LoadingState } from "../components/StatusMessage";
import { showUndoNotification } from "../components/undoNotification";
import { db } from "../firebase";
import { useNewIds } from "../hooks/useNewIds";
import { useOpenOrders } from "../hooks/useOpenOrders";
import { notifyError, SPECIALTY_CATEGORY } from "../utils";

/** Servers: see kitchen progress and mark orders delivered */
export function ServerPage() {
  const { orders, error } = useOpenOrders();
  const newIds = useNewIds(orders?.map((order) => order.id) ?? null);

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
  if (orders.length === 0) return <EmptyState title="No open orders">Orders appear here as soon as the cashier submits them.</EmptyState>;

  return (
    <OrderGrid>
      {orders.map((order) => (
        <OrderCard
          key={order.id}
          isNew={newIds.has(order.id)}
          order={order}
          excludeCategories={[SPECIALTY_CATEGORY]}
          completeOrder={() => completeOrder(order.id, order.number)}
          completeCategory="view"
        />
      ))}
    </OrderGrid>
  );
}

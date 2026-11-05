import { doc, FieldPath, updateDoc } from "firebase/firestore";
import { OrderCard } from "../components/OrderCard";
import { OrderGrid } from "../components/OrderGrid";
import { db } from "../firebase";
import { useOpenOrders } from "../hooks/useOpenOrders";
import { notifyError, SPECIALTY_CATEGORY } from "../utils";

/** Food/Drink station: tick off each category of an order once it's prepared */
export function KitchenPage() {
  const { orders, error } = useOpenOrders();

  const checkCategory = async (orderId: string, categoryName: string, value: boolean) => {
    try {
      // FieldPath instead of a dotted string so category names containing dots work
      await updateDoc(doc(db, "orders", orderId), new FieldPath("categories", categoryName, "done"), value);
    } catch (error) {
      notifyError(`Failed to update ${categoryName}`, error);
    }
  };

  if (error) return <div>Failed to load orders: {error}</div>;
  if (orders === null) return <div>Loading orders...</div>;

  return (
    <OrderGrid>
      {orders.map((order) => (
        <OrderCard
          key={order.id}
          order={order}
          excludeCategories={[SPECIALTY_CATEGORY]}
          completeCategory={checkCategory}
        />
      ))}
    </OrderGrid>
  );
}

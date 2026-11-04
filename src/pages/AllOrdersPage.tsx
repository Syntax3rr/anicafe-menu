import { useEffect, useMemo, useState } from "react";
import { collection, onSnapshot, orderBy, query } from "firebase/firestore";
import { Stack, Table, Title } from "@mantine/core";
import { db } from "../firebase";
import { orderFromDoc } from "../fromFirestore";
import { MenuCategory, Order, OrderItems } from "../types";
import { byKey, formatCents, notifySnapshotError } from "../utils";

const LOG_CATEGORIES = ["Food", "Drinks", "Specialty"];

const itemsToString = (items: OrderItems | undefined) =>
  items === undefined
    ? "-"
    : Object.entries(items)
        .sort(byKey)
        .map(([itemName, { quantity }]) => `${quantity} ${itemName}`)
        .join(", ");

/** Rows for the analytics table: totals, then quantity sold per item (menu items first, in menu order) */
function computeAnalytics(orders: Order[], menu: MenuCategory[]): [string, string | number][] {
  const soldByItem = new Map<string, number>(
    menu.flatMap((category) => category.items.map((item) => [item.itemName, 0] as const)),
  );
  let totalItems = 0;
  let totalRevenueCents = 0;
  for (const order of orders) {
    totalRevenueCents += order.totalCents;
    for (const category of Object.values(order.categories)) {
      for (const [itemName, { quantity }] of Object.entries(category.items)) {
        totalItems += quantity;
        soldByItem.set(itemName, (soldByItem.get(itemName) ?? 0) + quantity);
      }
    }
  }
  return [
    ["Total Orders", orders.length],
    ["Total Items", totalItems],
    ["Total Revenue", formatCents(totalRevenueCents)],
    ...soldByItem,
  ];
}

export function AllOrdersPage({ menu }: { menu: MenuCategory[] }) {
  const [orders, setOrders] = useState<Order[] | null>(null);

  useEffect(
    () =>
      onSnapshot(
        query(collection(db, "orders"), orderBy("timestamp")),
        (snapshot) => setOrders(snapshot.docs.map(orderFromDoc)),
        notifySnapshotError("orders"),
      ),
    [],
  );

  const analytics = useMemo(() => computeAnalytics(orders ?? [], menu), [orders, menu]);

  if (orders === null) return <div>Loading orders...</div>;

  return (
    <Stack>
      <Title order={2}>Analytics</Title>
      <Table>
        <Table.Thead>
          <Table.Tr>
            <Table.Th>Item</Table.Th>
            <Table.Th>Quantity Sold</Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {analytics.map(([label, value]) => (
            <Table.Tr key={label}>
              <Table.Td>{label}</Table.Td>
              <Table.Td>{value}</Table.Td>
            </Table.Tr>
          ))}
        </Table.Tbody>
      </Table>
      <Title order={2}>All Orders</Title>
      <Table>
        <Table.Thead>
          <Table.Tr>
            <Table.Th>#</Table.Th>
            <Table.Th>Time</Table.Th>
            <Table.Th>Price</Table.Th>
            <Table.Th>Discount Applied</Table.Th>
            <Table.Th>Completed</Table.Th>
            <Table.Th>Notes</Table.Th>
            {LOG_CATEGORIES.map((categoryName) => (
              <Table.Th key={categoryName}>{categoryName}</Table.Th>
            ))}
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {orders.map((order) => (
            <Table.Tr key={order.id}>
              <Table.Td>{order.number}</Table.Td>
              <Table.Td>{order.timestamp?.toDate().toLocaleTimeString("en-US")}</Table.Td>
              <Table.Td>{formatCents(order.totalCents)}</Table.Td>
              <Table.Td>{formatCents(order.discountCents)}</Table.Td>
              <Table.Td>{order.completed ? "Yes" : "No"}</Table.Td>
              <Table.Td>{order.notes}</Table.Td>
              {LOG_CATEGORIES.map((categoryName) => (
                <Table.Td key={categoryName}>{itemsToString(order.categories[categoryName]?.items)}</Table.Td>
              ))}
            </Table.Tr>
          ))}
        </Table.Tbody>
      </Table>
    </Stack>
  );
}

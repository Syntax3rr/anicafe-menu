import { useEffect, useMemo, useState } from "react";
import { collection, onSnapshot, orderBy, query } from "firebase/firestore";
import { Badge, Paper, SimpleGrid, Stack, Table, Text, Title } from "@mantine/core";
import { EmptyState, ErrorState, LoadingState } from "../components/StatusMessage";
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

/** Headline totals, then quantity sold per item (menu items first, in menu order) */
function computeAnalytics(orders: Order[], menu: MenuCategory[]) {
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
  return {
    totals: [
      ["Orders", orders.length.toLocaleString("en-US")],
      ["Items Sold", totalItems.toLocaleString("en-US")],
      ["Revenue", formatCents(totalRevenueCents)],
    ],
    soldByItem: [...soldByItem],
  };
}

export function AllOrdersPage({ menu }: { menu: MenuCategory[] }) {
  const [loadError, setLoadError] = useState<string | null>(null);
  const [orders, setOrders] = useState<Order[] | null>(null);

  useEffect(
    () =>
      onSnapshot(
        query(collection(db, "orders"), orderBy("timestamp")),
        (snapshot) => setOrders(snapshot.docs.map(orderFromDoc)),
        (error) => {
          setLoadError(error.message);
          notifySnapshotError("orders")(error);
        },
      ),
    [],
  );

  const analytics = useMemo(() => computeAnalytics(orders ?? [], menu), [orders, menu]);

  if (loadError) return <ErrorState title="Failed to load orders" message={loadError} />;
  if (orders === null) return <LoadingState label="Loading orders..." />;

  return (
    <Stack>
      <Title order={2}>Analytics</Title>
      <SimpleGrid cols={{ base: 1, xs: 3 }}>
        {analytics.totals.map(([label, value]) => (
          <Paper key={label} withBorder radius="md" p="md">
            <Text size="xs" c="dimmed" tt="uppercase" fw={700}>
              {label}
            </Text>
            <Text fw={700} size="xl">
              {value}
            </Text>
          </Paper>
        ))}
      </SimpleGrid>
      <Table.ScrollContainer minWidth={320}>
        <Table striped highlightOnHover withTableBorder>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Item</Table.Th>
              <Table.Th ta="right">Quantity Sold</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {analytics.soldByItem.map(([itemName, quantity]) => (
              <Table.Tr key={itemName}>
                <Table.Td>{itemName}</Table.Td>
                <Table.Td ta="right" c={quantity === 0 ? "dimmed" : undefined}>
                  {quantity}
                </Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      </Table.ScrollContainer>
      <Title order={2}>All Orders</Title>
      {orders.length === 0 ? (
        <EmptyState title="No orders yet" />
      ) : (
        <Table.ScrollContainer minWidth={900}>
          <Table striped highlightOnHover withTableBorder>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>#</Table.Th>
                <Table.Th>Time</Table.Th>
                <Table.Th ta="right">Price</Table.Th>
                <Table.Th ta="right">Discount</Table.Th>
                <Table.Th>Status</Table.Th>
                <Table.Th>Notes</Table.Th>
                {LOG_CATEGORIES.map((categoryName) => (
                  <Table.Th key={categoryName}>{categoryName}</Table.Th>
                ))}
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {orders.map((order) => (
                <Table.Tr key={order.id}>
                  <Table.Td fw={600}>{order.number}</Table.Td>
                  <Table.Td>
                    {order.timestamp?.toDate().toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}
                  </Table.Td>
                  <Table.Td ta="right">{formatCents(order.totalCents)}</Table.Td>
                  <Table.Td ta="right" c={order.discountCents === 0 ? "dimmed" : undefined}>
                    {formatCents(order.discountCents)}
                  </Table.Td>
                  <Table.Td>
                    <Badge variant="light" color={order.completed ? "green" : "yellow"}>
                      {order.completed ? "Completed" : "Open"}
                    </Badge>
                  </Table.Td>
                  <Table.Td>{order.notes}</Table.Td>
                  {LOG_CATEGORIES.map((categoryName) => (
                    <Table.Td key={categoryName}>{itemsToString(order.categories[categoryName]?.items)}</Table.Td>
                  ))}
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </Table.ScrollContainer>
      )}
    </Stack>
  );
}

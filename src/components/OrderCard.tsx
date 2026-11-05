import { Fragment } from "react";
import { Badge, Button, Card, Checkbox, Group, Table, Text, Title } from "@mantine/core";
import { useNow } from "../hooks/useNow";
import { Order } from "../types";
import { byKey, zoneToColor } from "../utils";
import classes from "./OrderCard.module.css";

/** Orders waiting longer than this get their age highlighted */
const LATE_MINUTES = 15;

function formatAge(minutes: number) {
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  return `${Math.floor(minutes / 60)} h ${minutes % 60} min ago`;
}

function OrderAge({ placedAtMs }: { placedAtMs: number }) {
  const now = useNow();
  const minutes = Math.max(0, Math.floor((now - placedAtMs) / 60_000));
  const late = minutes >= LATE_MINUTES;
  return (
    <Text size="sm" c={late ? "orange" : "dimmed"} fw={late ? 600 : undefined}>
      {formatAge(minutes)}
    </Text>
  );
}

interface OrderCardProps {
  order: Order;
  excludeCategories?: string[];
  completeOrder?: () => Promise<void>;
  /** "view" shows read-only checkboxes; a function makes them editable; omitted hides them */
  completeCategory?: "view" | ((orderId: string, categoryName: string, value: boolean) => Promise<void>);
  /** Just arrived: the card pulses to catch the station's eye */
  isNew?: boolean;
}

export function OrderCard({ order, excludeCategories = [], completeOrder, completeCategory, isNew }: OrderCardProps) {
  const categories = Object.entries(order.categories)
    .filter(([categoryName]) => !excludeCategories.includes(categoryName))
    .sort(byKey);
  // Every category this station tracks is done, so the order is ready to go out
  const ready = completeCategory !== undefined && categories.length > 0 && categories.every(([, c]) => c.done);
  // Null until the server confirms the write
  const placedAtMs = order.timestamp?.toMillis();

  return (
    <Card
      shadow="sm"
      radius="md"
      p="md"
      withBorder
      className={isNew ? classes.new : undefined}
      style={{
        height: "420px",
        display: "flex",
        flexDirection: "column",
        borderColor: ready ? "var(--mantine-color-green-filled)" : undefined,
        borderWidth: ready ? 2 : undefined,
      }}
    >
      <Card.Section withBorder>
        <Group justify="space-between" wrap="nowrap" mih={36}>
          <Group gap="xs">
            <Title order={3}>Order #{order.number}</Title>
            {order.zone && <Badge color={zoneToColor(order.zone)}>{order.zone}</Badge>}
            {isNew && <Badge color="blue">New</Badge>}
            {ready && (
              <Badge color="green" variant="light">
                Ready
              </Badge>
            )}
          </Group>
          {completeOrder && <Button onClick={completeOrder}>Complete</Button>}
        </Group>
        {placedAtMs !== undefined && <OrderAge placedAtMs={placedAtMs} />}
        {order.notes && (
          <Text lineClamp={3} mt={4} style={{ overflowWrap: "break-word" }}>
            <Text span fw={600}>
              Notes:
            </Text>{" "}
            {order.notes}
          </Text>
        )}
      </Card.Section>
      <Card.Section style={{ overflow: "auto" }}>
        <Table>
          <Table.Tbody>
            {categories.map(([categoryName, category]) => (
              <Fragment key={categoryName}>
                <Table.Tr>
                  <Table.Th>
                    <Title order={5}>{categoryName}</Title>
                  </Table.Th>
                  {completeCategory && order.id && (
                    <Table.Th style={{ display: "flex", justifyContent: "center", width: "40px" }}>
                      <Checkbox
                        checked={category.done}
                        readOnly={completeCategory === "view"}
                        onChange={(e) =>
                          completeCategory !== "view" &&
                          completeCategory(order.id!, categoryName, e.currentTarget.checked)
                        }
                      />
                    </Table.Th>
                  )}
                </Table.Tr>
                {Object.entries(category.items)
                  .sort(byKey)
                  .map(([itemName, item]) => (
                    <Table.Tr key={itemName}>
                      <Table.Td>{itemName}</Table.Td>
                      <Table.Td style={{ textAlign: "center", width: "40px" }}>{item.quantity}</Table.Td>
                    </Table.Tr>
                  ))}
              </Fragment>
            ))}
          </Table.Tbody>
        </Table>
      </Card.Section>
    </Card>
  );
}

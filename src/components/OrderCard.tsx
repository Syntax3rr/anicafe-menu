import { Fragment } from "react";
import { Badge, Button, Card, Checkbox, Group, Table, Text, Title } from "@mantine/core";
import { useNow } from "../hooks/useNow";
import { Order } from "../types";
import { byKey, isOrderReady, zoneToColor } from "../utils";
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
  /** Pulses to catch the station's eye: blue with a "New" badge, or green for just became ready */
  flash?: "new" | "ready";
  /** Called when someone taps, clicks or tabs into the card, e.g. to stop it flashing */
  onInteract?: () => void;
}

export function OrderCard({
  order,
  excludeCategories = [],
  completeOrder,
  completeCategory,
  flash,
  onInteract,
}: OrderCardProps) {
  const categories = Object.entries(order.categories)
    .filter(([categoryName]) => !excludeCategories.includes(categoryName))
    .sort(byKey);
  // Every category this station tracks is done, so the order is ready to go out
  const ready = completeCategory !== undefined && isOrderReady(order, excludeCategories);
  // Null until the server confirms the write
  const placedAtMs = order.timestamp?.toMillis();

  return (
    <Card
      shadow="sm"
      radius="md"
      p="md"
      withBorder
      className={flash ? classes.flash : undefined}
      data-flash={flash}
      // Capture phase, so ticking a checkbox or pressing a button inside counts too. Click rather
      // than pointerdown, so swiping across the card to scroll on an iPad doesn't count.
      onClickCapture={onInteract}
      onFocusCapture={onInteract}
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
            {flash === "new" && <Badge color="blue">New</Badge>}
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

import { Fragment } from "react";
import { Badge, Button, Card, Checkbox, Group, Table, Text, Title } from "@mantine/core";
import { Order } from "../types";
import { byKey, zoneToColor } from "../utils";

interface OrderCardProps {
  order: Order;
  excludeCategories?: string[];
  completeOrder?: () => Promise<void>;
  /** "view" shows read-only checkboxes; a function makes them editable; omitted hides them */
  completeCategory?: "view" | ((orderId: string, categoryName: string, value: boolean) => Promise<void>);
}

export function OrderCard({ order, excludeCategories = [], completeOrder, completeCategory }: OrderCardProps) {
  const categories = Object.entries(order.categories)
    .filter(([categoryName]) => !excludeCategories.includes(categoryName))
    .sort(byKey);

  return (
    <Card shadow="sm" radius="md" p="md" style={{ height: "420px", display: "flex", flexDirection: "column" }}>
      <Card.Section withBorder>
        <Group justify="space-between" h={36}>
          <Group>
            <Title order={3}>Order #{order.number}</Title>
            {order.zone && <Badge color={zoneToColor(order.zone)}>{order.zone}</Badge>}
          </Group>
          {completeOrder && <Button onClick={completeOrder}>Complete</Button>}
        </Group>
        {order.notes && (
          <Text lineClamp={3} mt={8} style={{ overflowWrap: "break-word" }}>
            Notes: {order.notes}
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

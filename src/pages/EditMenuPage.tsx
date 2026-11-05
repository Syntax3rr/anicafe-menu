import { useEffect, useMemo, useState } from "react";
import { doc, runTransaction } from "firebase/firestore";
import {
  Alert,
  Badge,
  Button,
  Card,
  Group,
  List,
  NumberInput,
  Select,
  Stack,
  Table,
  TagsInput,
  Text,
  TextInput,
  Title,
} from "@mantine/core";
import { modals } from "@mantine/modals";
import { EmptyState } from "../components/StatusMessage";
import { db } from "../firebase";
import { menuCategoryFromDoc } from "../fromFirestore";
import { MenuCategory, MenuItem, StockLevel } from "../types";
import { notifyError, toCents } from "../utils";

/** Prices remain in dollars while editing and are converted to cents on save. */
interface EditableMenuItem extends Omit<MenuItem, "flags" | "priceCents"> {
  price: number | string;
  flags: string[];
}

interface EditableMenuCategory {
  categoryName: string;
  items: EditableMenuItem[];
}

const FLAG_MEANINGS: Record<string, string> = {
  NF: "Nut Free",
  DF: "Dairy Free",
  GF: "Gluten Free",
  VG: "Vegan",
  "*": "Contains Pork (e.g. gelatin)",
};
const STANDARD_FLAGS = Object.keys(FLAG_MEANINGS);

/** Reuse existing flag spelling for case-insensitive matches. */
const normalizeFlags = (flags: string[], known: string[]) => {
  const result: string[] = [];
  for (const raw of flags) {
    const flag = raw.trim();
    if (!flag) continue;
    const canonical = known.find((k) => k.toLowerCase() === flag.toLowerCase()) ?? flag;
    if (!result.some((f) => f.toLowerCase() === canonical.toLowerCase())) result.push(canonical);
  }
  return result;
};

const STOCK_OPTIONS = [
  { value: "high", label: "High" },
  { value: "low", label: "Low" },
  { value: "none", label: "None" },
];

const toEditable = (menu: MenuCategory[]): EditableMenuCategory[] =>
  menu.map((category) => ({
    categoryName: category.categoryName,
    items: category.items.map(({ itemName, priceCents, stock, flags }) => ({
      itemName,
      price: priceCents / 100,
      stock,
      flags: flags ?? [],
    })),
  }));

const fromEditable = (items: EditableMenuItem[]): MenuItem[] =>
  items.map(({ itemName, price, stock, flags }) => ({
    itemName: itemName.trim(),
    priceCents: toCents(price),
    stock,
    flags,
  }));

const NEW_ITEM: EditableMenuItem = { itemName: "New Item", price: 0, stock: "high", flags: [] };

/** Match Firestore's categoryName ordering. */
const byCategoryName = (a: EditableMenuCategory, b: EditableMenuCategory) =>
  a.categoryName < b.categoryName ? -1 : a.categoryName > b.categoryName ? 1 : 0;

/** Category names are used as Firestore document IDs. */
function categoryNameError(name: string, existing: EditableMenuCategory[]) {
  if (!name) return "Enter a category name";
  if (name.includes("/") || name === "." || name === ".." || /^__.*__$/.test(name))
    return 'Category names can\'t contain "/"';
  if (existing.some((category) => category.categoryName.toLowerCase() === name.toLowerCase()))
    return `There's already a ${name} category`;
  return null;
}

const sameMenu = (a: EditableMenuCategory[], b: EditableMenuCategory[]) => JSON.stringify(a) === JSON.stringify(b);

/** The mounted editor uses `active` to lock when the tab is left. */
export function EditMenuPage({ menu, active }: { menu: MenuCategory[]; active: boolean }) {
  // Keep the original menu for conflict detection.
  const [baseMenu, setBaseMenu] = useState(menu);
  const [editedMenu, setEditedMenu] = useState(() => toEditable(menu));
  const [saving, setSaving] = useState(false);
  const [locked, setLocked] = useState(true);
  const [newCategoryName, setNewCategoryName] = useState("");
  const [newCategoryError, setNewCategoryError] = useState<string | null>(null);

  const customFlags = useMemo(() => {
    const used = editedMenu.flatMap((category) => category.items.flatMap((item) => item.flags));
    return [...new Set(used)].filter((flag) => !STANDARD_FLAGS.includes(flag)).sort();
  }, [editedMenu]);
  const flagOptions = useMemo(() => [...STANDARD_FLAGS, ...customFlags], [customFlags]);

  const hasUnsavedChanges = useMemo(() => !sameMenu(editedMenu, toEditable(baseMenu)), [editedMenu, baseMenu]);

  if (menu !== baseMenu && !hasUnsavedChanges) {
    setBaseMenu(menu);
    setEditedMenu(toEditable(menu));
  }

  // Preserve access to unsaved edits when the tab is hidden.
  useEffect(() => {
    if (!active && !hasUnsavedChanges) setLocked(true);
  }, [active, hasUnsavedChanges]);

  const confirmUnlock = () =>
    modals.openConfirmModal({
      title: "Unlock menu editing?",
      children: (
        <Text size="sm">
          Saved changes go live on every station right away, including the cashier. The editor locks again after you
          save or leave this tab.
        </Text>
      ),
      labels: { confirm: "Unlock", cancel: "Cancel" },
      confirmProps: { color: "orange" },
      onConfirm: () => setLocked(false),
    });

  const changedElsewhere = menu !== baseMenu && !saving && !sameMenu(toEditable(menu), toEditable(baseMenu));

  const discardEdits = () => {
    setBaseMenu(menu);
    setEditedMenu(toEditable(menu));
  };

  const updateItems = (catIndex: number, update: (items: EditableMenuItem[]) => EditableMenuItem[]) =>
    setEditedMenu((prev) =>
      prev.map((category, i) => (i === catIndex ? { ...category, items: update(category.items) } : category)),
    );

  const handleItemChange = <K extends keyof EditableMenuItem>(
    catIndex: number,
    itemIndex: number,
    field: K,
    value: EditableMenuItem[K],
  ) => updateItems(catIndex, (items) => items.map((item, j) => (j === itemIndex ? { ...item, [field]: value } : item)));

  const handleAddItem = (catIndex: number) => updateItems(catIndex, (items) => [...items, NEW_ITEM]);

  const isUnsavedCategory = (categoryName: string) => !baseMenu.some((c) => c.categoryName === categoryName);

  const handleAddCategory = () => {
    const categoryName = newCategoryName.trim();
    const error = categoryNameError(categoryName, editedMenu);
    setNewCategoryError(error);
    if (error) return;
    setEditedMenu((prev) => [...prev, { categoryName, items: [NEW_ITEM] }].sort(byCategoryName));
    setNewCategoryName("");
  };

  const handleRemoveCategory = (catIndex: number) => setEditedMenu((prev) => prev.filter((_, i) => i !== catIndex));

  const handleRemoveItem = (catIndex: number, itemIndex: number) =>
    updateItems(catIndex, (items) => items.filter((_, j) => j !== itemIndex));

  const handleSaveMenu = async () => {
    const savedMenu: MenuCategory[] = editedMenu.map((category) => ({
      categoryName: category.categoryName,
      items: fromEditable(category.items),
    }));
    for (const category of savedMenu) {
      const names = category.items.map((item) => item.itemName);
      if (names.some((name) => !name) || new Set(names).size !== names.length) {
        notifyError("Invalid menu", `Item names in ${category.categoryName} must be nonempty and unique.`);
        return;
      }
    }
    // Match by name because adding a category changes array positions.
    const changed = savedMenu.filter((category) => {
      const base = baseMenu.find((c) => c.categoryName === category.categoryName);
      return !base || !sameMenu(toEditable([category]), toEditable([base]));
    });
    if (changed.length === 0) return;
    setSaving(true);
    try {
      await runTransaction(db, async (transaction) => {
        const snapshots = await Promise.all(
          changed.map((category) => transaction.get(doc(db, "menu", category.categoryName))),
        );
        for (let i = 0; i < changed.length; i++) {
          const snapshot = snapshots[i];
          const base = baseMenu.find((category) => category.categoryName === changed[i].categoryName);
          if (!base) {
            if (snapshot.exists()) {
              throw new Error(
                `A ${changed[i].categoryName} category was added on another device. Discard your edits and try again.`,
              );
            }
            continue;
          }
          if (!snapshot.exists() || !sameMenu(toEditable([menuCategoryFromDoc(snapshot)]), toEditable([base]))) {
            throw new Error(`${changed[i].categoryName} changed on another device. Discard your edits and try again.`);
          }
        }
        for (const category of changed) transaction.set(doc(db, "menu", category.categoryName), category);
      });
      setBaseMenu(savedMenu);
      setEditedMenu(toEditable(savedMenu));
      setLocked(true);
      modals.open({ title: "Menu Saved", children: <p>Menu successfully updated!</p> });
    } catch (error) {
      notifyError("Failed to save menu", error);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Stack>
      <Card shadow="sm" radius="md" p="md">
        <Group justify="space-between">
          <Group gap="sm">
            <Title order={2}>Edit Menu</Title>
            {locked && (
              <Badge color="gray" variant="light" size="lg">
                Locked
              </Badge>
            )}
          </Group>
          {locked ? (
            <Button variant="default" onClick={confirmUnlock}>
              Unlock to edit
            </Button>
          ) : (
            <Group gap="xs">
              <Button
                variant="default"
                onClick={() => setLocked(true)}
                disabled={hasUnsavedChanges || saving}
                title={hasUnsavedChanges ? "Save your changes first" : undefined}
              >
                Lock
              </Button>
              <Button onClick={handleSaveMenu} loading={saving} color={hasUnsavedChanges ? "yellow" : "blue"}>
                {hasUnsavedChanges ? "Save Changes *" : "Save Changes"}
              </Button>
            </Group>
          )}
        </Group>
      </Card>

      <fieldset
        disabled={saving || locked}
        style={{
          border: 0,
          padding: 0,
          margin: 0,
          display: "flex",
          flexDirection: "column",
          gap: "var(--mantine-spacing-md)",
        }}
      >
        {changedElsewhere && (
          <Alert color="orange" title="The menu was changed on another device">
            <Group justify="space-between">
              <Text size="sm">If you edited the same category, saving will be rejected. Discard your edits to load the latest
                menu.</Text>
              <Button size="xs" variant="outline" color="orange" onClick={discardEdits}>
                Discard my edits and load latest
              </Button>
            </Group>
          </Alert>
        )}

        <Card shadow="sm" radius="md" p="md" withBorder>
          <Title order={4} mb="xs">
            Flag Legend
          </Title>
          <List spacing="xs" size="sm" withPadding>
            {Object.entries(FLAG_MEANINGS).map(([flag, meaning]) => (
              <List.Item key={flag}>
                <Text span fw={700}>
                  {flag}
                </Text>{" "}
                – {meaning}
              </List.Item>
            ))}
          </List>
          {customFlags.length > 0 && (
            <Text size="sm" mt="xs">
              Other flags on this menu:{" "}
              <Text span fw={700}>
                {customFlags.join(", ")}
              </Text>
            </Text>
          )}
          <Text size="xs" c="dimmed" mt="xs">
            To add a new flag, type it into an item&apos;s Flags box and press Enter. It&apos;s then offered for every
            item.
          </Text>
        </Card>

        {editedMenu.length === 0 && (
          <EmptyState title="The menu is empty">
            Add a category below (e.g. Food, Drinks, Specialty) to start.
          </EmptyState>
        )}

        {editedMenu.map((category, catIndex) => (
          <Card key={category.categoryName} shadow="sm" radius="md" p="md">
            <Group justify="space-between" mb="sm">
              <Title order={4}>{category.categoryName}</Title>
              <Group gap="xs">
                {isUnsavedCategory(category.categoryName) && (
                  <Button size="xs" variant="subtle" color="red" onClick={() => handleRemoveCategory(catIndex)}>
                    Remove category
                  </Button>
                )}
                <Button size="xs" onClick={() => handleAddItem(catIndex)}>
                  + Add Item
                </Button>
              </Group>
            </Group>
            <Table.ScrollContainer minWidth={760}>
              <Table>
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>Name</Table.Th>
                    <Table.Th>Price</Table.Th>
                    <Table.Th>Stock</Table.Th>
                    <Table.Th miw={220}>Flags</Table.Th>
                    <Table.Th>Remove</Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {category.items.map((item, itemIndex) => (
                    <Table.Tr key={itemIndex}>
                      <Table.Td>
                        <TextInput
                          value={item.itemName}
                          onChange={(e) => handleItemChange(catIndex, itemIndex, "itemName", e.currentTarget.value)}
                        />
                      </Table.Td>
                      <Table.Td>
                        <NumberInput
                          value={item.price}
                          min={0}
                          prefix="$"
                          decimalScale={2}
                          fixedDecimalScale
                          onChange={(val) => handleItemChange(catIndex, itemIndex, "price", val)}
                        />
                      </Table.Td>
                      <Table.Td>
                        <Select
                          value={item.stock}
                          data={STOCK_OPTIONS}
                          onChange={(val) =>
                            handleItemChange(catIndex, itemIndex, "stock", (val ?? "none") as StockLevel)
                          }
                        />
                      </Table.Td>
                      <Table.Td>
                        <TagsInput
                          aria-label={`Flags for ${item.itemName}`}
                          placeholder={item.flags.length === 0 ? "Pick or type a flag" : undefined}
                          data={flagOptions}
                          value={item.flags}
                          onChange={(flags) =>
                            handleItemChange(catIndex, itemIndex, "flags", normalizeFlags(flags, flagOptions))
                          }
                          renderOption={({ option }) =>
                            FLAG_MEANINGS[option.value] ? (
                              <Text size="sm">
                                <Text span fw={700}>
                                  {option.value}
                                </Text>{" "}
                                – {FLAG_MEANINGS[option.value]}
                              </Text>
                            ) : (
                              <Text size="sm" fw={700}>
                                {option.value}
                              </Text>
                            )
                          }
                          splitChars={[","]}
                          acceptValueOnBlur
                          clearable
                        />
                      </Table.Td>
                      <Table.Td>
                        <Button color="red" size="xs" onClick={() => handleRemoveItem(catIndex, itemIndex)}>
                          Remove
                        </Button>
                      </Table.Td>
                    </Table.Tr>
                  ))}
                </Table.Tbody>
              </Table>
            </Table.ScrollContainer>
          </Card>
        ))}

        <Card shadow="sm" radius="md" p="md" withBorder>
          <Group align="flex-start">
            <TextInput
              label="New category"
              placeholder="e.g. Desserts"
              value={newCategoryName}
              error={newCategoryError}
              onChange={(e) => {
                setNewCategoryName(e.currentTarget.value);
                setNewCategoryError(null);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleAddCategory();
              }}
              style={{ flexGrow: 1 }}
            />
            <Button mt={25} onClick={handleAddCategory}>
              + Add Category
            </Button>
          </Group>
          <Text size="xs" c="dimmed" mt="xs">
            New categories are saved with Save Changes. Items in a category named &quot;Specialty&quot; go to the
            Specialty station instead of Food/Drink.
          </Text>
        </Card>
      </fieldset>
    </Stack>
  );
}

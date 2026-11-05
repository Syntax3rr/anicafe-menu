import { useEffect, useMemo, useState } from "react";
import { doc, runTransaction } from "firebase/firestore";
import {
  Alert,
  Autocomplete,
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
import { notifyError, stationNames, toCents } from "../utils";

/** Prices remain in dollars while editing and are converted to cents on save. */
interface EditableMenuItem extends Omit<MenuItem, "flags" | "priceCents"> {
  price: number | string;
  flags: string[];
}

interface EditableMenuCategory {
  categoryName: string;
  station: string;
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

const sameFlag = (a: string) => (b: string) => a.toLowerCase() === b.toLowerCase();

/** Reuse existing flag spelling for case-insensitive matches. */
const normalizeFlags = (flags: string[], known: string[]) =>
  flags
    .map((flag) => flag.trim())
    .filter((flag) => flag !== "")
    .map((flag) => known.find(sameFlag(flag)) ?? flag)
    .filter((flag, i, all) => all.findIndex(sameFlag(flag)) === i);

const STOCK_OPTIONS = [
  { value: "high", label: "High" },
  { value: "low", label: "Low" },
  { value: "none", label: "None" },
];

const toEditable = (menu: MenuCategory[]): EditableMenuCategory[] =>
  menu.map((category) => ({
    categoryName: category.categoryName,
    station: category.station,
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

const sameCategory = (a: MenuCategory, b: MenuCategory) => sameMenu(toEditable([a]), toEditable([b]));

const toSavedMenu = (menu: EditableMenuCategory[]): MenuCategory[] =>
  menu.map((category) => ({
    categoryName: category.categoryName,
    station: category.station.trim(),
    items: fromEditable(category.items),
  }));

function menuError(menu: MenuCategory[]) {
  const noStation = menu.find((category) => !category.station);
  if (noStation) return `Choose a station for ${noStation.categoryName}.`;
  const invalid = menu.find((category) => {
    const names = category.items.map((item) => item.itemName);
    return names.some((name) => !name) || new Set(names).size !== names.length;
  });
  return invalid ? `Item names in ${invalid.categoryName} must be nonempty and unique.` : null;
}

/** Match by name because adding a category changes array positions. */
const changedCategories = (menu: MenuCategory[], base: MenuCategory[]) =>
  menu.filter((category) => {
    const original = base.find((c) => c.categoryName === category.categoryName);
    return !original || !sameCategory(category, original);
  });

const removedCategories = (menu: MenuCategory[], base: MenuCategory[]) =>
  base.filter((original) => !menu.some((category) => category.categoryName === original.categoryName));

function conflictError(categoryName: string, base: MenuCategory | undefined, current: MenuCategory | undefined) {
  if (!base) return current ? `A ${categoryName} category was added on another device.` : null;
  return current && sameCategory(current, base) ? null : `${categoryName} changed on another device.`;
}

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
  const stations = useMemo(
    () => stationNames(editedMenu.map((category) => ({ station: category.station.trim() }))).filter(Boolean),
    [editedMenu],
  );

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

  const handleStationChange = (catIndex: number, station: string) =>
    setEditedMenu((prev) => prev.map((category, i) => (i === catIndex ? { ...category, station } : category)));

  const isUnsavedCategory = (categoryName: string) => !baseMenu.some((c) => c.categoryName === categoryName);

  const handleAddCategory = () => {
    const categoryName = newCategoryName.trim();
    const error = categoryNameError(categoryName, editedMenu);
    setNewCategoryError(error);
    if (error) return;
    const station = stations[0] ?? "Kitchen";
    setEditedMenu((prev) => [...prev, { categoryName, station, items: [NEW_ITEM] }].sort(byCategoryName));
    setNewCategoryName("");
  };

  const removeCategory = (categoryName: string) =>
    setEditedMenu((prev) => prev.filter((category) => category.categoryName !== categoryName));

  const handleRemoveCategory = (categoryName: string) =>
    isUnsavedCategory(categoryName)
      ? removeCategory(categoryName)
      : modals.openConfirmModal({
          title: `Remove ${categoryName}?`,
          children: (
            <Text size="sm">
              {categoryName} and its items leave the menu when you save. Past orders keep them, but open orders with
              {" "}{categoryName} will no longer show it on the Prep tab.
            </Text>
          ),
          labels: { confirm: "Remove", cancel: "Cancel" },
          confirmProps: { color: "red" },
          onConfirm: () => removeCategory(categoryName),
        });

  const handleRemoveItem = (catIndex: number, itemIndex: number) =>
    updateItems(catIndex, (items) => items.filter((_, j) => j !== itemIndex));

  const handleSaveMenu = async () => {
    const savedMenu = toSavedMenu(editedMenu);
    const invalid = menuError(savedMenu);
    if (invalid) {
      notifyError("Invalid menu", invalid);
      return;
    }
    // A missing `next` deletes the category.
    const writes = [
      ...changedCategories(savedMenu, baseMenu).map((next) => ({ categoryName: next.categoryName, next })),
      ...removedCategories(savedMenu, baseMenu).map(({ categoryName }) => ({ categoryName, next: undefined })),
    ];
    if (writes.length === 0) return;
    setSaving(true);
    try {
      await runTransaction(db, async (transaction) => {
        const refs = writes.map(({ categoryName }) => doc(db, "menu", categoryName));
        const snapshots = await Promise.all(refs.map((ref) => transaction.get(ref)));
        const conflict = writes
          .map(({ categoryName }, i) =>
            conflictError(
              categoryName,
              baseMenu.find((category) => category.categoryName === categoryName),
              snapshots[i].exists() ? menuCategoryFromDoc(snapshots[i]) : undefined,
            ),
          )
          .find((error) => error !== null);
        if (conflict) throw new Error(`${conflict} Discard your edits and try again.`);
        writes.forEach(({ next }, i) => (next ? transaction.set(refs[i], next) : transaction.delete(refs[i])));
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
            Add a category below (e.g. Food, Drinks, Desserts) to start.
          </EmptyState>
        )}

        {editedMenu.map((category, catIndex) => (
          <Card key={category.categoryName} shadow="sm" radius="md" p="md">
            <Group justify="space-between" align="flex-end" mb="sm">
              <Group align="flex-end" gap="md">
                <Title order={4}>{category.categoryName}</Title>
                <Autocomplete
                  label="Station"
                  placeholder="Pick or type a station"
                  data={stations}
                  value={category.station}
                  onChange={(station) => handleStationChange(catIndex, station)}
                  error={category.station.trim() === "" ? "Required" : undefined}
                  w={200}
                />
              </Group>
              <Group gap="xs">
                <Button
                  size="xs"
                  variant="subtle"
                  color="red"
                  onClick={() => handleRemoveCategory(category.categoryName)}
                >
                  Remove category
                </Button>
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
            New categories are saved with Save Changes. The Prep tab can show one or more stations, each with the
            categories assigned to it. Type a new name into a Station box to create a station.
          </Text>
        </Card>
      </fieldset>
    </Stack>
  );
}

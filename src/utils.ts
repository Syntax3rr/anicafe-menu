import { FirestoreError } from "firebase/firestore";
import { notifications } from "@mantine/notifications";

export const SPECIALTY_CATEGORY = "Specialty";

export const isSpecialtyOnly = (categories: Record<string, unknown>) => {
  const names = Object.keys(categories);
  return names.length === 1 && names[0] === SPECIALTY_CATEGORY;
};

export const isOrderReady = (order: { categories: Record<string, { done: boolean }> }, excludeCategories: string[]) => {
  const tracked = Object.entries(order.categories).filter(([name]) => !excludeCategories.includes(name));
  return tracked.length > 0 && tracked.every(([, category]) => category.done);
};

export const ZONES = ["Bar", "Cashier", "Stage", "Undecided", "Volunteer"] as const;

const ZONE_COLORS: Record<string, string> = {
  Bar: "indigo",
  Cashier: "grape",
  Stage: "orange",
  Undecided: "gray",
  Volunteer: "teal",
};

export const zoneToColor = (zone: string) => ZONE_COLORS[zone] ?? "gray";

export const formatCents = (cents: number) =>
  (cents / 100).toLocaleString("en-US", { style: "currency", currency: "USD" });

/** Convert a dollar input, including partially typed strings, to cents. */
export const toCents = (dollars: number | string) => {
  const value = typeof dollars === "number" ? dollars : parseFloat(dollars);
  return Number.isFinite(value) ? Math.round(value * 100) : 0;
};

export const byKey = <T>([a]: [string, T], [b]: [string, T]) => a.localeCompare(b);

// Escape dots and percent signs in names used in Mantine form paths.
export const toFormKey = (name: string) => name.replace(/%/g, "%25").replace(/\./g, "%2E");

export const notifyError = (title: string, error: unknown) => {
  console.error(title, error);
  const message = error instanceof Error ? error.message : typeof error === "string" ? error : "";
  notifications.show({
    color: "red",
    title,
    message: message.trim() || "An unexpected error occurred. Please try again.",
    autoClose: false,
  });
};

export const notifySnapshotError = (what: string) => (error: FirestoreError) =>
  notifyError(`Failed to load ${what}`, error);

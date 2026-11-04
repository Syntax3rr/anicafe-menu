import { FirestoreError } from "firebase/firestore";
import { notifications } from "@mantine/notifications";

export const SPECIALTY_CATEGORY = "Specialty";

export const ZONES = ["Bar", "Cashier", "Stage", "Undecided", "Volunteer"] as const;

const ZONE_COLORS: Record<string, string> = {
  Bar: "indigo",
  Cashier: "grape",
  Stage: "orange",
  Undecided: "gray",
  Volunteer: "teal",
};

export const zoneToColor = (zone: string) => ZONE_COLORS[zone] ?? "gray";

export const formatPrice = (value: number) => value.toLocaleString("en-US", { style: "currency", currency: "USD" });

/** Sort `Object.entries` output by key */
export const byKey = <T>([a]: [string, T], [b]: [string, T]) => a.localeCompare(b);

// Mantine form paths are dot-separated, so escape dots in menu names used as form keys
export const toFormKey = (name: string) => name.replace(/%/g, "%25").replace(/\./g, "%2E");
export const fromFormKey = (key: string) => decodeURIComponent(key);

export const notifySnapshotError = (what: string) => (error: FirestoreError) => {
  console.error(`Error loading ${what}:`, error);
  notifications.show({
    color: "red",
    title: `Failed to load ${what}`,
    message: error.message,
    autoClose: false,
  });
};

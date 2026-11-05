import { Timestamp } from "firebase/firestore";

export type StockLevel = "high" | "low" | "none";

export interface MenuItem {
  itemName: string;
  priceCents: number;
  stock: StockLevel;
  flags?: string[];
}

export interface MenuCategory {
  categoryName: string;
  items: MenuItem[];
}

export type OrderItems = { [itemName: string]: { quantity: number } };

export interface OrderCategory {
  done: boolean;
  items: OrderItems;
}

export interface Order {
  id?: string;
  timestamp?: Timestamp;
  specialtyOnly?: boolean;
  zone?: string;
  number: number;
  /** Total after the discount has been subtracted */
  totalCents: number;
  discountCents: number;
  notes: string;
  completed: boolean;
  categories: { [categoryName: string]: OrderCategory };
}

export interface PersistedOrder extends Order {
  id: string;
}

export interface Specialty {
  id: string;
  number: number;
  notes: string;
  done: boolean;
  /** Missing on specialty docs created before this field was added */
  specialtyOnly?: boolean;
  timestamp: Timestamp;
  items: OrderItems;
}

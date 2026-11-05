import { readFileSync } from "node:fs";
import { afterAll, beforeAll, beforeEach, describe, it } from "vitest";
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import { deleteDoc, doc, getDoc, setDoc, updateDoc } from "firebase/firestore";

// Run with `npm run test:rules`, which starts the Firestore emulator

let testEnv: RulesTestEnvironment;

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: "demo-anicafe",
    firestore: { rules: readFileSync("firestore.rules", "utf8") },
  });
});

afterAll(() => testEnv.cleanup());

beforeEach(async () => {
  await testEnv.clearFirestore();
  await testEnv.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    await setDoc(doc(db, "menu/Food"), { categoryName: "Food", items: [] });
    await setDoc(doc(db, "orders/o1"), { number: 1, completed: false });
    await setDoc(doc(db, "specialty/o1"), { number: 1, done: false });
  });
});

const signedOut = () => testEnv.unauthenticatedContext().firestore();
const staff = () => testEnv.authenticatedContext("staff", { email: "staff@anicafe.app" }).firestore();
const admin = () => testEnv.authenticatedContext("admin", { email: "admin@anicafe.app" }).firestore();
const stranger = () => testEnv.authenticatedContext("stranger", { email: "someone@example.com" }).firestore();

describe("signed out", () => {
  it("can't read or write anything", async () => {
    const db = signedOut();
    await assertFails(getDoc(doc(db, "menu/Food")));
    await assertFails(getDoc(doc(db, "orders/o1")));
    await assertFails(setDoc(doc(db, "orders/o2"), { number: 2 }));
    await assertFails(setDoc(doc(db, "menu/Drinks"), { categoryName: "Drinks", items: [] }));
  });
});

describe("unknown account", () => {
  it("can't read or write anything", async () => {
    const db = stranger();
    await assertFails(getDoc(doc(db, "menu/Food")));
    await assertFails(getDoc(doc(db, "orders/o1")));
    await assertFails(setDoc(doc(db, "orders/o2"), { number: 2 }));
    await assertFails(updateDoc(doc(db, "specialty/o1"), { done: true }));
  });
});

describe("staff", () => {
  it("can read the menu but not change it", async () => {
    const db = staff();
    await assertSucceeds(getDoc(doc(db, "menu/Food")));
    await assertFails(setDoc(doc(db, "menu/Food"), { categoryName: "Food", items: [] }));
    await assertFails(deleteDoc(doc(db, "menu/Food")));
  });

  it("can create, read and update orders and specialty docs", async () => {
    const db = staff();
    await assertSucceeds(setDoc(doc(db, "orders/o2"), { number: 2, completed: false }));
    await assertSucceeds(setDoc(doc(db, "specialty/o2"), { number: 2, done: false }));
    await assertSucceeds(getDoc(doc(db, "orders/o1")));
    await assertSucceeds(updateDoc(doc(db, "orders/o1"), { completed: true }));
    await assertSucceeds(updateDoc(doc(db, "specialty/o1"), { done: true }));
  });

  it("can't delete orders or specialty docs", async () => {
    const db = staff();
    await assertFails(deleteDoc(doc(db, "orders/o1")));
    await assertFails(deleteDoc(doc(db, "specialty/o1")));
  });

  it("can't touch other collections", async () => {
    await assertFails(setDoc(doc(staff(), "config/x"), { a: 1 }));
  });
});

describe("admin", () => {
  it("can edit the menu", async () => {
    const db = admin();
    await assertSucceeds(setDoc(doc(db, "menu/Drinks"), { categoryName: "Drinks", items: [] }));
    await assertSucceeds(deleteDoc(doc(db, "menu/Drinks")));
  });

  it("can do everything staff can, plus delete orders", async () => {
    const db = admin();
    await assertSucceeds(setDoc(doc(db, "orders/o2"), { number: 2, completed: false }));
    await assertSucceeds(updateDoc(doc(db, "orders/o1"), { completed: true }));
    await assertSucceeds(deleteDoc(doc(db, "orders/o1")));
    await assertSucceeds(deleteDoc(doc(db, "specialty/o1")));
  });
});

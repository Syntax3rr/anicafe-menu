import { useEffect, useState } from "react";
import { onAuthStateChanged, User } from "firebase/auth";
import { auth } from "../firebase";

export type Role = "admin" | "staff";

export const ROLE_EMAILS: Record<Role, string> = {
  staff: import.meta.env.VITE_STAFF_EMAIL ?? "",
  admin: import.meta.env.VITE_ADMIN_EMAIL ?? "",
};

const roleOf = (user: User | null): Role | null => {
  if (!user?.email) return null;
  if (user.email === ROLE_EMAILS.admin) return "admin";
  return user.email === ROLE_EMAILS.staff ? "staff" : null;
};

/** Current Firebase user and their role. `user` is undefined until Firebase has restored the session. */
export function useAuth() {
  const [user, setUser] = useState<User | null | undefined>(undefined);

  useEffect(() => onAuthStateChanged(auth, setUser), []);

  return { user, role: user === undefined ? null : roleOf(user), loading: user === undefined };
}

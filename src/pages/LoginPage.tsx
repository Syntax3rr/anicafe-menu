import { FormEvent, useState } from "react";
import { FirebaseError } from "firebase/app";
import { signInWithEmailAndPassword } from "firebase/auth";
import { Button, Card, Center, PasswordInput, SegmentedControl, Stack, Text, Title } from "@mantine/core";
import { auth } from "../firebase";
import { ROLE_EMAILS, Role } from "../hooks/useAuth";
import { notifyError } from "../utils";

const AUTH_ERRORS: Record<string, string> = {
  "auth/invalid-credential": "Wrong password",
  "auth/wrong-password": "Wrong password",
  "auth/too-many-requests": "Too many attempts. Wait a minute and try again.",
  "auth/network-request-failed": "No connection. Check the Wi-Fi and try again.",
};

/** Shared-account sign-in: pick a role and type that account's password */
export function LoginPage() {
  const [role, setRole] = useState<Role>("staff");
  const [password, setPassword] = useState("");
  const [signingIn, setSigningIn] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!ROLE_EMAILS[role]) {
      const variable = role === "admin" ? "VITE_ADMIN_EMAIL" : "VITE_STAFF_EMAIL";
      notifyError("Sign-in isn't configured", `${variable} is missing from .env.`);
      return;
    }
    setSigningIn(true);
    try {
      await signInWithEmailAndPassword(auth, ROLE_EMAILS[role], password);
    } catch (error) {
      const message = error instanceof FirebaseError ? AUTH_ERRORS[error.code] : undefined;
      notifyError("Sign-in failed", message ?? error);
      setSigningIn(false);
    }
  };

  return (
    <Center mih="60vh">
      <Card shadow="sm" radius="md" p="lg" w={360}>
        <form onSubmit={handleSubmit}>
          <Stack>
            <Title order={2}>Anicafe sign-in</Title>
            <SegmentedControl
              value={role}
              onChange={(value) => setRole(value as Role)}
              data={[
                { value: "staff", label: "Staff" },
                { value: "admin", label: "Organizer" },
              ]}
            />
            <PasswordInput
              label="Password"
              value={password}
              onChange={(e) => setPassword(e.currentTarget.value)}
              autoFocus
              required
            />
            <Button type="submit" loading={signingIn}>
              Sign in
            </Button>
            <Text size="xs" c="dimmed">
              This device stays signed in until someone signs out or the password is changed.
            </Text>
          </Stack>
        </form>
      </Card>
    </Center>
  );
}

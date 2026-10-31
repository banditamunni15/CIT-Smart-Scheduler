import { createAuthClient } from "better-auth/react";
import { API_URL } from "./api";

export const authClient = createAuthClient({
  ...(API_URL ? { baseURL: API_URL } : {}),
});

export const signIn = (email: string, password: string) =>
  authClient.signIn.email({ email, password });

export const signOut = () => authClient.signOut();

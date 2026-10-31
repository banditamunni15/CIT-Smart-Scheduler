"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { ChevronDown, LoaderCircle } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { signIn } from "@/lib/auth-client";
import { ApiClientError, get } from "@/lib/api";
import { friendlyErrorText } from "@/lib/errors";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";

const credentialsSchema = z.object({
  email: z.email("Enter a valid email address."),
  password: z.string().min(1, "Enter your password."),
});

type Credentials = z.infer<typeof credentialsSchema>;

const demoAccounts = [
  "admin@cit.demo",
  "admin2@cit.demo",
  "coordinator@cit.demo",
  "faculty@cit.demo",
  "club@cit.demo",
];

export default function LoginPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [serverError, setServerError] = useState("");
  const [pending, setPending] = useState(false);
  const form = useForm<Credentials>({
    resolver: zodResolver(credentialsSchema),
    defaultValues: { email: "", password: "" },
  });

  const submit = form.handleSubmit(async (credentials) => {
    setServerError("");
    setPending(true);
    try {
      const result = await signIn(credentials.email, credentials.password);
      if (result.error) {
        setServerError(
          result.error.message || "Email or password is incorrect. Try again.",
        );
        return;
      }
      const user = await get("/api/me");
      queryClient.setQueryData(["me"], user);
      router.replace("/dashboard");
    } catch (error) {
      if (
        error instanceof ApiClientError &&
        (error.statusCode === 401 || error.code === "INVALID_EMAIL_OR_PASSWORD")
      ) {
        setServerError("Email or password is incorrect. Try again.");
      } else {
        setServerError(friendlyErrorText(error));
      }
    } finally {
      setPending(false);
    }
  });

  const chooseDemo = (email: string) => {
    form.setValue("email", email, { shouldValidate: true });
    form.setValue("password", process.env.NEXT_PUBLIC_DEMO_PASSWORD ?? "", {
      shouldValidate: true,
    });
    setServerError("");
  };

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4 py-10">
      <div className="w-full max-w-md space-y-4">
        <div className="text-center">
          <Link href="/" className="text-sm font-semibold tracking-tight">
            CIT Scheduler
          </Link>
        </div>
        <Card className="border border-border shadow-xs">
          <CardHeader>
            <CardTitle className="text-xl">Sign in</CardTitle>
            <CardDescription>
              Use your CIT Scheduler account to continue.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={submit} className="space-y-4" noValidate>
              <div className="space-y-1.5">
                <label htmlFor="email" className="text-sm font-medium">
                  Email
                </label>
                <Input
                  id="email"
                  type="email"
                  autoComplete="email"
                  aria-invalid={Boolean(form.formState.errors.email)}
                  {...form.register("email")}
                />
                {form.formState.errors.email ? (
                  <p className="text-xs text-destructive">
                    {form.formState.errors.email.message}
                  </p>
                ) : null}
              </div>
              <div className="space-y-1.5">
                <label htmlFor="password" className="text-sm font-medium">
                  Password
                </label>
                <Input
                  id="password"
                  type="password"
                  autoComplete="current-password"
                  aria-invalid={Boolean(form.formState.errors.password)}
                  {...form.register("password")}
                />
                {form.formState.errors.password ? (
                  <p className="text-xs text-destructive">
                    {form.formState.errors.password.message}
                  </p>
                ) : null}
              </div>
              {serverError ? (
                <Alert variant="destructive">
                  <AlertTitle>Unable to sign in</AlertTitle>
                  <AlertDescription>{serverError}</AlertDescription>
                </Alert>
              ) : null}
              <Button type="submit" className="h-9 w-full" disabled={pending}>
                {pending ? <LoaderCircle className="animate-spin" /> : null}
                {pending ? "Signing in…" : "Sign in"}
              </Button>
            </form>

            <Collapsible className="mt-6 border-t pt-4">
              <CollapsibleTrigger className="flex w-full items-center justify-between text-sm font-medium">
                Demo accounts
                <ChevronDown aria-hidden="true" className="size-4" />
              </CollapsibleTrigger>
              <CollapsibleContent className="mt-3 space-y-2">
                {demoAccounts.map((email) => (
                  <div
                    key={email}
                    className="flex items-center justify-between gap-3 rounded-md border px-3 py-2"
                  >
                    <span className="min-w-0 truncate text-sm text-muted-foreground">
                      {email}
                    </span>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => chooseDemo(email)}
                    >
                      Use
                    </Button>
                  </div>
                ))}
                {!process.env.NEXT_PUBLIC_DEMO_PASSWORD ? (
                  <p className="text-xs text-muted-foreground">
                    Set NEXT_PUBLIC_DEMO_PASSWORD to fill demo account passwords.
                  </p>
                ) : null}
              </CollapsibleContent>
            </Collapsible>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}

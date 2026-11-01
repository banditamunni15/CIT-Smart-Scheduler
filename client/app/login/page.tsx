"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  CalendarCheck2,
  ChevronDown,
  DoorOpen,
  Eye,
  EyeOff,
  LoaderCircle,
  Sparkles,
} from "lucide-react";
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
  { email: "admin@cit.demo", role: "Admin", chip: "bg-rose-50 text-rose-700 border-rose-200" },
  { email: "admin2@cit.demo", role: "Admin 2", chip: "bg-rose-50 text-rose-700 border-rose-200" },
  { email: "coordinator@cit.demo", role: "Coordinator", chip: "bg-amber-50 text-amber-700 border-amber-200" },
  { email: "faculty@cit.demo", role: "Faculty", chip: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  { email: "club@cit.demo", role: "Club", chip: "bg-sky-50 text-sky-700 border-sky-200" },
];

const highlights = [
  { icon: CalendarCheck2, text: "Clash-free weekly timetables" },
  { icon: DoorOpen, text: "Fair, transparent venue booking" },
  { icon: Sparkles, text: "Quick repairs when plans change" },
];

export default function LoginPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [serverError, setServerError] = useState("");
  const [pending, setPending] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
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
    <main className="grid min-h-screen lg:grid-cols-[1.05fr_1fr]">
      <section className="bg-brand relative hidden flex-col justify-between overflow-hidden text-white lg:flex">
        <div aria-hidden="true" className="bg-dots absolute inset-0 opacity-60" />
        <div
          aria-hidden="true"
          className="absolute -top-24 -right-24 size-80 rounded-full bg-fuchsia-400/30 blur-3xl"
        />
        <div
          aria-hidden="true"
          className="absolute top-1/3 -left-24 size-72 rounded-full bg-sky-400/25 blur-3xl"
        />
        <div className="relative z-10 p-10">
          <Link href="/" className="inline-flex items-center gap-3">
            <Image
              src="/illustrations/logo.svg"
              alt=""
              width={40}
              height={40}
              unoptimized
              aria-hidden="true"
              className="size-10 rounded-xl shadow-lg shadow-black/20"
            />
            <span className="leading-tight">
              <span className="block font-heading text-lg font-bold">CIT Scheduler</span>
              <span className="block text-xs text-indigo-100/80">
                Chilika Institute of Technology
              </span>
            </span>
          </Link>
          <h2 className="mt-12 max-w-md font-heading text-4xl leading-tight font-extrabold tracking-tight">
            Smarter timetables for a calmer campus.
          </h2>
          <ul className="mt-8 space-y-3">
            {highlights.map(({ icon: Icon, text }) => (
              <li key={text} className="flex items-center gap-3 text-sm text-indigo-50">
                <span className="flex size-8 items-center justify-center rounded-lg bg-white/15 ring-1 ring-white/20">
                  <Icon aria-hidden="true" className="size-4" />
                </span>
                {text}
              </li>
            ))}
          </ul>
        </div>
        <Image
          src="/illustrations/campus.svg"
          alt="Illustration of the college campus"
          width={640}
          height={400}
          priority
          unoptimized
          className="relative z-10 w-full"
        />
      </section>

      <section className="flex items-center justify-center bg-app px-4 py-10">
        <div className="w-full max-w-md space-y-5">
          <div className="flex items-center justify-center gap-2 lg:hidden">
            <Image
              src="/illustrations/logo.svg"
              alt=""
              width={32}
              height={32}
              unoptimized
              aria-hidden="true"
              className="size-8 rounded-lg"
            />
            <Link href="/" className="font-heading text-base font-bold tracking-tight">
              CIT Scheduler
            </Link>
          </div>
          <Card className="shadow-lift">
            <CardHeader>
              <CardTitle className="text-2xl font-bold">Welcome back</CardTitle>
              <CardDescription>
                Sign in to manage timetables, exams and bookings.
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
                    className="h-10"
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
                  <div className="relative">
                    <Input
                      id="password"
                      type={showPassword ? "text" : "password"}
                      autoComplete="current-password"
                      aria-invalid={Boolean(form.formState.errors.password)}
                      className="h-10 pr-10"
                      {...form.register("password")}
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      className="absolute top-1/2 right-1 -translate-y-1/2"
                      aria-label={showPassword ? "Hide password" : "Show password"}
                      aria-pressed={showPassword}
                      onClick={() => setShowPassword((visible) => !visible)}
                    >
                      {showPassword ? <EyeOff /> : <Eye />}
                    </Button>
                  </div>
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
                <Button type="submit" className="h-10 w-full text-sm" disabled={pending}>
                  {pending ? <LoaderCircle className="animate-spin" /> : null}
                  {pending ? "Signing in…" : "Sign in"}
                </Button>
              </form>

              <Collapsible className="mt-6 border-t pt-4">
                <CollapsibleTrigger className="flex w-full items-center justify-between text-sm font-semibold">
                  Demo accounts
                  <ChevronDown aria-hidden="true" className="size-4" />
                </CollapsibleTrigger>
                <CollapsibleContent className="mt-3 space-y-2">
                  {demoAccounts.map(({ email, role, chip }) => (
                    <div
                      key={email}
                      className="flex items-center justify-between gap-3 rounded-xl border bg-muted/40 px-3 py-2"
                    >
                      <span className="flex min-w-0 items-center gap-2">
                        <span
                          className={`shrink-0 rounded-full border px-2 py-px text-[10px] font-semibold uppercase ${chip}`}
                        >
                          {role}
                        </span>
                        <span className="min-w-0 truncate text-sm text-muted-foreground">
                          {email}
                        </span>
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
      </section>
    </main>
  );
}

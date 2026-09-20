"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { MailCheck } from "lucide-react";
import { authClient } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Spinner } from "@/components/ui/spinner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [magicEmail, setMagicEmail] = useState("");
  const [magicSent, setMagicSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleEmailSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const { error } = await authClient.signIn.email({
      email,
      password,
      callbackURL: "/",
    });
    if (error) {
      setError(error.message ?? "Something went wrong");
      setLoading(false);
      return;
    }
    router.push("/");
  };

  const handleMagicLink = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const { error } = await authClient.signIn.magicLink({
      email: magicEmail,
      callbackURL: "/",
      errorCallbackURL: "/login",
    });
    if (error) {
      setError(error.message ?? "Could not send the email");
      setLoading(false);
      return;
    }
    setMagicSent(true);
    setLoading(false);
  };

  const handleGoogleSignIn = async () => {
    setError(null);
    setGoogleLoading(true);
    await authClient.signIn.social({
      provider: "google",
      callbackURL: "/",
    });
  };

  if (magicSent) {
    return (
      <Card className="w-full max-w-sm">
        <CardContent className="flex flex-col items-center gap-3 pt-6 text-center">
          <MailCheck className="size-10 text-primary" />
          <h2 className="text-lg font-semibold">Check your inbox</h2>
          <p className="text-muted-foreground text-sm">
            We sent a sign-in link to <b>{magicEmail}</b>. Click it to sign in —
            it expires in 5 minutes.
          </p>
          <Button variant="outline" size="sm" onClick={() => setMagicSent(false)}>
            Use a different email
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="w-full max-w-sm">
      <CardHeader className="text-center">
        <CardTitle className="text-2xl">Welcome back</CardTitle>
        <CardDescription>Sign in to analyze your CSVs</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-6">
        <Tabs defaultValue="magic-link" className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="magic-link">Email link</TabsTrigger>
            <TabsTrigger value="password">Password</TabsTrigger>
          </TabsList>

          <TabsContent value="magic-link">
            <form onSubmit={handleMagicLink} className="flex flex-col gap-4">
              <div className="flex flex-col gap-2">
                <Label htmlFor="magic-email">Email</Label>
                <Input
                  id="magic-email"
                  type="email"
                  placeholder="you@example.com"
                  value={magicEmail}
                  onChange={(e) => setMagicEmail(e.target.value)}
                  required
                  autoComplete="email"
                />
              </div>
              <Button type="submit" disabled={loading}>
                {loading && <Spinner className="size-4" />}
                Email me a sign-in link
              </Button>
            </form>
          </TabsContent>

          <TabsContent value="password">
            <form onSubmit={handleEmailSignIn} className="flex flex-col gap-4">
              <div className="flex flex-col gap-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoComplete="email"
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  autoComplete="current-password"
                />
              </div>
              <Button type="submit" disabled={loading}>
                {loading && <Spinner className="size-4" />}
                Sign in
              </Button>
            </form>
          </TabsContent>
        </Tabs>

        {error && <p className="text-destructive text-sm">{error}</p>}

        <div className="relative">
          <Separator />
          <span className="bg-card text-muted-foreground absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 px-2 text-xs">
            OR CONTINUE WITH
          </span>
        </div>

        <Button variant="outline" onClick={handleGoogleSignIn} disabled={googleLoading}>
          {googleLoading ? (
            <Spinner className="size-4" />
          ) : (
            <svg className="size-4" viewBox="0 0 24 24">
              <path
                fill="currentColor"
                d="M21.35 11.1h-9.17v2.73h6.51c-.33 3.81-3.5 5.44-6.5 5.44a6.79 6.79 0 0 1-6.87-6.87 6.79 6.79 0 0 1 6.87-6.87c1.79 0 3.31.66 4.53 1.98l2.02-2.02A9.56 9.56 0 0 0 12.19 2a9.5 9.5 0 0 0-9.5 9.5 9.5 9.5 0 0 0 9.5 9.5c4.87 0 9.08-3.54 9.08-9.5 0-.72-.1-1.24-.09-1.4z"
              />
            </svg>
          )}
          Google
        </Button>

        <p className="text-muted-foreground text-center text-sm">
          No account?{" "}
          <Link href="/signup" className="text-primary underline underline-offset-4">
            Sign up
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}

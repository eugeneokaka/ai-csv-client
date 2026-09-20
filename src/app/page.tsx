import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { UserMenu } from "@/components/user-menu";
import { Upload, MessageCircle, BarChart3 } from "lucide-react";

const features = [
  {
    icon: Upload,
    title: "Upload your CSVs",
    description:
      "Drag and drop one or many files. Multiple CSVs are supported so you can join and compare.",
  },
  {
    icon: MessageCircle,
    title: "Ask questions",
    description:
      "Ask anything in plain language. No formulas, no code — just answers about your data.",
  },
  {
    icon: BarChart3,
    title: "Get charts & clean tables",
    description:
      "Your data gets filtered, grouped, visualized and saved — ready to download.",
  },
];

export default function Home() {
  return (
    <main className="flex min-h-svh flex-col">
      <header className="border-b">
        <div className="mx-auto flex h-16 max-w-5xl items-center justify-between px-6">
          <span className="text-lg font-semibold tracking-tight">
            AI CSV Analyzer
          </span>
          <UserMenu />
        </div>
      </header>

      <section className="mx-auto flex max-w-3xl flex-1 flex-col items-center justify-center gap-6 px-6 py-20 text-center">
        <h1 className="text-4xl font-bold tracking-tight text-balance sm:text-5xl">
          Ask your data anything
        </h1>
        <p className="text-muted-foreground text-lg text-pretty">
          Drop in a CSV, ask a question, and get answers, charts and cleaned
          data. No code, no spreadsheets, no learning curve.
        </p>
        <div className="flex items-center gap-3">
          <Button size="lg" asChild>
            <Link href="/chat">Try it now</Link>
          </Button>
          <Button size="lg" variant="outline" asChild>
            <Link href="/signup">Get started</Link>
          </Button>
          <Button size="lg" variant="link" asChild>
            <Link href="/login">Sign in</Link>
          </Button>
        </div>
      </section>

      <section className="mx-auto grid max-w-5xl gap-4 px-6 pb-20 sm:grid-cols-3">
        {features.map((f) => (
          <Card key={f.title}>
            <CardContent className="flex flex-col gap-3 pt-6">
              <f.icon className="size-6 text-primary" />
              <h3 className="font-semibold">{f.title}</h3>
              <p className="text-muted-foreground text-sm leading-relaxed">
                {f.description}
              </p>
            </CardContent>
          </Card>
        ))}
      </section>
    </main>
  );
}

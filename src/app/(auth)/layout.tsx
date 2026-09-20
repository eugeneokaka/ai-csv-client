export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <main className="bg-muted/40 flex min-h-svh flex-col items-center justify-center gap-6 p-6">
      <span className="text-xl font-semibold tracking-tight">
        AI CSV Analyzer
      </span>
      {children}
    </main>
  );
}

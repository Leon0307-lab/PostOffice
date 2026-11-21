import Link from "next/link";

export default function NotFound() {
  return (
    <main className="grid min-h-screen place-items-center px-4">
      <div className="card max-w-md text-center">
        <p className="text-5xl font-extrabold">404</p>
        <p className="mt-2 text-sm text-gray-600">
          Die Seite oder Sendung wurde nicht gefunden oder Sie haben keinen Zugriff darauf.
        </p>
        <Link href="/dashboard" className="btn-primary mt-4">
          Zum Dashboard
        </Link>
      </div>
    </main>
  );
}

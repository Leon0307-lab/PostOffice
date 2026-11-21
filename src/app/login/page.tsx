import { redirect } from "next/navigation";
import ActionForm from "@/components/ActionForm";
import { loginAction } from "@/app/actions/auth";
import { getCurrentUser } from "@/lib/auth";

export const metadata = { title: "Anmelden" };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const current = await getCurrentUser();
  if (current) redirect("/dashboard");
  const { next } = await searchParams;

  return (
    <main className="grid min-h-screen place-items-center px-4 py-10">
      <div className="w-full max-w-md">
        <div className="mb-6 text-center">
          <h1 className="text-4xl font-extrabold tracking-tight">
            <span className="rounded bg-brand-yellow px-2 py-1">Post</span>Office
          </h1>
          <p className="mt-3 text-sm text-gray-600">Internes Post- und Logistiksystem</p>
        </div>
        <div className="card border-t-8 border-t-brand-yellow">
          <h2 className="mb-4 text-xl font-bold">Anmelden</h2>
          <ActionForm action={loginAction} submitLabel="Anmelden" buttonClassName="btn-primary btn-lg w-full">
            <input type="hidden" name="next" value={next ?? ""} />
            <div>
              <label htmlFor="email" className="label">
                E-Mail-Adresse
              </label>
              <input
                id="email"
                name="email"
                type="email"
                required
                autoComplete="username"
                inputMode="email"
                className="input"
              />
            </div>
            <div>
              <label htmlFor="password" className="label">
                Passwort
              </label>
              <input
                id="password"
                name="password"
                type="password"
                required
                autoComplete="current-password"
                className="input"
              />
            </div>
          </ActionForm>
        </div>
        <p className="mt-4 text-center text-xs text-gray-500">
          Zugangsdaten erhalten Sie von Ihrem Administrator.
        </p>
      </div>
    </main>
  );
}

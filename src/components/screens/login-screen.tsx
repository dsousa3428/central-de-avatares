"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Eye, EyeOff, Lock } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { loginErrorMessage } from "@/lib/errors";
import { getSupabase, isSupabaseConfigured, supabaseConfigProblem } from "@/lib/supabase";
import { Logo } from "@/components/logo";
import { EnvMissingScreen } from "@/components/shell/setup-screens";
import { Button } from "@/components/ui/button";
import { Field, FormError, Input } from "@/components/ui/field";
import { FullScreenLoading } from "@/components/ui/spinner";

export function LoginScreen() {
  const auth = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Já está logado? Vai direto para o painel.
  useEffect(() => {
    if (auth.status === "signed_in") router.replace("/");
  }, [auth.status, router]);

  if (!isSupabaseConfigured) return <EnvMissingScreen problem={supabaseConfigProblem} />;
  if (auth.status !== "signed_out") return <FullScreenLoading />;

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (busy) return;
    if (!email.trim() || !password) {
      setError("Preencha o e-mail e a senha.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const { error: signInError } = await getSupabase().auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      if (signInError) throw signInError;
      // O redirecionamento acontece no efeito acima, quando a sessão chega.
      // Esta tela continua guardada (escondida) pelo navegador: não deixa a senha nela.
      setPassword("");
      setShowPassword(false);
    } catch (err) {
      setError(loginErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-sm flex-col justify-center px-5 py-10">
      <div className="mb-8 flex flex-col items-center text-center">
        <Logo className="size-16" />
        <h1 className="mt-4 text-2xl font-bold tracking-tight">Central de Avatares</h1>
        <p className="mt-1 text-sm text-muted">Painel privado. Entre com seu e-mail e senha.</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4 rounded-3xl border border-line bg-surface p-5 shadow-card" noValidate>
        <Field label="E-mail">
          <Input
            type="email"
            name="email"
            inputMode="email"
            autoComplete="username"
            autoCapitalize="none"
            spellCheck={false}
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="voce@exemplo.com"
            required
          />
        </Field>
        <Field label="Senha">
          <span className="relative block">
            <Input
              type={showPassword ? "text" : "password"}
              name="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="pr-12"
              required
            />
            <button
              type="button"
              onClick={() => setShowPassword((value) => !value)}
              aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}
              className="absolute right-1 top-1/2 flex size-9 -translate-y-1/2 items-center justify-center rounded-lg text-muted hover:text-fg focus-visible:outline-2 focus-visible:outline-ring"
            >
              {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
            </button>
          </span>
        </Field>
        <FormError message={error} />
        <Button type="submit" variant="primary" size="lg" block loading={busy}>
          Entrar
        </Button>
      </form>

      <p className="mt-5 flex items-center justify-center gap-1.5 text-center text-xs text-muted">
        <Lock className="size-3.5" aria-hidden />
        Acesso exclusivo: não existe cadastro público.
      </p>
    </main>
  );
}

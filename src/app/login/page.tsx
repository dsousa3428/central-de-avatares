import type { Metadata } from "next";
import { LoginScreen } from "@/components/screens/login-screen";

export const metadata: Metadata = { title: "Entrar" };

export default function LoginPage() {
  return <LoginScreen />;
}

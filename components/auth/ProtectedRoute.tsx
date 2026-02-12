"use client";

import { useAuth } from "@/context/AuthContext";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { Loader2 } from "lucide-react";

interface ProtectedRouteProps {
  children: React.ReactNode;
  requiredRole?: "admin" | "closer" | "sdr";
}

export default function ProtectedRoute({ children, requiredRole }: ProtectedRouteProps) {
  const { user, profile, loading, isAdmin } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading) {
      // 1. Se não está logado, vai para o Login
      if (!user) {
        router.push("/login");
        return;
      }

      // 2. Se a rota exige Admin e o cara não é Admin, bloqueia
      if (requiredRole === "admin" && !isAdmin) {
        router.push("/admin/dashboard"); // Manda para um lugar seguro
      }
      
      // 3. Se o cara está logado mas não tem perfil (erro de cadastro)
      if (user && !profile) {
          router.push("/login");
      }
    }
  }, [user, profile, loading, isAdmin, router, requiredRole]);

  if (loading) {
    return (
      <div className="h-screen w-screen flex flex-col items-center justify-center bg-[#050505]">
        <Loader2 className="animate-spin text-white/20" size={40} />
      </div>
    );
  }

  // Se passou por todas as verificações, renderiza a página
  return <>{children}</>;
}
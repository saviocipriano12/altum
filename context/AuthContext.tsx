"use client";

import React, { createContext, useContext, useEffect, useState } from 'react';
import { onAuthStateChanged, User, signOut } from 'firebase/auth';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { auth, db } from '@/firebaseConfig';
import { useRouter } from 'next/navigation';

// --- TIPOS ---

// Definindo o que é um usuário da Altum (além do login do Google)
export interface UserProfile {
  id: string;
  name: string;
  email: string;
  role: "admin" | "closer" | "sdr";
  status: "active" | "blocked";
  commissionRate: number;
}

interface AuthContextType {
  user: User | null;      // Usuário técnico (Google)
  profile: UserProfile | null; // Perfil de Negócio (Cargo, Comissão)
  loading: boolean;
  isAdmin: boolean;       // Atalho útil: É o Savio?
}

// --- CONTEXTO ---

const AuthContext = createContext<AuthContextType>({ 
  user: null, 
  profile: null, 
  loading: true, 
  isAdmin: false 
});

// --- PROVIDER ---

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        // 1. Usuário logou no Google/Email
        setUser(firebaseUser);

        try {
          // 2. Agora vamos descobrir QUEM ele é no banco da Altum
          // Buscamos na coleção 'users' onde o email é igual ao do login
          const q = query(
            collection(db, "users"), 
            where("email", "==", firebaseUser.email)
          );
          
          const querySnapshot = await getDocs(q);

          if (!querySnapshot.empty) {
            // ACHAMOS O PERFIL!
            const userDoc = querySnapshot.docs[0];
            const userData = userDoc.data() as UserProfile;

            // Segurança: Se estiver bloqueado, desloga na hora
            if (userData.status === "blocked") {
              alert("Acesso negado. Sua conta está bloqueada.");
              await signOut(auth);
              setUser(null);
              setProfile(null);
              router.push("/login");
              return;
            }

            // Tudo certo: Salva o perfil
            setProfile({ ...userData, id: userDoc.id });
          } else {
            // Logou, mas não tem cadastro na equipe (Pode ser um erro ou invasor)
            // Opcional: Se for você (admin supremo), pode querer tratar diferente.
            console.warn("Usuário logado sem perfil de equipe cadastrado.");
            setProfile(null); 
          }
        } catch (error) {
          console.error("Erro ao buscar perfil do usuário:", error);
        }

      } else {
        // Usuário saiu
        setUser(null);
        setProfile(null);
      }
      
      setLoading(false);
    });

    return () => unsubscribe();
  }, [router]);

  return (
    <AuthContext.Provider 
      value={{ 
        user, 
        profile, 
        loading, 
        isAdmin: profile?.role === "admin" // Atalho mágico
      }}
    >
      {!loading && children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
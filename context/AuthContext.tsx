"use client";

import React, { createContext, useContext, useEffect, useState } from "react";
import { onAuthStateChanged, User, signOut } from "firebase/auth";
import { collection, doc, getDoc, getDocs, query, setDoc, where } from "firebase/firestore";
import { auth, db } from "@/firebaseConfig";
import { getMissingFirebaseClientEnvs } from "@/app/lib/firebase-client-env";
import { useRouter } from "next/navigation";

export interface UserProfile {
  id: string;
  uid: string;
  name: string;
  email: string;
  role:
    | "admin"
    | "closer"
    | "sdr"
    | "client"
    | "agency_owner"
    | "agency_admin"
    | "agency_agent"
    | "client_owner"
    | "client_admin"
    | "client_agent"
    | "client_viewer";
  status: "active" | "blocked";
  commissionRate: number;
  asaasWalletId?: string | null;
}

interface AuthContextType {
  user: User | null;
  profile: UserProfile | null;
  loading: boolean;
  isAdmin: boolean;
  signOutUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  profile: null,
  loading: true,
  isAdmin: false,
  signOutUser: async () => {},
});

function normalizeRole(value: unknown): UserProfile["role"] {
  if (
    value === "admin" ||
    value === "closer" ||
    value === "sdr" ||
    value === "client" ||
    value === "agency_owner" ||
    value === "agency_admin" ||
    value === "agency_agent" ||
    value === "client_owner" ||
    value === "client_admin" ||
    value === "client_agent" ||
    value === "client_viewer"
  ) {
    return value;
  }
  return "agency_agent";
}

function normalizeStatus(value: unknown): UserProfile["status"] {
  return value === "blocked" ? "blocked" : "active";
}

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  async function ensureCanonicalProfile(firebaseUser: User) {
    const canonicalRef = doc(db, "users", firebaseUser.uid);
    const canonicalSnap = await getDoc(canonicalRef);
    if (canonicalSnap.exists()) {
      return canonicalSnap;
    }

    const email = (firebaseUser.email || "").trim().toLowerCase();
    if (!email) return canonicalSnap;

    const legacySnap = await getDocs(
      query(collection(db, "users"), where("email", "==", email))
    );

    if (legacySnap.empty) return canonicalSnap;

    const legacyDoc = legacySnap.docs[0];
    await setDoc(
      canonicalRef,
      {
        ...legacyDoc.data(),
        uid: firebaseUser.uid,
        email,
        migratedFromLegacyId: legacyDoc.id,
        updatedAt: Date.now(),
      },
      { merge: true }
    );

    return getDoc(canonicalRef);
  }

  useEffect(() => {
    const missingEnvs = getMissingFirebaseClientEnvs();
    if (missingEnvs.length) {
      console.error(
        "Firebase client env ausente. Ajuste o .env.local:",
        missingEnvs.join(", ")
      );
      setUser(null);
      setProfile(null);
      setLoading(false);
      return;
    }

    let authResolved = false;
    const watchdog = window.setTimeout(() => {
      if (authResolved) return;
      console.error(
        "Timeout ao inicializar autenticacao Firebase no cliente."
      );
      setUser(null);
      setProfile(null);
      setLoading(false);
    }, 12000);

    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      authResolved = true;
      window.clearTimeout(watchdog);
      setLoading(true);

      if (!firebaseUser) {
        setUser(null);
        setProfile(null);
        setLoading(false);
        return;
      }

      setUser(firebaseUser);

      try {
        const profileSnap = await ensureCanonicalProfile(firebaseUser);

        if (!profileSnap.exists()) {
          console.warn("Usuario autenticado sem documento users/{uid}. Encerrando sessao.");
          await signOut(auth);
          setUser(null);
          setProfile(null);
          router.push("/login");
          setLoading(false);
          return;
        }

        const data = profileSnap.data() as Partial<UserProfile>;
        const normalizedProfile: UserProfile = {
          id: profileSnap.id,
          uid: firebaseUser.uid,
          name: data.name || firebaseUser.displayName || "Colaborador",
          email: data.email || firebaseUser.email || "",
          role: normalizeRole(data.role),
          status: normalizeStatus(data.status),
          commissionRate: Number(data.commissionRate || 0),
          asaasWalletId: data.asaasWalletId || null,
        };

        if (normalizedProfile.status !== "active") {
          alert("Acesso negado. Sua conta esta bloqueada.");
          await signOut(auth);
          setUser(null);
          setProfile(null);
          router.push("/login");
          setLoading(false);
          return;
        }

        setProfile(normalizedProfile);
      } catch (error) {
        console.error("Erro ao carregar perfil do usuario:", error);
        await signOut(auth);
        setUser(null);
        setProfile(null);
        router.push("/login");
      } finally {
        setLoading(false);
      }
    });

    return () => {
      window.clearTimeout(watchdog);
      unsubscribe();
    };
  }, [router]);

  async function signOutUser() {
    await signOut(auth);
    router.push("/login");
  }

  const isAdminRole =
    profile?.role === "admin" ||
    profile?.role === "agency_owner" ||
    profile?.role === "agency_admin";

  return (
    <AuthContext.Provider
      value={{
        user,
        profile,
        loading,
        isAdmin: Boolean(isAdminRole),
        signOutUser,
      }}
    >
      {!loading && children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);

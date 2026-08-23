"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { supabase } from "@/lib/supabase";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;

    supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      setSession(data?.session ?? null);
      setLoading(false);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next);
      setLoading(false);
    });

    return () => {
      active = false;
      sub?.subscription?.unsubscribe();
    };
  }, []);

  // التسجيل صار عبر مسارنا لا supabase.auth.signUp مباشرة: الخادم
  // ينشئ الحساب ويرسل رابط التأكيد بقالبنا العربي عبر Mailtrap،
  // بدل رسالة Supabase الافتراضية الإنجليزية من مرسلها المحدود.
  const signUp = useCallback(async (email, password, displayName) => {
    try {
      const res = await fetch("/api/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          password,
          displayName: displayName?.trim() || undefined,
        }),
      });
      const payload = await res.json().catch(() => null);
      if (!res.ok || !payload?.ok) {
        return {
          ok: false,
          message: payload?.error ?? "تعذّر إنشاء الحساب. أعد المحاولة.",
        };
      }
      // ما فيه جلسة قبل التأكيد أبداً في هذا المسار
      return { ok: true, needsConfirmation: true };
    } catch (err) {
      console.error("[auth] signup failed:", err);
      return { ok: false, message: "ما وصلنا للخادم — تأكد من اتصالك." };
    }
  }, []);

  const signIn = useCallback(async (email, password) => {
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    if (error) return { ok: false, message: error.message };
    return { ok: true };
  }, []);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
  }, []);

  // التوكن هو الهوية الموثوقة لنداء /api/decide
  const accessToken = useCallback(async () => {
    const { data } = await supabase.auth.getSession();
    return data?.session?.access_token ?? null;
  }, []);

  const value = useMemo(
    () => ({
      session,
      user: session?.user ?? null,
      loading,
      signUp,
      signIn,
      signOut,
      accessToken,
    }),
    [session, loading, signUp, signIn, signOut, accessToken],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}

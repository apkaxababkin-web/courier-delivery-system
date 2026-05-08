import { useEffect } from "react";
import { useRouter, useSegments } from "expo-router";
import { useCourierAuth } from "@/lib/courier-auth";

/**
 * AuthGuard: Redirects unauthenticated users to /login.
 * Must be placed inside CourierAuthProvider.
 */
export function AuthGuard({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, loading } = useCourierAuth();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;

    const inAuthGroup = segments[0] === "login";

    if (!isAuthenticated && !inAuthGroup) {
      // Not authenticated and not on login screen → redirect to login
      router.replace("/login");
    } else if (isAuthenticated && inAuthGroup) {
      // Authenticated and on login screen → redirect to main app
      router.replace("/(tabs)");
    }
  }, [isAuthenticated, loading, segments, router]);

  return <>{children}</>;
}

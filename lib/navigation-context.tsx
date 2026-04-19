import React, { createContext, useContext, useState } from "react";

export type NavigationScreen = "tabs" | "task-detail" | "profile";

interface NavigationContextType {
  currentScreen: NavigationScreen;
  taskDetailId?: string;
  navigateTo: (screen: NavigationScreen, params?: Record<string, any>) => void;
  goBack: () => void;
}

const NavigationContext = createContext<NavigationContextType | undefined>(undefined);

export function NavigationProvider({ children }: { children: React.ReactNode }) {
  const [currentScreen, setCurrentScreen] = useState<NavigationScreen>("tabs");
  const [taskDetailId, setTaskDetailId] = useState<string | undefined>();

  const navigateTo = (screen: NavigationScreen, params?: Record<string, any>) => {
    setCurrentScreen(screen);
    if (screen === "task-detail" && params?.id) {
      setTaskDetailId(params.id);
    }
  };

  const goBack = () => {
    setCurrentScreen("tabs");
    setTaskDetailId(undefined);
  };

  return (
    <NavigationContext.Provider value={{ currentScreen, taskDetailId, navigateTo, goBack }}>
      {children}
    </NavigationContext.Provider>
  );
}

export function useNavigation() {
  const context = useContext(NavigationContext);
  if (!context) {
    throw new Error("useNavigation must be used within NavigationProvider");
  }
  return context;
}

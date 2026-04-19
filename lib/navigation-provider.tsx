import React, { createContext, useContext } from "react";

interface NavigationContextType {
  navigateToTaskDetail: (taskId: number) => void;
  navigateToProfile: () => void;
  navigateBack: () => void;
}

const NavigationContext = createContext<NavigationContextType | undefined>(undefined);

export function NavigationProvider({
  children,
  navigateToTaskDetail,
  navigateToProfile,
  navigateBack,
}: {
  children: React.ReactNode;
  navigateToTaskDetail: (taskId: number) => void;
  navigateToProfile: () => void;
  navigateBack: () => void;
}) {
  return (
    <NavigationContext.Provider value={{ navigateToTaskDetail, navigateToProfile, navigateBack }}>
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

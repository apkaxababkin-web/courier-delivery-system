import React, { createContext, useContext, useState, useEffect } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";

export type FontSizeScale = "normal" | "large" | "xlarge";

interface FontSizeContextType {
  fontSizeScale: FontSizeScale;
  setFontSizeScale: (scale: FontSizeScale) => Promise<void>;
  getFontSize: (baseSize: number) => number;
}

const FontSizeContext = createContext<FontSizeContextType | undefined>(undefined);

const FONT_SIZE_STORAGE_KEY = "font_size_scale";

const SCALE_MULTIPLIERS: Record<FontSizeScale, number> = {
  normal: 1,
  large: 1.2,
  xlarge: 1.4,
};

export function FontSizeProvider({ children }: { children: React.ReactNode }) {
  const [fontSizeScale, setFontSizeScaleState] = useState<FontSizeScale>("normal");
  const [isLoaded, setIsLoaded] = useState(false);

  // Load saved font size scale from storage
  useEffect(() => {
    const loadFontSizeScale = async () => {
      try {
        const saved = await AsyncStorage.getItem(FONT_SIZE_STORAGE_KEY);
        if (saved && (saved === "normal" || saved === "large" || saved === "xlarge")) {
          setFontSizeScaleState(saved as FontSizeScale);
        }
      } catch (error) {
        console.error("Failed to load font size scale:", error);
      } finally {
        setIsLoaded(true);
      }
    };

    loadFontSizeScale();
  }, []);

  const setFontSizeScale = async (scale: FontSizeScale) => {
    try {
      await AsyncStorage.setItem(FONT_SIZE_STORAGE_KEY, scale);
      setFontSizeScaleState(scale);
    } catch (error) {
      console.error("Failed to save font size scale:", error);
    }
  };

  const getFontSize = (baseSize: number): number => {
    return Math.round(baseSize * SCALE_MULTIPLIERS[fontSizeScale]);
  };

  if (!isLoaded) {
    return null;
  }

  return (
    <FontSizeContext.Provider value={{ fontSizeScale, setFontSizeScale, getFontSize }}>
      {children}
    </FontSizeContext.Provider>
  );
}

export function useFontSize(): FontSizeContextType {
  const context = useContext(FontSizeContext);
  if (!context) {
    throw new Error("useFontSize must be used within FontSizeProvider");
  }
  return context;
}

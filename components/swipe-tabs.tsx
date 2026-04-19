import React, { useRef, useState } from "react";
import { View, ViewStyle, Platform } from "react-native";

let PagerView: any;
if (Platform.OS !== "web") {
  PagerView = require("react-native-pager-view").default;
}

interface SwipeTabsProps {
  pages: React.ReactNode[];
  onPageChange?: (page: number) => void;
  initialPage?: number;
  style?: ViewStyle;
}

/**
 * Custom swipe navigation component using PagerView
 * Allows swiping left/right to navigate between pages
 * Falls back to single page view on web
 */
export const SwipeTabs = React.forwardRef<any, SwipeTabsProps>(
  ({ pages, onPageChange, initialPage = 0, style }, ref) => {
    const [currentPage, setCurrentPage] = useState(initialPage);
    const pagerRef = useRef<any>(null);

    // Web fallback: render only current page
    if (Platform.OS === "web") {
      return (
        <View style={[{ flex: 1 }, style]}>
          {pages[currentPage]}
        </View>
      );
    }

    const handlePageScroll = (e: any) => {
      const position = e?.position ?? 0;
      const page = Math.round(position);
      if (!isNaN(page) && page !== currentPage) {
        setCurrentPage(page);
        onPageChange?.(page);
      }
    };

    return (
      <View style={[{ flex: 1 }, style]}>
        <PagerView
          ref={pagerRef}
          style={{ flex: 1 }}
          initialPage={initialPage}
          onPageScroll={handlePageScroll}
          onPageSelected={(e: any) => {
            const position = e?.position ?? 0;
            if (!isNaN(position)) {
              setCurrentPage(position);
              onPageChange?.(position);
            }
          }}
        >
          {pages.map((page, index) => (
            <View key={index} style={{ flex: 1 }}>
              {page}
            </View>
          ))}
        </PagerView>
      </View>
    );
  }
);

SwipeTabs.displayName = "SwipeTabs";

import React, { useRef, useState } from "react";
import { View, ViewStyle } from "react-native";
import PagerView, { PagerViewOnPageScrollEventData } from "react-native-pager-view";

interface SwipeTabsProps {
  pages: React.ReactNode[];
  onPageChange?: (page: number) => void;
  initialPage?: number;
  style?: ViewStyle;
}

/**
 * Custom swipe navigation component using PagerView
 * Allows swiping left/right to navigate between pages
 */
export const SwipeTabs = React.forwardRef<PagerView, SwipeTabsProps>(
  ({ pages, onPageChange, initialPage = 0, style }, ref) => {
    const [currentPage, setCurrentPage] = useState(initialPage);
    const pagerRef = useRef<PagerView>(null);

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

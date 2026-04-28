import React from 'react';
import { View, TouchableOpacity, Text } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useColors } from '@/hooks/use-colors';
import { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { MaterialIcons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';

const TAB_ICONS: Record<string, keyof typeof MaterialIcons.glyphMap> = {
  AllTasks: 'list',
  Hemotest: 'local-hospital',
  Sberbank: 'store',
  Messages: 'mail',
};

const TAB_LABELS = {
  AllTasks: 'Все заявки',
  Hemotest: 'Гемотест',
  Sberbank: 'Сбербанк',
  Messages: 'Письма',
};

export function SolitoTabBar({ state, descriptors, navigation }: BottomTabBarProps) {
  const colors = useColors();

  return (
    <SafeAreaView
      edges={['bottom']}
      style={{
        backgroundColor: colors.background,
      }}
    >
      <View
        style={{
          borderTopWidth: 1,
          borderTopColor: colors.border,
        }}
      >
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          paddingHorizontal: 12,
          paddingTop: 8,
          paddingBottom: 8,
          marginHorizontal: 12,
          marginBottom: 12,
          backgroundColor: colors.surface === '#f5f5f5' ? '#e8e8e8' : '#0f1419',
          borderRadius: 24,
          borderWidth: 1,
          borderColor: colors.border,
          width: 300,
          alignSelf: 'center',
        }}
      >
        {state.routes.map((route, index) => {
          const { options } = descriptors[route.key];
          const isFocused = state.index === index;

          const onPress = () => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            const event = navigation.emit({
              type: 'tabPress',
              target: route.key,
              canPreventDefault: true,
            });

            if (!isFocused && !event.defaultPrevented) {
              navigation.navigate(route.name, route.params);
            }
          };

          const iconName = TAB_ICONS[route.name] || 'help';
          const label = TAB_LABELS[route.name as keyof typeof TAB_LABELS] || route.name;

          return (
            <TouchableOpacity
              key={route.key}
              onPress={onPress}
              style={{
                flex: 1,
                alignItems: 'center',
                justifyContent: 'center',
                paddingVertical: 8,
                paddingHorizontal: 4,
              }}
            >
              <MaterialIcons
                name={iconName}
                size={24}
                color={isFocused ? colors.primary : colors.muted}
              />
              <Text
                style={{
                  fontSize: 10,
                  color: isFocused ? colors.primary : colors.muted,
                  marginTop: 2,
                }}
                numberOfLines={1}
              >
                {label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
      </View>
    </SafeAreaView>
  );
}

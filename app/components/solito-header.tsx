import React from 'react';
import { View, Text, TouchableOpacity, SafeAreaView } from 'react-native';
import { useColors } from '@/hooks/use-colors';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';

interface SolitoHeaderProps {
  title?: string;
  showProfile?: boolean;
  onProfilePress?: () => void;
  showMenu?: boolean;
  onMenuPress?: () => void;
}

export function SolitoHeader({
  title = new Date().toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' }),
  showProfile = true,
  onProfilePress,
  showMenu = true,
  onMenuPress,
}: SolitoHeaderProps) {
  const colors = useColors();
  const navigation = useNavigation();

  return (
    <SafeAreaView style={{ backgroundColor: colors.background }}>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingHorizontal: 16,
          paddingVertical: 12,
          backgroundColor: colors.background,
          borderBottomWidth: 1,
          borderBottomColor: colors.border,
        }}
      >
        {/* Profile Icon */}
        {showProfile && (
          <TouchableOpacity
            onPress={onProfilePress}
            style={{
              width: 40,
              height: 40,
              borderRadius: 20,
              backgroundColor: colors.primary,
              justifyContent: 'center',
              alignItems: 'center',
            }}
          >
            <Ionicons name="person" size={24} color={colors.background} />
          </TouchableOpacity>
        )}

        {/* Title */}
        <Text
          style={{
            fontSize: 16,
            fontWeight: '600',
            color: colors.foreground,
            flex: 1,
            textAlign: 'center',
          }}
        >
          {title}
        </Text>

        {/* Menu Icon */}
        {showMenu && (
          <TouchableOpacity
            onPress={onMenuPress}
            style={{
              width: 40,
              height: 40,
              justifyContent: 'center',
              alignItems: 'center',
            }}
          >
            <Ionicons name="menu" size={24} color={colors.foreground} />
          </TouchableOpacity>
        )}
      </View>
    </SafeAreaView>
  );
}

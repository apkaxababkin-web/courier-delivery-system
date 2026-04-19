import React, { useState, useMemo } from 'react';
import { View, Text, Pressable, Modal, ScrollView } from 'react-native';
import { useSelectedDate } from '@/lib/date-context';
import { useColors } from '@/hooks/use-colors';
import { cn } from '@/lib/utils';

export function HeaderBar() {
  const colors = useColors();
  const { selectedDate, setSelectedDate } = useSelectedDate();
  const [showCalendar, setShowCalendar] = useState(false);

  const formatDate = (date: Date) => {
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = String(date.getFullYear()).slice(-2);
    return `${day}.${month}.${year}`;
  };

  const getDaysInMonth = (date: Date) => {
    return new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
  };

  const getFirstDayOfMonth = (date: Date) => {
    const day = new Date(date.getFullYear(), date.getMonth(), 1).getDay();
    return day === 0 ? 6 : day - 1;
  };

  const handleDateChange = (day: number) => {
    const newDate = new Date(selectedDate);
    newDate.setDate(day);
    setSelectedDate(newDate);
    setShowCalendar(false);
  };

  const renderCalendar = () => {
    const daysInMonth = getDaysInMonth(selectedDate);
    const firstDay = getFirstDayOfMonth(selectedDate);
    const calendarGrid = [];
    let week = [];

    // Empty cells for days before month starts
    for (let i = 0; i < firstDay; i++) {
      week.push(
        <View
          key={`empty-${i}`}
          style={{
            flex: 1,
            height: 40,
            justifyContent: 'center',
            alignItems: 'center',
          }}
        />
      );
    }

    // Days of month
    for (let day = 1; day <= daysInMonth; day++) {
      const isSelected =
        day === selectedDate.getDate() &&
        selectedDate.getMonth() === new Date().getMonth() &&
        selectedDate.getFullYear() === new Date().getFullYear();

      const isToday =
        day === new Date().getDate() &&
        new Date().getMonth() === selectedDate.getMonth() &&
        new Date().getFullYear() === selectedDate.getFullYear();

      week.push(
        <Pressable
          key={day}
          onPress={() => handleDateChange(day)}
          style={{
            flex: 1,
            height: 40,
            justifyContent: 'center',
            alignItems: 'center',
            backgroundColor: isSelected ? colors.primary : 'transparent',
            borderRadius: 8,
            borderWidth: isToday ? 2 : 0,
            borderColor: colors.primary,
          }}
        >
          <Text
            style={{
              color: isSelected ? colors.background : colors.foreground,
              fontWeight: isSelected ? '600' : '400',
              fontSize: 14,
            }}
          >
            {day}
          </Text>
        </Pressable>
      );

      if (week.length === 7) {
        calendarGrid.push(
          <View key={`week-${day}`} style={{ flexDirection: 'row', gap: 4, marginBottom: 4 }}>
            {week}
          </View>
        );
        week = [];
      }
    }

    if (week.length > 0) {
      calendarGrid.push(
        <View key="last-week" style={{ flexDirection: 'row', gap: 4 }}>
          {week}
        </View>
      );
    }

    return calendarGrid;
  };

  const monthYear = selectedDate.toLocaleDateString('ru-RU', {
    month: 'long',
    year: 'numeric',
  });

  const handlePrevMonth = () => {
    const newDate = new Date(selectedDate);
    newDate.setMonth(newDate.getMonth() - 1);
    setSelectedDate(newDate);
  };

  const handleNextMonth = () => {
    const newDate = new Date(selectedDate);
    newDate.setMonth(newDate.getMonth() + 1);
    setSelectedDate(newDate);
  };

  return (
    <>
      {/* Header Bar */}
      <View
        style={{
          backgroundColor: colors.surface,
          borderBottomWidth: 0.5,
          borderBottomColor: colors.border,
          paddingHorizontal: 16,
          paddingVertical: 12,
        }}
      >
        <Pressable
          onPress={() => setShowCalendar(true)}
          style={{
            paddingVertical: 8,
            paddingHorizontal: 12,
            backgroundColor: colors.background,
            borderRadius: 8,
            borderWidth: 1,
            borderColor: colors.border,
            alignItems: 'center',
          }}
        >
          <Text
            style={{
              fontSize: 16,
              fontWeight: '600',
              color: colors.foreground,
            }}
          >
            📅 {formatDate(selectedDate)}
          </Text>
        </Pressable>
      </View>

      {/* Calendar Modal */}
      <Modal
        visible={showCalendar}
        transparent
        animationType="fade"
        onRequestClose={() => setShowCalendar(false)}
      >
        <Pressable
          style={{
            flex: 1,
            backgroundColor: 'rgba(0, 0, 0, 0.5)',
            justifyContent: 'center',
            alignItems: 'center',
          }}
          onPress={() => setShowCalendar(false)}
        >
          <Pressable
            style={{
              backgroundColor: colors.surface,
              borderRadius: 16,
              padding: 20,
              width: '85%',
              maxWidth: 400,
            }}
            onPress={(e) => e.stopPropagation()}
          >
            {/* Month/Year Header */}
            <View
              style={{
                flexDirection: 'row',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: 16,
              }}
            >
              <Pressable
                onPress={handlePrevMonth}
                style={{
                  padding: 8,
                  borderRadius: 8,
                  backgroundColor: colors.background,
                }}
              >
                <Text style={{ fontSize: 18, color: colors.foreground }}>←</Text>
              </Pressable>

              <Text
                style={{
                  fontSize: 16,
                  fontWeight: '600',
                  color: colors.foreground,
                  textTransform: 'capitalize',
                }}
              >
                {monthYear}
              </Text>

              <Pressable
                onPress={handleNextMonth}
                style={{
                  padding: 8,
                  borderRadius: 8,
                  backgroundColor: colors.background,
                }}
              >
                <Text style={{ fontSize: 18, color: colors.foreground }}>→</Text>
              </Pressable>
            </View>

            {/* Weekday Headers */}
            <View
              style={{
                flexDirection: 'row',
                gap: 4,
                marginBottom: 8,
              }}
            >
              {['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'].map((day) => (
                <View
                  key={day}
                  style={{
                    flex: 1,
                    height: 30,
                    justifyContent: 'center',
                    alignItems: 'center',
                  }}
                >
                  <Text
                    style={{
                      fontSize: 12,
                      fontWeight: '600',
                      color: colors.muted,
                    }}
                  >
                    {day}
                  </Text>
                </View>
              ))}
            </View>

            {/* Calendar Grid */}
            <ScrollView style={{ maxHeight: 300 }}>
              {renderCalendar()}
            </ScrollView>

            {/* Close Button */}
            <Pressable
              onPress={() => setShowCalendar(false)}
              style={{
                marginTop: 16,
                paddingVertical: 12,
                backgroundColor: colors.primary,
                borderRadius: 8,
                alignItems: 'center',
              }}
            >
              <Text
                style={{
                  color: colors.background,
                  fontWeight: '600',
                  fontSize: 14,
                }}
              >
                Готово
              </Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

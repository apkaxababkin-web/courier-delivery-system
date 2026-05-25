import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { NavigationContainer } from '@react-navigation/native';

export const Stack = createNativeStackNavigator();
export const Tab = createBottomTabNavigator();

export type RootStackParamList = {
  MainTabs: undefined;
  TaskDetail: { id: string };
  Profile: undefined;
};

export type MainTabsParamList = {
  AllTasks: undefined;
  Hemotest: undefined;
  Sberbank: undefined;
  Messages: undefined;
};

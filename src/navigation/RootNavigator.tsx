import { NavigationContainer, DefaultTheme } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Feather } from '@expo/vector-icons';
import { StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import LedgerScreen from '../components/LedgerScreen';
import MapScreen from '../components/MapScreen';
import CaptureScreen from '../components/CaptureScreen';
import SettingsScreen from '../components/SettingsScreen';
import AuthScreen from '../components/AuthScreen';
import { useAuthStore } from '../store/useAuthStore';

const Tab = createBottomTabNavigator();

const navTheme = {
  ...DefaultTheme,
  colors: {
    ...DefaultTheme.colors,
    background: '#0A1128',
    primary: '#00FFFF',
    text: '#6495ED',
    card: '#0A1128',
    border: '#6495ED',
  },
};

type FeatherName = React.ComponentProps<typeof Feather>['name'];

const TAB_ICONS: Record<string, FeatherName> = {
  Ledger: 'database',
  Map: 'crosshair',
  Camera: 'aperture',
  Settings: 'settings',
};

export default function RootNavigator() {
  const insets = useSafeAreaInsets();
  const session = useAuthStore((s) => s.session);
  // initializing: true until getSession() resolves — prevents AuthScreen flash for returning users
  const initializing = useAuthStore((s) => s.initializing);

  if (initializing) {
    // Blank navy canvas while session restores — no flash of AuthScreen
    return null;
  }

  if (!session) {
    return (
      <NavigationContainer theme={navTheme}>
        <AuthScreen />
      </NavigationContainer>
    );
  }

  return (
    <NavigationContainer theme={navTheme}>
      <Tab.Navigator
        // Map is the primary launch screen per AGENTS.md requirements
        initialRouteName="Map"
        screenOptions={({ route }) => ({
          headerShown: false,
          tabBarActiveTintColor: '#00FFFF',
          tabBarInactiveTintColor: '#6495ED',
          tabBarStyle: {
            backgroundColor: '#0A1128',
            borderTopWidth: 1,
            borderTopColor: '#6495ED',
            height: 62 + insets.bottom,
            paddingBottom: 8 + insets.bottom,
            paddingTop: 6,
          },
          tabBarLabelStyle: {
            fontFamily: 'monospace',
            fontSize: 8,
            letterSpacing: 1.2,
            textTransform: 'uppercase',
          },
          tabBarIcon: ({ color, focused }) => {
            const name = TAB_ICONS[route.name] ?? 'circle';
            return (
              <Feather
                name={name}
                size={focused ? 20 : 18}
                color={color}
              />
            );
          },
        })}
      >
        <Tab.Screen name="Ledger" component={LedgerScreen} />
        <Tab.Screen name="Map" component={MapScreen} />
        <Tab.Screen name="Camera" component={CaptureScreen} />
        <Tab.Screen name="Settings" component={SettingsScreen} />
      </Tab.Navigator>
    </NavigationContainer>
  );
}

const styles = StyleSheet.create({});

import React, { useEffect } from 'react';
import { Platform, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { DefaultTheme, NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { RootStackParamList } from './src/navigation';
import { colors } from './src/theme';
import Toast from './src/components/Toast';
import WorkspacesScreen from './src/screens/WorkspacesScreen';
import WorkspaceScreen from './src/screens/WorkspaceScreen';
import CollectionScreen from './src/screens/CollectionScreen';
import RequestScreen from './src/screens/RequestScreen';

const Stack = createNativeStackNavigator<RootStackParamList>();

const theme = {
  ...DefaultTheme,
  colors: {
    ...DefaultTheme.colors,
    primary: colors.primary,
    background: colors.background,
    card: colors.surface,
    text: colors.text,
    border: colors.border,
  },
};

/** Centers the app in a portal-style column on desktop-width browsers. */
const usePortalShellOnWeb = (): void => {
  useEffect(() => {
    if (Platform.OS !== 'web') {
      return;
    }
    const doc = (globalThis as unknown as { document: Document }).document;
    const style = doc.createElement('style');
    style.textContent = `
      body { background: #ECECEC; }
      #root {
        max-width: 900px;
        margin: 0 auto;
        min-height: 100vh;
        background: ${colors.background};
        box-shadow: 0 0 32px rgba(33, 33, 33, 0.10);
      }
    `;
    doc.head.appendChild(style);
    return () => {
      doc.head.removeChild(style);
    };
  }, []);
};

export default function App() {
  usePortalShellOnWeb();

  return (
    <View style={{ flex: 1 }}>
      <NavigationContainer theme={theme}>
        <StatusBar style="dark" />
        <Stack.Navigator
          initialRouteName="Workspaces"
          screenOptions={{
            headerTintColor: colors.primary,
            headerTitleStyle: { color: colors.text },
            headerBackTitle: 'Back',
          }}
        >
          <Stack.Screen
            name="Workspaces"
            component={WorkspacesScreen}
            options={{ title: 'Workspaces' }}
          />
          <Stack.Screen name="Workspace" component={WorkspaceScreen} />
          <Stack.Screen name="Collection" component={CollectionScreen} />
          <Stack.Screen name="Request" component={RequestScreen} />
        </Stack.Navigator>
      </NavigationContainer>
      <Toast />
    </View>
  );
}

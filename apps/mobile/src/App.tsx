import { TabNavigator } from "./navigation/TabNavigator";

export function App() {
  // TODO(settings): the cycle panel switch comes from the profile settings.
  return <TabNavigator cycleEnabled={false} />;
}

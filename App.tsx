import { ExpoRoot } from 'expo-router';

export default function App() {
  // `require.context` is provided by Metro to let expo-router discover routes.
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const context = (require as any).context('./app');
  return <ExpoRoot context={context} />;
}

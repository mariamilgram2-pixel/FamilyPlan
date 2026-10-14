// Last line of defense: a render crash shows a calm recovery screen instead
// of a blank or red page. "Try Again" remounts the tree below.

import React from 'react';
import { View } from 'react-native';
import { Button, Txt } from './ui';
import { space } from '../theme';

interface State { error: Error | null; key: number }

export default class ErrorBoundary extends React.Component<{ children: React.ReactNode; background: string }, State> {
  state: State = { error: null, key: 0 };

  static getDerivedStateFromError(error: Error) { return { error }; }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('[sheep] Unhandled render error', error, info.componentStack);
  }

  render() {
    if (!this.state.error) return <React.Fragment key={this.state.key}>{this.props.children}</React.Fragment>;
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: space.l, gap: space.s, backgroundColor: this.props.background }}>
        <Txt v="title" align="center">Something went wrong</Txt>
        <Txt v="callout" tone="secondary" align="center" style={{ maxWidth: 360 }}>
          This screen hit an unexpected error. Your data is safe.
        </Txt>
        {__DEV__ ? <Txt v="footnote" tone="secondary" align="center" selectable style={{ maxWidth: 480 }}>{this.state.error.message}</Txt> : null}
        <Button label="Try Again" onPress={() => this.setState(s => ({ error: null, key: s.key + 1 }))} style={{ marginTop: space.s }} />
      </View>
    );
  }
}

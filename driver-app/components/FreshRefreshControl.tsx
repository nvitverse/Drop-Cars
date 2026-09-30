import React from 'react';
import { RefreshControl, RefreshControlProps } from 'react-native';
import { clearRequestCache } from '@/utils/requestCache';

/** Drop-in RefreshControl: pulling down always fetches fresh data (empties the small response cache first). */
export default function FreshRefreshControl(props: RefreshControlProps) {
  return (
    <RefreshControl
      {...props}
      onRefresh={() => {
        clearRequestCache();
        props.onRefresh?.();
      }}
    />
  );
}

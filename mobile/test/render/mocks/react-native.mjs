// Host-string stand-ins for React Native: enough to render the tree and press
// buttons in react-test-renderer. Not a behavioural emulation.
import React from 'react';

export const View = 'View';
export const Text = 'Text';
export const ScrollView = 'ScrollView';
export const TouchableOpacity = 'TouchableOpacity';
export const TextInput = 'TextInput';
export const Image = 'Image';
export const ActivityIndicator = 'ActivityIndicator';
export const StatusBar = 'StatusBar';

export function Modal({ visible, children }) {
  return visible ? React.createElement('Modal', null, children) : null;
}

export function FlatList({ data, renderItem, keyExtractor, ListHeaderComponent, ListEmptyComponent, ListFooterComponent }) {
  const items = (data || []).map((item, index) => React.createElement(
    React.Fragment, { key: keyExtractor ? keyExtractor(item, index) : String(index) }, renderItem({ item, index }),
  ));
  return React.createElement('FlatList', null, ListHeaderComponent || null,
    items.length ? items : (ListEmptyComponent || null), ListFooterComponent || null);
}

export const StyleSheet = { create: (s) => s, absoluteFill: {}, hairlineWidth: 1 };
export const PanResponder = { create: (cfg) => ({ panHandlers: { __pan: cfg } }) };
export const BackHandler = { addEventListener: () => ({ remove() {} }) };
export const Alert = {
  alert: (...args) => { (globalThis.__alerts = globalThis.__alerts || []).push(args); },
};

export default {
  View, Text, ScrollView, TouchableOpacity, TextInput, Image, ActivityIndicator, StatusBar, Modal, FlatList,
  StyleSheet, PanResponder, BackHandler, Alert,
};

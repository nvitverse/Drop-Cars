import { LayoutAnimation, Platform, UIManager } from 'react-native';

if (Platform.OS === 'android' && (UIManager as any).setLayoutAnimationEnabledExperimental) {
  try { (UIManager as any).setLayoutAnimationEnabledExperimental(true); } catch { /* new architecture: already on */ }
}

/** Call right BEFORE a state change that adds / removes / resizes things on screen (expanding a card, showing a section): the change
 *  then glides instead of jumping. */
export function animateLayout(): void {
  LayoutAnimation.configureNext(LayoutAnimation.create(220, LayoutAnimation.Types.easeInEaseOut, LayoutAnimation.Properties.opacity));
}

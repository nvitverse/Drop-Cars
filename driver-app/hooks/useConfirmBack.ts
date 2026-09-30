import { useCallback } from 'react';
import { BackHandler, Alert } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';

/**
 * Intercepts the Android hardware back button while the screen is focused and
 * asks the user to confirm before leaving. Prevents accidental exits from
 * multi-step flows (signup, add car, add driver) where a stray back tap would
 * lose the user's progress.
 *
 * @param enabled          turn the guard on/off (e.g. disable once submitted)
 * @param message          the confirmation message shown to the user
 * @param onConfirmLeave   optional action to run if the user confirms leaving
 */
export function useConfirmBack(
  enabled: boolean = true,
  message: string = 'Are you sure you want to go back? Your progress on this page may be lost.',
  onConfirmLeave?: () => void,
) {
  useFocusEffect(
    useCallback(() => {
      if (!enabled) return;

      const onBackPress = () => {
        Alert.alert(
          'Leave this page?',
          message,
          [
            { text: 'Stay', style: 'cancel' },
            {
              text: 'Leave',
              style: 'destructive',
              onPress: () => {
                if (onConfirmLeave) {
                  onConfirmLeave();
                } else {
                  BackHandler.exitApp();
                }
              },
            },
          ],
          { cancelable: true },
        );
        // Returning true tells Android we've handled the back press,
        // so it does NOT navigate away on its own.
        return true;
      };

      const subscription = BackHandler.addEventListener('hardwareBackPress', onBackPress);
      return () => subscription.remove();
    }, [enabled, message, onConfirmLeave]),
  );
}

export default useConfirmBack;

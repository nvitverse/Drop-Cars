import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  Modal,
  Alert,
  Dimensions,
} from 'react-native';
import { X, Check } from 'lucide-react-native';
import { useTheme } from '@/contexts/ThemeContext';
import axiosInstance from '@/app/api/axiosInstance';
import { useLanguage } from '@/contexts/LanguageContext';

const { height: screenHeight } = Dimensions.get('window');

// Local Bookings home-city picker - a driver can pick several cities, or
// "All Cities" to receive Local bookings from every admin-serviceable city.
interface LocalCityPickerProps {
  visible: boolean;
  onClose: () => void;
  currentCities: string[] | null;
  onSaved?: (cities: string[] | null) => void;
}

export default function LocalCityPicker({ visible, onClose, currentCities, onSaved }: LocalCityPickerProps) {
  const { colors } = useTheme();
  const { t } = useLanguage();
  const [cities, setCities] = useState<string[]>([]);
  const [selected, setSelected] = useState<string[]>(currentCities || []);
  const [search, setSearch] = useState('');
  const [saving, setSaving] = useState(false);

  const isAllSelected = selected.length === 1 && selected[0] === 'ALL';

  useEffect(() => {
    if (!visible) return;
    setSelected(currentCities || []);
    axiosInstance.get('/api/cities/local-serviceable')
      .then(res => setCities(res.data || []))
      .catch(() => {});
  }, [visible, currentCities]);

  const toggleAll = () => {
    setSelected(isAllSelected ? [] : ['ALL']);
  };

  const toggleCity = (city: string) => {
    setSelected(prev => {
      const withoutAll = prev.filter(c => c !== 'ALL');
      return withoutAll.includes(city) ? withoutAll.filter(c => c !== city) : [...withoutAll, city];
    });
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      const res = await axiosInstance.put('/api/users/vehicle-owner/local-city', { local_cities: selected });
      onSaved?.(res.data?.local_cities ?? null);
      onClose();
    } catch {
      Alert.alert(t('localCityPicker.errorTitle'), t('localCityPicker.saveFailedGeneric'));
    } finally {
      setSaving(false);
    }
  };

  const filteredCities = cities.filter(c => c.toLowerCase().includes(search.toLowerCase()));

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: 'rgba(0, 0, 0, 0.5)', justifyContent: 'flex-end' }}>
        <View style={{ height: screenHeight * 0.8, backgroundColor: colors.surface, borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingTop: 20 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingBottom: 16, borderBottomWidth: 1, borderBottomColor: colors.border }}>
            <Text style={{ fontSize: 20, fontFamily: 'Inter-Bold', color: colors.text }}>
              {t('localCityPicker.title')}
            </Text>
            <TouchableOpacity onPress={onClose} style={{ padding: 8 }}>
              <X color={colors.textSecondary} size={24} />
            </TouchableOpacity>
          </View>

          <Text style={{ fontSize: 13, color: colors.textSecondary, paddingHorizontal: 20, paddingTop: 12 }}>
            {t('localCityPicker.subtitle')}
          </Text>

          <View style={{ paddingHorizontal: 16, paddingTop: 12 }}>
            <TextInput
              value={search}
              onChangeText={setSearch}
              placeholder={t('localCityPicker.searchPlaceholder')}
              placeholderTextColor={colors.textSecondary}
              style={{
                borderWidth: 1,
                borderColor: colors.border,
                borderRadius: 6,
                paddingHorizontal: 12,
                paddingVertical: 10,
                color: colors.text,
              }}
            />
          </View>

          <ScrollView style={{ flex: 1, paddingHorizontal: 20, paddingTop: 16 }} showsVerticalScrollIndicator={false}>
            <TouchableOpacity
              onPress={toggleAll}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
                paddingVertical: 12,
                borderBottomWidth: 1,
                borderBottomColor: colors.border,
              }}
            >
              <Text style={{ color: colors.primary, fontSize: 15, fontFamily: 'Inter-SemiBold' }}>All Cities</Text>
              {isAllSelected && <Check color={colors.primary} size={20} />}
            </TouchableOpacity>

            {filteredCities.length === 0 && (
              <Text style={{ color: colors.textSecondary, textAlign: 'center', marginTop: 20 }}>
                {t('localCityPicker.noCitiesFound')}
              </Text>
            )}
            {filteredCities.map(city => {
              const isSelected = !isAllSelected && selected.includes(city);
              return (
                <TouchableOpacity
                  key={city}
                  onPress={() => toggleCity(city)}
                  disabled={isAllSelected}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    paddingVertical: 12,
                    borderBottomWidth: 1,
                    borderBottomColor: colors.border,
                    opacity: isAllSelected ? 0.4 : 1,
                  }}
                >
                  <Text style={{ color: colors.text, fontSize: 15 }}>{city}</Text>
                  {isSelected && <Check color={colors.primary} size={20} />}
                </TouchableOpacity>
              );
            })}
          </ScrollView>

          <TouchableOpacity
            onPress={handleSave}
            disabled={saving}
            style={{
              backgroundColor: colors.primary,
              margin: 16,
              borderRadius: 6,
              paddingVertical: 14,
              alignItems: 'center',
              opacity: saving ? 0.6 : 1,
            }}
          >
            <Text style={{ color: '#FFFFFF', fontWeight: '700', fontSize: 16 }}>
              {saving ? t('localCityPicker.saving') : t('localCityPicker.save')}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

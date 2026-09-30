import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  FlatList,
  Modal,
  ActivityIndicator,
  Platform,
  Keyboard,
  StatusBar,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  MapPin,
  X,
  Search,
  ArrowLeft,
  Clock,
  Bookmark,
  Navigation,
  Globe,
  PlusCircle,
  Sparkles,
} from 'lucide-react-native';
import {
  getCitySuggestions,
  searchCityOnline,
  scheduleAutoOnlineLookup,
  saveLocationToCache,
  loadSavedLocations,
  getRecentSearches,
  addRecentSearch,
  PlacePrediction,
} from '@/services/citySuggestions';
import { useTheme } from '@/context/ThemeContext';

interface LocationPickerModalProps {
  visible: boolean;
  onClose: () => void;
  onLocationSelect: (location: string) => void;
  title: string;
  placeholder?: string;
  initialValue?: string;
}

export default function LocationPickerModal({
  visible,
  onClose,
  onLocationSelect,
  title,
  placeholder = 'Type city, town, dam, or landmark...',
  initialValue = '',
}: LocationPickerModalProps) {
  const { themeColors, isDark } = useTheme();
  const [searchQuery, setSearchQuery] = useState('');
  const [predictions, setPredictions] = useState<PlacePrediction[]>([]);
  const [recentSearches, setRecentSearches] = useState<string[]>([]);
  const [savedPlaces, setSavedPlaces] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSearchingOnline, setIsSearchingOnline] = useState(false);
  const cancelOnlineRef = useRef<() => void>(() => {});
  const inputRef = useRef<TextInput>(null);

  // Load saved & recents when modal opens
  useEffect(() => {
    if (visible) {
      const initVal = (initialValue || '').trim();
      setSearchQuery(initVal);

      // Load saved & recents
      Promise.all([getRecentSearches(), loadSavedLocations()]).then(([recents, saved]) => {
        setRecentSearches(recents);
        setSavedPlaces(saved.slice(0, 10));
      });

      if (initVal.length >= 1) {
        performSearch(initVal);
      } else {
        setPredictions([]);
      }

      // Auto focus after mount
      setTimeout(() => {
        inputRef.current?.focus();
      }, 150);
    } else {
      cancelOnlineRef.current();
      setPredictions([]);
      setIsSearchingOnline(false);
    }
  }, [visible, initialValue]);

  const performSearch = useCallback(async (query: string) => {
    const q = (query || '').trim();
    if (q.length < 1) {
      setPredictions([]);
      setIsLoading(false);
      setIsSearchingOnline(false);
      cancelOnlineRef.current();
      return;
    }

    setIsLoading(true);
    cancelOnlineRef.current();

    try {
      // 1. Instant local + saved search
      const localResults = await getCitySuggestions(q);
      setPredictions(localResults);
      setIsLoading(false);

      // 2. If few results or 3+ chars, trigger fast auto online search
      if (q.length >= 3) {
        setIsSearchingOnline(true);
        cancelOnlineRef.current = scheduleAutoOnlineLookup(
          q,
          (onlineResults) => {
            setPredictions((prev) => {
              const existingDescs = new Set(prev.map((p) => p.description.toLowerCase()));
              const freshOnline = onlineResults.filter(
                (o) => !existingDescs.has(o.description.toLowerCase())
              );
              return [...prev, ...freshOnline];
            });
            setIsSearchingOnline(false);
          },
          () => {
            setIsSearchingOnline(false);
          },
          300
        );
      } else {
        setIsSearchingOnline(false);
      }
    } catch (e) {
      console.warn('Search error:', e);
      setIsLoading(false);
      setIsSearchingOnline(false);
    }
  }, []);

  const handleSearchChange = (text: string) => {
    setSearchQuery(text);
    performSearch(text);
  };

  const handleSelectLocation = async (location: string) => {
    const clean = (location || '').trim();
    if (!clean) return;

    // Persist to local storage forever
    await Promise.all([saveLocationToCache(clean), addRecentSearch(clean)]);

    Keyboard.dismiss();
    onLocationSelect(clean);
    onClose();
  };

  const handleSearchOnlineManual = async () => {
    const q = searchQuery.trim();
    if (!q || isSearchingOnline) return;

    setIsSearchingOnline(true);
    try {
      const res = await searchCityOnline(q);
      if (res.city) {
        handleSelectLocation(res.city);
      } else {
        handleSelectLocation(q);
      }
    } catch {
      handleSelectLocation(q);
    } finally {
      setIsSearchingOnline(false);
    }
  };

  const renderPredictionItem = ({ item }: { item: PlacePrediction }) => {
    const isSaved = item.isSaved;
    return (
      <TouchableOpacity
        style={[styles.resultItem, { borderBottomColor: themeColors.border }]}
        onPress={() => handleSelectLocation(item.description)}
        activeOpacity={0.65}
      >
        <View
          style={[
            styles.iconContainer,
            { backgroundColor: isDark ? '#1E293B' : isSaved ? '#FEF3C7' : '#EFF6FF' },
          ]}
        >
          {isSaved ? (
            <Bookmark size={18} color="#D97706" />
          ) : (
            <MapPin size={18} color="#2563EB" />
          )}
        </View>

        <View style={styles.textContainer}>
          <View style={styles.titleRow}>
            <Text style={[styles.mainText, { color: themeColors.text }]} numberOfLines={1}>
              {item.structured_formatting?.main_text || item.description.split(',')[0]}
            </Text>
            {isSaved && (
              <View style={styles.savedChip}>
                <Text style={styles.savedChipText}>Saved</Text>
              </View>
            )}
          </View>
          <Text style={[styles.subText, { color: themeColors.textMuted }]} numberOfLines={1}>
            {item.structured_formatting?.secondary_text ||
              item.description.split(',').slice(1).join(', ').trim() ||
              'Tamil Nadu / India'}
          </Text>
        </View>

        <Navigation size={15} color={themeColors.textMuted} />
      </TouchableOpacity>
    );
  };

  const renderRecentItem = (place: string, index: number, isBookmark = false) => {
    const parts = place.split(',').map((p) => p.trim());
    const main = parts[0] || place;
    const sub = parts.slice(1).join(', ') || 'India';

    return (
      <TouchableOpacity
        key={`${isBookmark ? 'save' : 'rec'}_${index}_${place}`}
        style={[styles.resultItem, { borderBottomColor: themeColors.border }]}
        onPress={() => handleSelectLocation(place)}
        activeOpacity={0.65}
      >
        <View
          style={[
            styles.iconContainer,
            { backgroundColor: isDark ? '#1E293B' : isBookmark ? '#FEF3C7' : '#F1F5F9' },
          ]}
        >
          {isBookmark ? (
            <Bookmark size={16} color="#D97706" />
          ) : (
            <Clock size={16} color={themeColors.textMuted} />
          )}
        </View>

        <View style={styles.textContainer}>
          <Text style={[styles.mainText, { color: themeColors.text }]} numberOfLines={1}>
            {main}
          </Text>
          <Text style={[styles.subText, { color: themeColors.textMuted }]} numberOfLines={1}>
            {sub}
          </Text>
        </View>
      </TouchableOpacity>
    );
  };

  const hasSearch = searchQuery.trim().length > 0;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="fullScreen"
      onRequestClose={onClose}
    >
      <SafeAreaView
        style={[styles.fullContainer, { backgroundColor: themeColors.background }]}
        edges={['top', 'left', 'right', 'bottom']}
      >
        <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />

        {/* Top Navigation Header */}
        <View style={[styles.topHeader, { borderBottomColor: themeColors.border }]}>
          <TouchableOpacity
            onPress={onClose}
            style={[styles.backButton, { backgroundColor: isDark ? '#1E293B' : '#F1F5F9' }]}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          >
            <ArrowLeft size={20} color={themeColors.text} />
          </TouchableOpacity>
          <Text style={[styles.headerTitle, { color: themeColors.text }]} numberOfLines={1}>
            {title}
          </Text>
          <TouchableOpacity
            onPress={onClose}
            style={styles.closeTextBtn}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Text style={{ fontSize: 14, fontWeight: '600', color: themeColors.textMuted }}>
              Done
            </Text>
          </TouchableOpacity>
        </View>

        {/* Pinned Search Box */}
        <View style={[styles.searchBarWrapper, { borderBottomColor: themeColors.border }]}>
          <View
            style={[
              styles.searchBox,
              {
                backgroundColor: isDark ? '#1E293B' : '#F8FAFC',
                borderColor: themeColors.border,
              },
            ]}
          >
            <Search size={18} color="#2563EB" style={styles.searchIcon} />
            <TextInput
              ref={inputRef}
              style={[styles.searchInput, { color: themeColors.text }]}
              placeholder={placeholder}
              placeholderTextColor={themeColors.textMuted}
              value={searchQuery}
              onChangeText={handleSearchChange}
              autoCapitalize="words"
              autoCorrect={false}
              returnKeyType="search"
              onSubmitEditing={() => {
                if (predictions.length > 0) {
                  handleSelectLocation(predictions[0].description);
                } else if (searchQuery.trim()) {
                  handleSelectLocation(searchQuery.trim());
                }
              }}
            />
            {searchQuery.length > 0 && (
              <TouchableOpacity
                onPress={() => {
                  setSearchQuery('');
                  performSearch('');
                }}
                style={styles.clearBtn}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <X size={16} color={themeColors.textMuted} />
              </TouchableOpacity>
            )}
            {isLoading && (
              <ActivityIndicator size="small" color="#2563EB" style={{ marginLeft: 6 }} />
            )}
          </View>

          {/* Active online search indicator chip */}
          {isSearchingOnline && (
            <View style={styles.onlineStatusRow}>
              <ActivityIndicator size="small" color="#2563EB" />
              <Text style={styles.onlineStatusText}>Searching online map places...</Text>
            </View>
          )}
        </View>

        {/* Suggestions / Recent Content */}
        <View style={styles.listContainer}>
          {hasSearch ? (
            <FlatList
              data={predictions}
              keyExtractor={(item) => item.place_id}
              renderItem={renderPredictionItem}
              keyboardShouldPersistTaps="always"
              keyboardDismissMode="on-drag"
              showsVerticalScrollIndicator={true}
              contentContainerStyle={styles.scrollContent}
              ListEmptyComponent={
                !isLoading && !isSearchingOnline ? (
                  <View style={styles.emptyStateContainer}>
                    <MapPin size={38} color={themeColors.textMuted} />
                    <Text style={[styles.emptyTitle, { color: themeColors.text }]}>
                      No standard city found
                    </Text>
                    <Text style={[styles.emptySubtitle, { color: themeColors.textMuted }]}>
                      You can use this exact name or search online map
                    </Text>

                    <TouchableOpacity
                      style={styles.actionButton}
                      onPress={handleSearchOnlineManual}
                      activeOpacity={0.8}
                    >
                      <Globe size={16} color="#FFFFFF" />
                      <Text style={styles.actionButtonText}>Search Online Map</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={[
                        styles.actionButtonOutline,
                        { borderColor: themeColors.border, backgroundColor: themeColors.surface },
                      ]}
                      onPress={() => handleSelectLocation(searchQuery.trim())}
                      activeOpacity={0.8}
                    >
                      <PlusCircle size={16} color="#2563EB" />
                      <Text style={[styles.actionButtonOutlineText, { color: themeColors.text }]}>
                        Use "{searchQuery.trim()}" as custom location
                      </Text>
                    </TouchableOpacity>
                  </View>
                ) : null
              }
              ListFooterComponent={
                predictions.length > 0 ? (
                  <View style={styles.footerOptions}>
                    {/* Custom text option at bottom */}
                    <TouchableOpacity
                      style={[
                        styles.customOptionRow,
                        { borderColor: themeColors.border, backgroundColor: isDark ? '#1E293B' : '#F8FAFC' },
                      ]}
                      onPress={() => handleSelectLocation(searchQuery.trim())}
                      activeOpacity={0.7}
                    >
                      <PlusCircle size={17} color="#2563EB" />
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.customOptionText, { color: themeColors.text }]}>
                          Use exact custom text: "{searchQuery.trim()}"
                        </Text>
                        <Text style={[styles.customOptionSub, { color: themeColors.textMuted }]}>
                          Choose this only if entering a custom street or doorstep address
                        </Text>
                      </View>
                    </TouchableOpacity>
                  </View>
                ) : null
              }
            />
          ) : (
            <FlatList
              data={[]}
              renderItem={() => null}
              keyboardShouldPersistTaps="always"
              keyboardDismissMode="on-drag"
              contentContainerStyle={styles.scrollContent}
              ListHeaderComponent={
                <View>
                  {/* Saved & Quick Locations */}
                  {savedPlaces.length > 0 && (
                    <View style={styles.sectionBlock}>
                      <View style={styles.sectionHeaderRow}>
                        <Bookmark size={15} color="#D97706" />
                        <Text style={[styles.sectionHeading, { color: themeColors.text }]}>
                          Saved Locations ({savedPlaces.length})
                        </Text>
                      </View>
                      {savedPlaces.map((p, idx) => renderRecentItem(p, idx, true))}
                    </View>
                  )}

                  {/* Recent Searches */}
                  {recentSearches.length > 0 && (
                    <View style={styles.sectionBlock}>
                      <View style={styles.sectionHeaderRow}>
                        <Clock size={15} color={themeColors.textMuted} />
                        <Text style={[styles.sectionHeading, { color: themeColors.text }]}>
                          Recent Searches
                        </Text>
                      </View>
                      {recentSearches.map((p, idx) => renderRecentItem(p, idx, false))}
                    </View>
                  )}

                  {/* Popular Hubs */}
                  <View style={styles.sectionBlock}>
                    <View style={styles.sectionHeaderRow}>
                      <Sparkles size={15} color="#2563EB" />
                      <Text style={[styles.sectionHeading, { color: themeColors.text }]}>
                        Popular Cities & Transit Hubs
                      </Text>
                    </View>
                    {[
                      'Chennai, Tamil Nadu, India',
                      'Bengaluru (Bangalore), Karnataka, India',
                      'Coimbatore, Tamil Nadu, India',
                      'Madurai, Tamil Nadu, India',
                      'Tiruchirappalli (Trichy), Tamil Nadu, India',
                      'Salem, Tamil Nadu, India',
                      'Tiruvannamalai, Tamil Nadu, India',
                      'Sathanur Dam, Tiruvannamalai, Tamil Nadu',
                      'Sathyamangalam, Erode, Tamil Nadu',
                      'Pondicherry (Puducherry), India',
                      'Kempegowda International Airport (BLR), Bengaluru',
                      'Chennai International Airport (MAA), Chennai',
                    ].map((p, idx) => renderRecentItem(p, idx, false))}
                  </View>
                </View>
              }
            />
          )}
        </View>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  fullContainer: {
    flex: 1,
  },
  topHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  backButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '700',
    flex: 1,
    marginHorizontal: 12,
  },
  closeTextBtn: {
    paddingHorizontal: 8,
    paddingVertical: 6,
  },
  searchBarWrapper: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 1,
  },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: Platform.OS === 'ios' ? 10 : 6,
  },
  searchIcon: {
    marginRight: 10,
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
    fontWeight: '500',
    paddingVertical: 4,
  },
  clearBtn: {
    padding: 6,
  },
  onlineStatusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 8,
    paddingHorizontal: 4,
  },
  onlineStatusText: {
    fontSize: 12,
    color: '#2563EB',
    fontWeight: '500',
  },
  listContainer: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 340, // Generous padding so items scroll comfortably above Android soft keyboard!
  },
  resultItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 13,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  iconContainer: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  textContainer: {
    flex: 1,
    marginRight: 8,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  mainText: {
    fontSize: 15,
    fontWeight: '600',
  },
  savedChip: {
    backgroundColor: '#FEF3C7',
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 4,
  },
  savedChipText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#B45309',
  },
  subText: {
    fontSize: 13,
    marginTop: 2,
  },
  sectionBlock: {
    marginTop: 14,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  sectionHeading: {
    fontSize: 13,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  emptyStateContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
    paddingTop: 48,
    gap: 8,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '700',
    marginTop: 8,
  },
  emptySubtitle: {
    fontSize: 13,
    textAlign: 'center',
    marginBottom: 12,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#2563EB',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 8,
    width: '100%',
    marginTop: 6,
  },
  actionButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
  actionButtonOutline: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 8,
    borderWidth: 1,
    width: '100%',
    marginTop: 8,
  },
  actionButtonOutlineText: {
    fontSize: 13,
    fontWeight: '600',
  },
  footerOptions: {
    paddingHorizontal: 16,
    paddingTop: 16,
  },
  customOptionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 8,
    borderWidth: 1,
  },
  customOptionText: {
    fontSize: 13,
    fontWeight: '600',
  },
  customOptionSub: {
    fontSize: 11,
    marginTop: 2,
  },
});

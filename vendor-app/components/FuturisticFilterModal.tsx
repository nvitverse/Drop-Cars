import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  ScrollView,
  Platform,
} from 'react-native';
import {
  X,
  SlidersHorizontal,
  Calendar,
  Car,
  Compass,
  CheckCircle2,
  RotateCcw,
  Sparkles,
  ChevronDown,
  Filter,
} from 'lucide-react-native';

export interface FilterState {
  dateFilter: string; // 'all' | 'today' | 'tomorrow' | 'next7'
  vehicleFilter: string; // 'all' | 'sedan' | 'suv' | 'hatchback' | 'luxury'
  tripTypeFilter: string; // 'all' | 'oneway' | 'roundtrip' | 'rental'
  assignStatusFilter: string; // 'all' | 'unassigned' | 'assigned'
}

interface FuturisticFilterModalProps {
  visible: boolean;
  onClose: () => void;
  filters: FilterState;
  onApplyFilters: (newFilters: FilterState) => void;
  onResetFilters: () => void;
}

const DATE_OPTIONS = [
  { id: 'all', label: 'All Dates' },
  { id: 'today', label: 'Today Only' },
  { id: 'tomorrow', label: 'Tomorrow' },
  { id: 'next7', label: 'Next 7 Days' },
];

const VEHICLE_OPTIONS = [
  { id: 'all', label: 'All Vehicles' },
  { id: 'sedan', label: 'Sedan (4+1)' },
  { id: 'suv', label: 'SUV / Ertiga' },
  { id: 'luxury', label: 'Innova / Luxury' },
  { id: 'hatchback', label: 'Hatchback' },
];

const TRIP_OPTIONS = [
  { id: 'all', label: 'All Trip Types' },
  { id: 'oneway', label: 'One Way' },
  { id: 'roundtrip', label: 'Round Trip' },
  { id: 'rental', label: 'Hourly Rental' },
];

const STATUS_OPTIONS = [
  { id: 'all', label: 'All Statuses' },
  { id: 'unassigned', label: 'Unassigned Only' },
  { id: 'assigned', label: 'Assigned Only' },
];

export default function FuturisticFilterModal({
  visible,
  onClose,
  filters,
  onApplyFilters,
  onResetFilters,
}: FuturisticFilterModalProps) {
  const [localFilters, setLocalFilters] = useState<FilterState>(filters);

  // Active Dropdown expansion state (for compact inline expansion without big page scroll)
  const [activeDropdown, setActiveDropdown] = useState<'date' | 'vehicle' | 'trip' | 'status' | null>(null);

  useEffect(() => {
    if (visible) {
      setLocalFilters(filters);
      setActiveDropdown(null);
    }
  }, [visible, filters]);

  const activeCount = [
    localFilters.dateFilter !== 'all',
    localFilters.vehicleFilter !== 'all',
    localFilters.tripTypeFilter !== 'all',
    localFilters.assignStatusFilter !== 'all',
  ].filter(Boolean).length;

  const handleApply = () => {
    onApplyFilters(localFilters);
    onClose();
  };

  const handleReset = () => {
    const resetState: FilterState = {
      dateFilter: 'all',
      vehicleFilter: 'all',
      tripTypeFilter: 'all',
      assignStatusFilter: 'all',
    };
    setLocalFilters(resetState);
    onResetFilters();
    onClose();
  };

  const toggleDropdown = (key: 'date' | 'vehicle' | 'trip' | 'status') => {
    setActiveDropdown((prev) => (prev === key ? null : key));
  };

  const getSelectedLabel = (options: { id: string; label: string }[], selectedId: string) => {
    return options.find((o) => o.id === selectedId)?.label || 'All';
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.container}>
          {/* Header */}
          <View style={styles.header}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <View style={styles.iconBg}>
                <SlidersHorizontal size={18} color="#2563EB" />
              </View>
              <View>
                <Text style={styles.headerTitle}>Futuristic Filter Control</Text>
                <Text style={styles.headerSub}>
                  {activeCount > 0 ? `${activeCount} active filters applied` : 'Select date, vehicle & trip filters'}
                </Text>
              </View>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <X size={18} color="#64748B" />
            </TouchableOpacity>
          </View>

          {/* Compact Dropdown Grid Layout */}
          <View style={styles.body}>
            {/* 1. DATE FILTER DROPDOWN */}
            <View style={styles.fieldWrap}>
              <Text style={styles.fieldLabel}>1. PICKUP DATE</Text>
              <TouchableOpacity
                style={[styles.dropdownTrigger, activeDropdown === 'date' && styles.dropdownTriggerActive]}
                onPress={() => toggleDropdown('date')}
                activeOpacity={0.8}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Calendar size={16} color={localFilters.dateFilter !== 'all' ? '#2563EB' : '#64748B'} />
                  <Text style={[styles.dropdownValue, localFilters.dateFilter !== 'all' && styles.dropdownValueActive]}>
                    {getSelectedLabel(DATE_OPTIONS, localFilters.dateFilter)}
                  </Text>
                </View>
                <ChevronDown size={16} color="#64748B" />
              </TouchableOpacity>

              {activeDropdown === 'date' && (
                <View style={styles.optionsBox}>
                  {DATE_OPTIONS.map((opt) => {
                    const isSelected = localFilters.dateFilter === opt.id;
                    return (
                      <TouchableOpacity
                        key={opt.id}
                        style={[styles.optionItem, isSelected && styles.optionItemSelected]}
                        onPress={() => {
                          setLocalFilters((prev) => ({ ...prev, dateFilter: opt.id }));
                          setActiveDropdown(null);
                        }}
                      >
                        <Text style={[styles.optionText, isSelected && styles.optionTextSelected]}>{opt.label}</Text>
                        {isSelected && <CheckCircle2 size={15} color="#2563EB" />}
                      </TouchableOpacity>
                    );
                  })}
                </View>
              )}
            </View>

            {/* 2. VEHICLE TYPE DROPDOWN */}
            <View style={styles.fieldWrap}>
              <Text style={styles.fieldLabel}>2. VEHICLE CATEGORY</Text>
              <TouchableOpacity
                style={[styles.dropdownTrigger, activeDropdown === 'vehicle' && styles.dropdownTriggerActive]}
                onPress={() => toggleDropdown('vehicle')}
                activeOpacity={0.8}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Car size={16} color={localFilters.vehicleFilter !== 'all' ? '#2563EB' : '#64748B'} />
                  <Text style={[styles.dropdownValue, localFilters.vehicleFilter !== 'all' && styles.dropdownValueActive]}>
                    {getSelectedLabel(VEHICLE_OPTIONS, localFilters.vehicleFilter)}
                  </Text>
                </View>
                <ChevronDown size={16} color="#64748B" />
              </TouchableOpacity>

              {activeDropdown === 'vehicle' && (
                <View style={styles.optionsBox}>
                  {VEHICLE_OPTIONS.map((opt) => {
                    const isSelected = localFilters.vehicleFilter === opt.id;
                    return (
                      <TouchableOpacity
                        key={opt.id}
                        style={[styles.optionItem, isSelected && styles.optionItemSelected]}
                        onPress={() => {
                          setLocalFilters((prev) => ({ ...prev, vehicleFilter: opt.id }));
                          setActiveDropdown(null);
                        }}
                      >
                        <Text style={[styles.optionText, isSelected && styles.optionTextSelected]}>{opt.label}</Text>
                        {isSelected && <CheckCircle2 size={15} color="#2563EB" />}
                      </TouchableOpacity>
                    );
                  })}
                </View>
              )}
            </View>

            {/* 3. TRIP TYPE DROPDOWN */}
            <View style={styles.fieldWrap}>
              <Text style={styles.fieldLabel}>3. TRIP TYPE</Text>
              <TouchableOpacity
                style={[styles.dropdownTrigger, activeDropdown === 'trip' && styles.dropdownTriggerActive]}
                onPress={() => toggleDropdown('trip')}
                activeOpacity={0.8}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Compass size={16} color={localFilters.tripTypeFilter !== 'all' ? '#2563EB' : '#64748B'} />
                  <Text style={[styles.dropdownValue, localFilters.tripTypeFilter !== 'all' && styles.dropdownValueActive]}>
                    {getSelectedLabel(TRIP_OPTIONS, localFilters.tripTypeFilter)}
                  </Text>
                </View>
                <ChevronDown size={16} color="#64748B" />
              </TouchableOpacity>

              {activeDropdown === 'trip' && (
                <View style={styles.optionsBox}>
                  {TRIP_OPTIONS.map((opt) => {
                    const isSelected = localFilters.tripTypeFilter === opt.id;
                    return (
                      <TouchableOpacity
                        key={opt.id}
                        style={[styles.optionItem, isSelected && styles.optionItemSelected]}
                        onPress={() => {
                          setLocalFilters((prev) => ({ ...prev, tripTypeFilter: opt.id }));
                          setActiveDropdown(null);
                        }}
                      >
                        <Text style={[styles.optionText, isSelected && styles.optionTextSelected]}>{opt.label}</Text>
                        {isSelected && <CheckCircle2 size={15} color="#2563EB" />}
                      </TouchableOpacity>
                    );
                  })}
                </View>
              )}
            </View>

            {/* 4. ASSIGNMENT STATUS DROPDOWN */}
            <View style={styles.fieldWrap}>
              <Text style={styles.fieldLabel}>4. ASSIGNMENT STATUS</Text>
              <TouchableOpacity
                style={[styles.dropdownTrigger, activeDropdown === 'status' && styles.dropdownTriggerActive]}
                onPress={() => toggleDropdown('status')}
                activeOpacity={0.8}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Sparkles size={16} color={localFilters.assignStatusFilter !== 'all' ? '#2563EB' : '#64748B'} />
                  <Text style={[styles.dropdownValue, localFilters.assignStatusFilter !== 'all' && styles.dropdownValueActive]}>
                    {getSelectedLabel(STATUS_OPTIONS, localFilters.assignStatusFilter)}
                  </Text>
                </View>
                <ChevronDown size={16} color="#64748B" />
              </TouchableOpacity>

              {activeDropdown === 'status' && (
                <View style={styles.optionsBox}>
                  {STATUS_OPTIONS.map((opt) => {
                    const isSelected = localFilters.assignStatusFilter === opt.id;
                    return (
                      <TouchableOpacity
                        key={opt.id}
                        style={[styles.optionItem, isSelected && styles.optionItemSelected]}
                        onPress={() => {
                          setLocalFilters((prev) => ({ ...prev, assignStatusFilter: opt.id }));
                          setActiveDropdown(null);
                        }}
                      >
                        <Text style={[styles.optionText, isSelected && styles.optionTextSelected]}>{opt.label}</Text>
                        {isSelected && <CheckCircle2 size={15} color="#2563EB" />}
                      </TouchableOpacity>
                    );
                  })}
                </View>
              )}
            </View>
          </View>

          {/* Action Buttons */}
          <View style={styles.footer}>
            <TouchableOpacity style={styles.resetBtn} onPress={handleReset} activeOpacity={0.8}>
              <RotateCcw size={15} color="#64748B" />
              <Text style={styles.resetBtnText}>Reset</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.applyBtn} onPress={handleApply} activeOpacity={0.85}>
              <Filter size={15} color="#FFFFFF" />
              <Text style={styles.applyBtnText}>APPLY FILTERS</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.75)',
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  container: {
    backgroundColor: '#FFFFFF',
    borderRadius: 22,
    padding: 18,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 10,
    elevation: 8,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  iconBg: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: '#EFF6FF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#0F172A',
  },
  headerSub: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 1,
  },
  closeBtn: {
    padding: 6,
    borderRadius: 20,
    backgroundColor: '#F1F5F9',
  },
  body: {
    marginVertical: 12,
    gap: 10,
  },
  fieldWrap: {
    gap: 4,
  },
  fieldLabel: {
    fontSize: 10.5,
    fontWeight: '800',
    color: '#475569',
    letterSpacing: 0.5,
  },
  dropdownTrigger: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  dropdownTriggerActive: {
    borderColor: '#2563EB',
    backgroundColor: '#EFF6FF',
  },
  dropdownValue: {
    fontSize: 12.5,
    fontWeight: '600',
    color: '#334155',
  },
  dropdownValueActive: {
    color: '#2563EB',
    fontWeight: '800',
  },
  optionsBox: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 12,
    marginTop: 4,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 3,
  },
  optionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  optionItemSelected: {
    backgroundColor: '#EFF6FF',
  },
  optionText: {
    fontSize: 12,
    color: '#475569',
    fontWeight: '500',
  },
  optionTextSelected: {
    color: '#2563EB',
    fontWeight: '800',
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 6,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
  },
  resetBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 11,
    borderRadius: 12,
    backgroundColor: '#F1F5F9',
  },
  resetBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#64748B',
  },
  applyBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: '#2563EB',
    elevation: 2,
    shadowColor: '#2563EB',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
  },
  applyBtnText: {
    fontSize: 12.5,
    fontWeight: '900',
    color: '#FFFFFF',
    letterSpacing: 0.5,
  },
});

import React, { useMemo, useState } from 'react';
import {
  Modal,
  ScrollView,
  StyleProp,
  StyleSheet,
  Text,
  TextStyle,
  TouchableOpacity,
  View,
  ViewStyle,
} from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import Ionicons from 'react-native-vector-icons/Ionicons';

type DropdownOption =
  | string
  | {
      label: string;
      value: string;
    };

type GradientDropdownProps = {
  label: string;
  value: string;
  options: DropdownOption[];
  onValueChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  textStyle?: StyleProp<TextStyle>;
};

const gradientColors = ['#DCEEFF', '#182B8C', '#0B1052'];

const normalizeOption = (option: DropdownOption) =>
  typeof option === 'string' ? { label: option, value: option } : option;

const GradientDropdown: React.FC<GradientDropdownProps> = ({
  label,
  value,
  options,
  onValueChange,
  placeholder,
  disabled = false,
  style,
  textStyle,
}) => {
  const [visible, setVisible] = useState(false);
  const normalizedOptions = useMemo(() => options.map(normalizeOption), [options]);
  const selectedLabel =
    normalizedOptions.find(option => option.value === value)?.label || value || placeholder || label;

  const openDropdown = () => {
    if (!disabled) {
      setVisible(true);
    }
  };

  const closeDropdown = () => setVisible(false);

  const selectOption = (nextValue: string) => {
    onValueChange(nextValue);
    closeDropdown();
  };

  return (
    <>
      <TouchableOpacity
        style={[local.field, disabled && local.fieldDisabled, style]}
        onPress={openDropdown}
        activeOpacity={disabled ? 1 : 0.75}
        accessibilityRole="button"
        accessibilityLabel={label}
      >
        <Text
          style={[local.fieldText, !value && local.placeholderText, disabled && local.disabledText, textStyle]}
          numberOfLines={1}
        >
          {selectedLabel}
        </Text>
        <Ionicons name="chevron-down" size={18} color={disabled ? '#9CA3AF' : '#333'} />
      </TouchableOpacity>

      <Modal visible={visible} transparent animationType="fade" onRequestClose={closeDropdown}>
        <TouchableOpacity style={local.overlay} activeOpacity={1} onPress={closeDropdown}>
          <View style={local.card} onStartShouldSetResponder={() => true}>
            <LinearGradient
              colors={gradientColors}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={local.gradient}
            >
              <View style={local.header}>
                <Text style={local.title}>{label}</Text>
                <TouchableOpacity
                  style={local.closeButton}
                  onPress={closeDropdown}
                  accessibilityRole="button"
                  accessibilityLabel="Close dropdown"
                >
                  <Ionicons name="close" size={20} color="#fff" />
                </TouchableOpacity>
              </View>

              <ScrollView
                style={local.optionList}
                contentContainerStyle={local.optionListContent}
                showsVerticalScrollIndicator={false}
              >
                {normalizedOptions.length > 0 ? (
                  normalizedOptions.map(option => (
                    <TouchableOpacity
                      key={option.value}
                      style={[local.optionItem, option.value === value && local.optionItemSelected]}
                      onPress={() => selectOption(option.value)}
                    >
                      <Text style={local.optionText}>{option.label}</Text>
                      {option.value === value ? <Ionicons name="checkmark" size={18} color="#6826df" /> : null}
                    </TouchableOpacity>
                  ))
                ) : (
                  <View style={local.optionItem}>
                    <Text style={local.optionText}>No options available</Text>
                  </View>
                )}
              </ScrollView>
            </LinearGradient>
          </View>
        </TouchableOpacity>
      </Modal>
    </>
  );
};

const local = StyleSheet.create({
  field: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
  },
  fieldDisabled: {
    opacity: 0.65,
  },
  fieldText: {
    flex: 1,
    color: '#111827',
    fontSize: 14,
    fontWeight: '600',
    paddingRight: 8,
  },
  placeholderText: {
    color: '#6B7280',
  },
  disabledText: {
    color: '#9CA3AF',
  },
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'center',
    padding: 24,
  },
  card: {
    borderRadius: 16,
    maxHeight: '58%',
    overflow: 'hidden',
  },
  gradient: {
    padding: 14,
  },
  header: {
    minHeight: 34,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  title: {
    flex: 1,
    color: '#fff',
    fontSize: 16,
    fontWeight: '800',
    paddingRight: 12,
  },
  closeButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.18)',
  },
  optionList: {
    maxHeight: 320,
  },
  optionListContent: {
    paddingBottom: 2,
  },
  optionItem: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.94)',
    marginTop: 8,
  },
  optionItemSelected: {
    backgroundColor: '#fff',
  },
  optionText: {
    flex: 1,
    color: '#111',
    fontSize: 15,
    fontWeight: '600',
    paddingRight: 8,
  },
});

export default GradientDropdown;

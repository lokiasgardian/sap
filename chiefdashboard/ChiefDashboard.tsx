import React, {
  useState,
  useEffect,
  useCallback,
  useMemo,
  useRef,
  Children,
} from 'react';
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  SafeAreaView,
  Image,
  TouchableOpacity,
  Dimensions,
  Platform,
  NativeSyntheticEvent,
  NativeScrollEvent,
  ActivityIndicator,
  ImageBackground,
  Animated,
  Modal,
  Alert,
  FlatList,
  TextInput,
  Pressable,
  Switch,
} from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import { Picker } from '@react-native-picker/picker';
import Svg, {
  Circle,
  Path,
  Defs,
  LinearGradient as SvgLinearGradient,
  Stop,
} from 'react-native-svg';
import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Ionicons from 'react-native-vector-icons/Ionicons';
import ChiefFooterProfile from './ChiefFooterProfile';
import GradientDropdown from '../TeacherDashboard/GradientDropdown';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import { useNavigation, useIsFocused } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { createAppStyles } from '../App.styles';
import { RootStackParamList } from '../types';
import AcademicStudent from './Chief_operation_AcademicStudent';
import AcademicTeacher from './Chief_operation_AcademicTeacher';
import ExamManagement from './Chief_operation_ExamManagement';
import Meetings from './Chief_operation_Meetings';

import { NativeStackScreenProps } from '@react-navigation/native-stack';
import {
  widthPercentageToDP as wp,
  heightPercentageToDP as hp,
} from 'react-native-responsive-screen';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');
const scaleFont = (size: number) => (SCREEN_WIDTH / 375) * size;
const FIXED_CARD_WIDTH = SCREEN_WIDTH * 0.92;
const backArrowImage = require('../assets/Arrow.png');
const chiefGradientColors = ['#f39c77ff', '#f07b49ff', '#f86f34ff'];
const API_BASE = 'http://162.215.210.38:3010/api';

const COLORS = {
  primary: '#f0f0f0',
  brandBlue: '#97b9e0',
  brandRed: '#ff7171',
  textBlack: '#000',
  gridLine: 'rgba(0,0,0,0.1)',
};

type Props = NativeStackScreenProps<RootStackParamList, 'ChiefDashboard'>;

type ClassSectionOption = {
  class_name: string;
  section: string;
};

const getClassOrder = (className: string) => {
  const value = String(className || '')
    .toUpperCase()
    .replace(/^CLASS\s*|^STD\s*/i, '')
    .trim();

  if (value === 'NURSERY') return 0;
  if (value === 'LKG') return 1;
  if (value === 'UKG') return 2;
  if (value === 'PREP') return 3;
  if (value === 'KG') return 4;

  const numeric = parseInt(value, 10);
  if (!Number.isNaN(numeric)) return 4 + numeric;

  return 999;
};

const normalizeClassKey = (className: string) =>
  String(className || '')
    .toUpperCase()
    .replace(/^CLASS\s*|^STD\s*/i, '')
    .trim();

type BranchFeeSummary = {
  dbName: string;
  institute_name: string;
  totalAmount: number;
  totalDiscount: number;
  totalPaid: number;
  balance: number;
};

type DynamicFeeType = {
  id?: number | string;
  feeName?: string;
  feesType?: string;
  scope?: string;
  frequency?: string;
  installments?: number;
  columnBase?: string;
};

type DynamicFeeSummary = {
  key: string;
  label: string;
  amount: number;
  count: number;
};

interface SummaryData {
  totalAmount: number;
  totalDiscount: number;
  totalPaid: number;
  balance: number; // Represents Due / Balance amount
  studentCount: number;
}

const normalizeFeeKey = (value: string) =>
  String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '');

const formatFeeLabel = (key: string) =>
  String(key || '')
    .replace(/[_-]+/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/\b\w/g, (char) => char.toUpperCase())
    .replace(/\bFees\b/g, 'Fee')
    .trim();

const formatMoneyWithDecimals = (value: number) =>
  `₹${Number(value || 0).toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

const toNumber = (value: any) => {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : 0;
  }
  if (typeof value === 'string') {
    const cleaned = value.replace(/[^0-9.-]/g, '');
    const parsed = Number(cleaned);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const buildFeeKeyVariants = (value: string) => {
  const normalized = normalizeFeeKey(value);
  const variants = new Set<string>();
  if (!normalized) return [];

  variants.add(normalized);
  variants.add(normalized.replace(/_fee(s)?$/, ''));
  variants.add(normalized.replace(/_amount$/, ''));

  if (normalized.endsWith('s')) {
    variants.add(normalized.slice(0, -1));
  } else {
    variants.add(`${normalized}s`);
  }

  if (normalized.endsWith('ies')) {
    variants.add(normalized.replace(/ies$/, 'y'));
  }

  return Array.from(variants).filter(Boolean);
};

const getNumericValueFromRow = (row: Record<string, any>, keys: string[]) => {
  const lookup = new Map(
    Object.entries(row || {}).map(([key, value]) => [normalizeFeeKey(key), value] as const),
  );

  for (const key of keys) {
    const variants = buildFeeKeyVariants(key);

    for (const variant of variants) {
      if (!lookup.has(variant)) continue;
      const value = lookup.get(variant);
      const numeric = toNumber(value);
      if (numeric || value === 0) return numeric;
    }

    for (const [candidateKey, candidateValue] of lookup.entries()) {
      if (
        variants.some(
          (variant) =>
            candidateKey === variant ||
            candidateKey.includes(variant) ||
            variant.includes(candidateKey),
        )
      ) {
        const numeric = toNumber(candidateValue);
        if (numeric || candidateValue === 0) return numeric;
      }
    }
  }

  return 0;
};

const PIE_PALETTE = [
  ['#B58BFF', '#4C1D95'],
  ['#7C3AED', '#7C3AED'],

  ['#E4D8FF', '#B58BFF'],
  ['#B58BFF', '#7C3AED'],
  ['#7C3AED', '#4C1D95'],
  ['#4C1D95', '#1E3A8A'],
  ['#1E3A8A', '#B58BFF'],
  ['#E4D8FF', '#7C3AED'],
] as [string, string][];

const PIE_CARD_GRADIENT = ['#F4EFEB', '#D1C7F9', '#C3BDFB'];
const PIE_INNER_GRADIENT = ['#DCEEFF', '#182B8C', '#0B1052'];
const PIE_CENTER_SHADOW = '#EDE6FF';
const PIE_OUTLINE = 'rgba(255,255,255,0.95)';

const MONTH_LABELS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

const MONTH_OPTIONS = (() => {
  const options: { label: string; value: string }[] = [];
  for (let year = 2025; year <= 2030; year += 1) {
    MONTH_LABELS.forEach((monthLabel, monthIndex) => {
      const value = `${year}-${String(monthIndex + 1).padStart(2, '0')}-01`;
      options.push({ label: `${monthLabel} ${year}`, value });
    });
  }
  return options;
})();

const getMonthKey = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-01`;

const extractRowDate = (row: Record<string, any>) => {
  const rawValue = row?.record_date || row?.payment_date || row?.created_at || row?.updated_at || row?.date;
  if (!rawValue) return null;
  const parsed = new Date(rawValue);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const isSameMonth = (left: Date, right: Date) =>
  left.getFullYear() === right.getFullYear() && left.getMonth() === right.getMonth();

const extractArrayFromApiPayload = (payload: any): any[] => {
  if (Array.isArray(payload)) return payload;
  if (!payload || typeof payload !== 'object') return [];

  const candidateKeys = [
    'data', 'fees', 'rows', 'records', 'result', 'results',
    'items', 'list', 'feeTypes', 'fee_types', 'feeTypesList',
  ];

  for (const key of candidateKeys) {
    if (Array.isArray(payload[key])) return payload[key];
  }

  const nestedObjects = [
    payload?.data,
    payload?.result,
    payload?.results,
    payload?.payload,
  ].filter(Boolean);

  for (const nested of nestedObjects) {
    const found = extractArrayFromApiPayload(nested);
    if (found.length) return found;
  }

  return [];
};

const pickFirstNonEmpty = (...values: any[]) => {
  for (const value of values) {
    const text = String(value ?? '').trim();
    if (text) return text;
  }
  return '';
};

type ChiefProfile = {
  username: string;
  name: string;
  designation: string;
  schoolCode: string;
  userType: string;
  phoneNo: string;
  email: string;
  photo?: string;
};

type ChiefSectionKey =
  | 'AcademicStudent'
  | 'AcademicTeacher'
  | 'ExamManagement'
  | 'Meetings'
  | 'ChiefAnnouncements';

// ------------------- Horizontal Scroll With Scrollbar -------------------
const HorizontalScrollWithScrollbar1: React.FC<{
  title?: string;
  children: React.ReactNode;
}> = ({ title, children }) => {
  const ITEM_WIDTH = SCREEN_WIDTH * 0.85 + 10;

  return (
    <View style={styles.hContainer}>
      {title && <Text style={styles.hTitle}>{title}</Text>}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        snapToInterval={ITEM_WIDTH}
        decelerationRate="fast"
        snapToAlignment="start"
        disableIntervalMomentum
      >
        <View style={styles.hRow}>{children}</View>
      </ScrollView>
    </View>
  );
};

// ------------------- Main Dashboard Component -------------------
const ChiefDashboard: React.FC<Props> = ({ route }) => {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const name = route.params?.name || '';
  const scrollRef = useRef<ScrollView | null>(null);
  const scrollYRef = useRef(0);
  const sectionOffsets = useRef<Partial<Record<ChiefSectionKey, number>>>({});
  const { width, height } = Dimensions.get('window');
  const phoneWidth = Math.min(Math.max(width - 24, 320), 390);
  const phoneHeight = Math.min(Math.max(height - 24, 720), 860);
  const appStyles = createAppStyles({ phoneWidth, phoneHeight });

  const [showSummary, setShowSummary] = useState(false);
  const [summaryModalLoading, setSummaryModalLoading] = useState(false);
  const [branchSummaries, setBranchSummaries] = useState<BranchFeeSummary[]>([]);
  const [showFooterNav, setShowFooterNav] = useState(false);
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [chiefProfile, setChiefProfile] = useState<ChiefProfile>({
    username: '',
    name: '',
    designation: '',
    schoolCode: '',
    userType: '',
    phoneNo: '',
    email: '',
  });
  const [selectedChip, setSelectedChip] = useState<'Overview' | 'Finance' | 'Actions'>('Overview');
  const [selectedMonth, setSelectedMonth] = useState(
    new Date(new Date().getFullYear(), new Date().getMonth(), 1),
  );
  const [showMonthPicker, setShowMonthPicker] = useState(false);

  const [loading, setLoading] = useState(false);
  const [summary, setSummary] = useState({
    gross: 0,
    concession: 0,
    netPayable: 0,
    totalPaid: 0,
    totalDue: 0,
    totalAmount: 0,
    totalDiscount: 0,
    balance: 0,
    studentCount: 0,
  });
  const [dynamicFeeTypes, setDynamicFeeTypes] = useState<DynamicFeeType[]>([]);
  const [dynamicFeeSummaries, setDynamicFeeSummaries] = useState<DynamicFeeSummary[]>([]);
  const [dynamicFeesLoading, setDynamicFeesLoading] = useState(false);
  const [activePieSlice, setActivePieSlice] = useState<{
    label: string;
    amount: number;
  } | null>(null);

  const [showDiscountModal, setShowDiscountModal] = useState(false);
  const [discountStudents, setDiscountStudents] = useState<any[]>([]);
  const [discountLoading, setDiscountLoading] = useState(false);
  const [discountTotalFromApi, setDiscountTotalFromApi] = useState(0);

  const [leaves, setLeaves] = useState<any[]>([]);
  const [latecomers, setLatecomers] = useState<any[]>([]);
  const [absentTeachers, setAbsentTeachers] = useState<any[]>([]);
  const [showSubstituteModal, setShowSubstituteModal] = useState(false);
  const [selectedAbsentTeacher, setSelectedAbsentTeacher] = useState<any>(null);
  const [substituteId, setSubstituteId] = useState('');
  const [subPeriod, setSubPeriod] = useState('');
  const [subSubject, setSubSubject] = useState('');
  const [subClassId, setSubClassId] = useState('');
  const [subSectionId, setSubSectionId] = useState('');
  const [assignLoading, setAssignLoading] = useState(false);
  const [parentActivityPhotosEnabled, setParentActivityPhotosEnabled] = useState(true);
  const [parentActivitySettingLoading, setParentActivitySettingLoading] = useState(false);

  const [schoolName, setSchoolName] = useState('Loading...');
  const [branches, setBranches] = useState<any[]>([]);
  const [currentDbName, setCurrentDbName] = useState('');
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [logo, setLogo] = useState('/default-logo.png');
  const [username, setUsername] = useState('');
  const dashboardIsFocused = useIsFocused();

  useEffect(() => {
    setShowFooterNav(true);
  }, []);

  useEffect(() => {
    const loadChiefProfile = async () => {
      try {
        const storedUserDetailsRaw = await AsyncStorage.getItem('userDetails');
        const storedUserDetails = storedUserDetailsRaw ? JSON.parse(storedUserDetailsRaw) : {};
        const storedUsername = await AsyncStorage.getItem('username');
        const storedName = await AsyncStorage.getItem('name');
        const storedDesignation = await AsyncStorage.getItem('designation');
        const storedSchoolCode = await AsyncStorage.getItem('schoolCode');
        const storedUserType = await AsyncStorage.getItem('userType');

        setChiefProfile({
          username: storedUserDetails.username || storedUsername || route.params?.username || '',
          name: storedUserDetails.name || storedName || route.params?.name || '',
          designation: storedUserDetails.designation || storedDesignation || '',
          schoolCode: String(storedUserDetails.schoolCode || storedSchoolCode || ''),
          userType: String(storedUserDetails.userType || storedUserType || ''),
          phoneNo: String(storedUserDetails.phone_no || storedUserDetails.mobile_number || ''),
          email: String(storedUserDetails.email_id || storedUserDetails.email || ''),
        });
      } catch (error) {
        console.error('Failed to load chief profile:', error);
      }
    };

    loadChiefProfile();
  }, [route.params]);

  const chiefTiles = [
    {
      label: 'Academic Students',
      title: 'Academic \nStudents',
      icon: 'school',
      gradientColors: ['#f15614ff', '#cc4f19ff'],
      sectionKey: 'AcademicStudent' as ChiefSectionKey,
    },
    {
      label: 'Academic Staff',
      title: 'Academic \nStaff',
      icon: 'groups',
      gradientColors: ['#f15614ff', '#cc4f19ff'],
      sectionKey: 'AcademicTeacher' as ChiefSectionKey,
    },
    {
      label: 'Exam Management',
      title: 'Exam \nManagement',
      icon: 'assignment',
      gradientColors: ['#f15614ff', '#cc4f19ff'],
      sectionKey: 'ExamManagement' as ChiefSectionKey,
    },
    {
      label: 'Meetings',
      title: 'Meetings',
      icon: 'chat',
      gradientColors: ['#f15614ff', '#cc4f19ff'],
      sectionKey: 'Meetings' as ChiefSectionKey,
    },
    {
      label: 'Announcements',
      title: 'Announcements',
      icon: 'campaign',
      gradientColors: ['#f15614ff', '#cc4f19ff'],
      sectionKey: 'ChiefAnnouncements' as ChiefSectionKey,
    },
  ];

  const prefix = currentDbName.split('_')[0];

  useEffect(() => {
    const loadStorage = async () => {
      const db = await AsyncStorage.getItem('schoolCode');
      const user = await AsyncStorage.getItem('username');
      if (db) setCurrentDbName(db);
      if (user) setUsername(user);
    };
    loadStorage();
  }, []);

  useEffect(() => {
    if (!currentDbName) return;
    fetch(`https://cleezoclass.com:4000/api/institute?dbName=${currentDbName}`)
      .then((res) => res.json())
      .then((data) => {
        setSchoolName(data.institute_name);
        setLogo(data.logo || '/default-logo.png');
      })
      .catch(() => {
        setSchoolName('Unknown School');
        setLogo('/default-logo.png');
      });
  }, [currentDbName]);

  useEffect(() => {
    if (!prefix) return;
    fetch(`https://cleezoclass.com:4000/api/branches?prefix=${prefix}`)
      .then((res) => res.json())
      .then((data) => setBranches(data))
      .catch((err) => console.error(err));
  }, [prefix]);

  const switchBranch = async (dbName: string) => {
    await AsyncStorage.setItem('schoolCode', dbName);
    setCurrentDbName(dbName);
    setDropdownOpen(false);
  };

  const fetchParentActivitySetting = useCallback(async () => {
    const schoolCode = currentDbName || (await AsyncStorage.getItem('schoolCode'));
    if (!schoolCode) return;

    try {
      setParentActivitySettingLoading(true);
      const response = await axios.get(`${API_BASE}/parent-activity-settings`, {
        params: { schoolCode },
      });
      setParentActivityPhotosEnabled(response.data?.parentActivityPhotosEnabled !== false);
    } catch (error) {
      console.error('Parent activity settings fetch error:', error);
      setParentActivityPhotosEnabled(true);
    } finally {
      setParentActivitySettingLoading(false);
    }
  }, [currentDbName]);

  useEffect(() => {
    void fetchParentActivitySetting();
  }, [fetchParentActivitySetting]);

  const updateParentActivitySetting = async (enabled: boolean) => {
    const previousValue = parentActivityPhotosEnabled;
    setParentActivityPhotosEnabled(enabled);
    setParentActivitySettingLoading(true);

    try {
      const schoolCode = currentDbName || (await AsyncStorage.getItem('schoolCode'));
      if (!schoolCode) {
        throw new Error('School code missing');
      }

      await axios.post(`${API_BASE}/parent-activity-settings`, {
        schoolCode,
        parentActivityPhotosEnabled: enabled,
      });
    } catch (error: any) {
      setParentActivityPhotosEnabled(previousValue);
      Alert.alert(
        'Setting not saved',
        error?.response?.data?.message || error?.message || 'Unable to update parent activities setting.',
      );
    } finally {
      setParentActivitySettingLoading(false);
    }
  };

  const fetchAllBranchSummaries = async () => {
    try {
      setSummaryModalLoading(true);
      const branchList =
        branches.length > 0
          ? branches
          : currentDbName
          ? [{ dbName: currentDbName, institute_name: schoolName || currentDbName }]
          : [];

      if (!branchList.length) {
        setBranchSummaries([]);
        return;
      }

      const results = await Promise.all(
        branchList.map(async (branch: any) => {
          try {
            const response = await axios.get(
              'https://cleezoclass.com:4000/api/fees-summary-ledgerData',
              { params: { schoolCode: branch.dbName } },
            );
            const data = response?.data || {};
            return {
              dbName: branch.dbName,
              institute_name: branch.institute_name || branch.dbName,
              totalAmount: Number(data.totalAmount) || 0,
              totalDiscount: Number(data.totalDiscount) || 0,
              totalPaid: Number(data.totalPaid) || 0,
              balance: Number(data.balance) || 0,
            };
          } catch {
            return {
              dbName: branch.dbName,
              institute_name: branch.institute_name || branch.dbName,
              totalAmount: 0,
              totalDiscount: 0,
              totalPaid: 0,
              balance: 0,
            };
          }
        }),
      );

      const ordered = results.sort((a, b) => {
        if (a.dbName === currentDbName && b.dbName !== currentDbName) return -1;
        if (b.dbName === currentDbName && a.dbName !== currentDbName) return 1;
        return 0;
      });

      setBranchSummaries(ordered);
    } finally {
      setSummaryModalLoading(false);
    }
  };

  // ------------------- Dynamic Fees & Summary Fetching -------------------
  // Fetches from /api/fees-summary-ledgerData and builds dynamic pie chart slices
  const fetchSummary = async () => {
    try {
      setLoading(true);
      setDynamicFeesLoading(true);

      const schoolCode = (await AsyncStorage.getItem('schoolCode')) || currentDbName;
      if (!schoolCode) return;

      const response = await axios.get(
        'https://cleezoclass.com:4000/api/fees-summary-ledgerData',
        { params: { schoolCode } },
      );

      const payload = response.data || {};

      const totalAmount = Number(payload.totalAmount || 0);
      const totalDiscount = Number(payload.totalDiscount || 0);
      const totalPaid = Number(payload.totalPaid || 0);
      const balance = Number(payload.balance || 0);
      const studentCount = Number(payload.studentCount || 0);

      setSummary({
        gross: totalAmount,
        concession: totalDiscount,
        netPayable: totalAmount - totalDiscount,
        totalPaid,
        totalDue: balance,
        totalAmount,
        totalDiscount,
        balance,
        studentCount,
      });

      // --- Extract dynamic fee types and amounts for the Pie Chart ---
      // Uses feeTotals if provided; otherwise scans root dynamic fee attributes
      const sourceObj =
        payload.feeTotals && typeof payload.feeTotals === 'object'
          ? payload.feeTotals
          : payload;

      const metadataKeys = new Set([
        'success',
        'totalamount',
        'totaldiscount',
        'totalpaid',
        'balance',
        'studentcount',
        'classwise',
        'debuginfo',
      ]);

      const extractedSummaries: DynamicFeeSummary[] = [];
      const extractedTypes: DynamicFeeType[] = [];

      Object.entries(sourceObj).forEach(([rawKey, rawVal]) => {
        const normKey = normalizeFeeKey(rawKey);
        if (metadataKeys.has(normKey)) return;

        const amount = toNumber(rawVal);
        if (amount > 0) {
          // Check if normalized key already added (e.g. uniform vs uniform_fee)
          const existing = extractedSummaries.find(
            (item) => item.key === normKey || normalizeFeeKey(item.label) === normKey,
          );

          if (existing) {
            existing.amount += amount;
          } else {
            const formattedLabel = formatFeeLabel(rawKey);
            extractedSummaries.push({
              key: normKey,
              label: formattedLabel,
              amount,
              count: 1,
            });
            extractedTypes.push({
              id: normKey,
              feeName: formattedLabel,
              feesType: formattedLabel,
              columnBase: normKey,
            });
          }
        }
      });

      extractedSummaries.sort((a, b) => b.amount - a.amount);

      setDynamicFeeSummaries(extractedSummaries);
      setDynamicFeeTypes(extractedTypes);
    } catch (error: any) {
      console.error('❌ Error fetching fees-summary-ledgerData:', error?.response?.data || error.message);
    } finally {
      setLoading(false);
      setDynamicFeesLoading(false);
    }
  };

  useEffect(() => {
    fetchSummary();
  }, [currentDbName]);

  const fetchDiscountStudents = async () => {
    try {
      setDiscountLoading(true);
      const schoolCode = (await AsyncStorage.getItem('schoolCode')) || currentDbName;
      if (!schoolCode) {
        setDiscountStudents([]);
        return;
      }

      const url = `https://cleezoclass.com:4000/api/discounted-students?schoolCode=${encodeURIComponent(schoolCode)}`;
      const response = await axios.get(url);
      const results = Array.isArray(response.data) ? response.data : [];

      const rawList = results
        .map((item: any) => {
          const totalDiscount =
            Number(item.effective_discount) ||
            Math.max(
              Number(item.Discount) || 0,
              Number(item.tuition_discount) || 0,
              Number(item.fee_discount) || 0,
              Number(item.bus_discount) || 0,
            );

          return {
            id: item.login_id || item.student_id || item.id || null,
            name: item.StudentName || 'Unknown',
            discount: totalDiscount,
          };
        })
        .filter((item: any) => item.discount > 0);

      const byStudentName: Record<string, { id: any; name: string; discount: number }> = {};
      rawList.forEach((item: any) => {
        const normalizedName = String(item.name || 'unknown')
          .toLowerCase()
          .replace(/\s+/g, ' ')
          .replace(/[^a-z0-9 ]/g, '')
          .trim();
        const key = `name:${normalizedName}`;
        if (!byStudentName[key] || item.discount > byStudentName[key].discount) {
          byStudentName[key] = item;
        }
      });

      const list = Object.values(byStudentName).sort((a: any, b: any) => b.discount - a.discount);

      setDiscountStudents(list);
      setDiscountTotalFromApi(
        list.reduce((sum: number, item: any) => sum + (Number(item.discount) || 0), 0),
      );
    } catch (err) {
      console.error('❌ Discount list fetch error:', err);
      setDiscountStudents([]);
      setDiscountTotalFromApi(0);
    } finally {
      setDiscountLoading(false);
    }
  };

  useEffect(() => {
    fetchDiscountStudents();
  }, [currentDbName]);

  const fetchTeacherLeaves = async () => {
    try {
      setLoading(true);
      const schoolCode = (await AsyncStorage.getItem('schoolCode')) || currentDbName;
      if (!schoolCode) return;

      const response = await fetch(
        `http://162.215.210.38:3010/api/leave/pending?schoolCode=${schoolCode}`,
      );
      const data = await response.json();
      if (response.ok) setLeaves(data);
    } catch (err) {
      console.error('❌ Leave fetch error:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!dashboardIsFocused) return;
    fetchTeacherLeaves();
  }, [dashboardIsFocused, currentDbName]);

  const fetchLatecomers = async () => {
    try {
      const schoolCode = await AsyncStorage.getItem('schoolCode');
      if (!schoolCode) return;

      const now = new Date();
      const month = now.getMonth() + 1;
      const year = now.getFullYear();
      const response = await fetch(
        `https://cleezoclass.com:4000/api/teacher-list-of-latecomers?schoolCode=${schoolCode}&month=${month}&year=${year}`,
      );
      const data = await response.json();
      if (response.ok) setLatecomers(Array.isArray(data) ? data : []);
      else setLatecomers([]);
    } catch (err) {
      console.error('❌ Latecomer fetch error:', err);
      setLatecomers([]);
    }
  };

  const fetchAbsentTeachers = async () => {
    try {
      const schoolCode = await AsyncStorage.getItem('schoolCode');
      if (!schoolCode) return;

      const now = new Date();
      const date = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(
        now.getDate(),
      ).padStart(2, '0')}`;
      const url = `http://162.215.210.38:3010/api/chief/absent-teachers?schoolCode=${encodeURIComponent(
        schoolCode,
      )}&date=${date}`;

      const response = await fetch(url);
      const contentType = response.headers.get('content-type') || '';
      const rawBody = await response.text();

      let data: any = {};
      if (contentType.includes('application/json')) {
        try {
          data = JSON.parse(rawBody);
        } catch {
          data = {};
        }
      }

      if (response.ok) {
        const teachers = Array.isArray(data?.teachers) ? data.teachers : [];
        setAbsentTeachers(teachers);
      } else {
        setAbsentTeachers([]);
      }
    } catch (err) {
      console.error('❌ Absent teacher fetch error:', err);
      setAbsentTeachers([]);
    }
  };

  useEffect(() => {
    fetchLatecomers();
    fetchAbsentTeachers();
  }, [currentDbName]);

  const submitSubstituteAssignment = async () => {
    try {
      if (!selectedAbsentTeacher) {
        Alert.alert('Select Teacher', 'Please select an absent teacher first.');
        return;
      }
      if (!subPeriod || !substituteId || !subClassId || !subSectionId) {
        Alert.alert('Missing Details', 'Please fill all substitute fields.');
        return;
      }

      const schoolCode = await AsyncStorage.getItem('schoolCode');
      if (!schoolCode) return;

      setAssignLoading(true);
      const now = new Date();
      const date = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(
        now.getDate(),
      ).padStart(2, '0')}`;

      const payload = {
        schoolCode,
        date,
        period: subPeriod,
        subject: subSubject,
        substituteId,
        classId: subClassId,
        sectionId: subSectionId,
        absentTeacherId: selectedAbsentTeacher.teacher_id,
      };

      const response = await fetch('http://162.215.210.38:3010/api/chief/assign-substitute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await response.json();

      if (!response.ok) {
        Alert.alert('Error', data?.error || 'Failed to assign substitute');
        return;
      }

      Alert.alert('Success', data?.message || 'Substitute assigned successfully');
      setShowSubstituteModal(false);
      setSelectedAbsentTeacher(null);
      setSubstituteId('');
      setSubPeriod('');
      setSubSubject('');
      setSubClassId('');
      setSubSectionId('');
      fetchAbsentTeachers();
    } catch (err) {
      Alert.alert('Error', 'Something went wrong while assigning substitute');
    } finally {
      setAssignLoading(false);
    }
  };

  const updateLeaveStatus = async (leaveId: string | number, newStatus: string) => {
    try {
      const schoolCode = await AsyncStorage.getItem('schoolCode');
      if (!schoolCode) return;

      const response = await fetch('http://162.215.210.38:3010/api/leave/update-status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ leaveId, status: newStatus, schoolCode }),
      });

      const data = await response.json();
      if (response.ok) {
        Alert.alert('Success', `Leave ${newStatus} successfully!`);
        fetchTeacherLeaves();
      } else {
        Alert.alert('Error', data.error || 'Failed to update leave');
      }
    } catch (err) {
      Alert.alert('Error', 'Something went wrong while updating leave');
    }
  };

  const openChiefModule = (sectionKey: ChiefSectionKey) => {
    navigation.navigate(sectionKey);
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-IN', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  };

  const handleOpenProfilePanel = () => {
    setShowProfileModal(true);
  };

  const handleGoBack = () => {
    const currentY = scrollYRef.current;
    const offsets = [0, ...Object.values(sectionOffsets.current)]
      .filter((value): value is number => typeof value === 'number')
      .sort((a, b) => a - b);

    const previousOffset = offsets.filter((offset) => offset < currentY - 8).pop();

    if (typeof previousOffset === 'number') {
      scrollRef.current?.scrollTo({
        y: Math.max(0, previousOffset - 12),
        animated: true,
      });
      if (previousOffset <= 12) {
        setSelectedChip('Overview');
      }
      return;
    }

    scrollRef.current?.scrollTo({ y: 0, animated: true });
    setSelectedChip('Overview');
  };

  const handleChiefLogout = async () => {
    try {
      await AsyncStorage.multiRemove([
        'userType',
        'username',
        'name',
        'schoolCode',
        'designation',
        'lastScreen',
        'userDetails',
        'fcmToken',
      ]);

      setShowProfileModal(false);
      navigation.reset({
        index: 0,
        routes: [{ name: 'TeacherLogin' }],
      });
    } catch (error) {
      navigation.reset({
        index: 0,
        routes: [{ name: 'TeacherLogin' }],
      });
    }
  };

  // ------------------- Dynamic Pie Chart Math -------------------
  const dynamicPieDataRaw = dynamicFeeSummaries.map((item, index) => ({
    label: item.label,
    value: item.amount,
    displayAmount: item.amount,
    color: PIE_PALETTE[index % PIE_PALETTE.length][1],
    gradientStart: PIE_PALETTE[index % PIE_PALETTE.length][0],
    gradientEnd: PIE_PALETTE[index % PIE_PALETTE.length][1],
  }));

  const pieHasPositiveAmounts = dynamicPieDataRaw.some((item) => item.value > 0);

  const pieData =
    pieHasPositiveAmounts || dynamicPieDataRaw.length === 0
      ? dynamicPieDataRaw.filter((item) => item.value > 0)
      : dynamicPieDataRaw.map((item) => ({
          ...item,
          value: 1,
          displayAmount: item.value,
        }));

  const PIE_SIZE = 314;
  const PIE_RADIUS = 124;
  const PIE_CENTER = PIE_SIZE / 2;

  const pieSlices = (() => {
    if (!pieData.length) return [];
    let startAngle = -90;
    const chartTotal = pieData.reduce((sum, item) => sum + item.value, 0) || 1;

    return pieData.map((item) => {
      const sweep = (item.value / chartTotal) * 360;
      const endAngle = startAngle + sweep;
      const largeArcFlag = sweep > 180 ? 1 : 0;

      const start = {
        x: PIE_CENTER + PIE_RADIUS * Math.cos((Math.PI * startAngle) / 180),
        y: PIE_CENTER + PIE_RADIUS * Math.sin((Math.PI * startAngle) / 180),
      };
      const end = {
        x: PIE_CENTER + PIE_RADIUS * Math.cos((Math.PI * endAngle) / 180),
        y: PIE_CENTER + PIE_RADIUS * Math.sin((Math.PI * endAngle) / 180),
      };

      const path = [
        `M ${PIE_CENTER} ${PIE_CENTER}`,
        `L ${start.x} ${start.y}`,
        `A ${PIE_RADIUS} ${PIE_RADIUS} 0 ${largeArcFlag} 1 ${end.x} ${end.y}`,
        'Z',
      ].join(' ');

      const slice = {
        ...item,
        path,
        displayAmount: item.displayAmount ?? item.value,
      };
      startAngle = endAngle;
      return slice;
    });
  })();

  const MetricBadge: React.FC<{ label: string; value: string }> = ({ label, value }) => (
    <View style={styles.metricBadge}>
      <Text style={styles.badgeLabel}>
        <Text style={styles.bullet}>• </Text>
        {label}
      </Text>
      <Text style={styles.badgeValue}>{value}</Text>
    </View>
  );

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#f6f6f7' }}>
      <View style={{ flex: 1 }}>
        <ScrollView
          ref={scrollRef}
          contentContainerStyle={{ padding: 15, paddingBottom: 140 }}
          onScroll={(event) => {
            scrollYRef.current = event.nativeEvent.contentOffset.y;
            if (event.nativeEvent.contentOffset.y > 8) {
              setShowFooterNav(true);
            }
          }}
          scrollEventThrottle={16}
        >
          <View style={styles.headerRow1}>
            <Text style={styles.headerText}>Welcome, {name}</Text>
          </View>

          {/* Header Branch Selector */}
          <View style={styles.headerRow}>
            <View style={styles.leftContainer}>
              {branches.length <= 1 ? (
                <Text style={styles.schoolName}>
                  {(branches[0]?.institute_name || schoolName || currentDbName).toUpperCase()}
                </Text>
              ) : (
                <HorizontalScrollWithScrollbar1>
                  {branches.map((branch) => (
                    <TouchableOpacity
                      key={branch.dbName}
                      style={[
                        styles.branchButton,
                        branch.dbName === currentDbName && styles.branchButtonActive,
                      ]}
                      onPress={() => switchBranch(branch.dbName)}
                    >
                      <Text
                        style={[
                          styles.branchText,
                          branch.dbName === currentDbName && styles.branchTextActive,
                        ]}
                      >
                        {branch.institute_name}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </HorizontalScrollWithScrollbar1>
              )}

              <Modal visible={dropdownOpen} transparent animationType="fade">
                <TouchableOpacity
                  style={styles.modalOverlay}
                  onPress={() => setDropdownOpen(false)}
                >
                  <View style={styles.dropdownList}>
                    <FlatList
                      data={branches}
                      keyExtractor={(item) => item.dbName}
                      renderItem={({ item }) => (
                        <TouchableOpacity
                          style={styles.dropdownItem}
                          onPress={() => switchBranch(item.dbName)}
                        >
                          <Text style={styles.dropdownItemText}>
                            {item.institute_name.toUpperCase()} ({item.dbName.toUpperCase()})
                          </Text>
                        </TouchableOpacity>
                      )}
                    />
                  </View>
                </TouchableOpacity>
              </Modal>
            </View>
          </View>

          {/* Month Picker Modal */}
          <Modal
            transparent
            visible={showMonthPicker}
            animationType="fade"
            onRequestClose={() => setShowMonthPicker(false)}
          >
            <View style={styles.monthPickerOverlay}>
              <View style={styles.monthPickerSheet}>
                <Text style={styles.monthPickerTitle}>Select Month</Text>
                <View style={styles.monthPickerFrame}>
                  <Picker
                    selectedValue={getMonthKey(selectedMonth)}
                    onValueChange={(itemValue: string) => {
                      const [year, month] = itemValue.split('-').map(Number);
                      if (!year || !month) return;
                      setSelectedMonth(new Date(year, month - 1, 1));
                    }}
                    style={styles.monthPicker}
                  >
                    {MONTH_OPTIONS.map((option) => (
                      <Picker.Item
                        key={option.value}
                        label={option.label}
                        value={option.value}
                      />
                    ))}
                  </Picker>
                </View>
                <TouchableOpacity
                  activeOpacity={0.9}
                  onPress={() => setShowMonthPicker(false)}
                  style={styles.monthPickerDoneBtn}
                >
                  <Text style={styles.monthPickerDoneText}>Done</Text>
                </TouchableOpacity>
              </View>
            </View>
          </Modal>

          {/* Dynamic Pie Data Chart & Commerce Summary */}
          <HorizontalScrollWithScrollbar1 title="">
            <TouchableOpacity
              activeOpacity={0.9}
              onPress={async () => {
                setShowSummary(true);
                await fetchAllBranchSummaries();
              }}
              style={[styles.sectionCard, styles.chartContainer, styles.pieChartNoShadow]}
            >
              <LinearGradient
                colors={PIE_CARD_GRADIENT}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                locations={[0, 0.58, 1]}
                style={styles.pieCardGradient}
              >
                <LinearGradient
                  colors={[
                    'rgba(244,239,235,0.16)',
                    'rgba(209,199,249,0.10)',
                    'rgba(195,189,251,0.06)',
                  ]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  locations={[0, 0.55, 1]}
                  style={styles.pieCardTopGlow}
                />
                <LinearGradient
                  colors={[
                    'rgba(124,58,237,0.08)',
                    'rgba(255,255,255,0)',
                    'rgba(30,58,138,0.05)',
                  ]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  locations={[0, 0.56, 1]}
                  style={styles.pieCardSoftShadow}
                />
                <LinearGradient
                  colors={PIE_INNER_GRADIENT}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  locations={[0, 0.55, 1]}
                  style={styles.pieCardInnerGlow}
                />

                <View style={styles.pieCardHeader}>
                  <View style={styles.pieCardHeaderLeft}>
                    <Text style={styles.pieCardHeaderLabel}>Total Amount</Text>
                    <Text style={styles.pieCardHeaderValue}>
                      {formatMoneyWithDecimals(summary.totalAmount)}
                    </Text>
                  </View>
                  <TouchableOpacity
                    onPress={() => setShowMonthPicker(true)}
                    activeOpacity={0.85}
                    style={styles.pieCardHeaderBadge}
                  >
                    <Text style={styles.pieCardHeaderBadgeText}>
                      {selectedMonth.toLocaleDateString('en-US', {
                        month: 'short',
                        year: 'numeric',
                      })}
                    </Text>
                  </TouchableOpacity>
                </View>

                {loading ? (
                  <ActivityIndicator color={COLORS.brandBlue} />
                ) : pieData.length > 0 ? (
                  <View style={styles.pieChartWrap}>
                    <Svg height={PIE_SIZE} width={PIE_SIZE}>
                      <Defs>
                        {pieSlices.map((slice, index) => (
                          <SvgLinearGradient
                            key={`${slice.label}-gradient`}
                            id={`pie-gradient-${index}`}
                            x1="6%"
                            y1="6%"
                            x2="94%"
                            y2="94%"
                          >
                            <Stop offset="0%" stopColor={slice.gradientStart} stopOpacity="1" />
                            <Stop offset="100%" stopColor={slice.gradientEnd} stopOpacity="1" />
                          </SvgLinearGradient>
                        ))}
                      </Defs>
                      <Circle
                        cx={PIE_CENTER}
                        cy={PIE_CENTER}
                        r={PIE_RADIUS}
                        fill="url(#pie-gradient-0)"
                        opacity={0.14}
                      />
                      {pieSlices.length === 1 ? (
                        <Circle
                          cx={PIE_CENTER}
                          cy={PIE_CENTER}
                          r={PIE_RADIUS}
                          fill="url(#pie-gradient-0)"
                          stroke={PIE_OUTLINE}
                          strokeWidth="2.5"
                        />
                      ) : (
                        pieSlices.map((slice, index) => {
                          const isActive = activePieSlice?.label === slice.label;
                          const sliceHandlers: any = {
                            onPress: () =>
                              setActivePieSlice((prev) =>
                                prev?.label === slice.label
                                  ? null
                                  : {
                                      label: slice.label,
                                      amount: slice.displayAmount ?? slice.value,
                                    },
                              ),
                          };

                          if (Platform.OS === 'web') {
                            sliceHandlers.onMouseEnter = () =>
                              setActivePieSlice({
                                label: slice.label,
                                amount: slice.displayAmount ?? slice.value,
                              });
                            sliceHandlers.onMouseLeave = () => setActivePieSlice(null);
                          }

                          return (
                            <Path
                              key={slice.label}
                              d={slice.path}
                              fill={`url(#pie-gradient-${index})`}
                              stroke={PIE_OUTLINE}
                              strokeWidth={isActive ? 3.5 : 2.25}
                              opacity={isActive ? 1 : 0.92}
                              {...sliceHandlers}
                            />
                          );
                        })
                      )}
                      <Circle
                        cx={PIE_CENTER}
                        cy={PIE_CENTER}
                        r={68}
                        fill={PIE_CENTER_SHADOW}
                      />
                    </Svg>

                    <View style={styles.pieCenterLabel}>
                      <Text style={styles.pieCenterDueValue}>
                        {formatMoneyWithDecimals(summary.balance)}
                      </Text>
                      <Text style={styles.pieCenterDueLabel}>Due</Text>
                      {activePieSlice ? (
                        <>
                          <Text style={styles.pieCenterSliceLabel}>{activePieSlice.label}</Text>
                          <Text style={styles.pieCenterSliceValue}>
                            {formatMoneyWithDecimals(Number(activePieSlice.amount || 0))}
                          </Text>
                        </>
                      ) : (
                        <Text style={styles.pieCenterSliceLabel}>
                          {pieHasPositiveAmounts ? '' : 'No Amounts Yet'}
                        </Text>
                      )}
                    </View>
                  </View>
                ) : (
                  <View style={styles.pieEmptyState}>
                    <Text style={styles.pieEmptyTitle}>No dynamic fee data</Text>
                    <Text style={styles.pieEmptyText}>
                      Fee summary data loaded from fees-summary-ledgerData endpoint.
                    </Text>
                  </View>
                )}
              </LinearGradient>
            </TouchableOpacity>

            {/* Finance Summary Card */}
            <TouchableOpacity
              activeOpacity={0.9}
              onPress={async () => {
                setShowSummary(true);
                await fetchAllBranchSummaries();
              }}
              style={[styles.sectionCard, styles.commerceSummaryCard]}
            >
              <View style={styles.financeGrid}>
                <View style={[styles.financeColumn, { gap: 8 }]}>
                  <Text style={styles.subHeading}>FINANCE SUMMARY</Text>
                  <MetricBadge
                    label="Gross"
                    value={formatMoneyWithDecimals(summary.gross)}
                  />
                  <MetricBadge
                    label="Concession"
                    value={formatMoneyWithDecimals(summary.concession)}
                  />
                  <MetricBadge
                    label="Net Payable"
                    value={formatMoneyWithDecimals(summary.netPayable)}
                  />
                  <View style={styles.totalRow}>
                    <Text style={styles.totalLabel}>Total Paid</Text>
                    <Text style={[styles.totalValue, { color: COLORS.brandBlue }]}>
                      {formatMoneyWithDecimals(summary.totalPaid)}
                    </Text>
                  </View>
                </View>
                <View style={styles.divider} />
                <View style={[styles.financeColumn, { gap: 8 }]}>
                  <Text style={styles.subHeading}>DYNAMIC FEES</Text>
                  {dynamicFeesLoading ? (
                    <ActivityIndicator color={COLORS.brandRed} />
                  ) : dynamicFeeSummaries.slice(0, 4).length > 0 ? (
                    dynamicFeeSummaries.slice(0, 4).map((item) => (
                      <MetricBadge
                        key={item.key}
                        label={item.label}
                        value={`₹${item.amount.toLocaleString('en-IN')}`}
                      />
                    ))
                  ) : (
                    <MetricBadge label="Dynamic Fees" value="No data" />
                  )}
                  <MetricBadge
                    label="Dynamic Fee Total"
                    value={`₹${dynamicFeeSummaries
                      .reduce((sum, item) => sum + item.amount, 0)
                      .toLocaleString('en-IN')}`}
                  />
                  <View style={styles.totalRow}>
                    <Text style={styles.totalLabel}>Dynamic Types</Text>
                    <Text style={[styles.totalValue, { color: COLORS.brandRed }]}>
                      {dynamicFeeSummaries.length}
                    </Text>
                  </View>
                </View>
              </View>
            </TouchableOpacity>
          </HorizontalScrollWithScrollbar1>

          <LinearGradient
            colors={chiefGradientColors}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={[styles.actionCard, styles.actionGradientCard, styles.parentActivityControlCard]}
          >
            <View style={styles.actionHeaderRow}>
              <View style={styles.actionIconWrap}>
                <MaterialIcons name="photo-camera" size={20} color="#242424" />
              </View>
              <View style={styles.actionHeaderTextBlock}>
                <Text style={styles.actionCardTitle}>Parent Activities</Text>
                <Text style={styles.actionSubText}>
                  {parentActivityPhotosEnabled ? 'Parent tab active' : 'Parent tab disabled'}
                </Text>
              </View>
              {parentActivitySettingLoading && (
                <ActivityIndicator size="small" color="#242424" />
              )}
            </View>
            <Text style={styles.actionBodyText} numberOfLines={2}>
              Allow parents to upload activity photos.
            </Text>
            <View style={styles.actionMetaRow}>
              <View
                style={[
                  styles.actionMetaPill,
                  !parentActivityPhotosEnabled && styles.actionMetaPillMuted,
                ]}
              >
                <Text style={styles.actionMetaPillText}>
                  {parentActivityPhotosEnabled ? 'Enabled' : 'Disabled'}
                </Text>
              </View>
              <Switch
                value={parentActivityPhotosEnabled}
                disabled={parentActivitySettingLoading}
                onValueChange={updateParentActivitySetting}
                trackColor={{ false: '#D0D5DD', true: '#A8C597' }}
                thumbColor={parentActivityPhotosEnabled ? '#2E7D32' : '#F2F4F7'}
              />
            </View>
          </LinearGradient>

          {/* Action Cards */}
          <HorizontalScrollWithScrollbar1 title="Actions">
            <LinearGradient
              colors={chiefGradientColors}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={[styles.actionCard, styles.actionGradientCard]}
            >
              <View style={styles.actionHeaderRow}>
                <View style={styles.actionIconWrap}>
                  <MaterialIcons name="event-busy" size={20} color="#242424" />
                </View>
                <View style={styles.actionHeaderTextBlock}>
                  <Text style={styles.actionCardTitle}>Leave Approval</Text>
                  <Text style={styles.actionSubText}>
                    {leaves.length > 0
                      ? `${leaves[0].teacher_name || 'Unknown'} needs review`
                      : 'No pending leave approvals'}
                  </Text>
                </View>
              </View>
              {leaves.length > 0 && (
                <>
                  <Text style={styles.actionBodyText} numberOfLines={2}>
                    {leaves[0].reason || 'No reason provided'}
                  </Text>
                  <View style={styles.actionMetaRow}>
                    <View style={styles.actionMetaPill}>
                      <Text style={styles.actionMetaPillText}>
                        {formatDate(leaves[0].leave_start_date)}
                      </Text>
                    </View>
                    <View style={styles.compactBtnRow}>
                      <TouchableOpacity
                        style={[styles.approveBtn, styles.actionApproveYes]}
                        onPress={() => updateLeaveStatus(leaves[0].id, 'approved')}
                      >
                        <Text style={styles.approveText}>OK</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[styles.approveBtn, styles.actionApproveNo]}
                        onPress={() => updateLeaveStatus(leaves[0].id, 'rejected')}
                      >
                        <Text style={styles.approveText}>NO</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                </>
              )}
            </LinearGradient>

            <LinearGradient
              colors={chiefGradientColors}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={[styles.actionCard, styles.actionGradientCard]}
            >
              <View style={styles.actionHeaderRow}>
                <View style={styles.actionIconWrap}>
                  <MaterialIcons name="schedule" size={20} color="#242424" />
                </View>
                <View style={styles.actionHeaderTextBlock}>
                  <Text style={styles.actionCardTitle}>Late Comers</Text>
                  <Text style={styles.actionSubText}>
                    {latecomers.length} record{latecomers.length === 1 ? '' : 's'}
                  </Text>
                </View>
              </View>
              <Text style={styles.actionBodyText} numberOfLines={2}>
                Top: {latecomers.length > 0 ? latecomers[0]?.teacher_name || '-' : 'No latecomers found'}
              </Text>
              <View style={styles.actionMetaRow}>
                <View style={styles.actionMetaPillMuted}>
                  <Text style={styles.actionMetaPillText}>
                    {latecomers.length > 0 ? 'Trending' : 'Idle'}
                  </Text>
                </View>
              </View>
            </LinearGradient>

            <TouchableOpacity
              activeOpacity={0.9}
              onPress={async () => {
                setShowDiscountModal(true);
                await fetchDiscountStudents();
              }}
            >
              <LinearGradient
                colors={chiefGradientColors}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={[styles.actionCard, styles.actionGradientCard]}
              >
                <View style={styles.actionHeaderRow}>
                  <View style={styles.actionIconWrap}>
                    <MaterialIcons name="local-offer" size={20} color="#242424" />
                  </View>
                  <View style={styles.actionHeaderTextBlock}>
                    <Text style={styles.actionCardTitle}>Discount Provided</Text>
                    <Text style={styles.actionSubText}>Tap to open the list</Text>
                  </View>
                </View>
                <Text style={styles.actionBodyText} numberOfLines={2}>
                  Total: ₹{discountTotalFromApi.toLocaleString('en-IN')}
                </Text>
              </LinearGradient>
            </TouchableOpacity>

            <LinearGradient
              colors={chiefGradientColors}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={[styles.actionCard, styles.actionGradientCard]}
            >
              <View style={styles.actionHeaderRow}>
                <View style={styles.actionIconWrap}>
                  <MaterialIcons name="groups" size={20} color="#242424" />
                </View>
                <View style={styles.actionHeaderTextBlock}>
                  <Text style={styles.actionCardTitle}>Substitute Required</Text>
                  <Text style={styles.actionSubText}>Teachers needing coverage</Text>
                </View>
              </View>
              <Text style={styles.actionBodyText} numberOfLines={2}>
                Absent: {absentTeachers.length}
              </Text>
              <View style={styles.actionMetaRow}>
                <View style={styles.actionMetaPill}>
                  <Text style={styles.actionMetaPillText}>
                    {absentTeachers.length > 0 ? 'Needs action' : 'All clear'}
                  </Text>
                </View>
                {absentTeachers.length > 0 && (
                  <TouchableOpacity
                    style={[styles.approveBtn, styles.actionAssignBtn]}
                    onPress={() => setShowSubstituteModal(true)}
                  >
                    <Text style={styles.approveText}>Assign</Text>
                  </TouchableOpacity>
                )}
              </View>
            </LinearGradient>
          </HorizontalScrollWithScrollbar1>

          {/* Module Navigation Tiles */}
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ paddingRight: 12, paddingBottom: 4 }}
            style={{ marginBottom: 10 }}
          >
            <View style={[appStyles.dashboardGrid, { flexWrap: 'nowrap' }]}>
              {chiefTiles.map((item) => (
                <Pressable key={item.title} onPress={() => openChiefModule(item.sectionKey)}>
                  <LinearGradient
                    colors={item.gradientColors}
                    start={{ x: 0.02, y: 0.02 }}
                    end={{ x: 0.98, y: 0.92 }}
                    style={[
                      appStyles.dashboardGridCardThree,
                      styles.chiefGradientCard,
                      { marginRight: 10, marginBottom: 0 },
                    ]}
                  >
                    <View style={styles.chiefGradientIconWrap}>
                      <MaterialIcons name={item.icon as any} size={24} color="#242424" />
                    </View>
                    <Text style={styles.chiefGradientLabel}>{item.label}</Text>
                  </LinearGradient>
                </Pressable>
              ))}
            </View>
          </ScrollView>

          {/* Branch Summary Modal */}
          <Modal
            visible={showSummary}
            animationType="slide"
            transparent
            onRequestClose={() => setShowSummary(false)}
          >
            <View style={styles.modalOverlay}>
              <View style={styles.modalContent}>
                <TouchableOpacity
                  onPress={() => setShowSummary(false)}
                  style={styles.closeButton}
                >
                  <Text style={{ fontSize: 18, color: 'red' }}>✕</Text>
                </TouchableOpacity>
                <Text style={styles.summaryModalTitle}>Branch Fee Summary</Text>
                {summaryModalLoading ? (
                  <ActivityIndicator size="large" color="#1565c0" />
                ) : (
                  <ScrollView showsVerticalScrollIndicator={false}>
                    {branchSummaries.length === 0 ? (
                      <Text style={styles.discountEmpty}>No branch summary data found.</Text>
                    ) : (
                      branchSummaries.map((item, index) => {
                        const netAmount = item.totalAmount - item.totalDiscount;
                        const calculatedBalance = netAmount - item.totalPaid;
                        return (
                          <View key={`${item.dbName}-${index}`} style={styles.summaryBranchCard}>
                            <Text style={styles.summaryBranchTitle}>{item.institute_name}</Text>
                            <View style={styles.summaryMetricCard}>
                              <Text style={styles.summaryLabel}>Total Amount</Text>
                              <Text style={styles.summaryValue}>
                                ₹ {item.totalAmount.toLocaleString('en-IN')}
                              </Text>
                            </View>
                            <View style={styles.summaryMetricCard}>
                              <Text style={styles.summaryLabel}>Total Discount</Text>
                              <Text style={styles.summaryValue}>
                                ₹ {item.totalDiscount.toLocaleString('en-IN')}
                              </Text>
                            </View>
                            <View style={styles.summaryMetricCard}>
                              <Text style={styles.summaryLabel}>Net Amount</Text>
                              <Text style={styles.summaryValue}>
                                ₹ {netAmount.toLocaleString('en-IN')}
                              </Text>
                            </View>
                            <View style={[styles.summaryMetricCard, styles.summaryMetricCardPaid]}>
                              <Text style={styles.summaryLabel}>Total Paid</Text>
                              <Text style={styles.summaryValue}>
                                ₹ {item.totalPaid.toLocaleString('en-IN')}
                              </Text>
                            </View>
                            <View style={[styles.summaryMetricCard, styles.summaryMetricCardDue]}>
                              <Text style={styles.summaryLabel}>Balance</Text>
                              <Text style={styles.summaryValue}>
                                ₹ {calculatedBalance.toLocaleString('en-IN')}
                              </Text>
                            </View>
                          </View>
                        );
                      })
                    )}
                  </ScrollView>
                )}
              </View>
            </View>
          </Modal>

          {/* Discount Modal */}
          <Modal
            visible={showDiscountModal}
            transparent
            animationType="slide"
            onRequestClose={() => setShowDiscountModal(false)}
          >
            <View style={styles.modalOverlay}>
              <View style={styles.discountModalContent}>
                <View style={styles.discountModalHeader}>
                  <Text style={styles.discountModalTitle}>Discounted Students</Text>
                  <TouchableOpacity onPress={() => setShowDiscountModal(false)}>
                    <Text style={styles.discountModalClose}>✕</Text>
                  </TouchableOpacity>
                </View>
                {discountLoading ? (
                  <ActivityIndicator size="small" color="#000" />
                ) : discountStudents.length > 0 ? (
                  <FlatList
                    data={discountStudents}
                    keyExtractor={(item, index) => `${item.name}-${index}`}
                    renderItem={({ item, index }) => (
                      <View style={styles.discountRow}>
                        <Text style={styles.discountName}>
                          {index + 1}. {item.name}
                        </Text>
                        <Text style={styles.discountAmount}>
                          ₹{Number(item.discount).toLocaleString('en-IN')}
                        </Text>
                      </View>
                    )}
                  />
                ) : (
                  <Text style={styles.discountEmpty}>No discounted students found.</Text>
                )}
              </View>
            </View>
          </Modal>

          {/* Substitute Assignment Modal */}
          <Modal
            visible={showSubstituteModal}
            transparent
            animationType="slide"
            onRequestClose={() => setShowSubstituteModal(false)}
          >
            <View style={styles.modalOverlay}>
              <View style={styles.discountModalContent}>
                <View style={styles.discountModalHeader}>
                  <Text style={styles.discountModalTitle}>Assign Substitute</Text>
                  <TouchableOpacity onPress={() => setShowSubstituteModal(false)}>
                    <Text style={styles.discountModalClose}>✕</Text>
                  </TouchableOpacity>
                </View>

                {!selectedAbsentTeacher ? (
                  <>
                    <Text style={styles.discountEmpty}>Select absent teacher first</Text>
                    <FlatList
                      data={absentTeachers}
                      keyExtractor={(item, index) => String(item.teacher_id || index)}
                      renderItem={({ item }) => (
                        <TouchableOpacity
                          style={styles.absentRow}
                          onPress={() => setSelectedAbsentTeacher(item)}
                        >
                          <Text style={styles.discountName}>{item.name}</Text>
                        </TouchableOpacity>
                      )}
                    />
                  </>
                ) : (
                  <>
                    <Text style={styles.discountName}>
                      Absent: {selectedAbsentTeacher.name}
                    </Text>
                    <TextInput
                      style={styles.input}
                      placeholder="Period (e.g. 1)"
                      value={subPeriod}
                      onChangeText={setSubPeriod}
                    />
                    <TextInput
                      style={styles.input}
                      placeholder="Subject (optional, for log)"
                      value={subSubject}
                      onChangeText={setSubSubject}
                    />
                    <TextInput
                      style={styles.input}
                      placeholder="Substitute Teacher ID"
                      value={substituteId}
                      onChangeText={setSubstituteId}
                    />
                    <TextInput
                      style={styles.input}
                      placeholder="Class ID"
                      value={subClassId}
                      onChangeText={setSubClassId}
                    />
                    <TextInput
                      style={styles.input}
                      placeholder="Section ID"
                      value={subSectionId}
                      onChangeText={setSubSectionId}
                    />

                    <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
                      <TouchableOpacity
                        style={[styles.approveBtn, { backgroundColor: '#777' }]}
                        onPress={() => setSelectedAbsentTeacher(null)}
                      >
                        <Text style={styles.approveText}>Back</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[styles.approveBtn, { backgroundColor: '#2e7d32' }]}
                        onPress={submitSubstituteAssignment}
                        disabled={assignLoading}
                      >
                        <Text style={styles.approveText}>
                          {assignLoading ? 'Saving...' : 'Submit'}
                        </Text>
                      </TouchableOpacity>
                    </View>
                  </>
                )}
              </View>
            </View>
          </Modal>

          {/* Profile Modal */}
          <Modal
            visible={showProfileModal}
            transparent
            animationType="slide"
            onRequestClose={() => setShowProfileModal(false)}
          >
            <View style={styles.modalOverlay}>
              <View style={styles.profileModalContent}>
                <View style={styles.profileModalHeader}>
                  <Text style={styles.profileModalTitle}>Chief Profile</Text>
                  <TouchableOpacity onPress={() => setShowProfileModal(false)}>
                    <Text style={styles.profileModalClose}>✕</Text>
                  </TouchableOpacity>
                </View>

                <View style={styles.profileAvatarWrap}>
                  <Text style={styles.profileAvatarText}>
                    {(chiefProfile.name || chiefProfile.username || 'C')
                      .trim()
                      .charAt(0)
                      .toUpperCase()}
                  </Text>
                </View>

                <View style={styles.profileDetailsCard}>
                  {[
                    { label: 'Name', value: chiefProfile.name || '-' },
                    { label: 'Username', value: chiefProfile.username || '-' },
                    { label: 'Designation', value: chiefProfile.designation || '-' },
                    { label: 'Phone', value: chiefProfile.phoneNo || '-' },
                    { label: 'Email', value: chiefProfile.email || '-' },
                  ].map((item) => (
                    <View key={item.label} style={styles.profileRow}>
                      <Text style={styles.profileLabel}>{item.label}</Text>
                      <Text style={styles.profileValue}>{item.value}</Text>
                    </View>
                  ))}
                </View>

                <TouchableOpacity
                  style={styles.profileLogoutButton}
                  onPress={handleChiefLogout}
                >
                  <Text style={styles.profileLogoutText}>Logout</Text>
                </TouchableOpacity>
              </View>
            </View>
          </Modal>
        </ScrollView>

        {showFooterNav && (
          <LinearGradient
            colors={['#FFFFFF', '#FBFBFD', '#F4F1FF']}
            start={{ x: 0.08, y: 0.05 }}
            end={{ x: 0.95, y: 1 }}
            style={[appStyles.footer, styles.fixedFooter, styles.curvedFooter]}
          >
            <View style={[appStyles.footerNav, styles.footerDockRow]}>
              <Pressable
                style={[appStyles.footerNavItem, styles.footerNavItemLeft]}
                onPress={handleGoBack}
              >
                <Image source={backArrowImage} style={{ width: 22, height: 22 }} resizeMode="contain" />
                <Text style={appStyles.footerNavLabel}>Back</Text>
              </Pressable>
              <Pressable
                style={[appStyles.footerNavItem, styles.footerNavItemLeft]}
                onPress={() => setSelectedChip('Overview')}
              >
                <Ionicons name="home" size={18} color="#111" />
                <Text style={appStyles.footerNavLabel}>Home</Text>
              </Pressable>
              <Pressable
                style={styles.footerAddButtonFloating}
                onPress={() => setShowSummary(true)}
              >
                <Text
                  style={{
                    color: '#fff',
                    fontSize: 26,
                    fontWeight: '700',
                    marginTop: -2,
                  }}
                >
                  +
                </Text>
              </Pressable>
              <Pressable
                style={[appStyles.footerNavItem, styles.footerNavItemRight]}
                onPress={() => setSelectedChip('Actions')}
              >
                <Ionicons name="chatbubble-outline" size={18} color="#B0B0B5" />
                <Text style={appStyles.footerNavLabelMuted}>Chat</Text>
              </Pressable>
              <Pressable
                style={[appStyles.footerNavItem, styles.footerNavItemRight]}
                onPress={handleOpenProfilePanel}
              >
                {chiefProfile.photo ? (
                  <ChiefFooterProfile
                    name={chiefProfile.name}
                    username={chiefProfile.username}
                    designation={chiefProfile.designation}
                    photo={chiefProfile.photo}
                  />
                ) : (
                  <Ionicons name="person-circle-sharp" size={28} color="#666" />
                )}
                <Text style={appStyles.footerNavLabelMuted}>Profile</Text>
              </Pressable>
            </View>
            <View style={appStyles.footerBrandRow}>
              <Text style={appStyles.poweredBy}>Powered By</Text>
              <ImageBackground
                source={require('../assets/Cleezo.png')}
                style={appStyles.logo}
                resizeMode="contain"
              />
            </View>
          </LinearGradient>
        )}
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  headerRow1: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 40 },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 5 },
  headerText: { fontSize: scaleFont(16), fontWeight: 'bold', color: '#000' },
  leftContainer: { flex: 1 },
  schoolName: { fontSize: 16, fontWeight: '800', color: '#1E293B', textTransform: 'uppercase' },
  branchButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
    backgroundColor: '#E2E8F0',
    marginRight: 8,
  },
  branchButtonActive: {
    backgroundColor: '#7C3AED',
  },
  branchText: { fontSize: 12, fontWeight: '700', color: '#475569' },
  branchTextActive: { color: '#FFFFFF' },
  sectionCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 12,
  },
  hContainer: { marginBottom: 10, marginTop: 0 },
  hRow: { flexDirection: 'row' },
  hTitle: { fontSize: 18, fontWeight: 'bold', marginBottom: 10 },
  monthPickerOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.28)',
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  monthPickerSheet: {
    borderRadius: 24,
    backgroundColor: '#FFFFFF',
    padding: 18,
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 10 },
    elevation: 12,
  },
  monthPickerTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#18181B',
    marginBottom: 12,
  },
  monthPickerFrame: {
    borderRadius: 18,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    backgroundColor: '#F8FAFC',
  },
  monthPicker: {
    width: '100%',
    height: 220,
    color: '#000',
  },
  monthPickerDoneBtn: {
    marginTop: 16,
    alignSelf: 'flex-end',
    backgroundColor: '#4B3CE2',
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 14,
  },
  monthPickerDoneText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '800',
  },
  chartContainer: {
    width: FIXED_CARD_WIDTH,
    height: 418,
    marginTop: 20,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 0,
    overflow: 'hidden',
    borderWidth: 0,
    backgroundColor: 'transparent',
  },
  pieChartNoShadow: {
    shadowColor: 'transparent',
    shadowOpacity: 0,
    shadowRadius: 0,
    shadowOffset: { width: 0, height: 0 },
    elevation: 0,
    borderWidth: 0,
    borderColor: 'transparent',
    backgroundColor: 'transparent',
  },
  pieCardGradient: {
    width: '100%',
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 20,
    paddingVertical: 24,
    paddingHorizontal: 18,
    overflow: 'hidden',
    shadowColor: '#B49BFF',
    shadowOpacity: 0.25,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 10 },
    elevation: 8,
  },
  pieCardTopGlow: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 20,
    opacity: 0.9,
  },
  pieCardSoftShadow: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 20,
    opacity: 0.9,
  },
  pieCardInnerGlow: {
    ...StyleSheet.absoluteFillObject,
    opacity: 0.5,
    borderRadius: 20,
  },
  pieChartWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
    marginTop: 6,
  },
  pieCardHeader: {
    width: '100%',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingHorizontal: 6,
    marginBottom: 8,
    zIndex: 2,
  },
  pieCardHeaderLeft: {
    flexShrink: 1,
  },
  pieCardHeaderLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: '#7C7C88',
    letterSpacing: 0.2,
  },
  pieCardHeaderValue: {
    fontSize: 18,
    fontWeight: '900',
    color: '#17171D',
    marginTop: 2,
  },
  pieCardHeaderBadge: {
    backgroundColor: 'rgba(255,255,255,0.92)',
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 5,
    shadowColor: '#9E8BEA',
    shadowOpacity: 0.18,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
  },
  pieCardHeaderBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#4A4A55',
  },
  pieCenterLabel: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pieCenterDueLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: '#70707A',
    letterSpacing: 0.2,
    textTransform: 'uppercase',
    marginTop: 6,
  },
  pieCenterDueValue: {
    fontSize: 18,
    fontWeight: '900',
    color: '#17171D',
    letterSpacing: -0.5,
    marginTop: 0,
  },
  pieCenterSliceLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#5E5E6A',
    marginTop: 6,
  },
  pieCenterSliceValue: {
    fontSize: 12,
    fontWeight: '800',
    color: '#5E5E6A',
    marginTop: 1,
  },
  pieEmptyState: {
    width: '100%',
    minHeight: 190,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 18,
  },
  pieEmptyTitle: {
    fontSize: 15,
    fontWeight: '900',
    color: '#1A1A1A',
    marginBottom: 6,
  },
  pieEmptyText: {
    fontSize: 12,
    lineHeight: 17,
    color: '#66666D',
    textAlign: 'center',
  },
  financeGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  financeColumn: {
    flex: 1,
  },
  divider: {
    width: 1,
    backgroundColor: '#ccc',
    marginHorizontal: 10,
  },
  subHeading: {
    color: 'black',
    fontSize: 10,
    fontWeight: 'bold',
    marginBottom: 5,
  },
  metricBadge: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 2,
    marginBottom: 2,
    gap: 3,
  },
  bullet: {
    fontSize: 11,
    color: '#000',
  },
  badgeLabel: {
    color: '#000',
    fontSize: 11,
  },
  badgeValue: {
    color: '#000',
    fontSize: 11,
    fontWeight: 'bold',
  },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 4,
  },
  totalLabel: { fontSize: 11, fontWeight: 'bold', color: '#000' },
  totalValue: { fontSize: 11, fontWeight: 'bold' },
  commerceSummaryCard: {
    width: FIXED_CARD_WIDTH,
    minHeight: SCREEN_HEIGHT * 0.22,
    backgroundColor: '#fff',
    borderRadius: 20,
    padding: 16,
    marginTop: 20,
    marginRight: 10,
  },
  actionCard: {
    width: SCREEN_WIDTH * 0.88,
    height: 132,
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginRight: 10,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
  actionGradientCard: {
    backgroundColor: 'transparent',
    borderWidth: 0,
  },
  actionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 8,
  },
  actionIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#F2F4F7',
    borderWidth: 1,
    borderColor: '#D0D5DD',
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionHeaderTextBlock: {
    flex: 1,
    minWidth: 0,
  },
  actionCardTitle: {
    color: '#111827',
    fontWeight: '800',
    fontSize: 14,
    lineHeight: 18,
  },
  actionSubText: {
    color: '#5F6368',
    fontSize: 11,
    marginTop: 3,
    fontWeight: '600',
  },
  actionBodyText: {
    color: '#202124',
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '600',
    marginBottom: 10,
  },
  actionMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  actionMetaPill: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#f6f6f7',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    alignSelf: 'flex-start',
  },
  actionMetaPillMuted: {
    backgroundColor: '#D7E7CD',
    borderWidth: 1,
    borderColor: '#A8C597',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    alignSelf: 'flex-start',
  },
  actionMetaPillText: {
    color: '#202124',
    fontSize: 10,
    fontWeight: '800',
  },
  compactBtnRow: { flexDirection: 'row', gap: 6, alignItems: 'center' },
  approveBtn: {
    backgroundColor: '#404040',
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#111111',
  },
  actionApproveYes: {
    backgroundColor: '#4CAF50',
    borderColor: '#2E7D32',
  },
  actionApproveNo: {
    backgroundColor: '#F44336',
    borderColor: '#C62828',
  },
  actionAssignBtn: {
    backgroundColor: '#404040',
    borderColor: '#111111',
  },
  approveText: { color: '#fff', fontSize: 10, fontWeight: 'bold' },
  chiefGradientCard: {
    backgroundColor: 'transparent',
    borderWidth: 0,
    paddingVertical: 14,
    paddingHorizontal: 14,
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
  chiefGradientIconWrap: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.35)',
    alignSelf: 'flex-start',
    marginTop: 2,
  },
  chiefGradientLabel: {
    color: '#191919',
    fontSize: 13.5,
    lineHeight: 16,
    fontWeight: '800',
    textAlign: 'left',
    alignSelf: 'flex-start',
    minHeight: 32,
    marginTop: 12,
    paddingHorizontal: 0,
    maxWidth: '100%',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    width: '90%',
    maxHeight: '80%',
    backgroundColor: '#fff',
    borderRadius: 20,
    padding: 20,
  },
  closeButton: {
    alignSelf: 'flex-end',
  },
  summaryModalTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 15,
    color: '#111',
  },
  summaryBranchCard: {
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  summaryBranchTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: '#1E293B',
    marginBottom: 8,
  },
  summaryMetricCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 4,
  },
  summaryMetricCardPaid: {
    borderTopWidth: 1,
    borderColor: '#CBD5E1',
    marginTop: 4,
    paddingTop: 6,
  },
  summaryMetricCardDue: {
    borderTopWidth: 1,
    borderColor: '#CBD5E1',
    marginTop: 2,
    paddingTop: 6,
  },
  summaryLabel: { fontSize: 12, color: '#64748B' },
  summaryValue: { fontSize: 12, fontWeight: '700', color: '#0F172A' },
  dropdownList: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 10,
    width: '80%',
    maxHeight: 250,
  },
  dropdownItem: { paddingVertical: 10, borderBottomWidth: 1, borderColor: '#eee' },
  dropdownItemText: { fontSize: 13, fontWeight: '600', color: '#333' },
  discountModalContent: {
    width: '85%',
    maxHeight: '70%',
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 16,
  },
  discountModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  discountModalTitle: { fontSize: 16, fontWeight: 'bold', color: '#111' },
  discountModalClose: { fontSize: 18, color: '#888' },
  discountRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderColor: '#f0f0f0',
  },
  discountName: { fontSize: 13, color: '#333', fontWeight: '600' },
  discountAmount: { fontSize: 13, color: '#2e7d32', fontWeight: 'bold' },
  discountEmpty: { fontSize: 12, color: '#666', textAlign: 'center', marginVertical: 12 },
  absentRow: { paddingVertical: 8, borderBottomWidth: 1, borderColor: '#f0f0f0' },
  input: {
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    marginVertical: 4,
    fontSize: 12,
  },
  profileModalContent: {
    width: '85%',
    backgroundColor: '#fff',
    borderRadius: 20,
    padding: 20,
    alignItems: 'center',
  },
  profileModalHeader: {
    width: '100%',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 15,
  },
  profileModalTitle: { fontSize: 18, fontWeight: 'bold', color: '#111' },
  profileModalClose: { fontSize: 18, color: '#888' },
  profileAvatarWrap: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#7C3AED',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 15,
  },
  profileAvatarText: { color: '#fff', fontSize: 24, fontWeight: 'bold' },
  profileDetailsCard: { width: '100%', marginBottom: 15 },
  profileRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderColor: '#f0f0f0',
  },
  profileLabel: { fontSize: 12, color: '#666' },
  profileValue: { fontSize: 12, fontWeight: 'bold', color: '#111' },
  profileLogoutButton: {
    backgroundColor: '#f44336',
    paddingVertical: 10,
    paddingHorizontal: 24,
    borderRadius: 12,
  },
  profileLogoutText: { color: '#fff', fontWeight: 'bold', fontSize: 14 },
  fixedFooter: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 20,
  },
  curvedFooter: {
    alignSelf: 'center',
    width: SCREEN_WIDTH - 16,
    marginHorizontal: 8,
    marginBottom: 8,
    borderTopWidth: 0,
    borderRadius: 40,
    paddingTop: 14,
    paddingBottom: 12,
    paddingHorizontal: 16,
    backgroundColor: '#FFFFFF',
    shadowColor: '#000',
    shadowOpacity: 0.16,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 10 },
    elevation: 12,
    overflow: 'visible',
  },
  footerDockRow: {
    paddingHorizontal: 14,
    alignItems: 'center',
    paddingTop: 2,
    justifyContent: 'space-between',
  },
  footerNavItemLeft: {
    alignItems: 'flex-start',
    justifyContent: 'center',
  },
  footerNavItemRight: {
    alignItems: 'flex-start',
    justifyContent: 'center',
  },
  footerAddButtonFloating: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#F4511E',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 6,
    borderColor: '#FFF',
    marginTop: -34,
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 5 },
    elevation: 10,
  },
});

export default ChiefDashboard;
  
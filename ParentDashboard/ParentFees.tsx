import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  AppState,
  Image,
  ImageSourcePropType,
  RefreshControl,
  SafeAreaView,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  Modal,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import axios from 'axios';
import LinearGradient from 'react-native-linear-gradient';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useFocusEffect } from '@react-navigation/native';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import ParentFooter from './ParentFooter';
import { ErrorContext } from '../ErrorContext';
import { RootStackParamList } from '../types';

type Props = NativeStackScreenProps<RootStackParamList, 'ParentFees'>;
type FeesViewProps = Props & { embedded?: boolean };

type FeeRow = {
  key: string;
  label: string;
  totalWithoutDiscount: number;
  amount: number;
  paid: number;
  discount: number;
  due: number;
  overdue: number;
  paymentDate?: string;
  installments: InstallmentRow[];
};

type InstallmentRow = {
  installmentNo: number;
  amount: number;
  paid: number;
  fine: number;
  deadlineDate: string;
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

type BackendFeeBreakdown = {
  key: string;
  label: string;
  total: number;
  paid: number;
  discount: number;
  remaining: number;
  scope: string;
};

type BackendPaymentResponse = {
  payments: {
    studentName: string;
    class: string;
    section: string;
    dynamicFeeBreakdown: BackendFeeBreakdown[];
    totalFee: number;
    totalPaid: number;
    totalDiscount: number;
    totalRemaining: number;
  };
};

type StudentDiscountData = {
  id: string;
  name: string;
  totalDiscount: number;
  totalPaid: number;
  totalDue: number;
  totalFee: number;
  feeDiscounts: Record<string, number>;
};

type InstallmentMap = Record<string, InstallmentRow[]>;

const logoImage: ImageSourcePropType = require('../assets/Cleezo.png');

const formatINR = (value: number) =>
  new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number.isFinite(value) ? value : 0);

const toNumber = (value: any) => {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  if (typeof value === 'string') {
    const cleaned = value.replace(/[^0-9.-]/g, '');
    const parsed = Number(cleaned);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const normalizeFeeKey = (value: string) =>
  String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '');

const normalizeComparable = (value: any) =>
  String(value || '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase();

const normalizeInstallmentGroupKey = (value: any) => {
  const normalized = String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '')
    .replace(/(?:fees?|fee|FEE|Fee)$/i, '');

  return normalized === 'tution' ? 'tuition' : normalized;
};

const normalizeInstallmentRows = (rows: InstallmentRow[] = []) =>
  rows
    .map((row, index) => {
      const sourceRow = row as any;
      const installmentNo = Number(sourceRow.installmentNo || sourceRow.installment_no || sourceRow.installment || sourceRow.id || index + 1);
      const amount = toNumber(sourceRow.amount ?? sourceRow.Amount ?? sourceRow.installmentAmount ?? sourceRow.total);
      const paid = toNumber(sourceRow.paid ?? sourceRow.Paid ?? sourceRow.paidAmount);
      const fine = toNumber(sourceRow.fine ?? sourceRow.Fine);

      return {
        installmentNo,
        amount: Number.isFinite(amount) ? Math.max(amount, 0) : 0,
        paid: Number.isFinite(paid) ? Math.max(paid, 0) : 0,
        fine: Number.isFinite(fine) ? Math.max(fine, 0) : 0,
        deadlineDate: String(sourceRow.deadlineDate || sourceRow.deadline_date || sourceRow.dueDate || sourceRow.date || ''),
      };
    })
    .filter((row) => row.installmentNo > 0 && (row.amount > 0 || row.paid > 0 || row.fine > 0 || row.deadlineDate))
    .sort((a, b) => a.installmentNo - b.installmentNo);

// Comprehensive Key Generator supporting Dance, dance, DANCE, and fee suffix permutations
const getFeeLookupKeys = (...values: any[]) => {
  const keys = new Set<string>();

  values.forEach((value) => {
    const raw = String(value || '').trim();
    if (!raw) return;

    // Direct raw variations
    keys.add(raw);
    keys.add(raw.toLowerCase());
    keys.add(raw.toUpperCase());
    
    // Title Case (e.g. Dance, Dance Fee)
    const titleCaseRaw = raw.charAt(0).toUpperCase() + raw.slice(1);
    keys.add(titleCaseRaw);

    const normalizedFeeKey = normalizeFeeKey(raw);
    const normalizedInstallmentKey = normalizeInstallmentGroupKey(raw);

    keys.add(normalizedFeeKey);
    keys.add(normalizedInstallmentKey);

    // Stripped base key (e.g., "dance_fee" -> "dance")
    const strippedBase = normalizedFeeKey.replace(/_?(?:fees?|fee)$/i, '');

    if (strippedBase) {
      const baseLower = strippedBase.toLowerCase();
      const baseUpper = strippedBase.toUpperCase();
      const baseTitle = strippedBase.charAt(0).toUpperCase() + strippedBase.slice(1);

      // Base cases: dance, DANCE, Dance
      keys.add(baseLower);
      keys.add(baseUpper);
      keys.add(baseTitle);

      // Suffix permutations for fee/FEE/Fee/fees/FEES/Fees
      const suffixList = ['fee', 'FEE', 'Fee', 'fees', 'FEES', 'Fees'];

      suffixList.forEach((suf) => {
        // Underscore variants (dance_fee, DANCE_FEE, Dance_Fee)
        keys.add(`${baseLower}_${suf}`);
        keys.add(`${baseUpper}_${suf}`);
        keys.add(`${baseTitle}_${suf}`);

        // Direct concatenated variants (dancefee, DANCEFEE, DanceFee)
        keys.add(`${baseLower}${suf}`);
        keys.add(`${baseUpper}${suf}`);
        keys.add(`${baseTitle}${suf}`);

        // Space separated variants (dance fee, DANCE FEE, Dance Fee)
        keys.add(`${baseLower} ${suf}`);
        keys.add(`${baseUpper} ${suf}`);
        keys.add(`${baseTitle} ${suf}`);
      });
    }
  });

  return Array.from(keys).filter(Boolean);
};

const buildInstallmentMapFromFeesDetails = (payload: any): InstallmentMap => {
  const map: InstallmentMap = {};
  const source = payload && typeof payload === 'object' ? payload : {};

  Object.entries(source).forEach(([feeKey, value]) => {
    const rows = Array.isArray(value)
      ? value
      : [
          ...(Array.isArray((value as any)?.classWise) ? (value as any).classWise : []),
          ...(Array.isArray((value as any)?.studentWise) ? (value as any).studentWise : []),
          ...(Array.isArray((value as any)?.installments) ? (value as any).installments : []),
        ];
    const normalizedRows = normalizeInstallmentRows(rows as InstallmentRow[]);
    if (!normalizedRows.length) return;

    getFeeLookupKeys(
      feeKey,
      feeKey === 'tuition' ? 'class_fee' : '',
      feeKey === 'school' ? 'school_fee' : ''
    ).forEach((key) => {
      map[key] = normalizedRows;
    });
  });

  return map;
};

const mergeInstallmentMaps = (...maps: InstallmentMap[]) =>
  maps.reduce<InstallmentMap>((merged, map) => {
    Object.entries(map || {}).forEach(([key, rows]) => {
      if (Array.isArray(rows) && rows.length) merged[key] = rows;
    });
    return merged;
  }, {});

const formatDateLabel = (value?: string) => {
  if (!value) return '';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return String(value);
  return parsed.toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
};

const getInstallmentDue = (installment: InstallmentRow) =>
  Math.max(
    toNumber(installment.amount) + toNumber(installment.fine) - toNumber(installment.paid),
    0
  );

const isPastDeadline = (value?: string) => {
  if (!value) return false;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return false;

  const deadlineDate = new Date(parsed.getFullYear(), parsed.getMonth(), parsed.getDate()).getTime();
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  return deadlineDate < today;
};

const getOverdueAmount = (installments: InstallmentRow[] = []) =>
  installments.reduce((sum, installment) => {
    if (!isPastDeadline(installment.deadlineDate)) return sum;
    return sum + getInstallmentDue(installment);
  }, 0);

const buildInstallmentMapFromSources = (sources: any[]) => {
  const grouped: Record<string, InstallmentRow[]> = {};
  const dynamicInstallmentRegex =
    /^([a-zA-Z0-9_]+)_installment_(\d+)(?:_(amount|paid|fine|deadline|date|deadline_date))?$/i;
  const genericInstallmentRegex = /^Installment(\d+)_(Amount|Paid|Fine|Deadline|Date|Deadline_Date)$/i;

  const getRow = (feeKey: string, installmentNo: number) => {
    if (!feeKey || !installmentNo) return null;
    if (!grouped[feeKey]) grouped[feeKey] = [];

    let row = grouped[feeKey].find((item) => item.installmentNo === installmentNo);
    if (!row) {
      row = { installmentNo, amount: 0, paid: 0, fine: 0, deadlineDate: '' };
      grouped[feeKey].push(row);
    }

    return row;
  };

  const applyValue = (row: InstallmentRow | null, suffix: string, rawValue: any) => {
    if (!row) return;
    const normalizedSuffix = String(suffix || 'amount').toLowerCase();
    const numericValue = toNumber(rawValue);

    if (normalizedSuffix === 'amount') row.amount = Math.max(row.amount, numericValue);
    if (normalizedSuffix === 'paid') row.paid = Math.max(row.paid, numericValue);
    if (normalizedSuffix === 'fine') row.fine = Math.max(row.fine, numericValue);
    if (['deadline', 'date', 'deadline_date'].includes(normalizedSuffix) && rawValue && !row.deadlineDate) {
      row.deadlineDate = String(rawValue);
    }
  };

  const flatSources = sources.flatMap((source) => {
    if (!source) return [];
    if (Array.isArray(source)) return source;
    if (Array.isArray(source?.data)) return source.data;
    if (Array.isArray(source?.feeDetails)) return source.feeDetails;
    if (Array.isArray(source?.students)) return source.students;
    return [source];
  });

  flatSources.forEach((source) => {
    if (!source || typeof source !== 'object') return;

    const defaultFeeKey = normalizeInstallmentGroupKey(
      source.fee_type || source.feeType || source.FeeType || source.feeName || source.fee_name || source.type || 'tuition'
    );
    const hasDynamicInstallments = Object.keys(source).some((key) => dynamicInstallmentRegex.test(key));

    Object.entries(source).forEach(([key, rawValue]) => {
      const dynamicMatch = key.match(dynamicInstallmentRegex);
      if (dynamicMatch) {
        const feeKey = normalizeInstallmentGroupKey(dynamicMatch[1]);
        applyValue(getRow(feeKey, Number(dynamicMatch[2])), dynamicMatch[3] || 'amount', rawValue);
        return;
      }

      const genericMatch = key.match(genericInstallmentRegex);
      if (genericMatch && !hasDynamicInstallments) {
        applyValue(getRow(defaultFeeKey, Number(genericMatch[1])), genericMatch[2] || 'amount', rawValue);
      }
    });
  });

  Object.keys(grouped).forEach((feeKey) => {
    grouped[feeKey] = normalizeInstallmentRows(grouped[feeKey]);
  });

  return grouped;
};

const mergeInstallmentsForFee = (amountRows: InstallmentRow[] = [], paidRows: InstallmentRow[] = []) => {
  const rowsByNumber = new Map<number, InstallmentRow>();

  [...amountRows, ...paidRows].forEach((row) => {
    const installmentNo = Number(row.installmentNo);
    if (!installmentNo) return;
    const existing = rowsByNumber.get(installmentNo) || {
      installmentNo,
      amount: 0,
      paid: 0,
      fine: 0,
      deadlineDate: '',
    };

    rowsByNumber.set(installmentNo, {
      installmentNo,
      amount: Math.max(existing.amount, toNumber(row.amount)),
      paid: Math.max(existing.paid, toNumber(row.paid)),
      fine: Math.max(existing.fine, toNumber(row.fine)),
      deadlineDate: existing.deadlineDate || row.deadlineDate || '',
    });
  });

  return normalizeInstallmentRows(Array.from(rowsByNumber.values()));
};

const adjustInstallmentRowsToTotal = (rows: InstallmentRow[] = [], targetTotal = 0) => {
  const normalizedRows = normalizeInstallmentRows(rows);
  const netTotal = Math.max(toNumber(targetTotal), 0);
  const configuredTotal = normalizedRows.reduce((sum, row) => sum + Math.max(toNumber(row.amount), 0), 0);

  if (!normalizedRows.length || configuredTotal <= 0 || netTotal <= 0) return normalizedRows;

  let allocatedTotal = 0;
  return normalizedRows.map((row, index) => {
    const isLast = index === normalizedRows.length - 1;
    const adjustedAmount = isLast
      ? Math.max(netTotal - allocatedTotal, 0)
      : Number(((Math.max(toNumber(row.amount), 0) / configuredTotal) * netTotal).toFixed(2));

    allocatedTotal = Number((allocatedTotal + adjustedAmount).toFixed(2));

    return {
      ...row,
      amount: adjustedAmount,
      paid: Math.min(Math.max(toNumber(row.paid), 0), adjustedAmount),
    };
  });
};

const ParentFees: React.FC<FeesViewProps> = ({ navigation, embedded = false }) => {
  const [studentData, setStudentData] = useState<Record<string, any> | null>(null);
  const [classFeeSource, setClassFeeSource] = useState<Record<string, any> | null>(null);
  const [studentFeeSource, setStudentFeeSource] = useState<any>(null);
  const [paymentDetails, setPaymentDetails] = useState<BackendPaymentResponse | null>(null);
  const [feeApiSummary, setFeeApiSummary] = useState<Record<string, any> | null>(null);
  const [feeDetailsInstallments, setFeeDetailsInstallments] = useState<Record<string, any> | null>(null);
  const [dynamicFeeTypes, setDynamicFeeTypes] = useState<DynamicFeeType[]>([]);
  const [studentsWithDiscounts, setStudentsWithDiscounts] = useState<StudentDiscountData[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const hasLoadedFeesRef = useRef(false);
  const { showError } = React.useContext(ErrorContext);

  const [modalVisible, setModalVisible] = useState(false);
  const [selectedFeeRow, setSelectedFeeRow] = useState<FeeRow | null>(null);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      const triggerRefresh = () => setRefreshKey((key) => key + 1);

      const fetchStudentData = async () => {
        try {
          const keys = ['studentId', 'username', 'name', 'class_name', 'section', 'schoolCode'];
          const stores = await AsyncStorage.multiGet(keys);
          if (!active) return;

          const data: Record<string, any> = {};
          stores.forEach(([key, value]) => {
            if (value) data[key] = value;
          });
          console.log('[ParentFees] Student Data:', data);
          setStudentData(data);
        } catch (error) {
          console.error('[ParentFees] AsyncStorage Error:', error);
          showError('Data Error', 'Failed to load local student credentials.');
        }
      };

      fetchStudentData();
      triggerRefresh();

      const intervalId = setInterval(triggerRefresh, 15000);
      const appStateSubscription = AppState.addEventListener('change', (state) => {
        if (state === 'active') triggerRefresh();
      });

      return () => {
        active = false;
        clearInterval(intervalId);
        appStateSubscription.remove();
      };
    }, [showError])
  );

  const handleManualRefresh = useCallback(() => {
    setRefreshKey((key) => key + 1);
  }, []);

  useEffect(() => {
    let active = true;

    const fetchDynamicFeeTypes = async () => {
      try {
        if (!studentData?.schoolCode) return;

        const res = await axios.get('https://cleezoclass.com:4000/api/fee-types', {
          params: { schoolCode: studentData.schoolCode, _t: Date.now() },
        });

        if (!active) return;

        const rows = Array.isArray(res?.data?.data) ? res.data.data : Array.isArray(res?.data) ? res.data : [];
        const feeTypes = rows
          .filter((item: Record<string, any>) => String(item?.feeName || item?.feesType || '').trim() !== '')
          .map((item: Record<string, any>) => ({
            id: item?.id,
            feeName: item?.feeName || '',
            feesType: item?.feesType || '',
            scope: item?.scope || '',
            frequency: item?.frequency || '',
            installments: item?.installments || 1,
            columnBase: normalizeFeeKey(item?.columnBase || item?.feeName || item?.feesType || ''),
          }));
        console.log('[ParentFees] Dynamic Fee Types:', feeTypes);
        setDynamicFeeTypes(feeTypes);
      } catch (error) {
        console.error('[ParentFees] Fee Types Fetch Error:', error);
        if (active) {
          showError('Configuration Error', 'Failed to retrieve structural school fee variants.');
          setDynamicFeeTypes([]);
        }
      }
    };

    fetchDynamicFeeTypes();
    return () => {
      active = false;
    };
  }, [studentData?.schoolCode, showError]);

  useEffect(() => {
    let active = true;

    const fetchFees = async () => {
      try {
        if (!studentData?.class_name || !studentData?.section || !studentData?.schoolCode) return;

        console.log("========== FETCH FEES START ==========");
        console.log("Student Data:", studentData);

        const [feeApiRes, classRes, studentRes, paymentRes, feeStructureRes, feeDetailsInstallmentsRes] =
          await Promise.allSettled([
            (async () => {
              try {
                console.log("➡️ Calling API: /api/fees");
                const res = await axios.get(
                  `https://cleezoclass.com:4000/api/fees/${encodeURIComponent(
                    String(studentData.username || "")
                  )}`,
                  { params: { schoolCode: studentData.schoolCode } }
                );
                console.log("✅ /api/fees Response:", res.data);
                return res;
              } catch (e) {
                console.error("❌ /api/fees Request Failed", e);
                throw e;
              }
            })(),

            (async () => {
              try {
                console.log("➡️ Calling API: /api/feeDetailsByClassSection");
                const res = await axios.get(
                  "https://cleezoclass.com:4000/api/feeDetailsByClassSection",
                  {
                    params: {
                      className: studentData.class_name,
                      section: studentData.section,
                      schoolCode: studentData.schoolCode,
                    },
                  }
                );
                console.log("✅ /api/feeDetailsByClassSection Response:", res.data);
                return res;
              } catch (e) {
                console.error("❌ /api/feeDetailsByClassSection Request Failed", e);
                throw e;
              }
            })(),

            (async () => {
              try {
                console.log("➡️ Calling API: /api/studentFees");
                const res = await axios.post(
                  "https://cleezoclass.com:4000/api/studentFees",
                  {
                    studentId: studentData.studentId,
                    schoolCode: studentData.schoolCode,
                  }
                );
                console.log("✅ /api/studentFees Response:", res.data);
                return res;
              } catch (e) {
                console.error("❌ /api/studentFees Request Failed", e);
                throw e;
              }
            })(),

            (async () => {
              try {
                console.log("➡️ Calling API: /api/payment");
                const res = await axios.get(
                  `https://cleezoclass.com:4000/api/payment/${studentData.studentId}?schoolCode=${studentData.schoolCode}`
                );
                console.log("✅ /api/payment Response:", res.data);
                return res;
              } catch (e) {
                console.error("❌ /api/payment Request Failed", e);
                throw e;
              }
            })(),

            (async () => {
              try {
                console.log("➡️ Calling API: /feeStructure");
                const res = await axios.get(
                  `https://cleezoclass.com:4000/feeStructure/${encodeURIComponent(
                    String(studentData.class_name || "")
                  )}`,
                  {
                    params: {
                      schoolCode: studentData.schoolCode,
                      section: studentData.section,
                    },
                  }
                );
                console.log("✅ /feeStructure Response:", res.data);
                return res;
              } catch (e) {
                console.error("❌ /feeStructure Request Failed", e);
                throw e;
              }
            })(),

            (async () => {
              try {
                console.log("➡️ Calling API: /api/fees-details-installments");
                const res = await axios.get(
                  "https://cleezoclass.com:4000/api/fees-details-installments",
                  {
                    params: {
                      schoolCode: studentData.schoolCode,
                      className: studentData.class_name,
                      section: studentData.section,
                      studentName: studentData.name || studentData.username || '',
                    },
                  }
                );
                console.log("✅ /api/fees-details-installments Response:", res.data);
                return res;
              } catch (e) {
                console.error("❌ /api/fees-details-installments Request Failed", e);
                throw e;
              }
            })(),
          ]);

        if (!active) return;

        console.log("========== API STATUS ==========");
        if (feeApiRes.status === "rejected") console.error("❌ /api/fees Error:", feeApiRes.reason);
        if (classRes.status === "rejected") console.error("❌ /api/feeDetailsByClassSection Error:", classRes.reason);
        if (studentRes.status === "rejected") console.error("❌ /api/studentFees Error:", studentRes.reason);
        if (paymentRes.status === "rejected") console.error("❌ /api/payment Error:", paymentRes.reason);
        if (feeStructureRes.status === "rejected") console.error("❌ /feeStructure Error:", feeStructureRes.reason);
        if (feeDetailsInstallmentsRes.status === "rejected") console.error("❌ /api/fees-details-installments Error:", feeDetailsInstallmentsRes.reason);

        if (paymentRes.status === "rejected" && feeApiRes.status === "rejected") {
          showError("Sync Error", "Essential transaction ledgers failed to load from server.");
        }

        const feeApiPayload = feeApiRes.status === "fulfilled" ? feeApiRes.value.data?.data || {} : {};
        const classFeeData = classRes.status === "fulfilled" ? classRes.value.data?.feeDetail || {} : {};
        const studentFeeData = studentRes.status === "fulfilled" ? studentRes.value.data?.feeDetails || {} : {};
        const paymentPayload = paymentRes.status === "fulfilled" ? paymentRes.value.data : null;
        const feeStructureData = feeStructureRes.status === "fulfilled" ? feeStructureRes.value.data?.feeStructure || feeStructureRes.value.data?.feeDetail || {} : {};
        const feeDetailsInstallmentsData = feeDetailsInstallmentsRes.status === "fulfilled" ? feeDetailsInstallmentsRes.value.data || {} : {};
        const fallbackClassFeeData = classRes.status === "fulfilled" ? classRes.value.data?.feeDetail || classRes.value.data?.feeStructure || {} : {};

        setClassFeeSource(Object.keys(feeStructureData || {}).length ? feeStructureData : fallbackClassFeeData || null);
        setPaymentDetails(paymentPayload || null);
        setFeeApiSummary(feeApiPayload || null);
        setStudentFeeSource(studentFeeData || null);
        setFeeDetailsInstallments(feeDetailsInstallmentsData || null);
      } catch (error) {
        console.error("❌ fetchFees Outer Error:", error);
        if (active) {
          showError("Fee Load Error", "Unexpected network fault occurred processing balances.");
          setClassFeeSource(null);
          setStudentFeeSource(null);
          setPaymentDetails(null);
          setFeeDetailsInstallments(null);
        }
      } finally {
        console.log("========== FETCH FEES END ==========");
      }
    };

    const run = async () => {
      if (!hasLoadedFeesRef.current) setLoading(true);
      setRefreshing(true);
      await fetchFees();
      if (active) {
        hasLoadedFeesRef.current = true;
        setLoading(false);
        setRefreshing(false);
      }
    };

    run();
    return () => {
      active = false;
    };
  }, [studentData, showError, refreshKey]);

  useEffect(() => {
    let active = true;

    const fetchStudentsNameAccountant = async () => {
      try {
        if (!studentData?.class_name || !studentData?.section || !studentData?.schoolCode) return;

        console.log("➡️ Calling API: /api/studentsNameAccountant");
        const res = await axios.get(
          `https://cleezoclass.com:4000/api/studentsNameAccountant/${encodeURIComponent(studentData.class_name)}`,
          {
            params: {
              schoolCode: studentData.schoolCode,
              section: studentData.section,
            },
          }
        );

        if (!active) return;
        console.log("✅ /api/studentsNameAccountant Response:", res.data);

        if (res.data?.students && Array.isArray(res.data.students)) {
          const dynamicFeeBases = dynamicFeeTypes.map((type) => type.columnBase || '');
          const studentsWithDiscountsData = res.data.students.map((student: any) => {
            if (!student) return null;
            const feeDiscounts: Record<string, number> = {};

            Object.keys(student).forEach((rawKey) => {
              if (/_discount$/i.test(rawKey)) {
                const baseKey = rawKey.replace(/_discount$/i, '');
                const val = toNumber(student[rawKey]);
                getFeeLookupKeys(baseKey).forEach((k) => {
                  feeDiscounts[k] = val;
                });
              }
            });

            dynamicFeeBases.forEach((base) => {
              if (!base) return;
              const discountKey = `${base}_discount`;
              if (student[discountKey] !== undefined) {
                const val = toNumber(student[discountKey]);
                getFeeLookupKeys(base).forEach((k) => {
                  feeDiscounts[k] = val;
                });
              }
            });

            return {
              id: String(student.id || ''),
              name: student.name || 'Unknown Student',
              totalDiscount: toNumber(student.total_discount || 0),
              totalPaid: toNumber(student.total_paid || 0),
              totalDue: toNumber(student.total_due || 0),
              totalFee: toNumber(student.total_fee || 0),
              feeDiscounts,
            };
          }).filter(Boolean) as StudentDiscountData[];

          console.log('[ParentFees] Logged All Students Discount Data:', studentsWithDiscountsData);
          setStudentsWithDiscounts(studentsWithDiscountsData);
        }
      } catch (error) {
        console.error('[ParentFees] Discount Fetch Error:', error);
        if (active) {
          showError('Discount Load Error', 'Unable to parse structural discount metrics.');
        }
      }
    };  
  
    fetchStudentsNameAccountant();
    return () => {
      active = false;
    };
  }, [studentData?.class_name, studentData?.section, studentData?.schoolCode, showError, dynamicFeeTypes]);

  const currentStudentDiscountData = useMemo(() => {
    if (!studentsWithDiscounts?.length || !studentData) return null;

    const currentId = normalizeComparable(studentData.studentId || studentData.id);
    const currentNameCandidates = [
      studentData.name,
      paymentDetails?.payments?.studentName,
      studentData.username,
    ]
      .map(normalizeComparable)
      .filter(Boolean);

    const match =
      studentsWithDiscounts.find((student) => currentId && normalizeComparable(student.id) === currentId) ||
      studentsWithDiscounts.find((student) => currentNameCandidates.includes(normalizeComparable(student.name))) ||
      null;

    console.log('[ParentFees] Matched Current Student Discount Profile:', match);
    return match;
  }, [paymentDetails?.payments?.studentName, studentData, studentsWithDiscounts]);

const feeRows: FeeRow[] = useMemo(() => {
    try {
      console.log("========== FEE ROWS DEBUG START ==========");

      const feeDetailsInstallmentMap = buildInstallmentMapFromFeesDetails(feeDetailsInstallments);
      const configuredInstallmentMap = mergeInstallmentMaps(
        buildInstallmentMapFromSources([
          classFeeSource,
          studentFeeSource,
          feeApiSummary,
        ]),
        feeDetailsInstallmentMap
      );

      const paidInstallmentMap = mergeInstallmentMaps(
        buildInstallmentMapFromSources([
          paymentDetails?.payments,
          studentFeeSource,
          feeApiSummary,
        ]),
        feeDetailsInstallmentMap
      );

      if (paymentDetails?.payments?.dynamicFeeBreakdown?.length) {
        const feeBreakdown = paymentDetails.payments.dynamicFeeBreakdown;
        const studentsDiscountData = currentStudentDiscountData;

        console.log('[ParentFees] Processing fee breakdown with discount source:', studentsDiscountData);

        const rows = feeBreakdown.map((fee: BackendFeeBreakdown) => {
          if (!fee) return null;

          // 1. Direct discount from dynamicFeeBreakdown payload item
          let discount = toNumber(fee.discount || 0);

          // 2. Fallback to student discount mapping if dynamic Fee discount is 0/undefined
          if (discount === 0 && studentsDiscountData?.feeDiscounts) {
            const lookupKeys = getFeeLookupKeys(fee.key, fee.label);
            for (const k of lookupKeys) {
              if (studentsDiscountData.feeDiscounts[k] !== undefined && studentsDiscountData.feeDiscounts[k] > 0) {
                discount = studentsDiscountData.feeDiscounts[k];
                break;
              }
            }
          }

          console.log(`[ParentFees] Fee Discount Log [${fee.label || fee.key}]:`, {
            feeKey: fee.key,
            feeLabel: fee.label,
            directDiscount: fee.discount,
            appliedDiscount: discount,
          });

          const grossTotal = toNumber(fee.total || 0);
          const paid = toNumber(fee.paid || 0);
          const discountedTotal = Math.max(grossTotal - discount, 0);
          const due = discountedTotal - paid;

          const feeKey = normalizeInstallmentGroupKey(fee.key || fee.label || '');
          const feeLabelKey = normalizeInstallmentGroupKey(fee.label || '');
          const feeLookupKeys = getFeeLookupKeys(fee.key, fee.label);

          const getInstallments = (map: InstallmentMap) =>
            feeLookupKeys
              .map((key) => map[key])
              .find((rows) => Array.isArray(rows) && rows.length) ||
            map[feeKey] ||
            map[feeLabelKey] ||
            [];

          const configured = getInstallments(configuredInstallmentMap);
          const paidInstallments = getInstallments(paidInstallmentMap);

          const installments = adjustInstallmentRowsToTotal(
            mergeInstallmentsForFee(configured, paidInstallments),
            discountedTotal
          );

          return {
            key: fee.key || fee.label || Math.random().toString(),
            label: fee.label || fee.key || 'Unknown Fee',
            totalWithoutDiscount: grossTotal,
            amount: discountedTotal,
            paid,
            discount,
            due: Math.max(due, 0),
            overdue: getOverdueAmount(installments),
            paymentDate: '-',
            installments,
          };
        }).filter(Boolean) as FeeRow[];

        console.log("========== FEE ROWS DEBUG END ==========");
        return rows;
      }
    } catch (error) {
      console.error('[ParentFees] Critical evaluation fault inside row computation:', error);
      showError('Calculation Error', 'Client failed processing local installment allocations matrix.');
    }

    return [];
  }, [
    classFeeSource,
    currentStudentDiscountData,
    feeApiSummary,
    feeDetailsInstallments,
    paymentDetails,
    studentFeeSource,
    showError
  ]);

  const summaryTotalFee = useMemo(() => feeRows.reduce((sum, row) => sum + row.amount, 0), [feeRows]);
  const summaryPaid = useMemo(() => feeRows.reduce((sum, row) => sum + row.paid, 0), [feeRows]);
  const summaryDiscount = useMemo(() => feeRows.reduce((sum, row) => sum + row.discount, 0), [feeRows]);
  const summaryDue = useMemo(() => feeRows.reduce((sum, row) => sum + row.due, 0), [feeRows]);

  const feeChartMax = Math.max(summaryTotalFee, summaryPaid + summaryDue, 1);

  const installmentColWidth = 130;
  const tableWidth = 140 + (100 * 6) + installmentColWidth;

  const tableColumns = useMemo(() => [
    { key: 'label' as const, header: 'Fee Type', style: styles.tdFee, headerStyle: styles.thFee, numberOfLines: 1 },
    { key: 'totalWithoutDiscount' as const, header: 'Total', style: styles.tdCol, headerStyle: styles.thCol },
    { key: 'discount' as const, header: 'Discount', style: styles.tdCol, headerStyle: styles.thCol },
    { key: 'amount' as const, header: 'Net Payable', style: styles.tdCol, headerStyle: styles.thCol },
    { key: 'paid' as const, header: 'Paid', style: styles.tdCol, headerStyle: styles.thCol },
    {
      key: 'installments' as const,
      header: 'Installments',
      style: [styles.tdInstallmentsCol, { width: installmentColWidth }],
      headerStyle: [styles.thInstallmentsCol, { width: installmentColWidth }],
    },
    { key: 'overdue' as const, header: 'Overdue', style: styles.tdCol, headerStyle: styles.thCol },
    { key: 'due' as const, header: 'Total Due', style: styles.tdCol, headerStyle: styles.thCol },
  ], []);

  const handleOpenInstallmentModal = (row: FeeRow) => {
    setSelectedFeeRow(row);
    setModalVisible(true);
  };

  const TableHeader = () => (
    <View style={styles.tableHeader}>
      {tableColumns.map((col) => (
        <View key={String(col.key)} style={[styles.cellContainer, col.headerStyle]}>
          <Text style={styles.th} numberOfLines={1}>
            {col.header}
          </Text>
        </View>
      ))}
    </View>
  );

  const TableRow = ({ row }: { row: FeeRow }) => (
    <View key={row.key} style={styles.tableRow}>
      {tableColumns.map((col) => {
        const value = row[col.key];
        
        if (col.key === 'installments') {
          return (
            <View key={`${row.key}-${String(col.key)}`} style={[styles.cellContainer, col.style]}>
              {row.installments && row.installments.length ? (
                <TouchableOpacity
                  style={styles.installmentButton}
                  onPress={() => handleOpenInstallmentModal(row)}
                >
                  <MaterialIcons name="receipt-long" size={14} color="#FFF" />
                  <Text style={styles.installmentButtonText}>View ({row.installments.length})</Text>
                </TouchableOpacity>
              ) : (
                <Text style={styles.installmentEmpty}>-</Text>
              )}
            </View>
          );
        }

        const displayValue = typeof value === 'number' ? formatINR(value) : String(value || '-');
        return (
          <View key={`${row.key}-${String(col.key)}`} style={[styles.cellContainer, col.style]}>
            <Text
              style={styles.td}
              numberOfLines={col.numberOfLines}
            >
              {displayValue}
            </Text>
          </View>
        );
      })}
    </View>
  );

  if (loading || !studentData) {
    return (
      <View style={embedded ? styles.embeddedShell : styles.safeArea}>
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#111" />
          <Text style={styles.loadingText}>Loading...</Text>
        </View>
      </View>
    );
  }

  const content = (
    <View style={embedded ? styles.embeddedContent : styles.content}>
      <StatusBar barStyle="light-content" backgroundColor="#0D3F66" translucent={false} />

      <LinearGradient 
      
              colors={['#DCEEFF', '#182B8C', '#0B1052']}
      
      start={{ x: 0, y: 0 }} end={{ x: 0, y: 1 }} style={styles.feeGradientSection}>
        {!embedded && (
          <View style={styles.headerRow}>
            <View style={styles.headerTitleBlock}>
              <Text style={styles.title}>Fees</Text>
              <Text style={styles.subtitle}>Student Fee Details</Text>
            </View>
            <View style={{ width: 36 }} />
          </View>
        )}

        <View style={styles.feeGraphSection}>
          <View style={styles.feeGraphTitleRow}>
            <Text style={styles.feeGraphTitle}>Fee Status</Text>
            <Text style={styles.feeGraphSubtitle}>Paid vs Remaining</Text>
          </View>

          <View style={styles.feeLegendRow}>
            <View style={styles.feeLegendItem}>
              <View style={[styles.feeLegendDot, { backgroundColor: '#2EE59D' }]} />
              <Text style={styles.feeLegendText}>Paid</Text>
            </View>
            <View style={styles.feeLegendItem}>
              <View style={[styles.feeLegendDot, { backgroundColor: '#F36B79' }]} />
              <Text style={styles.feeLegendText}>Remaining</Text>
            </View>
          </View>

          <View style={styles.feeChartCard}>
            <View style={styles.feeChartGrid}>
              {[
                { label: 'Paid', value: summaryPaid, color: '#2EE59D' },
                { label: 'Remaining', value: summaryDue, color: '#F36B79' },
              ].map((item) => {
                const heightPct = `${Math.max(6, (item.value / feeChartMax) * 100)}%` as string;
                return (
                  <View key={item.label} style={styles.feeChartItem}>
                    <Text style={styles.feeChartValue}>{formatINR(item.value)}</Text>
                    <View style={styles.feeChartBarTrack}>
                      <View style={[styles.feeChartBarFill, { height: heightPct, backgroundColor: item.color }]} />
                    </View>
                    <Text style={styles.feeChartLabel}>{item.label}</Text>
                  </View>
                );
              })}
            </View>
          </View>
        </View>
      </LinearGradient>

      <ScrollView
        nestedScrollEnabled
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.studentDataWrap}
        refreshControl={
          <RefreshControl
            refreshing={refreshing && hasLoadedFeesRef.current}
            onRefresh={handleManualRefresh}
            tintColor="#0D3F66"
            colors={['#0D3F66']}
          />
        }
      >
        <View style={styles.transactionWrap}>
          <View style={styles.summaryRow}>
            <LinearGradient
                 colors={['#080C3D', '#0B1052','#1A2D4A']}
              start={{ x: 0.05, y: 0.05 }}
              end={{ x: 0.95, y: 0.95 }}
              style={[styles.summaryGradientCard, styles.summaryCardLeft]}
            >
              <View style={styles.summaryGradientIconWrap}>
                <MaterialIcons name="payments" size={24} color="#1A1A1A" />
              </View>
              <View style={styles.summaryCardContent}>
                <View style={styles.row}>
                  <View style={styles.itemContainer}>
                    <Text style={styles.summaryGradientLabel}>Discount</Text>
                    <Text style={styles.summaryGradientValue} numberOfLines={1} adjustsFontSizeToFit>
                      {formatINR(summaryDiscount)}
                    </Text>
                  </View>
                  <View style={styles.itemContainer}>
                    <Text style={styles.summaryGradientLabel}>Total</Text>
                    <Text style={styles.summaryGradientValue} numberOfLines={1} adjustsFontSizeToFit>
                      {formatINR(summaryTotalFee)}
                    </Text>
                  </View>
                </View>
              </View>
            </LinearGradient>
            <LinearGradient
              colors={['#080C3D', '#0B1052','#1A2D4A']}
              start={{ x: 0.05, y: 0.05 }}
              end={{ x: 0.95, y: 0.95 }}
              style={[styles.summaryGradientCard, styles.summaryCardRight]}
            >
              <View style={styles.summaryGradientIconWrap}>
                <MaterialIcons name="account-balance-wallet" size={24} color="#1A1A1A" />
              </View>
              <View style={styles.summaryCardContent}>
                <View style={styles.row}>
                  <View style={styles.itemContainer}>
                    <Text style={styles.summaryGradientLabel}>Due</Text>
                    <Text style={styles.summaryGradientValue} numberOfLines={1} adjustsFontSizeToFit>
                      {formatINR(summaryDue)}
                    </Text>
                  </View>
                  <View style={styles.itemContainer}>
                    <Text style={styles.summaryGradientLabel}>Paid</Text>
                    <Text style={styles.summaryGradientValue} numberOfLines={1} adjustsFontSizeToFit>
                      {formatINR(summaryPaid)}
                    </Text>
                  </View>
                </View>
              </View>
            </LinearGradient>
          </View>

          <View style={styles.tableCard}>
            <ScrollView horizontal showsHorizontalScrollIndicator contentContainerStyle={styles.tableHorizontalContent}>
              <View style={[styles.tableContent, { minWidth: tableWidth }]}>
                <TableHeader />
                <ScrollView nestedScrollEnabled showsVerticalScrollIndicator={false} contentContainerStyle={styles.tableBody}>
                  {feeRows.length ? feeRows.map((row) => <TableRow key={row.key} row={row} />) : (
                    <Text style={styles.emptyText}>No data available.</Text>
                  )}
                </ScrollView>
              </View>
            </ScrollView>
          </View>
        </View>
      </ScrollView>

      <Modal
        animationType="fade"
        transparent={true}
        visible={modalVisible}
        onRequestClose={() => setModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContainer}>
            <View style={styles.modalHeader}>
              <View>
                <Text style={styles.modalTitle}>{selectedFeeRow?.label}</Text>
                <Text style={styles.modalSubtitle}>Installment Breakdown</Text>
              </View>
              <TouchableOpacity onPress={() => setModalVisible(false)} style={styles.closeBtn}>
                <MaterialIcons name="close" size={22} color="#111827" />
              </TouchableOpacity>
            </View>

            <ScrollView contentContainerStyle={styles.modalScrollContent} showsVerticalScrollIndicator={false}>
              {selectedFeeRow?.installments?.map((installment) => {
                const deadline = formatDateLabel(installment.deadlineDate);
                return (
                  <View key={`modal-inst-${installment.installmentNo}`} style={styles.modalInstallmentCard}>
                    <View style={styles.modalCardHeader}>
                      <Text style={styles.modalInstNo}>Installment {installment.installmentNo}</Text>
                    </View>
                    
                    <View style={styles.modalCardDetailsRow}>
                      <View style={styles.modalMetric}>
                        <Text style={styles.modalMetricLabel}>Amount</Text>
                        <Text style={styles.modalMetricValue}>{formatINR(installment.amount)}</Text>
                      </View>
                      <View style={styles.modalMetric}>
                        <Text style={styles.modalMetricLabel}>Deadline</Text>
                        <Text style={[styles.modalMetricValue, { color: '#DC2626' }]}>
                          {deadline || '-'}
                        </Text>
                      </View>
                    </View>

                    {toNumber(installment.fine) > 0 && (
                      <View style={styles.modalFineRow}>
                        <MaterialIcons name="info-outline" size={13} color="#DC2626" />
                        <Text style={styles.modalFineText}>Includes Fine: {formatINR(installment.fine)}</Text>
                      </View>
                    )}
                  </View>
                );
              })}
            </ScrollView>

            <TouchableOpacity style={styles.doneBtn} onPress={() => setModalVisible(false)}>
              <Text style={styles.doneBtnText}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <ParentFooter />
    </View>
  );

  return embedded ? (
    <View style={styles.embeddedCard}>{content}</View>
  ) : (
    <SafeAreaView style={styles.safeArea}>{content}</SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#f6f6f7' },
  content: { flex: 1, paddingHorizontal: 16, paddingTop: 0, paddingBottom: 20, backgroundColor: '#FFFFFF' },
  embeddedContent: { flex: 1, paddingHorizontal: 0, paddingTop: 0, paddingBottom: 20 },
  embeddedShell: { flex: 1, backgroundColor: '#FFFFFF' },
  embeddedCard: { marginHorizontal: 0 },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  headerTitleBlock: { flex: 1, alignItems: 'center' },
  title: { fontSize: 24, fontWeight: '800', color: '#111' },
  subtitle: { marginTop: 4, fontSize: 13, color: '#fff', textAlign: 'center' },
  feeGradientSection: {
    marginHorizontal: -16,
    paddingTop: 16,
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  feeGraphSection: { paddingTop: 4 },
  feeGraphTitleRow: {
    flexDirection: 'column',
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  feeGraphTitle: { fontSize: 18, lineHeight: 22, fontWeight: '800', color: '#111' },
  feeGraphSubtitle: { marginTop: 4, fontSize: 12, color: '#666', fontWeight: '600', textAlign: 'left' },
  feeLegendRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  feeLegendItem: { flexDirection: 'row', alignItems: 'center', flex: 1 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', width: '100%' },
  itemContainer: { flex: 1, alignItems: 'center' },
  feeLegendDot: { width: 10, height: 10, borderRadius: 999, marginRight: 6 },
  feeLegendText: { fontSize: 12, color: '#333', fontWeight: '700' },
  feeChartCard: {
    borderRadius: 16,
    paddingVertical: 10,
    paddingHorizontal: 12,
    overflow: 'hidden',
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  feeChartGrid: { flexDirection: 'row', justifyContent: 'space-around', alignItems: 'flex-end', minHeight: 120 },
  feeChartBarTrack: {
    width: '32%',
    height: 100,
    backgroundColor: 'rgba(17,24,39,0.08)',
    borderRadius: 16,
    overflow: 'hidden',
    justifyContent: 'flex-end',
  },
  feeChartItem: { flex: 1, alignItems: 'center', justifyContent: 'flex-end', paddingHorizontal: 8 },
  feeChartValue: { color: '#111', fontSize: 12, fontWeight: '700', marginBottom: 8, textAlign: 'center' },
  feeChartBarFill: { width: '100%', borderTopLeftRadius: 16, borderTopRightRadius: 16, minHeight: 10 },
  feeChartLabel: { color: '#333', fontSize: 13, fontWeight: '700', marginTop: 8 },
  studentDataWrap: { paddingBottom: 8 },
  transactionWrap: { flex: 1 },
  summaryRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8,marginTop:10 },
  summaryGradientCard: {
    flex: 1,
    minHeight: 150,
    borderRadius: 28,
    padding: 16,
    overflow: 'hidden',
    marginBottom: 8,
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 4,
  },
  summaryCardLeft: { marginRight: 8 },
  summaryCardRight: { marginLeft: 8 },
  summaryGradientIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 'auto',
    marginBottom: 14,
  },
  summaryCardContent: {
    flex: 1,
    width: '100%',
    alignItems: 'flex-end',
    justifyContent: 'center',
    paddingTop: 10,
    paddingBottom: 10,
    paddingHorizontal: 2,
  },
  summaryGradientLabel: { fontSize: 12, fontWeight: '700', color: 'rgba(255,255,255,0.86)', textAlign: 'right' },
  summaryGradientValue: { fontSize: 16, fontWeight: '900', color: '#FFFFFF', textAlign: 'right' },
  tableCard: {
    flex: 1,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: '#D0D5DD',
    backgroundColor: '#fff',
    overflow: 'hidden',
  },
  tableHorizontalContent: { flexGrow: 1 },
  tableContent: { flex: 1 },
  tableHeader: { 
    flexDirection: 'row', 
    backgroundColor: '#F2F4F7', 
    borderBottomWidth: 1.5,
    borderBottomColor: '#D0D5DD',
  },
  cellContainer: {
    borderRightWidth: 1,
    borderRightColor: '#E4E7EC',
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 4,
  },
  thCol: { width: 100 },
  thFee: { width: 140, alignItems: 'flex-start', paddingLeft: 8 },
  thInstallmentsCol: { width: 130 },
  th: { fontSize: 11, fontWeight: '800', color: '#344054', textAlign: 'center' },
  tableBody: { paddingBottom: 0 },
  tableRow: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: '#E4E7EC' },
  tdCol: { width: 100 },
  tdFee: { width: 140, alignItems: 'flex-start', paddingLeft: 8 },
  tdInstallmentsCol: { width: 130, justifyContent: 'center', alignItems: 'center' },
  td: { fontSize: 11, color: '#344054', textAlign: 'center', fontWeight: '500' },
  installmentButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0D3F66',
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 20,
    justifyContent: 'center',
  },
  installmentButtonText: { color: '#FFFFFF', fontSize: 10, fontWeight: '700', marginLeft: 4 },
  installmentEmpty: { fontSize: 11, color: '#667085', textAlign: 'center', width: '100%' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20 },
  loadingText: { marginTop: 10, color: '#555' },
  emptyText: { textAlign: 'center', color: '#666', marginTop: 6, padding: 14 },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContainer: {
    width: '95%',
    maxHeight: '80%',
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 5,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
    paddingBottom: 12,
    marginBottom: 16,
  },
  modalTitle: { fontSize: 18, fontWeight: '800', color: '#111827' },
  modalSubtitle: { fontSize: 12, color: '#6B7280', fontWeight: '500', marginTop: 2 },
  closeBtn: { padding: 4 },
  modalScrollContent: { paddingBottom: 12 },
  modalInstallmentCard: {
    backgroundColor: '#F9FAFB',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    padding: 12,
    marginBottom: 10,
  },
  modalCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
    paddingBottom: 6,
    marginBottom: 8,
  },
  modalInstNo: { fontSize: 12, fontWeight: '800', color: '#374151' },
  modalInstDate: { fontSize: 11, fontWeight: '700', color: '#DC2626' },
  modalCardDetailsRow: { flexDirection: 'row', justifyContent: 'space-between' },
  modalMetric: { alignItems: 'center', flex: 1 },
  modalMetricLabel: { fontSize: 10, color: '#6B7280', fontWeight: '600', marginBottom: 2 },
  modalMetricValue: { fontSize: 12, color: '#111827', fontWeight: '700' },
  modalFineRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
    backgroundColor: '#FEF2F2',
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 4,
  },
  modalFineText: { fontSize: 10, color: '#DC2626', fontWeight: '700', marginLeft: 4 },
  doneBtn: {
    backgroundColor: '#111827',
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 12,
  },
  doneBtnText: { color: '#FFFFFF', fontSize: 13, fontWeight: '700' },
});

export default ParentFees;
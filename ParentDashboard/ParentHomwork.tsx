import React, { useContext, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  SafeAreaView,
  StatusBar,
  Modal,
  ActivityIndicator,
  StyleSheet,
  Image,
  Alert,
  RefreshControl,
} from 'react-native';

import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../types';
import AsyncStorage from '@react-native-async-storage/async-storage';
import ParentFooter from './ParentFooter';
import { WebView } from 'react-native-webview';

import axios from 'axios';
import { ErrorContext } from '../ErrorContext';
import { useParentAutoRefresh } from './useParentAutoRefresh';

/* ---------------- INTERNAL COMPONENTS ---------------- */

type HomeworkItem = {
  id?: number | string;
  subject?: string;
  description?: string;
  uploader_name?: string;
  date?: string;
  file_type?: string;
  homework_file?: string | null;
};

type InstituteData = {
  name: string;
  logo: string | null;
  address: string | null;
};

const formatDateKey = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const formatDisplayDate = (date: Date) =>
  date.toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });

const addDays = (date: Date, days: number) => {
  const nextDate = new Date(date);
  nextDate.setDate(nextDate.getDate() + days);
  return nextDate;
};

const formatDayLabel = (date: Date) =>
  date.toLocaleDateString('en-IN', {
    weekday: 'short',
  });

const formatHomeworkDate = (value?: string) => {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
};

const getFileLabel = (mimeType?: string) => {
  const type = String(mimeType || '').toLowerCase();
  if (type.includes('pdf')) return 'PDF';
  if (type.startsWith('image/')) return 'Image';
  if (type.includes('word') || type.includes('document')) return 'Document';
  return 'File';
};

const resolveInstituteLookupName = (value: string) => {
  const trimmed = value.trim();
  const parts = trimmed.split('_').filter(Boolean);

  if (
    parts.length === 2 &&
    parts[0].toLowerCase() === parts[1].toLowerCase()
  ) {
    return parts[0];
  }

  return trimmed;
};

const DESCRIPTION_VIEW_MORE_LENGTH = 120;

const HomeworkTabContent: React.FC<{
  studentData: any;
  refreshKey: number;
  beginRefresh: () => void;
  endRefresh: () => void;
  hasLoadedRef: React.MutableRefObject<boolean>;
}> = ({ studentData, refreshKey, beginRefresh, endRefresh, hasLoadedRef }) => {
  const [homework, setHomework] = useState<HomeworkItem[]>([]);
  const [subjects, setSubjects] = useState<string[]>([]);
  const [selectedSubject, setSelectedSubject] = useState<string>('All');
  const [loading, setLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [previewFile, setPreviewFile] = useState<{
    title: string;
    mimeType: string;
    base64: string;
    fileUrl: string;
  } | null>(null);
  const [expandedDescriptions, setExpandedDescriptions] = useState<Record<string, boolean>>({});
  const [instituteData, setInstituteData] = useState<InstituteData>({
    name: '',
    logo: null,
    address: null,
  });
  const { showError } = useContext(ErrorContext);
  const selectedDateKey = formatDateKey(selectedDate);
  const calendarDates = useMemo(
    () => Array.from({ length: 7 }, (_, index) => addDays(selectedDate, index - 3)),
    [selectedDate]
  );
  const previewSchoolName =
    instituteData.name ||
    String(studentData?.school_name || studentData?.schoolName || studentData?.schoolCode || 'School').trim();

  const openHomeworkFile = (item: HomeworkItem) => {
    console.log('DEBUG: Attempting to open file for item ID:', item.id);

    try {
      if (!item?.homework_file) {
        Alert.alert('No file', 'No document found.');
        return;
      }

      const mimeType = item.file_type || 'application/octet-stream';
      const base64Data = item.homework_file.includes('base64,')
        ? item.homework_file.split(',')[1]
        : item.homework_file;

      setPreviewFile({
        title: item.subject || 'Homework file',
        mimeType,
        base64: base64Data,
        fileUrl: `http://162.215.210.38:3010/api/homework-file?id=${encodeURIComponent(
          String(item.id)
        )}&schoolCode=${encodeURIComponent(String(studentData.schoolCode || ''))}`,
      });
    } catch (e: any) {
      Alert.alert('Error', 'Unable to open this file: ' + (e.message || 'Unknown error'));
    }
  };

  const previewUri = previewFile
    ? `data:${previewFile.mimeType};base64,${previewFile.base64}`
    : '';
  const isPreviewImage = previewFile?.mimeType?.startsWith('image/');
  const canPreviewInWebView = Boolean(
    previewFile?.mimeType &&
      (previewFile.mimeType.toLowerCase().includes('pdf') ||
        previewFile.mimeType.toLowerCase().includes('word') ||
        previewFile.mimeType.toLowerCase().includes('document'))
  );
  const documentViewerUrl = previewFile?.fileUrl
    ? `https://docs.google.com/gview?embedded=true&url=${encodeURIComponent(previewFile.fileUrl)}`
    : '';

  useEffect(() => {
    const fetchHomework = async () => {
      try {
        if (!hasLoadedRef.current) setLoading(true);
        beginRefresh();
        if (!studentData?.class_name || !studentData?.section || !studentData?.schoolCode) {
          return;
        }
        const res = await axios.get(
          `http://162.215.210.38:3010/api/homework-lists?class_name=${encodeURIComponent(studentData.class_name)}&section=${encodeURIComponent(studentData.section)}&schoolCode=${encodeURIComponent(studentData.schoolCode)}&username=${encodeURIComponent(studentData.username || '')}&date=${encodeURIComponent(selectedDateKey)}`
        );

        const homeworkData: HomeworkItem[] = res.data || [];
        setHomework(homeworkData);

        const uniqueSubjects: string[] = Array.from(
          new Set(homeworkData.map((item: any) => item.subject).filter(Boolean))
        );
        setSubjects(uniqueSubjects);
      } catch (error) {
        console.error('Homework fetch error:', error);
        showError('Homework Error', 'Unable to load homework. Please try again.');
      } finally {
        setLoading(false);
        endRefresh();
      }
    };
    fetchHomework();
  }, [studentData, selectedDateKey, showError, refreshKey, beginRefresh, endRefresh, hasLoadedRef]);

  useEffect(() => {
    let active = true;

    const fetchInstituteData = async () => {
      console.log('[ParentHomework] institute source values:', {
        school_name: studentData?.school_name || null,
        schoolName: studentData?.schoolName || null,
        schoolCode: studentData?.schoolCode || null,
      });

      const schoolName = String(
        studentData?.school_name ||
          studentData?.schoolName ||
          studentData?.schoolCode ||
          ''
      ).trim();
      const instituteLookupName = resolveInstituteLookupName(schoolName);

      if (!schoolName) {
        setInstituteData({ name: '', logo: null, address: null });
        return;
      }

      try {
        console.log('[ParentHomework] fetching institute data:', {
          url: 'http://162.215.210.38:3010/api/institutedatamobile',
          schoolName,
          instituteLookupName,
        });

        const res = await axios.get('http://162.215.210.38:3010/api/institutedatamobile', {
          params: { schoolName: instituteLookupName },
        });

        if (!active) return;

        console.log('[ParentHomework] institute data response:', {
          success: res.data?.success,
          institute_name: res.data?.institute_name,
          hasLogo: Boolean(res.data?.logo),
          hasAddress: Boolean(res.data?.address),
          address: res.data?.address || null,
        });

        setInstituteData({
          name: String(res.data?.institute_name || schoolName),
          logo: res.data?.logo || null,
          address: res.data?.address || null,
        });
      } catch (error) {
        console.error('[ParentHomework] institute data fetch error:', {
          schoolName,
          instituteLookupName,
          message: (error as any)?.message,
          status: (error as any)?.response?.status,
          data: (error as any)?.response?.data,
        });
        if (active) {
          setInstituteData({ name: schoolName, logo: null, address: null });
        }
      }
    };

    fetchInstituteData();

    return () => {
      active = false;
    };
  }, [studentData?.school_name, studentData?.schoolName, studentData?.schoolCode, refreshKey]);

  const filteredHomework = selectedSubject === 'All'
    ? homework
    : homework.filter((item: any) => item.subject === selectedSubject);

  const toggleDescription = (key: string) => {
    setExpandedDescriptions(prev => ({
      ...prev,
      [key]: !prev[key],
    }));
  };
const injectWhiteBackground = `
  (function() {
    const style = document.createElement('style');
    style.type = 'text/css';
    style.innerHTML = '* { background-color: #ffffff !important; background: #ffffff !important; }';
    document.head.appendChild(style);
  })();
  true;
`;
  return (
    <View style={customStyles.screenContent}>
      <View style={customStyles.headerCard}>
        <View>
          <Text style={customStyles.headerEyebrow}>Homework</Text>
          <Text style={customStyles.headerTitle}>{formatDisplayDate(selectedDate)}</Text>
        </View>
      </View>

      <View style={customStyles.calendarStrip}>
        {calendarDates.map(date => {
          const dateKey = formatDateKey(date);
          const isSelected = dateKey === selectedDateKey;

          return (
            <TouchableOpacity
              key={dateKey}
              style={[
                customStyles.calendarDay,
                isSelected && customStyles.calendarDayActive,
              ]}
              onPress={() => {
                setSelectedDate(date);
                setSelectedSubject('All');
              }}
              activeOpacity={0.85}
            >
              <Text
                style={[
                  customStyles.calendarWeekday,
                  isSelected && customStyles.calendarWeekdayActive,
                ]}
              >
                {formatDayLabel(date)}
              </Text>
              <Text
                style={[
                  customStyles.calendarDateText,
                  isSelected && customStyles.calendarDateTextActive,
                ]}
              >
                {date.getDate()}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={customStyles.filterScroll}
        contentContainerStyle={customStyles.filterScrollContent}
      >
        <TouchableOpacity
          style={[
            customStyles.filterPill,
            selectedSubject === 'All' && customStyles.activeFilterPill
          ]}
          onPress={() => setSelectedSubject('All')}
        >
          <Text style={[
            customStyles.filterPillText,
            selectedSubject === 'All' && customStyles.activeFilterPillText
          ]}>All</Text>
        </TouchableOpacity>

        {subjects.map((subject, idx) => (
          <TouchableOpacity
            key={`${subject}-${idx}`}
            style={[
              customStyles.filterPill,
              selectedSubject === subject && customStyles.activeFilterPill
            ]}
            onPress={() => setSelectedSubject(subject)}
          >
            <Text style={[
              customStyles.filterPillText,
              selectedSubject === subject && customStyles.activeFilterPillText
            ]}>
              {subject}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {loading ? (
        <View style={customStyles.loadingBlock}>
          <ActivityIndicator size="small" color="#4C45F5" />
          <Text style={customStyles.loadingText}>Loading homework...</Text>
        </View>
      ) : filteredHomework.length === 0 ? (
        <View style={customStyles.emptyCard}>
          <Text style={customStyles.emptyTitle}>No homework found</Text>
          <Text style={customStyles.emptyText}>
            There is no homework for {selectedSubject === 'All' ? 'this date' : selectedSubject}.
          </Text>
        </View>
      ) : (
        <View style={customStyles.cardList}>
          {filteredHomework.map((item: HomeworkItem, index: number) => {
            const hasFile = Boolean(item.homework_file);
            const isImage = Boolean(item.file_type?.startsWith('image/') && item.homework_file);
            const itemKey = `${item.id || index}`;
            const description = String(item.description || '').trim();
            const canExpandDescription = description.length > DESCRIPTION_VIEW_MORE_LENGTH;
            const isDescriptionExpanded = Boolean(expandedDescriptions[itemKey]);

            return (
              <View key={itemKey} style={customStyles.homeworkCard}>
                <View style={customStyles.cardTopRow}>
                  <View style={customStyles.subjectBadge}>
                    <Text style={customStyles.subjectBadgeText} numberOfLines={1}>
                      {item.subject || 'General'}
                    </Text>
                  </View>
                  <Text style={customStyles.cardDate}>{formatHomeworkDate(item.date)}</Text>
                </View>

                {description ? (
                  <>
                    <Text
                      style={customStyles.descriptionText}
                      numberOfLines={isDescriptionExpanded ? undefined : 3}
                    >
                      {description}
                    </Text>
                    {canExpandDescription ? (
                      <TouchableOpacity
                        style={customStyles.viewMoreButton}
                        onPress={() => toggleDescription(itemKey)}
                        activeOpacity={0.8}
                      >
                        <Text style={customStyles.viewMoreText}>
                          {isDescriptionExpanded ? 'View less' : 'View more'}
                        </Text>
                      </TouchableOpacity>
                    ) : null}
                  </>
                ) : (
                  <Text style={customStyles.descriptionMuted}>   .</Text>
                )}

                <Text style={customStyles.bylineText}>
                  By: {item.uploader_name || 'Teacher'}
                </Text>

                {isImage ? (
                  <Image
                    source={{ uri: `data:${item.file_type};base64,${item.homework_file}` }}
                    style={customStyles.cardImage}
                    resizeMode="cover"
                  />
                ) : hasFile ? (
                  <View style={customStyles.fileRow}>
                    <View style={customStyles.fileIcon}>
                      <Text style={customStyles.fileIconText}>{getFileLabel(item.file_type).slice(0, 3)}</Text>
                    </View>
                    <View style={customStyles.fileTextWrap}>
                      <Text style={customStyles.fileTitle}>{getFileLabel(item.file_type)} attached</Text>
                      <Text style={customStyles.fileSubtitle}>Tap to preview inside the app</Text>
                    </View>
                  </View>
                ) : (
                  <View style={customStyles.noFileRow}>
                    <Text style={customStyles.noFileText}>No document attached</Text>
                  </View>
                )}

                {hasFile ? (
                  <TouchableOpacity
                    style={customStyles.openButton}
                    onPress={() => openHomeworkFile(item)}
                    activeOpacity={0.88}
                  >
                    <Text style={customStyles.openButtonText}>Open File</Text>
                  </TouchableOpacity>
                ) : null}
              </View>
            );
          })}
        </View>
      )}

      <Modal
        visible={Boolean(previewFile)}
        animationType="slide"
        onRequestClose={() => setPreviewFile(null)}
      >
        <SafeAreaView style={customStyles.previewScreen}>
          <View style={customStyles.documentHeader}>
            <View style={customStyles.documentBrandRow}>
              {instituteData.logo ? (
                <Image
                  source={{ uri: instituteData.logo }}
                  style={customStyles.documentLogo}
                  resizeMode="contain"
                />
              ) : (
                <View style={customStyles.documentLogoFallback}>
                  <Text style={customStyles.documentLogoFallbackText}>
                    {previewSchoolName.slice(0, 1).toUpperCase()}
                  </Text>
                </View>
              )}
              <View style={customStyles.documentTitleWrap}>
                <Text style={customStyles.documentSchoolName} numberOfLines={1}>
                  {previewSchoolName}
                </Text>
                <Text style={customStyles.previewTitle} numberOfLines={1}>
                  {previewFile?.title || 'Homework file'}
                </Text>
              </View>
            </View>
            <TouchableOpacity
              style={customStyles.previewCloseButton}
              onPress={() => setPreviewFile(null)}
            >
              <Text style={customStyles.previewCloseText}>Close</Text>
            </TouchableOpacity>
          </View>

          {isPreviewImage ? (
            <ScrollView
              style={customStyles.previewBody}
              contentContainerStyle={customStyles.imagePreviewContent}
              maximumZoomScale={4}
              minimumZoomScale={1}
            >
              <Image source={{ uri: previewUri }} style={customStyles.previewImage} resizeMode="contain" />
            </ScrollView>
     ) : canPreviewInWebView ? (
            <WebView
              originWhitelist={['*']}
              source={{ uri: documentViewerUrl }}
              style={customStyles.previewWebView}
              startInLoadingState
              injectedJavaScript={injectWhiteBackground} // <--- ADD THIS LINE
              renderLoading={() => (
                <ActivityIndicator size="large" color="#4C45F5" style={customStyles.previewLoader} />
              )}
            />
          ) : (
            <View style={customStyles.unsupportedPreview}>
              <Text style={customStyles.unsupportedTitle}>Preview unavailable</Text>
              <Text style={customStyles.unsupportedText}>
                This file type cannot be previewed inside the app yet.
              </Text>
              <Text style={customStyles.unsupportedMime}>{previewFile?.mimeType}</Text>
            </View>
          )}

          <View style={customStyles.documentFooter}>
            <Text style={customStyles.documentFooterText} numberOfLines={2}>
              {instituteData.address || previewSchoolName}
            </Text>
          </View>
        </SafeAreaView>
      </Modal>
    </View>
  );
};

/* ---------------- MAIN SCREEN ---------------- */

const ParentHomework: React.FC<
  NativeStackScreenProps<RootStackParamList, 'ParentHomework'> & { embedded?: boolean }
> = ({ embedded = false }) => {
  const [studentData, setStudentData] = useState<any>(null);
  const { refreshKey, refreshing, onRefresh, beginRefresh, endRefresh, hasLoadedRef } = useParentAutoRefresh();
  const { showError } = useContext(ErrorContext);

  useEffect(() => {
    const loadStudent = async () => {
      try {
        const keys = ['studentId', 'name', 'class_name', 'section', 'schoolCode', 'username', 'school_name'];
        const stores = await AsyncStorage.multiGet(keys);
        const data: any = {};
        stores.forEach(([k, v]) => { if (v) data[k] = v; });

        const required = ['studentId', 'name', 'class_name', 'section', 'schoolCode'];
        const missing = required.filter(k => !data[k]);
        if (missing.length > 0) {
          showError('Student Data Missing', 'Please select student again in Parent Details.');
          return;
        }
        setStudentData(data);
      } catch (error) {
        console.error('Storage error:', error);
        showError('Storage Error', 'Unable to load saved data. Please restart the app.');
      }
    };
    loadStudent();
  }, [showError]);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#fff' }}>
      <StatusBar barStyle="dark-content" />

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ flexGrow: 1, paddingBottom: 40 }}
        alwaysBounceVertical={true}
        showsVerticalScrollIndicator={true}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor="#0D3F66"
            colors={['#0D3F66']}
          />
        }
      >
        <View style={{ paddingHorizontal: embedded ? 0 : 0, marginTop: embedded ? 0 : 15 }}>
          {studentData ? (
            <HomeworkTabContent
              studentData={studentData}
              refreshKey={refreshKey}
              beginRefresh={beginRefresh}
              endRefresh={endRefresh}
              hasLoadedRef={hasLoadedRef}
            />
          ) : (
            <ActivityIndicator size="large" color="#000" style={{ marginTop: 40 }} />
          )}
        </View>
      </ScrollView>

      <ParentFooter embedded={embedded} />
    </SafeAreaView>
  );
};

export default ParentHomework;

const customStyles = StyleSheet.create({
  screenContent: {
    flex: 1,
    paddingHorizontal: 14,
    paddingTop: 8,
  },
  headerCard: {
    backgroundColor: '#f7fafc',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 8,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerEyebrow: {
    color: '#6b7280',
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  headerTitle: {
    color: '#111827',
    fontSize: 20,
    fontWeight: '800',
    marginTop: 3,
  },
  calendarStrip: {
    marginTop: 10,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 8,
    padding: 6,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  calendarDay: {
    flex: 1,
    minHeight: 56,
    borderRadius: 7,
    alignItems: 'center',
    justifyContent: 'center',
    marginHorizontal: 2,
  },
  calendarDayActive: {
    backgroundColor: '#4C45F5',
  },
  calendarWeekday: {
    color: '#6b7280',
    fontSize: 11,
    fontWeight: '700',
    marginBottom: 4,
  },
  calendarWeekdayActive: {
    color: '#dbeafe',
  },
  calendarDateText: {
    color: '#111827',
    fontSize: 16,
    fontWeight: '800',
  },
  calendarDateTextActive: {
    color: '#ffffff',
  },
  filterScroll: {
    marginTop: 12,
    marginBottom: 8,
  },
  filterScrollContent: {
    paddingRight: 14,
  },
  filterPill: {
    backgroundColor: '#f3f4f6',
    paddingHorizontal: 15,
    paddingVertical: 8,
    borderRadius: 7,
    marginRight: 8,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 36,
  },
  activeFilterPill: {
    backgroundColor: '#4C45F5',
    borderColor: '#4C45F5',
  },
  filterPillText: {
    color: '#4a5568',
    fontWeight: '600',
    fontSize: 13,
  },
  activeFilterPillText: {
    color: '#fff',
  },
  loadingBlock: {
    minHeight: 180,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: {
    color: '#6b7280',
    fontSize: 13,
    marginTop: 8,
  },
  emptyCard: {
    backgroundColor: '#f9fafb',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 8,
    padding: 22,
    minHeight: 160,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
  },
  emptyTitle: {
    color: '#111827',
    fontSize: 17,
    fontWeight: '800',
    marginBottom: 6,
  },
  emptyText: {
    color: '#6b7280',
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
  },
  cardList: {
    paddingTop: 4,
    paddingBottom: 12,
  },
  homeworkCard: {
    backgroundColor: '#ffffff',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    padding: 14,
    marginBottom: 12,
    shadowColor: '#111827',
    shadowOpacity: 0.06,
    shadowOffset: { width: 0, height: 4 },
    shadowRadius: 10,
    elevation: 2,
  },
  cardTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  subjectBadge: {
    maxWidth: '62%',
    backgroundColor: '#eef6fb',
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  subjectBadgeText: {
    color: '#4C45F5',
    fontSize: 13,
    fontWeight: '800',
  },
  cardDate: {
    color: '#6b7280',
    fontSize: 12,
    fontWeight: '700',
  },
  descriptionText: {
    color: '#374151',
    fontSize: 15,
    lineHeight: 21,
  },
  viewMoreButton: {
    alignSelf: 'flex-start',
    marginTop: 6,
  },
  viewMoreText: {
    color: '#4C45F5',
    fontSize: 13,
    fontWeight: '800',
  },
  descriptionMuted: {
    color: '#9ca3af',
    fontSize: 14,
    fontStyle: 'italic',
  },
  bylineText: {
    color: '#9ca3af',
    fontSize: 12,
    fontWeight: '700',
    marginTop: 8,
  },
  cardImage: {
    height: 170,
    width: '100%',
    borderRadius: 8,
    marginTop: 12,
    backgroundColor: '#f3f4f6',
  },
  fileRow: {
    marginTop: 12,
    backgroundColor: '#f9fafb',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    padding: 10,
    flexDirection: 'row',
    alignItems: 'center',
  },
  fileIcon: {
    width: 42,
    height: 42,
    borderRadius: 7,
    backgroundColor: '#4C45F5',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  fileIconText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '900',
  },
  fileTextWrap: {
    flex: 1,
  },
  fileTitle: {
    color: '#111827',
    fontSize: 14,
    fontWeight: '800',
  },
  fileSubtitle: {
    color: '#6b7280',
    fontSize: 12,
    marginTop: 2,
  },
  noFileRow: {
    marginTop: 12,
    backgroundColor: '#fff7ed',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#fed7aa',
    paddingHorizontal: 10,
    paddingVertical: 9,
  },
  noFileText: {
    color: '#9a3412',
    fontSize: 13,
    fontWeight: '700',
  },
  openButton: {
    marginTop: 12,
    backgroundColor: '#4C45F5',
    paddingVertical: 11,
    borderRadius: 7,
    alignItems: 'center',
  },
  openButtonText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '800',
  },
  previewScreen: {
    flex: 1,
    backgroundColor: '#fff',
  },
  documentHeader: {
    minHeight: 72,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  documentBrandRow: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    marginRight: 10,
  },
  documentLogo: {
    width: 46,
    height: 46,
    marginRight: 10,
  },
  documentLogoFallback: {
    width: 46,
    height: 46,
    borderRadius: 8,
    backgroundColor: '#eef6fb',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  previewBody: {
    flex: 1,
    backgroundColor: '#fff', // <-- Changed/Added this
  },
  imagePreviewContent: {
    flexGrow: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 12,
    backgroundColor: '#fff', // <-- Changed/Added this
  },
  documentLogoFallbackText: {
    color: '#4C45F5',
    fontSize: 20,
    fontWeight: '900',
  },
  documentTitleWrap: {
    flex: 1,
  },
  documentSchoolName: {
    color: '#111827',
    fontSize: 16,
    fontWeight: '900',
    marginBottom: 2,
  },
  previewTitle: {
    color: '#6b7280',
    fontSize: 13,
    fontWeight: '700',
  },
  previewCloseButton: {
    backgroundColor: '#4C45F5',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 6,
  },
  previewCloseText: {
    color: '#fff',
    fontWeight: '700',
  },
  previewBody: {
    flex: 1,
  },
  imagePreviewContent: {
    flexGrow: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 12,
  },
  previewImage: {
    width: '100%',
    height: '100%',
  },
  previewWebView: {
    flex: 1,
    backgroundColor: '#fff',
  },
  documentFooter: {
    minHeight: 48,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderTopWidth: 1,
    borderTopColor: '#e5e7eb',
    alignItems: 'center',
    justifyContent: 'center',
  },
  documentFooterText: {
    color: '#4b5563',
    fontSize: 12,
    fontWeight: '700',
    textAlign: 'center',
    lineHeight: 17,
  },
  previewLoader: {
    flex: 1,
    alignSelf: 'center',
  },
  unsupportedPreview: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  unsupportedTitle: {
    color: '#111827',
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 8,
  },
  unsupportedText: {
    color: '#4b5563',
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
  },
  unsupportedMime: {
    color: '#9ca3af',
    fontSize: 12,
    marginTop: 10,
  },
});

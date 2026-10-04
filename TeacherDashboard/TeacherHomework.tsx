import React, { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  Modal,
  SafeAreaView,
  StatusBar,
  Dimensions,
  Alert,
  ActivityIndicator,
  Platform,
  PermissionsAndroid,
  Image,
  Share,
  StyleSheet,
  TextInput,
} from 'react-native';
import axios from 'axios';
import RNFS from 'react-native-fs';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  pick,
  types,
  keepLocalCopy,
  DocumentPickerResponse,
} from '@react-native-documents/picker';
import { launchCamera, launchImageLibrary, Asset } from 'react-native-image-picker';
import LinearGradient from 'react-native-linear-gradient';
import { buildTeacherDayPeriods, useNextClass } from '../NextClassContext';
import TeacherFooter from './TeacherFooter';
import GradientDropdown from './GradientDropdown';
import { globalStyles as styles, attendanceStyles as ui } from '../teacherStyles';
import TeacherSummaryCard from './TeacherSummaryCard';
import ticketIcon from '../icons/application.png';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');
const API_BASE = 'http://162.215.210.38:3010/api';

const requestCameraPermission = async () => {
  if (Platform.OS !== 'android') return true;

  const granted = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.CAMERA);
  return granted === PermissionsAndroid.RESULTS.GRANTED;
};

type RootStackParamList = {
  TeacherHomework: {
    className?: string;
    section?: string;
    name: string;
    username?: string;
    schoolCode?: string;
  };
};

type SectionItem = {
  class_name: string;
  section: string;
};

const normalizeSectionItems = (value: unknown): SectionItem[] => {
  if (Array.isArray(value)) {
    return value.filter(
      (item): item is SectionItem =>
        Boolean(item) &&
        typeof item === 'object' &&
        typeof (item as SectionItem).class_name === 'string' &&
        typeof (item as SectionItem).section === 'string'
    );
  }

  if (value && typeof value === 'object') {
    const maybeWrapped =
      (value as { data?: unknown }).data ??
      (value as { sectionData?: unknown }).sectionData ??
      (value as { sections?: unknown }).sections;
    return normalizeSectionItems(maybeWrapped);
  }

  return [];
};

type UploadableFile = {
  uri: string;
  name: string;
  type: string;
};

type HomeworkItem = {
  id: number;
  class_name: string;
  section: string;
  subject: string;
  description?: string;
  date: string;
  file_type: string;
  homework_file: string | null;
};

const TeacherHomework: React.FC<
  NativeStackScreenProps<RootStackParamList, 'TeacherHomework'>
> = ({ route }) => {
  const { schoolCode: routeSchoolCode } = route.params || {};
  const { nextClass, fullTimetable, refreshNextClass } = useNextClass();

  const [selectedClass, setSelectedClass] = useState('');
  const [selectedSection, setSelectedSection] = useState('');
  const [sectionData, setSectionData] = useState<SectionItem[]>([]);
  const [dropdownLoading, setDropdownLoading] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [schoolCode, setSchoolCode] = useState('');
  const [selectedSubject, setSelectedSubject] = useState('General');
  const [homeworkDescription, setHomeworkDescription] = useState('');
  const [stagedFile, setStagedFile] = useState<UploadableFile | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [lastUploadStatus, setLastUploadStatus] = useState('');
  const [homeworkList, setHomeworkList] = useState<HomeworkItem[]>([]);
  const [listLoading, setListLoading] = useState(false);

  useEffect(() => {
    const fetchClassSection = async () => {
      try {
        console.log('[TeacherHomework] fetchClassSection:start');
        setDropdownLoading(true);
        const storedSchoolCode = await AsyncStorage.getItem('schoolCode');
        const code = storedSchoolCode || routeSchoolCode || '';
        console.log('[TeacherHomework] schoolCode resolved:', code);
        setSchoolCode(code);

        if (!code) {
          Alert.alert('Error', 'School code missing');
          return;
        }

        const sectionRes = await fetch(
          `https://cleezoclass.com:4000/api/admin/sectionFilter?schoolCode=${code}`
        );
        console.log('[TeacherHomework] sectionFilter status:', sectionRes.status);
        const fetchedSectionData = await sectionRes.json();
        const normalizedSectionData = normalizeSectionItems(fetchedSectionData);
        console.log(
          '[TeacherHomework] sectionFilter count:',
          normalizedSectionData.length
        );
        setSectionData(normalizedSectionData);
      } catch (err) {
        console.log('[TeacherHomework] fetchClassSection error:', err);
        Alert.alert('Error', 'Failed to load class and section');
      } finally {
        console.log('[TeacherHomework] fetchClassSection:end');
        setDropdownLoading(false);
      }
    };

    fetchClassSection();
  }, [routeSchoolCode]);

  useEffect(() => {
    if (nextClass?.subject) {
      setSelectedSubject(nextClass.subject);
    }
  }, [nextClass]);

const classSortOrder: Record<string, number> = {
  NURSERY: 0,
  LKG: 1,
  UKG: 2,
  PREP: 3,
  KG: 4,
  '1': 5,
  '2': 6,
  '3': 7,
  '4': 8,
  '5': 9,
  '6': 10,
  '7': 11,
  '8': 12,
  '9': 13,
  '10': 14,
  '11': 15,
  '12': 16,
};

const getSortIndex = (className: string): number => {
  const cleanName = className
    .toUpperCase()
    .replace(/^CLASS\s*|^STD\s*/i, '') // Strips "Class " or "Std " if returned by backend
    .trim();

  return classSortOrder[cleanName] ?? 999;
};

const sortedClassOptions = useMemo(
  () =>
    [...new Set((Array.isArray(sectionData) ? sectionData : []).map(item => item.class_name).filter(Boolean))].sort(
      (a, b) => getSortIndex(a) - getSortIndex(b)
    ),
  [sectionData]
);

  const availableSections = useMemo(
    () =>
      selectedClass
        ? [...new Set(
            (Array.isArray(sectionData) ? sectionData : [])
              .filter(item => item.class_name === selectedClass)
              .map(item => String(item.section || '').trim())
              .filter(Boolean)
          )].sort()
        : [],
    [sectionData, selectedClass]
  );

  const timetableSubjects = useMemo(() => {
    const set = new Set<string>();
    fullTimetable.forEach((day: any) => {
      day.periods?.forEach((period: any) => {
        if (period.subject) set.add(period.subject);
      });
    });
    const list = Array.from(set);
    return list.length ? list : ['General'];
  }, [fullTimetable]);

  const summaryCards = useMemo(
    () => [
      {
        title: 'Homework',
        subtitle:
          selectedClass && selectedSection ? `${selectedClass} - ${selectedSection}` : 'Select class and section',
        footer: `${homeworkList.length} uploaded items`,
        icon: 'document-text-outline',
        background: '#D7E7CD',
      },
      {
        title: nextClass?.class_id || '--',
        subtitle: nextClass?.subject || selectedSubject || 'No class',
        footer: nextClass ? `${nextClass.fromTime} - ${nextClass.toTime}` : 'No timetable available',
        icon: 'time-outline',
        background: '#F0EE96',
      },
    ],
    [homeworkList.length, nextClass, selectedClass, selectedSection, selectedSubject]
  );

  const handleClassChange = (value: string) => {
    console.log('[TeacherHomework] class selected raw:', value);
    setSelectedClass(value);
    setSelectedSection('');
    setHomeworkList([]);
  };

  const handleSectionChange = (value: string) => {
    console.log('[TeacherHomework] section selected raw:', value);
    setSelectedSection(value);
    setHomeworkList([]);
  };

  const fetchUploadedHomework = async () => {
    if (!schoolCode || !selectedClass || !selectedSection) return;

    setListLoading(true);
    try {
      const res = await fetch(
        `http://162.215.210.38:3010/homework-list?schoolCode=${encodeURIComponent(schoolCode)}&class_name=${encodeURIComponent(selectedClass)}&section=${encodeURIComponent(selectedSection)}`
      );
      if (!res.ok) {
        throw new Error(`Failed to fetch uploads (${res.status})`);
      }
      const data: HomeworkItem[] = await res.json();
      const filtered = (Array.isArray(data) ? data : [])
        .filter(item => 
          String(item.class_name).trim() === String(selectedClass).trim() && 
          String(item.section).trim() === String(selectedSection).trim() &&
          String(item.subject).trim().toLowerCase() === String(selectedSubject).trim().toLowerCase()
        )
        .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
      setHomeworkList(filtered);
    } catch (e) {
      console.log('[TeacherHomework] fetchUploadedHomework error:', e);
      setHomeworkList([]);
    } finally {
      setListLoading(false);
    }
  };

  useEffect(() => {
    fetchUploadedHomework();
  }, [selectedClass, selectedSection, schoolCode, selectedSubject]);


  const deleteHomeworkFile = async (item: HomeworkItem) => {
    if (!schoolCode) {
      Alert.alert('Error', 'School code is missing.');
      return;
    }

    Alert.alert(
      'Delete Homework',
      `Are you sure you want to delete the ${item.subject} homework?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              const res = await fetch(
                `http://162.215.210.38:3010/delete-homework?id=${item.id}&schoolCode=${encodeURIComponent(schoolCode)}`,
                { method: 'DELETE' }
              );
              
              const data = await res.json();
              
              if (res.ok) {
                Alert.alert('Deleted', data.message || 'Homework deleted successfully.');
                fetchUploadedHomework();
              } else {
                Alert.alert('Error', data.message || 'Failed to delete homework.');
              }
            } catch (e) {
              console.log('[TeacherHomework] deleteHomeworkFile error:', e);
              Alert.alert('Error', 'An error occurred while connecting to the server.');
            }
          },
        },
      ]
    );
  };

  const shareHomeworkFile = async (item: HomeworkItem) => {
    try {
      if (!item.homework_file) {
        Alert.alert('No file', 'This record has no file data.');
        return;
      }
      const ext = item.file_type?.includes('pdf')
        ? 'pdf'
        : item.file_type?.includes('png')
        ? 'png'
        : item.file_type?.includes('jpeg') || item.file_type?.includes('jpg')
        ? 'jpg'
        : 'bin';
      const filePath = `${RNFS.CachesDirectoryPath}/hw_${item.id}_${Date.now()}.${ext}`;
      await RNFS.writeFile(filePath, item.homework_file, 'base64');
      await Share.share({ url: `file://${filePath}`, message: 'Homework file' });
    } catch (e) {
      console.log('[TeacherHomework] shareHomeworkFile error:', e);
      Alert.alert('Error', 'Unable to open/share this file.');
    }
  };

  const executeUpload = async () => {
    if (!selectedClass || !selectedSection) {
      Alert.alert('Select Class', 'Please select class and section first.');
      return;
    }

    if (!schoolCode) {
      Alert.alert('Missing Data', 'School code is missing. Please login again.');
      return;
    }

    // Must have either a description OR a file to send
    if (!homeworkDescription.trim() && !stagedFile) {
      Alert.alert('Empty Homework', 'Please provide either a description or select a file to send.');
      return;
    }

    setIsUploading(true);
    try {
      const healthRes = await fetch(`${API_BASE}/health`);
      console.log('[TeacherHomework] health status:', healthRes.status);
      if (!healthRes.ok) {
        throw new Error(`Backend unreachable at ${API_BASE} (status ${healthRes.status})`);
      }

      let base64File = null;
      let fileName = null;
      let fileType = null;

      // Only read and attach file if one exists
      if (stagedFile) {
        const finalUri = stagedFile.uri.startsWith('/') ? `file://${stagedFile.uri}` : stagedFile.uri;
        const normalizedPath = finalUri.replace('file://', '');
        base64File = await RNFS.readFile(normalizedPath, 'base64');
        fileName = stagedFile.name;
        fileType = stagedFile.type;
      }

      const base64Response = await axios.post(`${API_BASE}/upload-homework-base64`, {
        class_name: selectedClass,
        section: selectedSection,
        subject: selectedSubject || 'General',
        description: homeworkDescription,
        schoolCode,
        file_name: fileName,
        file_type: fileType,
        file_base64: base64File,
      });

      if (base64Response.status < 200 || base64Response.status >= 300) {
        throw new Error(base64Response.data?.message || 'Upload failed');
      }

      const uploadMessage = base64Response.data?.message || 'Homework uploaded successfully';
      Alert.alert('Success', uploadMessage);
      setLastUploadStatus(stagedFile ? `Sent: ${stagedFile.name}` : 'Sent: Text Homework');
      
      // Clear staged inputs
      setStagedFile(null);
      setHomeworkDescription('');
      fetchUploadedHomework();
    } catch (err: any) {
      console.log('[TeacherHomework] upload error:', err);
      const fallback =
        Platform.OS === 'ios'
          ? 'Could not reach server. Rebuild iOS app after ATS change and retry.'
          : 'Could not reach server. Check internet/server status.';
      Alert.alert('Upload failed', err?.message || fallback);
    } finally {
      setIsUploading(false);
    }
  };

  const pickDocument = async () => {
    try {
      console.log('[TeacherHomework] picker:document open');
      const res = await pick({ type: [types.pdf, types.doc, types.docx] });
      if (!res?.length) return;
      const file = res[0];

      let uploadUri = file.uri;
      try {
        const convertVirtualFileToType =
          file.isVirtual && file.convertibleToMimeTypes?.length
            ? file.convertibleToMimeTypes.find(t => t.mimeType === 'application/pdf')?.mimeType ||
              file.convertibleToMimeTypes[0].mimeType
            : undefined;

        const copied = await keepLocalCopy({
          destination: 'cachesDirectory',
          files: [
            {
              uri: file.uri,
              fileName: file.name || `homework_${Date.now()}.pdf`,
              convertVirtualFileToType,
            },
          ],
        });

        const copyResult = copied?.[0];
        if (copyResult?.status === 'success' && copyResult.localUri) {
          uploadUri = copyResult.localUri;
        }
      } catch (copyErr) {
        console.log('[TeacherHomework] keepLocalCopy error:', copyErr);
      }

      const finalDocUri = uploadUri.startsWith('/') ? `file://${uploadUri}` : uploadUri;
      if (finalDocUri.startsWith('content://com.google.android.apps.docs.storage')) {
        Alert.alert(
          'File Access Error',
          'Google Drive file could not be converted for upload. Please download the file to device storage and try again.'
        );
        return;
      }

      setStagedFile({
        uri: finalDocUri,
        name: file.name || `homework_${Date.now()}.pdf`,
        type: file.type || 'application/pdf',
      });
    } catch (err: any) {
      if (err?.code !== 'DOCUMENT_PICKER_CANCELED') {
        Alert.alert('Error', 'Document selection failed');
      }
    }
  };

  const pickImage = async () => {
    try {
      const result = await launchImageLibrary({
        mediaType: 'photo',
        quality: 1,
        selectionLimit: 1,
      });

      if (result.didCancel) return;
      if (result.errorCode) {
        Alert.alert('Error', result.errorMessage || 'Image selection failed');
        return;
      }

      const asset: Asset | undefined = result.assets?.[0];
      if (!asset?.uri) return;

      setStagedFile({
        uri: asset.uri,
        name: asset.fileName || `homework_${Date.now()}.jpg`,
        type: asset.type || 'image/jpeg',
      });
    } catch {
      Alert.alert('Error', 'Image selection failed');
    }
  };

  const takePhoto = async () => {
    try {
      const hasCameraPermission = await requestCameraPermission();
      if (!hasCameraPermission) {
        Alert.alert('Permission Required', 'Camera permission is required to take a photo.');
        return;
      }

      const result = await launchCamera({
        mediaType: 'photo',
        quality: 1,
        saveToPhotos: false,
      });

      if (result.didCancel) return;
      if (result.errorCode) {
        Alert.alert('Error', result.errorMessage || 'Camera capture failed');
        return;
      }

      const asset: Asset | undefined = result.assets?.[0];
      if (!asset?.uri) return;

      setStagedFile({
        uri: asset.uri,
        name: asset.fileName || `homework_camera_${Date.now()}.jpg`,
        type: asset.type || 'image/jpeg',
      });
    } catch {
      Alert.alert('Error', 'Camera capture failed');
    }
  };

  const openFilePickerOptions = () => {
    Alert.alert('Choose File', 'Select homework document or image', [
      { text: 'Camera', onPress: takePhoto },
      { text: 'Image', onPress: pickImage },
      { text: 'PDF / Document', onPress: pickDocument },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  return (
    <SafeAreaView style={local.safeArea}>
      <StatusBar barStyle="dark-content" />
      <ScrollView style={local.scrollView} contentContainerStyle={local.scrollContent}>
        <View style={local.container}>

          <LinearGradient
            pointerEvents="none"
              colors={['#DCEEFF', '#182B8C', '#0B1052']}
            start={{ x: 0.05, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.dashboardTopGradient}
          >
            <View style={local.summaryRow}>
              {summaryCards.map((card, index) => (
                <TeacherSummaryCard
                  key={`${card.title}-${index}`}
                  style={[
                    index === 0 ? local.summaryCardLeft : local.summaryCardRight,
                    { flex: 1 },
                  ]}
                >
                  <View style={local.summaryText}>
                    <View style={local.summaryTitleRow}>
                      <Text style={local.summaryNumber} numberOfLines={1} ellipsizeMode="tail">
                        {card.title}
                      </Text>
                      <Text style={local.summarySubtitle} numberOfLines={1} ellipsizeMode="tail">
                        {card.subtitle}
                      </Text>
                    </View>
                    <Text style={local.summaryFooter} numberOfLines={2} ellipsizeMode="tail">
                      {card.footer}
                    </Text>
                  </View>
                  <View style={local.summaryIconWrap}>
                    <Ionicons name={card.icon} size={28} color="#4C4C4C" />
                  </View>
                </TeacherSummaryCard>
              ))}
            </View>
          </LinearGradient>

          {dropdownLoading ? (
            <View style={local.loadingBanner}>
              <ActivityIndicator size="small" color="#111827" />
              <Text style={local.loadingBannerText}>Loading class and section...</Text>
            </View>
          ) : null}

          <View style={ui.card}>
            <Text style={ui.cardLabel}>Class and section</Text>
            <View style={local.classSectionRow}>
              <View style={[styles.dropdownContainer, local.flexDropdown]}>
                <GradientDropdown
                  label="Select Class"
                  value={selectedClass}
                  options={sortedClassOptions}
                  onValueChange={handleClassChange}
                  placeholder="Select Class"
                />
              </View>

              <View style={[styles.dropdownContainer, local.flexDropdown]}>
                <GradientDropdown
                  label="Select Section"
                  value={selectedSection}
                  options={availableSections}
                  onValueChange={handleSectionChange}
                  placeholder={selectedClass ? 'Select Section' : 'Select Class First'}
                  disabled={!selectedClass}
                />
              </View>
            </View>
          </View>

       <View style={ui.card}>
  <Text style={ui.cardLabel}>Upload tools</Text>
  
  {/* Choose Topic Trigger */}
  <TouchableOpacity
    style={[ui.secondaryButton, { marginBottom: 12 }]}
    onPress={() => {
      Alert.alert(
        'Choose Topic',
        'Pick homework subject',
        timetableSubjects.map(topic => ({
          text: topic,
          onPress: () => setSelectedSubject(topic),
        }))
      );
    }}
  >
    <Text style={ui.secondaryButtonText}>Topic: {selectedSubject}</Text>
  </TouchableOpacity>

  {/* Description Text Input */}
  <Text style={[ui.cardLabel, { fontSize: 13, marginTop: 4, marginBottom: 6 }]}>Description (Optional)</Text>
  <TextInput
    style={local.textArea}
    placeholder="Enter homework instruction/description..."
    placeholderTextColor="#9CA3AF"
    multiline
    numberOfLines={4}
    value={homeworkDescription}
    onChangeText={setHomeworkDescription}
  />

  {/* Side-by-side Buttons Row */}
  <View style={local.buttonRow}>
    {/* Select File Button */}
    <TouchableOpacity
      style={[styles.messageBtnTall, local.actionButton]}
      onPress={openFilePickerOptions}
      disabled={isUploading}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
        <Text style={ui.primaryButtonText}>
          {stagedFile ? 'Change File' : 'Choose File'}
        </Text>
      </View>
    </TouchableOpacity>

    {/* Send Homework Button */}
    <TouchableOpacity
      style={[
        local.sendButton,
        local.actionButton,
        { opacity: (stagedFile || homeworkDescription.trim()) ? 1 : 0.6 }
      ]}
      onPress={executeUpload}
      disabled={isUploading || (!stagedFile && !homeworkDescription.trim())}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
        {isUploading ? (
          <ActivityIndicator color="#000" size="small" />
        ) : (
          <Image source={ticketIcon} style={[styles.iconImage1, { tintColor: '#0a3d62' }]} />
        )}
        <Text style={local.sendButtonText}>
          {isUploading ? 'Sending...' : 'Send Homework'}
        </Text>
      </View>
    </TouchableOpacity>
  </View>

  {/* File Preview Display */}
  {stagedFile ? (
    <View style={local.selectedFileBadge}>
      <Ionicons name="document-attach-outline" size={18} color="#1E3A8A" />
      <Text style={local.selectedFileText} numberOfLines={1}>{stagedFile.name}</Text>
      <TouchableOpacity onPress={() => setStagedFile(null)}>
        <Ionicons name="close-circle" size={18} color="#f5b6b6ff" />
      </TouchableOpacity>
    </View>
  ) : null}

  <Text style={local.statusText}>{lastUploadStatus || 'No file uploaded yet'}</Text>
</View>

          <View style={ui.card}>
            <View style={local.listHeaderRow}>
              <Text style={ui.cardLabel}>Uploaded files</Text>
              <Text style={local.listCount}>{homeworkList.length} items</Text>
            </View>
            <View style={local.listBox}>
              <ScrollView contentContainerStyle={styles.gridScrollContent} nestedScrollEnabled>
                {listLoading ? (
                  <ActivityIndicator size="small" color="#333" />
                ) : homeworkList.length === 0 ? (
                  <Text style={local.emptyText}>No uploaded documents yet</Text>
                ) : (
                  homeworkList.map(item => (
                    <View key={item.id} style={local.fileCard}>
                      {/* Header with Title and Delete Bin */}
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                        <View style={{ flex: 1, paddingRight: 8 }}>
                          <Text style={local.fileTitle}>
                            {item.subject || 'Homework'} {item.homework_file ? `- ${item.file_type?.includes('image') ? 'Image' : 'Document'}` : ''}
                          </Text>
                        </View>
                        <TouchableOpacity 
                          style={{ padding: 6 }} 
                          onPress={() => deleteHomeworkFile(item)}
                        >
                          <Ionicons name="trash-outline" size={20} color="#DC2626" />
                        </TouchableOpacity>
                      </View>

                      {item.description ? (
                        <Text style={local.fileDescription}>{item.description}</Text>
                      ) : null}

                      <Text style={local.fileMeta}>
                        {item.class_name}-{item.section} | {new Date(item.date).toLocaleString()}
                      </Text>

                      {item.file_type?.startsWith('image/') && item.homework_file ? (
                        <Image
                          source={{ uri: `data:${item.file_type};base64,${item.homework_file}` }}
                          style={local.previewImage}
                          resizeMode="cover"
                        />
                      ) : null}

                      {/* Actions Row (Only show Open/Share if a file actually exists) */}
                      {item.homework_file ? (
                        <View style={{ flexDirection: 'row', gap: 10, marginTop: 10 }}>
                          <TouchableOpacity 
                            style={[local.shareButton, { flex: 1, marginTop: 0 }]} 
                            onPress={() => shareHomeworkFile(item)}
                          >
                            <Text style={local.shareButtonText}>Open</Text>
                          </TouchableOpacity>
                        </View>
                      ) : null}
                    </View>
                  ))
                )}
              </ScrollView>
            </View>
          </View>
        </View>
      </ScrollView>

      <Modal visible={showModal} transparent animationType="slide">
        <View style={{ flex: 1, backgroundColor: '#000000aa', justifyContent: 'center' }}>
          <View style={{ backgroundColor: '#fff', margin: 20, padding: 20, borderRadius: 10, maxHeight: '80%' }}>
            <ScrollView>
              {buildTeacherDayPeriods(fullTimetable).length === 0 ? (
                <Text>No timetable available</Text>
              ) : (
                buildTeacherDayPeriods(fullTimetable).map((day: any, index: number) => (
                  <View key={index} style={{ marginBottom: 15 }}>
                    <Text style={{ fontWeight: 'bold', fontSize: 16 }}>{day.day}</Text>
                    {day.periods.map((p: any, idx: number) => (
                      <Text key={idx}>
                        {p.fromTime.slice(0, 5)} - {p.toTime.slice(0, 5)} : {p.subject} ({p.class_id})
                      </Text>
                    ))}
                  </View>
                ))
              )}
            </ScrollView>

            <TouchableOpacity onPress={() => setShowModal(false)} style={{ marginTop: 10 }}>
              <Text style={{ color: 'blue', fontWeight: 'bold' }}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <TeacherFooter />
    </SafeAreaView>
  );
};

const local = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#F4F6F8',
  },
  scrollView: {
    flex: 1,
    backgroundColor: '#F4F6F8',
  },
  scrollContent: {
    padding: 1,
    paddingBottom: 130,

  },
  container: {
    padding: 0,
    marginTop: Platform.OS === 'ios' ? 0 : 0,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 40,
    marginBottom: 4,
  },
  loadingBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    alignSelf: 'flex-start',
    backgroundColor: '#FFFFFF',
    borderRadius: 999,
    paddingHorizontal: 0,
    paddingVertical: 0,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  loadingBannerText: {
    color: '#111827',
    fontSize: 12,
    fontWeight: '600',
  },
  summaryCardLeft: {
    marginRight: 4,
  },
  summaryCardRight: {
    marginLeft: 4,
  },
  summaryText: {
    flex: 1,
    paddingRight: 8,
  },
  summaryTitleRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    flexWrap: 'wrap',
  },
  summaryNumber: {
    fontSize: 18,
    fontWeight: '900',
    color: '#111111',
    marginRight: 4,
  },
  summarySubtitle: {
    fontSize: 12.5,
    fontWeight: '500',
    color: '#252525',
    lineHeight: 18,
  },
  summaryFooter: {
    marginTop: 20,
    fontSize: 12.5,
    fontWeight: '500',
    color: '#2B2B2B',
  },
  summaryIconWrap: {
    width: 34,
    alignItems: 'flex-end',
    justifyContent: 'center',
    paddingTop: 2,
  },
  statusText: {
    marginTop: 10,
    color: '#1F7A1F',
    fontWeight: '600',
    textAlign: 'center',
  },
  listHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  listCount: {
    color: '#6B7280',
    fontSize: 12,
  },
  listBox: {
    minHeight: 220,
  },
  emptyText: {
    color: '#6B7280',
    textAlign: 'center',
    paddingVertical: 24,
  },
  fileCard: {
    backgroundColor: '#FAFAFB',
    borderWidth: 1,
    borderColor: '#DDE3EA',
    borderRadius: 18,
    padding: 12,
    marginBottom: 10,
    width:'95%',
  },
  fileTitle: {
    color: '#111827',
    fontWeight: '700',
    fontSize: 15,
  },
  fileDescription: {
    color: '#374151',
    fontSize: 13,
    marginTop: 4,
    fontStyle: 'italic',
  },
  fileMeta: {
    color: '#6B7280',
    marginTop: 4,
    fontSize: 12,
  },
  previewImage: {
    height: 120,
    borderRadius: 12,
    marginTop: 10,
  },
  shareButton: {
    marginTop: 10,
    backgroundColor: '#4C45F5',
    borderRadius: 14,
    paddingVertical: 10,
    alignItems: 'center',
  },
  shareButtonText: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  classSectionRow: {
    flexDirection: 'row',
    gap: 10,
  },
  flexDropdown: {
    flex: 1,
    width: 'auto',
  },
  textArea: {
    backgroundColor: '#F9FAFB',
    borderColor: '#D1D5DB',
    borderWidth: 1,
    borderRadius: 12,
    padding: 10,
    color: '#111827',
    fontSize: 14,
    textAlignVertical: 'top',
    marginBottom: 12,
  },
  selectedFileBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#EFF6FF',
    borderColor: '#BFDBFE',
    borderWidth: 1,
    borderRadius: 10,
    padding: 8,
    marginTop: 12,
    gap: 8,
  },
  selectedFileText: {
    flex: 1,
    color: '#1E3A8A',
    fontSize: 13,
    fontWeight: '500',
  },
buttonRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 8,
    marginBottom: 8,
  },
  actionButton: {
    flex: 1,
    height: 48, // ensures matching height for both buttons
    justifyContent: 'center',
    marginHorizontal: 0,
    marginTop: 0,
    marginBottom: 0,
  },
  sendButton: {
    backgroundColor: '#f6f6f7',
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    borderColor: '#F06292',
    borderWidth: 2,
    elevation: 2,
  },
  sendButtonText: {
    color: '#000',
    fontWeight: '700',
    fontSize: 14,
  },
});

export default TeacherHomework;

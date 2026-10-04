import React, { useMemo, useState, useContext, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Pressable,
  ScrollView,
  ActionSheetIOS,
  Modal,
  Alert,
  SafeAreaView,
  StatusBar,
  TextInput,
  FlatList,
  ActivityIndicator,
  Image,
  Platform,
} from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Ionicons from 'react-native-vector-icons/Ionicons';
import ticketIcon from '../icons/application.png';
import { ThemeContext } from '../ThemeContext';
import TeacherFooter from './TeacherFooter';
import TeacherSummaryCard from './TeacherSummaryCard';
import GradientDropdown from './GradientDropdown';
import {
  globalStyles as styles,
  behaviorStyles as ui,
  attendanceModalStyles as modalStyles,
} from '../teacherStyles';
import { buildTeacherDayPeriods, useNextClass } from '../NextClassContext';
import { TouchableWithoutFeedback } from 'react-native';
import { TeacherTimetableContext } from '../Modalcontext';
import TeacherTimetableComponent from '../TeacherTimetableComponent';
import LinearGradient from 'react-native-linear-gradient';
/* ---------------- TYPES ---------------- */
interface Student {
  username: string;
  name: string;
  photoUrl?: string;
}

type RootStackParamList = {
  TeacherBehaviour: {
    username?: string;
    schoolCode?: string;
    className?: string;
    section?: string;
  };
};

interface BehaviorSuggestions {
  Positive: string[];
  Negative: string[];
  'Needs Improvement': string[];
}

type BehaviorType = 'Positive' | 'Negative' | 'Needs Improvement' | null;

/* ---------------- COMPONENT ---------------- */
const TeacherBehaviour: React.FC<NativeStackScreenProps<RootStackParamList, 'TeacherBehaviour'>> = ({ route }) => {
  const { themeStyles } = useContext(ThemeContext);
  const placeholderTextColor = '#999';
  const { nextClass } = useNextClass();

  /* ---------------- STATE ---------------- */
  const [showCommentInput, setShowCommentInput] = useState(false);
  const [additionalComment, setAdditionalComment] = useState('');
  const [students, setStudents] = useState<Student[]>([]);
  const [filteredStudents, setFilteredStudents] = useState<Student[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [showTeacherTableModal, setShowTeacherTableModal] = useState(false);
  const [classSelected, setClassSelected] = useState<string>(route.params?.className || '');
  const [sectionSelected, setSectionSelected] = useState<string>(route.params?.section || '');
  const [modalVisible, setModalVisible] = useState<boolean>(false);
  const [selectedStudent, setSelectedStudent] = useState<string>('');
  const [behaviorComment, setBehaviorComment] = useState<BehaviorType>(null);
  const [submittedReports, setSubmittedReports] = useState<string[]>([]);
  const [filteredSuggestions, setFilteredSuggestions] = useState<string[]>([]);
  const [studentSearch, setStudentSearch] = useState('');
  const [classes, setClasses] = useState<string[]>([]);
  const [sections, setSections] = useState<string[]>([]);
  const [sectionData, setSectionData] = useState([]);
  const [dropdownLoading, setDropdownLoading] = useState(false);

  const context = useContext(TeacherTimetableContext);
  const teacherTimetable = context?.teacherTimetable || [];
  const loadingTable = context?.loading || false;

  const behaviorSuggestions: BehaviorSuggestions = {
    Positive: ['Excellent progress', 'Great participation', 'Shows leadership skills', 'Very cooperative'],
    Negative: ['Needs to follow rules', 'Disrupts class', 'Incomplete assignments'],
    'Needs Improvement': ['Needs encouragement', 'Can improve focus', 'Requires extra practice'],
  };

  const summaryCards = useMemo(
    () => [
      {
        title: 'Behaviour',
        subtitle:
          classSelected && sectionSelected ? `${classSelected} - ${sectionSelected}` : 'Select class and section',
        footer: `${filteredStudents.length} students ready`,
        icon: 'person-outline',
        background: '#D7E7CD',
      },
      {
        title: nextClass?.class_id || '--',
        subtitle: nextClass?.subject || 'No class',
        footer: nextClass ? `${nextClass.fromTime} - ${nextClass.toTime}` : 'No timetable available',
        icon: 'time-outline',
        background: '#F0EE96',
      },
    ],
    [classSelected, filteredStudents.length, nextClass, sectionSelected]
  );

  /* ---------------- INIT ---------------- */
  useEffect(() => {
    const loadStoredData = async () => {
      if (!classSelected) {
        const storedClass = await AsyncStorage.getItem('teacherClass');
        if (storedClass) setClassSelected(storedClass);
      }
      if (!sectionSelected) {
        const storedSection = await AsyncStorage.getItem('teacherSection');
        if (storedSection) setSectionSelected(storedSection);
      }
    };
    loadStoredData();
  }, []);

  /* ---------------- FETCH CLASS & SECTION ---------------- */
  useEffect(() => {
    const fetchClassSection = async () => {
      try {
        console.log('Fetching Class & Section...');
        setDropdownLoading(true);

        const schoolCode = await AsyncStorage.getItem('schoolCode');
        if (!schoolCode) {
          console.warn('School code is missing!');
          return;
        }

        // Fetch classes
        const classRes = await fetch(
          `https://cleezoclass.com:4000/api/admin/classes?schoolCode=${schoolCode}`
        );
        const classData = await classRes.json();
        setClasses(classData || []);

        // Fetch sections
        const sectionRes = await fetch(
          `https://cleezoclass.com:4000/api/admin/sectionFilter?schoolCode=${schoolCode}`
        );
        const sectionData = await sectionRes.json();
        setSectionData(sectionData);

        // Extract unique section names
        const uniqueSections = [...new Set(sectionData.map(item => item.section))];
        setSections(uniqueSections);

      } catch (err) {
        console.error('Error fetching class & section:', err);
        Alert.alert('Error', 'Failed to load class & section');
      } finally {
        setDropdownLoading(false);
      }
    };

    fetchClassSection();
  }, []);

const handleStudentIconClick = (student: Student) => {
  setSelectedStudent(student.name);
  setBehaviorComment(null);
  setAdditionalComment('');
  setShowCommentInput(true); // Ensure input space is rendered
  setModalVisible(true);
};

// 1. Add state for category picker modal
const [showCategoryPicker, setShowCategoryPicker] = useState(false);

const showBehaviorCommentActionSheet = (): void => {
  if (Platform.OS === 'ios') {
    ActionSheetIOS.showActionSheetWithOptions(
      {
        options: ['Cancel', 'Positive', 'Negative', 'Needs Improvement'],
        cancelButtonIndex: 0,
      },
      (index: number) => {
        if (index !== 0) {
          const options: BehaviorType[] = ['Positive', 'Negative', 'Needs Improvement'];
          setBehaviorComment(options[index - 1]);
          setShowCommentInput(true);
        }
      }
    );
  } else {
    // Open custom selection modal on Android
    setShowCategoryPicker(true);
  }
};
  const handleCommentChange = (text: string): void => {
    setAdditionalComment(text);
    if (text && behaviorComment) {
      const categorySuggestions = behaviorSuggestions[behaviorComment];
      setFilteredSuggestions(
        categorySuggestions?.filter(s => s.toLowerCase().includes(text.toLowerCase())) || []
      );
    } else {
      setFilteredSuggestions([]);
    }
  };

  const submitReport = async (): Promise<void> => {
    if (!behaviorComment) {
      Alert.alert('Error', 'Select behavior');
      return;
    }

    const student = students.find(s => s.name === selectedStudent);
    if (!student) return;

    const schoolCode = await AsyncStorage.getItem('schoolCode');

    const payload = {
      username: student.username,
      class_name: classSelected,
      section: sectionSelected,
      name: selectedStudent,
      report: behaviorComment,
      comment: additionalComment || "",
      schoolCode: schoolCode,
    };

    try {
      const res = await fetch('http://162.215.210.38:3010/api/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const responseData = await res.json();

      if (res.ok) {
        Alert.alert('Success', 'Report submitted successfully');
        setSubmittedReports(prev => [...prev, student.username]);
        setModalVisible(false);
        setAdditionalComment('');
        setBehaviorComment(null);
      } else {
        Alert.alert('Server Error', JSON.stringify(responseData));
      }
    } catch (error: any) {
      Alert.alert('Connection Failed', error.message);
    }
  };
// 1. Keys normalized to UPPERCASE for case-insensitive matching
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

// 2. Normalization helper that converts to uppercase and strips 'Class' / 'Std' prefixes if present
const normalizeClassName = (item: any): string => {
  const name = String(item?.class_name || item?.class || item?.name || item || '').trim();
  return name;
};

// Helper function to extract key for sorting
const getSortIndex = (className: string): number => {
  // Normalize string to uppercase and clean whitespace
  const cleanName = className
    .toUpperCase()
    .replace(/^CLASS\s*|^STD\s*/i, '') // Removes "Class " or "Std " if returned by backend
    .trim();

  return classSortOrder[cleanName] ?? 999;
};

// 3. Updated dynamic sort
const sortedClassOptions = [...new Set(classes.map(normalizeClassName).filter(Boolean))].sort(
  (a, b) => getSortIndex(a) - getSortIndex(b)
);
const availableSections = classSelected
  ? [...new Set(
      sectionData
        .filter((item: any) => normalizeClassName(item) === classSelected)
        .map((item: any) => String(item?.section || '').trim())
        .filter(Boolean)
    )].sort()
  : [];
  const [showModal, setShowModal] = useState(false);

  const resetBehaviorState = useCallback(() => {
    setStudents([]);
    setFilteredStudents([]);
    setSubmittedReports([]);
    setStudentSearch('');
  }, []);

  const handleClassChange = (value: string) => {
    setClassSelected(value);
    setSectionSelected('');
    resetBehaviorState();
  };

  const handleSectionChange = (value: string) => {
    setSectionSelected(value);
    resetBehaviorState();
  };

  const loadStudents = useCallback(
    async (classArg?: string, sectionArg?: string): Promise<void> => {
      const classToLoad = classArg || classSelected;
      const sectionToLoad = sectionArg || sectionSelected;

      if (!classToLoad || !sectionToLoad) {
        Alert.alert('Error', 'Please select class and section');
        return;
      }

      try {
        setIsLoading(true);
        const schoolCode = await AsyncStorage.getItem('schoolCode');
        const res = await fetch('http://162.215.210.38:3010/api/student', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ className: classToLoad, section: sectionToLoad, schoolCode }),
        });

        const data = await res.json();
        console.log('Behaviour student API response:', data);
        if (data.success && data.students?.length) {
          const sorted = data.students
            .filter((student: Student) => student.name)
            .sort((a: Student, b: Student) => a.name.localeCompare(b.name));
          setStudents(sorted);
          setFilteredStudents(sorted);
        } else {
          Alert.alert('Notice', 'No students found.');
          resetBehaviorState();
        }
      } catch (error) {
        Alert.alert('Error', 'Failed to load students');
      } finally {
        setIsLoading(false);
      }
    },
    [classSelected, sectionSelected, resetBehaviorState]
  );

  useEffect(() => {
    if (classSelected && sectionSelected) {
      loadStudents(classSelected, sectionSelected);
    }
  }, [classSelected, sectionSelected, loadStudents]);

  useEffect(() => {
    const query = studentSearch.trim().toLowerCase();
    if (!query) {
      setFilteredStudents(students);
      return;
    }

    setFilteredStudents(
      students.filter(student =>
        student.name.toLowerCase().includes(query) ||
        student.username.toLowerCase().includes(query)
      )
    );
  }, [studentSearch, students]);
  /* ---------------- UI ---------------- */
  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="dark-content" />
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={ui.page}
        nestedScrollEnabled
      >
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
        <View style={ui.card}>
          <Text style={ui.cardLabel}>Class and Section</Text>
          <View style={ui.classSectionRow}>
            <View style={ui.classSectionField}>
              <Text style={ui.fieldLabel}>Class</Text>
              <View style={ui.attendanceDropdownContainer}>
                <GradientDropdown
                  label="Select Class"
                  value={classSelected}
                  options={sortedClassOptions}
                  onValueChange={handleClassChange}
                  placeholder="Select Class"
                />
              </View>
            </View>

            <View style={ui.classSectionField}>
              <Text style={ui.fieldLabel}>Section</Text>
              <View style={ui.attendanceDropdownContainer}>
                <GradientDropdown
                  label="Select Section"
                  value={sectionSelected}
                  options={availableSections}
                  onValueChange={handleSectionChange}
                  placeholder={classSelected ? 'Select Section' : 'Select Class First'}
                  disabled={!classSelected}
                />
              </View>
            </View>

            <View style={ui.classSectionBadgeWrap}>
              <View style={ui.heroBadge}>
                <Text style={ui.heroBadgeText}>{filteredStudents.length}</Text>
                <Text style={ui.heroBadgeLabel}>Students</Text>
              </View>
            </View>
          </View>
        </View>

        <View style={ui.card}>
          <View style={ui.actionsRow}>
            <TouchableOpacity style={ui.secondaryButton} onPress={loadStudents}>
              <Text style={ui.secondaryButtonText}>Load Students</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.messageBtnTall,
                { marginLeft: 0 },
                (!behaviorComment || isLoading) && { opacity: 0.5 },
              ]}
              onPress={submitReport}
              disabled={!behaviorComment || isLoading}
            >
              {isLoading ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <Image source={ticketIcon} style={[styles.iconImage, { tintColor: '#0a3d62' }]} />
              )}
            </TouchableOpacity>
          </View>

          <View style={ui.searchRow}>
            <Ionicons name="search" size={18} color="#6B7280" />
            <TextInput
              value={studentSearch}
              onChangeText={setStudentSearch}
              placeholder="Search students"
              placeholderTextColor="#9CA3AF"
              style={ui.searchInput}
              returnKeyType="search"
              autoCorrect={false}
              autoCapitalize="none"
            />
            {studentSearch ? (
              <TouchableOpacity onPress={() => setStudentSearch('')}>
                <Ionicons name="close-circle" size={18} color="#6B7280" />
              </TouchableOpacity>
            ) : null}
          </View>

          <View style={ui.gridCard}>
            <FlatList
              data={filteredStudents}
              keyExtractor={(item) => item.username}
              numColumns={3}
              nestedScrollEnabled
              showsVerticalScrollIndicator
              columnWrapperStyle={ui.studentGridRow}
 contentContainerStyle={[
      ui.studentGridContent,
      { paddingBottom: 80 }, // Add padding to ensure last row is visible
    ]}        renderItem={({ item }) => (
                <Pressable
                  style={[
                    ui.studentTile,
                    submittedReports.includes(item.username) ? ui.studentTilePresent : ui.studentTileDefault,
                  ]}
                  onPress={() => handleStudentIconClick(item)}
                >
                  <View style={[ui.studentAvatar, submittedReports.includes(item.username) && ui.studentAvatarPresent]}>
                  
                      <Ionicons name="person-outline" size={22} color="#2B2B2B" />
                    
                  </View>
                  <Text style={ui.studentName}>{item.name}</Text>
                </Pressable>
              )}
            />
          </View>
        </View>
      </ScrollView>

      {/* BEHAVIOR MODAL */}
    {/* BEHAVIOR MODAL */}
{/* 1. STUDENT BEHAVIOR REPORT MODAL */}
      <Modal
        transparent
        visible={modalVisible}
        animationType="fade"
        onRequestClose={() => setModalVisible(false)}
      >
        <TouchableWithoutFeedback onPress={() => setModalVisible(false)}>
          <View style={localModalStyles.overlay}>
            <TouchableWithoutFeedback onPress={(e) => e.stopPropagation()}>
              <View style={localModalStyles.card}>
                {/* Header Row */}
                <View style={localModalStyles.header}>
                  <Text style={localModalStyles.studentTitle}>{selectedStudent}</Text>
                  <TouchableOpacity
                    style={localModalStyles.closeButton}
                    onPress={() => setModalVisible(false)}
                  >
                    <Ionicons name="close" size={20} color="#333" />
                  </TouchableOpacity>
                </View>

                {/* Scrollable Form Body */}
                <ScrollView style={{ width: '100%' }} keyboardShouldPersistTaps="handled">
                  {/* Category Selection Dropdown Trigger */}
                  <TouchableOpacity
                    onPress={showBehaviorCommentActionSheet}
                    style={localModalStyles.dropdownTrigger}
                  >
                    <Text style={{ color: behaviorComment ? '#111' : placeholderTextColor, fontSize: 14 }}>
                      {behaviorComment || "Select Behavior Category"}
                    </Text>
                    <Ionicons name="chevron-down" size={18} color="#666" />
                  </TouchableOpacity>

                  {/* Additional Comment Input */}
                  {showCommentInput && (
                    <View style={{ width: '100%', marginTop: 12 }}>
                      <TextInput
                        style={localModalStyles.textInput}
                        placeholder="Additional comment..."
                        value={additionalComment}
                        onChangeText={handleCommentChange}
                        placeholderTextColor={placeholderTextColor}
                        multiline
                      />

                      {/* Suggestions List */}
                      {filteredSuggestions.map((item, index) => (
                        <TouchableOpacity
                          key={index}
                          style={localModalStyles.suggestionItem}
                          onPress={() => {
                            setAdditionalComment(item);
                            setFilteredSuggestions([]);
                          }}
                        >
                          <Text style={{ color: '#333' }}>{item}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  )}

                  {/* Action Buttons Row */}
                  <View style={localModalStyles.actionsRow}>
                    <TouchableOpacity
                      style={[localModalStyles.button, localModalStyles.cancelBtn]}
                      onPress={() => setModalVisible(false)}
                    >
                      <Text style={localModalStyles.cancelBtnText}>Cancel</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={[
                        localModalStyles.button,
                        localModalStyles.submitBtn,
                        (!behaviorComment || isLoading) && { opacity: 0.5 },
                      ]}
                      onPress={submitReport}
                      disabled={!behaviorComment || isLoading}
                    >
                      {isLoading ? (
                        <ActivityIndicator color="#FFFFFF" size="small" />
                      ) : (
                        <Text style={localModalStyles.submitBtnText}>Submit</Text>
                      )}
                    </TouchableOpacity>
                  </View>
                </ScrollView>
              </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>

      {/* 2. ANDROID CATEGORY PICKER MODAL */}
      <Modal
        visible={showCategoryPicker}
        transparent
        animationType="fade"
        onRequestClose={() => setShowCategoryPicker(false)}
      >
        <TouchableWithoutFeedback onPress={() => setShowCategoryPicker(false)}>
          <View style={localModalStyles.overlay}>
            <TouchableWithoutFeedback onPress={(e) => e.stopPropagation()}>
              <View style={[localModalStyles.card, { padding: 16 }]}>
                <Text style={{ fontSize: 16, fontWeight: 'bold', marginBottom: 16, color: '#111827' }}>
                  Select Behavior
                </Text>

                {(['Positive', 'Negative', 'Needs Improvement'] as BehaviorType[]).map((option) => (
                  <TouchableOpacity
                    key={option}
                    style={{
                      paddingVertical: 12,
                      borderBottomWidth: 1,
                      borderBottomColor: '#F3F4F6',
                    }}
                    onPress={() => {
                      setBehaviorComment(option);
                      setShowCommentInput(true);
                      setShowCategoryPicker(false);
                    }}
                  >
                    <Text style={{ fontSize: 15, color: '#374151' }}>{option}</Text>
                  </TouchableOpacity>
                ))}

                <TouchableOpacity
                  style={{
                    marginTop: 12,
                    paddingVertical: 12,
                    alignItems: 'center',
                    backgroundColor: '#F3F4F6',
                    borderRadius: 8,
                  }}
                  onPress={() => setShowCategoryPicker(false)}
                >
                  <Text style={{ color: '#EF4444', fontWeight: '600' }}>Cancel</Text>
                </TouchableOpacity>
              </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>

      {/* TEACHER TIMETABLE MODAL */}
      <Modal
        visible={showTeacherTableModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowTeacherTableModal(false)}
      >
        <TouchableWithoutFeedback onPress={() => setShowTeacherTableModal(false)}>
          <View style={modalStyles.overlay}>
            <TouchableWithoutFeedback onPress={() => { }}>
              <View style={modalStyles.container}>
                <View style={modalStyles.header}>
                  <Text style={modalStyles.title}>My Timetable</Text>
                  <TouchableOpacity onPress={() => setShowTeacherTableModal(false)}>
                    <Ionicons name="close" size={24} color="#000" />
                  </TouchableOpacity>
                </View>
                <View style={{ flex: 1 }}>
                  {loadingTable ? (
                    <ActivityIndicator color="gray" style={{ marginTop: 20 }} />
                  ) : (
                    <TeacherTimetableComponent data={teacherTimetable} />
                  )}
                </View>
              </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>

      <TeacherFooter />
    </SafeAreaView>
  );
};

export default TeacherBehaviour;

const local = {
  summaryRow: {
    flexDirection: 'row' as const,
    justifyContent: 'space-between' as const,
    marginTop: 60,
    marginBottom: 12,
  },
  summaryCard: {
    flex: 1,
    minHeight: 92,
    borderRadius: 14,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E1E4EA',
    paddingVertical: 14,
    paddingHorizontal: 14,
    flexDirection: 'row' as const,
    justifyContent: 'space-between' as const,
    alignItems: 'flex-start' as const,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
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
    flexDirection: 'row' as const,
    alignItems: 'baseline' as const,
    flexWrap: 'wrap' as const,
  },
  summaryNumber: {
    fontSize: 18,
    fontWeight: '900' as const,
    color: '#111111',
    marginRight: 4,
  },
  summarySubtitle: {
    fontSize: 12.5,
    fontWeight: '500' as const,
    color: '#252525',
    lineHeight: 18,
  },
  summaryFooter: {
    marginTop: 20,
    fontSize: 12.5,
    fontWeight: '500' as const,
    color: '#2B2B2B',
  },
  summaryIconWrap: {
    width: 34,
    alignItems: 'flex-end' as const,
    justifyContent: 'center' as const,
    paddingTop: 2,
  },
};
const localModalStyles = {
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
    paddingHorizontal: 20,
  },
  card: {
    width: '90%',
    maxHeight: '80%',
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 20,
    elevation: 5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
  },
  header: {
    flexDirection: 'row' as const,
    justifyContent: 'space-between' as const,
    alignItems: 'center' as const,
    marginBottom: 16,
  },
  studentTitle: {
    fontSize: 18,
    fontWeight: 'bold' as const,
    color: '#111827',
  },
  closeButton: {
    padding: 4,
  },
  dropdownTrigger: {
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 12,
    flexDirection: 'row' as const,
    justifyContent: 'space-between' as const,
    alignItems: 'center' as const,
    backgroundColor: '#F9FAFB',
  },
  textInput: {
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 8,
    padding: 12,
    minHeight: 80,
    textAlignVertical: 'top' as const,
    fontSize: 14,
    color: '#111827',
    backgroundColor: '#FFFFFF',
  },
  suggestionItem: {
    padding: 10,
    backgroundColor: '#F3F4F6',
    marginTop: 4,
    borderRadius: 6,
  },
  actionsRow: {
    flexDirection: 'row' as const,
    justifyContent: 'space-between' as const,
    gap: 12,
    marginTop: 20,
    paddingBottom: 10, // Ensures space beneath action buttons during scroll
  },
  button: {
    flex: 1,
    height: 44,
    borderRadius: 8,
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
  },
  cancelBtn: {
    backgroundColor: '#E5E7EB',
  },
  cancelBtnText: {
    color: '#374151',
    fontWeight: '600' as const,
  },
  submitBtn: {
    backgroundColor: '#4C45F5',
  },
  submitBtnText: {
    color: '#FFFFFF',
    fontWeight: '600' as const,
  },
};
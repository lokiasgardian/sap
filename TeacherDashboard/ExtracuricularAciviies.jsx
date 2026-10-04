import React, { useMemo, useState, useContext, useEffect, useCallback } from 'react';
import {
    View,
    Text,
    TextInput,
    ScrollView,
    TouchableOpacity,
    Pressable,
    Modal,
    Alert,
    Image,
    SafeAreaView,
    StatusBar,
    FlatList,
    ActivityIndicator,
    Linking,
    PermissionsAndroid,
    Platform,
} from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import Ionicons from 'react-native-vector-icons/Ionicons';
import LinearGradient from 'react-native-linear-gradient';
import { launchCamera, launchImageLibrary } from 'react-native-image-picker';
import { ThemeContext } from '../ThemeContext';
import AsyncStorage from '@react-native-async-storage/async-storage';
import TeacherFooter from './TeacherFooter';
import TeacherSummaryCard from './TeacherSummaryCard';
import GradientDropdown from './GradientDropdown';
import { useNextClass } from '../NextClassContext';
import axios from 'axios';
import RNFS from 'react-native-fs';
import {
    globalStyles as styles,
    behaviorStyles as ui,
} from '../teacherStyles';
import ticketIcon from '../icons/application.png';

const MAX_PROGRAM_NAME_LENGTH = 50;
const API_BASE = 'http://162.215.210.38:3010/api';

const isVideoMedia = (type) => String(type || '').toLowerCase().startsWith('video/');

const formatActivityDate = (value) => {
    if (!value) return '';

    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';

    return date.toLocaleDateString('en-IN', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
    });
};

const requestCameraPermission = async () => {
    if (Platform.OS !== 'android') return true;

    const granted = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.CAMERA);
    return granted === PermissionsAndroid.RESULTS.GRANTED;
};

const classSortOrder = {
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

const SportsYogaInfo = () => {
    const { themeStyles } = useContext(ThemeContext);
    const placeholderTextColor = themeStyles.inputBorderColor;
    const { nextClass } = useNextClass();

    const [studentName, setStudentName] = useState('');
    const [selectedOption, setSelectedOption] = useState('');
    const [showOptions, setShowOptions] = useState(false);
    const [programName, setProgramName] = useState('');
    const [winningEvent, setWinningEvent] = useState('');
    const [winningRank, setWinningRank] = useState('');
    const [winningDate, setWinningDate] = useState(new Date());
    const [showDatePicker, setShowDatePicker] = useState(false);
    const [classLevel, setClassLevel] = useState('');
    const [section, setSection] = useState('');
    const [students, setStudents] = useState([]);
    const [studentSearch, setStudentSearch] = useState('');

    const [isLoading, setIsLoading] = useState(false);

    // Dynamic Class & Section states
    const [classes, setClasses] = useState([]);
    const [sectionData, setSectionData] = useState([]);
    const [dropdownLoading, setDropdownLoading] = useState(false);

    // Media Upload states
    const [selectedMedia, setSelectedMedia] = useState([]);
    const [isUploadingMedia, setIsUploadingMedia] = useState(false);
    const [activityMediaEvents, setActivityMediaEvents] = useState([]);
    const [activityMediaLoading, setActivityMediaLoading] = useState(false);

    useEffect(() => {
        const loadStoredClassSection = async () => {
            try {
                const [storedClass, storedSection] = await Promise.all([
                    AsyncStorage.getItem('teacherClass'),
                    AsyncStorage.getItem('teacherSection'),
                ]);

                if (storedClass) {
                    setClassLevel((current) => current || storedClass);
                }
                if (storedSection) {
                    setSection((current) => current || storedSection);
                }
            } catch (err) {
                console.warn('Error loading stored class & section:', err);
            }
        };

        loadStoredClassSection();
    }, []);

    /* ---------------- FETCH DYNAMIC CLASS & SECTION ---------------- */
    useEffect(() => {
        const fetchClassSection = async () => {
            try {
                setDropdownLoading(true);

                const schoolCode = await AsyncStorage.getItem('schoolCode');
                if (!schoolCode) {
                    console.warn('School code missing');
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
                const fetchedSectionData = await sectionRes.json();
                setSectionData(fetchedSectionData || []);
            } catch (err) {
                console.error('Error fetching class & section:', err);
                Alert.alert('Error', 'Failed to load class & section');
            } finally {
                setDropdownLoading(false);
            }
        };

        fetchClassSection();
    }, []);

    /* ---------------- DYNAMIC DROPDOWN HELPERS ---------------- */
    const normalizeClassName = useCallback((item) => {
        return String(item?.class_name || item?.class || item?.name || item || '').trim();
    }, []);

    const normalizeClassKey = useCallback((item) => {
        return normalizeClassName(item)
            .toUpperCase()
            .replace(/^CLASS\s*|^STD\s*/i, '')
            .trim();
    }, [normalizeClassName]);

    const getSortIndex = useCallback((className) => {
        return classSortOrder[normalizeClassKey(className)] ?? 999;
    }, [normalizeClassKey]);

    const sortedClassOptions = useMemo(() => {
        return [...new Set(classes.map(normalizeClassName).filter(Boolean))].sort(
            (a, b) => getSortIndex(a) - getSortIndex(b)
        );
    }, [classes, getSortIndex, normalizeClassName]);

    const availableSections = useMemo(() => {
        if (!classLevel) return [];
        return [
            ...new Set(
                sectionData
                    .filter((item) => normalizeClassKey(item) === normalizeClassKey(classLevel))
                    .map((item) => String(item?.section || '').trim())
                    .filter(Boolean)
            ),
        ].sort();
    }, [classLevel, normalizeClassKey, sectionData]);

    /* ---------------- HANDLERS ---------------- */
    const handleClassChange = (value) => {
        setClassLevel(value);
        setSection('');
        setStudents([]);
        setStudentSearch('');
        setSelectedMedia([]);
    };

    const handleSectionChange = (value) => {
        setSection(value);
        setStudents([]);
        setStudentSearch('');
        setSelectedMedia([]);
    };

    /* ---------------- MEDIA UPLOAD HANDLERS ---------------- */
    const handleSelectMedia = () => {
        const options = {
            mediaType: 'mixed',
            selectionLimit: 10,
        };

        launchImageLibrary(options, (response) => {
            if (response.didCancel) return;
            if (response.errorCode) {
                Alert.alert('Error', response.errorMessage || 'Failed to pick media.');
                return;
            }
            if (response.assets) {
                setSelectedMedia((prev) => [...prev, ...response.assets]);
            }
        });
    };

    const handleRecordVideo = async () => {
        try {
            const hasPermission = await requestCameraPermission();
            if (!hasPermission) {
                Alert.alert('Permission Required', 'Camera permission is required to record a video.');
                return;
            }

            const response = await launchCamera({
                mediaType: 'video',
                videoQuality: 'medium',
                saveToPhotos: false,
            });

            if (response.didCancel) return;
            if (response.errorCode) {
                Alert.alert('Error', response.errorMessage || 'Failed to record video.');
                return;
            }

            if (response.assets) {
                setSelectedMedia((prev) => [...prev, ...response.assets]);
            }
        } catch (error) {
            Alert.alert('Error', 'Unable to record video.');
        }
    };

    const handleUploadMedia = async () => {
        if (!classLevel || !section) {
            Alert.alert('Error', 'Please select class and section before uploading media.');
            return;
        }

        if (selectedMedia.length === 0) {
            Alert.alert('Error', 'Please select at least one photo or video.');
            return;
        }

        try {
            setIsUploadingMedia(true);

            const [schoolCode, uploaderName] = await Promise.all([
                AsyncStorage.getItem('schoolCode'),
                AsyncStorage.getItem('name'),
            ]);

            if (!schoolCode) {
                Alert.alert('Missing Data', 'School Code not found. Please log in again.');
                setIsUploadingMedia(false);
                return;
            }

            console.log('[ActivityUpload][Teacher] Start', {
                endpoint: `${API_BASE}/upload-activity-media-base64`,
                schoolCode,
                classLevel,
                section,
                uploaderName: uploaderName || 'Teacher',
                selectedMediaCount: selectedMedia.length,
                eventName: programName?.trim() || 'Class Activity Media',
            });

            for (let index = 0; index < selectedMedia.length; index += 1) {
                const media = selectedMedia[index];
                const fileUri = media.uri;

                if (!fileUri) {
                    console.warn('[UploadMedia] Skipping media without uri:', media);
                    continue;
                }

                const mimeType = media.type || 'image/jpeg';
                const fileExtension = mimeType.split('/')[1] || 'jpg';
                const fileName = media.fileName || `activity_${Date.now()}_${index}.${fileExtension}`;
                const normalizedPath = fileUri.replace('file://', '');
                const fileBase64 = await RNFS.readFile(normalizedPath, 'base64');

                const uploadPayload = {
                    eventName: programName?.trim() || 'Class Activity Media',
                    name_of_event: programName?.trim() || 'Class Activity Media',
                    uploadedBy: uploaderName || 'Teacher',
                    uploader_name: uploaderName || 'Teacher',
                    schoolCode,
                    school_code: schoolCode,
                    className: classLevel,
                    class_name: classLevel,
                    section,
                    fileName,
                    file_name: fileName,
                    mimeType,
                    file_type: mimeType,
                    fileBase64,
                    file_base64: fileBase64,
                };

                console.log('[ActivityUpload][Teacher] Payload check', {
                    index: index + 1,
                    schoolCode: uploadPayload.schoolCode,
                    className: uploadPayload.className,
                    section: uploadPayload.section,
                    fileName: uploadPayload.fileName,
                    mimeType: uploadPayload.mimeType,
                    fileBase64Length: fileBase64.length,
                    hasFileBase64: Boolean(fileBase64),
                    bodyKeys: Object.keys(uploadPayload),
                });

                const response = await axios.post(`${API_BASE}/upload-activity-media-base64`, uploadPayload);

                console.log('[ActivityUpload][Teacher] Response', {
                    index: index + 1,
                    status: response.status,
                    data: response.data,
                });

                if (response.status < 200 || response.status >= 300) {
                    throw new Error(response.data?.message || `Upload failed at file ${index + 1}`);
                }
            }

            Alert.alert('Success', 'Activity media uploaded successfully!');
            setSelectedMedia([]);
            fetchActivityMedia();

        } catch (error) {
            console.warn('[ActivityUpload][Teacher] Error', {
                message: error?.message,
                status: error?.response?.status,
                data: error?.response?.data,
                requestUrl: error?.config?.url,
                requestMethod: error?.config?.method,
            });
            Alert.alert('Upload Error', error?.response?.data?.message || error.message || 'An error occurred during upload.');
            setIsUploadingMedia(false);
            return;
        } finally {
            setIsUploadingMedia(false);
        }
    };

    const fetchActivityMedia = useCallback(async () => {
        if (!classLevel || !section) {
            setActivityMediaEvents([]);
            return;
        }

        try {
            setActivityMediaLoading(true);
            const schoolCode = await AsyncStorage.getItem('schoolCode');
            if (!schoolCode) {
                setActivityMediaEvents([]);
                return;
            }

            const response = await axios.get(`${API_BASE}/activity-media`, {
                params: {
                    schoolCode,
                    class_name: classLevel,
                    section,
                },
            });

            setActivityMediaEvents(Array.isArray(response.data) ? response.data : []);
        } catch (error) {
            console.warn('[ActivityMedia][Teacher] Fetch error', error?.response?.data || error?.message);
            setActivityMediaEvents([]);
        } finally {
            setActivityMediaLoading(false);
        }
    }, [classLevel, section]);

    useEffect(() => {
        fetchActivityMedia();
    }, [fetchActivityMedia]);

    const filteredStudents = useMemo(() => {
        const query = studentSearch.trim().toLowerCase();
        if (!query) return students;

        return students.filter((student) => {
            const name = String(student.name || '').toLowerCase();
            const username = String(student.username || '').toLowerCase();
            return name.includes(query) || username.includes(query);
        });
    }, [studentSearch, students]);

    const summaryCards = useMemo(
        () => [
            {
                title: 'Activities',
                subtitle: classLevel && section ? `${classLevel} - ${section}` : 'Select class and section',
                footer: `${filteredStudents.length} students ready`,
                icon: 'trophy-outline',
            },
            {
                title: nextClass?.class_id || '--',
                subtitle: nextClass?.subject || 'No class',
                footer: nextClass ? `${nextClass.fromTime} - ${nextClass.toTime}` : 'No timetable available',
                icon: 'time-outline',
            },
        ],
        [classLevel, filteredStudents.length, nextClass, section]
    );

    const loadStudents = async () => {
        if (classLevel && section) {
            try {
                setIsLoading(true);

                const schoolCode = await AsyncStorage.getItem('schoolCode');
                if (!schoolCode) {
                    Alert.alert('Missing Data', 'School Code not found. Please log in again.');
                    return;
                }

                const response = await fetch(`${API_BASE}/students-behave`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        className: classLevel,
                        section: section,
                        schoolCode,
                    }),
                });

                if (!response.ok) {
                    const errorResult = await response.json();
                    Alert.alert('Error', errorResult.message || 'Failed to fetch students. Please try again.');
                    setIsLoading(false);
                    return;
                }

                const data = await response.json();

                if (data.success && data.students && data.students.length > 0) {
                    const validStudents = data.students.filter((student) => student.name);

                    const sortedData = validStudents.sort((a, b) => {
                        const nameA = a.name ? a.name.toString().toLowerCase() : '';
                        const nameB = b.name ? b.name.toString().toLowerCase() : '';
                        return nameA.localeCompare(nameB);
                    });

                    setStudents(sortedData);
                } else {
                    Alert.alert('Info', 'No students found in this class and section.');
                }
            } catch (error) {
                console.error('Error fetching students:', error);
                Alert.alert('Error', 'Failed to fetch students. Please try again.');
            } finally {
                setIsLoading(false);
            }
        } else {
            Alert.alert('Error', 'Please select both class and section.');
        }
    };

    const openOptions = (selectedStudentName) => {
        setStudentName(selectedStudentName);
        setShowOptions(true);
        setSelectedOption('');
    };

    const handleOptionSelect = (option) => {
        setSelectedOption(option);
    };

    const handleSubmitProgram = async () => {
        if (!studentName || !selectedOption || !programName || !winningRank || !winningDate || !classLevel || !section) {
            Alert.alert('Error', 'Please fill in all required fields.');
            return;
        }

        try {
            const schoolCode = await AsyncStorage.getItem('schoolCode');
            if (!schoolCode) {
                Alert.alert('Missing Data', 'School Code not found. Please log in again.');
                return;
            }

            const requestData = {
                student_name: studentName,
                program_name: selectedOption,
                winning_event: winningEvent || '',
                winning_rank: winningRank,
                winning_date: winningDate.toISOString().split('T')[0],
                class_name: classLevel,
                section: section,
                schoolCode: schoolCode,
            };

            const response = await fetch(`${API_BASE}/submit-sports`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(requestData),
            });

            const responseBody = await response.json();

            if (response.ok) {
                Alert.alert('Success', 'Details saved successfully!');
                setShowOptions(false);
                setProgramName('');
                setWinningEvent('');
                setWinningRank('');
                setWinningDate(new Date());
            } else {
                Alert.alert('Error', responseBody.message || 'Failed to save details. Please try again.');
            }
        } catch (error) {
            console.error('Error submitting form:', error);
            Alert.alert('Error', 'An error occurred while submitting the form.');
        }
    };

    const onDateChange = (event, selectedDate) => {
        const currentDate = selectedDate || winningDate;
        setShowDatePicker(false);
        setWinningDate(currentDate);
    };

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
                                    value={classLevel}
                                    options={sortedClassOptions}
                                    onValueChange={handleClassChange}
                                    placeholder={dropdownLoading ? 'Loading...' : 'Select Class'}
                                />
                            </View>
                        </View>

                        <View style={ui.classSectionField}>
                            <Text style={ui.fieldLabel}>Section</Text>
                            <View style={ui.attendanceDropdownContainer}>
                                <GradientDropdown
                                    label="Select Section"
                                    value={section}
                                    options={availableSections}
                                    onValueChange={handleSectionChange}
                                    placeholder={classLevel ? 'Select Section' : 'Select Class First'}
                                    disabled={!classLevel}
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

                {/* Media Upload Section for Selected Class & Section */}
                {classLevel && section ? (
                    <View style={ui.card}>
                        <Text style={ui.cardLabel}>Class Activity Media</Text>
                        <View style={local.uploadContainer}>
                            <TouchableOpacity style={local.addButton} onPress={handleSelectMedia}>
                                <Ionicons name="add" size={28} color="#FFFFFF" />
                            </TouchableOpacity>
                            <TouchableOpacity style={local.videoButton} onPress={handleRecordVideo}>
                                <Ionicons name="videocam-outline" size={22} color="#FFFFFF" />
                            </TouchableOpacity>
                            <Text style={local.uploadLabel}>
                                {selectedMedia.length > 0
                                    ? `${selectedMedia.length} file(s) selected`
                                    : 'Add Photos or Videos for Class'}
                            </Text>
                        </View>

                        {selectedMedia.length > 0 && (
                            <View style={local.previewContainer}>
                                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                                    {selectedMedia.map((media, index) => (
                                        <View key={index} style={local.mediaPreviewWrap}>
                                            {isVideoMedia(media.type) ? (
                                                <View style={[local.mediaPreview, local.videoPreview]}>
                                                    <Ionicons name="play-circle" size={24} color="#FFF" />
                                                    <Text style={local.videoPreviewText}>Video</Text>
                                                </View>
                                            ) : (
                                                <Image source={{ uri: media.uri }} style={local.mediaPreview} />
                                            )}
                                        </View>
                                    ))}
                                </ScrollView>

                                <TouchableOpacity
                                    style={[ui.secondaryButton, { marginTop: 12 }]}
                                    onPress={handleUploadMedia}
                                    disabled={isUploadingMedia}
                                >
                                    <Text style={ui.secondaryButtonText}>
                                        {isUploadingMedia ? 'Uploading...' : 'Upload Media'}
                                    </Text>
                                </TouchableOpacity>
                            </View>
                        )}
                    </View>
                ) : null}

                {classLevel && section ? (
                    <View style={ui.card}>
                        <View style={local.galleryHeader}>
                            <Text style={ui.cardLabel}>Class Activity Gallery</Text>
                            <TouchableOpacity onPress={fetchActivityMedia} disabled={activityMediaLoading}>
                                <Ionicons name="refresh" size={20} color="#111827" />
                            </TouchableOpacity>
                        </View>

                        {activityMediaLoading ? (
                            
                            <ActivityIndicator color="gray" style={{ marginTop: 14 }} />
                        ) : activityMediaEvents.length === 0 ? (
                            <Text style={local.emptyGalleryText}>No parent or teacher activity media uploaded yet.</Text>
                        ) : (
                           activityMediaEvents.map((event, eventIndex) => {
    // Format createdAt (checks top-level event or photo object fallback)
    const formattedCreatedAt = formatActivityDate(
        event?.createdAt || event?.created_at || event?.photos?.[0]?.createdAt || event?.photos?.[0]?.created_at
    );

    return (
        <View key={`${event?.eventName || 'event'}-${eventIndex}`} style={local.activityEventCard}>
            {/* Header Row: Title on Left, Date on Right */}
            <View style={local.eventHeaderRow}>
                <Text style={local.activityEventName} numberOfLines={1}>
                    {event?.eventName || 'Class Activity Media'}
                </Text>

                {formattedCreatedAt ? (
                    <Text style={local.activityCreatedAtText}>
                        {formattedCreatedAt}
                    </Text>
                ) : null}
            </View>

            <Text style={local.activityEventMeta}>
                {event?.class_name || classLevel} - {event?.section || section}
            </Text>

            <View style={local.activityGrid}>
                {(event?.photos || []).map((media, mediaIndex) => {
                    const mediaUri = media?.url || media;
                    const mediaType = media?.type || media?.mime_type || '';
                    const uploadedBy = media?.uploadedBy || media?.uploaded_by || 'Parent/Teacher';

                    return (
                        <TouchableOpacity
                            key={`${media?.id || mediaUri}-${mediaIndex}`}
                            style={local.activityThumbWrap}
                            activeOpacity={isVideoMedia(mediaType) ? 0.75 : 1}
                            onPress={() => {
                                if (isVideoMedia(mediaType) && mediaUri) {
                                    Linking.openURL(mediaUri).catch(() =>
                                        Alert.alert('Error', 'Unable to open this video.')
                                    );
                                }
                            }}
                        >
                            {isVideoMedia(mediaType) ? (
                                <View style={[local.activityThumb, local.activityVideoThumb]}>
                                    <Ionicons name="play-circle" size={28} color="#FFFFFF" />
                                    <Text style={local.activityVideoText}>Video</Text>
                                </View>
                            ) : (
                                <Image source={{ uri: mediaUri }} style={local.activityThumb} />
                            )}
                            <Text style={local.uploaderText} numberOfLines={1}>
                                By {uploadedBy}
                            </Text>
                        </TouchableOpacity>
                    );
                })}
            </View>
        </View>
    );
})
                        )}
                    </View>
                ) : null}

                <View style={ui.card}>
                    <View style={ui.actionsRow}>
                        <TouchableOpacity style={ui.secondaryButton} onPress={loadStudents} disabled={isLoading}>
                            <Text style={ui.secondaryButtonText}>
                                {isLoading ? 'Loading...' : 'Load Students'}
                            </Text>
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
                        {isLoading ? (
                            <ActivityIndicator color="gray" style={{ marginTop: 20 }} />
                        ) : (
                            <FlatList
                                data={filteredStudents}
                                keyExtractor={(item, index) => String(item.username || item.name || index)}
                                numColumns={3}
                                nestedScrollEnabled
                                showsVerticalScrollIndicator
                                columnWrapperStyle={ui.studentGridRow}
                                contentContainerStyle={[
                                    ui.studentGridContent,
                                    { paddingBottom: 80 },
                                ]}
                                renderItem={({ item }) => (
                                    <Pressable style={ui.studentTile} onPress={() => openOptions(item.name)}>
                                        <View style={ui.studentAvatar}>
                                            <Ionicons name="person-outline" size={22} color="#2B2B2B" />
                                        </View>
                                        <Text style={ui.studentName}>{item.name}</Text>
                                    </Pressable>
                                )}
                            />
                        )}
                    </View>
                </View>
            </ScrollView>

            {/* OPTIONS MODAL WITH JUSTIFIED LAYOUT AND TOP-RIGHT CLOSE BUTTON */}
            {showOptions && (
                <Modal
                    animationType="slide"
                    transparent={true}
                    visible={showOptions}
                    onRequestClose={() => setShowOptions(false)}
                >
                    <View style={local.modalOverlay}>
                        <View style={local.modalCard}>
                            {/* Close Button Top Right */}
                            <TouchableOpacity
                                style={local.closeButtonTopRight}
                                onPress={() => setShowOptions(false)}
                            >
                                <Ionicons name="close" size={20} color="#FFFFFF" />
                            </TouchableOpacity>

                            <ScrollView
                                showsVerticalScrollIndicator={false}
                                contentContainerStyle={local.modalScrollContent}
                            >
                                <Text style={local.modalTitleText}>
                                    Choose an Option for {studentName}
                                </Text>

                                <TouchableOpacity
                                    style={local.modalOptionBtn}
                                    onPress={() => handleOptionSelect('Sports')}
                                >
                                    <Text style={local.modalOptionText}>Sports Activities</Text>
                                </TouchableOpacity>

                                <TouchableOpacity
                                    style={local.modalOptionBtn}
                                    onPress={() => handleOptionSelect('Quiz')}
                                >
                                    <Text style={local.modalOptionText}>Knowledge Competitions</Text>
                                </TouchableOpacity>

                                <TouchableOpacity
                                    style={local.modalOptionBtn}
                                    onPress={() => handleOptionSelect('Cultural Activities')}
                                >
                                    <Text style={local.modalOptionText}>Arts & Culture</Text>
                                </TouchableOpacity>

                                {selectedOption && (
                                    <View style={local.detailsSection}>
                                        <Text style={[local.modalTitleText, { marginTop: 10 }]}>
                                            {selectedOption} Details
                                        </Text>

                                        <TextInput
                                            placeholderTextColor={placeholderTextColor}
                                            style={local.input}
                                            placeholder="Enter Program Name"
                                            maxLength={MAX_PROGRAM_NAME_LENGTH}
                                            value={programName}
                                            onChangeText={setProgramName}
                                        />

                                        <TextInput
                                            placeholderTextColor={placeholderTextColor}
                                            style={local.input}
                                            placeholder="Enter Winning Rank"
                                            value={winningRank}
                                            onChangeText={(text) => {
                                                const numericText = text.replace(/[^0-9]/g, '');
                                                setWinningRank(numericText);
                                            }}
                                            keyboardType="numeric"
                                        />

                                        <TextInput
                                            placeholderTextColor={placeholderTextColor}
                                            style={local.input}
                                            placeholder="Enter Winning Event"
                                            value={winningEvent}
                                            onChangeText={setWinningEvent}
                                        />

                                        <View style={local.datePicker}>
                                            <TouchableOpacity onPress={() => setShowDatePicker(true)}>
                                                <Text style={{ color: '#333' }}>
                                                    Select Winning Date: {winningDate.toLocaleDateString()}
                                                </Text>
                                            </TouchableOpacity>
                                            {showDatePicker && (
                                                <DateTimePicker
                                                    value={winningDate}
                                                    mode="date"
                                                    display="default"
                                                    onChange={onDateChange}
                                                />
                                            )}
                                        </View>

                                        <TouchableOpacity
                                            style={[styles.messageBtnTall, { marginLeft: 0 }]}
                                            onPress={handleSubmitProgram}
                                        >
                                            <Image
                                                source={ticketIcon}
                                                style={[styles.iconImage, { tintColor: '#0a3d62' }]}
                                            />
                                        </TouchableOpacity>
                                    </View>
                                )}
                            </ScrollView>
                        </View>
                    </View>
                </Modal>
            )}
            <TeacherFooter />
        </SafeAreaView>
    );
};

const local = {
    summaryRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginTop: 60,
        marginBottom: 12,
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
    input: {
        height: 40,
        width: '100%',
        borderColor: '#ccc',
        borderWidth: 1,
        borderRadius: 5,
        marginBottom: 10,
        paddingLeft: 10,
        color: 'black',
    },
    datePicker: {
        width: '100%',
        marginBottom: 10,
    },
    detailsSection: {
        width: '100%',
        marginTop: 20,
    },
    submitButton: {
        backgroundColor: 'rgb(160, 180, 182)',
        padding: 10,
        borderRadius: 5,
        alignItems: 'center',
        marginTop: 20,
    },
    submitButtonText: {
        color: '#fff',
        fontSize: 18,
    },
    uploadContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        marginVertical: 10,
    },
    addButton: {
        width: 44,
        height: 44,
        borderRadius: 22,
        backgroundColor: '#4C4C4C',
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: 12,
    },
    videoButton: {
        width: 44,
        height: 44,
        borderRadius: 22,
        backgroundColor: '#111827',
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: 12,
    },
    uploadLabel: {
        flex: 1,
        fontSize: 14,
        color: '#333',
        fontWeight: '500',
    },
    previewContainer: {
        marginTop: 10,
    },
    mediaPreviewWrap: {
        position: 'relative',
        marginRight: 8,
    },
    mediaPreview: {
        width: 60,
        height: 60,
        borderRadius: 6,
    },
    playIcon: {
        position: 'absolute',
        top: 18,
        left: 18,
    },
    videoPreview: {
        backgroundColor: '#111827',
        alignItems: 'center',
        justifyContent: 'center',
    },
    videoPreviewText: {
        color: '#FFFFFF',
        fontSize: 10,
        fontWeight: '700',
        marginTop: 2,
    },
    galleryHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
    },
    emptyGalleryText: {
        color: '#6B7280',
        fontSize: 13,
        fontWeight: '600',
        textAlign: 'center',
        marginTop: 14,
    },
    activityEventCard: {
        marginTop: 12,
        borderRadius: 14,
        borderWidth: 1,
        borderColor: '#E5E7EB',
        backgroundColor: '#FFFFFF',
        padding: 10,
    },
    activityEventName: {
        color: '#111827',
        fontSize: 15,
        fontWeight: '800',
    },
    activityEventMeta: {
        color: '#6B7280',
        fontSize: 12,
        fontWeight: '600',
        marginTop: 2,
        marginBottom: 10,
    },
    activityGrid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 10,
    },
    activityThumbWrap: {
        width: '30%',
        minWidth: 86,
    },
    activityThumb: {
        width: '100%',
        aspectRatio: 1,
        borderRadius: 10,
        backgroundColor: '#E5E7EB',
    },
    activityVideoThumb: {
        backgroundColor: '#111827',
        alignItems: 'center',
        justifyContent: 'center',
    },
    activityVideoText: {
        color: '#FFFFFF',
        fontSize: 11,
        fontWeight: '800',
        marginTop: 3,
    },
    uploaderText: {
        color: '#374151',
        fontSize: 11,
        fontWeight: '700',
        marginTop: 4,
    },
    /* Modal Styles */
    modalOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
        justifyContent: 'center',
        alignItems: 'center',
    },
    modalCard: {
        position: 'relative',
        width: '88%',
        maxHeight: '80%',
        backgroundColor: '#FFFFFF',
        borderRadius: 16,
        paddingHorizontal: 20,
        paddingTop: 45,
        paddingBottom: 20,
        elevation: 5,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.25,
        shadowRadius: 3.84,
    },
    closeButtonTopRight: {
        position: 'absolute',
        top: 12,
        right: 12,
        width: 32,
        height: 32,
        borderRadius: 16,
        backgroundColor: '#FF0000',
        justifyContent: 'center',
        alignItems: 'center',
        zIndex: 10,
    },
    modalScrollContent: {
        flexGrow: 1,
        justifyContent: 'center',
    },
    modalTitleText: {
        fontSize: 16,
        fontWeight: '600',
        color: '#1F2937',
        textAlign: 'center',
        marginBottom: 20,
    },
    modalOptionBtn: {
        width: '100%',
        paddingVertical: 14,
        paddingHorizontal: 16,
        borderWidth: 1,
        borderColor: '#E5E7EB',
        borderRadius: 12,
        backgroundColor: '#FAFAFA',
        marginBottom: 12,
        alignItems: 'center',
        justifyContent: 'center',
    },
    modalOptionText: {
        fontSize: 14,
        color: '#111827',
        fontWeight: '500',
    },
    eventHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
},
activityEventName: {
    color: '#111827',
    fontSize: 15,
    fontWeight: '800',
    flex: 1,           // Shrinks long titles so date remains visible on the right
    marginRight: 8,
},
activityCreatedAtText: {
    color: '#6B7280',
    fontSize: 12,
    fontWeight: '600',
},
};

export default SportsYogaInfo;

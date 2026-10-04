import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  Platform,
  ActivityIndicator,
  KeyboardAvoidingView,
  ScrollView,
  PermissionsAndroid,
  NativeModules,
  SafeAreaView,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import DateTimePickerModal from 'react-native-modal-datetime-picker';
import axios from 'axios';
import RNFS from 'react-native-fs';
import ChiefFooterProfile from './ChiefFooterProfile';

const API_BASE_URL = 'http://162.215.210.38:3010/api';

const formatDate = (date: Date): string => date.toISOString().split('T')[0];

const normalizeFilePath = (uri: string): string => uri.replace(/^file:\/\//, '');

const toFileUri = (path: string): string =>
  path.startsWith('file://') ? path : `file://${path}`;

type RecordedAudio = {
  uri: string;
  name: string;
  type: string;
};

const { AudioRecorder } = NativeModules as {
  AudioRecorder?: {
    startRecording: () => Promise<string>;
    stopRecording: () => Promise<string>;
  };
};

const AnnouncementScreen: React.FC = () => {
  // Form State
  const [schoolCode, setSchoolCode] = useState<string>('');
  const [title, setTitle] = useState<string>('');
  const [category, setCategory] = useState<string>('General');
  const [announcementDate, setAnnouncementDate] = useState<Date>(new Date());
  const [description, setDescription] = useState<string>('');
  const [recordedAudio, setRecordedAudio] = useState<RecordedAudio | null>(null);
  const [isRecording, setIsRecording] = useState<boolean>(false);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [isLoadingSchoolCode, setIsLoadingSchoolCode] = useState<boolean>(true);
  const [showDatePicker, setShowDatePicker] = useState<boolean>(false);

  useEffect(() => {
    const loadSchoolCode = async (): Promise<void> => {
      try {
        const [
          storedSchoolCode,
          storedUserDetails,
          storedCurrentUser,
          storedCurrentChief,
        ] = await Promise.all([
          AsyncStorage.getItem('schoolCode'),
          AsyncStorage.getItem('userDetails'),
          AsyncStorage.getItem('currentUser'),
          AsyncStorage.getItem('currentChief'),
        ]);

        const parseStoredValue = (value: string | null): any => {
          if (!value) return {};
          try {
            return JSON.parse(value);
          } catch {
            return {};
          }
        };

        const userDetails = parseStoredValue(storedUserDetails);
        const currentUser = parseStoredValue(storedCurrentUser);
        const currentChief = parseStoredValue(storedCurrentChief);
        const resolvedSchoolCode = String(
          userDetails.schoolCode ||
            currentUser.schoolCode ||
            currentChief.schoolCode ||
            storedSchoolCode ||
            '',
        ).trim();

        setSchoolCode(resolvedSchoolCode);
      } catch (error) {
        console.error('Load School Code Error:', error);
      } finally {
        setIsLoadingSchoolCode(false);
      }
    };

    loadSchoolCode();
  }, []);

  const requestAudioPermission = async (): Promise<boolean> => {
    if (Platform.OS !== 'android') {
      Alert.alert(
        'Not Supported',
        'Audio recording is only available on Android in this build.',
      );
      return false;
    }

    const result = await PermissionsAndroid.request(
      PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,
      {
        title: 'Microphone Permission',
        message: 'Please allow microphone access to record an announcement.',
        buttonPositive: 'Allow',
        buttonNegative: 'Cancel',
      },
    );

    return result === PermissionsAndroid.RESULTS.GRANTED;
  };

  const getRecordedAudioName = (path: string): string => {
    return path.split('/').pop() || `announcement-audio-${Date.now()}.m4a`;
  };

  const startRecording = async (): Promise<void> => {
    try {
      if (!AudioRecorder) {
        Alert.alert(
          'Recorder Error',
          'Audio recorder is not available. Please rebuild the app.',
        );
        return;
      }

      const hasPermission = await requestAudioPermission();
      if (!hasPermission) {
        Alert.alert(
          'Permission Required',
          'Microphone permission is required to record audio.',
        );
        return;
      }

      await AudioRecorder.startRecording();
      setRecordedAudio(null);
      setIsRecording(true);
    } catch (error) {
      console.error('Start Recording Error:', error);
      Alert.alert(
        'Error',
        'Failed to start audio recording. Please try again.',
      );
    }
  };

  const stopRecording = async (): Promise<void> => {
    try {
      if (!AudioRecorder) {
        Alert.alert(
          'Recorder Error',
          'Audio recorder is not available. Please rebuild the app.',
        );
        return;
      }

      const path = await AudioRecorder.stopRecording();
      const normalizedPath = normalizeFilePath(path);
      const audioExists = await RNFS.exists(normalizedPath);
      const audioStat = audioExists ? await RNFS.stat(normalizedPath) : null;

      if (!audioExists || Number(audioStat?.size || 0) <= 0) {
        Alert.alert(
          'Recording Error',
          'The recorded audio file could not be read. Please record again.',
        );
        return;
      }

      setRecordedAudio({
        uri: toFileUri(normalizedPath),
        name: getRecordedAudioName(path),
        type: 'audio/mp4',
      });
    } catch (error) {
      console.error('Stop Recording Error:', error);
      Alert.alert('Error', 'Failed to save audio recording. Please try again.');
    } finally {
      setIsRecording(false);
    }
  };

  const handleRecordingPress = (): void => {
    if (isRecording) {
      stopRecording();
    } else {
      startRecording();
    }
  };

  const handleDateConfirm = (selectedDate: Date): void => {
    setShowDatePicker(false);
    setAnnouncementDate(selectedDate);
  };

  const handleSubmit = async (): Promise<void> => {
    if (isLoadingSchoolCode) {
      Alert.alert('Please Wait', 'School details are still loading.');
      return;
    }

    if (!schoolCode) {
      Alert.alert(
        'Missing School Details',
        'Please go back and open this page again from the dashboard.',
      );
      return;
    }

    if (!title.trim()) {
      Alert.alert('Validation Error', 'Title is required.');
      return;
    }

    if (isRecording) {
      Alert.alert(
        'Recording in Progress',
        'Please stop the audio recording before submitting.',
      );
      return;
    }

    if (!description.trim() && !recordedAudio) {
      Alert.alert(
        'Validation Error',
        'Please enter a description or record an audio message.',
      );
      return;
    }

    setIsSubmitting(true);

    try {
      const audioPath = recordedAudio
        ? normalizeFilePath(recordedAudio.uri)
        : null;
      const audioBase64 = audioPath ? await RNFS.readFile(audioPath, 'base64') : null;

      const response = await axios.post(`${API_BASE_URL}/announcements`, {
        schoolCode,
        title: title.trim(),
        category,
        announcement_date: formatDate(announcementDate),
        description: description.trim(),
        audioBase64,
        audioFileName: recordedAudio?.name,
        audioMimeType: recordedAudio?.type,
      });

      Alert.alert('Success', 'Announcement created successfully!');

      // Reset form
      setTitle('');
      setCategory('General');
      setDescription('');
      setRecordedAudio(null);
    } catch (error: any) {
      const serverError =
        error.response?.data?.error || error.response?.data?.message;
      Alert.alert(
        'Error',
        serverError || 'Failed to create announcement. Please try again.',
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContainer}
          showsVerticalScrollIndicator={false}
        >
          {/* Header Section */}
          <View style={styles.headerContainer}>
            <Text style={styles.headerTitle}>New Announcement</Text>
            <Text style={styles.headerSubtitle}>
              Broadcast updates to students and faculty
            </Text>
          </View>

          {/* Form Card */}
          <View style={styles.card}>
            {/* Title Input */}
            <View style={styles.inputGroup}>
              <Text style={styles.fieldLabel}>Announcement Title *</Text>
              <TextInput
                style={styles.input}
                placeholder="e.g. Annual Sports Meet 2026"
                placeholderTextColor="#9CA3AF"
                value={title}
                onChangeText={setTitle}
              />
            </View>

            {/* Category and Date Row */}
            <View style={styles.row}>
              <View style={[styles.inputGroup, styles.halfInput]}>
                <Text style={styles.fieldLabel}>Category</Text>
                <TextInput
                  style={styles.input}
                  placeholder="General"
                  placeholderTextColor="#9CA3AF"
                  value={category}
                  onChangeText={setCategory}
                />
              </View>

              <View style={[styles.inputGroup, styles.halfInput]}>
                <Text style={styles.fieldLabel}>Date</Text>
                <TouchableOpacity
                  style={[styles.input, styles.datePickerButton]}
                  onPress={() => setShowDatePicker(true)}
                  activeOpacity={0.7}
                >
                  <Text style={styles.dateText}>
                    {formatDate(announcementDate)}
                  </Text>
                  <Text style={styles.calendarIcon}>📅</Text>
                </TouchableOpacity>
              </View>
            </View>

            <DateTimePickerModal
              isVisible={showDatePicker}
              mode="date"
              date={announcementDate}
              onConfirm={handleDateConfirm}
              onCancel={() => setShowDatePicker(false)}
            />

            {/* Description Input */}
            <View style={styles.inputGroup}>
              <Text style={styles.fieldLabel}>Description</Text>
              <TextInput
                style={[styles.input, styles.textArea]}
                placeholder="Write the full details of your announcement here..."
                placeholderTextColor="#9CA3AF"
                value={description}
                onChangeText={setDescription}
                multiline
                numberOfLines={5}
                textAlignVertical="top"
              />
            </View>

            {/* Audio Recording Section */}
            <View style={styles.audioCard}>
              <View style={styles.audioHeader}>
                <Text style={styles.fieldLabel}>Voice Note</Text>
                {isRecording && (
                  <View style={styles.liveBadge}>
                    <View style={styles.recordingDot} />
                    <Text style={styles.liveBadgeText}>Recording...</Text>
                  </View>
                )}
              </View>

              <TouchableOpacity
                style={[
                  styles.audioButton,
                  isRecording
                    ? styles.recordingActiveButton
                    : recordedAudio
                    ? styles.reRecordButton
                    : styles.recordDefaultButton,
                ]}
                onPress={handleRecordingPress}
                disabled={isSubmitting}
                activeOpacity={0.8}
              >
                <Text style={styles.audioButtonIcon}>
                  {isRecording ? '⏹' : recordedAudio ? '🔄' : '🎙'}
                </Text>
                <Text
                  style={[
                    styles.audioButtonText,
                    isRecording && styles.recordingActiveText,
                  ]}
                >
                  {isRecording
                    ? 'Stop Recording'
                    : recordedAudio
                    ? 'Record Again'
                    : 'Tap to Record Audio'}
                </Text>
              </TouchableOpacity>

              {/* Audio File Preview */}
              {recordedAudio && !isRecording && (
                <View style={styles.audioPreviewCard}>
                  <View style={styles.audioFileDetails}>
                    <Text style={styles.audioFileIcon}>🎵</Text>
                    <Text style={styles.audioFileName} numberOfLines={1}>
                      {recordedAudio.name}
                    </Text>
                  </View>
                  <TouchableOpacity
                    onPress={() => setRecordedAudio(null)}
                    style={styles.deleteAudioButton}
                    hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                  >
                    <Text style={styles.deleteAudioText}>Remove</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>
          </View>

          {/* Submit Action */}
          <TouchableOpacity
            style={[
              styles.submitButton,
              (isSubmitting || isLoadingSchoolCode) && styles.disabledButton,
            ]}
            onPress={handleSubmit}
            disabled={isSubmitting || isLoadingSchoolCode}
            activeOpacity={0.8}
          >
            {isSubmitting ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <Text style={styles.submitButtonText}>Publish Announcement</Text>
            )}
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
      <ChiefFooterProfile/>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  container: {
    flex: 1,
  },
  scrollContainer: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 40,
  },
  headerContainer: {
    marginBottom: 20,
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: '800',
    color: '#0F172A',
    letterSpacing: -0.5,
  },
  headerSubtitle: {
    fontSize: 14,
    color: '#64748B',
    marginTop: 4,
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 18,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    ...Platform.select({
      ios: {
        shadowColor: '#64748B',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.08,
        shadowRadius: 12,
      },
      android: {
        elevation: 3,
      },
    }),
  },
  inputGroup: {
    marginBottom: 16,
  },
  fieldLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: '#334155',
    marginBottom: 6,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  input: {
    backgroundColor: '#F8FAFC',
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    fontSize: 15,
    color: '#0F172A',
  },
  row: {
    flexDirection: 'row',
    justify: 'space-between',
    gap: 12,
  },
  halfInput: {
    flex: 1,
  },
  datePickerButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  dateText: {
    color: '#0F172A',
    fontSize: 15,
    fontWeight: '500',
  },
  calendarIcon: {
    fontSize: 14,
  },
  textArea: {
    height: 110,
  },
  audioCard: {
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginTop: 4,
  },
  audioHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  liveBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FEE2E2',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    gap: 6,
  },
  recordingDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#EF4444',
  },
  liveBadgeText: {
    fontSize: 11,
    color: '#DC2626',
    fontWeight: '700',
  },
  audioButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 10,
    gap: 8,
    marginTop: 4,
  },
  recordDefaultButton: {
    backgroundColor: '#EEF2FF',
    borderWidth: 1,
    borderColor: '#C7D2FE',
  },
  recordingActiveButton: {
    backgroundColor: '#EF4444',
  },
  reRecordButton: {
    backgroundColor: '#F1F5F9',
    borderWidth: 1,
    borderColor: '#CBD5E1',
  },
  audioButtonIcon: {
    fontSize: 16,
  },
  audioButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#4338CA',
  },
  recordingActiveText: {
    color: '#FFFFFF',
  },
  audioPreviewCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginTop: 10,
  },
  audioFileDetails: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginRight: 12,
    gap: 8,
  },
  audioFileIcon: {
    fontSize: 14,
  },
  audioFileName: {
    fontSize: 13,
    color: '#334155',
    fontWeight: '500',
    flex: 1,
  },
  deleteAudioButton: {
    paddingVertical: 2,
    paddingHorizontal: 6,
  },
  deleteAudioText: {
    color: '#EF4444',
    fontSize: 12,
    fontWeight: '700',
  },
  submitButton: {
    backgroundColor: '#4F46E5',
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 20,
    ...Platform.select({
      ios: {
        shadowColor: '#4F46E5',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.25,
        shadowRadius: 8,
      },
      android: {
        elevation: 4,
      },
    }),
  },
  disabledButton: {
    opacity: 0.6,
  },
  submitButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
});

export default AnnouncementScreen;
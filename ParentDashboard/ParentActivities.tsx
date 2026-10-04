import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  PermissionsAndroid,
  Platform,
  SafeAreaView,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Asset, launchCamera, launchImageLibrary } from 'react-native-image-picker';
import RNFS from 'react-native-fs';
import axios from 'axios';
import Ionicons from 'react-native-vector-icons/Ionicons';
import LinearGradient from 'react-native-linear-gradient';

import { RootStackParamList } from '../types';
import { globalStyles as baseStyles } from '../inner';
import ParentFooter from './ParentFooter';

const API_BASE = 'http://162.215.210.38:3010/api';

type ParentActivitiesProps = NativeStackScreenProps<RootStackParamList, 'ParentActivities'> & {
  embedded?: boolean;
};

type ParentActivityMedia = {
  uri: string;
  id: string;
  name: string;
  type: string;
};

const requestCameraPermission = async () => {
  if (Platform.OS !== 'android') return true;

  const granted = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.CAMERA);
  return granted === PermissionsAndroid.RESULTS.GRANTED;
};

const isVideoMedia = (type?: string) => String(type || '').toLowerCase().startsWith('video/');

const ParentActivities: React.FC<ParentActivitiesProps> = ({ route, embedded = false }) => {
  const params = route.params || {};
  const routeClassName = String((params as any).class_name || (params as any).className || '').trim();
  const routeSection = String((params as any).section || '').trim();
  const routeName = String(params.name || '').trim();
  const routeSchoolCode = String((params as any).schoolCode || '').trim();
  const [eventName, setEventName] = useState('');
  const [uploaderName, setUploaderName] = useState('');
  const [selectedMedia, setSelectedMedia] = useState<ParentActivityMedia[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState('');
  const [activityPhotosEnabled, setActivityPhotosEnabled] = useState(true);
  const [settingLoading, setSettingLoading] = useState(true);

  const [className, setClassName] = useState(routeClassName);
  const [section, setSection] = useState(routeSection);

  useEffect(() => {
    const loadParentDetails = async () => {
      try {
        const storedName = await AsyncStorage.getItem('name');
        const storedDetailsRaw = await AsyncStorage.getItem('userDetails');
        const currentStudentRaw = await AsyncStorage.getItem('currentStudent');
        const storedDetails = storedDetailsRaw ? JSON.parse(storedDetailsRaw) : {};
        const currentStudent = currentStudentRaw ? JSON.parse(currentStudentRaw) : {};

        setClassName((current) =>
          current ||
          String(
            routeClassName ||
              currentStudent.class_name ||
              storedDetails.class_name ||
              ''
          ).trim()
        );
        setSection((current) =>
          current ||
          String(routeSection || currentStudent.section || storedDetails.section || '').trim()
        );

        setUploaderName(
          String(
            routeName ||
              storedDetails.name ||
              storedDetails.father_name ||
              storedDetails.username ||
              storedName ||
              ''
          )
        );
      } catch {
        setUploaderName(routeName || 'Parent');
      }
    };

    loadParentDetails();
  }, [routeClassName, routeName, routeSection]);

  useEffect(() => {
    const loadActivitySetting = async () => {
      try {
        setSettingLoading(true);
        const schoolCode = String(
          routeSchoolCode ||
            (await AsyncStorage.getItem('schoolCode')) ||
            ''
        ).trim();

        if (!schoolCode) return;

        const response = await axios.get(`${API_BASE}/parent-activity-settings`, {
          params: { schoolCode },
        });

        setActivityPhotosEnabled(response.data?.parentActivityPhotosEnabled !== false);
      } catch {
        setActivityPhotosEnabled(true);
      } finally {
        setSettingLoading(false);
      }
    };

    void loadActivitySetting();
  }, [routeSchoolCode]);

  const summaryCards = useMemo(
    () => [
      {
        label: 'Selected',
        value: String(selectedMedia.length),
        icon: 'images-outline',
      },
      {
        label: 'Status',
        value: !activityPhotosEnabled ? 'Disabled' : isUploading ? 'Uploading' : 'Direct Upload',
        icon: 'shield-checkmark-outline',
      },
    ],
    [activityPhotosEnabled, isUploading, selectedMedia.length]
  );

  const normalizeAssets = (assets?: Asset[]) =>
    assets
      ?.filter((asset) => !!asset.uri)
      .map((asset, index) => ({
        uri: asset.uri as string,
        id: asset.fileName || `${asset.uri}-${Date.now()}-${index}`,
        name:
          asset.fileName ||
          `parent_activity_${Date.now()}_${index}.${isVideoMedia(asset.type) ? 'mp4' : 'jpg'}`,
        type: asset.type || 'image/jpeg',
      })) || [];

  const pickMedia = async () => {
    try {
      const result = await launchImageLibrary({
        mediaType: 'mixed',
        selectionLimit: 20,
        quality: 0.8,
        maxWidth: 1280,
        maxHeight: 1280,
      });

      if (result.didCancel) return;
      if (result.errorCode) {
        Alert.alert('Error', result.errorMessage || 'Media selection failed.');
        return;
      }

      setSelectedMedia((current) => [...current, ...normalizeAssets(result.assets)]);
    } catch {
      Alert.alert('Error', 'Unable to select media.');
    }
  };

  const takePhoto = async () => {
    try {
      const hasPermission = await requestCameraPermission();
      if (!hasPermission) {
        Alert.alert('Permission Required', 'Camera permission is required to take a photo.');
        return;
      }

      const result = await launchCamera({
        mediaType: 'photo',
        quality: 0.8,
        maxWidth: 1280,
        maxHeight: 1280,
        saveToPhotos: false,
      });

      if (result.didCancel) return;
      if (result.errorCode) {
        Alert.alert('Error', result.errorMessage || 'Camera capture failed.');
        return;
      }

      setSelectedMedia((current) => [...current, ...normalizeAssets(result.assets)]);
    } catch {
      Alert.alert('Error', 'Unable to capture photo.');
    }
  };

  const recordVideo = async () => {
    try {
      const hasPermission = await requestCameraPermission();
      if (!hasPermission) {
        Alert.alert('Permission Required', 'Camera permission is required to record a video.');
        return;
      }

      const result = await launchCamera({
        mediaType: 'video',
        videoQuality: 'medium',
        saveToPhotos: false,
      });

      if (result.didCancel) return;
      if (result.errorCode) {
        Alert.alert('Error', result.errorMessage || 'Video capture failed.');
        return;
      }

      setSelectedMedia((current) => [...current, ...normalizeAssets(result.assets)]);
    } catch {
      Alert.alert('Error', 'Unable to record video.');
    }
  };

  const removeMedia = (id: string) => {
    setSelectedMedia((current) => current.filter((item) => item.id !== id));
  };

  const submitForApproval = async () => {
    if (!activityPhotosEnabled) {
      Alert.alert('Activities Disabled', 'Activity photo uploads are currently disabled by the school.');
      return;
    }

    if (!eventName.trim()) {
      Alert.alert('Validation', 'Please enter an activity name.');
      return;
    }

    if (!uploaderName.trim()) {
      Alert.alert('Validation', 'Parent name is missing. Please login again.');
      return;
    }

    if (!className) {
      Alert.alert('Validation', 'Student class is missing. Please login again.');
      return;
    }

    if (!section) {
      Alert.alert('Validation', 'Student section is missing. Please login again.');
      return;
    }

    if (selectedMedia.length === 0) {
      Alert.alert('Validation', 'Please select at least one photo or video.');
      return;
    }

    setIsUploading(true);
    setUploadProgress('');

    try {
      const schoolCode = String(
        (params as any).schoolCode ||
          (await AsyncStorage.getItem('schoolCode')) ||
          ''
      ).trim();

      if (!schoolCode) {
        Alert.alert('Error', 'School code missing. Please login again.');
        return;
      }

      console.log('[ActivityUpload][Parent] Start', {
        endpoint: `${API_BASE}/upload-activity-media-base64`,
        schoolCode,
        className,
        section,
        uploaderName: uploaderName.trim(),
        selectedMediaCount: selectedMedia.length,
        eventName: eventName.trim(),
      });

      for (let index = 0; index < selectedMedia.length; index += 1) {
        const file = selectedMedia[index];
        setUploadProgress(`Submitting ${index + 1}/${selectedMedia.length}`);

        const normalizedPath = file.uri.replace('file://', '');
        const fileBase64 = await RNFS.readFile(normalizedPath, 'base64');

        const uploadPayload = {
          eventName: eventName.trim(),
          name_of_event: eventName.trim(),
          uploadedBy: uploaderName.trim(),
          uploader_name: uploaderName.trim(),
          schoolCode,
          school_code: schoolCode,
          className,
          class_name: className,
          section,
          fileName: file.name,
          file_name: file.name,
          mimeType: file.type,
          file_type: file.type,
          fileBase64,
          file_base64: fileBase64,
        };

        console.log('[ActivityUpload][Parent] Payload check', {
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

        console.log('[ActivityUpload][Parent] Response', {
          index: index + 1,
          status: response.status,
          data: response.data,
        });

        if (response.status < 200 || response.status >= 300) {
          throw new Error(response.data?.message || `Upload failed at file ${index + 1}`);
        }
      }

      setUploadProgress('Upload complete');
      Alert.alert('Success', 'Activity media uploaded successfully.');
      setEventName('');
      setSelectedMedia([]);
    } catch (error: any) {
      setUploadProgress('');
      console.warn('[ActivityUpload][Parent] Error', {
        message: error?.message,
        status: error?.response?.status,
        data: error?.response?.data,
        requestUrl: error?.config?.url,
        requestMethod: error?.config?.method,
      });
      Alert.alert('Upload Error', error?.response?.data?.message || error?.message || 'Unable to submit media.');
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <SafeAreaView style={baseStyles.safeArea}>
      <StatusBar barStyle="dark-content" />
      <ScrollView
        style={baseStyles.scrollView}
        contentContainerStyle={[local.page, embedded && local.embeddedPage]}
        showsVerticalScrollIndicator={false}
      >
        <LinearGradient
                 colors={['#DCEEFF', '#182B8C', '#0B1052']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={local.hero}
        >
          <Text style={local.title}>Activities</Text>
          <Text style={local.subtitle}>
            {className ? `${className}${section ? ` - ${section}` : ''}` : 'Student activity uploads'}
          </Text>

          <View style={local.summaryRow}>
            {summaryCards.map((card) => (
              <View key={card.label} style={local.summaryCard}>
                <Ionicons name={card.icon as any} size={24} color="#111827" />
                <Text style={local.summaryValue} numberOfLines={1}>{card.value}</Text>
                <Text style={local.summaryLabel}>{card.label}</Text>
              </View>
            ))}
          </View>
        </LinearGradient>

        <View style={local.card}>
          <Text style={local.cardTitle}>Upload Photos or Videos</Text>

          <TextInput
            style={local.input}
            placeholder="Activity name"
            placeholderTextColor="#777"
            value={eventName}
            onChangeText={setEventName}
          />

          <TextInput
            style={local.input}
            placeholder="Parent name"
            placeholderTextColor="#777"
            value={uploaderName}
            onChangeText={setUploaderName}
          />

          <View style={local.actionsRow}>
            <TouchableOpacity
              style={[local.secondaryButton, !activityPhotosEnabled && local.disabledButton]}
              onPress={pickMedia}
              disabled={isUploading || settingLoading || !activityPhotosEnabled}
            >
              <Ionicons name="images-outline" size={18} color="#111827" />
              <Text style={local.secondaryButtonText}>Gallery</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[local.secondaryButton, !activityPhotosEnabled && local.disabledButton]}
              onPress={takePhoto}
              disabled={isUploading || settingLoading || !activityPhotosEnabled}
            >
              <Ionicons name="camera-outline" size={18} color="#111827" />
              <Text style={local.secondaryButtonText}>Camera</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[local.secondaryButton, !activityPhotosEnabled && local.disabledButton]}
              onPress={recordVideo}
              disabled={isUploading || settingLoading || !activityPhotosEnabled}
            >
              <Ionicons name="videocam-outline" size={18} color="#111827" />
              <Text style={local.secondaryButtonText}>Video</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                local.submitButton,
                (isUploading || settingLoading || !activityPhotosEnabled) && local.disabledButton,
              ]}
              onPress={submitForApproval}
              disabled={isUploading || settingLoading || !activityPhotosEnabled}
            >
              {isUploading || settingLoading ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <Ionicons name="cloud-upload-outline" size={20} color="#FFFFFF" />
              )}
            </TouchableOpacity>
          </View>

          {!!uploadProgress && <Text style={local.progressText}>{uploadProgress}</Text>}

          <View style={local.mediaQueue}>
            {selectedMedia.length === 0 ? (
              <Text style={local.emptyText}>No media selected yet.</Text>
            ) : (
              <View style={local.gridWrap}>
                {selectedMedia.map((item) => (
                  <View key={item.id} style={local.thumbWrap}>
                    {isVideoMedia(item.type) ? (
                      <View style={[local.thumb, local.videoThumb]}>
                        <Ionicons name="play-circle" size={30} color="#FFFFFF" />
                        <Text style={local.videoText}>Video</Text>
                      </View>
                    ) : (
                      <Image source={{ uri: item.uri }} style={local.thumb} />
                    )}
                    <TouchableOpacity style={local.removeButton} onPress={() => removeMedia(item.id)}>
                      <Text style={local.removeButtonText}>X</Text>
                    </TouchableOpacity>
                  </View>
                ))}
              </View>
            )}
          </View>

          <Text style={local.noteText}>
            {activityPhotosEnabled
              ? 'Photos and videos are saved directly for the class activity gallery.'
              : 'Activity media uploads are currently disabled by the school.'}
          </Text>
        </View>
      </ScrollView>

      {!embedded && <ParentFooter />}
    </SafeAreaView>
  );
};

const local = StyleSheet.create({
  page: {
    paddingBottom: 96,
  },
  embeddedPage: {
    paddingBottom: 18,
  },
  hero: {
    paddingHorizontal: 16,
    paddingTop: 26,
    paddingBottom: 18,
    borderBottomLeftRadius: 22,
    borderBottomRightRadius: 22,
  },
  title: {
    color: '#111827',
    fontSize: 24,
    fontWeight: '900',
  },
  subtitle: {
    marginTop: 4,
    color: '#2F2F35',
    fontSize: 13,
    fontWeight: '700',
  },
  summaryRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 18,
  },
  summaryCard: {
    flex: 1,
    minHeight: 86,
    borderRadius: 14,
    backgroundColor: '#FFFFFF',
    padding: 12,
    borderWidth: 1,
    borderColor: '#E6E8EF',
  },
  summaryValue: {
    marginTop: 8,
    color: '#111827',
    fontSize: 17,
    fontWeight: '900',
  },
  summaryLabel: {
    marginTop: 2,
    color: '#5B5E66',
    fontSize: 12,
    fontWeight: '700',
  },
  card: {
    margin: 12,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#D9DDE5',
    backgroundColor: '#FFFFFF',
    padding: 14,
  },
  cardTitle: {
    color: '#111827',
    fontSize: 16,
    fontWeight: '900',
    marginBottom: 12,
  },
  input: {
    backgroundColor: '#F6F6F7',
    borderWidth: 1,
    borderColor: '#CCCCCC',
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 10,
    color: '#111827',
  },
  actionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8,
  },
  secondaryButton: {
    flexGrow: 1,
    flexBasis: '28%',
    minHeight: 46,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#D8DBE3',
    backgroundColor: '#F8F8FA',
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
  },
  secondaryButtonText: {
    marginLeft: 6,
    color: '#111827',
    fontSize: 13,
    fontWeight: '800',
  },
  submitButton: {
    width: 50,
    height: 46,
    borderRadius: 14,
    backgroundColor: '#F4511E',
    alignItems: 'center',
    justifyContent: 'center',
  },
  disabledButton: {
    opacity: 0.7,
  },
  progressText: {
    marginTop: 10,
    color: '#2563EB',
    fontWeight: '800',
    textAlign: 'center',
  },
  mediaQueue: {
    marginTop: 14,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E3E5EA',
    backgroundColor: '#F8F8FA',
    minHeight: 150,
    padding: 10,
  },
  emptyText: {
    color: '#5E626B',
    fontSize: 13,
    fontWeight: '700',
    textAlign: 'center',
    marginTop: 54,
  },
  gridWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  thumbWrap: {
    width: '30%',
    aspectRatio: 1,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: '#E5E7EB',
  },
  thumb: {
    width: '100%',
    height: '100%',
  },
  videoThumb: {
    backgroundColor: '#111827',
    alignItems: 'center',
    justifyContent: 'center',
  },
  videoText: {
    marginTop: 4,
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '800',
  },
  removeButton: {
    position: 'absolute',
    top: 5,
    right: 5,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#EF4444',
    alignItems: 'center',
    justifyContent: 'center',
  },
  removeButtonText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '900',
  },
  noteText: {
    marginTop: 12,
    color: '#5E626B',
    fontSize: 12,
    lineHeight: 18,
    fontWeight: '600',
  },
});

export default ParentActivities;

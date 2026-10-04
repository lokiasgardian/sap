import React, { useState, useContext, useEffect, useRef, useCallback } from 'react';
import {
  Alert,
  View,
  TextInput,
  TouchableOpacity,
  Text,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  Image,
  Modal,
} from 'react-native';
import Ionicons from 'react-native-vector-icons/Ionicons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import axios from 'axios';
import messaging from '@react-native-firebase/messaging';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { widthPercentageToDP as wp, heightPercentageToDP as hp } from 'react-native-responsive-screen';
import { OTPWidget } from '@msg91comm/sendotp-react-native';
import LinearGradient from 'react-native-linear-gradient';

import { UserContext } from '../UserContext';
import { ThemeContext } from '../ThemeContext';
import {
  requestLocationPermission,
  startPersistentAttendanceTracking,
} from './AttendanceService';
import { ErrorContext } from './ErrorContext';

const widgetId = "366772696c6f383138323937";
const tokenAuth = "551674TwL5HxRL6a5b439cP1";
const mobileIntegrationErrorMessage =
  'This MSG91 widget is not enabled for mobile apps. Please enable Mobile Integration in the MSG91 OTP widget settings.';
const apiBaseUrl = 'http://162.215.210.38:3010/api';

type RootStackParamList = {
  TeacherAdmissionDashboard: { username: string; name: string };
  ChiefDashboard: { username: string; name: string };
  AdminDashboard: undefined;
  AccountantDashboard: { username: string; name: string };
  ParentDashboard: { username: string; name: string };
  ParentDetails: { username: string; name: string };
  TeacherDashboard: { username: string; name: string };
  BusManagerDashboard: undefined;
  BusDashboard: undefined;
  BusDriverDashboard: undefined;
  ExcelUpload: undefined;
};

const TeacherLogin: React.FC = () => {
  const [loginMode, setLoginMode] = useState<'password' | 'phone'>('password');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [mobileNumber, setMobileNumber] = useState('');
  const [otp, setOtp] = useState('');
  const [otpReqId, setOtpReqId] = useState('');
  const [isSendingOtp, setIsSendingOtp] = useState(false);
  const [isVerifyingOtp, setIsVerifyingOtp] = useState(false);
  const [isMobileVerified, setIsMobileVerified] = useState(false);
  const [otpLoginUser, setOtpLoginUser] = useState<any>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [showResetPassword, setShowResetPassword] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [resetMobileNumber, setResetMobileNumber] = useState('');
  const [resetOtp, setResetOtp] = useState('');
  const [resetOtpReqId, setResetOtpReqId] = useState('');
  const [resetLoginUser, setResetLoginUser] = useState<any>(null);
  const [isResetMobileVerified, setIsResetMobileVerified] = useState(false);
  const [resetNewPassword, setResetNewPassword] = useState('');
  const [resetConfirmPassword, setResetConfirmPassword] = useState('');
  const [isSendingResetOtp, setIsSendingResetOtp] = useState(false);
  const [isVerifyingResetOtp, setIsVerifyingResetOtp] = useState(false);
  const [isResettingPassword, setIsResettingPassword] = useState(false);

  const { setTeacherUsername } = useContext(UserContext);
  const { themeStyles } = useContext(ThemeContext);
  const { showError } = useContext(ErrorContext);

  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const attendanceSchedulerRef = useRef<boolean>(false);
  const otpInputRef = useRef<TextInput>(null);
  const resetOtpInputRef = useRef<TextInput>(null);
  const isPhoneLogin = loginMode === 'phone';

  /* ---------------- ATTENDANCE SCHEDULER ---------------- */
  const startAutomaticAttendanceTracking = useCallback(async () => {
    try {
      const schoolCode = await AsyncStorage.getItem('schoolCode');
      const storedUsername = await AsyncStorage.getItem('username');
      const userType = await AsyncStorage.getItem('userType');

      if (userType !== 'teacher') return;

      if (!schoolCode || !storedUsername) {
        showError('Configuration Error', 'School code or username not found. Please login again.');
        return;
      }

      if (attendanceSchedulerRef.current) return;

      console.log('🚀 Starting automatic attendance scheduler for:', storedUsername);
      await startPersistentAttendanceTracking();
      attendanceSchedulerRef.current = true;
    } catch (error: any) {
      console.error('❌ Attendance Scheduler Error:', error);
      showError('Attendance Error', error?.message || 'Failed to start attendance scheduler');
    }
  }, [showError]);

const askToEnableLocation = useCallback(() => {
    return new Promise<boolean>((resolve) => {
      Alert.alert(
        'Location Permission Required',
        'Cleezo Class collects location data to verify your proximity to the campus and automate your check-in and attendance logging, even when the app is closed or not in use.',
        [
          {
            text: 'Deny',
            style: 'cancel',
            onPress: () => resolve(false),
          },
          {
            text: 'Agree & Continue',
            onPress: async () => {
              const granted = await requestLocationPermission();
              if (granted) {
                await AsyncStorage.setItem('attendanceTrackingEnabled', 'true');
              }
              resolve(granted);
            },
          },
        ],
        { cancelable: false }
      );
    });
  }, []);

  /* ---------------- AUTO LOGIN ---------------- */
  const autoLogin = useCallback(async () => {
    try {
      console.log('🔄 Checking Auto-Login cache status...');
      const storedUser = await AsyncStorage.getItem('username');
      const storedName = await AsyncStorage.getItem('name');
      const userType = await AsyncStorage.getItem('userType');
      const lastScreen = await AsyncStorage.getItem('lastScreen');
      const designation = (await AsyncStorage.getItem('designation'))?.toLowerCase().trim();
      const safeName = storedName || '';

      console.log(`📋 Cache data retrieved -> User: ${storedUser}, Type: ${userType}, Role: ${designation}`);

      const isAdminRole = designation === 'admin';
      const isAccountantRole = userType === 'management' && designation === 'accountant';
      const isBusManagerRole = userType === 'management' && (designation === 'bus manager' || designation === 'busmanager');
      const isBusDriverRole = designation === 'bus driver' || designation === 'busdriver' || designation === 'driver';
      const isChiefRole = userType === 'management' && designation === 'superadmin';

      if (storedUser && userType) {
        console.log(`✅ Auto-login triggered. Redirecting destination: ${lastScreen}`);
        if (userType === 'teacher') {
          navigation.reset({ index: 0, routes: [{ name: 'TeacherDashboard', params: { username: storedUser, name: safeName } }] });
          return;
        }
        if (userType === 'student') {
          navigation.reset({ index: 0, routes: [{ name: 'ParentDashboard', params: { username: storedUser, name: safeName } }] });
          return;
        }
        if (isChiefRole) {
          navigation.reset({ index: 0, routes: [{ name: 'ChiefDashboard', params: { username: storedUser, name: safeName } }] });
          return;
        }
        if (isAccountantRole) {
          navigation.reset({ index: 0, routes: [{ name: 'AccountantDashboard', params: { username: storedUser, name: safeName } }] });
          return;
        }
        if (isBusManagerRole) {
          navigation.reset({ index: 0, routes: [{ name: 'BusDashboard' }] });
          return;
        }
        if (isBusDriverRole) {
          navigation.reset({ index: 0, routes: [{ name: 'BusDriverDashboard' }] });
          return;
        }
        if ((userType === 'management' || userType === 'marketing') && isAdminRole) {
          navigation.reset({ index: 0, routes: [{ name: 'AdminDashboard' }] });
          return;
        }
      }
    } catch (error: any) {
      console.error('❌ Auto Login Error Trace:', error);
      showError('Auto Login Failed', error?.message || 'Something went wrong during auto login');
    }
  }, [navigation, showError]);

  /* ---------------- LOGIN HANDLER ---------------- */
  const getAvailablePushToken = async () => {
    const storedToken = await AsyncStorage.getItem('fcmToken');
    if (storedToken) return storedToken;

    const authStatus = await messaging().requestPermission();
    const isAuthorized =
      authStatus === messaging.AuthorizationStatus.AUTHORIZED ||
      authStatus === messaging.AuthorizationStatus.PROVISIONAL;

    if (!isAuthorized) {
      console.warn('⚠️ Push token sync skipped: notification permission not granted');
      return null;
    }

    const token = await messaging().getToken();
    if (token) {
      await AsyncStorage.setItem('fcmToken', token);
    }
    return token || null;
  };

  const storePushToken = async (
    loginUsername: string,
    pushToken: string,
    userType: string,
    schoolCode: string,
    className?: string,
  ) => {
    try {
      const payload = { username: loginUsername, pushToken, push_token: pushToken, userType, schoolCode, className };
      console.log('📤 Transmitting Push Token Payload...');
      const response = await axios.post('http://162.215.210.38:3010/api/store-push-tok', payload);
      console.log('✅ Server Push Token sync status:', response.data);
    } catch (error: any) {
      console.warn('⚠️ Background Push Token sync failed contextually:', error?.message);
    }
  };

  const handleLogin = async () => {
    console.log(`🔑 Login execution started for target user: ${username}`);
    if (!username || !password) {
      showError('Error', 'Please enter username and password');
      return;
    }

    try {
      const response = await axios.post(
        'http://162.215.210.38:3010/api/login-credentials',
        { username, password },
        { timeout: 10000 }
      );

      const data = response.data;
      console.log('🌐 Server Auth Response Data Payload Received:', data);

      if (!data.success) {
        console.warn(`❌ Login request failed on server side. Code: ${data.code}`);
        if (data.code === 'ACCOUNT_DISABLED') {
          showError('Account Disabled', data.message || 'This account is disabled. Contact your school administrator.');
        } else {
          showError('Login Failed', data.message || 'Please enter valid credentials');
        }
        return;
      }

      const userType = String(data.userType || data.user_type || '').trim().toLowerCase();
      if (!userType) {
        showError('Login Failed', 'User type missing from server payload.');
        return;
      }

      const schoolCode = String(data.schoolCode || data.school_code || data.schoolcode || '').trim();
      const designationKey = String(data.designation || '').toLowerCase().trim().replace(/[\s_-]+/g, '');
      const isAdminRole = designationKey === 'admin';
      const isAccountantRole = userType === 'management' && designationKey === 'accountant';
      const isBusManagerRole = userType === 'management' && designationKey === 'busmanager';
      const isBusDriverRole = designationKey === 'busdriver' || designationKey === 'driver';
      const isChiefRole = userType === 'management' && designationKey === 'superadmin';
      
      let nextScreen = 'TeacherDashboard';
      if (userType === 'student') nextScreen = 'ParentDetails';
      else if (isChiefRole) nextScreen = 'ChiefDashboard';
      else if (isAccountantRole) nextScreen = 'AccountantDashboard';
      else if (isBusManagerRole) nextScreen = 'BusDashboard';
      else if (isBusDriverRole) nextScreen = 'BusDriverDashboard';
      else if (isAdminRole) nextScreen = 'AdminDashboard';

      await AsyncStorage.multiSet([
        ['userType', userType],
        ['username', username],
        ['name', data.name || ''],
        ['schoolCode', schoolCode],
        ['designation', data.designation || ''],
        ['userDetails', JSON.stringify(data)],
        ['lastScreen', nextScreen],
      ]);

      setTeacherUsername(username);

      console.log(`🔀 Performing routing injection to screen: ${nextScreen}`);
      if (userType === 'teacher') {
        const granted = await askToEnableLocation();
        if (granted) {
          await AsyncStorage.setItem('attendanceTrackingEnabled', 'true');
          await startAutomaticAttendanceTracking();
        }
        navigation.replace('TeacherDashboard', { username, name: data.name });
      } else if (userType === 'student') {
        navigation.replace('ParentDetails', { username, name: data.name });
      } else if (isChiefRole) {
        navigation.replace('ChiefDashboard', { username, name: data.name });
      } else if (isAccountantRole) {
        navigation.replace('ExcelUpload');
      } else if (isBusManagerRole) {
        navigation.replace('BusDashboard');
      } else if (isBusDriverRole) {
        navigation.replace('BusDriverDashboard');
      } else if ((userType === 'management' || userType === 'marketing') && isAdminRole) {
        navigation.replace('AdminDashboard');
      } else {
        showError('Access Denied', 'Your account does not have dashboard access.');
        return;
      }

      setTimeout(async () => {
        try {
          const finalToken = await getAvailablePushToken();
          if (!finalToken) return;
          await storePushToken(username, finalToken, userType, schoolCode, data.class_name);
        } catch {
          console.warn('Background sync tracking caught failure silently');
        }
      }, 0);

    } catch (err: any) {
      console.error('❌ Login Operational Error Catch:', err);
      if (err.response) {
        showError('Login Failed', err.response.data?.message || 'An error occurred while logging in');
      } else if (err.request) {
        showError('Network Error', 'Server not reachable.');
      } else {
        showError('Error', err.message || 'An unexpected error occurred');
      }
    }
  };

  /* ---------------- MOBILE OTP HANDLERS & LOGS ---------------- */
  const getLocalIndianMobile = (value: string) => {
    const digits = value.replace(/\D/g, '');
    if (digits.length > 10 && digits.startsWith('91')) {
      return digits.slice(2, 12);
    }
    return digits.slice(0, 10);
  };

  const normalizeIndianMobile = (value: string) => {
    const localMobile = getLocalIndianMobile(value);
    if (localMobile.length === 10) return `91${localMobile}`;
    return '';
  };

  const completeOtpLogin = async (loginData: any) => {
    const student = loginData?.student || {};
    const otpUsername = String(student.username || '').trim();
    const otpName = String(student.name || '').trim();
    const otpSchoolCode = String(loginData?.schoolCode || student.schoolCode || '').trim();
    const otpUserType = String(loginData?.userType || loginData?.user_type || student.user_type || 'student').trim().toLowerCase();
    const nextScreen = otpUserType === 'student' ? 'ParentDetails' : 'TeacherDashboard';

    if (!otpUsername || !otpSchoolCode) {
      Alert.alert('Login Failed', 'Student login details missing after OTP verification.');
      return;
    }

    const userDetails = {
      ...student,
      schoolCode: otpSchoolCode,
      userType: otpUserType,
      user_type: otpUserType,
      name: otpName,
    };

    await AsyncStorage.multiSet([
      ['userType', otpUserType],
      ['username', otpUsername],
      ['name', otpName],
      ['schoolCode', otpSchoolCode],
      ['designation', student.designation || ''],
      ['userDetails', JSON.stringify(userDetails)],
      ['lastScreen', nextScreen],
    ]);

    setTeacherUsername(otpUsername);
    navigation.replace('ParentDetails', { username: otpUsername, name: otpName });

    setTimeout(async () => {
      try {
        const finalToken = await getAvailablePushToken();
        if (!finalToken) return;
        await storePushToken(otpUsername, finalToken, otpUserType, otpSchoolCode, student.class_name);
      } catch {
        console.warn('Background sync tracking caught failure silently');
      }
    }, 0);
  };

  const verifyStudentMobile = async (localMobile: string) => {
    const response = await axios.post(
      `${apiBaseUrl}/verify-student-mobile`,
      { mobile: localMobile },
      { timeout: 10000 }
    );

    const matchedSchoolCode = String(response.data?.schoolCode || '').trim();
    if (matchedSchoolCode) {
      await AsyncStorage.setItem('schoolCode', matchedSchoolCode);
    }

    return response.data;
  };

  const resetForgotPasswordState = () => {
    setResetMobileNumber('');
    setResetOtp('');
    setResetOtpReqId('');
    setResetLoginUser(null);
    setIsResetMobileVerified(false);
    setResetNewPassword('');
    setResetConfirmPassword('');
    setShowResetPassword(false);
    setIsSendingResetOtp(false);
    setIsVerifyingResetOtp(false);
    setIsResettingPassword(false);
  };

  const openForgotPasswordModal = () => {
    resetForgotPasswordState();
    setModalVisible(true);
  };

  const closeForgotPasswordModal = () => {
    setModalVisible(false);
    resetForgotPasswordState();
  };

  const verifyResetMobile = async (localMobile: string) => {
    try {
      const response = await axios.post(
        `${apiBaseUrl}/verify-user-mobile`,
        { mobile: localMobile },
        { timeout: 10000 }
      );
      return response.data;
    } catch (error: any) {
      if (error?.response?.status !== 404) {
        throw error;
      }
      return verifyStudentMobile(localMobile);
    }
  };

  const getResetUsername = (loginData: any) => {
    return String(
      loginData?.username ||
      loginData?.user?.username ||
      loginData?.student?.username ||
      ''
    ).trim();
  };

  const handleForgotOtpTrigger = async () => {
    const localMobile = getLocalIndianMobile(resetMobileNumber);
    const formattedMobile = normalizeIndianMobile(resetMobileNumber);
    if (!formattedMobile) {
      Alert.alert('Invalid Mobile', 'Please enter a valid 10-digit Indian mobile number.');
      return;
    }

    try {
      setIsSendingResetOtp(true);
      const verifiedLoginData = await verifyResetMobile(localMobile);
      if (!verifiedLoginData?.success) {
        Alert.alert('Mobile Not Registered', verifiedLoginData?.message || 'This mobile number is not registered.');
        return;
      }

      const resetUsername = getResetUsername(verifiedLoginData);
      if (!resetUsername) {
        Alert.alert('Reset Failed', 'Username not found for this mobile number.');
        return;
      }

      setResetLoginUser(verifiedLoginData);
      await OTPWidget.initializeWidget(widgetId, tokenAuth);
      const response = await OTPWidget.sendOTP({ identifier: formattedMobile });

      if (response?.type !== 'success') {
        const responseMessage = String(response?.message || '');
        const isMobileIntegrationDisabled = responseMessage.toLowerCase().includes('mobile requests are not allowed');
        Alert.alert(
          isMobileIntegrationDisabled ? 'Enable MSG91 Mobile Integration' : 'OTP Failed',
          isMobileIntegrationDisabled
            ? mobileIntegrationErrorMessage
            : responseMessage || 'Unable to send OTP. Please try again.'
        );
        return;
      }

      if (response?.['access-token'] || response?.invisibleVerified) {
        setIsResetMobileVerified(true);
        setResetOtpReqId('');
        setResetOtp('');
        return;
      }

      setResetOtpReqId(String(response.message || ''));
      setResetOtp('');
    } catch (error: any) {
      const status = error?.response?.status;
      if (status === 404) {
        Alert.alert('Mobile Not Registered', error.response.data?.message || 'This mobile number is not registered.');
      } else {
        Alert.alert('OTP Failed', error?.response?.data?.message || error?.message || 'Unable to send OTP. Please try again.');
      }
    } finally {
      setIsSendingResetOtp(false);
    }
  };

  const handleVerifyResetOtp = async () => {
    if (!resetOtpReqId) {
      Alert.alert('OTP Expired', 'Please request a new OTP.');
      return;
    }
    if (resetOtp.trim().length !== 6) {
      Alert.alert('Invalid OTP', 'Please enter the OTP received on your mobile.');
      return;
    }

    try {
      setIsVerifyingResetOtp(true);
      const response = await OTPWidget.verifyOTP({ reqId: resetOtpReqId, otp: resetOtp.trim() });

      if (response?.type === 'success') {
        setIsResetMobileVerified(true);
        setResetOtpReqId('');
        setResetOtp('');
      } else {
        Alert.alert('Verification Failed', response?.message || 'Incorrect OTP entered.');
      }
    } catch (error: any) {
      Alert.alert('Verification Failed', error?.message || 'Unable to verify OTP. Please try again.');
    } finally {
      setIsVerifyingResetOtp(false);
    }
  };

  const handleResetPassword = async () => {
    const resetUsername = getResetUsername(resetLoginUser);
    const nextPassword = resetNewPassword.trim();
    if (!isResetMobileVerified) {
      Alert.alert('Verify Mobile', 'Please verify OTP before resetting password.');
      return;
    }
    if (!nextPassword || !resetConfirmPassword.trim()) {
      Alert.alert('Missing Password', 'Please enter and confirm your new password.');
      return;
    }
    if (nextPassword.length < 4) {
      Alert.alert('Weak Password', 'Password must be at least 4 characters.');
      return;
    }
    if (nextPassword !== resetConfirmPassword.trim()) {
      Alert.alert('Password Mismatch', 'New password and confirm password do not match.');
      return;
    }
    if (!resetUsername) {
      Alert.alert('Reset Failed', 'Username not found for this mobile number.');
      return;
    }

    try {
      setIsResettingPassword(true);
      const response = await axios.post(
        `${apiBaseUrl}/reset-password`,
        { username: resetUsername, newPassword: nextPassword },
        { timeout: 10000 }
      );

      if (response.data?.success) {
        Alert.alert('Password Reset', 'Your password has been updated successfully.');
        setUsername(resetUsername);
        closeForgotPasswordModal();
      } else {
        Alert.alert('Reset Failed', response.data?.message || 'Unable to reset password.');
      }
    } catch (error: any) {
      Alert.alert('Reset Failed', error?.response?.data?.message || error?.message || 'Unable to reset password. Please try again.');
    } finally {
      setIsResettingPassword(false);
    }
  };

  const handleOtpTrigger = async () => {
    console.log(`📞 OTP Request Initiated for Mobile Number: "${mobileNumber}"`);
    const localMobile = getLocalIndianMobile(mobileNumber);
    const formattedMobile = normalizeIndianMobile(mobileNumber);
    if (!formattedMobile) {
      console.warn('⚠️ OTP request canceled: Mobile field input validation failed (empty or < 10 digits)');
      Alert.alert('Invalid Mobile', 'Please enter a valid 10-digit Indian mobile number.');
      return;
    }

    try {
      setIsSendingOtp(true);
      const verifiedLoginData = await verifyStudentMobile(localMobile);
      if (!verifiedLoginData?.success) {
        return;
      }
      setOtpLoginUser(verifiedLoginData);

      await OTPWidget.initializeWidget(widgetId, tokenAuth);
      const response = await OTPWidget.sendOTP({ identifier: formattedMobile });
      console.log('📲 MSG91 Send OTP Response:', response);

      if (response?.type !== 'success') {
        const responseMessage = String(response?.message || '');
        const isMobileIntegrationDisabled = responseMessage.toLowerCase().includes('mobile requests are not allowed');
        Alert.alert(
          isMobileIntegrationDisabled ? 'Enable MSG91 Mobile Integration' : 'OTP Failed',
          isMobileIntegrationDisabled
            ? mobileIntegrationErrorMessage
            : responseMessage || 'Unable to send OTP. Please try again.'
        );
        return;
      }

      if (response?.['access-token'] || response?.invisibleVerified) {
        setIsMobileVerified(true);
        setOtpReqId('');
        setOtp('');
        await completeOtpLogin(verifiedLoginData);
        return;
      }

      setOtpReqId(String(response.message || ''));
      setOtp('');
    } catch (error: any) {
      console.error('❌ OTP Send Error:', error);
      const status = error?.response?.status;
      if (status === 404) {
        Alert.alert('Mobile Not Registered', error.response.data?.message || 'This mobile number is not registered for a student in this school.');
      } else {
        Alert.alert('OTP Failed', error?.response?.data?.message || error?.message || 'Unable to send OTP. Please check your network and try again.');
      }
    } finally {
      setIsSendingOtp(false);
    }
  };

  const handleVerifyOtp = async () => {
    if (!otpReqId) {
      Alert.alert('OTP Expired', 'Please request a new OTP.');
      return;
    }
    if (otp.trim().length !== 6) {
      Alert.alert('Invalid OTP', 'Please enter the OTP received on your mobile.');
      return;
    }

    try {
      setIsVerifyingOtp(true);
      const response = await OTPWidget.verifyOTP({ reqId: otpReqId, otp: otp.trim() });
      console.log('📲 MSG91 Verify OTP Response:', response);

      if (response?.type === 'success') {
        setIsMobileVerified(true);
        setOtpReqId('');
        setOtp('');
        await completeOtpLogin(otpLoginUser);
      } else {
        Alert.alert('Verification Failed', response?.message || 'Incorrect OTP entered.');
      }
    } catch (error: any) {
      console.error('❌ OTP Verification Error:', error);
      Alert.alert('Verification Failed', error?.message || 'Unable to verify OTP. Please try again.');
    } finally {
      setIsVerifyingOtp(false);
    }
  };

  const switchToPhoneLogin = () => {
    setLoginMode('phone');
    setUsername('');
    setPassword('');
    setShowPassword(false);
  };

  const switchToPasswordLogin = () => {
    setLoginMode('password');
    setMobileNumber('');
    setOtp('');
    setOtpReqId('');
    setOtpLoginUser(null);
    setIsMobileVerified(false);
  };

  useEffect(() => {
    OTPWidget.initializeWidget(widgetId, tokenAuth);
    autoLogin();
  }, [autoLogin]);

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.container}>
        <View style={styles.heroSection}>
          <View style={styles.orangeBlob} />
          <View style={styles.blueBlob} />
          <View style={styles.leftRing} />
          <View style={styles.orangeRing} />

          <Image source={require('../assets/Cleezo.png')} style={styles.brandLogo} resizeMode="contain" />
          <Image source={require('../assets/Pasted image.png')} style={styles.heroImage} resizeMode="contain" />

          <Text style={styles.heroTitle}>Welcome Back</Text>
          <Text style={styles.heroSubtitle}>Sign in to continue to dashboard</Text>
        </View>

        <LinearGradient
          colors={['#115889', '#3A9DE0']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={styles.loginPanel}
        >
          <Text style={styles.formTitle}>{isPhoneLogin ? 'Phone Login' : 'Sign Up Now'}</Text>
          <Text style={styles.formSubtitle}>
            {isPhoneLogin ? 'Please verify your mobile number' : 'Please fill the details and create account'}
          </Text>

          <View style={styles.inputContainer} key={loginMode}>
            {isPhoneLogin ? (
              <View style={styles.phoneLoginPanel}>
                <View style={styles.phoneInputWrapper}>
                  <Text style={styles.countryCodeText}>+91</Text>
                  <TextInput
                    placeholder="Mobile Number"
                    placeholderTextColor={themeStyles.inputBorderColor}
                    keyboardType="number-pad"
                    value={mobileNumber}
                    maxLength={10}
                    onChangeText={(val) => {
                      const localMobile = getLocalIndianMobile(val);
                      setMobileNumber(localMobile);
                      setOtp('');
                      setOtpReqId('');
                      setIsMobileVerified(false);
                      console.log(`✏️ Mobile Input Entry Update: +91${localMobile}`);
                    }}
                    style={[styles.mobileInput, { color: themeStyles.textColor }]}
                  />
                </View>

                <TouchableOpacity
                  style={[styles.verifyOtpButton, (isSendingOtp || isMobileVerified) && styles.disabledButton]}
                  onPress={handleOtpTrigger}
                  disabled={isSendingOtp || isMobileVerified}
                >
                  <Text style={styles.verifyOtpButtonText}>
                    {isMobileVerified ? 'Mobile Verified' : isSendingOtp ? 'Sending OTP...' : 'Verify OTP'}
                  </Text>
                </TouchableOpacity>

                {otpReqId ? (
                  <View style={styles.inlineOtpContainer}>
                    <TouchableOpacity
                      activeOpacity={0.9}
                      style={styles.otpBoxesRow}
                      onPress={() => otpInputRef.current?.focus()}
                    >
                      {Array.from({ length: 6 }).map((_, index) => (
                        <View key={index} style={[styles.otpBox, otp.length === index && styles.otpBoxActive]}>
                          <Text style={styles.otpBoxText}>{otp[index] || ''}</Text>
                        </View>
                      ))}
                    </TouchableOpacity>
                    <TextInput
                      ref={otpInputRef}
                      value={otp}
                      onChangeText={(value) => setOtp(value.replace(/\D/g, '').slice(0, 6))}
                      keyboardType="number-pad"
                      maxLength={6}
                      style={styles.hiddenOtpInput}
                    />
                    <TouchableOpacity
                      style={[styles.verifyOtpButton, otp.length !== 6 || isVerifyingOtp ? styles.disabledButton : null]}
                      onPress={handleVerifyOtp}
                      disabled={otp.length !== 6 || isVerifyingOtp}
                    >
                      <Text style={styles.verifyOtpButtonText}>{isVerifyingOtp ? 'Verifying...' : 'Submit OTP'}</Text>
                    </TouchableOpacity>
                  </View>
                ) : null}

                <Text style={styles.helpText}>OTP will be sent to the registered mobile number.</Text>
                <TouchableOpacity style={styles.phoneModeButton} onPress={switchToPasswordLogin}>
                  <Text style={styles.phoneModeButtonText}>Login with Username</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <>
                <TextInput
                  placeholder="Username"
                  placeholderTextColor={themeStyles.inputBorderColor}
                  value={username}
                  onChangeText={setUsername}
                  style={[styles.input, { color: themeStyles.textColor }]}
                />

                <View style={styles.passwordWrapper}>
                  <TextInput
                    placeholder="Password"
                    placeholderTextColor={themeStyles.inputBorderColor}
                    value={password}
                    onChangeText={setPassword}
                    secureTextEntry={!showPassword}
                    style={[styles.passwordInput, { color: themeStyles.textColor }]}
                  />
                  <TouchableOpacity onPress={() => setShowPassword(!showPassword)}>
                    <Ionicons
                      name={showPassword ? 'eye-off' : 'eye'}
                      size={22}
                      color="#111827"
                    />
                  </TouchableOpacity>
                </View>

                <Image source={require('../assets/Attendance.png')} style={styles.image} resizeMode="contain" />

                <TouchableOpacity style={styles.buttonContainer} onPress={handleLogin} activeOpacity={0.88}>
                  <LinearGradient
                    colors={['#FFA43A', '#FF6F22']}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 0 }}
                    style={styles.buttonGradient}
                  >
                    <Text style={styles.buttonText}>Sign Up</Text>
                  </LinearGradient>
                </TouchableOpacity>

                <TouchableOpacity style={styles.forgotPasswordButton} onPress={openForgotPasswordModal}>
                  <Text style={styles.forgotPasswordText}>Forgot Password</Text>
                </TouchableOpacity>

                <TouchableOpacity style={styles.phoneModeButton} onPress={switchToPhoneLogin}>
                  <Text style={styles.phoneModeButtonText}>Login with Phone Number</Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        </LinearGradient>
      </ScrollView>

      {/* FORGOT PASSWORD MODAL */}
      <Modal visible={modalVisible} transparent animationType="fade" onRequestClose={closeForgotPasswordModal}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Forgot Password</Text>
            <Text style={styles.modalText}>Enter your registered mobile number to verify OTP and reset your password.</Text>

            <View style={styles.resetPhoneInputWrapper}>
              <Text style={styles.countryCodeText}>+91</Text>
              <TextInput
                placeholder="Mobile Number"
                placeholderTextColor={themeStyles.inputBorderColor}
                keyboardType="number-pad"
                value={resetMobileNumber}
                maxLength={10}
                editable={!isResetMobileVerified && !isSendingResetOtp}
                onChangeText={(value) => {
                  const localMobile = getLocalIndianMobile(value);
                  setResetMobileNumber(localMobile);
                  setResetOtp('');
                  setResetOtpReqId('');
                  setResetLoginUser(null);
                  setIsResetMobileVerified(false);
                }}
                style={[styles.mobileInput, { color: themeStyles.textColor }]}
              />
            </View>

            {!isResetMobileVerified ? (
              <>
                <TouchableOpacity
                  style={[styles.modalFullButton, isSendingResetOtp && styles.disabledButton]}
                  onPress={handleForgotOtpTrigger}
                  disabled={isSendingResetOtp}
                >
                  <Text style={styles.modalButtonText}>{isSendingResetOtp ? 'Sending OTP...' : 'Send OTP'}</Text>
                </TouchableOpacity>

                {resetOtpReqId ? (
                  <View style={styles.resetOtpContainer}>
                    <TouchableOpacity
                      activeOpacity={0.9}
                      style={styles.resetOtpBoxesRow}
                      onPress={() => resetOtpInputRef.current?.focus()}
                    >
                      {Array.from({ length: 6 }).map((_, index) => (
                        <View key={index} style={[styles.resetOtpBox, resetOtp.length === index && styles.otpBoxActive]}>
                          <Text style={styles.otpBoxText}>{resetOtp[index] || ''}</Text>
                        </View>
                      ))}
                    </TouchableOpacity>
                    <TextInput
                      ref={resetOtpInputRef}
                      value={resetOtp}
                      onChangeText={(value) => setResetOtp(value.replace(/\D/g, '').slice(0, 6))}
                      keyboardType="number-pad"
                      maxLength={6}
                      style={styles.hiddenOtpInput}
                    />
                    <TouchableOpacity
                      style={[styles.modalFullButton, (resetOtp.length !== 6 || isVerifyingResetOtp) && styles.disabledButton]}
                      onPress={handleVerifyResetOtp}
                      disabled={resetOtp.length !== 6 || isVerifyingResetOtp}
                    >
                      <Text style={styles.modalButtonText}>{isVerifyingResetOtp ? 'Verifying...' : 'Verify OTP'}</Text>
                    </TouchableOpacity>
                  </View>
                ) : null}
              </>
            ) : (
              <>
                <View style={styles.resetPasswordWrapper}>
                  <TextInput
                    placeholder="New Password"
                    placeholderTextColor={themeStyles.inputBorderColor}
                    value={resetNewPassword}
                    onChangeText={setResetNewPassword}
                    secureTextEntry={!showResetPassword}
                    style={[styles.resetPasswordInput, { color: themeStyles.textColor }]}
                  />
                  <TouchableOpacity onPress={() => setShowResetPassword(!showResetPassword)}>
                    <Ionicons
                      name={showResetPassword ? 'eye-off' : 'eye'}
                      size={22}
                      color={themeStyles.textColor}
                    />
                  </TouchableOpacity>
                </View>
                <View style={styles.resetPasswordWrapper}>
                  <TextInput
                    placeholder="Confirm Password"
                    placeholderTextColor={themeStyles.inputBorderColor}
                    value={resetConfirmPassword}
                    onChangeText={setResetConfirmPassword}
                    secureTextEntry={!showResetPassword}
                    style={[styles.resetPasswordInput, { color: themeStyles.textColor }]}
                  />
                  <TouchableOpacity onPress={() => setShowResetPassword(!showResetPassword)}>
                    <Ionicons
                      name={showResetPassword ? 'eye-off' : 'eye'}
                      size={22}
                      color={themeStyles.textColor}
                    />
                  </TouchableOpacity>
                </View>
                <TouchableOpacity
                  style={[styles.modalFullButton, isResettingPassword && styles.disabledButton]}
                  onPress={handleResetPassword}
                  disabled={isResettingPassword}
                >
                  <Text style={styles.modalButtonText}>{isResettingPassword ? 'Resetting...' : 'Reset Password'}</Text>
                </TouchableOpacity>
              </>
            )}

            <TouchableOpacity style={styles.modalSecondaryButton} onPress={closeForgotPasswordModal}>
              <Text style={styles.modalSecondaryButtonText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#FFFFFF' },
  container: {
    flexGrow: 1,
    backgroundColor: '#FFFFFF',
  },
  heroSection: {
    minHeight: hp('49%'),
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    paddingTop: hp('3%'),
    paddingHorizontal: wp('6%'),
    overflow: 'hidden',
  },
  orangeBlob: {
    position: 'absolute',
    width: wp('44%'),
    height: wp('44%'),
    borderRadius: wp('22%'),
    backgroundColor: '#FF7424',
    left: -wp('23%'),
    top: -wp('19%'),
  },
  blueBlob: {
    position: 'absolute',
    width: wp('34%'),
    height: wp('34%'),
    borderRadius: wp('17%'),
    backgroundColor: '#135783',
    right: -wp('20%'),
    top: hp('4.6%'),
  },
  leftRing: {
    position: 'absolute',
    width: wp('31%'),
    height: wp('31%'),
    borderRadius: wp('15.5%'),
    borderWidth: wp('4.8%'),
    borderColor: '#135783',
    left: -wp('24%'),
    top: hp('22%'),
  },
  orangeRing: {
    position: 'absolute',
    width: wp('27%'),
    height: wp('27%'),
    borderRadius: wp('13.5%'),
    borderWidth: wp('4%'),
    borderColor: '#FF7424',
    right: -wp('14%'),
    bottom: hp('2.2%'),
  },
  brandLogo: {
    width: wp('32%'),
    height: hp('7.5%'),
    marginTop: hp('1%'),
  },
  heroImage: {
    width: wp('68%'),
    height: hp('21%'),
    marginTop: hp('2%'),
  },
  heroTitle: {
    color: '#105884',
    fontSize: 34,
    fontWeight: '900',
    marginTop: hp('1.4%'),
    textAlign: 'center',
  },
  heroSubtitle: {
    color: '#0B0B0B',
    fontSize: 18,
    fontWeight: '500',
    marginTop: 4,
    textAlign: 'center',
  },
  loginPanel: {
    flexGrow: 1,
    minHeight: hp('51%'),
    borderTopLeftRadius: 34,
    borderTopRightRadius: 34,
    alignItems: 'center',
    paddingHorizontal: wp('12%'),
    paddingTop: hp('4.4%'),
    paddingBottom: hp('5%'),
  },
  formTitle: {
    color: '#FFFFFF',
    fontSize: 31,
    fontWeight: '900',
    textAlign: 'center',
  },
  formSubtitle: {
    color: 'rgba(255,255,255,0.82)',
    fontSize: 16,
    fontWeight: '500',
    lineHeight: 22,
    marginTop: hp('1.7%'),
    marginBottom: hp('3.2%'),
    maxWidth: wp('70%'),
    textAlign: 'center',
  },
  inputContainer: {
    width: '100%',
    alignItems: 'center',
  },
  input: {
    width: '100%',
    height: hp('6.4%'),
    borderWidth: 1.4,
    borderColor: '#111111',
    borderRadius: 999,
    backgroundColor: '#FFFFFF',
    marginBottom: hp('1.7%'),
    paddingHorizontal: 16,
    fontSize: 16,
    fontWeight: '700',
  },
  passwordWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '100%',
    height: hp('6.4%'),
    borderWidth: 1.4,
    borderColor: '#111111',
    borderRadius: 999,
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 16,
    marginBottom: hp('3.7%'),
  },
  passwordInput: {
    flex: 1,
    fontSize: 16,
    fontWeight: '700',
    padding: 0,
  },
  image: { display: 'none' },
  buttonContainer: {
    width: '62%',
    minHeight: hp('5.6%'),
    borderRadius: 999,
    marginTop: 0,
    marginBottom: hp('1.9%'),
    overflow: 'hidden',
  },
  buttonGradient: {
    width: '100%',
    minHeight: hp('5.6%'),
    justifyContent: 'center',
    alignItems: 'center',
  },
  buttonText: { color: '#FFFFFF', fontWeight: '900', fontSize: 20 },
  forgotPasswordButton: {
    minHeight: hp('3.4%'),
    justifyContent: 'center',
    alignItems: 'center',
  },
  forgotPasswordText: { color: '#9FD0B8', fontWeight: '700', fontSize: 17 },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalCard: {
    width: '100%',
    maxWidth: 340,
    backgroundColor: '#FFFFFF',
    borderRadius: 22,
    padding: 18,
  },
  modalTitle: { fontSize: 20, fontWeight: '900', color: '#111827', marginBottom: 10 },
  modalText: { fontSize: 14, color: '#6B7280', lineHeight: 20, marginBottom: 16 },
  modalButton: {
    alignSelf: 'flex-end',
    backgroundColor: '#8338EC',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 12,
  },
  modalButtonText: { color: '#FFF', fontWeight: '800' },
  modalSecondaryButton: {
    backgroundColor: '#F3F0FF',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 10,
  },
  modalSecondaryButtonText: { color: '#5B2BC9', fontWeight: '800' },
  modalFullButton: {
    width: '100%',
    minHeight: 44,
    backgroundColor: '#8338EC',
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 10,
  },
  resetPhoneInputWrapper: {
    width: '100%',
    height: hp('6%'),
    borderWidth: 1.5,
    borderRadius: 18,
    backgroundColor: '#FFFFFF',
    borderColor: '#E4E0EE',
    marginBottom: 12,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
  },
  resetPasswordWrapper: {
    width: '100%',
    height: hp('6%'),
    borderWidth: 1.5,
    borderRadius: 18,
    backgroundColor: '#FFFFFF',
    borderColor: '#E4E0EE',
    marginBottom: 12,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
  },
  resetPasswordInput: {
    flex: 1,
    height: '100%',
    padding: 0,
  },
  resetOtpContainer: {
    width: '100%',
    alignItems: 'center',
  },
  resetOtpBoxesRow: {
    width: '100%',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  resetOtpBox: {
    width: 40,
    height: 42,
    borderWidth: 1.5,
    borderColor: '#E4E0EE',
    borderRadius: 12,
    backgroundColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
  },
  disabledButton: { opacity: 0.6 },
  phoneLoginPanel: {
    width: '100%',
    alignItems: 'center',
  },
  phoneInputWrapper: {
    width: '100%',
    height: hp('6.4%'),
    borderWidth: 1.4,
    borderColor: '#111111',
    borderRadius: 999,
    backgroundColor: '#FFFFFF',
    marginBottom: hp('1.7%'),
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
  },
  countryCodeText: {
    color: '#111827',
    fontSize: 14,
    fontWeight: '900',
    marginRight: 8,
  },
  mobileInput: {
    flex: 1,
    height: '100%',
    padding: 0,
    fontSize: 16,
    fontWeight: '700',
  },
  verifyOtpButton: {
    width: '62%',
    minHeight: hp('5.6%'),
    backgroundColor: '#FF7424',
    borderRadius: 999,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 14,
    marginBottom: hp('1.8%'),
  },
  verifyOtpButtonText: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '900',
  },
  inlineOtpContainer: {
    width: '100%',
    alignItems: 'center',
    marginBottom: hp('0.8%'),
  },
  otpBoxesRow: {
    width: '100%',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: hp('1.4%'),
  },
  otpBox: {
    width: 38,
    height: 42,
    borderWidth: 1.5,
    borderColor: '#111111',
    borderRadius: 14,
    backgroundColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
  },
  otpBoxActive: {
    borderColor: '#FF7424',
    backgroundColor: '#FFF5EE',
  },
  otpBoxText: {
    color: '#111',
    fontSize: 18,
    fontWeight: '800',
  },
  hiddenOtpInput: {
    position: 'absolute',
    width: 1,
    height: 1,
    opacity: 0,
  },
  phoneModeButton: {
    width: '100%',
    minHeight: hp('4.6%'),
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 8,
  },
  phoneModeButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
    textAlign: 'center',
  },
  helpText: {
    color: 'rgba(255,255,255,0.82)',
    fontSize: 13,
    fontWeight: '600',
    textAlign: 'center',
    marginTop: 2,
    lineHeight: 18,
  },
});

export default TeacherLogin;

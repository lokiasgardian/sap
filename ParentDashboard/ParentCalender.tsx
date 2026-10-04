import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Pressable,
  ScrollView,
  Modal,
  SafeAreaView,
  StatusBar,
  Image,
  Dimensions,
  RefreshControl,
  Alert,
  FlatList,
  ActivityIndicator,
  Platform,
  PermissionsAndroid,
  StyleSheet,
  useWindowDimensions,
} from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../types';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { globalStyles as styles } from '../inner';
import { createAppStyles } from '../App.styles';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import { BarChart } from 'react-native-chart-kit';

import axios from 'axios';

import RNFS from 'react-native-fs';
import ParentFooter from './ParentFooter';
import { useParentAutoRefresh } from './useParentAutoRefresh';



const { width } = Dimensions.get('window');

const ADMIN_API_BASE = 'https://cleezoclass.com:4000/api';
// Same API used in AdiminAcademicsNew.jsx for extra/special class requests
const EXTRA_CLASS_API_BASE = 'https://cleezoclass.com:5000/api';

type CalendarItem = {
  id?: number;
  title: string;
  date: string;
  time?: string;
  description?: string;
  kind?: 'event' | 'meeting';
  subtitle?: string;
};

type AttendanceStatus = 'present' | 'absent';

const normalizeCalendarDate = (value: any) => {
  if (!value) return '';
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}/.test(value)) {
    return value.slice(0, 10);
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const normalizeAdminCalendarItems = (items: any[] = []): CalendarItem[] =>
  items
    .map((item) => ({
      id: item?.id,
      title: String(item?.eventName || item?.meetingTitle || item?.title || 'Calendar Item').trim(),
      date: normalizeCalendarDate(item?.eventDate || item?.meetingDate || item?.date),
      time: String(item?.eventTime || item?.meetingTime || '').trim() || undefined,
      description: String(item?.description || item?.agenda || '').trim() || undefined,
      kind: (item?.meetingTitle ? 'meeting' : 'event') as 'event' | 'meeting',
      subtitle: item?.meetingTitle
        ? 'Meeting'
        : item?.eventType
        ? String(item.eventType)
        : 'Event',
    }))
    .filter((item) => item.date);

const formatCalendarTime = (value?: string) => {
  if (!value) return '';
  const raw = String(value).trim();
  if (!raw) return '';
  const [hour = '', minute = ''] = raw.split(':');
  if (!hour || !minute) return raw;
  return `${hour.padStart(2, '0')}:${minute.padStart(2, '0')}`;
};

const formatCalendarDateLabel = (value: string) =>
  new Date(value).toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });

// Same response-shape handling used in AdiminAcademicsNew.jsx (getArrayPayload)
const getArrayPayload = (payload: any) => {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.data)) return payload.data;
  if (Array.isArray(payload?.rows)) return payload.rows;
  if (Array.isArray(payload?.results)) return payload.results;
  return [];
};

const readAdminCalendarItems = async (response: Response) => {
  if (!response.ok) return [];
  const payload = await response.json().catch(() => ({}));
  return Array.isArray(payload?.data) ? payload.data : [];
};

/* ---------------- CALENDAR SUB-COMPONENT ---------------- */
/* ---------------- CALENDAR SUB-COMPONENT ---------------- */

const CalendarView: React.FC<{ studentData: any; appStyles: any; refreshKey: number }> = ({
  studentData,
  appStyles,
  refreshKey,
}) => {
  const [currentYear, setCurrentYear] = useState(new Date().getFullYear());
  const [currentMonthIndex, setCurrentMonthIndex] = useState(new Date().getMonth());
  const [events, setEvents] = useState<CalendarItem[]>([]);
  const [requests, setRequests] = useState<any[]>([]);
  const [approvedExtraClasses, setApprovedExtraClasses] = useState<any[]>([]);
  const [attendanceByDate, setAttendanceByDate] = useState<Record<string, AttendanceStatus>>({});
  const [modalVisible, setModalVisible] = useState(false);
  const [selectedDayItems, setSelectedDayItems] = useState<CalendarItem[]>([]);
  const [selectedDateLabel, setSelectedDateLabel] = useState('');
  const [selectedEvent, setSelectedEvent] = useState<any>(null);

  useEffect(() => {
    fetchEvents();
  }, [currentYear, currentMonthIndex, studentData?.schoolCode, refreshKey]);

  useEffect(() => {
    let active = true;

    const fetchAttendance = async () => {
      try {
        const schoolCode = String(
          studentData?.schoolCode || (await AsyncStorage.getItem('schoolCode')) || ''
        ).trim();
        const studentName = String(studentData?.name || studentData?.username || '').trim();

        if (!schoolCode || !studentName) {
          if (active) setAttendanceByDate({});
          return;
        }

        const res = await axios.get(
          `http://162.215.210.38:3010/over-all-reports/attendance/${encodeURIComponent(studentName)}`,
          { params: { schoolCode } }
        );

        if (!active) return;

        const nextAttendance: Record<string, AttendanceStatus> = {};
        const addRows = (rows: any[], status: AttendanceStatus) => {
          (Array.isArray(rows) ? rows : []).forEach((row) => {
            const dateKey = normalizeCalendarDate(row?.date);
            if (!dateKey) return;
            if (status === 'absent' || !nextAttendance[dateKey]) {
              nextAttendance[dateKey] = status;
            }
          });
        };

        addRows(res.data?.presentDetails, 'present');
        addRows(res.data?.informedDetails, 'absent');
        addRows(res.data?.uninformedDetails, 'absent');
        setAttendanceByDate(nextAttendance);
      } catch (error) {
        console.error('Error fetching attendance for calendar:', error);
        if (active) setAttendanceByDate({});
      }
    };

    fetchAttendance();
    return () => {
      active = false;
    };
  }, [studentData?.name, studentData?.schoolCode, studentData?.username, refreshKey]);

  const fetchEvents = async () => {
    try {
      const schoolCode = String(
        studentData?.schoolCode || (await AsyncStorage.getItem('schoolCode')) || ''
      );
      if (!schoolCode) {
        setEvents([]);
        return;
      }
      const [eventRes, meetingRes] = await Promise.all([
        fetch(
          `${ADMIN_API_BASE}/admin-events?schoolCode=${encodeURIComponent(schoolCode)}&year=${encodeURIComponent(
            String(currentYear)
          )}&month=${encodeURIComponent(String(currentMonthIndex + 1))}`
        ),
        fetch(
          `${ADMIN_API_BASE}/admin-meetings?schoolCode=${encodeURIComponent(schoolCode)}&year=${encodeURIComponent(
            String(currentYear)
          )}&month=${encodeURIComponent(String(currentMonthIndex + 1))}`
        ),
      ]);
      const eventItems = normalizeAdminCalendarItems(await readAdminCalendarItems(eventRes));
      const meetingItems = normalizeAdminCalendarItems(await readAdminCalendarItems(meetingRes));
      setEvents(
        [...eventItems, ...meetingItems].sort((a, b) => {
          const dateCompare = a.date.localeCompare(b.date);
          if (dateCompare !== 0) return dateCompare;
          return (a.time || '').localeCompare(b.time || '');
        })
      );
    } 
    catch (error) {
      console.error('Error fetching events:', error);
      setEvents([]);
    }
  };

  const fetchRequests = async () => {
    try {
      const schoolCode = studentData?.schoolCode;
      if (!schoolCode) {
        console.warn('❌ No schoolCode, skipping request fetch');
        return;
      }

      console.log('🌐 Fetching extra class requests for school:', schoolCode);

      // Same API used in AdiminAcademicsNew.jsx
      const res = await axios.get(
        `${EXTRA_CLASS_API_BASE}/extra-special-class-requests`,
        {
          params: { schoolCode },
        }
      );

      const items = getArrayPayload(res.data);
      console.log('✅ Extra class requests fetched:', items.length);
      setRequests(items);
    } catch (err) {
      console.error('❌ Error fetching extra class requests:', err);
      Alert.alert('Error', 'Failed to fetch extra class requests');
      setRequests([]);
    }
  };

  useEffect(() => {
    if (!studentData?.schoolCode) return;

    fetchRequests();
  }, [studentData?.schoolCode, refreshKey]);

  useEffect(() => {
    if (!studentData?.class_name) {
      setApprovedExtraClasses([]);
      return;
    }

    const className = String(studentData.class_name).trim().toLowerCase();
    const section = String(studentData.section || '').trim().toLowerCase();

    const filtered = requests.filter((row: any) => {
      const status = String(row?.status || '').toLowerCase();
      const requestClass = String(row?.class_name || row?.class || '').trim().toLowerCase();
      if (status && status !== 'approved') return false;

      if (requestClass === className) return true;
      if (section && requestClass === `${className}-${section}`) return true;
      if (section && requestClass === `${className}/${section}`) return true;
      if (section && requestClass === `${className} ${section}`) return true;
      return false;
    });

    setApprovedExtraClasses(filtered);
  }, [requests, studentData?.class_name, studentData?.section]);

  const daysInMonth = new Date(currentYear, currentMonthIndex + 1, 0).getDate();
  const today = new Date();
  const toDateKey = (value: any) => {
    if (!value) return '';
    if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}/.test(value)) {
      return value.slice(0, 10);
    }
    const d = new Date(value);
    if (isNaN(d.getTime())) return '';
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  };
  const todayKey = toDateKey(today);
  const upcomingEvents = [...events]
    .filter((item: any) => {
      const dateKey = toDateKey(item?.date);
      return !!dateKey && dateKey >= todayKey;
    })
    .sort((a: any, b: any) => toDateKey(a?.date).localeCompare(toDateKey(b?.date)));
  const upcomingExtraClasses = [...approvedExtraClasses]
    .filter((row: any) => {
      const dateKey = toDateKey(row?.request_date);
      return !!dateKey && dateKey >= todayKey;
      })
    .sort((a: any, b: any) => toDateKey(a?.request_date).localeCompare(toDateKey(b?.request_date)));
  const monthKey = `${currentYear}-${String(currentMonthIndex + 1).padStart(2, '0')}`;
  const monthExtraClasses = approvedExtraClasses.filter((row: any) => {
    const dateKey = toDateKey(row?.request_date);
    return !!dateKey && dateKey.startsWith(monthKey);
  });
  const calendarGraphLabels = ['Events', 'Extra classes'];
  const calendarGraphData = [events.length, monthExtraClasses.length];
  const extraClassSummaryItems = upcomingExtraClasses.map((item: any) => ({
    id: item?.id,
    title: `Extra Class: ${item?.class_name || item?.class || studentData?.class_name || 'Class'}`,
    date: toDateKey(item?.request_date),
    description: item?.start_time
      ? `Time: ${formatCalendarTime(item.start_time)}`
      : item?.teacher_name
      ? `Teacher: ${item.teacher_name}`
      : 'Extra class approved',
    kind: 'event' as const,
    subtitle: 'Approved Extra Class',
  }));
  const days: React.ReactNode[] = [];
  const firstDay = new Date(currentYear, currentMonthIndex, 1).getDay();

  for (let i = 0; i < firstDay; i++) {
    days.push(<View key={`empty-${i}`} style={styles.emptyDay} />);
  }

  for (let d = 1; d <= daysInMonth; d++) {
    const dayKey = `${currentYear}-${String(currentMonthIndex + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    const dayEvents = events.filter((e) => e.date === dayKey);

    const extraClass = approvedExtraClasses.find((r: any) => {
      const dt = new Date(r.request_date);
      return (
        dt.getDate() === d &&
        dt.getMonth() === currentMonthIndex &&
        dt.getFullYear() === currentYear
      );
    });

    const isToday =
      today.getDate() === d &&
      today.getMonth() === currentMonthIndex &&
      today.getFullYear() === currentYear;
    const hasEvents = dayEvents.length > 0;
    const attendanceStatus = attendanceByDate[dayKey];

    const dayStyle = [
      styles.day,
      extraClass && styles.approvedDay,
      hasEvents && styles.eventDay,
      attendanceStatus === 'present' && calendarStyles.attendancePresentDay,
      attendanceStatus === 'absent' && calendarStyles.attendanceAbsentDay,
      isToday && (attendanceStatus ? calendarStyles.attendanceTodayDay : styles.today),
    ].filter(Boolean);
    const dayTextStyle = [
      styles.dayText,
      attendanceStatus && calendarStyles.attendanceDayText,
      isToday && !attendanceStatus && styles.todayText,
    ].filter(Boolean);

    days.push(
      <TouchableOpacity
        key={`day-${d}`}
        style={dayStyle}
        onPress={() => {
          if (extraClass) {
            const classLabel = extraClass.class_name || extraClass.class || studentData?.class_name;
            const timeLabel = extraClass.start_time ? formatCalendarTime(extraClass.start_time) : '';
            setSelectedEvent({
              title: 'Extra Class Approved',
              date: extraClass.request_date,
              details: timeLabel ? `Class: ${classLabel} • ${timeLabel}` : `Class: ${classLabel}`,
            });
            setSelectedDayItems([]);
            setSelectedDateLabel('');
            setModalVisible(true);
            return;
          }

          if (hasEvents) {
            setSelectedDayItems(dayEvents);
            setSelectedDateLabel(formatCalendarDateLabel(dayKey));
            setModalVisible(true);
          }
        }}
      >
        <Text style={dayTextStyle}>{d}</Text>
      </TouchableOpacity>
    );
  }

  const goToPrevMonth = () => {
    setCurrentMonthIndex(prev => {
      if (prev === 0) {
        setCurrentYear(y => y - 1);
        return 11;
      }
      return prev - 1;
    });
  };

  const goToNextMonth = () => {
    setCurrentMonthIndex(prev => {
      if (prev === 11) {
        setCurrentYear(y => y + 1);
        return 0;
      }
      return prev + 1;
    });
  };

  return (
    <View style={calendarStyles.calendarContent}>
      <LinearGradient
        colors={['#0D3F66', '#BFD7FA', '#F6F8FC']}
        start={{ x: 0, y: 0 }}
        end={{ x: 0, y: 1 }}
        style={calendarStyles.academicGraphSection}
      >
  
   
      </LinearGradient>

      <View style={calendarStyles.summaryRow}>
        <LinearGradient
            colors={['#080C3D', '#0B1052','#1A2D4A']}
          start={{ x: 0.05, y: 0.05 }}
          end={{ x: 0.95, y: 0.95 }}
          style={[appStyles.dashboardGridCard, calendarStyles.summaryCardLeft]}
        >
          <View style={calendarStyles.summaryGradientTopRightIcon}>
            <MaterialIcons name="event" size={24} color="#000" />
          </View>
          <View style={calendarStyles.summaryCardContent}>
            <Text style={[calendarStyles.summaryCardLabel, calendarStyles.summaryCardLabelLight]}>Events</Text>
            <Text style={[calendarStyles.summaryCardValue, calendarStyles.summaryCardValueLight]}>
              {upcomingEvents.length}
            </Text>
            <Text style={[calendarStyles.summaryCardText, calendarStyles.summaryCardTextLight]}>
              {upcomingEvents[0]
                ? `${formatCalendarDateLabel(upcomingEvents[0].date)} • ${upcomingEvents[0].title}`
                : 'No upcoming events'}
            </Text>
            
          </View>
        </LinearGradient>

        <LinearGradient
        colors={['#080C3D', '#0B1052','#1A2D4A']}
          start={{ x: 0.05, y: 0.05 }}
          end={{ x: 0.95, y: 0.95 }}
          style={[appStyles.dashboardGridCard, calendarStyles.summaryCardRight]}
        >
          <View style={calendarStyles.summaryGradientTopRightIcon}>
            <MaterialIcons name="event-note" size={24} color="#ffffffff" />
          </View>
          <View style={calendarStyles.summaryCardContent}>
            <Text style={[calendarStyles.summaryCardLabel, calendarStyles.summaryCardLabelLight]}>
              Extra Classes
            </Text>
            <Text style={[calendarStyles.summaryCardValue, calendarStyles.summaryCardValueLight]}>
              {upcomingExtraClasses.length}
            </Text>
            <Text style={[calendarStyles.summaryCardText, calendarStyles.summaryCardTextLight]}>
              {upcomingExtraClasses.length > 0
                ? `${upcomingExtraClasses.length} upcoming`
                : 'No upcoming extra classes'}
            </Text>
           
          </View>
        </LinearGradient>
      </View>

      <View style={styles.calendarContainer}>
        <View style={styles.monthNavigation}>
          <TouchableOpacity style={styles.navBtn} onPress={goToPrevMonth}>
            <Text style={{ color: '#111827', fontSize: 20, fontWeight: '900' }}>{'‹'}</Text>
          </TouchableOpacity>

          <Text style={styles.monthTitle}>
            {new Date(currentYear, currentMonthIndex).toLocaleString('default', {
              month: 'long',
            })}
          </Text>

          <TouchableOpacity style={styles.navBtn} onPress={goToNextMonth}>
            <Text style={{ color: '#111827', fontSize: 20, fontWeight: '900' }}>{'›'}</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.month}>
          <View style={styles.weekdays}>
            {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day) => (
              <Text key={day} style={styles.weekday}>
                {day}
              </Text>
            ))}
          </View>

          <View style={styles.days}>{days}</View>
        </View>
  
      </View>
<View style={calendarStyles.attendanceLegendRow}>
  <View style={calendarStyles.attendanceLegendItem}>
    {/* Change background color here to yellow */}
    <View style={[calendarStyles.attendanceLegendDot, { backgroundColor: '#FFD700' }]} />
    <Text style={calendarStyles.attendanceLegendText}>Events</Text> 
  </View>
  <View style={calendarStyles.attendanceLegendItem}>
    <View style={[calendarStyles.attendanceLegendDot, { backgroundColor: '#16A34A' }]} />
    <Text style={calendarStyles.attendanceLegendText}>Present</Text>
  </View>
  <View style={calendarStyles.attendanceLegendItem}>
    <View style={[calendarStyles.attendanceLegendDot, { backgroundColor: '#DC2626' }]} />
    <Text style={calendarStyles.attendanceLegendText}>Informed / Uninformed</Text>
  </View>
</View>
      <View style={{ marginTop: 14 }}>
        <Text style={{ fontWeight: '700', color: '#111', marginBottom: 6 }}>
          Upcoming Extra Classes
        </Text>
        {upcomingExtraClasses.length === 0 ? (
          <Text style={{ color: '#666', fontSize: 12 }}>No upcoming extra classes.</Text>
        ) : (
          <ScrollView
            horizontal
            pagingEnabled
            snapToAlignment="start"
            decelerationRate="fast"
            showsHorizontalScrollIndicator={false}
          >
            {upcomingExtraClasses.map((item: any, idx: number) => {
              const dt = new Date(item.request_date);
              return (
                <View
                  key={`${item.id || idx}-${item.request_date}`}
                  style={{
                    backgroundColor: '#f6f6f7',
                    borderWidth: 1,
                    borderColor: '#F36B79',
                    borderRadius: 8,
                    padding: 8,
                    marginRight: 10,
                  }}
                >
                  <Text style={{ color: '#1d472a', fontWeight: '600', fontSize: 12 }}>
                    {dt.toLocaleDateString()} • {item.class || studentData?.class_name}
                  </Text>
                  <Text style={{ color: '#2f5f3e', fontSize: 11, marginTop: 4 }}>
                    {item.teacher_name ? `Teacher: ${item.teacher_name}` : 'Extra class approved'}
                  </Text>
                </View>
              );
            })}
          </ScrollView>
        )}
      </View>

      {/* Modal for events */}
      <Modal visible={modalVisible} transparent animationType="slide">
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.5)' }}>
            <View style={{ backgroundColor: 'white', padding: 20, borderRadius: 10, width: '80%' }}>
                {selectedDayItems.length > 0 ? (
                  <>
                    <Text style={{ fontSize: 18, fontWeight: 'bold', color: 'black' }}>{selectedDateLabel}</Text>
                    <ScrollView style={{ maxHeight: 240 }} showsVerticalScrollIndicator={false}>
                      {selectedDayItems.map((item, index) => (
                        <View key={`${item.id || item.title}-${index}`} style={{ marginTop: 12 }}>
                          <Text style={{ fontSize: 16, fontWeight: '700', color: '#111' }}>{item.title}</Text>
                          <Text style={{ marginTop: 4, color: '#333', fontSize: 12 }}>
                            {item.kind === 'meeting' ? 'Meeting' : 'Event'}
                            {item.subtitle ? ` • ${item.subtitle}` : ''}
                            {item.time ? ` • ${formatCalendarTime(item.time)}` : ''}
                          </Text>
                          {item.description ? (
                            <Text style={{ marginTop: 4, color: '#333', fontSize: 12 }}>{item.description}</Text>
                          ) : null}
                        </View>
                      ))}
                    </ScrollView>
                  </>
                ) : selectedEvent ? (
                  <>
                    <Text style={{ fontSize: 18, fontWeight: 'bold', color: 'black' }}>{selectedEvent.title}</Text>
                    {selectedEvent.details ? (
                      <Text style={{ marginTop: 8, color: '#333' }}>{selectedEvent.details}</Text>
                    ) : null}
                  </>
                ) : null}
                <TouchableOpacity onPress={() => {
                  setModalVisible(false);
                  setSelectedDayItems([]);
                  setSelectedDateLabel('');
                  setSelectedEvent(null);
                }} style={{ marginTop: 20, padding: 10, backgroundColor: 'rgb(160, 180, 182)', borderRadius: 5 }}>
                    <Text style={{ color: 'white', textAlign: 'center' }}>Close</Text>
                </TouchableOpacity>
            </View>
        </View>
      </Modal>
    </View>
  );
};

const calendarStyles = StyleSheet.create({
  calendarContent: {
    flex: 1,
    paddingHorizontal: 16,
    paddingTop: 0,
    paddingBottom: 24,
  },
  academicGraphSection: {
    marginTop: 0,
    marginBottom: 12,
    marginHorizontal: -16,
    paddingTop: 16,
    paddingBottom: 0,
    paddingHorizontal: 16,
  },
  academicGraphSectionInner: {
    paddingHorizontal: 0,
    paddingBottom: 8,
  },
  academicGraphExplain: {
    fontSize: 12.5,
    lineHeight: 17,
    color: '#444',
    marginBottom: 8,
  },
  academicLegendRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  academicLegendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    paddingRight: 8,
  },
  academicLegendDot: {
    width: 10,
    height: 10,
    borderRadius: 999,
    marginRight: 6,
  },
  academicLegendText: {
    fontSize: 11.5,
    color: '#333',
    fontWeight: '700',
    flexShrink: 1,
  },
  academicGraphEmptyPlain: {
    minHeight: 180,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 18,
  },
  academicGraphEmptyTitlePlain: {
    fontSize: 16,
    lineHeight: 20,
    fontWeight: '900',
    color: '#111',
    marginBottom: 4,
    textAlign: 'center',
  },
  academicGraphEmptyTextPlain: {
    fontSize: 12.5,
    lineHeight: 17,
    color: '#444',
    textAlign: 'center',
  },
  academicChartPlain: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 14,
    marginTop: 14,
  },
  summaryCardLeft: {
    marginRight: 8,
  },
  summaryCardRight: {
    marginLeft: 8,
  },
  summaryCardContent: {
    flex: 1,
    width: '100%',
    alignItems: 'flex-end',
    justifyContent: 'center',
    paddingTop: 22,
    paddingBottom: 16,
    paddingHorizontal: 14,
    marginTop: 14,
  },
  summaryCardLabel: {
    fontSize: 18,
    lineHeight: 22,
    fontWeight: '800',
    color: '#ffffffff',
    textAlign: 'right',
    marginBottom: 4,
  },
  summaryCardValue: {
    fontSize: 14.5,
    lineHeight: 18,
    fontWeight: '800',
    color: '#ffffffff',
    textAlign: 'right',
    marginBottom: 6,
  },
  summaryCardText: {
    fontSize: 12,
    lineHeight: 16,
    color: '#60646C',
    textAlign: 'right',
    fontWeight: '600',
    marginBottom: 10,
  },
  summaryGradientTopRightIcon: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'absolute',
    top: 14,
    right: 14,
    backgroundColor: 'rgba(255,255,255,0.18)',
  },
  summaryCardLabelLight: {
    color: '#ffffffff',
  },
  summaryCardValueLight: {
    color: '#ffffffff',
  },
  summaryCardTextLight: {
    color: 'rgba(255,255,255,0.84)',
  },
  summaryActionButton: {
    backgroundColor: '#404040',
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  summaryActionText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '800',
  },
  attendancePresentDay: {
    backgroundColor: '#67e093ff', // Green background for Present
  },
  attendanceAbsentDay: {
    backgroundColor: '#f74b4bff', // Red background for Informed/Uninformed Absent
  },
  attendanceTodayDay: {
    borderWidth: 2,
    borderColor: '#0D3F66', // Highlights today's date if attendance is already marked
  },
  attendanceDayText: {
    color: '#000', // Ensures text is white over the red/green backgrounds
    fontWeight: '700',
  },
  attendanceLegendRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    flexWrap: 'wrap',           // Allows items to wrap nicely on smaller screens
    marginTop: 12,
    marginBottom: 12,
    paddingHorizontal: 4,
  },
  attendanceLegendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginRight: 10,            // Adds spacing between legend blocks
    marginBottom: 6,            // Backup space if items wrap to a new line
  },
  attendanceLegendDot: {
    width: 12,
    height: 12,
    borderRadius: 6,            // Perfectly circular indicator dot
    marginRight: 6,
  },
  attendanceLegendText: {
    fontSize: 12,
    color: '#374151',           // Clean, legible neutral dark color
    fontWeight: '600',
  },
});

/* ---------------- MAIN COMPONENT ---------------- */

const ParentCalender: React.FC<
  NativeStackScreenProps<RootStackParamList, 'ParentCalender'> & { embedded?: boolean }
> = ({ embedded = false }) => {
  const [academicSummary, setAcademicSummary] = useState({ grade: '-', percentage: '0.00' });
  const [totalPaid, setTotalPaid] = useState('₹0.00');
  const [totalDue, setTotalDue] = useState('₹0.00');
  const [feeSummary, setFeeSummary] = useState({ paid: '₹ 0.00', due: '₹ 0.00' });
  const { width, height } = useWindowDimensions();
  const phoneWidth = Math.min(Math.max(width - 24, 320), 390);
  const phoneHeight = Math.min(Math.max(height - 24, 720), 860);
  const appStyles = createAppStyles({ phoneWidth, phoneHeight });

const [studentData, setStudentData] = useState<any>(null);
  const { refreshKey, refreshing, onRefresh, beginRefresh, endRefresh } = useParentAutoRefresh();

const computeAcademicSummary = (performance: any[], testTypes: any[]) => {
  if (!performance.length) return { grade: '-', percentage: '0.00' };

  const fallbackTermRows = [
    { label: 'FA1', key: 'FA1' },
    { label: 'FA2', key: 'FA2' },
    { label: 'SA1', key: 'SA1' },
    { label: 'FA3', key: 'FA3' },
    { label: 'FA4', key: 'FA4' },
    { label: 'SA2', key: 'SA2' },
  ];

  const termRows = (testTypes || []).length
    ? testTypes
        .filter((row: any) => row?.key && row?.label)
        .map((row: any) => ({ key: row.key, label: row.label }))
    : fallbackTermRows;

  const getLegacyMarkForRow = (subj: any, rowKey: string) => {
    const match = String(rowKey || '').toUpperCase().match(/^(FA|SA)(\d+)$/);
    if (!match) return { mark: '-', max: 0 };

    const type = match[1];
    const index = Number(match[2]) - 1;
    const mark = type === 'FA' ? subj?.FA?.[index] : subj?.SA?.[index];
    const max = type === 'FA' ? 20 : 80;

    return { mark: mark ?? '-', max: mark === null || mark === undefined ? 0 : max };
  };

  const getMarkForRow = (subj: any, row: any) => {
    const testEntry = subj?.tests?.[row?.key];
    if (testEntry?.obtained !== null && testEntry?.obtained !== undefined) {
      return testEntry.obtained;
    }
    return getLegacyMarkForRow(subj, row?.key).mark;
  };

  const getMaxForRow = (subj: any, row: any) => {
    const testEntry = subj?.tests?.[row?.key];
    if (testEntry?.max !== null && testEntry?.max !== undefined) {
      return Number(testEntry.max) || 0;
    }
    return getLegacyMarkForRow(subj, row?.key).max;
  };

  let obtained = 0;
  let total = 0;

  performance.forEach((subj) => {
    termRows.forEach((row) => {
      const mark = getMarkForRow(subj, row);
      const maxMark = getMaxForRow(subj, row);
      const numericMark = Number(mark);

      if (
        mark !== '-' &&
        mark !== null &&
        mark !== undefined &&
        !Number.isNaN(numericMark) &&
        maxMark > 0
      ) {
        obtained += numericMark;
        total += maxMark;
      }
    });
  });

  const percentage = total > 0 ? ((obtained / total) * 100).toFixed(2) : '0.00';
  const p = Number(percentage);
  let grade = 'D';
  if (p >= 90) grade = 'A+';
  else if (p >= 80) grade = 'A';
  else if (p >= 70) grade = 'B+';
  else if (p >= 60) grade = 'B';
  else if (p >= 50) grade = 'C';

  return { grade, percentage };
};

useEffect(() => {
  const loadData = async () => {
    try {
      console.log('🔄 Attempting to load student data from AsyncStorage...');
      
      const keys = ['studentId', 'name', 'schoolCode', 'class_name', 'section', 'username'];
      const stores = await AsyncStorage.multiGet(keys);
      
      const data: any = {};
      stores.forEach(([k, v]) => { 
        if (v) {
          data[k] = v; 
        } else {
          console.warn(`⚠️ Warning: Key "${k}" is empty in AsyncStorage`);
        }
      });

      // Check if we actually got any data
      if (Object.keys(data).length > 0) {
        console.log('✅ Student Data successfully loaded:', data);
        setStudentData(data);
      } else {
        console.error('❌ No student data found. Did you select a student in ParentDetails?');
      }

    } catch (error) {
      console.error('❌ AsyncStorage Error:', error);
    }
  };

  loadData();
}, []);
const formatINR = (value: number) =>
  new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: 2,
  }).format(value);

  // Simplified Fee/Academic logic (re-using your logic from file 2)
useEffect(() => {
    if (!studentData) {
      console.log('⚠️ fetchSummaries skipped: studentData is null');
      return;
    }

    const fetchSummaries = async () => {
      try {
        beginRefresh();
        console.log('🚀 Starting Summary Fetches for:', studentData.name);

        // --- Fetch Academics ---
        const acadPayload = {
          name: studentData.name,
          class_name: studentData.class_name,
          section: studentData.section,
          schoolCode: studentData.schoolCode,
        };
        console.log('📡 Fetching Academics with payload:', acadPayload);

        const acadRes = await axios.post('http://162.15.210.38:3010/api/overall/academic-performance', acadPayload);
        const performance = Array.isArray(acadRes.data)
          ? acadRes.data
          : Array.isArray(acadRes.data?.performance)
          ? acadRes.data.performance
          : Array.isArray(acadRes.data?.data)
          ? acadRes.data.data
          : [];
        const testTypes = Array.isArray(acadRes.data?.testTypes) ? acadRes.data.testTypes : [];
        console.log('📦 Academic Raw Data:', performance);

        const summary = computeAcademicSummary(performance, testTypes);
        console.log(`📊 Academic Summary: ${summary.grade} (${summary.percentage}%)`);
        setAcademicSummary(summary);

        // --- Fetch Fees ---
        const feePayload = {
          studentId: studentData.studentId,
          schoolCode: studentData.schoolCode,
        };
        console.log('📡 Fetching Fees with payload:', feePayload);

        const feeRes = await axios.post('https://cleezoclass.com:4000/api/studentFees', feePayload);
        const f = feeRes.data?.feeDetails || {};
        console.log('📦 Fees Raw Data:', f);

        const paidAmount = 
          Number(f.Paid_Amount ?? 0) + Number(f.Admission_paid ?? 0) +
          Number(f.books_paid ?? 0) + Number(f.uniform_paid ?? 0) +
          Number(f.bus_paid ?? 0) + Number(f.exam_paid ?? 0) + Number(f.others_paid ?? 0);
        
        const totalAmount = Number(f.Final_Amount ?? f.CompleteFee ?? 0);
        const dueAmount = totalAmount - paidAmount;

        console.log(`💰 Fees Calc: Total(${totalAmount}) - Paid(${paidAmount}) = Due(${dueAmount})`);

        setFeeSummary({
          paid: formatINR(paidAmount),
          due: formatINR(dueAmount)
        });

      } catch (err) {
        console.error("❌ Summary fetch error:", err);
      } finally {
        endRefresh();
      }
    };

    fetchSummaries();
  }, [studentData, refreshKey, beginRefresh, endRefresh]);

  const embeddedHeight = Math.max(phoneHeight * 0.78, 620);

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="dark-content" />
      <ScrollView
        style={styles.scrollView}
        nestedScrollEnabled
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor="#0D3F66"
            colors={['#0D3F66']}
          />
        }
      >
        <View style={embedded ? [styles.container, { padding: 0 }] : { padding: 0 }}>
          {studentData ? (
            <CalendarView studentData={studentData} appStyles={appStyles} refreshKey={refreshKey} />
          ) : (
            <ActivityIndicator size="large" color="#000" />
          )}
        </View>
      </ScrollView>
      <ParentFooter/>
    </SafeAreaView>
  );
};

export default ParentCalender;

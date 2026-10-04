import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Linking,
  SafeAreaView,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  Pressable,
  TouchableOpacity,
  View,
  useWindowDimensions,
  Dimensions,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import axios from 'axios';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { WebView } from 'react-native-webview';
import LinearGradient from 'react-native-linear-gradient';

import { createAppStyles } from '../App.styles';
import { RootStackParamList } from '../types';
import ParentFooter from './ParentFooter';

// NOTE: add 'BusStudentDashboard: undefined;' to RootStackParamList in ../types
// and register this screen in your navigator, the same way BusDriverDashboard is registered.
type Props = NativeStackScreenProps<RootStackParamList, 'BusStudentDashboard'>;
const { height } = Dimensions.get('window');

type StudentProfile = {
  username: string;
  name: string;
  schoolCode: string;
  userType: string;
  className: string;
  section: string;
};

type StudentRoute = {
  id: number;
  routeName: string;
  origin: string | null;
  destination: string | null;
  vehicleNumber: string | null;
  driverName: string | null;
  busStartingTime: string | null;
  driverExperience: string | null;
};

type StudentStop = {
  id: number;
  stopName: string | null;
  stopAddress: string | null;
};

type StudentDriverProfile = {
  name: string | null;
  phoneNumber: string | null;
  busNumber: string | null;
  helperName: string | null;
  status: string | null;
};

type LiveBusLocation = {
  driverUsername: string;
  driverName: string | null;
  busNumber: string | null;
  routeId: number | null;
  routeName: string | null;
  vehicleNumber: string | null;
  latitude: number;
  longitude: number;
  accuracy: number | null;
  speed: number | null;
  heading: number | null;
  updatedAt: string | null;
};

type MapPoint = {
  latitude: number;
  longitude: number;
  title: string;
  description: string;
};

const API_BASE = 'http://162.215.210.38:3010/api';
const DEBUG_BUS_STUDENT = true;
const LIVE_LOCATION_POLL_MS = 8000;
const statsGradientColors = ['#080C3D', '#0B1052','#1A2D4A']as const;

const normalizeKey = (value: any) =>
  String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '');

const matchesKey = (left: any, right: any) => {
  const a = normalizeKey(left);
  const b = normalizeKey(right);
  return Boolean(a && b && a === b);
};

const hashAddress = (value: string) => {
  let hash = 0;
  const input = String(value || '').trim().toLowerCase();
  for (let index = 0; index < input.length; index += 1) {
    hash = (hash * 31 + input.charCodeAt(index)) % 100000;
  }
  return hash;
};

// Haversine distance in kilometers between two lat/lng points.
const distanceKm = (a: MapPoint | null, b: MapPoint | null) => {
  if (!a || !b) return null;
  const toRad = (value: number) => (value * Math.PI) / 180;
  const earthRadiusKm = 6371;
  const dLat = toRad(b.latitude - a.latitude);
  const dLng = toRad(b.longitude - a.longitude);
  const lat1 = toRad(a.latitude);
  const lat2 = toRad(b.latitude);

  const h =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.sin(dLng / 2) * Math.sin(dLng / 2) * Math.cos(lat1) * Math.cos(lat2);
  const c = 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
  return earthRadiusKm * c;
};

const formatEta = (km: number | null, speedMetersPerSecond: number | null) => {
  if (km === null) return 'Calculating...';
  if (km < 0.15) return 'Arriving now';

  const speedKmh = speedMetersPerSecond && speedMetersPerSecond > 0.5 ? speedMetersPerSecond * 3.6 : 22;
  const minutes = Math.max(1, Math.round((km / speedKmh) * 60));
  return `${minutes} min`;
};

const buildStudentMapHtml = (
  schoolPoint: MapPoint | null,
  routePoints: MapPoint[],
  stopPoint: MapPoint | null,
  liveBus: LiveBusLocation | null,
) => {
  const payload = { schoolPoint, routePoints, stopPoint, liveBus };

  return `
<!DOCTYPE html>
<html>
  <head>
    <meta name="viewport" content="initial-scale=1, maximum-scale=1, user-scalable=no" />
    <style>
      html, body, #map {
        margin: 0;
        width: 100%;
        height: 100%;
        background: #F5F8FB;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      }
      .popup-title { font-size: 13px; font-weight: 700; margin-bottom: 4px; }
      .popup-subtitle { font-size: 11px; color: #555; }
      .school-dot, .route-dot {
        width: 16px;
        height: 16px;
        border-radius: 999px;
        background: #FFFFFF;
        border: 3px solid #1C1C1C;
        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
      }
      .route-dot { border-color: var(--route-color, #3C7BF4); }
      .stop-marker {
        width: 34px;
        height: 34px;
        border-radius: 999px;
        display: flex;
        align-items: center;
        justify-content: center;
        background: #FFFFFF;
        border: 3px solid #E05A47;
        box-shadow: 0 3px 10px rgba(0, 0, 0, 0.18);
        font-size: 17px;
        line-height: 1;
      }
      .live-bus-marker {
        width: 38px;
        height: 38px;
        border-radius: 999px;
        display: flex;
        align-items: center;
        justify-content: center;
        background: #16A34A;
        border: 3px solid #FFFFFF;
        box-shadow: 0 4px 12px rgba(22, 163, 74, 0.36);
        color: #FFFFFF;
        font-size: 19px;
        line-height: 1;
      }
      .live-bus-pulse {
        width: 52px;
        height: 52px;
        margin: -45px 0 0 -7px;
        border-radius: 999px;
        background: rgba(22, 163, 74, 0.18);
        animation: pulse 1.6s infinite ease-out;
      }
      @keyframes pulse {
        0% { transform: scale(0.72); opacity: 0.9; }
        100% { transform: scale(1.2); opacity: 0; }
      }
      .zoom-controls {
        position: absolute;
        top: 12px;
        left: 12px;
        z-index: 1000;
        display: flex;
        flex-direction: column;
        overflow: hidden;
        border-radius: 10px;
        box-shadow: 0 6px 14px rgba(0, 0, 0, 0.18);
      }
      .zoom-btn {
        width: 42px;
        height: 42px;
        border: 0;
        background: #FFFFFF;
        color: #0F172A;
        font-size: 24px;
        font-weight: 800;
        line-height: 42px;
        text-align: center;
        padding: 0;
      }
      .zoom-btn + .zoom-btn {
        border-top: 1px solid #E2E8F0;
      }
    </style>
    <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
    <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
  </head>
  <body>
    <div id="map"></div>
    <div class="zoom-controls">
      <button id="zoom-in" class="zoom-btn" type="button">+</button>
      <button id="zoom-out" class="zoom-btn" type="button">−</button>
    </div>
    <script>
      (function () {
        const data = ${JSON.stringify(payload)};
        const map = L.map('map', { zoomControl: false, attributionControl: true });
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
          maxZoom: 19,
          attribution: '&copy; OpenStreetMap contributors',
        }).addTo(map);

        const bounds = [];
        const school = data.schoolPoint;
        const routePoints = Array.isArray(data.routePoints) ? data.routePoints : [];
        const stop = data.stopPoint;
        const liveBus = data.liveBus;

        const localCenter = liveBus || stop || school || routePoints[0] || {
          latitude: 17.385,
          longitude: 78.4867,
        };

        map.setView([localCenter.latitude, localCenter.longitude], 14);
        document.getElementById('zoom-in').addEventListener('click', function () {
          map.zoomIn();
        });
        document.getElementById('zoom-out').addEventListener('click', function () {
          map.zoomOut();
        });

        if (school) {
          const schoolMarker = L.marker([school.latitude, school.longitude], {
            icon: L.divIcon({
              className: '',
              html: '<div class="school-dot"></div>',
              iconSize: [16, 16],
              iconAnchor: [8, 8],
            }),
          }).addTo(map);
          schoolMarker.bindPopup('<div class="popup-title">' + school.title + '</div><div class="popup-subtitle">' + school.description + '</div>');
          bounds.push([school.latitude, school.longitude]);
        }

        const colors = ['#3C7BF4', '#E05A47'];
        routePoints.forEach((point, index) => {
          if (!point) return;
          const color = colors[index % colors.length];
          const marker = L.marker([point.latitude, point.longitude], {
            icon: L.divIcon({
              className: '',
              html: '<div class="route-dot" style="--route-color:' + color + '"></div>',
              iconSize: [16, 16],
              iconAnchor: [8, 8],
            }),
          }).addTo(map);
          marker.bindPopup('<div class="popup-title">' + point.title + '</div><div class="popup-subtitle">' + point.description + '</div>');

          if (school) {
            L.polyline([[school.latitude, school.longitude], [point.latitude, point.longitude]], {
              color,
              weight: 5,
              opacity: 0.85,
            }).addTo(map);
          }
          bounds.push([point.latitude, point.longitude]);
        });

        if (stop) {
          const stopMarker = L.marker([stop.latitude, stop.longitude], {
            icon: L.divIcon({
              className: '',
              html: '<div class="stop-marker">🎒</div>',
              iconSize: [34, 34],
              iconAnchor: [17, 17],
            }),
          }).addTo(map);
          stopMarker.bindPopup(
            '<div class="popup-title">' + stop.title + '</div><div class="popup-subtitle">Your stop</div><div class="popup-subtitle">' + stop.description + '</div>'
          );
          bounds.push([stop.latitude, stop.longitude]);
        }

        if (liveBus) {
          const busMarker = L.marker([liveBus.latitude, liveBus.longitude], {
            icon: L.divIcon({
              className: '',
              html: '<div class="live-bus-marker">🚌</div><div class="live-bus-pulse"></div>',
              iconSize: [38, 38],
              iconAnchor: [19, 19],
            }),
            zIndexOffset: 1000,
          }).addTo(map);
          busMarker.bindPopup(
            '<div class="popup-title">' + liveBus.title + '</div><div class="popup-subtitle">' + liveBus.description + '</div>'
          );
          bounds.push([liveBus.latitude, liveBus.longitude]);
        }

        if (bounds.length > 1) {
          map.fitBounds(bounds, { padding: [36, 36] });
        } else if (bounds.length === 1) {
          map.setView(bounds[0], 15);
        }
      })();
    </script>
  </body>
</html>`;
};

const buildRouteLabel = (route: StudentRoute | null) => {
  if (!route) return 'No assigned route';
  const origin = String(route.origin || '').trim();
  const destination = String(route.destination || '').trim();
  if (origin || destination) {
    return [origin, destination].filter(Boolean).join(' -> ');
  }
  return route.routeName || 'Assigned route';
};

const StatCard: React.FC<{ label: string; value: string; icon: string }> = ({ label, value, icon }) => (
  <LinearGradient
    colors={[...statsGradientColors]}
    start={{ x: 0.05, y: 0.05 }}
    end={{ x: 0.95, y: 0.95 }}
    style={styles.statCard}
  >
    <View style={styles.statIconWrap}>
      <Ionicons name={icon as any} size={18} color="#FFFFFF" />
    </View>
    <Text style={styles.statValue} numberOfLines={1}>
      {value}
    </Text>
    <Text style={styles.statLabel} numberOfLines={1}>
      {label}
    </Text>
  </LinearGradient>
);

const BusStudentDashboard: React.FC<Props> = ({ navigation }) => {
  const { width, height: windowHeight } = useWindowDimensions();
  const appStyles = createAppStyles({ phoneWidth: width, phoneHeight: windowHeight });

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [profile, setProfile] = useState<StudentProfile>({
    username: '',
    name: '',
    schoolCode: '',
    userType: '',
    className: '',
    section: '',
  });
  const [route, setRoute] = useState<StudentRoute | null>(null);
  const [stop, setStop] = useState<StudentStop | null>(null);
  const [driverProfile, setDriverProfile] = useState<StudentDriverProfile | null>(null);
  const [showProfile, setShowProfile] = useState(false);

  const [routeMapLoading, setRouteMapLoading] = useState(false);
  const [routeMapError, setRouteMapError] = useState<string | null>(null);
  const [schoolPoint, setSchoolPoint] = useState<MapPoint | null>(null);
  const [routePoints, setRoutePoints] = useState<MapPoint[]>([]);
  const [stopPoint, setStopPoint] = useState<MapPoint | null>(null);

  const [liveBus, setLiveBus] = useState<LiveBusLocation | null>(null);
  const [liveStatus, setLiveStatus] = useState('Waiting for your bus to start live tracking...');
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Load student profile + assigned route/stop/driver from the backend.
  useEffect(() => {
    let mounted = true;

    const loadDashboard = async () => {
      setLoading(true);
      setError(null);

      try {
        const [storedUsername, storedName, storedSchoolCode, storedUserType, storedUserDetailsRaw] =
          await Promise.all([
            AsyncStorage.getItem('username'),
            AsyncStorage.getItem('name'),
            AsyncStorage.getItem('schoolCode'),
            AsyncStorage.getItem('userType'),
            AsyncStorage.getItem('userDetails'),
          ]);

        const storedUserDetails = storedUserDetailsRaw ? JSON.parse(storedUserDetailsRaw) : {};
        const resolvedProfile: StudentProfile = {
          username: String(storedUserDetails.username || storedUserDetails.user_name || storedUsername || ''),
          name: String(storedUserDetails.name || storedName || ''),
          schoolCode: String(storedUserDetails.schoolCode || storedSchoolCode || ''),
          userType: String(storedUserDetails.userType || storedUserType || ''),
          className: String(storedUserDetails.class_name || storedUserDetails.className || ''),
          section: String(storedUserDetails.section || ''),
        };

        if (!mounted) return;
        setProfile(resolvedProfile);

        if (DEBUG_BUS_STUDENT) {
          console.log('[BusStudentDashboard] resolved profile', resolvedProfile);
        }

        if (!resolvedProfile.schoolCode.trim() || !resolvedProfile.username.trim()) {
          setError('Student account details not found. Please log in again.');
          return;
        }

        const response = await axios.get(`${API_BASE}/bus-student/dashboard`, {
          params: {
            schoolCode: resolvedProfile.schoolCode,
            username: resolvedProfile.username,
          },
        });

        if (!mounted) return;

        const payload = response.data?.data || {};
        const nextRoute = payload.route || null;
        const nextStop = payload.stop || null;
        const nextDriverProfile = payload.driverProfile || null;

        setRoute(
          nextRoute
            ? {
                id: Number(nextRoute.id),
                routeName: String(nextRoute.routeName || ''),
                origin: nextRoute.origin || null,
                destination: nextRoute.destination || null,
                vehicleNumber: nextRoute.vehicleNumber || null,
                driverName: nextRoute.driverName || null,
                busStartingTime: nextRoute.busStartingTime || null,
                driverExperience: nextRoute.driverExperience || null,
              }
            : null,
        );
        setStop(
          nextStop
            ? {
                id: Number(nextStop.id),
                stopName: nextStop.stopName || null,
                stopAddress: nextStop.stopAddress || null,
              }
            : null,
        );
        setDriverProfile(
          nextDriverProfile
            ? {
                name: nextDriverProfile.name || null,
                phoneNumber: nextDriverProfile.phoneNumber || null,
                busNumber: nextDriverProfile.busNumber || null,
                helperName: nextDriverProfile.helperName || null,
                status: nextDriverProfile.status || null,
              }
            : null,
        );

        if (!nextRoute) {
          setError('No bus route is assigned to you yet. Check with your school office.');
        }
      } catch (fetchError: any) {
        if (!mounted) return;
        setRoute(null);
        setStop(null);
        setDriverProfile(null);
        setError(fetchError?.response?.data?.message || 'Unable to load your bus details.');
      } finally {
        if (mounted) setLoading(false);
      }
    };

    loadDashboard();

    return () => {
      mounted = false;
    };
  }, []);

  // Resolve the school point, route origin/destination points, and this
  // student's stop point (real geocode if we have a stop address, otherwise
  // an approximate point near the route so the map still has something to show).
  useEffect(() => {
    let cancelled = false;

    const loadStudentMap = async () => {
      if (!profile.schoolCode.trim() || !route) {
        setSchoolPoint(null);
        setRoutePoints([]);
        setStopPoint(null);
        return;
      }

      setRouteMapLoading(true);
      setRouteMapError(null);

      try {
        const schoolResponse = await axios.post(`${API_BASE}/bus-manager/school-coordinates`, {
          schoolCode: profile.schoolCode,
        });

        const nextSchoolPoint: MapPoint = {
          latitude: Number(schoolResponse.data?.latitude),
          longitude: Number(schoolResponse.data?.longitude),
          title: String(schoolResponse.data?.title || 'Institute'),
          description: String(schoolResponse.data?.description || ''),
        };

        const geocodeMaybe = async (address: string) => {
          const trimmed = String(address || '').trim();
          if (!trimmed) return null;
          try {
            const geoResponse = await axios.post(`${API_BASE}/bus-manager/geocode`, { address: trimmed });
            const latitude = Number(geoResponse.data?.latitude);
            const longitude = Number(geoResponse.data?.longitude);
            if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
            return { latitude, longitude, title: trimmed, description: trimmed } as MapPoint;
          } catch (geoError: any) {
            if (DEBUG_BUS_STUDENT) {
              console.warn('[BusStudentDashboard] geocode skipped', {
                address: trimmed,
                message: geoError?.response?.data?.message || geoError?.message || String(geoError),
              });
            }
            return null;
          }
        };

        const routeAddresses = [route.origin, route.destination]
          .map((address, index) => ({ address: String(address || '').trim(), label: index === 0 ? 'Origin' : 'Destination' }))
          .filter((item) => Boolean(item.address));

        const nextRoutePoints = (
          await Promise.all(
            routeAddresses.map(async ({ address, label }) => {
              const point = await geocodeMaybe(address);
              return point
                ? { ...point, title: `${label}: ${address}`, description: `${route.routeName} • ${address}` }
                : null;
            }),
          )
        ).filter(Boolean) as MapPoint[];

        // Prefer a real geocode of the stop address; fall back to an approximate
        // point near the route so the student still sees roughly where they are.
        let nextStopPoint: MapPoint | null = null;
        const stopAddress = String(stop?.stopAddress || profile.username ? stop?.stopAddress : '').trim();
        if (stopAddress) {
          const geocoded = await geocodeMaybe(stopAddress);
          if (geocoded) {
            nextStopPoint = { ...geocoded, title: stop?.stopName || 'Your stop', description: stopAddress };
          }
        }

        if (!nextStopPoint) {
          const anchor = nextRoutePoints[0] || nextRoutePoints[1] || nextSchoolPoint;
          const seed = hashAddress(`${profile.username}-${stopAddress || route.destination || route.routeName}`);
          const latOffset = ((seed % 17) - 8) / 900;
          const lngOffset = ((Math.floor(seed / 17) % 17) - 8) / 900;
          nextStopPoint = {
            latitude: anchor.latitude + latOffset,
            longitude: anchor.longitude + lngOffset,
            title: stop?.stopName || 'Your stop (approximate)',
            description: stopAddress || 'Approximate area based on your route',
          };
        }

        if (cancelled) return;
        setSchoolPoint(nextSchoolPoint);
        setRoutePoints(nextRoutePoints);
        setStopPoint(nextStopPoint);
      } catch (mapError: any) {
        if (cancelled) return;
        if (DEBUG_BUS_STUDENT) {
          console.warn('[BusStudentDashboard] route map load error', {
            message: mapError?.response?.data?.message || mapError?.message || String(mapError),
          });
        }
        setSchoolPoint(null);
        setRoutePoints([]);
        setStopPoint(null);
        setRouteMapError('Unable to load the map right now.');
      } finally {
        if (!cancelled) setRouteMapLoading(false);
      }
    };

    void loadStudentMap();

    return () => {
      cancelled = true;
    };
  }, [profile.schoolCode, profile.username, route, stop]);

  // Poll the manager's live driver-locations feed and pick out this
  // student's bus by route id (falling back to driver name / bus number).
  useEffect(() => {
    let cancelled = false;

    const pollLiveLocation = async () => {
      if (!profile.schoolCode.trim() || !route) {
        setLiveStatus('Waiting for route assignment');
        return;
      }

      try {
        const response = await axios.get(`${API_BASE}/bus-manager/driver-locations`, {
          params: { schoolCode: profile.schoolCode },
        });

        if (cancelled) return;

        const items: any[] = Array.isArray(response.data?.data?.driverLocations)
          ? response.data.data.driverLocations
          : [];

        const matched = items.find((item) => {
          const itemRouteId = item.route_id ? Number(item.route_id) : null;
          if (itemRouteId && route.id && itemRouteId === route.id) return true;
          if (matchesKey(item.driver_name, route.driverName)) return true;
          if (matchesKey(item.bus_number, route.vehicleNumber)) return true;
          return false;
        });

        if (!matched) {
          setLiveBus(null);
          setLiveStatus('Your bus has not started live tracking yet');
          return;
        }

        const latitude = Number(matched.latitude);
        const longitude = Number(matched.longitude);
        if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
          setLiveBus(null);
          setLiveStatus('Waiting for a GPS signal from your bus');
          return;
        }

        setLiveBus({
          driverUsername: String(matched.driver_username || ''),
          driverName: matched.driver_name || null,
          busNumber: matched.bus_number || null,
          routeId: matched.route_id ? Number(matched.route_id) : null,
          routeName: matched.route_name || null,
          vehicleNumber: matched.vehicle_number || null,
          latitude,
          longitude,
          accuracy: Number.isFinite(Number(matched.accuracy)) ? Number(matched.accuracy) : null,
          speed: Number.isFinite(Number(matched.speed)) ? Number(matched.speed) : null,
          heading: Number.isFinite(Number(matched.heading)) ? Number(matched.heading) : null,
          updatedAt: matched.updated_at || matched.captured_at || null,
        });
        setLiveStatus(`Live location updated ${new Date().toLocaleTimeString()}`);
      } catch (pollError: any) {
        if (cancelled) return;
        if (DEBUG_BUS_STUDENT) {
          console.warn('[BusStudentDashboard] live location poll failed', {
            message: pollError?.response?.data?.message || pollError?.message || String(pollError),
          });
        }
        setLiveStatus('Unable to fetch live location right now');
      }
    };

    void pollLiveLocation();
    pollRef.current = setInterval(pollLiveLocation, LIVE_LOCATION_POLL_MS);

    return () => {
      cancelled = true;
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    };
  }, [profile.schoolCode, route]);

  const studentMapHtml = useMemo(
    () => buildStudentMapHtml(schoolPoint, routePoints, stopPoint, liveBus),
    [liveBus, routePoints, schoolPoint, stopPoint],
  );

  const distanceToStopKm = useMemo(() => {
    if (!liveBus || !stopPoint) return null;
    return distanceKm({ latitude: liveBus.latitude, longitude: liveBus.longitude, title: '', description: '' }, stopPoint);
  }, [liveBus, stopPoint]);

  const etaLabel = useMemo(() => formatEta(distanceToStopKm, liveBus?.speed ?? null), [distanceToStopKm, liveBus]);
  const distanceLabel = distanceToStopKm === null ? '--' : `${distanceToStopKm.toFixed(1)} km`;

  const routeLabel = buildRouteLabel(route);
  const vehicleNumber = driverProfile?.busNumber || route?.vehicleNumber || '--';
  const startTime = route?.busStartingTime || '--';
  const studentLabel = profile.name || profile.username || 'Student';
  const busIsLive = Boolean(liveBus);

  const handleCallDriver = () => {
    const phone = String(driverProfile?.phoneNumber || '').trim();
    if (!phone) return;
    Linking.openURL(`tel:${phone}`).catch(() => {
      if (DEBUG_BUS_STUDENT) {
        console.warn('[BusStudentDashboard] unable to open dialer');
      }
    });
  };

  const handleLogout = async () => {
    try {
      setShowProfile(false);
      await AsyncStorage.multiRemove([
        'username',
        'name',
        'designation',
        'schoolCode',
        'userType',
        'userDetails',
        'currentStudent',
        'photoUrl',
        'photo',
      ]);
    } catch (logoutError) {
      if (DEBUG_BUS_STUDENT) {
        console.warn('[BusStudentDashboard] logout storage clear failed', logoutError);
      }
    }

    navigation.reset({
      index: 0,
      routes: [{ name: 'StudentLogin' as never }],
    });
  };

  if (loading) {
    return (
      <SafeAreaView style={appStyles.safeArea}>
        <StatusBar barStyle="dark-content" />
        <View style={styles.loadingState}>
          <ActivityIndicator size="large" color="#2563EB" />
          <Text style={styles.loadingText}>Loading your bus...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={appStyles.safeArea}>
      <StatusBar barStyle="dark-content" />
      <View style={[appStyles.screen, styles.screenSurface]}>
        <LinearGradient
          pointerEvents="none"
                 colors={['#DCEEFF', '#182B8C', '#0B1052']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.dashboardTopGradient}
        />
        <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
          <View style={styles.hero}>
            <View style={styles.heroTopRow}>
              <View style={styles.heroTextBlock}>
                <Text style={styles.title}>Hi, {studentLabel}</Text>
              </View>
            </View>

            <View style={styles.profileRow}>
              <View style={styles.profilePill}>
                <Ionicons name="location-outline" size={14} color="#334155" />
                <Text style={styles.profilePillText}>{routeLabel}</Text>
              </View>
              <View style={styles.profilePill}>
                <Ionicons
                  name={busIsLive ? 'radio-button-on' : 'radio-button-off-outline'}
                  size={14}
                  color={busIsLive ? '#16A34A' : '#94A3B8'}
                />
                <Text style={styles.profilePillText}>{busIsLive ? 'Bus is live' : 'Bus offline'}</Text>
              </View>
            </View>

            {error ? (
              <View style={styles.errorBox}>
                <Ionicons name="warning-outline" size={16} color="#B91C1C" />
                <Text style={styles.errorText}>{error}</Text>
              </View>
            ) : null}
          </View>

          <LinearGradient
            colors={['#6826df', '#a174eb', '#1A2D4A']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.panel}
          >
            <View style={styles.panelHeader}>
              <Text style={styles.panelTitle}>Track Your Bus</Text>
              <Text style={[styles.panelBadge, busIsLive ? styles.panelBadgeSuccess : styles.panelBadgeMuted]}>
                {busIsLive ? 'Live' : 'Offline'}
              </Text>
            </View>

            <Text style={styles.panelSubtitle}>
              {route ? liveStatus : 'A route will appear here once the school assigns you one.'}
            </Text>

            <View style={styles.routeMapCard}>
              {routeMapLoading ? (
                <View style={styles.routeMapFallback}>
                  <Text style={styles.routeMapFallbackText}>Loading map...</Text>
                </View>
              ) : schoolPoint || routePoints.length > 0 || stopPoint ? (
                <WebView
                  key={`student-map-${profile.schoolCode}-${route?.id || 'none'}-${liveBus?.latitude || ''}-${liveBus?.longitude || ''}`}
                  originWhitelist={['*']}
                  source={{ html: studentMapHtml }}
                  style={styles.routeMapWebView}
                  javaScriptEnabled
                  domStorageEnabled
                  startInLoadingState
                  renderLoading={() => (
                    <View style={styles.routeMapFallback}>
                      <Text style={styles.routeMapFallbackText}>Loading map...</Text>
                    </View>
                  )}
                />
              ) : (
                <View style={styles.routeMapFallback}>
                  <Text style={styles.routeMapFallbackText}>
                    {routeMapError || 'The map will appear once your route is available.'}
                  </Text>
                </View>
              )}
            </View>
          </LinearGradient>

          <View style={styles.statsGrid}>
            <StatCard label="Distance to you" value={distanceLabel} icon="navigate-outline" />
            <StatCard label="ETA" value={etaLabel} icon="time-outline" />
            <StatCard label="Vehicle" value={vehicleNumber} icon="bus-outline" />
            <StatCard label="Start time" value={startTime} icon="alarm-outline" />
          </View>

          <View style={styles.panel1}>
            <View style={styles.panelHeader}>
              <Text style={styles.panelTitle}>Driver</Text>
              {driverProfile?.status ? <Text style={styles.panelBadge}>{driverProfile.status}</Text> : null}
            </View>
            <View style={styles.studentRow}>
              <View style={styles.studentAvatar}>
                <Text style={styles.studentAvatarText}>
                  {(driverProfile?.name || route?.driverName || 'D').trim().charAt(0).toUpperCase()}
                </Text>
              </View>
              <View style={styles.studentTextBlock}>
                <Text style={styles.studentName} numberOfLines={1}>
                  {driverProfile?.name || route?.driverName || 'Not assigned yet'}
                </Text>
                <Text style={styles.studentMeta} numberOfLines={1}>
                  {vehicleNumber} {driverProfile?.helperName ? `• Helper: ${driverProfile.helperName}` : ''}
                </Text>
              </View>
              {driverProfile?.phoneNumber ? (
                <TouchableOpacity onPress={handleCallDriver} style={styles.callButton} activeOpacity={0.85}>
                  <Ionicons name="call-outline" size={16} color="#FFFFFF" />
                </TouchableOpacity>
              ) : null}
            </View>
          </View>

          <View style={styles.panel1}>
            <Text style={styles.panelTitle}>Your Stop</Text>
            <Text style={styles.routeName}>{stop?.stopName || 'Not assigned yet'}</Text>
            <Text style={styles.routeMeta}>{stop?.stopAddress || 'Ask your school office to assign a pickup stop.'}</Text>
          </View>

          <View style={styles.panel1}>
            <Text style={styles.panelTitle}>Route Details</Text>
            <View style={styles.agendaRow}>
              <View style={styles.agendaTimeWrap}>
                <Text style={styles.agendaTime}>{startTime}</Text>
              </View>
              <View style={styles.agendaDotColumn}>
                <View style={styles.agendaDot} />
                <View style={styles.agendaLine} />
              </View>
              <Text style={styles.agendaTask}>{route ? `Start from ${route.origin || 'assigned origin'}` : 'No route assigned'}</Text>
            </View>
            <View style={styles.agendaRow}>
              <View style={styles.agendaTimeWrap}>
                <Text style={styles.agendaTime}>{route?.destination || '--'}</Text>
              </View>
              <View style={styles.agendaDotColumn}>
                <View style={styles.agendaDot} />
              </View>
              <Text style={styles.agendaTask}>{route ? `Ends at ${route.destination || 'assigned destination'}` : 'No destination yet'}</Text>
            </View>
          </View>
        </ScrollView>

   
<ParentFooter/>
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  scrollContent: {
    padding: 16,
    paddingBottom: 32,
  },
  screenSurface: {
    backgroundColor: '#F6F7FB',
  },
  loadingState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
    fontWeight: '700',
    color: '#475569',
  },
  hero: {
    backgroundColor: 'transparent',
    borderRadius: 24,
    padding: 18,
    shadowOpacity: 0.06,
    shadowRadius: 16,
  },
  heroTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 12,
  },
  heroTextBlock: {
    flex: 1,
  },
  title: {
    fontSize: 26,
    lineHeight: 32,
    fontWeight: '900',
    color: '#0F172A',
  },
  profileRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 16,
  },
  profilePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: '#F1F5F9',
  },
  profilePillText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#334155',
  },
  errorBox: {
    marginTop: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FECACA',
  },
  errorText: {
    flex: 1,
    fontSize: 12.5,
    lineHeight: 17,
    color: '#991B1B',
    fontWeight: '700',
  },
  panel: {
    marginTop: 16,
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    padding: 18,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    height: height * 0.6,
  },
  panel1: {
    marginTop: 16,
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    padding: 18,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  panelHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  panelTitle: {
    fontSize: 18,
    fontWeight: '900',
    color: '#0F172A',
  },
  panelSubtitle: {
    marginTop: 2,
    marginBottom: 12,
    fontSize: 12,
    lineHeight: 18,
    color: '#fff',
    fontWeight: '600',
  },
  panelBadge: {
    fontSize: 12,
    fontWeight: '800',
    color: '#15803D',
    backgroundColor: '#DCFCE7',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    overflow: 'hidden',
  },
  panelBadgeSuccess: {
    color: '#15803D',
    backgroundColor: '#DCFCE7',
  },
  panelBadgeMuted: {
    color: '#475569',
    backgroundColor: '#E2E8F0',
  },
  routeName: {
    fontSize: 16,
    fontWeight: '800',
    color: '#111827',
    marginTop: 2,
  },
  routeMeta: {
    marginTop: 4,
    fontSize: 13,
    color: '#64748B',
  },
  routeMapCard: {
    height: height * 0.45,
    borderRadius: 18,
    overflow: 'hidden',
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  routeMapWebView: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  routeMapFallback: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
    backgroundColor: '#F8FAFC',
  },
  routeMapFallbackText: {
    fontSize: 13,
    lineHeight: 18,
    color: '#64748B',
    textAlign: 'center',
    fontWeight: '600',
  },
  statsGrid: {
    marginTop: 16,
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    gap: 10,
  },
  statCard: {
    width: '48%',
    borderRadius: 20,
    padding: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.28)',
    overflow: 'hidden',
  },
  statIconWrap: {
    width: 34,
    height: 34,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
    backgroundColor: 'rgba(255,255,255,0.22)',
  },
  statValue: {
    fontSize: 22,
    fontWeight: '900',
    color: '#FFFFFF',
  },
  statLabel: {
    marginTop: 4,
    fontSize: 12,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.88)',
  },
  studentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 4,
  },
  studentAvatar: {
    width: 40,
    height: 40,
    borderRadius: 14,
    backgroundColor: '#E2E8F0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  studentAvatarText: {
    fontSize: 14,
    fontWeight: '900',
    color: '#0F172A',
  },
  studentTextBlock: {
    flex: 1,
    minWidth: 0,
  },
  studentName: {
    fontSize: 14,
    fontWeight: '800',
    color: '#0F172A',
  },
  studentMeta: {
    marginTop: 2,
    fontSize: 12,
    fontWeight: '600',
    color: '#64748B',
  },
  callButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#16A34A',
    alignItems: 'center',
    justifyContent: 'center',
  },
  agendaRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    marginTop: 14,
  },
  agendaTimeWrap: {
    width: 90,
  },
  agendaTime: {
    fontSize: 12,
    color: '#2563EB',
    fontWeight: '800',
  },
  agendaDotColumn: {
    width: 16,
    alignItems: 'center',
  },
  agendaDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#2563EB',
    marginTop: 3,
  },
  agendaLine: {
    width: 2,
    flex: 1,
    backgroundColor: '#CBD5E1',
    marginTop: 4,
  },
  agendaTask: {
    flex: 1,
    fontSize: 13,
    lineHeight: 18,
    color: '#334155',
    fontWeight: '600',
    paddingBottom: 2,
  },
  profileOverlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 40,
    backgroundColor: 'rgba(15, 23, 42, 0.45)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  profileCard: {
    width: '100%',
    maxWidth: 420,
    borderRadius: 24,
    backgroundColor: '#FFFFFF',
    padding: 18,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#0F172A',
    shadowOpacity: 0.14,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 12 },
    elevation: 8,
  },
  profileCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  profileAvatar: {
    width: 52,
    height: 52,
    borderRadius: 18,
    backgroundColor: '#E2E8F0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  profileAvatarText: {
    fontSize: 18,
    fontWeight: '900',
    color: '#0F172A',
  },
  profileHeaderText: {
    flex: 1,
  },
  profileTitle: {
    fontSize: 18,
    fontWeight: '900',
    color: '#0F172A',
  },
  profileSubtitle: {
    marginTop: 4,
    fontSize: 13,
    lineHeight: 18,
    color: '#64748B',
    fontWeight: '600',
  },
  profileSummaryRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 14,
  },
  profileSummaryPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: '#F1F5F9',
  },
  profileSummaryText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#334155',
  },
  profileDetailsGridExpanded: {
    marginTop: 14,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  profileDetailItemExpanded: {
    width: '48%',
    minHeight: 56,
    borderRadius: 16,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  profileDetailLabel: {
    fontSize: 11,
    fontWeight: '800',
    color: '#64748B',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  profileDetailValue: {
    marginTop: 4,
    fontSize: 13,
    fontWeight: '800',
    color: '#0F172A',
  },
  profileActions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 14,
  },
  profileActionButton: {
    flex: 1,
    minHeight: 44,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
  },
  profileActionPrimary: {
    backgroundColor: '#0F172A',
  },
  profileActionSecondary: {
    backgroundColor: '#E2E8F0',
  },
  profileActionText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  profileActionTextSecondary: {
    color: '#0F172A',
  },
  profileLogoutButton: {
    marginTop: 10,
    backgroundColor: '#FEE2E2',
    borderWidth: 1,
    borderColor: '#FCA5A5',
  },
  profileLogoutText: {
    fontSize: 13,
    fontWeight: '900',
    color: '#DC2626',
  },
  footer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 30,
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'flex-end',
    width: '100%',
    minHeight: 68,
    flexShrink: 0,
    paddingTop: 6,
    paddingBottom: 6,
    paddingHorizontal: 0,
    backgroundColor: '#f6f6f7',
    borderTopWidth: 1,
    borderTopColor: '#ECECF0',
    elevation: 8,
  },
  footerNav: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 0,
    paddingHorizontal: 12,
    paddingBottom: 4,
  },
  footerNavItem: {
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 34,
  },
  footerNavLabel: {
    marginTop: 0,
    fontSize: 7,
    color: '#111111',
    fontWeight: '700',
  },
  footerNavLabelMuted: {
    marginTop: 0,
    fontSize: 7,
    color: '#888888',
    fontWeight: '700',
  },
  footerCenterCurve: {
    position: 'absolute',
    left: '50%',
    top: 0,
    width: 72,
    height: 18,
    marginLeft: -36,
    overflow: 'visible',
    alignItems: 'center',
    justifyContent: 'flex-start',
    pointerEvents: 'none',
  },
  footerCurveTriangle: {
    width: 0,
    height: 0,
    borderLeftWidth: 36,
    borderRightWidth: 36,
    borderBottomWidth: 14,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderBottomColor: '#f6f6f7',
    opacity: 0.95,
  },
  footerAddButton: {
    position: 'absolute',
    left: '50%',
    top: -26,
    marginLeft: -30,
    width: 60,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#16A34A',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000000',
    shadowOpacity: 0.18,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
    elevation: 4,
  },
  footerProfileBadge: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#0F172A',
    alignItems: 'center',
    justifyContent: 'center',
  },
  footerProfileInitial: {
    fontSize: 11,
    fontWeight: '900',
    color: '#FFFFFF',
  },
  footerBrandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 0,
  },
  poweredBy: {
    fontSize: 11,
    color: '#8A8A8F',
    fontWeight: '600',
  },
  logo: {
    width: 64,
    height: 18,
  },
  homeIndicator: {
    marginTop: 4,
    width: 128,
    height: 6,
    borderRadius: 4,
    backgroundColor: '#1F1F1F',
    opacity: 0.65,
  },
  dashboardTopGradient: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 180,
    zIndex: 0,
  },
});

export default BusStudentDashboard;

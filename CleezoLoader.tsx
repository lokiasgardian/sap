import React, { useEffect, useRef } from 'react';
import {
  Animated,
  Easing,
  StyleSheet,
  Text,
  View,
} from 'react-native';

type CleezoLoaderProps = {
  message?: string;
  overlay?: boolean;
};

const logoSource = require('./assets/Cleezo.png');

const CleezoLoader: React.FC<CleezoLoaderProps> = ({
  message = 'Loading...',
  overlay = false,
}) => {
  const spin = useRef(new Animated.Value(0)).current;
  const pulse = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const spinAnimation = Animated.loop(
      Animated.timing(spin, {
        toValue: 1,
        duration: 1100,
        easing: Easing.linear,
        useNativeDriver: true,
      })
    );

    const pulseAnimation = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1,
          duration: 650,
          easing: Easing.out(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 0,
          duration: 650,
          easing: Easing.in(Easing.ease),
          useNativeDriver: true,
        }),
      ])
    );

    spinAnimation.start();
    pulseAnimation.start();

    return () => {
      spinAnimation.stop();
      pulseAnimation.stop();
    };
  }, [pulse, spin]);

  const rotate = spin.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });

  const logoScale = pulse.interpolate({
    inputRange: [0, 1],
    outputRange: [0.96, 1.04],
  });

  return (
    <View
      pointerEvents={overlay ? 'auto' : 'none'}
      style={[styles.container, overlay && styles.overlay]}
    >
      <View style={styles.loaderCard}>
        <Animated.View style={[styles.ring, { transform: [{ rotate }] }]} />
        <Animated.Image
          source={logoSource}
          resizeMode="contain"
          style={[styles.logo, { transform: [{ scale: logoScale }] }]}
        />
        <Text style={styles.message}>{message}</Text>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 9999,
    elevation: 9999,
    backgroundColor: 'rgba(255,255,255,0.88)',
  },
  loaderCard: {
    width: 178,
    minHeight: 150,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ring: {
    position: 'absolute',
    width: 104,
    height: 104,
    borderRadius: 52,
    
    borderColor: '#E7EAF0',
    borderTopColor: '#6826df',
    borderRightColor: '#a174eb',
    borderBottomColor: '#1A2D4A',
  },
  logo: {
    width: 126,
    height: 70,
  },
  message: {
    marginTop: 22,
    color: '#1A2D4A',
    fontSize: 13,
    fontWeight: '700',
    textAlign: 'center',
  },
});

export default CleezoLoader;

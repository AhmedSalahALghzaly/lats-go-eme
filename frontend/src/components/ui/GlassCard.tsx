/**
 * GlassCard Component - Glassmorphism effect for Admin/Owner panels
 * Creates a frosted glass effect with blur and transparency
 */
import React from 'react';
import { View, StyleSheet, ViewStyle, Platform } from 'react-native';
import { BlurView } from 'expo-blur';
import Animated, {
  useAnimatedStyle,
  withSpring,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { useTheme } from '../../hooks/useTheme';
import { useColorMood } from '../../store/appStore';

interface GlassCardProps {
  children: React.ReactNode;
  style?: ViewStyle;
  intensity?: number;
  tint?: 'light' | 'dark' | 'default';
  borderRadius?: number;
  padding?: number;
  gradient?: boolean;
  animated?: boolean;
  glowColor?: string;
}

export const GlassCard: React.FC<GlassCardProps> = ({
  children,
  style,
  intensity = 50,
  tint = 'default',
  borderRadius = 20,
  padding = 20,
  gradient = true,
  animated = false,
  glowColor,
}) => {
  const { colors, isDark } = useTheme();
  const mood = useColorMood();
  const scale = useSharedValue(1);
  const opacity = useSharedValue(1);

  const effectiveTint = tint === 'default' ? (isDark ? 'dark' : 'light') : tint;
  const effectiveGlowColor = glowColor || mood.primary;

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
    opacity: opacity.value,
  }));

  // For web/Android fallback
  const fallbackBgColor = isDark
    ? 'rgba(30, 30, 50, 0.85)'
    : 'rgba(255, 255, 255, 0.75)';

  const innerContent = (
    <View
      style={[
        styles.innerContainer,
        {
          padding,
          borderRadius,
          borderColor: isDark
            ? 'rgba(255, 255, 255, 0.15)'
            : 'rgba(255, 255, 255, 0.4)',
        },
      ]}
    >
      {/* Gradient Overlay */}
      {gradient && (
        <View
          style={[
            styles.gradientOverlay,
            {
              borderRadius,
              backgroundColor: `${effectiveGlowColor}08`,
            },
          ]}
        />
      )}

      {/* Glow Effect */}
      <View
        style={[
          styles.glowEffect,
          {
            backgroundColor: `${effectiveGlowColor}15`,
            borderRadius: borderRadius * 2,
          },
        ]}
      />

      {/* Content */}
      <View style={styles.content}>{children}</View>
    </View>
  );

  // iOS uses native BlurView
  if (Platform.OS === 'ios') {
    return (
      <Animated.View style={[animated && animatedStyle, style]}>
        <BlurView
          intensity={intensity}
          tint={effectiveTint}
          style={[
            styles.blurContainer,
            {
              borderRadius,
              overflow: 'hidden',
            },
          ]}
        >
          {innerContent}
        </BlurView>
      </Animated.View>
    );
  }

  // Android/Web fallback with semi-transparent background
  return (
    <Animated.View style={[animated && animatedStyle, style]}>
      <View
        style={[
          styles.fallbackContainer,
          {
            borderRadius,
            backgroundColor: fallbackBgColor,
            borderColor: isDark
              ? 'rgba(255, 255, 255, 0.1)'
              : 'rgba(255, 255, 255, 0.5)',
          },
        ]}
      >
        {innerContent}
      </View>
    </Animated.View>
  );
};

// Neon Night variant of GlassCard
export const NeonGlassCard: React.FC<GlassCardProps> = (props) => {
  return (
    <GlassCard
      {...props}
      tint="dark"
      intensity={80}
      glowColor="#8B5CF6"
      gradient={true}
    />
  );
};

// Metric Card variant for dashboards
export const GlassMetricCard: React.FC<{
  children: React.ReactNode;
  accentColor?: string;
  style?: ViewStyle;
}> = ({ children, accentColor, style }) => {
  const mood = useColorMood();
  
  return (
    <GlassCard
      style={style}
      borderRadius={16}
      padding={16}
      glowColor={accentColor || mood.primary}
      intensity={40}
    >
      {children}
    </GlassCard>
  );
};

const styles = StyleSheet.create({
  blurContainer: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15,
    shadowRadius: 16,
    elevation: 10,
  },
  fallbackContainer: {
    borderWidth: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15,
    shadowRadius: 16,
    elevation: 10,
  },
  innerContainer: {
    borderWidth: 1,
    position: 'relative',
    overflow: 'hidden',
  },
  gradientOverlay: {
    ...StyleSheet.absoluteFillObject,
    opacity: 0.5,
  },
  glowEffect: {
    position: 'absolute',
    top: -50,
    right: -50,
    width: 150,
    height: 150,
    opacity: 0.5,
  },
  content: {
    position: 'relative',
    zIndex: 1,
  },
});

export default GlassCard;

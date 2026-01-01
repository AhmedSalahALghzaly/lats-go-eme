/**
 * Reusable Image Uploader Component
 * Modern 2025 UX with animations, drag feedback, and progress
 * Opens device gallery/folders to select images
 */
import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Image,
  Animated,
  ActivityIndicator,
  ScrollView,
  Alert,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as ImagePicker from 'expo-image-picker';
import * as Haptics from 'expo-haptics';
import { useTheme } from '../../hooks/useTheme';
import { useTranslation } from '../../hooks/useTranslation';

interface ImageUploaderProps {
  mode: 'single' | 'multiple';
  value: string | string[];  // single URL or array of URLs
  onChange: (value: string | string[]) => void;
  placeholder?: string;
  maxImages?: number;
  aspectRatio?: [number, number];
  size?: 'small' | 'medium' | 'large';
  shape?: 'square' | 'circle' | 'rounded';
  showProgress?: boolean;
  allowCamera?: boolean;
  disabled?: boolean;
  label?: string;
  hint?: string;
}

export const ImageUploader: React.FC<ImageUploaderProps> = ({
  mode = 'single',
  value,
  onChange,
  placeholder,
  maxImages = 5,
  aspectRatio = [1, 1],
  size = 'medium',
  shape = 'rounded',
  showProgress = true,
  allowCamera = true,
  disabled = false,
  label,
  hint,
}) => {
  const { colors } = useTheme();
  const { language, isRTL } = useTranslation();
  
  const scaleAnim = useRef(new Animated.Value(1)).current;
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const [showMenu, setShowMenu] = useState(false);
  
  const {
    pickImage,
    pickMultipleImages,
    takePhoto,
    uploadProgress,
    progressAnim,
    lastError,
    clearError,
  } = useCloudUpload({
    aspect: aspectRatio,
    onSuccess: (urls) => {
      if (mode === 'single') {
        onChange(urls[0]);
      } else {
        const currentUrls = Array.isArray(value) ? value : [];
        const newUrls = [...currentUrls, ...urls].slice(0, maxImages);
        onChange(newUrls);
      }
    },
  });

  // Pulse animation for upload button
  useEffect(() => {
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1.05,
          duration: 1000,
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 1000,
          useNativeDriver: true,
        }),
      ])
    );
    if (!value || (Array.isArray(value) && value.length === 0)) {
      pulse.start();
    }
    return () => pulse.stop();
  }, [value, pulseAnim]);

  const handlePress = () => {
    if (disabled) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    
    Animated.sequence([
      Animated.timing(scaleAnim, {
        toValue: 0.95,
        duration: 100,
        useNativeDriver: true,
      }),
      Animated.timing(scaleAnim, {
        toValue: 1,
        duration: 100,
        useNativeDriver: true,
      }),
    ]).start();
    
    if (allowCamera) {
      setShowMenu(true);
      showUploadOptions();
    } else {
      handlePickFromGallery();
    }
  };

  const showUploadOptions = () => {
    Alert.alert(
      language === 'ar' ? 'اختر الصورة' : 'Choose Image',
      language === 'ar' ? 'من أين تريد اختيار الصورة؟' : 'Where do you want to get the image from?',
      [
        {
          text: language === 'ar' ? 'الكاميرا' : 'Camera',
          onPress: handleTakePhoto,
        },
        {
          text: language === 'ar' ? 'المعرض' : 'Gallery',
          onPress: handlePickFromGallery,
        },
        {
          text: language === 'ar' ? 'إلغاء' : 'Cancel',
          style: 'cancel',
        },
      ]
    );
  };

  const handlePickFromGallery = async () => {
    if (mode === 'multiple') {
      const currentCount = Array.isArray(value) ? value.length : 0;
      const remaining = maxImages - currentCount;
      if (remaining <= 0) {
        Alert.alert(
          language === 'ar' ? 'الحد الأقصى' : 'Max Reached',
          language === 'ar' 
            ? `يمكنك إضافة ${maxImages} صور فقط`
            : `You can only add ${maxImages} images`
        );
        return;
      }
      await pickMultipleImages(remaining);
    } else {
      await pickImage();
    }
  };

  const handleTakePhoto = async () => {
    if (mode === 'multiple') {
      const currentCount = Array.isArray(value) ? value.length : 0;
      if (currentCount >= maxImages) {
        Alert.alert(
          language === 'ar' ? 'الحد الأقصى' : 'Max Reached',
          language === 'ar' 
            ? `يمكنك إضافة ${maxImages} صور فقط`
            : `You can only add ${maxImages} images`
        );
        return;
      }
    }
    const url = await takePhoto();
    if (url) {
      if (mode === 'single') {
        onChange(url);
      } else {
        const currentUrls = Array.isArray(value) ? value : [];
        onChange([...currentUrls, url].slice(0, maxImages));
      }
    }
  };

  const handleRemoveImage = (index: number) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    if (mode === 'single') {
      onChange('');
    } else {
      const urls = Array.isArray(value) ? [...value] : [];
      urls.splice(index, 1);
      onChange(urls);
    }
  };

  // Size dimensions
  const dimensions = {
    small: { container: 80, icon: 24 },
    medium: { container: 120, icon: 32 },
    large: { container: 180, icon: 48 },
  }[size];

  // Border radius based on shape
  const getBorderRadius = () => {
    switch (shape) {
      case 'circle': return dimensions.container / 2;
      case 'square': return 8;
      case 'rounded': return 12;
      default: return 12;
    }
  };

  const borderRadius = getBorderRadius();
  const hasImages = mode === 'single' 
    ? !!value 
    : Array.isArray(value) && value.length > 0;

  // Render single image mode
  if (mode === 'single') {
    return (
      <View style={styles.container}>
        {label && (
          <Text style={[styles.label, { color: colors.text }, isRTL && styles.textRTL]}>
            {label}
          </Text>
        )}
        {hint && (
          <Text style={[styles.hint, { color: colors.textSecondary }, isRTL && styles.textRTL]}>
            {hint}
          </Text>
        )}
        
        <Animated.View style={{ transform: [{ scale: scaleAnim }] }}>
          <TouchableOpacity
            style={[
              styles.uploadBox,
              {
                width: dimensions.container,
                height: dimensions.container,
                borderRadius,
                backgroundColor: colors.surface,
                borderColor: lastError ? colors.error : colors.border,
              },
              disabled && styles.disabled,
            ]}
            onPress={handlePress}
            disabled={disabled || uploadProgress.isUploading}
            activeOpacity={0.7}
          >
            {uploadProgress.isUploading ? (
              <View style={styles.uploadingContainer}>
                <ActivityIndicator size="small" color={colors.primary} />
                {showProgress && (
                  <Text style={[styles.progressText, { color: colors.textSecondary }]}>
                    {uploadProgress.progress}%
                  </Text>
                )}
              </View>
            ) : value ? (
              <View style={styles.imageContainer}>
                <Image
                  source={{ uri: value as string }}
                  style={[styles.image, { borderRadius }]}
                  resizeMode="cover"
                />
                <TouchableOpacity
                  style={[styles.removeButton, { backgroundColor: colors.error }]}
                  onPress={() => handleRemoveImage(0)}
                >
                  <Ionicons name="close" size={14} color="#FFF" />
                </TouchableOpacity>
              </View>
            ) : (
              <Animated.View style={[styles.placeholderContent, { transform: [{ scale: pulseAnim }] }]}>
                <LinearGradient
                  colors={[colors.primary + '20', colors.primary + '10']}
                  style={[styles.iconCircle, { borderRadius: dimensions.icon }]}
                >
                  <Ionicons name="camera" size={dimensions.icon * 0.6} color={colors.primary} />
                </LinearGradient>
                <Text style={[styles.placeholderText, { color: colors.textSecondary }]}>
                  {placeholder || (language === 'ar' ? 'اختر صورة' : 'Choose Image')}
                </Text>
              </Animated.View>
            )}
          </TouchableOpacity>
        </Animated.View>

        {/* Progress Bar */}
        {showProgress && uploadProgress.isUploading && (
          <View style={[styles.progressBar, { backgroundColor: colors.border }]}>
            <Animated.View
              style={[
                styles.progressFill,
                {
                  backgroundColor: colors.primary,
                  width: progressAnim.interpolate({
                    inputRange: [0, 100],
                    outputRange: ['0%', '100%'],
                  }),
                },
              ]}
            />
          </View>
        )}

        {lastError && (
          <Text style={[styles.errorText, { color: colors.error }]}>
            {lastError}
          </Text>
        )}
      </View>
    );
  }

  // Render multiple images mode
  const images = Array.isArray(value) ? value : [];
  const canAddMore = images.length < maxImages;

  return (
    <View style={styles.container}>
      {label && (
        <Text style={[styles.label, { color: colors.text }, isRTL && styles.textRTL]}>
          {label}
        </Text>
      )}
      {hint && (
        <Text style={[styles.hint, { color: colors.textSecondary }, isRTL && styles.textRTL]}>
          {hint} ({images.length}/{maxImages})
        </Text>
      )}

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={[styles.imagesRow, isRTL && { flexDirection: 'row-reverse' }]}
      >
        {/* Existing Images */}
        {images.map((img, index) => (
          <View key={`img-${index}`} style={[styles.multiImageContainer, { marginRight: 12 }]}>
            <Image
              source={{ uri: img }}
              style={[
                styles.multiImage,
                {
                  width: dimensions.container - 20,
                  height: dimensions.container - 20,
                  borderRadius: borderRadius - 4,
                },
              ]}
              resizeMode="cover"
            />
            <TouchableOpacity
              style={[styles.removeButton, { backgroundColor: colors.error }]}
              onPress={() => handleRemoveImage(index)}
            >
              <Ionicons name="close" size={14} color="#FFF" />
            </TouchableOpacity>
            {index === 0 && (
              <View style={[styles.mainBadge, { backgroundColor: colors.primary }]}>
                <Text style={styles.mainBadgeText}>
                  {language === 'ar' ? 'رئيسية' : 'Main'}
                </Text>
              </View>
            )}
          </View>
        ))}

        {/* Add More Button */}
        {canAddMore && (
          <Animated.View style={{ transform: [{ scale: scaleAnim }] }}>
            <TouchableOpacity
              style={[
                styles.addMoreButton,
                {
                  width: dimensions.container - 20,
                  height: dimensions.container - 20,
                  borderRadius: borderRadius - 4,
                  backgroundColor: colors.surface,
                  borderColor: colors.border,
                },
              ]}
              onPress={handlePress}
              disabled={disabled || uploadProgress.isUploading}
            >
              {uploadProgress.isUploading ? (
                <View style={styles.uploadingContainer}>
                  <ActivityIndicator size="small" color={colors.primary} />
                  <Text style={[styles.progressSmall, { color: colors.textSecondary }]}>
                    {uploadProgress.currentFile}/{uploadProgress.totalFiles}
                  </Text>
                </View>
              ) : (
                <>
                  <Ionicons name="add" size={24} color={colors.primary} />
                  <Text style={[styles.addMoreText, { color: colors.textSecondary }]}>
                    {language === 'ar' ? 'إضافة' : 'Add'}
                  </Text>
                </>
              )}
            </TouchableOpacity>
          </Animated.View>
        )}
      </ScrollView>

      {/* Progress Bar */}
      {showProgress && uploadProgress.isUploading && (
        <View style={[styles.progressBar, { backgroundColor: colors.border, marginTop: 12 }]}>
          <Animated.View
            style={[
              styles.progressFill,
              {
                backgroundColor: colors.primary,
                width: progressAnim.interpolate({
                  inputRange: [0, 100],
                  outputRange: ['0%', '100%'],
                }),
              },
            ]}
          />
        </View>
      )}

      {lastError && (
        <Text style={[styles.errorText, { color: colors.error }]}>
          {lastError}
        </Text>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginBottom: 16,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 6,
  },
  hint: {
    fontSize: 12,
    marginBottom: 10,
  },
  textRTL: {
    textAlign: 'right',
  },
  uploadBox: {
    borderWidth: 2,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  disabled: {
    opacity: 0.5,
  },
  imageContainer: {
    width: '100%',
    height: '100%',
    position: 'relative',
  },
  image: {
    width: '100%',
    height: '100%',
  },
  removeButton: {
    position: 'absolute',
    top: -6,
    right: -6,
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
  },
  placeholderContent: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 8,
  },
  iconCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
  },
  placeholderText: {
    fontSize: 11,
    textAlign: 'center',
  },
  uploadingContainer: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  progressText: {
    fontSize: 12,
    marginTop: 4,
  },
  progressBar: {
    height: 4,
    borderRadius: 2,
    marginTop: 8,
    overflow: 'hidden',
    width: 120,
  },
  progressFill: {
    height: '100%',
    borderRadius: 2,
  },
  errorText: {
    fontSize: 12,
    marginTop: 6,
  },
  imagesRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 4,
  },
  multiImageContainer: {
    position: 'relative',
  },
  multiImage: {
    backgroundColor: '#f0f0f0',
  },
  mainBadge: {
    position: 'absolute',
    bottom: 4,
    left: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  mainBadgeText: {
    color: '#FFF',
    fontSize: 9,
    fontWeight: '600',
  },
  addMoreButton: {
    borderWidth: 2,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
  },
  addMoreText: {
    fontSize: 10,
    marginTop: 2,
  },
  progressSmall: {
    fontSize: 10,
    marginTop: 2,
  },
});

export default ImageUploader;

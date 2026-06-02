import { Ionicons } from '@expo/vector-icons';
import { ReactNode } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  TextInputProps,
  View,
  ViewStyle,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, radius, space, statusTone } from './theme';

export function Screen({ children, style }: { children: ReactNode; style?: ViewStyle }) {
  return <SafeAreaView style={[{ flex: 1, backgroundColor: colors.bg }, style]} edges={['top']}>{children}</SafeAreaView>;
}

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'success';

export function Button({
  title,
  onPress,
  variant = 'primary',
  loading,
  disabled,
  icon,
  style,
}: {
  title: string;
  onPress?: () => void;
  variant?: Variant;
  loading?: boolean;
  disabled?: boolean;
  icon?: keyof typeof Ionicons.glyphMap;
  style?: ViewStyle;
}) {
  const bg: Record<Variant, string> = {
    primary: colors.brand,
    secondary: colors.card,
    ghost: 'transparent',
    danger: colors.rose,
    success: colors.green,
  };
  const fg: Record<Variant, string> = {
    primary: '#fff',
    secondary: colors.text,
    ghost: colors.brand,
    danger: '#fff',
    success: '#fff',
  };
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      style={({ pressed }) => [
        styles.btn,
        { backgroundColor: bg[variant], opacity: disabled ? 0.5 : pressed ? 0.9 : 1 },
        variant === 'secondary' && { borderWidth: 1, borderColor: colors.border },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={fg[variant]} />
      ) : (
        <View style={styles.btnRow}>
          {icon && <Ionicons name={icon} size={18} color={fg[variant]} />}
          <Text style={[styles.btnText, { color: fg[variant] }]}>{title}</Text>
        </View>
      )}
    </Pressable>
  );
}

export function Card({ children, style }: { children: ReactNode; style?: ViewStyle }) {
  return <View style={[styles.card, style]}>{children}</View>;
}

export function Badge({ label, bg, fg }: { label: string; bg?: string; fg?: string }) {
  return (
    <View style={[styles.badge, { backgroundColor: bg ?? '#f1f5f9' }]}>
      <Text style={[styles.badgeText, { color: fg ?? colors.muted }]}>{label}</Text>
    </View>
  );
}

export function StatusBadge({ status }: { status: string }) {
  const tone = statusTone(status);
  return <Badge label={status.replace(/_/g, ' ').toLowerCase()} bg={tone.bg} fg={tone.fg} />;
}

export function Input(props: TextInputProps) {
  return <TextInput placeholderTextColor={colors.muted} {...props} style={[styles.input, props.style]} />;
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <View style={{ gap: space(1.5) }}>
      <Text style={styles.label}>{label}</Text>
      {children}
    </View>
  );
}

export function Loading() {
  return (
    <View style={styles.center}>
      <ActivityIndicator color={colors.brand} size="large" />
    </View>
  );
}

export function Empty({ icon, title, text }: { icon: keyof typeof Ionicons.glyphMap; title: string; text?: string }) {
  return (
    <View style={styles.empty}>
      <Ionicons name={icon} size={40} color={colors.border} />
      <Text style={styles.emptyTitle}>{title}</Text>
      {text && <Text style={styles.emptyText}>{text}</Text>}
    </View>
  );
}

export function Avatar({ name, size = 44 }: { name?: string | null; size?: number }) {
  const text = (name ?? '?')
    .split(' ')
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? '')
    .join('');
  return (
    <View style={[styles.avatar, { width: size, height: size, borderRadius: size / 2 }]}>
      <Text style={{ color: '#fff', fontWeight: '700', fontSize: size * 0.36 }}>{text}</Text>
    </View>
  );
}

export const styles = StyleSheet.create({
  btn: { height: 50, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center', paddingHorizontal: space(5) },
  btnRow: { flexDirection: 'row', alignItems: 'center', gap: space(2) },
  btnText: { fontWeight: '700', fontSize: 15 },
  card: { backgroundColor: colors.card, borderRadius: radius.lg, padding: space(4), borderWidth: 1, borderColor: colors.border },
  badge: { alignSelf: 'flex-start', paddingHorizontal: space(2.5), paddingVertical: space(1), borderRadius: radius.pill },
  badgeText: { fontSize: 12, fontWeight: '700', textTransform: 'capitalize' },
  input: {
    height: 50,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: space(4),
    fontSize: 15,
    color: colors.ink,
    backgroundColor: colors.card,
  },
  label: { fontSize: 14, fontWeight: '600', color: colors.text },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  empty: { alignItems: 'center', justifyContent: 'center', paddingVertical: space(12), gap: space(2) },
  emptyTitle: { fontSize: 16, fontWeight: '700', color: colors.text },
  emptyText: { fontSize: 13, color: colors.muted, textAlign: 'center', paddingHorizontal: space(8) },
  avatar: { backgroundColor: colors.brand, alignItems: 'center', justifyContent: 'center' },
});

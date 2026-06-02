import { Api } from '@/api';
import { dateTime, rupees, titleCase } from '@/format';
import { connectSocket } from '@/socket';
import { colors, radius, space } from '@/theme';
import { Avatar, Badge, Button, Card, Loading, Screen, StatusBadge } from '@/ui';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';

const TERMINAL = ['SETTLED', 'REJECTED', 'CANCELLED_BY_CUSTOMER', 'CANCELLED_BY_WORKER', 'EXPIRED'];
const PAYABLE = ['ACCEPTED', 'EN_ROUTE', 'IN_PROGRESS', 'COMPLETED'];

export default function BookingDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [b, setB] = useState<any>(null);
  const [paying, setPaying] = useState(false);
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState('');
  const [reviewMsg, setReviewMsg] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [liveLoc, setLiveLoc] = useState<{ lat: number; lng: number } | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await Api.booking(id);
      setB(r.data);
    } catch {
      /* ignore */
    }
  }, [id]);

  useEffect(() => {
    load();
    const socket = connectSocket();
    socket.on('connect', () => socket.emit('booking.join', { bookingId: id }));
    const refresh = () => load();
    socket.on('booking.status_changed', refresh);
    socket.on('payment.updated', refresh);
    socket.on('booking.location_update', (p: { lat: number; lng: number }) =>
      setLiveLoc({ lat: p.lat, lng: p.lng }),
    );
    const t = setInterval(load, 12000);
    return () => {
      clearInterval(t);
      socket.disconnect();
    };
  }, [id, load]);

  if (!b) return <Screen><Loading /></Screen>;

  const paid = (b.payments ?? []).some((p: any) => p.status === 'PAID');
  const canPay = b.paymentMode === 'ONLINE' && PAYABLE.includes(b.status) && !paid;
  const canReview = ['COMPLETED', 'SETTLED'].includes(b.status);

  async function pay() {
    setPaying(true);
    setMsg(null);
    try {
      const order = await Api.paymentOrder(id);
      if (order.data.provider === 'mock') {
        await Api.mockPay(order.data.orderId);
        setMsg('Payment successful (dev mock).');
      } else {
        setMsg('Order created — complete checkout in Razorpay.');
      }
      await load();
    } catch (e: any) {
      setMsg(e.message ?? 'Payment failed');
    } finally {
      setPaying(false);
    }
  }

  async function submitReview() {
    try {
      await Api.review(id, { rating, comment: comment || undefined });
      setReviewMsg('Thanks for your review! ⭐');
    } catch (e: any) {
      setReviewMsg(e.message ?? 'Could not submit review');
    }
  }

  return (
    <Screen>
      <View style={{ flexDirection: 'row', alignItems: 'center', padding: space(4), gap: space(3) }}>
        <Pressable onPress={() => router.back()}><Ionicons name="chevron-back" size={26} color={colors.text} /></Pressable>
        <Text style={{ fontSize: 18, fontWeight: '800', color: colors.ink, flex: 1 }} numberOfLines={1}>{b.service?.name}</Text>
        <StatusBadge status={b.status} />
      </View>

      <ScrollView contentContainerStyle={{ padding: space(5), paddingTop: 0, gap: space(4) }}>
        {b.status === 'EN_ROUTE' && (
          <View style={{ gap: space(2), backgroundColor: colors.blueBg, borderRadius: radius.md, padding: space(4) }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: space(2) }}>
              <Ionicons name="navigate" size={20} color={colors.blue} />
              <Text style={{ color: colors.blue, fontWeight: '700', flex: 1 }}>Your pro is on the way.</Text>
            </View>
            {liveLoc ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: space(2) }}>
                <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: colors.green }} />
                <Text style={{ color: colors.blue, fontSize: 13 }}>
                  Live: {liveLoc.lat.toFixed(4)}, {liveLoc.lng.toFixed(4)}
                </Text>
              </View>
            ) : (
              <Text style={{ color: colors.blue, fontSize: 13 }}>Waiting for live location…</Text>
            )}
          </View>
        )}

        {/* Pro */}
        <Card>
          <Text style={sectionLabel}>Your pro</Text>
          {b.worker ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: space(3), marginTop: space(2) }}>
              <Avatar name={b.worker.user?.name} size={48} />
              <View>
                <Text style={{ fontWeight: '700', color: colors.ink }}>{b.worker.user?.name}</Text>
                <Text style={{ color: colors.muted, fontSize: 13 }}>★ {Number(b.worker.ratingAvg).toFixed(1)} · verified pro</Text>
              </View>
            </View>
          ) : (
            <Text style={{ color: colors.muted, marginTop: space(2) }}>Finding the best nearby pro…</Text>
          )}
        </Card>

        {/* Payment */}
        <Card>
          <Text style={sectionLabel}>Payment</Text>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginTop: space(2) }}>
            <Text style={{ color: colors.muted }}>{b.status === 'SETTLED' ? 'Paid' : 'Amount'}</Text>
            <Text style={{ fontWeight: '800', fontSize: 22, color: colors.ink }}>{rupees(b.finalPrice ?? b.priceEstimate)}</Text>
          </View>
          <View style={{ marginTop: space(2) }}>
            {paid ? <Badge label={`Paid · ${b.paymentMode === 'CASH' ? 'cash' : 'online'}`} bg={colors.greenBg} fg={colors.green} /> : <Badge label={b.paymentMode === 'CASH' ? 'Pay cash after service' : 'Payment pending'} bg={colors.amberBg} fg={colors.amber} />}
          </View>
          {canPay && <Button title={`Pay ${rupees(b.finalPrice ?? b.priceEstimate)}`} onPress={pay} loading={paying} style={{ marginTop: space(3) }} />}
          {msg && <Text style={{ marginTop: space(2), color: colors.text }}>{msg}</Text>}
        </Card>

        {/* Timeline */}
        <Card>
          <Text style={sectionLabel}>Timeline</Text>
          <View style={{ marginTop: space(3), gap: space(3) }}>
            {(b.events ?? []).map((e: any, i: number) => {
              const last = i === b.events.length - 1;
              return (
                <View key={e.id} style={{ flexDirection: 'row', gap: space(3), alignItems: 'center' }}>
                  <View style={{ width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center', backgroundColor: last ? colors.brand : '#f1f5f9' }}>
                    <Ionicons name="checkmark" size={15} color={last ? '#fff' : colors.muted} />
                  </View>
                  <View>
                    <Text style={{ fontWeight: '600', color: colors.text }}>{titleCase(e.type)}</Text>
                    <Text style={{ fontSize: 12, color: colors.muted }}>{dateTime(e.createdAt)}</Text>
                  </View>
                </View>
              );
            })}
          </View>
        </Card>

        {/* Review */}
        {canReview && (
          <Card>
            <Text style={sectionLabel}>Rate your experience</Text>
            {reviewMsg ? (
              <Text style={{ color: colors.green, fontWeight: '600', marginTop: space(2) }}>{reviewMsg}</Text>
            ) : (
              <>
                <View style={{ flexDirection: 'row', gap: space(1), marginTop: space(2) }}>
                  {[1, 2, 3, 4, 5].map((n) => (
                    <Pressable key={n} onPress={() => setRating(n)}>
                      <Ionicons name={n <= rating ? 'star' : 'star-outline'} size={30} color={colors.accent} />
                    </Pressable>
                  ))}
                </View>
                <TextInput
                  value={comment}
                  onChangeText={setComment}
                  placeholder="Tell us how it went (optional)"
                  placeholderTextColor={colors.muted}
                  multiline
                  style={{ borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: space(3), marginTop: space(3), minHeight: 70, color: colors.ink }}
                />
                <Button title="Submit review" onPress={submitReview} style={{ marginTop: space(3) }} />
              </>
            )}
          </Card>
        )}
      </ScrollView>
    </Screen>
  );
}

const sectionLabel = { fontSize: 12, fontWeight: '700' as const, color: colors.muted, textTransform: 'uppercase' as const, letterSpacing: 0.5 };
